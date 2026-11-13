# Changelog

All notable changes are recorded here. Format: [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]
### Added
- Browser selection (Chrome, Edge, Chromium, Firefox, WebKit) for crawling and capture.
- Cookie sources: real browser profile (temporary minimal copy), interactive login window, or pasted cookies.
- Bundled Vazirmatn font (OFL).
### Fixed
- Page cap is no longer overshot by in-flight pages.
- Start URL redirects such as http/https or www no longer make same-site pages look off-site.
- Browser launches ignore snap-editor GTK variables that crashed headed Chrome; real-profile cookies are decrypted via the OS keyring.
### Added
- Implementation: url-utils, cookies, sitemap, crawler, shooter (tall-page stitching), gallery, jobs, Express server with SSE/ZIP, Persian RTL UI.
- Unit tests and an end-to-end suite against a local fixture site.
- Hardening: read-only browser guard (GET only, blocked destructive URLs, no service workers/WebSockets), same-site sitemap fetching with manual redirect validation and size caps, decoded exclusion matching, Host-header check.
- Project specification, agent configuration, repository setup and documentation.
