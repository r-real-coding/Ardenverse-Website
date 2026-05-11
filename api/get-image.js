'use strict';
const fs   = require('fs');
const path = require('path');
const { verifyJwt }       = require('./_jwt');
const { verifyMemberJwt } = require('./_member-jwt');
const { blobGet }         = require('./_blob');

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
  return memberPayload?.sub === 'member' && memberPayload?.active === true;
}

// Cache of public fanservice image keys, refreshed every 30 s
let _publicCache    = null;
let _publicCachedAt = 0;
const CACHE_TTL = 30_000;

async function _isPublicFanserviceImage(key) {
  const now = Date.now();
  if (_publicCache === null || now - _publicCachedAt >= CACHE_TTL) {
    const gallery = await blobGet('data/fanservice.json', { type: 'json' }).catch(() => null);
    _publicCache = new Set();
    if (Array.isArray(gallery)) {
      for (const item of gallery) {
        if (item.imageKey && item.visibility === 'public') _publicCache.add(item.imageKey);
      }
    }
    _publicCachedAt = now;
  }
  return _publicCache.has(key);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end('Method Not Allowed');

  const key = req.query.key;
  if (!key || !IMAGE_KEY_RE.test(key)) return res.status(400).end('Invalid key');

  const authed = _isAuthorised(req);
  if (!authed && !(await _isPublicFanserviceImage(key))) return res.status(401).end('Unauthorised');

  const filePath = path.join(UPLOADS_DIR, key);
  // Defense-in-depth: verify resolved path stays within uploads directory
  if (!filePath.startsWith(UPLOADS_DIR + path.sep)) return res.status(400).end('Invalid key');

  try {
    await fs.promises.access(filePath);
  } catch {
    return res.status(404).end('Not found');
  }

  const ext = path.extname(key).slice(1).toLowerCase();
  res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
  res.setHeader('Cache-Control', authed ? 'private, max-age=86400' : 'public, max-age=300');
  res.sendFile(filePath);
};
