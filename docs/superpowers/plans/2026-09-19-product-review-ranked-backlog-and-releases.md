> **Provenance and status (saved 2026-09-20).** Written 2026-09-19 in a planning-only session (Claude Code plan
> mode) and copied here from a local file so the repo, not a scratch folder, holds it. **Nothing in this file is
> built.** It is a point-in-time backlog plus implementation plans, not a statement of current code: "Real" means
> the item was read in code or the bug ledger that day, "Hypothesis" means it was not. Verify a line against the
> code before acting on it — three items (ranks 11, 17, 19) already turned out to rest on premises the code
> contradicts (see the R4 and R5 sections). The decisions and questions in it are Jake's.

> **Progress (2026-09-20) — Release 1 is built locally; nothing else is.** The first line above is true of everything
> EXCEPT Release 1 (ranks 1–3): five commits R1a `0615d2f`, R1b `fd3b116`, R1c `558f0aa`, R1d `bb3e80e`, R1e `5570aa9`,
> each red-first with a neuter proof and a ledger closure (R1a, R1b, R1c, R1d closed on red→green evidence; R1e's
> on-phone check is Jake's). A 3-angle `multi-agent-review` of R1b–R1e ran AFTER those commits and returned follow-ups
> (a second periodisation sink, an unescaped `programName`, rest-timer and wake-lock edge cases), which are in the
> follow-up commit that carries this note; R1a had its own review before ITS commit. **Not done and not decided:** the
> release itself (full `npm test`, a review after the LAST commit, `docs/releases/<version>.md`, Jake's push/tag call),
> and Jake's on-phone wake-lock check. New rows this work opened: `2026-09-20-workout-templates-insert-accepts-another-coachs-program-id`
> (RLS gap, needs a schema read then a reviewed script), `…nine-save-functions-read-form-values-after-an-awaited-ownership-check`,
> `…interval-and-count-in-timers-still-count-ticks`, `…runner-survives-a-session-ending-mid-workout-and-now-holds-the-wake-lock`.
>
> **Release 2a is built locally too (2026-09-20, unreleased, no SQL).** `_fetchAllRows` (`js/app-core.js`) + the read-only,
> fail-closed stand-in `tests/capped-api.js` (its own 13-case self-test; it reorders ties per request); both weight tabs, the
> data export's ten tables and its `app_errors` loop, the coach Performance tab and both dashboards' "Personal bests" now
> page. A 3-angle review of that pass found no tenant leak but did find the export's coach block (clients, templates,
> programmes) still unpaged, a same-day-weigh-in tie, and a stub that could not catch a missing tie-break or tenant filter,
> all fixed. Three of the sixteen queries were NOT in this plan: the class sweep found them after the plan's five places (the dashboard best is computed from
> the newest 200 rows only). Ledger: `2026-09-20-reads-of-growing-tables-are-silently-cut-at-200-rows` (closed on red→green).
> **Measured on the live API that day:** the cap is real (200 rows for `.range(0, 999)` and `.limit(1000)`); an offset exactly
> at the end is an empty page; past the end is an error (`PGRST103`). **Two lines of this plan the code disproved:** the R2a
> red test said the coach weight tab's "current" differed from the client's — the coach tab loads newest-first, so its Current
> was already right and it was ENTRIES / the "since" date / the table that were cut; and the export's own `app_errors` loop
> comment claimed it was "right whatever the cap is" — with fixed 200-row strides it is right only for a cap of 200 or more.
> **Release 4b is built locally too (2026-09-20, unreleased, no SQL): the runner's finish-screen PR baseline.** One shared rule
> (`_isWeightPr`) and one bounded lookup per lift (`_prBaseline`: the heaviest set ever as a single `order desc, limit 1` row, by
> library id and by name, the heavier winning). Reading the code confirmed the plan's premise (a 200-row-capped, name-only
> baseline) and found three more faults the plan did not name: the screen flashed "PR" on every weighted lift until the
> lookup returned and kept doing so if it failed (a missing baseline defaulted to 0); the repaint wiped typed notes and the
> session name; and the rule was duplicated. All fixed red-first; the new query is also proved on the real database. Ledger:
> `2026-09-20-runner-finish-screen-claims-false-prs-and-loses-typed-notes`. A 3-angle review of it found no tenant leak but a
> real double-save hazard (the repaint re-enabled Save mid-save), a needless repaint, name-keyed baselines and an untested
> tenant clause — all fixed. **Still gated on Jake's answers:** R4c (in-session
> PR badge) and R4d ("same as last"); the first-ever-log-is-a-PR behaviour is unchanged until R4-0 Q4.
> **Not started:** R2b (server summary), R2c, R2d, and R2-0 needs Jake's read-only schema query first.

# START HERE: one ranked backlog across all four product reviews (2026-09-19)

Nothing below is built. Order = what to do first, weighing evidence (Real beats Hypothesis), value, cost,
security, and what unlocks what. "Score" is the priority given in the area review. Detail and task lists are
in the four review sections further down this file; the check-in loop has a FULL implementation plan.

## State of play

- Three local commits, unpushed, no release: `7e32b72` (Benchmarks tab deleted), `f0cd8e8` (dashboard "best
  record" fix), `5419deb` (automatic error capture + Send-feedback link). A release needs the full `npm test`,
  a fresh `multi-agent-review` after the last commit, and `docs/releases/<version>.md`.
- Live database already has `app_errors` and its corrected trigger; the deployed app doesn't use them yet.
- Unverified: the owner's Error reports card on real data (no spec logs in as the owner).

## Ranked backlog

| Rank | Item | Area | Evidence | Complexity | Score | Depends on |
|---|---|---|---|---|---|---|
| 1 | Close the open HIGH programme ledger rows: `saveNewTemplate` ownership gap, unescaped periodisation attribute, solo copy-to-coaching orphan | Programme | Real | Low-Med | 9 | — (do before touching programme code) |
| 2 | Fix inverted stress/soreness colours on the coach Overview | Check-ins | Real | Low | 9 | — |
| 3 | Runner: screen wake lock + end-time rest/set timers | Runner | Real | Low | 9 | — |
| 4 | "Capped-query correctness" package: one `coach_client_summary()` function replaces the 100-row adherence query and the newest-200 last-session; shared weight loader; export paging; a stubbed capped-API spec helper; a `checks.sh` warning for unbounded log reads | Dashboard + Check-ins | Real (code shape) | Medium | 9 | — (needs Jake to run one SQL script) |
| 5 | Check-in loop: coach inbox, Seen ✓, reply, tap-button form (FULL PLAN below) | Check-ins | Real | Medium | 9 | rank 2 (Commit A); Jake runs SQL |
| 6 | Client list triage: search, filter, sort, richer rows (programme + week, last check-in, invite state) | Dashboard | Real gap | Low-Med | 8 | rank 4 |
| 7 | One ranked, plan-aware "Needs attention" list (merges the check-in signals and the coach-dashboard item) | Dashboard + Check-ins | Real | Med-High | 8 | ranks 4, 5 |
| 8 | Builder "save does nothing": the slowness half was already fixed 2026-08-07 (awaiting Jake) and the template editor was rebuilt in v2026.09.6, so first ask whether it still happens; instrument only if it does | Programme | Real (Jake live 2026-08-07; may be stale) | Low | 5 | Jake's answer (R4-0, Q2) |
| 9 | Programme-ending chip + "Assign next block"; fix the "Week 15" hero | Programme + Dashboard | Real gap | Medium | 7 | rank 4 |
| 10 | Invite state + resend ("Invite pending 4d") | Dashboard | Real gap | Low-Med | 7 | verify `clients.user_id` is null until accepted |
| 11 | Runner: a "same as last" tap on strength sets (NOT automatic pre-fill) — DOWNGRADED while planning R4: automatic pre-fill was removed on purpose by Jake 2026-07-11, and the banked gap came from a competitor audit | Runner | Hypothesis | Low-Med | 5 | Jake's answer (R4-0, Q1) |
| 12 | Runner: retry-safe save + "Not saved yet" bar — fault-injection spec first | Runner | Real risk | Medium | 8 | — |
| 13 | In-session PR badge, strength only. A finish-screen "🏆 PR" ALREADY EXISTS, so this must reuse ONE rule; and that rule's baseline reads a capped query (fix first, R4b) | Runner | Hypothesis | Low-Med | 6 | R4b; Jake's answer (R4-0, Q3) |
| 14 | Client check-in history + readiness trend | Check-ins | Hypothesis | Medium | 6 | rank 5 |
| 15 | Check-in due window, snooze, email reminders | Check-ins | Real gap / Hyp. fix | Medium | 6 | email deliverability test to a real address |
| 16 | Profile header as a cockpit + one-tap contact (mailto / tel / WhatsApp link) | Dashboard | Hypothesis | Low-Med | 6 | rank 4 |
| 17 | REFRAMED while planning R5: the "edit once, apply on Save" ask is ALREADY BUILT for workout content (program-slot edits open the staged editor from v2026.09.6). What is left is a policy question — structure edits (duplicate / delete / generate weeks) change assigned clients' plans with no prompt | Programme | Real (a stale premise, not a defect) | Low (a wording/confirm change) if Jake wants it | 4 | Jake's answer (R5-0, Q1) |
| 18 | Atomic server-side assign (one RPC) — time a real assignment first | Programme | Real (structural) | High | 7 | rank 1 |
| 19 | REFRAMED while planning R5: unilateral, timed, jump and %1RM ALREADY log through the fast table; only cardio/intervals keep the one-set-at-a-time flow, and the ledger/docs still say otherwise. What remains is Jake's "cardio runner needs the same UI" — a design question | Runner | Real (stale premise) | High only if cardio is folded in | 4 | Jake's answer (R5-0, Q2) |
| 20 | Assign to several clients at once | Programme | Hypothesis | Medium | 6 | rank 18 |
| — | LATER, only when asked or verified: programme list search; "update assigned clients"; superset auto-advance (count usage first); exercise demo links; progress photos (needs Jake's go + restore the erasure path first); dated notes timeline (client personal data — export/erasure); offboarding flow; AMRAP/EMOM modes (ask if clients do them); body measurements; configurable check-in questions; tags/cohorts; coach KPIs | mixed | Hypothesis | — | 4–5 | — |

Not recommended now: plate calculator (built from research, deleted 8 days later), background push alerts
(need an installable app first; the wake lock covers most gym use), in-app messaging, payments/invoices,
auto-progression suggestions, cross-coach programme sharing, wearable sync.

## Suggested release grouping (small, tag-gated; each item red-first, `checks.sh`, review before commit for RLS)

- **R1 — Safety and small wins (no SQL):** ranks 1, 2, 3.
- **R2 — Trustworthy numbers:** rank 4 (one SQL script) + rank 6.
- **R3 — Close the loop:** rank 5 (one SQL script) + 7 + 9 + 10.
- **R4 — In the gym (detailed plan below):** rank 12 (retry-safe save) and a PR-baseline fix found while planning; ranks 13 and 11 only after Jake's answers; rank 8 has no code planned until Jake says it still happens.
- **R5 — Bigger builds (detailed plan below):** rank 18 (atomic assign) is the only build justified by evidence today; 17 and 19 turned out to be stale premises (a docs correction plus one question each); 20 only if Jake says the repeat assignments are a real chore.
- Later: 14, 15 (after the deliverability test), 16.

## Decisions and actions only Jake can take

1. Run the SQL for rank 4 and rank 5 when their scripts are ready (each ends in a read-back query).
2. Progress photos: go or no-go (removed 2026-07-12; the erasure path must return with it).
3. Do any clients actually do AMRAP / EMOM / circuits? (decides whether they are built.)
4. Count templates that use `supersetGroup` (one query) — decides whether superset auto-advance is worth it.
5. Master programme edits and clients already on the programme — CORRECTED while planning R5 (my earlier line said "today: no, by design", which was wrong): editing a workout's CONTENT offers an "Update assigned clients?" prompt once per Save; STRUCTURE edits (duplicate week, generate weeks, delete week, shorten a phase) change assigned clients' plans immediately with no prompt. Is that mix what you want? (R5-0, Q1)
6. Send a test invite email to a real non-owner address (decides whether reminders can rely on email).
7. Runner (R4-0): do you or a client miss pre-filled sets since you removed them on 2026-07-11? Does the builder "save does nothing" still happen since v2026.09.6? Do you want a PR badge during the workout, and should the very first log of an exercise count as a PR?

## How to resume

Read this file. Start R1 at rank 1 (it touches ownership, so `multi-agent-review` before the commit), then
rank 2 (Commit A of the plan below), then rank 3. Do not start rank 5 before rank 2. The build gates in
`CLAUDE.md` and the standing behaviours apply as usual; the check-in loop's plan below is complete enough to
implement as written.

---

# RELEASE 1 — detailed implementation plan (ranks 1–3), written 2026-09-19, NOT implemented

Five small, independent commits, each red-first. No SQL, no deploy-order risk. Every commit: failing test
recorded → fix → green → `checks.sh` → the affected specs run serially (never two Playwright runs at once) →
commit (the hook bumps `?v=`). Before starting: `ls tests | grep -E '^(_debug-|_adhoc|zz-)'` (OneDrive brings
deleted probe specs back) and read `git status`. Never pipe a Playwright run; redirect and read the summary.

## Commit R1a — `saveNewTemplate` ownership guard (ownership work: `multi-agent-review` BEFORE the commit)

Ledger: `docs/bugs/2026-09-18-savenewtemplate-writes-program_phase_workouts-with-no-ownership-check.md`.
Facts found while planning (the row understates it):
- `saveNewTemplate` (`js/app-workouts.js` ~1286) does TWO caller-supplied-id writes: FIRST it inserts
  `workout_templates` with `program_id: ctx?.programId` (unverified), THEN `program_phase_workouts` with
  `phase_id: ctx.phaseId` (unverified, ~1312). A refusal must therefore happen BEFORE the first insert, and
  must check BOTH ids ("verify one id, write another" class). `window._phaseWorkoutContext` is consumed only
  here (set by `showCreateTemplateModal`), so this is the whole class for this context.
- The guard already exists: `_verifyPhaseOwnership(fn, phaseId, expectedProgramId)` (`js/app-programs.js`
  ~51) checks the phase belongs to THAT programme and that programme is the caller's;
  `_verifyProgramOwnership(fn, programId)` for the programme-only case. Mirror `_quickAssignPhaseWorkout`
  (~2759).
Steps:
1. RED first — cross-tenant probe in a new dated spec, modelled on
   `tests/program-ownership-anchors-2026-08-22.spec.js`: PT creates a tagged programme + phase
   (`[E2E-OWN] …`); PT2 (`loginAsPT2`) builds the modal DOM (`#ct-name`, `#ct-desc`, `#ct-error`), sets
   `window._phaseWorkoutContext = { programId, phaseId, dayOfWeek: 1, weekNumber: 1 }` and calls
   `saveNewTemplate()`. Assert: refused with a permission message; NO `workout_templates` row for PT2 with that
   name; NO new `program_phase_workouts` row in PT's phase. Control: PT (owner) with the same context succeeds.
   RECORD what the RED run shows: if a cross-tenant template row IS created, RLS is not backstopping the
   `program_id` write — then add an RLS `WITH CHECK` on `workout_templates` / `program_phase_workouts`
   INSERT as a SEPARATE reviewed SQL script (sql-safety, Jake runs it, read-back). If RLS refuses, the app
   guard is defence in depth and the finding is recorded as such.
2. Fix: at the TOP of `saveNewTemplate`, before any insert: when `ctx?.programId`, `ctx.phaseId ?
   _verifyPhaseOwnership('saveNewTemplate', ctx.phaseId, ctx.programId) : _verifyProgramOwnership(
   'saveNewTemplate', ctx.programId)`; on refusal set `#ct-error` to "Could not create — permission denied."
   and return. Own cleanup with rowcount checks; tag `[E2E-OWN]`.
3. Neuter proof: remove the guard, the probe must fail at the named assertion; restore.
4. Run: `program-ownership-anchors-2026-08-22`, `builder-happy-path-2026-08-22`, `programs`,
   `reentry-guard-2026-08-28`, `review-fixes-2026-08-29`. Update the ledger row: closed only on red→green.

## Commit R1b — unescaped periodisation reps + make the escaping checker able to see it

Ledger: `docs/bugs/2026-09-06-periodization-reps-is-an-unescaped-stored-attribute-and-the-checker-is-blind.md`.
Facts: the sink is `js/app-programs.js` ~1744 (`value="${cfg.tiers?.[t]?.reps ?? repsDefault[t]}"`, no
escaper); the value is saved raw at ~1802 into `program_phases.periodization_config`. WHY the checker is blind
(unverified in the row, found here): `scripts/check-escaping.mjs` only flags an interpolation whose text
matches the hand-written `FREE_TEXT` allowlist (field names such as `.name`, `.notes`); `.reps` is not on it.
It also has NO self-test file (its sibling checkers do), so it has never been shown red on this form.
Steps:
1. RED first, two parts. (a) `scripts/check-escaping.selftest.mjs`: fixtures — the reps form must be flagged,
   the same form wrapped in `escapeHtml(String(...))` must pass, and the existing forms keep their verdicts;
   run it against the CURRENT checker → red. (b) behavioural spec: PT creates a tagged programme + phase,
   stores `periodization_config` with reps `foo" onmouseover="window.__xss=1` via a direct update, calls
   `showPeriodizationModal(phaseId)`, asserts the input has NO `onmouseover` attribute and its value
   round-trips as the literal text; red on current code.
2. Extend `FREE_TEXT` with `.reps`; before giving it teeth run the extended checker over `js/` and COUNT new
   findings ("measure before a gate gets teeth"): fix genuine sites, name any false ones. Do NOT switch to a
   general `value="${…}"` rule — the ledger counts 45 such sites, one exploitable; a rule that cries wolf
   gets disabled.
3. Fix the sink: `value="${escapeHtml(String(cfg.tiers?.[t]?.reps ?? repsDefault[t]))}"` (plain attribute →
   `escapeHtml`, never `escapeAttr`).
4. Wire the new self-test into `scripts/checks.sh` beside rule 9d, as the other checkers' self-tests are.
5. Run: the periodisation specs, `escaper-attr-roundtrip-2026-08-16`, `checks.sh`. Sibling grep: any other
   place a periodisation tier value is interpolated (count them).

## Commit R1c — solo "Copy to coaching programs" strands an undeletable programme

Ledger: `docs/bugs/2026-09-06-copy-to-coaching-creates-an-undeletable-orphan-for-a-solo-user.md`.
Facts: the outbound button (`js/app-programs.js` ~1250) is gated on `program.is_personal` alone; the inbound
arm (`moveProgramToPersonal`, ~1369) was fixed in 2026-07-13 to require `window._soloClientId`. A native solo
account has no coaching view (`loadUserInfo` sets `_soloClientId` but not `_masterAccount`), so its copy is
unlistable, unopenable and undeletable.
Steps:
1. RED first: as PT (master account) create a tagged personal programme, then simulate a native solo with
   `window._masterAccount = false` and call `openProgram(id)`: the button must be ABSENT; and
   `copyProgramToCoaching(id)` must refuse with NO `programs` insert (spy on `db.from`). Control: with
   `_masterAccount = true` the button is present. Red on current code (button present when false).
2. Fix, both places (defence in depth, mirroring the inbound guard): render the outbound button only when
   `window._masterAccount`; and at the top of `copyProgramToCoaching`, `if (!window._masterAccount)` → toast
   "You have no coaching view to copy this into." and return.
3. Repair query for Jake, READ-ONLY, pasted inline (one query per message): programmes already stranded —
   `select p.id, p.name, p.created_at from public.programs p join public.profiles pr on pr.id = p.coach_id
   where p.is_personal = false and (pr.role = 'solo' or pr.solo_only) order by p.created_at;` Any rows get a
   separate, reviewed cleanup script; do not delete on the strength of a name.
4. Run: `solo-account` (smoke gate), `programs`, `program-ownership-anchors-2026-08-22`. Sibling grep for
   other one-directional bridge buttons (count them).

## Commit R1d — check-in colour polarity (Commit A of the check-in plan below, no SQL)

Follow "Commit A" in the check-in plan exactly: file the bug row first; shared `CHECKIN_METRICS` +
`_checkInTone` in `js/app-core.js`; red-first via `renderClientOverview` with `db.from` stubbed (fixture rows,
no writes, no debris); replace `ciColour` at its 3 call sites; the raw hex literals leave `js/app-clients.js`
so pin the style baseline AT the new count. Run the check-in specs named in that plan.

## Commit R1e — runner: screen wake lock + end-time rest and set timers

Facts: five tick-counting timers in `js/app-runner.js` — rest (`_runner.restRemaining--`, ~1667), set
(`_setTimerRemaining--`, ~1188), count-in (~1280) and two interval-phase sites (~1414, ~1501). The session
clock is start-time based (correct). Nothing in `js/` requests a wake lock or listens for `visibilitychange`.
`restRemaining` is READ by the renderers (~646, ~876), so keep it as a derived integer and change only how it
is derived. Playwright is 1.61.1 — `page.clock` exists and no spec uses it yet.
Scope decision: rest + set timers + wake lock ONLY. Interval-phase timers auto-log a set on completion
(data-affecting) and need phase catch-up logic — named, deferred. Count-in is 5 s — deferred.
Steps:
1. RED first (new dated spec, stub-based, fixture pattern from `tests/runner.spec.js`, tagged template):
   (a) Rest timer: start a runner, `page.clock.install()` AFTER login, `startRestTimer(90)`, then
   `page.clock.fastForward(60000)` — this jumps time and fires due timers ONCE, which is what a suspended
   phone does to a counter — assert about 30 s remain and the display shows it. Counter code shows about 89 →
   red. (b) Set timer: same shape. (c) Wake lock with `navigator.wakeLock` stubbed: requested once with
   'screen' at runner start (fresh AND resumed from a draft); re-requested on `visibilitychange` to visible
   after the sentinel's `release` event; released on finish and on discard; runner works with the API absent;
   runner works and shows no toast and calls no `log.error` when `request` rejects.
2. Implement: module-level `let _runnerWakeLock = null` declared BEFORE use; `_runnerWakeLockOn()` /
   `_runnerWakeLockOff()` (feature-detect with `'wakeLock' in navigator` — the `in` form does not touch the
   `typeof` ratchet; try/catch; failures use `console.warn`, never `log.error`/toast); call ON after the two
   places `_runner = {...}` is built (~63 fresh, ~204 resume), OFF in `showRunnerFinish` and at the single
   `_runner = null` site (~2414). One document-level `visibilitychange` listener: when visible and a runner is
   active, re-acquire and immediately re-tick any running rest/set timer.
3. End-time timers: `startRestTimer` stores `_runner.restEndsAt = Date.now() + secs*1000`; the tick derives
   `restRemaining = Math.max(0, Math.ceil((restEndsAt - Date.now())/1000))`, ticks every 250 ms and runs the
   existing per-second body only when the value CHANGES (this replaces a decrement, so no duplicate or
   skipped cue: track the last cued second). Keep the "rest elapsed while viewing another exercise"
   (`_restPendingFire`) branch untouched — only the derivation changes. Same for the set timer. After a
   suspension the finish path fires once on return.
4. Neuter proofs: revert to `restRemaining--` → test (a) must fail; drop the re-request on visibility →
   test (c) must fail.
5. Run ALL runner specs serially: `runner` and `solo-account` (the pre-push smoke gate),
   `runner-cardio-capture-2026-08-08`, `runner-fast-table-metrics`, `runner-notes-escaping-2026-08-12`,
   `runner-save-metrics`, `runner-template-id-2026-09-04`, `set-count-agreement-2026-08-11`,
   `unilateral-runner-2026-08-19`, `intervals-2026-07-24`, `intervals-redesign-2026-07-25`,
   `interval-defaults-2026-08-19`, `cardio-interval-merge-2026-08-09`. `mobile-check`: no new UI, so confirm
   no regression at 390×844 only.
6. Jake's on-phone check (cannot be automated): start a workout, log a set, leave the 90 s rest running with
   the screen idle — it must stay on and the beeps fire; then switch to another app for 45 s and come back —
   the countdown must show the right time left; finish the workout and confirm the screen sleeps normally.
   Named, not fixed: interval-phase and count-in timers stay tick-based; a wake lock costs battery during a
   workout (released on finish, discard and when the tab is hidden).

## Release gate (after R1a–R1e; do NOT push or tag without Jake's call)

Full `npm test` (the pre-push gate is only about 59 of about 757 tests), a fresh `multi-agent-review` AFTER
the last commit, and `docs/releases/<version>.md`. Update `docs/roadmap.md` / `docs/current-sprint.md` at the
release cut, and record the escaping-checker change in `docs/decisions.md`.

---

# RELEASE 2 — detailed implementation plan (ranks 4 and 6: trustworthy numbers), NOT implemented

Goal: numbers a coach can trust at any roster size, then a client list that uses them. Jake's part is two SQL
touches: one read-only schema query, then one script (each ends in a read-back). Do R1 first; R2 does not
depend on it. Same rules as R1: red-first, `checks.sh`, affected specs serially, redirect (never pipe) a
Playwright run, check for resurrected `_debug-*` probes, hook bumps `?v=`.

## Verified while planning (nothing here was assumed)

Every place a coach-wide or history number is built from a capped read:
| Where | Query shape | What goes wrong |
|---|---|---|
| Coach dashboard adherence (`renderDashboard`, `js/app-dashboard.js` ~51) | `workout_logs` this month, `.limit(100)` newest first | over 100 sessions in the window (about 33 clients at 3 a week) the oldest days drop out → active clients read as "At risk" |
| Client list (`renderClients`, `js/app-clients.js` ~135) | newest 200 logs across ALL clients | a client not in that window shows "No sessions" instead of "35d ago" (red) — the ones to chase |
| Client weight tab (`js/app-progress.js` ~1724) | all `weight_logs` oldest-first, no limit | API cap `max_rows = 200` (roadmap): past 200 logs the chart and "Current" stop at the 200th-OLDEST entry |
| Coach weight tab (`js/app-progress.js` ~783) | all `weight_logs` newest-first, no limit | past 200 the history is cut; coach and client read DIFFERENT "current" weights |
| Data export (`_buildMyDataBundle`, `js/app-progress.js` ~3332) | weights, workouts, performance, goals, events, 1RMs, check-ins, no limit | a subject-access export silently omits rows past 200 per table (GDPR completeness; the `app_errors` query alone is paged) |
Live impact is UNMEASURED for all five — inferred from the code and the documented cap.
Also: no index definitions for these tables exist in repo SQL, so live indexes and the Postgres version are
unknown; `tests/pt-dashboard.spec.js` asserts only that the filter buttons exist and rows carry a recency
label — nothing asserts a count or behaviour past the caps; client statuses are active / inactive /
archived; `scripts/lib/chains.mjs` already collects a whole chained Supabase expression (reuse it).

## R2-0 — ONE read-only query for Jake (paste inline, one query per message)
Returns: `version()`; the columns of `clients`, `client_programs`, `program_phases`, `workout_logs`,
`weight_logs`, `client_check_ins`; the existing indexes on those tables (`pg_indexes`); the coach-read SELECT
policies on them. Purpose: confirm Postgres 15+ (needed for `security_invoker` views), confirm column names,
and decide whether the script must add indexes — measure before promising the view is fast.

## Commit R2a — one paged loader; weights and export stop truncating (no SQL, can start immediately)

1. `tests/capped-api.js`: `installCappedApi(page, tables, { cap: 200 })` replaces `db.from` with a fake
   PostgREST that honours `select(cols, { count: 'exact' })`, `eq`, `in`, `gte`, `lte`, `order` (repeatable),
   `limit`, `range`, and the API cap, and THROWS on any method it does not implement (fail closed — a stub
   that silently ignores a call lets a test pass on nothing). Its own tests prove the cap bites: 300 rows in,
   200 out.
2. RED first (stub-based, no live rows, no debris): 250 weight logs → the client tab's "Current" must be the
   NEWEST entry and the chart must include it (today: the 200th oldest); the coach tab must show the same
   current weight (today they differ); `_buildMyDataBundle` must contain all 250 weights (today: 200).
3. `_fetchAllRows(makeQuery, { pageSize = 200, maxPages = 50 })` in `js/app-core.js`: first request asks
   `count: 'exact'` and pages `.range()` until the collected rows reach the count (one request for the
   typical small history); stops on an empty page whatever the cap is; refuses to spin past `maxPages`. Use it
   in both weight tabs and for the seven sibling queries in the export; re-point the `app_errors` export loop
   at it too (one implementation, not two).
4. Check the weight chart with 400 fixture points renders without freezing (assert render time budget in the
   stub spec); add downsampling only if it fails — evidence first.
5. Run: `progress`, `progress-trend`, `progress-hr`, `weight-roundtrip-2026-08-26`, `bodyweight-toggle-2026-08-17`,
   `gdpr-export`, `client-workout`. Neuter proof: revert one weight tab to the bare query → its test fails.

## Commit R2b — `coach_client_summary` view; dashboard and client list read it (RLS-adjacent: `multi-agent-review` BEFORE the commit)

1. `sql-safety`, then ONE script `scripts/add-coach-client-summary-2026-09-XX.sql`, idempotent, ending in a
   read-back SELECT. Shape:
   - `create or replace view public.coach_client_summary with (security_invoker = true) as` — invoker
     rights, so every base table's existing RLS applies as the caller.
   - One row per COACHED client: `where c.coach_id = (select auth.uid())` inside the view, so a client, a solo
     user and another coach all get ZERO rows (defence in depth; never rely on RLS alone for a new surface).
   - Columns: `client_id, full_name, status, user_id, created_at`; from `workout_logs`: `last_session_date`,
     `sessions_7d` (`date >= current_date - 7`, IDENTICAL to the window the dashboard uses today — no silent
     behaviour change), `sessions_28d`; from `weight_logs`: `last_weigh_in_date`; the LAST check-in's raw
     `sleep, energy, stress, soreness, created_at` (thresholds and colours stay in JS `CHECKIN_METRICS` — one
     source, never duplicated in SQL); from the client's newest `client_programs` row: `programme_name`,
     `programme_start`, `programme_weeks` (sum of `program_phases.duration_weeks`). Dates and counts only — no
     weights or notes.
   - `revoke all … from anon; grant select … to authenticated`. Add `create index if not exists` for
     `(client_id, date desc)` on `workout_logs` / `weight_logs` and `(client_id, created_at desc)` on
     `client_check_ins` ONLY for indexes R2-0 shows are missing.
   - Read-back: columns, `reloptions` contains `security_invoker=true`, grants (no anon), index list.
2. RED first, real database, behavioural (fixture: PT creates a tagged `[E2E-SUM]` client, seeds tagged
   `workout_logs` dated yesterday / 10 days ago / 40 days ago and one `weight_logs`; each identity cleans up
   its own rows with rowcount checks): the view returns `last_session_date` = yesterday, `sessions_7d` = 1,
   `sessions_28d` = 2, the weigh-in date; PT2 sees ZERO rows; the E2E client account sees zero; anon is
   refused; PT sees only PT's clients. A control proves the view exists before any refusal is asserted.
3. RED first, stub-based (`installCappedApi`): 300 fixture logs, one client last seen 35 days ago → the list
   must read "35d ago" in red, not "No sessions" (today: "No sessions"); 150 sessions in the last 7 days
   across 40 clients → no active client with a session may be listed "At risk" (today: falsely at risk).
4. Switch the two screens: dashboard adherence and `quietClients` from the view (`sessions_7d`,
   `last_weigh_in_date`); keep a SMALL `workout_logs` query (`.limit(20)`) only for the activity feed; add the
   view to `_failedFetches` ('client summaries') so a failed load shows the banner, not zeros. Client list:
   drop the newest-200 query; `lastSessionLabel` takes a date; "No sessions" now means genuinely none.
5. Run: `pt-dashboard`, `dashboard-fetch-failures-2026-08-12`, `client-record-resolution-2026-09-04`,
   `client-scoped-writes-2026-08-21`, `rls-audit`. Neuter proof: revert the list to the 200-log query → the
   35-day test fails.

## Commit R2c — client list you can triage (rank 6; needs R2b)

1. Pure `renderClientRows(rows, state)` (testable with fixtures) + toolbar: search box (name, client-side —
   the list is at most 200 rows), status chips All / Active / Inactive / Archived, sort (Name; Last active,
   oldest first; Sessions this week, fewest first). State survives a re-render within the session.
2. Row: name, status badge, last-session label (existing colours), programme + week ("Hypertrophy · Wk 3/12";
   "Complete" once past the last week — the shared `_programmeWeek(start, totalWeeks)` helper the R1-later
   "Week 15" hero fix will reuse). NOT in this commit: invite state (rank 10 — its `user_id` semantics are
   still unverified) and check-in flags (need the check-in loop).
3. Tests: fixtures for search, each chip, each sort order, "35d ago", programme complete; a stub-driven
   `renderClients` test; `mobile-check` at 390×844 — toolbar wraps, targets ≥ 44 px, no overflow (LOOK at the
   screenshot). Run the same dashboard/client specs as R2b.

## Commit R2d — a ratchet for unbounded reads of growing tables

`scripts/check-unbounded-reads.mjs` (+ a self-test, wired into `checks.sh` like the other checkers), using
`scripts/lib/chains.mjs`: flag a read chain on a growing table (`weight_logs`, `workout_logs`,
`workout_log_exercises`, `workout_log_sets`, `performance_logs`, `client_check_ins`, `events`, `goal_check_ins`,
`app_errors`) that has NO `.limit(`, `.range(`, `.single(`, `.maybeSingle(` and no `head: true`, and is not a
write. MEASURE FIRST, after R2a and R2b have removed the known sites: count what remains, pin the baseline AT
that number (a ratchet that can only fall, like `SPEC_HYGIENE_BASELINE`), and file each remaining site as a
named finding rather than blocking on it. The self-test must show it RED on a fixture chain and GREEN on a
bounded one.

## Notes and named limits

- The 7-day window is UTC-date based, as today: for a UK coach near midnight BST an off-by-one is possible;
  named, not changed.
- Sessions LOGGED, not sessions PLANNED — the plan-aware "Needs attention" list is rank 7, deliberately later.
- After deploy Jake confirms on his own roster: the list shows the true last-session age for a client who last
  trained more than 3 weeks ago, and the adherence panel matches what he knows.
- Release gate as for R1: full `npm test`, a fresh `multi-agent-review` after the last commit, a release note;
  do not push or tag without Jake's call.

---

# RELEASE 3 — detailed implementation plan (ranks 5, 7, 9, 10: close the loop), NOT implemented

Goal: the coach's home screen says who needs attention and why, the check-in loop is closed, programmes that
end are noticed, and invite state is visible. Depends on R2 (the summary view and `_fetchAllRows`). Same
working rules as R1/R2.

## Corrections and design traps found while planning (these change the earlier reviews)

1. **Resend invite ALREADY EXISTS.** The client profile shows "✉ Send invite" when `client.invited_at` is empty
   and "✉ Resend invite" otherwise (`js/app-clients.js` ~304). The earlier review said there was no resend;
   that was wrong. What is missing is invite STATE in the list.
2. **"Pending = `user_id` is null" is probably wrong.** `sendClientInvite` (`js/app-progress.js` ~994) calls an
   Edge Function `invite-client` and then stamps `invited_at` (cosmetic). Inviting an email normally creates the
   auth user immediately, so `user_id` may be set BEFORE anyone accepts. `invite-client`'s source is NOT in the
   repo (`supabase/functions/` holds only `invite-solo-user`) and the trigger that links users (`handle_new_user`)
   lives only in the database. So: verify first, and use an honest PROXY — "Invited 6d ago · no activity yet"
   (invited_at set AND no session, weigh-in or check-in ever, all available from the R2 view) — never a claim
   about acceptance.
3. **"Current programme" is picked inconsistently and most screens use newest-by-`created_at`**
   (`js/app-dashboard.js` ~299 and ~872, `js/app-clients.js` ~376, `js/app-calendar-goals.js` ~73,
   `js/app-workouts.js` ~643 and ~3594, `js/app-progress.js` ~1985). `_programWorkoutsByDate` maps only ONE
   assignment to dates. So pre-assigning the NEXT block immediately becomes the client's current programme
   everywhere and the running block disappears from their calendar. "Assign next block" must therefore carry
   a warning + confirm now; a date-aware `_currentAssignment()` across those 7 sites is a separate, larger
   backlog item (named, not in R3).
4. **Plan-aware attention must not duplicate the date maths in SQL.** `_programWorkoutsByDate`
   (`js/app-calendar-goals.js` ~11) is the one implementation that maps a programme to calendar dates. Reuse it
   in JS: fetch the programme structure ONCE per distinct programme (a handful, with `_fetchAllRows`), never
   per client, and never re-implement the maths in SQL — the repo has already been bitten by two
   implementations disagreeing (coach vs athlete set counts).

## Commit order

R3a check-in loop (the FULL plan below, Commit B; Jake runs its SQL) → R3b programme helpers + hero fix +
assign-next-block guard → R3c attention engine + card → R3d invite proxy + `invite-client` source into the repo.

## R3a — the check-in loop (Commit B of the plan below, unchanged) — build it FIRST

Its SQL adds `coach_reply`, `reviewed_at`, `reviewed_by`, the column-level UPDATE grant, the coach UPDATE
policy, the client DELETE-own policy and the server-stamping trigger. Do R1's colour fix (its Commit A)
first. R3c's "needs review" reason and its Seen / Reply actions reuse R3a's `markCheckInSeen` /
`replyToCheckIn`, which is why R3a comes before it.

**Added 2026-09-20 (from the R1d review):** the R3a read-only schema query on `client_check_ins` must also settle the
COLUMN TYPES of `sleep` / `energy` / `stress` / `soreness`. `renderClientOverview` prints them raw (`${latestCI[key]}/5`)
and R1d's `_checkInTone` returns `null` (a neutral colour) for anything it cannot read as a number 1–5, so a text or
out-of-range column would render silently un-coloured rather than wrongly — but nothing has confirmed the type. The two
drift lists of check-in metrics (the form's inputs and the Overview's `CHECKIN_METRICS`) should fold into the one shared
list when Commit B replaces the form.

## R3b — programme helpers, the "Week 15" hero, and a safe "Assign next block" (no SQL)

1. `_programmeWeek(startDate, phases, today)` → `{ week, total, phase, ended, endsOn, daysToEnd }` in
   `js/app-core.js` (loads first); pure. R2c's list row already uses it.
2. RED first: pure-helper tests (start 100 days ago on a 12-week plan → `ended: true`, not week 15; boundary
   weeks; a 1-phase plan; missing start date) + a render test that overrides ONLY the `client_programs` select
   (other tables pass through to the real `db.from`) and asserts the client hero reads "Programme complete",
   not "<phase> · Week 15". Same for `renderSoloDashboard` (~897).
3. Fix both heroes to use the helper. Coach side: a chip on the client-list row and the client profile —
   "Ends in 5 days" / "Ended 12 days ago" — from `programme_start` + `programme_weeks` in the view.
4. `showAssignProgramModal(clientId, opts)` accepts `{ startDate }` and prefills `#ap-start`; when the client
   already has a programme that has NOT ended, `saveAssignProgram` asks `confirmDialog`: "This becomes
   {name}'s current programme immediately — their running programme will drop out of their calendar until
   you remove it." The row's "Assign next block" action passes `startDate = endsOn`.
5. Run: `programs`, `client-workout`, `solo-account`, `program-ownership-anchors-2026-08-22`, the dashboard
   specs. `mobile-check` on the hero and the assign modal.

## R3c — the ranked, plan-aware "Needs attention" list (needs R2b's view)

1. Extend the view with ONE small script `scripts/extend-coach-client-summary-2026-09-XX.sql`
   (`create or replace view` may only APPEND columns): `invited_at`, `programme_id`, and the client's check-in
   review fields once R3a exists. Read-back as before.
2. `ATTENTION_RULES` in ONE place (`js/app-core.js`) and a pure `_attentionFor(summary, planned7d, holiday,
   today)` returning ordered `{ reason, severity, detail }`. Default thresholds (Jake to confirm or change):
   low check-in scores and unreviewed (high); missed sessions = planned last 7 days minus logged, flagged at 2
   or more or at zero-when-planned (high); quiet 10+ days (medium); check-in overdue 10+ days for a client who
   has checked in before (medium); no weigh-in 14+ days for a client who has weighed in before (low);
   programme ends within 7 days or has ended (medium); invited more than 3 days ago with no activity (medium).
   Suppressed while the client has a holiday event covering the window (`events`, `type = 'holiday'`, bounded
   query).
3. Planned sessions: fetch each distinct assigned programme's structure once and call the existing
   `_programWorkoutsByDate` per client with that client's `programme_start`; count mapped dates in the same
   7-day window the view uses. A cross-check test feeds the SAME fixture programme to the helper and to a
   hand-counted expectation for: a single-week phase (repeats), a multi-week generated phase, two phases.
4. UI: a "Needs attention" card at the top of the coach dashboard (max 10 rows, worst first): client name →
   `openClient`, up to two reason chips + "+N", the top reason's action (Seen ✓ / Reply for check-ins from
   R3a; "Assign next block" for programme ends). It sits beside the check-in inbox; the check-in reason links
   to that inbox item rather than duplicating it. Honest empty state ("Nobody needs attention"). Failures go
   through `_failedFetches`, never as an empty list.
5. RED first: pure `_attentionFor` fixture tests for every rule and for suppression; a stub-based dashboard
   test (capped API + view fixture) that ranks a mixed roster correctly; a render test with a hostile client
   name; then the card. NOT in R3: snooze (would need a table and RLS — add only if the list feels nagging in
   real use), one-tap contact links (rank 16).
6. Run: `pt-dashboard`, `dashboard-fetch-failures-2026-08-12`, the check-in specs, `rls-audit`. `mobile-check`
   at 390×844 (chips wrap, targets ≥ 44 px).

## R3d — invite state (proxy) and getting `invite-client` under version control

1. Verify FIRST, read-only, pasted inline one query per message: `select pg_get_functiondef('public.handle_new_user'::regproc);`
   (how a new auth user is linked), and ask Jake to copy the deployed `invite-client` source from the Supabase
   dashboard into `supabase/functions/invite-client/index.ts` — today it cannot be diffed or reviewed.
2. Fixture tests for the proxy label ("Invited 6d ago · no activity yet" only when `invited_at` is set and the
   client has no session, weigh-in or check-in; nothing shown otherwise; a never-invited client shows
   "Not invited") then show it on the client-list row and as an attention reason. Do NOT add a button in the
   row (the row itself opens the profile, where Resend lives).
3. If Jake later wants TRUE acceptance state, that needs a SECURITY DEFINER function exposing
   `last_sign_in_at` for the coach's own clients only — a new privileged surface: `sql-safety`,
   `multi-agent-review`, cross-coach probes. Not in R3.

## After R3

Release gate as before. Named backlog created by this release: a date-aware `_currentAssignment()` for the 7
call sites above; snooze; true invite-acceptance state; one-tap contact links; the interval/count-in timers.

---

# RELEASE 4 — detailed plan (ranks 12, 13, 11, 8: in the gym), NOT implemented

Goal: a workout logged on bad gym signal is never lost and never doubled; the PR the app announces is true;
the two runner ideas that are still hypotheses stay behind Jake's answers. Independent of R1–R3 except that
R4b reuses R2a's `installCappedApi` test helper (if R2 has not landed, build that helper first, as R2a
describes). Same working rules as R1.

## What planning found (this changes the earlier ranking)

1. **Rank 11 (pre-fill) reverses Jake's own decision.** On 2026-07-11 he had automatic pre-fill removed:
   "a pre-filled value is indistinguishable from one you actually entered", so a set could be ticked without
   the weight ever being confirmed. It is now protected by a code comment (`_ensureTableRows`, ~421), a spec
   (`tests/runner.spec.js:372`), a guard against a "back door" refill when the last-session fetch lands late
   (`renderRunnerLastSession`, ~284) and a prediction (pth-119: "will stick"). The "biggest gap" claim came
   from a Hevy competitor audit, which is exactly the "research-justified, no real requester" shape that killed
   the plate calculator. Downgraded to a Hypothesis and gated on Jake's answer.
2. **A PR feature already exists.** `showRunnerFinish` (`js/app-runner.js` ~2346–2370) shows "🏆 N PRs" on
   the finish screen: heaviest weight this session versus history. So rank 13 is an in-session view of an
   existing rule, and there must be ONE rule, not two (the repo has been bitten by two implementations
   disagreeing). **Its baseline is a capped read** — the second query (`workout_log_sets`, ~2356) has no order
   and no limit, so the API's 200-row cap decides which sets it sees; a regular client with more than 200
   prior sets across that session's exercises can get a baseline that is too low and a false "🏆 PR". Also
   the match is by exercise NAME only (a renamed exercise loses its history), and a first-ever log of an
   exercise counts as a PR. Live impact unmeasured — inferred from the code shape.
3. **The save is not retry-safe (rank 12).** `saveRunnerSession` (~2432) does three separate server-generated
   inserts (log → exercises → sets) and "rolls back" with two unchecked deletes. On a flaky connection: a
   response lost AFTER the server committed reads as a failure, and the retry inserts a second session; a
   failure caused by the network is followed by rollback deletes that fail for the same reason, leaving an
   empty log; and a draft older than today is silently discarded on the next launch
   (`_loadRunnerDraft`, ~143), so a workout that failed to save in a basement gym and is reopened the next day
   is gone. The failure toast for the first insert is the raw internal "saveRunnerSession: workout_logs insert
   failed". `saveWorkoutSession` (~3073, the manual Log Session modal) has the identical shape — same class,
   fix both. No spec in the repo uses `route.abort`, `route.fetch` or offline mode: this would be the first
   fault-injection test.
4. **Rank 8 has no fix to plan.** The ledger row says the slowness half was FIXED 2026-08-07 (awaiting
   Jake's confirmation) and the "save does nothing" half was not reproduced in two attempts; the template
   editor was rebuilt in v2026.09.6, so the row may describe a screen that no longer behaves that way. The
   right move is a question, not code.

## R4-0 — what Jake supplies (paste inline, one query per message; read-only)

(a) **Schema of the three log tables** — decides whether the client can choose row ids and whether deleting a
log removes its children:
```sql
select 'column' as kind, table_name as object,
       column_name || ' ' || data_type || ' default ' || coalesce(column_default, '-') as detail
from information_schema.columns
where table_schema = 'public'
  and table_name in ('workout_logs', 'workout_log_exercises', 'workout_log_sets')
  and column_name in ('id', 'log_id', 'workout_log_exercise_id')
union all
select 'constraint', conrelid::regclass::text, conname || ': ' || pg_get_constraintdef(oid)
from pg_constraint
where conrelid in ('public.workout_logs'::regclass, 'public.workout_log_exercises'::regclass,
                   'public.workout_log_sets'::regclass)
  and contype in ('p', 'u', 'f')
union all
select 'policy', tablename, policyname || ' [' || cmd || ']'
from pg_policies
where schemaname = 'public'
  and tablename in ('workout_logs', 'workout_log_exercises', 'workout_log_sets')
order by 1, 2, 3;
```
(b) **Evidence the save problem is real** — two separate queries, counts only:
```sql
select count(*) filter (where not exists
         (select 1 from public.workout_log_exercises e where e.log_id = l.id)) as logs_with_no_exercises,
       count(*) as all_logs
from public.workout_logs l;
```
```sql
select client_id, date, name, count(*) as copies
from public.workout_logs group by 1, 2, 3 having count(*) > 1
order by copies desc, date desc limit 20;
```
Read them honestly: a few empty or doubled logs is a manual-entry or test leftover until shown otherwise; a
pattern of empties/doubles on the same evening is the failure this plan targets. The number sets the urgency,
not the design.
(c) **Four questions** (recorded in `docs/decisions.md` whichever way they go, so nothing is re-litigated):
Q1 since removing pre-fill on 2026-07-11, have you or a client actually missed it in the gym? Q2 does the
builder "save does nothing" still happen since v2026.09.6 — on which screen? Q3 do you want a PR badge
during the workout? Q4 should the first-ever log of an exercise count as a PR (today it does)?

## R4a — a save that converges and cannot be lost (rank 12; ownership-adjacent: `multi-agent-review` BEFORE the commit)

Chosen design — no SQL, no deploy-order risk: **stable row ids + ignore-duplicates writes**, so a retry of the
SAME session converges to exactly one complete session however the earlier attempt died. The alternative, a
server-side atomic function, is stronger (one round trip, true all-or-nothing) but is new privileged SQL
that shares its design with rank 18; named as the follow-up, not built here.

1. RED first — the fault-injection helper `tests/fault.js`: `failNext(page, urlPart, { mode, times })` with
   modes `abort` (connection dies before the server sees it), `lost-response` (`route.fetch()` so the server
   COMMITS, then `route.abort()` so the page sees a failure) and `http-500`. Specs use their own tagged
   fixtures (`[E2E-SAVE] …`) with rowcount-checked cleanup (`workout_logs` is already in the reaper's TARGETS
   by name). Each scenario is run against the CURRENT code first and the RED result RECORDED — that also
   tells us whether children cascade and whether the rollback deletes are permitted:
   (1) sets insert aborted once, then Save again → exactly ONE session with the right number of sets;
   (2) exercises insert lost-response → retry → ONE session, no duplicate exercise rows;
   (3) log insert lost-response → retry → ONE `workout_logs` row (today: two);
   (4) every request fails → runner stays open, draft retained with a pending-save marker, and no partial
   rows remain or the retry completes them;
   (5) after a failed save, reload the page: the draft survives even when its `savedAt` is two days old
   (today: discarded) and the "Not saved" bar appears; a NORMAL two-day-old draft is still discarded
   (Jake's same-day rule stays for unfinished workouts);
   (6) rename the session between a failed attempt and its retry → the saved name is the LATEST;
   (7) double-tap Save → one session; (8) the manual Log Session modal passes (1)–(3) too.
2. Ids: `_runner.saveLogId` is a `crypto.randomUUID()` chosen at the first Save tap and persisted in the draft;
   every child id is derived from it by a small synchronous 128-bit string hash of
   `logId|exerciseOrderIndex|setIndex|side` formatted as a uuid (`_stableUuid`, pure, in `js/app-core.js`). Not
   cryptographic and it does not need to be: the ids only have to be stable across retries and unique within a
   log (test: 10,000 distinct paths, no collisions; same input → same output; valid uuid shape). Because the log
   id is random per session, child ids are not guessable across tenants; an attacker could only claim ids in
   their OWN rows, and RLS still gates every insert.
3. `_persistSession({ logRow, exerciseRows, setRows })` in `js/app-runner.js`, used by BOTH
   `saveRunnerSession` and `saveWorkoutSession` (the row-mapping stays where it is; only the three writes move):
   `upsert(..., { onConflict: 'id', ignoreDuplicates: true })` for the log, then the exercises, then the sets,
   all with the client-chosen ids, no `.select()` (fewer bytes on a bad link). On a RETRY (attempt > 1) finish
   with `update({ name, notes }).eq('id', logId)` so an edit made between attempts is not silently dropped
   (ON CONFLICT DO NOTHING would keep the first attempt's values — the "reports success while doing nothing"
   shape). No compensating deletes on the retry path: the retry IS the repair. If R4-0(a) shows a table's `id`
   is not a client-settable uuid, fall back for that table to "delete this log's children, then insert"
   (needs the DELETE policy R4-0 lists) — decided by the query, not assumed.
4. Errors in plain English, and classified: a network failure (no server `code`) says "Couldn't reach the
   server — your workout is kept on this phone. Tap Save again when you have signal."; a server rejection
   (integrity `23xxx` / RLS `42501`) says the workout couldn't be saved, is still kept, and reports through
   the existing error capture (it already sends the code). Never the raw `tag: message` toast. Keep the
   existing `_verifyClientAccess` + client lookup before the writes, unchanged.
5. Pending state: a failure sets `_runner.pendingSave = { since, name, notes }` and writes the draft (also
   storing `userId: currentUser.id`). `_loadRunnerDraft` keeps a pending draft for up to 14 days instead of
   the same-day cut-off. `_refreshPendingSaveBar()` shows a fixed bar (`#pending-save-bar`, new classes in
   `css/main.css`, ≥ 44 px targets, above the bottom nav) on ANY screen whenever a pending draft for the
   CURRENT user exists and no runner is open: "Workout not saved — {name}", Retry (reopens the runner on the
   finish screen so the user sees Save; never a silent background write) and Discard (`confirmDialog`, then
   best-effort delete of any partial rows by `saveLogId` and clear the draft). Called after `showApp`, on the
   `online` event (also toasts "You're back online — tap Retry to save your workout"), and after a save
   fails, succeeds or is discarded. A page-level bar, not part of a render, so the stale-render class cannot
   overwrite it.
6. Neuter proofs: server-generated ids again → scenarios (2) and (3) must show two rows; drop the pending
   keep-alive in `_loadRunnerDraft` → (5) must fail; drop the retry `update` → (6) must fail. Leave
   `saveRunnerSession`'s synchronous button-disable as it is; do NOT add `guardReentry` to it unless the frozen
   list in `tests/reentry-guard-2026-08-28.spec.js` is updated on purpose.
7. Run serially: `runner`, `solo-account` (smoke gate), `runner-save-metrics`, `runner-template-id-2026-09-04`,
   `runner-cardio-capture-2026-08-08`, `cardio-distance-metres`, `progress-trend`, `progress-hr`,
   `intervals-redesign-2026-07-25`, `ledger-fixes-2026-07-23`, `ledger-fixes-2026-07-30`,
   `effective-coach-id-2026-09-04`, `reentry-guard-2026-08-28`, `reentry-double-invoke-2026-09-04`,
   `rls-audit`, `gdpr-export`. `mobile-check` on the bar at 390×844. Jake, on his phone: airplane mode, finish
   a short workout, Save (message + bar appear), close the app, reopen next day (bar still there), turn
   signal on, Retry — one session in the history.
8. Named, not fixed: true atomicity (the server-side function); background sync while the app is closed
   (needs an installable PWA); a permanent server rejection leaves an unsavable draft until discarded (the
   message says so and error capture records it).

## R4b — one PR rule and a baseline that is correct at any history size (new finding; Real by code shape)

1. RED first (stub-based, no DB rows): `installCappedApi` with 250 prior sets for an exercise whose heaviest
   set is OLD, then finish a session whose best is lighter than that → today the screen shows "🏆 PR"; it must
   not. A second case: the exercise was renamed after its history was logged (same `exercise_id`) → today no
   history is found. Record both RED results.
2. `_prBaseline(clientId, { name, exerciseId })`: ONE bounded query per strength exercise, in parallel —
   `workout_log_sets` with an inner embed of the log-exercise and its log, filtered by the client and by
   `exercise_id` when the runner exercise has one (else by name, as `fetchRunnerLastSession` already does),
   `weight_kg` not null, `order('weight_kg', desc).limit(1)`. One row is the exact maximum whatever the
   history size, so no paging and no `.in()` list of hundreds of ids. Failures are silent to the user and mean
   "no baseline" (never a false PR): finish screen shows no PR chip and logs a warning.
3. `_isWeightPr(bestKg, baselineKg, { requireHistory = false })` — the single rule (`best > 0 && best >
   baseline`; with `requireHistory` a zero baseline means "no PR"). Replace the two inline copies in
   `showRunnerFinish` (the count and the per-exercise chip) with it. Behaviour is unchanged for a first-ever
   log unless Jake answers Q4 differently.
4. Tests: the two RED cases now green; a real-database test proving the embedded-filter + order + limit(1)
   query returns the true maximum (tagged fixture, own cleanup) — this is also the proof that a nested
   embed filter works at two levels; a unit-preference case (runner set in lb → the comparison stays in
   canonical kg); a finish-screen render with a hostile exercise name; unilateral, timed, jump and
   bodyweight exercises never get a PR chip. If `installCappedApi` cannot fake a nested embed filter simply,
   use the real-database test for the query and the stub only for the render.
5. Run: `runner`, `solo-account`, `runner-save-metrics`, `progress-trend`. Neuter proof: put the old
   `.in()` query back → the 250-set case fails.

## R4c — the in-session PR badge (rank 13) — build ONLY if Jake says yes to Q3

1. `fetchRunnerLastSession` is already called once per exercise (~1015, ~2145, ~2163); add a sibling
   `fetchRunnerPrBaseline(ex)` beside it, cached on `_runner.prBaseline[key]`; `undefined` means "not loaded
   yet" and shows nothing; it never blocks or delays a tick.
2. In `renderStrengthTable`, a ticked set shows a small "PR" chip when its weight is above
   `max(baseline, every earlier ticked set this session)` — derived at render from state, never stored, so
   un-ticking removes it. `_isWeightPr(..., { requireHistory: true })` — a first-ever exercise shows nothing in
   the gym even if the finish screen still counts it. No sound, vibration or animation; not written to the
   database. New CSS class, no inline literals.
3. Tests (red first): baseline 100 kg → tick 100 shows no chip, tick 102.5 shows one, un-tick removes it;
   baseline not loaded → no chip and no error; no history → no chip; lb preference; unilateral / timed /
   jump / cardio / bodyweight never show a chip; `tests/runner.spec.js:372` ("rows start EMPTY") still
   green. `mobile-check` at 390×844: the chip must not push the KG/REPS inputs below 44 px.
4. Because this is a feature with no real requester yet, record a prediction in `docs/predictions.jsonl`
   when it ships ("Jake will have seen the PR chip fire in a real session within 3 weeks; if not, remove it")
   and check it at the first `/hello-claude` after the due date.

## R4d — "same as last" (rank 11) — build ONLY if Jake answers Q1 with a real missed-it case

If built, it must honour the reason automatic pre-fill was removed: nothing enters a set until the user does
something on THAT set. Design: a per-row control, shown only when last session has a value at that set index
(`_prevSetsByIndex`, ~396), which copies that one set's weight and reps into THAT row's inputs and leaves the row
un-ticked; the tick still validates. Never automatic, never on the whole exercise, never from a late fetch.
Tests (red first): after `fetchRunnerLastSession` resolves late every row is still empty (the back-door guard,
kept); the control is absent with no history; tapping it fills only its own row; ticking logs the copied
values; bodyweight and a real 0 copy as 0 (the falsy-zero class); lb preference; `runner.spec.js:372`
unchanged. `mobile-check`: a 44 px control per row must not overflow at 390 px. If Jake says no, record the
answer in `docs/decisions.md` and drop it — do not revisit without a new real case.

## R4e — builder "save does nothing" (rank 8) — evidence first, no code planned

1. Ask Q2. If it no longer happens, add a dated line to the ledger row's `status_detail` (it may not be
   closed without Jake's confirmation) and stop.
2. If it still happens: which screen, and what did the console print? Look for the existing
   `[navigate] stale render refused` line (added 2026-09-04) — the ledger names it as the passive test that
   proves or kills the stale-repaint theory. Only if that is silent, add the smallest opt-in trace
   (`localStorage['coachapp.trace']`, console-only timings around `openProgram`, `loadAllPhaseWorkouts`,
   `renderPhaseWeekGrid` and the save handler) so the next occurrence carries evidence — and time a real
   assignment in the same trace, which is the missing measurement for rank 18.
3. Fix only what the evidence names, red-first; note the builder edit path uses a modal, which the
   stale-render guard does not cover.

## Sequence and release gate

R4-0 (Jake) → R4a → R4b → R4c and R4d only on Jake's answers; R4e as evidence arrives. No SQL unless R4-0(a)
says a client-set id is impossible — then a separate, reviewed script. Ownership-adjacent code (R4a writes
`coach_id`/`client_id`): `multi-agent-review` BEFORE that commit (the guard blocks it otherwise; re-run rather
than trust a marker). `checks.sh` each commit; `npm test` in full before any push; a review after the last
commit and `docs/releases/<version>.md` for a release; do not push or tag without Jake's call.

---

# RELEASE 5 — detailed plan (ranks 18, 17, 19, 20: bigger builds), NOT implemented

Goal: make the one large multi-step programme operation safe (assign), and stop two big builds that the code
shows are not needed. Ranks 17 and 19 both rested on premises the code no longer supports — that is the main
result of planning this release. Independent of R1–R4. Same working rules as R1.

## What planning found (this changes the earlier ranking)

1. **Rank 17's ask is already built.** A programme slot's "Edit" opens `openTemplate(templateId, { programId,
   phaseWorkoutId })` (`_editPhaseWorkout`, `js/app-programs.js` ~2335) — the SAME editor v2026.09.6 rebuilt
   around a staged draft. A Save that carries several changes raises ONE "Update assigned clients?" prompt
   (`tests/template-draft-save-2026-09-13.spec.js:505`, opened with a programme context), and leaving with
   unsaved changes asks once. The roadmap and the release note's last line still say this is "not started";
   they are stale. What is genuinely left is a DIFFERENT question: **structure edits to a master programme
   change assigned clients' live plans with no prompt** — `duplicatePhaseWeek` (~2346) clones the week into
   every assigned client's plan, `generatePhasePeriodization` (~1946; its toast says "synced to N assigned
   clients"), `deletePhaseWeek` (~2503) deletes that week from every assigned client and renumbers their
   copies (its confirm says "This removes every session in this week" and never mentions clients) and
   `_cleanupPhaseWeeksBeyond` when a phase is shortened. So there are two regimes: content edits are OFFERED,
   structure edits are AUTOMATIC. That contradicts `docs/schema.md`'s diagram ("future assigns only") and my own
   earlier backlog line — corrected above. Nobody has reported it as a problem; it is a policy call for Jake.
2. **Rank 19's premise is stale on three of four counts.** `_isPlainStrengthExercise` (`js/app-runner.js` ~320)
   says every non-cardio exercise logs through the fast table; unilateral, timed-hold, jump-height,
   jump-distance and %1RM all have table rows, ticks and columns (`_blankTableRow`, `toggleTableSet`; 39
   mentions) and their own specs (`unilateral-runner-2026-08-19`, `runner-fast-table-metrics`). Only cardio and
   intervals still use the one-set-at-a-time flow, which owns the timers and the interval phase auto-logging.
   The ledger row `2026-07-11-runner-phase-2` (deferred by Jake), `docs/technical-debt.md` (~21),
   `docs/roadmap.md` (~71) and even a header comment in `js/app-runner.js` (~300, ~307) still describe the
   old state. What is left is Jake's screenshot ask, "cardio runner needs the same UI as strength runner" —
   a design question, not a build.
3. **Rank 18 (atomic assign): the risk is real by code shape; its size is unmeasured.** `saveAssignProgram`
   (~426) inserts the `client_programs` row first; `_cloneProgramForClient` (~538) then awaits, for EVERY
   session, a template insert and an exercises insert (`_cloneTemplateForClient`, ~486 — two round trips each),
   and only at the very end inserts all `client_program_workouts` rows in one call. Consequences: (a) roughly
   2 × sessions sequential requests — about 100 for a 12-week, 4-session programme; at 100–400 ms each that is
   10–40 seconds behind "Assigning program…" (an ESTIMATE from the loop); (b) if the tab closes or the phone
   sleeps mid-way, the assignment exists with NO schedule rows and every clone made so far is an orphan
   (`client_id` set, nothing points at it) — the code's own comments say nothing ever reaps them and the data
   export lists them as templates the user never made; (c) partial success is handled by toasts ("do not rely
   on this assignment"). The twin `saveAssignProgramToClient` (~896) has the same shape, and `deletePhaseWeek`
   renumbers later weeks one UPDATE per row (its own comment: "The browser has no transaction, so this whole
   function is a sequence of independent writes").
4. **Rank 20 (assign to several clients) has no requester** — a hypothesis that also depends on rank 18.

## R5-0 — what Jake supplies (paste inline, one query per message; read-only)

(a) **Time a real assignment, zero code:** open DevTools → Network, clear it, assign a real programme to a real
client, and read the summary bar (requests and total time). It settles how big rank 18 is.
(b) **Evidence for the orphan and partial-assign risk** (counts only; the first is an upper bound because a
client-owned template can also be legitimate):
```sql
select count(*) as client_templates_pointed_at_by_nothing
from public.workout_templates t
where t.client_id is not null
  and not exists (select 1 from public.client_program_workouts c where c.workout_template_id = t.id);
```
```sql
select count(*) as assignments_with_no_sessions
from public.client_programs p
where not exists (select 1 from public.client_program_workouts c where c.client_program_id = p.id);
```
(An assignment of a programme that has no phases yet is "no sessions" by design — read the result with that.)
(c) **Schema the function must copy** — the tables' columns, triggers and indexes:
```sql
select 'column' as kind, table_name as object,
       column_name || ' ' || data_type || case when is_nullable = 'NO' then ' NOT NULL' else '' end
         || ' default ' || coalesce(column_default, '-') as detail
from information_schema.columns
where table_schema = 'public'
  and table_name in ('workout_templates', 'workout_template_exercises', 'client_programs', 'client_program_workouts')
union all
select 'trigger', event_object_table, trigger_name || ' ' || action_timing || ' ' || event_manipulation
from information_schema.triggers
where trigger_schema = 'public'
  and event_object_table in ('workout_templates', 'workout_template_exercises', 'client_programs', 'client_program_workouts')
union all
select 'index', tablename, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('workout_templates', 'workout_template_exercises', 'client_programs', 'client_program_workouts')
order by 1, 2, 3;
```
(d) **Three questions** (each answer goes in `docs/decisions.md` so nothing is re-litigated): Q1 — should
structure edits (duplicate / delete / generate weeks) keep changing assigned clients' plans automatically, or
ask first? Q2 — what exactly is different about the cardio runner that you want changed (I will attach
screenshots of today's steady-state and interval screens so the question is concrete)? Q3 — how often do you
assign the SAME programme to several clients in one sitting?

## R5a — correct the stale premises (docs and comments only; do first, no risk)

One docs commit, each line pointing at the evidence: `docs/roadmap.md` (~71 the runner Phase 2 line, ~81 the
propagation-redesign line), `docs/technical-debt.md` (~21), `docs/schema.md` (the "future assigns only" diagram
edge — replace with the two regimes above), a dated line in the `2026-07-11-runner-phase-2` row's
`status_detail` (do NOT close it — Jake deferred it), and a `docs/decisions.md` entry recording the corrected
picture. The two stale header comments in `js/app-runner.js` (~300, ~307) go in the next commit that touches
that file (a comment-only commit still needs a cache-bust bump, which the hook does).

## R5b — atomic assign (rank 18; SQL + ownership: `sql-safety` and `multi-agent-review` BEFORE the commit; Jake runs the script)

1. RED first — a new dated spec against the REAL database (own tagged fixtures `[E2E-ASSIGN] …`, rowcount-
   checked cleanup; the reaper already covers `programs`/`workout_templates`/`clients` by name):
   (a) a baseline with the function absent — the current path still works;
   (b) after the script, `db.rpc('assign_program_to_client', …)` on a fixture programme (two phases, three
   sessions incl. one reused in two slots, exercises with `sets_json`, `superset_group`, `metric_type`,
   `family_id`) creates exactly: one `client_programs`, one client-owned template PER SLOT (`client_id` set,
   `program_id` null, `coach_id` = the caller, `is_personal` and `family_id` inherited), every copied exercise
   column, and one `client_program_workouts` per slot with the right `week_number`;
   (c) PARITY — the same programme assigned to a second client through the OLD JS path yields the same
   structure (compared by shape, not ids): this is what stops the SQL drifting from the JS it replaces;
   (d) all-or-nothing — force a failure part-way (a fixture exercise that violates a CHECK) → ZERO new rows in
   all four tables (today: an assignment plus orphans);
   (e) ownership — PT2 cannot assign PT's programme, cannot assign to PT's client, and cannot assign PT's
   programme to PT2's client; a client account and anon are refused; a solo user can assign their own programme
   to their own record and nobody else's; every refusal is preceded by a control proving the fixture rows exist;
   (f) assigning the same programme twice → surfaced as "already assigned" (unique violation), no extra rows;
   (g) a programme with no phases → the same "nothing to assign" outcome as today (the assignment row is still
   created, as now; the result reports zero sessions).
   Record the RED results before writing the function.
2. The script `scripts/add-assign-program-rpc-2026-09-XX.sql` (idempotent `create or replace`, ends in a
   read-back): `assign_program_to_client(p_client_id uuid, p_program_id uuid, p_start_date date) returns jsonb`
   (`client_program_id`, session and exercise counts); `language plpgsql`; **SECURITY INVOKER**, so every insert
   passes today's RLS exactly as the client-side writes do; `set search_path = public`, objects schema-
   qualified; `revoke all … from public, anon`, `grant execute … to authenticated`. It starts by raising unless
   the caller owns the programme (`programs.coach_id = auth.uid()`) AND the client is theirs
   (`clients.coach_id = auth.uid() or clients.user_id = auth.uid()` — the same predicate as
   `_verifyClientAccess`). The clone is set-based: a CTE iterates the programme's slots
   (`program_phase_workouts`, NOT distinct templates — the JS deliberately clones per SLOT so two slots never
   share a client copy) and gives each a `gen_random_uuid()`, so the new template ids can be joined to their
   exercises and to the `client_program_workouts` rows. The column lists come from R5-0(c), not from memory, and
   from what `_cloneTemplateForClient` copies today; the trigger that fills a null `family_id` is left to do so.
3. JS: `saveAssignProgram` and its twin `saveAssignProgramToClient` call `db.rpc` after the existing
   `_verifyClientAccess`/`_verifyProgramOwnership` and restart handling, with the same messages on failure. If
   the call returns "function not found" (PostgREST `PGRST202`), fall back to today's client-side path and log a
   warning once, so a code deploy that outruns the SQL breaks nothing. **Do not delete `_cloneProgramForClient`
   in this commit** — retire it (and any orphan-cleanup helper that becomes unreachable) in a later commit,
   after a release has run the function in production.
4. Deploy order and rollback: Jake runs the script first (nothing calls it yet), then the release ships the code
   that prefers it. Rollback is reverting the code (the old path is still there) or `drop function`.
5. Neuter proofs: remove the coach-ownership predicate → (e)'s cross-tenant case must fail; drop one exercise
   column from the copy → (c) must fail; make the function swallow an error → (d) must fail.
6. Run: `programs`, `client-workout`, `solo-account` (smoke gate), `program-ownership-anchors-2026-08-22`,
   `builder-happy-path-2026-08-22`, `client-scoped-writes-2026-08-21`, `rls-audit`,
   `audit-ownership-anchors-rls-2026-08-12`, `gdpr-export`. No UI change, so no `mobile-check`. Jake: repeat the
   Network-tab timing from R5-0(a) after release and compare.
7. Named, not fixed: **restart** (`_removeAssignmentAndClones` then assign) is still two steps and not atomic;
   the week operations (`deletePhaseWeek`, `duplicatePhaseWeek`, `generatePhasePeriodization`) have the same
   no-transaction shape and are the next candidates for this pattern once assign has proven out; orphans made
   in the past are not cleaned up (a separate, reviewed cleanup script if R5-0(b) shows a real number).

## R5c — cardio runner "same UI as strength" (rank 19) — no build until Jake says what he wants

Nothing to implement yet. After R5a, ask Q2 with today's cardio screens attached. The two shapes the answer
could take: a cardio table for steady-state cardio only (rows of time, distance and heart rate, tick to log),
with intervals keeping their phase flow; or leave it. Risk to weigh before saying yes: the one-set-at-a-time
flow owns the timers and interval auto-logging that R1e deliberately left tick-based, and a large family of
cardio and interval specs sit on it — do not fold intervals into a table.

## R5d — structure edits and assigned clients (rank 17, reframed) — decision first

If Jake answers Q1 with "ask first", the smallest change is wording and one confirm, not a new draft model:
`deletePhaseWeek`'s confirm gains "…and from N assigned clients' plans" (the count comes from the same
`client_programs` read the function already does); `duplicatePhaseWeek` and `generatePhasePeriodization` say how
many clients will also be updated, with an "Only this programme" choice — a client's plan then diverges from the
master, and the toast must say so. A full staged draft for the programme grid is NOT recommended: the template
builder took 47 commits and three review rounds, for an ask the shipped editor already meets for content. Tests
(red first): the wording for N = 0, 1 and 3; "Only this programme" leaves clients' plans untouched; the default
path behaves exactly as today. If Jake says the current mix is what he wants, record it in `docs/decisions.md`
and stop.

## R5e — assign to several clients (rank 20) — only after R5b, and only if Q3 says it is a real chore

The modal gets a client checklist (search, "select all active") and one shared start date. Per-client 1RM
readiness collapses to a summary ("2 clients are missing 1RMs — the runner will ask them"); the quick-entry
rows stay single-client. A client who already has the programme is listed as "already assigned — skipped"
(restart stays single-client because it is destructive). Execution is SEQUENTIAL calls of the R5b function
with a live "3 of 5" list, a per-client result, failures that do not stop the rest, and a final "Retry
failed" — never `Promise.all` (each call is atomic; parallel calls only add server load). `guardReentry`
applies. Tests (red first): stubbed `db.rpc` with mixed success and failure per client, a hostile client
name, an empty selection disables the button, ids come only from the coach's own client list and every
call re-verifies ownership; `mobile-check` at 390×844 for the checklist scroll and 44 px targets.

## Sequence and release gate

R5-0 (Jake) → R5a (docs) → R5b (Jake runs the SQL first; review before the commit) → R5c / R5d / R5e only on
Jake's answers. The guardrail hook blocks a `.sql` commit without a `sql-safety` marker and an ownership commit
without a fresh review marker — re-run the review rather than trust a marker. Full `npm test` before any push, a
review after the last commit, `docs/releases/<version>.md`; do not push or tag without Jake's call.

---

# SAVED FOR NEXT SESSION — NOT YET IMPLEMENTED
# Check-in colour fix, then close the check-in loop (coach inbox, "seen", reply, tap-button form)

**Status (2026-09-19):** planned in full, decisions taken with Jake (see below), approval to build deferred to
the next session. To resume: read this file, then start with Commit A (colour fix). Nothing in this plan
has been built or committed. A second, separate product review (workout runner) is appended at the END of
this file — it is a backlog, not a plan.

## Context

A product review of check-ins and progress tracking (chosen by Jake) found two things worth building
first. (1) A defect: the coach's Overview colours all four check-in metrics as "high is good", so stress
5/5 and soreness 5/5 show GREEN and 1/5 shows RED — the two scores a coach most needs to notice. Not yet
on the bug ledger. (2) A dead end: a client submits a check-in and hears nothing back; the coach sees it
only by opening that client's Overview (latest + three previous); no way to mark it seen or reply.
Outcome: correct colours, a coach "Check-ins to review" list with Seen ✓ and a one-line reply that the
client sees, and a check-in form that can't be "answered" by not answering.

Three local commits already exist (`7e32b72`, `f0cd8e8`, `5419deb`), unpushed; nothing here touches them.

## Decisions taken with Jake

- **Clients may delete their own check-ins** (own rows only). It lets specs clean up after themselves
  — three specs (`regression-2026-07-13`, `rls-audit`, `audit-ownership-anchors-rls-2026-08-12`) run a
  cleanup `delete()` that today removes nothing, because no delete grant exists; one comment admits an
  inert row is left every run — and gives clients row-level control of health data.
- "Seen" is an explicit tap, never automatic on opening a profile (opening is not reading).
- The inbox shows UNREVIEWED check-ins from the LAST 14 DAYS. No back-fill: fabricating "reviewed" on
  old rows would be false data.
- Two commits: A = colour fix (no SQL, lands alone); B = the loop + form.

## Verified facts that shape the design

- Check-in form lives ONLY on the client dashboard (`js/app-dashboard.js` ~601–620): `<input type=range>`
  with no live value, pre-filled with last week's answers, untouched = submits the default.
  `saveClientCheckIn` (`js/app-clients.js:~84`) reads `#ci-sleep/energy/stress/soreness/notes`.
  Specs set those ids (`tests/own-client-writes-2026-08-21.spec.js`) — KEEP the ids as hidden inputs.
  `#ci-notes` also exists in the goal check-in modal (`js/app-calendar-goals.js:995/1018`): safe today
  (never in the DOM together), named as a latent risk.
- `ciColour`/`ciTrend` are local to `renderClientOverview` (`js/app-clients.js`); three call sites.
- RLS today on `client_check_ins`: client INSERT, client SELECT, coach SELECT only — no UPDATE/DELETE.
- Coach writing for a client: `_verifyClientAccess(fn, clientId)` (`js/app-core.js`) already accepts
  `coach_id === me`. The write must key on BOTH ids: `.eq('id', checkInId).eq('client_id', clientId)`
  (the "guard verifies one id, write keys on another" class) and confirm exactly 1 row came back (the
  "policy-refused write reports success" class).
- `renderDashboard` (`js/app-dashboard.js:29`) fetches the coach's clients FIRST (`coachClients`,
  `coachClientIds`), so names and the ownership anchor are already in hand — no embed needed.
  Reuse `openClient(id)`, `_failedFetches` / `_fetchFailureBanner`.
- Export uses `select('*')` on `client_check_ins`, so new columns flow into the data export unchanged.

## Commit A — colour polarity (no SQL)

1. File `docs/bugs/2026-09-19-check-in-stress-soreness-colours-inverted.md` (intake rule, before code).
2. `CHECKIN_METRICS` in `js/app-core.js` (loads first, so no backward-reference): key, label, abbr,
   `goodWhen: 'high'|'low'`, end labels. `_checkInTone(metric, val)` → good/ok/bad; `_checkInFlagged(row)`
   (sleep/energy ≤2, stress/soreness ≥4).
3. RED first: `tests/checkin-review-2026-09-19.spec.js` calls `renderClientOverview` with `db.from`
   stubbed (fixture rows, no writes, no debris) and asserts stress 5 / soreness 5 are not green and
   stress 1 is not red. Then replace `ciColour` at its 3 call sites with the shared tone helper.
4. Raw hex literals leave `js/app-clients.js`, so the style baseline falls — pin it AT the new count.
5. Gates: `checks.sh`, affected specs, commit (hook bumps `?v=`).

## Commit B — the loop

### Database — ONE script `scripts/add-checkin-review-2026-09-19.sql`, pasted inline
Before writing: `sql-safety`; ONE read-only schema query first (columns, policies, grants, FKs of
`client_check_ins`); Jake pastes the result. Then the script (idempotent; ends with a read-back SELECT):
- `coach_reply text` (CHECK ≤ 500 and not blank), `reviewed_at timestamptz`,
  `reviewed_by uuid references public.profiles(id) on delete set null`.
- `revoke update … from authenticated; grant update (coach_reply, reviewed_at, reviewed_by) …` — a coach
  can never alter a client's ratings or notes; a table-level UPDATE grant would allow it.
- UPDATE policy for the coach: `client_id in (select id from public.clients where clients.coach_id =
  (select auth.uid()))`, same in `with check`. Clients get no UPDATE policy.
- DELETE policy for the client: own rows only (`clients.user_id = (select auth.uid())`).
- `BEFORE UPDATE` trigger: when reply or reviewed_at changes, the SERVER sets
  `reviewed_at := coalesce(old.reviewed_at, now())` and `reviewed_by := auth.uid()` — the client
  (here, the coach) cannot forge or clear them. Lesson from `app_errors`: never let the caller choose a
  timestamp the rules depend on.

### Code
- `js/app-core.js`: shared `_checkInToneColour`, `CHECKIN_METRICS` (above).
- `js/app-clients.js` `renderClientOverview`: shared tone colours; per check-in show Seen state and
  reply; latest gets `Seen ✓` / `Reply`. New `markCheckInSeen(id, clientId)` and
  `replyToCheckIn(id, clientId)` — ONE implementation used by both Overview and dashboard, each:
  `_verifyClientAccess` → update keyed on both ids `.select('id')` → require exactly 1 row → toast; the
  button disables while saving; nothing personal in any `log.*` call.
- `js/app-dashboard.js` `renderDashboard`: query `client_check_ins` `.in('client_id', coachClientIds)
  .is('reviewed_at', null).gte('created_at', 14 days ago).order('created_at', desc).limit(20)`; add it
  to `_failedFetches`; new "Check-ins to review" card (left column): client name (→ `openClient`),
  date, four tone-coloured scores, a Flagged chip (flagged rows first), one-line escaped note excerpt,
  inline Seen ✓ / Reply. Empty state is honest ("Nothing to review").
- `js/app-dashboard.js` `renderClientDashboard` check-in card: five 44px tap buttons per metric, NO
  default, per-metric end labels ("Slept badly ↔ Slept great", "Calm ↔ Very stressed"), hidden
  `#ci-<metric>` inputs (ids kept), submit disabled until all four answered; fetch the last TWO
  check-ins to show "vs last week" arrows; show the coach's reply and "Seen by your coach ✓" under the
  last check-in. `checkInDue` (7 days) unchanged; the "Due forever, no dismiss" debt is named, not fixed.
- `css/main.css`: classes for the new UI (no inline literals — the style-literal ratchet counts them).
- `scripts/reap-e2e-debris.mjs`: add `['client_check_ins','notes']` (test rows tagged `[E2E-CI]`).
- Docs: `docs/decisions.md`, `docs/schema.md`, `docs/roadmap.md`.

### Tests — red first, own tagged fixtures, rowcount-checked cleanup (now possible)
- Stub-based (no DB writes): tap-button form (no default, submit disabled until four answered, payload
  correct, ids preserved); pure inbox renderer with a hostile fixture (`<img onerror>` in notes shows as
  text); flagged ordering; reply/seen rendering on the client card.
- Real database, behavioural (after the SQL): coach sets reply/seen on OWN client's check-in and the
  server stamps `reviewed_at`/`reviewed_by`; cannot un-review; cannot change ratings or notes (column
  grant → 42501); a different coach (`loginAsPT2`) and the client cannot update; length CHECK; client
  deletes own row and a different coach cannot; the client sees the reply on their dashboard. Each
  refusal is preceded by a control proving the row exists.
- Existing specs that touch check-ins run unchanged; with the DELETE policy the client-session cleanup
  in `regression-2026-07-13` starts working (the coach-session cleanups in `rls-audit` and
  `audit-ownership…` still remove nothing — named, not fixed).

### Sequence and gates
Commit A → schema read query → Jake runs the script, I read state back → red-first specs → code →
green → `multi-agent-review` BEFORE the commit (RLS/ownership; the guard blocks otherwise; the last
review hit a rate limit mid-run, so re-run rather than trust a marker) → `checks.sh` → `mobile-check`
at 390×844 (tap targets ≥44px, dashboard card, Overview — look at the screenshots) → `feature-audit`
→ commit. No push, no tag. Nothing touches the database until Jake runs the script.

### Not in scope (named)
Reminders / due window / snooze; client-side history and readiness trend; alert signals for going
quiet; configurable questions; measurements; photos; notifying the client that a reply arrived (no
notification infrastructure — they see it next time they open the app); a client-facing delete button
(the permission only; no UI).

### Verification
Red run recorded for the colour test and each real-table refusal; green after; neuter proofs for the
ownership check and the one-row-confirmed check in the write helper; `checks.sh` passes; related specs
serial; after deploy Jake confirms as coach that a real client check-in appears, Seen ✓ and Reply work,
and the client sees the reply (the live path, not automatable across real accounts).

---

# BACKLOG (not a plan): product review of the workout runner, 2026-09-19

Grounded in `js/app-runner.js` (3,476 lines) and `docs/technical-debt.md`. Nothing here is built.

## What exists

Launch or resume from a localStorage draft (autosave + safety net); fast strength table (per-set targets,
live rep tally, previous-session reference, add/delete rows); one-set wizard for cardio / timed /
unilateral / %1RM; session clock (start-time based, correct); rest timer (auto after a set, per-exercise,
default 90 s, beep + voice cues); set, cardio, count-in and interval-phase timers; skip / jump / back;
mid-session swap or add exercise; finish screen (duration, volume, notes); save; post-session 1RM prompt;
coach can open a session and add notes.

## Verified absent (grep, 0 hits)

Screen wake lock (nowhere in `js/`); any `visibilitychange` / lock handling; offline handling; in-session
PB moment; exercise demos. Also: strength inputs start EMPTY (last session is placeholder text) — a full
retype every set (already banked in `docs/technical-debt.md`); the rest timer decrements a counter each
second (`_runner.restRemaining--`, `js/app-runner.js` ~1666) rather than counting to an end time, so a
locked phone freezes it and silences its cues.

## Opportunities (priority 1–10)

| # | Opportunity | Evidence | Complexity | Value | Priority |
|---|---|---|---|---|---|
| 1 | Rest timer survives a locked phone: screen wake lock + end-time counting | Real (code shape) | Low | High | 9 |
| 2 | Pre-fill strength sets "same as last time" (one tap, never auto-logs) | Real (banked gap) | Low-Med | High | 8 |
| 3 | Retry-safe save + visible "not saved yet" state on flaky gym wifi | Real risk, verify first | Medium | High | 8 |
| 4 | Runner Phase 2: unilateral, then timed/cardio/%1RM in the fast table | Real (named backlog) | High | High | 7 |
| 5 | In-session PB badge (strength only; badge first) | Hypothesis | Low-Med | Medium | 6 |
| 6 | Superset auto-advance — first count templates that use `supersetGroup` | Real (named v1 gap) | Medium | Medium | 5 |
| 7 | Exercise demo links (`demo_url`, no hosting) | Hypothesis | Low-Med | Medium | 5 |
| 8 | AMRAP / EMOM / circuit timer modes | Real (open ledger row 2026-07-29) | Med-High | Medium | 4 |

Key tasks for the top three:
- (1) `navigator.wakeLock.request('screen')` on runner start, release on finish/discard, re-request on
  `visibilitychange`, feature-detect; rest/set/cardio timers store `endsAt = Date.now() + n*1000` and fire
  the cue once on return if it has passed; stub-based specs (wake lock acquire/release/re-acquire; advance
  `Date.now` 60 s and assert remaining). Verify on Jake's own phone.
- (2) per-exercise "Fill from last session" and a per-row copy-previous; pre-fill must NEVER count as a
  logged set (only the tick logs); test bodyweight, lb, and the falsy-0 case.
- (3) first a fault-injection spec: fail the sets insert, retry, assert ONE session row; then a client-side
  `session_uid` + upsert (or delete the partial parent), a persistent "Not saved — Retry" bar, an `online`
  auto-retry.

Not recommended: a plate calculator (built from competitor research and deleted 8 days later after one real
gym session — see memory), background push alerts (need the installable-app step first; a wake lock covers
most gym use without it).

Outside the product: 20+ runner rows sit `fixed-awaiting-jake` in the bug ledger — Jake's confirmation
time, not code, is what limits how fast runner quality moves.

All four areas are now reviewed; the coach dashboard / client management backlog is the last section of this file.

---

# BACKLOG (not a plan): product review of the programme builder, 2026-09-19

Grounded in `js/app-programs.js` (2,821 lines), `docs/roadmap.md`, `docs/technical-debt.md`, `docs/schema.md`
and the bug ledger. Nothing here is built.

## What exists

Programme CRUD; phases with durations; weekly grid builder with a workout picker per day slot (create a
workout inline); duplicate a week (once or ×N); delete a week (renumbers); periodisation (per-day tiers,
generated week variants with % progression); assign to ONE client with a start date, restart from a new
date, edit start date, unassign; 1RM readiness checklist at assignment; each assignment clones every
session row-by-row for that client; Personal ↔ Coaching move/copy; delete with orphan cleanup; per-client
Programs tab; client dashboard hero "phase · week".

## Verified (in code)

- Assign clones sequentially: for every session in every phase it AWAITS a template clone, then one insert
  of the schedule rows; the `client_programs` row is inserted BEFORE the clone, so a failed clone leaves "an
  assignment with no sessions behind it" (the code toasts "do not rely on this assignment"). 19 inserts, 17
  deletes and ~15 loops in the module; three orphan-cleanup helpers plus `deleteProgram` orphan handling.
  Round-trip count and seconds are ESTIMATED from the loop, not measured.
- The assign modal takes one client; the programme list shows name + phase count only (no search, sort or
  "assigned to N"); NO coach-facing signal that a client's programme is ending or ended.
- After a programme's last week the client dashboard hero falls back to the last phase and keeps counting
  ("Peak · Week 15" on a 12-week programme) — `js/app-dashboard.js` 359–364; read from code, not run.
- Master edits affect only FUTURE assignments (by design, `docs/schema.md`). **CORRECTED by the R5 planning read:** not accurate — a workout-content edit offers to update assigned clients' copies, and structure edits (`duplicatePhaseWeek`, `generatePhasePeriodization`, `deletePhaseWeek`, `_cleanupPhaseWeeksBeyond`) change them automatically; `docs/schema.md`'s diagram is wrong on this point.
- Open HIGH ledger rows here: builder slowdown + "save does nothing until refresh" (Jake, live, 2026-08-07);
  `saveNewTemplate` writes `program_phase_workouts` with no ownership check (2026-09-18); periodisation
  reps is an unescaped stored attribute and the checker is blind to it (2026-09-06); copy-to-coaching
  creates an undeletable orphan for a solo user (2026-09-06). Titles read; bodies not re-verified.

## Opportunities (priority 1–10)

| # | Opportunity | Evidence | Complexity | Value | Priority |
|---|---|---|---|---|---|
| 1 | Close the open HIGH rows: ownership gap, unescaped attribute, solo orphan | Real (ledger) | Low-Med | High | 9 |
| 2 | Builder slowness / "save does nothing": instrument first, then fix | Real (Jake live) | Medium | High | 8 |
| 3 | Atomic server-side assign (one RPC, all-or-nothing) — measure first | Real (structural) | High | High | 7 |
| 4 | Edit once, apply on Save (propagation redesign) | Real (Jake's ask) | High | High | 7 |
| 5 | Programme-ending signal + "Assign next block"; fix "Week 15" display | Real (gap verified) | Medium | High | 7 |
| 6 | Assign to several clients at once (after 3) | Hypothesis | Medium | Med-High | 6 |
| 7 | Programme list that scales: search, "assigned to N", last edited | Hypothesis | Low | Medium | 5 |
| 8 | "Update assigned clients" from the master (future, unlogged sessions only) | Hypothesis | High | High | 5 |

Key tasks:
- (1) `saveNewTemplate`: verify the phase/slot before writing (`_verifyPhaseOwnership` /
  `_verifyPhaseWorkoutOwnership` already exist, `js/app-programs.js` ~51–62), with a red-first cross-tenant
  probe; escape the stored periodisation attribute and teach `check-escaping.mjs` the case with a fixture;
  fix or block the solo copy-to-coaching orphan. `multi-agent-review` before the commit (ownership work).
- (2) timing marks around `openProgram`, `loadAllPhaseWorkouts`, `renderPhaseWeekGrid` and the template
  save on Jake's real programme; count queries and rows per open (200-row API cap hazard); fix what the
  trace shows; add a stub-based perf budget; close the row only on Jake's confirmation or red→green.
- (3) time a real 12-week assignment first; then a SECURITY INVOKER Postgres function that clones
  templates, exercises and schedule rows in one transaction with an explicit ownership check; replace the
  loop in `saveAssignProgram`; retire the client-side clone and cleanup helpers only after a release runs it.
- (5) compute end date from `start_date` + phase durations (logic already in `renderClientDashboard`); coach
  dashboard chip "ends in ≤ 7 days / ended" with "Assign next block" prefilling the start date; client hero
  stops at "Complete" instead of counting on.

Not recommended now: auto-progression suggestions, cross-coach programme sharing, print/PDF export — until a
coach asks for one. Suggested order: 1 → 2 (measure) → 5 → 3 / 4.

---

# BACKLOG (not a plan): product review of the coach dashboard and client management, 2026-09-19

Grounded in `js/app-dashboard.js` (`renderDashboard`) and `js/app-clients.js` (`renderClients`, profile tabs).
Cross-checked with the saved check-in plan above: its dashboard inbox card adds ONE bounded query and does not
conflict; opportunity 1 below would later replace two capped client-side aggregations with one function.

## What exists

Dashboard: total clients, adherence panel ("This week's sessions": sessions logged in the last 7 days per
ACTIVE client, fewest first, filter All / At risk / Active), recent activity (last 8 weigh-ins/sessions),
goals due in 14 days (5), fetch-failure banner. Client list: alphabetical rows with a status badge and a
coloured "last session" label; "+ Add client". Profile tabs: Overview (contact, one notes blob, programme,
latest check-in + previous three), Goals, Workouts, Weight, Performance, Programs, 1RMs; owner-only "View
as"; send invite.

## Verified (in code)

- `renderDashboard`: `workout_logs` this month `.limit(100)`, `weight_logs` 7 days `.limit(30)`; "sessions this
  week" and "quiet" are built from those rows. Over 100 sessions in the window (about 33 clients at 3 a week)
  the oldest days drop out and active clients read as at risk. The panel counts sessions LOGGED, not sessions
  PLANNED, so a rest week or holiday reads as at risk.
- `renderClients`: last session per client comes from the newest 200 logs across ALL clients; a client not in
  that window shows "No sessions" (grey) instead of "35d ago" (red) — the clients most in need of a chase.
  Live impact unmeasured; 200 logs is about 3 weeks of history for 20 clients at 3 a week.
- No search, filter or sort in the client list; no invite state or resend beyond a send action; no tags or
  cohorts; no CSV export; one notes blob per client (overwritten, no history).

## Opportunities (priority 1–10)

| # | Opportunity | Evidence | Complexity | Value | Priority |
|---|---|---|---|---|---|
| 1 | Correct "last active" and "at risk" at any roster size (one summary function) | Real (code shape) | Medium | High | 9 |
| 2 | Client list you can triage: search, filter, sort, richer rows | Real gap | Low-Med | High | 8 |
| 3 | One ranked "Needs attention" list, plan-aware (rest weeks not at risk) | Real (vision) | Med-High | High | 8 |
| 4 | Invite state and resend ("Invite pending 4d") | Real gap | Low-Med | Med-High | 7 |
| 5 | Profile header as a cockpit + one-tap contact (mailto / tel / WhatsApp link) | Hypothesis | Low-Med | Med-High | 6 |
| 6 | Dated coach notes timeline (note: personal data of the client — export/erasure) | Hypothesis | Medium | Medium | 5 |
| 7 | Offboarding / archive flow with a coach-side notice | Real (roadmap) | Med-High | Medium | 5 |
| 8 | Tags/cohorts + bulk actions; coach business KPIs | Hypothesis | Med-High | Medium | 4 |

Key tasks:
- (1) stub-based spec first: 300 fixture logs, one client last seen 35 days ago must read "35d ago"; then ONE
  `coach_client_summary()` function (SECURITY INVOKER, RLS applies) returning per client: last session date,
  sessions in the last 7 and 28 days, last weigh-in, last check-in + flags, programme end date; switch the
  dashboard adherence panel and the client list to it; grep the sibling capped aggregations and count them.
  It also feeds the check-in signals, the programme-ending chip and the KPI ideas.
- (2) search (reuse the library's pattern), status chips, sort (name / least recently active / needs
  attention), rows showing programme + week, last check-in flag and invite state.
- (3) reasons: no session vs PLAN, overdue or low check-in (from the inbox plan), no weigh-in 14 d,
  programme ending 7 d, goal due 7 d; ranked, one row per client, 7-day snooze, holiday-aware.
- (4) verify that `clients.user_id` is null until the invite is accepted; show "Invite pending" with age and a
  resend action; dashboard chip for invites pending over 5 days.

Not recommended now: in-app messaging (your vision ranks comms low; a WhatsApp/mailto link covers it),
payments/invoices, white-label client portal.

Suggested cross-area order (all four reviews): colour fix → check-in inbox (saved plan) → close the open HIGH
programme ledger rows → correct last-active/at-risk (1) → wake lock + end-time timers → programme-ending
chip → client-list triage (2) → invite state (4).
