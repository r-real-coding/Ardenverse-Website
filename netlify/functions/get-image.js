'use strict';
const { getStore } = require('@netlify/blobs');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const key = event.queryStringParameters?.key;
  if (!key || !UUID_RE.test(key)) {
    return { statusCode: 400, body: 'Invalid key' };
  }

  try {
    const store = getStore('images');
    const result = await store.getWithMetadata(key, { type: 'arrayBuffer' });
    if (!result) return { statusCode: 404, body: 'Not found' };
    const { data, metadata } = result;
    if (!data) return { statusCode: 404, body: 'Not found' };

    const contentType = metadata?.contentType || 'image/jpeg';
    return {
      statusCode: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
      body: Buffer.from(data).toString('base64'),
      isBase64Encoded: true,
    };
  } catch (err) {
    console.error('get-image error:', err);
    return { statusCode: 500, body: 'Internal error' };
  }
};
