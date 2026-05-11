// Client-side membership / subscription management.
//
// Architecture:
//   • On init, fetch OAuth URLs from the server (get-oauth-url) so the client
//     never needs to hardcode client IDs.
//   • User clicks a platform button → JS opens a small popup to the OAuth URL.
//   • After OAuth, the member-auth function returns an HTML page that calls
//     window.opener.postMessage({ type:'MEMBER_AUTH', token|error }, origin).
//   • We store the resulting short-lived JWT in sessionStorage.
//   • isSubscriber() is used by gallery.js to gate content.

const MEMBER_TOKEN_KEY  = 'arden_member_token';
const OAUTH_STATE_KEY   = 'arden_oauth_state';

// ── Token helpers ─────────────────────────────────────────────────────────────
export function saveMemberToken(token) { sessionStorage.setItem(MEMBER_TOKEN_KEY, token); }
export function clearMemberToken()     { sessionStorage.removeItem(MEMBER_TOKEN_KEY); }

export function isSubscriber() {
  // Admin mode always has full access.
  if (document.body.classList.contains('admin-mode')) return true;
  const token = sessionStorage.getItem(MEMBER_TOKEN_KEY);
  if (!token) return false;
  try {
    const b64     = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(b64));
    return payload.active === true && payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function memberPlatform() {
  const token = sessionStorage.getItem(MEMBER_TOKEN_KEY);
  if (!token) return null;
  try {
    const b64     = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(b64));
    return payload.active === true ? payload.platform : null;
  } catch {
    return null;
  }
}

// ── OAuth CSRF state ──────────────────────────────────────────────────────────
function _generateState() {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

// ── OAuth popup ───────────────────────────────────────────────────────────────
let _popupResolve = null;
let _isConnecting = false;

function openOAuthPopup(url) {
  // Reject any outstanding popup promise before starting a new one.
  if (_popupResolve) {
    _popupResolve({ error: 'A new connection attempt was started' });
    _popupResolve = null;
  }
  return new Promise((resolve) => {
    _popupResolve = resolve;
    const w = 520, h = 680;
    const left = Math.round((screen.width  - w) / 2);
    const top  = Math.round((screen.height - h) / 2);
    const features = `width=${w},height=${h},left=${left},top=${top},` +
                     `toolbar=no,menubar=no,location=no,status=no`;
    const popup = window.open(url, 'ardenverse_oauth', features);
    if (!popup) {
      resolve({ error: 'Popup was blocked — please allow popups for this site' });
      _popupResolve = null;
      return;
    }
    // Fallback: if the popup closes without sending a message (e.g. user
    // manually closed it), resolve with a generic error after 2 s.
    const pollTimer = setInterval(() => {
      if (popup.closed) {
        clearInterval(pollTimer);
        if (_popupResolve) {
          _popupResolve({ error: 'Window closed before completing authentication' });
          _popupResolve = null;
        }
      }
    }, 500);
  });
}

function _handlePopupMessage(event) {
  // Only trust messages from our own origin (the popup lives there too).
  if (event.origin !== window.location.origin) return;
  const { type, token, error, state } = event.data || {};
  if (type !== 'MEMBER_AUTH') return;

  // CSRF: verify the state echoed from the callback matches what we stored.
  const expectedState = sessionStorage.getItem(OAUTH_STATE_KEY);
  sessionStorage.removeItem(OAUTH_STATE_KEY);
  if (expectedState && state !== expectedState) {
    if (_popupResolve) {
      _popupResolve({ error: 'OAuth state mismatch — possible CSRF attack, please try again' });
      _popupResolve = null;
    }
    return;
  }

  if (_popupResolve) {
    _popupResolve({ token, error });
    _popupResolve = null;
  }
}

// ── OAuth URLs (fetched per-connect, fresh state each time) ───────────────────
async function _fetchOAuthUrls(state) {
  const res = await fetch(`/api/get-oauth-url?state=${encodeURIComponent(state)}`);
  if (!res.ok) throw new Error(`get-oauth-url failed (${res.status})`);
  return res.json();
}

// Cached URL list just for button visibility (no state baked in, fetched once).
let _cachedUrls = {};
let _urlsFetched = false;

async function ensureOAuthUrls() {
  if (_urlsFetched) return;
  try {
    const res = await fetch('/api/get-oauth-url');
    if (res.ok) {
      _cachedUrls = await res.json();
      _urlsFetched = true; // only mark fetched on success so failed attempts can retry
    }
  } catch (err) {
    console.warn('Could not fetch OAuth URLs:', err);
  }
  _applyButtonVisibility();
}

function _applyButtonVisibility() {
  const patreonBtn       = document.getElementById('connectPatreonBtn');
  const subscribestarBtn = document.getElementById('connectSubscribestarBtn');
  if (patreonBtn)       patreonBtn.style.display       = _cachedUrls.patreon      ? '' : 'none';
  if (subscribestarBtn) subscribestarBtn.style.display  = _cachedUrls.subscribestar ? '' : 'none';
}

// ── Connect flows ─────────────────────────────────────────────────────────────
async function _connect(platform) {
  if (_isConnecting) return;
  // Generate a fresh CSRF state token for this flow and persist it.
  const state = _generateState();
  sessionStorage.setItem(OAUTH_STATE_KEY, state);

  let urls;
  try {
    urls = await _fetchOAuthUrls(state);
  } catch (err) {
    sessionStorage.removeItem(OAUTH_STATE_KEY);
    _isConnecting = false;
    _showError('Could not reach the server — please try again');
    return;
  }

  const url = urls[platform];
  if (!url) {
    sessionStorage.removeItem(OAUTH_STATE_KEY);
    _isConnecting = false;
    _showError(`${platform} is not configured on this site — contact the owner`);
    return;
  }
  _clearError();
  _isConnecting = true;
  _setConnecting(true);
  const result = await openOAuthPopup(url);
  _isConnecting = false;
  _setConnecting(false);

  if (result?.token) {
    saveMemberToken(result.token);
    document.dispatchEvent(new CustomEvent('arden:memberchanged'));
  } else {
    _showError(result?.error || 'Subscription not verified — make sure you are an active member');
  }
}

export async function connectPatreon()       { return _connect('patreon'); }
export async function connectSubscribestar() { return _connect('subscribestar'); }

export function memberLogout() {
  clearMemberToken();
  document.dispatchEvent(new CustomEvent('arden:memberchanged'));
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function _showError(msg) {
  const el = document.getElementById('membershipError');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}
function _clearError() {
  const el = document.getElementById('membershipError');
  if (el) { el.textContent = ''; el.style.display = 'none'; }
}
function _setConnecting(on) {
  const el = document.getElementById('paywallConnecting');
  if (el) el.style.display = on ? 'block' : 'none';
}

// Update the member badge + logout button visibility in the nav.
export function renderMemberBadge() {
  const badge    = document.getElementById('memberBadge');
  const platform = memberPlatform();
  if (badge) {
    badge.style.display = platform ? 'inline-block' : 'none';
    badge.title = platform ? `Subscribed via ${platform}` : '';
  }
  const logoutBtn = document.getElementById('memberLogoutBtn');
  if (logoutBtn) logoutBtn.style.display = platform ? 'inline-block' : 'none';
}

// ── Init ──────────────────────────────────────────────────────────────────────
export function initMembership() {
  window.addEventListener('message', _handlePopupMessage);

  document.getElementById('connectPatreonBtn')
    ?.addEventListener('click', connectPatreon);
  document.getElementById('connectSubscribestarBtn')
    ?.addEventListener('click', connectSubscribestar);
  document.getElementById('memberLogoutBtn')
    ?.addEventListener('click', memberLogout);

  document.addEventListener('arden:memberchanged', () => {
    renderMemberBadge();
    document.dispatchEvent(new CustomEvent('arden:datachanged'));
  });

  // Proactively clear expired member session every 60 s so UI updates without a page reload.
  setInterval(() => {
    const token = sessionStorage.getItem(MEMBER_TOKEN_KEY);
    if (!token) return;
    try {
      const b64     = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(b64));
      if (payload.exp <= Math.floor(Date.now() / 1000)) {
        clearMemberToken();
        document.dispatchEvent(new CustomEvent('arden:memberchanged'));
      }
    } catch {
      clearMemberToken();
      document.dispatchEvent(new CustomEvent('arden:memberchanged'));
    }
  }, 60_000);

  // Kick off URL fetch in background; hides unconfigured buttons once done.
  ensureOAuthUrls();
  renderMemberBadge();
}
