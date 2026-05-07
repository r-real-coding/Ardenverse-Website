'use strict';
const fs   = require('fs');
const path = require('path');
const { verifyJwt, getToken } = require('./_jwt');

const IMAGE_KEY_RE = /^images\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|gif|webp|avif)$/i;
const UPLOADS_DIR  = path.join(process.cwd(), 'uploads');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  if (!verifyJwt(getToken(req))) return res.status(401).json({ error: 'Unauthorized' });

  const { key } = req.body || {};
  if (!key || !IMAGE_KEY_RE.test(key)) return res.status(400).json({ error: 'Invalid key' });

  try {
    const filePath = path.join(UPLOADS_DIR, key);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('delete-image error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
};
