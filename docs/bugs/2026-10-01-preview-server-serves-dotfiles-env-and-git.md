---
id: 2026-10-01-preview-server-serves-dotfiles-env-and-git
status: closed
priority: low
reported: 2026-10-01
status_detail: "FIXED 2026-10-01 by a test that ran RED on the old server and GREEN on the new: scripts/check-launch-server.selftest.mjs starts the REAL server from launch.json over a temp site and attacks it with raw request lines. Old config: /.env, /.ENV, /%2eenv, /.git/config, a nested dot-directory file, /ENV~1, /GIT~1/config, /sub/HIDDEN~1/x.js and /secrets.pem all returned 200 with the secret in the body, and /css and /* hung the connection (9 leaks + 2 hangs). New config: all 404 (the wildcard gets a 500), every ordinary file still served. Each rule is separately proven by a mutant that drops only it (dot-segment, 8.3 short-name, extension allowlist: one red case each). NOT separately provable: the explicit stay-under-the-root check, because http.sys answers 403 to .. before the handler runs; it is defence in depth for a port to another runtime. A server already running keeps the old script until it is restarted. Found by the multi-agent review, not reported by Jake."
closing_conditions: "The preview server returns 404 for any request whose path has a dot-prefixed segment and for anything that resolves outside its root, with a test that requests /.env and /.git/config and gets 404, RED before and GREEN after."
---

# The local preview server serves .env and .git/config

**Closes when:** The preview server returns 404 for any request whose path has a dot-prefixed segment and for anything that resolves outside its root, with a test that requests /.env and /.git/config and gets 404, RED before and GREEN after.

`.claude/launch.json`'s PowerShell server has no extension allowlist and no dotfile exclusion, so with the
repo root as its root `GET /.env` and `GET /.git/config` return the files (confirmed: both exist and both
request lines reach the handler unmodified).

## Fixed 2026-10-01

`.claude/launch.json`'s handler now refuses, before reading anything: any path segment starting with a dot, any
segment matching `~<digit>` (the NTFS 8.3 short-name route: `.env` is also `ENV~1`, `.git` is also `GIT~1`, and a bare
dot rule alone does not see those), any path that resolves outside the root, and any file whose extension is not one the app
serves (html, css, js, images, fonts, maps, txt). It serves only real files (`Test-Path -LiteralPath -PathType Leaf`,
so a directory or a wildcard no longer throws inside the handler and leaves the response open), and a handler error
answers 500 instead of hanging. Test: `scripts/check-launch-server.selftest.mjs`, run by `checks.sh` rule 9s on every push.

Why this stays LOW: the listener prefix is `http://localhost:3001/`, so http.sys binds loopback only and
rejects any `Host` other than `localhost` (which also defeats a DNS-rebinding page), and the response
carries no CORS headers, so a cross-origin page cannot read the body. It is a local-machine exposure only.

Note the safety against `..` traversal comes from http.sys canonicalising the path before the handler
sees it, not from anything in this config — a port of the server to another runtime would lose it.
