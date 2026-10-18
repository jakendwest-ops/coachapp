---
id: 2026-10-17-runner-ghost-text-is-not-always-showing-or-correct-last-sessions-numbers
status: fixed-awaiting-jake
priority: medium
reported: 2026-10-17
status_detail: "PARTLY FIXED 2026-10-18 on master (not released): cause 1 below (only the 20 newest sessions were searched) and a second defect found with it (a newer session holding the exercise with no sets hid the real history) are fixed in fetchRunnerLastSession, with tests/runner-last-session-window-2026-10-18.spec.js (red on the old code for both, green after; 173 related specs pass). NOT changed: cause 2 (rows matched by set number, warm-ups not filtered) and cause 3 (today's prescription wins over last session, by design). Jake has not yet said which case he saw, so the row stays until he confirms on his phone. REPORTED by Jake 2026-10-17 in his phone check (item R2, on a real workout): 'the width is fine, however the ghost text in the runner is not always correct/showing last sessions numbers'. Not yet investigated: which boxes (weight, reps, effort), which exercises and what he expected to see are not known. Related row: 2026-09-30-runner-walkthrough-round-3 (reopened for the same item), whose fix made the EFFORT ghost text show only when the previous session has a rating on the same scale."
closing_conditions: "Jake confirms on his phone that, in a real workout, the grey numbers in a set's weight and reps boxes show the matching set from his last session of the same exercise whenever there is one, and are the right numbers; a spec that fails today and passes after pins each case found."
---

# Runner: the ghost text is not always correct, or not always showing last session's numbers

## Jake's report (verbatim, 2026-10-17, phone check item R2)

> the width is fine, however the ghost text in the runner is not always correct/showing last sessions numbers

## What is known

Nothing beyond that sentence. Intake first; investigation next (read how the runner builds its placeholders, then ask Jake for one concrete exercise where it was wrong).

## Investigation, read-only (2026-10-17, code only, no data looked at)

The grey weight and reps numbers come from `fetchRunnerLastSession` and `_prevSetsByIndex` in `js/app-runner.js`, then `renderStrengthTable` (~lines 1005-1090). Three things in that path can make the ghost text absent or not what you expect:

1. **Only the 20 newest sessions are searched.** `fetchRunnerLastSession` reads the client's 20 newest `workout_logs` and then looks for the exercise only inside those 20 (`.in('log_id', logIds)`). An exercise last done before the 20th-newest session shows NO grey numbers, with no hint why. An abandoned or empty session uses up one of the 20 slots. Evidenced in the code; whether it is what Jake saw is not known.
2. **Rows are matched by set NUMBER.** Today's row N is compared with last session's set number N (`prevMap[i]`, keyed `set_number - 1`), and the list is not filtered by warm-up versus working (`phase`), although the Last time panel since 2026-10-04 counts working sets only. If last session had a warm-up set, today's first working row would show the warm-up's weight. Not yet checked against what the runner writes for warm-up sets.
3. **By design, today's prescription wins.** A prescribed reps target (`repsMin`) wins over last session's reps, and a %1RM-derived load wins over last session's weight (Jake's own 2026-09-30 report asked for the reps one). A top-set exercise shows no ghost numbers at all, by design. So in a prescribed plan the grey numbers are often the plan's, not last session's.

Fix for 1 (built 2026-10-18, after a three-angle review with no blockers): the database is asked for the newest ten sessions that hold the exercise by library id AND by name (the newer of the two wins; a same-named row with a different library id is another exercise), ordered by the session's date then creation time, filtered to THIS client (that filter is the only wall between a coach's clients, so each returned row is also checked), and the first with real sets wins; this also removes the second defect (an empty newer occurrence hiding the history). A session older than about ten months now says its year. A failed read warns quietly instead of showing an error toast. The live spec (6 tests) seeds: an old session plus 22 newer ones without the exercise; the newest of twelve; an empty newer occurrence; another client of the same coach with a newer log of the same exercise; the library-id and name-only cases; the year label. Each safeguard was taken out on purpose and the spec failed (7 of 7), and it proves the exercise rows go with their sessions.

## Questions for Jake (so the investigation looks in the right place)

- Which boxes: weight, reps, or the effort box?
- A case where it showed nothing, and a case where it showed a wrong number: which exercise, and what did last session actually have for that set?
- Does it happen on the first set only, on later sets, or after you add a set or change the order?

**Closes when:** Jake confirms on his phone that, in a real workout, the grey numbers in a set's weight and reps boxes show the matching set from his last session of the same exercise whenever there is one, and are the right numbers; a spec that fails today and passes after pins each case found.
