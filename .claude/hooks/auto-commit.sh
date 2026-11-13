#!/usr/bin/env bash
# Commits any pending changes. Never pushes (the user pushes manually).
set -u
cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}" || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

git add -A

# Never auto-commit anything that looks like a secret; unstage it instead.
secret_re='(^|/)(\.env[^/]*|id_[^/]*|[^/]*\.(pem|key|p12|pfx|sqlite3?|db)|[^/]*(credential|secret|cookie|session)[^/]*)$'
git diff --cached --name-only | grep -Ei "$secret_re" | while IFS= read -r f; do
  git reset -q HEAD -- "$f"
  echo "auto-commit: skipped possible secret: $f" >&2
done

git diff --cached --quiet && exit 0

files=$(git diff --cached --name-only)
count=$(printf '%s\n' "$files" | wc -l)
if [ "$count" -le 3 ]; then
  summary=$(printf '%s\n' "$files" | paste -sd, - | sed 's/,/, /g')
else
  summary="$count files"
fi

git commit -q -m "chore: auto-commit $summary" || true
exit 0
