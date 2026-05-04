import { showToast } from './utils.js';
import { apiAdminAuth, saveAdminToken, clearAdminToken, checkAdminTokenExpiry } from './api.js';

const AGE_GATE_KEY = 'arden_age_verified';

// ── Age gate ──────────────────────────────────────────────────────────────────
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

  try {
    const token = await apiAdminAuth(pw);
    if (token) {
      saveAdminToken(token);
      document.body.classList.add('admin-mode');
      closeAdminLoginModal();
      document.dispatchEvent(new CustomEvent('arden:datachanged'));
      showToast('Admin mode active');
    } else {
      document.getElementById('adminLoginError').textContent = 'Incorrect password.';
      document.getElementById('adminPwInput').value = '';
      document.getElementById('adminPwInput').focus();
      btn.classList.remove('loading');
      btn.disabled = false;
      document.getElementById('adminLoginBtnLabel').textContent = 'Authenticate';
    }
  } catch {
    document.getElementById('adminLoginError').textContent = 'Connection error. Try again.';
    btn.classList.remove('loading');
    btn.disabled = false;
    document.getElementById('adminLoginBtnLabel').textContent = 'Authenticate';
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
