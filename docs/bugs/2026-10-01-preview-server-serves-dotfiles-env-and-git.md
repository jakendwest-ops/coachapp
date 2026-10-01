---
id: 2026-10-01-preview-server-serves-dotfiles-env-and-git
status: open
priority: low
reported: 2026-10-01
status_detail: "Found by the multi-agent review of the RPE top-set work (2026-09-30 / 2026-10-01), not reported by Jake. Verified empirically by Agent A (round 1): a real HttpListener driven with raw TCP request lines. Path traversal ABOVE the root is not reachable (http.sys rejects it before the handler); the exposure is the root itself. Loopback-only and dev-only, and pre-existing; the (Get-Location) change made the root less pinned."
closing_conditions: "The preview server returns 404 for any request whose path has a dot-prefixed segment and for anything that resolves outside its root, with a test that requests /.env and /.git/config and gets 404, RED before and GREEN after."
---

# The local preview server serves .env and .git/config

**Closes when:** The preview server returns 404 for any request whose path has a dot-prefixed segment and for anything that resolves outside its root, with a test that requests /.env and /.git/config and gets 404, RED before and GREEN after.

`.claude/launch.json`'s PowerShell server has no extension allowlist and no dotfile exclusion, so with the
repo root as its root `GET /.env` and `GET /.git/config` return the files (confirmed: both exist and both
request lines reach the handler unmodified).

Why this stays LOW: the listener prefix is `http://localhost:3001/`, so http.sys binds loopback only and
rejects any `Host` other than `localhost` (which also defeats a DNS-rebinding page), and the response
carries no CORS headers, so a cross-origin page cannot read the body. It is a local-machine exposure only.

Note the safety against `..` traversal comes from http.sys canonicalising the path before the handler
sees it, not from anything in this config — a port of the server to another runtime would lose it.
