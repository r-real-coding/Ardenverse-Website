'use strict';
const { pbkdf2, timingSafeEqual } = require('crypto');
const { blobGet, blobPut, blobDel } = require('./_blob');
const { signJwt } = require('./_jwt');

const MAX_ATTEMPTS = 5;
const WINDOW_SECS  = 15 * 60;

function _rlKey(ip) {
  // Sanitise the IP for use as a blob pathname segment
  return `ratelimit/admin-${ip.replace(/[^a-zA-Z0-9._-]/g, '_')}.json`;
}

async function checkRateLimit(ip) {
  try {
    const now  = Math.floor(Date.now() / 1000);
    let data   = { count: 0, windowStart: now };
    const raw  = await blobGet(_rlKey(ip), { type: 'json' });
    if (raw) {
      data = (now - raw.windowStart) > WINDOW_SECS
        ? { count: 0, windowStart: now }
        : raw;
    }
    if (data.count >= MAX_ATTEMPTS) {
      return { limited: true, retryAfter: WINDOW_SECS - (now - data.windowStart) };
    }
    data.count++;
    await blobPut(_rlKey(ip), JSON.stringify(data), { contentType: 'application/json' });
    return { limited: false };
  } catch {
    // Fail closed: if we can't check the rate limit, deny the request.
    return { limited: true, retryAfter: WINDOW_SECS };
  }
}

async function resetRateLimit(ip) {
  try { await blobDel(_rlKey(ip)); } catch { /* best-effort */ }
}

function verifyPassword(password, hashHex, saltHex) {
  return new Promise((resolve, reject) => {
    const salt = Buffer.from(saltHex, 'hex');
    pbkdf2(password, salt, 310000, 32, 'sha256', (err, derivedKey) => {
      if (err) { reject(err); return; }
      const expected = Buffer.from(hashHex, 'hex');
      if (derivedKey.length !== expected.length) { resolve(false); return; }
      resolve(timingSafeEqual(derivedKey, expected));
    });
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const hashHex = process.env.ADMIN_HASH;
  const saltHex = process.env.ADMIN_SALT;
  if (!hashHex || !saltHex) {
    console.error('ADMIN_HASH or ADMIN_SALT env vars not configured');
    return res.status(500).json({ error: 'Server not configured' });
  }

  // req.ip is set correctly by Express when trust proxy is configured in server.js.
  const ip = req.ip || 'unknown';

  const rl = await checkRateLimit(ip);
  if (rl.limited) {
    res.setHeader('Retry-After', String(rl.retryAfter));
    return res.status(429).json({ error: 'Too many attempts — try again later' });
  }

  const { password } = req.body || {};
  if (!password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Missing password' });
  }

  try {
    const valid = await verifyPassword(password, hashHex, saltHex);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid password' });
    }
    await resetRateLimit(ip);
    const now   = Math.floor(Date.now() / 1000);
    const token = signJwt({ sub: 'admin', iat: now, exp: now + 60 * 60 * 8 });
    return res.status(200).json({ token });
  } catch (err) {
    console.error('admin-auth error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
};
