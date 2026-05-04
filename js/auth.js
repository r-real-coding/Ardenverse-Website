import { showToast } from './utils.js';

// Replace these with values from generate-hash.html
const ADMIN_HASH = 'e81b8410077822473396cc3a1d0d90b50d613dc2bb4e0e70e6153a222e458316';
const ADMIN_SALT = '0a2c2a47c517e782c8892ea19f1e49a0fafc3e73c6a9bda97d470f87e86d191e';
const ADMIN_STORE_KEY = 'arden_admin_v1';
const AGE_GATE_KEY = 'arden_age_verified';

// ── Age Gate ──────────────────────────────────────────────────────────────────
export function checkAgeGate() {
  if (localStorage.getItem(AGE_GATE_KEY) === 'true') {
    document.getElementById('ageGate').classList.add('hidden');
  }
}

export function acceptAgeGate() {
  localStorage.setItem(AGE_GATE_KEY, 'true');
  document.getElementById('ageGate').classList.add('hidden');
}

export function declineAgeGate() {
  window.location.href = 'https://www.google.com';
}

// ── PBKDF2 key derivation ────────────────────────────────────────────────────
async function deriveKey(pw, saltHex) {
  const enc = new TextEncoder();
  const km = await crypto.subtle.importKey('raw', enc.encode(pw), { name: 'PBKDF2' }, false, ['deriveBits']);
  const salt = new Uint8Array(saltHex.match(/../g).map(h => parseInt(h, 16)));
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' }, km, 256);
  return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Constant-time string comparison (prevents timing attacks)
function ctEq(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ── Admin modal ───────────────────────────────────────────────────────────────
export function adminLogin() {
  if (ADMIN_HASH === 'PASTE_HASH_HERE') {
    console.warn('[Ardenverse] No admin hash configured. Run generate-hash.html to create credentials.');
    return;
  }
  document.getElementById('adminPwInput').value = '';
  document.getElementById('adminLoginError').textContent = '';
  document.getElementById('adminLoginModal').classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('adminPwInput').focus(), 50);
}

export function closeAdminLoginModal() {
  document.getElementById('adminLoginModal').classList.remove('open');
  document.body.style.overflow = '';
  document.getElementById('adminPwInput').value = '';
  document.getElementById('adminLoginError').textContent = '';
  const btn = document.getElementById('adminLoginBtn');
  btn.classList.remove('loading');
  btn.disabled = false;
  document.getElementById('adminLoginBtnLabel').textContent = 'Authenticate';
}

export function toggleAdminPwVis() {
  const inp = document.getElementById('adminPwInput');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

export async function submitAdminLogin() {
  const pw = document.getElementById('adminPwInput').value;
  if (!pw) return;
  const btn = document.getElementById('adminLoginBtn');
  btn.classList.add('loading');
  btn.disabled = true;
  document.getElementById('adminLoginBtnLabel').textContent = 'Verifying…';

  try {
    const derived = await deriveKey(pw, ADMIN_SALT);
    if (ctEq(derived, ADMIN_HASH)) {
      sessionStorage.setItem(ADMIN_STORE_KEY, derived);
      document.body.classList.add('admin-mode');
      closeAdminLoginModal();
      document.dispatchEvent(new CustomEvent('arden:datachanged'));
      showToast('Admin mode active');
    } else {
      document.getElementById('adminLoginError').textContent = 'Incorrect password.';
      btn.classList.remove('loading');
      btn.disabled = false;
      document.getElementById('adminLoginBtnLabel').textContent = 'Authenticate';
      document.getElementById('adminPwInput').value = '';
      document.getElementById('adminPwInput').focus();
    }
  } catch (err) {
    document.getElementById('adminLoginError').textContent = 'Authentication error.';
    btn.classList.remove('loading');
    btn.disabled = false;
    document.getElementById('adminLoginBtnLabel').textContent = 'Authenticate';
  }
}

export function adminLogout() {
  sessionStorage.removeItem(ADMIN_STORE_KEY);
  document.body.classList.remove('admin-mode');
  document.dispatchEvent(new CustomEvent('arden:datachanged'));
  showToast('Logged out');
}

export async function checkAdminSession() {
  if (ADMIN_HASH === 'PASTE_HASH_HERE') return false;
  const stored = sessionStorage.getItem(ADMIN_STORE_KEY);
  return stored ? ctEq(stored, ADMIN_HASH) : false;
}

// ── Init: wire up keyboard + password field events ────────────────────────────
export function initAuth() {
  document.getElementById('adminPwInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') submitAdminLogin();
    if (e.key === 'Escape') closeAdminLoginModal();
  });
}
