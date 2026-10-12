---
id: 2026-10-12-scope-creating-a-workout-on-the-fly-and-renaming-programs-to-training-plans
status: fixed-awaiting-jake
priority: low
reported: 2026-10-12
status_detail: "FIXED 2026-10-12 (Step 2), released in v2026.10.2; awaits Jake on his phone. Solo Workouts page: start an empty workout, start from a past session, 'Your workouts', and 'Save as a workout' on the finish screen; every visible 'program' is now 'training plan'. Tests: tests/solo-workouts-page-2026-10-12.spec.js (14; eleven of its behaviours were each broken on purpose and caught)."
---

# Scope: creating a workout on the fly, and a Workouts / Training plans split

## Jake's report (verbatim, 2026-10-12)

> 6. We need to scope how a user creates a workout on the fly, as not all users will want to create programs. Perhaps the 'workouts' page needs to be for workouts that have been created and used, and programs needs to be renamed training plans

## What exists today (for the scoping conversation)

- A freeform session: "Log a workout" on the dashboard ("Start a freeform session whenever you like") and the runner's custom workout; a workout can be saved to the library from a finished session.
- The Workouts page is the program-led view for a client (Up next hero, the program's phases and days, Recent sessions); the template library lives behind the coach/solo Workouts area.
- "Programs" is the container for phases and weeks; solo accounts add one to their plan.

## Questions for Jake (before any design)

1. Who is this for first: a solo user with no plan, a client whose PT gave them only single workouts, or both?
2. "On the fly": start empty and add exercises as you go (and then keep it), or pick from past sessions and tweak?
3. Should a finished on-the-fly session become a reusable workout automatically, or only when the user says "save"?
4. The rename: "Programs" to "Training plans" everywhere (nav, headings, copy, the coach's view too), and what does the Workouts page then hold: only created-and-used workouts, with the plan's sessions living under Training plans?

## What would close it

**Closes when** Jake approves a scoped plan (a prototype first, per his own rule), it is built and tested, and he confirms on his phone. This row is the scoping item itself; the build gets its own row.

## Decisions (Jake, 2026-10-12)

1. **Who first:** solo users with no plan (someone who just wants to train and log, without building a program).
2. **How:** start empty and add exercises as you go; nothing to set up first, and the session is logged.
3. **Reuse:** a finished on-the-fly session becomes a reusable workout only if the user taps "Save workout" on the finish screen.
4. **Rename and split:** "Programs" becomes "Training plans" everywhere; "Workouts" lists workouts that have been created and used, with a plan's sessions living under Training plans.

## Next

A tappable prototype (Workouts as created-and-used workouts, Training plans, and the empty-start flow), then his reaction, then a plan with the rename's blast radius (nav, headings, copy, the coach's view, specs) for approval. Related: the Workouts page refresh row (hero, plan and day list, recent sessions) is the same page and should be designed together.

## Prototype reaction (Jake, 2026-10-12; prototype https://claude.ai/artifact/2Qu78DKistXV61n1JhWStu)

Right as drawn: the Workouts page order (start buttons, "Up next" only while a plan is on, Your workouts, Recent sessions); "Your workouts" means workouts you have created and used (a plan's sessions join once done, anything saved from the finish screen joins); one plan at a time; rename "Programs" to "Training plans" everywhere (nav, headings, buttons, messages, the coach's screens too); build in two steps.

## Step 2 build plan (for approval; nothing built)

1. **The Workouts page** (client and solo; `renderClientWorkoutsPage`): two start buttons, then the "Up next" card only while a plan is on (a quiet note with a link to Training plans otherwise), then **Your workouts**, then Recent sessions. The plan's day list moves to its Training plan page, where it already lives.
2. **Your workouts** has no new table: the workouts you have trained from or saved, read from `workout_logs` by `template_id` (name, exercise count, last done, times done), each tagged "From a plan" (an assignment copy) or "Made by you". Tapping one starts it.
3. **Start an empty workout:** opens the runner straight on an empty workout with **+ Add exercise** (the runner's custom path, `startWorkoutRunner(clientId)`, without the setup screen). **Start from a past session** copies that session's exercises with blank sets.
4. **Save as a workout** on the finish screen, next to Finish (nothing is saved unless it is tapped, as decided): creates a reusable workout owned by the person from the session's exercises, then it appears in Your workouts. **This is the ownership-sensitive write**: it is reviewed BEFORE the commit, and I will confirm first that a client or solo account may create its own template under the current RLS. If it may not, a policy change is needed and I will show you the SQL and wait for you to run it.
5. **The rename**, visible words only: "Programs" / "program" becomes "Training plans" / "training plan" in the nav, page titles, buttons, dialogs, toasts and empty states (about 35 strings in 6 JS files, the coach's screens included), plus the specs that read those words (about 5) and the docs. Function names, table names and ids do not change.
6. **Tests:** the empty start, copy from a past session, save as a workout (the template is the person's, its exercises match), the Your workouts list and its tags, no "Up next" without a plan, and the renamed words; mutation checks on each. Reviews: three angles, the save write before the commit.
7. **Not in this step:** the coach's own Workouts library, the Dashboard and Progress screens.

## Built (2026-10-12)

The solo Workouts page (start buttons, "Up next" only while a plan is on, the plan folded away, "Your workouts", Recent sessions), "Start an empty workout", "Start from a past session" (a stand-in template that never reaches the log's template column), and "Save as a workout" (only when tapped, only for the account's own session; the empty workout is rolled back or reused if the exercises fail). "Programs" is now "Training plans" in the nav, headings, buttons, dialogs, toasts and coach screens (code names unchanged). Three reviewers; their blocking finding (a draft-resume route could leave the stand-in id on a saved session) is fixed and tested. A coached client's page is unchanged. Left as known: "Your workouts" reads every session of the account once per page open (fine at today's size, bounded by a 10,000-row refusal); an interval or cardio session saved as a workout keeps no block definition; on a phone the bottom bar label "Training plans" wraps to two lines.
