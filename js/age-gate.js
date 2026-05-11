(function () {
  var KEY = 'arden_age_verified';

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

  // ── Landing card navigation ───────────────────────────────────────────────────
  function _goToArdenverse() {
    if (typeof window.showSection === 'function') {
      window.showSection('home');
    } else {
      // Fallback before module loads (file:// or slow network)
      var sections = document.querySelectorAll('.section');
      for (var i = 0; i < sections.length; i++) sections[i].classList.remove('active');
      var home = document.getElementById('section-home');
      if (home) { home.classList.add('active'); }
      document.body.classList.add('ardenverse-mode');
      window.scrollTo(0, 0);
    }
  }

  function _goToFanservice() {
    window.location.href = '/fanservice';
  }

  // ── Init ──────────────────────────────────────────────────────────────────────
  function _init() {
    _check();

    var enter = document.getElementById('age-btn-enter');
    var exit  = document.getElementById('age-btn-exit');
    if (enter) enter.addEventListener('click', _accept);
    if (exit)  exit.addEventListener('click',  _decline);

    var ardenCard = document.getElementById('enterArdenverse');
    var fanCard   = document.getElementById('enterFanservice');
    if (ardenCard) ardenCard.addEventListener('click', _goToArdenverse);
    if (fanCard)   fanCard.addEventListener('click',   _goToFanservice);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }
})();
