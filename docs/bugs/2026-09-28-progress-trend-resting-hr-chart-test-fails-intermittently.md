---
id: 2026-09-28-progress-trend-resting-hr-chart-test-fails-intermittently
status: fixed-awaiting-jake
priority: low
reported: 2026-09-28
status_detail: "FIXED 2026-10-11, awaiting confirmation over real release runs. The test no longer sleeps: it waits for the Personal view, then for the landing dashboard's greeting, then asserts with a retrying expect, and cleans up in a finally under the client id it started with. 20 of 20 isolated runs passed after the change. NOT proof the flake is gone: the original failures were 2 in 48 whole-file runs and it was never shown to fail in isolation, and the cause is still INFERRED (see What is known)."
---

# `progress-trend.spec.js:5` fails intermittently

## Evidence (2026-09-28)

- In the 334-test regression run for the runner layout change it failed its first attempt (`Expected: 1, Received: 0`) and passed on retry.
- Repeated in isolation, four times over the whole file, on the changed code: **2 of 48 runs failed**, both this test.
- The same repeat with `js/app-runner.js` put back to the committed version (the runner file being the only difference):
  **1 of 48 runs failed**, the same test. So the runner change neither causes nor visibly worsens it.
- It is a Progress -> Body test of the resting-HR chart; the runner is not on that path.

## What is known (2026-10-11)

Two candidate mechanisms, both timing, neither measured:

1. The old test slept a fixed second after rendering and then counted the chart (the chart's own draw can be slower than that under load).
2. A review of the rewrite found a second one the old sleeps also covered: the app sets the role and client id early in boot, but the landing
   dashboard paints later, and the test called `renderProgress` directly, which bypasses the router's stale-render guard. A late dashboard paint
   would replace the page the test had just rendered, and the chart count would stay 0.

The rewrite waits for the dashboard's greeting before rendering, which covers both.

**Closes when** Jake confirms, or the test has gone through several full release runs without failing.
