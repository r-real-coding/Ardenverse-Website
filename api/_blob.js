'use strict';
const fs   = require('fs');
const path = require('path');

const DATA_DIR = path.join(process.cwd(), 'data');

function _resolve(pathname) {
  const resolved = path.resolve(DATA_DIR, pathname);
  // Prevent path traversal
  if (!resolved.startsWith(DATA_DIR + path.sep) && resolved !== DATA_DIR) {
    throw new Error('Invalid pathname');
  }
  return resolved;
}

async function blobGet(pathname, options = {}) {
  try {
    const filePath = _resolve(pathname);
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf-8');
    if (options.type === 'json') return JSON.parse(content);
    return content;
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

async function blobPut(pathname, body, _options = {}) {
  const filePath = _resolve(pathname);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, body, 'utf-8');
}

async function blobDel(pathname) {
  try {
    const filePath = _resolve(pathname);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch { /* best-effort */ }
}

module.exports = { blobGet, blobPut, blobDel };
