#!/usr/bin/env bash
# Commits and pushes the phone hub-lookup solution to GitHub main. Vercel then builds and deploys production automatically.
# Run this on YOUR machine, inside your clone of carrybee-issue-escalation. It stages only the listed files
# (never "git add -A"), and it stops if anything is unexpected.
#
# Usage:  bash push-phone-hub-lookup.sh /path/to/carrybee-issue-escalation /path/to/carrybee-phone-hub-lookup.patch
set -euo pipefail

REPO="${1:?Usage: $0 <repo-dir> <phone-hub-lookup.patch>}"
PATCH="${2:?Usage: $0 <repo-dir> <phone-hub-lookup.patch>}"
BASE="2fcc3bc2b898a1ea44e7221139d504eac0c47648"
FILES=(.env.example components/EscalationForm.js lib/hubLookup.mjs lib/hubLookupServer.mjs app/api/hub-lookup/route.js tests/hubLookup.test.mjs tests/hubLookupServer.test.mjs MOBILE-SETUP.md)

cd "$REPO"
[ -f "$PATCH" ] || { echo "Patch not found: $PATCH"; exit 1; }

# 1. Right repo and branch
git rev-parse --is-inside-work-tree >/dev/null
ORIGIN="$(git remote get-url origin)"
case "$ORIGIN" in *asifrashid-debug/carrybee-issue-escalation*) ;; *) echo "origin is not the CarryBee repo: $ORIGIN"; exit 1;; esac
git checkout main
git pull --ff-only origin main

# 2. Identity must be set by you (the script does not invent one)
NAME="$(git config user.name || true)"; MAIL="$(git config user.email || true)"
[ -n "$NAME" ] && [ -n "$MAIL" ] || { echo "Set your identity first: git config user.name \"Your Name\"; git config user.email \"you@example.com\""; exit 1; }

# 3. Clean tree, and main must still be the base we tested (or a descendant of it)
[ -z "$(git status --porcelain)" ] || { echo "Working tree is not clean. Commit or stash your changes first."; git status --short; exit 1; }
git merge-base --is-ancestor "$BASE" HEAD || { echo "main does not contain the tested base $BASE. Stop and tell the agent."; exit 1; }

# 4. Apply the patch (dry run first)
git apply --check "$PATCH" || { echo "Patch does not apply cleanly to this main. Stop and tell the agent."; exit 1; }
git apply "$PATCH"

# 5. Build and test exactly what Vercel will build
npm ci --no-audit --no-fund
npm test
npx next build

# 6. Stage only the listed files
git add -- "${FILES[@]}"
git diff --cached --stat
git diff --cached --name-only | sort > /tmp/staged.txt
printf '%s\n' "${FILES[@]}" | sort > /tmp/expected.txt
cmp -s /tmp/staged.txt /tmp/expected.txt || { echo "Staged files are not the expected list. Nothing committed."; git reset -q; exit 1; }

# 7. Confirm, then commit and push
read -r -p "Push these files to GitHub main (production deploy follows)? Type yes: " ANS
[ "$ANS" = "yes" ] || { echo "Cancelled. Changes are staged but not committed."; exit 1; }
git commit -m "Phone solution: server-side hub lookup (no extension) for iPhone and Android, last-escalation fallback, tests and docs"
git push origin main
echo "Pushed. Now check Vercel: the production deployment should show this commit as READY."
