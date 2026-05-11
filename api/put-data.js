'use strict';
const { blobPut } = require('./_blob');
const { verifyJwt, getToken } = require('./_jwt');

const ALLOWED_STORES = new Set(['gallery', 'characters', 'planets', 'lore', 'loreCategories', 'tags', 'fanservice', 'fanserviceTags']);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!verifyJwt(getToken(req))) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { store, data } = req.body || {};

  if (!store || !ALLOWED_STORES.has(store)) {
    return res.status(400).json({ error: 'Invalid store' });
  }
  if (!Array.isArray(data)) {
    return res.status(400).json({ error: 'Data must be an array' });
  }

  try {
    await blobPut(`data/${store}.json`, JSON.stringify(data), { contentType: 'application/json' });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('put-data error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
};
