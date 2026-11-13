#!/usr/bin/env bash
# Commits any pending changes. Never pushes (the user pushes manually).
set -u
cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}" || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

git add -A
git diff --cached --quiet && exit 0

files=$(git diff --cached --name-only)
count=$(printf '%s\n' "$files" | wc -l)
if [ "$count" -le 3 ]; then
  summary=$(printf '%s\n' "$files" | paste -sd, - | sed 's/,/, /g')
else
  summary="$count files"
fi

git commit -q -m "chore: auto-commit $summary" \
  -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" || true
exit 0
