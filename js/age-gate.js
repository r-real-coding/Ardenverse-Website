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

  // ── Admin shortcut (Ctrl+Shift+A on any page) ─────────────────────────────────
  function _initAdminShortcut() {
    document.addEventListener('keydown', function (e) {
      if (e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
        e.preventDefault();
        if (typeof window.adminLogin === 'function') window.adminLogin();
      }
    });
  }

  // ── Init ──────────────────────────────────────────────────────────────────────
  function _init() {
    _check();
    _initAdminShortcut();

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
