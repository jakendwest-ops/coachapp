---
id: 2026-07-23-consolidated-into-estimate1rm-app-workouts-js-with-a-12-rep-
status: closed
priority: high
reported: 2026-07-23
status_detail: "CLOSED 2026-09-27 via closure rule (b): commit b637e09 ('Six bugs from the 2026-07-23 full-file review, all with red->green regression tests', tests/ledger-fixes-2026-07-23.spec.js) names this fix among the six; green in the v2026.09.8 full-suite run."
---

# consolidated into _estimate1RM (app-workouts.js) with a 12-rep ceiling, all 4 copies removed

✅ **FIXED + LIVE 2026-07-24 (b637e09)** — consolidated into `_estimate1RM` (app-workouts.js) with a 12-rep ceiling, all 4 copies removed. **Multi-agent review found a bug IN this fix**: `renderProgressPBs`/`renderClientPerformance`'s new "true best" picker (below) compared raw numbers across units — fixed same push, see that row. — **Four copies of the Epley 1RM formula, with different validation.** `_epley1RM` (app-runner:1965), `_epleyEst1RM` (app-progress:1262), plus inline copies at app-progress:197 and :216. The 07-19 dedupe RENAMED the progress copy rather than merging, and never touched the inline pair. `saveRunnerSession:1871` rejects >10 reps as unreliable; `save1RM:216` accepts anything → **60kg × 30 reps saves a 120kg 1RM**, which then drives every %1RM target weight in the runner.
