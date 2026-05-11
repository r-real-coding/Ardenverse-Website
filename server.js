'use strict';
require('dotenv').config();
const express = require('express');
const morgan  = require('morgan');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// Trust the first proxy hop (nginx / Coolify load balancer) so req.ip is correct.
app.set('trust proxy', 1);

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join('; ');

// Block access to dotfiles and other sensitive paths before any routing.
app.use((req, res, next) => {
  const p = req.path;
  if (/\/\./.test(p) || /\/(node_modules|data|uploads)\b/.test(p)) {
    return res.status(403).end('Forbidden');
  }
  next();
});

// Security headers on every HTML response
app.use((req, res, next) => {
  const p = req.path;
  if (p === '/' || p.endsWith('.html')) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Content-Security-Policy', CSP);
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }
  next();
});

app.use(morgan('combined'));

const jsonBody = express.json({ limit: '1mb' });

// ── API routes ────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.status(200).json({ ok: true }));
app.use('/api/admin-auth',            jsonBody, require('./api/admin-auth'));
app.use('/api/put-data',              jsonBody, require('./api/put-data'));
app.use('/api/delete-image',          jsonBody, require('./api/delete-image'));
app.use('/api/upload-image',                    require('./api/upload-image'));
app.use('/api/webhook-patreon',                 require('./api/webhook-patreon'));
app.use('/api/webhook-subscribestar',           require('./api/webhook-subscribestar'));
app.use('/api/get-data',                        require('./api/get-data'));
app.use('/api/get-image',                       require('./api/get-image'));
app.use('/api/get-oauth-url',                   require('./api/get-oauth-url'));
app.use('/api/member-auth',                     require('./api/member-auth'));

// ── Static files ──────────────────────────────────────────────────────────────
app.use('/css', express.static(path.join(__dirname, 'css'), { maxAge: 0 }));
app.use('/js',  express.static(path.join(__dirname, 'js'),  { maxAge: 0 }));
app.get('/robots.txt',      (_req, res) => res.sendFile(path.join(__dirname, 'robots.txt')));
app.get('/fanservice',      (_req, res) => res.sendFile(path.join(__dirname, 'fanservice.html')));
app.get('/fanservice.html', (_req, res) => res.sendFile(path.join(__dirname, 'fanservice.html')));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(PORT, () => console.log(`Ardenverse listening on :${PORT}`));
