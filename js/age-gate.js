(function () {
  var KEY = 'arden_age_verified';

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

  function _init() {
    _check();
    var enter = document.getElementById('age-btn-enter');
    var exit  = document.getElementById('age-btn-exit');
    if (enter) enter.addEventListener('click', _accept);
    if (exit)  exit.addEventListener('click',  _decline);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }
})();
