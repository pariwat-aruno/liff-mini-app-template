/**
 * auth.js — LIFF SDK wrapper + dev mock (FOUNDATION)
 *
 * In production: uses real LIFF SDK
 * In local dev (no LIFF available): uses mock so pages work in browser
 *
 * Usage:
 *   await Auth.init(LIFF_ID);
 *   const profile = await Auth.getProfile();
 *   const idToken = Auth.getIDToken();
 *   if (Auth.isMock()) { ...show banner... }
 */

(function (global) {
  const MOCK_PROFILE = {
    userId: 'U_mock_local_dev_1234567890',
    displayName: 'Dev User (Mock)',
    pictureUrl: '',
    statusMessage: '',
  };
  const MOCK_ID_TOKEN = 'mock.id.token.for.local.dev';

  let _ready = false;
  let _useMock = false;

  async function init(liffId) {
    if (typeof liff === 'undefined') {
      console.warn('[Auth] LIFF SDK not loaded — using mock');
      _useMock = true;
      _ready = true;
      return;
    }

    try {
      await liff.init({ liffId });
      if (!liff.isLoggedIn()) {
        liff.login();
        return;
      }
      _ready = true;
      _handleLiffStateRedirect_();
    } catch (err) {
      console.error('[Auth] LIFF init failed:', err);
      if (_isLocalDev_()) {
        _useMock = true;
        _ready = true;
      } else {
        throw err;
      }
    }
  }

  /**
   * LIFF dispatcher passes target path via ?liff.state=/page.html
   * On some platforms (iOS), it doesn't auto-navigate. Handle manually.
   */
  function _handleLiffStateRedirect_() {
    const params = new URLSearchParams(window.location.search);
    const liffState = params.get('liff.state');
    if (!liffState || window.__liffStateHandled) return;

    const target = liffState.replace(/^\/+/, '');
    if (!target) return;
    if (window.location.pathname.endsWith('/' + target.split('?')[0])) return;

    window.__liffStateHandled = true;
    const sep = target.includes('?') ? '&' : '?';
    const carry = window.location.search.replace(/[?&]liff\.state=[^&]*/, '').replace(/^&/, '?');
    window.location.replace(target + (carry ? (sep + carry.slice(1)) : ''));
  }

  function _isLocalDev_() {
    return ['localhost', '127.0.0.1', ''].includes(window.location.hostname);
  }

  async function getProfile() {
    if (!_ready) throw new Error('liff_not_initialized');
    if (_useMock) return { ...MOCK_PROFILE };
    return await liff.getProfile();
  }

  function getIDToken() {
    if (!_ready) throw new Error('liff_not_initialized');
    if (_useMock) return MOCK_ID_TOKEN;
    return liff.getIDToken();
  }

  function isMock() { return _useMock; }
  function isReady() { return _ready; }

  function isInClient() {
    if (_useMock) return false;
    try {
      return typeof liff !== 'undefined' && liff.isInClient && liff.isInClient();
    } catch (_) { return false; }
  }

  function close() {
    if (_useMock) { alert('(mock) closing window'); return; }
    if (typeof liff !== 'undefined') liff.closeWindow();
  }

  /**
   * Navigate to another LIFF page, preserving backend= and other params.
   * Uses LINE's LIFF dispatcher format which works reliably across platforms.
   */
  function navTo(page) {
    const liffId = (window.PAYROLL_CONFIG && window.PAYROLL_CONFIG.LIFF_ID) ||
                   new URLSearchParams(window.location.search).get('liffId');
    if (!liffId) {
      window.location.href = page;
      return;
    }
    const params = new URLSearchParams(window.location.search);
    params.delete('liff.state');
    const qs = params.toString();
    window.location.assign(`https://liff.line.me/${liffId}/${page}${qs ? '?' + qs : ''}`);
  }

  global.Auth = {
    init,
    getProfile,
    getIDToken,
    isMock,
    isReady,
    isInClient,
    close,
    navTo,
  };
})(window);
