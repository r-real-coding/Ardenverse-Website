import { loadFanservice } from './fanservice-state.js';
import { renderGallery, buildFilterBar, closeLightbox, lightboxNav, closeUploadModal, initFsGallery } from './fanservice-gallery.js';
import { esc, initConfirm, initPrompt, closeConfirm, closePrompt, showToast, revokeAllUrls } from './utils.js';
import { adminLogin, checkAdminSession, initAuth, closeAdminLoginModal, toggleAdminPwVis, submitAdminLogin, adminLogout } from './auth.js';
import { initMembership, renderMemberBadge, isSubscriber } from './membership.js';

// Expose early so the Ctrl+Shift+A shortcut in age-gate.js can fire immediately
window.adminLogin = adminLogin;

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

  document.addEventListener('keydown', e => {
    if (document.getElementById('fs-lightbox').classList.contains('open')) {
      if (e.key === 'ArrowLeft')  { lightboxNav(-1); return; }
      if (e.key === 'ArrowRight') { lightboxNav(1);  return; }
    }
    if (e.key !== 'Escape') return;
    if (document.getElementById('promptModal').classList.contains('open'))      { closePrompt();          return; }
    if (document.getElementById('fs-lightbox').classList.contains('open'))      { closeLightbox();        return; }
    if (document.getElementById('confirmModal').classList.contains('open'))     { closeConfirm();         return; }
    if (document.getElementById('adminLoginModal').classList.contains('open'))  { closeAdminLoginModal(); return; }
    if (document.getElementById('fsUploadModal').classList.contains('open'))    { closeUploadModal();     return; }
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
