'use strict';

// Subscribestar sends webhooks for subscription lifecycle events.
// Subscribestar signs requests with HMAC-SHA256; the signature appears in the
// X-Subscribestar-Signature header (or X-Hub-Signature-256 on some configs).
//
// Register this URL in your Subscribestar creator settings → Webhooks:
//   https://<your-site>/.netlify/functions/webhook-subscribestar

const { createHmac, timingSafeEqual } = require('crypto');
const { getStore } = require('@netlify/blobs');

const HEADERS = { 'Content-Type': 'application/json' };

function verifySignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader) return false;
  // Strip optional "sha256=" prefix
  const sigHex  = signatureHeader.replace(/^sha256=/i, '');
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    const sigBuf = Buffer.from(sigHex,   'hex');
    const expBuf = Buffer.from(expected, 'hex');
    if (sigBuf.length !== expBuf.length) return false;
    return timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
}

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const webhookSecret = process.env.SUBSCRIBESTAR_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('SUBSCRIBESTAR_WEBHOOK_SECRET not set');
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: 'Server not configured' }) };
  }

  const rawBody   = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString() : (event.body || '');
  const signature = event.headers['x-subscribestar-signature']
                 || event.headers['x-hub-signature-256']
                 || '';

  if (!verifySignature(rawBody, signature, webhookSecret)) {
    console.warn('Subscribestar webhook: invalid signature');
    return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Invalid signature' }) };
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const eventType = payload.event || payload.type || 'unknown';
  console.log('Subscribestar webhook event:', eventType);

  try {
    const store = getStore({ name: 'subscribers', context });

    // Subscribestar payload shapes vary; handle common formats.
    const subscriber = payload.subscriber || payload.user || payload.data || {};
    const userId     = String(subscriber.id || subscriber.user_id || '');

    if (!userId) {
      console.warn('Subscribestar webhook: could not extract user ID');
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true }) };
    }

    const subscription = payload.subscription || subscriber.subscription || {};
    const status       = subscription.status || subscriber.subscription_status || 'unknown';
    const isActive     = status === 'active';
    const tier         = isActive ? (subscription.tier_name || subscription.plan_name || 'paid') : 'none';

    const key = `subscribestar:${userId}`;
    let existing = {};
    try {
      const raw = await store.get(key, { type: 'text' });
      if (raw) existing = JSON.parse(raw);
    } catch { /* first webhook for this user */ }

    await store.set(key, JSON.stringify({
      ...existing,
      platform:    'subscribestar',
      platformId:  userId,
      active:      isActive,
      tier:        isActive ? tier : 'none',
      lastWebhook: Date.now(),
      lastChecked: Date.now(),
    }));

    console.log(`Subscribestar webhook (${eventType}): user ${userId} → active=${isActive}`);
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error('webhook-subscribestar error:', err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: 'Internal error' }) };
  }
};
