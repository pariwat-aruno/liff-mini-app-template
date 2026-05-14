/**
 * Logger.gs — System logs + audit log (FOUNDATION)
 *
 * Two separate concerns:
 *   Sheet `Logs`      — system errors, warnings, info (debugging)
 *   Sheet `Audit_Log` — business events (who did what, append-only)
 *
 * Both are auto-created by Setup.gs::setupAll().
 */

/* ============================================================
 * System Logger
 * ============================================================ */

function logInfo(fn, message, payload) {
  _writeLog_('INFO', fn, message, payload);
}

function logWarn(fn, message, payload) {
  _writeLog_('WARN', fn, message, payload);
}

function logError(fn, err, payload) {
  const message = (err && err.message) ? err.message : String(err);
  const stack = (err && err.stack) ? err.stack : '';
  _writeLog_('ERROR', fn, message, payload, stack);
}

function _writeLog_(level, fn, message, payload, stack) {
  // Always log to Stackdriver
  const consoleMethod = level === 'ERROR' ? 'error' : (level === 'WARN' ? 'warn' : 'log');
  console[consoleMethod](`[${level}] ${fn}: ${message}`, payload || '');

  // Try to write to Sheet too (best-effort)
  try {
    const ss = getPublicSheet_();
    const sheet = ss.getSheetByName('Logs');
    if (!sheet) return;
    sheet.appendRow([
      formatDatetime_(new Date()),
      level,
      fn,
      message,
      payload ? safeJsonStringify_(payload) : '',
      stack || '',
    ]);
  } catch (_) {
    // If Sheet write fails, console.log already captured it
  }
}

/* ============================================================
 * Audit Log
 * ============================================================ */

/**
 * Write an audit entry. Used for business events:
 *   onboard, pair, role change, approval, etc.
 *
 * Schema:
 *   timestamp, actor_user_id, actor_role, action,
 *   target_type, target_id, before, after, note
 */
function logAudit(entry) {
  try {
    const ss = getPublicSheet_();
    const sheet = ss.getSheetByName('Audit_Log');
    if (!sheet) {
      console.warn('Audit_Log sheet missing, skipping audit entry:', entry.action);
      return;
    }
    sheet.appendRow([
      formatDatetime_(new Date()),
      entry.actor || '',
      entry.actor_role || '',
      entry.action || '',
      entry.target_type || '',
      entry.target_id || '',
      entry.before ? safeJsonStringify_(entry.before) : '',
      entry.after ? safeJsonStringify_(entry.after) : '',
      entry.note || '',
    ]);
  } catch (err) {
    console.error('logAudit failed:', err);
  }
}

/**
 * Read recent audit entries for admin viewer.
 */
function getRecentAuditEntries(limit) {
  limit = limit || 50;
  try {
    const rows = readTab_(getPublicSheet_(), 'Audit_Log');
    return rows.slice(-limit).reverse();
  } catch (err) {
    logError('getRecentAuditEntries', err);
    return [];
  }
}
