import { loadAll, GALLERY, CHARACTERS, PLANETS, LORE } from './state.js';
import { imageUrl } from './api.js';
import { esc, initConfirm, initPrompt, closeConfirm, closePrompt, showToast, revokeAllUrls } from './utils.js';
import { checkAgeGate, acceptAgeGate, declineAgeGate, adminLogin, checkAdminSession, initAuth, closeAdminLoginModal, toggleAdminPwVis, submitAdminLogin, adminLogout } from './auth.js';
import { renderGallery, buildFilterBar, openLightbox, closeLightbox, lightboxNav, openUploadModal, closeUploadModal, initGallery } from './gallery.js';
import { renderChars, openCharDetail, closeCharDetail, openCharModal, closeCharModal, initCharacters } from './characters.js';
import { renderPlanets, openPlanetModal, closePlanetModal, initPlanets } from './planets.js';
import { renderLoreSidebar, openLoreEntry, addLoreCategory, openLoreModal, closeLoreModal, initLore } from './lore.js';
import { initTags } from './tags.js';
import { initMembership, renderMemberBadge } from './membership.js';

// ── Navigation ────────────────────────────────────────────────────────────────
export function showSection(id) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById('section-' + id).classList.add('active');
  document.querySelectorAll('.nav-links button').forEach(b => b.classList.remove('active'));
  document.getElementById('nav-' + id).classList.add('active');
  window.scrollTo(0, 0);
}

// ── Home ──────────────────────────────────────────────────────────────────────
export function renderHome() {
  document.getElementById('stat-civilizations').textContent = CHARACTERS.length;
  document.getElementById('stat-worlds').textContent        = PLANETS.length;
  document.getElementById('stat-lore').textContent          = LORE.length;
  document.getElementById('stat-images').textContent        = GALLERY.length;

  const recent    = GALLERY.filter(g => g.imageKey).slice(0, 3);
  const container = document.getElementById('home-recent');
  if (!recent.length) {
    container.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem;font-weight:300;">No images yet.</div>';
    return;
  }
  container.innerHTML = recent.map(item => `
    <div class="gallery-item" data-goto-gallery style="cursor:pointer;">
      <img class="gallery-thumb" src="${esc(imageUrl(item.imageKey))}" alt="${esc(item.title)}">
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
  document.getElementById('age-btn-enter').addEventListener('click', acceptAgeGate);
  document.getElementById('age-btn-exit').addEventListener('click',  declineAgeGate);
  checkAgeGate();

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
  document.querySelector('.nav-logo').addEventListener('click', () => { showSection('home'); _closeNav(); });
  document.getElementById('nav-home').addEventListener('click',       () => { showSection('home');       _closeNav(); });
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

  window.addEventListener('beforeunload', revokeAllUrls);

  renderAll();
})();
