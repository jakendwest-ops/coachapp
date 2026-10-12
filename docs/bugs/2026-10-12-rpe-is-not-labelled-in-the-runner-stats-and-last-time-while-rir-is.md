---
id: 2026-10-12-rpe-is-not-labelled-in-the-runner-stats-and-last-time-while-rir-is
status: open
priority: medium
reported: 2026-10-12
status_detail: "OPEN. Reported by Jake 2026-10-12. My reading, to be confirmed with him: the runner's Stats sheet and Last time strip print RIR with its label ('@0 RIR') but RPE as a bare number ('@7'), so RPE does not read as RPE. Not built; one question to Jake first."
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
