'use strict';
const { del } = require('@vercel/blob');
const { verifyJwt, getToken } = require('./_jwt');

const BLOB_HOST_RE = /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\//;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!verifyJwt(getToken(req))) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { key } = req.body || {};
  // key is the full Vercel Blob URL
  if (!key || !BLOB_HOST_RE.test(key)) {
    return res.status(400).json({ error: 'Invalid key' });
  }

  try {
    await del(key, { token: process.env.BLOB_READ_WRITE_TOKEN });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('delete-image error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
};
