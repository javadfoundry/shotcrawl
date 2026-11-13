# shotcrawl

Give it a site URL and it finds every page, then captures full-page screenshots in desktop, tablet and mobile sizes. Pass a session cookie to include pages behind login. Results appear in a local Persian (RTL) web UI with live progress, a gallery and ZIP download.

> Status: specification complete, implementation pending. See [docs/SPEC.md](docs/SPEC.md).

## Planned usage
```bash
npm install
npx playwright install chromium
npm start            # http://127.0.0.1:3000
```
Output is written to `output/<hostname>/<timestamp>/` with per-device PNGs, `manifest.json` and a standalone `index.html` gallery.

## Safety
- Local only: binds to `127.0.0.1`.
- Cookies stay in memory and never reach logs, manifests or API responses.
- The crawler uses GET only and skips destructive links such as `/logout`.

## Documentation
- [Spec](docs/SPEC.md) · [Architecture](docs/ARCHITECTURE.md) · [Development](docs/DEVELOPMENT.md) · [Agent setup](docs/AGENT.md) · [Changelog](CHANGELOG.md)
