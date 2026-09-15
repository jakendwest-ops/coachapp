---
id: 2026-07-13-the-calendar-grid-genuinely-broke-on-a-long-workout-name-con
status: fixed-awaiting-jake
priority: high
reported: 2026-07-13
reported_detail: confirmed + fixed 2026-08-02
status_detail: "fixed — awaiting Jake"
---

# the calendar grid genuinely broke on a long workout name, confirmed visually before fixing

✅ **FIXED + LIVE (LOCAL) 2026-08-02 — the calendar grid genuinely broke on a long workout name, confirmed visually before fixing.** Roadmap Area 3 #12 diagnosed the cause correctly: day cells (`app-calendar-goals.js`) already had `overflow:hidden;text-overflow:ellipsis;white-space:nowrap` on the workout-name text itself, but the cell (the actual CSS Grid item) had no `min-width:0` — a Grid item's default `min-width` is content-based (`auto`), not 0, so the ellipsis never got the chance to apply within the column's intended space. Reproduced live via direct DOM injection (a real screenshot showed the grid visibly misaligned — Wed/Thu/Fri columns blank, Sat pushed far right, text running off the page edge) before touching anything. Fixed by adding `min-width:0;overflow:hidden` to every day cell. Re-verified: text now truncates to "A Ver…" cleanly, all 7 columns stay equal width regardless of content length. 2 new tests in `tests/ledger-fixes-2026-08-02.spec.js`. Cache-bust: app-calendar-goals v7→8.
