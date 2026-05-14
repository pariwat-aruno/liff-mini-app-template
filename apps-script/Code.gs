/**
 * Code.gs — HTTP entry point + handler registry (FOUNDATION)
 *
 * Request shape (from LIFF frontend):
 *   { action: string, idToken: string, payload: object }
 *
 * Response shape:
 *   { ok: true, data: any } | { ok: false, error: string }
 *
 * Adding a new action:
 *   1. Implement the handler function (in a separate .gs file)
 *   2. Add it to HANDLERS registry below with minRole
 *   3. Document in CLAUDE.md
 */

/* ============================================================
 * Handler Registry
 * ============================================================
 * Each entry: { fn, minRole }
 *   fn: function(payload, ctx) — returns data or throws
 *   minRole: minimum role required (use ROLES.*)
 */
const HANDLERS = {
  // System
  ping:                   { fn: _handlePing,                minRole: ROLES.VISITOR },
  getMe:                  { fn: _handleGetMe,               minRole: ROLES.VISITOR },

  // Pairing (visitor flow)
  redeemPairingCode:      { fn: redeemPairingCode_,         minRole: ROLES.VISITOR },
  requestRepair:          { fn: requestRepair_,             minRole: ROLES.VISITOR },

  // Pairing management (HR/OWNER)
  generatePairingCode:    { fn: (p, c) => generatePairingCode_(p.emp_code, c), minRole: ROLES.HR },
  listPairingCodes:       { fn: (p, c) => listPairingCodes_(c),                minRole: ROLES.HR },
  revokePairingCode:      { fn: (p, c) => revokePairingCode_(p.code, c, p.reason), minRole: ROLES.HR },

  // Onboarding (HR/OWNER)
  onboardEmployee:        { fn: onboardEmployee_,           minRole: ROLES.HR },
  listEmployees:          { fn: (p, c) => listEmployees_(c), minRole: ROLES.HR },
  unpairEmployee:         { fn: (p, c) => unpairEmployee_(p.emp_code, c), minRole: ROLES.OWNER },

  // Pending Changes (HR can list, OWNER can decide)
  listPendingChanges:     { fn: (p, c) => listPendingChanges_(c),               minRole: ROLES.HR },
  approvePendingChange:   { fn: (p, c) => approvePendingChange_(p.change_id, c, p.note), minRole: ROLES.OWNER },
  rejectPendingChange:    { fn: (p, c) => rejectPendingChange_(p.change_id, c, p.note),  minRole: ROLES.OWNER },

  // Audit (OWNER only)
  getRecentAudit:         { fn: (p, c) => { requireRole_(c, ROLES.OWNER); return getRecentAuditEntries(p.limit); }, minRole: ROLES.OWNER },

  // Project-specific actions get added in <Domain>.gs and registered below.
  // See _Domain.gs.template for the pattern.
};

// Actions that work without an emp_code mapping (for visitors)
const NO_MAPPING_REQUIRED = new Set([
  'ping', 'getMe', 'redeemPairingCode', 'requestRepair',
]);

// Actions that are mutations (auto-audited)
const MUTATING_ACTIONS = new Set([
  'redeemPairingCode', 'requestRepair',
  'generatePairingCode', 'revokePairingCode',
  'onboardEmployee', 'unpairEmployee',
  'approvePendingChange', 'rejectPendingChange',
]);

/* ============================================================
 * doPost / doGet
 * ============================================================ */

function doPost(e) {
  let request;
  try {
    request = JSON.parse(e.postData.contents);
  } catch (err) {
    return _jsonResponse({ ok: false, error: 'invalid_json' });
  }

  // LINE webhook (events from Messaging API)
  if (request && Array.isArray(request.events)) {
    return _handleLineWebhook(request);
  }

  // LIFF action request
  const { action, idToken, payload } = request || {};
  if (!action) return _jsonResponse({ ok: false, error: 'missing_action' });

  // Authenticate (ping is the only un-authenticated action)
  let ctx = null;
  if (action !== 'ping') {
    const verify = verifyIdToken(idToken);
    if (!verify.ok) {
      logAudit({ action: 'AUTH_FAILED', target_type: 'request', target_id: action, note: verify.error });
      return _jsonResponse({ ok: false, error: 'auth_failed' });
    }
    ctx = {
      userId: verify.userId,
      empCode: lookupEmpCodeByUserId(verify.userId),
    };
    if (!ctx.empCode && !NO_MAPPING_REQUIRED.has(action)) {
      return _jsonResponse({ ok: false, error: 'not_paired' });
    }
  }

  // Route + enforce role
  const handler = HANDLERS[action];
  if (!handler) return _jsonResponse({ ok: false, error: 'unknown_action' });

  try {
    requireRole_(ctx, handler.minRole);
    const data = handler.fn(payload || {}, ctx);

    // Auto-audit mutations
    if (MUTATING_ACTIONS.has(action)) {
      logAudit({
        actor: ctx ? ctx.userId : '',
        actor_role: resolveRole_(ctx),
        action: 'API_' + action.toUpperCase(),
        target_type: 'request',
        target_id: action,
        after: _safePayloadSummary_(payload),
      });
    }

    return _jsonResponse({ ok: true, data });
  } catch (err) {
    const msg = String((err && err.message) || err);
    logError('doPost::' + action, err, { payload });
    return _jsonResponse({ ok: false, error: msg });
  }
}

function doGet(e) {
  return _jsonResponse({
    ok: true,
    service: 'liff-mini-app-template',
    version: '1.0.0',
    timestamp: formatDatetime_(new Date()),
  });
}

/* ============================================================
 * Built-in handlers
 * ============================================================ */

function _handlePing(payload, ctx) {
  return { pong: true, time: formatDatetime_(new Date()) };
}

function _handleGetMe(payload, ctx) {
  if (!ctx || !ctx.userId) {
    return { role: ROLES.VISITOR, capabilities: capabilitiesForRole_(ROLES.VISITOR) };
  }

  const role = resolveRole_(ctx);
  const result = {
    user_id: ctx.userId,
    emp_code: ctx.empCode || '',
    role,
    capabilities: capabilitiesForRole_(role),
  };

  // Touch last_seen
  if (ctx.empCode) {
    try {
      updateRowByKey_(getPublicSheet_(), 'User_Map', 'line_user_id', ctx.userId, {
        last_seen: formatDatetime_(new Date()),
      });
    } catch (_) {}
  }

  // If paired, include display name
  if (ctx.empCode) {
    const map = readTab_(getPublicSheet_(), 'User_Map');
    const row = map.find(r => String(r.line_user_id) === String(ctx.userId));
    if (row) result.display_name = row.display_name || '';
  }

  return result;
}

/* ============================================================
 * Webhook routing
 * ============================================================ */

function _handleLineWebhook(request) {
  try {
    if (typeof handleLineWebhook_ === 'function') {
      handleLineWebhook_(request);
    } else {
      logWarn('_handleLineWebhook', 'No handler defined in WebApp.gs');
    }
  } catch (err) {
    logError('_handleLineWebhook', err, request);
  }
  // LINE expects 200 OK for webhook verification + events
  return _jsonResponse({ ok: true });
}

/* ============================================================
 * Helpers
 * ============================================================ */

function _jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function _safePayloadSummary_(payload) {
  if (!payload || typeof payload !== 'object') return {};
  const safe = {};
  Object.keys(payload).forEach(k => {
    if (/password|token|secret|key/i.test(k)) {
      safe[k] = '[REDACTED]';
    } else {
      const v = payload[k];
      if (typeof v === 'string' && v.length > 200) {
        safe[k] = v.substring(0, 200) + '...';
      } else if (typeof v === 'object') {
        safe[k] = '[object]';
      } else {
        safe[k] = v;
      }
    }
  });
  return safe;
}
