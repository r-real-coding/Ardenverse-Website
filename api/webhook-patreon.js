'use strict';

// Patreon sends webhooks for pledge lifecycle events:
//   members:pledge:create   → new patron
//   members:pledge:update   → tier change / payment status change
//   members:pledge:delete   → patron cancelled / declined
//
// Patreon signs each request with HMAC-MD5 of the raw body using the webhook
// secret (set in Patreon creator portal → Webhooks).  Register this URL there:
//   https://<your-site>/api/webhook-patreon

const { createHmac, timingSafeEqual } = require('crypto');
const { blobGet, blobPut } = require('./_blob');

function verifySignature(rawBody, signature, secret) {
  if (!signature) return false;
  const expected = createHmac('md5', secret).update(rawBody).digest('hex');
  try {
    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expected,  'hex');
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

  const webhookSecret = process.env.PATREON_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('PATREON_WEBHOOK_SECRET not set');
    return res.status(500).json({ error: 'Server not configured' });
  }

  const rawBuf    = await readBody(req);
  const rawBody   = rawBuf.toString('utf-8');
  const signature = req.headers['x-patreon-signature'] || '';

  if (!verifySignature(rawBody, signature, webhookSecret)) {
    console.warn('Patreon webhook: invalid signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const eventType = req.headers['x-patreon-event'] || 'unknown';

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  try {
    const memberAttrs = payload.data?.attributes || {};
    const included    = payload.included || [];

    const patronRel = payload.data?.relationships?.patron?.data;
    const userId    = patronRel?.id || included.find(x => x.type === 'user')?.id;

    if (!userId) {
      console.warn(`Patreon webhook (${eventType}): could not extract user ID`);
      return res.status(200).json({ ok: true });
    }

    const patronStatus = memberAttrs.patron_status;
    const isActive     = patronStatus === 'active_patron';
    const tier         = isActive && memberAttrs.currently_entitled_amount_cents > 0 ? 'paid' : 'none';

    const key      = `subscribers/patreon-${userId}.json`;
    const existing = await blobGet(key, { type: 'json' }) || {};
    await blobPut(key, JSON.stringify({
      ...existing,
      platform:    'patreon',
      platformId:  userId,
      active:      isActive,
      tier:        isActive ? tier : 'none',
      lastWebhook: Date.now(),
      lastChecked: Date.now(),
    }), { contentType: 'application/json' });

    console.log(`Patreon webhook (${eventType}): user ${userId} → active=${isActive}`);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('webhook-patreon error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
};

module.exports.config = { api: { bodyParser: false } };
