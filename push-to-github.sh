#!/usr/bin/env bash
# Commits the CarryBee tracker and pushes it to GitHub main.
# Pushing to main deploys to the live site. Run this from inside the carrybee-tracker folder.
set -euo pipefail

REMOTE_URL="https://github.com/asifrashid-debug/carrybee-issue-escalation.git"
MSG="Hub lookup, light theme, tab navigation, design v3"

if [ ! -f package.json ] || [ ! -d components ]; then
  echo "Run this script from the carrybee-tracker folder."
  exit 1
fi

if [ -z "$(git config user.name || true)" ] || [ -z "$(git config user.email || true)" ]; then
  echo "Set your Git identity first:"
  echo '  git config user.name "Your Name"'
  echo '  git config user.email "your.email@carrybee.com"'
  exit 1
fi

echo "Changes to be included:"
git status --short
echo
read -r -p "Push these changes to GitHub main? This goes live. [y/N] " ans
if [ "$ans" != "y" ] && [ "$ans" != "Y" ]; then
  echo "Cancelled. Nothing was pushed."
  exit 0
fi

git remote get-url origin >/dev/null 2>&1 || git remote add origin "$REMOTE_URL"

git add -A
# Stop if a secret file (.env or .env.local) is about to be committed. .env.example is allowed.
if git diff --cached --name-only | grep -qE '(^|/)\.env(\.[a-z]+)?\.local$|(^|/)\.env$'; then
  echo "A secret .env file is staged. Remove it from the commit and run again."
  git reset -q
  exit 1
fi

git diff --cached --quiet || git commit -m "$MSG"

git fetch origin
git pull --no-rebase origin main --allow-unrelated-histories -X ours --no-edit
git push origin HEAD:main

echo
echo "Pushed. Open the Vercel project's Deployments page and wait for the new build to show Ready."
