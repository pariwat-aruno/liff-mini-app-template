# CLAUDE.md — Read this first

> **Context document for Claude Code working on this repo.**
> Read this before making any changes.

---

## What is this

A **template** for building LIFF (LINE Front-end Framework) mini-apps with a
**4-role permission system** (Visitor / Staff / HR / Owner).

**Stack:**
- Frontend: GitHub Pages + vanilla HTML/JS + LIFF SDK
- Backend: Google Apps Script Web App
- Database: Google Sheet (8 universal tabs)
- Storage: Google Drive (optional)
- Auth: LINE Login (LIFF idToken)
- CI/CD: GitHub Actions (Pages auto-deploy)

---

## Project Structure

```
/
├── apps-script/              # Backend (clasp push)
│   ├── Code.gs               # Router + handler registry
│   ├── Roles.gs              # ⭐ 4-role hierarchy (FOUNDATION)
│   ├── Auth.gs               # LIFF idToken verification
│   ├── Pairing.gs            # ⭐ Pairing module (FOUNDATION)
│   ├── PendingChanges.gs     # ⭐ Universal approval queue (FOUNDATION)
│   ├── Onboarding.gs         # Onboard + unpair
│   ├── Setup.gs              # setupAll + healthCheck + seed
│   ├── Config.gs             # Properties + Settings
│   ├── Utils.gs              # Date/Sheet helpers
│   ├── Logger.gs             # Logs + Audit
│   ├── LineApi.gs            # LINE Messaging API
│   ├── DriveStore.gs         # Drive upload
│   ├── WebApp.gs             # Webhook handler
│   └── _Domain.gs.template   # Stub for business logic (RENAME ME)
│
├── frontend/src/             # GitHub Pages root
│   ├── index.html            # Role-aware home
│   ├── pair.html             # Initial pairing
│   ├── repair.html           # Self-service re-pair
│   ├── myid.html             # Show LINE userId (fallback)
│   ├── admin.html            # HR/Owner inbox
│   ├── onboard.html          # Owner adds new employee
│   ├── css/style.css
│   └── js/
│       ├── config.js         # LIFF_IDs + API_URL
│       ├── auth.js           # LIFF wrapper
│       ├── api.js            # CORS-safe POST helper
│       ├── menu-config.js    # ⭐ Declarative menu
│       └── utils.js
│
├── docs/                     # Documentation
│   ├── ROLES.md
│   ├── PAIRING.md
│   ├── APPROVAL_PATTERNS.md
│   ├── SHEET_SCHEMA.md
│   └── SETUP_GUIDE.md
│
├── scripts/
│   ├── setup_rich_menu.py
│   └── apply_template.sh
│
├── tests/
│   ├── run.js
│   ├── roles.test.js
│   └── pairing.test.js
│
└── .github/workflows/pages.yml
```

---

## Foundation vs Project-specific

### 🔒 Foundation files — DO NOT MODIFY

These implement the core 4-role + pairing system. Don't change unless you
**really** know what you're doing:

```
apps-script/Roles.gs            (role enum + requireRole_)
apps-script/Auth.gs             (verifyIdToken)
apps-script/Pairing.gs          (full pairing module)
apps-script/PendingChanges.gs   (universal queue)
apps-script/Code.gs             (router — but can ADD to HANDLERS)
apps-script/Setup.gs            (universal tabs)
apps-script/Config.gs / Utils.gs / Logger.gs / LineApi.gs / DriveStore.gs

frontend/src/js/api.js          (CORS workaround — DON'T CHANGE)
frontend/src/js/auth.js
frontend/src/js/menu-config.js  (but can ADD items)
frontend/src/pair.html / repair.html / myid.html

.github/workflows/pages.yml
apps-script/appsscript.json
```

### ✏️ Project-specific — customize freely

```
apps-script/_Domain.gs.template → rename to <YourDomain>.gs
apps-script/Setup.gs (the SHEET_HEADERS array — add project tabs)
frontend/src/index.html (the menu cards — but use menu-config.js instead)
frontend/src/admin.html (add project sections)
frontend/src/onboard.html (project-specific fields)
frontend/src/<flow>.html (create new feature pages)
frontend/src/js/config.js (LIFF_ID + API_URL)
```

---

## Core Patterns to Use

### 1. Adding a new API action

```javascript
// 1. Implement in <Domain>.gs
function myAction_(payload, ctx) {
  requireRole_(ctx, ROLES.STAFF);  // explicit role check
  // your logic...
  return { ok: true, result: '...' };
}

// 2. Register in Code.gs HANDLERS map
const HANDLERS = {
  // ...existing...
  myAction: { fn: myAction_, minRole: ROLES.STAFF },
};

// 3. Add wrapper in frontend/src/js/api.js
const myAction = (idToken, payload) => call('myAction', payload, idToken);
window.Api.myAction = myAction;
```

### 2. Adding a new approval flow

```javascript
// 1. Register the apply handler
registerChangeHandler_('my_change_type', function(change, ctx) {
  const data = safeJsonParse_(change.change_data, {});
  // apply the change...
  return { ok: true };
});

// 2. Propose from user-facing endpoint
function submitMyThing_(payload, ctx) {
  requireRole_(ctx, ROLES.STAFF);
  return proposeChange_({
    type: 'my_change_type',
    target_id: ctx.empCode,
    data: payload,
  }, ctx);
}
```

### 3. Adding a menu card

```javascript
// frontend/src/js/menu-config.js
window.PAYROLL_MENU.push({
  id: 'mything',
  label: 'หน้าใหม่',
  subtitle: 'อธิบายสั้นๆ',
  icon: '🎯',
  color: 'teal',
  page: 'mything.html',
  requires: ['mything.access'],   // ← capability
  section: 'self',                 // visitor/self/hr/owner
});
```

### 4. Adding project capabilities

```javascript
// <Domain>.gs
function _projectCapabilities_(role) {
  return {
    staff: ['mything.access', 'mything.submit'],
    hr: ['mything.review'],
    owner: ['mything.*'],
  }[role] || [];
}
```

---

## Critical CORS Workaround — DON'T BREAK

Apps Script doesn't return CORS headers. We work around by:

```javascript
// frontend/src/js/api.js
headers: { 'Content-Type': 'text/plain;charset=utf-8' }
body: JSON.stringify(...)   // JSON as text
```

Backend (`Code.gs::doPost`) reads `e.postData.contents` and parses.
**Changing this to application/json will break everything in production.**

---

## Important Constraints

### Deployment

- **DO NOT** `clasp create-deployment` — bug in clasp 3.x resets access to "Only myself"
- Always deploy through Apps Script UI: Deploy → Manage → Edit existing
- `clasp push` is fine for code; UI for deployment config

### Properties

- **Never commit secrets** — use Script Properties (PropertiesService)
- Set via `setupProperties()` then **remove values** from the function before pushing

### Sheet schema

- 8 universal tabs are managed by `setupAll()` — idempotent
- Add project tabs in `<Domain>.gs::projectSetup_()`
- **Never** add money/salary columns to Public Sheet — use Secret Sheet

### Roles

- VISITOR is auto (no User_Map row)
- STAFF/HR/OWNER set via `User_Map.role` column
- Bootstrap owners via `Script Property OWNER_USER_IDS` (comma-separated)
- **Always** use `requireRole_(ctx, minRole)` in handlers
- Router enforces `minRole` automatically based on HANDLERS registry

---

## Tests

```bash
cd tests
node run.js
```

Tests use pure-function mocks (no Apps Script env needed).
Foundation has 18 tests in 2 files. Add tests for your business logic.

---

## When making changes

1. Read the relevant doc in `docs/`
2. Foundation files: **don't modify** unless really necessary
3. New endpoints: register in HANDLERS map with minRole
4. New flows: prefer using `proposeChange_` pattern if it needs approval
5. Run tests: `node tests/run.js`
6. For deployment: see `docs/SETUP_GUIDE.md`

---

## Things to NEVER do

- Change `frontend/src/js/api.js` CORS approach
- Bypass `requireRole_` or hardcode role check
- Add money/salary columns to Public Sheet
- Hardcode secrets in code
- Mix Public and Secret Sheet IDs in the same code path
- Skip audit log for mutating operations (router auto-audits — don't break it)
- Use `clasp create-deployment` (breaks access)

---

## Multi-tenant Pattern

This template supports multi-tenant via URL params:

```
https://liff.line.me/<liff-id>?backend=<apps-script-exec-url>&tenant=acme
```

Frontend (GitHub Pages) is shared across all tenants.
Each tenant has their own:
- LINE OA + LIFF channel
- Apps Script project (with own Sheet)
- Drive folder

To onboard a new tenant:
1. They create LINE channels themselves
2. You `clasp clone` from template Apps Script
3. Run `setupAll()` + `setupProperties()` in their copy
4. Deploy as Web App, give them the URL
5. They set LIFF endpoint = `https://<your-pages>/?backend=<their-exec-url>`
