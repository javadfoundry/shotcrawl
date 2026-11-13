# Design & Implementation Spec: Site Shooter (automatic multi-page website screenshot tool)

> Written to be handed to Claude Code. Goal: build the complete project from scratch from this document, without needing to ask the user further questions.
> This document is in English. The **application UI itself must be Persian (Farsi) and right-to-left (RTL)**.

## 1. Purpose and motivation

The user is a web developer who has built several websites and wants to produce **portfolio samples** of them to show future clients. The tool must:

1. Take only a site URL and automatically discover **all public pages (routes)**.
2. Take a **full-page screenshot** of each page.
3. When given a **session cookie**, also discover and capture pages behind login.
4. Capture every page in three modes: **desktop, tablet and mobile**.
5. Provide a **local web UI** with live progress, a results gallery and ZIP download.

### Non-goals (do not build)
- Mockup frames (device/browser chrome) around the images.
- Screenshotting multiple sites simultaneously.
- Persisting cookies to disk (memory only).
- Auto-filling forms or logging in with a username/password.
- Authentication or multi-user support for the tool itself. It is local-only.

### Anti-goals (a failure even if it technically works)
- The crawler, while authenticated, navigating to destructive links (`/logout`, delete actions, etc.) and thereby killing the user's session or deleting data.
- Cookie leakage: the cookie value must never appear in logs, output files, the manifest, URLs or API responses.
- The server listening on anything other than `127.0.0.1`.

## 2. Stack (decided)

| Part | Choice |
|---|---|
| Runtime | Node.js >= 20, ESM (`"type": "module"`) |
| Browser | `playwright` (Chromium only) |
| Server | `express` |
| Live progress | Server-Sent Events (SSE) |
| ZIP | `archiver` |
| Frontend | Plain HTML, CSS and JS, no build step, in `public/` |
| Tests | `vitest` |
| Very tall images | `sharp` (only to stitch segments, see 7.6) |

Suggestion: a `postinstall` script or README step running `npx playwright install chromium`.

## 3. Project structure

```
site-shooter/
├─ package.json
├─ README.md                 # install, run, usage example
├─ src/
│  ├─ server.js              # Express, API, SSE, static
│  ├─ jobs.js                # in-memory job management, EventEmitter, cancel
│  ├─ crawler.js             # URL discovery
│  ├─ sitemap.js             # parse sitemap / sitemap index / robots
│  ├─ shooter.js             # screenshot each URL per device
│  ├─ cookies.js             # parse and normalize cookies
│  ├─ devices.js             # device definitions
│  ├─ url-utils.js           # normalize, same-site, slug, filters
│  ├─ gallery.js             # build index.html and manifest.json
│  └─ config.js              # defaults
├─ public/
│  ├─ index.html
│  ├─ app.js
│  └─ style.css
├─ test/
│  ├─ url-utils.test.js
│  ├─ cookies.test.js
│  ├─ sitemap.test.js
│  ├─ fixture-site.js        # local test site with protected pages
│  └─ e2e.test.js
└─ output/                   # in .gitignore
```

## 4. Devices (`devices.js`)

| key | viewport (w×h) | DPR | isMobile | hasTouch | UA |
|---|---|---|---|---|---|
| `desktop` | 1440×900 | 1 | false | false | Chromium default |
| `tablet` | 820×1180 | 2 | true | true | iPad-like |
| `mobile` | 390×844 | 3 | true | true | iPhone-like |

- Each device gets its own `BrowserContext` (separate viewport, UA and cookies).
- DPR is configurable from the UI. Default effective DPR is 1 for desktop and 2 for the others (keeps images from getting huge). A "high quality (true DPR)" option is optional.
- Values live in `config.js` and are easy to edit.

## 5. Cookies (`cookies.js`)

Input is free-form text from the UI. `parseCookies(input, siteUrl)` auto-detects the format:

1. **JSON array** (Cookie-Editor / EditThisCookie export): `[{name,value,domain,path,expirationDate|expires,httpOnly,secure,sameSite}]`
   - `sameSite`: map `no_restriction` to `None`, `lax` to `Lax`, `strict` to `Strict`; drop `unspecified` or empty.
   - Convert `expirationDate` (fractional seconds) to `expires`. Session cookies use `-1`.
2. **JSON object** with a `cookies` key (Playwright storageState format): use that array.
3. **Header string** `a=1; b=2` (copied from DevTools > Request Headers > Cookie): turn each pair into a cookie with `url: siteUrl`.

Output: an array compatible with `context.addCookies`. If neither `domain` nor `url` is present, set `url: siteUrl`. Invalid input must raise a clear Persian error message (without echoing any cookie value).

Security: cookies live only on the in-memory Job object, are cleared when the Job ends, and must **never** appear in logs, SSE, the manifest or API output (the UI only shows "cookie: active").

## 6. Crawler (`crawler.js`, `sitemap.js`, `url-utils.js`)

### 6.1 Options
```
startUrl, maxPages=50, maxDepth=3, includeSubdomains=false,
excludePatterns[] (defaults below + user input), respectRobots=false,
delayMs=300, concurrency=3, cookies (optional)
```

Default excludes (substring or glob on path, case-insensitive):
`/logout /signout /sign-out /log-out /delete /remove /unsubscribe /wp-admin/admin-ajax /api/` and any URL whose query contains `action=delete|logout`.

### 6.2 Algorithm
1. Normalize `startUrl` (strip hash, strip trailing `/` except root, sort query params, lowercase host).
2. **Sitemap:** read `robots.txt` (`Sitemap:` directives); if none, try `/sitemap.xml` and `/sitemap_index.xml`. Recursively expand sitemap indexes (max depth 3, max 1000 URLs) and support `.xml.gz`. These URLs seed the queue at depth 1.
3. **BFS over rendered pages:** open each URL in Playwright (`domcontentloaded`, then wait for `networkidle` with a 5 s timeout) and read links from the rendered DOM: `document.querySelectorAll('a[href]')`, resolved against `document.baseURI`.
4. Link filtering:
   - `http` and `https` only, same origin only (or subdomains when enabled).
   - Drop non-page file extensions: `pdf zip rar png jpg jpeg gif webp svg ico mp4 mp3 css js json xml txt woff woff2 ttf` etc.
   - Drop `mailto: tel: javascript:`.
   - Apply excludePatterns.
   - Dedupe on the normalized URL.
5. Stop on reaching `maxPages` or `maxDepth` or an empty queue. Report the reason to the UI (e.g. "reached the 50-page cap").
6. **Redirects:** use the final URL (after redirects) as canonical; drop it if the origin changed.
7. **Login-redirect detection:** if a cookie was supplied and the final URL matches `/login|/signin|/auth`, or more than 30% of pages redirected there, emit the warning "the cookie looks expired or invalid" (continue; warning only).
8. **Status handling:** do **not** screenshot 404, 500, 403 or 401 pages; list them under "skipped" with a reason.
9. Navigate with GET only. Never click buttons or submit forms.
10. If `respectRobots=true`, honor `Disallow` rules for `User-agent: *` (default off, because the sites belong to the user).

Output: `[{url, depth, source: 'sitemap'|'link', status, title}]`.

## 7. Screenshots (`shooter.js`)

For each accepted URL and each selected device:

1. `page.goto(url, {waitUntil:'load', timeout:30000})`, then try `networkidle` with a 5 s timeout (failure is not an error).
2. **Auto-scroll** down in ~viewport steps with 100–200 ms pauses (for lazy-loading and IntersectionObserver), capped at 30 s or 50,000 px. Then scroll back to the top.
3. Wait until every `<img>` is `complete` (5 s timeout) and `document.fonts.ready`.
4. **Optional toggles from the UI:**
   - `disableAnimations` (default on): inject `*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}`
   - `hideCookieBanners` (default on): inject CSS for common selectors (`#onetrust-banner-sdk`, `.cookie-banner`, `[id*="cookie" i][class*="banner" i]`, `.cc-window`, `#CybotCookiebotDialog`, etc.).
   - `extraWaitMs` (default 500).
5. `page.screenshot({fullPage:true, type:'png'})`.
6. **Very tall pages:** Chromium has a limit around 16,384 px. If `scrollHeight > 16000`, capture clipped segments (each <= 16,000 px) and stitch them vertically with `sharp`. If segment capture fails, capture as much as possible and set `truncated:true` in the manifest.
7. Overall timeout per screenshot is 60 s. On error: retry once, then mark `failed` with a message and continue. One failure must not stop the whole Job.
8. Concurrency: at most `concurrency` pages in parallel per context (default 3). Pages are closed after use.
9. Guaranteed cleanup: `browser.close()` in `finally`, and also on Job cancel.

## 8. Disk output (`gallery.js`)

```
output/<hostname>/<YYYYMMDD-HHmmss>/
├─ desktop/<slug>.png
├─ tablet/<slug>.png
├─ mobile/<slug>.png
├─ manifest.json
└─ index.html     # standalone gallery (offline, no external dependencies)
```

- **slug** from the path: `/` becomes `home`, `/about/team` becomes `about-team`. If there is a query string, add a short 6-char hash suffix. Replace illegal characters with `-`. Max 100 characters. On collisions append `-2`, `-3`.
- **manifest.json:**
  ```json
  {
    "site": "https://example.com", "startedAt": "...", "finishedAt": "...",
    "authenticated": true,
    "options": { "...without cookies..." },
    "devices": ["desktop","tablet","mobile"],
    "pages": [{ "url": "...", "title": "...", "slug": "...", "depth": 1,
                "shots": { "desktop": {"file":"desktop/home.png","w":1440,"h":5230,"ok":true},
                           "mobile": {"ok":false,"error":"timeout"} } }],
    "skipped": [{ "url": "...", "reason": "404" }],
    "warnings": []
  }
  ```
- **Gallery `index.html`:** inline CSS and JS, images via relative paths, device filter tabs (All, Desktop, Tablet, Mobile), thumbnail grid with click-to-open lightbox, page title and URL for each entry. Persian and RTL. It must work when opened directly from disk or after zipping and sending to a client.

## 9. Server API (`server.js`)

The server listens only on `127.0.0.1:3000` (port from `PORT`).

| Method and path | Purpose |
|---|---|
| `POST /api/jobs` | body: `{url, cookies?, devices[], maxPages, maxDepth, exclude[], includeSubdomains, respectRobots, disableAnimations, hideCookieBanners, extraWaitMs, hiDpi}` → `{id}`. Validate and return 400 with a Persian message on bad input. |
| `GET /api/jobs/:id/events` | SSE events: `phase` (`crawling`/`shooting`/`done`/`error`/`cancelled`), `discovered {count,url}`, `shot {url,device,ok,index,total}`, `warning {message}`, `done {outputDir,pages,failed}` |
| `GET /api/jobs/:id` | Status and final manifest (no cookies) |
| `DELETE /api/jobs/:id` | Cancel the Job and close the browser |
| `GET /api/jobs/:id/zip` | Stream a ZIP of the whole run folder (including index.html) |
| `GET /files/*` | Static serving of `output/` with path-traversal protection (resolve and check prefix) |
| `GET /` | The UI |

- Only one active Job at a time (a second returns 409 "a job is already running").
- Simplest approach: Jobs are in memory. A server restart loses the list, but `output/` files remain (optional: an endpoint listing previous runs from their manifests).
- Input URL must be `http` or `https`; validate on `POST`.

## 10. User interface (`public/`)

Persian, RTL (`<html lang="fa" dir="rtl">`), Vazirmatn font (local file in `public/fonts` or fall back to `system-ui`), light and dark theme via `prefers-color-scheme`, responsive.

**Form section:**
- Site URL field (live validation)
- Cookie area (multi-line textarea, `dir="ltr"`, helpful placeholder, and a "How do I get a cookie?" help link: DevTools > Application > Cookies, or the Cookie-Editor extension > Export)
- Device checkboxes (Desktop, Tablet, Mobile; all enabled by default)
- "Advanced settings" (collapsible): page cap, depth, excluded paths (one per line), subdomains, respect robots.txt, disable animations, hide cookie banners, high DPR, extra wait
- "Start" and "Cancel" buttons

**Progress section (SSE):** two-phase progress bar (discovering pages, then capturing), live list of discovered URLs, counter ("12 of 36"), and a log of warnings and errors.

**Results section:** thumbnail gallery with device filter, lightbox, a "Download ZIP" button, an "Open standalone gallery" button (link to `index.html`), and a list of skipped and failed pages with reasons.

All UI text and error messages are in Persian. Never display the cookie again in the UI after submission.

## 11. Tests and acceptance criteria

### Unit (vitest)
- `url-utils`: normalize, same-origin, extension filter, exclude, slug and collision handling.
- `cookies`: all three input formats, sameSite and expires mapping, malformed input.
- `sitemap`: simple sitemap, index and gz.

### E2E (using `test/fixture-site.js`)
A local Express test site with:
- Public pages `/`, `/about`, `/contact` with internal links, plus one page that appears only in the sitemap.
- `/dashboard` and `/dashboard/settings`, which redirect to `/login` unless the cookie `session=abc` is present.
- `/logout`, which sets a `loggedOut=true` flag if ever requested (tests assert it was never hit).
- A very tall page (~20,000 px) and a page with a lazy-loaded image.
- A link that returns 404.

**Acceptance criteria:**
1. Without a cookie: only public pages are captured; protected pages are not captured (the redirect target `/login` is treated as a public page or excluded; document whichever behavior is implemented).
2. With cookie `session=abc`: `/dashboard` and `/dashboard/settings` are also captured and `/logout` is never requested.
3. Each page yields three PNGs (one per device) with correct widths (1440, and 820×DPR, 390×DPR).
4. The tall page screenshot is complete (height >= actual height) and the lazy-loaded image appears loaded.
5. `manifest.json` and `index.html` are generated, and no trace of the cookie value exists in the manifest or logs (a grep-based test).
6. Cancelling mid-run closes the browser (no orphan processes).
7. `GET /files/../../etc/passwd` returns 403 or 404.
8. The server is bound to loopback only.

## 12. Suggested build order

1. Project skeleton, `package.json`, install dependencies, `devices.js`, `config.js`.
2. `url-utils.js` and `cookies.js` with tests (TDD).
3. `sitemap.js` and `crawler.js` against the fixture site.
4. `shooter.js` (scrolling, animations, banners, tall pages).
5. `gallery.js` (manifest and index.html).
6. `jobs.js` and `server.js` (API, SSE, ZIP, cancel).
7. The UI in `public/`.
8. Full E2E, README, and a manual run on a real site to check the visuals.

## 13. Left to the implementer
- Exact UI look and colors (while respecting RTL and light/dark themes).
- XML parsing library (e.g. `fast-xml-parser`) and glob library (e.g. `picomatch`).
- Exact timeouts and pauses, if real-world sites show problems.
- If installing `sharp` for stitching tall pages proves problematic, fall back to capturing up to the maximum possible height and recording `truncated`.
