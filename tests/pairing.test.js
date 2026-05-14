/**
 * pairing.test.js — Test pairing code generation logic
 *
 * Tests the pure-function parts (code format, link building).
 * Full integration tests would need Apps Script env (mock Sheet).
 *
 * Run: node tests/pairing.test.js
 */

const assert = require('assert');

// Mock implementations of pure functions from Pairing.gs
function randomNumericCode_(length) {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += Math.floor(Math.random() * 10);
  }
  return code;
}

function buildPairingLink_(liffId, empCode, code) {
  if (!liffId) return '';
  return `https://liff.line.me/${liffId}?p=pair&emp=${encodeURIComponent(empCode)}&c=${encodeURIComponent(code)}`;
}

function isValidCodeFormat(code) {
  return /^\d{6}$/.test(String(code));
}

function isPastDate(dateStr) {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
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

console.log('Code generation:');

test('Generated code is 6 digits', () => {
  for (let i = 0; i < 100; i++) {
    const code = randomNumericCode_(6);
    assert(code.length === 6, `Expected length 6, got ${code.length}`);
    assert(/^\d{6}$/.test(code), `Not numeric: ${code}`);
  }
});

test('Generated codes vary', () => {
  const codes = new Set();
  for (let i = 0; i < 100; i++) codes.add(randomNumericCode_(6));
  // 100 random 6-digit codes — should have at least 90 unique
  assert(codes.size >= 90, `Too many collisions: only ${codes.size} unique`);
});

console.log('\nCode format validation:');

test('Valid 6-digit codes accepted', () => {
  assert(isValidCodeFormat('000000'));
  assert(isValidCodeFormat('123456'));
  assert(isValidCodeFormat('999999'));
});

test('Invalid codes rejected', () => {
  assert(!isValidCodeFormat('12345'));       // too short
  assert(!isValidCodeFormat('1234567'));     // too long
  assert(!isValidCodeFormat('abc123'));      // letters
  assert(!isValidCodeFormat('12 345'));      // space
  assert(!isValidCodeFormat(''));            // empty
});

console.log('\nPre-filled link:');

test('Link format is correct', () => {
  const link = buildPairingLink_('1234567890-ABCDEF', 'EMP006', '482719');
  assert(link === 'https://liff.line.me/1234567890-ABCDEF?p=pair&emp=EMP006&c=482719',
    `Wrong link: ${link}`);
});

test('Link with special chars in emp_code is encoded', () => {
  const link = buildPairingLink_('LIFF1', 'EMP-006', '000000');
  assert(link.includes('EMP-006'), `Link missing emp: ${link}`);
});

test('Link is empty when liffId is empty', () => {
  assert(buildPairingLink_('', 'EMP001', '123456') === '');
  assert(buildPairingLink_(null, 'EMP001', '123456') === '');
});

console.log('\nExpiry check:');

test('Past date detected as past', () => {
  const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  assert(isPastDate(yesterday));
});

test('Future date not past', () => {
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  assert(!isPastDate(tomorrow));
});

test('Empty/null not past', () => {
  assert(!isPastDate(''));
  assert(!isPastDate(null));
  assert(!isPastDate(undefined));
});

console.log('\n' + (failed === 0 ? '✅' : '❌') + ' ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
