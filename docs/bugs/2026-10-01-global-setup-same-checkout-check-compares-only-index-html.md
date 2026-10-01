---
id: 2026-10-01-global-setup-same-checkout-check-compares-only-index-html
status: closed
priority: medium
reported: 2026-10-01
status_detail: "FIXED 2026-10-01 by a test that ran RED on the old check and GREEN on the new: scripts/check-preview-server.selftest.mjs gained four states. Old check: it ACCEPTED a server with the same index.html over different module bytes, over a different stylesheet, and over a module the server does not serve (3 DID NOT THROW). New check: all three refused, naming the files; identical modules (BOM and CRLF aside) still accepted. Also checked against a real server rooted in the main checkout: refused. The PREVIEW_SERVER_CMD advice now says a live-reload server will trip the check. Found by the multi-agent review, not reported by Jake."
closing_conditions: "assertPreviewServer detects a server whose JS differs from this checkout even when index.html is byte-identical (the server reports its root, or the check also compares module bytes), with a self-test case that goes RED before and GREEN after. The error message must also stop recommending PREVIEW_SERVER_CMD as the fix without saying a live-reload server will trip the byte comparison."
---

# The same-checkout server check passes when index.html matches but the JS served is another checkout's

**Closes when:** assertPreviewServer detects a server whose JS differs from this checkout even when index.html is byte-identical (the server reports its root, or the check also compares module bytes), with a self-test case that goes RED before and GREEN after. The error message must also stop recommending PREVIEW_SERVER_CMD as the fix without saying a live-reload server will trip the byte comparison.

`tests/global-setup.js` compares the served `index.html` against this checkout's. That catches the
2026-09-30 worktree bug only because a js change normally moves a `?v=` tag in `index.html`. It is blind to:

- a branch whose diff does not touch `index.html` (test-only, css-only, scripts-only);
- a js change where the cache-bust bump was forgotten — which `checks.sh` only catches at PUSH, after the
  suite has run.

I demonstrated it directly: new `index.html` + old `app-runner.js`/`app-workouts.js`/`app-programs.js` on
a spare port passed the check. Agent C also noted at 82d6596 (the commit that introduced the check) the
guard would not have fired had `index.html` been identical — it differed there, so it did fire, but by luck
of the version tags rather than by design.

## Fixed 2026-10-01

`assertPreviewServer` now also fetches every `js/` and `css/` file this checkout's `index.html` references and compares
it byte for byte (same BOM / CRLF normalisation) with this checkout's copy; a file the server does not serve counts as
different, and a local file that cannot be read is skipped with a line (fail open, as before). It did not use the
suggested root-reporting header: the launch.json server cannot report a root without a second config change, and the
byte comparison needs no cooperation from the server. Test: `scripts/check-preview-server.selftest.mjs` states 7-10,
now run by `checks.sh` rule 9s on every push (it used to run only under `CHECKS_SMOKE=1`).

Second, smaller: the failure message tells the user to set `PREVIEW_SERVER_CMD`. A dev server that injects a
live-reload snippet (live-server, browser-sync, vite) serves a body that legitimately differs from the file,
so the suggested remedy can trip the check it is a remedy for.

Suggested direction: have the server expose the root it serves (a header or `/__root`) and compare that to
`path.resolve(__dirname, '..')`, falling back to byte comparison when there is no header (CI's python server).
