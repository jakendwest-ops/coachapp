---
id: 2026-09-28-progress-trend-resting-hr-chart-test-fails-intermittently
status: open
priority: low
reported: 2026-09-28
status_detail: "Found while verifying the runner layout change. tests/progress-trend.spec.js:5 ('resting-HR trend chart shows on the Body tab with >=2 entries (B4)') fails on some runs and passes on retry. Established that it is NOT caused by the runner change; the cause of the intermittency is not established."
---

# `progress-trend.spec.js:5` fails intermittently

## Evidence

- In the 334-test regression run for the runner layout change it failed its first attempt (`Expected: 1, Received: 0`) and passed on retry.
- Repeated in isolation, four times over the whole file, on the changed code: **2 of 48 runs failed**, both this test.
- The same repeat with `js/app-runner.js` put back to the committed version (the runner file being the only difference):
  **1 of 48 runs failed**, the same test. So the runner change neither causes nor visibly worsens it.
- It is a Progress → Body test of the resting-HR chart; the runner is not on that path.

## What is not known

Why. `Expected 1 / Received 0` suggests a count of chart canvases that had not rendered by the time it was read, which would make
it a timing race between the chart draw and the assertion, but that is INFERRED from the assertion's shape, not shown.

**Closes when** the cause is found and the test passes 20 consecutive isolated runs.
