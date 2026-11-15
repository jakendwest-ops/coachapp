# Add exercise sheet: what is settled (scoping, NOT approved to build)

> **RESUMED 2026-11-14:** the Strength sheet is fully settled (see "Answered 2026-11-14"); Jake chose to scope everything before
> building, starting with Superset. Still nothing approved to build.
>
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

## Answered 2026-11-14 (Jake, in the demo's "Still to decide" panel)

- **Fixed / Range switch: beside the label (layout B).** RPE / RIR therefore sits under the Effort box.
- **Load stays Weight (kg) | % of 1RM | % of e1RM.** No Bodyweight option.
- **Point 2 kept:** Sets and Reps on one row, Effort and Rest on the next, boxes as wide as their value.
- **All five "My calls" above kept.**
- **Scope everything before building** (not the Strength sheet first). Next to scope, in order: Superset, the other exercise types (timed hold, jumps, intervals) and which chips apply to each, exercise search and creating a workout, the plan builder.
- The earlier open questions 2-4 were answered on 13 Nov (Reps never reproduced missing; each block has its own rest; set style stays at the top).

## Superset (scoping started 2026-11-14)

Today: a typed letter on the Add exercise form, shown as an "SS: A" tag; the logger ignores it (its auto-advance was removed 2026-08-11, `js/app-runner.js` ~1901).

- **How Jake runs one:** A1 bench, A2 row, alternate set by set, ONE rest after the last exercise of the round, none between them.
- **Group size:** 2 or 3 exercises (A1, A2, A3). Never more.
- **Linked while adding** (not afterwards on the list), with an **"Add + superset" button** in the footer (Jake chose option 2, 2026-11-14): pressed on A1, it adds A1 and reopens the picker; the next exercise becomes A2 with Sets following A1. Pressed again on A2 it makes A3, the limit.
- **Every exercise in the group keeps its OWN rest box** (Jake, 2026-11-14; replaces "rest on the last exercise only", agreed minutes earlier, and the mock-ups' "Rest after round"). A1's rest is the gap before A2; the last exercise's rest is the gap before going back to A1.
- **In the logger:** tick A1, A1's rest counts down, then A2; tick A2, A2's rest, then A3 or back to A1; repeat for every round. (Today's logger ignores supersets, so this is new logger work.)
- **Logger layout: one exercise at a time** (Jake chose option 1, 2026-11-14): each exercise keeps today's screen with an A1/A2 tag and "Superset A · round n of 3"; when a rest ends the screen moves to the next exercise in the round by itself; a line at the bottom names what comes next.
- **Undo:** editing an exercise in a superset shows "Remove from superset" (Jake, 2026-11-14). My calls: removing one member of a pair leaves the other as a normal exercise; removing one of three renumbers the rest (A1, A2).
- **Sets are always equal across the group** ("never happens, keep equal"). My reading: the builder keeps them in step, so changing Sets on one changes them all (to confirm when the builder is mocked).

## Other exercise types (2026-11-14)

Jake: timed hold, jump height, jump distance and intervals are used rarely, so they are skipped for now. My reading, to confirm at plan time: picking one of those types keeps today's form for that exercise until it is scoped.

## Creating a workout and exercise search (scoping started 2026-11-14)

- **The slow step is the picker** (Jake, 2026-11-14: "there was a delay", then "yes, the picker"). Cause, read from code, timing
  NOT measured: `_openExercisePicker` (`js/app-workouts.js` ~2918) re-reads the whole library on EVERY open, 200 rows per
  request, one request after another, nothing kept between opens, so "Add another" pays it again per exercise.
- My proposed fix, to confirm at plan time: load the library once per visit and keep it; a newly created exercise is added to
  the kept copy; the picker opens with the list already there.
- **Jake finds exercises by typing, not scrolling** (2026-11-14). Today's search is a plain "name contains the typed text"
  filter, alphabetical, no ranking (`_renderExercisePickerResults`).
- **Search results are fine:** the wanted exercise "comes up" (Jake, 2026-11-14). So search matching is NOT in scope; only
  the load is.
- Today's path to the first exercise (`showCreateTemplateModal` / `saveNewTemplate`, ~1397): New workout → a modal asking
  Name (required) + Description → Create → the empty editor → Add exercise → picker (the slow load) → pick → sets form.

## Parked / not scoped yet

- Hiding chips that do not apply to a type (waits on the other types).
- What Countdown does for strength sets: UNVERIFIED.
- Superset (its own job), other exercise types (timed hold, jumps, intervals), exercise search and creating a workout, the plan builder.
