# shotcrawl (Site Shooter)

Local tool that discovers every public (and, with a session cookie, authenticated) page of a website and captures full-page screenshots on desktop, tablet and mobile. Full requirements: [docs/SPEC.md](docs/SPEC.md). The app UI is Persian (RTL); code, comments, docs and commit messages are English.

## Standing rules (always apply)

1. **Auto-commit, never push.** Commit relevant changes automatically in small, logical commits. Never run `git push` (or force-push, or open PRs) — the user pushes manually. The Stop hook in `.claude/settings.json` commits leftovers; `git push` is denied in permissions.
2. **Wording.** Never write the phrase "in collaboration with" (any casing) in descriptions: commit messages, README, docs, package.json, agent/skill descriptions, code comments.
3. **No Claude attribution.** Commits and PRs must not carry `Co-Authored-By: Claude` (or any Claude/Anthropic contributor trailer or "Generated with" line). Claude must never appear as a contributor.

## Security anti-goals (from the spec)
- Cookie values must never appear in logs, manifests, URLs, SSE or API responses.
- The crawler must never visit destructive links (`/logout`, delete actions, ...).
- The server binds to `127.0.0.1` only.

## Stack and layout
Node >= 20 (ESM), Playwright (Chromium), Express + SSE, archiver, sharp, vitest. Plain HTML/CSS/JS frontend in `public/`, no build step. See the structure in SPEC.md section 3.

## Commit style
Conventional commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`), imperative, one concern per commit. Update [CHANGELOG.md](CHANGELOG.md) for user-visible changes.

## Docs
- [README.md](README.md) · [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) · [docs/AGENT.md](docs/AGENT.md)
