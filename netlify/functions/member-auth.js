'use strict';

// OAuth callback handler for Patreon and Subscribestar.
//
// Flow:
//   1. User clicks "Connect" on the site → JS opens a popup to the platform
//      OAuth authorize URL (built by get-oauth-url).
//   2. Platform redirects the popup back here with ?code=…&platform=…
//   3. This function exchanges the code for tokens, fetches subscriber status,
//      issues a short-lived member JWT on success.
//   4. The response is a minimal HTML page that calls window.opener.postMessage
//      with { type:'MEMBER_AUTH', token } or { type:'MEMBER_AUTH', error }
//      and then closes itself.

const { getStore }      = require('@netlify/blobs');
const { signMemberJwt } = require('./lib/_member-jwt');

const PATREON_TOKEN_URL    = 'https://www.patreon.com/api/oauth2/token';
const PATREON_IDENTITY_URL = 'https://www.patreon.com/api/oauth2/v2/identity';

// Member JWT TTL: 24 h.  Shortening this reduces the window where a cancelled
// subscriber can still access content (at the cost of more frequent re-logins).
const MEMBER_TTL_SECONDS = 24 * 60 * 60;

// ── HTML popup response ───────────────────────────────────────────────────────
// state is echoed back so the opener can verify the CSRF token it sent.
function paywallResponse(success, payload, state) {
  const stateField = state ? `, state: ${JSON.stringify(state)}` : '';
  const msg = success
    ? `{ type: 'MEMBER_AUTH', token: ${JSON.stringify(payload)}${stateField} }`
    : `{ type: 'MEMBER_AUTH', error: ${JSON.stringify(String(payload))}${stateField} }`;

  const statusText = success ? '&#x2713; Verified! Closing…' : `&#x2715; ${escHtml(String(payload))}`;

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: `<!DOCTYPE html>
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
</html>`,
  };
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── Subscriber storage ────────────────────────────────────────────────────────
async function upsertSubscriber(platform, platformId, data, context) {
  try {
    const store = getStore({ name: 'subscribers', context });
    const key   = `${platform}:${platformId}`;
    let existing = {};
    try {
      const raw = await store.get(key, { type: 'text' });
      if (raw) existing = JSON.parse(raw);
    } catch { /* first write */ }
    await store.set(key, JSON.stringify({ ...existing, platform, platformId, ...data, lastChecked: Date.now() }));
  } catch (err) {
    console.error('upsertSubscriber error:', err);
  }
}

function issueMemberJwt(platform, platformId, tier) {
  const now = Math.floor(Date.now() / 1000);
  return signMemberJwt({
    sub: 'member',
    platform,
    platformId,
    active: true,
    tier,
    iat: now,
    exp: now + MEMBER_TTL_SECONDS,
  });
}

// ── Patreon handler ───────────────────────────────────────────────────────────
async function handlePatreon(code, siteUrl, state, context) {
  const clientId     = process.env.PATREON_CLIENT_ID;
  const clientSecret = process.env.PATREON_CLIENT_SECRET;
  const campaignId   = process.env.PATREON_CAMPAIGN_ID; // optional filter

  if (!clientId || !clientSecret) {
    return paywallResponse(false, 'Patreon is not configured on this site', state);
  }

  const redirectUri = `${siteUrl}/.netlify/functions/member-auth?platform=patreon`;

  // Step 1: exchange code → tokens
  let tokenData;
  try {
    const tokenRes = await fetch(PATREON_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }).toString(),
    });
    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      console.error('Patreon token exchange failed:', tokenRes.status, text);
      return paywallResponse(false, 'Patreon token exchange failed — please try again', state);
    }
    tokenData = await tokenRes.json();
  } catch (err) {
    console.error('Patreon token fetch error:', err);
    return paywallResponse(false, 'Network error contacting Patreon', state);
  }

  const { access_token, refresh_token } = tokenData;

  // Step 2: fetch identity + memberships
  let identity;
  try {
    const identityRes = await fetch(
      `${PATREON_IDENTITY_URL}` +
      `?include=memberships` +
      `&fields%5Bmember%5D=patron_status%2Ccurrently_entitled_amount_cents%2Clast_charge_status` +
      `&fields%5Buser%5D=email`,
      { headers: { Authorization: `Bearer ${access_token}` } },
    );
    if (!identityRes.ok) {
      const text = await identityRes.text();
      console.error('Patreon identity failed:', identityRes.status, text);
      return paywallResponse(false, 'Failed to retrieve Patreon profile', state);
    }
    identity = await identityRes.json();
  } catch (err) {
    console.error('Patreon identity fetch error:', err);
    return paywallResponse(false, 'Network error retrieving Patreon profile', state);
  }

  const userId = identity?.data?.id;
  const email  = identity?.data?.attributes?.email || '';
  if (!userId) return paywallResponse(false, 'Could not identify your Patreon account', state);

  // Step 3: check active membership
  const memberships = (identity.included || []).filter(x => x.type === 'member');
  let isActive = false;
  let tier     = 'none';

  for (const m of memberships) {
    const status = m.attributes?.patron_status;
    if (status !== 'active_patron') continue;
    // If a campaign ID is configured, skip memberships that don't match it.
    // The campaign relationship lives in m.relationships.campaign.data.id.
    if (campaignId && m.relationships?.campaign?.data?.id !== campaignId) continue;
    isActive = true;
    tier = m.attributes?.currently_entitled_amount_cents > 0 ? 'paid' : 'free';
    break;
  }

  // Persist subscription record regardless of active status (useful for debugging
  // and for webhook updates that need an existing record to merge into).
  await upsertSubscriber('patreon', userId, {
    email,
    active: isActive,
    tier: isActive ? tier : 'none',
    accessToken:  access_token,
    refreshToken: refresh_token || null,
  }, context);

  if (!isActive) {
    console.log(`Patreon auth: user ${userId} is not an active patron`);
    return paywallResponse(false, 'An active Patreon membership is required to access the Gallery', state);
  }

  console.log(`Patreon auth: user ${userId} granted (tier: ${tier})`);
  return paywallResponse(true, issueMemberJwt('patreon', userId, tier), state);
}

// ── Subscribestar handler ─────────────────────────────────────────────────────
async function handleSubscribestar(code, siteUrl, state, context) {
  const clientId     = process.env.SUBSCRIBESTAR_CLIENT_ID;
  const clientSecret = process.env.SUBSCRIBESTAR_CLIENT_SECRET;
  const ssHost       = process.env.SUBSCRIBESTAR_HOST || 'https://subscribestar.adult';
  const creatorId    = process.env.SUBSCRIBESTAR_CREATOR_ID; // optional filter

  if (!clientId || !clientSecret) {
    return paywallResponse(false, 'Subscribestar is not configured on this site', state);
  }

  const redirectUri = `${siteUrl}/.netlify/functions/member-auth?platform=subscribestar`;

  // Step 1: exchange code → tokens
  let tokenData;
  try {
    const tokenRes = await fetch(`${ssHost}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }).toString(),
    });
    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      console.error('Subscribestar token exchange failed:', tokenRes.status, text);
      return paywallResponse(false, 'Subscribestar token exchange failed — please try again', state);
    }
    tokenData = await tokenRes.json();
  } catch (err) {
    console.error('Subscribestar token fetch error:', err);
    return paywallResponse(false, 'Network error contacting Subscribestar', state);
  }

  const { access_token, refresh_token } = tokenData;

  // Step 2: fetch user + subscriptions
  let userJson;
  try {
    const userRes = await fetch(`${ssHost}/api/user.json`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!userRes.ok) {
      const text = await userRes.text();
      console.error('Subscribestar user fetch failed:', userRes.status, text);
      return paywallResponse(false, 'Failed to retrieve Subscribestar profile', state);
    }
    userJson = await userRes.json();
  } catch (err) {
    console.error('Subscribestar user fetch error:', err);
    return paywallResponse(false, 'Network error retrieving Subscribestar profile', state);
  }

  // The Subscribestar API wraps the user in a top-level `user` key on some
  // endpoints; handle both shapes.
  const user   = userJson.user || userJson;
  const userId = String(user.id || '');
  const email  = String(user.email || '');
  if (!userId) return paywallResponse(false, 'Could not identify your Subscribestar account', state);

  // Step 3: check active subscription
  const subscriptions = user.subscriptions || [];
  let isActive = false;
  let tier     = 'none';

  for (const sub of subscriptions) {
    if (!sub.active) continue;
    if (creatorId && String(sub.star_id || sub.creator_id || '') !== String(creatorId)) continue;
    isActive = true;
    tier = sub.tier_name || 'paid';
    break;
  }

  await upsertSubscriber('subscribestar', userId, {
    email,
    active: isActive,
    tier: isActive ? tier : 'none',
    accessToken:  access_token,
    refreshToken: refresh_token || null,
  }, context);

  if (!isActive) {
    console.log(`Subscribestar auth: user ${userId} has no active subscription`);
    return paywallResponse(false, 'An active Subscribestar subscription is required to access the Gallery', state);
  }

  console.log(`Subscribestar auth: user ${userId} granted (tier: ${tier})`);
  return paywallResponse(true, issueMemberJwt('subscribestar', userId, tier), state);
}

// ── Handler ───────────────────────────────────────────────────────────────────
exports.handler = async (event, context) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const params   = event.queryStringParameters || {};
  const platform = params.platform;
  const code     = params.code;
  const oauthErr = params.error;
  const state    = params.state || '';

  if (oauthErr) {
    return paywallResponse(false, `OAuth denied: ${oauthErr}`, state);
  }
  if (!code) {
    return paywallResponse(false, 'Missing authorization code', state);
  }

  const siteUrl = process.env.URL || `https://${event.headers.host}`;

  try {
    if (platform === 'patreon')       return await handlePatreon(code, siteUrl, state, context);
    if (platform === 'subscribestar') return await handleSubscribestar(code, siteUrl, state, context);
    return paywallResponse(false, `Unknown platform: ${platform}`, state);
  } catch (err) {
    console.error('member-auth unhandled error:', err);
    return paywallResponse(false, 'An internal error occurred — please try again', state);
  }
};
