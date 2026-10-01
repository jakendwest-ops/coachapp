---
id: 2026-10-01-global-setup-same-checkout-check-compares-only-index-html
status: open
priority: medium
reported: 2026-10-01
status_detail: "Found by the multi-agent review of the RPE top-set work (2026-09-30 / 2026-10-01), not reported by Jake. VERIFIED BY ME on 2026-10-01: to prove a test could fail I served this worktree's NEW index.html with OLD copies of three JS modules on a spare port, and the check accepted it. It compares index.html only, so it is blind exactly when the served page matches and the modules do not."
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

Second, smaller: the failure message tells the user to set `PREVIEW_SERVER_CMD`. A dev server that injects a
live-reload snippet (live-server, browser-sync, vite) serves a body that legitimately differs from the file,
so the suggested remedy can trip the check it is a remedy for.

Suggested direction: have the server expose the root it serves (a header or `/__root`) and compare that to
`path.resolve(__dirname, '..')`, falling back to byte comparison when there is no header (CI's python server).
