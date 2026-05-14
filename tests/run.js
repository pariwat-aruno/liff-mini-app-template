#!/usr/bin/env node
/**
 * tests/run.js — Test runner
 *
 * Usage: node tests/run.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const files = fs.readdirSync(dir).filter(f => f.endsWith('.test.js'));

if (files.length === 0) {
  console.log('No .test.js files found.');
  process.exit(0);
}

let allPassed = true;
for (const f of files) {
  console.log('\n=== ' + f + ' ===');
  try {
    execSync(`node ${path.join(dir, f)}`, { stdio: 'inherit' });
  } catch (e) {
    allPassed = false;
  }
}

console.log('\n' + (allPassed ? '✅ All tests passed' : '❌ Some tests failed'));
process.exit(allPassed ? 0 : 1);
