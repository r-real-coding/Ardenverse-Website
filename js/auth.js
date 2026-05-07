import { showToast } from './utils.js';
import { apiAdminAuth, saveAdminToken, clearAdminToken, checkAdminTokenExpiry } from './api.js';

const AGE_GATE_KEY = 'arden_age_verified';

// ── Age gate ──────────────────────────────────────────────────────────────────
export function checkAgeGate() {
  let verified = false;
  try { verified = localStorage.getItem(AGE_GATE_KEY) === 'true'; } catch { /* Safari private mode */ }
  if (verified) {
    document.getElementById('ageGate').classList.add('hidden');
  } else {
    document.body.style.overflow = 'hidden';
  }
}

export function acceptAgeGate() {
  try { localStorage.setItem(AGE_GATE_KEY, 'true'); } catch { /* Safari private mode */ }
  document.getElementById('ageGate').classList.add('hidden');
  document.body.style.overflow = '';
}

export function declineAgeGate() {
  window.location.href = 'https://www.google.com';
}

// ── Admin session ─────────────────────────────────────────────────────────────
export function checkAdminSession() {
  return checkAdminTokenExpiry();
}

// ── Admin modal ───────────────────────────────────────────────────────────────
export function adminLogin() {
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

  const _fail = msg => {
    document.getElementById('adminLoginError').textContent = msg;
    document.getElementById('adminPwInput').value = '';
    document.getElementById('adminPwInput').focus();
    btn.classList.remove('loading');
    btn.disabled = false;
    document.getElementById('adminLoginBtnLabel').textContent = 'Authenticate';
  };

  try {
    const result = await apiAdminAuth(pw);
    if (result.ok) {
      saveAdminToken(result.token);
      document.body.classList.add('admin-mode');
      closeAdminLoginModal();
      document.dispatchEvent(new CustomEvent('arden:datachanged'));
      showToast('Admin mode active');
    } else if (result.status === 401) {
      _fail('Incorrect password.');
    } else if (result.status === 500) {
      _fail('Server error — check Vercel env vars (JWT_SECRET, ADMIN_HASH, ADMIN_SALT).');
    } else {
      _fail(`Login failed (${result.status}). Try again.`);
    }
  } catch {
    _fail('Connection error. Try again.');
  }
}

export function adminLogout() {
  clearAdminToken();
  document.body.classList.remove('admin-mode');
  document.dispatchEvent(new CustomEvent('arden:datachanged'));
  showToast('Logged out');
}

// ── Init ──────────────────────────────────────────────────────────────────────
export function initAuth() {
  document.getElementById('adminPwInput').addEventListener('keydown', e => {
    if (e.key === 'Enter')  submitAdminLogin();
    if (e.key === 'Escape') closeAdminLoginModal();
  });
}
