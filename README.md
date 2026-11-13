# shotcrawl

Give it a site URL and it finds every page, then captures full-page screenshots in desktop, tablet and mobile sizes. Pass a session cookie to include pages behind login. Results appear in a local Persian (RTL) web UI with live progress, a gallery and ZIP download.

> Status: implemented per [docs/SPEC.md](docs/SPEC.md). `npm test` runs unit and end-to-end tests .

## Usage
```bash
npm install
npx playwright install chromium
npm start            # http://127.0.0.1:3000
```
Output is written to `output/<hostname>/<timestamp>/` with per-device PNGs, `manifest.json` and a standalone `index.html` gallery.

## Browsers and login
- **Browser:** pick Google Chrome, Microsoft Edge, bundled Chromium, Firefox or WebKit in the UI (only installed ones are listed). Firefox/WebKit need `npx playwright install firefox webkit`.
- **Real profile session:** reads the site's cookies from a private, minimal copy of your actual Chrome/Edge profile (headless, no window; Chrome may stay open). The copy is deleted right after.
- **Manual login window:** opens a visible browser (your profile copy, so you are usually already signed in); sign in, then click "Done".
- **Paste cookies:** header string or Cookie-Editor JSON.
Cookies stay in memory and are discarded when the job ends. Session-only cookies that Chrome never wrote to disk are not available through the profile copy; use the login window for those.

## Safety
- Local only: binds to `127.0.0.1`.
- Cookies stay in memory and never reach logs, manifests or API responses.
- The crawler uses GET only and skips destructive links such as `/logout`.

## Documentation
- [Spec](docs/SPEC.md) · [Architecture](docs/ARCHITECTURE.md) · [Development](docs/DEVELOPMENT.md) · [Agent setup](docs/AGENT.md) · [Changelog](CHANGELOG.md)
