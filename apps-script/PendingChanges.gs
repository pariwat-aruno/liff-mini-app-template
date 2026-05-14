/**
 * PendingChanges.gs — Universal propose-approve queue (FOUNDATION)
 *
 * Pattern:
 *   1. Lower role proposes a change → row added to Pending_Changes (status=pending)
 *   2. Notify approvers (owners) via Flex
 *   3. Approver acts on it → row updated (status=approved/rejected)
 *   4. If approved: apply the change to the real table
 *
 * Built-in change types (extensible):
 *   - repair_request    (handled by Pairing.gs::applyRepairApproval_)
 *   - <project types>   (registered via registerChangeHandler_)
 *
 * Usage from feature modules:
 *   proposeChange_({ type, target_table, target_id, data }, ctx)
 *
 * Schema:
 *   change_id, proposed_by, proposed_role, change_type,
 *   target_table, target_id, change_data (JSON), status,
 *   approved_by, decision_at, decision_note, proposed_at
 */

const CHANGE_STATUS = Object.freeze({
  PENDING:  'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
});

// Handler registry: change_type → function(change, ctx)
const _changeHandlers = {};

/**
 * Register an apply handler for a change type.
 * Called from feature modules at script load time.
 *
 * Example:
 *   registerChangeHandler_('repair_request', applyRepairApproval_);
 */
function registerChangeHandler_(changeType, handler) {
  _changeHandlers[changeType] = handler;
}

// Built-in handler registrations (must run at script load)
registerChangeHandler_('repair_request', applyRepairApproval_);

/* ============================================================
 * Propose
 * ============================================================ */

/**
 * Propose a change. If proposer is OWNER, apply directly (skip queue).
 * Otherwise, queue it and notify owners.
 *
 * @param {object} change - { type, target_table, target_id, data }
 * @param {object} ctx
 * @returns {object} { change_id, status, applied?: true }
 */
function proposeChange_(change, ctx) {
  if (!change || !change.type) throw new Error('missing_change_type');
  if (!_changeHandlers[change.type]) {
    throw new Error('no_handler_registered: ' + change.type);
  }

  // Owner gets direct-apply shortcut (no approval needed)
  if (hasRole_(ctx, ROLES.OWNER)) {
    const fakeChange = {
      change_id: generateId_('PC', true),
      change_type: change.type,
      target_table: change.target_table || '',
      target_id: change.target_id || '',
      change_data: safeJsonStringify_(change.data || {}),
      proposed_by: ctx.userId,
      proposed_role: ROLES.OWNER,
      status: CHANGE_STATUS.APPROVED,
    };
    const result = _changeHandlers[change.type](fakeChange, ctx);

    // Still record for audit
    appendRows_(getPublicSheet_(), 'Pending_Changes', [{
      change_id:      fakeChange.change_id,
      proposed_by:    ctx.userId,
      proposed_role:  ROLES.OWNER,
      proposed_at:    formatDatetime_(new Date()),
      change_type:    fakeChange.change_type,
      target_table:   fakeChange.target_table,
      target_id:      fakeChange.target_id,
      change_data:    fakeChange.change_data,
      status:         CHANGE_STATUS.APPROVED,
      approved_by:    ctx.userId,
      decision_at:    formatDatetime_(new Date()),
      decision_note:  'direct_apply_by_owner',
    }]);

    return { change_id: fakeChange.change_id, status: CHANGE_STATUS.APPROVED, applied: true, result };
  }

  // Queue for approval
  const changeId = generateId_('PC', true);
  appendRows_(getPublicSheet_(), 'Pending_Changes', [{
    change_id:      changeId,
    proposed_by:    ctx.userId,
    proposed_role:  resolveRole_(ctx),
    proposed_at:    formatDatetime_(new Date()),
    change_type:    change.type,
    target_table:   change.target_table || '',
    target_id:      change.target_id || '',
    change_data:    safeJsonStringify_(change.data || {}),
    status:         CHANGE_STATUS.PENDING,
    approved_by:    '',
    decision_at:    '',
    decision_note:  '',
  }]);

  // Notify owners via Flex
  _notifyOwnersOfPendingChange_(changeId, change, ctx);

  logAudit({
    actor: ctx.userId,
    actor_role: resolveRole_(ctx),
    action: 'CHANGE_PROPOSED',
    target_type: 'pending_change',
    target_id: changeId,
    after: { type: change.type, target: change.target_id },
  });

  return { change_id: changeId, status: CHANGE_STATUS.PENDING };
}

/* ============================================================
 * List
 * ============================================================ */

function listPendingChanges_(ctx) {
  requireRole_(ctx, ROLES.HR);
  const rows = readTab_(getPublicSheet_(), 'Pending_Changes');
  return rows
    .filter(r => r.status === CHANGE_STATUS.PENDING)
    .map(r => ({
      change_id: r.change_id,
      proposed_by: r.proposed_by,
      proposed_role: r.proposed_role,
      proposed_at: r.proposed_at,
      change_type: r.change_type,
      target_table: r.target_table,
      target_id: r.target_id,
      change_data: safeJsonParse_(r.change_data, {}),
    }));
}

/* ============================================================
 * Approve / Reject
 * ============================================================ */

function approvePendingChange_(changeId, ctx, note) {
  return _decideChange_(changeId, ctx, CHANGE_STATUS.APPROVED, note || '');
}

function rejectPendingChange_(changeId, ctx, note) {
  return _decideChange_(changeId, ctx, CHANGE_STATUS.REJECTED, note || '');
}

function _decideChange_(changeId, ctx, decision, note) {
  // Only OWNER can decide on changes (HR can propose but not approve)
  requireRole_(ctx, ROLES.OWNER);
  if (!changeId) throw new Error('missing_change_id');

  const rows = readTab_(getPublicSheet_(), 'Pending_Changes');
  const change = rows.find(r => String(r.change_id) === String(changeId));
  if (!change) throw new Error('change_not_found');
  if (change.status !== CHANGE_STATUS.PENDING) {
    throw new Error('change_already_decided');
  }

  const now = new Date();
  updateRowByKey_(getPublicSheet_(), 'Pending_Changes', 'change_id', changeId, {
    status: decision,
    approved_by: ctx.userId,
    decision_at: formatDatetime_(now),
    decision_note: note,
  });

  let applyResult = null;
  if (decision === CHANGE_STATUS.APPROVED) {
    const handler = _changeHandlers[change.change_type];
    if (handler) {
      try {
        applyResult = handler(change, ctx);
      } catch (err) {
        logError('_decideChange_::apply', err, { changeId, type: change.change_type });
        // Mark as approved-but-failed for follow-up
        updateRowByKey_(getPublicSheet_(), 'Pending_Changes', 'change_id', changeId, {
          decision_note: note + ' [apply_failed: ' + String(err.message || err) + ']',
        });
        throw err;
      }
    }
  }

  // Notify proposer
  _notifyProposerOfDecision_(change, decision, note);

  logAudit({
    actor: ctx.userId,
    actor_role: resolveRole_(ctx),
    action: 'CHANGE_' + decision.toUpperCase(),
    target_type: 'pending_change',
    target_id: changeId,
    after: { type: change.change_type, note },
  });

  return { change_id: changeId, status: decision, applied: decision === CHANGE_STATUS.APPROVED, result: applyResult };
}

/* ============================================================
 * Notifications
 * ============================================================ */

function _notifyOwnersOfPendingChange_(changeId, change, ctx) {
  try {
    const proposerName = lookupEmpCodeByUserId(ctx.userId) || ctx.userId;
    const flex = buildApprovalFlex(
      'คำขออนุมัติใหม่',
      [
        { label: 'ประเภท', value: _humanChangeType_(change.type) },
        { label: 'รหัส', value: changeId },
        { label: 'จาก', value: proposerName },
        { label: 'รายละเอียด', value: _summarizeChangeData_(change.data || {}) },
      ],
      `action=approve_change&change_id=${encodeURIComponent(changeId)}`
    );
    pushToAllOwners([
      { type: 'flex', altText: 'มีคำขออนุมัติใหม่: ' + changeId, contents: flex },
    ]);
  } catch (err) {
    logError('_notifyOwnersOfPendingChange_', err, { changeId });
  }
}

function _notifyProposerOfDecision_(change, decision, note) {
  try {
    if (!change.proposed_by) return;
    const text = decision === CHANGE_STATUS.APPROVED
      ? `✅ คำขอ ${_humanChangeType_(change.change_type)} ของคุณได้รับการอนุมัติแล้ว`
      : `❌ คำขอ ${_humanChangeType_(change.change_type)} ของคุณถูกปฏิเสธ${note ? '\nเหตุผล: ' + note : ''}`;
    pushText(change.proposed_by, text);
  } catch (err) {
    logError('_notifyProposerOfDecision_', err);
  }
}

function _humanChangeType_(type) {
  const map = {
    repair_request: 'ขอผูกบัญชี LINE ใหม่',
  };
  return map[type] || type;
}

function _summarizeChangeData_(data) {
  if (!data || typeof data !== 'object') return '';
  const parts = [];
  Object.keys(data).slice(0, 3).forEach(k => {
    const val = String(data[k]).substring(0, 50);
    parts.push(`${k}: ${val}`);
  });
  return parts.join(' · ');
}
