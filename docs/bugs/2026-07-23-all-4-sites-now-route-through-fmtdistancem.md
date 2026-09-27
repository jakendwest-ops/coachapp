---
id: 2026-07-23-all-4-sites-now-route-through-fmtdistancem
status: closed
priority: medium
reported: 2026-07-23
status_detail: "CLOSED 2026-09-27 via closure rule (b): commit b637e09 ('Six bugs from the 2026-07-23 full-file review, all with red->green regression tests', tests/ledger-fixes-2026-07-23.spec.js) names this fix among the six; green in the v2026.09.8 full-suite run."
---

# all 4 sites now route through fmtDistanceM

✅ **FIXED + LIVE 2026-07-24 (b637e09)** — all 4 sites now route through `fmtDistanceM`. — **A 400m sprint reads "400 m" in the runner and "0.4 km" on Progress.** Four sites bypass the shared `fmtDistanceM`: app-progress.js:1011, :1392, :1427 and app-workouts.js:201. les-048 shape.
