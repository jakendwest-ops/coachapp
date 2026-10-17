---
id: 2026-10-17-runner-ghost-text-is-not-always-showing-or-correct-last-sessions-numbers
status: open
priority: medium
reported: 2026-10-17
status_detail: "OPEN, reported by Jake 2026-10-17 in his phone check (item R2, on a real workout): 'the width is fine, however the ghost text in the runner is not always correct/showing last sessions numbers'. Not yet investigated: which boxes (weight, reps, effort), which exercises and what he expected to see are not known. Related row: 2026-09-30-runner-walkthrough-round-3 (reopened for the same item), whose fix made the EFFORT ghost text show only when the previous session has a rating on the same scale."
closing_conditions: "Jake confirms on his phone that, in a real workout, the grey numbers in a set's weight and reps boxes show the matching set from his last session of the same exercise whenever there is one, and are the right numbers; a spec that fails today and passes after pins each case found."
---

# Runner: the ghost text is not always correct, or not always showing last session's numbers

## Jake's report (verbatim, 2026-10-17, phone check item R2)

> the width is fine, however the ghost text in the runner is not always correct/showing last sessions numbers

## What is known

Nothing beyond that sentence. Intake first; investigation next (read how the runner builds its placeholders, then ask Jake for one concrete exercise where it was wrong).

## Questions for Jake (so the investigation looks in the right place)

- Which boxes: weight, reps, or the effort box?
- A case where it showed nothing, and a case where it showed a wrong number: which exercise, and what did last session actually have for that set?
- Does it happen on the first set only, on later sets, or after you add a set or change the order?

**Closes when:** Jake confirms on his phone that, in a real workout, the grey numbers in a set's weight and reps boxes show the matching set from his last session of the same exercise whenever there is one, and are the right numbers; a spec that fails today and passes after pins each case found.
