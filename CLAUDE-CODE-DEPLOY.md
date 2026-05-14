# CLAUDE-CODE-DEPLOY.md

> **For Claude Code:** Read this and execute the steps below.
> User wants to push this template to GitHub as a public template repository.

---

## Goal

Create a new GitHub repo called `liff-mini-app-template` from these files,
push the code, and enable it as a GitHub template repository.

---

## Pre-flight checks

Before starting, verify:

```bash
# 1. gh CLI installed
gh --version

# 2. gh CLI authenticated
gh auth status

# 3. git configured
git config user.name
git config user.email

# 4. We're in the right directory (should see CLAUDE.md, apps-script/, frontend/, etc.)
ls
```

If any check fails:
- gh not installed → `brew install gh` (macOS) or see https://cli.github.com/
- Not authenticated → `gh auth login`
- git not configured → ask user for name + email

---

## Step-by-step deployment

### Step 1 — Confirm with user

Show the user what you're about to do:

```
I'm about to:
  1. Initialize git in this folder
  2. Create a new PUBLIC GitHub repo: liff-mini-app-template
  3. Push all code to main branch
  4. Enable it as a template repository
  5. Enable GitHub Pages with "GitHub Actions" source

Proceed? (yes/no)
```

Wait for confirmation. If user says no, stop.

### Step 2 — Initialize git

```bash
# If .git doesn't exist:
git init -b main
git add .
git status   # Show what's being committed
git commit -m "Initial commit: LIFF mini-app template v1.0

Foundation:
- 4-role hierarchy (Visitor/Staff/HR/Owner)
- Pairing module (6-digit codes, pre-filled links, re-pair flow)
- Universal approval queue (PendingChanges pattern)
- 8 universal Sheet tabs
- LINE webhook + Flex approval cards
- CORS-safe API client
- 18 passing unit tests"
```

### Step 3 — Create GitHub repo

```bash
gh repo create liff-mini-app-template \
  --public \
  --description "Production-ready LIFF mini-app template with 4-role permission system, pairing flow, and approval queue" \
  --source=. \
  --remote=origin \
  --push
```

**If user wants private**, replace `--public` with `--private`.

This command does git push automatically.

### Step 4 — Mark as template

```bash
gh repo edit --template
```

Verify:

```bash
gh repo view --json isTemplate -q .isTemplate
# Should output: true
```

### Step 5 — Enable GitHub Pages

```bash
# Set source to GitHub Actions
gh api -X POST /repos/:owner/:repo/pages \
  -f "source[branch]=main" \
  -f "source[path]=/" \
  -f "build_type=workflow" \
  || gh api -X PUT /repos/:owner/:repo/pages \
       -f "build_type=workflow"
```

(If the create call fails because Pages already exists, the PUT fallback updates it.)

### Step 6 — Verify deployment

```bash
# Watch the Pages workflow
gh run watch

# Or list recent runs
gh run list --workflow=pages.yml --limit 3
```

### Step 7 — Show user the URLs

After everything succeeds, output:

```
✅ Done!

Repository: https://github.com/<owner>/liff-mini-app-template
Template URL: https://github.com/<owner>/liff-mini-app-template/generate
Pages URL: https://<owner>.github.io/liff-mini-app-template/

To use the template for a new project:
  1. Visit the Template URL
  2. Click "Create a new repository"
  3. Or run: gh repo create my-new-project --template <owner>/liff-mini-app-template

Next: see docs/SETUP_GUIDE.md for deploying a project from this template.
```

---

## Troubleshooting

### "gh: command not found"
User needs to install GitHub CLI: https://cli.github.com/

### "fatal: not a git repository"
Already handled — `git init -b main` in Step 2 creates it.

### "remote origin already exists"
```bash
git remote remove origin
# Then retry gh repo create
```

### "repository already exists"
Either:
- User already created it → run `git remote add origin <url>` + `git push -u origin main`
- Pick a different name → ask user

### Pages 404 after deploy
- Check Actions tab: https://github.com/<owner>/liff-mini-app-template/actions
- May take 1-2 min after first push
- Verify `Settings → Pages → Source = GitHub Actions`

### gh auth scope issue
If `gh repo edit --template` fails with "missing scope":
```bash
gh auth refresh -s admin:repo_hook,repo
```

---

## What NOT to do

- ❌ Don't run `clasp create-deployment` from this script — that's user's task per-project
- ❌ Don't push secrets (the .gitignore handles this, but double-check `git status` in Step 2)
- ❌ Don't modify the actual code in this folder — user will customize per-project after using the template
- ❌ Don't ask user for their GitHub username — `gh` already knows it

---

## After this is done

The user will use the template like this:

```bash
# Click "Use this template" on GitHub
# OR:
gh repo create my-actual-project --template <owner>/liff-mini-app-template

# Clone the new repo
git clone https://github.com/<owner>/my-actual-project.git
cd my-actual-project

# Customize for their project
./scripts/apply_template.sh "Their Brand" "Their tagline"

# Then they invoke Claude Code (or do it themselves) to:
# - Create LINE channel + LIFF
# - Set up Apps Script
# - Configure Properties
# - Deploy Web App
# - Update config.js
# - Push to GitHub → Pages deploys automatically

# See docs/SETUP_GUIDE.md for the full flow.
```

You don't need to do those steps now — just push this template repo.
