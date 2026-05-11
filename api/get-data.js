'use strict';
const { blobGet } = require('./_blob');

const ALLOWED_STORES = new Set(['gallery', 'characters', 'planets', 'lore', 'loreCategories', 'tags', 'fanservice', 'fanserviceTags']);

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const store = req.query.store;
  if (!store || !ALLOWED_STORES.has(store)) {
    return res.status(400).json({ error: 'Invalid store' });
  }

  try {
    const data = await blobGet(`data/${store}.json`, { type: 'json' });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(data ?? []);
  } catch (err) {
    console.error('get-data error:', err);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json([]);
  }
};
