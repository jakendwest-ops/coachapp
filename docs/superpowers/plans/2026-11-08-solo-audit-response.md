> **Provenance and status (2026-11-08).** The response to the simulated solo-lifter audit
> (the full report is kept uncommitted in `docs/archive/2026-11-08-solo-lifter-audit/`), checked against the code, `decisions.md` and the
> [2026-10-29 solo review](2026-10-29-solo-product-review.md). **Nothing here is built or approved.** Each phase needs Jake's
> "approved" (CLAUDE.md rule 8).
>
> **Jake's answers (2026-11-08):** Phase 1, all ten items, approved, with no PR on a first log. Logging: prototype the Fill button only.
> Progression: "+kg per week" in plans. Goals: link them. Phase 2a and 2b still need a file-by-file approval before building.

> **Status (2026-11-08):** Phase 1 is committed locally on top of `a5868ea`, not pushed. Phase 2a is built with one amount per phase, uncommitted. Phase 2b is next and needs approval.

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

## Phase 3: tell the story (read-only, no SQL)

In `js/app-progress.js`: a progress headline, lifts ranked by change, stalled lift markers, Week 1 against the latest week.
On Today, `js/app-dashboard.js`: after a missed session, offer Do it today or Skip. One history list in place of the two.

## Phase 4: wait for real lifters

Editing saved sessions (ownership work), a vocabulary pass, hiding phases, Jake's 4-6 ready-made plans (MVP 5), sign-up and setup (MVP 4),
reminders, per-muscle volume, warm-up sets, health integrations. Two real lifters for two blocks should rank these (MVP 1).

**Not planned:** social feed, leaderboards, marketplace, AI programming. These are competitor features with no user behind them.

## Before any full suite

The audit's data is still on the PT test account and could fail solo specs that assume no history. Clear it first, with Jake's say-so.

## Requires Validation

- The audit and Phase 1 were run on local master at `3281c94`, 5 commits behind `origin/master` (`a5868ea`, 2026-11-08). Those commits changed the plan page, Today's week card and Sessions, so audit findings on those screens may be out of date. Phase 1 must be re-tested after it is merged onto them.

- Phase 1 items 6, 7 and 10 were observed in the app, but their exact code sites are confirmed at build.
- Whether `periodization_config` can hold a kg step without a schema change.
- Everything about real phones: the audit was in a phone-sized desktop browser.
