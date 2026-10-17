---
id: 2026-10-12-rpe-is-not-labelled-in-the-runner-stats-and-last-time-while-rir-is
status: confirmed
priority: medium
reported: 2026-10-12
status_detail: "CONFIRMED by Jake 2026-10-17 on his phone (the phone-check checklist, item R8). FIXED 2026-10-12 on master, unreleased (app-progress v79); awaiting Jake's look on a phone. Jake confirmed my reading (an RPE had no label while an RIR did): an RPE now reads '@7 RPE' beside '@0 RIR' in the runner's Stats sheet, the Last time strip, the Stats card and the 1RM note (which now says 'effort counted'). Red before, green after: tests-node/exercise-stats.test.mjs, tests/exercise-stats-shared-2026-10-03.spec.js, tests/runner-last-time-top-set-2026-10-04.spec.js."
---

# In the runner, RPE is not shown whereas RIR is

## Jake's report (verbatim, 2026-10-12)

> 3. In the runner, the RPE is not shown whereas the RIR is.

He selected two rows of the runner's Stats sheet: "Mon 12 Oct, 62.5x4 @7 · 65x4 @8 · 62.4x4 @7" (RPE) and "Mon 12 Oct, 82.5x6 @0 RIR · 80x9 @0 RIR · 80x7 @0 RIR" (RIR), plus the "Last time" strip ("Top set 55 kg x 9 @0 RIR") and the Finish workout bar.

## What the code does

`_xsEffortText` (`js/app-progress.js:2831`) returns `' @' + n + (type === 'rir' ? ' RIR' : '')`: an RIR carries its scale, an RPE is a bare "@7". The comment says "the scale travels with the number, because the two run in opposite directions", but only one of the two carries it. The runner's Last time strip and Stats sheet both use it.

## My reading, to confirm

The two selected rows suggest the complaint is that RPE is shown only as "@7" with no "RPE", so it does not read as RPE. If he meant something else (RPE missing while logging a set in the table, or missing from the Last time strip altogether), the fix differs. One question to him before building.

## What would close it

**Closes when** Jake confirms which screen he meant and that, after the change, an RPE reads as an RPE wherever an RIR does.

## Confirmed with Jake, 2026-10-12

Asked which he meant, Jake chose "RPE has no label (my reading)": RIR read "@0 RIR" and RPE a bare "@7". Now both name their scale.
