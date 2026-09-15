---
id: 2026-08-12-app-programs-phase-writes-no-ownership-anchor
status: fixed-awaiting-jake
priority: high
reported: 2026-08-12
status_detail: "IMPLEMENTED + REVIEWED 2026-08-22, awaiting Jake. multi-agent-review (3 agents + verifier) run and all findings actioned; checks.sh GREEN (56 passed, exit 0). Four helpers in app-programs.js applied at 14 entry points, plus a template-ownership check at _quickAssignPhaseWorkout. SCOPE CORRECTION: this row said '~20+ call sites' and named four; real figure is 45 writes across 23 functions, and its line numbers had drifted (savePhase listed at 1324, actually 1418). It also missed unassignProgram. Scoped from a fresh grep. Coverage: 14 gated at entry, 2 already correctly anchored and left alone (moveProgramToPersonal, copyProgramToCoaching), 7 internal helpers covered by construction with every caller checked. ONE MODULE ONLY: app-programs v43->v44."
---

# app-programs.js has no ownership-anchor helper for program_phases/program_phase_workouts — ~20+ write call sites are .eq('id', X)-only

Found by the 2026-08-12 full-codebase audit (`architecture-audit-2026-08-12.md`). This file is the heaviest `db.from()` user in the whole repo (87 calls, of which only 7 route through `dbq()`) and has no equivalent of `_verifyTemplateOwnership` (js/app-workouts.js:2560) for its own tables.

## Representative sites (not exhaustive — same shape repeats throughout the file)

- `saveEditStartDate` (623) — `client_programs` update, `.eq('id', assignmentId)` only.
- `saveProgram` update (1031) — `programs` update with no `coach_id` anchor AND no rowcount check — notably, this file's own `moveProgramToPersonal` (1120-1122) explicitly documents *why* both are required ("PostgREST returns error:null for an UPDATE that matches ZERO rows... a write that changed nothing reports a green success"), and `saveProgram` doesn't follow its own sibling's documented rule.
- `savePhase` update (1324) — `.eq('id', phaseId)` only.
- `deletePhase` (1361) — `program_phases` delete, zero anchor, despite a 6-line comment (1347-1352) in the same function about the exact cascade risk of this delete.
- `generatePhasePeriodization` (1514) — fetches the phase via `.eq('id', phaseId).single()` with no ownership check before fanning out template/exercise/phase-workout writes across every assigned client.
- `savePeriodizationConfig` (1502, 1506), `duplicatePhaseWeek` (1943, 1955), `deletePhaseWeek` (2050, 2064, 2070, 2076), `_quickAssignPhaseWorkout` (2271), `removePhaseWorkout` (2287) — same unanchored shape.
- `_deleteOwnedUnreferencedTemplates`'s own ownership-*select* (1698) has no `coach_id` filter — it trusts the caller's `programId`/`phaseIds` to already be scoped, and (separately) its "still referenced" check only looks at `program_phase_workouts`, unlike its sibling `_removeAssignmentAndClones` (267-274) which also checks `workout_logs` before deleting a client-owned clone — a plausible path to silently orphaning a logged session's `template_id` link.

## Also found in this file, same root problem

- `saveAssignProgram` (309) and `saveAssignProgramToClient` (704) insert `client_programs` from a caller-supplied `clientId` never checked against `currentUser`'s own client list.
- `_cloneTemplateForClient` (334-341) inserts `workout_templates` with `client_id: clientId` unverified (contingent on the above).

## Why this matters

No RLS SQL is tracked in this repo, so every one of these is "relying on unverified RLS as sole backstop" — this file accounts for roughly 30% of every raw, unwrapped `db.from()` call in the entire codebase, and has zero of the ownership-verification pattern its sibling module (app-workouts.js) established for the identical problem (template ownership).

## Suggested fix direction

A `_verifyProgramOwnership(programId, coachId)` / `_verifyPhaseOwnership(phaseId, coachId)` helper pair, mirroring `_verifyTemplateOwnership`, applied to every write listed above. Given the sheer number of call sites, this is a genuine refactor-scale fix, not a one-line patch — worth scoping as its own session rather than folded into unrelated feature work.


---

## FIX, 2026-08-22 — what was proven, and what was not

**NEW TEST:** `tests/program-ownership-anchors-2026-08-22.spec.js`, 2 tests, red-before/green-after
proven by neutering ONLY the two pair assertions (ownership check left live, so the tests could only
go red for the reason claimed). Restore verified: 0 neuter markers, both assertions present.

**Deliberately SINGLE-TENANT, and that is the point.** A cross-tenant refusal probe would have proven
nothing here — RLS already refuses foreign writes, so it passes with the guard deleted (the decorative
-test trap, hit three times on 2026-08-22). Both tests instead pass MY OWN mismatched ids:

- `savePhase` — a phase of program A while claiming program B. Both mine, so RLS permits the UPDATE.
  Neutered, phase A is silently renamed while the UI re-renders program B.
- `removePhaseWorkout` — a slot in phase P1 while claiming P2. Neutered, `survived.slot === false`:
  **the slot was actually deleted.** Real data loss, single-tenant, invisible to RLS. It then hands the
  wrong phaseId to `_deleteOwnedUnreferencedTemplates`, so the template sweep runs against a phase that
  never referenced it.

**ORDERING, not just presence.** `deleteProgram` was ALWAYS anchored on `coach_id` — but only on its
last statement; the phase-slot delete and template sweep ran first, unanchored. Same shape as
`2026-08-22-resolveeditabletemplateid-writes-before-the-ownership-check`. The gate is now ahead of the
cascade. Same for `savePeriodizationConfig`, whose per-slot tier writes land before the phase update.

**`saveProgram` also gained the anchor + rowcount** it was missing, matching `moveProgramToPersonal`
90 lines below it — which documents in a comment exactly why both are required. The sibling breaking
its own family's documented rule.

## NOT proven

- **2 of 45 write sites carry a red-before test.** The other 43 are covered by construction (gated
  entry point, or a helper whose every caller is gated) and by the suite not regressing — that is an
  argument, not a red-before. Do not read this row as "the class is closed and tested".
- **Legitimate-user safety is evidenced, not exhaustively proven.** The real risk of a guard is
  refusing the rightful user (solo self-assign, coach in "View as"). Full suite: 532 passed / 2 failed
  / 2 flaky / 1 skipped; the 8 program-flow specs: 73 passed / 0 failed / 1 flaky. No ownership
  refusal appeared in any legitimate path. Both full-suite failures were classified, not counted:
  `solo-genuine-role:157` performs no writes and calls none of the changed functions, and
  `solo-genuine-role:105` seeds via raw `db.from()`, bypassing every gate.
- **checks.sh is RED** — `runner.spec.js:139`, `TimeoutError` inside `loginAsPT` (helpers.js:31), in
  `beforeEach`, before the assertion runs. The test is a pure two-number function in an untouched
  file and passes isolated. This is the dominant signature of
  `2026-08-14-test-gate-flakiness-returned-across-two-unrelated-files`, and ~680 sign-ins were driven
  against one Supabase project today — its documented dose-response regime. **The gate must be re-run
  on a cold session before this pushes; it was not bypassed.**
- **Fixture cleanup** is by an owner-anchored, rowcount-checked `afterEach` sweeping by name. Not
  independently re-verified against the database afterwards.

**Closes when:** Jake confirms the builder still behaves (create/rename a phase, duplicate and delete a
week, assign and unassign a program, both as coach and in Personal view), OR the remaining sites get
their own red-before coverage.


---

## MULTI-AGENT REVIEW, 2026-08-22 — 4 findings actioned, 1 design reversal

**BLOCKING (Agent A), fixed.** `_verifyProgramOwnership` originally resolved its anchor through a
role-aware helper (the `_resolveTemplateOwnerCoachId` pattern). For `role='client'` that returns THE
CLIENT'S COACH's id — so the gate asked *"is this my coach's program?"* and returned TRUE for that
coach's entire program set. Reachable shape: a **master account** (a coach who is also another coach's
client) in Client view, where `currentProfile.role` is forced to `'client'` while `currentUser.id`
stays their own. I reused that helper because it was the established pattern and I had verified it safe
for solo and sudo — I checked the two cases its own comment enumerates and never asked whether the
enumeration was complete. It was not: the third case is a coached record under a foreign coach.

Fixed by anchoring on `currentUser.id` directly. That is not merely safer, it is the correct question:
`programs.coach_id` is the authoring account's own auth uid at **both** writers in the repo
(`saveProgram`'s insert, `starter-content.js:145`), and it matches all six sibling `programs` writes.

**Agents A and B disagreed on severity** — A called it blocking, B non-blocking on the grounds that no
client-role route reaches these functions. Verified myself: B is right about reachability
(`clientPages` excludes `programs`, and `navigate()` hard-blocks that page for `role='client'`), A is
right about correctness. Fixed regardless, because it is free and the premise of this whole commit
family is app-level defence that does not assume RLS.

**DESIGN REVERSAL.** The first cut moved `_resolveOwnerCoachId` into app-core and made app-workouts'
`_resolveTemplateOwnerCoachId` delegate to it. Once `_verifyProgramOwnership` stopped using it, that
move became churn across two modules for no benefit — **reverted**. app-core and app-workouts are now
untouched; the diff is one module. (`_resolveOwnerCoachId`'s `.single()` ambiguity for a master account
with two `clients` rows is real but PRE-EXISTING in app-workouts — needs its own row, not this one.)

**ORDERING, again (all three agents).** The `deleteProgram` gate sat above the phase cascade but BELOW
a `_removeAssignmentAndClones` loop that deletes `client_program_workouts` and template clones — while
carrying a comment claiming it was "BEFORE the cascade". Third instance today of committing the
write-before-check error while writing a comment about write-before-check. Now the first statement in
the function, ahead of every read and write.

**TWO-ID SHAPE FROM WINDOW STATE (Agent A).** `duplicatePhaseWeek` / `deletePhaseWeek` verified
`phaseId` then keyed their client-copy fan-out on an unasserted `window._openProgramId`. Same defect,
sourced from window state rather than a parameter. Both now pass it as `expectedProgramId` (null skips
the assertion, so no legitimate-user risk).

**UNVERIFIED templateId (Agent A).** `_quickAssignPhaseWorkout` gated `phaseId` but wrote a
caller-supplied `templateId`. Now checked via `_verifyTemplateOwnership`. Confirmed genuinely
exercised, not vacuously green: `_pickWorkout` -> `_quickAssignPhaseWorkout`, and three
`programs.spec.js` tests drive it and assert the slot fills.

## The test file was itself defective — and it was my anti-decorative test

**One of its two assertions was decorative (Agent C).** `survived.tmpl` asserted a template was not
swept, but the fixture had `program_id` AND `generated_from_phase_id` both NULL, and
`_deleteOwnedUnreferencedTemplates` builds its ownership clause from exactly those two columns — so the
template was never a deletion candidate and the assertion held with the guard deleted. I verified the
*slot* assertion was load-bearing and never checked its neighbour. Fixed by giving the fixture
`program_id`, and re-proven by isolating it: neutered, `survived.tmpl === false` — the template is
genuinely destroyed, which also demonstrates the SECOND-ORDER damage (wrong phaseId reaching the
template sweep).

**Every test was a refusal test (Agent B).** A gate that refuses everyone would have passed the whole
file. Added a happy-path test asserting a MATCHED pair still writes, and proved it can fail: forcing
`_verifyProgramOwnership` to return false turns it red while the two refusal tests correctly stay
green. This is the failure mode that broke "View as" earlier this month.

**Fixture sweep could strand rows permanently (Agent C).** The sweep matched a `Date.now()` tag, so a
dead page context left rows no future run could ever match. Now sweeps the stable `[E2E] PairAnchor`
prefix, still owner-anchored on `coach_id`.

## Deferred, with reasons — NOT fixed here

- **No DELETE in this family is rowcount-checked** (Agent A). The diff added `.select()` + rowcount to
  three UPDATEs, but `removePhaseWorkout`, `deletePhase`, `deleteProgram`, `_cleanupPhaseWeeksBeyond`
  and `deletePhaseWeek` all still report success on a refused DELETE. Pre-existing and a genuine class
  — its own row and its own session.
- **`_resolveOwnerCoachId`/`_resolveTemplateOwnerCoachId` `.single()` ambiguity** for a master account
  with two `clients` rows (Agent B). Pre-existing in app-workouts, untouched by this diff.
- **Stale-tier race in `savePeriodizationConfig`** (Agent A) — requires two rapid modal opens; narrow.

## The manual checklist was replaced by a test, 2026-08-22

The closure condition here originally asked Jake to click through fourteen builder flows in two roles.
He pushed back — *"cant you run those tests e2e"* — and he was right: the closure rule has **two** arms,
and arm (b) was available the whole time. Asking a human to do what a test can do was the lazier half
of the rule.

`tests/builder-happy-path-2026-08-22.spec.js` (`0770102`), 14 tests. Each drives a gated entry point
with the caller's OWN legitimate ids and asserts the write **actually landed** — reading the row back,
because a silently-refusing gate returns no error and "it didn't throw" would prove nothing. Covers
`saveProgram`, `savePhase` (both branches), `_quickAssignPhaseWorkout`, `removePhaseWorkout`,
`duplicatePhaseWeek`, `deletePhaseWeek`, `savePeriodizationConfig`, `deletePhase` and `deleteProgram`
as coach, and the same flows again in **Personal view** — solo exercised rather than argued, because
"solo is fine here" is exactly the kind of reasoning that has been wrong four times in this project.

**RED-BEFORE PROVEN:** with `_verifyProgramOwnership` neutered to refuse everyone, all 14 fail;
restored, all 14 pass. 53 tests green across programs / personal-programs / program-blocks /
ownership-anchors / this file run together.

**What this settles and what it does not.** It settles the FALSE-REFUSAL half — the risk that these
gates lock the rightful user out — for every gated entry point, in both roles. It does **not** touch
the other caveat: 2 of 45 write sites carry a refusal test and the other 43 rest on a coverage argument
plus the suite not regressing. That is an argument, not proof, and it stays stated.

**Closes when:** Jake confirms, or the remaining 43 sites get refusal coverage. The false-refusal risk
no longer needs him.
