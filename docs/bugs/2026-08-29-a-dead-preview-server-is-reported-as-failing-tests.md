---
id: 2026-08-29-a-dead-preview-server-is-reported-as-failing-tests
status: closed
priority: medium
reported: 2026-08-29
closed_by: "scripts/check-preview-server.selftest.mjs (4 states, GREEN=0 / neutered=1) + behavioural proof: server confirmed down via curl 000, then npx playwright test started it and ran 15 passed / 1 skipped exit 0"
status_detail: "FIXED b12c479, verified both ways: server confirmed down (curl 000), Playwright then started it and ran 15 passed/1 skipped exit 0. Self-test GREEN=0, neutered=1. Found by hitting it: a full-suite run produced 39 identical ERR_CONNECTION_REFUSED failures that read as a catastrophic regression. Playwright has no webServer block and checks.sh has no server precondition, so a dead :3001 is reported as 'Playwright smoke tests failed -- Fix tests before pushing.'"
---

# A dead preview server is reported as failing tests, not as a missing server

**Found 2026-08-29 by hitting it during a `/save`.** The session-start ritual boots the :3001 preview
server; I went straight to running the suite without it (the previous session's server had died with
that session). Result: **39 identical failures**, every one
`page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3001/`.

My first read was that something was badly broken in the app. It took a process listing and a failure
tally to establish the real cause. **The output gives no signal that the dependency is missing rather
than the code being wrong** — and 39 red tests is exactly what a serious regression looks like.

## Two places, one gap

1. **`playwright.config.js` has no `webServer` block.** Playwright therefore neither starts the server
   nor verifies it, and `npm test` is not self-sufficient — it silently depends on out-of-band state.
2. **`scripts/checks.sh:337` (the pre-push smoke gate) has no server precondition either.** Verified: a
   grep of `checks.sh` for `3001`/`HttpListener`/`curl`/`server` returns **nothing**. With :3001 down,
   the gate fails all 57 smoke tests and prints:

   > `fail "Playwright smoke tests failed -- push blocked. Fix tests before pushing."`

   That message names the wrong cause. The tests are fine; the server is absent. Someone acting on it
   goes looking for a regression that does not exist.

**It fails safe, not open** — connection-refused cannot produce a false green, so nothing unsafe ships
because of this. The cost is misdirection and wasted runs, which is what it cost here.

## Why this is not "a problem that does not exist yet"

It happened, today, and produced a wrong initial diagnosis plus a discarded full-suite run. Per
[[feedback_no_speculative_fixes]] the bar is evidence, and this row is the evidence.

## Suggested fix (not yet done — needs its own pass)

A `webServer` block in `playwright.config.js` pointing at the same `HttpListener` command already
recorded in `.claude/launch.json`, with `reuseExistingServer: true` so it does not collide with a
server the session already booted (a second listener on 3001 just errors out — the `run-coachapp`
skill says so explicitly). That makes both `npm test` and the pre-push gate self-sufficient and moves
the failure message to "could not start the web server", which is the true cause.

**Assert the title, not just a 200.** `run-coachapp` already warns that a dead config can serve a
*different* app on 3001 — serving something and serving CoachApp are different checks. Any precondition
added here must assert `<title>CoachApp</title>`, or it becomes another check that passes without
looking. See [[feedback_reports_success_doing_nothing]].

**Closes when:** :3001 is deliberately stopped, and both `npm test` and `scripts/checks.sh` either start
the server themselves or fail with a message naming the missing server rather than the tests.

---

## FIXED 2026-08-29 (`b12c479`) — closing evidence is behavioural, both directions

**Closing condition from this row, restated:** *":3001 is deliberately stopped, and both `npm test` and
`scripts/checks.sh` either start the server themselves or fail with a message naming the missing server
rather than the tests."*

**Met, and verified rather than reasoned:**
- The preview server was killed and confirmed down (`curl` → `000`). `npx playwright test
  tests/solo-account.spec.js` then **started it itself** and ran **15 passed / 1 skipped, exit 0**. The
  same situation produced 39 `ERR_CONNECTION_REFUSED` failures a few hours earlier.
- `scripts/checks.sh` inherits both the `webServer` block and the `globalSetup` automatically, since its
  invocation at the Playwright step uses the same config.

**The wrong-app case is covered too, and that is the half a status-code check misses.**
`tests/global-setup.js` asserts `<title>CoachApp</title>`, not a 200 — because `run-coachapp` already
warns a stale entry in `.claude/launch.json` can serve a different app on this port.

**One source of truth for the command.** `playwright.config.js` READS the launch command out of
`.claude/launch.json` rather than carrying its own copy — [[feedback_two_fields_one_fact]].

## Two things found only by insisting the check be seen to fail

1. **A UTF-8 BOM in `.claude/launch.json`.** `JSON.parse` rejects it outright. The first cold run failed
   immediately with the config's own error message pointing at the file — the check working, on its
   first use. Now stripped before parsing.
2. **The self-test crashed instead of failing.** Neutering its wrong-app expectation exited **127**, not
   1: `process.exit(1)` raced the http teardown and aborted libuv
   (`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`). Non-zero, so the gate would still have
   blocked — but 127 reads as "command not found", and the next person would hunt a missing binary
   instead of a failed check. Changed to `process.exitCode = 1`; now GREEN→0, neutered→1.

**Both of those were caught because the rule is "prove it can FAIL", not "watch it pass"** — see
[[feedback_reports_success_doing_nothing]]. My first neuter attempt returned an ambiguous 127 and I
nearly recorded it as proof; that is exactly [[feedback_name_the_spec_before_neutering]].

**Left open deliberately:** nothing. Jake's confirmation is not required — this row was found by me, not
reported by him, and the closing condition is behavioural and has been demonstrated in both directions.
