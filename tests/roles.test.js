/**
 * roles.test.js — Test ROLES hierarchy + capability check
 *
 * Pure-function tests for the role logic that doesn't need Sheet access.
 * Run: node tests/roles.test.js
 */

const assert = require('assert');

// Mock the foundation by inlining the pure-function parts of Roles.gs
const ROLES = Object.freeze({
  VISITOR: 'visitor',
  STAFF:   'staff',
  HR:      'hr',
  OWNER:   'owner',
});

const ROLE_HIERARCHY = [ROLES.VISITOR, ROLES.STAFF, ROLES.HR, ROLES.OWNER];

function hasCapability_(capabilities, requested) {
  if (!Array.isArray(capabilities)) return false;
  if (capabilities.includes('*')) return true;
  if (capabilities.includes(requested)) return true;
  for (const cap of capabilities) {
    if (cap.endsWith('.*') && requested.startsWith(cap.slice(0, -1))) return true;
  }
  return false;
}

function meetsMinRole(currentRole, minRole) {
  return ROLE_HIERARCHY.indexOf(currentRole) >= ROLE_HIERARCHY.indexOf(minRole);
}

/* ============================================================
 * Tests
 * ============================================================ */

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log('  ✓ ' + name);
    passed++;
  } catch (err) {
    console.log('  ✗ ' + name);
    console.log('    ' + err.message);
    failed++;
  }
}

console.log('Role hierarchy:');

test('OWNER meets all minRoles', () => {
  assert(meetsMinRole(ROLES.OWNER, ROLES.VISITOR));
  assert(meetsMinRole(ROLES.OWNER, ROLES.STAFF));
  assert(meetsMinRole(ROLES.OWNER, ROLES.HR));
  assert(meetsMinRole(ROLES.OWNER, ROLES.OWNER));
});

test('HR meets STAFF and VISITOR but not OWNER', () => {
  assert(meetsMinRole(ROLES.HR, ROLES.VISITOR));
  assert(meetsMinRole(ROLES.HR, ROLES.STAFF));
  assert(meetsMinRole(ROLES.HR, ROLES.HR));
  assert(!meetsMinRole(ROLES.HR, ROLES.OWNER));
});

test('STAFF meets only VISITOR and STAFF', () => {
  assert(meetsMinRole(ROLES.STAFF, ROLES.VISITOR));
  assert(meetsMinRole(ROLES.STAFF, ROLES.STAFF));
  assert(!meetsMinRole(ROLES.STAFF, ROLES.HR));
  assert(!meetsMinRole(ROLES.STAFF, ROLES.OWNER));
});

test('VISITOR meets only VISITOR', () => {
  assert(meetsMinRole(ROLES.VISITOR, ROLES.VISITOR));
  assert(!meetsMinRole(ROLES.VISITOR, ROLES.STAFF));
  assert(!meetsMinRole(ROLES.VISITOR, ROLES.HR));
  assert(!meetsMinRole(ROLES.VISITOR, ROLES.OWNER));
});

console.log('\nCapabilities:');

test('Wildcard * matches anything', () => {
  assert(hasCapability_(['*'], 'anything'));
  assert(hasCapability_(['*'], 'hr.list'));
  assert(hasCapability_(['*'], 'mydomain.foo.bar'));
});

test('Exact match works', () => {
  assert(hasCapability_(['pair', 'self.profile'], 'pair'));
  assert(hasCapability_(['pair', 'self.profile'], 'self.profile'));
  assert(!hasCapability_(['pair'], 'repair'));
});

test('Prefix wildcard hr.* matches hr.list, hr.review', () => {
  assert(hasCapability_(['hr.*'], 'hr.list'));
  assert(hasCapability_(['hr.*'], 'hr.review'));
  assert(hasCapability_(['hr.*'], 'hr.something.nested'));
  assert(!hasCapability_(['hr.*'], 'staff.something'));
});

test('Empty/invalid capabilities array', () => {
  assert(!hasCapability_([], 'anything'));
  assert(!hasCapability_(null, 'anything'));
  assert(!hasCapability_(undefined, 'anything'));
});

console.log('\n' + (failed === 0 ? '✅' : '❌') + ' ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
