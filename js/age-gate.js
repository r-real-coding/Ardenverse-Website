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
    var isArden = _ARDEN_SECTIONS.indexOf(id) >= 0;
    if (isArden) {
      document.body.classList.add('ardenverse-mode');
    } else {
      document.body.classList.remove('ardenverse-mode');
    }
    // Update nav logo subtitle
    var logoSpan = document.querySelector('.nav-logo span');
    if (logoSpan) logoSpan.textContent = isArden ? 'Ardenverse' : 'Home';
    // Home button shows arrow only when NOT in the Ardenverse home section
    var navHomeBtn = document.getElementById('nav-home');
    if (navHomeBtn) navHomeBtn.textContent = (id === 'home') ? 'Home' : '← Home';
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

  function _toast(msg, isError) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'toast show' + (isError ? ' error' : '');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('show'); }, 3000);
  }

  function _submitAdminLogin() {
    var input = document.getElementById('adminPwInput');
    var pw    = input ? input.value : '';
    if (!pw) return;

    var btn = document.getElementById('adminLoginBtn');
    var lbl = document.getElementById('adminLoginBtnLabel');
    var err = document.getElementById('adminLoginError');

    function _fail(msg) {
      if (err) { err.textContent = msg; err.style.display = 'block'; }
      if (input) { input.value = ''; input.focus(); }
      if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
      if (lbl) lbl.textContent = 'Authenticate';
    }

    if (btn) { btn.disabled = true; btn.classList.add('loading'); }
    if (lbl) lbl.textContent = 'Verifying…';
    if (err) { err.textContent = ''; err.style.display = 'none'; }

    fetch('/api/admin-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw })
    })
    .then(function (res) {
      var status = res.status;
      return res.text().then(function (text) {
        var data = {};
        try { data = JSON.parse(text); } catch (e) {}
        return { status: status, data: data };
      });
    })
    .then(function (result) {
      if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
      if (lbl) lbl.textContent = 'Authenticate';
      if (result.status === 200 && result.data && result.data.token) {
        try { sessionStorage.setItem('arden_admin_token', result.data.token); } catch (e) {}
        document.body.classList.add('admin-mode');
        _closeAdminModal();
        _toast('Admin mode active');
        document.dispatchEvent(new CustomEvent('arden:datachanged'));
      } else if (result.status === 401) {
        _fail('Incorrect password.');
      } else if (result.status === 429) {
        _fail('Too many attempts — try again later.');
      } else if (result.status === 500) {
        _fail('Server error — check ADMIN_HASH / ADMIN_SALT env vars.');
      } else {
        _fail('Login failed (' + result.status + '). Try again.');
      }
    })
    .catch(function () {
      if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
      if (lbl) lbl.textContent = 'Authenticate';
      if (err) { err.textContent = 'Could not reach the server — make sure it is running.'; err.style.display = 'block'; }
    });
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
