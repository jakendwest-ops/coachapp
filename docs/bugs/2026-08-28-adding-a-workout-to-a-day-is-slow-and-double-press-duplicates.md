---
id: 2026-08-28-adding-a-workout-to-a-day-is-slow-and-double-press-duplicates
status: fixed-awaiting-jake
priority: high
status_detail: "SHIPPED 66003ce (6 commits). Duplicate proven fixed both ways: guard removed -> 2 rows, guard in place -> 1. Picker now paints immediately. Awaiting Jake double-tapping Add and Create on live."
reported: 2026-08-28
---

# Adding a workout to a day is slow, and double-pressing Add duplicates the exercise

**Jake, live 2026-08-28, verbatim:** *"When going into a live program and trying to add a new workout
for a day (example: adding a saturday workout to bigger, leaner, stronger) the create workout for
today is very slow and adding new exercises takes ages to load, and if you press the button more than
once it duplicates the exercise several times"*

Three symptoms, **one architecture**: every step is a chain of sequential un-batched Supabase
round-trips, and the button that starts each chain is never disabled. The modal-OPEN paths are
guarded; the **save** paths are not.

## This class has already caused live damage once

`scripts/fix_session_order.cjs` exists (dated 2026-06-25). Its step 1 is *"Find duplicate templates
(same name, same coach, created today)"* — a manual, service-key repair script written after the same
double-submit class hit Jake's real account. That is not a hypothetical risk; it is a repeat.

## NOT the same row as 2026-08-07

`2026-08-07-programs-builder-major-slowdown-editing-a-cardio-workout-and` covers **entering the
builder and EDITING an existing cardio workout**, and its slowness half was fixed (the eager pool
fetch was removed from `openProgram`). This row is a different surface — **adding a NEW workout to a
day, and adding exercises to it** — and the duplicate-on-double-press is entirely new.

Worth recording: that fix installed `.limit(100)` on the pool query. It is now **`.limit(2000)`**
(`js/app-programs.js`, `_refreshProgramTemplates`), raised later by the workout-picker work. Not the
cause here, but the limit did not hold.

## Root cause — verified in code, not inferred

`saveExerciseToTemplate` (`js/app-workouts.js:2075`) has **no re-entry guard**. `closeModal` runs at
`:2136` — *after* every await — so the confirm button (`#att-confirm-btn`, `:1876`) stays live and
tappable for the entire multi-second chain. Each press starts a fully concurrent run.

It is also a **non-atomic select-then-insert**: reads max `order_index` (`:2109-2116`), computes
`nextOrder`, inserts (`:2120`). Two concurrent presses read the same max, compute the same order, and
both insert. Nothing rejects the second. Three taps → three rows.

**No database constraint can close this.** `UNIQUE(template_id, exercise_name)` would refuse
legitimate work — a template may list the same exercise twice with different set schemes, which the
code contemplates explicitly at `js/app-workouts.js:2262`. `UNIQUE(template_id, order_index)` would
break `moveTemplateExercise` (`:1326`), which reorders via two sequential updates and passes through a
transient collision. **The client-side guard is the only available defence, not a convenience layer.**

## The class, counted

~37 top-level `async function`s contain `db.from(…).insert(`; **5** have any guard. Only **3** bespoke
in-flight booleans exist codebase-wide, and only one (`_saveOneRMGridPending`,
`js/app-progress.js:18/49/126`) uses `try/finally`. The other two release on the happy path only and
strand `true` forever on an unexpected rejection — silently killing that button for the session.

`saveNewTemplate` (`js/app-workouts.js:1143`) is the same shape and worse: double-tapping Create makes
**two templates AND two day slots**, with `session_order` computed from a stale count (`:1170`).

## Slowness

Opening the exercise picker awaits `_resolveEditableTemplateId` (`:1789`) then a `coach_id` fetch
(`:1791`) **before** `_openExercisePicker` is even called (`:1803`) — so nothing paints for 3-8
sequential round-trips, and the library fetch (`:1975`) is uncapped. Saving runs 4 sequential
round-trips, then an un-awaited `_afterTemplateExerciseSave` that refetches with nested embeds and
rewrites all of `#main-content`.

## Closes when

Jake opens a live program → a day → + Add exercise, sees the picker paint immediately, then
**double-taps Add hard** and gets exactly one exercise; and double-taps "+ Create new workout" and
gets one template and one slot. Plus a red→green test per symptom.

Plan: `~/.claude/plans/coupled-with-the-work-humming-shannon.md` (approved 2026-08-28).

---

## FIXED 2026-08-28 (commits `1b1b153`, `3a36080`, `2b55830`, + picker) — awaiting Jake's live check

**The duplicate.** `guardReentry(name)` (`js/app-core.js`) replaces `window[name]` with a wrapper
holding ONE `try/finally`. A registration wrapper rather than a per-function check, because inline
`onclick=` strings resolve names off the global object at click time — so it guards every call site
at once, including `saveExerciseToTemplate`'s, whose handler is assembled in a variable
(`js/app-workouts.js:1815-1817`) and interpolated at `:1876`. **An `onclick=`-based approach could
not have found this bug at all**, which is also why the class test enumerates by INSERT.

Registered on 9 paths. All **three** bespoke `_*Pending` flags are gone — only one ever had a
`try/finally`; the other two released on the happy path only and stranded permanently on an
unexpected rejection, silently killing that button for the rest of the session.

**Applying the criterion changed the list both ways.** It ADDED `copyProgramToCoaching` (a 100-line
deep copy, not confirm-gated) which the plan had missed, and EXCLUDED `generatePhasePeriodization` —
its `confirm()` blocks the main thread, so the dialog IS the re-entry barrier.

**The slowness (perceived).** `showAddExerciseToTemplateModal` awaited 2-3 sequential round-trips
BEFORE `_openExercisePicker` mounted anything, so the screen sat unchanged. `_openExercisePicker`
now accepts a **promise** for `coachId` and paints its overlay + loading state synchronously; the
two resolution queries also now run in `Promise.all` rather than sequentially, safe because
`coach_id` is invariant across the fork (`_cloneSharedMasterTemplate` copies `coach_id: tmpl.coach_id`).

## 🔴 Two corrections to my own work, recorded because both were the class I was fixing

1. **The first version of the test never reproduced the bug.** Its commit message said it did. It was
   red with `Received: 0` — the function threw on `getElementById('att-type').value` before reaching
   the insert, because the fixture omitted `att-type`/`att-notes`/`att-superset`. Red for the wrong
   reason, asserted as proof. Now verified BOTH ways: guard removed → **`Received: 2`**, guard in
   place → **1**.
2. **The class-guard test counted a COMMENT as code.** `app-core.js`'s own doc comment contains
   `guardReentry('name')` and the scanner read it as a real registration — a scanner reading prose as
   code, the same shape as the bug it exists to catch. It now skips comment lines.

## Deliberately NOT done in this pass (Jake's scope call)

The save-path query merge (touches an ownership check, wants its own review), the uncapped exercise
library fetch (wants a cache; introduces a staleness surface), and replacing `await openTemplate`
with an optimistic append (largest diff, most-rendered surface in the app).

## Also found, not fixed

`_refreshProgramTemplates` (`js/app-programs.js`) is live with **`.limit(2000)`**. The 2026-08-07
slowdown fix installed `.limit(100)`; it was raised later by the workout-picker work. Not the cause
of this bug — but that fix did not hold, which is an argument for the release discipline being
discussed separately.
