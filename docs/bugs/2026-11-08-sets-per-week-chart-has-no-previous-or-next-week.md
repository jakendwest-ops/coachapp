---
id: 2026-11-08-sets-per-week-chart-has-no-previous-or-next-week
status: fixed-awaiting-jake
priority: low
reported: 2026-11-08
status_detail: "BUILT 2026-11-08 (Jake chose one week a tap from a tappable mock-up), on master, not yet released: '‹ Previous week' / 'Next week ›' under the bars and 'Back to the latest', back to the oldest week with working sets; no buttons when it all fits in eight weeks; never steps through a partial history. Session cards below do not follow. tests/session-compare-2026-11-07.spec.js and tests-node/session-compare.test.mjs. Waiting for Jake on his phone after the next release. EARLIER: REPORTED by Jake 2026-11-08 on the live v2026.11.2: 'Previous week <' / 'Next week >' buttons, confirmed the same day to apply to both Today's This week card (sibling row 2026-11-08-this-week-card-has-no-previous-or-next-week) and Progress > Performance > Sessions' 'Sets per week' bars, which always show the latest 8 weeks (`_weeklyVolume`, js/app-progress.js). Open question for the scope: step by one week or by eight, and whether the session cards below follow."
closing_conditions: "The Sets per week chart pages back and forward, and Jake confirms it on his phone."
---

# The "Sets per week" bars always show the latest 8 weeks

Progress > Performance > Sessions draws sets (or kg) per week for the last 8 weeks only. Jake wants previous / next buttons to see
older weeks.

Closes when Jake confirms the change on his phone (see closing_conditions above); a commit message alone never closes it.
