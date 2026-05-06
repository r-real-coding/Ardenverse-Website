'use strict';

const STATE_RE = /^[A-Za-z0-9\-_]{8,128}$/;

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const state = req.query.state || '';
  if (state && !STATE_RE.test(state)) {
    return res.status(400).json({ error: 'Invalid state parameter' });
  }

  const siteUrl = process.env.SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `https://${req.headers.host}`);
  const result = {};

  if (process.env.PATREON_CLIENT_ID) {
    const redirectUri = `${siteUrl}/api/member-auth?platform=patreon`;
    result.patreon = [
      'https://www.patreon.com/oauth2/authorize',
      `?response_type=code`,
      `&client_id=${encodeURIComponent(process.env.PATREON_CLIENT_ID)}`,
      `&redirect_uri=${encodeURIComponent(redirectUri)}`,
      `&scope=${encodeURIComponent('identity identity.memberships')}`,
      state ? `&state=${encodeURIComponent(state)}` : '',
    ].join('');
  }

  if (process.env.SUBSCRIBESTAR_CLIENT_ID) {
    const ssHost     = process.env.SUBSCRIBESTAR_HOST || 'https://subscribestar.adult';
    const redirectUri = `${siteUrl}/api/member-auth?platform=subscribestar`;
    result.subscribestar = [
      `${ssHost}/oauth/authorize`,
      `?response_type=code`,
      `&client_id=${encodeURIComponent(process.env.SUBSCRIBESTAR_CLIENT_ID)}`,
      `&redirect_uri=${encodeURIComponent(redirectUri)}`,
      `&scope=${encodeURIComponent('user.read subscriptions.read')}`,
      state ? `&state=${encodeURIComponent(state)}` : '',
    ].join('');
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(result);
};
