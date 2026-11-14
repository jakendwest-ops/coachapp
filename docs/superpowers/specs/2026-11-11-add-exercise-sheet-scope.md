# Add exercise sheet: what is settled (scoping, NOT approved to build)

> **PARKED 2026-11-13 by Jake ("this looks good for now").** Where it stands: the working demo
> (https://claude.ai/artifact/5nSU2ah4d9yhsSbgrAZB5o, private; source in the session scratchpad, not the repo) shows everything below.
> Still open when it resumes: Fixed / Range under the box (A) or beside the label (B); Bodyweight as a Load option; point 2 and
> More options / Type / desktop / look not yet re-confirmed point by point; "Top set has no Reps field" never reproduced; then
> Superset, the other exercise types, exercise search, the plan builder. No plan is written and nothing is approved.

The single list every workbench change is checked against. If a request clashes with a line here, ask Jake
before building; never trade a settled line away quietly. Workbench: https://claude.ai/artifact/Hy4kMJdBWPFZtW5ZYXZKQk
(private). Code today: `js/app-workouts.js` `_showExerciseSetsModal`.

## Settled (Jake's answers)

**Order, top to bottom:** Exercise (name + Change) · How are the sets set up? · Sets / Reps / Effort / Rest ·
Customise each set link · More options chips · Cancel / Add another / Add exercise.

1. **Set style** is a two-way switch at the top: Straight sets | Top set + back-offs. "Customise each set" is a small link under the fields, not a third option.
2. **Sets and Reps on one row, Effort and Rest on the next.** Boxes are only as wide as the value, never stretched across the row.
3. **Reps, Effort and Rest** are one box each, with a Fixed / Range switch. Effort also has RPE / RIR.
4. **Rest** can be typed and has − / + (30 seconds a tap). On Range each end has its own − / +, and Rest stays beside Effort. It starts as the previous exercise's rest.
5. **A new exercise starts from the previous exercise's** sets, reps, effort and rest (not past workouts, not blank).
6. **Customise each set:** all the sets shown together in ONE ROW, side by side (Set 1 | Set 2 | Set 3 | Set 4); tap a set to edit its reps, effort and rest (changed 2026-11-13, was one line per set). An open set uses the same fields as the form above. Delete a set with a red ✕ like the runner's. No AMRAP / Bodyweight / Remove pills.
7. **Top set + back-offs:** two blocks, every field with Fixed / Range. Back-off weight is a % of a base the coach picks once: % of top set (default), % of last saved 1RM, or % of today's e1RM. The % has a Same for all | Each different switch.
8. **More options** is one row of chips for the rarely used extras: Type, Load, Tempo, Countdown, Notes, Last set AMRAP, Unilateral. Each adds its own box with a ✕. Load is ONE chip with a 3-way choice (kg, % of 1RM, bodyweight).
9. **Type** is called "Strength" and lives in More options (a "Type: Strength" chip). Unilateral switches on by itself when the exercise's saved type is unilateral.
10. **Desktop:** a wider sheet with the same two-per-row fields; keyboard flow (Tab through Sets > Reps > Effort > Rest, Enter adds, the picker reopens). No quick-entry line.
11. **Look:** CoachApp's own controls and stylesheet. One label style, every value box the same size, each switch in the same place on every field.

**Re-confirmed 2026-11-13 (point by point):** 1 kept · 2 not answered yet · 3 kept (Sets as the − / + stepper; Reps Fixed / Range; Effort Fixed / Range with RPE / RIR) · 4 kept, and on Range each end keeps its own − / + 30 s so no rest time has to be typed · 6 changed (sets in a row) · 7 kept, Top set + back-offs laid out like Straight sets, the three bases confirmed (the first is the saved 1RM).

**Changed 2026-11-13 from the working demo:** Rest on Range = two boxes the SAME SIZE as Reps on Range (62 px each), side by side, each with its own − / + 30 s underneath, so Rest stays beside Effort and the four fields stay in line (later the same day; replaces "stacked" and "full-row steppers"). Back-offs "Each different" = reps AND % per back-off (the shared back-off Reps field hides). Load = Weight (kg) | % of 1RM | % of e1RM (Bodyweight left out: Jake to confirm).

**One Customise each set (Jake, 2026-11-13):** Top set + back-offs gets the SAME "Customise each set" link, row of set tiles and editor as Straight sets (tiles: Top set, Back-off 1, 2…; a back-off's editor adds its %; the top set cannot be deleted; "+ Add back-off" copies the last). The back-offs' Same for all / Each different switch is REMOVED (replaces that part of point 7 and the 2026-11-13 per-back-off reps table). The back-off base stays one choice for all back-offs, shown above the tiles.

**Top set page = Straight sets layout (Jake, 2026-11-13):** no field sits above the blocks. "Top set" = Reps | Effort / Rest; "Back-offs" = How many | Reps / Effort | Rest, the same grid and positions as Sets | Reps / Effort | Rest; then the base choice and Percentage. Each block has its OWN rest, and back-offs get their own effort (my call, matching the Customise tiles; answers open question 3 for this screen). The sections are separated by a line, not boxed, so their fields line up with Straight sets. "Customise each set (n) ›" is a full-width outlined row on both pages (was a text link).

**Range rule (Jake, 2026-11-13):** on every range (reps, effort, rest; main, each set, top set, back-offs) the right end can never be below the left. My call on HOW: a − / + button stops at the other end; a typed value stays and the other end moves to match.

## My calls, to confirm or overturn

- "+ Add set" copies the last set.
- The delete ✕ is 32px, the runner's size, which is below the 44px tap size used elsewhere.
- A grey line under the exercise says what was copied from the previous exercise.
- On desktop, Top set sits above Back-offs (side by side squeezed the base buttons).
- "Add another" in the footer (adds this one and opens the picker again).

## Open, in the order to settle them

1. **Where the Fixed / Range switch goes:** under the box (layout A) or beside the label (layout B).
2. **"Top set has no rep field":** not reproduced. Reps shows under Top set (3) and Back-offs (8) at every width tried. Which screen?
3. **"For B, rest into each set":** Top set + back-offs (separate rest for top set and back-offs), or Customise each set in layout B?
4. **Set style's place:** your saved layout A moved it into More options. Top of the sheet (as 1 says) or More options?

## Parked / not scoped yet

- Hiding chips that do not apply to a type (waits on the other types).
- What Countdown does for strength sets: UNVERIFIED.
- Superset (its own job), other exercise types (timed hold, jumps, intervals), exercise search and creating a workout, the plan builder.
