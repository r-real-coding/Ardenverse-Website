'use strict';
const { getStore } = require('@netlify/blobs');
const { verifyJwt, getTokenFromEvent } = require('./lib/_jwt');

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB — must match body_size_limit in netlify.toml
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

  const mimeType = (event.headers['content-type'] || '').split(';')[0].trim();
  if (!ALLOWED_TYPES.has(mimeType)) {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Unsupported image type' }) };
  }

  try {
    // Netlify base64-encodes binary request bodies; guard against a null body just in case.
    const buf = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64')
      : Buffer.from(event.body || '', 'binary');

    if (buf.length > MAX_BYTES) {
      return { statusCode: 413, headers: HEADERS, body: JSON.stringify({ error: 'Image exceeds 25 MB limit' }) };
    }

    if (buf.length === 0) {
      return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Empty image body' }) };
    }

    // Use Blob for binary storage — more reliably handled by @netlify/blobs than ArrayBuffer.slice()
    const blob = new Blob([buf], { type: mimeType });
    const store = getStore('images');
    await store.set(key, blob, { metadata: { contentType: mimeType } });
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ key }) };
  } catch (err) {
    // Surface the underlying error message so it's visible in the network tab during debugging.
    const msg = err instanceof Error ? err.message : String(err);
    console.error('upload-image error:', msg, err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: `Internal error: ${msg}` }) };
  }
};
