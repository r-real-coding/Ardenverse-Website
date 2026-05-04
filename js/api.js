const BASE = '/.netlify/functions';

// ── UUID ──────────────────────────────────────────────────────────────────────
export function newUuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
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
  const res = await fetch(`${BASE}/get-data?store=${encodeURIComponent(store)}`);
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
  const key = newUuid();
  const res = await fetch(`${BASE}/upload-image`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${_token()}`,
      'X-Image-Key': key,
      'Content-Type': file.type || 'image/jpeg',
    },
    body: file,
  });
  if (!res.ok) throw new Error(`Image upload failed (${res.status})`);
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

export function imageUrl(key) {
  if (!key) return null;
  return `${BASE}/get-image?key=${encodeURIComponent(key)}`;
}
