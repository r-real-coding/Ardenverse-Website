'use strict';
const { createHmac, timingSafeEqual } = require('crypto');

// Separate secret from the admin JWT so a compromised member token cannot
// be used to forge admin tokens (and vice-versa).
function signMemberJwt(payload) {
  const secret = process.env.MEMBER_JWT_SECRET;
  if (!secret) throw new Error('MEMBER_JWT_SECRET env var not set');
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body   = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig    = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

function verifyMemberJwt(token) {
  const secret = process.env.MEMBER_JWT_SECRET;
  if (!secret || !token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    // Reject any token whose header doesn't declare exactly HS256
    const hdr = JSON.parse(Buffer.from(header, 'base64url').toString());
    if (hdr.alg !== 'HS256') return null;
    const expected = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
    const sigBuf = Buffer.from(sig,      'base64url');
    const expBuf = Buffer.from(expected, 'base64url');
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function getMemberTokenFromEvent(event) {
  const auth = event.headers.authorization || event.headers.Authorization || '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : null;
}

module.exports = { signMemberJwt, verifyMemberJwt, getMemberTokenFromEvent };
