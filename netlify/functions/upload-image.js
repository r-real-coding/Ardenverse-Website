'use strict';
const { getStore } = require('@netlify/blobs');
const { verifyJwt, getTokenFromEvent } = require('./lib/_jwt');

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BYTES = 10 * 1024 * 1024;
const HEADERS = { 'Content-Type': 'application/json' };

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  if (!verifyJwt(getTokenFromEvent(event))) {
    return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const key = event.headers['x-image-key'];
  if (!key || !UUID_RE.test(key)) {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Invalid or missing X-Image-Key header' }) };
  }

  const contentType = event.headers['content-type'] || '';
  if (!ALLOWED_TYPES.has(contentType.split(';')[0].trim())) {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Unsupported image type' }) };
  }

  try {
    const body = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64')
      : Buffer.from(event.body ?? '', 'binary');

    if (body.length > MAX_BYTES) {
      return { statusCode: 413, headers: HEADERS, body: JSON.stringify({ error: 'Image exceeds 10 MB limit' }) };
    }

    const store = getStore('images');
    await store.set(key, body, { metadata: { contentType } });
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ key }) };
  } catch (err) {
    console.error('upload-image error:', err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: 'Internal error' }) };
  }
};
