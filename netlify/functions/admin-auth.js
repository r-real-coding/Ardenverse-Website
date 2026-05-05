'use strict';
const { pbkdf2, timingSafeEqual } = require('crypto');
const { getStore } = require('@netlify/blobs');
const { signJwt } = require('./lib/_jwt');

const HEADERS = { 'Content-Type': 'application/json' };

// Brute-force protection: 5 failed attempts per IP per 15-minute window.
const MAX_ATTEMPTS  = 5;
const WINDOW_SECS   = 15 * 60;

async function checkRateLimit(ip) {
  try {
    const store = getStore('ratelimit');
    const key   = `admin:${ip}`;
    const now   = Math.floor(Date.now() / 1000);
    let data    = { count: 0, windowStart: now };
    const raw   = await store.get(key, { type: 'text' }).catch(() => null);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Reset window if expired
      data = (now - parsed.windowStart) > WINDOW_SECS
        ? { count: 0, windowStart: now }
        : parsed;
    }
    if (data.count >= MAX_ATTEMPTS) {
      return { limited: true, retryAfter: WINDOW_SECS - (now - data.windowStart) };
    }
    data.count++;
    await store.set(key, JSON.stringify(data)).catch(() => {});
    return { limited: false };
  } catch {
    // If Blobs is unavailable, fail open (don't block legitimate logins)
    return { limited: false };
  }
}

async function resetRateLimit(ip) {
  try {
    const store = getStore('ratelimit');
    await store.delete(`admin:${ip}`);
  } catch { /* best-effort */ }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const hashHex = process.env.ADMIN_HASH;
  const saltHex = process.env.ADMIN_SALT;
  if (!hashHex || !saltHex) {
    console.error('ADMIN_HASH or ADMIN_SALT env vars not configured');
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: 'Server not configured' }) };
  }

  // Prefer Netlify's verified client IP header
  const ip = event.headers['x-nf-client-connection-ip'] ||
             (event.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
             'unknown';

  const rl = await checkRateLimit(ip);
  if (rl.limited) {
    return {
      statusCode: 429,
      headers: { ...HEADERS, 'Retry-After': String(rl.retryAfter) },
      body: JSON.stringify({ error: 'Too many attempts — try again later' }),
    };
  }

  let password;
  try {
    ({ password } = JSON.parse(event.body || '{}'));
  } catch {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  if (!password || typeof password !== 'string') {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Missing password' }) };
  }

  try {
    const valid = await verifyPassword(password, hashHex, saltHex);
    if (!valid) {
      return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Invalid password' }) };
    }

    // Successful login — clear the rate-limit counter for this IP
    await resetRateLimit(ip);

    const now = Math.floor(Date.now() / 1000);
    const token = signJwt({ sub: 'admin', iat: now, exp: now + 60 * 60 * 8 }); // 8-hour session
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ token }) };
  } catch (err) {
    console.error('admin-auth error:', err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: 'Internal error' }) };
  }
};

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
