# Architecture

Summary of [SPEC.md](SPEC.md); the spec is authoritative.

## Flow
1. UI posts `POST /api/jobs` (url, optional cookies, devices, options).
2. `jobs.js` creates one in-memory Job (only one active at a time) and emits events.
3. `crawler.js` seeds from `sitemap.js`, then BFS-crawls rendered pages with Playwright, filtered by `url-utils.js`.
4. `shooter.js` captures each accepted URL per device (own BrowserContext per device); tall pages are stitched with `sharp`.
5. `gallery.js` writes `manifest.json` and a standalone `index.html`.
6. `server.js` streams progress via SSE, serves `output/` safely and ZIPs runs.

## Modules
| Module | Responsibility |
|---|---|
| `server.js` | Express API, SSE, static, loopback bind |
| `jobs.js` | Job lifecycle, cancel, cleanup |
| `crawler.js` / `sitemap.js` | URL discovery |
| `shooter.js` | Screenshots, scrolling, tall pages |
| `cookies.js` | Parse JSON / storageState / header cookies |
| `devices.js`, `config.js` | Defaults |
| `url-utils.js` | Normalize, filter, slug |
| `gallery.js` | Manifest and offline gallery |

## Invariants
- Cookies live only on the Job object and never leave memory or reach any output.
- GET navigation only; destructive URLs excluded.
- Server listens on `127.0.0.1` only; `/files/*` blocks path traversal.

## Behavior notes
- Unauthenticated protected URLs redirect to `/login`; the final URL is canonical, so `/login` is captured once as a public page.
- Pages taller than 16,000 device px are captured in clipped segments and stitched with `sharp`.
- `guard.js` makes every browser context read-only (GET only, excluded URLs aborted, service workers blocked).

## Browser and auth modules
- `browsers.js`: browser catalog, installation detection, launch helpers (clean environment, real OS keyring).
- `profiles.js`: lists Chrome/Edge profiles and makes a minimal temporary copy (Chrome blocks debugging on the default profile dir and locks live profiles).
- `auth.js`: in-memory cookie sessions (profile extraction, visible login window). `takeCookies()` hands cookies to a Job once and forgets them. The API only ever returns a count.
- `server.js` rejects cross-origin state-changing requests (Origin check) in addition to the Host check.
