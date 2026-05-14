/**
 * config.js — Project configuration (REPLACE PLACEHOLDERS)
 *
 * For multi-tenant deployments, leave LIFF_ID and API_URL empty here
 * and pass them via URL parameters:
 *   https://liff.line.me/<id>?backend=<apps-script-url>
 *
 * For single-tenant (this project only), hardcode them below.
 */

window.PAYROLL_CONFIG = {
  // LIFF apps — paste your LIFF IDs after creating them in LINE Developers
  LIFF_ID: '',  // ← e.g. '2010019987-1USGaEEO'

  // Apps Script Web App URL (the /exec one)
  // Leave empty for multi-tenant — pass via ?backend= URL param
  API_URL: '',  // ← e.g. 'https://script.google.com/macros/s/AKfy.../exec'

  // Brand
  BRAND_NAME: '[BRAND_NAME]',
  BRAND_TAGLINE: '[TAGLINE]',

  // Development mode (auto-detected by liff-bridge.js)
  // When true, uses a mock LIFF profile so pages work in regular browser
  DEV_MOCK: false,
};
