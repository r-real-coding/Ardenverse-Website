(function () {
  var KEY = 'arden_age_verified';
  var _ARDEN_SECTIONS = ['home', 'gallery', 'characters', 'planets', 'lore'];

  // ── Age gate ──────────────────────────────────────────────────────────────────
  function _check() {
    var ok = false;
    try { ok = localStorage.getItem(KEY) === 'true'; } catch (e) {}
    if (ok) {
      var el = document.getElementById('ageGate');
      if (el) el.classList.add('hidden');
    } else {
      document.body.style.overflow = 'hidden';
    }
  }

  function _accept() {
    try { localStorage.setItem(KEY, 'true'); } catch (e) {}
    var el = document.getElementById('ageGate');
    if (el) el.classList.add('hidden');
    document.body.style.overflow = '';
  }

  function _decline() {
    window.location.href = 'https://www.google.com';
  }

  // ── Section navigation (shared by landing cards, nav links, data-section btns) ─
  function _navToSection(id) {
    if (typeof window.showSection === 'function') {
      window.showSection(id);
      return;
    }
    // Fallback: module not loaded yet (file:// / slow network)
    var sections = document.querySelectorAll('.section');
    for (var i = 0; i < sections.length; i++) sections[i].classList.remove('active');
    var target = document.getElementById('section-' + id);
    if (target) target.classList.add('active');
    if (_ARDEN_SECTIONS.indexOf(id) >= 0) {
      document.body.classList.add('ardenverse-mode');
    } else {
      document.body.classList.remove('ardenverse-mode');
    }
    window.scrollTo(0, 0);
  }

  function _goToFanservice() {
    // Use a relative path so file:// works; the server also serves fanservice.html at /fanservice
    window.location.href = window.location.protocol === 'file:' ? 'fanservice.html' : '/fanservice';
  }

  // ── Admin modal — all interactions wired here, no module dependency ──────────
  function _openAdminModal() {
    var modal = document.getElementById('adminLoginModal');
    var input = document.getElementById('adminPwInput');
    var err   = document.getElementById('adminLoginError');
    if (!modal) return;
    if (input) input.value = '';
    if (err)   err.textContent = '';
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    if (input) setTimeout(function () { input.focus(); }, 50);
  }

  function _closeAdminModal() {
    var modal = document.getElementById('adminLoginModal');
    var input = document.getElementById('adminPwInput');
    var err   = document.getElementById('adminLoginError');
    var btn   = document.getElementById('adminLoginBtn');
    var lbl   = document.getElementById('adminLoginBtnLabel');
    if (modal) { modal.classList.remove('open'); document.body.style.overflow = ''; }
    if (input) input.value = '';
    if (err)   err.textContent = '';
    if (btn)   { btn.classList.remove('loading'); btn.disabled = false; }
    if (lbl)   lbl.textContent = 'Authenticate';
  }

  function _togglePwVis() {
    var inp = document.getElementById('adminPwInput');
    if (inp) inp.type = inp.type === 'password' ? 'text' : 'password';
  }

  function _submitAdminLogin() {
    var input = document.getElementById('adminPwInput');
    if (!input || !input.value.trim()) return;
    // Delegate to module function once loaded; it handles the API call and UI state
    if (typeof window.submitAdminLogin === 'function') {
      window.submitAdminLogin();
    } else {
      var err = document.getElementById('adminLoginError');
      if (err) { err.textContent = 'Page still loading — please wait a moment and try again.'; err.style.display = 'block'; }
    }
  }

  function _initAdminShortcut() {
    document.addEventListener('keydown', function (e) {
      // Ctrl+Shift+L — avoids Chrome's Ctrl+Shift+A (Search tabs) conflict
      if (e.ctrlKey && e.shiftKey && (e.key === 'L' || e.key === 'l')) {
        e.preventDefault();
        _openAdminModal();
        return;
      }
      var modal = document.getElementById('adminLoginModal');
      if (!modal || !modal.classList.contains('open')) return;
      if (e.key === 'Enter')  { e.preventDefault(); _submitAdminLogin(); }
      if (e.key === 'Escape') { e.preventDefault(); _closeAdminModal(); }
    });
  }

  function _initAdminModal() {
    var loginBtn  = document.getElementById('adminLoginBtn');
    var cancelBtn = document.getElementById('adminCancelBtn');
    var toggleBtn = document.getElementById('adminPwToggle');
    if (loginBtn)  loginBtn.addEventListener('click',  _submitAdminLogin);
    if (cancelBtn) cancelBtn.addEventListener('click', _closeAdminModal);
    if (toggleBtn) toggleBtn.addEventListener('click', _togglePwVis);
  }

  // ── Init ──────────────────────────────────────────────────────────────────────
  function _init() {
    _check();
    _initAdminShortcut();
    _initAdminModal();

    var enter = document.getElementById('age-btn-enter');
    var exit  = document.getElementById('age-btn-exit');
    if (enter) enter.addEventListener('click', _accept);
    if (exit)  exit.addEventListener('click',  _decline);

    var ardenCard = document.getElementById('enterArdenverse');
    var fanCard   = document.getElementById('enterFanservice');
    if (ardenCard) ardenCard.addEventListener('click', function () { _navToSection('home'); });
    if (fanCard)   fanCard.addEventListener('click',   _goToFanservice);

    // Nav links — wired here so they work before/without module load
    var navIds = ['home', 'gallery', 'characters', 'planets', 'lore'];
    for (var n = 0; n < navIds.length; n++) {
      (function (sectionId) {
        var btn = document.getElementById('nav-' + sectionId);
        if (!btn) return;
        // nav-home returns to landing picker, others go to their section
        btn.addEventListener('click', function () {
          _navToSection(sectionId === 'home' ? 'landing' : sectionId);
        });
      })(navIds[n]);
    }

    // [data-section] buttons (e.g. "Enter the Gallery", "Explore the Lore")
    var dsEls = document.querySelectorAll('[data-section]');
    for (var d = 0; d < dsEls.length; d++) {
      (function (el) {
        el.addEventListener('click', function () { _navToSection(el.dataset.section); });
      })(dsEls[d]);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }
})();
