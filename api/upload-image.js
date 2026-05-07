'use strict';
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { verifyJwt, getToken } = require('./_jwt');

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif']);
const EXT_MAP = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif' };
const MAX_BYTES   = 25 * 1024 * 1024;
const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'images');

async function readBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BYTES) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!verifyJwt(getToken(req))) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const mimeType = (req.headers['content-type'] || '').split(';')[0].trim();
  if (!ALLOWED_TYPES.has(mimeType)) {
    return res.status(400).json({ error: 'Unsupported image type' });
  }

  try {
    const buf = await readBody(req);
    if (buf === null) return res.status(413).json({ error: 'Image exceeds 25 MB limit' });
    if (buf.length === 0) return res.status(400).json({ error: 'Empty image body' });

    const uuid     = crypto.randomUUID();
    const ext      = EXT_MAP[mimeType] || 'jpg';
    const filename = `${uuid}.${ext}`;

    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    fs.writeFileSync(path.join(UPLOADS_DIR, filename), buf);

    return res.status(200).json({ key: `images/${filename}` });
  } catch (err) {
    console.error('upload-image error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
};
