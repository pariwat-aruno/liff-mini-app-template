/**
 * Pairing.gs — Pairing module (FOUNDATION · LOCKED DEFAULTS)
 *
 * Locked design decisions (do not change without re-evaluating concept):
 *   - 1 active code per emp_code (revoke old on reissue)
 *   - 6-digit numeric code
 *   - TTL configurable via Settings.PAIRING_TTL_HOURS (default 24)
 *   - Storage: Sheet `Pairing_Codes` primary, Cache as optimization
 *   - Pre-filled link (Level 2) + confirmation step on redeem
 *   - Rate limit: per user fail attempts via Sheet `Rate_Limit`
 *   - Invalidate code if too many wrong attempts on it
 *   - Re-pair: self-service + admin approval via PendingChanges
 *
 * Lifecycle: pending → consumed | expired | revoked  (one-way)
 *
 * Endpoints (called from Code.gs router):
 *   generatePairingCode_(empCode, ctx)       HR/OWNER
 *   listPairingCodes_(ctx)                   HR/OWNER
 *   revokePairingCode_(code, ctx, reason)    HR/OWNER
 *   redeemPairingCode_(payload, ctx)         VISITOR
 *   requestRepair_(payload, ctx)             VISITOR
 *   approveRepairRequest_(changeId, ctx)     HR/OWNER (via PendingChanges)
 */

const PAIRING_CODE_LENGTH = 6;
const PAIRING_DEFAULT_TTL_HOURS = 24;
const PAIRING_DEFAULT_MAX_FAIL = 5;
const PAIRING_RATE_LIMIT_WINDOW_MIN = 15;

const PAIRING_STATUS = Object.freeze({
  PENDING:  'pending',
  CONSUMED: 'consumed',
  EXPIRED:  'expired',
  REVOKED:  'revoked',
});

/* ============================================================
 * Generate (HR/OWNER)
 * ============================================================ */

/**
 * Generate a new pairing code for an employee.
 * Revokes any existing active code first (1 active per emp_code rule).
 *
 * @param {string} empCode
 * @param {object} ctx  request context (must be HR or OWNER)
 * @returns {object} { code, emp_code, expires_at, liff_link }
 */
function generatePairingCode_(empCode, ctx) {
  requireRole_(ctx, ROLES.HR);
  if (!empCode) throw new Error('missing_emp_code');
  empCode = String(empCode).trim().toUpperCase();

  // Verify the employee exists
  const employees = readTab_(getPublicSheet_(), 'Employees');
  const emp = employees.find(e => String(e.emp_code).toUpperCase() === empCode);
  if (!emp) throw new Error('employee_not_found');

  // Revoke any existing pending code for this emp_code
  _revokeActiveCodesFor_(empCode, ctx, 'reissue');

  // Generate unique code (retry on collision)
  let code = null;
  for (let i = 0; i < 10; i++) {
    const candidate = randomNumericCode_(PAIRING_CODE_LENGTH);
    if (!_findActiveCode_(candidate)) {
      code = candidate;
      break;
    }
  }
  if (!code) throw new Error('code_generation_failed_collision');

  const ttlHours = Number(getSetting_('PAIRING_TTL_HOURS', PAIRING_DEFAULT_TTL_HOURS));
  const now = new Date();
  const expires = addHours_(now, ttlHours);

  appendRows_(getPublicSheet_(), 'Pairing_Codes', [{
    code,
    emp_code:            empCode,
    created_by:          ctx.userId,
    created_at:          formatDatetime_(now),
    expires_at:          formatDatetime_(expires),
    consumed_at:         '',
    consumed_by_user_id: '',
    status:              PAIRING_STATUS.PENDING,
    fail_attempts:       0,
    revoked_reason:      '',
  }]);

  // Cache optimization
  try {
    CacheService.getScriptCache().put(
      'pair:' + code,
      JSON.stringify({ emp_code: empCode, expires_at: expires.toISOString() }),
      ttlHours * 3600
    );
  } catch (_) {}

  logAudit({
    actor: ctx.userId,
    actor_role: resolveRole_(ctx),
    action: 'PAIRING_CODE_GENERATED',
    target_type: 'employee',
    target_id: empCode,
    after: { ttl_hours: ttlHours },
  });

  return {
    code,
    emp_code: empCode,
    full_name: `${emp.first_name || ''} ${emp.last_name || ''}`.trim(),
    expires_at: formatDatetime_(expires),
    expires_in_hours: ttlHours,
    liff_link: _buildPairingLink_(empCode, code),
  };
}

/* ============================================================
 * Redeem (VISITOR)
 * ============================================================ */

/**
 * Redeem a pairing code to map LINE userId → emp_code.
 * Called from pair.html after user confirms identity.
 *
 * @param {object} payload { emp_code, code }
 * @param {object} ctx     request context (visitor, has userId)
 */
function redeemPairingCode_(payload, ctx) {
  if (!ctx || !ctx.userId) throw new Error('missing_user_id');

  const empCode = String((payload && payload.emp_code) || '').trim().toUpperCase();
  const code = String((payload && payload.code) || '').trim();

  if (!empCode || !code) throw new Error('missing_fields');
  if (!/^\d{6}$/.test(code)) throw new Error('invalid_code_format');

  // Rate limit by LINE userId
  _checkUserRateLimit_(ctx.userId);

  // Source of truth: Sheet (not cache)
  const codeRow = _findActiveCode_(code);
  if (!codeRow) {
    _recordFailedAttempt_(ctx.userId, code);
    throw new Error('code_not_found_or_expired');
  }

  if (String(codeRow.emp_code).toUpperCase() !== empCode) {
    _recordFailedAttempt_(ctx.userId, code);
    _incrementCodeFailAttempts_(code);
    throw new Error('code_emp_code_mismatch');
  }

  if (isPast_(codeRow.expires_at)) {
    _markCodeExpired_(code);
    throw new Error('code_expired');
  }

  // Check User_Map collision
  const map = readTab_(getPublicSheet_(), 'User_Map');
  if (map.some(r => String(r.line_user_id) === String(ctx.userId))) {
    throw new Error('already_paired_with_other_emp');
  }
  if (map.some(r => String(r.emp_code).toUpperCase() === empCode)) {
    throw new Error('emp_code_already_paired');
  }

  // Get employee for display name + role determination
  const employees = readTab_(getPublicSheet_(), 'Employees');
  const emp = employees.find(e => String(e.emp_code).toUpperCase() === empCode);
  if (!emp) throw new Error('employee_not_found');

  // First user paired with bootstrap owner ID → owner role
  // Otherwise: take role from Employees.intended_role (default 'staff')
  let role = String(emp.intended_role || ROLES.STAFF).toLowerCase();
  if (isBootstrapOwner_(ctx.userId)) role = ROLES.OWNER;
  if (!ROLE_HIERARCHY.includes(role)) role = ROLES.STAFF;

  const displayName = `${emp.first_name || ''} ${emp.last_name || ''}`.trim();
  const now = new Date();

  // Atomic-ish operations (Apps Script doesn't have transactions)
  appendRows_(getPublicSheet_(), 'User_Map', [{
    line_user_id: ctx.userId,
    emp_code:     empCode,
    role,
    display_name: displayName,
    paired_at:    formatDatetime_(now),
    last_seen:    '',
  }]);

  updateRowByKey_(getPublicSheet_(), 'Pairing_Codes', 'code', code, {
    status: PAIRING_STATUS.CONSUMED,
    consumed_at: formatDatetime_(now),
    consumed_by_user_id: ctx.userId,
  });

  // Clear cache
  try {
    CacheService.getScriptCache().remove('pair:' + code);
    invalidateUserMapCache_(ctx.userId, empCode);
  } catch (_) {}

  // Auto-switch rich menu if configured
  try {
    const pairedMenuId = getProperty_('RICHMENU_PAIRED_ID');
    if (pairedMenuId) assignRichMenu(ctx.userId, pairedMenuId);
  } catch (_) {}

  logAudit({
    actor: ctx.userId,
    actor_role: role,
    action: 'PAIRING_CODE_REDEEMED',
    target_type: 'employee',
    target_id: empCode,
    after: { display_name: displayName, role },
  });

  return {
    emp_code: empCode,
    full_name: displayName,
    role,
  };
}

/* ============================================================
 * List / Revoke (HR/OWNER)
 * ============================================================ */

function listPairingCodes_(ctx) {
  requireRole_(ctx, ROLES.HR);
  const rows = readTab_(getPublicSheet_(), 'Pairing_Codes');
  return rows.filter(r => r.status === PAIRING_STATUS.PENDING).map(r => ({
    code: r.code,
    emp_code: r.emp_code,
    created_by: r.created_by,
    created_at: r.created_at,
    expires_at: r.expires_at,
    fail_attempts: r.fail_attempts,
    liff_link: _buildPairingLink_(r.emp_code, r.code),
  }));
}

function revokePairingCode_(code, ctx, reason) {
  requireRole_(ctx, ROLES.HR);
  if (!code) throw new Error('missing_code');

  const codeRow = _findActiveCode_(code);
  if (!codeRow) throw new Error('code_not_found_or_not_active');

  updateRowByKey_(getPublicSheet_(), 'Pairing_Codes', 'code', code, {
    status: PAIRING_STATUS.REVOKED,
    revoked_reason: reason || 'manual',
  });

  try { CacheService.getScriptCache().remove('pair:' + code); } catch (_) {}

  logAudit({
    actor: ctx.userId,
    actor_role: resolveRole_(ctx),
    action: 'PAIRING_CODE_REVOKED',
    target_type: 'pairing_code',
    target_id: code,
    after: { emp_code: codeRow.emp_code, reason: reason || 'manual' },
  });

  return { ok: true, code };
}

/* ============================================================
 * Re-pair (VISITOR submit → HR/OWNER approve)
 * ============================================================ */

/**
 * User opens LIFF from new LINE account, requests re-pair.
 * Creates a Pending_Changes entry of type 'repair_request'.
 */
function requestRepair_(payload, ctx) {
  if (!ctx || !ctx.userId) throw new Error('missing_user_id');

  const empCode = String((payload && payload.emp_code) || '').trim().toUpperCase();
  const reason = String((payload && payload.reason) || '').trim();

  if (!empCode) throw new Error('missing_emp_code');
  if (!reason) throw new Error('missing_reason');

  // Verify employee exists
  const employees = readTab_(getPublicSheet_(), 'Employees');
  const emp = employees.find(e => String(e.emp_code).toUpperCase() === empCode);
  if (!emp) throw new Error('employee_not_found');

  // Cannot re-pair if user already paired to someone
  const map = readTab_(getPublicSheet_(), 'User_Map');
  if (map.some(r => String(r.line_user_id) === String(ctx.userId))) {
    throw new Error('already_paired');
  }

  // Check for existing pending repair request from this user/emp
  const pending = readTab_(getPublicSheet_(), 'Pending_Changes');
  const existing = pending.find(p =>
    p.status === 'pending' &&
    p.change_type === 'repair_request' &&
    p.target_id === empCode
  );
  if (existing) throw new Error('repair_request_already_pending');

  // Use the generic PendingChanges module
  const result = proposeChange_({
    type: 'repair_request',
    target_table: 'User_Map',
    target_id: empCode,
    data: {
      requesting_user_id: ctx.userId,
      reason,
      employee_name: `${emp.first_name || ''} ${emp.last_name || ''}`.trim(),
    },
  }, ctx);

  return {
    change_id: result.change_id,
    status: 'pending',
    message: 'คำขอผูกบัญชีใหม่ถูกส่งให้แอดมินแล้ว',
  };
}

/**
 * Called by PendingChanges when admin approves a repair_request.
 * Unpairs old LINE userId, generates new pairing code.
 */
function applyRepairApproval_(change, ctx) {
  const empCode = String(change.target_id).toUpperCase();
  const data = safeJsonParse_(change.change_data, {});

  // Unpair old mapping (remove from User_Map)
  deleteRowByKey_(getPublicSheet_(), 'User_Map', 'emp_code', empCode);

  // Clear caches
  invalidateUserMapCache_(data.requesting_user_id, empCode);

  // Generate new pairing code
  const codeResult = generatePairingCode_(empCode, ctx);

  // Notify the requesting user with new code
  if (data.requesting_user_id) {
    const flex = buildInfoFlex('อนุมัติแล้ว · รหัสผูกบัญชีใหม่', [
      { label: 'รหัสพนักงาน', value: empCode },
      { label: 'รหัสผูก', value: codeResult.code },
      { label: 'หมดอายุใน', value: codeResult.expires_in_hours + ' ชั่วโมง' },
      { label: 'ลิงก์', value: codeResult.liff_link },
    ]);
    pushFlex(data.requesting_user_id, 'รหัสผูกบัญชีใหม่: ' + codeResult.code, flex);
  }

  logAudit({
    actor: ctx.userId,
    actor_role: resolveRole_(ctx),
    action: 'REPAIR_APPROVED',
    target_type: 'employee',
    target_id: empCode,
    after: { new_code: codeResult.code },
  });

  return codeResult;
}

/* ============================================================
 * Expire sweep (daily trigger)
 * ============================================================ */

function expirePairingCodes() {
  const rows = readTab_(getPublicSheet_(), 'Pairing_Codes');
  const now = new Date();
  let count = 0;

  rows.forEach(r => {
    if (r.status === PAIRING_STATUS.PENDING && r.expires_at) {
      if (new Date(r.expires_at) < now) {
        updateRowByKey_(getPublicSheet_(), 'Pairing_Codes', 'code', r.code, {
          status: PAIRING_STATUS.EXPIRED,
        });
        try { CacheService.getScriptCache().remove('pair:' + r.code); } catch (_) {}
        count++;
      }
    }
  });

  logInfo('expirePairingCodes', `Expired ${count} codes`);
  return { expired: count };
}

/* ============================================================
 * Internal helpers
 * ============================================================ */

function _findActiveCode_(code) {
  const rows = readTab_(getPublicSheet_(), 'Pairing_Codes');
  return rows.find(r =>
    String(r.code) === String(code) &&
    r.status === PAIRING_STATUS.PENDING
  );
}

function _revokeActiveCodesFor_(empCode, ctx, reason) {
  const rows = readTab_(getPublicSheet_(), 'Pairing_Codes');
  const active = rows.filter(r =>
    String(r.emp_code).toUpperCase() === String(empCode).toUpperCase() &&
    r.status === PAIRING_STATUS.PENDING
  );

  active.forEach(r => {
    updateRowByKey_(getPublicSheet_(), 'Pairing_Codes', 'code', r.code, {
      status: PAIRING_STATUS.REVOKED,
      revoked_reason: reason || 'auto',
    });
    try { CacheService.getScriptCache().remove('pair:' + r.code); } catch (_) {}
  });

  if (active.length > 0) {
    logAudit({
      actor: ctx.userId,
      actor_role: resolveRole_(ctx),
      action: 'PAIRING_CODE_AUTO_REVOKED',
      target_type: 'employee',
      target_id: empCode,
      after: { count: active.length, reason: reason || 'auto' },
    });
  }
}

function _markCodeExpired_(code) {
  updateRowByKey_(getPublicSheet_(), 'Pairing_Codes', 'code', code, {
    status: PAIRING_STATUS.EXPIRED,
  });
  try { CacheService.getScriptCache().remove('pair:' + code); } catch (_) {}
}

function _incrementCodeFailAttempts_(code) {
  const rows = readTab_(getPublicSheet_(), 'Pairing_Codes');
  const r = rows.find(x => String(x.code) === String(code));
  if (!r) return;
  const newCount = Number(r.fail_attempts || 0) + 1;
  const maxFail = Number(getSetting_('PAIRING_MAX_FAIL_ATTEMPTS', PAIRING_DEFAULT_MAX_FAIL));

  updateRowByKey_(getPublicSheet_(), 'Pairing_Codes', 'code', code, {
    fail_attempts: newCount,
  });

  if (newCount >= maxFail && r.status === PAIRING_STATUS.PENDING) {
    updateRowByKey_(getPublicSheet_(), 'Pairing_Codes', 'code', code, {
      status: PAIRING_STATUS.REVOKED,
      revoked_reason: 'brute_force',
    });
    try { CacheService.getScriptCache().remove('pair:' + code); } catch (_) {}
    logWarn('_incrementCodeFailAttempts_', 'Code revoked due to brute force', { code });
  }
}

function _checkUserRateLimit_(userId) {
  const maxFail = Number(getSetting_('PAIRING_MAX_FAIL_ATTEMPTS', PAIRING_DEFAULT_MAX_FAIL));
  const windowMin = PAIRING_RATE_LIMIT_WINDOW_MIN;
  const cutoff = new Date(Date.now() - windowMin * 60 * 1000);

  const rows = readTab_(getPublicSheet_(), 'Rate_Limit');
  const recent = rows.filter(r =>
    String(r.user_id) === String(userId) &&
    r.action === 'pair_attempt' &&
    new Date(r.timestamp) > cutoff
  );

  if (recent.length >= maxFail) {
    throw new Error('rate_limit_exceeded');
  }
}

function _recordFailedAttempt_(userId, code) {
  try {
    appendRows_(getPublicSheet_(), 'Rate_Limit', [{
      timestamp: formatDatetime_(new Date()),
      user_id: userId,
      action: 'pair_attempt',
      detail: 'failed:' + code,
    }]);
  } catch (err) {
    logError('_recordFailedAttempt_', err);
  }
}

function _buildPairingLink_(empCode, code) {
  const liffId = getProperty_('LIFF_ID');
  if (!liffId) return '';
  // Level 2: pre-filled link to pair.html
  return `https://liff.line.me/${liffId}?p=pair&emp=${encodeURIComponent(empCode)}&c=${encodeURIComponent(code)}`;
}
