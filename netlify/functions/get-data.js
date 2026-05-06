'use strict';
const { getStore } = require('@netlify/blobs');

const ALLOWED_STORES = new Set(['gallery', 'characters', 'planets', 'lore', 'loreCategories', 'tags']);
const HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const store = event.queryStringParameters?.store;
  if (!store || !ALLOWED_STORES.has(store)) {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Invalid store' }) };
  }

  try {
    const blob = getStore({ name: 'data', context });
    const data = await blob.get(store, { type: 'json' });
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify(data ?? []) };
  } catch (err) {
    console.error('get-data error:', err);
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify([]) };
  }
};
