'use strict';
const { getStore } = require('@netlify/blobs');
const { verifyJwt } = require('./lib/_jwt');
const { verifyMemberJwt } = require('./lib/_member-jwt');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function _extractToken(event) {
  // Authorization header (fetch calls)
  const auth = event.headers.authorization || event.headers.Authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  // Query parameter (img src= tags cannot send headers)
  return event.queryStringParameters?.t || null;
}

function _isAuthorised(event) {
  const token = _extractToken(event);
  if (!token) return false;
  const adminPayload = verifyJwt(token);
  if (adminPayload?.sub === 'admin') return true;
  const memberPayload = verifyMemberJwt(token);
  if (memberPayload?.sub === 'member' && memberPayload?.active === true) return true;
  return false;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  if (!_isAuthorised(event)) {
    return { statusCode: 401, body: 'Unauthorised' };
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
        // private: browser may cache, CDN/shared caches must not (response is auth-gated)
        'Cache-Control': 'private, max-age=86400',
      },
      body: Buffer.from(data).toString('base64'),
      isBase64Encoded: true,
    };
  } catch (err) {
    console.error('get-image error:', err);
    return { statusCode: 500, body: 'Internal error' };
  }
};
