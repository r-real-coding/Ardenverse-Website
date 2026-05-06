'use strict';
const { put, del, list } = require('@vercel/blob');

const token = () => process.env.BLOB_READ_WRITE_TOKEN;

// Read a blob by its exact pathname, returns null if not found.
async function blobGet(pathname, options = {}) {
  try {
    const { blobs } = await list({ prefix: pathname, token: token(), limit: 10 });
    const match = blobs.find(b => b.pathname === pathname);
    if (!match) return null;
    const res = await fetch(match.url);
    if (!res.ok) return null;
    if (options.type === 'json') return res.json();
    if (options.type === 'arrayBuffer') return res.arrayBuffer();
    return res.text();
  } catch {
    return null;
  }
}

// Write a blob at the given pathname (overwrites if already exists).
async function blobPut(pathname, body, options = {}) {
  return put(pathname, body, {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    token: token(),
    ...options,
  });
}

// Delete a blob by its full URL or by pathname (best-effort).
async function blobDel(urlOrPathname) {
  try {
    if (urlOrPathname.startsWith('http')) {
      await del(urlOrPathname, { token: token() });
    } else {
      const { blobs } = await list({ prefix: urlOrPathname, token: token(), limit: 10 });
      const match = blobs.find(b => b.pathname === urlOrPathname);
      if (match) await del(match.url, { token: token() });
    }
  } catch { /* best-effort */ }
}

module.exports = { blobGet, blobPut, blobDel };
