---
id: 2026-07-23-all-6-guards-in-logrunnerset-now-toast-matching-toggletables
status: closed
priority: medium
reported: 2026-07-23
status_detail: "CLOSED 2026-09-27 via closure rule (b): commit b637e09 ('Six bugs from the 2026-07-23 full-file review, all with red->green regression tests', tests/ledger-fixes-2026-07-23.spec.js) names this fix among the six; green in the v2026.09.8 full-suite run."
---

# all 6 guards in logRunnerSet now toast, matching toggleTableSet's pattern

✅ **FIXED + LIVE 2026-07-24 (b637e09)** — all 6 guards in `logRunnerSet` now toast, matching `toggleTableSet`'s pattern. — **Cardio LOG button silently does nothing on an empty field.** `logRunnerSet` has five bare `return`s (app-runner.js:932/949/966/974/978/982). Its sibling `toggleTableSet` (:391-400) carries an 8-line comment on why that is unacceptable mid-set and toasts on every branch. Same user, same moment, no message.
