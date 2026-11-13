# Changelog

All notable changes are recorded here. Format: [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]
### Added
- Implementation: url-utils, cookies, sitemap, crawler, shooter (tall-page stitching), gallery, jobs, Express server with SSE/ZIP, Persian RTL UI.
- Unit tests and an end-to-end suite against a local fixture site.
- Hardening: read-only browser guard (GET only, blocked destructive URLs, no service workers/WebSockets), same-site sitemap fetching with manual redirect validation and size caps, decoded exclusion matching, Host-header check.
- Project specification, agent configuration, repository setup and documentation.
