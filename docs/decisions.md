# Decisions

A flat, append-only, reverse-chronological log of significant, hard-to-reverse choices and why they
were made. New entries go at the top. No numbering, no per-decision files — see
[architecture.md](architecture.md) for the resulting shape, not the reasoning.

**Migrated 2026-09-15** from the Vault's `STATUS.md` "Continuity block" — ~40 dated, code-specific
engineering lessons. Most are too granular/line-specific to be "decisions" in this file's sense and
would go stale as the code changes; they're preserved in full, unedited, at
[archive/status-continuity-2026-09-08.md](archive/status-continuity-2026-09-08.md). The 5 genuinely
process-level entries below were pulled out and belong here.

---

**2026-11-14** — The logger gets a "Fill from last time" button and copy-down (Jake, after a prototype: 10 taps for 3 sets became 4). Rows still START empty and every set is still ticked by hand, so the 2026-07-11 rule stands: nothing fills on its own. Fill takes the grey number shown in each empty box (plan first, last time second), never a typed box, a ticked set, a range or effort; ticking a set copies its boxes into the next set if that set is empty and prescribes the same. Top-set exercises get neither (2026-10-03). Once used up the button stays, disabled, as "Filled from last time": removing it would pull the rows up on a tick.

**2026-11-13** — The runner's live rest timer is the REST cell of the prescription strip, not a bar above the set rows (Jake). The old bar appeared above the rows only while resting and pushed them down 65 px on every tick. A reserved always-there slot was built first and rejected: it moved the first set row about 66 px lower on every exercise, against the 2026-09-28 log-first layout, and repeated the rest the strip already shows. The cell counts down, turns red in the last 3 s and a tap skips; the strip always carries a REST cell (the timer's planned rest when the prescription names none) so it never grows. The bar's "Next: Set n" line went with it; the Next bar still names the next exercise.

**2026-11-10** — Design system Stage 4: Inter stays and the colours stay neutral until Jake chooses a brand font and colour scheme (Jake, answering the open questions from 2026-08-22). Logger density stays as it is today (he compared it with a roomier and a big-current-set layout), and the rest timer gets its space kept so the sets stop jumping when it appears.

**2026-11-09** — `audit_log` keeps 30 days (Jake approved; [script](../scripts/trim-audit-log-2026-11-09.sql)). It had never been trimmed since June and reached 583 MB of a 667 MB database, over the Free plan's 0.5 GB on 408 MB of RAM; that drained the Disk IO budget and took the project offline during a release run. Emptied once (it cannot be undone), then a nightly `pg_cron` job, `audit-log-keep-30-days`, removes older entries. Rejected: deleting only part of it, which frees no space straight away. If the database grows again, check that job first.

**2026-11-08** — Response to the simulated solo audit ([plan](superpowers/plans/2026-11-08-solo-audit-response.md)). A first-ever log is not a PR, answering R4-0 Q4, and one trophy goes on the best set. With no saved 1RM, the post-session question appears on a first log and then only on a new heaviest set. Rows still start empty (2026-07-11 stands) while a "Fill from last time" button is prototyped, not built. Progression direction is "+kg per week" in the plan builder and linked goals, both awaiting a file-by-file approval. The 2026-10-30 drop of a logger target stands.

**2026-11-08** — on the training plan page, Duplicate week and Delete week go back behind the week's ⋯ (Jake chose it in a tappable mock-up), reversing his 2026-10-16 "put them directly on this screen". The page's rule, proposed by Claude and approved with the build: on screen go the main action and what you do on most visits (Add to my plan, Open workout, + Add, Generate weeks, + Add phase); behind ⋯ go occasional actions, settings, copies and moves, and anything that removes or deletes (always asking first, in red text, never a solid red button). Plan page only; the app-wide sweep is [its own row](bugs/2026-11-08-no-app-wide-rule-for-menu-vs-on-screen-buttons.md).

**2026-11-01** — Performance pills are **Lifts · Sessions · Blocks**; Lifts say what they show (plain title, explainer, change since the start, marked best); Blocks opens on this block vs last block per lift (6-week windows when no plan runs). Merging lift names is a separate later piece ([plan](superpowers/plans/2026-11-01-performance-lifts-and-blocks.md)).

**2026-11-01** — Personal Progress has five pills, **Goals · Records · Performance · Bodyweight · Cardio**, in one 11 px row (two rows under 390 px wide). Reverses the 10-31 fold of Performance into Records (page was 9,274 px, range buried); Personal view only, no SQL.

**2026-10-31** — Personal view has four destinations: **Today, Train, Progress, More** (Jake, after a tappable mock-up; MVP item 7). Calendar opens from Today, Plans sit under Train, Goals and Cardio under Progress, the Exercise library and Settings under More; the Library's Templates tab is gone for solo (Train › Workouts covers it). Supersedes D2 (2026-09-07, a 5-item bar with a More sheet). Coach and client views unchanged ([design](superpowers/specs/2026-10-31-personal-view-four-tabs-design.md), [affordance table](superpowers/plans/2026-10-31-personal-view-four-tabs-affordances.md)).

**2026-10-30** — the runner's next-session target is DROPPED for now (Jake, after a prototype): last time's grey text already shows weight and reps, so a target only repeats it. It came from the product review, not from real use; rebuild only if Jake finds himself unsure what to lift, then as a bare "↑ +2.5 kg" signal ([plan](superpowers/plans/2026-10-29-solo-product-review.md)).

**2026-10-30** — Needs attention is ranked by `ATTENTION_RULES` (js/app-core.js); a client's own Holiday mutes it; missed counts from the day a plan was assigned (Jake).

**2026-10-29** — check-ins get a coach review: UPDATE narrowed to 3 columns, server-stamped, never pre-filled on insert ([row](bugs/2026-10-29-client-check-ins-get-no-response.md)).

**2026-10-29** — every push type-checks the nine `js/` files as classic scripts and the per-file error count may only fall (`scripts/check-types.mjs`). Archived verbatim: [archive/decisions-2026-10-29-typecheck-and-wiki.md](archive/decisions-2026-10-29-typecheck-and-wiki.md).

**2026-10-29** — coach work starts, for a 25-client roster (overrides the 2026-09-26 roster deferral); a client's current plan is the most recently STARTED one, never the newest-assigned. Archived verbatim:
[archive/decisions-2026-10-29-coach-current-plan.md](archive/decisions-2026-10-29-coach-current-plan.md).

**2026-10-29** — the old LLM wiki is dead to CoachApp too: everything lives in this repo. Archived verbatim: [archive/decisions-2026-10-29-typecheck-and-wiki.md](archive/decisions-2026-10-29-typecheck-and-wiki.md).

**2026-10-28** — the exercise builder is rebuilt around set groups with a third "% of" choice (`intensityBasis: 'topSetWeight'`, the old `'topSet'` keeping its meaning of today's estimated 1RM), and the runner's beeps are rebuilt after the page is hidden (Jake: "fix using beeps"). Archived verbatim:
[archive/decisions-2026-10-28-builder-and-beeps.md](archive/decisions-2026-10-28-builder-and-beeps.md).

**2026-10-25** — three SQL scripts applied (a guard so a coach cannot link a row to another coach's client; every `anon` privilege revoked, so signed-out requests answer 401; two `search_path` pins), the Security Advisor read (5 by design, 2 fixed, 1 not on this plan), `invite-client`'s source committed. And the runner never speaks: timer cues are tones, because any `speechSynthesis` call stops Spotify on iOS 18. Archived verbatim:
[archive/decisions-2026-10-25-security-and-runner.md](archive/decisions-2026-10-25-security-and-runner.md).

**2026-10-18** — the data-leak and PII audit: five push gates (`check-secrets`, `check-sql-definer`, `check-external-surface`, `check-pii-logs`, `check-query-scope`), each mutation-tested (129 of 129); two unanchored reads fixed. Archived verbatim:
[archive/decisions-2026-10-18-data-leak-audit.md](archive/decisions-2026-10-18-data-leak-audit.md).

**2026-10-12 to 2026-10-17** — the Personal account's Workouts page (the plan first, "Create a workout", a search, Edit in place, a plan lock) and "Programs" renamed "Training plans" everywhere they are read (one plan at a time for a solo account). Archived verbatim:
[archive/decisions-2026-10-12-to-2026-10-17-workouts-page.md](archive/decisions-2026-10-12-to-2026-10-17-workouts-page.md).

**2026-10-11** — CI pins Node 24 like the dev machine; `node scripts/verify-live.mjs <tag>` checks a release byte for byte; `savePeriodizationConfig` row-checks its writes. Archived verbatim:
[archive/decisions-2026-10-11-node24-live-check-row-checks.md](archive/decisions-2026-10-11-node24-live-check-row-checks.md).

**2026-10-05 — The Vault severing was verified on files and never on the session's folder: a desktop session rooted in the Vault ran CoachApp for 16 days. Fixed at the root, and made to refuse** (a SessionStart guard, three `os-lint` checks, one merged memory folder, CLAUDE.md saying the ROOT must be the repo). The summary that stood here, verbatim: [archive/decisions-2026-10-05-vault-rooted-summary.md](archive/decisions-2026-10-05-vault-rooted-summary.md); the full entry: [archive/decisions-2026-10-05-vault-rooted-session.md](archive/decisions-2026-10-05-vault-rooted-session.md).

**2026-10-05 (docs budget)** — the four red `os-lint` checks (`docs-budget`, `context-budget`, `ritual-budget`, `doc-obligations`) cleared by moving detail into `docs/archive/` verbatim,
never by raising a ceiling; each budget then re-pins to its new size, so headroom is always about 2% and older entries must be archived as they age. Full entry:
[archive/decisions-2026-10-05-docs-budget-trim.md](archive/decisions-2026-10-05-docs-budget-trim.md).

**2026-09-26 to 2026-10-04** — archived verbatim in
[archive/decisions-2026-09-26-to-2026-10-04.md](archive/decisions-2026-09-26-to-2026-10-04.md). It holds: the program-page rework and RPE periodization, the
pre-push review as a hard gate in `release.mjs`, a release tag pushed only after GitHub's check is green, a push running static checks only, the
transactional `assign_program()`, the 2026-09-27 operating-system cut-back, and the `clients.coach_id` re-point trigger.

---

**2026-09-19 to 2026-09-21** — the unbounded-reads ratchet, local SQL execution (PGlite), paged reads of growing tables,
automatic error capture and the feedback link, deleting the Benchmarks tab — archived verbatim in
[archive/decisions-2026-09-19-to-2026-09-21.md](archive/decisions-2026-09-19-to-2026-09-21.md).

**Older entries (2026-09-15 to 2026-09-18)** — the repo becoming the system of record, the full Vault severing,
predictions moving into the repo, ritual markers, and the OS retrospective — are archived verbatim in
[archive/decisions-2026-09-15-to-2026-09-18.md](archive/decisions-2026-09-15-to-2026-09-18.md).
