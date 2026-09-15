---
id: 2026-08-01-stored-xss-cluster-in-the-runner-s-prescription-render-path-
status: confirmed
closed_by: "clause (b) — full-file-review-2026-08-01.spec.js ran GREEN 2026-08-20 in a serialized 192-test run; red-before is recorded in this file's body. Closed on test evidence, NOT on a Jake confirmation."
priority: high
reported: 2026-08-01
status_detail: "fixed — awaiting Jake"
---

# stored-XSS cluster in the runner's prescription render path, found by the (overdue) weekly full-file review

✅ **FIXED + LIVE 2026-08-01 — stored-XSS cluster in the runner's prescription render path, found by the (overdue) weekly full-file review.** `_buildTargetCols`/`_renderTargetBarHtml` (feeds both table and wizard modes), the cardio target-chip row, several wizard placeholder/value attributes, and the PT-note block all rendered coach-authored `sets_json`/`notes` unescaped — ~15 sinks total, all with an escaped sibling elsewhere proving this was drift. Confirmed direction: coach → whoever runs the session. The client → coach direction (client writing their own plan clone's exercises) needs a live probe, not yet done — see row below. Red→green `tests/full-file-review-2026-08-01.spec.js` (3 tests).
