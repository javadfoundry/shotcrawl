# Development

## Requirements
Node.js >= 20, git.

## Setup
```bash
npm install
npx playwright install chromium
npm test        # vitest (unit + e2e against test/fixture-site.js)
npm start
```

## Build order
Follow SPEC.md section 12: skeleton, `url-utils` + `cookies` (TDD), sitemap + crawler, shooter, gallery, jobs + server, UI, e2e + README.

## Git workflow
- Remote: `origin` = https://github.com/javadfoundry/shotcrawl
- Relevant changes are committed automatically (Claude Code Stop hook). Pushing is always manual: `git push -u origin main`.
- Conventional commit messages; update [CHANGELOG.md](../CHANGELOG.md) for user-visible changes.

## Conventions
English code and docs; Persian only in the app UI. No build step for the frontend.
