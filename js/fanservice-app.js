import { loadFanservice } from './fanservice-state.js';
import { renderGallery, buildFilterBar, closeLightbox, lightboxNav, closeUploadModal, initFsGallery } from './fanservice-gallery.js';
import { esc, initConfirm, initPrompt, closeConfirm, closePrompt, showToast, revokeAllUrls } from './utils.js';
import { checkAdminSession, initAuth, closeAdminLoginModal, toggleAdminPwVis, submitAdminLogin, adminLogout } from './auth.js';
import { initMembership, renderMemberBadge, isSubscriber } from './membership.js';

// Expose for non-module scripts (age-gate.js)
window.submitAdminLogin = submitAdminLogin;

function _renderAll() {
  buildFilterBar();
  renderGallery();
}

(async () => {
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

  // Wire admin modal immediately — must work before loadFanservice completes
  initAuth();
  document.getElementById('adminLoginBtn').addEventListener('click',  submitAdminLogin);
  document.getElementById('adminCancelBtn').addEventListener('click', closeAdminLoginModal);
  document.getElementById('adminPwToggle').addEventListener('click',  toggleAdminPwVis);

  try {
    await loadFanservice();
  } catch (err) {
    console.error('Failed to load fanservice data:', err);
    showToast('Failed to load content — check your connection', true);
  }

  const isAdmin = checkAdminSession();
  if (isAdmin) document.body.classList.add('admin-mode');

  initConfirm();
  initPrompt();
  initMembership();
  initFsGallery();

  const _elOpen = id => document.getElementById(id)?.classList.contains('open');
  document.addEventListener('keydown', e => {
    if (_elOpen('fs-lightbox')) {
      if (e.key === 'ArrowLeft')  { lightboxNav(-1); return; }
      if (e.key === 'ArrowRight') { lightboxNav(1);  return; }
    }
    if (e.key !== 'Escape') return;
    if (_elOpen('promptModal'))      { closePrompt();          return; }
    if (_elOpen('fs-lightbox'))      { closeLightbox();        return; }
    if (_elOpen('confirmModal'))     { closeConfirm();         return; }
    if (_elOpen('adminLoginModal'))  { closeAdminLoginModal(); return; }
    if (_elOpen('fsUploadModal'))    { closeUploadModal();     return; }
  });

  document.getElementById('admin-logout-btn').addEventListener('click', adminLogout);

  document.addEventListener('arden:datachanged', () => {
    try { _renderAll(); } catch (err) { console.error('Render error:', err); showToast('Render error — please reload', true); }
  });

  document.addEventListener('arden:memberchanged', () => {
    renderMemberBadge();
    _renderAll();
  });

  document.addEventListener('arden:adminexpired', () => {
    adminLogout();
    showToast('Admin session expired — please log in again', true);
  });

  setInterval(() => {
    if (document.body.classList.contains('admin-mode') && !checkAdminSession()) {
      document.dispatchEvent(new CustomEvent('arden:adminexpired'));
    }
  }, 60_000);

  window.addEventListener('beforeunload', revokeAllUrls);

  _renderAll();
})();
