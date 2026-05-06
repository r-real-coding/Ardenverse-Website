'use strict';
const { verifyJwt } = require('./_jwt');
const { verifyMemberJwt } = require('./_member-jwt');

const BLOB_HOST_RE = /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\//;

function _extractToken(req) {
  const auth = req.headers.authorization || req.headers.Authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return req.query.t || null;
}

function _isAuthorised(req) {
  const token = _extractToken(req);
  if (!token) return false;
  const adminPayload = verifyJwt(token);
  if (adminPayload?.sub === 'admin') return true;
  const memberPayload = verifyMemberJwt(token);
  if (memberPayload?.sub === 'member' && memberPayload?.active === true) return true;
  return false;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).end('Method Not Allowed');
  }

  if (!_isAuthorised(req)) {
    return res.status(401).end('Unauthorised');
  }

  const key = req.query.key;
  // key is the full Vercel Blob URL — validate it belongs to our store
  if (!key || !BLOB_HOST_RE.test(key)) {
    return res.status(400).end('Invalid key');
  }

  try {
    const blobRes = await fetch(key);
    if (!blobRes.ok) return res.status(404).end('Not found');

    const contentType = blobRes.headers.get('content-type') || 'image/jpeg';
    const buffer = Buffer.from(await blobRes.arrayBuffer());

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    return res.status(200).send(buffer);
  } catch (err) {
    console.error('get-image error:', err);
    return res.status(500).end('Internal error');
  }
};
