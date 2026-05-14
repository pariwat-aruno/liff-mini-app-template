/**
 * Onboarding.gs — Employee onboarding + unpair (FOUNDATION)
 *
 * onboardEmployee_(payload, ctx)  HR/OWNER
 *   1. Validate input
 *   2. Append Employees row (line_user_id stays empty)
 *   3. Generate pairing code (Pairing.gs)
 *   4. Return code + pre-filled LIFF link
 *
 * unpairEmployee_(empCode, ctx)   OWNER (typically called via approve_repair)
 *   1. Remove User_Map row
 *   2. Invalidate caches
 *
 * listEmployees_(ctx)             HR/OWNER
 *   Quick read with role badges
 */

/**
 * Onboard a new employee.
 * Minimum fields: emp_code, first_name, last_name, intended_role
 */
function onboardEmployee_(payload, ctx) {
  requireRole_(ctx, ROLES.HR);
  if (!payload) throw new Error('missing_payload');

  const empCode = String(payload.emp_code || '').trim().toUpperCase();
  const firstName = String(payload.first_name || '').trim();
  const lastName = String(payload.last_name || '').trim();
  const intendedRole = String(payload.intended_role || ROLES.STAFF).toLowerCase();

  // Validation
  if (!empCode) throw new Error('missing_emp_code');
  if (!/^[A-Z][A-Z0-9_-]{1,}$/.test(empCode)) throw new Error('invalid_emp_code_format');
  if (!firstName || !lastName) throw new Error('missing_name');
  if (!ROLE_HIERARCHY.includes(intendedRole) || intendedRole === ROLES.VISITOR) {
    throw new Error('invalid_intended_role');
  }

  // Only OWNER can onboard another OWNER or HR
  if (intendedRole === ROLES.OWNER || intendedRole === ROLES.HR) {
    requireRole_(ctx, ROLES.OWNER);
  }

  // Uniqueness check
  const employees = readTab_(getPublicSheet_(), 'Employees');
  if (employees.some(e => String(e.emp_code).toUpperCase() === empCode)) {
    throw new Error('emp_code_already_exists');
  }

  // Add to Employees
  appendRows_(getPublicSheet_(), 'Employees', [{
    emp_code:      empCode,
    first_name:    firstName,
    last_name:     lastName,
    nickname:      payload.nickname || '',
    email:         payload.email || '',
    phone:         payload.phone || '',
    department:    payload.department || '',
    position:      payload.position || '',
    intended_role: intendedRole,
    status:        'active',
    start_date:    payload.start_date || todayBangkok(),
    note:          payload.note || '',
    created_at:    formatDatetime_(new Date()),
    created_by:    ctx.userId,
  }]);

  // Generate pairing code
  const codeResult = generatePairingCode_(empCode, ctx);

  logAudit({
    actor: ctx.userId,
    actor_role: resolveRole_(ctx),
    action: 'EMPLOYEE_ONBOARDED',
    target_type: 'employee',
    target_id: empCode,
    after: {
      name: `${firstName} ${lastName}`,
      intended_role: intendedRole,
      department: payload.department || '',
    },
  });

  return {
    emp_code: empCode,
    full_name: `${firstName} ${lastName}`,
    intended_role: intendedRole,
    pairing_code: codeResult.code,
    expires_in_hours: codeResult.expires_in_hours,
    liff_link: codeResult.liff_link,
  };
}

/**
 * Unpair an employee (remove User_Map entry).
 * Typically called via approveRepairRequest_, but exposed for manual use.
 */
function unpairEmployee_(empCode, ctx) {
  requireRole_(ctx, ROLES.OWNER);
  if (!empCode) throw new Error('missing_emp_code');
  empCode = String(empCode).toUpperCase();

  const map = readTab_(getPublicSheet_(), 'User_Map');
  const row = map.find(r => String(r.emp_code).toUpperCase() === empCode);
  if (!row) throw new Error('employee_not_paired');

  deleteRowByKey_(getPublicSheet_(), 'User_Map', 'emp_code', empCode);
  invalidateUserMapCache_(row.line_user_id, empCode);

  logAudit({
    actor: ctx.userId,
    actor_role: resolveRole_(ctx),
    action: 'EMPLOYEE_UNPAIRED',
    target_type: 'employee',
    target_id: empCode,
    before: { line_user_id: row.line_user_id, role: row.role },
  });

  return { ok: true, emp_code: empCode };
}

/**
 * List employees with their pairing status.
 */
function listEmployees_(ctx) {
  requireRole_(ctx, ROLES.HR);
  const employees = readTab_(getPublicSheet_(), 'Employees');
  const map = readTab_(getPublicSheet_(), 'User_Map');
  const userMap = {};
  map.forEach(r => { userMap[String(r.emp_code).toUpperCase()] = r; });

  return employees.map(e => {
    const paired = userMap[String(e.emp_code).toUpperCase()];
    return {
      emp_code: e.emp_code,
      first_name: e.first_name,
      last_name: e.last_name,
      department: e.department,
      position: e.position,
      intended_role: e.intended_role,
      status: e.status,
      paired: !!paired,
      paired_role: paired ? paired.role : null,
    };
  });
}
