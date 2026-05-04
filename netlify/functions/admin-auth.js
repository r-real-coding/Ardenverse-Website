'use strict';
const { pbkdf2, timingSafeEqual } = require('crypto');
const { signJwt } = require('./lib/_jwt');

const HEADERS = { 'Content-Type': 'application/json' };

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
