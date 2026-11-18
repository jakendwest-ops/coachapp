---
id: 2026-11-17-fixed-range-or-rest-step-switches-the-sets-sheet-to-each-set-different
status: closed
priority: high
reported: 2026-11-17
status_detail: "closed 2026-11-17 under rule (b): tests/sets-sheet-grouped-stays-2026-11-17.spec.js failed 4 of 6 on the old code and passes 6 of 6 with the fix (_sfKeepGroup in sfSetRange and sfRestStep). NOT LIVE until the next release. Was: REPORTED by Jake 2026-11-17 on Chest Supported Dumbbell Row, Straight sets: changing Reps from Range to Fixed switched the sheet to 'Each set different' (Set 1: 8 reps, Sets 2-4: 8-10). Filed before the fix. CODE READ (not reproduced): sfSetRange and sfRestStep change only the one set they are drawn for and then redraw; the redraw finds the sets no longer match and shows them one at a time."
---

# Fixed / Range, or the rest − / +, switches the sets sheet to "Each set different"

Jake, 2026-11-17, editing Chest Supported Dumbbell Row on Straight sets (4 sets, 8-10 reps): he changed Reps from Range to
Fixed. The sheet switched to "Each set different: tap a set to change it" with the notice "These sets have different targets,
so each one is shown": Set 1 showed 8 reps, Sets 2-4 still 8-10. His intent: the sets stay the same unless he taps
"Customise each set"; the sheet changing view whenever he changes something is a nuisance.

## Cause (code read, not reproduced)

In the "same for every set" view only set 1's boxes are drawn (the back-offs' first set with a top set). `flushTemplateSets`
copies set 1 onto the rest of the group (`_tsPropagate`), and then the handler changes set 1 again:

- `sfSetRange` (`js/app-workouts.js` about line 2472): Fixed sets set 1's high end to its low end.
- `sfRestStep` (about line 2495): − / + changes set 1's rest.

Neither copies the change onto the other sets, so on the redraw `_tsGroupUniform` is false and `renderTemplateSets` forces the
per-set view (`custom = ... || !uniform`). Their sibling `setTsEffort` (about line 2095) already copies on in the grouped view;
these two do not.

## What would close it

**Closes when** a test that taps Fixed / Range and rest − / + in the grouped view fails on the old code (the sheet switches to
"Each set different") and passes on the new one, or Jake confirms it in the app.
