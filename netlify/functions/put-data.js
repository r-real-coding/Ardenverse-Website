'use strict';
const { getStore } = require('@netlify/blobs');
const { verifyJwt, getTokenFromEvent } = require('./lib/_jwt');

const ALLOWED_STORES = new Set(['gallery', 'characters', 'planets', 'lore', 'loreCategories', 'tags']);
const HEADERS = { 'Content-Type': 'application/json' };

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  if (!verifyJwt(getTokenFromEvent(event))) {
    return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  let store, data;
  try {
    ({ store, data } = JSON.parse(event.body || '{}'));
  } catch {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  if (!store || !ALLOWED_STORES.has(store)) {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Invalid store' }) };
  }
  if (!Array.isArray(data)) {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Data must be an array' }) };
  }

  try {
    const blob = getStore('data');
    await blob.set(store, JSON.stringify(data));
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error('put-data error:', err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: 'Internal error' }) };
  }
};
