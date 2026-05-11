const BASE = '/api';

// ── UUID ──────────────────────────────────────────────────────────────────────
export function newUuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  // Fallback using getRandomValues (no Math.random)
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

// ── Admin token ───────────────────────────────────────────────────────────────
const TOKEN_KEY = 'arden_admin_token';

export function saveAdminToken(token) { sessionStorage.setItem(TOKEN_KEY, token); }
export function clearAdminToken()     { sessionStorage.removeItem(TOKEN_KEY); }

export function checkAdminTokenExpiry() {
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (!token) return false;
  try {
    const b64     = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(b64));
    return payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function _token() { return sessionStorage.getItem(TOKEN_KEY) || ''; }

// Returns the best available session token (admin takes priority over member).
function _anyToken() {
  return sessionStorage.getItem('arden_admin_token') ||
         sessionStorage.getItem('arden_member_token') || '';
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export async function apiAdminAuth(password) {
  const res = await fetch(`${BASE}/admin-auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) return { ok: false, status: res.status };
  const { token } = await res.json();
  return token ? { ok: true, token } : { ok: false, status: 200 };
}

// ── Data operations ───────────────────────────────────────────────────────────
export async function apiGetData(store) {
  const tok = _anyToken();
  const headers = tok ? { 'Authorization': `Bearer ${tok}` } : {};
  const res = await fetch(`${BASE}/get-data?store=${encodeURIComponent(store)}`, { headers });
  if (!res.ok) throw new Error(`Failed to load ${store} (${res.status})`);
  return res.json();
}

export async function apiPutData(store, data) {
  const res = await fetch(`${BASE}/put-data`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${_token()}`,
    },
    body: JSON.stringify({ store, data }),
  });
  if (!res.ok) throw new Error(`Failed to save ${store} (${res.status})`);
}

// ── Image operations ──────────────────────────────────────────────────────────
export async function apiUploadImage(file) {
  const res = await fetch(`${BASE}/upload-image`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${_token()}`,
      'Content-Type': file.type || 'image/jpeg',
    },
    body: file,
  });
  if (!res.ok) {
    const msg = await res.json().then(j => j.error).catch(() => null);
    throw new Error(msg || `Image upload failed (${res.status})`);
  }
  const { key } = await res.json();
  return key;
}

export async function apiDeleteImage(key) {
  if (!key) return;
  const res = await fetch(`${BASE}/delete-image`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${_token()}`,
    },
    body: JSON.stringify({ key }),
  });
  if (!res.ok) throw new Error(`Image delete failed (${res.status})`);
}

// img src= attributes cannot send Authorization headers, so the token is
// appended as a query parameter instead.
export function imageUrl(key) {
  if (!key) return null;
  const url = `${BASE}/get-image?key=${encodeURIComponent(key)}`;
  const tok = _anyToken();
  return tok ? `${url}&t=${encodeURIComponent(tok)}` : url;
}
