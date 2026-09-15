---
id: 2026-08-14-personal-calendar-lacks-the-workouts-page-detail
status: fixed-awaiting-jake
priority: medium
reported: 2026-08-14
---

# The calendar day modal showed only exercise names, not the prescription

**Jake, 2026-08-14, verbatim:** *"The calendar for personal only shows the exercise name and does not show
the same data for the same workout that is present on the 'workouts' page."*

`showClientDayDetail` (`js/app-calendar-goals.js:215`) was the **only** prescription-rendering surface in
the app that never called `_fmtSetsCollapsed` — a gap `js/app-workouts.js:198-199` had already listed by
name. Everything it needed was present: `sets_json` was already in the calendar's own embed
(`js/app-calendar-goals.js:27`) and the helper was already reachable cross-file at click time (it was
calling `_prescribedSetCount` from that same module two lines away).

**✅ FIXED + LIVE `d337418` (2026-08-14).** Mirrors `js/app-workouts.js:669-679` exactly. A day now reads
`3 × 3 reps · 60kg · RPE 5 · @X · 1:30 rest` instead of `3 sets`.

**Found while wiring it — a second, unreported bug:** the modal rendered the MASTER template's exercises
while its ▶ Start button launches the CLIENT'S clone. Nearly invisible while only names and set counts
showed; with real numbers it would have printed figures the runner never uses, the moment a copy diverged.
The `client_program_workouts` query was widened to embed the clone's exercises, and the modal now prefers
the clone with the master as fallback.

`escapeHtml` on the new `presc` string is load-bearing, not decoration: `_fmtSetDetail` concatenates raw
`sets_json` values and is explicitly NOT html-safe, and on a client plan clone those rows belong to the
client — the client→coach stored-XSS shape this codebase has shipped three times. Pinned behaviourally.

**Closes when:** Jake taps a day on his Personal calendar and sees the same detail as the Workouts page.
