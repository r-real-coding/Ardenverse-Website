'use strict';
const fs   = require('fs');
const path = require('path');
const { verifyJwt } = require('./_jwt');
const { verifyMemberJwt } = require('./_member-jwt');

const IMAGE_KEY_RE = /^images\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|gif|webp|avif)$/i;
const UPLOADS_DIR  = path.join(process.cwd(), 'uploads');
const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif' };

function _extractToken(req) {
  const auth = req.headers.authorization || '';
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
  if (req.method !== 'GET') return res.status(405).end('Method Not Allowed');
  if (!_isAuthorised(req)) return res.status(401).end('Unauthorised');

  const key = req.query.key;
  if (!key || !IMAGE_KEY_RE.test(key)) return res.status(400).end('Invalid key');

  const filePath = path.join(UPLOADS_DIR, key);
  if (!fs.existsSync(filePath)) return res.status(404).end('Not found');

  const ext = path.extname(key).slice(1).toLowerCase();
  res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.sendFile(filePath);
};
