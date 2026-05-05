'use strict';

// Returns OAuth authorize URLs for platforms that have been configured via
// env vars.  The client_id is public information in OAuth 2.0, but we keep
// it server-side so the HTML never needs to change between environments.
const HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const siteUrl  = process.env.URL || `https://${event.headers.host}`;
  const result   = {};

  if (process.env.PATREON_CLIENT_ID) {
    const redirectUri = `${siteUrl}/.netlify/functions/member-auth?platform=patreon`;
    result.patreon = [
      'https://www.patreon.com/oauth2/authorize',
      `?response_type=code`,
      `&client_id=${encodeURIComponent(process.env.PATREON_CLIENT_ID)}`,
      `&redirect_uri=${encodeURIComponent(redirectUri)}`,
      `&scope=${encodeURIComponent('identity identity.memberships')}`,
    ].join('');
  }

  if (process.env.SUBSCRIBESTAR_CLIENT_ID) {
    const ssHost      = process.env.SUBSCRIBESTAR_HOST || 'https://subscribestar.adult';
    const redirectUri = `${siteUrl}/.netlify/functions/member-auth?platform=subscribestar`;
    result.subscribestar = [
      `${ssHost}/oauth/authorize`,
      `?response_type=code`,
      `&client_id=${encodeURIComponent(process.env.SUBSCRIBESTAR_CLIENT_ID)}`,
      `&redirect_uri=${encodeURIComponent(redirectUri)}`,
      `&scope=${encodeURIComponent('user.read subscriptions.read')}`,
    ].join('');
  }

  return { statusCode: 200, headers: HEADERS, body: JSON.stringify(result) };
};
