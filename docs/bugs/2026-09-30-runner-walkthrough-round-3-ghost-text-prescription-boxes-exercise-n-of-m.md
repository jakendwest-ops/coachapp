---
id: 2026-09-30-runner-walkthrough-round-3-ghost-text-prescription-boxes-exercise-n-of-m
status: fixed-awaiting-jake
priority: low
reported: 2026-09-30
status_detail: "Intake row filed late, at the 2026-10-03 save: Jake's round-3 runner walkthrough was fixed in the same session it was reported and no row had been written (the ledger had none for rounds 3-4). The items, as built: (1) the effort ghost text (the grey previous-effort hint in a set's effort box) shows only when the previous session has a rating on the same scale; (2) the prescription boxes span the full width directly under the exercise tabs, with the set table straight after; (3) 'Exercise N of M' is gone from the header (the timer stays). Fixed in afc6cbd, live in v2026.09.13 (app-runner v109). A related follow-up, bd60414 (on master, live with the next release as app-runner v110), stops a previous set that holds only an effort rating from counting as the 'last session'."
closing_conditions: "Jake looks at a real workout on his phone: ghost text only where a comparable previous rating exists, prescription boxes full-width under the tabs with the set table right below, no 'Exercise N of M'. The specs (tests/runner-layout-2026-09-28.spec.js, tests/runner-last-session-effort-only-2026-10-03.spec.js) prove the structure, not how it feels."
---

# Runner walkthrough, round 3 - fixed, awaiting Jake's eyes

Filed so the ledger matches what Jake reported (the standing intake rule: a report becomes a row). Nothing to
investigate - the fixes are in and tested; this row stays until Jake has seen them on a real workout.

Related, from the same walkthrough thread: [the 2026-09-28 runner row](2026-09-28-runner-tabs-show-position-not-completion-and-next-exercise-cannot-return-to-a-skipped-one.md).
