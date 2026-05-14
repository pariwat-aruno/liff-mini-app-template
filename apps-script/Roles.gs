/**
 * Roles.gs — Role hierarchy + access control (FOUNDATION · DO NOT MODIFY)
 *
 * Single source of truth for the 4-role system:
 *   VISITOR < STAFF < HR < OWNER
 *
 * Usage:
 *   const role = resolveRole_(ctx);
 *   if (hasRole_(ctx, ROLES.HR)) { ... }
 *   requireRole_(ctx, ROLES.OWNER);  // throws if not authorized
 *
 * Role determination:
 *   - VISITOR: no entry in User_Map (not paired yet)
 *   - STAFF/HR/OWNER: determined by User_Map.role column
 */

const ROLES = Object.freeze({
  VISITOR: 'visitor',
  STAFF:   'staff',
  HR:      'hr',
  OWNER:   'owner',
});

// Ordered hierarchy — index = privilege level
const ROLE_HIERARCHY = [ROLES.VISITOR, ROLES.STAFF, ROLES.HR, ROLES.OWNER];

/**
 * Resolve role from request context.
 * @param {object} ctx - { userId, empCode } from doPost
 * @returns {string} one of ROLES.*
 */
function resolveRole_(ctx) {
  if (!ctx || !ctx.userId) return ROLES.VISITOR;
  if (!ctx.empCode) return ROLES.VISITOR;

  try {
    const map = readTab_(getPublicSheet_(), 'User_Map');
    const row = map.find(r => String(r.line_user_id) === String(ctx.userId));
    if (!row) return ROLES.VISITOR;

    const role = String(row.role || '').toLowerCase();
    if (ROLE_HIERARCHY.includes(role)) return role;
    return ROLES.STAFF; // safe default for paired users
  } catch (err) {
    logError('resolveRole_', err);
    return ROLES.VISITOR;
  }
}

/**
 * Check if context has at least the minimum role.
 * @param {object} ctx
 * @param {string} minRole - one of ROLES.*
 * @returns {boolean}
 */
function hasRole_(ctx, minRole) {
  const current = resolveRole_(ctx);
  return ROLE_HIERARCHY.indexOf(current) >= ROLE_HIERARCHY.indexOf(minRole);
}

/**
 * Throw if context does not have minimum role.
 * Use at the start of any privileged operation.
 * @param {object} ctx
 * @param {string} minRole
 * @throws Error('forbidden_<role>_required')
 */
function requireRole_(ctx, minRole) {
  if (!hasRole_(ctx, minRole)) {
    throw new Error('forbidden_' + minRole + '_required');
  }
}

/**
 * Return list of capabilities for a given role.
 * Frontend uses this to render UI conditionally.
 * Extend this in project-specific code via _projectCapabilities_.
 */
function capabilitiesForRole_(role) {
  const base = {
    visitor: ['pair', 'repair'],
    staff:   ['pair', 'repair', 'self.profile'],
    hr:      ['pair', 'repair', 'self.profile', 'hr.propose', 'hr.viewPending'],
    owner:   ['*'],
  };
  const caps = base[role] ? base[role].slice() : [];

  // Allow project-specific extension
  try {
    if (typeof _projectCapabilities_ === 'function') {
      const extra = _projectCapabilities_(role) || [];
      extra.forEach(c => { if (!caps.includes(c)) caps.push(c); });
    }
  } catch (_) { /* optional hook */ }

  return caps;
}

/**
 * Check if a capability is included in a list.
 * Supports '*' (all) and prefix matching with '.*' (e.g. 'hr.*').
 */
function hasCapability_(capabilities, requested) {
  if (!Array.isArray(capabilities)) return false;
  if (capabilities.includes('*')) return true;
  if (capabilities.includes(requested)) return true;
  // Prefix wildcard: 'hr.*' matches 'hr.propose', 'hr.viewPending'
  for (const cap of capabilities) {
    if (cap.endsWith('.*') && requested.startsWith(cap.slice(0, -1))) return true;
  }
  return false;
}
