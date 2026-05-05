// Escape HTML and single quotes for safe insertion into HTML attributes & content
export function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Toast notification
let _toastTimer = null;
export function showToast(msg, error = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast' + (error ? ' error' : '') + ' show';
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

// Confirm dialog
let _confirmCb = null;
export function showConfirm(title, msg, cb) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMsg').textContent = msg;
  _confirmCb = cb;
  document.getElementById('confirmModal').classList.add('open');
}
export function closeConfirm() {
  document.getElementById('confirmModal').classList.remove('open');
  _confirmCb = null;
}
export function initConfirm() {
  document.getElementById('confirmOk').addEventListener('click', () => {
    if (_confirmCb) _confirmCb();
    closeConfirm();
  });
  document.getElementById('confirmCancelBtn').addEventListener('click', closeConfirm);
}

// Prompt dialog
let _promptCb = null;
export function showPrompt(title, desc, placeholder, defaultVal, cb) {
  document.getElementById('promptTitle').textContent = title;
  document.getElementById('promptDesc').textContent = desc || '';
  const inp = document.getElementById('promptInput');
  inp.placeholder = placeholder || '';
  inp.value = defaultVal || '';
  _promptCb = cb;
  document.getElementById('promptModal').classList.add('open');
  setTimeout(() => inp.focus(), 50);
}
export function closePrompt() {
  document.getElementById('promptModal').classList.remove('open');
  _promptCb = null;
}
export function initPrompt() {
  document.getElementById('promptOk').addEventListener('click', () => {
    const v = document.getElementById('promptInput').value.trim();
    if (v && _promptCb) _promptCb(v);
    closePrompt();
  });
  document.getElementById('promptCancelBtn').addEventListener('click', closePrompt);
  document.getElementById('promptInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const v = document.getElementById('promptInput').value.trim();
      if (v && _promptCb) _promptCb(v);
      closePrompt();
    }
    if (e.key === 'Escape') closePrompt();
  });
}

// Validate hex color
export function isValidHex(str) {
  return /^#[0-9a-fA-F]{6}$/.test(str);
}

// Track and revoke object URLs to prevent memory leaks
const _activeUrls = new Set();
export function revokeUrl(url) {
  if (url && _activeUrls.has(url)) {
    URL.revokeObjectURL(url);
    _activeUrls.delete(url);
  }
}
export function revokeAllUrls() {
  for (const url of _activeUrls) URL.revokeObjectURL(url);
  _activeUrls.clear();
}

// File size + type validation
export const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif']);

export function validateFile(file) {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    showToast('Unsupported format — use JPG, PNG, GIF, WebP, or AVIF', true);
    return false;
  }
  if (file.size > MAX_FILE_SIZE) {
    showToast('Image exceeds 25 MB limit', true);
    return false;
  }
  return true;
}

export function validateFileSize(file) {
  return validateFile(file);
}

// Dispatch a data-changed event so app.js can re-render
export function notifyDataChanged() {
  document.dispatchEvent(new CustomEvent('arden:datachanged'));
}

// Generate a unique slug that doesn't collide with existingSlugs
export function uniqueSlug(base, existingSlugs) {
  if (!existingSlugs.includes(base)) return base;
  let i = 2;
  while (existingSlugs.includes(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}
