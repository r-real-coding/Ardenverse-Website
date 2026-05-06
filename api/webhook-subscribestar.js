'use strict';

// Subscribestar sends webhooks for subscription lifecycle events.
// Subscribestar signs requests with HMAC-SHA256; the signature appears in the
// X-Subscribestar-Signature header (or X-Hub-Signature-256 on some configs).
//
// Register this URL in your Subscribestar creator settings → Webhooks:
//   https://<your-site>/api/webhook-subscribestar

const { createHmac, timingSafeEqual } = require('crypto');
const { blobGet, blobPut } = require('./_blob');

function verifySignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader) return false;
  const sigHex   = signatureHeader.replace(/^sha256=/i, '');
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

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const webhookSecret = process.env.SUBSCRIBESTAR_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('SUBSCRIBESTAR_WEBHOOK_SECRET not set');
    return res.status(500).json({ error: 'Server not configured' });
  }

  const rawBuf    = await readBody(req);
  const rawBody   = rawBuf.toString('utf-8');
  const signature = req.headers['x-subscribestar-signature']
                 || req.headers['x-hub-signature-256']
                 || '';

  if (!verifySignature(rawBody, signature, webhookSecret)) {
    console.warn('Subscribestar webhook: invalid signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const eventType = payload.event || payload.type || 'unknown';
  console.log('Subscribestar webhook event:', eventType);

  try {
    const subscriber = payload.subscriber || payload.user || payload.data || {};
    const userId     = String(subscriber.id || subscriber.user_id || '');

    if (!userId) {
      console.warn('Subscribestar webhook: could not extract user ID');
      return res.status(200).json({ ok: true });
    }

    const subscription = payload.subscription || subscriber.subscription || {};
    const status       = subscription.status || subscriber.subscription_status || 'unknown';
    const isActive     = status === 'active';
    const tier         = isActive ? (subscription.tier_name || subscription.plan_name || 'paid') : 'none';

    const key      = `subscribers/subscribestar-${userId}.json`;
    const existing = await blobGet(key, { type: 'json' }) || {};
    await blobPut(key, JSON.stringify({
      ...existing,
      platform:    'subscribestar',
      platformId:  userId,
      active:      isActive,
      tier:        isActive ? tier : 'none',
      lastWebhook: Date.now(),
      lastChecked: Date.now(),
    }), { contentType: 'application/json' });

    console.log(`Subscribestar webhook (${eventType}): user ${userId} → active=${isActive}`);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('webhook-subscribestar error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
};

module.exports.config = { api: { bodyParser: false } };
