---
id: 2026-10-16-workouts-page-rework-plan-first-create-a-workout-search-and-edit-in-place
status: open
priority: medium
reported: 2026-10-16
status_detail: "OPEN. Phase 1 (the Personal account's page) approved by Jake 2026-10-16 and BUILT 2026-10-17 and released in v2026.10.5 (awaiting Jake's phone check): plan first, Create a workout (Choose a template / Create new), Train now link, search by name, Edit and Make a copy per row, and the plan lock. Library page left alone by his choice. Phase 2 (the PT page: a Client filter, search and paging on the server, one shared code path) is not started and needs its own plan. Closes only on Jake's phone check for BOTH roles; see 'Phase 1' below."
---

# Workouts page: plan first, "Create a workout" with two choices, search instead of "Start from a past session", edit in place, and one page for solo AND PT

## Jake's report (verbatim, 2026-10-16)

Attached: two screenshots of the Workouts page in Personal view (a cropped one with the two start buttons, and a full one: "Start an empty workout" and "Start from a past session", the "Up next · Today" plan card ("Heavy Bench / Light Press", "Operation 240 · Mesocycle 1 · Week 1", Start), a folded "Your plan · Operation 240", then "Your workouts" with rows that expand, a "From a plan" badge and a Start button each). He selected the "Start an empty workout" button and the whole `main#main-content`.

> 1. If on a training plan/program then this section needs to be at the top as it is a priority.
> 2. 'Start empty workout' needs to be reworded to Create a workout
> 3. 'Start from a past session' seems redundant if all of the workouts are below it anyway. There should be a search bar that allows users to search for workouts by name, and I think the 'create a new workout' should have 2 choices after it > choose template and create new
> 4. from the list of existing workouts the users should be able to click it to expand (as it already does) and there should be an edit button, if the user wants to edit a previously created workout. NOTE: Workouts that are in an ACTIVE program cannot be amended on this page, and they can only be amended within the Training Plan.
>
> We need to think about how a training plans are created, stored and displayed on this page. Although we are currently building this for the personal account, this will be the same page that a PT uses, and they could have hundreds of workouts stored on this page as they could have dozen (hundreds) of clients and therefore several hundred workouts.
>
> Use cases > Personal account: User may not be on a program and may just want to use the app to track their progress and make a few independent workouts (back, arms etc) and have them stored here ready for use, or for them to make workouts whilst they are in the gym during a workout. The app needs to be able to handle someone making a workout quick and easy, or using a template/copying an older workout and tweaking it.
>
> Use case > PT: A personal trainer will need to make several workouts for each one of their clients. Whilst some will use the training plans/programs feature to set their clients up with training blocks (etc a standardised 6 week block), they may also make workouts for their clients similar to the above. The workouts needs to clearly defined and laid out on this page.
>
> We need to think about the long-term for all of our builds now. We may be coming to a point where the bulk of the personal account has been built, and we need to move our attention to how the PT side of the app functions. The app will need to function similar for both accounts and we cant afford to differ too with UI, functionality, code decisions etc because it will confuse you, me, and any users of the app.
>
> I appreciate that this is a large piece of work, so it will likely take several scoping sessions.

## What the code does

Read-only look, 2026-10-16. There are THREE different Workouts pages behind `renderWorkouts` (`js/app-workouts.js` ~617):

- **PT / coach** (`renderWorkoutLibrary`, ~622): title "Workouts", "+ New template" (a name and description modal, then the template editor `openTemplate`), tabs Templates / Exercise Library, a name filter (`filterTemplates`, ~960, done in the browser over rows already loaded, and remembered across navigation because "find one to edit" is the page's whole purpose). The list (`renderWorkoutTemplates`, ~976) is the coach's own reusable library only (`client_id` null, `program_id` null, `generated_from_phase_id` null, `is_personal` false), newest used or edited first, **`.limit(100)`**. A click opens the editor. Workouts made for a specific client (`client_id` set) are NOT on this page.
- **Coached client** (`renderClientWorkoutsPage`, ~732): the plan card ("Up next"), the plan's day list, and a flat template list only when there is no plan. Unchanged by the 2026-10-12 work.
- **Solo's own page** (same function, `isOwn`, ~744; built 2026-10-12-13 from a prototype, `docs/decisions.md` 2026-10-12): the two start buttons (`_wkStartHtml`, ~4040), "Up next" or a no-plan note, the plan folded away, "Your workouts" (`_yourWorkoutsHtml`, ~4105: the account's personal templates plus any plan session it has trained from, each with last done and times done, "From a plan" or "Made by you", expandable in place, a Start button, NO edit button), Recent sessions.
- "Start an empty workout" (`startEmptyWorkout`, ~4054) launches the LIVE runner on a blank session; "Start from a past session" (`showStartFromPast`, ~4064) lists the last 10 logged sessions in a modal and opens one's exercises as a new blank-sets workout. A session becomes a reusable workout only through "Save as a workout" on the finish screen.
- **Scale facts:** the API returns at most 200 rows per request whatever `.limit()` says (measured 2026-09-20, noted in `renderWorkoutTemplates`), and the PT list today loads at most 100 and filters in the browser. That is fine for a solo account and wrong for "hundreds of workouts": a PT page needs the search and the paging done on the server. `_fetchAllRows` already pages a read.
- The three pages share almost no code, which is Jake's "we cannot afford to differ" concern already true.

## Scoping answers (Jake, 2026-10-16, clickable form)

- **Create a workout:** two choices, **Choose a template** and **Create new**. Create new opens a BUILDER that saves the workout (name, add exercises, it lands in the list, Start is one tap after). A blank live session stays reachable as a small **"Train now"** link for the in-gym case (the old "Start an empty workout" behaviour).
- **Choose a template picks from:** his own saved workouts; a past session he logged (this replaces "Start from a past session", so nothing is lost); and, for a PT only, a workout made for another client. NOT ready-made starter workouts.
- **PT's first look:** one list with a search box and a Client filter beside it (All, Mine, then each client); search and paging done on the server, 20 at a time.
- **Next step:** a tappable prototype of the SAME page as a solo user and as a PT with about 200 example workouts. Nothing is built into the app until he says approved. **Prototype published 2026-10-16** (private Artifact, example data only): https://claude.ai/artifact/PqNJdoUzPe1ubs6pbcGVz8. He liked the prototype and approved building Phase 1 (Personal account), leaving the Library page for Phase 2.

**Closes when:** Jake confirms on his phone that the reworked Workouts page works for a solo account AND for a PT (the same page and the same code), and the Playwright specs written red-first as it is built pass in the full suite. A prototype or a merged build is not closure.
- Assumed, to be confirmed in the prototype: workouts that belong to a plan the user is CURRENTLY on show a lock and "Edit in Training plans" instead of Edit; once a plan finishes or is removed its copies are ordinary workouts and become editable.

## Phase 1 (Personal account), built 2026-10-17

All four of Jake's points, in `js/app-workouts.js`: the plan block first; Create a workout opening two choices (Create new = a name, then the existing editor, saved at once; Choose a template = My workouts, which saves a "Copy of ...", or Past sessions, which saves a workout of that session's exercises); a small "Train now" link for the blank live session; a search by name; Edit and Make a copy on each row. A workout in the plan the account is on NOW has no Edit (it names the plan, offers "Open in Training plans", and Make a copy still works); once that plan has run its course (the "Training plan complete" reading) or is removed, its workouts are ordinary. One shared helper (`_createPersonalWorkout`) now makes a personal workout for the Workouts page and for "Save as a workout" on the finish screen. No database change. Specs: `tests/workouts-page-rework-2026-10-16.spec.js` (18) and `tests-node/workouts-model.test.mjs` (37), each safeguard broken on purpose and caught.

**Known limits (named, not fixed):** editing an unlocked weekly copy edits that one week; the lock follows only the newest assignment; the page reads the account's newest 100 workouts and says so at 100; an expanded row folds when the search changes or Show more is tapped; "Open in Training plans" leaves the sidebar highlight on Workouts.

**Phase 2 (PT), open:** the same page for a coach with hundreds of workouts across clients: a Client filter (All, Mine, each client), search and paging done on the server (20 at a time; the API returns at most 200 rows per request), "a workout made for another client" as a template source, and the Library page folded in. Needs its own plan and a prototype review before any build.

## Parts (as Jake numbered them)

1. Plan section first when the user is on a plan.
2. "Start an empty workout" becomes "Create a workout".
3. "Start from a past session" goes; a search-by-name bar is added; "Create a workout" offers two choices: choose a template, or create new.
4. An Edit button on an expanded workout row, except for workouts in an ACTIVE program, which can be amended only inside the Training Plan.
5. The design has to hold for a PT with hundreds of workouts across dozens of clients, and match the personal account's page (one page, one set of code decisions).
