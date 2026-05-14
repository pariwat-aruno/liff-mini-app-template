/**
 * api.js — Backend API client (FOUNDATION)
 *
 * CORS GOTCHA — DO NOT CHANGE WITHOUT TESTING:
 *   Apps Script does not return Access-Control-Allow-Origin headers.
 *   We avoid CORS preflight by sending requests as text/plain.
 *   The body is JSON text — backend reads e.postData.contents and parses.
 *
 * Backend URL resolution:
 *   1. ?backend=<url>  — multi-tenant deployment (different backend per tenant)
 *   2. window.PAYROLL_CONFIG.API_URL — single-tenant fallback
 */

(function (global) {

  function getBackendUrl() {
    const params = new URLSearchParams(window.location.search);
    let url = params.get('backend') || params.get('b');

    // LIFF state may carry the real query
    if (!url && params.get('liff.state')) {
      const state = params.get('liff.state');
      const query = state && state.includes('?') ? state.substring(state.indexOf('?') + 1) : '';
      if (query) {
        const stateParams = new URLSearchParams(query);
        url = stateParams.get('backend') || stateParams.get('b');
      }
    }

    if (!url && global.PAYROLL_CONFIG) {
      url = global.PAYROLL_CONFIG.API_URL;
    }

    if (!url) {
      throw new Error('backend_url_not_configured');
    }
    return decodeURIComponent(url);
  }

  /**
   * POST a request to the backend.
   * @param {string} action
   * @param {object} payload
   * @param {string} idToken
   * @returns {Promise<any>} the `data` field from a successful response
   * @throws {Error} on network or business errors (error code is in err.message)
   */
  async function call(action, payload, idToken) {
    const url = getBackendUrl();
    const body = JSON.stringify({ action, idToken, payload: payload || {} });

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body,
        redirect: 'follow',
      });
    } catch (err) {
      throw new Error('network_error: ' + err.message);
    }

    if (!res.ok) throw new Error('http_' + res.status);

    let json;
    try {
      json = await res.json();
    } catch (_) {
      throw new Error('invalid_json_response');
    }

    if (!json.ok) throw new Error(json.error || 'unknown_error');
    return json.data;
  }

  /* ============================================================
   * Foundation API wrappers
   * ============================================================ */

  // System
  const ping     = (idToken)      => call('ping', {}, idToken);
  const getMe    = (idToken)      => call('getMe', {}, idToken);

  // Pairing (visitor)
  const redeemPairingCode = (idToken, payload) => call('redeemPairingCode', payload, idToken);
  const requestRepair     = (idToken, payload) => call('requestRepair', payload, idToken);

  // Pairing management (HR/OWNER)
  const generatePairingCode = (idToken, payload) => call('generatePairingCode', payload, idToken);
  const listPairingCodes    = (idToken)          => call('listPairingCodes', {}, idToken);
  const revokePairingCode   = (idToken, payload) => call('revokePairingCode', payload, idToken);

  // Onboarding
  const onboardEmployee = (idToken, payload) => call('onboardEmployee', payload, idToken);
  const listEmployees   = (idToken)          => call('listEmployees', {}, idToken);
  const unpairEmployee  = (idToken, payload) => call('unpairEmployee', payload, idToken);

  // Pending changes
  const listPendingChanges    = (idToken)          => call('listPendingChanges', {}, idToken);
  const approvePendingChange  = (idToken, payload) => call('approvePendingChange', payload, idToken);
  const rejectPendingChange   = (idToken, payload) => call('rejectPendingChange', payload, idToken);

  // Audit
  const getRecentAudit = (idToken, payload) => call('getRecentAudit', payload, idToken);

  global.Api = {
    call,
    getBackendUrl,
    // System
    ping, getMe,
    // Pairing (visitor)
    redeemPairingCode, requestRepair,
    // Pairing management
    generatePairingCode, listPairingCodes, revokePairingCode,
    // Onboarding
    onboardEmployee, listEmployees, unpairEmployee,
    // Pending changes
    listPendingChanges, approvePendingChange, rejectPendingChange,
    // Audit
    getRecentAudit,
  };
})(window);
