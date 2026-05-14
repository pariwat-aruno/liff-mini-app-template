# LIFF Mini-App Template (4-Role)

> Production-ready template for building LIFF mini-apps with a hierarchical
> 4-role permission system, account pairing flow, and universal approval queue.

[![Use this template](https://img.shields.io/badge/Use%20this-template-2ea44f?style=for-the-badge&logo=github)](../../generate)

---

## What's Included

- **4-role hierarchy** — Visitor / Staff / HR / Owner with capability-based UI
- **Account pairing module** — 6-digit codes, pre-filled LIFF links, TTL, re-pair flow
- **Universal approval queue** — extensible propose-approve pattern
- **8 standard Sheet tabs** — auto-created via `setupAll()`
- **Role-aware home page** — menu items render based on capabilities
- **LINE webhook handler** — text commands, postback for Flex buttons
- **Audit log + system logs** — separate, append-only
- **Drive file storage** — selfie/evidence/profile/misc subfolders
- **Rate limiting** — per-user + per-code brute force protection
- **CORS-safe API client** — `text/plain` trick for Apps Script
- **GitHub Actions** — auto-deploy frontend on push
- **Tests** — 18 unit tests for foundation logic

---

## Quick Start

### 1. Use this template

Click **"Use this template"** above → create your own repo.

### 2. Clone + customize

```bash
git clone https://github.com/<your-username>/<your-repo>.git
cd <your-repo>
./scripts/apply_template.sh "My Brand" "My tagline"
```

### 3. Follow setup guide

See [`docs/SETUP_GUIDE.md`](docs/SETUP_GUIDE.md) for the full 14-step deployment.

In short:
1. Create LINE channel + LIFF
2. `cd apps-script && npm install && npx clasp create`
3. `clasp push` + run `setupProperties()` + `setupAll()` in editor
4. Deploy as Web App
5. Update `frontend/src/js/config.js`
6. Push to GitHub — Actions deploys Pages automatically

---

## Project Structure

```
apps-script/          Backend (Google Apps Script via clasp)
frontend/src/         GitHub Pages root (LIFF)
docs/                 Documentation (read these!)
scripts/              Helper scripts (rich menu, template apply)
tests/                Unit tests (run: node tests/run.js)
CLAUDE.md             ★ Read first if using Claude Code
```

---

## Documentation

| File | What's inside |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Context for AI coding agents — patterns, constraints, what not to do |
| [`docs/ROLES.md`](docs/ROLES.md) | Role hierarchy, capabilities, authorization enforcement |
| [`docs/PAIRING.md`](docs/PAIRING.md) | Pairing module — locked defaults + 3 flows |
| [`docs/APPROVAL_PATTERNS.md`](docs/APPROVAL_PATTERNS.md) | Universal propose-approve queue |
| [`docs/SHEET_SCHEMA.md`](docs/SHEET_SCHEMA.md) | 8 universal tabs + project extension |
| [`docs/SETUP_GUIDE.md`](docs/SETUP_GUIDE.md) | Step-by-step deployment from zero |

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | GitHub Pages + vanilla HTML/JS + LIFF SDK |
| Backend | Google Apps Script Web App |
| Database | Google Sheet (8 tabs) + Drive (optional) |
| Auth | LINE Login (LIFF idToken) |
| CI/CD | GitHub Actions |

No npm packages in frontend. No build step. Just push and it works.

---

## Tests

```bash
cd tests
node run.js
```

```
✓ Generated code is 6 digits
✓ Generated codes vary
✓ Valid 6-digit codes accepted
... 18 tests passing
```

---

## Customizing for Your Project

After applying the template, your work is:

1. **Rename** `apps-script/_Domain.gs.template` → `<YourDomain>.gs`
2. **Add project tabs** in `Setup.gs::UNIVERSAL_TABS` (extend the array)
3. **Add API actions** in your domain `.gs` + register in `Code.gs::HANDLERS`
4. **Add menu cards** in `frontend/src/js/menu-config.js`
5. **Add capabilities** via `_projectCapabilities_(role)` hook
6. **Create feature pages** under `frontend/src/`

Foundation files (Roles, Pairing, PendingChanges, etc.) are reusable across
projects — **don't modify them**.

---

## Multi-Tenant

Frontend is shared across tenants via URL params:

```
https://<your-username>.github.io/<your-repo>/?backend=<their-apps-script-url>
```

Each tenant has their own Apps Script + Sheet + Drive. See `CLAUDE.md` for details.

---

## License

MIT — see [LICENSE](LICENSE)
