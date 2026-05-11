import { loadAll, GALLERY, CHARACTERS, PLANETS, LORE } from './state.js';
import { imageUrl } from './api.js';
import { esc, initConfirm, initPrompt, closeConfirm, closePrompt, showToast, revokeAllUrls } from './utils.js';
import { adminLogin, checkAdminSession, initAuth, closeAdminLoginModal, toggleAdminPwVis, submitAdminLogin, adminLogout } from './auth.js';
import { renderGallery, buildFilterBar, openLightbox, closeLightbox, lightboxNav, openUploadModal, closeUploadModal, initGallery } from './gallery.js';
import { renderChars, openCharDetail, closeCharDetail, openCharModal, closeCharModal, initCharacters } from './characters.js';
import { renderPlanets, openPlanetModal, closePlanetModal, initPlanets } from './planets.js';
import { renderLoreSidebar, openLoreEntry, addLoreCategory, openLoreModal, closeLoreModal, initLore } from './lore.js';
import { initTags } from './tags.js';
import { initMembership, renderMemberBadge, isSubscriber } from './membership.js';

// ── Navigation ────────────────────────────────────────────────────────────────
const _ARDENVERSE_SECTIONS = new Set(['home', 'gallery', 'characters', 'planets', 'lore']);

export function showSection(id) {
  const section = document.getElementById('section-' + id);
  if (!section) { console.warn(`showSection: unknown section "${id}"`); return; }
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  section.classList.add('active');
  document.querySelectorAll('.nav-links button').forEach(b => b.classList.remove('active'));
  if (_ARDENVERSE_SECTIONS.has(id)) {
    document.body.classList.add('ardenverse-mode');
    const navBtn = document.getElementById('nav-' + id);
    if (navBtn) navBtn.classList.add('active');
  } else {
    document.body.classList.remove('ardenverse-mode');
  }
  window.scrollTo(0, 0);
}
// Expose for non-module scripts (age-gate.js landing card fallback)
window.showSection = showSection;

// ── Home ──────────────────────────────────────────────────────────────────────
export function renderHome() {
  document.getElementById('stat-civilizations').textContent = CHARACTERS.length;
  document.getElementById('stat-worlds').textContent        = PLANETS.length;
  document.getElementById('stat-lore').textContent          = LORE.length;
  document.getElementById('stat-images').textContent        = GALLERY.length;

  const isAdmin   = document.body.classList.contains('admin-mode');
  const container = document.getElementById('home-recent');

  if (!isSubscriber() && !isAdmin) {
    container.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem;font-weight:300;">Subscribe to see recent artwork.</div>';
    return;
  }

  const recent = GALLERY.filter(g => g.imageKey).slice(0, 3);
  if (!recent.length) {
    container.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem;font-weight:300;">No images yet.</div>';
    return;
  }
  container.innerHTML = recent.map(item => `
    <div class="gallery-item" data-goto-gallery style="cursor:pointer;">
      <img class="gallery-thumb" src="${esc(imageUrl(item.imageKey))}" alt="${esc(item.title)}" loading="lazy">
      <div class="gallery-overlay" style="opacity:1;background:linear-gradient(to top,rgba(2,15,13,0.9) 0%,transparent 60%);">
        <div class="gallery-item-title">${esc(item.title)}</div>
        <div class="tag-row">${(item.tags || []).slice(0, 3).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
      </div>
    </div>`).join('')
    + `<div style="background:var(--bg-card);border:1px dashed var(--teal-700);display:flex;align-items:center;
        justify-content:center;aspect-ratio:3/4;color:var(--text-muted);font-size:0.7rem;
        letter-spacing:0.2em;text-transform:uppercase;cursor:pointer;" data-goto-gallery>View All →</div>`;
}

// ── renderAll ─────────────────────────────────────────────────────────────────
export function renderAll() {
  buildFilterBar();
  renderGallery();
  renderChars();
  renderPlanets();
  renderHome();
  renderLoreSidebar();
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────────
function _initKeyboard() {
  document.addEventListener('keydown', e => {
    if (document.getElementById('lightbox').classList.contains('open')) {
      if (e.key === 'ArrowLeft')  { lightboxNav(-1); return; }
      if (e.key === 'ArrowRight') { lightboxNav(1);  return; }
    }
    if (e.key !== 'Escape') return;
    if (document.getElementById('promptModal').classList.contains('open'))      { closePrompt();           return; }
    if (document.getElementById('lightbox').classList.contains('open'))         { closeLightbox();         return; }
    if (document.getElementById('confirmModal').classList.contains('open'))     { closeConfirm();          return; }
    if (document.getElementById('adminLoginModal').classList.contains('open'))  { closeAdminLoginModal();  return; }
    if (document.getElementById('uploadModal').classList.contains('open'))      { closeUploadModal();      return; }
    if (document.getElementById('charModal').classList.contains('open'))        { closeCharModal();        return; }
    if (document.getElementById('planetModal').classList.contains('open'))      { closePlanetModal();      return; }
    if (document.getElementById('loreModal').classList.contains('open'))        { closeLoreModal();        return; }
    if (document.getElementById('char-detail').classList.contains('open'))      { closeCharDetail();       return; }
  });
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
(async () => {
  // Age gate + hamburger must be wired before any async work so clicks are never missed
  const _hamburger = document.getElementById('nav-hamburger');
  const _navLinks  = document.getElementById('nav-links');
  function _closeNav() {
    _navLinks.classList.remove('open');
    _hamburger.classList.remove('open');
    _hamburger.setAttribute('aria-expanded', 'false');
  }
  _hamburger.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = _navLinks.classList.toggle('open');
    _hamburger.classList.toggle('open', isOpen);
    _hamburger.setAttribute('aria-expanded', String(isOpen));
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('nav')) _closeNav();
  });

  try {
    await loadAll();
  } catch (err) {
    console.error('Failed to load data:', err);
    showToast('Failed to load content — check your connection', true);
  }

  const isAdmin = checkAdminSession();
  if (isAdmin) document.body.classList.add('admin-mode');

  initConfirm();
  initPrompt();
  initAuth();
  initMembership();
  initGallery();
  initCharacters();
  initPlanets();
  initLore();
  initTags();
  _initKeyboard();

  // Nav — section links (close mobile menu after navigation)
  document.querySelector('.nav-logo').addEventListener('click', () => { showSection('landing'); _closeNav(); });
  document.getElementById('nav-home').addEventListener('click', () => { showSection('landing'); _closeNav(); });
  document.getElementById('nav-gallery').addEventListener('click',    () => { showSection('gallery');    _closeNav(); });
  document.getElementById('nav-characters').addEventListener('click', () => { showSection('characters'); _closeNav(); });
  document.getElementById('nav-planets').addEventListener('click',    () => { showSection('planets');    _closeNav(); });
  document.getElementById('nav-lore').addEventListener('click',       () => { showSection('lore');       _closeNav(); });

  document.querySelectorAll('[data-section]').forEach(el => {
    el.addEventListener('click', () => showSection(el.dataset.section));
  });

  document.getElementById('home-recent').addEventListener('click', e => {
    if (e.target.closest('[data-goto-gallery]')) showSection('gallery');
  });

  window.adminLogin = adminLogin;
  document.getElementById('admin-logout-btn').addEventListener('click', adminLogout);

  document.getElementById('adminLoginBtn').addEventListener('click',  submitAdminLogin);
  document.getElementById('adminCancelBtn').addEventListener('click', closeAdminLoginModal);
  document.getElementById('adminPwToggle').addEventListener('click',  toggleAdminPwVis);

  document.addEventListener('arden:datachanged', () => {
    try { renderAll(); } catch (err) { console.error('Render error:', err); showToast('Render error — please reload', true); }
  });

  document.addEventListener('arden:adminexpired', () => {
    adminLogout();
    showToast('Admin session expired — please log in again', true);
  });

  // Detect mid-session token expiry every 60 s
  setInterval(() => {
    if (document.body.classList.contains('admin-mode') && !checkAdminSession()) {
      document.dispatchEvent(new CustomEvent('arden:adminexpired'));
    }
  }, 60_000);

  window.addEventListener('beforeunload', revokeAllUrls);

  renderAll();
})();
