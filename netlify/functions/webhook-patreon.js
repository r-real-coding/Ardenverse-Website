'use strict';

// Patreon sends webhooks for pledge lifecycle events:
//   members:pledge:create   → new patron
//   members:pledge:update   → tier change / payment status change
//   members:pledge:delete   → patron cancelled / declined
//
// Patreon signs each request with HMAC-MD5 of the raw body using the webhook
// secret (set in Patreon creator portal → Webhooks).  Register this URL there:
//   https://<your-site>/.netlify/functions/webhook-patreon

const { createHmac, timingSafeEqual } = require('crypto');
const { getStore } = require('@netlify/blobs');

const HEADERS = { 'Content-Type': 'application/json' };

function verifySignature(rawBody, signature, secret) {
  if (!signature) return false;
  const expected = createHmac('md5', secret).update(rawBody).digest('hex');
  try {
    const sigBuf = Buffer.from(signature,  'hex');
    const expBuf = Buffer.from(expected,   'hex');
    if (sigBuf.length !== expBuf.length) return false;
    return timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const webhookSecret = process.env.PATREON_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('PATREON_WEBHOOK_SECRET not set');
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: 'Server not configured' }) };
  }

  const rawBody   = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString() : (event.body || '');
  const signature = event.headers['x-patreon-signature'] || '';

  if (!verifySignature(rawBody, signature, webhookSecret)) {
    console.warn('Patreon webhook: invalid signature');
    return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Invalid signature' }) };
  }

  const eventType = event.headers['x-patreon-event'] || 'unknown';

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  try {
    const store = getStore('subscribers');

    // The member resource is payload.data; the patron user ID lives in the
    // relationships or in included[] resources.
    const memberAttrs = payload.data?.attributes || {};
    const included    = payload.included || [];

    // Find the patron (user) ID from relationships first, then from included.
    const patronRel = payload.data?.relationships?.patron?.data;
    const userId    = patronRel?.id
                   || included.find(x => x.type === 'user')?.id;

    if (!userId) {
      console.warn(`Patreon webhook (${eventType}): could not extract user ID`);
      // Return 200 so Patreon stops retrying — we log for manual inspection.
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true }) };
    }

    const patronStatus = memberAttrs.patron_status;
    const isActive     = patronStatus === 'active_patron';
    const tier         = isActive && memberAttrs.currently_entitled_amount_cents > 0 ? 'paid' : 'none';

    const key = `patreon:${userId}`;
    let existing = {};
    try {
      const raw = await store.get(key, { type: 'text' });
      if (raw) existing = JSON.parse(raw);
    } catch { /* first webhook for this user */ }

    await store.set(key, JSON.stringify({
      ...existing,
      platform:    'patreon',
      platformId:  userId,
      active:      isActive,
      tier:        isActive ? tier : 'none',
      lastWebhook: Date.now(),
      lastChecked: Date.now(),
    }));

    console.log(`Patreon webhook (${eventType}): user ${userId} → active=${isActive}`);
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error('webhook-patreon error:', err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: 'Internal error' }) };
  }
};
