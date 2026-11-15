# Workout builder speed: build plan (NOT approved until Jake says "approved")

Scope source: `docs/superpowers/specs/2026-11-11-add-exercise-sheet-scope.md` (every line there is settled; this plan builds it).
Why: if building a workout is slow, no PT will build workouts for clients in this app (Jake, 2026-11-14).

## What the four scoping parts came to

1. **Strength form** - the redesigned Add exercise sheet (settled 2026-11-13/14).
2. **Supersets** - linked while adding, alternate set by set in the logger, own rest per exercise (2026-11-14).
3. **Creating a workout + search** - only the picker's load changes; search and the name step stay (2026-11-14).
4. **Plan builder** - its slow part is entering each exercise, and a plan's workouts use the SAME form, so part 1 covers it
   (2026-11-15). Nothing separate to build.

## Database

**No SQL.** Everything fits the columns that exist: per-set ranges, effort type, rest, `isTopSet`, `intensityBasis`
(`stored` / `topSet` / `topSetWeight`), `amrap`, `tempo`, `countdown` already live in `sets_json`; `superset_group` already
exists on `workout_template_exercises`. A superset's order is its members' existing `order_index`.

## Build order: five steps, each its own commit, reviewed (multi-agent-review) and tested before the next

Order: A, then E (so the new base exists before the form offers it), then B, C, D.

### Step A - The picker loads once (`js/app-workouts.js`)
- `_openExercisePicker` keeps the library it read in a module-level cache keyed by owner + personal flag; a later open in the same
  visit paints the list at once and does not re-read.
- The cache is updated, not discarded, when an exercise is created from the picker (`_createExerciseFromPicker`), and
  dropped whenever the Library page creates, renames, archives or deletes one (each of those write paths, counted and named in
  the commit), and on sign-out / view switch.
- Callers that use the picker: the builder, the runner's swap/add, calendar (`app-calendar-goals.js:875`), 1RM entry
  (`app-progress.js:271, 345`). All get the speed-up; none changes behaviour.
- Test: a new spec counts `exercises` requests across two picker opens (1, not 2), and that a created exercise shows on reopen.

### Step B - The new Strength form (`js/app-workouts.js`, `css/main.css`)
Applies to Weight & reps and Unilateral. **Timed hold, jumps and intervals keep today's form** (skipped for now).
- Layout per the scope's "Settled" list: Exercise + Change; Straight sets | Top set + back-offs switch; Sets | Reps, Effort |
  Rest rows; each field with its Fixed / Range switch beside the label; RPE / RIR under Effort; Rest typed or − / + 30 s (each
  range end its own).
- New exercise starts from the previous exercise's sets, reps, effort and rest, with a grey line saying so.
- "Customise each set (n) ›" row → one row of set tiles; tap to edit; red ✕ deletes; "+ Add set" copies the last.
- Top set + back-offs: Top set block, Back-offs block (How many | Reps / Effort | Rest), the base (% of top set default, % of last
  saved 1RM, % of today's e1RM) once above the Percentage. Same Customise tiles (Top set can't be deleted).
- More options chips: Type, Load, Tempo, Countdown, Notes, Last set AMRAP, Unilateral (auto-on for a unilateral exercise).
  Load = Weight (kg) | % of 1RM | % of e1RM.
- **Range rule** (closes `docs/bugs/2026-11-13-a-range-can-be-saved-with-its-high-end-below-its-low-end.md`): − / + stops at
  the other end; a typed value keeps and the other end moves to match.
- Desktop: wider sheet, Tab order Sets > Reps > Effort > Rest, Enter adds and reopens the picker.
- Footer: Cancel / Add another / Add exercise (plus the superset button from Step C), pinned to the bottom of the sheet so it
  stays in view while the fields scroll (Jake, 2026-11-15). Check at 390 px that it clears the iPhone home bar and the
  on-screen keyboard does not hide the box being typed in.
- It writes the SAME `sets_json` keys as today, so the runner, summaries and saved workouts need no change. Old workouts open in
  the new form (read path tested against existing shapes: ranges, top set, AMRAP, bodyweight, legacy blanks).
- Specs updated for the deliberate change: `workout-builder-2026-10-28`, `builder-happy-path-2026-08-22`, `builder-metric-type`,
  `template-exercise-card-actions-2026-09-29` (named now; the sweep re-counts at build time). New spec: the range rule, start-from-
  previous, Customise tiles, top-set page, at 390 px and desktop.

### Step C - Supersets in the builder (`js/app-workouts.js`)
- Footer button **"Add + superset"**: adds this exercise and reopens the picker; the next one becomes A2 (letter picked
  automatically: the next unused letter), Sets copied from A1. Pressed on A2 it makes A3; not offered on A3.
- Sets stay in step: changing Sets on one member changes all of them.
- Every member keeps its own Rest box.
- Editing a member shows **"Remove from superset"**: a pair leaves a normal exercise; one of three renumbers the rest.
- The typed "Superset group" box goes. Existing typed letters still display and run as supersets.
- The exercise list shows A1 / A2 / A3 tags and keeps the group together.

### Step D - Supersets in the logger (`js/app-runner.js`)
- One exercise at a time (Jake's option 1): tick A1 → A1's rest → screen moves to A2 by itself → tick → A2's rest → A3 or back
  to A1, for every round.
- An A1 / A2 tag and "Superset A · round n of 3" on screen; a bottom line names what's next.
- Skipping the rest moves on the same way. Moving by hand (the exercise nav) still works and never breaks the round count.
- Specs: new `runner-superset-*`; the runner nav / rest specs re-run.

## Cache-bust
`js/app-workouts.js`, `js/app-runner.js`, `css/main.css` (and any other module a step touches) bumped in that step's commit.

## Checks per step
Mutation-check each new test (break the code, watch it fail), the blast-radius sweep (coach, client, solo; every exercise type;
empty / zero / null), mobile-check at 390 px, feature-audit, multi-agent-review before the push. Release after all four, through
`release.mjs`, only on Jake's go-ahead.

## My calls (overturn any)
- The runner's own Add / Swap exercise uses the new form too (it is the same form today); it still starts at 1 set mid-session.
- The superset letter is chosen for you (A, then B, ...); there is no box to type one.
- The picker cache lasts until the page is reloaded or the library changes.

## Answered before Step B (Jake, 2026-11-15)
1. **Every % option shows on BOTH pages** ("both. all of the % buttons should be visible on both pages"). So "% of e1RM" is
   offered on Straight sets too, worked out from that exercise's best set in the LAST session (Straight sets have no top set
   today). That is a NEW base: a new `intensityBasis` value (`lastBest`, jsonb only, still no SQL) that the runner,
   `app-core.js`'s basis labels and the plan builder's periodization (`app-programs.js`, `_isTopSetBasis` callers) must all
   learn. It is its own step, E, below. With no past session the runner says it can't work out a weight, as today's top-set
   bases do.
   - My reading, to confirm at approval: on Straight sets "% of today's top set" has nothing to point at, so there it means
     **% of set 1's weight today** (set 1 acts as the top set).
2. **Other exercise types are not scoped yet** and get their own session later. In this release Timed hold, jumps and
   Intervals keep today's form unchanged.

### Step E - "% of last session's e1RM" (`js/app-core.js`, `js/app-runner.js`, `js/app-workouts.js`, `js/app-programs.js`)
- New basis `lastBest`: label "% of last session's e1RM"; the runner reads that exercise's last logged session for this
  client, takes the best set's e1RM (the existing RPE/1RM tables), and fills the target weight.
- Every `_isTopSetBasis` / basis-label caller is counted and named in the commit (today: app-core 1051-1066, app-runner
  1017/1052/1225/1420/1545, app-workouts 377/472/2040-2141/2253-2268/2445/2511, app-programs 742/2982-3113).
- Coach, client and solo; a client with no history; bodyweight and unilateral exercises. New node test for the e1RM pick,
  new runner spec.
