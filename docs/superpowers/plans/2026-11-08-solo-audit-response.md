> **Provenance and status (2026-11-08).** The response to the simulated solo-lifter audit
> (the full report is kept uncommitted in `docs/archive/2026-11-08-solo-lifter-audit/`), checked against the code, `decisions.md` and the
> [2026-10-29 solo review](2026-10-29-solo-product-review.md). **Nothing here is built or approved.** Each phase needs Jake's
> "approved" (CLAUDE.md rule 8).
>
> **Jake's answers (2026-11-08):** Phase 1, all ten items, approved, with no PR on a first log. Logging: prototype the Fill button only.
> Progression: "+kg per week" in plans. Goals: link them. Phase 2a and 2b still need a file-by-file approval before building.

> **Status (2026-11-08):** Phase 1 is committed locally on top of `a5868ea`, not pushed. Phase 2a is built with one amount per phase and committed locally. Phase 2b is built, SQL applied live, uncommitted: a lift goal counts the heaviest set since the goal began, and a finished goal saves its number. Phase 4b (wording) is pushed. Phase 4a and most of 4c are done; Finish and Save stay separate (Jake asked for the Finish question on 2026-10-11) and the rest-timer jump needs his look. Phase 3 is built, with no SQL; see the notes under Phase 3 for where it is narrower than written.

# Solo audit response

## How to weigh the report

The audit's "user" was a simulation informed by competitor apps, so its requester is a document and not a person. Findings that are
plain defects stand on their own. Feature requests do not, until someone hits them in real training
(`feedback_research_vs_real_use`).

## Report corrections after reading the code

- "Not used yet" in the plan picker means not used in a plan (`js/app-programs.js:3495`). It is ambiguous wording, not false data.
- The 1RM question appears whenever a lift has no saved 1RM, because the baseline is then 0 (`js/app-runner.js:3595`). That explains
  a prompt after a session with no records. It is still a flaw.
- The trophy on a weaker set is because every set at the top weight gets one (`js/app-runner.js:3163`).
- Seeded exercises already have muscle groups. Only user-created ones lack them.
- The 32×32 delete button was accepted by Jake on 2026-09-27. It is left alone here.

## Items that conflict with Jake's decisions

| Report item | Decision | Treatment |
|---|---|---|
| Tap ✓ to accept grey numbers; carry set 1 down | 2026-07-11: a pre-filled value can't be told apart from an entered one, so rows start empty (`js/app-runner.js:889`) | Not built as written. Option: a prototype of an explicit "Fill from last time" that turns values white, with each set still ticked |
| Next-session target in the logger | 2026-10-30: dropped after a prototype, rebuild only if Jake is unsure what to lift, as a bare "↑ +2.5 kg" | Not built unless Jake reopens it |
| First-ever log counts as a PR | Open since 2026-09-19 (R4-0 Q4) | Jake's answer needed |

## Phase 1: fixes (bounded, no SQL, no schema)

| # | Change | File |
|---|---|---|
| 1 | Rest shows "3:00", not "3:00–0:00": use `_hasTimeTarget` for the maximum | `js/app-runner.js:1126` |
| 2 | Solo session screen says "Notes", with a non-coaching prompt. Coach and client unchanged | `js/app-runner.js:4523` |
| 3 | Keyboard Enter picks the top exercise or creates the typed one, guarded against double creation | `js/app-workouts.js:2925` |
| 4 | "Not used yet" becomes "Not in a plan yet" | `js/app-programs.js:3495` |
| 5 | Saving a workout shows "Workout saved" (it has no success message today) | `js/app-workouts.js:3413` |
| 6 | Train's Recent sessions row shows the workout name | `js/app-workouts.js` |
| 7 | Find the cause of the 406 on opening a session | `js/app-runner.js` |
| 8 | PR badges: one per exercise on the best set; none on a first-ever log if Jake agrees | `js/app-runner.js:3090-3176` |
| 9 | With no saved 1RM, ask on a first log and then only on a new heaviest set (a rep record at the same weight doesn't ask). A saved 1RM works as before | `js/app-runner.js:3595` |
| 10 | Month calendar shows done and missed; hides "No events this month" when workouts are visible | `js/app-calendar-goals.js:230` |

Gates: bump `?v=` on the four changed modules in `index.html`; a spec per item, mutation-checked; sweep specs that assert the old
text; `mobile-check` and `feature-audit`; `multi-agent-review` before push.

## Phase 2: progress that moves (depends on Jake's answers)

- **2a. "+kg per week" in Add periodization.** A third method beside % of 1RM and RPE. Weeks 2+ take Week 1's weight plus a step, with
  a per-exercise preview. Targets then rise in the plan with no new logger feature. Files: `js/app-programs.js` (`showPeriodizationModal`,
  `generatePhasePeriodization`). Stored in `periodization_config`; confirm at build that no column is needed. It touches
  `_verifyPhaseOwnership` paths, so review before commit. Note that Generate replaces Weeks 2+, and assigned-plan propagation is the open R5 question.
- **2b. Linked goals.** Choose a lift or bodyweight when creating a goal. Progress is worked out from logged data when read, never stored
  a second time. Today shows progress. Files: `js/app-calendar-goals.js`, `js/app-dashboard.js`. Draft SQL, to be checked against the schema
  and `sql-safety` first:
  `alter table public.goals add column if not exists linked_exercise_id uuid references public.exercises(id) on delete set null, add column if not exists linked_metric text check (linked_metric in ('bodyweight','e1rm','top_set'));`
- **2c. "Fill from last time" prototype,** only if Jake asks for it. A private tappable page, no app code.

## Phase 3: tell the story

Mostly reads, no SQL unless noted. Answers "is it working?".

- A progress headline, lifts ranked by change, and stalled lift markers (`js/app-progress.js`).
- Week 1 against the latest week, per lift.
- After a missed session, offer Do it today or Skip on Today (`js/app-dashboard.js`).
- One history list in place of the two; Train's Recent sessions and Performance > Sessions agree.
- Records worked out from logged sets, so Records and Performance can't show different numbers for one lift.
- Bodyweight: kg per week and a projected date.
- One target bodyweight: Goals and the Bodyweight tab stop holding separate targets.
- Today says when a linked goal's number could not be read.

Built 2026-11-09, narrower than written in three places:
- **One history list** is a "See every session" link from Train to Performance > Sessions. Train keeps its newest five.
- **Records** keeps the saved 1RM, because %1RM sets are worked out from it. When logged training beats it, the row adds "Logged best ≈". Nothing overwrites a saved number.
- **One target bodyweight** applies while a goal follows body weight: that goal supplies the start and target on both weight pages and the Bodyweight editor steps aside. With no such goal the editor works as before.
- The missed-session offer stays away when today has its own session, because a run is logged against today and would tick that one off as well. Skip is remembered on that device only.

## Phase 4: faster building, one language, one look

Each part needs its own file-by-file approval. Interaction counts are from the audit.

**4a. Fewer taps to build and finish**
- Workout build, about 35 interactions down to about 15: Add exercise opens at 3 sets, one reps box (a range behind a link), expert fields folded away, and "Add another" keeps the sheet open.
- Plan build, about 18 down to about 10: the first phase is made for you, name and weeks go on one form, and the start date defaults to next Monday.
- Merge the Finish question and Save into one step with a way back.
- Reserve the rest timer's space so the set rows don't jump after a tick (Jake chose this on 2026-11-10; logger density stays as it is).
- Show a workout once in Your workouts, with its plan and own runs counted together.

**4b. One language (Jake chooses the words first)**
- Proposed: workout (what you build), session (what you did), plan (the weeks), block or phase (one word, not both).
- Remove "template" from screens: `+ New template`, "Add exercises to build this template" and "Delete template?" are still in `js/app-workouts.js`.
- For solo, replace "Add to my plan" and "Assign" (`js/app-programs.js:1002`, `:1019`) with "Start this plan".
- Give the three "Save workout" meanings three different labels.

**4c. One look**
- One screen-by-screen pass at 390px against the existing patterns, with screenshots.
- Every form is a bottom sheet; Add phase is still inline.
- One primary button per screen; Start and Save compete today.
- A minimum text size, keeping the 11px Progress pills Jake chose on 2026-11-01; 9px and 10px text goes.
- 44px close buttons and toggles on sheets.
- Workout names no longer cut off in Your workouts and the calendar.
- "1 phase" shown once in the plans list (`js/app-programs.js:1154`, `:1158`).
- The Resume offer appears on Today and Train after a reload.
- Depends on Jake's open design-system answers (brand typeface, runner density).

## Phase 5: wait for real lifters

Editing saved sessions (ownership work), Jake's 4-6 ready-made plans (MVP 5), sign-up and setup (MVP 4), reminders, muscle groups on new exercises and per-muscle volume,
warm-up sets, health integrations, and coaching-style advice. Two real lifters for two blocks should rank these (MVP 1).

**Left as accepted:** the 32×32 delete button (Jake, 2026-09-27).

**Not planned:** social feed, leaderboards, marketplace, AI programming. These are competitor features with no user behind them.

## Before any full suite

The audit's data is still on the PT test account and could fail solo specs that assume no history. Clear it first, with Jake's say-so.

## Requires Validation

- The audit and Phase 1 were run on local master at `3281c94`, 5 commits behind `origin/master` (`a5868ea`, 2026-11-08). Those commits changed the plan page, Today's week card and Sessions, so audit findings on those screens may be out of date. Phase 1 must be re-tested after it is merged onto them.

- Phase 1 items 6, 7 and 10 were observed in the app, but their exact code sites are confirmed at build.
- Whether `periodization_config` can hold a kg step without a schema change.
- Everything about real phones: the audit was in a phone-sized desktop browser.
