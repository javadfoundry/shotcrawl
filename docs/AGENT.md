# Agent setup

Claude Code configuration for this repository.

| Path | Purpose |
|---|---|
| `CLAUDE.md` | Project context and standing rules, loaded every session |
| `.claude/settings.json` | Denies `git push`; registers the auto-commit Stop hook |
| `.claude/hooks/auto-commit.sh` | Stages and commits pending changes; never pushes |
| `.claude/agents/security-reviewer.md` | Subagent checking the spec's anti-goals |

## Standing rules
1. Relevant changes are committed automatically; `git push` is done manually by the owner.
2. Commits carry no Claude co-author trailer; Claude is not listed as a contributor.
3. Descriptions never contain the phrase "in collaboration with".

## Notes
- Hook commits are named `chore: auto-commit <files>`; Claude is expected to make meaningful conventional commits itself first, so the hook only catches leftovers.
- Personal overrides go in `.claude/settings.local.json` (git-ignored).
