---
id: 2026-07-19-renderprogresspersession-now-shows-a-no-sets-logged-note-ins
status: confirmed
closed_by: "clause (b) — ledger-fixes-2026-08-02.spec.js:6 ran GREEN 2026-08-20 in a serialized 192-test run; red-before is recorded in this file's body. Closed on test evidence, NOT on a Jake confirmation."
priority: low
reported: 2026-07-19
status_detail: "fixed — awaiting Jake"
---

# renderProgressPerSession now shows a "No sets logged" note instead of the 0/0/0 tile row

✅ **FIXED + LIVE (LOCAL) 2026-08-02 — `renderProgressPerSession` now shows a "No sets logged" note instead of the 0/0/0 tile row.** `_diaryExMetrics`'s `totals.sets === 0` case (exercises exist but no `workout_log_sets` were written) now renders a single explanatory line rather than 4 zeroed metric tiles. Scoped to the client/solo self-view "My Progress" diary (`renderProgressPerSession`), not the coach's client-profile view (a materially different function, `renderClientPerformance` — not touched). Red→green test in `tests/ledger-fixes-2026-08-02.spec.js`, using `loginAsClient` + real button navigation (an earlier draft mistakenly targeted the coach's client-profile view and never actually reached this code path — caught because the DOM never left the auth-shell). Cache-bust: app-progress v33→34. — (orig) **Diary shows `0/0/0` tiles for real sessions with no logged sets** (e.g. your "Push Day A"). Accurate — those sessions genuinely have no set data — but reads oddly on the Recent-sessions list. Consider hiding zero-total sessions or a "no sets logged" note. Surfaced during live review, not yet your complaint.
