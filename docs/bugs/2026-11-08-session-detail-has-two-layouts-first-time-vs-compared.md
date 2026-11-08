---
id: 2026-11-08-session-detail-has-two-layouts-first-time-vs-compared
status: fixed-awaiting-jake
priority: medium
reported: 2026-11-08
status_detail: "BUILT 2026-11-08 (Jake approved the tappable mock-up and its three choices), on master, not yet released: a session with no last time opens in the comparison layout in one column (_sessionSoloHtml), each exercise marked 'First time' only the first time it was ever logged in any workout and only from the whole history; cardio totals carry distance and time; no Total line when there is nothing to weigh. Covered by tests/session-compare-2026-11-07.spec.js (red on deliberate breaks). Waiting for Jake on his phone after the next release. EARLIER: REPORTED by Jake 2026-11-08 on the live v2026.11.2, with screenshots of two opened session cards on Progress > Performance > Sessions: 'Why is the UI different on these 2?' Cause is by design, not a fault: `_renderPerfSessionDetail` (js/app-progress.js) shows the new two-column comparison only when an earlier session of the same workout exists; a first-time session falls back to the older per-exercise list (top weight + 'first time', the sets on one line, Volume). Needs one layout for both, decided with Jake (a prototype) before any build."
closing_conditions: "A first-time session and a compared session open into the same layout, and Jake confirms it on his phone."
---

# A first-time session and a compared session open into different layouts

On Sessions, tapping a card whose workout has been done before shows "Fri 23 Oct | This time" columns, set by set, with a verdict per
exercise. Tapping a card for a workout done for the first time shows the older list instead: exercise name with its top weight and
"first time", the sets as one comma-separated line, and the volume. Jake reads them as two different designs for the same thing.

Closes when Jake confirms the change on his phone (see closing_conditions above); a commit message alone never closes it.
