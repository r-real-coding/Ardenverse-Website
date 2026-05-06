'use strict';
const { put } = require('@vercel/blob');
const { verifyJwt, getToken } = require('./_jwt');

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BYTES = 25 * 1024 * 1024;

async function readBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BYTES) return null; // too large
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!verifyJwt(getToken(req))) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const key = req.headers['x-image-key'];
  if (!key || !UUID_RE.test(key)) {
    return res.status(400).json({ error: 'Invalid or missing X-Image-Key header' });
  }

  const mimeType = (req.headers['content-type'] || '').split(';')[0].trim();
  if (!ALLOWED_TYPES.has(mimeType)) {
    return res.status(400).json({ error: 'Unsupported image type' });
  }

  try {
    const buf = await readBody(req);
    if (buf === null) {
      return res.status(413).json({ error: 'Image exceeds 25 MB limit' });
    }
    if (buf.length === 0) {
      return res.status(400).json({ error: 'Empty image body' });
    }

    const { url } = await put(`images/${key}`, buf, {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: mimeType,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    // Return the blob URL as the key — clients store this URL as imageKey.
    return res.status(200).json({ key: url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('upload-image error:', msg);
    return res.status(500).json({ error: `Internal error: ${msg}` });
  }
}

handler.config = { api: { bodyParser: false } };
module.exports = handler;
