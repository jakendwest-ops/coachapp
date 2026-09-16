---
id: 2026-08-02-builder-set-editor-decluttered-bw-assist-and-repeat-removed
status: closed
priority: low
reported: 2026-08-02
closed_by: tests/ledger-fixes-2026-08-02.spec.js
status_detail: "CLOSED 2026-09-15 via closure rule (b): tests/ledger-fixes-2026-08-02.spec.js (named in this row's own original fix text) asserts Assist/Repeat controls are gone on a new set, BW still renders as the sole remaining escape hatch, and repeatTemplateSet is dead code — matches the fix exactly."
---

# builder set editor decluttered: BW, Assist, and Repeat removed

✅ **FIXED + LIVE (LOCAL) 2026-08-02 — builder set editor decluttered: BW, Assist, and Repeat removed.** Jake, live: "delete 'BW', 'Assist', 'Repeat' and the blank box next to the set number." Repeat (the `ts-repeatn` round-count box + "Repeat ×" button) was a pure UI action with nothing persisted, so it and its only test coverage (2 tests in `intervals-2026-07-24.spec.js`) were removed outright — the `repeatTemplateSet` function itself is now dead code with its only caller gone, also deleted. BW/Assist are stored per-set flags (`bodyweight`/`assisted`) that drive other rendering (the weight-input row's visibility, the runner's BW badge) — removing their toggle entirely would strand any set that already has the flag with no way to see or un-set it (les-043 shape: removing a control removes the ability to undo what it set). Fixed by rendering BW/Assist only when the set already carries that flag — a legacy escape hatch, same pattern this file already uses for the "Pace / km (legacy)" row — so new sets never show them, but old flagged sets stay editable. AMRAP untouched. 2 new tests in `tests/ledger-fixes-2026-08-02.spec.js`. Mobile-checked at 390px. Cache-bust: app-workouts v51→52 (shared with the jump-reps fix below, same commit).
