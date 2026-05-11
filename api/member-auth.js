'use strict';
const { blobGet, blobPut } = require('./_blob');
const { signMemberJwt } = require('./_member-jwt');

const PATREON_TOKEN_URL    = 'https://www.patreon.com/api/oauth2/token';
const PATREON_IDENTITY_URL = 'https://www.patreon.com/api/oauth2/v2/identity';
const MEMBER_TTL_SECONDS   = 24 * 60 * 60;

const RL_MAX_ATTEMPTS = 20;
const RL_WINDOW_SECS  = 60 * 60;

async function checkRateLimit(ip) {
  try {
    const key = `ratelimit/member-${ip.replace(/[^a-zA-Z0-9._-]/g, '_')}.json`;
    const now  = Math.floor(Date.now() / 1000);
    let data   = { count: 0, windowStart: now };
    const raw  = await blobGet(key, { type: 'json' });
    if (raw) {
      data = (now - raw.windowStart) > RL_WINDOW_SECS
        ? { count: 0, windowStart: now }
        : raw;
    }
    if (data.count >= RL_MAX_ATTEMPTS) {
      return { limited: true, retryAfter: RL_WINDOW_SECS - (now - data.windowStart) };
    }
    data.count++;
    await blobPut(key, JSON.stringify(data), { contentType: 'application/json' });
    return { limited: false };
  } catch {
    // Fail closed: if we can't check the rate limit, deny the request.
    return { limited: true, retryAfter: RL_WINDOW_SECS };
  }
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function paywallResponse(res, success, payload, state) {
  const stateField = state ? `, state: ${JSON.stringify(state)}` : '';
  const msg = success
    ? `{ type: 'MEMBER_AUTH', token: ${JSON.stringify(payload)}${stateField} }`
    : `{ type: 'MEMBER_AUTH', error: ${JSON.stringify(String(payload))}${stateField} }`;
  const statusText = success ? '✓ Verified! Closing…' : `✕ ${escHtml(String(payload))}`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Ardenverse — Connecting</title></head>
<body style="background:#020f0d;color:#a8d5c9;font-family:sans-serif;display:flex;
  align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:2rem;">
  <div>
    <p style="font-size:1.1rem;margin-bottom:0.5rem;">${statusText}</p>
    <p style="font-size:0.8rem;color:#4a8a7a;">This window will close automatically.</p>
  </div>
  <script>
    (function () {
      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(${msg}, window.location.origin);
        }
      } catch (e) { /* cross-origin guard */ }
      setTimeout(function () { window.close(); }, 2000);
    })();
  </script>
</body>
</html>`);
}

async function upsertSubscriber(platform, platformId, data) {
  try {
    const key      = `subscribers/${platform}-${platformId}.json`;
    const existing = await blobGet(key, { type: 'json' }) || {};
    await blobPut(key, JSON.stringify({ ...existing, platform, platformId, ...data, lastChecked: Date.now() }), {
      contentType: 'application/json',
    });
  } catch (err) {
    console.error('upsertSubscriber error:', err);
  }
}

function issueMemberJwt(platform, platformId, tier) {
  const now = Math.floor(Date.now() / 1000);
  return signMemberJwt({ sub: 'member', platform, platformId, active: true, tier, iat: now, exp: now + MEMBER_TTL_SECONDS });
}

async function handlePatreon(req, res, code, siteUrl, state) {
  const clientId     = process.env.PATREON_CLIENT_ID;
  const clientSecret = process.env.PATREON_CLIENT_SECRET;
  const campaignId   = process.env.PATREON_CAMPAIGN_ID;
  if (!clientId || !clientSecret) return paywallResponse(res, false, 'Patreon is not configured on this site', state);

  const redirectUri = `${siteUrl}/api/member-auth?platform=patreon`;
  let tokenData;
  try {
    const tokenRes = await fetch(PATREON_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, grant_type: 'authorization_code', client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri }).toString(),
    });
    if (!tokenRes.ok) { console.error('Patreon token exchange failed:', tokenRes.status); return paywallResponse(res, false, 'Patreon token exchange failed — please try again', state); }
    tokenData = await tokenRes.json();
  } catch (err) { console.error('Patreon token fetch error:', err); return paywallResponse(res, false, 'Network error contacting Patreon', state); }

  const { access_token } = tokenData;
  let identity;
  try {
    const identityRes = await fetch(
      `${PATREON_IDENTITY_URL}?include=memberships` +
      `&fields%5Bmember%5D=patron_status%2Ccurrently_entitled_amount_cents%2Clast_charge_status` +
      `&fields%5Buser%5D=email`,
      { headers: { Authorization: `Bearer ${access_token}` } },
    );
    if (!identityRes.ok) { console.error('Patreon identity failed:', identityRes.status); return paywallResponse(res, false, 'Failed to retrieve Patreon profile', state); }
    identity = await identityRes.json();
  } catch (err) { console.error('Patreon identity fetch error:', err); return paywallResponse(res, false, 'Network error retrieving Patreon profile', state); }

  const userId = identity?.data?.id;
  const email  = identity?.data?.attributes?.email || '';
  if (!userId) return paywallResponse(res, false, 'Could not identify your Patreon account', state);

  const memberships = (identity.included || []).filter(x => x.type === 'member');
  let isActive = false, tier = 'none';
  for (const m of memberships) {
    if (m.attributes?.patron_status !== 'active_patron') continue;
    if (campaignId && m.relationships?.campaign?.data?.id !== campaignId) continue;
    isActive = true;
    tier = m.attributes?.currently_entitled_amount_cents > 0 ? 'paid' : 'free';
    break;
  }

  await upsertSubscriber('patreon', userId, { email, active: isActive, tier: isActive ? tier : 'none' });
  if (!isActive) { console.log(`Patreon auth: user ${userId} not active patron`); return paywallResponse(res, false, 'An active Patreon membership is required to access the Gallery', state); }
  console.log(`Patreon auth: user ${userId} granted (tier: ${tier})`);
  return paywallResponse(res, true, issueMemberJwt('patreon', userId, tier), state);
}

async function handleSubscribestar(req, res, code, siteUrl, state) {
  const clientId     = process.env.SUBSCRIBESTAR_CLIENT_ID;
  const clientSecret = process.env.SUBSCRIBESTAR_CLIENT_SECRET;
  const ssHost       = process.env.SUBSCRIBESTAR_HOST || 'https://subscribestar.adult';
  const creatorId    = process.env.SUBSCRIBESTAR_CREATOR_ID;
  if (!clientId || !clientSecret) return paywallResponse(res, false, 'Subscribestar is not configured on this site', state);

  const redirectUri = `${siteUrl}/api/member-auth?platform=subscribestar`;
  let tokenData;
  try {
    const tokenRes = await fetch(`${ssHost}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, grant_type: 'authorization_code', client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri }).toString(),
    });
    if (!tokenRes.ok) { console.error('Subscribestar token exchange failed:', tokenRes.status); return paywallResponse(res, false, 'Subscribestar token exchange failed — please try again', state); }
    tokenData = await tokenRes.json();
  } catch (err) { console.error('Subscribestar token fetch error:', err); return paywallResponse(res, false, 'Network error contacting Subscribestar', state); }

  const { access_token } = tokenData;
  let userJson;
  try {
    const userRes = await fetch(`${ssHost}/api/user.json`, { headers: { Authorization: `Bearer ${access_token}` } });
    if (!userRes.ok) { console.error('Subscribestar user fetch failed:', userRes.status); return paywallResponse(res, false, 'Failed to retrieve Subscribestar profile', state); }
    userJson = await userRes.json();
  } catch (err) { console.error('Subscribestar user fetch error:', err); return paywallResponse(res, false, 'Network error retrieving Subscribestar profile', state); }

  const user   = userJson.user || userJson;
  const userId = String(user.id || '');
  const email  = String(user.email || '');
  if (!userId) return paywallResponse(res, false, 'Could not identify your Subscribestar account', state);

  const subscriptions = user.subscriptions || [];
  let isActive = false, tier = 'none';
  for (const sub of subscriptions) {
    if (!sub.active) continue;
    if (creatorId && String(sub.star_id || sub.creator_id || '') !== String(creatorId)) continue;
    isActive = true;
    tier = sub.tier_name || 'paid';
    break;
  }

  await upsertSubscriber('subscribestar', userId, { email, active: isActive, tier: isActive ? tier : 'none' });
  if (!isActive) { console.log(`Subscribestar auth: user ${userId} no active subscription`); return paywallResponse(res, false, 'An active Subscribestar subscription is required to access the Gallery', state); }
  console.log(`Subscribestar auth: user ${userId} granted (tier: ${tier})`);
  return paywallResponse(res, true, issueMemberJwt('subscribestar', userId, tier), state);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end('Method Not Allowed');

  // req.ip is set correctly by Express when trust proxy is configured in server.js.
  const ip = req.ip || 'unknown';
  const rl = await checkRateLimit(ip);
  if (rl.limited) {
    res.setHeader('Retry-After', String(rl.retryAfter));
    return paywallResponse(res, false, 'Too many attempts — try again later', '');
  }

  const { platform, code, error: oauthErr, state = '' } = req.query;
  if (oauthErr) return paywallResponse(res, false, `OAuth denied: ${oauthErr}`, state);
  if (!code)    return paywallResponse(res, false, 'Missing authorization code', state);

  const siteUrl = process.env.SITE_URL || `https://${req.headers.host}`;

  try {
    if (platform === 'patreon')       return await handlePatreon(req, res, code, siteUrl, state);
    if (platform === 'subscribestar') return await handleSubscribestar(req, res, code, siteUrl, state);
    return paywallResponse(res, false, `Unknown platform: ${platform}`, state);
  } catch (err) {
    console.error('member-auth unhandled error:', err);
    return paywallResponse(res, false, 'An internal error occurred — please try again', state);
  }
};
