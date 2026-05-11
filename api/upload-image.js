'use strict';
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { verifyJwt, getToken } = require('./_jwt');

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif']);
const EXT_MAP = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif' };
const MAX_BYTES   = 25 * 1024 * 1024;
const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'images');

// Magic-byte signatures for each allowed MIME type
function _checkMagicBytes(buf, mimeType) {
  if (buf.length < 12) return false;
  switch (mimeType) {
    case 'image/jpeg':
      return buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
    case 'image/png':
      return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47 &&
             buf[4] === 0x0D && buf[5] === 0x0A && buf[6] === 0x1A && buf[7] === 0x0A;
    case 'image/gif':
      return buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38;
    case 'image/webp':
      return buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
             buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50;
    case 'image/avif':
      // ISO BMFF box: 4-byte size then 'ftyp'
      return buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70;
    default:
      return false;
  }
}

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

    if (!_checkMagicBytes(buf, mimeType)) {
      return res.status(400).json({ error: 'File content does not match declared image type' });
    }

    const uuid     = crypto.randomUUID();
    const ext      = EXT_MAP[mimeType] || 'jpg';
    const filename = `${uuid}.${ext}`;

    await fs.promises.mkdir(UPLOADS_DIR, { recursive: true });
    await fs.promises.writeFile(path.join(UPLOADS_DIR, filename), buf);

    return res.status(200).json({ key: `images/${filename}` });
  } catch (err) {
    console.error('upload-image error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
};
