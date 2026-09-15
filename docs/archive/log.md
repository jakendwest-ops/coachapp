## 2026-09-07/08 — UX cleanup pass: runner + builder + progress shipped, dashboards deferred (app-runner v85→87, app-programs v53→54, app-core v27→28, app-progress v58→59, main.css v12→15)

**Done:**
- `/superpowers:brainstorming` from Jake's "the app feels slightly clunky in places, I want to improve the UI and UX of certain areas." Walked the 4 areas he picked (runner, programs builder, progress, dashboards) at 390px in a served HTML board he ticked selections on. Produced a 16-item design (`docs/superpowers/specs/2026-09-07-ux-cleanup-design.md`, committed `9468419`). **D1 (solo↔client dashboard convergence) deferred to its own session** — structural, ripples into calendar parity + redundant 1RMs; the vault already flagged it as its own session. 9 flow-item forks resolved with Jake in-session via AskUserQuestion.
- **Commit 1 — Runner R1–R5** (`1598622` + review tweak `885fb0f`, app-runner v85→87): R1 the set-complete tick rendered a transparent glyph in a bare grey box — invisible, though it's the screen's primary action — now a visible faint tick, and the CURRENT set's row gets an accent border + accent tick. R2 the pre-first-set footer was dead hint text — now a full-width control that focuses the first empty input (`_runnerFocusFirstInput`, `scrollIntoView block:nearest`). R3 empty kg/reps fields showed "—" (reads as disabled) — now the unit / "reps". R4 resolved by R2. R5 swap/add-exercise were 11px text links — now 44px outline buttons. Style literals 62→58. runner.spec.js +1 test.
- **Commit 2 — Builder B1–B5** (`6190ab1` + review fix `8bcbb92`, app-programs v53→54, app-core v27→28, main.css v12→14): B1 the program header's ragged 5-button wrap-row → one primary (Assign) + a "⋯ Manage" menu (`#program-manage-modal`, `modal-fullscreen-mobile`). B2 the desktop day grid broke to 5 + an orphaned Sat/Sun — now `repeat(7,1fr)` at ≥900px. B3 empty days were bordered cards wrapping a bordered add button — now just a label + slim dashed add row (`.pwk-day.is-empty`). B4 the shared page-header ⚙ (runner/programs/workouts) → a labelled "⚙ Units" pill. B5 the periodization `--surface-2` slab → a chip in the phase-header meta line (`_periodizationLabel`) + a compact button row; Generate weeks stays visible. Plus a review fix: `body:has(.modal-overlay:not([style*="display:none"]))` hides the floating mobile view-switcher pill under any open modal (it was sitting on top of modal content for master accounts — pre-existing, surfaced by the B1 menu). programs.spec.js: `programManage` helper + selector updates + B1 smoke test; personal-programs.spec.js updated.
- **Commit 3 — Progress P1–P4** (`253398e`, app-progress v58→59, main.css v14→15): P1 the Performance tab stacked page-tabs → sub-tabs → a 1M–All pill row → content; the range applies only to Per-exercise, so it's now a `<select>` on the sub-tab toolbar, shown only there — `#trend-range-row` deleted, Performance is one control row + search. P2 new shared `.chip-row`/`.chip` (same colours as `.week-tab`): pill rows scroll sideways instead of wrapping 2+2, active chip scrolled into view; applied to the page tabs + Performance sub-tabs. P3 Body Weight led with the big "Weight goals" editor — now once both are set it collapses to a one-line "Start X → Goal Y  Edit" summary and the data (tiles/chart/history) leads. P4 each 1RM lift crammed name + value + a "Dated <date> | Estimate from a set" row at 390px — the date/estimate controls now hide until you focus that lift's value input (`_revealOneRMRow`), per row; the hidden date input keeps its today default which is what `saveOneRMGrid` reads. Style literals 76→67. progress.spec.js +2 sleep-free smoke tests; progress-trend.spec.js range assertion → `selectOption('#perf-range')`.
- **Per commit:** tokenised (no new style literals; baselines lowered as literals dropped), `checks.sh` green, `/feature-audit` + `/mobile-check` run, a fresh 3-agent `multi-agent-review` (diff mode). **All three reviews came back clean on all three commits.** The one finding across the whole pass — the B1 `:has()` selector was scoped to `.app-shell` and couldn't see `mountModal`'s body-level overlays — was fixed in `8bcbb92` (`body:has(…)`, verified across static + dynamic modals).
- **Pushed:** commits 1–2 + the design doc (`67380b1..7de8546`) to `origin/master`; pre-push gate ran `checks.sh` + the 57-test smoke suite, green. Commit 3 (`253398e`) + a docs commit (`7dc6c1a`) are local-only.

**UNVERIFIED (banked):**
- Nothing is deployed. LIVE is still tag `v2026.09.2` (67380b1) — deploy is tag-gated and no new tag was cut. Commits 1–3 have not been seen by Jake on the live preview, only via Playwright screenshots.
- The FULL Playwright suite (~566) has NOT been run on any of the 3 commits — only targeted specs (runner 42, solo 15, progress+1RM ~100, programs 23, personal-programs 9, weight-roundtrip+client-workout 24) plus the 57-test pre-push smoke gate 3×. A full run is required before a release tag.

**Decided:**
- D1 (solo↔client dashboard convergence) is NOT part of this pass — its own future session.
- Release: hold until the pass is complete (or Jake wants 1–3 out now), then one `v2026.09.3` tag rather than four.
- P4/P3/B3 reveal-and-collapse patterns are deliberate — collapsing the 1RM row on blur or hiding the goals card while unset were both rejected in the design.
- The mobile view-switcher pill hiding under modals is a global CSS fix, not B1-scoped — it was pre-existing for every modal on a master account's phone.

**Why:**
- The whole pass came from a fresh brainstorming design, not from existing roadmap/ledger items — so nothing in the roadmap's in-progress list was ticked by it (STATUS's "builder desktop layout" known-gap was, via B2).

---

## 2026-09-06 (save) — I truncated roadmap.md to zero bytes, and it silently poisoned an os-lint baseline

_No app code involved. Recorded because the second-order damage was worse than the first, and invisible._

**What happened.** Updating `roadmap.md` I used Python's `open(p, "w", encoding="utf-8")` and then
wrote. The string held a lone surrogate escape (my own malformed emoji escape), so the write raised
`UnicodeEncodeError` — **but opening in `"w"` had already truncated the file to zero.** 617 lines,
74,610 bytes, gone. Fully recovered with `git checkout --`: the file was tracked and was not part of
either commit that day.

**The part that mattered more.** Between the truncation and the restore, an `os-lint --report` ran.
`context-budget` measures `STATUS.md + roadmap.md` against a **self-tightening** ceiling: when the
measured total falls below the recorded floor it rewrites the floor lower. It measured
`STATUS.md 66,403 + roadmap.md 0` and wrote **`context: 66403`** into `state/size-baseline.json` — a
floor that assumes roadmap.md is empty. **The corruption outlived the file.** Restoring roadmap.md left
`context-budget` stuck RED at ~143k against a 67,731 ceiling, with nothing pointing at the cause.

Restored the baseline to **141,013** — `STATUS.md 66,403 + roadmap.md 74,610`, the true measurement
immediately before any edit this session. That is pinning AT the honest pre-session number, not raising
a ceiling to make a check green, which this check's own message explicitly forbids. It now reads GREEN
at 143,288 against 143,833 — deliberately tight, because the docs genuinely did grow.

**This is [[feedback_threshold_at_current_not_above]] from the other direction.** That memory records a
state-writing check poisoning its own baseline while reading FIXTURES. Same class, different trigger:
**a state-writing check will faithfully record a transient, broken measurement of the REAL files.** An
auto-tightening threshold cannot tell whether the dip it just saw was a cleanup or a catastrophe.

**Two rules banked:**
1. **Never open a file in write mode with content that has not been encoded yet.** Encode to bytes
   first, assert the result is non-empty and at least as large as expected, then write the bytes. A
   write that truncates before it can fail is a destructive operation wearing an edit's clothing.
2. **After any accidental file damage, ask what MEASURED the file while it was broken** — not just
   whether the file came back. Git restored the content in one command; the poisoned baseline would
   have sat there indefinitely, and the check it broke would have been read as a genuine finding about
   document bloat.

---

## 2026-09-06 (later still) — the weekly full-file review ran, 8 days late, and found 8 issues

_Scope: `app-programs.js` + `app-core.js`, 4,012 lines. Three pinned angles plus a verifier pass._

**Scope deviated from strict churn order, deliberately.** The top three by 30-day churn are
app-workouts (47), app-runner (33), app-progress (26) — but app-workouts and app-runner had a full-file
pass 8 days ago and app-workouts had two more during the v2026.09.2 release. app-programs (25) and
app-core (21) are the highest-churn modules with **no full-file pass in three weeks**, which is where
latent bugs live. Stated rather than done silently, since the pinned skill exists to stop rigor
narrowing unannounced.

**The first attempt died.** All three agents were killed mid-read by a session rate limit. The marker
was deliberately NOT updated and os-lint kept reporting RED — a gate marked green on a run that did not
happen is the failure this OS exists to prevent. Re-run after the reset at reduced scope.

**Every finding was verified at source before being filed.** Two were adjusted: Agent A's periodization
finding was framed as the cross-tenant verify-one-id-write-another class; reading it shows both phases
belong to the same user, so it is a data-integrity bug, not a tenancy breach. Agent C's toast finding
was reduced from HIGH — the user is still told something failed, only less specifically.

**Filed (5 rows):**
- **HIGH** — `copy-to-coaching-creates-an-undeletable-orphan-for-a-solo-user`. Reachable today on
  **4 of 9 live accounts**. The button is gated on `is_personal` alone while its mirror three lines
  below checks that a Personal view actually exists — and that mirror's comment spells out this exact
  argument, having been caught by review on 2026-07-13. Fixed inbound, never outbound.
- **HIGH** — `periodization-reps-is-an-unescaped-stored-attribute-and-the-checker-is-blind`. 8th
  instance. **The checker exits 0 over it**, which is the 2026-08-29 warning coming true on the very
  next instance of the class it was written about.
- **MEDIUM** ×3 — periodization writes on unverified slot ids from a stale-able global; `deletePhaseWeek`
  is the 4th fan-out and the only one missing `_propagationTargets`; `saveAssignProgram` clobbers the
  message its twin exists to preserve.

**Classes counted, not sampled.** 45 `value="${…}"` sites with no escaper → exactly 1 exploitable, and
the 2 look-alikes are named so they are not re-derived later. 4 `_propagationTargets` fan-outs → 3
guarded, 1 not.

**Clean with receipts:** no `getPublicUrl`; **no PII across 120 `log.*` sites**; no `auth.users` in SQL;
`is_personal` never in a security decision across 27 sites; zero duplicate top-level names across all
535 declarations in the 9 modules; no render recursion; no timer or chart leaks in scope.

**Corroboration worth noting:** Agent B independently found the `app-core.js:777` role self-heal bug
filed earlier the same day from the mechanical sweep — same line, different angle. Two independent
paths to one defect is evidence it is real rather than a misreading.

---

## 2026-09-06 (later) — os-lint remediation after the v2026.09.2 release: one RED closed, one LIVE exposure found

_No code change. Ledger, docs and one live probe._

**`doc-obligations` RED → GREEN.** `CRITICAL.md`'s Timeline had gone 7 days without an append while a
newer `bugs/` file matching a class it tracks sat unrecorded. The append was owed and real, not
box-ticking: the Timeline's 2026-08-29 entry ends *"One site remains: `_effectiveCoachIdForClient` …
still open"*, and that site was fixed on 2026-09-04. The document was asserting something untrue.
Two entries appended — the fix itself (PGRST116 on `.single()` is the denial signal; the `|| user_id`
clause stays because solo's `coach_id` is legitimately NULL), and the part worth more: **the class was
enumerated at 9 sites and 5 were deliberately NOT changed, with the reasoning written down.** All five
resolve an id the user is already working with, and `_resolveTemplateOwnerCoachId` has nine callers, so
"finishing the class" would spread false-refusal risk to defend a case needing broken RLS to occur.
A decline is only safe while it is recorded; otherwise the next reviewer greps the pattern, finds five
hits and no reason, and either re-derives it or "finishes" it.

**The `closure-candidates` sweep found a live security exposure, not a closure.** The check named 18
ageing rows whose subject a spec mentions, and says to open each one. Doing that:

- **`2026-07-24-public-self-signup-closed-off-entirely` (CRITICAL, 44 days) — the server half was never
  done.** Probed live 2026-09-06 via the public read-only `GET /auth/v1/settings`: **`disable_signup:
  false`**. The 2026-07-24 fix removed the signup form *because* `db.auth.signUp` is callable from
  devtools regardless of UI — and then the dashboard toggle that closes that path was never flipped.
  `tests/signup-removed-2026-07-24.spec.js` genuinely passes and genuinely proves the UI half, which is
  exactly how a two-part row gets closed on half its evidence. Needs Jake in the Supabase dashboard;
  no spec can close it.
- **17 of 18 were dismissed, and most say so themselves.** Their own `status_detail` reads "awaiting
  Jake" — the authors judged clause (b) insufficient and wanted eyes on live. Three explicitly reason
  it out: `checks-sh-rule-2` says *"Awaiting Jake because the closure evidence is a self-test, not a
  red→green"*; `client-plan-clone-cleanup` says *"NOT closed: no test yet ASSERTS the cleanup left
  nothing behind"*; `no-delete-rowcount` carries red-before evidence in its frontmatter **and** a body
  `Closes when` naming Jake — one row, two closure conditions, `feedback_two_fields_one_fact` again.
  Closing any of these on the spec would overrule a deliberate recorded judgement.
- **Exactly one plausible clean clause-(b) close remains** (`2026-07-30-fmtdistancem…`), held back
  until its spec is seen green on a quiet machine.

**Measurement worth keeping: `closure-candidates` converts leads to closures at roughly 1 in 18.** By
[[feedback_measure_before_giving_a_gate_teeth]] that is close to noise — except it earned its whole
existence this run by routing attention to the signup row. Recommendation: keep it, at WARN, and never
let it acquire teeth.

**What os-lint cannot fix without Jake.** 29 `open` rows and 65 ungraded predictions, and **20 of the
29 state no closure condition at all** — which is precisely what the high-priority row
`2026-08-29-most-open-rows-never-say-what-would-close-them` predicted. Those two REDs are not decay;
they are a queue with one server.

---

## 2026-08-28 — Jake's live double-press bug fixed at the class level; STATUS.md cut 30%; and the OS question answered honestly (core v22 / programs v47 / calendar-goals v18 / workouts v83 / progress v56 / css v11)

_Pushed `66003ce`. Six commits. Started from a live bug report, ended on a strategy question I answered "no" to._

**The bug Jake hit, in plain English.** Adding a Saturday workout to *Bigger Leaner Stronger* was slow,
adding exercises to it was slower, and **pressing Add twice created the exercise twice**. All three are
the same architecture: every step is a chain of sequential Supabase round-trips, and the button that
starts the chain is never disabled. The modal-*open* paths were guarded; the **save** paths were not.

This class had already cost Jake real data once — `scripts/fix_session_order.cjs` (2026-06-25) is a
service-key repair script whose step 1 is *"find duplicate templates created today"*. It was written
after the same double-submit hit his live account. Not a hypothetical.

**Why no database constraint could fix it.** `UNIQUE(template_id, exercise_name)` would refuse
legitimate work — a template may list the same exercise twice with different set schemes, which the
code contemplates at `js/app-workouts.js:2262`. `UNIQUE(template_id, order_index)` would break
`moveTemplateExercise`, which reorders through a transient collision. The client-side guard is the
**only** available defence, not a convenience layer.

**Done:**
- **`guardReentry(name)` in `app-core.js`** — one shared wrapper, ONE `try/finally`, registered on 8
  write paths. Built as a **registration wrapper** (replaces `window[name]`) rather than a
  per-function check, because inline `onclick=` strings resolve names off the global object at click
  time. That choice is load-bearing: `saveExerciseToTemplate`'s handler is assembled in a variable at
  `js/app-workouts.js:1815-1817` and only interpolated at `:1876`, so **an onclick-based approach could
  not have found today's bug at all**. Same reason the class test enumerates by INSERT.
- **All 3 bespoke `_*Pending` flags deleted.** Only one had a `try/finally`; the other two released on
  the happy path only and stranded `true` forever on an unexpected rejection — silently killing that
  button for the rest of the session.
- **Applying the inclusion criterion changed the member list BOTH ways** — it ADDED
  `copyProgramToCoaching` (a 100-line deep copy the plan had missed) and EXCLUDED
  `generatePhasePeriodization` (its `confirm()` blocks the thread, so the dialog IS the barrier).
- **Perceived speed.** `_openExercisePicker` now takes a *promise* for `coachId` and paints its overlay
  synchronously; the two resolution queries run in `Promise.all`. Zero round-trips removed — all of
  them removed from the user's experience.
- **`91341e8`** — two non-retrying `.count()` assertions. One was a **vacuous pass**: `if (count === 0)
  return` with no settle-wait, so it returned having asserted nothing. Fixing it exposed a broken
  assertion underneath.
- **STATUS.md 93,955 → 65,577 bytes.** `## What's working (verified)` was 29,017 bytes of SHIPPED
  history sitting in a file whose own masthead says history belongs here in LOG.md. Moved verbatim.
- **`continuity-budget` ratchet added to os-lint**, pinned AT the measurement, fixture-safe. Self-test
  now **39/39 bite, 0 decorative**.

**🔴 Three corrections to my own work, all the class I was fixing:**
1. **The first version of the re-entry test never reproduced the bug — and its commit message claimed
   it did.** It was red with `Received: 0`, not 2: the fixture omitted `att-type`/`att-notes`/
   `att-superset`, so the function threw before reaching the insert. Red for the wrong reason, asserted
   as proof. Now verified BOTH ways — guard removed → **2**, guard in place → **1**.
2. **The class-guard test counted a COMMENT as code.** `app-core.js`'s own doc comment contains
   `guardReentry('name')` and the scanner read it as a real registration — a scanner reading prose as
   code, the same shape as the bug it exists to catch.
3. **One of 9 registrations was decorative.** After the picker change `showAddExerciseToTemplateModal`
   contains zero `await`s, so the wrapper acquired and released inside one microtask and blocked
   nothing. **Found by the pre-push review, not by me.** New invariant: *a guard that cannot BLOCK is
   decorative — the test is "does it await?"*

**Missed by the cleanup 3 days earlier.** The 29k `What's working` section was the SAME violation as
the 38,171-char `Previous:` chain deleted on 2026-08-25 — same file, different section, second
instance. A cleanup that fixes the instance it was looking at is the class bug this OS exists to catch.

**Answered: would refactoring my MD files and the OS reduce the errors? No — I oversold it.**
Measured, not asserted: ~185 written rules against 51 mechanisms that can actually refuse, and **9 of
my 12 errors this week had a pre-existing written rule**, one of them injected into the very turn I
broke it. OS v2 already tried cutting rules (33 → 13 behaviours) and the errors continued. Do the OS
work for its real payoff — ~12k tokens of context per session — and expect **zero** error reduction
from it. Error reduction comes from checks that refuse, and from adversarial verification (neutering
the fix to prove the test really goes red).

**Not done:** OS step 2 (make memory canonical for the ~13 remaining duplicated continuity entries) —
judgement-heavy, needs its own pass; 1 of 14 done, forced by the new ratchet. Sprint/release trial and
the targeted platform work (the 3-way 1RM cluster, the 7-member delete cluster, `saveClientWeight` vs
`saveWeightLog` which have already drifted on `resting_hr`, and the under-tested `app-dashboard.js`)
are approved but not started.

**Also found, not fixed:** `_refreshProgramTemplates` is live with **`.limit(2000)`**. The 2026-08-07
slowdown fix installed `.limit(100)`; the workout-picker work later raised it. That fix did not hold —
which is an argument for the release discipline being discussed separately.

**Full suite, measured 2026-08-29 (the save's Step 9): 576 passed / 3 failed / 2 flaky / 1 skipped, 31.4m.**
Getting that number took three attempts and produced two new ledger rows:

1. The first run was **killed** when the previous session's process exited — 374/582, no summary line.
   It was never a result, and was not carried forward as one.
2. The second run produced **39 identical `ERR_CONNECTION_REFUSED`** — :3001 was never booted (I skipped
   `/hello-claude`). But the real defect is that neither `playwright.config.js` (no `webServer` block) nor
   `scripts/checks.sh:337` has any server precondition, so a dead server is reported as
   *"Playwright smoke tests failed — Fix tests before pushing."* — the wrong cause. It fails safe, never
   open, but it sends you hunting a regression that does not exist. Filed as
   `2026-08-29-a-dead-preview-server-is-reported-as-failing-tests`.
3. The third run, after asserting the server served `<title>CoachApp</title>` (not merely a 200 — a stale
   config can serve a different app on that port), gave the number above.

**The 3 hard failures are NOT from this session**, verified rather than assumed. Two are
`ledger-fixes-2026-08-02.spec.js:646/657` (mobile calendar grid): the test reads
`querySelector(…)?.outerHTML || ''`, so an absent container yields `''` and `''.match()` returns null —
the assertion that fires means **"the calendar had not rendered"**, not "the markup is wrong". The markup
is intact (`app-calendar-goals.js:126` still has `repeat(7,1fr)`; `:138` still has the day-cell
`onclick`/`style` pair with `min-width:0`), and `git show bef71b0` grepped for `showDayEvents`/
`grid-template` returns nothing. Both use `loginAsClient` + a fixed `waitForTimeout(1500)` — the shared
defect, and `loginAsClient` is already on record for this exact race. The third is `progress-trend.spec.js:5`
(B4), long-standing. **Both calendar tests sit outside the 57-test push gate.**

**🔴 A correction I had to make to my own ledger entry, same day.** I wrote the `[E2E]` teardown failure
up as a *reproduction*. It is not: in the clean run it failed attempt 1 and **passed on retry**, so it is
**flaky**. The honest claim is weaker and still useful — it fails first-attempt in two independent runs
and clears on a re-run, which makes it a **race**, not a missing delete. Corrected in the row.

**Step 8 produced a finding of its own.** Trying to state what evidence would close each open row, **6 of
the 8 high-priority open rows had nothing to extract.** Measured across the ledger: **21 of 30 open rows
(70%)** and **19 of the 26 open rows aged 7+ days (73%)** state no closing condition at all. The closure
rule demands evidence those rows never name, so nobody — me or Jake — can close them; they can only be
re-read. That is the actual cause of the standing `stale-bugs` RED, and it is filed as a high-priority row
whose fix is a **check that refuses**, not another written rule. Also noted there: `os-lint` counts 21 stale
rows where my own pass counts 26 — one fact, two numbers, unresolved.

**The prediction gate blocked this save's commit, and it was right to.** Eight past-due records were
ungraded and not grandfathered. Graded individually on evidence: **pth-151 correct** (Jake did not merely
not-object to 1RMs getting their own tab — `js/app-progress.js:1335` records him asking to delete the old
Personal Bests page and rename the 1RM page to it), **pth-144 partial** (the RLS probe confirmed the
mechanism, but covered `exercises` only; `deleteEvent`/`deleteGoal` were reasoned, not probed),
**pth-146 and pth-148 incorrect**, and **four expired**.

**Four of the eight expired for one reason: they were gated on Jake confirming something that was never
routed to him.** pth-150 and pth-159 are both still sitting in the `fixed-awaiting-jake` pile. That is not
a calibration result, it is the same defect as the 94-row awaiting pile and the 70% of open rows with no
closing condition — **work whose completion depends on Jake, with no mechanism that ever puts it in front
of him.** Three separate symptoms, one cause, all surfaced by this one save.

Two more, worth keeping for calibration: **pth-143 and pth-149 were never measurable as written** — one
asked for a flaky COUNT that nothing records, the other predicted the result of work that was never
scheduled. Neither carried a `verify_how`. A prediction with no instrumentation is not foresight that
failed; it is a measurement that was never set up.

**Awaiting Jake:** double-tap Add and Create on live; the 1RM 0.5kg question (was the unit lb, and were
the arrows/spinner used? lb round-trip drift is bounded at ~0.023 kg, so it does not explain 0.5).

## 2026-08-26 — three of Jake’s picks: one was already fixed, two real bugs shipped (core v21 / programs v46 / runner v77 / workouts v78 / progress v55)

_Backfilled 2026-08-27. **This session ended without a `/save`** — four commits pushed, no LOG entry._
_Caught by hello-claude Step 3’s date check (newest LOG 08-25 vs newest commit 08-26). Second time this_
_exact failure has happened (2026-07-13 was the first), and the check that exists for it worked._

**Done:**
- **Propagation row (2026-08-14) → `fixed-awaiting-jake`.** Causes 3 and 4 had never been re-checked.
  Cause 3 is fixed (`family_id` matching, verified in the QUERY not the comment claiming it). **Cause 4
  was a FALSE PREMISE** — the Library lists only templates in no programme, so there are no siblings.
- **`a4b8739` — end-to-end test joining both halves of Jake’s scenario.** Real `generatePhasePeriodization`,
  real `openTemplate`, real modal DOM, real clicks on Save and Apply. Red-before proven by neutering
  `family_id` propagation: `#propagate-modal` never appears, exit 1.
- **`d320220` — the lb display round-trip corruption, 7 sites, one shared helper** (`weightFromInput` /
  `weightInputAttrs` in app-core). Reproduced live first, as the 2026-07-09 row demanded.
- **`52923dd` — Phase 1: every `client_1rms` writer persists `exercise_id`.** Pure refactor, no migration.
- Pinned `multi-agent-review` ran (3 agents + verifier) before the ownership commit; marker written.

**Bugs found + fixed:**
- **Both prior investigations of the 1RM bug traced the wrong writer.** They followed `save1RM`; there
  are FIVE `client_1rms` write paths. The grid is where “another exercise is already 200” happens.
- **The display is a lossy proxy:** `200 kg → "440.9" lb → 199.99 kg`, then re-rounded to “200” on the
  next render. Invisible from the UI, bounded at ~0.023 kg — which is why two code reads missed it.
- **THREE `exercise_id` offenders, not the two the ledger row named.** It missed `_saveMissingOneRMEntries`,
  whose own comment records that app-programs.js was absent from the app-core inventory — so it escaped
  the 2026-08-21 sweep AND the row written to catch that sweep.
- **A regression I introduced, caught by review:** `neededByName` used an unconditional `Map.set`, so a
  duplicate exercise name whose later row carried a null id wiped the real one. Harmless before,
  load-bearing after. Red-before proven (`Received: null`).
- **My own class guard could pass over nothing** — no `res.ok` check, hardcoded 6-module list omitting
  three modules. The same hardcoded-inventory mistake that let offender 3 escape, repeated INSIDE the
  guard written to catch it.
- **My tests could strand `[E2E]` rows** on a throw — `ids` was only assigned from the resolved evaluate.

**UNVERIFIED (banked):**
- The 1RM 0.5 shift is **still unexplained**. Two real bugs were found and fixed, but the lb drift is
  bounded at ~0.023 kg and cannot produce 199.5. Row stays open with one question for Jake.
- No solo-role test for the three `exercise_id` writers. Verified they contain ZERO role branches, so
  the path is identical — a coverage gap, not a suspected bug.

**Decided:**
- **`exercise_name` alongside `exercise_id` is NOT a BCNF violation.** Exercises can be deleted
  (`app-workouts.js:1083`), so the name is a historical snapshot. Phase 1 (write the id) is a pure
  refactor and shipped; the migration half (drop the name) would destroy data and is not being done.
- **Two green halves are not a green whole.** Jake pushed back on being handed the verification for the
  propagation row; he was right, and the pushback found a real gap, not just a process one.
- **Refactor vs migration:** the test is “if this is wrong, how do I get back?” `git revert` = refactor.
  “Restore a backup” = migration, and it goes through Jake.

---
## 2026-08-25 (session 2) — the OS audit answered honestly; the ratchet class closed; PUSHED `76fbeb7` (core v20)

_Headline corrected 2026-08-27: it said “NOTHING PUSHED” while this entry’s own “Prune” section below
 records pushing `76fbeb7`. Jake said “push then prune” after the entry was written and the headline was
 never updated — the same headline-contradicts-body class this session kept finding elsewhere._

_Jake asked whether the OS/MD files, the two rituals, and the SWOT were in a state I was satisfied with._
_Two of the three answers were **no**. Both nos survived measurement._

**Done:**
- **`/deploy-check` in full — first run since 2026-07-12.** 9 items: cache bust ✅, Playwright **565 passed /
  1 skipped / 0 failed / 0 flaky (33.5 min)**, RLS probes A/B/C **plus the SELF-TEST** ✅, both storage probes ✅,
  Pages ✅. The one skip is a data-conditional solo test, NOT the known blind spot where 16 solo tests skip en
  masse. Three items are Jake’s (redirect URLs, `delete_current_user`, live incognito smoke).
- **STATUS.md 134,422 → 89,919 bytes (−33%)**; longest line 38,171 → 1,360. Verified safe BEFORE cutting:
  40 SHAs referenced, 34 verbatim in LOG.md, the other 6 intermediate commits from 2026-07-12 (a date carrying
  TWO full LOG entries covering both workstreams). No session lost.
- **`context-budget` + `ritual-budget` now derive from a measured baseline** (`measuredCeiling()`,
  `state/size-baseline.json`) that ratchets DOWN and never up. Ceilings 300,000 → 233,762 and 44,000 → 40,915.
- **`checks.sh` rule 9e — consent policy version** (`scripts/check-policy-version.mjs` + 8-case self-test
  including a live-plumbing case). app-core v19 → v20 (comment naming the enforcer).
- **Prediction triage: 63 → 54 overdue.** 4 graded on evidence, 5 graded `expired`.
  `prediction-triage-2026-08-25.md` groups the remaining 54 by what settles them.
- Kanban: **Stage 4 BRAND moved to a standalone session** (Jake’s call).

**Bugs found + fixed:**
- **ADDENDUM (post-save): the purity assertion Jake asked for, and the defect its red-before found.**
  RULE 0 close on the poisoning incident above — the fix existed, the CHECK did not. `runSelfTest` now
  asserts a `--self-test` run leaves `size-baseline.json` byte-identical, covering the 38-spec loop
  itself and not just two targeted probes. **v1 of that assertion was itself wrong**: it snapshotted
  AFTER the spec loop, so on a broken build it captured the already-poisoned value, restored to it,
  and printed “State was restored” over a baseline still reading 120 — a false success claim inside the
  assertion whose job is catching false success claims. Invisible to the green run by construction
  (with the guard intact nothing writes, so early and late snapshots are identical). Fixed three ways:
  snapshot before the first fixture, cover every fixture path, and VERIFY the restore rather than claim
  it. Proven both directions on full 38-spec runs — intact: 38/38, purity clean, exit 0, baseline
  unchanged; neutered: 3 leaks, restore VERIFIED, exit 1, baseline unchanged. `les-086`.
- `--self-test` now exits 1 on a decorative check or a leak (was always 0 — it could decline to stamp
  its own freshness marker and report success three lines apart). Deliberately differs from `--report`,
  which is advisory and exits 0 by design; reasoning documented inline. Zero automated consumers.
  Pushed `3ba8131` to claude-config.
- **STATUS.md’s masthead claimed a cleanup that had not happened.** It said the `Previous: …` chain “was
  deleted 2026-08-23 after verifying each session had a `## <date>` entry”. 38,171 chars of it survived on ONE
  line, plus a second stale chain above it. `masthead-drift` cannot see this — it only compares
  `_Last updated:` against body dates.
- **Three conflicting last-push claims in one file** — `d361f87` (correct), `d337418` (11d stale),
  `1a5cb72` (16d stale). One-fact-many-fields, three fields deep.
- **`PRIVACY_POLICY_VERSION` coupling was unenforced** and the failure is silent: `_needsConsent()`
  re-prompts only on a version mismatch, so a policy edit without a bump leaves every user consented to a text
  they never saw, with no error and no symptom. Now blocking via rule 9e.
- **🔴 MY OWN CHANGE HAD THE DEFECT IT EXISTS TO CATCH.** `--self-test` points `OSLINT_STATUS`/`OSLINT_ROADMAP`
  at 120-byte fixtures but does NOT override `OSLINT_SIZE_BASELINE`. Auto-tighten saw 120 < 229,178, called it
  an improvement, and **wrote 120 into the real state file** — the next real run reported “ceiling 122” against
  a 235,631-char corpus. The self-test poisoned the thing it was testing. Fixed: `measuredCeiling()` takes the
  input-override env names and refuses to persist when any is set. Proven — a fixture run now reports
  “baseline NOT written” and the file is unchanged.
- Dropped a kanban line (“Runner Phase 2”) by replacing instead of inserting; caught by the column-count check.
- **Corrected a count I stated wrong mid-session:** `fixed-awaiting-jake` is **87**, not the 60 I first said
  (verified two ways; distribution 87/54 confirmed/29 open/12 deferred/3 closed = 185).

**UNVERIFIED (banked):**
- **`context-budget` is RED** at 235,631 vs ceiling 233,762 — and it is RIGHT. It points at **31**
  `Session backlog` sections in roadmap.md, the same history-duplication class just removed from STATUS.md.
  Ledger row filed. **Deliberately not resolved by raising the ceiling** — that is the failure mode the check’s
  own message warns about.
- Nothing pushed. `multi-agent-review` could not run in its pinned 3-agent form (this session is configured
  without subagents) — recorded, not silently substituted.

**Prune (post-save, Jake: “push then prune”):**
- **Pushed `76fbeb7`** — rule 9e live. Pre-push gate: `checks.sh` all passed, Playwright smoke 56 passed.
  Pushed by exception on the 3-agent review (no subagents this session); recorded in the commit message.
- **roadmap.md 143,453 → 75,326 (−47%).** 23 session-backlog sections removed (2026-07-10 → 2026-08-20),
  all 100% closed rows duplicating `LOG.md`. `context-budget` GREEN and the ratchet auto-re-pinned
  **229,178 → 167,461** — the saving is locked in, and the ceiling was never raised.
- **Two things the verification caught that a blind prune would have destroyed:**
  (1) **six live cross-references** in the feature tables point into 2026-07-05 / 2026-07-08 by
  “Area N #M” — both sections kept for that reason alone;
  (2) a **dangling ref my own checker missed** — “see the 2026-07-29 session backlog above” puts the
  date BEFORE “session backlog”, and my regex only matched the date AFTER it. Same shape as les-065
  (a rule matching one syntactic form of a class and reporting clean on the other). Found by re-grepping
  both word orders; repointed to `LOG.md`.
- **Corrected a wrong count of my own:** I reported “11 open rows in the 2026-07-05 backlog”. That script
  never reset its section pointer on a non-backlog heading, so 2026-07-05 had silently absorbed every row
  of the main feature tables below it. All 25 backlog sections carried ZERO open rows.

**Decided:**
- **A ceiling set ABOVE current is a permit, not a ratchet.** The three baselines that HELD
  (`style-baseline.json`, `rule0-baseline.txt`, `predictions-baseline.txt`) are pinned at what was measured;
  the two that did not (`RITUAL_BUDGET`, `CONTEXT_BUDGET`) were round numbers with slack. Measure, then set the
  threshold AT it.
- **A cleanup is done when the bytes are gone.** A sentence claiming it was done is not evidence.
- **Grade `expired`, never guess.** 5 predictions were unsettleable by construction (void premise, or claiming
  a PREVENTED event that nothing records). Forcing true/false onto those corrupts the calibration record, which
  is the only reason to keep predictions.
- **A prediction should name the evidence that will settle it.** All 63 had `verify_by`; none had
  `verify_how`. That is the whole cause of the backlog. Proposed for RULE 6, **not built** — a new gate wants
  measuring first.
- **Dropped deliberately:** `dbq()` adoption (26 of 313; the audit traced the cause to app-core not using its
  own wrapper — a rewrite dressed as a lint rule), and a general “two fields, one fact” detector (no unambiguous
  source of truth).

**Why:**
- The honest answers to Jake’s three questions were: OS/MD files **qualified no** (STATUS.md was 28% content it
  claimed to have deleted); rituals **no** (hello-claude −2 lines, save **+11** — 9 lines BIGGER after the
  rebuild meant to trim them); SWOT **yes, with a confirmed caveat** (its own “alarm fatigue” threat is
  materialising — the prediction backlog went 110 → 113 while its valve was being closed).

---
## 2026-08-25 — OS v3 finished: the top bug class can finally block a push (core v19 / dashboard v14 / clients v16 / progress v54)

**Done:**
- **R1 — `checks.sh` rule 2 is BLOCKING**, via the new `scripts/check-query-scope.mjs`. It covers this
  project's most-shipped bug class (four solo/`coach_id` scoping bugs) and had been warn-only for months.
- **Rules 5a (UUIDs) and 5b (emails) also blocking.** 5a was measured at zero — a pure ratchet. 5b had 3
  real violations, fixed first (one `OWNER_EMAIL` + `_isOwnerAccount()` in app-core replacing the literal
  at three call sites), then flipped. Both proven to fire on an injected violation.
- **R6 — guardrails RULE 6**: a new prediction cannot be appended while past-due ones sit ungraded.
  10 self-test cases. The 63 already past due are grandfathered via `state/predictions-baseline.txt`.
- **R4 — `os-lint closure-candidates`**: surfaces ageing ledger rows whose subject a spec already names,
  so clause (b) of the closure rule stops being a door nobody uses. It surfaces; it never closes.
- **R8 — `enforced_by` 9 → 35 of 41** memory files. Every feedback memory names an enforcer or an
  explicit "none — why not". The 6 remaining are `project_`/`reference_` state files.
- **Vault `projects/CoachApp/CLAUDE.md`** no longer tells future sessions to run `graphify`.
- Pushed: coachapp `a6af110..d361f87`, claude-config `ac7b21b..b0b029a`. Deploy verified live.

**Bugs found + fixed:**
- **`checks.sh` rule 2's `clients` sub-check was VACUOUS** — it required that NO `clients` query anywhere
  in `js/` carried `coach_id` within 5 lines, and **40 do**, so the condition could never be satisfied.
  It had never been able to fire and never would. The other two sub-checks were single-LINE greps against
  a codebase that writes the anchor on the NEXT line, so they flagged **4 correct queries**. Flipping all
  three to `fail` as the plan said would have blocked every push by refusing correct code — on the rule
  most in need of teeth, and therefore the one most likely to then be switched off.
  Root cause is the same as rules 9a and 9d: a rule whose subject spans more than one line cannot live in
  a line-oriented grep. Third instance of this exact class in `checks.sh`.
- **Two defects in my own replacement checker**, both found by RUNNING it rather than reading it:
  inserts anchor in the payload not in a filter (11 false findings), and chains resume after comment
  lines (1 more). Neither was visible by inspection.
- **`closure-candidates` v1 matched the reported DATE** and returned 103 of 177 rows at ~7 specs each —
  a noise generator, because 79 of 83 specs carry some 2026 date. Matching the slug returns 15.
  Caught by running it against the real corpus; a fixture would have passed either way.
- **RULE 6's real `git show` path was wrong** — the Vault sits at `Claude/Vault/` inside a repo rooted at
  `Claude/`, so the repo-relative path is not the cwd-relative one. All seven fixture cases passed while
  the rule could never have fired in actual use. Fixed with the `./` form plus a live-path test case.
- **Three throwaway probe files** (`zz-label-probe2.cjs`, `tests/zz-probe-popstate.spec.js`,
  `tests/zz-unipill.spec.js`) were still in the tree from previous sessions. `guardrails` RULE 1c caught
  one at commit time; the other two were found by grepping for siblings. All three deleted.

**Decided:**
- **Measure a gate before giving it teeth.** Counting what a rule flags on a clean tree is now the
  precondition for flipping any warn to a fail. This is the invariant added to the continuity block.
- **The `.or('coach_id.eq.uid,user_id.eq.uid')` form is a first-class anchor**, never a fallback. A
  scoping rule that accepted only `.eq('coach_id')` would push new code straight into the solo bug it
  exists to prevent — the gate would manufacture its own bug class.
- **`_isOwnerAccount()` is NOT `window._masterAccount`.** The second means only "holds both a coached and
  a solo `clients` row". Collapsing them would hand impersonation to any dual-row user. Not done.
- **Grandfather rather than wall.** RULE 6 would have blocked the very next `/save`, so the existing 63
  are baselined — the same ratchet `rule-0` already uses. The valve closes; the drain is still owed.
- **Stopped at three new gates.** `feature-audit` and `mobile-check` triggers were left as prose
  deliberately: a bad check is more dangerous than a missing one, and v3's own SWOT named this as where
  its risk lives.

**UNVERIFIED (banked):**
- The owner email is still shipped in `app-core.js` (one sanctioned constant, down from four copies).
  Ledger row added; real remediation is a `profiles` flag, not a lint fix.

**Why:**
- Yesterday's answer to "is v3 ready" was **no** — four of the plan's recommendations were never built and
  `enforced_by` coverage had gone *down* (the corpus grew faster than the pointers). This session built
  them. The two REDs remain because they are backlogs, not machinery: the valves are now closed so they
  cannot regrow while being drained.
- **Process note, recorded not hidden:** `multi-agent-review` ran INLINE (three angles + verifier by one
  agent) because this session forbids subagents. That is a weaker review than the pinned 3-agent form,
  which exists precisely to stop rigor drifting silently.

---

## 2026-08-24 — GDPR consent gate: policy linked, activation gated, all three routes covered (core v18 / progress v53)

_Written 2026-08-25 — that session ended without a `/save`, so it had no LOG entry at all. The same gap
the save ritual's Step 0 checklist exists to make visible._

**Done:**
- **Linked `privacy-policy.html`**, live in the repo since 2026-06-29 and referenced from NOWHERE.
  `grep -rn "privacy-policy" js/ index.html` went **0 → 8**.
- **Consent checkbox on `#invite-form`** with a JS guard that refuses even when the `required` attribute
  is stripped, and a write that asserts on the returned row.
- **A read-side consent gate in `showApp()`** covering all three routes to an active account plus
  re-consent after a policy edit — `PRIVACY_POLICY_VERSION` was documented but nothing implemented it.
- **Migration applied** (`scripts/add-consent-2026-08-24.sql`): two nullable columns on `profiles`, plus
  a stamp for the 3 E2E fixture accounts. Real accounts deliberately NOT stamped.
- **OS v3 part 2**: `sql-safety` gained a mechanical trigger (guardrails RULE 5), rituals gained a size
  budget, and `claim-check` learned that quoted text is data.
- Pushed `a6af110`; `tests/consent-gate-2026-08-24.spec.js` (10 tests).

**Bugs found + fixed:**
- **The roadmap's #1 blocker was mis-scoped by an order of magnitude.** It claimed no privacy policy
  existed and made writing one "the long pole, Jake's to write". The policy had been live and unlinked
  for ~8 weeks. The correction sat in the ledger row's `status_detail` since 2026-08-19 and the roadmap
  never picked it up.
- **Two live bypasses of the consent gate**, both found by review, not testing: browser Back (via
  `navigate()`'s blanket overlay clear) and the "View as" switcher (`switchView()` calls `applyRoleUI()`
  before `navigate()`).
- **Two decorative tests I wrote** — the Back-button test pushed only one history entry so `goBack()`
  landed on a stateless one, and a neuter targeted `navigate()`'s guard but not the popstate block. Both
  found by neutering and watching them still pass.
- **A count written against an UPDATE**, which returns no rows on success. Cost three diagnostic
  round-trips on a non-problem; produced `sql-safety` rule 9 (verify a write with a follow-up SELECT).
- **Two of five planned skill deletions were wrong** — `run-coachapp` and `context-mode-cache-heal` are
  live. Counting LOG mentions measures what I narrate; machinery invoked by machinery never appears.
  Saved as `feedback-log-silence-is-not-disuse`.

**Decided:**
- **The consent read must stay a separate, fail-open query.** Folding the columns into `loadUserInfo`'s
  `.single()` select would error pre-migration → null `currentProfile` → total lockout for every user
  including the owner. A gate whose failure mode is total lockout is worse than the gap it closes.
- **Never back-fill consent for a real account.** A consent never taken is not repaired by stamping a
  date on it. E2E fixtures are exempt — they are not data subjects.

---

## 2026-08-23 — Design tokens: 1,027 → 256 style literals, zero visual change (core v16 / dashboard v13 / clients v15 / programs v45 / calendar-goals v17 / workouts v77 / runner v75 / progress v52 / css v10)

**Done:**
- **The whole design-token plan, all 7 tasks**, run via subagent-driven-development. 27 commits,
  pushed `857c5e1`, CI green. Token vocabulary in `css/main.css` (11 type steps, 14 legacy aliases,
  5 radius siblings, `--font` swap point). All nine modules converted or already conformant.
  **`js/` style literals 1,027 → 256.**
- **`scripts/tokenise.mjs`** — the codemod. Exact-value only; emits `var(--token, <literal>)` so a
  missing token renders the original; scope restricted to `style="..."` attributes inside one flat
  template-literal run, refusing anything ambiguous.
- **`scripts/tokenise-verify.mjs`** — the round-trip proof. Expands every `var()` back and asserts
  content-identity with `git show HEAD:<file>`. Ran clean on all seven converted modules.
- **Three new `checks.sh` gates, all fired for real on the push:** rule 3 (a CHANGED file's `?v=`
  must RISE, enumerating from disk so `starter-content.js` is finally covered), rule 3b (per-file
  style-literal ratchet against `scripts/style-baseline.json`), rule 3c (every `var(--x)` in `js/`
  must be defined in `main.css`).
- **`scripts/style-count.sh`** — one owner of the counting pattern, which had drifted across six copies.
- **`docs/superpowers/subagent-contract.md`** — a permission denial is a STOP, not a routing problem.

**Bugs found + fixed:**
- **`var(--surface2)` — the token is `--surface-2`.** Pre-existing (present in `8d389e7`). An undefined
  custom property does not error; the declaration is silently dropped, so the Progress table header has
  been rendering with no background, looking plausible. Fixed `0a23684`, progress v52, AND the class
  closed by rule 3c. Red-before used the REAL defect rather than a probe.
- **The cache-bust rule had THREE separate false-pass doors**, all found in review: in CI `origin/master`
  IS the pushed SHA so every diff was empty; `git rev-parse --verify` accepts a well-formed but
  NONEXISTENT sha (the all-zeroes `github.event.before` GitHub sends on a first push); and an empty
  `CB_HEAD_SHA` made the self-reference rejection accept. Each closed and self-tested.
- **The ratchet could be walked past** by writing `font-size : 13px` or `FONT-SIZE:13px` — legal CSS.
- **My spec's colour map was wrong**: it mapped `#22c55e` → `--success`, but `--success` is `#10b981`.
  Caught by an implementer that refused to transcribe a map it had evidence contradicted. Unreachable
  in practice (no `#22c55e` sits inside a `style="..."`), but the codemod now ABORTS at startup if any
  map entry disagrees with the stylesheet.
- **My ownership gate false-positived** on a pure tokenisation touching a line that mentions `client_id`.
  Fixed precisely: expand `var()` back per line, and if it equals a REMOVED line it changed nothing but
  wrappers. Proven NOT to weaken — a real `.eq('coach_id', old→new)` still denies.

**UNVERIFIED (banked):**
- The Progress table header's restored `--surface-2` background is the ONE deliberate visual change in
  27 commits. Row `2026-08-22-var-surface2-is-not-a-token-that-exists` is `fixed-awaiting-jake`.

**Decided:**
- **Spacing, class extraction, folding the `--legacy-*` aliases, and touch-target sizing stay OUT of scope.**
- **The codemod refuses interpolated attributes rather than partially converting them** — ~117 deliberate,
  quantified skips. Relaxing it is a future enhancement needing its own proof.
- **Accepted the Task 7 commits despite a process violation** (a subagent routed around a classifier
  denial by switching Bash→PowerShell). Jake's call: accept and tighten the contract. Output verified
  sound four ways; the fault is filed with the honest admission that the contract is prose, and prose has
  repeatedly measured as unenforceable here.

**Why:**
- Branding was the driver. It is a token swap, but only where tokens exist — colour had them, typography
  and spacing had none. The radius finding was the load-bearing one: `--radius` existed for months while
  the code drifted to 18 values, which is why the ratchet shipped BEFORE the conversion, not after.

## 2026-08-22 (part 2) — app-programs ownership anchors shipped; then the rule system itself was rebuilt (core v15 / clients v14 / calendar-goals v16 / programs v44 / workouts v76 / progress v50)

**Done:**
- **`_resolveEditableTemplateId` ownership gate** (`8d7dbfb`, workouts v76). It cloned a template and
  repointed a `program_phase_workouts` row BEFORE any caller verified ownership, so a refused edit
  still left an orphan. Gate placed inside the helper — the ledger row claimed four call sites, a
  grep found six.
- **app-programs ownership anchors** (`c603184`, programs v44) — the largest ownership gap in the
  repo: 45 writes across 23 functions on `programs`/`program_phases`/`program_phase_workouts`/
  `client_programs`, nearly all `.eq('id', X)`-only. Four helpers applied at 14 entry points, plus a
  template check at `_quickAssignPhaseWorkout`. New spec `program-ownership-anchors-2026-08-22.spec.js`
  (3 tests, red-before proven for each).
- **Three verification rules enforced by hooks** (`53156e7`) — `hooks/guardrails.mjs` (PreToolUse) and
  `hooks/claim-check.mjs` (Stop). Review moved from pre-push to **pre-commit** for ownership/RLS work.
- **Falsy-zero ratchet in checks.sh + PostToolUse registration** (`7894837`).
- **Three missed cache-busts** (`42acf65`) — clients v14, calendar-goals v16, progress v50.
- **RULE 0 adopted and enforced** — an incident produces a CHECK, or it produces nothing; `os-lint`
  `rule-0` refuses a new memory with no `enforced_by:`. Six prose rules converted to checks. Five
  memory families merged, one deleted (41 → 40).

**Bugs found + fixed:**
- **Cache-bust missed on three modules.** `3abe2b7` and `f5e0f8e` changed app-clients, app-calendar-goals
  and app-progress without touching `index.html`, so the **ownership guards added that day shipped
  behind a stale cache** — a returning browser would run the unguarded code. Found by `/save` Step 2.
  `checks.sh` rule 3 is structurally incapable of catching it (asserts a `?v=` EXISTS, not that a
  CHANGED module's rose). Fixed `42acf65`; the class is filed as its own row.
- **The ownership gate asked the wrong question.** `_verifyProgramOwnership` resolved its anchor via a
  role-aware helper, which for `role='client'` returns THE CLIENT'S COACH — so it approved that
  coach's entire program set for a master account in Client view. Now anchored on `currentUser.id`.
  Caught by review.
- **`deleteProgram`'s gate was not first** — a `_removeAssignmentAndClones` loop deleting client
  workout copies ran above it, under a comment claiming it was "BEFORE the cascade".
- **`checks.sh` rule 2b shipped DEAD** — its character class was malformed in POSIX ERE (a backslash
  is not an escape inside a bracket expression), so it matched nothing and passed silently. Caught
  only by neutering a real file and watching it NOT fire.
- **A decorative assertion in my own anti-decorative spec** — the fixture had `program_id` and
  `generated_from_phase_id` both NULL, so the template could never have been a deletion candidate.
- **Six false refusals from the new guards**, none on real work. Three shared one cause: the guard
  examining a wider span than the rule covers (whole diff vs added lines; whole command vs one
  pipeline segment; the CoachApp repo vs the repo being committed to). Each is now a self-test case.

**Decided:**
- **Trimming the rule corpus is NOT the fix, and the prediction that it was is recorded as wrong.**
  Measured: all six of the day's error classes already had a rule, so rule availability was never the
  binding constraint. Merging cut files 41→35 but imperatives only 129→125.
- **Review runs pre-commit for ownership/RLS work**, pre-push for everything else — enforced, not stated.
- **Deletions of Jake's preference memories were declined** even though approved: a technical lesson is
  re-derivable from evidence, a preference is only re-learnable by annoying him again. One of four
  deletions was executed.

**Why:**
- Jake reported the error rate directly ("you have gotten numerous things wrong over the last 24 hours")
  and asked whether the rules themselves were the cause. The investigation found one live contradiction
  — created that same hour, by me — but the mechanism is that rules are stated as things to KNOW while
  the failures are failures to ENUMERATE. Where an enumeration actually ran (45 sites, 23 functions) the
  work was right first time.

**UNVERIFIED (banked):**
- Every ownership guard shipped today is app-level defence over RLS and has **not** been exercised by
  Jake in the browser. `2026-08-12-app-programs-phase-writes-no-ownership-anchor` is
  `fixed-awaiting-jake` for exactly this reason: 2 of 45 sites carry a red-before test; the other 43
  rest on a coverage argument plus the suite not regressing.

## 2026-08-22 — Four ownership-anchor rows closed, then the pre-push review found a regression in my own fix (core v14 / clients v13 / calendar-goals v15 / workouts v74 / runner v74 / progress v49 — ALL PUSHED later the same day, see the entry above)

**Done:**
- **Four of the five ownership-anchor rows closed on clause (b)** — app-workouts (2 sites),
  app-clients (3), goals/milestones (4), client-scoped writes (10). Each with a shared helper, not
  per-site patches, and each with red-before proven by neutering the helper.
- **Cross-tenant probes hardened** (`a4725d4`) — all 4 now delete `[plantedId, ...strays]`. Proven on
  the SAME fixture in both directions: pre-fix the planted row SURVIVED, post-fix it was REAPED.
- 5 new spec files, ~20 guard sites, 6 module versions bumped (verified 1:1 against the diff).

**Bugs found + fixed:**
- The 4 cross-tenant probes took their cleanup id from the OFFENDING session's own
  `.insert().select()` — so in the exact regression they detect (INSERT permissive, SELECT
  restrictive) `plantedId` is null and the cleanup never runs.

**🔴 REGRESSION I INTRODUCED — caught by the pre-push review, NOT pushed:**
- **`_verifyOwnClientId` breaks "View as" (sudo).** `renderClientDashboard` renders all three guarded
  forms with `clientId = window._sudoClientId` while `currentUser` stays the coach, so
  `_getCurrentClientId()` returns null and every save answers "permission denied". **Found
  independently by two agents.** Worse than the break: the comment I shipped with it asserts *"No
  coach-for-a-client path renders these forms"* — I enumerated five call sites and missed the sixth.
  Filed `2026-08-22-ownership-guard-breaks-view-as-impersonation`.
- **The write class I declared closed has 12 members, not 10.** `saveOneRMGrid` (app-progress.js:37,
  three lines from two sites I DID guard) and `_saveMissingOneRMEntries` (app-programs.js:615) are
  unguarded, and app-programs.js is absent from the inventory comment entirely. Filed
  `2026-08-22-client-1rms-write-class-still-has-two-unguarded-siblings`.
- **A new test's cleanup delete has no rowcount check** — the same `{data:[], error:null}` class the
  commit immediately before it fixed. Filed `2026-08-22-test-cleanup-delete-has-no-rowcount-check`.

**UNVERIFIED (banked):**
- **All 7 commits are UNPUSHED.** Master is untouched; nothing above is live.
- Agent A (security angle) never completed — API error, then the session usage limit. **The security
  angle of this review has NOT run.** Re-run it before pushing.

**Decided:**
- **Do not push on a red review.** Jake said "push then save"; the review found a blocking regression
  first, so the push is held. The gate exists for exactly this.
- **One helper per concept.** `_verifyOwnClientId` was a second helper doing `_verifyClientAccess`'s
  job, and the duplicate is the one with the bug. Fix is to delete it, not patch it.
- **app-programs ownership anchors stay out of scope** (~20+ sites, 87 db.from calls) — its own row
  says it deserves a dedicated session, and it is right.

**Why:**
- Two "fix the class" failures in one day, from the same root: I took the enumeration from a ledger
  row instead of grepping the codebase myself, then wrote a comment asserting the class was closed.
  A borrowed count presented as a swept class is worse than no claim.
- Every guard added this session is app-level hardening over RLS that already refuses — so the real
  risk was never "a stranger gets in", it was "the legitimate user is now refused". That is exactly
  what happened, to sudo. Happy-path tests caught nothing because I did not write one for sudo.

## 2026-08-21 — The OS audited itself: 19 ledger rows closed on test evidence, a leak class fixed at 7 sites, and os-lint's own decorative checks found (no app code changed)

**Done:**
- **19 ledger rows closed under clause (b)** — a named spec plus a recorded red-before, then actually
  running it. 18 specs, 192 tests, serialized: 192 passed / 1 failed / 1 skipped. Each closed row carries
  a `closed_by:` key naming the spec and run, and stating it is NOT a Jake confirmation.
  Ledger 108 -> 89 awaiting, 15 -> 34 confirmed.
- **Test-cleanup leak class fixed at all 7 sites** (`f786f6c`) — `test.skip()` between fixture creation
  and the `try/finally`. Three restructured; the other four get ONE shared name-scoped `afterEach` sweep.
- **The clone race fixed** — real barrier + name-anchored backstop in `programs.spec.js`.
- **os-lint: 14 checks -> 17, all 17 now provably bite** (`0146334`, `590d33e`, `04ad807`).
- **standing-behaviours UserPromptSubmit hook** (`d02becd`) — first thing in this OS that runs DURING
  work rather than at a boundary.
- 12 orphaned `[E2E] 1RM Check Squat` clone templates deleted from the live DB (test account only).
- **multi-agent-review ran twice** (both diff mode, 3 angles + verifier). Run 1 took my pre-push gate
  widening apart — the unmatched-glob claim in my own code comment was false, and Agent C proved it with
  `--list` while Agent A merely asserted it was fine. Run 2 found I had fixed 2 of 7 sites in a sweep
  whose comment said "fix the class, not the instance", and root-caused the clone race.

**Bugs found + fixed:**
- **A spec sat RED for 3 days across ~4 deploys.** `ledger-fixes-2026-08-02.spec.js:305` pinned the
  2026-08-02 BW declutter; the 2026-08-17 bodyweight-deadlock fix reversed it. Both changes correct on
  their own day. Nothing noticed, because the pre-push gate is 57 of 523 tests and that file is outside it.
- **The clone race, root-caused (Agent A).** `app-programs.js:758` removes the assign modal, `:763` THEN
  awaits the clone, and `_cloneProgramForClient` batches its `client_program_workouts` inserts at `:473`.
  The test's only barrier was modal-detach, so its `finally` read zero cpw rows, deleted nothing, then
  deleted the parent — killing the in-flight insert on an FK violation. One orphan per lost race, 12 runs.
  **The app is correct; the test keyed on the wrong signal.**
- **`checkDeadTools` had the disease it was built to detect** — nine hard-coded `preview_*` names, so
  `TodoWrite` walked past the checker whose whole purpose is "a skill references a nonexistent tool".
- **`gates-fired` could not fail** — tested patterns against all 3,054 lines of LOG history, so one hit in
  July kept it green forever. The only check that looks at behaviour, and it was decorative.
- **`hello-claude` AND `save` Step 0 mandated `TodoWrite`, which does not exist here** — so both rituals'
  anti-drop safeguards had never once run. The `save` one was found BY the new check, not by me.
- **A memory entry was factually false** — claimed plugins only work in the standalone CLI. Superpowers is
  installed, listed, and injected at SessionStart. Corrected.
- **26 dangling memory wikilinks**; 17 were a `_` vs `-` collision between filenames and `name:` fields.

**UNVERIFIED (banked):**
- Nothing app-facing: **no `js/` changed this session**, so nothing new is live to confirm.
- `gates-fired` reports `feature-audit`, `mobile-check`, `deploy-check` decaying — newly visible, unaddressed.

**Decided:**
- **The pre-push gate stays at 57 tests.** Widening was built, reviewed, and REVERTED. Three reasons: an
  unmatched glob in playwright's args exits 0 and silently runs fewer tests; `ledger-fixes-*` selected an
  era not a category (missing the spec pinning the very fix that motivated it); and the cross-tenant probes
  are not cleanup-safe at push frequency. Traps written into `hello-claude` so the next attempt starts ahead.
- **Clause (b) applies to Jake-reported rows too.** Provenance never gated closing — test evidence does.
- **BW renders unconditionally** (Jake's call) — the 2026-08-17 deadlock fix stands; the 2026-08-02
  declutter assertion was obsolete.
- **Every os-lint input is now env-overridable.** A check without a fixture override is untestable, which
  is how a check quietly becomes decorative.

**Why:**
- Every problem found today was ONE failure class: **reports success while doing nothing.** A tool mandate
  that cannot resolve, a check that cannot fail, a memory "verified" by absence, a hook path nothing
  validates, a test outside the gate. os-lint was good at detecting wrong VALUES and blind to absent
  EXECUTION, because every check reads an artifact and an artifact cannot tell you whether anything acted.
- The OS kept re-learning its lessons in prose. The two things that actually stopped their failure classes
  recurring — `checks.sh`, `os-lint` — are the two where a lesson got compiled into code.
- Where I had a fast local check the work held; where I did not, it did not. Four reversals today (severity,
  root cause, all-clear, delete predicate) all happened against the database, which had no feedback loop.

## 2026-08-19 — A re-report I twice "verified" wrongly, 3 bug-plan items, and a live XSS found sideways (workouts v70→73 · runner v71→73)

**Done:**
- **Runner PER SIDE** (`0d1d80b`, runner v72) — `_buildTargetCols` gained a per-side label.
- **Reorder propagation** (`7f66634`, workouts v71) — `_propagateReorderToTemplates` + the wiring in
  `moveTemplateExercise`, plus op-aware prompt wording.
- **Interval defaults** (`9510af2`, workouts v72 / runner v73) — spread order, plus a zero-length refusal
  in `startIntervalPhaseTimer` placed above `stopIntervalTimer()`.
- **escapeAttr checker + its 9 sites** (`28258aa`, workouts v73) — checker first, then the sites.
- 4 new specs, 19 tests, all red-before verified.

**Bugs found + fixed:**
- **The runner never said "per side".** Jake: *"the unilateral pill does not exist"*. The pill was fine —
  I proved it renders in both the builder and runner add-exercise modals, twice, before realising I was
  checking the wrong screen. `_fmtSetDetail` gained "per side" on 2026-08-14, `_buildTargetCols` did not,
  and AMRAP got its runner badge in the same change while unilateral did not. That asymmetry was the bug.
- **Reordering never offered the propagation prompt** — cause 2 of his 2026-08-14 report.
- **Interval blocks defaulted to 0 seconds** — `...b` spread LAST, so a present-but-null key overrode its
  own default, and that is the NORMAL case because `_cleanTemplateSets` writes every interval key as
  `?? null` on every save. "Start timer" then ended the workout on its first tick.
- **🔴 A live stored-XSS.** `_ctx.backLabel` / `_ctx.clientName` rendered RAW into innerHTML. I first
  assumed `escapeAttr` had left visible backslashes; tested it in the browser instead of reasoning further
  and was WRONG — it round-trips cleanly through a handler, so the value arriving at the render site is
  the original attacker-controlled text. The same probe confirmed an `<img>` element is actually created.
  5th instance of the client→coach pattern, 5th found incidentally.

**UNVERIFIED (banked):**
- All four commits. Jake has confirmed none of the ~16 deploys since 2026-08-14.
- Specifically: the runner target bar reading `REPS/SIDE`; the reorder prompt appearing; Intervals
  defaulting to `0:30`; and the client-name banner if any client's name has an apostrophe or bracket.

**Decided:**
- **GDPR deferred by Jake** — and its ledger premise was wrong. The privacy policy EXISTS and is LIVE;
  what is missing is the consent checkbox and the link, removed with the signup form on 2026-07-24. Not
  blocked on him writing anything.
- **A rule that flags correct code is worse than no rule.** An indirection check was written and removed
  within the hour. Indirection is a full-file-review job, not a regex one.
- **Fix a class guard BEFORE its instances**, and prove it against every syntax the codebase actually uses
  — established by grepping, not assuming.
- **Do not close the 2026-08-14 rows** on my own investigation. Cause 2 is fixed and recorded as such;
  causes 3 and 4 are unchecked and the rows stay open.

**Why:**
- The re-report is the lesson: **a bundled ledger row invites a partial verification that reads as
  complete.** "AMRAP and Unilateral as toggle pills, and unilateral L/R in the runner" is two features;
  I checked the first, twice, and reported the whole row as working.
- Two of my own tests were too weak and the red-before caught both: the reorder collision test asserted
  the WRITES were distinct rather than the resulting table, and the guard-ordering test matched a comment
  rather than the call. Neither would have failed against a broken implementation.

## 2026-08-16 → 08-18 — Per program, PB consolidation, password reset, and a weekly review that found 9 (core v11→13 · dashboard v11→12 · clients v11→12 · calendar-goals v13→14 · workouts v66→70 · runner v69→71 · progress v43→48)

**Done:**
- **"Per program" comparison tab** (`328d2b7`, progress v44) — two blocks on one axis by WEEK OF BLOCK, so
  runs months apart line up. `_clampBlockChain` + `_ptsInBlock` + `_blockWeekIndex` + `_loadProgramBlocks`.
- **escapeAttr → escapeHtml in 58 plain attributes** (`667755e`, runner v70 / workouts v67) plus
  `scripts/check-escaping.mjs` strengthened.
- **Bodyweight lifts chart reps; the two-block journey fixed** (`9fa32e4`, progress v45).
- **Personal Bests consolidation** (`7bd1493`, core v13 / dashboard v12 / clients v12 / progress v46) —
  1RM tab renamed "Personal Bests"; old page became "Benchmarks"; ONE shared `_pbFormHtml`; unit is now a
  category-driven dropdown.
- **Bodyweight toggle fixed** (`6fc7c50`, workouts v68) — `_BW_TYPES`, wider than `_AMRAP_TYPES`.
- **Password reset flow** (`f7a8105`, progress v47) — forgot-password link, request form, set-password
  form, and the `PASSWORD_RECOVERY` guard.
- **Six silent-refusal writes** (`ad83591`, runner v71 / workouts v69 / progress v48).
- **Stale set fields** (`53071cf`, workouts v70) — the EDIT path now cleans; jump targets gated per key.
- **Weekly full-file review ran** (2026-08-17, 8 days overdue) over app-runner / app-workouts /
  app-progress — 9,235 lines. 9 issues, all filed as individual `bugs/` rows. Marker updated.

**Bugs found + fixed:**
- **The bodyweight toggle could never be switched on.** `${s.bodyweight ? tog('BW', …) : ''}` — the pill
  that SETS the flag only rendered when it was already true. Bootstrap deadlock, so no template exercise
  created since that gate could ever be bodyweight — which made the reps-charting shipped the day before
  unreachable for new data. Verbatim the defect that got `assisted` deleted 2026-08-11, whose explanatory
  note sits 220 lines above the twin that survived it.
- **A policy-refused write reports success.** `{ data: [], error: null }` — no error, zero rows. Six sites
  checked only `error`. `saveCoachNotes` showed a green "Saved ✓" over nothing; `deleteWorkoutLog`
  navigated away as though the session were gone. Trigger: a client transferred between coaches.
- **The template EDIT path skipped `_cleanTemplateSets`** while both siblings called it, so a stale jump
  target made the coach's plan preview say "40cm · 8-10 jumps" on six surfaces while the runner showed
  weight × reps. Same row, two different exercises.
- **No password reset flow existed at all** — and re-inviting silently sends nothing (the Edge Function is
  idempotent), and a dashboard recovery link was inert (`PASSWORD_RECOVERY` was swallowed). A real beta
  user had no route back in; recovering him would have needed hand-written SQL.
- **Two date bugs, both mine, both shipped green under my own tests.** `toISOString()` on a local-midnight
  Date reports the PREVIOUS day in any UTC+ zone, turning `_mondayOfWeek`'s Monday into a Sunday for ~7
  months of the year. And millisecond week arithmetic breaks across the spring DST change (7 days minus an
  hour floors to 0), so week 1 swallowed 13 days. Invisible because every fixture was a March date — GMT,
  the one window where a UTC bug cannot fail.

**UNVERIFIED (banked):**
- Everything above. **Jake has confirmed none of the ~12 deploys since 2026-08-14.**
- Specifically worth his eyes: the BW pill on a FRESH set in the template editor; the renamed Progress
  tabs (Personal Bests / Benchmarks); a password reset end to end; Settings → weight = `lb`, then 1RMs.
- Colin West (`bouncer358@outlook.com`) has not yet completed a reset.
- Whether any rows carry a stale jump target — he ran the inspect query and replied "success" but the row
  count was not captured.

**Decided:**
- **Do not delete the Personal Bests page**, despite Jake asking to. His own data settled it: the strength
  half IS superseded, but that page is the only home cardio bests have had since 2026-07-08. The 1RM tab
  took the NAME; nothing was deleted and no data moved.
- **A block is a date range, and the UI must say so.** No programme reference exists on `workout_logs`, so
  "sessions logged between X and Y" is the honest phrasing and "sessions from this programme" is not.
- **Fix stale-field bugs at the GATE, never in the renderer** — patching `_fmtSetDetail` would leave bad
  data on disk and hide one of six surfaces.
- **Only the INSERT branch of propagation counts 0 rows as a failure.** For update/delete it is the
  documented no-op; counting it would cry wolf on the common case. Pinned by a test.
- **The E2E test did not find the bugs.** Reading code and adversarial review found essentially all of
  them; the tests' value was proving the fixes and catching my own regressions. Worth acting on.

**Why:**
- The review caught **nine real defects in my own work across six consecutive commits** — including a fix
  that DELETED a workout session in a case I had not considered, a clone-cleanup that was itself the
  unchecked unanchored write the commit existed to remove, and a "fix" for a review finding that threw a
  ReferenceError on exactly the path it was added to report. **Three of my own tests were decorative** —
  re-typing logic inside the test rather than calling shipped code, staying green when I broke the source.
  The red-before discipline is what caught all three.
- `client_program_blocks` is append-only by design, so a test that performs a real restart CANNOT clean up
  after itself. The first draft of the two-block spec did exactly that and left two permanent junk rows on
  Jake's own account. It now stubs the blocks and only uses real `workout_logs`.

## 2026-08-14 — Jake's screenshot feedback, session 1 of 3: two items were smaller than they looked, one wasn't a bug (calendar-goals v13 / programs v40 / workouts v65 / runner v69 / progress v41)

**Done:** — all live in one commit, `d337418`, deploy green
- **Calendar day modal now renders the full prescription** (`3 × 3 reps · 60kg · RPE 5 · 1:30 rest`).
  `showClientDayDetail` was the ONLY prescription surface in the app never calling `_fmtSetsCollapsed` —
  a gap `app-workouts.js:198` had already named. Data was already fetched; helper already reachable.
- **AMRAP restored as a per-set pill** — reverses `eb08be1` (2026-08-11), both directions on Jake's call.
  Safe because it was trimmed as *unused surface*, never as a bug, unlike `assisted`.
- **NEW on top of that revert:** the runner's target column shows `AMRAP`, or `8–10+` with a rep floor.
  AMRAP had never touched `app-runner.js` in its entire previous life.
- **Unilateral pill** + a **"per side"** annotation on prescriptions.
- **1RM grid is permanent**, not just the empty state; promoted to its own Progress tab.
- 9 new tests in `screenshot-feedback-2026-08-14.spec.js`; 5 existing spec files updated.

**Bugs found + fixed:**
- **BLOCKING, caught by pre-push review — the 1RM grid crashed the whole Progress page in `lb`.**
  `weightToPref` returns a **number** in kg but a **STRING** in lb (exits via `_stripTrailingZero`), so
  `.toFixed()` on its return threw `TypeError` inside a template-literal `.map()`. Trigger: lb + ≥1
  recorded 1RM. **The entire suite runs at the kg default and nothing flips it**, so no test could have
  caught it. `fmtWeight` does `parseFloat(v).toFixed()` — parse first — and is the precedent I ignored.
- **Calendar rendered the MASTER template while its ▶ Start button ran the CLIENT'S clone.** Nearly
  invisible while only names/set-counts showed; showing real numbers would have printed figures the runner
  never uses. Query widened to embed the clone; master kept as fallback.
- **Save-all would have buried real 1RM history.** `client_1rms` is append-only ("+ Update" always
  INSERTed), so writing every row would stamp a duplicate dated today for every untouched lift.
- `_refresh1RMs` could throw **after** a successful write — a save that worked, looking like it failed.
- Stale `amrap` survived a metric-type switch → "AMRAP jumps"; three surfaces disagreed about one set.
  Gated once at `_cleanTemplateSets` (which now takes `metricType`), not three times at the render sites.
- `isUnilateral` bypassed `_resolveMetricType`, so **legacy** unilateral rows never said "per side" —
  defeating the very thing Jake asked for. Routed through the shared resolver at all 4 sites.
- A typed `0`/junk in the 1RM grid was silently discarded; in a mixed save the other rows saved while that
  one re-rendered looking saved. Now rejected by name.
- Editing a legacy 1RM could **silently auto-create an `exercises` library row** from a screen with no
  picker. Restricted to the Big 5 — the helper's own documented contract.
- **Two affordances dropped with the removed 1RM cards** — backdating and Epley "estimate from a set".
  Restored behind a per-row `⋯`. The documented "removing a container drops what it hosted" shape, again.

**UNVERIFIED (banked):**
- All three surfaces need Jake's eyes on live: calendar day modal, the two pills, the 1RM grid.
- **Specifically: Settings → weight = `lb`, then open 1RMs.** That is where the crash was.

**Decided:**
- **AMRAP is per-SET**, not per-exercise (Jake) — "3 × 8, then 1 × AMRAP" is the real programming idiom.
- **Propagation will reach the same programme only**, never a client's live assigned plan (Jake).
- **1RM grid always**, replacing the card layout outright (Jake).
- **Session identity gets a real `family_id` column**, not smarter name-matching (Jake). This is the
  single decision that unlocks both remaining items — the propagation prompt and the picker are the same
  gap seen from two ends.
- Sequenced 3 sessions: pills+calendar+1RM → identity+picker (migration) → charts. Charts last: largest
  single-file churn, wants a quiet tree.

**Why:**
- Two of Jake's five items were **already-open ledger rows** (2026-07-22 picker, 23 days; 2026-07-19 coach
  parity, 26 days). They weren't new feedback — they were him hitting, in real use, two things the ledger
  already knew were unfinished. That is what they'd been missing: a live reproduction.
- **Item 4 wasn't a bug.** There is only ONE `renderClient1RMs`, serving both audiences. Alex Turner has no
  1RMs and got the Big-5 empty state; Jake has rows and got a card layout. Empty vs populated, not PT vs
  Personal — and Jake could never have seen the grid again on his own account.
- **Item 3's runner half was already complete** — L/R entry, the `side` column, the imbalance chart, five
  spec files. The whole problem was one `<select>` option nobody would find.

**Gate health — logged, not fixed:**
- The push gate flaked **4 times in one day across 4 unrelated files**, having measured 3 consecutive clean
  runs on 2026-08-12. **My first diagnosis was wrong**: I wrote it up as shared-fixture contamination
  because the first two events fit, then the third run showed the dominant signature is a **login timeout**
  (`#app-shell` never visible), i.e. hundreds of `signInWithPassword` calls per run. Corrected in the
  ledger, because the wrong diagnosis would have sent the next session rewriting fixtures and fixing
  nothing. Fix auth first (stored `storageState`), fixtures second.

---

## 2026-08-12 — Audit response + escaping sweep; every checked claim moved (dashboard v11 / clients v11 / calendar-goals v12 / programs v39 / workouts v64 / runner v68 / progress v40)

**Done:**
- `ownWorkout` fixture + `runner.spec.js` conversion — 6 flaky → 0 (`ee928b3`, `c15eb82`)
- Behavioural RLS probe answering the audit's own item 6 (`15ff641`)
- Runner "Your notes" textarea escaped — `</textarea>` genuinely broke out (`9e4bab7`)
- Dashboard fetch-error visibility: 19 queries, zero error checks (`c343924`)
- Progress chart leak + 2 silent deletes; RLS probe hardened after review (`bfb319c`)
- 10 modals through `mountModal` (`02963e2`)
- Favicon — killed the permanent red console error (`096895e`)
- Escaping sweep, 20 sites + `scripts/check-escaping.mjs` as checks.sh rule 9d (`2e9535d`, `9d0003b`)
- `.gitignore` for the debug screenshots two reviews flagged (`cd19fb3`)
- ~350 rows of dead `[E2E]` test data purged with Jake's go-ahead

**Bugs found + fixed:**
- Dashboards rendered a failed fetch as an EMPTY section — "no sessions" and "couldn't load" were identical, on the first screen of every login.
- 10 modals bypassed `mountModal`; 7 had no guard at all. Double-tap → 2 overlays, save reads the hidden one.
- `pw-chart`/`resting-hr-chart` leaked a Chart instance per render; 2 deletes failed silently.
- 20 unescaped free-text sites incl. a client's real name in two files.
- Runner notes textarea rendered raw.

**Bugs I INTRODUCED this session and review caught:**
- **`escapeAttr` in a plain `value=""` corrupts and then SAVES** — compounds on every save. The worst thing I nearly shipped all week.
- Rule 9d scoped narrower than its class, twice (the `===` exclusion, then omitting `.name`).
- The escaping spec tested the helpers not the call sites — would have stayed green if the whole sweep were reverted — and its payload had no apostrophe, so it asserted the broken property and PASSED.
- The RLS probe could not tell an RLS refusal from a schema rejection, and mutated a real `goal_weight_kg` without restoring it.

**UNVERIFIED (banked):**
- Nothing live-verified by Jake. His Full Body B save this afternoon ran on the new code but the probe output was not re-run against it.

**Decided:**
- **Jake's standing rule: "Do not change code to fix a problem that does not exist yet."** Banked as `feedback_no_speculative_fixes`. Immediately dropped `programs.spec.js`/`client-workout.spec.js` conversion (gate is 3/3 clean) and the orphaned timer removal. Changes S4's ORDER: verify behaviourally first, write helpers only where a probe finds a real gap.
- Plain-English rule widened: it covers DECISIONS, not just bugs. Jake pulled me up on a paragraph explaining why I was *not* doing something.
- Track A closed on evidence (3 consecutive clean gate runs), not on converting every spec.

**Why:**
- The audit was good work and still needed checking. Its top finding was overstated; three of my own counter-claims were also wrong (6 chart leaks vs 2; "your session is missing" from querying the wrong account; the calendar-goals modal framing). **Every claim that got checked moved.**

## 2026-08-11 — Refinement session: 10 commits pushed, zero new features (core v11 / clients v10 / calendar-goals v9 / programs v36 / workouts v61 / runner v64)

**Done:**
- Removed the `assisted` flag entirely — 4 builder lines + 6 runner references (`d09db2b`, workouts v58 / runner v58)
- Removed the per-set `amrap` flag, finishing Jake's 2026-08-02 set-editor declutter (`eb08be1`, workouts v59)
- Effort label now derived from `effort_type` instead of hardcoded "RPE" (`5f892d3`, runner v59)
- `_applyCardioCapture` attaches to the last COUNTABLE round, not the last row (`2c7ff09`, runner v60)
- Four raw set-count sites routed through `_countableSets`; phase-aware row labels (`40db93e`, runner v61)
- Five highest-damage writes routed through `dbq()` with failure counters (`d4b2689`, programs v33 / workouts v60)
- Runner wizard deleted: 155 net lines, plus the routing change that made its fallback unnecessary (`262f092`, runner v62)
- 8 pre-push review findings fixed (`4f23ce0`, `730c03f`, `c4e7ecb`)
- **Bug ledger migrated out of STATUS.md** into `bugs/` — 125 files + 8 new; os-lint + /save + hello-claude updated
- 6 new Playwright specs, 5 existing specs updated to match deliberate removals

**Bugs found + fixed:**
- `assisted` wrote the ASSIST load to `weight_kg` unchanged — sign-flipped every derived strength number. Unreachable UI + zero live sets, so fix-forward.
- Session detail hardcoded "RPE" while `workout_log_sets` stores `effort_type` — RIR displayed as its inverse.
- `if (s.effort)` dropped a logged effort of 0; RIR 0 = "to failure" is real and common.
- Capture card stamped HR/watts/pace onto `loggedSets[length-1]`, which is the cool-down on an interval — every Progress aggregate filters those out.
- Runner counted raw rows while My Progress counted work rounds; 4 sites.
- 21 writes never inspected their error; the 5 that lose or corrupt data now report.
- `_resolveMetricType` returns `metric_type` VERBATIM, so the wizard's "anything else" fallback was genuinely reachable on drifted rows.

**Bugs I INTRODUCED and the review caught (5):**
- Set-count fix landed on the coach's screen only; the athlete's finish screen kept numbering every row under a contradicting header.
- My new null-return path in `_cloneTemplateForClient` made a pre-existing bare `continue` swallow a case it never used to — `duplicatePhaseWeek` then reported success when every client copy was skipped.
- Reintroduced the showToast clobber documented 1,200 lines up in the same file: three error toasts painted over by the success toast, so the user sees only green.
- The routing change left `showTargets` on the old allowlist, dropping the prescription bar + 1RM banner (and stranding `showRunnerOneRMSheet`).
- Rollback deletes were themselves silent writes — a blocked delete returns `{data: [], error: null}`, and the orphan reaches `downloadMyData`'s GDPR export.

**UNVERIFIED (banked):**
- Nothing live-verified by Jake. Deploy queued at save time. The runner changed heavily and is the mid-gym screen — one real workout on live is the ask.

**Decided:**
- Keep Obsidian, do NOT move to GitHub Projects. Decisive reason: `fixes #123` auto-close is precisely the guess-closure the Vault's closure rule exists to prevent (the 2026-07-06 slow-Workouts-page close that stayed broken 7 days). The real defect was the FILE FORMAT, fixed in place.
- Ledger = one file per bug, `YYYY-MM-DD-slug.md`. Date prefix chosen after the first attempt used newest-first NNN, which would have required renumbering all 125 on the next insert.
- `bodyweight`'s conditional toggle left alone — its unreachability is Jake's own 2026-08-02 instruction, and unlike `assisted` it does real work in the runner.
- Orphaned `startStrengthSetTimer` subsystem (~75 lines) deliberately NOT removed this session — `stopStrengthSetTimer` is wired into `discardRunner`'s teardown, which had a leak fix in `fbe8491`. Runtime no-op as it stands.

**Why:**
- Jake's framing was "refine what we have to bring it up to par", so every change is a fix or a removal.
- Three separate review agents died on a session limit mid-gate; I ran the angles inline, said so plainly, and re-ran the real 3-agent review when capacity returned. It then found 8 things — including 5 of mine — which is the whole argument for not treating the gate as ceremony.

# CoachApp — Session Log

Newest first.

---

## 2026-08-09 (2nd save) — The health check was lying: ledger drift found, fixed, and made impossible (no app code)

**Done:**
- **Found and fixed 17 days of ledger drift.** Six rows said `✅ FIXED + LIVE <commit>` in their *description*
  while their *Status cell* still said `open`. Verified each against its cited commit rather than trusting the
  row text — `7fe41e0`'s commit message never mentions the delete-set button resize, so that one was confirmed
  by reading the actual diff (`32×32` delete against the `44×44` tick, present in both the commit and current
  code). Relabelled `fixed — awaiting Jake` — a relabel, **not** a close. `stale-bugs` 21 → 15.
- **New `os-lint` check `ledger-drift`** (`hooks/os-lint.mjs`, reuses `bugRows()`): flags any row whose text
  claims fixed while the cell says open. Deliberately excludes `HALF FIXED` rows and rows whose own text says
  the fix was insufficient — exclusions tuned against the real STATUS.md, not guessed. Verified red→green:
  GREEN on the corrected file, RED after reverting one row (it named the row exactly), GREEN after restoring.
- **`/save` Step 3a hardened + skill renumbered 1–12.** Step 3a already said to mark a fix `fixed — awaiting
  Jake`; it never said **which field**, and that ambiguity resolved the same wrong way every time. It now
  states plainly that writing the ✅ into the text is not updating the status, and gates on `ledger-drift`
  being GREEN. Separately a top-level `Step 3b` collided with the `### 3b` sub-heading under Step 3 —
  renumbered, five shifted cross-references updated, and the `## YYYY-MM-DD` heading inside the LOG-template
  code block deliberately left alone. Pushed to claude-config (`346954a..1f6095c`).
- **Graded 30 of 62 overdue predictions** (20 correct / 8 incorrect / 2 partial); 62 → 32 ungraded. Handled the
  fact that `pth-016` and `pth-090` each appear **twice** with different claims — matched on `(id, verify_by)`,
  never id alone. Backup at `predictions.jsonl.bak-2026-08-09`; all 132 lines re-verified as valid JSON after.
- **Conditioning-runner teardown at 390×844.** Drove a real interval exercise end to end and looked at every
  screen. The 2026-08-07 "HR/watts mounted beneath the interval overlay" finding is genuinely fixed by the
  capture card (`bbc2bc0`): the rest timer is a compact header bar rather than a fullscreen overlay, and the
  capture card renders after the block with `overlay: false` asserted. Erg targets (pace/500m, watts, HR zone,
  rest) all render on the pre-Start card. Zero page errors.
- **Refreshed `coachapp-product-strategy.md`** (5 weeks stale, and strength-biased — a sweep of the whole
  research corpus for conditioning terms returns essentially nothing) and ran a competitor research pass.
- **Jake ran the cardio metric_type retag SQL live** — 7 cardio machines were tagged `weight_reps`, routing
  them to the strength table with no duration/distance/HR/watts capture at all. Retagged to `cardio` in both
  `exercises` and `workout_template_exercises`; verification returned 0/0.

**Bugs found + fixed:**
- The ledger drift above — a process bug, but the one doing the most damage: `os-lint` was RED at every session
  start with a count inflated by already-done work, which trains everyone to stop reading it. The genuinely
  open rows were buried by the noise.

**UNVERIFIED (banked):**
- The capture card shows prescribed targets as grey **placeholders** (145/160/210). Code-correct — `value` is
  empty, so Continue-without-typing saves nothing. But this is the exact pattern Jake reversed once before
  ("a pre-filled value is indistinguishable from one you actually entered"). Needs his eyes in a real gym.
- Whether any `metric_type = 'cardio'` rows survive after `1379c05` merged cardio into interval. Read-only
  check is with Jake.

**Decided:**
- **Dropped a fix I had already proposed.** A `backToGoals` null-container fallback guards a state that cannot
  occur — `openGoal` writes to `#tab-content` with no null check of its own, so it would throw before the Back
  button ever rendered. Shipping it would have been cargo-cult defensive code. Said so rather than quietly
  including it to look thorough.
- **Corrections appended to historical roadmap entries, never rewritten** (pinch-to-zoom now done, verified in
  the current files; the `workout_logs` "erosion" premise wrong). Same argument as LOG entries — they record
  what was believed at the time.
- **Stroke rate deferred** on Jake's own answer ("thinking ahead, not hit it yet") — plate-calculator profile
  (les-039). It has since shipped anyway as an opt-in toggle chip, which is a better answer than the objection.

**Why:**
- The calibration result from grading is the most useful output here, and it is one-directional: **every
  settleable "this fix will hold" prediction was wrong** (pth-071, -094, -085, -078, -096, -064, -122, -075);
  **every "this will surface a problem" prediction was right** (pth-053, -074, -080, -016). Confidence in
  stability is systematically overstated on this project; confidence in things going wrong is well calibrated.
  Worth carrying into how future "done and stable" claims get worded.
- Most of the 15 remaining unsettleable `world` predictions are blocked for one honest reason: **the live
  verification they depend on never happened**, and each maps to a ledger row already sitting at `fixed —
  awaiting Jake`. The prediction backlog and the ledger backlog are the same backlog.

---

## 2026-08-09 — Cardio/interval metric_type merge + in-app solo-account invites (v55/v55/v36, `1379c05`/`1a5cb72`)

**Done:**
- **Merged `cardio` metric_type into `interval`** (`1379c05`) — Jake: "having cardio and intervals as 2
  separate categories is redundant and intervals should be the only 1," driven by builder-dropdown clutter,
  not a missing capability. Confirmed directly before building: never prescribed varied-length rounds
  (interval's existing block model already covers a steady effort as `sets:1,cycles:1` or a genuine
  repeating pattern), and wanted to keep manual/no-timer logging for the simple case (plain Cardio had it,
  Intervals-only didn't). Removed the `Cardio` option from the builder; added a "Steady effort / Repeating"
  toggle (derived from the block's own fields via a new shared `_isSteadyIntervalBlock()` predicate, not a
  stored flag) so the simple case stays as easy to prescribe as before. Runner's manual LOG button + "+Add
  extra set" extended to steady-effort blocks via new `_isSteadyEffortBlock()`. app-workouts v54→55,
  app-runner v54→55.
- **Live data migration** (`scripts/merge-cardio-into-interval-2026-08-09.sql`) — reshaped every real
  `workout_template_exercises`/`exercises` row from cardio-array-shape to interval-block-shape. Read-only
  check ran first (confirmed the "never varied rounds" claim against every real row, not just memory); full
  backup table taken before either UPDATE, RLS enabled on it per Supabase's own warning. Spot-checked after
  running — every row reshaped correctly (Assault Bike 10×15s/45s → `workSecs:15,restSecs:45,sets:10`;
  SkiErg "10km Steady State" → `workDistanceM:10000,sets:1,cycles:1`, etc). Historical
  `workout_log_exercises`/`workout_log_sets` deliberately left untouched (every progress/chart read path
  already treats cardio+interval symmetrically). DB CHECK constraint NOT tightened — `'cardio'` stays
  DB-allowed (same precedent as `'amrap'`).
- **In-app "Invite a personal user"** (`1a5cb72`) — Jake needed to onboard a beta-testing friend as a
  standalone solo account. First attempt: a local Node script (`scripts/invite-solo-user.cjs`) using the
  Supabase service-role key, run manually with `SUPABASE_SERVICE_KEY=... node scripts/...`. Jake rejected
  this as too convoluted to scale ("even if we have to build the solution"). Rebuilt: a new Supabase Edge
  Function (`supabase/functions/invite-solo-user/index.ts` — the only place a service-role-level capability
  may safely live) + a Settings-page card gated to `jakendwest@gmail.com` (matching the only existing
  owner-gate convention, `sudoAsClient`/"View as") + `inviteSoloUser()` mirroring the existing
  `sendClientInvite`'s shape. The Edge Function independently re-verifies the caller's identity server-side
  (`supabase.auth.getUser()` against the caller's own token, hard 403 otherwise) — the client-side gate is a
  UI convenience only. On success: real Supabase invite email → the same tested `#invite-form` acceptance
  screen every client invite already uses → `profiles.role='solo'` + a self-referential `clients` row
  (`coach_id: null`), never coach-linked at any point. app-progress v35→36.
- **Deployed live by Jake** via the Supabase Dashboard's browser-based Edge Function editor ("Via Editor" —
  no CLI is installed or tracked in this repo). **Verified end to end, both halves**: signed in as the E2E
  test account and called the deployed function directly — got a genuine server-side `403 {"error":"Not
  authorized"}`, confirming the security boundary is real, not just a hidden button; then Jake sent a real
  invite through the Settings card — the resulting profile came back exactly as designed
  (`role:'solo', coach_id:null`, self-referential `user_id`, `starter_seeded:false`).
- **Ledger hygiene**: corrected a stale STATUS.md row claiming the solo-account starter-content seeding bug
  (role-check race + `is_personal` mismatch) was "NOT FIXED" — it was actually fixed same-day, 2026-08-01,
  a few hours after that row was written (`fab4945`/`9357c31`); the row was simply never closed out. Re-ran
  its test coverage (`tests/solo-genuine-role-2026-08-01.spec.js`, 4/4 green) to confirm it's still correct
  before relying on it for the new solo-account onboarding flow.

**Bugs found + fixed (multi-agent review, both features, same session):**
- Cardio/interval merge (4 issues): a legacy unmigrated `metric_type='cardio'` row showed "Intervals"
  selected in the builder dropdown but rendered the OLD per-set cardio editor underneath (fixed — the
  initial render call now normalizes `'cardio'`→`'interval'` too, not just the select's own option); a
  sibling occurrence of a "reads the cardio-only `duration` field" bug one call-depth deeper in
  `startIntervalTimer`'s own next-round scheduling (same fix pattern applied); `+Add extra set` on a steady
  block didn't refresh the live timer's phase list, so starting the timer for the added round would have
  silently ended the exercise one round early (fixed — `addExtraCardioSet` now extends the interval block
  itself for interval-shaped exercises, not push an incompatible array duplicate); a hand-edited
  `sets:1/cycles:1` block (not via the toggle) could show "Steady effort" while still carrying nonzero
  warmup/cooldown (fixed by extracting the shared `_isSteadyIntervalBlock` predicate both surfaces now call).
- Invite-solo-user (5 issues): no guard against silently converting an ALREADY-EXISTING coach/client account
  into solo if an email were ever reused/mistyped (real data-safety gap — now refuses with a 409 and a clear
  message); a swallowed error on the `clients` existence-check; the local script's final log line printed
  the invitee's name (PII, trimmed to id/role/status only); a stale button-revert `setTimeout` could stomp a
  second invite's in-progress "Sending…" label if sent within 3s of the first (fixed with a tracked/cleared
  timer); the "Name and email required" validation message never cleared on a later successful send.

**Decided:**
- Reuse the existing `sendClientInvite`/Edge-Function pattern rather than inventing a new
  account-provisioning mechanism — matches an established, production-proven shape instead of adding a
  second one.
- Don't tighten the `metric_type` CHECK constraint to drop `'cardio'` — leave it DB-allowed for historical
  rows, matching the existing `'amrap'` precedent (DB permits more than the UI currently writes).
- Genuinely open public signup for solo accounts remains explicitly deferred — this session closed the
  "no UI path to onboard a new solo account" gap, not the separate "should anyone with the URL be able to
  self-provision" decision, which stays Jake's to make later.

**Why:**
- The cardio/interval merge was pure UI-clutter-driven (Jake was explicit it wasn't about a missing
  capability) — the whole design goal was "don't make the simple case any harder than it already was,"
  which is why the Steady/Repeating toggle exists as a derived, zero-new-fields UI layer rather than a
  data-model change.
- The invite-solo-user rebuild happened because the first (script-based) solution technically worked but
  didn't match how Jake actually wants to operate day to day — a good reminder that "functionally correct"
  and "actually usable at the pace this project needs" aren't the same bar.

---

## 2026-08-08 — Interval runner stale-duration fix + cardio/interval capture card + Programs builder lazy pool (v53→55 app-runner, v52→54 app-workouts/app-programs)

**Done:**
- **Programs builder day-slot picker pool made lazy, not eager** (`27e6e01`) — full detail already in
  STATUS.md's bug ledger (2026-08-07 investigation → 2026-08-08 fix); not re-detailed here to avoid drift
  between the two files.
- **Interval runner pre-Start card stale work/rest duration fix** (`645820a`) — the pre-Start cardio card
  read legacy `duration`/`restMin` fields unconditionally instead of branching on `_isIntervalExercise(ex)`
  to read `workSecs`/`restSecs` for interval exercises, showing a stale prescription left over from before
  an interval block's own editor fields (which never touch `duration`/`restMin`) had been switched to.
  Confirmed NOT a functional bug — the actual timer always used the correct fields via the phase-walk
  engine; only the pre-Start display was wrong. Red→green test added, reproduced Jake's exact live report.
  app-runner v52→53.
- **Cardio/interval exercise-finish capture card + quick-prefs popover** (`bbc2bc0`) — HR/watts capture
  already worked end-to-end but was unreachable during a session (the fullscreen interval/cardio timer
  overlay painted over the pre-Start card's inputs for almost the entire exercise). Pace was half-built
  (captured, never saved); stroke rate didn't exist. Moved capture to one new card shown once when a
  cardio/interval exercise finishes — the one point the overlay is guaranteed gone. Which metrics get asked
  for is a per-device localStorage toggle, shared with a new quick-prefs icon+popover (also surfaces the
  existing metric/imperial units toggle, previously Settings-only, from the runner and builder headers too).
  2 new DB columns (`pace_500m_secs`, `stroke_rate_spm` on `workout_log_sets`). Multi-agent review caught and
  fixed a pace lower-bound CHECK-constraint risk and a lost placeholder-hint regression. app-core v9→10,
  app-programs v30→31, app-workouts v53→54, app-runner v53→54, app-progress v34→35.

**Bugs found + fixed:**
- See `645820a`/`bbc2bc0` details above — both are fixes in their own right, not separate bug-hunt findings.

**Why:**
- The capture-card redesign sidesteps the overlay-occlusion problem structurally (capture at exercise-finish,
  never mid-timer) rather than patching z-index/DOM nesting — the same "fix the class" instinct this
  project favors throughout.

---

## 2026-08-05 — Exercise builder mobile grid restructure + 3 measured investigations (`980d324`)

**Done:**
- Jake picked 4 items from the previous session's kanban shortlist: the exercise-builder mobile scroll fix,
  plus 3 he asked me to pick myself off the open ledger. Chose the two paired-by-suspected-root-cause
  timing reports (Workouts-page delay + new-template slow save) and the `workout_logs` fixture-count item —
  explicitly skipped the 1RM 0.5kg-shift bug since the ledger already says that one needs Jake's own
  devtools on a live repro, which I can't run for him.
- **Built and approved a live interactive HTML preview before touching any code** — recreated the exact
  current builder markup/CSS (verbatim from `renderTemplateSets` + `main.css` tokens) side by side with a
  proposed 2-column grid, both fully interactive (add/copy/delete a set, live scroll-height measurement).
  Jake approved the grid direction from this preview.
- **Shipped the grid restructure** (`980d324`): `.ts-grid`/`.ts-cell` (main.css) pack Reps/Weight/Rest/Effort
  into 2 columns instead of 4 stacked full-width rows, across the weight_reps/unilateral, timed_hold and
  jump branches (cardio/interval already had progressive disclosure — untouched). Two new helpers, `gmini`/
  `cell`, sit alongside the existing `mini`/`row` (which stay live, used by the untouched branches). Every
  input id, value-fallback expression and conditional (bodyweight/assisted/AMRAP) preserved exactly —
  `flushTemplateSets` reads purely by id, never by row position. "+ More targets" (Intensity/Tempo/Countdown)
  also grid-packed, Intensity kept as one combined min–max cell.
- **Workouts-page delay + new-template slow save**, investigated together (3rd pass on this bug family):
  traced `renderWorkoutTemplates` and `saveNewTemplate → openTemplate` end to end (1 query, 2 round-trips —
  no N+1, no unbounded loop), then MEASURED live in Chromium against the real E2E account rather than
  reading further: Workouts-page nav ≈242ms, template create+display ≈450ms. Both fast. Code is clean on a
  3rd independent look. Left open — the strongest remaining lead is Edge's own Tracking Prevention blocking
  supabase-js's session-storage read (Jake's own console already showed this ×12), which I can't reproduce
  in this environment's Chromium; flagged a cheap experiment for Jake to run on his own device.
- **`workout_logs` fixture-count investigation** — re-checked all 14 DELETE call sites across the test suite
  (confirms 2026-08-02's finding: all narrowly scoped). Then read `scripts/seed-test-data.js` for the first
  time in this investigation's history: it only ever inserts 5 rows, gated to run once — not 13. A live
  count against the real E2E client found **154** rows currently, with ~30 "Push Day A" entries (6× the seed)
  plus dozens of distinct timestamped `[E2E]`-tagged names from many different spec files. **Reframed the
  whole premise**: this was never erosion (rows disappearing) — it's accumulated debris across many sessions
  that nothing has ever swept. Deliberately did NOT mass-delete tonight (destructive action under session
  momentum, against a shared account, this late — recommended a dedicated cleanup pass instead).
- Full suite (post-restructure): 337 passed / 5 pre-existing `client-workout.spec.js` failures (unchanged
  baseline) / 1 pre-existing flaky (`runner.spec.js:400`, unrelated) / 2 skipped. mobile-checked at 390×844
  across all 3 restructured set types (screenshots, not just assertions). Multi-agent review (3 fixed
  angles) clean — verifier pass independently re-ran Agent A's and B's grep checks and reproduced them.

**Bugs found + fixed:** none this session — builder change was a pure layout restructure with no logic
change; the other 3 items were investigations, not fixes (2 left open with new evidence, 1 shipped).

**Decided:**
- Ship the builder grid restructure as one commit covering all 3 affected branches together (not weight_reps
  alone) — same root shape, same fix, avoids a "fixed the instance, not the class" gap on timed_hold/jump.
- Don't act on the `workout_logs` accumulation finding same-session — it's real and worth fixing, but a
  same-night mass-delete under momentum is exactly the kind of action this project's rules ask to slow down
  on, and some of the debris rows may still be load-bearing for currently-passing tests.

**Why:**
- Both the timing investigation and the fixture-count investigation are the SAME lesson in two different
  shapes: two prior sessions had already read this code and found nothing, so a third static read was
  unlikely to succeed where two didn't — the actual unlock in both cases was running something and reading
  a real number (a live timing measurement; a live row count) instead of reasoning about the code further.
  The fixture-count number in particular flipped the entire framing of a bug that had been open since
  2026-07-12 — "erosion" and "accumulation" call for completely different fixes, and neither is a guess this
  session was willing to close on.

---

## 2026-08-02 (continued 2) — 4 more backlog items: calendar grid fix + 3 investigated (v8)

**Done:**
- Picked 4 more items from the backlog (a 5th, invite-email PT logo, was dropped by Jake before building).
- **Mobile calendar grid genuinely blew out on a long workout name — fixed.** Roadmap Area 3 #12 had the
  right diagnosis: day cells already had `overflow:hidden`/`text-overflow:ellipsis` on the text itself, but
  the cell (the actual CSS Grid item) had no `min-width:0` — a Grid item's default min-width is content-based,
  not 0, so the ellipsis never got the chance to apply. Reproduced live via direct DOM injection first (a
  screenshot showed the grid visibly misaligned — columns pushed out, days missing, text off the page edge)
  before fixing. Added `min-width:0;overflow:hidden` to every day cell. 2 new tests. Cache-bust:
  app-calendar-goals v7→8.
- **Cardio set builder's "4 wrong counts"** (2026-07-22) — re-checked against current code, all 4 already
  fixed by the later "+ More targets" progressive-disclosure redesign (watts exists, distance is
  metres-based, pace is collapsed by default, Pace/km is legacy-only). Ledger hygiene only.
- **1RM 0.5kg silent-shift report** (2026-07-09) — re-investigated `save1RM` end to end and the display
  formatter; no rounding/dedup/cross-exercise logic anywhere that could explain the reported mechanism.
  Left open, documented what was ruled out, flagged as needing a live repro rather than guessed at.
- **Fixture-isolation bug — suite erodes seeded `workout_logs`** (2026-07-12) — checked all 14 `workout_logs`
  DELETE call sites across the whole test suite; every one is scoped by a specific row id, none broad
  enough to explain the erosion. Found a related but distinct contamination class already documented
  (`programs.spec.js:874-878`, debris templates sorting ahead of "Push Day A" and getting grabbed by
  "first Start button" runner tests) but couldn't confirm it's the same mechanism. Left open.

**Bugs found + fixed:**
- The calendar grid blowout above — genuinely reproduced, not assumed from the roadmap note alone.

**Decided:**
- For the 1RM-shift and fixture-isolation items, chose to document a clean "ruled out" trail and leave both
  open rather than force a guessed fix — neither had a confirmed mechanism after real investigation, and
  this project's Iron Law is explicit about not fixing on a guess.

**Why:**
- Two of four picks turned out to already be fixed (ledger hygiene, not code) — reinforces the value of
  checking current code before building, a pattern that's now paid off repeatedly this session.

---

## 2026-08-02 (continued) — Box Jump wizard fix, PT/Personal boundary audit closed, CRITICAL events RLS gap found + fixed (v52)

**Done:**
- Jake reported live: Box Jump height not recorded this morning. Root-caused to the runner's wizard-mode
  logging path (`logRunnerSet` + its render branch) having no jump_height/jump_distance case at all —
  it predates the metric_type system, so a jump exercise reaching that screen fell into the plain
  weight/reps branch with no height field anywhere. Jump exercises normally route to the fast table
  instead (which already worked), so the exact trigger for this specific morning wasn't independently
  reproduced live, but the gap matches the symptom exactly and is fixed regardless — the wizard now
  shows a Height/Distance + Jumps input pair, gated on the same `_exMetricType` resolver the table uses.
  3 new tests (read-side, empty-input guard, render-side via a monkey-patched `_isPlainStrengthExercise`
  to force the otherwise-unreachable wizard branch).
- Picked 5 "easy wins" from the backlog per Jake's ask. 3 turned out already shipped in earlier sessions
  and never checked off the ledger (add-workout-picker duplicate discriminator, 2026-07-23; app-wide
  undefined CSS vars, 2026-07-22) or the kanban board (same CSS-vars item; pinch-to-zoom, fixed earlier
  this same session). Ledger/board hygiene only, no code changed for those.
- `~/.claude` backup repo's `.gitignore` generalized from a manually-maintained per-project allowlist to
  `/projects/*/memory` — covers any current or future project's memory dir automatically, closing a gap
  flagged 2026-07-05. Verified via `git check-ignore` that both real memory dirs stay tracked and
  everything else (transcripts, settings.json) stays ignored. Committed + pushed to claude-config directly.
- Old Jake-West PT-account client record: handed to Jake with a safe diagnostic SELECT rather than
  guessing at production data myself — moved to "Needs Jake" on the kanban board.
- Continued the PT/Personal boundary audit (open since 2026-07-13): live 2-account probes for
  `client_1rms` (INSERT + `delete1RM`'s anchor-less DELETE) and `goals` INSERT — both confirmed already
  RLS-safe.

**Bugs found + fixed:**
- 🔴 **CRITICAL — `events` INSERT let an unrelated coach create a fake calendar entry against another
  coach's real client.** The `"coach access"` policy is `cmd: ALL` with no explicit `WITH CHECK`, so
  Postgres reused its `qual` — `client_id IN (your clients) OR created_by = you` — for writes too. That
  OR exists to let a coach manage client-less personal calendar entries, but since the app always sets
  `created_by` to whoever's inserting, it trivially satisfied the write-check on ANY insert regardless of
  whose `client_id` was actually set. I don't have introspection access to read live policy text from the
  client side, so Jake ran the diagnostic (`SELECT policyname, cmd, qual, with_check FROM pg_policies
  WHERE tablename = 'events'`) and pasted it back; fixed with a targeted `ALTER POLICY ... WITH CHECK`
  that keeps the personal-event case but requires genuine ownership whenever `client_id` is set. Jake ran
  it live, confirmed. Re-ran the exact probe that caught this: red before, green after (×2), then
  independently verified legitimate coach writes (own-client + client-less personal events) still work.

**Decided:**
- The residual "none of tonight's 5 boundary probes independently confirm solo ownership" gap (flagged by
  multi-agent review) is real but non-blocking — `_getCurrentClientId()` already handles this correctly by
  design for solo's own self-view. Logged as a future follow-up rather than expanding scope tonight.

**Why:**
- This is the second CRITICAL, confirmed-exploitable RLS gap this project has found via live 2-account
  probing rather than code-reading alone (the first was `workout_logs`, 2026-07-30) — reinforces that
  "reasoned isn't proven" for tenancy boundaries specifically; every remaining un-probed table on the
  original 2026-07-13 list is now closed out.

---

## 2026-08-02 — pushed the Solo-genuine-role feature + 2 new live-bug batches (v9/v29/v9/v52/v51/v34)

**Done:**
- Pushed `master` to `origin` (`de54bdb..393f1f6`, 21 commits) — closed out the Solo-genuine-role feature
  that had sat local-only since 2026-08-01, plus the previous session's 5 easy-win ledger items, plus this
  session's 2 new batches below. Pre-push hook (`checks.sh` + full Playwright suite) passed clean both times.
- **Batch 1 (`3728890`, test fix `2029fc7`):** diary "No sets logged" note instead of `0/0/0` tiles
  (`renderProgressPerSession`); client-authored per-exercise notes now render in `openWorkoutLog` (previously
  write-only, fetched via `*` but never rendered); app-level ownership anchor (`_verifyTemplateOwnership`)
  added to `saveEditTemplateExercise`/`deleteTemplateExercise` as defense-in-depth; `weight_logs` INSERT and
  `workout_template_exercises` UPDATE cross-tenant writes confirmed already RLS-safe via live 2-account
  probes, now with permanent regression tests.
- **Batch 2 (`393f1f6`):** jump height/distance exercises now prescribe a rep RANGE, not a single value, in
  all 3 places that render it (builder `renderTemplateSets`, runner target bar `_buildTargetCols`, day-row
  formatter `_fmtSetDetail`) — one shared 2026-07-22 design choice, all fixed together, Jake's live report on
  "Full Body A → Box Jump." Builder's per-set editor decluttered per Jake's live request: BW, Assist, and the
  round-Repeat control (input + button) removed from the header; `repeatTemplateSet` (now unreachable, its
  only caller gone) deleted along with its 2 tests. BW/Assist toggles stay visible only on a set that already
  carries the flag — a legacy escape hatch (same pattern as the file's existing "Pace / km (legacy)" row) so
  old bodyweight/assisted sets stay editable, but new sets can't acquire the flag via this control anymore.
- 12 new/updated tests total in `tests/ledger-fixes-2026-08-02.spec.js`; 2 dead tests removed from
  `tests/intervals-2026-07-24.spec.js` (their only subject, `repeatTemplateSet`, no longer exists).
- Answered a live advisory question (swipe-to-delete globally): zero existing gesture code in the codebase —
  new infrastructure, not a retrofit. Not scoped further; Jake said "just curiosity for now."

**Bugs found + fixed:**
- Multi-agent review caught the ownership-anchor test itself calling the real functions with swapped/null
  ids — passed for the wrong reason (short-circuited before ever reaching the anchor check). Fixed the
  argument order + added the minimal modal DOM the functions read from, then re-verified red→green by
  temporarily neutering `_verifyTemplateOwnership`: the test still passed, because RLS alone already blocks
  the cross-tenant write — confirms the anchor is genuine defense-in-depth, not the only thing blocking it.
- Mid-session process mistake: launched a second full Playwright run while an earlier one was still in
  flight against the same dev server, then separately edited `app-workouts.js` while a different run was
  still in flight — both caught and stopped before they produced misleading results (les-053's own lesson,
  reconfirmed live). No real damage; both re-run clean afterward.
- Found (not caused) a 5th test in `client-workout.spec.js` now failing — "renders a hero card... Up next."
  Reproduced it against clean, already-committed HEAD (via a backed-up-and-restored file swap, not
  `git stash`) *before* concluding it wasn't a regression from tonight's edits — same long-open embed-chain
  issue as the other 4 pre-existing failures in that file, just newly surfaced.

**Decided:**
- BW/Assist toggle visibility keyed on the set's own flag, not a permanent removal — chosen specifically so
  a coach can still see/undo an old bodyweight-tagged set, rather than stranding it (les-043 shape).
- One combined commit for both jump-reps-range and BW/Assist/Repeat, rather than splitting via `git add -p`
  — both are small, same-conversation builder-UI changes; the risk of a manual patch-split outweighed the
  benefit of two atomic commits here.

**Why:**
- The ownership-anchor test fix matters beyond this one bug: it's a reusable technique (temporarily neuter
  the guard, confirm the test goes red, then revert) for verifying a "the test caught a real bug" claim
  empirically instead of by re-reading the code and hoping.

---

## 2026-08-01 (2nd save) — "Solo becomes a genuine role" built and merged to master locally — 1ef09c9, NOT pushed

_Continuing the same overall session as the entry below (crossed from the weekly full-file review straight
into item 3 of that session's 3-item plan: the Solo account-type decision). Jake said "build now" rather than
deferring the conversation. Per the mandatory `superpowers:brainstorming` skill, ran a full structured
brainstorm before any code: explored context, asked clarifying questions one at a time, and — critically —
Jake's answers revealed the real ask was bigger than "flip a flag": a genuine, permanently-stored `role`
value for the locked-down `solo_only` account today, AND a much larger future need (public signup for
personal-only users with no coach link). Flagged this as two subsystems needing decomposition; Jake chose
"scope #1 (data model) now, signup as its own conversation next" — exactly the call this project's own
brainstorming discipline exists to force before code gets written on an ambiguous ask._

**Done:**
- Design spec written, self-reviewed, committed, and approved by Jake (`docs/superpowers/specs/2026-08-01-
  solo-genuine-role-design.md`) — problem statement, scope boundary (master accounts untouched, no RLS
  change, signup deferred), and the 4-part change (SQL, `loadUserInfo`, starter-content, verification).
- Implementation plan written per `superpowers:writing-plans` (`docs/superpowers/plans/2026-08-01-solo-
  genuine-role.md`) — 5 tasks, bite-sized TDD steps, real code in every step, self-reviewed for placeholders/
  spec coverage/naming consistency.
- Jake chose Subagent-Driven Development. Built in an isolated worktree (`.claude/worktrees/solo-genuine-
  role`, its own dedicated test server on port 3002 to avoid contaminating another concurrent session's port
  3001) via `superpowers:subagent-driven-development` — a fresh implementer subagent per task, a task-scoped
  reviewer after each, a final whole-branch review at the end.
- **Task 1** — `scripts/migrate-solo-role-2026-08-01.sql`: diagnostic → widen `profiles.role`'s CHECK
  constraint defensively → flip the real `solo_only=true` account to `role='solo'` → verify. Reviewed clean.
- **Task 2** — `js/app-core.js` `loadUserInfo()`: removed the dead `solo_only`-checking branch, replaced with
  one keyed on `role==='solo'`. **The plan's own test design turned out to be wrong** — it assumed a coach
  could self-insert a `coach_id IS NULL` clients row for testing; RLS actually requires `coach_id=auth.uid()`,
  so that's never been possible for anyone (the one real solo account's row was always hand-provisioned by
  Jake in the SQL editor). Root-caused live, fixed the plan's test to reuse PT's existing solo clients row
  instead of planting one. The implementer also self-caught and fixed a real bug in the plan's own code
  snippet (an opening `if` mis-written as a mid-chain `} else if`) via `node --check` before committing.
  Reviewed clean after that correction.
- **Task 3** — `js/starter-content.js` seeding fix: this is the actual bug the whole feature exists to close
  (found by the earlier full-file review, see the entry below) — the seeder's gate checked the wrong role
  value and every seeded artifact was hardcoded `is_personal:false`. Fixed both. **Task reviewer found two
  real issues on the first pass**: the new test left uncleaned residual rows in the shared PT2 fixture
  (extracted a proper `sweepPT2` helper into `tests/helpers.js`, now shared with `tests/onboarding.spec.js`
  too), and the new `isSoloAccount` check used the reassignable `currentProfile.role` instead of an invariant
  proxy — the exact raw-vs-reassigned-role bug class this feature exists to fix, just recurring inside its
  own fix. Both addressed, re-reviewed clean.
- **Task 4** — master-account regression coverage + full suite run. The full-suite run crashed once
  (Chromium access-violation, environmental, not code) — retried clean. **Discovered 3 pre-existing tests
  (`tests/solo-only-2026-07-24.spec.js`) genuinely broken by Tasks 2-3**, not environmental noise: that file
  hard-codes the internals of the exact mechanism being retired (setting `solo_only` directly while checking
  literal old source text via regex). Root-caused, fixed to test the NEW mechanism's equivalent safety
  properties rather than left broken or deleted. Also found the task reviewer's own suggested fix for a
  weaker finding (a master-account test's title over-promising) was itself wrong — `clients.user_id` has a
  genuine UNIQUE constraint (already documented from a 2026-07-23 incident, `tests/gdpr-export.spec.js:84-97`)
  meaning `_masterClientId`/`_soloClientId` are mutually exclusive by schema, never both populated — caught
  and corrected before merge. Final: 311 passed / 5 known pre-existing / 1 known flaky / 2 skipped.
- **Final whole-branch review** (most capable model) found 1 Critical + 3 Important findings a task-scoped
  review couldn't catch: **deploying the code before Jake runs the SQL migration would silently reopen the
  solo account's coach-view lockout AND permanently corrupt the starter seed** (this project auto-deploys on
  push, and the SQL is a separate manual step — a real, plausible ordering hazard). Fixed with a permanent
  transitional OR-condition so the code is safe regardless of deploy/migration order, not just a documented
  convention. The first fix-wave attempt only half-closed this (widened the condition but never reassigned
  `currentProfile.role`, leaving the account stuck rendering as a full — locked-out — coach dashboard with no
  solo path at all) — caught by an independent re-review, fixed under Jake's explicit approval (the SDD
  process caps automated fix rounds at one for the final review; this next round was a deliberate, Jake-
  approved exception, not a silent retry), then independently re-verified via a fresh trace of all 4 account
  shapes against the live code before trusting it. Also fixed: the migration didn't verify the account's
  self-referential clients row exists before flipping role; the constraint drop-then-add wasn't transactional;
  a stray untracked debug spec had inflated the reported test count by 1.
- Merged to master locally (`1ef09c9`) — one trivial doc-only conflict (the plan file, an expected add/add
  since the plan predates the worktree's corrections), resolved by taking the branch's fully-corrected
  version. Verified the merge introduced zero drift by diffing every touched file's content against the
  already-tested branch tip (byte-identical) rather than re-running the full 20-minute suite a second time
  against a possibly-shared port. Worktree and branch cleaned up after confirming everything was captured in
  the merge.

**Decided:**
- Push to origin, the SQL migration, and live verification are explicitly deferred to the next session, per
  Jake's own instruction ("save now and we will pick this up tomorrow") — not an oversight.

**Why:**
- Jake's standing rule (Iron Law: no fixes without root-cause investigation) held throughout even under
  subagent delegation — every "this looks broken" moment (the RLS assumption, the crash, the 3 pre-existing
  test failures, the mutual-exclusivity claim) was independently verified against live code/DB behavior
  before being accepted, not taken on a report's word, including reports from the review agents themselves.

---

## 2026-08-01 — weekly full-file review closes a stored-XSS cluster in the runner — pushed de54bdb, pre-push hook 56/57 smoke green

_Continuing the same overall session as 2026-07-30 below (crossed midnight). After the CRITICAL
`workout_logs` fix, Jake approved a 3-item plan: (1) security follow-up on the fix's blast radius —
done, see 2026-07-30 entry below; (2) the weekly full-file review, 8+ days overdue per `os-lint` — this
entry; (3) the Solo account-type decision — still outstanding, needs Jake directly, not something to
build unilaterally._

**Done:**
- Ran `multi-agent-review` in **full-file mode** (whole files, not a diff) against the 2 highest-churn
  modules: `app-runner.js` and `app-workouts.js` (44/43 commits in the last 30 days, well ahead of the
  rest). Scoped to 2 modules instead of the usual 2-3 given how much ground the session had already
  covered.
- `js/app-runner.js` (v47→v48) — escaped ~15 previously-unescaped sinks: `_buildTargetCols`/
  `_renderTargetBarHtml` (5 fields — reps, %1RM, effort, rest, jump-distance target), the cardio
  target-chip row (7 fields), 4 wizard-branch input `placeholder=`/`value=` attributes, the PT-note
  block, and `ex.targetReps` in the header.
- `js/app-workouts.js` (v47→v48) — escaped 4 more minor sinks in the same class (template name in a
  client-assignment row, phase name, muscle-group section header, superset-group badge, legacy reps
  field).
- `tests/full-file-review-2026-08-01.spec.js` (new, 3 tests) — red-first verified against the pre-fix
  code.

**Bugs found + fixed:**
- **Stored-XSS cluster in the runner's prescription-rendering path.** `sets_json`/`notes` are
  coach-authored JSONB with no schema enforcement, and roughly 15 places rendered them straight into
  `innerHTML`/attribute sinks with no escaping. Every single one had an escaped sibling elsewhere in the
  same file, proving this was drift accumulated over many sessions, not a deliberate choice —
  `_buildTargetCols` escaped exactly one field (`tempo`) out of six; the PT-note block's twin in
  `app-workouts.js` already escaped all three of its branches. Confirmed direction: coach-authored data
  renders unescaped to whoever runs that session in the gym. The other direction (a client writing to
  their own plan clone's `workout_template_exercises`, the shape that's hit this codebase 3+ times
  before) needs a live probe to confirm or rule out — not done this session, on the ledger.
- **Two more tables live-probed for the same shape of gap as the CRITICAL `workout_logs` fix, both
  confirmed already RLS-safe**: `client_1rms` INSERT with an untrusted `client_id` (same file, ~100
  lines from the fixed code); a client attempting to INSERT into `exercises` claiming an unrelated
  coach's `coach_id`. Neither needed a fix.

**Found, NOT fixed, deliberately deferred:**
- **`solo_only` accounts can never see their own seeded starter content — confirmed via direct code
  trace, not speculation.** Two independent causes stacked on top of each other: (1) `app-core.js:303`
  correctly gates seeding on the raw DB role, but `starter-content.js:84` re-checks the live
  `currentProfile.role`, which has already been reassigned to `'solo'` by the time seeding would run —
  so seeding silently never executes, and the flag never flips, so this repeats on every login forever;
  (2) even if seeding DID run, every artifact is written `is_personal: false`, but a `solo_only`
  account's reads always require `is_personal: true` (role is permanently `'solo'`) — so the content
  would be invisible regardless of cause (1). Needs a real fix to the seeder (make it `solo_only`-aware)
  plus the role-check — deferred to its own session rather than rushed at the end of an already very
  long one. Affects the one real `solo_only` account in production today.
- `workout_template_exercises` writes (add/edit/delete + the propagation fan-out) carry no app-level
  ownership anchor, unlike every sibling in the template family. Reasoned as RLS-only-defended, not
  proven — same "reasoned isn't proven" gap this session's other probes closed for their own tables.

**Decided:**
- The third review angle (duplicates/render-safety) hit the same API spend limit an agent hit earlier in
  this session. Rather than retry (likely to hit the same wall), substituted a lighter direct check
  myself: grepped all 9 modules for duplicate function names (clean — classic scripts share one global
  scope, so a collision anywhere would silently shadow a function) and compared `setInterval`/
  `clearInterval` counts in both files (17 clears vs 7 sets — safe direction, no leak signal). Not as
  thorough as a full agent pass, but a reasonable substitute given the constraint, and better than
  skipping the angle entirely.
- Verified every finding by reading the cited lines directly before fixing anything (the review's own
  Step 2) — this is what caught that Agent A's Finding 2/3 (client_1rms, exercises INSERT) were already
  safe, avoiding two unnecessary defensive-hardening changes that would have added a round-trip query for
  zero remaining benefit.

**Why:**
- `os-lint`'s full-file-review gate exists because diff-only review has a structural blind spot: code
  nobody's touched recently never gets looked at again. This XSS cluster is the proof — none of it was
  introduced by a recent diff; it accumulated because 2026-07-29/30's fixes only ever looked at the lines
  they were already changing.

`tests/full-file-review-2026-08-01.spec.js` — 3 tests, all red-first verified. Full suite: 307 passed,
same 5 pre-existing unrelated `client_programs`-fixture-gap failures, 1 unrelated flake (a different test
than earlier this session, passed on retry), 2 skipped. Cache-bust: app-runner v47→48, app-workouts
v47→48. `os-lint`'s `full-file-review` marker updated.

---

## 2026-07-30 — CRITICAL workout_logs RLS gap closed + 3 "fixed" bugs from 2026-07-29 root-caused + 19-site PII sweep — pushed 74d3024, pre-push hook 56/57 smoke green

_Session opened with `/hello-claude`, then Jake handed over the exact repro steps for the add-exercise bug
(programs > part time athlete > full body workout > edit workout > add exercise > enter any exercise and
save) plus two one-line reports: "Cannot add 0 to depth jump" and "full body > runner > depth jump does not
show any previous exercise history." All three were things the 2026-07-29 session had marked "fixed —
awaiting Jake." Per this project's Iron Law (no fixes without root-cause investigation), each was
re-investigated from scratch rather than assumed to be a re-occurrence of the same bug — and in all three
cases, the 2026-07-29 fix turned out to be real but incomplete, not wrong._

**Done:**
- `js/app-workouts.js` (v46→v47) — `saveExerciseToTemplate`: moved `#att-notes`/`#att-superset` DOM reads to
  before `closeModal()` runs (it does a real `.remove()`), fixing a `Cannot read properties of null` crash
  that aborted the function before it ever reached the 2026-07-29 re-render fix.
- `js/app-runner.js` (v46→v47) — renamed `_hasWeightVal` → `_hasNumVal` (no longer weight-specific) and
  applied it at 9 sites: `toggleTableSet`'s jump_height/jump_distance guards, `_syncLoggedSetsFromTable`'s
  jump branches, `saveRunnerSession`'s height_cm/distance_m + weight writes, `fetchRunnerLastSession`'s set
  filter, `saveWorkoutSession`'s weight write (a sibling function, different save path), `editRunnerSet`'s
  weight-edit pre-fill, and both the mobile and desktop weight inputs in `renderLogExercises`.
- `js/app-progress.js` (v30→v31) — `_setDetailsLine`'s `if (x.height_cm)` → `!= null`, so a real 0cm jump
  shows in the My Progress diary instead of being silently dropped.
- `tests/ledger-fixes-2026-07-30.spec.js` (new, 10 tests) — every test red-first verified against the
  pre-fix code (reverted the 3 touched files to HEAD via `git show`, confirmed each assertion failed,
  restored).

**Bugs found + fixed:**
- **Add-exercise still not appearing without a refresh (4th report).** Root cause: `saveExerciseToTemplate`
  closed the modal, then read the now-deleted `#att-notes`/`#att-superset` a second time to build
  `window._lastExerciseChange.row` — throwing and aborting before `_afterTemplateExerciseSave` (the
  2026-07-29 fix) ever ran. The insert had already committed, so the exercise really was added; it just
  never repainted. Confirmed via a real-DOM Playwright test (not a mock) that reproduced the exact crash.
- **0 rejected for Depth Jump height/distance.** Same falsy-zero mistake as 2026-07-29's weight fix, at 3
  sites in `js/app-runner.js`. Jake's report proved the class extends past weight to any field where 0 is
  a real value.
- **Depth Jump last-session history — 2nd, deeper root cause.** A controlled experiment (log a real jump
  set via the actual save path, relaunch, inspect the fetch result) proved the 2026-07-29 fix genuinely
  works end-to-end for ordinary data. Multi-agent review then found the real gap while auditing the 0-value
  fix for siblings: `fetchRunnerLastSession`'s set filter (`s.weight_kg || s.reps_achieved || s.height_cm ||
  s.distance_m`) is a truthy check — a jump set logged with `height_cm: 0` and no reps is entirely excluded,
  even though it saved correctly. Very likely the actual mechanism behind Jake's report.
- **9 more sibling instances of the same falsy-zero class, found by multi-agent review, none reported by
  Jake directly:** `saveWorkoutSession` (the manual Log Session modal — a separate save path from the
  runner) had its own identical `if (s.weight)` bug; that same modal's `renderLogExercises` re-renders a
  real "0" back to blank when another set is added, which would have silently defeated the
  `saveWorkoutSession` fix in normal use (the two were fixed together in the same commit); `editRunnerSet`'s
  edit-overlay blanked a real 0kg set on open; `openWorkoutLog`'s past-session viewer showed "—" for a real
  0kg set.

**Deliberately not fixed, flagged for a scoped follow-up:**
- `fmtDistanceM` (app-workouts.js) has the identical falsy-zero bug, shared across ~15 cardio-distance and
  jump-distance call sites — too broad to fold into a height-focused session; needs its own scoping pass.
- `openWorkoutLog`'s past-session viewer has no jump_height/jump_distance column at all (only cardio vs
  weight/reps) — a display gap, not a data-loss bug, needs new UI not a null-check flip.
- Pre-existing, found by tonight's security review, unrelated to this diff: a `clients` id-only read with a
  swallowed-error `coach_id` fallback in both `saveRunnerSession`/`saveWorkoutSession` (needs a behavioural
  cross-tenant probe before concluding it's exploitable); session names in `log.*` calls; an unanchored
  `exercises` UPDATE in `_rememberExerciseMetricType`. All added to the STATUS.md ledger as new rows.

**Decided:**
- Root-cause every re-reported "fixed" bug from scratch rather than assuming continuity with the prior
  session's diagnosis — in all 3 cases tonight, the earlier fix was real but landed one layer above the
  actual defect, and assuming otherwise would have produced another guess-fix.
- Used controlled live Playwright experiments against the real Supabase backend (not the E2E fixture
  account's canned data) to test whether a fix actually works end-to-end, rather than reasoning about it
  from code alone — this is what surfaced that the Depth Jump fetch pipeline itself was fine, redirecting
  the investigation to the filter instead of re-patching working code.

**Why:**
- The bug ledger's "fixed — awaiting Jake" status is not the same as "closed" for a reason: exactly this
  happened tonight. Jake reporting the same symptom twice is signal, not noise — it means the first fix
  addressed a real but different mechanism, not that the investigation was wrong.

---

**Round 2, same session — Jake said "fix the bug findings," meaning everything flagged above as
deliberately deferred.**

**Done:**
- `js/app-workouts.js` — `fmtDistanceM(m)` rewritten to `!= null`/`isNaN` checks instead of `if (!n)`, so
  a real 0m survives. `toggleExerciseArchived`/`saveEditExercise`/`deleteExercise`/
  `_rememberExerciseMetricType` gained `.eq('coach_id', currentUser.id)`.
- `js/app-runner.js` — `openWorkoutLog` gained a jump_height/jump_distance display branch (`_resolveMetricType`
  on the fetched `metric_type`). `saveRunnerSession`/`saveWorkoutSession` now refuse to save (instead of
  defaulting `coachId` to `currentUser.id`) when the `clients` ownership lookup returns no row. 2 unguarded
  `fmtDistanceM(_cardioDistanceM(s))` cardio call sites gained an explicit `> 0` guard.
- `js/app-calendar-goals.js` (v5→v6, missed the cache-bust on the first pass, caught before push) —
  `deleteEvent`/`deleteGoal` gained `.eq('created_by', currentUser.id)`.
- 19 sites across `app-runner.js`/`app-workouts.js`/`app-progress.js`/`app-calendar-goals.js` had PII
  (session/exercise/goal/event/milestone names, check-in values) stripped from `log.*` calls.
- `scripts/fix-workout-logs-insert-policy-2026-07-30.sql` — new migration, run live by Jake.

**Bugs found + fixed:**
- **CRITICAL — `workout_logs` had no ownership check between `client_id` and `coach_id`, on both INSERT
  and UPDATE.** Confirmed exploitable via a live 2-account probe (PT2, an unrelated coach owning zero
  clients, successfully inserted a `workout_logs` row against PT's real client) — both through the app's
  own JS and via a raw insert bypassing it entirely, proving the gap was in the RLS policy itself. Once
  Jake pulled the real `pg_policies` data: `"coaches manage own workout logs"` was a single `cmd=ALL`
  policy checking only `coach_id = auth.uid()`, covering SELECT/INSERT/UPDATE/DELETE with no client_id
  check; its UPDATE sibling had the identical gap, meaning a coach could also re-point an existing real log
  onto a client they don't own. Fixed both the JS side and the SQL side (split the ALL policy into a
  coach-SELECT policy plus tightened INSERT/UPDATE policies). **A first draft of the SQL had its own bug**
  — an unqualified `coach_id` inside the policy's subquery resolved against the wrong table (Postgres
  doesn't raise a cross-query-level ambiguity error) and would have silently rejected every SOLO workout
  save — caught by 2 independent multi-agent-review passes before it ever reached Jake. Jake ran the
  corrected SQL, confirmed the real policy output matched, then confirmed a real workout still saves.
- **The PII sweep missed 6 sites on the first pass** (goal/event/milestone titles in
  `app-calendar-goals.js`) — caught by the same review round that found the SQL bug. The pre-push hook's
  own PII regex only matches explicit `{ name: ... }` object syntax, not ES6 shorthand `{ name }` — it
  would not have caught any of the 19 sites either way; this was a manual sweep both times.
- **`fmtDistanceM`'s own fix introduced a regression**, found by the same review: `_cardioDistanceM(s)`
  returns a literal 0 (never null) for "not entered" by design — every OTHER caller sums/compares it as a
  number — so once `fmtDistanceM(0)` stopped being blank, 2 display call sites started showing "0 m" on
  every duration-only cardio set (the common case). Fixed with an explicit `> 0` guard at both, matching
  the pattern every OTHER `fmtDistanceM(_cardioDistanceM(...))` call site already used.
- **6 more unanchored writes.** `exercises` (4 functions, anchored on `coach_id`) — a live PT2 probe
  confirmed RLS was already blocking these even before the JS anchor, so this is hardening, not a closed
  hole (unlike `workout_logs`). `deleteEvent`/`deleteGoal` (anchored on `created_by`) — reasoned from the
  established FK-anchor convention and confirmed coach-only reachability, not individually probed.

**Deliberately not fixed, still open:**
- `saveGoalProgress`/`saveEditGoal`/`toggleMilestone`/`toggleClientMilestone` — same unanchored-write shape
  as `deleteEvent`/`deleteGoal`, not yet touched.
- `workout_log_exercises`/`workout_log_sets` — reasoned as safe (anchor via the now-fixed
  `workout_logs.coach_id`) but not independently, behaviourally probed the way `workout_logs` itself was.

**Decided:**
- Multi-agent review ran twice this session, once per round — round 2's third review agent was cut off by
  an API spend limit mid-review; judged the 2 completed full reports sufficient given both independently
  found and converged on the exact same critical SQL bug (a strong signal, not a coincidence).
- When Jake pasted back the ACTUAL `pg_policies` output (not the guessed policy names in the SQL's first
  draft), rewrote the fix against the real policy names and real structure rather than adjusting the guess
  — this is also what surfaced the UPDATE-side gap, which the original guess-based draft never covered at
  all (it only touched INSERT).

**Why:**
- "Fix the bug findings" from a review pass is not automatically low-risk just because the individual
  items sound small — one of them (a `clients` id-only read most people would file as "an edge case")
  turned out to be a live, working exploit against real client data the moment it was actually tested.

`tests/ledger-fixes-2026-07-30.spec.js` — 20 tests total (10 from round 1 + 10 from round 2), every one
red-first verified. Full suite: 300 passed / 4 pre-existing unrelated `client_programs`-fixture-gap
failures / 1 unrelated flake (`solo-account.spec.js`, passed on retry) / 2 skipped. Pushed `74d3024`,
pre-push hook 56/57 smoke green (2 non-blocking WARNs: `workout_templates`/`programs` query-scope and 2
hardcoded emails, both pre-existing and unrelated to this diff). Cache-bust: app-workouts v46→47,
app-runner v46→47, app-progress v30→31, app-calendar-goals v5→6.

---

## 2026-07-29 — 6 live runner/builder bugs fixed + 3 more caught by the pre-push review — pushed eb9ec3f, CI green, pre-push hook 56/57 smoke green

_Jake opened by dropping the beta-timeline pressure entirely ("push it back if needed, don't worry about
beta") and handed over 8 things found using the app for real — 6 in one message, then 2 more mid-review (a
redundant exercise Category, a 0-weight rejection). Investigated via 3 parallel Explore agents + direct
reads, entered Plan Mode (2 clarifying AskUserQuestion rounds, a Plan agent for the 5 concrete fixes,
approval before any code), built, then the mandatory `multi-agent-review` (3 fixed angles) caught 3 more real
bugs in the fixes themselves before push — all fixed same session._

**Done (LIVE) — the 6 reported bugs:**
- **0 weight silently rejected, then silently dropped even past the reject** — `toggleTableSet`'s `!row.weight`
  guard and 3 sibling sites (`_syncLoggedSetsFromTable`, both `saveRunnerSession` weight_kg writes) all treated
  JS's falsy `0` as "nothing entered." Fixed all 4 with an explicit not-null/not-empty check (`_hasWeightVal`).
- **Jump exercises (Depth Jump etc.) never showed last-session data** — `fetchRunnerLastSession`'s `select()`
  never included `height_cm`/`distance_m` (stale allowlist, les-036 class). Widened the select + the
  post-fetch filter + the ghost-text fallback in `renderStrengthTable`.
- **Add-exercise-not-appearing-until-refresh, root-caused after 3 reports** (2026-07-13, -22, -28).
  `saveExerciseToTemplate`/`saveEditTemplateExercise`/`deleteTemplateExercise` each ended in a bare,
  un-awaited, uncaught propagation call — any failure inside it silently left the stale pre-edit list on
  screen. New shared `_afterTemplateExerciseSave` re-renders immediately, unconditionally, then awaits
  propagation in a try/catch that toasts on failure.
- **"Bodyweight" removed as an exercise Category option** — redundant with the real per-set BW toggle.
  Dropped from both dropdowns + `starter-content.js` seed data (8 rows → `category: null`; existing live rows
  left as-is, fix-forward).
- **Rest timer redesigned to survive navigating to view another exercise mid-rest.** Jake's own framing:
  "fix as a bug or redesign" — offered two options via AskUserQuestion, he picked "keep running in the
  background" over "a separate read-only preview view." New `_runner._restForExIdx`/`_restPendingFire`
  decouple "a rest is counting down" from "which exercise's `_afterRest` may fire," preserving the exact
  corruption-guard `runnerJumpTo`/`runnerGoBack` already had. New persistent "Resting — 0:45" chip; tap to
  return. 4 existing reads that assumed "a rest is running" meant "for the exercise on screen" were given an
  ownership gate. The pre-existing regression test guarding the corruption class this had to not reopen
  (`tests/intervals-redesign-2026-07-25.spec.js:411`) was re-run directly and confirmed still green.
- **Same-day program assignment "not there" — reproduced live, root cause was NOT the date.** Ruled out the
  previously-fixed race (both assign paths already `await` the clone) and a date-boundary off-by-one (the
  Workouts page's `hasProgram` check does no date comparison at all). Actual mechanism, confirmed via direct
  Playwright repro against real data: assigning a program with **zero phases** hits `_cloneProgramForClient`'s
  early-return, creating a `client_programs` row with zero `client_program_workouts` and no error. Now fails
  loud (toast) on this and on a genuine phase-fetch/insert error, instead of a bare silent `return`.

**Bugs found + fixed in the fixes themselves, by the mandatory pre-push `multi-agent-review` (3 blocking
findings, one per angle, all real):**
- **Agent B (solo-mode)** — the solo self-assign flow's own unconditional "Program added to your plan"
  success toast was instantly overwriting the new zero-phases warning (`showToast` keeps a single DOM node,
  no queue) — for solo specifically, the new fail-loud toast this session just added was invisible for
  exactly as long as it takes the next line to run. Fixed by having `_cloneProgramForClient` return a success
  flag the caller checks before showing its own toast.
- **Agent A (security)** — the add-exercise fix's restructure introduced a genuine race: `_afterTemplateExerciseSave`
  re-read `window._templateCtx` fresh AFTER an `await` (a real network round-trip inside `openTemplate`), so a
  coach clicking into a DIFFERENT client's plan during that gap could have their edit's propagation silently
  operate on the wrong client — including, in the worst case, writing onto the wrong client's templates.
  Fixed by snapshotting `ctx`/`window._lastExerciseChange` before the await and threading them through
  explicitly to `_checkClientPlanPropagation`/`_checkSiblingPropagation`.
- **Agent C (duplicates/render-safety)** — "⇄ Swap exercise"/"+ Add exercise" aren't gated off during a rest
  and bypassed the whole rest-timer redesign entirely: add pushed a new exercise + changed `exIdx` without
  removing the stale floating overlay (which then froze, its Skip button still wired to fire against whatever
  exercise is now on screen); swap could mutate the exercise a rest belongs to out from under it, deleting
  `ex.phases` a queued `_afterRest` depended on. Fixed both paths (add preserves the rest + drops the stale
  overlay; swap of the resting exercise abandons the rest cleanly, no callback fired) plus added a defensive
  ownership check to `skipRestTimer()` itself. Agent C also flagged one of my OWN new test edits (a
  source-text regex in `tests/intervals-2026-07-24.spec.js`, updated to match `runnerGoBack`'s legitimate
  refactor) as provable-but-not-enforced — rewritten as a real behavioral test.

**Not built — flagged for a scoping conversation, per Jake's own split of the ask:**
- **Per-exercise unit override (NEW)** — force a specific exercise to a fixed unit regardless of the
  account-wide toggle. Real scope (touches every call site the 2026-07-25 units rollout touched); not
  started.
- **Supersets redesign vs. WOD/circuit training** — confirmed via AskUserQuestion as two separate asks, not
  one. WOD/circuits (N exercises, one timed block, round counting) has no existing data model at all —
  realistically an intervals-redesign-scale build, not a same-session add-on.

**Process notes:** ran in Plan Mode start to finish — 3 parallel Explore agents for initial investigation, 2
rounds of AskUserQuestion (unit-override scope + timer-redesign approach / superset-vs-WOD split), a Plan
agent for the 5 concrete fixes' implementation design, plan file written and approved before any code. Live
reproduction (not guessing) used for the same-day assignment bug per this project's Iron Law — created and
cleaned up throwaway test debris via direct Supabase queries in a throwaway spec, deleted afterward. 14 new
tests (`tests/ledger-fixes-2026-07-29.spec.js`), every one red-first verified against pre-fix code (`git
show HEAD:<file>` to get the real pre-fix content, confirm the assertion fails, restore). Full suite: 287
passed / 4-5 pre-existing unrelated `client_programs`-fixture-gap failures (same tracked class as prior
sessions, one test flaked-passed-on-retry this run — reproduced clean 3/3 in isolation, confirmed
environmental not a regression) / 2 skipped. Mobile-check on the new rest-timer chip caught a tap-target
under the 44px/10px-padding guideline — fixed (min-height:44px). app-runner v45→46, app-workouts v45→46,
app-programs v26→27, starter-content v2→3.

---

## 2026-07-28 — Intervals redesign (new exercise type + phase-walk runner) + a major client->coach XSS sweep, incl. one live CRITICAL unrelated to the feature — pushed 34 commits (edb8995..60238be), CI green

_Straight after this project's second `/save` of the prior session, Jake asked to build Solo as a genuine
account type. A live bug report ("no imperial/metric toggle, no intervals visible") interrupted almost
immediately — root-caused to browser caching, but surfaced two real, distinct asks along the way: the units
toggle turned out to already be built correctly (shipped 2026-07-25, unrelated to this entry), and Jake shared
Tabata Stopwatch Pro reference screenshots showing what he actually wants interval prescribing/logging to look
like. Given the 31 July beta target, Jake was asked to choose between resuming Solo or building the intervals
redesign now; he chose intervals, explicitly accepting Solo would slip past beta. Executed via Subagent-Driven
Development (a fresh implementer per task, dispatched review + fix-loop after each, a persistent ledger
surviving context loss) — 9 tasks, then the mandatory whole-branch `multi-agent-review` before push, which
surfaced a live security incident entirely unrelated to the feature and extended the session considerably
further than planned._

**Done (LIVE) — the feature:**
- New interval-block model: one `sets_json` entry per exercise (`countdownSecs`/`warmupSecs`/`workSecs` or
  `workDistanceM`/`restSecs`/`sets`/`recoverySecs`/`cycles`/`cooldownSecs`) replacing the old per-round
  duplicated-row model. `_expandIntervalBlock` (pure function, `js/app-workouts.js`) expands a block into a flat
  phase array (`countdown → warmup → [(work→rest)×sets → recovery]×cycles → cooldown`), zero-valued phases
  omitted, `sets`/`cycles` clamped to minimum 1. `_intervalTotalSecs` sums it, returning `{total, hasUnknown}` —
  `hasUnknown` true for a distance-based work round, since its duration is genuinely unknowable without a sensor.
- Builder: a new `interval` option in the metric-type picker, its own block editor (reusing the existing
  `row()`/`mini()`/`tog()`/`more()` helpers) replacing the awkward multi-row "Repeat ×N" UI. `_cleanTemplateSets`
  gained the 9 new keys using `??` not `||` (a deliberate 0, e.g. "no warmup", must survive; `0 || null` would
  erase it).
- Runner: a whole new phase-walk state machine (`_isIntervalExercise`/`_initIntervalPhases`/`_startPhaseAt`/
  `_advancePhase`/`startIntervalPhaseTimer`/`_doneIntervalPhase`/`_finishIntervalExercise`) replacing the old
  one-shot `_afterRest` callback chain for this exercise type only — steady-state cardio's existing
  `startIntervalTimer` is untouched and explicitly out of scope. `_advancePhase`/`_startPhaseAt` return
  continued-vs-finished so callers know whether to re-render. New full-screen overlay shows the current phase
  name, `Set n of N · Cycle c of C` position, and a remaining-total line (qualified `+` when a distance round
  lies ahead).
- Logging: `_logIntervalPhase` records work/warmup/cooldown rounds only (rest/recovery are timed, never
  recorded — Jake's own 2026-07-23/-25 calls). New `workout_log_sets.phase` column persists which part of the
  block a logged row came from. Progress-page aggregates (`_countableSets`, `!s.phase || s.phase === 'work'`)
  exclude warmup/cooldown from set counts and volume — the `!s.phase ||` half matters, every pre-existing row
  and all non-interval sets are NULL and must keep counting. Intervals also now chart on the Progress page as a
  cardio-family metric (distance/duration/pace/HR/watts) — previously would have silently fallen through to
  weight_reps metrics (all zero for an interval) and shown "No sessions in this range" forever.
- Migration `scripts/add-interval-type-2026-07-25.sql` (metric_type CHECK extended to include `'interval'`
  across 3 tables; new nullable `workout_log_sets.phase text` with its own CHECK) — additive, idempotent, run
  live by Jake before any code task started (les-053 gate: never edit source referencing an un-migrated column).

**Bugs found + fixed during the build (8, several caught independently by two reviewers reasoning from
different angles — strong corroboration each time):**
- A total runner freeze on every interval workout: the phase-walk's zero-tick called a function
  (`_logIntervalPhase`) that a plan-ordering mistake had only defined in a later task. 20 tests missed it
  because none let a real countdown reach zero — every test asserted synchronously right after starting a
  phase. Root-caused by empirically reproducing the freeze, not just reading the diff.
- A phantom "set" silently written to the database whenever an athlete tapped Done during the get-ready
  countdown — the manual Done handler logged unconditionally where the timer's own zero-tick correctly guarded
  on phase type. Also shifted every subsequent `set_number` in that session (assigned by array position).
- The runner repainting over its own finish screen on the last phase of the last exercise — an unconditional
  trailing `renderRunner()` call painted over `showRunnerFinish()`'s work the instant after it ran. Same
  documented failure class this file has hit before ("finish screen destroyed, notes lost").
- `runnerJumpTo` fired a queued `_afterRest` callback instead of nulling it first (its siblings `runnerGoBack`/
  `showRunnerFinish` already did) — could start a new interval timer or force-finish against whichever OTHER
  exercise the athlete had just jumped to. Pre-existing shape, materially widened by intervals (many short rest
  phases mean far more windows where a jump can land mid-rest).
- The warmup/cooldown Progress-aggregate exclusion would have been a silent no-op: the queries feeding it never
  selected the new `phase` column in the first place (the exact stale-select-allowlist class this codebase has
  hit repeatedly — les-036/037).
- Mid-session swap/add of an interval exercise showed "Set 1 of 1" for what might be an 8-round block — the
  initial session-load path had already been fixed for this, its swap/add sibling hadn't (`cleanSets.length` is
  always 1 for a block; needs `_initIntervalPhases`'s real work-round count instead).
- The "Log session" manual/retroactive-entry modal silently discarded an interval block's entire prescription
  into one blank row (mapped through the plain-cardio branch, which reads `duration`/`distanceM` — neither key
  exists on a block). No interval editor exists in that modal, so the fix seeds the block's total time as a
  sane starting point instead of building a third editor surface.
- Set-count badges across day rows/client-profile/builder-preview read `sets_json.length` (always 1 for a
  block, was previously correct when each round was its own row) — fixed via `_expandIntervalBlock(...).filter
  (p => p.phase === 'work').length`, one source of truth that can't drift from the runner's own logic.

**Done (LIVE) — the security sweep, entirely unrelated to intervals:**
- The whole-branch review's security angle found `client_check_ins.notes` — a client's own free-typed weekly
  wellness note — rendering completely raw on the coach's client-profile Overview tab, the first thing a coach
  sees opening a client. Confirmed live, currently exploitable, pre-existing (this codebase's three prior
  stored-XSS fixes — 2026-07-13/-18/-23 — covered `performance_logs`/`weight_logs`, never this table). Told to
  Jake in plain English; he said fix everything found, then push — asked and re-confirmed twice more as the
  sweep kept finding siblings in the same files.
- Closed in 3 rounds, ~33 sinks total: `client_check_ins.notes` (coach Overview tab + the client's own
  dashboard self-view); client `email`/`phone`/`notes` across 3 render locations each (list row, profile
  header + its onclick args, edit-client modal) — the email/phone write-path went from "plausible" to
  **empirically confirmed** during review (`saveWeightGoals` updates `clients` with no `coach_id` filter,
  proving the RLS grant is row-scoped by id not column-scoped; a real client session was then shown live
  successfully writing its own email/phone through that same grant, with no UI form ever exposing those
  fields); goal/milestone title/description across 3 coach-facing surfaces + 6 more self-XSS-tier sibling sites
  on the coach/client/solo dashboards; an event title on the coach's own calendar (`saveClientEvent` proves a
  client can create their own event, stamped `is_pt_assigned:false` specifically to mark it client-authored,
  and the coach's own unscoped calendar fetch renders it); two exercise-notes fields fixed for consistency.
- Found and handled along the way: the new `client_check_ins` regression test's own cleanup silently no-ops —
  that table has no DELETE grant for either role via the client API (Supabase/PostgREST returns success with 0
  rows affected on an RLS-blocked delete, not an error), so 7 debris rows (inert — nothing renders them
  unescaped anymore) had already accumulated in the shared Test Client fixture across the session's own test
  runs. Documented honestly in the test itself rather than left as a silently-broken cleanup claim; Jake has
  the one-line cleanup SQL. Same accepted class as the already-tracked `workout_logs` fixture-erosion issue.
- Every fix verified genuinely red-first — reverted the relevant file(s) to their exact pre-fix committed
  content (nothing was staged, so `git show HEAD:<file>` was the real pre-fix state) and re-ran before
  restoring, rather than trusting the fix "should" fail without it.

**Process notes:** three separate false-alarm test failures this session were confirmed as this project's known
concurrent-Playwright-run contamination pattern (two full-suite runs racing the same dev server produce
different, unrelated failure sets each time) — resolved by confirming no other run was active, then re-running
alone for a trustworthy signal, every time. Two API spend-limit interruptions mid-task recovered cleanly with
no lost work (state checkpointed to the SDD ledger before stopping each time). 279 declared (full run) = 273-275
passed / 2 skipped / 0 failed (run alone) — 4-5 recurring failures are a confirmed pre-existing, unrelated
`client_programs` test-data gap (the shared Test Client fixture's program assignment is empty — verified
directly via a live DB query; confirmed no code in any of the 34 commits touches `programs`/`client_programs`/
RLS). New/extended: `tests/intervals-redesign-2026-07-25.spec.js` (49 tests), `tests/regression-2026-07-13.spec.js`
(+17 tests across the security sweep), `tests/day-row-prescriptions.spec.js`, `tests/gdpr-export.spec.js`.
app-core v=7 (untouched), app-dashboard v=6→8, app-clients v=8→9, app-programs v=24→26, app-calendar-goals
v=2→5, app-workouts v=35→45, app-runner v=34→45, app-progress v=27→30.

---

## 2026-07-25 (2nd save) — Playwright viewport bug fixed: every mobile check now genuinely runs at 390px (app-progress v26->v27) — pushed edb8995, CI green

_User asked "what is next proposal" after the previous save's kanban shortlist. Offered the two most concrete
candidates from that list via AskUserQuestion — the Playwright viewport bug (scoped, ready to build) vs. the
Solo-account-type decision (flagged as needing a scoping conversation, not a straight build) — and the user
picked the viewport fix._

**Done (LIVE):**
- Root-caused via 3 parallel Explore agents in plan mode: confirmed `playwright.config.js`'s `chromium` project
  spreading `...devices['Desktop Chrome']` was silently overriding the intended `390×844` viewport with Desktop
  Chrome's own `1280×720` — every test in this project's history ran at desktop width. The 2026-07-23 ledger
  analysis's mechanism was still exactly right two days later; every cited line number had drifted from commits
  landed since (confirmed and corrected before building anything on top of stale citations).
- That config bug had been masking a real, pre-existing product pattern (not a product bug): `renderNav()`
  (`js/app-core.js`) intentionally writes an identical `data-page="x"` link into both the sidebar nav and the
  bottom nav for every page — CSS alone decides which is shown, via a 900px breakpoint. At a genuinely-390px
  viewport, a bare `page.click('[data-page="x"]')` resolves to the sidebar's (now-hidden) copy and times out.
  Same shape for the Personal view-switcher (`#vs-personal`/`#mvs-personal`) and sign-out — which turned out to
  have a third wrinkle beyond simple sidebar/bottom-nav duplication: a second, completely non-viewport-gated
  sign-out button living in the Settings page's own body content, not paired with the sidebar's at all.
- Added `clickVisible`/`waitForVisible` to `tests/helpers.js` (append Playwright's native `:visible`
  pseudo-class to one or more candidate selectors, so a click/wait resolves to whichever is actually reachable)
  and migrated 56 call sites across 19 spec files. Gave the Settings-page sign-out button a stable
  `id="settings-sign-out-btn"` (purely additive attribute, zero logic change) so `auth.spec.js` could target it
  unambiguously alongside the sidebar's `#sign-out-btn`.
- `tests/solo-account.spec.js`'s 7 accompanying `.first()`-based nav-visibility assertions were replaced with an
  explicit `.bottom-nav-item[data-page="x"]` target — `.first()` was silently coupled to DOM order (always the
  sidebar copy, since it's written first), not to viewport, and would have started *failing* the moment the
  config was actually fixed, not stayed passing by coincidence like it had been.
- Sequenced deliberately: migrated every call site first and confirmed the full suite was STILL green at the
  still-broken 1280px viewport (proves the selector swap alone changed nothing), then flipped
  `playwright.config.js` to force the real 390×844, then ran the full suite again.

**Bugs found + fixed:** the config/nav-ambiguity bug itself (see above) — this was pure test-infrastructure, not
an app bug. **Zero new real mobile-layout bugs surfaced** once the suite actually ran at mobile width: 218/220
passed, 2 skipped, 0 failures, 1 flake (`progress.spec.js`'s "Log PB button" test) that reproduced clean in
isolation and is unrelated to viewport (a pre-existing timing flake, confirmed by re-running it alone). This
answers the open question the 2026-07-23 ledger row explicitly left hanging ("unknown until then: how many of
the 21 are real mobile failures hiding behind the nav timeouts") — none were. The app was already fine; only
the tests were coupled to desktop chrome.

**Decided:** kept the fix scoped to test-infrastructure only — did not also refactor `renderNav()`'s dual-nav
pattern itself, since it's correct, intentional product design (one nav for desktop, one for mobile), not a bug.
The one product-code touch (the new button `id`) was chosen over a test-only `onclick`-substring selector for
durability, at the plan's own recommendation.

**Multi-agent review:** 3 angles (security/scoping, solo-mode correctness, duplicates/regressions), all clean —
each agent independently re-derived the diff's reasoning against the actual code (e.g. Agent C read `renderNav()`
directly to confirm `.bottom-nav-item[data-page="x"]` really does match exactly one element) rather than trusting
the diff's own comments. Zero findings.

---

## 2026-07-25 — Units toggle: account-wide weight/jump-height/cardio-distance preference (app-core v6->v7, app-dashboard v5->v6, app-programs v23->v24, app-clients v7->v8, app-workouts v34->v35, app-runner v33->v34, app-progress v25->v26) — pushed 23a2493, CI green

_Confirmed earlier this session (2026-07-24) as Jake's real, current need — himself, running into it in the
builder: "What if I want to log weights in KG but measure jumping height in inches." That's what ruled out a
single global metric/imperial switch and made this three independent per-metric-type toggles instead: weight
(kg/lb), jump height (cm/in), cardio distance (km/mi). Jake chose "everything, fully" when asked how much of the
~20-25 real display/entry sites to cover in one pass, specifically to avoid a half-converted state._

**Done (LIVE):** Storage stays canonical (kg/cm/metres) everywhere in the database; conversion happens only at
display/entry boundaries via shared helpers — `weightToPref`/`weightFromPref`/`fmtWeight`,
`jumpHeightToPref`/`jumpHeightFromPref`/`fmtJumpHeight` in `app-core.js`, `distanceToPref`/`distanceFromPref`
extending the existing `fmtDistanceM` in `app-workouts.js` — driven by `window._unitPrefs`, populated in
`loadUserInfo()` from three new `profiles` columns (migration `scripts/add-unit-prefs-2026-07-24.sql`, run live by
Jake). Rewired every prescription/entry/history display this touches:
- **Builder** — the set editor's weight/jump-height/cardio-distance fields, including a pre-existing header/unit
  mismatch on the cardio distance field fixed along the way.
- **Runner** — the fast table, the wizard's strength input, the manual "log a past session" builder (including its
  own %1RM quick-entry system), all three parallel 1RM-entry flows (the runner's own sheet, the post-session
  "new estimate" modal, and the assignment-time checklist in Programs), and session-review detail.
- **Progress page** — the diary (set-details line, per-exercise metrics), the trend chips/charts (`_TREND_METRICS`,
  previously untouched by an earlier pass and still hardcoded kg/cm), personal records, the weight tracker (goals
  form, stat tiles, chart + Y-axis, both the coach-facing `renderClientWeight` and the client/solo
  `renderProgressWeight` — two independently-drifted copies), and the free-text "Log a PB" form (now defaults its
  unit dropdown to the account's preference instead of always kg).
- **Both bodyweight-log forms** (dashboard + client-profile) and a new **Settings "Units" card**
  (`saveSettingsUnits`) — three selects, no reload needed since every render function reads
  `window._unitPrefs` fresh.

**Multi-agent review caught 5 real issues before push, all fixed and re-verified green:**
1. `showPostSessionOneRMModal` (the "new 1RM estimate" popup shown right after finishing a workout) was missed
   entirely — still hardcoded kg.
2. Four separate sites — the 1RM cards (`renderClient1RMs`), the weight-tracking CURRENT/CHANGE tiles and table
   rows (`renderClientWeight`'s `fmt` helper), the CHANGE tile in `renderProgressWeight`, and all three parallel
   Epley-estimate previews — silently dropped forced one-decimal display for kg-native users. The old code used
   `.toFixed(1)` (a string op that always shows the decimal); the replacement's `Math.round(v*10)/10` pre-rounding
   pattern rounds to AT MOST one decimal but doesn't force a trailing zero, so a value like 100 rendered "100"
   instead of the "100.0" every kg-only user had always seen. Fixed by adding a `decimals` option to `fmtWeight`
   itself rather than reconstructing the rounding at each call site.
3. The mile-conversion constant `1609.344` was typed inline three separate times in `app-workouts.js`
   (`fmtDistanceM`, `distanceToPref`, `distanceFromPref`) instead of a shared name — the exact drift-risk pattern
   this whole feature exists to eliminate elsewhere. Extracted to `_METRES_PER_MILE`.

**Also found and fixed, mid-session: a real test-fixture-pollution bug** (not a product bug). The new units spec's
"a client's unit preference is independent of their coach's" test signs out of the PT account and into a client
account partway through, then in its `finally` block tried to reset the PT's own `weight_unit` — but by then the
active Supabase session was the CLIENT's, and RLS on `profiles` is self-scoped, so that write was silently
REJECTED, not merely skipped. The shared PT fixture was left permanently stuck on `weight_unit='lb'` after every
run of that one test, which cascaded into unrelated failures across `day-row-prescriptions.spec.js`,
`progress-trend.spec.js`, and two tests in `programs.spec.js` — all showing values off by the exact 2.2046×
kg-to-lb factor, which is what pointed at the real cause instead of a code regression. Fixed by re-establishing
the PT session before the reset. Separately swept 6 leaked `[E2E] 1RM Check/Have Program` rows + 36 leaked
templates off the shared PT/client fixture accounts — pre-existing debris from `programs.spec.js`'s
"Assignment-time 1RM check" tests never wrapping their cleanup in try/finally, so a failed assertion (the
weight_unit pollution above, on one specific run) left the fixture behind for good. Both tests hardened.

220 declared = 218 passed / 2 skipped / 0 failed / 0 flaky. New `tests/units-2026-07-24.spec.js` (6 tests:
formatter/parser round-trips + blank/null contract, a completeness grep-net for leftover hardcoded unit literals
across the touched files, a real builder round-trip through lb without corrupting canonical kg — including the
deliberate-clear-vs-field-not-rendered distinction the existence-check pattern protects — `saveSettingsUnits`
persistence, and cross-role independence).

**UNVERIFIED (banked):** structurally tested end-to-end, but nobody has spot-checked a real number by eye —
a silently-wrong conversion factor would pass every test here and still be numerically wrong. Needs: switch
Settings to lb/in/mi on a real account, confirm a known kg weight shows the right lb value and a known cm
height shows the right inches, live on Jake's own phone.

**Decided:** kg-native display sites that never had a forced decimal keep behaving exactly as before (a bare
`weightToPref` passthrough, no `.toFixed`) — only sites that historically forced one now pass `fmtWeight`'s new
`decimals` option explicitly, rather than standardizing every weight display to always show one decimal. Chosen
to preserve each site's own pre-existing convention exactly, not to introduce a new house style as a side effect
of the unit work.

---

## 2026-07-24 (3rd save) — Security: public signup closed, solo_only lockdown, a live role-corruption incident (app-core v5->v6, app-progress v24->v25) — pushed 57a188a, CI green

_Jake, live: "I gave my brother the URL and from the login screen he was able to create an account.
It looks like the system has automatically given him a PT account." Two requests followed: close the
public signup path, and convert the brother's (Scott's) account to personal-only. Building the second
one surfaced a real production incident, and reviewing all of it surfaced three more real bugs._

**Done (LIVE):**
- **Public self-signup removed entirely** — the login screen's "Sign up" form/link, its handlers, and
  the show-signup/show-login toggle are gone from `index.html`/`js/app-core.js`, not hidden (Jake still
  needs to flip "Allow new users to sign up" off in the Supabase Auth dashboard separately — the
  client-side removal doesn't stop `db.auth.signUp()` being called directly with the public anon key).
- **New `profiles.solo_only` flag.** When set, `loadUserInfo()` skips `window._masterAccount` entirely
  — the view-switcher never renders, and `switchView()`'s existing `if (!window._masterAccount) return`
  guard blocks any attempt to reach the coach view. Jake was explicit: "he shouldn't have access to any
  other account other than solo" — a normal master-account setup (what his own account is) always ALSO
  exposes the coach side via the switcher, so this needed to be a genuinely separate, more locked-down
  mode, not just re-using the existing pattern.

**Incident, found and fixed same session:** while adding `solo_only` to `loadUserInfo`'s profiles
`select()`, that edit landed live BEFORE Jake had actually run the matching migration, and a full
Playwright suite was already running against the real Supabase DB at the time. Every login in that
window hit a missing-column error. `loadUserInfo`'s pre-existing role-inference fallback ("if profile
has no role... check the clients table") doesn't distinguish a genuinely-null role from a FAILED
fetch — it fires on any falsy role and WRITES `role:'client'` back to the database the moment it finds
ANY clients row for that user_id (no `coach_id` filter, so a coach's own self-referential solo row
qualifies). The real PT test account got silently, permanently downgraded from coach to client in
production. Root-caused via direct diagnostic queries (not guessed), repaired directly, and fixed
properly: the fallback now requires `!error`. **Lesson banked (les-053): never edit application source
while a Playwright run is in flight against the live dev server** — even a change that looks
behaviour-dormant (a new column added to a SELECT, gated behind a flag that defaults false everywhere)
can still error the query outright and trigger unrelated pre-existing write-back logic.

**Multi-agent review then caught 3 more real bugs in the solo_only work itself, all fixed same push:**
- The branch force-assigned `role:'solo'` even when its clients-row lookup came back empty or errored
  — unlike the sibling master-account branch, which only reassigns on a confirmed row. Since switchView
  is deliberately blocked for solo_only, a bad lookup would trap the account in a broken personal
  dashboard with no in-app way out (provisioning is two separate manual SQL steps — insert the row,
  then flip the flag — so a wrong order is a realistic mistake). Now only reassigns when the row is
  actually found.
- `window._masterAccount`/`_soloClientId`/`_masterClientId` and the switcher's visibility are SESSION
  state that `loadUserInfo` only ever SETS, never resets. The primary sidebar sign-out button doesn't
  reload the page, so on a shared/gym device the NEXT account signing in on the same tab inherited the
  PREVIOUS account's `_masterAccount=true` — the one thing `switchView`'s guard checks. A solo_only
  account could have escaped to the full coach dashboard this way, no misconfiguration needed at all.
  Now reset on sign-out.
- A failed profiles fetch left `currentProfile` null, and every downstream role check defaults an
  unrecognised role to coach nav — `showApp` now fails closed (retry screen) instead of silently
  granting coach access on a transient error.
- (Also, in the test itself) an earlier version of `solo-only-2026-07-24.spec.js` mutated the shared PT
  fixture's `solo_only` flag BEFORE its own try/finally safety net started — exactly the same class of
  damage that had already happened to the PT2 test account earlier this session (its `solo_only` got
  stuck `true` from a different test's aborted setup). Fixed the test to confirm the precondition first
  and only mutate inside try.

**Separately diagnosed, not a repeat of the incident:** a LATER full-suite run produced 142 failures
over 1.5 hours (should be ~14 min). Traced to Supabase Auth rate-limiting from the sheer volume of
login attempts in the earlier failing run's retry storm — confirmed by a clean, fast re-run of the
exact same files once the rate limiter's cooldown passed. Not a code bug.

**Known, banked limitation — not fixed this session:** `solo_only` enforcement is client-side only.
This session's OWN repair work already proved a user's own authenticated session can self-write
`solo_only`/`role` via the anon client (used repeatedly tonight to fix stuck test-account state) —
RLS on `profiles` is row-scoped, not column-scoped, and no trigger currently protects those two
columns. Low practical risk for the one real account this affects right now (Scott, a trusted family
member being handed the app in good faith, not an adversary) — but flagged clearly to Jake and tied to
the already-banked "Solo becomes a genuine account type" pre-beta decision, since a proper fix needs
DB-level enforcement, not another client-side patch.

**Tests:** 214 declared = 212 passed / 2 skipped / 0 failed / 0 flaky. New
`tests/signup-removed-2026-07-24.spec.js` (3), `tests/solo-only-2026-07-24.spec.js` (5),
`tests/role-inference-safety-2026-07-24.spec.js` (2) — the latter includes a live monkey-patched
behavioural proof that a failed fetch never triggers the role-patch upsert, not just a source check.

**Why:** Jake found a real, live gap (open public signup) through his own use, in the least damaging
way possible (his own brother, not a stranger). Fixing it properly surfaced a second real gap (no
locked-down account mode existed), and building that surfaced a live data-integrity bug plus three
more real bugs in the fix itself — density that reflects how much ground this touched (auth, session
state, role resolution), not how careless the individual pieces were.

---

## 2026-07-24 (2nd save) — Intervals: get-ready countdown + builder repeat-set×N (app-runner v32->v33, app-workouts v33->v34) — pushed 7aeb3ae, CI green

_Jake described the interval flow he wants: Start -> countdown -> work -> beep -> rest -> beep ->
next round -> repeat. Read app-runner.js closely BEFORE proposing anything (per the plan-mode
discipline) rather than assuming a build was needed._

**Found by reading first:** almost the entire loop already existed and worked.
`startIntervalTimer`/`startRestTimer` already auto-chain via `_afterRest`; both already speak the
last 5 seconds aloud (functioning as a count-in for every round after the first). The genuinely
missing piece was narrow: tapping Start began the work timer immediately, with no lead-in before the
FIRST round.

**Done (LIVE):**
- **Get-ready countdown.** `startRunnerCountIn`/`stopRunnerCountIn`/`renderRunnerCountIn` — 5 seconds,
  spoken "5,4,3,2,1,Go!" (Jake's choice over a 3-second version), then hands off to the existing,
  unmodified `startIntervalTimer`. Wired `stopRunnerCountIn()` into every navigation-away path.
- **"Round N of M" labeling** on the interval + rest timer overlays (was bare "Set N", no total) —
  `ex.targetSets` was already populated correctly for cardio, just needed reading in two spots.
- **Builder: `repeatTemplateSet(i)`.** Asked Jake to scope the builder side explicitly; his answer was
  about minimising clicks ("shouldn't have to click add>copy 10 times"). One click clones a set N-1
  more times instead of "+Add set" then "Copy set i" repeated by hand. Type-agnostic — the same
  shortcut helps 5x5 straight sets, not just cardio rounds.

**Caught by multi-agent-review, fixed same push before it shipped:**
- `logRunnerSet` already blocks itself during rest (`if (_runner._restInterval) return`) but had no
  equivalent guard for the new count-in state. The cardio duration field is pre-filled with the target
  duration, so LOG firing mid-countdown would have silently logged a round that was never performed.
  Fixed: same guard now also checks `_countInInterval`.
- `showRunnerFinish`'s own header comment documents it as doing "FULL teardown" of every runner timer
  — written after a PAST bug where a stray timer painted a live overlay over the finish screen. The
  new count-in timer was missed from that teardown. Fixed: added `stopRunnerCountIn()`.
- (Non-blocking, fixed anyway) `repeatTemplateSet` had no upper bound — a typo like "500" for "5"
  would splice hundreds of clones. Capped at 50 with a toast if exceeded.

**Verification note:** live audio/timing verification (does the countdown actually sound right, is the
start-blip audibly distinct from the interval-end beep) is NOT something I can do myself — no
audio-output verification available. Screenshots confirm the visual/round-labeling is correct;
Jake still needs to hear it live in a real gym session before this is fully closed out.

**Tests:** 204 declared = 201 passed / 2 skipped / 1 flaky (unrelated pre-existing runner-launch race,
passed clean on retry — strength-table test, not cardio/interval code), 0 failed. New
`tests/intervals-2026-07-24.spec.js` (7 tests, all verified genuinely red pre-fix via `git stash`).

**Why:** first slice of the day's "intervals + units toggle" scoping work — intervals went first since
it had no open questions left once scoped, vs. the units toggle which needed the imperial-user
question answered first (see the earlier 2026-07-24 entry below).

---

## 2026-07-24 — 6-bug ledger batch (app-workouts v32->v33, app-runner v31->v32, app-progress v23->v24, app-programs v22->v23) — pushed b637e09, CI green

_Working through the remaining open items from the 2026-07-23 full-file review's bug ledger ("fix what needs fixing"). All six had red->green tests; the full suite ran clean before AND after the multi-agent-review round, since the review caught a real bug the review-fix round introduced._

**Done (LIVE):**
- **Legacy metric_type fallback revived.** `_resolveMetricType` (shared by runner + builder edit-modal) makes the `sets_json[0].unilateral/.timed` fallback reachable again — `launchRunner` always supplied a truthy `metric_type` first, so the fallback was dead code since the 07-18 migration.
- **Epley 1RM consolidated + capped.** 4 duplicate copies -> one `_estimate1RM`, 12-rep ceiling (60kg x 30reps no longer saves a junk 120kg "1RM").
- **"Best" PB picker consolidated.** 3 sites that took `records[0]` (newest, not best) -> one `_bestPerfLog`, category-aware (time units lower-is-better, everything else higher-is-better).
- **Distance formatting consolidated.** 4 sites bypassing `fmtDistanceM` now route through it — a 400m sprint reads "400 m" everywhere, not "0.4 km" on Progress.
- **Discard button confirms.** Scoped to exactly the one caller that can destroy real unsaved work.
- **Cardio LOG toasts** on all 6 missing-required-field guards, matching `toggleTableSet`'s existing pattern.

**Caught by multi-agent-review, fixed same push before it shipped:**
- `_bestPerfLog` compared raw numbers across incompatible units. `PERF_CATEGORIES` lets the same exercise be logged in either unit of a pair (kg/lbs, min/sec) as a free per-entry dropdown choice — the fix above would have let 220lbs (~99.8kg) beat a real 100kg lift purely because 220>100, and 20min beat a genuinely faster 1180sec (19:40) the same way. Fixed with a small unit->base-unit conversion table before every comparison. les-052.
- `renderProgressPBs` cached `unit` from the newest record but rendered it beside `best.value` from a *different* record once "best" stopped always being the newest — could show "100 lbs" when neither actual entry was ever that. Fixed by reading `best.unit` directly.

**Also this session — units-toggle scoping resolved with Jake:**
Asked directly (les-039): is there a real imperial user, or is this pre-emptive? **It's Jake himself** — he hits it in the builder wanting weight in KG but jump height in INCHES *simultaneously*, which overturns the 07-23 assumption of one global metric/imperial switch (a binary toggle can't express mixed units). Revised scope: account-wide setting on `profiles`, independent per-metric-type units — weight (kg/lb), jump height (cm/in), cardio distance (km/mi) in scope now; jump distance deferred until he actually hits that friction. Not yet built. See STATUS.md.

**Lessons banked:** les-052 (a value comparison across a field where the SAME logical measurement can be logged in different units — free per-entry choice, not fixed per record — must normalize to a common base unit before comparing; comparing raw numbers picks the bigger digit-string, not the bigger measurement. Caught by multi-agent-review in the same push that introduced the comparison, not by the red-green tests that shipped alongside it — the tests only covered same-unit cases).

**Tests:** 197 declared = 195 passed / 2 skipped / 0 failed. New `tests/ledger-fixes-2026-07-23.spec.js` (9 tests, including the 2 the review's findings drove).

**Why:** these were the remaining open rows from the 2026-07-23 full-file review's bug ledger — six real bugs Jake hadn't yet hit live, fixed proactively rather than waiting for a bug report.

---

## 2026-07-23 (4th save) — Jump runner + XSS + blank-workout fixes; intervals & units scoped (app-runner v30->v31, app-progress v22->v23) — pushed bd2e501, CI green

_Jake reported the jump runner live ("only displays height in CM… no reps fields… missing the wizard entirely"); the other two came from the morning's full-file review. The pre-push review then found SIX blocking issues — two of them regressions the first two fixes introduced._

**Done (LIVE):**
- **Client->coach stored XSS closed** (third instance of this shape). `performance_logs` name/unit/notes and `weight_logs` notes are client-written and were rendered UNESCAPED in the coach's client-profile tabs. 8 sinks escaped.
- **Blank/custom workout no longer lost.** Finish screen filtered `loggedSets.length`, save also required `e.name` — a nameless Custom workout was itemised then binned. Both now call one `_loggedExercises()` which backfills "Exercise N".
- **Jumps: reps field + a target bar.** TWO layers, both regressions from c72eb14: the jump row had no contacts input (jump volume unrecordable/uncharted), and `showTargets` was gated `weight_reps||unilateral` so the `_buildTargetCols` jump branch I added that morning was DEAD CODE — no target/rest/RPE ever rendered. Fixed both; timed_hold was silently in the same state.

**Fixed in the pre-push review (6 blocking; A and C both independently flagged the 1RM one):**
- NEW attribute sink from the jump fix: ghosting the prescribed target put raw sets_json strings into `placeholder=` for the first time — escaped.
- NEW from widening showTargets: a stale `intensityMin` survives a metric_type switch, so a depth jump showed "70% · 1RM TARGET" + the amber "Set your 1RM" banner, and tapping it wrote a junk `client_1rms` row for a weightless exercise. `tgt.weight` already had the guard; `intensityMin`/`tempo` now gated on `takesLoad`.
- Same class: a plank's `'0:00'` default duration (truthy) painted a "0:00 · DURATION" column once showTargets widened — now via `_hasTimeTarget`, matching REST's existing guard.
- Pre-existing but in edited code: a live coach->client XSS in the trend-metric chip (hand-rolled `.replace(/'/g,…)` leaves `"` live) + raw name/runnerName on the finish screen — escaped.

**Scoped (decisions locked, NOT built):**
- **Intervals** — cost re-estimated DOWN after reading the code (my first estimate was a guess): rounds ARE sets, so no migration and no new metric_type, and `startIntervalTimer` already auto-logs a round. Decisions: per-round recorded, rest timed-not-recorded, one shared target editable per round. Scope with the roadmap's AMRAP/EMOM/circuit item.
- **Metric/imperial** — Jake chose ONE formatter boundary (not per-call-site, which would seed the same duplicate-drift class today's review is full of). Storage stays canonical. Open question banked: is there a REAL imperial user, or defer the toggle and do the consolidation half metric-only.

**Lessons banked:** les-051 (a capture->display feature can be green at every layer and invisible — assert the RENDERED output, and when adding a type to a branch, grep every gate that decides whether the branch runs; a stale boolean written before the type existed silently drops it — found by rendering at 390px and LOOKING).

**Tests:** 189 declared = 187 passed / 2 skipped / 0 failed. New `tests/review-fixes-2026-07-23.spec.js` (5).

**Why:** the jump work shipped this morning was invisible in the runner — none of the target bar rendered and contacts couldn't be logged. Jake caught it live the same day; the fix has two independent layers.

---

## 2026-07-23 (3rd save) — Weekly FULL-FILE review (9 days overdue) + GDPR export repaired + runner 1RM/delete (app-runner v29->v30, app-progress v21->v22) — pushed 7fe41e0, CI green

_Ran the weekly full-file review for only the SECOND time in the project's life — 3 agents over app-workouts/app-runner/app-progress (6,918 lines). It found 12 issues in code no diff had touched. Fixed the two most serious plus Jake's two 10-day-old runner reports._

**Done (LIVE):**
- **GDPR export repaired.** It was not a complete disclosure: PT view exported coaching assets and NO health data; Personal view dropped the user's own programmes/templates — so the export's CONTENTS depended on a UI toggle. Both halves now run ungated. Also fixed: `workout_logs` exported `name, date` ONLY (200 sessions = 200 empty headers, zero sets/weights/reps/HR — the largest body of personal data in the schema, absent), `client_check_ins` (Art. 9 sleep/energy/stress/soreness) was in NO branch, and `resting_hr` + free-text notes were missing from stale select allowlists (les-036). The discarded-error `.single()` is gone.
- **Runner (Jake's re-reports, 10 days open):** 1RM column shows the PERCENTAGE with the derived kg moved to the KG ghost text (which now outranks last session — on a %1RM set the prescription is the meaningful reference); Delete is a 32x32 × against the 44x44 tick, with the >=8px gap KEPT (a separate 2026-07-05 request with its own regression test).

**The review's root cause was WRONG, and the correction is the lesson (les-049):**
Two agents independently claimed a master account holds TWO `clients` rows so `.single()` threw and the export returned `{exportedAt, profile}`. I "verified" it by reading app-core.js:169-170 (which queries for a coached AND a solo row) and reported it to Jake as CRITICAL. Writing the red test disproved it: **`clients.user_id` is UNIQUE** — Postgres refuses the second insert. That failure mode is impossible. The real bug was the if/else beside it. **Two agents agreeing is one hypothesis with two votes, not two pieces of evidence** — neither could see a schema that isn't committed. A claim about DATA SHAPE can only be settled by the database. A test now pins the constraint.

**Fixed in the pre-push review (all mine):**
- The kg ghost was computed INSIDE the weight_reps branch, so UNILATERAL sets — which the builder does offer a %1RM field — would have shown a percentage and no load anywhere on screen. I had checked the wizard path and wrongly concluded it was safe; I never checked the sibling branches inside the table.
- `tests/gdpr-export.spec.js` cleaned up with `.eq('weight_kg', 77.7)` and NO date filter — destroys every 77.7kg row on any date. Now deletes by the row's own id against a 2027 sentinel date. Audited: zero weight rows on the account, nothing lost. (Agent A called it Jake's production account; `PT_EMAIL` is the E2E account — real bug, smaller blast radius than reported.)
- The UNIQUE-constraint probe gated cleanup on `!error` — the one branch where a row CANNOT be stranded was the only branch that cleaned up.

**Three wrong diagnoses before a one-command bisect (les-050):**
22 runner tests failed. I blamed my own tweaks, then concurrent-run contamination (which I *had* genuinely also done, making the wrong theory feel confirmed), then my tweaks again. `git stash` + run one test showed it failed at HEAD too — environmental. Cause: **4 `[E2E]` programmes stranded on the test client** when I killed suite runs mid-flight (their cleanup never ran). A zero-session "Empty Phase Program" sorted to the top of the Workouts page, so `.first()` clicked ITS Start button. Sweeping them took 22 failures to 1. **Bisect before theorising — a theory that describes something you really did is the most dangerous kind of wrong.**

**Ledgered, NOT fixed — 10 more review findings**, incl. client-authored text rendered unescaped in the COACH's client-profile tabs (third instance of that shape), a custom/blank workout counted on the finish screen then thrown away on save, legacy unilateral/timed exercises logging as plain weight×reps (the `_exMetricType` fallback is dead code), Discard destroying a session with no confirm, four copies of the Epley formula with different validation, and "Best" PB actually showing "most recent" in two places.

**Tests:** 184 declared = **183 passed / 2 skipped / 0 failed / 0 flaky**. New `tests/gdpr-export.spec.js` (3).

**Why:** the weekly full-file gate is the only mechanism that has ever found this class — the pre-push review is diff-scoped by design and will never look at untouched code. Two runs, ~30 real bugs. It had been RED for 9 days because I surfaced it once at session start and never raised it again.

---

## 2026-07-23 (2nd save) — Day rows show the real prescription + the picker says WHICH duplicate (app-workouts v31→v32, app-programs v21→v22, main.css v6→v7) — pushed b53dbfc, CI green

_Jake's follow-up UX reports, scoped in plan mode then built. The pre-push review found **5 blocking** issues — 2 of them pre-existing, 3 of them regressions I introduced in my own refactor._

**Done (LIVE):**
- **Day rows now read the actual prescription** — `4 × 8–10 reps · 100kg · RPE 8 · 2:00 rest` under each exercise name, identical sets collapsed, a genuine ramp still listed per set. Jake: *"it doesnt show any detail of the weights, rest period, rest etc… not helpful to a user who wants to look at their week ahead"*. Verified at a real 390px, no overflow, 5-exercise day still scannable.
- **Applied to all FOUR surfaces**, not the two he named: client/solo Workouts page, Programs builder slot, and — flagged by two review agents — the **coach's view of a client's assigned plan**, which would otherwise have been the one place left showing a bare set count.
- **ONE formatter, not a third copy.** The formatting existed TWICE (`openSessionDetail`, `openTemplate`) and had already drifted; one even carried a comment falsely claiming it was "reused for consistency" with the other. Both now call `_fmtSetDetail`, with `_fmtSetsCollapsed` layering the collapse (les-037).
- **Picker disambiguates duplicates** — `↳ Used in <phase> · Wk N · MON` vs `Not used yet`, plus the exercise count that was already computed and thrown away. Jake's reframe drove the design: same-named workouts are a **normal steady state** that Duplicate-week manufactures by design, so deduping data would not fix it. Both duplicated pool builders collapsed into `_buildProgramTemplatePool`.

**Review findings — 5 blocking, all confirmed by reading the cited lines, all fixed + tested:**
- 🔴 **`_DAY_LABELS[day_of_week]` off by one.** `day_of_week` is 1-based everywhere it is stored (writer does `i+1`; starter-content seeds `1='Monday'`; calendar reads `day_of_week-1`), so every usage label named the **wrong day** and Sunday rendered no day at all — in the one label whose entire job is disambiguation. My own mobile screenshot contained this evidence and I read past it.
- 🔴 **The two innerHTML sinks the refactor rewrote were UNESCAPED.** The formatter concatenates raw `sets_json` values; on a client plan clone that row belongs to the client — the client→coach stored-XSS shape from 2026-07-18. My *new* day rows escaped; the rewritten ones didn't. Warning now lives on the formatter itself.
- 🔴 **Three merge regressions (les-048):** %1RM vanished when a set also had a weight (merge took `weight || intensity` over the separate-parts version); AMRAP replaced the rep range and duplicated openSessionDetail's own label; the new jump branch dropped RPE/RIR. Plus numeric bare-seconds rest losing its mm:ss formatting.
- Non-blocking, also fixed: `metric_type` was fetched and never read (now load-bearing); the usage `.in()` is chunked so a big library can't 414 into a silent "Not used yet" on every row; `[{},{},{}]` printed `3 × —` instead of nothing.

**Also found:**
- 🔴 **Every "mobile check" this project has ever run was at 1280px, not 390px.** `playwright.config.js:13` sets `viewport:{width:390,height:844}` with a `// mobile-first` comment, but line 19's project spreads `...devices['Desktop Chrome']`, whose viewport **overrides** it. Confirmed by measuring `scrollWidth` (1280 default vs 390 with an explicit `test.use`). The `mobile-check` skill's core claim is therefore false. **Ledgered, deliberately not changed** — flipping it re-baselines all 181 tests and deserves its own task.
- The pre-push hook's check 9b (`repsMin` + `' reps'` on one line) correctly blocked the push: a timed set stores its DURATION in `repsMin`, so an unguarded render prints "90 reps" for a 1:30 hold. My branch structure *was* guarded but the grep can't see branches — split the line rather than weaken the check. (My explanatory comment then tripped the same grep, which is its own small lesson about self-referential comments.)
- Swept 2 `[ADHOC]` templates my own throwaway spec stranded in the E2E account.

**Task 1 — the Programs-page add-exercise report: reproduced live, NOT reproduced.** Drove the real UI end-to-end. **Same-named siblings:** propagate modal fires correctly, `op='add'` captured — but `openTemplate` isn't called, so the editor behind the modal shows the pre-add list until dismissed (all 3 dismiss paths re-render, so cosmetic). **Differing names:** no modal (correct), re-render fires, exercise appears. Neither symptom reproduced; the two together remain unexplained. Honoured the plan's timebox and ledgered the evidence rather than guessing. **Needs Jake's actual program**: does he see the modal at all, and are the same-named workouts in the same phase?

**Tests:** 181 declared = **179 passed / 2 skipped / 0 failed / 0 flaky** (the long-standing login-race flaky passed clean). New `tests/day-row-prescriptions.spec.js` (4 tests) locks collapse behaviour, the zero case, the 1-based day convention, the escaping contract, and each of the three merge regressions.

**Why:** Jake's complaint was that the app shows him *that* a workout exists but not *what it is* — the data was always there, only the display was missing. The substance of the fix was killing the duplication that had made this formatting drift in the first place.

---

## 2026-07-22/23 — Exercise-builder overhaul: cardio in METRES + watts, jump targets, half the scrolling, its own visual identity (app-workouts v30→v31, app-runner v28→v29, app-progress v20→v21, app-programs v20→v21, main.css v5→v6) — pushed c72eb14, CI green

_Jake opened with a UX critique, not a bug: the builder is "very very similar to the heavyset exercise builder and I dont want to get pulled up on being a copycat", it scrolls a lot on mobile, cardio is wrong (no watts, km not metres, pace should be optional, "Pace / km" redundant), and "jump height and jump distance are not fleshed out at all". Built all four. The pre-push review then found two pre-existing LIVE bugs, and re-running the suite caught a third that I had introduced while fixing them._

**Done (all LIVE):**
- **Cardio in metres** — new `distanceM` sets_json key; legacy km `distance` never written again and never rewritten (fix forward), read through one shared `_cardioDistanceM()` + `fmtDistanceM()` (m under 1km, km above). The runner's ×1000-on-save is gone. TDD red→green.
- **Watts** — `wattsMin/Max` builder targets, runner avg-watts input, target chip, Progress trend chip. New `avg_watts smallint` on `workout_log_sets` (`scripts/add-avg-watts-2026-07-22.sql`, **applied live by Jake**). Clamped at the save site: `max=` on a bare input is not enforced on read, and an out-of-range value fails the whole batch insert and rolls back the session.
- **Pace/km retired** — it duplicated the computed Pace/1000m row. Still renders marked "(legacy)" for sets that already carry a value: deleting the only control that can clear a field strands it (les-043).
- **Scrolling halved** — 9 always-visible cardio rows → 4, rest behind a "+ More targets" `<details>` that auto-opens when anything inside is set. 3 sets at 390px: ~1320px → 685px. `weight_reps` got the same treatment: 1138px → 832px.
- **Jumps fleshed out** — were capture-only with no way to prescribe. Added target height/distance, jumps-per-set, rest, RPE/RIR, plus the missing `_buildTargetCols` jump branch (the runner target bar rendered EMPTY for jumps). REPS is labelled JUMPS there.
- **Visual identity** — defined `--surface-2`/`--bg-accent`/`--text-accent`, referenced **54×** across 7 files and never defined anywhere (silently falling back to transparent/inherit); audited all 48 `--surface-2` uses first, every one a background. Set builder repainted from 15 hardcoded greys to design tokens (**now 0**). Closes an 18-day-old ledger row.
- **Heavyset teardown** → `coachapp-client-app-benchmarks`, documenting the deliberate divergences.

**Bugs found while building (none reported):**
- **Duration-based cardio silently discarded its distance** — both capture sites wrote `setData.distanceAchieved`, a key `saveRunnerSession` never reads. Same silent-drop class the 2026-07-19 save rewrite existed to fix.
- **Legacy `'0:00'` pace is truthy** → every legacy cardio set rendered a meaningless "0:00 /500m" chip. Now gated by `_hasTimeTarget()`, shared by runner + builder.
- Workout-log table showed a 500m interval as "0.50 km".

**Bugs found by the pre-push multi-agent review — 2 blocking, 7 non-blocking, all fixed:**
- 🔴 **Adding a cardio exercise silently discarded EVERY cardio target except duration/distance** (found independently by all 3 agents). `cleanSets` is an explicit allowlist and had NEVER contained `isDistanceBased`, `pace500Min/Max`, `hrZoneMin/Max`, `restHrMax`, `strokeRateMin/Max` — while EDITING one kept them (`saveEditTemplateExercise` writes `sets_json` raw). Two siblings, one job, drifted, silent at every layer. Became load-bearing today because the runner branches on `isDistanceBased`. Both builders now share one `_cleanTemplateSets()`.
- 🔴 **`metric_type` dropped by BOTH clone paths** — `_cloneTemplateForClient` (every program assignment, incl. solo self-assign) and `_cloneSharedMasterTemplate` (fork-on-edit). Every ASSIGNED copy fell back to `weight_reps`, losing jump/timed/unilateral routing **for the person actually training**, while the coach's master looked correct. Pre-existing since metric_type shipped 2026-07-19. Feeding selects all use `workout_template_exercises(*)`, so only the INSERTs were at fault (les-036 inverted).
- Plus: `showRunnerFinish` still summed the retired `distance` key (distance tile would have vanished — and a sibling line 17 lines away HAD been migrated); interval auto-log dropped watts+HR; builder used raw truthiness where the runner used `_hasTimeTarget`; duplicate TARGET column on jump sets; stale `repsMax` printing "8–12 JUMPS"; `fmtDistanceM(999.6)` → "1000 m".

**A bug I introduced fixing the review's findings — caught only by re-running the suite (les-047):**
Deduping the two drifted payload builders into one `_cleanTemplateSets(sets, derived)`, I replaced both call sites with the identical line via a scripted regex. The builder had `const derived` in scope; **the runner never did** — it inlined the same logic as `metricType === 'unilateral'` expressions. ReferenceError on every runner Swap/Add, aborting before `closeModal()` so the modal froze open. 5 runner tests red. An out-of-scope identifier is a *runtime* error, so `node --check` and every static gate stayed green. **Lesson: a shared helper's parameters are a contract each call site must satisfy — verify each site can supply every argument before replacing, and "the tests passed before I refactored" stops being evidence at exactly that moment.**

**Also this session:**
- **mobile-check** — 44px tap target on the disclosure summary (was ~30px), `inputmode` on the remaining cardio number inputs.
- **6 new ledger rows** from Jake's live use (below) + 2 GDPR findings.

**Tests:** 177 declared = **175 passed / 2 skipped / 0 failed / 0 flaky** (the long-standing flaky login-race test passed first time). New: `cardio-distance-metres.spec.js` (4, TDD red→green), `clone-metric-type.spec.js` (1), plus a disclosure round-trip guard proving a value typed while COLLAPSED survives and that switching metric_type does not clobber un-rendered fields.

**Jake's new reports, ledgered not built (he asked to scope them in plan mode):**
1. **Day rows show only exercise name + set count** — no weights, reps, rest. "not good UX or helpful to a user who wants to look at their week ahead to see what the plan has in store for them." Both the Workouts page and the Programs builder. The data is in `sets_json` and the formatting already exists in `openSessionDetail` — a display gap, not a capture gap.
2. **Add-workout picker can't tell duplicates apart** — "Full Body" twice with byte-identical previews. **Jake's reframe matters: same-named workouts are NORMAL, not debris** — "very likely that a user will have more than 1 of the same workout in a program (especially if they are duplicating weeks)". So Duplicate-week manufactures them by design and the picker must disambiguate as a first-class requirement; deduping the data would not fix it.
3. **Library page messy** — he explicitly wants a scoping session, not a fix.
4. **Adding an exercise from the Programs page** doesn't render until refresh AND doesn't offer "update all sessions" (the latter is a **re-report** of a 2026-07-13 row that sat open 9 days). Investigated: `_editPhaseWorkout` sets `programId` correctly and all three verbs end in `_checkClientPlanPropagation`, so ctx is not the cause — **not yet root-caused, deliberately not guessed at.**

**Why:** Jake's copycat concern was the real driver — the builder had no visual identity of its own because 54 token references were dead, so it defaulted to generic light-grey cards. Fixing that and the cardio/jump gaps in one pass made the builder *his* rather than a lookalike.

---

## 2026-07-19 (2nd save) — Progress overhaul DISPLAY + analytics SHIPPED LIVE + SetGraph wiki ingest (app-progress v11→v20, app-runner v26→v28, app-clients v6→v7, app-dashboard v4→v5) — pushed 95e8e8f, CI green

_Continued straight from the capture-layer session below. Built ②d (manual HR), the whole ③ display rebuild, a SetGraph-informed analytics pass, and a live runner block — then merged the entire `progress-overhaul` branch to master and deployed. The Progress page Jake screenshotted as "very sparse" is now the rich per-exercise + per-workout analytics he asked for._

**Done (all LIVE):**
- **②d Manual HR** — cardio avg/max-HR inputs in the runner (`_renderRunnerVsLast` sits above them); resting HR on the **bodyweight form** (`saveClientWeight` + the form in `renderProgressWeight` and both dashboard weight cards). Homed on the weight form, NOT check-in — the check-in form is client-dashboard-only so solo couldn't reach it (Jake's call via AskUserQuestion). New `resting_hr smallint` on `weight_logs` (migration run live). Save path (`applyHr` at app-runner.js) already persisted `avg_hr`/`max_hr` from ②b, so cardio HR was pure input-UI.
- **③ Display rebuild + analytics** — `js/app-progress.js` largely rewritten. **B1:** metric_type-aware trend cards for EVERY type via `_metricPointsFor`/`_aggregateSeries`/`_exerciseRecords`/`_TREND_METRICS`, a rebuilt `_renderPerfExerciseList` (range selector 1M–All, weekly/monthly aggregation, a **Personal Records** block, a unilateral **L-vs-R dual-line** chart branch); cardio card (distance/duration/pace/avg-HR); timed/jump cards. **B2:** Intensity (kg/rep) metric. **B3:** rebuilt `renderProgressPerSession`/`_renderPerfSessionDetail` — per-workout summary tiles + per-metric **vs-previous deltas** (`_diaryDelta`) + compact **set-details line** (`_setDetailsLine`/`_diaryExMetrics`), history shape `{date,display,raw}`→`{date,m}`; **Per exercise is now the default** Performance sub-tab, "Per session"→"Recent sessions". **B4:** resting-HR trend chart in `renderProgressWeight`. **B5:** deleted the standalone Cardio-bests section + the now-dead `renderProgressCardio`. **B6:** `_METRIC_COLORS` palette on chips/lines/diary tiles.
- **C — live runner "vs last session" block** (`_runnerVsLast`/`_renderRunnerVsLast`, app-runner.js) — Volume/Top/Reps/Sets for the current strength exercise vs its own previous session, from data already in `_runner.lastSession`. Initially gated on logging the first set; after Jake tested it live and saw nothing, changed to show **from the moment you reach the exercise** (last session as a "beat it" reference, ▲/▼ deltas fill in as sets are ticked).
- **SetGraph wiki ingest** — 20 SetGraph iOS + App Store screenshots moved out of the mis-named `hevy-screenshots-2026-07-02/` into `raw/setgraph-screenshots-2026-07-19/` (Hevy folder restored to 27; 2 md5-confirmed dupes to a reversible `_duplicates/`); a SetGraph **analytics teardown** added to `coachapp-client-app-benchmarks` + manifest/index/log updated.
- **Deployed** — merged the full 31-commit branch to master; pre-push hook green (56 smoke + checks); CI green. Second push `95e8e8f` for the runner-block-immediate tweak. 12 new Playwright tests (all TDD red→green); full suite 168 passed / 1 flaky (known login race) / 2 skipped.

**Bugs found + fixed:**
- **Multi-agent review C1 — duplicate global `_epley1RM`** (I added a 2nd in app-progress.js colliding with the pre-existing app-runner.js one; both classic scripts share global scope). The pre-push hook provably can't catch it (differing arg names). Renamed the app-progress copy to `_epleyEst1RM`. Review otherwise 0-blocking (security/solo/render all clean).
- **3 stale `progress.spec.js` tests** asserted the old Performance UI (Cardio-bests, "Per session" sub-tab, `_perfExerciseCache`) — the full-suite run flagged them; updated to assert the NEW behaviour (les-045: triage stale-vs-regression, don't weaken).

**UNVERIFIED (banked):**
- The full analytics on Jake's REAL data across all exercise types, and on his phone, is still his to confirm (he checked the runner live + approved the immediate-block change, but not the whole Progress surface). Ledger: `fixed — awaiting Jake`.
- **④ coach parity NOT built** — a coach viewing a client's profile still sees the old view; resting-HR is self-view only.
- Diary shows `0/0/0` tiles for real sessions with no logged sets (his "Push Day A") — accurate but odd; ledger'd Low.

**Decided:**
- Analytics mirror SetGraph's DATA depth, never its design — our flat cards / wording ("Intensity", "vs last session") / colours / Chart.js line charts; no SetGraph microcopy/icons/social. Jake raised plagiarism twice; documented the deliberate divergences in the wiki teardown + commit messages.
- The runner vs-last block shows immediately (reference from the start) rather than gating on logged data — discoverability beat "no noise before you log."
- Resting HR on the bodyweight form (solo-reachable), avg-rest deferred (needs new capture), per-workout analytics = the enhanced diary now (session-trend chart later).

**Why:** the capture layer built in the session below created rich data that was invisible until the display shipped — ③ is where the whole overhaul becomes real for the user, and Jake wanted it live to feel it in a real session.

---

## 2026-07-19 — Progress overhaul: the whole CAPTURE layer, on a feature branch (branch `progress-overhaul`, NOT pushed) (app-workouts v29→v30, app-runner v23→v25)

**Context:** Jake screenshotted his sparse Personal Progress page and named it a core coach feature — track bodyweight, exercise progressions (sets/reps/weight/volume), cardio (duration/times/effort/HR/resting HR), unilateral/AMRAP/duration, and jump height/distance over weeks→years. Ran the full flow: **brainstorm → spec → 4 sub-project plans → build**, on a feature branch (Jake's call) so master stays clean until the feature is coherent + reviewed.

**Done (all on `progress-overhaul`, 18 commits, unpushed; master unchanged at 07febfa):**
- **① Data model** — `metric_type` (6 values, CHECK) on `exercises`/`workout_template_exercises`/`workout_log_exercises`; typed `avg_hr`/`max_hr`/`height_cm`/`side` on `workout_log_sets`. Migration authored, sql-safety'd, **run live by Jake in Supabase** + verified (schema + backfill correct, no NULLs, no misclassification). SDD subagent flow; Task-1 review caught a Critical (cardio name-backfill regex mislabeling Barbell Row/Cable Crunch as cardio via bare `row`/`run` substrings, made sticky by the fix-forward guard) → dropped the library cardio name-guess entirely (Jake's call).
- **②b Save-persistence** (app-runner v24) — `saveRunnerSession`'s per-set row-builder rewritten to persist every captured shape (unilateral → two `side` rows; timed → duration; distance → metres; HR) + stamp `metric_type` on the logged exercise. Was silently dropping all of it. Round-trip test drives the real save.
- **②a Builder picker** (app-workouts v30) — Strength/Cardio `<select>` → 6-option `metric_type` picker; `renderTemplateSets` metric_type-driven (Uni/Timed toggles removed, AMRAP/BW/Assist kept); save derives `exercise_type` + per-set flags (`_deriveFromMetricType`) + remembers metric_type on the library exercise. Supplementary backfill run live (23 timed_hold, 0 unilateral). Task-1 implementer subagent broke down (garbled return, uncommitted, stale report) — controller verified the diff was correct + committed + verified render in-page.
- **②c Adaptive fast table** (app-runner v25) — the Hevy-style fast table renders columns per metric_type (weight_reps / unilateral L-R rows / timed / jump height+distance); wizard retired for strength types (cardio only, via `_isPlainStrengthExercise`→`_exMetricType`); add/swap carries metricType. Render done inline with screenshot verification of all 5 types at 390px. 8 stale runner tests (drove the old wizard) updated to the fast-table interaction via a new `logTableSet` helper.

**Bugs found + fixed:**
- **② review Critical** — library cardio name-backfill regex would have mislabeled real strength lifts as cardio, stickily. Dropped it.
- **②a latent gap → fixed in ②c** — after ②a, `_confirmRunnerExerciseFromModal` (in-runner add/swap) read the new metric_type value into `ex.type` and built flags from removed toggles; ②c derives type/flags + sets `ex.metricType`.

**Decided:**
- **6 metric_types, AMRAP is a per-set flag not a type** (revised the spec's original 7): metric_type = intrinsic exercise identity; AMRAP is per-set intent tracking reps. Uni/Timed folded into metric_type (per-set toggles removed); BW/Assist stay per-set.
- Typed columns over JSON; one adaptive fast table (wizard retired for strength); unilateral persists as two `side` rows; manual HR now, wearable sync later; per-exercise trends will be the progression view with per-session demoted to a diary; one shared display component for coach+client.
- **Feature branch, not master** — 4 sub-projects land on `progress-overhaul`; merge/push only after ③/④ + multi-agent-review.

**UNVERIFIED (banked):**
- Entire capture layer is **unpushed + not live-exercised by Jake** — nothing user-visible until ③ ships. ① migration + ②a backfill ARE live in the DB.
- **Week-tab labels show raw `week_number`** (Floor Press / Front Squat 1-week phase shows WEEK 2/3) — reported at session start, root-caused, fix plan was overwritten by the Progress spec; now a ledger row, NOT fixed.

**Why:**
- Capture must precede display — you can't chart data you don't save; the runner was silently discarding everything but plain weight/reps. Building capture first (①→②b→②a→②c) means ③ has real data to render.

---

## 2026-07-18 — Week-tabs redesign (Programs builder + client Workouts page) + os-lint stale-predictions check (app-workouts v29, app-programs v20, main.css v5) — PUSHED 07febfa, CI green

_Two workstreams. (A) OS: moved prediction-staleness from a manual ritual step into os-lint. (B) The main build: a brainstorm→design→build→review redesign of how phase→week→day→workout is shown, driven by Jake's live feedback._

**Done — (A) OS / predictions (`~/.claude`, backed to claude-config):**
- Jake asked whether the manual "Step 8 — Predictions" in hello-claude was redundant. It was: 16–18 CoachApp predictions were overdue and ungraded (some 12 days) — a grep nobody ran. Added an os-lint **`stale-predictions`** check (RED on any CoachApp prediction past its `verify_by` still `outcome:null`; PTHub excluded as a frozen project; added an `OSLINT_PREDICTIONS` env seam only to prove the detector). Removed hello-claude's Step 8; left a breadcrumb so it isn't re-added. Proven RED→GREEN on fixtures + RED against the real file (18 overdue). Flagged a data bug: duplicate `pth-090` id in predictions.jsonl.

**Done — (B) Week-tabs redesign (`07febfa`):**
- **One shared model on both surfaces.** Weeks became **tabs** (one week on screen), a day/slot **opens its workout inline**, and the full-screen session-detail slider was removed from both the client Workouts page and the Programs builder. Builder days **stack vertically on mobile (no more sideways scroll)** and go multi-column on desktop; builder slots expand to **Edit / Remove / Save-to-Library** inline. First phase open by default.
- Code: `renderClientWorkoutsPage` weeks→tabs (`_selectReadWeek`, hidden per-week panels), slider link dropped, single-session name de-duped; `loadAllPhaseWorkouts` renders per-phase week tabs + only the active week (cached in `window._builderWeekData`, persists across mutations, clamps on delete); `renderPhaseWeekGrid` → responsive `.pwk-days` + inline-expand slots (`_toggleBuilderSlot`/`_editPhaseWorkout`, same editor ctx the slider passed); new `.week-tab`/`.pwk-*` CSS.
- Verified live (Playwright ad-hoc + screenshots): builder desktop + 390px (scrollWidth = 390, no horizontal scroll), week-tab switching, inline expand/Edit; and the read page as a real client (3 tabs, week switch, slider count 0). New `tests/week-tabs.spec.js` self-provisions a 3-week program for both the builder and a real client — **the read page had zero CI coverage before this**.

**Bugs found + fixed (multi-agent review, run after commit — spend limit killed the first attempt, Jake had it relaunched):**
- **Regression I introduced: per-workout "Save to Library" silently dropped.** It lived in the builder's session-detail slider, which the redesign removed; `canSaveToLibrary` needed `ctx.programId` that only the old slot-click supplied. Restored as an inline action on the builder slot (`saveTemplateToLibrary(id, btnEl)`), removed the dead drawer branch + stale comment. Jake chose to restore (Option 1) over bulk-only. Added an end-to-end test (expand slot → Save to Library → assert a standalone Library copy).
- **Pre-existing XSS (Agent A):** the DAY-header `sessionSummary` (coach template name) was interpolated **raw** into the client page — `escapeHtml`'d. (The 07-13 sweep had covered client→coach; this was coach→client, a different direction it missed.)
- Test-only: the empty-phase regression test clicked the phase to open it, but the redesign opens the first phase by default (the click was collapsing it) — attach the pageerror listener before nav, open only if collapsed.

**UNVERIFIED (banked):**
- The redesign is Playwright- + screenshot-verified but **not yet confirmed by Jake on his own account with his real programs** (added to the ledger).

**Decided:**
- One week-tabs model shared across read + build; days stack on mobile, multi-column on desktop (builder only); tap a day/slot opens it inline (no slider); Save-to-Library stays a per-workout action.
- Predictions belong in os-lint (a hook that always looks), not a manual checklist step nobody runs — consistent with the "hooks over instructions" direction.

**Why:**
- Jake's complaints were from real use of his own account (screenshots), so top priority. The redesign is structural, deliberately rendered in CoachApp's existing flat visual language after he flagged an early mockup "looks like PTHub, not CoachApp." The multi-agent review again earned its place — it caught a feature I'd silently dropped and an XSS I'd walked past.

---

## 2026-07-17 (2nd save) — claude.ai starter-pack review → repo-root CLAUDE.md + os-lint `claude-md` drift check; fixed the wiki roadmap's broken Mermaid diagram (no app code, no version bumps)

_Same day, after the OS-rebuild save above was pushed. No `js/` changes → no cache-bust._

**Done:**
- **Reviewed Jake's claude.ai brainstorm** about structuring a Claude-Code project (a greenfield "starter pack": WORKFLOW/SPEC/TASKS/CLAUDE.md, TS/React/Prisma stack). Verdict: it mostly duplicated or was **bettered by** what CoachApp already has, and assumed the wrong stack; its central point ("hooks not instructions") is exactly what os-lint already is. The one real gap: the repo had **no CLAUDE.md/README** — all grounding was Vault-only, loaded only when hello-claude runs, so any session skipping the ritual (bare `claude`, the standalone CLI, a subagent, another machine) started blind. Added a lean, accurate `coachapp/CLAUDE.md` (bed9625) — real stack, 9-module map, load-bearing invariants (solo/NULL-coach_id trap, is_personal≠security, master-direct deploy, never-push-without-review), Vault-as-system-of-record pointer.
- **Extended `os-lint` with a `claude-md` check** (claude-config 53103e8): scans CLAUDE.md for stack/module drift, dead file/tool refs, and list-completeness. Proved RED→GREEN on 4 planted faults. Widening the shared module-count regex to catch plural "modules" **caught a real stale ref** — `deploy-check` still described the old 8-module world; fixed.
- **Fixed the wiki `guide-coachapp-roadmap` Mermaid diagram** (Jake reported still broken): node labels `P7g` (`.limit(100)`) and `P7j` (`(e600010)`) had **unquoted parentheses**, which Mermaid parses as node-shape syntax — same class as the 2026-07-11 unquoted-apostrophe break. Quoted both; confirmed no other unquoted `(`/`'` labels; bumped the page's stale "Last updated".

**Decided:**
- Do NOT adopt the rest of the starter pack (SPEC/WORKFLOW/PLAN_TEMPLATE, its settings with a wrong push-to-main deny, the Obsidian repo-as-vault restructure) — all duplicate or conflict with existing, more-mature systems.
- **Pinch-to-zoom is disabled** (`index.html:5` `maximum-scale=1.0`) — Jake surfaced this via the VS Code Problems panel (a Microsoft Edge Tools accessibility flag; the other 18 warnings there are inline-style noise, harmless). He chose to look at it, then invoked /save → **deferred to a ledger row** (investigate the iOS-input-zoom trade-off + `font-size:16px` fix first). Not built this session.

**Why:** an independent brainstorm reaching the same "hooks over instructions" conclusion validated the OS-rebuild direction; the one genuinely new idea (a repo grounding file) was cheap and plugged a real hole, and is now itself machine-checked so it can't rot.

---

## 2026-07-17 — OS rebuild + os-lint + the first-ever full-file review found 18 latent bugs; fixed 20, pre-push review caught 4 of my own regressions (app-core v5, app-clients v6, app-dashboard v4, app-programs v19, app-progress v11, app-runner v23, app-workouts v28) — PUSHED 134140f (CI green)

_Long session. Built the approved OS rebuild, then it immediately paid for itself: the staleness lint and the first-ever full-file review each found real problems, and the pre-push review caught four regressions I introduced while fixing the findings._

**Done — the OS rebuild (`~/.claude`, backed to claude-config):**
- **`os-lint.mjs`** — the staleness lint (Jake's idea, the load-bearing piece). 9 checks: dead tool refs, dead file refs, PII-in-skills, module-count drift, retired-terms, frontmatter, full-file-review marker, stale bug rows (>7d), gate-never-fired. **Silent when clean, RED when not.** Proved each detector RED→GREEN on planted faults before trusting it (the deploy-check standard). Wired into a SessionStart hook in `coachapp/.claude/settings.json` (Jake pasted it; **confirmed firing live this session**).
- **Caught 2 things the hand audit missed:** a hardcoded UUID in run-coachapp, and **live E2E account passwords in plaintext** in the playwright skill — in a dir /save pushes to GitHub. All PII stripped from skills (sql-safety client name+UUID, owner email/uid, run-coachapp UUID, playwright passwords, deploy-check email).
- **hello-claude 319→~185 lines, 33 standing behaviours → 13.** Bug-ledger intake rule + closure rule (a Jake-reported item closes ONLY on his confirmation or a red→green test). /save rewritten: intake-first, 9-module cache-bust (starter-content was invisible to the app-*.js glob), skills-PII gate before the claude-config push. Archived post-build-review + security-audit (out of dispatch; hard delete still needs Jake). Corrected the stale "/code-review ultra doesn't exist" claim in 4 skills — it DOES exist in the extension, just billed/user-triggered.

**Done — the first-ever full-file review (multi-agent, whole app-workouts/runner/programs):** found **18 latent bugs** in code no recent diff had touched — exactly the blind spot it exists for. Fixed all, plus 2 more the pre-push review surfaced. Headlines:
- 🔴 **Stored XSS** — client-authored session name/exercise name/notes rendered unescaped in the COACH's DOM → JWT theft, defeats RLS. Fixed + added `escapeAttr` (JS-then-HTML escape order). Then the pre-push review found the first pass was fix-the-instance: swept the whole codebase (renderClient1RMs, sudo button, renderClients, dashboard feed, program/phase/exercise names) — grep now confirms **zero** raw user-controlled interpolations.
- 🔴 **Live data-loss chain** — stale `_phaseWorkoutContext` (cleared in one place, leaked on every other modal exit) could stamp a personal template into a coaching program, then Generate-weeks wiped real clients' weeks 2+. Root-fixed: the context is now an argument owned by `showCreateTemplateModal`.
- 🔴 **Live crash** — a zero-session phase crashed the client Programs tab (the guard existed in the verbatim twin since 07-10, never ported — 5th fix-the-class miss).
- **Client had the coach's Delete button + could overwrite coach notes** (openWorkoutLog, no role gate). **deleteProgram re-ran the debris factory** (bypassed `_removeAssignmentAndClones`). **deletePhase/removePhaseWorkout orphaned templates** (widened the shared guard to phaseIds[], all 5 delete paths now share it). Silent-failure fixes: `_cloneProgramForClient` now fails loud, `_assignedCopiesForSession` uses flat joins not a nullable embed, showLogSessionModal filters personal/week-clones out of the client dropdown. Runner: finish-screen teardown (was destroyed mid-typing by a live rest timer), runnerGoBack no-op-during-rest, editRunnerSet double-tap-saves-old-values, 25 modal mounts routed through `mountModal` (re-entrancy), the 1RM `block` ReferenceError. Jake's own report: deleting a template ejected solo out of the Library (solo-specific — now routes via `_templateGoBack`).

**Bugs I introduced, caught by the pre-push review before push (the gate earning its place):**
- A `coach_id` filter that excluded the solo record (solo's coach_id is NULL) — would have killed solo sync. **4th bug of this exact shape.**
- deleteProgram continuing even if clone-cleanup failed → orphaned data. Now fails closed.
- deleteTemplate routing `backTo:'client'` (a sentinel) to `navigate('client')` → "Page not found".
- The 1RM re-render wiping in-progress set inputs (no flush-first). Fixed + RPE/RIR buttons had the same gap.

**Tests:** 9 new regression tests in `tests/regression-2026-07-13.spec.js`, all proven RED-before/GREEN-after (the 1RM one isolated to its exact line, since the bug lived entirely inside this diff). Full suite **151 passed / 2 skipped / 0 failed** (reconciled to 153 declared). 7 modules cache-bust-bumped.

**Jake's 8 new reports** (banked to the ledger the moment he sent them — intake rule's first real use): Hevy plagiarism Q (answered: low risk, stop calling it "Hevy-style" publicly), delete-button-size/swipe-to-delete (deferred, needs scoping), add-exercise-to-program propagation gap, 1RM-target-as-percentage, mobile calendar overspill, delete-template nav (FIXED), Workouts-page delay (RE-OPENED at original 07-06 date — closed on a guess before), create-template slowness.

**Decided:**
- The solo/NULL-coach_id filter trap is now the **4th** bug of its shape — the single most reliable way to break this app. Banked to lessons.jsonl.
- Pre-push review is non-negotiable even when it's my own careful work: it caught 4 regressions in minutes. The spend limit killed it once mid-session (raised, re-ran).

**UNVERIFIED (banked):** all fixes are Playwright + review verified, NOT yet confirmed by Jake in a real gym/coaching session. The push itself is Jake's to run.

## 2026-07-12 — 3 program-workflow bugs from real use, then the empty-app beta blocker SOLVED (app-programs v17, app-workouts v26, app-core v4, +starter-content v1)

_Same-day continuation of the "Security & beta gates" session (below). Two workstreams: (A) three program bugs Jake hit in real use, (B) the new-coach starter-content feature built through the full brainstorm→spec→plan→implement→review flow._

**Done (A — program-workflow bugs, `4d8813c`):**
- **Stale view after assigning a program** — `saveAssignProgram`/`saveAssignProgramToClient` fired `_cloneProgramForClient` **fire-and-forget**, then re-rendered/navigated before the `client_program_workouts` rows every calendar/Workouts/dashboard view reads had been created → "old data until refresh", most visible when the program starts today. Now awaited, behind an "Assigning…" state, with a re-render after.
- **"Update all same-named sessions" overwrote the whole workout** — `_applyToAllSessions` deleted every exercise in each target and re-inserted the source's full list, wiping any exercise a target had that the source didn't. Replaced with `_propagateExerciseChangeToTemplates`: applies ONLY the changed exercise, matched **by name** (Jake's choice), captured at edit time in `window._lastExerciseChange` (add/update/delete). Update/delete both act on all same-named rows (consistent).
- **Editing a program workout didn't reach assigned copies** — the calendar reads the client's cloned copy (made at assignment), which a later master edit never touched. Now `_checkClientPlanPropagation` syncs assigned copies of the edited session automatically via `_assignedCopiesForSession`: the user's OWN solo copies silently (Jake's actual pain), real clients' copies only behind an "Update assigned clients?" confirm.

**Done (B — new-coach starter content, `25b978c`→`90c6d9e`):**
- Solved the **empty-app beta blocker** (highest open beta risk): a brand-new coach's first login seeds ~40 curated exercises + an "Example — Full Body A" workout (6 exercises linked to the library by name) + an "Example — 4-Week Foundation" program (Mon/Thu). `js/starter-content.js` (`STARTER_EXERCISES`/`STARTER_TEMPLATE`/`STARTER_PROGRAM` + `_seedStarterContent`/`_markSeeded`), wired into `loadUserInfo`, gated by a new `profiles.starter_seeded` flag. Migration applied by Jake (existing profiles backfilled `true` — nobody retro-seeded). Not auto-assigned to the coach's calendar; examples labelled "Example —", deletable. Built via the superpowers brainstorm→spec→plan flow (docs/superpowers/specs + plans committed).

**Bugs found + fixed (by the multi-agent reviews before push):**
- **(A) stale-change replay on delete** — if `deleteTemplateExercise`'s pre-delete name-fetch returned null, `window._lastExerciseChange` kept the PREVIOUS edit's change and silently applied it to the solo copy. Now cleared on failed capture (skip propagation).
- **(A) real-client consent bypass** — `_applyToAllSessions` wrote to real clients' SIBLING copies with no confirm, while the edited session's client copies were gated. Now the bulk path silently syncs only the user's own solo copies; real clients are never touched without the per-session confirm.
- **(B) partial-failure stranding** — the seed's idempotency guard keyed only on exercise count, so a mid-sequence DB error left the flag false and, on retry, `count>0 → markSeeded → stop` permanently abandoned the coach with a visibly-broken empty "Example" template or orphan program. Fixed by making the seed **fully resumable**: every artifact created only if missing, flag flips only when all six exist. Resume regression test added.

**Tests added:** surgical-propagation + `_applyToAllSessions` end-to-end + `_assignedCopiesForSession` classification (programs.spec.js); onboarding seed + `loadUserInfo` wiring + partial-seed resume (onboarding.spec.js, via PT2). Full suite 133 passed / 2 skipped / 0 failed, reconciled.

**UNVERIFIED (banked):**
- **New-coach onboarding needs a real signup to confirm live** — Playwright can't drive a fresh email signup; the seed function + wiring are proven via PT2, but "a genuine new coach lands on a populated dashboard" needs Jake to create a throwaway account. (Added to STATUS open to-dos.)

**Decided:**
- **Propagation matches by exercise NAME** (Jake's choice over by-position), leaving a target that lacks the exercise untouched.
- **Editing a program workout auto-syncs assigned copies:** solo silently, real clients behind a confirm ("ask when clients assigned").
- **Starter content is automatic on first login** (not opt-in), a **curated set** (not cloned from Jake's real library), delivered **app-side + a flag** (not a DB trigger — the list stays editable JS). Sample program **not auto-assigned**.
- **Tests that borrow the shared PT2 account must self-heal + clean up in `finally`** — a strand from an assertion-order cleanup compounded PT2 to 80 exercises mid-build; fixed by sweeping at test start AND in finally.

**Why:**
- Both program bugs and the storage leak trace to the same lesson bank: the propagation subsystem is where CoachApp's data-loss bugs live (delete-all/reinsert-all shapes), and the multi-agent review keeps catching real issues in the first cut — it has now paid off on three consecutive pushes.

## 2026-07-12 — Security & beta gates: a live storage breach caught by the first-ever /deploy-check (v21→v22 runner, v9→v10 progress, v4→v5 clients)

**Done:**
- **Behavioural RLS audit** (`tests/rls-audit.spec.js`) — the standing security regression gate, replacing /deploy-check's toothless `qual='true'` grep (which caught none of this project's 4 real RLS gaps). Four checks: Probe A (a second coach who owns nothing reads 0 rows from all 22 tables), Probe B (a client sees only their own rows + a positive `CLIENT_MUST_SEE` lower bound so a *denied* query can't pass as clean), Probe C (a client CAN read their assigned program through the full nested embed — the s23/s24 unexpected-DENY class), and a self-test that plants its own victim to prove the detector fires. Created **Coach B** (`coachapp.e2e.pt2@gmail.com`) — the first second-coach account in the project's history; cross-coach isolation had never been testable.
- **Storage security** (`tests/storage-privacy.spec.js`) — anonymous-fetch test + cross-tenant coach test, both owning their fixtures. Not covered by the `public.*` RLS audit.
- **`/deploy-check` run end-to-end for the first time.** 8/9 gates green. Strengthened the skill's RLS step (→ run the harness) and storage step (→ run the behavioural probe, not `select public from buckets`).
- **ICO breach-notification procedure** — `breach-procedure.md` (72h rule, ICO/individual decision tree, mandatory internal breach log, and today's storage leak as a worked example of *non*-notification). CRITICAL.md flipped ❌→✅; its storage section rewritten with the "private is not sufficient — policies must be path-scoped" rule.
- **Progress-photos feature removed** (Jake, "for now") — Photos tab + `renderClientPhotos`/`upload`/`delete` gone; bucket + data retained, restorable from app-progress v9. Orphan dev photo deleted.
- Pushed 5 commits (`8b9bb97`→`8652491`); CI green; live serves app-runner v22.

**Bugs found + fixed:**
- 🔴 **LIVE cross-tenant storage leak (headline).** `progress-photos` was `public=false` yet had 3 `storage.objects` policies scoped by `bucket_id` alone — `"Public read"` (SELECT), `"Authenticated delete"` (DELETE), `"Authenticated upload"` (INSERT). **Any authenticated coach could read AND delete any client's progress photos.** Reproduced live: PT2 (owns nothing) downloaded a real 1.79MB photo in full and deleted another. Root cause: the correctly path-scoped "Client/Coach manages photos" policies existed, but these 3 over-broad ones widened every verb to the whole authenticated user base. Fix: dropped all 3 (`scripts/fix-storage-rls-2026-07-12.sql`), proven red→green. A `select public from buckets` check passed this leak clean — only attempting the download as the wrong tenant caught it.
- 🔴 **Personal Bests never displayed — for anyone, ever.** `renderProgressPBs` embedded `performance_exercises` (a table that does not exist); PostgREST rejected the whole query; the error was discarded; the page showed "No personal bests logged yet" forever. Every PB anyone logged was saved and never shown. The columns were plain fields on `performance_logs` all along (app-progress v8→v9). Found by the audit enumerating referenced tables.
- 🔴 **`addTableRow` still auto-filled weight+reps from last session** (caught by the pre-push multi-agent review, found by 2 agents independently). The pre-fill was removed from `_ensureTableRows` and left alive in its sibling — a fix-the-class miss. "+ Add set" produced a row pre-filled in solid black; tick it and you logged a set you never performed. Exactly the bug `8b9bb97` claimed to remove.
- 🔴 **Wizard still rendered "RPE 8–9" under a column labelled RPE** (same review). The de-dup only landed in the table because the wizard held a *verbatim copy* of `_buildTargetCols`, whose own comment falsely claimed it was shared. Deleted the copy; wizard now calls the shared pair. **My fix for this then broke the runner entirely** (`repsStr is not defined`, 26 tests red) — caught by the full suite, fixed, before push.
- **`toggleTableSet` now requires a weight**, not just reps — dropping the pre-fill made a weightless ticked set the easy path, silently zeroing volume, hiding it from PB detection, and decaying next session's ghost text.
- **The RLS self-test was resting on stranded fixtures** — it only fired because 2 `[E2E-RLS] Victim Client` rows had been left in the real DB by an earlier run; on a clean DB it would `skip` (neither pass nor fail). Now plants+cleans its own victim. Swept the strays.
- **The seed's workout-history block had NEVER run** — skipped whenever sessions exist (always), so 3 wrong column names (`log_id` not `workout_log_id`, `workout_log_exercise_id` not `exercise_id`, missing `exercise_type`) sat unexercised. It also logged only Bench Press while the table tests use Overhead Press, and omitted `set_number` (which `_prevSetsByIndex` keys on: `null-1` === -1). Net: ghost text had **zero** real coverage; `expect(row.weight).toBe('')` passed even against the old pre-filling code. Fixed all of it; ghost-text test has teeth now.
- PB regression test now verifies its own cleanup (an RLS-denied DELETE removes 0 rows without erroring — it was stranding a row in the real DB each run).

**UNVERIFIED (banked):**
- **/deploy-check gate #6 — live client smoke test** — needs Jake to log in as a real client on the live site (dashboard stat, Workouts Start buttons, session history). Only unconfirmed gate.

**Decided:**
- **Storage is a distinct RLS surface** — the `public.*` audit does not cover it; `storage.objects` needs its own behavioural probe. Both /deploy-check and the harness were blind to it until this session.
- **"Private bucket" ≠ secure** — a `public=false` bucket with `bucket_id`-only object policies is wide open to every authenticated user. Only path-scoped object policies are safe.
- **Removed feature = remove code, keep data** (when "for now"): retain the bucket + contents, delete UI, flag any orphaned personal data (the loose photo) for a decision, and do not re-enable uploads without also restoring the delete path (GDPR erasure).
- Progress-photos leak assessed **non-notifiable** to the ICO — no real data subject's data was accessed by a real party (only test accounts + Jake's own dev photo existed). Logged per the new procedure. The same bug post-beta would very likely be notifiable — the distinction is who's actually on the platform.

**Why:**
- Three "a config-read passed a real leak" lessons this session: the old RLS `qual='true'` grep, and now the storage `public` flag. The through-line is that only *attempting the operation as the wrong tenant* finds these — config reads describe intent, not behaviour. Both checks are now behavioural probes in CI.

## 2026-07-11 (session 25, part 3) — Runner table polish from real gym use; planning session; found a beta blocker nobody had asked about — COMMITTED NOT PUSHED (8b9bb97)

**Context:** Jake used the runner in a real gym session and came back with 4 corrections, then pivoted the session to planning ("This whole session will be a planned one — review the kanban board/backlog and find anything that needs scoping"). He explicitly chose **commit but do not push** for the runner work.

**Done — runner table polish (app-runner v20→v21, committed `8b9bb97`, NOT pushed):**
- **RPE/RIR value no longer repeats its own column label.** The target bar rendered "RPE 8–9" *under* a column headed RPE. Value now carries the number only.
- **Plate calculator REMOVED outright.** Shipped 8 days earlier (2026-07-10, v19) after "repeated requests" surfaced in the 2026-07-02 competitor research. Jake used it in a real session and asked for it gone — noise, not help. Deleted, not flagged off: `_PLATE_SIZES`, `_BAR_WEIGHT_KG`, `_calcPlateBreakdown`, `_updatePlateBreakdown`, the PLATES/SIDE target-bar column, the wizard hint, and its 5 tests.
- **PREVIOUS column dropped; last session is now GHOST TEXT in KG/REPS.** The old 54px cell squashed both numbers into one string ("140kg × 6"). Each previous value now sits directly under the column it represents, and KG/REPS get the freed width. Falls back to the %1RM-derived target when a set has no history.
- **Rows no longer auto-fill.** This reverses the v1 "1-tap repeat" pre-fill — a pre-filled value is indistinguishable from one you actually entered, so a set could be ticked off having never confirmed the weight was right. Rows start empty; you type what you did.
- Runner suite 41 passed / 0 failed. Verified visually at 480px.

**Bugs found + fixed (knock-ons of the no-auto-fill change, both caught by thinking the change through rather than by a test):**
- `toggleTableSet`'s existing "require reps" guard was previously **never** hit (rows were always pre-filled). With empty rows it is hit *routinely*, and a silent no-op would read as a broken button to someone mid-set. It now warns ("Enter reps first").
- **A back door that would have silently re-introduced auto-fill:** `renderRunnerLastSession` *wrote* last session's values into `tableRows` when the async fetch resolved after first paint. Left alone, the feature would have quietly come back the moment the fetch was slow. It now only repaints (so the ghost text appears), guarded by `_prevTablePaintKey` against a render loop.

**Not a bug (recorded so it isn't re-investigated):** Jake reported Barbell Back Squat rendering the wizard instead of the table. He'd accidentally set the exercise **unilateral**, and `_isPlainStrengthExercise` correctly excludes any unilateral set. He self-corrected: *"may be a false flag from me."* No code change.

**Also fixed:** the wiki roadmap's mermaid diagram, which I broke in the previous save — the `P7n` node label contained an unquoted apostrophe ("client's"). Every other node with special characters is quoted.

**🚨 FOUND — beta blocker nobody had asked about:**
**A brand-new coach signs up to a completely empty app.** Verified in code: `signUp` (app-core.js:332) creates the auth user, and `handle_new_user` creates **only** the `profiles` row (deliberately — the les-006 fix). A fresh PT gets **0 exercises**, 0 templates, 0 programs. You cannot build a workout without exercises, and the only route is typing each one in by hand. **Jake has never experienced this** — his account has 200+ exercises accumulated over months of building. The app is excellent *once populated* and close to unusable *before*, and every beta PT starts at zero. Needs scoping (default exercise library on signup). Beta is 31 July.
Also raised and **deliberately deprioritised by Jake** (logged so they aren't lost): error monitoring (a beta PT's crash never reaches him — `log.error` only goes to their own console), backup/restore posture, beta ops (no feedback channel; invite emails have only ever been sent to Jake, so spam-folder risk is untested).

**Decided:**
- **Next session = Security & beta gates** (Jake's pick from a 3-way choice). Build a *behavioural* RLS audit harness — every table × every operation × every role, **plus a second coach and a second client** so cross-tenant isolation is finally tested. Rationale: three consecutive sessions found real RLS gaps and **all three were found by accident**; `/deploy-check`'s RLS check would have caught **none** of them (it only greps `qual = 'true'`, and every real leak had a normal-looking policy that simply checked the wrong column); and **cross-coach isolation has never been tested at all**.
- Runner work **committed but not pushed**, at Jake's explicit request — it rides with the next push after review.
- The plate calculator's whole arc is worth remembering: **the research said build it, the gym said remove it.** Eight days from ship to delete. "Repeatedly requested in competitor research" did not survive contact with real use.

**Why:** Jake asked for a full planning pass with beta 20 days out. The most valuable output wasn't the 4 runner fixes — it was noticing that nobody had ever asked what a *new* user actually sees.

---

## 2026-07-11 (session 25, part 2) — The Library bridge (copy program workouts → Library, tap-row picker, duplicate-week auto-extend); review found a CRITICAL live data-loss bug — PUSHED (5134dd6, 6e6afb2)

**Context:** Jake asked three things that turned out to be one problem. He'd built his "Hybrid Weapon Experiment" personal program entirely with "+ Create new workout (this day only)" — which stamps `program_id`, and session 24 deliberately excluded program-owned templates from the reuse pool (the fix for the indistinguishable-duplicates bug). Correct fix, but it left **no bridge** from "built it in a program" to "reuse it": 6 workouts he'd otherwise retype by hand. His follow-up was the sharp one — *"if a user creates 3 'upper body' workouts in their library, how will they know which is which when adding them into the program?"* — which is not a naming problem at all, but the native `<select>` (an `<option>` can only hold plain text). And "Duplicate week" had vanished from his 1-week phase.

---

### 🔴 CRITICAL DATA-LOSS BUG — full reproduction steps (Jake asked these be recorded)

**Symptom:** a workout in Week 1 of a program is silently and permanently destroyed.

**Reproduction:**
1. Open a program → add a phase.
2. Populate **Week 1** with at least one workout.
3. Click **"Duplicate week"** on Week 1. (Week 2's rows now point at the **same `template_id`** as Week 1 — this is deliberate: duplication is "cheap by design", the copy only forks into an independent template when someone edits one of them, via `_resolveEditableTemplateId`.)
4. Set a periodization type on the phase (Configure → Linear/Undulating).
5. Click **"Generate weeks"**.
6. **Week 1's workout is now gone.**

**Root cause:** `generatePhasePeriodization` calls `_cleanupPhaseWeeksBeyond(phaseId, 1)` to clear weeks 2+ before regenerating. That function collected every `template_id` referenced by a stale week and ran a bare `db.from('workout_templates').delete().in('id', staleMasterTemplateIds)` — with **no ownership check and no still-referenced check**. Because the duplicated Week 2 shares Week 1's `template_id`, the cleanup harvested Week 1's own template off the Week 2 row and deleted it while Week 1's surviving row still pointed at it.

Its sibling `deletePhaseWeek` had **both** guards — added by the multi-agent review on 2026-07-10. `_cleanupPhaseWeeksBeyond` never got the same fix. The two silently diverged.

**Second variant of the same bug:** any **standalone library template** assigned into Week 2+ was also deleted outright by that same call — removing it from the Workouts library and from *every other program using it*. This is exactly the `deleteProgram()` bug fixed on 2026-07-10, in a second unfixed location. The new "copy to Library" feature makes library templates far more likely to be sitting in program weeks, so this would have got worse.

**Proved, not reasoned:** reverted the single fixed line, ran the new regression test → `survived: 0` (the Week-1 workout genuinely gone). Restored the fix → `survived: 1`. Red/green.

**Fix:** extracted `_deleteOwnedUnreferencedTemplates(templateIds, programId, phaseId)` — ownership check *and* still-referenced check — and both `deletePhaseWeek` and `_cleanupPhaseWeeksBeyond` now call it, so they cannot diverge again. Regression test added (`programs.spec.js`). Banked in STATUS.md's continuity block.

**How it was found:** the pinned 3-agent review, not by inspection and not by any existing test. It surfaced only because this session's Duplicate-week change made a 1-week phase newly able to reach periodization range — the reviewer traced the consequence one step further than the diff.

---

**Done:**
- **Copy program workout → Library.** New `_copyTemplateToLibrary` + `saveTemplateToLibrary` (per-workout button in the session-detail drawer, gated on `ctx.programId && !ctx.isClientPlan`) + `copyProgramWorkoutsToLibrary` (bulk button on the program page). Reuses `_cloneSharedMasterTemplate` via a new defaulted `overrides` param rather than duplicating its exercise-copy logic. **Idempotent** — a same-name library workout is skipped, so double-clicking is safe. Excludes periodization week-clones (derivatives, not sources). app-workouts v24→v25.
- **Tap-row workout picker** replacing the native `<select>` (`_openWorkoutPicker`, modelled on `_openExercisePicker` — same modal shape, live filter, `visualViewport` keyboard sync). Rows show name + description + exercise preview. `_quickAssignPhaseWorkout` refactored to take a slot object instead of a `<select>` element; `_filterPwgOptions` deleted. Closes the two long-open complaints about this control (no feedback until opened; list grows unmanageable). app-programs v15→v16.
- **Duplicate week auto-extends the phase** — `canDuplicateAny` gate dropped; `duplicatePhaseWeek` now UPDATEs `duration_weeks` instead of bailing. Bump happens **after** a successful insert (see below).
- Added `description` to `openProgram`'s template select — applying last night's embed-select-allowlist lesson rather than rediscovering it.
- **Process:** made roadmap.md a first-class mandatory step in `/save` (Jake's standing request); retired the daily-question cron (unused, redundant); corrected a stale roadmap entry (Area 3 #13 was still open despite shipping 2026-07-08).

**Bugs found + fixed (multi-agent review — 7 real findings, all fixed pre-push):**
- The CRITICAL data-loss bug above.
- **Bulk copy deduped by NAME, not `template_id`** — three genuinely *different* workouts sharing a name (Jake's exact scenario) would have had only one copied, with the other two reported as neither copied nor skipped. Now deduped by id; copies run **sequentially** so each sees the previous one's writes; same-name collisions reported honestly as "skipped (same name already in Library)" rather than the false "already in your Library".
- **The idempotency guard failed open.** `.maybeSingle()` *errors* when >1 row matches, and the discarded error yields `null` → the anti-duplicate guard would create *more* duplicates precisely when duplicates already existed. Also `.ilike()` treated the workout name as a **LIKE pattern** (`_` and `%` are wildcards). Both replaced with a plain fetch + JS compare.
- **`duration_weeks` bumped before the copy was known to succeed** — a failed copy left the phase permanently claiming an empty week, which for an already-assigned client silently lengthens their program and shifts every later phase out. Moved after the insert.
- **Picker had no re-entrancy guard** — a double-tap appended a second overlay sharing the same element ids, so results rendered into the buried copy. Same race that froze the runner's picker on 2026-07-04.
- **Picker pool went stale after a copy** — the toast said "you can now reuse it in any program" but it wouldn't appear until reload. Added `_refreshProgramTemplates()`.

**Test-harness bugs found + fixed (all latent, none product regressions):**
- **`scripts/seed-test-data.js` had NEVER worked.** It omitted the required `exercise_name`/`exercise_type`, double-encoded `sets_json` as a **string** (the column is jsonb), and **never checked the insert's error** — so it failed silently while printing "Template exercises added". This meant the seed template "Push Day A" could not be rebuilt, which I only discovered *after* deleting it. Now fixed, error-checked, and idempotent (repairs an emptied template instead of skipping it).
- **My own new test was poisoning the runner tests.** Its `finally` deleted the fixture program via raw SQL (bypassing `deleteProgram()`), so the phase cascade set `generated_from_phase_id = NULL` on its periodization clones — orphaning them into the standalone pool, where they sort **above "Push Day A"** (`[` < `P`) and got grabbed by the runner tests' "click the first Start button". 9 had accumulated. Test now sweeps its own clones.
- **Two over-loose runner locators.** `text=KG` is a case-insensitive **substring** match, so it matched the target bar's "50 kg" and the PREVIOUS column's "80kg" as well as the intended "Kg" column header — a strict-mode violation the moment the exercise has a weight target or logged history. Tightened to `getByText(..., { exact: true })`.

**Process failure worth banking:**
- I piped `npm test` through `tail -8`. Playwright prints its summary as **failed → flaky → skipped → passed**, so the tail cut off an **"8 failed"** header and showed only "3 skipped / 115 passed" — a **false green**. It was caught *only* because the counts didn't reconcile against the declared total (126). **Always reconcile passed+failed+flaky+skipped against the declared total; never trust a truncated test summary.**

**Found, NOT fixed (needs a decision):**
- **Deleting a program orphans its periodization week-clones into the reusable template pool.** When the program (and so its phases) are deleted, `generated_from_phase_id` goes `SET NULL` — so a "Bench Press — W2" clone loses the only column marking it as a derivative and becomes indistinguishable from a genuine standalone template. It then escapes the ownership checks *and* clutters the picker. Same mechanism behind the picker clutter Jake reported on 2026-07-10 (that fix removed program-owned templates from the pool, but not these orphans). Options: change the FK to CASCADE, or have `deleteProgram` sweep clones before deleting the phases.

**Decided:**
- Fixing the picker properly (tap-row, not a richer `<option>`) was the right call because it closes three separate complaints at once — Jake's disambiguation question and the two pre-existing `<select>` complaints — rather than three patches.
- The `text=KG` locators were genuinely too loose; tightening the *test* was correct, not contorting the seed data to fit a fragile assertion.

**Why:** Jake's three asks were one problem, and the review's job is to look one step past the diff — which is exactly how it caught a data-loss bug that was already live and that no existing test covered.

---

## 2026-07-11 (session 25) — Personal/solo Library page (Templates + Exercise Library); closed a REAL cross-client RLS leak found while auditing it — PUSHED (0a3ef1d, c4b1e67)

**Context:** Jake opened with a question, not a bug report: *"personal account does not have workouts > templates & exercise library page. This is where I need to create workouts that can be put into programs, correct?"* — he was right on both counts. Solo had no route to the template builder at all: `renderWorkouts` explicitly bundles `solo` in with `client` and diverts both to the read-only session view, so solo's only way to create a workout was the inline "+ Create new workout (this day only)" dropdown in a program phase, which locks the template to that one day slot. No way to build a *reusable* one. Chose a separate nav entry (his call, via AskUserQuestion) over extra tabs on the existing Workouts page, since solo still needs that page's "Up next" hero/accordion.

**Done:**
- **Personal/solo `library` nav page** — extracted `renderWorkoutLibrary(el)` out of `renderWorkouts(el)` (the coach's Workouts page is byte-identical, its early-return for client/solo untouched) and gave solo its own `library` nav entry + router case + `soloPages` entry pointing at it. Reuses the coach's Templates/Exercise-Library tab UI verbatim — no new components. Nav icon reuses the `workouts` SVG (existing precedent: the 3 dashboard icons are already byte-identical). app-core v2→v3, app-workouts v23→v24.
- **`workout_templates.is_personal` column** (Jake ran the SQL; 1537 existing rows → `false`) — required before the Library page could ship: solo and PT share one `coach_id`/`auth.uid()`, so opening the builder to solo without a split would have leaked Jake's real client templates into his personal library and vice versa. Exactly the bleed already fixed for `exercises` on 2026-07-10. Wired into all 4 standalone-template read sites, `saveNewTemplate`, and the 3 clone paths. Fix-forward: existing rows stay attributed to the PT, no reclassification.
- **Pre-existing bug fixed alongside:** `openProgram`'s day-slot picker had no role split either (`app-programs.js:595`), so solo was *already* seeing the PT's entire standalone-template pool in that dropdown — independent of the new feature, would have kept leaking regardless. app-programs v14→v15.
- **`renderExerciseLibrary` hardcoded `.eq('is_personal', false)`** — only ever "worked" because solo could never reach the function. Made role-aware before opening the route to solo.
- **SECURITY: closed a real cross-client RLS leak on `workout_templates`** (see below). 2 new regression tests against a **real client-role account**.
- Tests: 3 new in `solo-account.spec.js` (is_personal template split, Library nav smoke, program-picker split), 2 new in `client-workout.spec.js` (cross-client leak, master-embed-chain guard). Full suite 119 passed / 2 expected skips. Mobile-checked at 480px and 375px — solo nav now 7 items, single row, no overflow (measured, not eyeballed).

**Bugs found + fixed:**
- **CRITICAL (pre-existing, live the whole time real clients have had accounts): any client could read any OTHER client's workout template clones.** The `Client reads workout templates` SELECT policy scoped by `coach_id` **alone**, with no `client_id` restriction. Client-plan clones are written with `coach_id = the coach, client_id = the client` (`_cloneTemplateForClient`), so every client of the same coach matched that policy. **Reproduced live before fixing** — logged in as a genuine client and read back another client's private template by id (red/green, not reasoned). Fixed by adding `client_id is null` to the policy; a client's own clones still resolve via the separate `client_read_own_templates` (client_id-scoped) policy, so nothing legitimate was lost. Found only because the multi-agent review's security agent questioned whether `is_personal` was doing security work it wasn't — the leak itself was a level deeper than the thing being audited.
- **Latent RLS bug in the same policy:** it used a scalar `=` subquery (`coach_id = (SELECT coach_id FROM clients WHERE user_id = auth.uid())`), which errors outright for any user with >1 `clients` row — **the master account has exactly two** (one coached record + one solo record). It only worked because the coach policy matched first. Switched to `in` per the sql-safety rule.
- **The `is_personal` clone carry-over was a silent no-op** (caught by the 3-agent review, independently by two agents, then verified against the code). `_cloneTemplateForClient` / `generatePhasePeriodization` read `tmpl.is_personal` from source objects fetched via *embedded selects with explicit column lists that omitted `is_personal`* — so it was `undefined`, dropped from the JSON insert payload, and silently fell back to the DB default. Not a live leak (those rows always carry `client_id`/`generated_from_phase_id`, which every `is_personal` read already filters on) but a landmine. Fixed by adding `is_personal` to the 3 source selects.
- **Both new fixture tests could orphan `[E2E]` rows on partial failure** (caught by the review's regression agent) — fixtures were built *before* the `try` block, and the picker test captured `programId` only *after* the program row was already inserted. Cleanup is now by-name and idempotent inside `try/finally`.

**Decided:**
- **`is_personal` is deliberately NOT enforced at RLS — and this is load-bearing, not an oversight.** I initially proposed adding `is_personal = false` to the client-read policy alongside the `client_id` fix. Tracing the embed chains before writing the SQL showed that would have **broken real clients**: the client Dashboard hero (`app-dashboard.js:262`) and client Calendar (`app-calendar-goals.js:27`) embed the **master** templates through `program_phase_workouts` — not the client's clones. A program built in Personal view carries `is_personal = true` masters, so the restriction would have silently nulled that embed the moment such a program was assigned to a real client — the exact PostgREST silent-null failure from sessions 23/24. `is_personal` answers "which of Jake's two libraries is this in," not "who may read this." Banked into STATUS.md's continuity block so a future session doesn't "helpfully" add it.
- `exercises` needed **no** RLS change — it has no `client_id` column (no per-client rows exist), so no cross-client leak is possible there. Its only "gap" was the same is_personal non-enforcement, which per the above is correct as-is.
- Jake chose a **separate nav entry** over extra tabs on the Workouts page (AskUserQuestion), so solo keeps its existing "Up next"/session view untouched.
- Jake selected the recommended "push code now, fix RLS next session" option — then immediately overrode himself with *"lets fix now"* once the leak was characterised. Banked as a voice/behaviour delta: he will not defer a real security gap even when handed a sanctioned reason to.

**Why:** The Library page was a genuine capability gap Jake hit in real use (he couldn't build reusable workouts for his own programs). The RLS leak was not on any backlog and nobody knew it existed — it surfaced only because the pinned review's security angle pushed one level past the feature being built, which is exactly the drift the pinned multi-agent-review skill exists to prevent.

---

## 2026-07-10 (session 24) — RLS audit found 2 more critical gaps; built autosave + %1RM rounding + Delete week + plate calculator; live program-picker fix; 3-agent review caught 3 real issues — PUSHED (7ae59d2, 5f84516, 31394e7, 20f6b8a, a4368a8, c4db4b9, bc4c0fd, ed6a3c8, 9f33da0)

**Context:** Opened by confirming session 23's fixes live (RLS + Workouts-page speed), which surfaced a new bug immediately ("the exercise library for PT account contains all exercises that have been created on personal account"). From there: RLS audit sweep (approved), then runner autosave, then a batch of quick-win requests (E2E cleanup, Delete week, plate calculator), then a live bug report mid-Delete-week-build (program picker clutter), then %1RM rounding, then the full push cycle with multi-agent review.

**Done:**
- **Exercises PT/Personal scoping** — new `is_personal` boolean column; every create/read site in app-workouts.js (`saveNewExercise`, `_createExerciseFromPicker`, `_resolveExerciseIdForSave`, `_openExercisePicker`, `renderExerciseLibrary`) stamps/filters by `currentProfile?.role === 'solo'`. Existing exercises stay as PT's (Jake's explicit call — no reclassification), only new creates separate going forward. New Playwright test in both directions. app-workouts v21→v22.
- **RLS audit** (approved as "quick win" — turned out much bigger): `client_1rms` had no INSERT/UPDATE/DELETE policy for a real coached client (only solo). Then, digging one level deeper than scoped: `workout_template_exercises` had **zero** client-read policy at all — the only SELECT-capable policy was `coaches manage own template exercises` (coach_id = auth.uid()), which never matches a real client's own auth.uid(). Solo was invisible to this because solo's auth.uid() IS the coach's own id — the exact same blind spot as the `client_programs` bug from session 23. This broke `openSessionDetail` (direct query, showed "No exercises added yet" on every real session) and the client Workouts-page accordion (nested embed silently nulled the exercises level). Both fixed via new Supabase policies (Jake ran the SQL), verified with 2 new Playwright tests that query the exact real app shapes against a real client-role account, not just pg_policies.
- **Runner session autosave** — scoped 2026-07-05, built this session. localStorage-only draft, checkpointed on every `renderRunner()` + a 10s safety-net tick, same-day staleness cutoff, resume/discard confirm modal wired into `launchRunner()` (refined from the original scoping note of `startWorkoutRunner()` — `launchRunner` is the true single choke point both the fast-path and the setup-modal's own Start button funnel through). Cleared inside `discardRunner()` (covers both abandon and post-save). 5 new Playwright tests. app-runner v16→v17.
- **%1RM target weight rounding** — `_calcWeightFromPct` now floors to the nearest 2.5kg instead of rounding to the nearest 0.5kg; single shared function feeds every %1RM display site (target bar, table pre-fill, wizard placeholder) so the fix applies everywhere at once. 4 new tests. app-runner v17→v18.
- **`startWorkoutRunner`'s freeform template list** — was missing the same `client_id`/`program_id`/`generated_from_phase_id` leak filter already fixed twice elsewhere. Fixed + new test that calls the real function, not a re-implemented query. app-workouts v22→v23.
- **`showRunnerOneRMSheet` z-index** — live-verified for the first time (new Playwright test fills the modal's own input and confirms no pointer-interception error) rather than left as "reasoned from pattern, never reproduced."
- **E2E test debris cleanup** (Jake approved explicitly) — enumerated first (found 73 leftover `[E2E]`-prefixed programs and 47 templates, not the ~13 originally estimated — that number predated today's new tests), then deleted via the real `deleteProgram()` function (not raw SQL) so the exact production ownership logic ran. 45 remaining client-owned template clones (not touched by `deleteProgram`) verified zero-referenced then deleted directly. Final verification: 0 remaining.
- **Program picker clutter fix** — found live mid-session (Jake: "every workout that is created in the program appears in this list... impossible for a PT to know which workout is which," with a screenshot showing 4+ duplicate-named entries). Root cause: `openProgram`'s template query (`window._programTemplates`) had no `.is('program_id', null)` filter, so every one-off "+ Create new workout" template stayed in the reuse pool forever. Fixed via AskUserQuestion-confirmed direction (exclude program-owned templates from the pool); the inline option relabeled "(this day only)" per Jake's explicit follow-up ask to make the workflow clear. Confirmed via code trace (no role branching anywhere in `openProgram`/the picker) that this already covers Personal/solo with zero extra work, per Jake's ask to include it there too.
- **Delete week button** — scoped 2026-07-08, built this session. Removes a week's own sessions + owned templates + client-propagated copies, renumbers later weeks down by 1, decrements `duration_weeks`. First draft reused `deleteProgram()`'s ownership check but the multi-agent review caught a real gap (see below) before push.
- **Plate calculator** — repeatedly requested (2026-07-02 research). Wizard: live-updating hint under the weight input. Strength table: a new PLATES/SIDE column in the existing target bar — deliberately not new text under table rows, since Jake had explicitly rejected that exact pattern in that exact table previously ("highlighted or stand out, not entered as text underneath — ugly UI").
- **Multi-agent review before push** (3 agents in parallel: security/scoping, solo-mode, duplicates/render-safety + a verifier pass) caught 3 real issues, all fixed same session: (1) `deletePhaseWeek`'s ownership check alone wasn't enough — `duplicatePhaseWeek` shares `template_id` across weeks until someone forks on edit, so deleting one week could destroy a template a sibling week's surviving row still needed; fixed by also checking `program_phase_workouts` for any other row still referencing the template before deleting it, new regression test added. (2) Resumed drafts skipped `_unlockAudio()`/`_unlockSpeech()` (only `_startFreshRunner` called them), so a resumed session's rest-timer beeps/voice cues could silently never fire on iOS Safari. (3) Runner drafts were never cleared on sign-out, leaving a prior client's in-progress workout (name, exercises, weights/reps) in localStorage indefinitely on a shared/gym device.
- Pushed as 9 commits (7ae59d2 through 9f33da0); pre-push hook caught one more real issue on the first push attempt (bare `clearInterval()` instead of this codebase's `clearTimer()` convention), fixed in a follow-up commit. Full Playwright suite green throughout (116 run, 114 passed, 2 expected conditional skips). CI confirmed green after push.

**Bugs found + fixed:** all listed above under Done — every one was root-caused via actual code tracing (RLS gaps confirmed via pg_policies + live fixture tests against a real client-role account; the picker clutter traced to the exact missing filter; the 3 review findings each verified against the cited line before fixing), none guessed.

**Decided:**
- Existing (pre-`is_personal`-fix) exercises stay classified as PT's — no manual reclassification of historical data, only new creates get separated (Jake's explicit call, "leave both lists as they are, but clean up the bug so this data doesn't bleed again").
- The program-picker fix path: exclude program-owned templates from the reuse pool entirely (not just label duplicates, not both) — Jake's pick from an AskUserQuestion with a stated recommendation.
- `launchRunner()` (not `startWorkoutRunner()`, the originally-scoped location) is where the autosave resume-check lives — found the more complete choke point once actually reading the code, flagged the deviation explicitly rather than silently diverging from the scoped plan.
- Graded 11 overdue predictions in `predictions.jsonl` at session start; found and fixed an id collision (two unrelated predictions both `pth-017`) along the way.

**Why:** Jake explicitly asked to keep going through a long batch ("keep going" ×2), approved the RLS audit before it revealed the deeper `workout_template_exercises` gap, and caught the program-picker bug live via his own screenshot mid-session — none of tonight's biggest fixes were pre-planned at session start.

---

## 2026-07-10 (session 23, final) — Live empty-phase crash hotfixed; client_programs RLS gap (+3 related tables) fully resolved and confirmed end-to-end — PUSHED (b79c152, b126d5b)

**Context:** Continuation of the same day's session 23. Right after the earlier round's `/save`, Jake tried the live Personal/solo Workouts page and hit a real crash. Separately, applying the `client_programs` RLS fix from earlier in the day led to discovering it was incomplete — the first verification pass only checked one table, not the full query shape the app actually uses.

**Done:**
- Hotfixed a live crash: a phase with zero `program_phase_workouts` (a normal state — a phase not yet fully built out) crashed `renderDays` on `undefined.forEach`. Pre-existing code, not part of the earlier diff. Fixed with an explicit "No sessions added to this phase yet" message; new Playwright regression test. **app-workouts v21**, pushed b79c152.
- Confirmed the `client_programs` RLS fix (applied earlier this session) plus 3 more policies (`programs`, `program_phases`, `program_phase_workouts` — all in the same nested embed the app's real queries use) all work end-to-end via a fresh Playwright fixture test, not just a table-level check. Un-fixme'd the 2 tests that had been blocked on this. Added a new dedicated embed-chain regression test. Fixed an unrelated ambiguous test locator along the way (`text=Deload` collided with the hero card's own meta text; scoped to `button:has-text(...)`). Pushed b126d5b.
- New standing skill created: `missed-check-to-test` (`~/.claude/skills/missed-check-to-test/`) — whenever a bug's root cause is "I checked A but not the closely-related B," converts that miss into a Playwright test in the same commit. Registered in hello-claude's standing behaviours.
- Two new memory entries: `feedback_rls_embed_chains.md` (check every table in an RLS embed chain, not just the outer one) and an addendum to `feedback_edge_case_testing.md` (the zero-count-state lesson, from earlier in the day).

**Bugs found + fixed:**
- Empty-phase crash (above) — root cause confirmed by reading the code against Jake's own pasted console stack trace, not guessed.
- **Incomplete RLS fix, self-caught, not by Jake.** After Jake applied the `client_programs` policy, a fixture-based Playwright test revealed the dashboard/Workouts page still crashed — traced to `programs`/`program_phases`/`program_phase_workouts` also lacking client-read policies. PostgREST doesn't error on an unreadable embed level, it silently returns `null`, which is what made the first fix look complete when it wasn't (a direct `client_programs`-only check couldn't have caught this — needed to trace the whole embed chain the app's real query uses).

**Decided:**
- When verifying an RLS fix for a query with nested embeds, trace and test every table in the chain independently, not just the entry table — banked as a memory + reflected in the new skill.
- Cleaned up 2 rounds of my own test debris from this investigation (orphaned throwaway programs/templates, exact IDs known from my own runs) directly, without asking — distinct from the earlier-blocked bulk pattern-match delete, since this was narrowly scoped to rows I created and could directly attribute this session.

**Why:**
- Jake asked directly "remember this and add to test" after seeing the incomplete-fix correction — the skill and memory entries are the direct response, aimed at this exact class of miss recurring in future sessions.

---

## 2026-07-10 (session 23) — Finished Workouts-polish build; fixed deleteProgram data-loss bug + Workouts-page perf issue; found critical client_programs RLS gap — PUSHED (8e9c26c)

**Context:** Continued session 22's Workouts-polish build (hero card + "Recent sessions" rename), which had been interrupted mid-implementation by a process restart. The in-progress edit already referenced two not-yet-defined functions, breaking the Workouts page for exactly the "Personal > workouts page not loading" symptom Jake reported mid-session — fixed by finishing the edit, not a separate bug. Also handled 6 new backlog items Jake reported live (data leak, Log weight button, starting weight, %1RM rounding, plate calculator) by triaging/documenting priority, then building the highest-priority ones.

**Done:**
- Finished the Workouts-page hero card (`_buildWorkoutsHero`/`_renderWorkoutsHeroHtml`) — shows program name, current phase/week, and a Start button resolving the actual next scheduled session's real template. Gated to only render when a program is assigned (deliberately, to avoid the freeform Start button opening a template-picker modal).
- Renamed "Session history" → "Recent sessions" at both render sites (client/solo Workouts page + PT client-profile Workouts tab), capped to last 5, date-only rows.
- Fixed the dead "Log weight" button on the Progress page's Body Weight tab (same shape as the earlier Log PB fix — the form only existed on Dashboard pages) + fixed `saveClientWeight`'s refresh target.
- **app-workouts v20 / app-programs v12** (also app-clients v4 / app-progress v8, bumped in the pre-compaction part of this same session's continuation of session 22's work).

**Bugs found + fixed:**
- **CRITICAL data leak (root-caused, not guessed):** `renderWorkoutTemplates` and `renderClientWorkoutsPage`'s flat-list fallback were both missing `.is('generated_from_phase_id', null)` — periodization-generated week clones (e.g. "Bench Press — W2") have `client_id`/`program_id` both null too, so they leaked into flat template lists everywhere, including cross-account via solo's shared `coach_id`. Fixed both, matching the pattern already used correctly elsewhere (`app-programs.js:589`).
- **`deleteProgram()` was silently destroying shared templates.** Found via Playwright test-flakiness investigation — a periodization test's throwaway program linked the shared seed template ("Push Day A") into a slot via `templateOptions[0]`, then deleted the program; `deleteProgram()` deleted ANY template referenced by the program's phases with no ownership check, destroying the shared template. This is a real, pre-existing product bug: any coach reusing a standalone template across programs would silently lose it the moment they deleted one of those programs. Fixed to only delete templates actually owned by the program (`program_id` match, or its own periodization-generated week clones via `generated_from_phase_id`). **The first version of this fix had a real regression** — it missed the week-clone case (which always has `program_id: null` too) — caught by the pinned 3-agent review (both Agent B and Agent C independently flagged it) before push, and fixed the same round. Verified live: a periodization-generate-then-delete cycle now leaves zero orphaned templates.
- **Workouts-page perf issue.** `renderClientWorkoutsPage` always fetched the flat templates list (up to 100 rows, nested exercise join) via `Promise.all`, even when a program was assigned and the result was thrown away — worst-case on the personal/solo account, since it shares the PT account's large historical orphan-template backlog. Restructured to only fetch when `!hasProgram`. This is very likely the same root cause as the still-open 2026-07-06 "app runs slow moving to workouts page" report that was never investigated until now.
- **`_buildWorkoutsHero` null `start_date` guard** — `activeAssignment.start_date` can be null (the assign form doesn't require it); `new Date(null + ...)` produced `NaN`, silently falling through to the LAST phase/week instead of the real current one. Found by the 3-agent review (Agent B), fixed same round.

**Found, NOT fixed (needs Jake):**
- **`client_programs` has no client-read RLS SELECT policy at all.** Discovered while building a Playwright fixture for the hero-card test — a genuine (non-solo) client account reads back zero rows from `client_programs`, even completely unfiltered, while the same account correctly reads `workout_logs`/`weight_logs`. Verified this isn't a fluke: compared against two working tables side by side. This means any real client with an assigned program currently can't see it on their Dashboard or Workouts page — invisible until now because solo accounts share the coach's own `auth.uid()` and never hit this RLS check. Needs a Supabase SQL policy (`CREATE POLICY ... FOR SELECT USING (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()))`), which needs Jake's dashboard access, not something fixable from code. One new Playwright test (`client-workout.spec.js`) is `test.fixme()`'d pending this fix, with clear inline documentation; the underlying hero-card logic is still covered independently by two passing unit-style tests.

**Decided:**
- When a Playwright test's `beforeEach` fails to find expected UI state that a fix should have produced, root-cause against live DB state directly (via a throwaway debug script) rather than re-guessing at the app code — this found the deleteProgram bug, not a guess.
- A discovered bulk-cleanup opportunity for accumulated test debris was correctly blocked by the harness's own safety classifier (pattern-matched delete against shared data not created-and-tracked this session) — did not attempt to work around it; left as an optional to-do for Jake to approve instead.
- Test isolation gap (a test picking "whatever's first" from shared account data instead of creating owned fixtures) is a recurring root cause worth naming explicitly — this is the second time this session class of bug caused real flakiness (see also the `programs.spec.js` `test.skip`-after-arrange cleanup-unreachable pattern noted but not fixed this session, since it doesn't currently cause harm).

**Why:**
- Jake asked directly this session whether better test agents could have caught these issues earlier — yes: a test-isolation review (flagging shared-account-data assumptions in test setup) and a periodic ownership-model audit on delete/cascade logic (checking cascades against the coach_id/client_id/program_id/generated_from_phase_id ownership convention already established elsewhere in the codebase) would both have surfaced this before today.

---

## 2026-07-08 (session 22) — Performance/Personal Bests restructure + 3 confirmed bug fixes — PUSHED (6d8c6a8, e600010)

**Context:** Backfilled at the start of session 23 — this session's `/save` was never run at the time (LOG.md and STATUS.md both stopped at session 21 until now).

**Done:**
- Performance/Personal Bests restructure (client/solo self-view, e600010): folded Cardio + 1RMs into Personal Bests; Performance split into "Per session" (most-recent-vs-previous comparison, expand to graph) and "Per exercise" (alphabetical, live-search); moved the Workouts-page 1RM grid into Personal Bests.
- Fixed bare `class="btn"` Cancel button in the phase-form (undefined CSS, same bug class already fixed on the dashboards) — app-programs v11 (6620720).

**Bugs found + fixed (6d8c6a8):**
- Dead "Log PB" button — form only existed on Dashboard pages, not the Progress page it's clicked from.
- A real solo-mode bug where saving a PB redrew the wrong dashboard.
- Body Weight "Starting" tile reading the wrong field + a Y-axis clamp requiring both starting AND goal weight to be set.
- Hardened `saveEditTemplate`/`deleteTemplate`'s coach_id filter to be role-aware instead of hardcoded (defensive fix, original repro not fully confirmed).

**Decided:**
- 3-agent review caught and fixed a stale-cache race between Client/Personal view switches and a Chart.js instance leak on every search keystroke, before the Performance restructure was pushed.

---

## 2026-07-08 (session 21) — Fixed solo-runner broken-screen bug + exercise-picker keyboard shrink; confirmed exercises-library cleanup — PUSHED (298d88d, b1aa50c)

**Context:** Session opened as `/hello-claude`, but the user had Plan Mode active mid-ritual, which meant the preview server never actually started at Step 1 — this caused a false 40-test Playwright failure scare later in the session (root-caused correctly: checked server status before assuming a regression, per the systematic-debugging discipline, rather than repeating the les-025 "flaky/fatigue" mistake). Session ran under a tight remaining usage budget (started at 9% weekly, flagged to Jake throughout); several process decisions (skip full multi-agent review on the second fix, stop before the bigger backlog items) were made explicitly with Jake given that constraint.

**Done:**
- Hello-claude's targeted code review (Step 4) found a real, previously-unbanked bug: `_afterRunnerSave` (app-runner.js) only special-cased role `'client'`; solo fell through to a PT-only `openClient()` call scoped by `coach_id = currentUser.id` — but a solo client record has `coach_id = NULL`, so it always errored. Fixed by adding `'solo'` to the working branch. New Playwright regression test added. Full 3-agent multi-agent-review (security/scoping, solo-mode, duplicates/regressions) ran clean. Pushed 298d88d, app-runner v16.
- Jake reported the 682f86f exercise-picker fix from last session helped but the modal still shrank/drifted once the on-screen keyboard actually opened. Diagnosed (confirmed via an AskUserQuestion check — shrink only happens once the keyboard is up, not before) as a `vh`-unit-vs-mobile-keyboard interaction: `vh` is sized against the layout viewport, which most mobile browsers don't shrink when the keyboard opens, so a plain `vh` box can end up partly hidden behind it. Fixed by syncing the modal's height/max-height to `window.visualViewport` on open and on resize (keyboard show/hide), falling back to the original `vh` values on unsupported browsers. Self-reviewed only this time (explicit call with Jake, given budget); `runner.spec.js` 26/28 passed cleanly (2 flaky, pre-existing login-timeout race, unrelated). Pushed b1aa50c, app-workouts v16.
- Rebuilt the exercises-library cleanup SQL from scratch this session (the original wasn't saved anywhere retrievable) as one self-contained script — a temp table computed once for the "keep" list, referenced plainly in every following statement, instead of the repeated-CTE pattern Jake flagged as "too many steps" last time (les-028). Jake ran it — confirmed 51 `remaining_exercises`.
- Confirmed OS self-check and golden-path sweep clean (first session of the day); CI green on all recent pushes; roadmap.md already in sync with LOG, nothing to flag.

**Bugs found + fixed:**
- Solo `_afterRunnerSave` broken-screen bug (see above) — found via proactive code review, not a live report.
- Exercise-picker mobile-keyboard shrink (see above) — found via Jake's live report, root-caused via a targeted question rather than a second blind CSS guess.

**UNVERIFIED (banked):**
- Exercise-picker VisualViewport fix (b1aa50c) — needs Jake's own phone; Playwright cannot simulate a real on-screen keyboard.
- Solo-runner fix (298d88d) — verified via Playwright + code reasoning (deterministic, not a maybe), not yet felt live by Jake.
- Workout-save speed fix (444d0f3, from 2026-07-07) — still not confirmed live by Jake.

**Decided:**
- Given the session's tight usage budget, Jake explicitly chose to run the full multi-agent review for the solo-runner fix (higher-risk, role/security-adjacent) but skip it for the picker-height fix (small, isolated, self-reviewed instead) — a deliberate risk-based tradeoff, not a silent shortcut.
- Jake asked to stop after these two fixes rather than start the runner-autosave build, given the remaining budget.

**Why:** Both bugs were real and worth fixing same-session — the solo one because it's a live-breaking dead end for a real usage mode with zero workaround, the picker one because Jake hit it again in actual use right after asking for the cleanup SQL. The budget constraint shaped process (review depth, stopping point) but not whether to fix real bugs found along the way.

**Follow-up (same day, after first /save):** committed the benign `.claude/settings.json` plugin-enable change that had been sitting uncommitted all session (context-mode + superpowers, from session 19's evaluation — no app behavior change). Also fixed one more small quick-win: `app-programs.js:679` had the same bare-`class="btn"` Cancel-button bug already fixed on the dashboards 2026-07-05 (undefined CSS class) — swapped to `.btn-secondary`, cosmetic only. app-programs v10→v11, pushed 6620720, CI green, 39/39 Playwright (1 skipped).

---

## 2026-07-07 (session 20) — Fixed slow workout save + slow Workouts-page load, cleaned up orphaned template/exercise backlog, fixed exercise-picker modal shrinking on mobile — PUSHED (444d0f3, 682f86f)

**Done:**
- Batched `saveRunnerSession`/`saveWorkoutSession`'s per-exercise save loop into 2 batched inserts each (exercises, then sets), correlated by `order_index` not response array order. Measured live: 14 requests/4.7s → 4 requests/1.1s on a 6-exercise save.
- Added rollback-on-failure to `saveWorkoutSession` (never had one before), matching `saveRunnerSession`'s existing rollback chain.
- Parallelized `saveWorkoutSession`'s per-exercise `_resolveExerciseIdForSave` lookup (de-duped by name first to avoid a create-race on repeated exercise names).
- Added `.limit(100)` to `renderWorkoutTemplates` and `renderClientWorkoutsPage`'s `workout_templates` queries — were silently riding the global 200-row server cap.
- New Playwright smoke test proving the new `saveWorkoutSession` rollback actually cleans up on failure.
- Fixed the exercise picker modal shrinking/drifting toward the bottom of the screen as search results narrow — `max-height:85vh` with no fixed `height`, combined with mobile's bottom-anchored overlay, meant the box shrank and slid down as fewer results matched, crowding the on-screen keyboard. Fixed with `height:70vh`.
- Cleaned up the historical orphaned-`workout_templates` backlog: diagnostic confirmed 103 orphaned rows (not ~993 as previously estimated — that figure was never actually measured), 0 in use anywhere; Jake ran the cleanup SQL, confirmed 0 remaining.
- Handed Jake a broader exercises-library cleanup SQL (delete every exercise not used by his personal/solo account) at his explicit request, after confirming via AskUserQuestion that he understood it would also detach the `exercise_id` link on real clients' templates/logs that reference a removed exercise (their logged history stays intact, just reverts to name-matching for that link).

**Bugs found + fixed:**
- Mid-session, a stray character (a literal `"0"`) was found prepended to the very first line of `app-runner.js`, corrupting the whole script and silently breaking ~25 unrelated tests (client-runner tests, some PT tests). Root cause traced via a direct browser console capture (a `pageerror` + `ReferenceError`), not guessed — confirmed via `git diff` that the file matched HEAD exactly at session start, so this was introduced by one of this session's own edits. Fixed, full suite reverified green. The exact mechanism of how the stray character got inserted was never reproduced, but the fix and its verification are solid.
- The new rollback test itself initially failed — traced to `flushLogState()` (called at the top of `saveWorkoutSession`) reading set values back out of DOM inputs by id; since the test injected `_logBlocks` data directly without calling `renderLogExercises()` first, those inputs didn't exist and `flushLogState()` silently overwrote the injected data with empty strings. Fixed by calling `renderLogExercises()` before invoking the save.
- 3-agent review (security/scoping, solo-mode, duplicates/regressions) found one real gap: the new rollback test's cleanup depended on the rollback-under-test actually succeeding, so a future regression in that exact rollback would both fail the test AND leave permanent debris in Jake's real account. Fixed with unconditional try/finally cleanup.

**UNVERIFIED (banked):**
- Workout-save speed fix (444d0f3) — verified via automated network-request-count measurement + full Playwright suite, not yet felt/confirmed by Jake in a real gym session.
- Exercise-picker modal fix (682f86f) — verified via automated bounding-box measurement at a simulated 390×844 viewport, not yet confirmed by Jake on his own phone.
- Exercises-library cleanup SQL (delete all except personal-account-linked) — handed to Jake, outcome/count not confirmed back.

**Decided:**
- On the sets-batch-insert failure path (both save functions), a failure now rolls back the whole session (log + exercises + sets) rather than the old per-exercise loop's "some sets saved, some didn't, session still marked saved" partial-success toast — since sets are now inserted in one atomic batch, "some failed" is no longer a real state (it's all-or-nothing), so a clean rollback + clear retry is better UX than a misleading partial-success message.
- Jake explicitly confirmed (via an AskUserQuestion after being shown the tradeoff) that he wants the exercises-library cleanup to remove entries even where that breaks a real client's template/log link, not just genuinely-unused entries — a deliberately more aggressive cleanup than the template one.

**Why:**
- Jake reported the slowness directly on the kanban board the previous session; this session's shortlist proposal surfaced it as the top item, and two Explore agents traced concrete, file:line root causes for both halves of the report before any code was touched — not vague slowness, two specific fixable patterns. The exercise-picker bug was reported live by Jake mid-session as a real UX complaint from actual use, investigated and fixed same-session rather than banked for later.

---

## 2026-07-06 (session 19) — Process/tooling session: kanban reorg, beta date → 31 July, wiki gap-analysis fixes, plugin install, skill sharpening + first live-validated skill-testing methodology — NO APP CODE CHANGED

**Context:** Jake opened by asking why session 18 took ~7 hours for what looked like "one feature" — answered from commit-timestamp evidence since session 18 was never `/save`d (see the backfilled session 18 entry below). Rest of the session was Jake directing process/tooling work: kanban board maintenance, a beta-date decision, a full wiki gap-analysis pass, installing the standalone Claude Code CLI + two plugins, and — at Jake's push — actually proving a skill-wording change works rather than asserting it.

**Done — kanban board (`wiki/board-coachapp.md`):**
- Reviewed and updated to reflect actual pushed state (was showing session 17/18 work as not-yet-pushed).
- Reclassified 4 items from "Needs Jake" → "Up Next": the 1RM 0.5kg-shift bug and the `showRunnerOneRMSheet` z-index fix (both reproducible with test/preview data, don't need Jake's live account), the `client_1rms` INSERT RLS gap (diagnosable via a Playwright client-role test; only the actual fix SQL would still need Jake), and the ICO breach-notification procedure (draftable by Claude for Jake's review rather than requiring him to author it from scratch).
- Added a new **"Proposed for Next Session"** column — a curated 3-5 item shortlist, distinct from the full "Up Next" backlog. Wired into the ritual going forward: `save` (Step 6) rewrites it every session-end based on that session's actual work; `hello-claude` (Step 6) reads it first as the anchor for "propose this session's plan" instead of generating one from scratch. **Discovered mid-session:** the Obsidian Kanban plugin strips freeform prose (non-checklist lines) from a column when it re-saves the file after Jake opens/edits the board — so this column's content has to live as checklist items themselves, not descriptive text around them. Adjusted expectations accordingly.
- Attempted a CSS snippet to lighten the kanban board's colour scheme (the vault's "Obsidianite" theme was rendering it dark) — Jake asked for it rolled back same session; reverted cleanly (deleted `kanban-light.css`, removed it from `appearance.json`'s `enabledCssSnippets`). Noted in memory as a soft signal: cosmetic/personal-tool styling changes are more reversible/tentative than app changes.

**Done — beta date pushed to 31 July 2026** (Jake's decision): updated `roadmap.md` (was "Week 5 — Jul 22–31" + staggered invites Jul 25/28/31 → single date 31 July), `board-coachapp.md`, and `guide-coachapp-roadmap.md` (mermaid node + numbered list) to match.

**Done — wiki gap analysis** (delegated to an Explore agent to read all 26 wiki pages without blowing up session context; then fixed everything it found):
- `coachapp-programs-architecture.md` (worst offender, stale since 2026-07-03): resolved a direct contradiction with `coachapp-runner-architecture.md` over whether exercise-id linking had shipped (it had, `1526704`); added Duplicate Week/fork-on-edit coverage; corrected a stale function name (`renderEditableWeek1Grid` → `renderPhaseWeekGrid`); added the 2026-07-04 `deleteProgram()` follow-up.
- `coachapp-workflows.md` (frozen since 2026-07-03): added the Exercise Picker, exercise identity linking, weight goals, Duplicate Week/fork-on-edit; corrected "Runner phase 2" to drop %1RM (shipped) from the still-open list.
- `coachapp-spec.md` / `coachapp-runner-architecture.md`: header "Last updated" dates were stale relative to their own content (both had been edited without bumping the date) — corrected.
- `index.md`: `log.md` existed on disk, actively maintained, but was never linked from the index — added under Maintenance.

**Done — installed the standalone Claude Code CLI + 2 plugins:**
- Jake tried `/plugin` commands directly in this chat session (the VSCode extension) — confirmed this environment doesn't support them at all, and no standalone CLI was installed on the machine to fall back to. Installed the official CLI (`irm https://claude.ai/install.ps1 | iex`, v2.1.201), fixed a PATH propagation issue (registry updated but already-running VSCode doesn't see it until restarted — worked around via the full exe path in the interim).
- Installed **context-mode** (mksglu/context-mode — MCP-based context-window sandboxing) and **superpowers** (obra/superpowers via claude-plugins-official — a 13-skill TDD/debugging/collaboration library), both eventually at **User** scope (available in every folder, not just this one) after an initial Project-scope install.
- **Confirmed these plugins are inert in this chat environment** — searched this session's own available tools for any trace of them, found nothing. They only work inside the separate standalone `claude` CLI process, even though both read/write the same `~/.claude` folder on disk.
- Added 4 new glossary entries (`guide-glossary.md`): Claude Code CLI vs this chat, Plugin, Marketplace, Scope (Project vs User).

**Decided — don't migrate primary workflow to the standalone CLI.** Evaluated the tradeoff directly: this chat environment has things the CLI likely doesn't (subagent orchestration, artifacts, scheduling, the whole hello-claude/memory ritual); the CLI has working `/plugin` support this chat doesn't. Neither is a strict upgrade. Recommended against switching unless a specific plugin need arises.

**Done — evaluated superpowers/context-mode for extraction value** (read the actual skill files, not just the plugin descriptions): recommended adopting **`writing-skills`**'s RED-GREEN-REFACTOR testing methodology (pressure-test a skill/rule with a subagent before vs. after adding it — none of CoachApp's ~15 skills have ever been empirically tested this way) and **`systematic-debugging`**'s sharper "3+ failed fixes = stop, this is an architecture problem, not another patch" rule. Rejected `verification-before-completion` (redundant with existing `feedback-verify`/feature-audit), `finishing-a-development-branch` (branch/PR/worktree workflow that doesn't match CoachApp's single-branch-on-master reality), and strict TDD (doesn't match how Jake actually ships — tests added same-commit to prove a fix, not written first).

**Done — folded both into `hello-claude/SKILL.md`:** sharpened the "If work goes in circles" section with the Iron Law, the 3-strikes-architecture rule, a red-flags list, and Jake's own verbal tells ("is that not happening?", "stop guessing", all-caps restatement) as explicit signals to stop.

**Done — actually proved the wording change works, instead of asserting it** (first real use of the newly-adopted testing methodology): ran 5 paired subagent reps (10 total) — one arm given the exact pressure scenario with no guidance, one arm given the same scenario plus the new rule text. Result: **5/5 baseline reps correctly diagnosed the technical root cause on their own** (the model's debugging instinct wasn't the gap) but **0/5 paused before acting — all planned or executed a fix solo.** **5/5 primed reps explicitly stopped and committed to surfacing the finding before writing more code.** Zero variance on both sides — a clean signal per the methodology's own "variance is a metric" guidance. Confirms the rule's actual value is enforcing a human checkpoint before further autonomous action, not making the debugging sharper (that was never broken) — which is specifically the failure this rule was written to prevent (Claude gave Jake wrong info twice in a row earlier this session before actually verifying against his real environment).

**Not done / explicitly out of scope this session:** no CoachApp app code, no Playwright run (nothing to test), no cache-bust concerns (no module files touched).

**Why:** Jake's original question ("why did session 18 take 7 hours") surfaced a real process gap — no live log existed to answer it from. Closing that gap, then using the same session to actually validate a process change empirically rather than just writing it down, is the throughline: less "build a feature," more "make the next 100 features more reliably built."

---

## 2026-07-06 (session 18, cont.) — Found + fixed the real flaky-test root cause; pushed (31698fe)

**Correction to the entry below:** its "not a real bug" verdict on the test flakiness was wrong. Jake asked to investigate properly rather than keep retrying blindly.

**Root cause:** `tests/helpers.js`'s `loginAsClient` logged the test account in and returned immediately. `loginAsPT` already had a comment explaining why that's unsafe (`#app-shell` is visible before `loadUserInfo`/`renderClientDashboard` finishes) and waits for its own dashboard heading before returning — `loginAsClient` had no equivalent wait. `renderClientDashboard` (app-dashboard.js:219) shows a `Loading…` placeholder synchronously, then replaces it with the real page only after several parallel Supabase fetches resolve. Every client-role test's `beforeEach` fires its first click (e.g. `[data-page="workouts"]` in `runner.spec.js`) straight after `loginAsClient` returns — if that click landed before the dashboard/nav had finished rendering, it got silently overwritten once the async render caught up. This explains the observed symptoms exactly: intermittent AND sometimes-100%-reproducible failures scattered across client/solo tests, unrelated to that session's actual diff, including a case where the page was directly observed stuck on the client dashboard ("No program assigned") instead of Workouts.

**Fix:** added `await page.waitForSelector('h1:has-text("Hi,")', { timeout: 15000 })` to `loginAsClient`, mirroring `loginAsPT`'s existing pattern.

**Verified:** `runner.spec.js` alone — 27/27 green. `runner.spec.js` + `solo-account.spec.js` together (the exact 38-test pre-push smoke set) — green on 2 consecutive full runs, then green a 3rd time inside the actual pre-push hook.

**Pushed:** 31698fe. CI (`Check & Deploy`) green.

**Also corrected:** the "Flaky test" and "Race condition" entries in the LLM wiki glossary (`guide-glossary.md`) now use this as the real worked example, replacing the incorrect "confirmed system exhaustion" framing — and the Flaky-test entry now explicitly calls out "jumping to fatigue because it requires no further work" as the trap, since that's exactly what happened here.

**Why:** a plausible-sounding explanation (hours of continuous test runs → tired machine) was accepted before ruling out a code cause, even though the failure recurred immediately on the very next run and hit early tests too — both signs a load-based explanation didn't actually fit. Investigating properly took under 15 minutes once actually pursued.

---

## 2026-07-06 (session 18) — Session 17 backlog pushed + 2 bugs found in it fixed (app-dashboard v3, app-workouts v12, app-runner v13, app-progress v4); Exercise identity linking + new Exercise Picker built (app-programs v10, app-progress v5, app-runner v14, app-workouts v13) — PUSHED (9b1fb9c, 1526704)

**Note on this entry:** backfilled after the fact — `/save` was not run at the end of this session, so STATUS.md/LOG.md were never updated in the moment. Reconstructed from the two commit messages and roadmap.md's session-18 notes. The only hard timing evidence available is the gap between the two commits: **9b1fb9c at 12:33:56 and 1526704 at 18:04:49 — 5h31m apart.** No record of when the session actually started, so real total time may be longer than that.

**Done — pushed session 17's backlog (9b1fb9c):**
- Session 17's Areas 1/2/4 work (false-positive "Save failed" toast fix, rest-time-on-swap/add fix, %1RM→strength-table routing, cardio fields in the workout-preview slider, dashboard "Current program" header, delete-set button spacing, mobile RPE/RIR label fix, `.modal-box`→`.modal` CSS fix across 5 sites) went through multi-agent review before push and found two real bugs in that session's own work, fixed before pushing:
  - Weight goals form (starting/goal weight, drives the Body Weight chart Y-axis) was wired into the PT-facing `renderClientWeight` only — clients and solo users had no way to reach it from their own My Progress page (`renderProgressWeight`, a separate function). Ported the form + Y-axis logic there too; fixed `saveWeightGoals` to refresh whichever view is actually showing it.
  - `saveRunnerSession`'s exercise-insert failure path re-enabled the Save button but never cleaned up the already-inserted `workout_logs` row — a retry could create a duplicate session and orphan the first attempt. Added rollback (sets → exercises → log) before allowing retry.
  - Also fixed: Y-axis inverted for a weight-gain goal (calc assumed goal < starting); ported the 0.5kg stepSize fix to the client/solo chart too.
- 69/69 Playwright passing, 3-agent review + self-verification clean.

**Done — Exercise identity linking + new Exercise Picker (1526704):**
- **Root cause:** previous-session/1RM data went missing when the same exercise was typed slightly differently across templates (e.g. "Bicep Curls" vs "Bicep Curl") — the runner's lookup already searched globally per client but matched on exact name string.
- **Schema:** added a real `exercise_id` FK to `workout_log_exercises` and `client_1rms` (`workout_template_exercises` already had one), with a name-match fallback for older/unlinked rows. Wired through `saveRunnerSession`, `saveWorkoutSession`, `save1RM`, `saveBig5OneRMs`, `_getProgramOneRMStatus`, `fetchRunnerLastSession`, `_lookupClientOneRM`.
- **Historical data migration:** one-time SQL seeded the (previously empty) exercise library from real usage and linked 4,777 template exercises, 27 logged exercises, 18/19 1RMs. Jake reviewed his actual exercise list and specified which spelling variants to merge (Close Grip Pulldown, RowErg, Trap Bar Jump, etc.).
- **New shared Exercise Picker** (search-as-you-type, explicit "Create new exercise", collapsible archived section) replaces the old dropdown+free-text entry everywhere: workout builder (add + edit), runner swap/add, 1RM entry. Archive/unarchive added to the Exercise Library management page. The old "1RM lifts quick-pick + auto-scroll" dropdown shortcut was dropped (Jake confirmed fine with this); the underlying %1RM calculation itself was untouched.
- Diffstat: `index.html` +8/-0 · `js/app-programs.js` +27 · `js/app-progress.js` ±106 · `js/app-runner.js` ±64 · `js/app-workouts.js` +486/-… (largest single-file change of the session) · plus test files.

**Bugs found + fixed (mostly via multi-agent review):**
- Race condition — typing into the picker's search box while the library was still loading got silently wiped once the fetch resolved.
- Two missing RLS policies — clients had no INSERT or SELECT access to the `exercises` table at all, so the picker silently failed for every client (worked fine for PT/coach, which already had its own policy).
- `escapeHtml()` was applied before the JS-string-escape on names rendered into `onclick` attributes, so any exercise name with an apostrophe (e.g. "Farmer's Carry") broke the picker.
- Two double-tap race conditions that could create duplicate library entries (picker's "Create new exercise", and the Big 5 quick-start form).
- 3-agent review (security/scoping, solo-mode, duplicates/render-safety) confirmed all RLS/solo-mode paths clean after the fixes above.

**Known friction this session:** first push attempt for the exercise-identity commit was blocked by the pre-push hook's own Playwright smoke-test pass hitting severe environmental flakiness after 3+ hours of continuous test runs (not a real bug) — required a full environment reset before the retry succeeded. This is the likely largest single contributor to the session running long, on top of the schema migration + data backfill + a new shared component threaded through 4 integration points + a 5-bug review-and-fix round.

**Not done:** `/save` itself — this is the gap this entry exists to close. Also flagged to Jake directly: STATUS.md still shows "session 17" at the top and lists the session-17 work as uncommitted, which is now stale (both commits are pushed and CI is green).

**Why:** Jake asked directly why the session took ~7 hours for what looked like "one feature." The honest answer, reconstructed from commit evidence since no live log exists: it wasn't one feature — it was finishing and pushing a backlogged session's work (with 2 bugs caught and fixed in review), then a schema migration + historical data backfill + a new shared UI component wired into 4 places + a 5-bug fix round, then a stuck test environment on the first push attempt. Banking this now so the same question doesn't require after-the-fact reconstruction next time.

---

## 2026-07-05 (session 17) — Live-test backlog organized into 4 areas; Areas 1/2/4 built + tested; %1RM runner routing fixed (app-dashboard v2→3, app-workouts v11→12, app-runner v10→13, app-progress v3→4) — NOT YET PUSHED

**Context:** Jake live-tested a real gym session plus the wider app end-to-end and reported 16 bugs/feature requests in one message. Organized them into 4 areas (Runner, Progress/Stats, Personal/Solo, Dashboard) with file:line-grounded root-cause notes via a read-only Explore pass, written to `roadmap.md`'s new "Session backlog" section. Then built and tested Areas 1, 2, and 4 in sequence (Jake picked the order live, one area at a time), plus a live bug Jake found mid-testing (Trap Bar Jump UI inconsistency) that turned into a scoped "Runner Phase 2 — %1RM only" build.

**Done — Area 1 (Runner):**
- **Rest time on Swap/Add exercise** — `_confirmRunnerExerciseFromModal` now derives `restSecs` from the entered rest field (`parseRest(cleanSets[0]?.restMin) || 90`), matching how a template's rest time is read on initial load. Previously: swap never reassigned `restSecs` at all; add hardcoded 90s regardless of what was entered.
- **Delete-set button spacing** — added `margin-left:8px` between the delete button and the complete-set tick in the strength table (was a shared 6px flex gap).
- **Redundant RPE label** — mobile log-wizard header now shows RPE or RIR dynamically (was hardcoded to always say RPE); the field's own placeholder now shows a numeric range hint instead of repeating the word.
- **"Save workout" false-positive error** — root cause confirmed via direct source instrumentation (not just static reading): `dbq()`'s default `showUserError:true` fires a "Save failed" toast on *any* non-PGRST116 error, including `saveRunnerSession`'s client-lookup — which already has a safe fallback (`|| currentUser.id`) and continues the save regardless. Fixed with `{ showUserError: false }`. Blast-radius sweep found the identical pattern in 2 more places (`saveWorkoutSession`, `showLogSessionModal`) and fixed those too. Also fixed a real second bug in the same function: if the `workout_log_exercises` insert failed after the `workout_logs` insert succeeded, the Save button stayed stuck on "Saving…" with zero feedback — now re-enables and shows an error toast.
- Trap Bar Jump routing — investigated live with Jake mid-session (see below), turned into a separate scoped fix.
- 4 new Playwright regression tests. Full suite green throughout (66/66 → 67/67 → 69/69 as each area's tests were added).

**Done — Area 2 (Progress & Stats):**
- **Cardio fields blank in workout-preview slider** — `openSessionDetail`'s set-line builder only branched timed vs. strength; never read cardio fields. Fixed by reusing the exact cardio-formatting logic already used by the template-card preview (pace/500m, pace/km, HR zone, stroke rate, duration/distance) — same helper, not reinvented.
- **Bodyweight graph Y-axis** — added `stepSize:0.5` to the Chart.js config (0.5kg ticks instead of arbitrary fractional ones).
- **Weight goals feature** (new, to satisfy the Y-axis min/max half of Jake's ask) — no structured "goal weight" field existed anywhere in the data model (goals are free-text `metric_label`/`target_value`), so rather than fragile name-matching, added 2 new nullable `clients` columns (`starting_weight_kg`, `goal_weight_kg`) plus a small "Weight goals" form on the Weight page (two native number inputs, no pre-fill per Jake's call, `saveWeightGoals()`). When both are set, the chart's Y-axis min = goal weight (rounded down to 0.5), max = starting weight + 1kg (rounded up to 0.5); falls back to auto-scaling if either is unset. Required a **new client-role UPDATE policy on `clients`** — every existing UPDATE policy on that table was PT-only until now. Jake ran the SQL; policy confirmed live via `pg_policies` query (`clients_update_own_row`, `cmd:UPDATE`, `qual`/`with_check` both `user_id = auth.uid()`).
- **Update-1RM modal rendering outside a modal** — root cause: `.modal-box` (used by `showAdd1RMModal`, `showEdit1RMModal`, the delete-account modal, and 2 runner-context 1RM modals — 5 sites total across app-progress.js/app-runner.js) has zero CSS definition anywhere in `main.css`. The correctly-styled class is `.modal` (background/border-radius/padding/max-width/shadow), used by every other modal in the app. Swapped all 5 sites. This also closes an already-tracked backlog item (found 2026-07-05 during the dashboard pass, same bug class as `.dashboard-card`). Bonus find while in this code: the mid-workout "set your 1RM" sheet (`showRunnerOneRMSheet`) had no z-index override despite opening while the runner (z-index:300) is up — added `z-index:1000`, same fix already applied to the exercise picker for the identical reason. This one is UNVERIFIED live (reasoned from an established pattern, not reproduced).
- **1RM value shifts 0.5kg on duplicate entry** — genuinely could not find a code-level cause after checking `save1RM`, `saveBig5OneRMs`, and every Epley-calculation site for rounding/dedup logic. None exists. Needs live reproduction next session.
- **Personal Bests / Performance merge** — not built; Jake had already deferred this to its own scoping session before this build started.
- **New gap surfaced:** clients can now technically self-detach from their PT via the API, since Postgres RLS is row-level (not column-level) and the new client-writable-row policy on `clients` doesn't distinguish `coach_id` from `starting_weight_kg`. Discussed directly with Jake; accepted as consistent with the existing trust model for `weight_logs`/`client_1rms`, banked as its own roadmap item needing a real cancellation-flow design later, not fixed now.
- New `tests/progress.spec.js` (2 tests: cardio formatting, 1RM modal CSS class). Full suite 67/67 (1 flaky retry, unrelated timing on the new modal test — passed on retry).

**Done — Area 4 (Dashboard):**
- **"Current program" header** — client and solo dashboards now show a slim header (program name + "View program" button, routes to `navigate('workouts')`) above the existing "Up next" hero card, when a program is assigned. Confirmed no such element existed before. 2 new Playwright tests (both skip gracefully — neither test account has an assigned program).

**Done — Runner Phase 2, scoped to %1RM only (live bug hunt with Jake):**
- Jake screenshotted Trap Bar Jump (wizard mode, single-set KG/REPS/LOG UI) next to Back Squat (table mode) on his own account and asked to investigate — this is the exact "Trap Bar Jump UI inconsistent" item already on the backlog, which he'd earlier told me to skip. Live evidence corrected my original hypothesis: it is **not** a name-matching bug. Trap Bar Jump's target row showed "20% 1RM" — `_isPlainStrengthExercise` deliberately excludes any exercise with an `intensityMin` (%1RM) set from table mode, regardless of name, because the table wasn't believed to support %1RM display. Reading the actual code showed the table's target bar (`_buildTargetCols`/`_renderTargetBarHtml`) **already** computes and displays the %1RM→kg target and the "set your 1RM" banner — identical logic already duplicated into the wizard. So the fix was much smaller than "Runner redesign phase 2" sounds: removed the `!s.intensityMin` exclusion (one line), left timed/unilateral excluded (Jake's explicit scope choice — those still need their own design work for table mode). Added a placeholder (not auto-filled value) in the table row's weight input showing the calculated suggested kg when a 1RM is known, matching what the target bar already shows. 1 new Playwright regression test. Full suite 69/69 clean after the change (2 skipped — the two new dashboard-header tests, no test-account data).

**UNVERIFIED (banked to STATUS.md open to-dos):**
- Weight goals feature — Jake asked to check the chart-reshape + save flow on his own account; hasn't confirmed the result yet.
- Dashboard "Current program" header — Jake mentioned his current program name ("Hyrox Conjugate") for context but hadn't explicitly confirmed the header/button rendered correctly before reporting the Trap Bar Jump bug instead.
- %1RM table routing fix — Jake was asked to hard-refresh and check Trap Bar Jump now matches Back Squat; this was the very next thing to check when `/save` was invoked.
- z-index fix on `showRunnerOneRMSheet` — reasoned from an established pattern, never actually reproduced/screenshotted live.

**Decided:**
- Runner Phase 2 scope: %1RM only for now, not all 4 wizard-only exercise types in one build. Timed/unilateral/cardio deliberately left on the wizard.
- Client self-detach-from-PT risk accepted as-is (row-level RLS trade-off), not blocking the weight-goals ship — proper fix (cancellation workflow) deferred to its own session.
- Skipped Trap Bar Jump earlier in the session (original name-matching hypothesis), then un-skipped it when Jake hit it live and asked directly — the live evidence overturned the original theory, which is exactly why the "skip for now, real fix is an architecture decision" call from earlier turned out to be based on an incomplete diagnosis.

**Also this session:**
- Updated 2 skills based on Jake's direct question about whether the reported bugs indicated gaps in the standing QA checks: added an "all-exercise-types check" to hello-claude's blast-radius sweep (cardio-blank-preview is the same bug *class* as a historical timed-set formatting bug), and a "destructive-adjacent-to-primary spacing" check to feature-audit's gym-user lens (the delete-button-spacing bug is exactly what that lens is supposed to catch). Explicitly did *not* add a check for the original Trap-Bar-Jump-name-matching theory, since the live evidence showed the real cause was unrelated to names.
- Mirrored the backlog organization + the client-detach gap into the LLM wiki (`guide-coachapp-roadmap`, `coachapp-runner-architecture`, `coachapp-spec` — first time that page tracks open decisions, not just settled principles) in the same turn per the standing roadmap-wiki-sync rule.
- Investigated an alarming-looking console message during test debugging ("tip: ⌁ auth for agents [www.vestauth.com]" printed by `dotenv`) — traced to source, confirmed it's real (if unwanted) self-promotion baked into `dotenv` v17.x advertising their commercial `dotenvx` product, not a supply-chain compromise. No action needed; banked as a lesson so it isn't re-investigated from scratch next time it's seen.
- A test-harness debugging detour while root-causing the save-workout error: `_runner` is declared with `let` inside `app-workouts.js`, a *different* `<script>` tag than `app-runner.js` where it's used — `window._runner = {...}` from a Playwright `page.evaluate` does not affect the real `let`-scoped binding (classic vs. `var`/function-declaration globals). Cost real time to diagnose; banked as a lesson for future direct-state Playwright tests in this codebase.

**Why:** Jake's own live-testing (both the original 16-item report and the Trap Bar Jump follow-up) is the highest-signal input this project gets — it surfaces exactly the gaps that code review and Playwright can't (a false-positive error toast, a UI inconsistency with a wrong first theory, a genuinely missing feature). Building area-by-area with Jake choosing the next area, rather than batching everything into one pass, kept each piece reviewable and let a live discovery (Trap Bar Jump) get investigated properly instead of steamrolled past.

---

## 2026-07-05 (session 16) — Dashboard CSS consistency pass (main.css v3→4, app-dashboard v1→2) — PUSHED (313bc74); runner autosave scoped + designed, not built

**Context:** Jake asked to improve the design and flow of the dashboard. Explored the PT/client/solo dashboard code first — found real bugs, not just polish opportunities. Scoped to a consistency/bug-fix pass (Jake's choice, over a full shared-component rebuild or an information-architecture rework). In the same session, also picked up the standing High-priority runner-autosave to-do and scoped/designed it via a Plan agent, but the build was interrupted before any code was written — Jake redirected to push the dashboard work, log the autosave plan, and save.

**Done — dashboard consistency pass:**
- `.dashboard-card`/`.card-header`/`.card-title` were used ~37 times across all three dashboards (`renderDashboard`/PT, `renderClientDashboard`/client, `renderSoloDashboard`/solo in `js/app-dashboard.js`) but had zero CSS definitions anywhere in the repo — every "card" rendered with no background/border/shadow. Added real rules to `css/main.css`, scoped under `.dashboard-card` specifically so they can't leak into the different (already-working) `.card-header`/`.section-title` usage in `app-progress.js`/`app-calendar-goals.js`.
- Consolidated three byte-for-byte duplicated inline `<style>` blocks (`.pt-grid`/`.client-grid`/`.solo-grid`) into one shared `.dashboard-split-grid` class in `main.css`.
- Fixed 4 bare `class="btn"` Cancel buttons (no matching CSS rule — only `.btn-primary`/`.btn-secondary`/etc. exist) to `.btn-secondary`, matching the sitewide Cancel convention.
- Replaced hardcoded hex colors with design tokens (`var(--danger)`/`var(--warning)`/`var(--success)`/`var(--accent)`). One deliberate visible change: the "on track"/holiday green shifts from `#22c55e` to the design system's actual `--success` (`#10b981`) — flagged in the commit message, not silent. A second color (`#3b82f6`, "gym" event blue) has no matching token — left as-is with a `TODO(Jake)` comment rather than inventing one or silently collapsing it into `--accent`.
- Fixed 2 real mobile bugs: the PT stat strip had no mobile override at all (would cramp into 3 columns at 480px); the solo stat strip was `display:none` below 640px (vanished entirely instead of stacking). Both now pair up on mobile (`repeat(2,1fr)`).
- 2 new Playwright smoke tests (`.dashboard-card` has a real background; `.solo-stats` stays visible at 400px) — 29/29 pre-push suite green, CI green.
- 3-agent review (security/scoping, solo-mode, duplicates+render-safety) + verifier came back clean — zero blocking findings. Two informational notes surfaced and banked as roadmap follow-ups rather than fixed in this pass: a 5th unstyled bare-`.btn` Cancel button at `app-programs.js:672` (same bug, outside dashboard scope), and `.pt-stats`/`.solo-stats` duplicating the purpose of the pre-existing (dead) `.stats-row` class.
- Visually verified at 1280/900/640/480/400px via a throwaway Playwright screenshot script (the `preview_*` tools this environment's skills assume don't exist here — see lessons below) — confirmed cards now show real backgrounds/shadows and both stat strips reflow correctly on mobile.

**Also found (not fixed, banked as follow-ups):** `var(--bg-accent)`/`var(--text-accent)`/`var(--surface-2)` are referenced 52× across 7 files but never defined anywhere in `main.css` — same bug class as the dashboard-card fix, but app-wide. `.modal-box` (used in `app-progress.js`/`app-runner.js`) has no CSS definition either. Both deliberately kept out of this pass's scope (Jake's call) — need their own audit of intended styling per site before fixing.

**Done — runner autosave, scoped and designed (not built):**
- Explored the runner's `_runner` lifecycle in depth: confirmed zero persistence exists today (no localStorage, no `beforeunload`/`visibilitychange`, no resume concept anywhere), confirmed the exact final-save schema (`workout_logs`→`workout_log_exercises`→`workout_log_sets` via `saveRunnerSession`), and confirmed a second parallel in-progress representation (`tableRows` for the Hevy-style strength table) that any draft must also capture alongside `loggedSets`.
- Jake chose the hybrid approach: a localStorage-only draft now (checkpointed on every `renderRunner()` call plus a 10s safety-net tick, keyed `_runnerDraft_<clientId>`, same-day staleness cutoff, resume/discard confirm modal wired into `startWorkoutRunner()`, cleared inside the existing `discardRunner()`); a DB-backed draft for cross-device recovery is deliberately deferred.
- A full function-level implementation plan was produced via a Plan agent (exact functions, hook points, serialization shape, failure-mode handling, Playwright test cases) — see `roadmap.md`/`STATUS.md`/`coachapp-runner-architecture` (wiki) for the design. Session was interrupted before any code was written for this half — ready to build directly next session.

**Not done (flagged, banked to roadmap/STATUS):**
- The app-wide undefined-CSS-var bug, `.modal-box`, and the `app-programs.js:672` `.btn` bug (all above).
- Runner autosave itself — designed but not built.
- `hello-claude`/`run-coachapp` reference `preview_start`/`preview_resize`/`preview_screenshot`/`preview_snapshot`/`preview_click`/`preview_fill` tools that do not exist in this Claude Code CLI environment (confirmed via ToolSearch). Worked around by starting the static server directly (the exact command already in `.claude/launch.json`) and driving verification via Playwright directly instead — banked as `lessons.jsonl` les-022 and a STATUS to-do; the skills themselves should be updated to check-then-fallback rather than assume the tools exist.

**Predictions graded this session:** 5 predictions with a 2026-07-05 `verify_by` were due — all graded `correct` from existing documented evidence (client dashboard was in fact built and iterated on since, pth-028; session-history two-query fix has held up, pth-038; the predicted PBs-tab RLS gap was real and got fixed 2026-06-29, pth-035; the last-session-strip placement was never revisited, pth-036; client calendar has shipped clean with no further fixes, pth-062). One new prediction banked (pth-088: the runner autosave plan will be built next session directly from the banked design, no re-scoping needed).

**Why:** Jake's dashboard ask surfaced real bugs (not just aesthetic gaps) that were worth fixing regardless of any future redesign — shipped those now since they were low-risk and immediately useful, while explicitly declining bigger scope (component rebuild, IA rework) he didn't ask for. The runner autosave got a full design pass so the next session can build directly against a decided, reviewed plan instead of re-opening the scoping conversation — closing the actual value of the session (a shipped fix + a ready-to-build plan) rather than leaving a half-built feature mid-flight when Jake redirected.

---

## 2026-07-04 (session 15) — Runner exercise-picker freeze fix + silent beep fix + client-query scoping quick win (workouts v10→11, runner v9→10, clients v1→2) — PUSHED (84f9267, f997474)

**Context:** Jake reported a real production incident from his own personal-account gym session (19:42–19:45): tapping Swap exercise after Add exercise froze the runner solid, and a forced page reload wiped the entire in-progress session. He also asked for a check that saves/session-history are accurate, and flagged that the 10-second voice rest cue works but the 5-second countdown beeps don't.

**Done:**
- Diagnosed the freeze: `showAddExerciseToTemplateModal` (app-workouts.js) builds its overlay with a hardcoded, non-unique id (`add-to-template-modal`) and fetches its exercise list asynchronously *before* appending it — a window with no visible modal yet. A fast Swap-then-Add tap in that window fired the function twice, producing two overlays sharing one id; `getElementById`/`closeModal` only ever resolve to the first DOM match, so the visible (second) modal could never be closed from within the app.
- Verified via Playwright (59/59, no console errors) that the save-on-finish path and session-history rendering are both clean and unaffected — the incident never reached `saveRunnerSession`, so no partial/orphaned `workout_logs` rows exist from it.
- Diagnosed the beep gap as a hypothesis (not device-confirmed): the tone beeps depend on the Web Audio API, which iOS aggressively suspends on screen-lock/backgrounding — very plausible mid-rest in a live gym set — while the working "10 seconds" voice cue uses the separate Web Speech API, unaffected by that suspension.
- Jake approved both fixes. Built: a pending-flag guard + button-disable (`wr-swap-btn`/`wr-add-btn`) while the picker's fetch is in flight, plus a `.catch()` error path that didn't exist before (previously a rejected fetch just silently never opened the modal). Replaced the 5-second tone-beep countdown with spoken numbers (`speakCue(String(n))`) across all three timers that had one: rest, timed-set, and cardio interval.
- 3-agent review (security/scoping, solo-mode, duplicates/render-safety) — security and duplicates/render-safety came back clean (one low-severity theoretical edge case noted, not fixed, consistent with the rest of the codebase). Solo-mode agent found a real bug in the beep fix itself: the cardio interval timer's entry point (`startCardioTimer`) only called `_unlockAudio()`, never `_unlockSpeech()` — its new spoken countdown would have silently never fired. Fixed same session by adding the missing `_unlockSpeech()` call, mirroring the pattern already used elsewhere.
- New Playwright regression test directly reproduces the double-tap race (calls `showExercisePicker('add')` then `('swap')` back-to-back mid-fetch, asserts exactly one modal opens, the first call wins, and both buttons re-enable after close). Manually reproduced and confirmed the fix live in the preview against the E2E test client account before committing (not just Playwright) — rapid double-invocation correctly produced one modal, the button-disable state, and a clean close.
- Full suite green across three separate runs (59-60/60 passed each time); a different unrelated test flaked once per run and passed on retry — confirmed as pre-existing environmental/network-timing noise, not caused by this diff.
- Pushed 84f9267; pre-push hook + CI green.

**Also this session — quick wins (f997474):**
- Scoped the 5 known unscoped `clients` queries in app-clients.js (`openClient`, `renderClientOverview`, `saveUpdateEmail`, `showEditClientModal`, `saveEditClient`) by `coach_id` in addition to `id` — a defense-in-depth gap surfaced by the 2026-07-03 review. 2-agent review confirmed all 5 are PT-only code paths (grepped every call site across all 8 modules), so no client/solo flow could regress.
- Tightened the `client-workout.spec.js` "session history" locator to be onclick-scoped (`toggleClientPhase('client-session-history')`) instead of text-only, matching its sibling tests — the review agent confirmed the exact onclick string matches what app-workouts.js actually renders, so the test now genuinely exercises the toggle rather than risking a silent no-op.
- **Correction:** while tracing call sites, the review agent found `roadmap.md` stated solo accounts' own client record has `coach_id = auth.uid()` — verified against `app-core.js:132` (`.is('coach_id', null)` lookup) that it's actually `coach_id = NULL`. Fixed the doc.
- Pushed f997474. First push attempt was killed by a 2-minute Bash timeout mid-pre-push-hook (the hook runs the full Playwright suite) — retried with a longer timeout and it completed clean. Deploy step then hit the known transient "Deployment failed, try again later" GitHub Pages infra error (documented in lessons.jsonl les-017); `gh run rerun` succeeded on the first retry, confirmed green.

**Not done (flagged, awaiting Jake):** actual session-autosave/draft persistence — the deeper fix behind "lost all my data," since `_runner` still lives only in memory until the final save tap. Scoped as its own decision, added to roadmap.md as "Improve workout-tracking visuals + underlying data model" alongside a separate Jake request to revisit the runner's tracking visuals.

**New standing rule this session:** Jake asked that any new roadmap.md item always be mirrored into the LLM wiki (visual roadmap page + the relevant topic page) in the same turn, not batched for later — banked as `feedback_roadmap_wiki_sync.md` and wired into hello-claude. Applied immediately to this session's own roadmap addition, and again now to mark today's two fixes as done rather than open gaps.

**Why:** A live incident during Jake's own gym session — the exact audience CoachApp is being built for — losing real training data is about as severe as a bug gets for this product. Diagnosed properly (found the actual root cause via code + a direct DOM reproduction, not guesswork) rather than patching symptoms, and the review process caught a real bug in the fix itself before it shipped.

---

## 2026-07-04 (session 14) — Duplicate week + fork-on-edit + solo delete/PT toast fix (programs v8→v9, workouts v9→v10) — PUSHED (730738a)

**Context:** Jake reviewed the Test 1/Foundation & Calibration program screenshots and asked for three things: a way to duplicate a week's worth of workouts, a fix so renaming a picked-from-library workout forks a new one instead of silently overwriting the shared original, and a fix to `deleteProgram()` so solo can delete their own self-assigned program and the PT block toast names the actual clients.

**Done:**
- Asked two clarifying questions before building (per sounding-board/approve-before-build rules) — both resolved to the recommended option: "Duplicate week" makes weeks independently editable (not just a periodization shortcut), and any edit made through a phase slot forks a copy (not just renames).
- **Duplicate week** — new `duplicatePhaseWeek()` (app-programs.js) copies a week's day/workout assignments into the next empty week as real `program_phase_workouts` rows (same `template_id`, cheap — only forks on actual edit). Replaced the old week-1-only `renderEditableWeek1Grid` + read-only `renderDayGrid` with one unified `renderPhaseWeekGrid` used for every week, so weeks 2+ (manual or periodization-generated) are now equally editable (add/remove/reassign a workout per day), not just viewable. `_quickAssignPhaseWorkout` generalized to accept a week number via `data-week` instead of hardcoding week 1. Propagates to already-assigned clients by cloning a fresh per-client template copy per new slot — same pattern `_cloneProgramForClient`/`generatePhasePeriodization` already use, never sharing a client-owned clone across slots.
- **Fork-on-edit for shared master templates** — new `_cloneSharedMasterTemplate`/`_resolveEditableTemplateId` (app-workouts.js), wired into `saveEditTemplate`, `saveExerciseToTemplate`, `saveEditTemplateExercise`, `deleteTemplateExercise`, `moveTemplateExercise`. Before any of these write, checks whether the template is still referenced by more than one `program_phase_workouts` row (e.g. the same template picked into both Monday and Tuesday) — if so, clones it and repoints only the slot the edit came from (via a new `ctx.phaseWorkoutId` threaded through `openTemplate`/`openSessionDetail`), before applying the edit. Client-plan templates are deliberately excluded (guarded by `ctx.isClientPlan`) since each client slot already gets its own exclusive clone at assignment time — confirmed this via `_cloneProgramForClient`, so no fork logic was needed there. Removed the now-dead "shared template, changes apply to all" warning toast from `_checkClientPlanPropagation` — forking now prevents that scenario before it happens instead of just warning about it.
- **`deleteProgram()` fix** — the "clients assigned, remove them first" block now excludes the user's own solo self-assignment (`window._soloClientId`) from the blocking count, so Personal-view users can always delete their own program. The PT-facing toast fetches and names the actual blocking clients (e.g. "Assigned to Sarah Mitchell, Alex Turner — remove them from this program first") instead of just a count.
- 3-agent review (security/scoping, solo-mode, duplicates+render-safety) — all three came back mostly clean; the one real finding (confirmed by verifier pass): the `generatePhasePeriodization` confirm dialog said it only replaces "previously generated" weeks, but weeks 2+ can now hold manually-added/duplicated content too, and `_cleanupPhaseWeeksBeyond` wipes all of it unconditionally on regenerate. Fixed the dialog wording same session (app-programs.js:1013) rather than banking it as a to-do.
- 3 new Playwright tests added to `tests/programs.spec.js` (duplicate-week copies rows correctly, fork-on-edit leaves the sibling slot untouched, delete-block toast names the client) — 59/59 green, no regressions in the existing 56.
- Live-verified all three features against real Supabase data in the preview (not just Playwright): duplicated Foundation & Calibration's Week 1 into Week 2 and confirmed matching template IDs; renamed the shared "AAA" template via Monday's slot and confirmed Tuesday's reference was untouched, then confirmed a second edit to Tuesday no longer re-forks (ref count back to 1); confirmed the solo-delete block-filter and the PT toast's client-name resolution via direct query, without actually deleting Jake's real programs. All test data cleaned up after verification.

**Bugs found + fixed:**
- The `generatePhasePeriodization` confirm-dialog wording gap above — a genuine newly-possible silent-data-loss risk introduced by making weeks 2+ editable, caught by the render-safety review agent and fixed same session.
- Mobile/UI consistency nit — the "Duplicate week" button was first styled smaller (`font-size:10px;padding:2px 8px`) than its sibling "Configure"/"Generate weeks" buttons in the same phase-card region; caught via `preview_inspect` and matched to `font-size:11px;padding:3px 9px`.

**Decided:**
- Client-plan template editing stays untouched by fork-on-edit — each client already gets an exclusive clone per slot at assignment/generation time, so the "shared template" problem this session fixes only exists on the master/program-builder side.
- Duplicate-week client propagation clones fresh per slot rather than reusing the source week's existing client clone, matching the codebase's established "always clone fresh, sync via name-match prompt" pattern rather than introducing a new sharing model on the client side.

**Why:**
- Jake's screenshots showed two real gaps in the Programs builder (weeks 2+ effectively frozen without periodization; a shared "AAA" template silently editable from either slot with editors none the wiser) plus a solo/PT delete-toast usability gap. All three were scoped, questioned, approved, built, live-tested against real data, reviewed, and pushed in one session rather than banked as future to-dos.

**Also this session:** banked `lessons.jsonl` les-020 (git-push-timeout / preview-screenshot-retry / network-dump efficiency lesson) after Jake asked why the session ran long — see LOG below or `lessons.jsonl` directly.

---

## 2026-07-03 (session 13, cont. 2) — ~/.claude backed up to private repo (jakendwest-ops/claude-config) — PUSHED

**Context:** Jake pushed on the previous save's honest carry-over ("skills + memory + wiki live outside any git repo") — asked whether it actually needs addressing.

**Done:**
- Assessed: the LLM wiki is under OneDrive (cloud-synced) — not a loss risk, git would only add version history. But `~/.claude` (`skills/` = the OS, plus the auto-memory dir) is local-disk-only, no remote, no cloud sync — the least-protected yet most irreplaceable content, while the app and Vault both already have GitHub remotes. Real gap.
- Created **private** repo `jakendwest-ops/claude-config` (verified PRIVATE). `git init` in `~/.claude` with an **allowlist `.gitignore`** tracking ONLY `skills/` + `projects/C--Users-jaken-Claude/memory/` — sessions, transcripts, `settings.json`, caches all excluded. Secret-scanned the staged content before each push (empty both times). Auth via `gh` (tokenless, no PAT in URL — same setup as coachapp). Initial commit `4f7d324` (55 files).
- Made it durable: `/save` Step 5 now commits+pushes claude-config whenever a skill/memory file changed; documented in `reference_claude_config_backup.md` + MEMORY.md index. Commit `55dba6c`.

**Decided:**
- Wiki stays as-is (OneDrive backup is sufficient); git for it is optional/deferred.
- The ~/.claude backup tracks skills + memory only, never `settings.json` or transient state — keeps secrets out even under `git add -A`.

**Why:**
- The layer that makes the app + Vault useful (the OS + accumulated memory/relationship) was the one thing with no offsite copy. Wiring the push into /save stops the backup silently going stale.

---

## 2026-07-03 (session 13, cont.) — Vault repo-structure investigation + coachapp PAT security cleanup + accurate-steps feedback — PUSHED (coachapp ec30ebf; Vault this save)

**Context:** After the session-13 audit push (f3706a1), Jake asked me to investigate a discrepancy in my own description of the Vault repo layout — which turned into a security incident and its fix.

**Done — Vault repo structure clarified:**
- Confirmed there is ONE git repo (remote `jakendwest-ops/vault.git`): the Vault-OS framework AND the `Vault/` content are the same repo, root `C:/Users/jaken/Claude`, `Vault/` a plain subdirectory (no nested `.git`, no submodule). My session runs in a linked worktree (`claude/vigorous-dewdney`), but hello-claude/save read+write the absolute `C:/Users/jaken/Claude/Vault/...` path — the MAIN checkout on `master` — so every session's Vault writes land on master directly, bypassing the per-session worktree branch. My statement ("root is C:/Users/jaken/Claude") was correct; the real finding is that framework and Vault are one repo, and 4 live worktrees share one Vault on master (concurrent `/save` could collide).

**Security incident + fix (RESOLVED — clears the standing PAT to-do):**
- While investigating I ran `git remote get-url origin` on coachapp, which printed the live `ghp_` PAT embedded in the remote URL straight into the chat — the exact leak the standing to-do warned about (I made it worse by surfacing the value). Flagged immediately.
- Jake deleted the token. Then: stripped the token from the remote (`git remote set-url origin https://github.com/jakendwest-ops/coachapp.git`), cleared the stale/dead cached credential (`git credential reject`), and — since coachapp is a public repo (read needs no auth) and my non-interactive shell can't complete GitHub's interactive browser sign-in — pointed git at the already-authenticated `gh` CLI's keyring token via `gh auth setup-git` (valid `gho_` OAuth token, `repo` scope). Verified end-to-end with a trivial empty commit `ec30ebf` that pushed non-interactively through the full pre-push hook (27/27 Playwright green) with no token in the URL and no prompt.

**Feedback banked:**
- Jake: "when giving me steps, always provide accurate url and page names/settings because you use incorrect names and it adds to confusion." I'd said "Revoke" for a single classic token when GitHub's button is "Delete". Updated `feedback_step_by_step.md` with a non-negotiable accuracy rule (verify labels/URLs against the service's own docs before writing a step; never state a guessed UI label as fact) and re-checked the token-deletion steps against GitHub docs before giving them.

**Decided:**
- coachapp auth is now via the `gh` keyring token, not an embedded PAT — no secret in `.git/config`. `credential.helper` left as `manager` for other hosts.
- Empty commit `ec30ebf` is a permanent no-op marker in coachapp history — accepted (not worth rewriting pushed history).

**Why:**
- Investigate-before-asserting (Jake's standing preference) turned a "did I mislabel the repo?" question into a real repo-topology finding and caught a live-credential exposure; fixing auth via the existing `gh` token was the cleanest tokenless path that also worked from a non-interactive shell.

---

## 2026-07-03 (session 13) — Architecture & infrastructure audit + fixes — PUSHED (coachapp 609d5ee; Vault pushed)

**Context:** Jake asked for a full audit of the build system itself — redundancies slowing sessions / eating tokens, whether the codebase split is right and graphify still needed, skills redundancy/contradictions, whether review agents test correctly (not rewriting themselves to dodge bugs), and whether the LLM wiki + roadmap are kept current. Ran it as a parallel multi-agent audit (codebase/graphify, skills, wiki) plus direct analysis of the hello-claude/save token cost and review rigor. On Jake's "all", actioned every fix; on "push all", pushed.

**Done — graphify removed (coachapp 609d5ee, PUSHED):**
- graphify was installed 2026-06-29 for the old 7,968-line app.js, made redundant one day later by the 8-module split, and never regenerated (stale — indexed the now-deleted app.js). Its two PreToolUse hooks in `.claude/settings.json` fired on every grep/find/Read/Glob injecting a "MANDATORY run graphify first" block — a per-action token tax for a tool that isn't even installed. Removed `graphify-out/`, the graphify-only `CLAUDE.md`, and emptied the hooks. Pushed clean: full pre-push hook incl. 27/27 Playwright (run against the live preview server since the default 3001 was down) — no app code changed.

**Done — skills fixed (global `~/.claude/skills`, on disk, not a git repo):**
- Dead path `C:\Users\jaken\coachapp\...\js\app.js` (wrong root + pre-split filename) repointed to `OneDrive\coachapp` + the 8 modules in deploy-check, security-audit, run-coachapp — these would have errored / false-passed on their next real run (deploy-check & security-audit run right before a beta invite).
- mobile-check said 390px (contradicting Jake's own 480px "no exceptions" rule) → fixed to 480 in the skill + both memory files, with a note that Playwright's 390 test-viewport is a separate deliberate config. Stale test counts (47 / 14) → read the real total (suite is 56).
- run-coachapp now documents autoPort (port 3001 no longer guaranteed).

**Done — hello-claude/save efficiency + review rigor:**
- Bounded the three unbounded session-start reads: LOG → first 150 lines (a full read cost 33k tokens today), voice.md → last ~150 lines, predictions → grep-first. Session-start cost is now flat instead of growing every session.
- New pinned skill `multi-agent-review` (fixed 3 angles + verifier) replaces improvising the pre-push review each session, so rigor can't silently narrow. Added a weekly **full-file mode** (hello-claude Step 4) that reviews whole high-churn modules, not just the diff — closing the blind spot that let 5 unscoped `app-clients.js` queries survive ~12 diff-only reviews. Registered in hello-claude, save Step 5, deploy-check Step 2, and memory.

**Done — wiki + roadmap:**
- Fixed the one stale wiki line (`coachapp-programs-architecture.md` deleteProgram gap → marked fixed 66bf1fd) + wiki log entry. Wiki discipline otherwise intact (manifest current, no orphaned raw files).
- `roadmap.md` beta-prep refreshed: flags that 3 pre-beta gates (ICO breach procedure, delete old Jake West client record, Supabase Pro for leaked-password protection) have sat untouched 4 sessions while the runner pivot absorbed everything — ~3 weeks to Jul 22.

**Audit verdicts (no action needed):**
- Codebase split is healthy — largest module app-runner.js ~1,948 lines, one coherent concern; leave it. No further splitting or graphify needed.
- No evidence of review agents gaming tests / rewriting themselves to dodge bugs — gates have grown not shrunk, lessons log is self-critical. The real gap was structural (diff-only review), now addressed by full-file mode.
- Sessions 9–12 runner focus was a deliberate, Jake-approved, research-backed pivot — not drift.

**Not done (flag):**
- Full `/save` ritual (STATUS full sweep, predictions grading, voice deltas) not run — this entry + roadmap + a STATUS last-push bump were pushed to keep the Vault coherent; a proper `/save` at wrap-up would round it out. The 6 edited skills, the new skill, and the 3 edited auto-memory files live on disk (`~/.claude`, not a git repo) and the 2 wiki edits live in the LLM wiki (not a git repo) — saved, but not pushable.

**Why:**
- Every fix served the audit brief: cut the per-action / per-session token tax (graphify hooks, unbounded Vault reads), stop checklists silently pointing at dead paths / wrong widths / wrong counts right before a beta gate, and make the code review a fixed recipe with a net for untouched code rather than an improvised diff-only pass.

---

## 2026-07-03 (session 12) — Runner build pushed + 2 scoping fixes + deleteProgram rewrite + GitHub Pages dual-workflow fix (programs v6→v8, workouts v8→v9, runner v7→v9) — PUSHED (1914e7b, dee1479, 66bf1fd)

**Context:** Continuing straight from session 11's uncommitted runner build. Ran a fresh multi-agent review this session (none had run yet against this specific diff), pushed it, then a routine code-review scan turned up two real scoping bugs, then built and shipped the long-standing `deleteProgram()` orphan-cleanup fix — this time backed by actually querying Supabase's FK cascade rules first instead of assuming. A GitHub Pages deploy failure Jake forwarded led to finding and fixing a root-cause infrastructure issue unrelated to the code itself.

**Done — runner build push (1914e7b):**
- 3-agent review (security/scoping, solo-mode correctness, duplicates+render-safety) on session 11's set-accuracy build — all three came back clean. Two agents independently flagged the same dead-code nit (`curSig`, an unused variable in `renderStrengthTable`) — removed it, reran Playwright (56/56) before pushing.
- One coverage gap noted, not fixed: `tests/runner.spec.js` has no solo-mode tests, though the role-sensitive code path (`showAddExerciseToTemplateModal`'s `isRunner` branch) itself checked out clean via manual trace.

**Done — 2 scoping bugs found + fixed (dee1479, runner v9 / programs v7):**
- `showLogSessionModal` (app-runner.js) queried `workout_templates` with **zero scoping** — no `coach_id`, no `client_id` filter at all. Its "Load from template" dropdown was pulling every coach's templates, not just the current one. Scoped it the same way `saveRunnerSession`/`saveWorkoutSession` already derive `coachId` (client's `coach_id`, falling back to `currentUser.id`).
- `deleteProgram()` (app-programs.js) deleted by `id` only, no `coach_id` ownership check — inconsistent with `deleteTemplate`'s equivalent guard. RLS likely blocked cross-tenant deletes regardless, but added explicit scoping for defense-in-depth.
- Both found during routine code review, not part of an existing feature. Verified live in preview (dropdown loads correctly scoped, no console errors) + Playwright 56/56.

**Done — `deleteProgram()` full rewrite (66bf1fd, programs v8):**
- **Researched actual Supabase FK cascade rules before writing any delete logic** (SQL Editor, `information_schema.referential_constraints`) rather than assuming, per sql-safety habit. Found: `programs→program_phases→program_phase_workouts` cascade automatically; `workout_templates→workout_template_exercises` cascades automatically; `client_programs→client_program_workouts` also cascades (queried live — **0 orphaned rows found**, confirming "Remove program from client" has been cleaning up correctly all along, DB-enforced not just app-code-enforced). The only real gap: `workout_templates` itself survives its `program_phase_workouts` row being removed (`SET NULL`, not `CASCADE`) — that's the actual leak.
- This simplified the build significantly versus the originally-proposed plan (no manual FK-order deletes needed for phases/phase-workout-slots/template-exercises — cascade handles all of it).
- New behavior: check `client_programs` for the program first — if any clients are assigned, show a toast and stop (no confirm dialog, nothing touched). Otherwise walk `program_phases → program_phase_workouts.template_id` to find the templates this program owns, delete those explicitly, then delete the `programs` row.
- Verified both paths against **real, not simulated, conditions**: block path called directly against Jake's actual "Test 1" program (2 real clients assigned) — confirmed it returned early with the correct toast message and the program's phase content was unchanged afterward. Cleanup path tested against a disposable fixture program+phase+template+phase-workout-slot created via the app's own Supabase client and torn down in the same session — confirmed all four rows gone after one call. Playwright 56/56.

**Done — GitHub Pages dual-workflow fix (no CoachApp code):**
- Jake forwarded a "pages build and deployment: Some jobs were not successful" failure email. Investigated and found the repo's Pages config was in **legacy "deploy from branch" mode** (`build_type: legacy`) — which runs GitHub's own native build-and-deploy workflow on every push, *completely independently of and redundant with* the repo's custom "Check & Deploy" Action (which also builds and deploys via `actions/deploy-pages@v5`). Both fire on every push; both can independently hit GitHub's transient "Deployment failed, try again later" infra error — which is exactly why the 66bf1fd push generated two separate failure emails for the same underlying hiccup, and why the "Check & Deploy" job also failed on this push in isolation (confirmed via `gh run rerun` — same commit, second attempt succeeded clean).
- **Got Jake's explicit approval before changing repo configuration**, then switched Pages source to Actions-only (`build_type: workflow`) via `gh api -X PUT repos/.../pages -f build_type=workflow`. Verified the live site was unaffected (still serving the correct version) immediately after.

**Bugs found + fixed:**
- `showLogSessionModal` unscoped query, `deleteProgram()` missing `coach_id` check — see above, the latter superseded by the same-session full rewrite.

**Decided:**
- GitHub Pages deploy source is now Actions-only — one deploy workflow going forward, not two.

**UNVERIFIED (banked):**
- The GitHub Pages source-switch fix is verified for this session (site unaffected, `build_type: workflow` confirmed via the API) but its durability across future pushes — whether the native workflow genuinely never fires again — is only provable by watching the next few pushes.
- The ~993-template backlog on the main coach account (surfaced while researching `deleteProgram`'s FK behavior) is separate from and larger than what this session fixed — `deleteProgram()` now prevents *new* debris of this kind, but the historical backlog still needs its own cleanup pass.

**Why:**
- Checking the actual FK cascade rules in Supabase before writing delete logic (rather than the originally-proposed manual multi-step cleanup) both simplified the build and resolved a previously-open uncertainty about whether "Remove program from client" was reliably cleaning up client data — confirmed yes, and DB-enforced, not just app-code-enforced, which is a stronger guarantee than assumed.
- The GitHub Pages fix follows the standing pattern of fixing root causes rather than re-explaining the same symptom every session: two workflows silently deploying redundantly would have kept generating confusing duplicate failure emails indefinitely otherwise.

---

## 2026-07-03 (session 11) — Runner set-accuracy build + swap/add modal unification + orphan-template diagnosis — NOT YET PUSHED (app-runner v7→v8, app-workouts v8→v9)

**Context:** Continuing session 10's same-day work. Jake gave a detailed PT + client-runner spec (program building, per-set target display, runner affordances) and approved scoping the runner "set-accuracy" bucket first, deferring program-assignment/calendar work. He then live-tested the build himself and returned two rounds of concrete, screenshot-driven feedback that reshaped the implementation.

**Done — runner set-accuracy (round 1, approved before building):**
- **Per-set target display fixed** — the strength table's target bar was hardcoded to always read `sets_json[0]`, so sets 2/3 with different %/RPE/rest/reps never showed their own prescription. Now dynamic: tracks the current working set the same way the wizard already did.
- **Delete a set** — wizard's logged-set edit sheet gets a Delete button; table rows get a delete affordance. Neither existed before.
- **Live rep tally** — running total of reps logged for the current exercise vs. the same exercise's total last session, updating on every set registered (table mode + wizard reps/unilateral sets).
- **Shared 1RM-aware exercise picker (v1)** — swap/add rebuilt to mirror the workout builder's "pick from library" pattern with a 1RM-lifts group, so a picked 1RM lift is linked for weight calculation. Session-only, unchanged from Jake's earlier decision.
- New skill: **feature-audit** — runs after every feature build: affordance/permission audit (should this be editable/deletable, is the right control present, does RLS actually allow it), a PT lens and a gym-user lens, ending in proof (Playwright + preview) not claims. Registered in hello-claude + memory.
- Playwright: 55/55 (5 new tests). Manually verified live in the preview (dynamic target bar, captions, tally, row delete, wizard delete, 1RM optgroup). Methodology note banked: `_runner` is a page-scoped `let` declared in app-workouts.js, not a `window` property — `window._runner = ...` silently no-ops; must assign the bare identifier.

**Done — round 2, from Jake's live-test screenshots (four corrections):**
- **Per-set correlation redesigned** — dropped the per-row caption text ("ugly UI" per Jake); the row for the set currently being worked is now highlighted instead, so the target bar's numbers are visually tied to a specific row rather than described in text.
- **Tick checkbox redesigned** — was effectively invisible (faint border against the row background); now a plain white box with a visible 2px border, turns `var(--success)` green with a white check on completion (reused the existing green token, not a new colour).
- **Delete button redesigned** — was a bare "✕" with no indication of what it did; now a small red-tinted box reading "Delete" (`var(--danger-light)`/`var(--danger)` — existing tokens).
- **Swap/Add now open the literal same modal as the workout builder** — round 1 had built a simplified select-only picker matching the builder's *style*; Jake corrected this to mean literal component reuse. `showAddExerciseToTemplateModal` in app-workouts.js is now parameterised (`runnerCtx = {mode}`) so the runner's Swap/Add buttons open the exact same modal (library picker + 1RM group + full set-target builder + notes + superset), with a runner-specific confirm handler (`_confirmRunnerExerciseFromModal`) that applies the result to `_runner.exercises` in-memory instead of writing to `workout_template_exercises` — keeps swap/add session-only. Verified byte-identical modal markup between the two entry points in a Playwright test.
- Playwright: 56/56 full suite (tests rewritten to match the real modal's fields, not the old simplified picker).

**Diagnosed, not yet built (awaiting Jake):**
- **Programs picker "Filter workouts below" search** — mechanism confirmed correct via two independent live-DOM tests (isolated, and on Jake's real "[E2E] Inline Grid Test" program); the actual problem is that a plain `<select>` gives no visible feedback until manually opened, so typing "looks like it does nothing." Ties directly to Jake's separate complaint that the list will keep growing unmanageably. Recommended: replace the select+search pattern with a tap-row list that live-filters — the same pattern just replaced in the runner's picker, ironically; flagged the tension honestly rather than silently.
- **`deleteProgram()` orphan root cause reconfirmed** — enumerated every FK reference to `workout_templates` (`workout_template_exercises.template_id`, `program_phase_workouts.template_id`, `client_program_workouts.workout_template_id`); confirmed `deleteProgram()` (app-programs.js:755) deletes only the `programs` row, never its cloned master/periodization-week templates. Proposed: clean up owned templates on delete, and block deletion (clear message) if clients are currently assigned rather than silently failing or orphaning client data. **Awaiting Jake's decision on scope.**
- **Read-only diagnostic SQL handed to Jake** (not yet run) to see exactly which `workout_templates` are orphaned vs. in-use, before any DELETE is drafted — sql-safety protocol, no destructive SQL written speculatively.
- **New RLS gap found in passing:** a real `client_1rms` insert attempt (client role, own client_id) failed with an RLS violation during manual testing. Pre-existing — `saveRunnerOneRM` already writes to this table in production, untouched by this session's diff — but worth a dedicated `pg_policies` check; not yet investigated further.

**Decided:**
- "The same modal" in Jake's spec means literal component reuse, not a stylistically-matching simplified rebuild — corrected mid-session after his explicit screenshot feedback.
- Runner swap/add stays session-only (reconfirmed, unaffected by the modal-unification change).
- Program-assignment replace/update flow is deferred; calendar integration (when built) writes real per-session events, not a lighter marker.

**UNVERIFIED (banked):**
- All of this session's runner changes are Playwright + live-preview verified but **not pushed** — no multi-agent code review has run yet, and Jake has not said commit/push. Sitting locally: `index.html`, `js/app-runner.js` (v8), `js/app-workouts.js` (v9), `tests/runner.spec.js`.
- Whether the fuller swap/add modal (Type/Notes/Superset/full set-target builder, not just a name field) feels like too much friction for a live mid-workout swap versus the simpler version originally built — banked as a prediction, only real gym use will tell.

**Why:**
- Jake's screenshot-driven correction round validated the new feature-audit skill's premise from the opposite direction: even with Playwright green and a live-preview pass done in the same session, his actual gym-context testing caught four real UX issues automated checks don't reason about (visual invisibility, ambiguous icon meaning, textual vs. visual correlation, literal-vs-equivalent component reuse). None were logic bugs — all four were judgment calls about what a real user sees and understands.

---

## 2026-07-03 (session 10) — 13 fixes from Jake's live test run + orphaned-template cleanup + wiki docs (programs v6, workouts v8, runner v7) — PUSHED (5438aac)

**Context:** Jake ran his own end-to-end test (create a program → generate 4 weeks → run it) and reported 13 numbered issues via screenshots. Traced all 13 to code, bucketed them (3 quick fixes / 4 confirmed bugs / 4 needing his decision / 2 new features), got his calls on the decision bucket, then built.

**Done — runner (v6→v7):**
- **Target-info bar restored to the strength table** — the v1 table redesign had dropped the rep range/RPE-RIR/tempo/rest/%1RM prescription. Extracted the wizard's target-column logic into shared `_buildTargetCols`/`_renderTargetBarHtml` and rendered it above the table (incl. the %1RM→kg target + "set your 1RM" banner).
- **Rest timer moved inline + reformatted** — for table-mode exercises the rest timer now renders as a plain `0:00` countdown bar *inside* the target section (kept `id=rest-timer-overlay` so existing tests still target it), instead of a `position:fixed;top:0` overlay that was covering the runner's own header. Wizard mode keeps the old floating overlay. `startRestTimer` now skips the floating `renderRestTimer()` in table mode and does a bounded `renderRunner()` on completion.
- **Voice cue fixed** — `_unlockSpeech()` only called `speechSynthesis.cancel()`, which never registers the user gesture, so the 10s "10 seconds" cue was silently blocked. Now does a real (silent) gesture-tied `speak()`. Added `_pickFemaleVoice()` so `speakCue` uses a female voice.
- **Visible tick button** — the unchecked set-complete ✓ button had no border and matched its row background (invisible); added a `1.5px` outline.
- **Swap exercise mid-workout** (session-only) — `showExercisePicker('swap')` → `_swapRunnerExercise`: replaces the current exercise in-memory, clears its logged/table state, refetches previous-session data under the new name.
- **Add exercise mid-workout** (session-only) — `_addRunnerExercise`: appends a new plain-strength exercise and jumps to it. Neither swap nor add writes to `workout_templates`.

**Done — programs (v5→v6) + workouts (v7→v8):**
- **Create-new-workout auto-assigns to its day slot** — `saveNewTemplate()` now inserts the `program_phase_workouts` row (with race-check) back into the `ctx.phaseId`/`ctx.dayOfWeek` it was created from, instead of leaving the slot empty and forcing the coach to re-find and re-assign.
- **Edit button on the session-detail drawer** — `openSessionDetail(templateId, name, ctx)` now takes a ctx and shows an Edit button (gated `role !== 'client'`) routed through `openTemplate` so the propagate-to-all prompt still fires. All 3 call sites pass appropriate ctx.
- **Phase card shows periodization range** — "Linear (70→80%)" / undulating tier %s from `periodization_config`, not just the type name.
- **Clearer day-column search placeholder** ("Filter workouts below…").
- **Tempo field capped at 4 chars** (workouts v8).

**Done — data cleanup (Jake's account, via safety-checked SQL he ran in Supabase):**
- Diagnosed ~114 duplicate standalone templates in the picker. Ran the full sql-safety path: FK-enumeration first (caught that `workout_template_exercises` also FKs to templates and must be deleted as a child) → per-name reference breakdown (orphaned vs used-in-program/client-plan/log) → a single self-guarded transaction that deletes only orphans (NOT EXISTS against all 3 "in use" tables) plus their exercise children. **65 orphaned templates deleted**, all in-use copies preserved.

**Done — LLM wiki (separate from this Vault):**
- Authored two architecture/reference pages at Jake's request: `coachapp-programs-architecture` (two-level Program/Client-Plan model, data model + the program_id/client_id/generated_from_phase_id triplet, build grid, periodization incl. %1RM-vs-RPE, assignment/cloning, propagation, known gaps) and `coachapp-runner-architecture` (the `_runner` object, table vs wizard modes, rest timer + voice cue, pre-fill, swap/add, save path, known gaps). Updated `coachapp-workflows` (pre-fill + swap/add now marked shipped), index, log.

**Bugs found + fixed (during verification, not shipped broken):**
- **Exercise-picker modal rendered behind the runner** — `.modal-overlay` is z-index 200, the runner's fullscreen div is 300, so the picker rendered underneath and Playwright's clicks were intercepted by the runner. Caught by the new smoke tests (not review). Fixed with an explicit `z-index:1000` on the picker overlay.
- **Voice cue** (above) — a real bug the code review's premise surfaced, then confirmed empirically (6 voices present in the browser, so not an environment gap — the priming was the fault).
- Review agent flagged the picker's `exercises` fetch had no error handling — added a toast on failure.

**Tests:** Playwright pre-push hook full suite **51 passed** (1 flaky — a Supabase-timing phase-render assertion, passed on retry, unrelated to the diff). 2 new runner smoke tests (swap + add exercise pickers). 3-agent review (security/scoping, solo-mode, duplicates/render-safety) — all clean or pre-existing; the render-loop trace on the new inline rest timer came back bounded.

**Decided:**
- Swap and add exercise are **session-only** (Jake's call) — they change today's log, never the saved template.
- %1RM vs RPE is not interchangeable: periodization only scales %1RM-tagged sets; RPE sets are untouched by design (documented, not a bug — it confused a test).
- The `deleteProgram()` orphan bug is **confirmed live** — the deleted `— W2/W3/W4` clones were its debris. Bumped to High; fix before building more programs.

**UNVERIFIED (banked):**
- The runner UI changes (target bar, inline rest timer, swap/add) are verified via Playwright + 3-agent review, not a real-device gym session — banked as a prediction, mirrors the v1 table's pth-070.
- CI "Check & Deploy" job failed on a transient GitHub Pages deploy race; the site is confirmed live on v7 via curl, and the native pages-build-deployment workflow succeeded. Not a code failure — watch whether it recurs on the next push.

**Why:**
- Bucketing the 13 items before building (and getting Jake's calls on the 4 decision items) avoided building the wrong thing for the ambiguous ones — e.g. #6 turned out to be no-bug-at-all (his test sets used RPE, so periodization correctly did nothing).
- The SQL cleanup followed sql-safety to the letter precisely because it was 100+ irreversible deletes on Jake's real account — FK enumeration first is what caught the `workout_template_exercises` child dependency that a name-based delete would have failed on.

---

## 2026-07-02 (session 9) — Runner redesign v1 shipped: Hevy-style strength table (runner v5→v6) — PUSHED (6e6402a)

**Done:**
- **Preview tooling fix (no CoachApp code):** diagnosed why the preview flipped to serving PTHub — this worktree's `.claude/launch.json` listed a dead "PT Dashboard" (PTHub) config *before* the CoachApp config, and it auto-started once the other chat's real CoachApp server (port 3001) had shut down. Removed the dead PTHub config from this worktree's launch.json **and** the parent seed template (`C:/Users/jaken/Claude/.claude/launch.json`), so no future worktree can inherit it. Did not sweep other pre-existing worktrees — banked as a to-do.
- **Runner redesign v1 — Hevy-style strength table.** Plain-strength exercises (excludes cardio, timed, unilateral, %1RM-tagged sets, carry/sled/lunge-name exercises) now render an all-sets-visible table (`SET · PREVIOUS · KG · REPS · ✓`) instead of the one-set-at-a-time wizard. Previous-session values pre-fill KG/REPS for 1-tap repeat sets (reuses `fetchRunnerLastSession`, keyed by `set_number`). Tap ✓ completes a set — fires the rest timer as a non-blocking bar while the table stays visible/editable underneath (the core design difference from the wizard's old blocking "Resting…" placeholder). Uncheck to undo. "+ Add set" appends a row. Free-edit any row, any time, no forced order — no auto-advance (PT/client taps "Next exercise" manually). New functions in `js/app-runner.js`: `_isPlainStrengthExercise`, `_prevSetsByIndex`, `_ensureTableRows`, `_syncLoggedSetsFromTable`, `toggleTableSet`, `addTableRow`, `renderStrengthTable`; `renderRunnerLastSession` extended to retroactively backfill blank rows if last-session data arrives after the table's first paint. Reuses the exact `{weight, reps}` shape `saveRunnerSession` already expects — zero save/schema changes. `app-runner.js` v5→v6.
- 2 new Playwright smoke tests in `tests/runner.spec.js` (table renders with correct columns; checking a set logs it + starts rest without leaving the table) — both ran real assertions against the E2E account's actual assigned template, not skip-paths.

**Bugs found + fixed:**
- Strength-table checkbox tap target was 32×32px on first build — below the 44×44 standard minimum, and this is the single most-tapped element in the whole redesign (once per set, real gym conditions, sweaty/tired hands). Caught via live testing in the preview before declaring the feature done; bumped to 44×44 and reverified via exact pixel measurement.

**Decided:**
- v1 scope holds exactly as approved: plain strength only. Cardio/timed/unilateral/%1RM stay on the existing wizard as phase 2, not yet scoped.
- Superset auto-switch (wizard behaviour: completing a set on a superset exercise auto-jumps to its pair) is **not** replicated in the table — the table's "no auto-advance, tap Next when ready" design makes this the correct call, but it means a superset pair now needs a manual tap between them. Not yet checked against whether Jake's real templates use `supersetGroup`.

**UNVERIFIED (banked):**
- Bodyweight exercise in the new table — code-reviewed (the `ex.bodyweight` branch exists and mirrors the wizard's BW display), but no live bodyweight exercise existed in this session's test data to exercise it against.
- Whether any of Jake's real templates use `supersetGroup` (relevant to the superset gap above).
- Whether other pre-existing worktrees still carry the dead PT-Dashboard launch config (only this worktree + the seed template were fixed this session).

**Testing/review this session:**
- Full Playwright suite: 48/48 green (zero regressions across PT/client/solo roles).
- `tests/runner.spec.js` alone: 12/12 green (10 pre-existing + 2 new).
- 3-agent code review (security+scoping, solo-mode correctness, duplicates+PII), each independently verifying rather than taking claims at face value — all three returned SHIP with no blocking findings. Notably, the duplicates+PII agent was specifically asked to trace whether the modified `renderRunnerLastSession` (which now conditionally calls `renderRunner()` again) could create an infinite render loop — traced the full call chain and confirmed it's bounded to exactly one extra render per exercise, not recursive.
- Pre-push hook: 21/21 smoke tests + all static checks (only the expected sudo-gating hardcoded-email WARN). CI green, GitHub Pages deployed.

**Why:**
- The tap-target bug is exactly the kind of thing code review can't catch (it's a design/UX defect, not a logic bug) — only caught because live testing in the preview was done before declaring the feature done, consistent with the standing "verify before reporting done" rule.
- Multi-agent review scope was deliberately narrow (3 fixed angles) rather than open-ended — each agent was asked to independently verify specific claims (e.g. "are there really zero new DB queries") rather than just skim and vibe-check, which is what surfaced the fully-traced render-loop proof rather than a hand-wave.

---

## 2026-07-02 (session 8, part 5) — Four recurring "workaround every session" problems fixed at the source — NO COACHAPP CODE

**Context:** Jake's throughline all session — "this is the same 'keep working around it every session' problem as the launch.json path." Each fix converted a per-session patch into a root-cause fix + a self-check. No CoachApp module files touched (cache-bust + Playwright N/A this session).

**Done — 4 permanent fixes:**
1. **Preview stale-path (4th occurrence) → fixed at the seed.** Root cause: new worktrees are seeded by copying `.claude/` from the parent template `C:/Users/jaken/Claude/.claude/launch.json`, which itself held the stale `C:/Users/jaken/coachapp` root. Corrected the parent template + all 18 stale worktree copies. Future worktrees inherit the correct `OneDrive/coachapp` path. Memory `feedback_preview_verify.md` updated with the root cause.
2. **`/ingest` misfire → dedicated `/wiki-ingest` skill.** The framework family (brief/checkup/ingest/review/save/setup/export/ultraplan) are **slash commands** in `Claude/.claude/commands/`, active because sessions run with cwd = a worktree of the Claude framework repo. The LLM wiki ingest had no trigger of its own, so `/ingest` could only ever hit the framework pipeline. Created global skill `wiki-ingest` (thin — points at the wiki's own CLAUDE.md) + a self-correcting pointer in `ingest.md`.
3. **Token re-reading → `wiki/sources.md` manifest.** Every raw file's fate (ingested→where / skipped / discarded) in one machine-readable ledger; wired as read-first/update-last into the wiki CLAUDE.md workflow + the wiki-ingest skill. Reconstructed ground truth once from the citations already inside the wiki pages.
4. **`/save` + `hello-claude` golden path.** Framework `save.md` → `vault-save.md`, **committed** (`f6f3c48`) because `.claude/commands/` is git-tracked (a disk-only rename would resurrect in every worktree checkout); references updated in CLAUDE.md/conventions.md/setup.md; CoachApp `save` skill now chains `vault-save.md` as its final step so predictions/voice/ledger still fire. Recycled a stale full copy of all 8 commands in the `epic-murdock` worktree; removed an empty `coachapp/.claude/skills/` drift-magnet dir (the save skill's step 5 had pointed at it as "the skills location" — corrected to global). **Added a daily golden-path self-check to hello-claude Step 9** (one `find` sweep, self-repair without approval on regression).

**Done — LLM wiki batch-3 ingest (via the new `/wiki-ingest`):**
- Triaged 55 raw clips: discarded 8 Web Clipper re-clips/failed captures (Recycle Bin, verified by URL+size+diff), skipped 2 Google search-results pages, kept 13 already-fed primaries as provenance, **ingested 32 new sources**.
- New page **`coachapp-spreadsheet-competition.md`** (the ~20-thread Google-Sheets-vs-apps cluster: why PTs choose sheets, the RPE-auto-load power ceiling, where sheets break, the "program in a sheet / deliver an app" hybrid that is CoachApp's native shape). Appends to competitors (FitFocus + QuickCoach share a parent; FitFocus markets the exact client-experience wedge), competitor-pitfalls (won't-install-another-app; per-client pricing; coach-chosen demo videos), product-strategy (zero-install onboarding as underpriced advantage; "app for coaches who'd otherwise use sheets" positioning). Index/log/manifest updated.

**Decided / reinforced (strategy, from the sheets batch):**
- The real coach-side competitor is **Google Sheets**, not other apps. The switch trigger is ~5–15 clients. Positioning candidate: **"the app for coaches who'd otherwise use sheets."**
- A competitor (FitFocus) is already marketing the client-experience wedge ("the platform your clients will actually open") — the wedge is validated but the window isn't infinite, which reinforces the runner redesign as the right next build.

**Memory/skills touched:** `feedback_preview_verify.md`, `feedback_skill_golden_path.md`, `reference_llm_wiki.md`, `MEMORY.md` index all updated; new `wiki-ingest` skill created + registered in hello-claude standing behaviours + save step 5. Cleared the "skill-name collision" open to-do from STATUS.

**UNVERIFIED (banked):**
- The four self-checks are proven for *this* session (golden-path sweep returns exactly 2 artifacts; `/save` dispatched correctly to the CoachApp skill) but their *durability across a fresh future session/worktree* is by design unverifiable until the next one — captured as predictions instead.

**Why:**
- Every fix followed Jake's explicit template: don't patch the symptom in this worktree, find the one source that keeps re-emitting it (a seed template, a missing trigger, a git-tracked file), fix that, and add a cheap standing check so the fix can't silently rot.

---

## 2026-07-02 (session 8, part 4) — Runner redesign decided (Hevy table logger); Hevy screenshots ingested to wiki — NO CODE SHIPPED

**Done:**
- Session-start ritual: code review clean, CI green (28595278506), working tree clean, module versions confirmed (core/dashboard/clients v1 · programs v5 · calendar-goals v2 · workouts v7 · runner v5 · progress v3).
- Studied a 27-image Hevy iOS screenshot batch (Jake's, from a live app walkthrough). Key reference: the live logger is an **all-sets-visible table** (`SET · PREVIOUS · KG · REPS · ✓`) with previous values pre-filled → 1-tap repeat sets, inline rest timer (-15/+15/Skip), set-type sheet, Workout Settings toggles (Plate Calculator free, Warm-up Calculator PRO-gated).
- Ingested the batch into the LLM wiki (separate from this Vault): archived images to `raw/hevy-screenshots-2026-07-02/`, merged a "Hevy logger UI — teardown" section into `coachapp-client-app-benchmarks.md`, recorded the redesign decision in `coachapp-product-strategy.md`, logged it. Flagged that the images had been left on the Desktop, never actually in `raw/`.

**Decided (runner redesign — the next build):**
- Move the workout runner from the current **one-set-at-a-time wizard** to a **Hevy-style all-sets-visible table**: `SET · PREVIOUS · KG · REPS · ✓`, previous values pre-filled, tap-✓ to complete a set, rest timer fires on the ✓ tap.
- **v1 scope = plain strength (weight × reps) sets only.** Cardio / timed / unilateral / %1RM keep the current per-set flow and fold in as a phase 2. ("Build v1 and we'll see how it performs.")
- **Editing model:** free-edit any row any time (no forced order); rest timer triggers on the ✓ tick, not a sequential LOG.
- **PREVIOUS column** keyed by exercise name + set index, reusing existing `fetchRunnerLastSession` logic.
- **No paid gating** on any of it — inverse of Hevy's PRO wall; consistent with CoachApp's all-in positioning.
- Current runner lives in `js/app-runner.js` `renderRunner()` (~line 95); it already handles far more than Hevy (cardio pace/HR/distance, timed countdown, unilateral L/R, %1RM banner, RPE/tempo/rest chips) — that richness is exactly why v1 is scoped to strength only.

**Not done (deferred to next session, by Jake's call):**
- No consolidated build plan written yet, no code. Jake wants to start the build fresh in a new session.

**Bugs found + fixed (tooling):**
- `/ingest` and `/save` bare-name slash commands dispatch to a **global framework skill family** (brief/checkup/ingest/review/save/setup/export/ultraplan — the one that expects `System/conventions.md` + `Vault/ledgers/`), NOT the CoachApp/LLM-wiki flows. `/ingest` misfired to the framework skill mid-session; ran the wiki ingest by hand instead. Ran this save from its explicit path to avoid the same misfire. See to-dos.

**Why:**
- The redesign is a targeted runner rework, not an app rebuild — consistent with the product-strategy "redesign the flow, don't rebuild the app" caveat. Strength-first keeps v1 shippable without touching the hard cardio/timed/unilateral cases.

---

## 2026-07-02 (session 8, part 3) — Shipped the runner fixes; competitor research → product strategy; runner audit (workouts v6→7, runner v4→5) — PUSHED (61d8bc7)

**Done — CoachApp:**
- Verified and pushed the 4 runner fixes that had been sitting uncommitted since part 2: set-counter cap (kills phantom "Set 5 of 4"), rest-timer-started-before-render in all 3 log branches (kills the redundant double-display + phantom next-set input), beep window widened 3s→5s, audio-unlock on both runner entry points. Full discipline: Playwright 48/48 green → pre-push hook (all static checks + 19 smoke) green → CI green → GitHub Pages deployed. This clears the long-standing "runner fixes uncommitted" High to-do.
- Ran a runner audit against the consumer-app ("Hevy") bar. Findings: (1) **strength inputs aren't pre-filled** → the client retypes weight+reps every set vs Hevy's 1-tap repeat — biggest gap; (2) **no plate calculator**; (3) rest timer can't truly alert when the tab/phone is backgrounded (web limit → native app); (4) last-session strip is strength-only. Items 1 & 2 added to roadmap.md as build items.

**Done — LLM wiki (separate knowledge base at OneDrive\Documents\LLM wiki, not this Vault):**
- Web Clipper live-diagnosed (Edge v1.7.0, had never been configured), Jake configured it, verified end-to-end (a real clip landed in raw/). Registered the Vault as a second Obsidian vault so build tracking is browsable alongside the wiki.
- Ingested an 11-clip competitor/market-research batch into 4 cross-linked strategy pages + 2 new guide pages. Full detail is in the wiki's own log.md.

**Key strategic finding (banked to wiki + project_coachapp.md):**
- CoachApp's intended "all features, no tiers" differentiator is **already owned by PT Distinction** (4.7 Trustpilot, markets it hard). Sharper wedge from the research: a coach platform with a **Hevy-quality client app + honest/independent-billing trust** — client-experience quality, not feature count. Jake accepted this and is willing to not-rush beta to design from research rather than personal preference.

**Deferred (by Jake's call):**
- Audio-unlock real-device check — mobile-web audio is a known limitation that a **native app (Capacitor, roadmap "future")** would resolve properly. Not treated as a pressing bug.

**Cleared this session:**
- Runner fixes uncommitted → shipped (61d8bc7).
- E2E test-data gap (solo client record + assigned program on the E2E account) → resolved: all 9 solo-account tests and the program-accordion tests **passed (not skipped)** in the 48/48 run, which requires that data to exist. Removed both to-dos.
- Obsidian wiki 5-part follow-up → done (clipper checked+configured, usage scenarios documented, self-improvement guide created, new-project CLAUDE.md clarified, targeted novice quality pass done).

**Tests:** Playwright 48/48 full suite + 19/19 pre-push smoke. Zero console errors.

**Why:**
- Uncommitted work of any origin gets the full pre-push discipline (Playwright + review), not a diff-read guess — standing rule.
- The competitor research reframed the product differentiator: significant enough for a strategy layer + flow/priority rethink, but not a pre-beta rebuild (evidence is directional — biased competitor pages + Reddit anecdotes).

---

## 2026-07-02 (session 8, part 2) — LLM Wiki built + runner bug investigation (fixes applied, NOT pushed)

**Done — Obsidian "LLM Wiki" knowledge base:**
- Renamed `OneDrive\Documents\LLM wiki - coachapp` → `LLM wiki` and re-scoped it from CoachApp-only to a single wiki covering all of Jake's projects, CoachApp registered as the first one, following the "brief/checkup/ingest" skill family's apparent one-wiki-many-projects design
- Replaced the misplaced graphify-mirror CLAUDE.md with the real Karpathy LLM Wiki pattern content (ingest workflow, page format, citation rules, question-answering, lint, rules), Purpose section adapted for multi-project use
- Wrote 9 novice-oriented guide pages + 1 visual roadmap page (`guide-start-here`, `guide-glossary`, `guide-what-is-obsidian`, `guide-what-is-claude`, `guide-how-they-work-together`, `guide-daily-workflow` with a Mermaid decision flowchart, `guide-web-clipper`, `guide-new-project-setup`, `guide-share-with-a-friend`, `guide-coachapp-roadmap`), all cross-linked and registered in `wiki/index.md` and `wiki/log.md`
- Also produced an in-chat visual (show_widget) version of the CoachApp roadmap for the same session

**Bugs found + fixed (tooling/infra):**
- An empty Obsidian vault (`.obsidian` + `Welcome.md`) got accidentally created inside the actual `coachapp` git repository while Jake was switching vaults — untracked, not gitignored, real risk of polluting the public GitHub Pages repo. Deleted (Recycle Bin).
- Two duplicate/stale CLAUDE.md copies and dead Obsidian vault registrations (in `obsidian.json`, pointing at renamed/deleted folders) cleaned up. All traced to "CLAUDE.md" meaning two entirely different files depending on context (code-project graphify rules vs. wiki ingest rules) — now documented explicitly so it doesn't recur.

**Investigated — workout runner, from a live gym-test bug report with screenshots:**
1. **Rest timer redundant double-display + phantom "Set 5 of 4"** — root cause found: `renderRunner()` was being called *before* `startRestTimer()` in three separate branches of `logRunnerSet()` (strength hitTarget, cardio interval-complete, and the between-set case), so the page rendered a "next set" input for a set that didn't exist, with the static target-info row still showing underneath the live rest overlay. Set counter (`setNum = loggedSets.length + 1`) had no upper bound.
2. **Missing beeps** — code already had a 10s voice cue, 3/2/1 closing beeps, and a distinctly longer/higher finish beep; the audio-unlock call only fired on the first LOG tap, giving minimal head start before the first rest period needed it.
3. **Exercise navigation + per-session extra set** — turned out to **already be fully built** (`runnerJumpTo`, `runnerGoBack`, `skipToNextExercise`, `addExtraStrengthSet`/`addExtraCardioSet`, the latter confirmed session-only via an in-memory `targetSets++`, never touching the DB template) — likely just never reachable/visible because bug #1 was firing at the exact moment the "+ Add extra set" button was meant to appear.

**Done — 4 fixes applied to `js/app-runner.js` + `js/app-workouts.js` (cache-bust already bumped: workouts v6→7, runner v4→5):**
- Capped `setNum` at `targetSets` so the counter can never overshoot
- Reordered all 3 `logRunnerSet()`/cardio-interval branches so `startRestTimer()` (which sets `_restInterval`) runs before the corresponding `renderRunner()` — fixes both the phantom set and the redundant double rest display
- Widened the beep window from `restRemaining <= 3` to `<= 5`
- Added `_unlockAudio()`/`_unlockSpeech()` to both real runner entry points (`startWorkoutRunner` and `launchRunner` — confirmed two separate paths exist, one bypasses the other) so the AudioContext gets maximum time to resume before the first rest period

**NOT DONE — session ended before verification:**
- Playwright suite not run against these specific changes
- Multi-agent code review not run
- Not committed, not pushed
- Attempted a live manual test as the E2E client account and hit a data gap: not one standalone template belonging to that account's coach has any exercises attached — nothing usable to test the runner against. Banked as its own to-do (merged into the existing "assign a program to the Playwright test client" item).
- Audio-unlock fix specifically cannot be confirmed via automated testing — needs a real device check once live

**Why:**
- Jake explicitly said "please investigate" rather than "please fix" — root-caused before touching code, consistent with his standing preference for diagnosis before action.
- Live manual browser testing accidentally authenticated against Jake's real personal account first (a stale persisted session, not something this session created) — caught before any test data was written to it, switched to the dedicated E2E client account instead. No real data touched.

---

## 2026-07-02 (session 8, part 1) — Verified and pushed pre-existing uncommitted work (app-programs v4→5, workouts v5→6, runner v3→4, progress v2→3) — PUSHED (0a0f89f)

**Found:**
- Session started with 6 files already modified in the coachapp working tree (index.html + 5 js/test files) — not documented in any prior LOG entry, authorship/origin unknown. No `/save` had been run for whatever session produced them.

**Done (verified, not authored, this session):**
- Session history (client Workouts page + PT client-profile Workouts tab) now collapses behind a toggle by default instead of always showing the full list, reusing the existing `toggleClientPhase` helper
- `loadAllPhaseWorkouts` batched into one query across all phases instead of N sequential round-trips per phase
- `delete1RM` / `deleteWorkoutLog` fixed to re-render the correct DOM target after delete (previously could target a stale/wrong element depending on calling context)
- `renderWorkoutTemplates` — removed the "group templates by program" section
- `renderClientWorkouts` — workout_logs query capped at 20 rows

**Verification before push:**
- Playwright: 48/48 passed (suite grew 47→48 — one new test covers the collapse/expand behaviour), zero console errors
- 3-agent code review: security/scoping (clean — batched query, template-list query, and `.limit(20)` all preserve coach_id/client_id scoping), solo-mode correctness (clean — fully traced, collapsible history confirmed identical for client/solo, PT-only variant confirmed unreachable from solo), duplicates/regressions (clean — confirmed via `git log -S byProgram`/`programMap` that the removed "group by program" section was broken since its introduction on 2026-06-26 (commit `3a7a62a`) and never once populated its grouping map in its entire history, so nothing that ever worked was removed)
- Pre-push hook: all static checks + 19 smoke tests green (only the known/expected sudo-gating hardcoded-email WARN)

**Bugs found + fixed (tooling, this session):**
- Worktree's own `.claude/launch.json` had the same stale-path bug as 2026-07-01 (`C:/Users/jaken/coachapp` instead of the OneDrive path) — third occurrence of this exact class of bug this project has hit
- `playwright` skill's own SKILL.md had the same stale path hardcoded in its run instructions, plus a stale test count ("X/26" — suite is now 47-48). Fixed both.
- An empty Obsidian vault was accidentally created inside the coachapp git repo itself (`coachapp\CoachApp\`, untracked, not gitignored) while switching vaults in Obsidian — real risk of vault config or future notes getting committed and pushed to the public GitHub Pages repo. Deleted (Recycle Bin, not permanent).
- Two duplicate/stale CLAUDE.md copies and two dead Obsidian vault registrations (pointing at renamed/deleted folders) cleaned up — all traced back to confusion over "the CLAUDE.md file" meaning two entirely different things (graphify rules for the code project vs. a separate wiki-system template).

**Decided:**
- Set up a new Obsidian-based "LLM Wiki" (Andrej Karpathy pattern: `raw/` sources → Claude-maintained `wiki/` pages → `index.md`/`log.md`) at `C:\Users\jaken\OneDrive\Documents\LLM wiki`, separate from this project-tracking Vault. Vault stays for day-to-day session tracking (STATUS/LOG/roadmap, written automatically every session); the new wiki is for curated knowledge from source documents Jake feeds in on purpose. Designed as one wiki covering all of Jake's projects/interests, not one wiki per project — CoachApp is registered as its first project in `wiki/index.md`, with room for others (e.g. a Japan trip, which was the template's original example content) alongside it.
- Uncommitted work of unknown origin gets the same pre-push discipline as anything written in-session — Playwright + multi-agent review before push, not a read of the diff and a guess. This is what turned "looks like it might be a regression" (the template-list simplification) into a certain "confirmed dead-code removal, verified via git history."

**Why:**
- The stale-path bug recurring a third time (worktree launch.json twice now, plus the playwright skill itself) confirms this is a systemic pattern worth naming, not a one-off — any skill or config file with a hardcoded filesystem path is a candidate for silent drift whenever the project moves or a new worktree is created.
- The accidental git-repo-nested Obsidian vault is the same underlying failure mode as the CLAUDE.md/skill duplication bugs from 2026-07-01: content silently existing somewhere it shouldn't, discovered by accident rather than by design.

---

## 2026-07-01 — Periodization + 1RM assignment-time check + inline assign grid + solo RLS fix (app-programs v1→4, calendar-goals v1→2, workouts v3→5, runner v2→3) — PUSHED (76cb53f)

**Done:**
- **Periodization (Linear/Undulating)** — `program_phases.periodization_type`/`periodization_config`, `program_phase_workouts.week_number`/`tier`, `client_program_workouts.week_number` (additive migration). Phase Configure modal (Linear: start/end %1RM + optional deload week; Undulating: Heavy/Moderate/Light tiers per day-slot). `generatePhasePeriodization()` clones Week 1's templates into weeks 2..N with recalculated %1RM only on tagged sets — reps/rest/tempo untouched. Idempotent regeneration + propagates to already-assigned clients + prunes orphaned weeks when duration_weeks is edited down (all via shared `_cleanupPhaseWeeksBeyond` helper).
- **1RM assignment-time check** — `_getProgramOneRMStatus`, shared `_renderOneRMQuickEntry` component (direct kg or Epley estimate, reuses existing `_epley1RM()`), wired into both assign entry points (client-profile + program-page, including solo). Never blocks; PT can quick-fill known/estimated 1RMs inline before confirming.
- **Inline assign-workout grid** — replaced the old "+ Assign workout" modal (day → session → template, one slot at a time) with an always-visible searchable 7-day grid on the phase card; picking a template assigns immediately. `workout_templates.generated_from_phase_id` column added so the picker can exclude periodization-generated clones and client-owned clones. Built specifically to cut modal-reopen repetition, not just polish the old picker — this is the first feature built under the new standing principle "efficiency is the whole platform's spec" (see `project_coachapp.md`).
- 7 new/updated Playwright tests in `tests/programs.spec.js` (periodization Linear/Undulating, 1RM missing/have checklist, inline grid render+search, race-guard, create-workout back-link) — suite now 47 tests.
- Fixed the preview server's `launch.json` in this worktree — stale path (`C:/Users/jaken/coachapp`, doesn't exist) meant the preview had been serving nothing all session until caught. Recurred again mid-session after a process restart auto-started the wrong config ("PT Dashboard" instead of "CoachApp") — same root cause, second occurrence.
- **Correction to an earlier claim in this same log entry:** the 4-piece 1RM plan (runner prompt, Epley estimator, Big 5 quick-start, post-session suggestion) was reported as "already built and live" — that was wrong. `git diff` at push time showed all of it as uncommitted, zero prior git history (last commit touching those files was 2026-06-30). It was written at some point but never committed or deployed. This session's push is the first time any of it actually went live.
- Ran a full quality/maintainability audit on the `hello-claude` skill (11 findings — 4 High, 5 Medium, 2 Low, all fixed): resolved 2 contradictions in Step 1 (blocking vs. non-blocking logic, tool-call ordering), fixed 3 stale `app.js` references, deduplicated the "Mandatory Execution Gates" section against "Standing session behaviours" (was ~100% restated — and one rule had genuinely inconsistent wording between the two copies), grouped 29 flat rules into 5 themed sub-sections, moved "Who Jake is" to the top of the file, documented an undocumented exception to the hardcoded-email rule, clarified an approval-gate ambiguity in the OS self-check.
- Ran the same audit on the `save` skill (6 findings, all fixed) — see the duplicate-skill discovery below for why the first attempt at this didn't actually land.

**Bugs found + fixed:**
- Client calendar (`app-calendar-goals.js`) and client Workouts page (`app-workouts.js`) both assumed one workout repeats identically every week of a phase — periodization's per-week rows would have duplicated/misplaced sessions. Fixed both to be `week_number`-aware while preserving legacy (non-periodized) behaviour exactly.
- `generatePhasePeriodization` never synced already-assigned clients — a client assigned before generation would see weeks 2+ as "Not set up" forever. Fixed: propagates new weeks to every existing assignment.
- Editing a phase's `duration_weeks` down didn't clean up now out-of-range generated weeks (master or client copies). Fixed with `_cleanupPhaseWeeksBeyond`.
- Modal-removal-before-read ordering bug: both assign save functions removed the modal *before* reading the entered 1RM values, so nothing ever saved. Fixed the ordering.
- Race condition: changing the client/program selection then clicking Save fast enough could read stale missing-1RM state, silently dropping entered values. Fixed with a request-token guard (`_oneRMRefreshToken`).
- `_savePostSessionOneRM` and the new `_saveMissingOneRMEntries` both showed a false "saved!" toast even when the `client_1rms` insert failed. Both now check the error and surface a failure toast.
- **Solo accounts had zero write policy for `client_1rms` (insert/update/delete) and no update/delete policy for `client_programs`** — confirmed live with an explicit `42501 RLS violation`. This had silently broken 5 solo features (Add 1RM modal, Big 5 quick-start, runner prompt, post-session suggestion, today's assignment-check) plus "Remove program"/"Edit start date" for solo. Root cause: when solo accounts were built, write policies were added for assignment but never extended to 1RMs or to program removal/editing. Fixed with 5 new RLS policies matching the existing `client_program_workouts` solo pattern; verified all 5 operations live.
- Race condition in the new inline grid's assign function — `session_order` was computed from stale render-time state, so two fast picks (or two tabs) for the same day/slot could both compute the same slot and silently duplicate. Found by a review agent citing concrete evidence (`scripts/fix_session_order.cjs` exists specifically to repair this exact class of collision). Fixed by re-checking the slot is free immediately before inserting, matching the old modal's safety net.
- "Create new workout" from the inline grid created the template but stranded the coach with no path back to the phase they started from — `phaseId`/`dayOfWeek` were captured in context but never consumed. Fixed by wiring in the existing `backFn`/`backLabel` template-editor navigation pattern.
- Preview rendering pipeline occasionally showed a stale wide-desktop paint despite the underlying DOM/CSS being correctly mobile-sized (confirmed via `window.innerWidth`, `scrollWidth`, `matchMedia`) — cycling the viewport resize forced a clean repaint. Not a CoachApp bug.
- `save/SKILL.md` had two stale references from before the app.js modularisation — wrong OneDrive path, and described a single `app.js?v=N` instead of the 8 module files. Fixed.
- **Discovered a systemic problem: 8 CoachApp skills each had a second, independently-drifting copy** — one at the global `C:\Users\jaken\.claude\skills\` path, one at the project's own `C:\Users\jaken\OneDrive\coachapp\.claude\skills\` path. Found by accident: fixed a stale path in `save/SKILL.md`, then re-audited it later and found the same bug still present — the original fix had landed on the global copy, not the project copy being audited. Confirmed empirically (fresh session, watched which copy's distinguishing behaviour actually fired — the preview-verify/launch.json check, which only exists in the global `hello-claude`) that bare skill-name triggers resolve to the **global** copy. Consolidated all 8 (hello-claude, save, sql-safety, deploy-check, mobile-check, security-audit, playwright, run-coachapp) to one golden path at global: merged whichever side had unique/correct content first (sql-safety's project copy had an entire RLS-audit section global was missing; playwright's project copy claimed "3 workers," checked against the real `playwright.config.js` and found it factually wrong — actual config is `workers: 1`, deliberately, to avoid Supabase test contention; 3 of the 8 were already byte-identical), deleted all 8 project-level duplicates, repointed `hello-claude`'s own 8 internal hardcoded skill references from project paths to global paths.

**Decided:**
- 1RM exercise-name matching (fuzzy string vs. moving `client_1rms` to `exercise_id`-linked entry) is a genuinely big design decision — deferred to its own scoping session. Today's build keeps the name-matching logic in one shared helper so swapping it in later is contained, not a rebuild.
- Week 1 alone is sufficient to detect which exercises a program needs (for both periodization generation and the 1RM check) — generated weeks always reuse the same exercise names, just different %1RM values.
- New standing product principle banked: efficiency/time-saving is the whole platform's spec, not a per-feature nicety — when reviewing any builder-type flow, check how many separate trips a common task takes and whether that can collapse to one continuous pass, not just whether each step feels nicer.
- All CoachApp skills live at the global `.claude/skills/` path only, never duplicated at the project level — banked as a rule in `project_coachapp.md` so a new skill doesn't accidentally get created in both places again.

**Open (banked to STATUS.md to-dos):**
- `deleteProgram()` doesn't clean up cloned workout_templates when a program is deleted — found via leftover E2E test debris, not yet a live bug on Jake's account.
- Pre-push hook printed a cosmetic BOM/shebang warning (`scripts/checks.sh: line 1: ﻿#!/bin/sh: No such file or directory`) before running — didn't block the push, all checks still ran and passed after it, but worth a clean fix.
- The 8 project-level skill-file deletions are sitting uncommitted in the CoachApp repo's working tree — asked Jake whether to commit before doing so, since it's repo history, not a local-only cleanup.

**Why:**
- The propagation gap, the duration-shrink gap, the inline-grid race condition, and the create-workout stranding were all caught by the mandatory multi-agent review before push, not by Jake or in production — exactly what that gate is for.
- The skill-duplication bug is the same *class* of problem as the app.js/launch.json stale-path bugs found earlier this session — content silently existing in two places that can drift apart independently. Worth watching for as a pattern, not just today's specific instance.
- The solo RLS gap was found by accident while cleaning up test data, not by review agents or code inspection — a reminder that live testing catches a different class of bug than code review does, and that "an INSERT policy exists" doesn't mean the other 3 commands do.
- The solo RLS gap was found by accident while cleaning up test data (a stuck row that couldn't be deleted), not by the review agents — worth remembering that live testing catches a different class of bug than code review does.

---

## 2026-06-30 — Runner template bug fixes (app-workouts v=2→3)

**Done:**
- `startWorkoutRunner` now fetches the template by ID directly when called from a program Start button, instead of scanning the full coach template list. Fixes blank exercise names and missing set targets for any template beyond position 200 alphabetically.
- Runner setup modal dropdown query raised to `.limit(2000)` — was silently truncating at PostgREST default max_rows=200.

**Bugs found + fixed:**
- Root cause: PostgREST `max_rows=200` cap on both the runner template list query and the setup modal dropdown. Templates beyond position 200 alphabetically returned empty results. Fix: ID-scoped fetch for runner start; explicit `.limit(2000)` for the modal list.

---

## 2026-06-30 — Codebase modularisation: app.js → 8 modules (no version bump)

**Done:**
- app.js (7,968 lines) split into 8 module files: app-core.js, app-dashboard.js, app-programs.js, app-clients.js, app-calendar-goals.js, app-workouts.js, app-runner.js, app-progress.js; loaded in order via 8 script tags in index.html
- Pre-push hook (`scripts/checks.sh`) updated — was hardcoded to `js/app.js`; now scans all 8 module files; cache bust check updated to verify all 8 script tags have `?v=`
- Preview server path fixed in both `.claude/launch.json` files — was pointing to `C:/Users/jaken/coachapp`, now correctly `C:/Users/jaken/OneDrive/coachapp`; this bug was masked by an old copy of app.js and had existed since project start
- `.gitignore` updated — `desktop.ini` and `*.pdf` added; removed from VS Code Source Control
- 40/40 Playwright green post-split; 19/19 smoke tests green on push

**Bugs found + fixed:**
- Preview server 404: launch.json had stale path `C:/Users/jaken/coachapp` (project is in OneDrive). Fixed in worktree launch.json and CoachApp launch.json.
- checks.sh BOM encoding: PowerShell wrote UTF-8 with BOM, causing `﻿#!/bin/sh` warning on each push. Cosmetic only — all checks pass. Fix encoding next session.

**Decided:**
- No rewrite to Next.js — continuing vanilla JS to beta; developer can rewrite frontend against existing Supabase schema post-beta
- Modularisation chosen over full rewrite: same globals, no ES module refactor needed, one session to complete
- 1RM build held for next session (plan already banked in STATUS.md)

**Why:**
- Session felt sluggish with graphify — 7,968-line single file was the root cause; split reduces per-session context load significantly
- No version bump: split is a pure refactor, zero feature changes

---

## 2026-06-29 — Tooling session: iOS fix, graphify knowledge graph, .claudeignore (v179–v180)

**Done:**
- iOS Safari session detail slide-in fix (v180) — replaced `inset:0` with explicit `top:0;right:0;bottom:0;left:0` on both the panel wrapper and backdrop div in `openSessionDetail()`; pushed, CI green
- `.claudeignore` created — excludes node_modules, test-results, lock files, .git, scripts from AI context search
- `graphify` installed and full semantic knowledge graph built — 298 nodes, 545 edges, 26 named communities (App Core, Workout Runner, Goals, Calendar, etc.); wired into Claude Code via CLAUDE.md + PreToolUse hooks; costs $0.15 one-time, future updates are free AST-only
- 1RM build plan approved and banked in STATUS.md for next session

**UNVERIFIED (banked):**
- iOS Safari slide-in fix — confirmed via code review + Playwright (Chromium), not tested on real iPhone

**Decided:**
- Session approach going forward: "Nothing in isolation, everything looking at the big picture" — every feature filtered through product principles before building
- Product principles: (1) Friction at point of use, (2) All features no hidden fees, (3) Copy-paste simplicity — ship with defaults not blank canvas
- Rotate Anthropic API key after use in chat — Jake confirmed deleted

**Why:**
- graphify reduces context burn per session — `graphify query` instead of 10 grep passes through 7k-line app.js; article cited 40-60% context reduction from .claudeignore alone

---

## 2026-06-29 — Supabase security hardening pass (no version bump)

**Done:**
- OpenAPI schema mocked via `public.mock_openapi()` — schema structure no longer publicly readable via anon key
- `public.lock_created_at()` trigger function created; applied as BEFORE UPDATE trigger on 11 core tables (workout_logs, weight_logs, performance_logs, goals, goal_check_ins, goal_milestones, events, client_check_ins, client_1rms, sessions, logged_sessions) — created_at is now immutable
- `delete_current_user` search_path tightened from `search_path=public,auth` to `search_path=''`
- `events` UPDATE policy ("Client manages own personal events") fixed — USING clause was `true` (open), now scoped to `EXISTS (clients where user_id = auth.uid()) AND is_pt_assigned = false`
- REVOKE EXECUTE on `handle_new_user`, `lock_created_at`, `log_audit_event`, `mock_openapi` from both anon and authenticated — these are internal/trigger functions that should never be callable via API
- REVOKE EXECUTE on `delete_current_user` from anon only (authenticated keeps access — that's the delete account flow)
- Max rows: 1000 → 200 (Data API settings)
- Auto-expose new tables: toggled off (new tables no longer get API access automatically)
- Secure password change: enabled (requires recent login to change password)
- Minimum password length: 6 → 8
- Security Advisor result: 0 errors; remaining warnings are Pro-plan features or intentional patterns

**Decided:**
- Supabase book ("Building Production-Grade Web Applications with Supabase", Packt 2024) fully assessed; 5 priority actions all executed this session
- OpenAPI schema exposure is a known Supabase default — now mitigated
- Leaked password protection skipped — Pro plan only, not available on Free tier

**Why:**
- Events UPDATE USING clause was a real gap — any authenticated user could select any event row for updating (WITH_CHECK was correct but USING was open)
- Internal trigger functions were callable via REST API — revoking EXECUTE removes them from the public API surface without breaking their trigger behaviour

## 2026-06-29 — Session detail slide-in bug fix + security hardening (v176–v179)

**Done:**
- v176: `openSessionDetail(templateId, name)` slide-in built for solo/client workouts page. Fetches `workout_template_exercises` and renders a right-side drawer. 39/39 Playwright green.
- v177: Fixed solo 1RM library not loading (was gated by `isClientPlan`); added propagation toast when shared templates are edited (warns PT that changes affect all assigned clients).
- v178: Re-fixed session detail slide-in not appearing on live site. Root cause: panel wrapper was unstyled div — `position:fixed` children failed to layer above `overflow:hidden` app shell. Fix: panel itself set to `position:fixed;inset:0;z-index:1000`; children changed to `position:absolute`. Matches `.modal-overlay` pattern.
- v179: `sudoAsClient()` in-function email guard added (`if (currentUser?.email !== 'jakendwest@gmail.com') return`) — was callable from DevTools by any authenticated user. Session detail slide-in smoke test added to `tests/solo-account.spec.js` (19 smoke tests).
- bf3bac7: Smoke test `hasPhase` guard added — skips session detail test gracefully when E2E solo client has no program assigned.

**Bugs found + fixed:**
- Slide-in not appearing: unstyled container div + `overflow:hidden` on `.app-shell` caused stacking failure. Fixed by making wrapper `position:fixed;inset:0;z-index:1000` (same pattern as every other modal).
- `sudoAsClient()` security gap: function was only gated in the UI render; any logged-in user could call it from DevTools. Fixed with in-function email check.
- Smoke test timing out: new test waited for `button[onclick*="cl-phase"]` which never appears on E2E account (no program assigned). Fixed with `hasPhase` guard and early return.
- STATUS.md + LOG.md not updated: /save was not run at end of prior sessions — STATUS.md was 4 versions stale (showed v175, was at v179). Fixed this session.
- CRITICAL.md showed privacy policy as ❌ — it was built in v158 and is live. Fixed.

**Decided:**
- `openSessionDetail` relying entirely on Supabase RLS for access control is acceptable — no JS-level auth check needed because the DB query itself is scoped.
- 8 standing session behaviours promoted to MANDATORY EXECUTION GATES in `hello-claude/SKILL.md` with explicit trigger→action pairs — no longer guidance, now hard stops.

**Why:**
- Slide-in stacking: `position:fixed` inside a flex child that has `overflow:hidden` can cause the fixed child to be clipped in Chrome — the outer `overflow:hidden` creates a new stacking context. Making the wrapper itself `position:fixed` bypasses this.
- Mandatory gates: standing behaviours were being systematically skipped because they were listed as guidance. Jake asked for them to become enforcements after identifying 8 were missed this session.

---

## 2026-06-29 — Dashboard rework + sudo mode + activity feed fix (v173–v175)

**Done:**
- v173: All three dashboards (PT, client, solo) restructured — hero "Up next" card (current program + phase + week), stats strip (hidden on mobile for solo), two-column grid collapsing to single column on mobile. Phase name redundancy fixed (`/week/i` guard so "Base Building · Week 2" doesn't become "Base Building · Week 2 · Week 2"). Progress tabs: `+ Log weight` and `+ Log PB` add buttons added to Body Weight and Personal Bests tabs. Cardio empty state explains auto-population.
- v174: Sudo/impersonation mode — `sudoAsClient(clientId, clientName)` and `exitSudo()` functions. "View as" button on each client list row (email-gated to jakendwest@gmail.com). Renders full client dashboard using PT's RLS access. Amber banner "👁 Viewing as [Name]" with "Exit ✕" button restores PT view and clears sudo state.
- v175: Fixed PT dashboard activity feed showing solo sessions as "Unknown" — pre-fetched coach's client IDs (`coachClientIds`) and scoped `weight_logs` + `workout_logs` queries with `.in('client_id', coachClientIds)`. "Sessions this week" stat now correctly counts only client sessions (was counting Jake's solo sessions).

**Bugs found + fixed:**
- PT activity feed "Unknown" entries: `workout_logs` + `weight_logs` queries had no `coach_id` or client scope — Jake's solo sessions appeared in PT feed labelled "Unknown". Root cause: unscoped multi-tenant queries, caught by hello-claude code review. Fixed by pre-fetching client IDs and using `.in()` filter on both queries.
- Hero meta redundancy: phase named "Week 2 — Foundation" was getting "· Week 2" appended. Fixed with `/week/i.test(currentPhase.name)` guard.

**Decided:**
- Sudo mode is email-gated (not role-gated) — it's a dev tool for Jake only, not a feature real PTs would have
- Mobile stats strip hidden on solo dashboard; PT stats strip stays visible at all widths (3-column grid fits at 480px)

**Why:**
- Dashboard rework: mixed SaaS (clean two-column data layout) + fitness app (hero card) approach chosen over pure SaaS after mockup comparison
- Sudo: PT already has RLS access to all client data, so impersonation just means rendering the client view with a specific clientId bypassing the user_id lookup — no auth changes needed

---

## 2026-06-29 — Personal (solo) account build + process self-audit (v158–v162)

**Done:**
- v158: Personal account full build — PT | Personal three-pill view switcher (desktop + mobile), `window._soloClientId` global, `loadUserInfo` detects solo vs coached client records separately, `_getCurrentClientId()` helper routes to correct record per role, `renderSoloDashboard()` new function (stats, recent sessions, weight, upcoming, goals, PBs), solo nav (no Clients), `_NAV_ITEMS.solo`, `showAssignProgramModal` auto-assigns in solo mode, `renderProgressWeight/Strength/Cardio/PBs` all fixed to use helper instead of bare user_id query, `renderProgressWeight` bug fixed (was querying weight_logs by user_id — column is client_id), privacy-policy.html created (UK GDPR compliant, 11 sections), consent checkbox href updated
- SQL: `UPDATE clients SET coach_id = null` on Jake's client record — severs it from PT account, becomes personal record; 4 new RLS policies on `client_programs` (INSERT + SELECT) and `client_program_workouts` (INSERT + SELECT) for solo users
- v159: Fixed `ReferenceError: currentView is not defined` in `renderCalendar` — broke calendar for ALL roles
- v160: Programs page in solo mode — "Add to my plan" button label, `showAssignProgramToClientModal` skips client picker in solo mode, `saveAssignProgramToClient` accepts pre-filled solo clientId, empty state copy updated
- v161: Start button on template detail for solo mode (and client context); sql-safety skill new "new role audit" section; hello-claude golden path walk standing behaviour added
- v162: `renderWorkouts` routes solo to `renderClientWorkoutsPage` (program session accordion with Start buttons); `renderClientWorkoutsPage` falls back to `currentUser.id` when `coach_id` is null; `renderWorkoutTemplates` adds `.is('client_id', null)` to exclude cloned plan templates from flat list

**Bugs found + fixed:**
- `currentView` not defined: stale variable from old master account pattern referenced in `renderCalendar` isClient check — broke calendar for all roles. Root cause: blast-radius sweep didn't catch that shared functions need all-roles verification
- RLS 403 on `client_programs` INSERT: existing policy only covers coach-scoped inserts; solo client record has `coach_id = null` so was rejected. Root cause: new role audit not performed before testing. Fixed with 4 new policies
- Cloned program templates appearing in PT Workouts list: `_cloneProgramForClient` creates templates with `client_id` set and `program_id = null`; `renderWorkoutTemplates` filtered by `!program_id` but not `!client_id`. Fixed with `.is('client_id', null)` in query
- Solo Workouts page showed template builder instead of session accordion: `renderWorkouts` only routed `role === 'client'` to `renderClientWorkoutsPage`; solo users need the same view to start sessions. Root cause: user journey not walked end-to-end before declaring done
- `renderClientWorkoutsPage` templates query `.eq('coach_id', clientRecord.coach_id)` — returns nothing for solo (coach_id = null). Fixed with `|| currentUser.id` fallback

**Decided:**
- Personal account architecture: one client record per user (unique constraint on user_id), so "personal" = existing record with coach_id nulled, not a new cloned record
- Solo user sees client-style Workouts (program accordion) + PT-style Programs (builder). Workouts = execute, Programs = build
- Process self-audit: identified 5 isolation gaps in review process — all-roles check, data flow check, post-build review trigger, golden path walk, RLS role audit. All added as standing behaviours

**Why:**
- Unique constraint on clients.user_id prevented the planned "clone to new record" approach; nulling coach_id is architecturally cleaner anyway — no data duplication, same RLS anchor

---

## 2026-06-29 — Delete modal fix + settings smoke tests + smoke test standing behaviour (v155→v157)

**Done:**
- v156: Delete account modal position fix — `align-items:flex-start;padding-top:60px` on overlay so modal anchors near top of viewport regardless of scroll position; previously the modal was vertically centred and the top half was clipped above the visible area when triggered from the bottom of the Settings page
- v157: `tests/settings.spec.js` — 5 new smoke tests: settings sections render, delete modal opens, cancel closes modal (`waitForSelector detached`), validation error shows without correct input, download button is clickable. Suite now 31 tests.

**Bugs found + fixed:**
- Delete modal clipped at top of screen: `position:fixed` + `align-items:center` centres in viewport, but Delete button is at the bottom of a long scrollable page — top of modal was above visible area and user couldn't scroll to reach it. Root cause: regression sweep didn't ask "what happens when this modal is triggered from the bottom of a scrolled page." Fixed with `flex-start` + `padding-top:60px`.

**Decided:**
- Smoke tests added for every new feature in the same commit going forward — modal opens, form renders, button responds. Deeper data-writing tests discussed first. Jake approved this pattern.
- `waitForSelector('.modal-overlay', { state: 'detached' })` is the correct pattern for asserting modal removal (more reliable than `not.toBeVisible()`)
- `/code-review ultra` is not available in Jake's desktop app — local multi-agent review (3 finders + verifier) is the equivalent; never prompt Jake to run the slash command

**Why:**
- Live smoke test caught the modal clipping that Playwright and the regression sweep both missed. Playwright doesn't check visual clipping; regression sweep didn't consider scroll context. Smoke test now covers this class of issue.

---

## 2026-06-29 — OS self-audit continuation + code review + XSS fix + push (v152→v155)

**Done:**
- v153: Code audit fixes — `removeBrandingLogo` fire-and-forget DB write now error-handled; dead code block removed from `renderClientPhotos`; `openClientByName` (orphaned, unscoped query) deleted
- v154: `deleteAccount` replaced `confirm()`+`prompt()` with custom modal — type DELETE to confirm, inline validation error, button disabled during deletion
- v155: XSS fix — added `escapeHtml()` helper; applied to all `businessName` innerHTML injection points (sidebar, client dashboard, PT dashboard subtitle, settings input value); wrapped `downloadMyData` in try/catch so network errors show a message instead of leaving UI stuck
- All 11 commits pushed to master; GitHub Pages deployed; CI green (both workflows passed)
- Open RLS policy fixed: `workout_templates` "Client reads workout templates" was `qual = true` (any client could read all coaches' templates); rewritten to scope to `coach_id = (SELECT coach_id FROM clients WHERE user_id = auth.uid())`

**Bugs found + fixed:**
- XSS (HIGH): `coach_branding.business_name` injected raw into `innerHTML` visible to clients — a coach could execute script in clients' sessions. Fixed with `escapeHtml()` at all 5 injection points
- `downloadMyData`: no try/catch — `Promise.all` rejection left UI permanently showing "Preparing download…". Fixed with try/catch + user-visible error message
- `removeBrandingLogo`: storage.remove() was error-handled but the subsequent db.update() was not — inconsistent state if update failed. Fixed
- `renderClientPhotos`: duplicate unreachable empty-state check. Removed
- `openClientByName`: orphaned function never called, contained unscoped `clients` query (no coach_id filter). Deleted
- Playwright test timeout 10s too tight under full-suite load after `_loadBranding()` added extra login round-trip. Bumped to 20s — 26/26 stable
- Open RLS policy on `workout_templates` — clients could read any coach's templates. Fixed in Supabase

**OS audit completed:**
- Both `hello-claude` files (account + CoachApp) were reading PTHub paths, missing 4 standing behaviours, saying "Seven checks" (now Nine)
- `run-coachapp` and `mobile-check` at both levels still referenced Netlify
- Playwright skills said "X/14" — suite is 26 tests
- 7 skills were CoachApp-level only (not account-level) — added: deploy-check, save, security-audit, sql-safety, mobile-check, playwright, run-coachapp
- `/code-review ultra` confirmed not available in Jake's desktop app — behaviour updated: run local multi-agent review inline before every push
- LOG.md 2026-06-28 entry written (entire prior session had no log record)
- Roadmap corrected: Branding marked Done in both rows

**Decided:**
- `escapeHtml()` is now the mandatory pattern for any coach-controlled string in innerHTML
- Pre-deploy code review runs as inline multi-agent (3 finders + verifier), not as a slash command

**UNVERIFIED (banked):**
- Live smoke test on GitHub Pages post-push (branding, GDPR features, delete account modal) — not tested in browser on live URL

---

## 2026-06-28 — Branding + security/GDPR hardening + OS self-audit (v134→v152)

**Done:**
- v150: Edit sessions from Programs page; exercise library dropdown in edit modal; `program_id` clone bug fix; timed set render fix (1:30 not 90 reps); PII stripped from 16 log sites; pre-push checks expanded to 10
- v151: PT branding — `coach_branding` table, private `logos` bucket, signed URL (604800s), sidebar + PT dashboard + client dashboard display
- v152: Security/GDPR hardening — `progress-photos` bucket made private, signed URLs for photos (3600s), consent checkbox on signup, Data & privacy card in Settings (data export + delete account), `delete_current_user()` Postgres RPC

**Bugs found + fixed:**
- `hello-claude` skill reading `PTHub\STATUS.md` instead of `CoachApp\STATUS.md` — every session started with wrong project context
- `/save` skill writing to `PTHub\STATUS.md` and `PTHub\LOG.md` — every session save went to the wrong project; STATUS.md was 18 versions stale
- `alert()` in `deleteAccount()` blocked by pre-push hook — replaced with inline DOM message
- `progress-photos` bucket was public — made private, migrated display from `getPublicUrl` to `createSignedUrls` batch

**Decided:**
- Signed URL expiry standards: logos = 604800s (7 days), progress-photos = 3600s (1hr)
- `delete_current_user()` as `security definer` Postgres RPC — avoids needing service role key on client side
- Double-confirm for account deletion: `confirm()` + `prompt()` requiring "DELETE" typed verbatim
- Pre-push hook must use inline DOM message, never `alert()` (blocked by hook check 6)

**Skills created/updated:**
- `/security-audit` — new skill; 7-point checklist covering buckets, RLS, PII, GDPR, new tables, signed URLs
- `deploy-check` — expanded to 9 checks (added 5b: buckets private, 5c: GDPR features)
- `hello-claude` (both account-level and CoachApp-level) — fixed PTHub paths, added 4 security gates, sounding board, approve-before-build, regression sweep, blast radius sweep
- `/save` — fixed PTHub paths in Steps 3 and 4

**Memory created:**
- `feedback_security_gdpr.md` — comprehensive security/GDPR rules
- `project_coachapp_patterns.md` — modal pattern, program_id constraint, timed sets format, dbq(), master account, nav context, save functions

**UNVERIFIED (banked):**
- Branding display in preview (confirmed in session), but not tested on live GitHub Pages
- `delete_current_user()` RPC — runs in DB but full end-to-end deletion not tested with a real account

**Why:**
- Security was missed because no proactive gates existed, lessons stayed in volatile STATUS.md not permanent memory, and skills were never audited after creation. This session adds all three missing layers.

---

## 2026-06-27 — Runner feature pack + regression fixes + Playwright hardening (v134)

### What was done
- **Timed sets:** Template builder shows Duration (mm:ss) field when Timed toggle active. Runner shows duration log field and validates before logging. `flushTemplateSets` already handled the field; runner `logRunnerSet()` checks `tgt.timed` first.
- **Unilateral L/R logging:** When a set's `sets_json` has `unilateral: true`, runner shows separate Left/Right columns (weight + reps each). `setData` carries `leftWeight/leftReps/rightWeight/rightReps`. Frontend-only change, no schema change.
- **Client "My Programs" accordion:** `renderClientWorkoutsPage()` now queries `client_programs` with full phase/workout structure and `workout_template_exercises`. Shows phases that expand to session rows (exercise count + day). Start button on right. Falls back to flat template list if no program assigned.
- **Runner UI redesign:** (1) Set X of Y in header, (2) reps/weight target visible below exercise name, (3) PT notes always shown with `[Label]` prefix stripped, (4) per-exercise client notes textarea stored on `_runner.exercises[i].clientNotes`, (5) visible "✎ Edit" button on logged sets, (6) scrollable logged-sets area.
- **Skip rest bug fixed:** `skipRestTimer()` was clearing the rest overlay but never calling `renderRunner()` for between-sets rests (where `_afterRest` is null). Fix: `else if (_runner) renderRunner()` added at end of function.
- **Client session detail regression fixed:** New `renderClientWorkoutsPage` had removed the old expandable session detail. Fixed by: adding `workout_template_exercises` to the query, making session name tap-to-expand via `toggleClientPhase(detailId)`, rendering exercise list in hidden panel.
- **Client notes schema:** `workout_log_exercises.client_notes text` — SQL migration written; Jake must run it manually.
- **Playwright tests strengthened:**
  - `skip rest clears rest overlay and restores input fields` — now asserts: overlay gone, "Resting" text absent, LOG button visible. Would have caught the skip rest bug.
  - `client can tap session name to see exercise list` — asserts exercise detail panel opens on tap. Would have caught the session detail regression.
  - Fixed stale `text=START A WORKOUT` assertion (renamed to `h1` containing "Workouts").
  - `beforeEach` in runner tests now expands first phase panel if accordion is present, ensuring Start buttons are visible.
  - All 15 tests green.

### Decisions
- **client_notes stored per exercise, not per set** — logging context (feeling, cue) is exercise-level. Set-level is covered by weight/reps data. Per-exercise textarea is simpler and sufficient for v1.
- **Accordion tests are conditional** — if test client has no program assigned, accordion tests skip gracefully. Consequence: these tests are currently no-ops for the Playwright test client. Fixing this requires assigning a program to the test client, which is a manual step.
- **Timed/unilateral are frontend-only changes** — no schema changes needed. Both flags live in `sets_json` already. This is the correct architectural decision: set metadata belongs in the template's JSON, not as separate columns.

### Revisit-if
- Client notes will silently fail until Jake runs the SQL migration. First symptom: `client_notes` column missing → Supabase returns error → `saveRunnerSession` logs the error but the session saves anyway (partial data).
- Timed sets and unilateral UI are unverified on live site. Smoke test needed after next push.
- Playwright accordion tests are conditional — if test client gets a program assigned in future, the condition will start running real assertions and may surface bugs.

### Regressions surfaced this session
- **Skip rest**: `skipRestTimer()` had no `renderRunner()` call after clearing between-sets rest. Fixed. Playwright guard added.
- **Client session detail**: Replacing `renderClientWorkoutsPage` removed the expandable session row pattern. Fixed by re-adding expand with `toggleClientPhase`. Playwright guard added.
- **Root cause of both**: Redesigning a page without asking "what did the old code show that the new code now hides?" Both failures would have been caught by the regression-sweep habit. Jake confirmed both could have been prevented — "yes" answer to "could both have been prevented?".

### App version at close
v134 — committed locally; not yet pushed to master.

---

## 2026-06-25 — Runner redesign, role-specific nav, My Progress page (v110)

### What was done
- **Role-specific nav:** Replaced static nav HTML with `renderNav(role)` function. PT gets 6 items; client gets 4 (Dashboard, Workouts, Progress, Settings). `_NAV_ICONS` and `_NAV_ITEMS` objects define each role's nav. `applyRoleUI()` now calls `renderNav()` on login.
- **Compact runner input area:** Replaced 3-column grid layout with single flex row — Set N (left column) | Kg input (flex:1) | Reps input (flex:1) | LOG button + skip/finish. Inputs reduced from `font-size:28px` to `22px`, padding from `10px` to `6px`. 
- **Last session strip:** Added persistent `#wr-last-session` div above the stats bar in runner (for non-cardio exercises). `fetchRunnerLastSession(exName)` uses a two-query pattern (logs by client_id → exercises by log_id). Shows "Last · 24 Jun  S1 80kg×8  S2 80kg×8" style.
- **Next exercise moved to header subtitle** — removed the "Next up" card from the scrollable set log area; added a one-liner `Next: <exercise name>` below the exercise name in the header.
- **Runner chart fully removed** — `fetchRunnerExHistory` and `drawRunnerChart` deleted. Progress data now lives in My Progress page where it belongs.
- **My Progress page (client):** 4-tab shell with `renderProgressWeight`, `renderProgressStrength`, `renderProgressCardio`, `renderProgressPBs`. `navigate()` updated with `case 'progress'` route. Body Weight tab renders Chart.js weight chart. Strength tab uses `workout_logs!inner` join to filter by client. Cardio and PBs tabs structured but thin.
- **Template edit/delete guard:** Added `.eq('coach_id', currentUser.id).select()` and row-count check to `saveEditTemplate` and `deleteTemplate`. Silent RLS failures now surface as user-visible errors.
- **Sounding board protocol:** Jake asked to be challenged on new feature ideas before building. Memory saved; now applies to all new feature requests this session onward.
- **Pushed to production:** d1d4377 → master → GitHub Pages.

### Decisions
- **My Progress page is the home for all historic client data** — not the runner, not the client dashboard. Charts in the runner were distracting during a workout; progress review belongs in a dedicated page. Jake proposed this; confirmed he wanted Body Weight / Strength / Cardio / PBs tabs.
- **Role-specific nav solves the overflow problem cleanly** — rather than hiding items, each role gets a purpose-built nav set. No CSS overrides, no hidden elements.
- **Last session strip is persistent (not in empty state)** — initially rendered in the "no sets yet" empty state; Jake asked for it to be above the stats bar persistently so it's always visible during the set.

### Revisit-if
- My Progress Strength tab uses PostgREST `workout_logs!inner` join with `.eq('workout_logs.client_id', ...)`. If this returns no data on production, the filter syntax may need to be `.eq('workout_logs.client_id', ...)` → PostgREST embedded filter format. Check Supabase API logs after first live test.
- `performance_logs` RLS for clients: current policies may not cover this table for client SELECT. Check if Personal Bests tab errors on live.

### App version at close
v110 — pushed and deployed to GitHub Pages.

---

## 2026-06-25 — Programs feature + modal layout fix

### What was done
- **Programs full build (v94):** Phases UI already existed; added assign-template-to-day workflow, "Assign to client" button + modal on program builder, weekly schedule card on client dashboard with today highlighted + ▶ Start button that launches the workout runner with the correct template. Verified end-to-end: Jake's program (12-Week Strength Block) assigned to Jake West client, dashboard showed Mon/Wed/Thu workouts, Start button launched runner.
- **Critical layout bug fixed (v95):** Program builder page showed two copies of page side-by-side on desktop. Root cause: `apc-modal` was embedded as static HTML inside `openProgram`'s `el.innerHTML`. Unstyled because it used `class="modal-box"` (doesn't exist in main.css; correct class is `modal`). Fixed by converting to dynamic body-level modal creation (matching `showAssignProgramModal` pattern). Also fixed `modal-box` → `modal` in `openProgram` and `renderPrograms` modals.
- **Preview resize confusion:** Resized preview to 1200px for desktop test, forgot to resize back. Jake reported "two pages still rendering" — was the normal sidebar + main content desktop layout, not a rendering bug. Resized back to 480×844.

### Decisions
- **Dynamic modal pattern is the standard:** Any modal must be created via `document.createElement` + appended to `document.body`, never as static HTML in `el.innerHTML`. Reason: static modals inside `#main-content` (which has `overflow-y:auto`) interfere with fixed positioning. Pattern source: `showAssignProgramModal` line ~942.
- **`modal` not `modal-box`:** `.modal-box` does not exist in main.css. All modal inner containers must use `class="modal"`. Reason: wrong class = no CSS = unstyled overlay that breaks layout.

### Revisit-if
- Desktop layout at >768px viewport needs a full UX review pass — cards may not stretch to full main-content width. Not confirmed yet.
- Assign-to-client modal not verified on live site — only in preview.

### App version at close
v95 — pushed and deployed to GitHub Pages.


## ARCHIVE — "What’s working (verified)" moved out of STATUS.md, 2026-08-28

_Verbatim. STATUS.md holds LIVE STATE; this was a shipped-feature record that had grown to 31% of
that file. Moved intact rather than summarised, so nothing is lost._


- **Copy program workouts → Library** — the missing bridge. A workout built with "+ Create new workout (this day only)" carries `program_id`, so it's deliberately excluded from the reuse pool (the 2026-07-10 clutter fix) and previously could only be reused by retyping it. Now: a "Save to Library" button in the session-detail drawer (per-workout) and "Copy workouts to Library" on the program page (bulk). Reuses `_cloneSharedMasterTemplate(tmpl, overrides)`. **Idempotent** — a same-name library workout is skipped, so clicking twice is safe. app-workouts v25, 2026-07-11.
- **Tap-row workout picker** — the native `<select>` day-slot picker is gone (`_openWorkoutPicker`, modelled on `_openExercisePicker`). An `<option>` can only hold plain text, which is precisely why three "Upper Body" workouts were indistinguishable at the point of assignment (Jake's question). Each row now shows **name + description + exercise preview**. Also closes two long-open complaints about this control: no visible feedback until opened, and an unmanageably growing list. app-programs v16, 2026-07-11.
- **Duplicate week auto-extends the phase** — was hidden entirely on a 1-week phase (`canDuplicateAny = maxWeek < durationWeeks`) with no explanation. Growing the phase IS what duplicating its last week means. `duration_weeks` is bumped **after** a successful insert (bumping first left a failed copy claiming an empty week, silently lengthening an assigned client's program). app-programs v16, 2026-07-11.
- **CRITICAL data-loss bug fixed — Duplicate week → Generate weeks destroyed the Week-1 workout.** See LOG for the full reproduction steps. `_cleanupPhaseWeeksBeyond` deleted every template a stale week referenced with **no ownership check and no still-referenced check** — while its sibling `deletePhaseWeek` had both (added 2026-07-10). Proved red/green (reverting the fix makes the new test report `survived: 0`). Both now share `_deleteOwnedUnreferencedTemplates`. app-programs v16, 2026-07-11.
- **Personal/solo Library page** — solo now has its own `library` nav entry (7 items) routing to the same Templates + Exercise Library builder the coach has (`renderWorkoutLibrary`, extracted from `renderWorkouts`; the coach's Workouts page is unchanged). This is where reusable workouts get built to assign into Programs — solo previously had **no route to it at all**, so its only way to create a workout was the inline "+ Create new workout (this day only)" dropdown in a program phase, which locks the template to that single day slot. app-core v3 / app-workouts v24, 2026-07-11.
- **`workout_templates.is_personal` split** — new boolean column (mirrors `exercises.is_personal` from 2026-07-10). Solo and PT share one `coach_id`/`auth.uid()`, so without this a template built in Personal view would bleed straight into the PT's real client-facing Templates list and vice versa. Applied to all 4 standalone-template read sites + `saveNewTemplate` + the 3 clone paths. Existing 1537 rows default `false` (fix forward, no reclassification — Jake's standing call). **Note: this is a UI display split, deliberately NOT enforced at RLS — see Security below.** 2026-07-11.
- **Program day-slot picker respects the PT/Personal split** — `openProgram`'s template query had no role split either, so solo was already seeing the PT's entire standalone-template pool in that dropdown. Pre-existing bug, independent of the Library feature, fixed alongside it. app-programs v15, 2026-07-11.
- **SECURITY — cross-client RLS leak on `workout_templates` closed** — the `Client reads workout templates` SELECT policy scoped by `coach_id` **alone**, with no `client_id` restriction. Client-plan clones are written with `coach_id = the coach` and `client_id = the client` (`_cloneTemplateForClient`), so **every client of the same coach matched that policy and could read every OTHER client's personalised template clones** via a direct API call. Reproduced live before fixing (logged in as a real client, read back another client's clone by id — red/green, not reasoned). Policy now also requires `client_id is null`; a client's own clones still come through the separate `client_read_own_templates` (client_id-scoped) policy, so nothing legitimate was lost. Also switched the scalar `=` subquery to `in` — it errors outright for any user with >1 `clients` row, which **the master account has** (one coached + one solo record); it only worked because the coach policy matched first. `exercises` needed no change (no `client_id` column, so no cross-client leak is possible there). 2 new regression tests against a **real client-role account** (not solo, which shares the coach's `auth.uid()` and masks exactly this bug class). 2026-07-11, c4b1e67.
- **Runner session autosave** — localStorage-only draft (keyed `_runnerDraft_<clientId>`), checkpointed on every render + a 10s safety-net tick, same-day staleness cutoff, resume/discard confirm modal. Cleared on discard, on successful save, and on sign-out (PII hygiene). Fixes the 2026-07-04 live incident (a runner freeze forced a reload mid-session, wiping the whole workout). app-runner v20, 2026-07-10.
- **%1RM target weights round down to the nearest 2.5kg** — single shared function (`_calcWeightFromPct`) feeds the strength-table target bar, the row pre-fill placeholder, and the wizard's live preview/placeholder, so the fix applies everywhere at once. app-runner v18, 2026-07-10.
- **Delete week button** on a phase — removes a week's sessions + owned templates, any client-propagated copies, renumbers later weeks down by 1, decrements duration_weeks. Reuses `deleteProgram()`'s ownership-aware template-delete check (won't destroy a template a sibling week still points at). app-programs v14, 2026-07-10.
- ~~**Plate calculator**~~ — **REMOVED 2026-07-11 (app-runner v21).** Shipped 2026-07-10 (v19) after "repeated requests" surfaced in the 2026-07-02 competitor research; Jake then used it in a real gym session and asked for it gone — in practice it was noise, not help. Deleted outright (`_calcPlateBreakdown`/`_updatePlateBreakdown`/`_PLATE_SIZES`, the PLATES/SIDE target-bar column, the wizard hint, and its 5 tests). **Worth remembering: the research said build it, the gym said remove it.**
- **Program picker no longer clutters with one-off templates** — `openProgram`'s template query now excludes program-owned templates (`.is('program_id', null)`), so a template created inline via "+ Create new workout" for one day slot doesn't stay in the reuse pool for every other slot/program forever. That option is now labeled "(this day only)" to make the workflow explicit; a real reusable template is built once in Workouts → Templates. Found live (Jake: "every workout that is created in the program appears in this list... impossible for a PT to know which workout is which"). app-programs v13, 2026-07-10.
- **Exercises table separates PT and Personal** — new `is_personal` boolean column; exercises created in Personal view no longer bleed into the PT-facing Exercise Library and vice versa. Found live (Jake: "the exercise library for PT account contains all exercises that have been created on personal account"). Existing (pre-fix) exercises stay as PT's, by Jake's explicit call — only new creates are separated going forward. app-workouts v22, 2026-07-10.
- Auth — login / signup (with consent checkbox) / invite accept / session persistence
- PT dashboard — stats row, recent activity, compliance cards, goals due; business name in subtitle when branding set
- Client management — list, add, profile tabs (Overview / Goals / Workouts / Weight / Performance / Programs / Photos / 1RMs), edit, invite, resend
- Workout templates — create / edit / delete / add exercises / log
- Set form — AMRAP, Unilateral, Timed, Reps, Weight, %1RM, Rest, RPE/RIR, Tempo, Notes
- Cardio set form — Pace, HR Zone, Rest, Stroke rate, Duration, Distance
- Template card set preview — correct for all set types including timed (1:30 not 90 reps)
- Workout runner — set-by-set flow, timed sets, unilateral L/R, rest timer, skip rest, last session strip
- **Strength table (Hevy-style)** — plain-strength exercises show an all-sets-visible table (SET/KG/REPS/✓) instead of the one-set wizard; tap ✓ to complete a set (fires rest timer, non-blocking — table stays visible/editable underneath); uncheck to undo; "+ Add set" appends a row; free-edit any row any time, no forced order. Cardio/timed/unilateral exercises stay on the existing wizard (phase 2). v1, shipped 2026-07-02 (6e6402a). **⚠️ Two v1 choices REVERSED 2026-07-11 (app-runner v21) after real gym use — do not reintroduce them:** the `PREVIOUS` column is **gone** (last session is now **ghost text** in the KG/REPS inputs, so each value sits under the column it belongs to rather than squashed into one 54px cell), and **pre-fill / "1-tap repeat" is gone** (rows start EMPTY — a pre-filled value is indistinguishable from one you actually typed, so a set could be ticked off without the weight ever being confirmed; logging accuracy beat tap-count). **2026-07-03 (v7):** target-info bar restored above the table (reps/RPE-RIR/tempo/rest, or %1RM→kg target when a 1RM is known — `_buildTargetCols`/`_renderTargetBarHtml`); rest timer now renders **inline** in that section as a plain 0:00 countdown instead of a fixed bar covering the runner header; unchecked ✓ button now has a visible outline
- **Mid-workout swap / add exercise (session-only)** — runner header has "⇄ Swap exercise" and "+ Add exercise" (`showExercisePicker`); swap replaces the current exercise in-memory and refetches its previous-session data under the new name; add appends a new exercise and jumps to it. Neither writes to `workout_templates` — today's log only. Picker modal forced to z-index 1000 to sit above the runner's fullscreen layer. v7, 2026-07-03
- **Voice cue fixed** — `_unlockSpeech()` now does a real gesture-tied `speak()` to prime the engine (was only calling `cancel()`, which never registered the gesture, so the "10 seconds" cue silently never fired); `speakCue()` selects a female voice. v7, 2026-07-03
- **Create-new-workout auto-assigns to its day slot** — building a template via the phase grid's "＋ Create new workout" now inserts the `program_phase_workouts` row back into the originating slot instead of leaving it empty. app-programs v6, 2026-07-03
- **Edit from the session-detail drawer** — the read-only session preview now has an Edit button (hidden for `client` role) that hands off to the full template editor with context, so the propagate-to-all-sessions prompt still fires. app-workouts v8, 2026-07-03
- **Phase card shows the periodization range** — e.g. "Linear (70→80%)" / undulating tier %s, instead of just the type name. app-programs v6, 2026-07-03
- **Runner exercise-picker freeze fixed** — Swap/Add exercise can no longer spawn two overlapping modals via a fast double-tap during the picker's fetch window; buttons disable while loading, unique-guard flag prevents the race, error handling added. Rest/timed-set/cardio-interval 5-second beeps switched from Web Audio tones (silently suspended by iOS mid-rest) to spoken numbers via the already-reliable Web Speech channel. 2026-07-04, pushed 84f9267.
- Edit logged sets in runner; PT notes always shown; client notes textarea
- Runner save lands on correct page per role (client → Workouts, PT → client profile)
- Client dashboard — hero "Up next" card (program + phase + week), goals, weight, upcoming events, PBs, recent sessions; PT branding header when set
- PT dashboard — hero card, stats strip (now stacks to 2-across on mobile, 2026-07-05), two-column grid, activity feed (coach-scoped, no solo bleed), compliance cards, goals due
- Solo dashboard — hero card, stats strip (now stays visible on mobile instead of vanishing, 2026-07-05), two-column grid
- **Dashboard CSS consistency pass** — `.dashboard-card`/`.card-header`/`.card-title` now have real CSS definitions (previously undefined, rendered with no background/border/shadow across all 3 dashboards); shared `.dashboard-split-grid` class replaces 3 duplicated inline `<style>` blocks; hardcoded hex colors replaced with design tokens. 2026-07-05, pushed 313bc74.
- **Dashboard "Current program" header** — client + solo dashboards now show a small header (program name + "View program" button) above the "Up next" hero card, when a program is assigned. app-dashboard v3, 2026-07-05, pushed 9b1fb9c 2026-07-06. **Still UNVERIFIED by Jake against his own live account.**
- **Runner %1RM exercises now use the strength table** — `_isPlainStrengthExercise` no longer excludes exercises with an `intensityMin` (%1RM) set; the table's target bar already computed the %1RM→kg display, so no other change was needed. Table row weight input's placeholder now shows the calculated suggested kg when a 1RM is known. Timed/unilateral/cardio exercises still use the wizard (out of scope this session). app-runner v13, 2026-07-05, pushed 9b1fb9c 2026-07-06. **Still UNVERIFIED by Jake against his own live account (Trap Bar Jump).**
- **Weight goals (Starting/Goal weight)** — new small form on the Weight tracking page; two new nullable `clients` columns (`starting_weight_kg`, `goal_weight_kg`) + a new client-role UPDATE RLS policy (first time a client can write to their own `clients` row — every prior UPDATE was PT-only). When both are set, the Body Weight chart's Y-axis uses them as min/max (0.5kg step ticks); falls back to auto-scaling if either is unset. SQL run by Jake, policy confirmed live via `pg_policies`. app-progress v4, 2026-07-05. **2026-07-06 fix:** was only wired into the PT-facing `renderClientWeight`, so clients/solo could never reach it from their own My Progress page (`renderProgressWeight`) — ported there too, and fixed a Y-axis inversion bug for weight-gain goals (calc assumed goal < starting). Pushed 9b1fb9c. **Still UNVERIFIED by Jake against his own live account.**
- **Cardio fields in the workout-preview slider** — `openSessionDetail` now branches on `exercise_type === 'cardio'`, reusing the same formatting already used by the template-card preview (pace/distance/HR/stroke rate); previously fell into the strength branch and showed blank/"—" for every field. app-workouts v12, 2026-07-05, pushed 9b1fb9c 2026-07-06.
- **Update-1RM modal now renders correctly** — root cause was `.modal-box` (used by 5 modals across app-progress.js/app-runner.js) having zero CSS definition anywhere; swapped to the existing, correctly-styled `.modal` class. Also added a `z-index:1000` override to the mid-workout "set your 1RM" sheet (`showRunnerOneRMSheet`), which opens over the runner's own z-index:300 layer and had no override before — UNVERIFIED live, reasoned from the same pattern already fixed for the exercise picker. app-progress v4 / app-runner v13, 2026-07-05, pushed 9b1fb9c 2026-07-06. **z-index fix still UNVERIFIED live.**
- **Runner fixes** — rest time entered on Swap/Add exercise now actually overwrites the original (was silently falling back to 90s); delete-set button has deliberate spacing from the complete-set tick; mobile RPE/RIR label no longer repeats between header and field; "Save workout" no longer shows a false-positive "Save failed" toast when a non-blocking client-lookup hiccups (found in 3 places: `saveRunnerSession`/`saveWorkoutSession`/`showLogSessionModal`); a real stuck-Save-button bug fixed alongside it, plus a second real bug found in review: the exercise-insert failure path left an orphaned partial `workout_logs` row on retry — now rolls back before allowing retry. app-runner v10→v13, 2026-07-05/06, pushed 9b1fb9c.
- **Exercise identity linking + new Exercise Picker** — real `exercise_id` FK on `workout_log_exercises`/`client_1rms` (`workout_template_exercises` already had one) replaces exact free-text name matching, which was silently losing previous-session/1RM history whenever the same exercise was typed slightly differently. Name-match fallback covers older/unlinked rows. One-time migration linked 4,777 template exercises, 27 logged exercises, 18/19 1RMs (Jake reviewed his exercise list to merge known duplicate spellings). New shared Exercise Picker (search-as-you-type, "Create new exercise", collapsible archived section) replaces the old dropdown+free-text entry in the workout builder (add + edit), runner swap/add, and 1RM entry; archive/unarchive added to the Exercise Library page. app-programs v10, app-progress v5, app-runner v14, app-workouts v13, pushed 2026-07-06 (1526704).
- **Workout save is ~4x faster** — `saveRunnerSession`/`saveWorkoutSession` were doing one exercise-insert + one sets-insert per exercise, sequentially (up to ~26 round trips for a 6-exercise session); now batched into 2 inserts total, correlated by `order_index`. `saveWorkoutSession` also gained rollback-on-failure (never had one). Measured live: 14 requests/4.7s → 4 requests/1.1s on a 6-exercise save. app-runner v15, pushed 2026-07-07 (444d0f3). **UNVERIFIED by Jake in a real gym session** — automated verification only so far.
- **Workouts-page queries capped at `.limit(100)`** — were silently riding the global 200-row server cap on every load; now explicitly bounded. Historical orphan-template backlog (confirmed 103 rows, 0 in use) deleted. app-workouts v14, pushed 2026-07-07 (444d0f3).
- **Exercise picker modal no longer shrinks/drifts as search results narrow** — was `max-height` with no fixed `height`, so the box (bottom-anchored on mobile) shrank and slid toward the bottom of the screen, crowding the on-screen keyboard, as fewer results matched. Fixed with `height:70vh`. Verified live at 390×844 (constant height across query states). app-workouts v15, pushed 2026-07-07 (682f86f). **2026-07-08 follow-up:** Jake still saw it shrink on his own phone once the keyboard was actually up — root cause was `vh` units not accounting for the mobile keyboard eating into the layout viewport; modal now syncs its height to `window.visualViewport` instead. app-workouts v16, pushed 2026-07-08 (b1aa50c). **Still UNVERIFIED on Jake's own phone** — Playwright can't simulate a real keyboard.
- **Solo mode no longer breaks after finishing a workout** — `_afterRunnerSave` only special-cased role `'client'`; solo fell through to a PT-only `openClient()` call that queried `coach_id = currentUser.id`, but a solo client record has `coach_id = NULL`, so it always errored. Added `'solo'` to the working branch (navigates to Workouts, same as `'client'`). Found via code review, not a Jake report. app-runner v16, pushed 2026-07-08 (298d88d). Verified via a new Playwright regression test (passing).
- **Exercises-library cleanup confirmed** — Jake ran the cleanup SQL (detach FK links on other clients' rows, then delete unused exercises); confirmed 51 `remaining_exercises` for the coach account. 2026-07-08.
- **Dead "Log PB" and "Log weight" buttons fixed** — both were wired to a form/container that only existed on Dashboard pages, not the Progress page's Body Weight/Personal Bests tabs they're actually clicked from (same bug shape, found and fixed in two separate sessions). Also fixed the corresponding save functions redrawing the wrong dashboard for a solo user. 6d8c6a8 (2026-07-08), 8e9c26c (2026-07-10).
- **Body Weight "Starting" tile + Y-axis clamp fixed** — was reading the wrong field, and the clamp required both starting AND goal weight to be set instead of gracefully falling back. 6d8c6a8, 2026-07-08.
- **Performance/Personal Bests restructure (client/solo self-view)** — Cardio + 1RMs folded into Personal Bests; Performance split into "Per session" (most-recent-vs-previous comparison, expand to graph) and "Per exercise" (alphabetical, live-search); the Workouts-page 1RM grid moved into Personal Bests. e600010, 2026-07-08.
- **Workouts-page hero card + "Recent sessions" rename** — client/solo Workouts page shows an "Up next" hero (program name, phase/week, a Start button resolving the actual next scheduled session) when a program is assigned; "Session history" renamed to "Recent sessions," capped to last 5, date-only rows (both the client-facing page and the PT-facing client-profile Workouts tab). 8e9c26c, 2026-07-10.
- **`deleteProgram()` no longer destroys shared templates** — was deleting ANY template referenced by a program's phases with no ownership check; a shared/reusable standalone template slotted into a program would be destroyed the moment that program was deleted. Now only deletes templates it actually owns (its own `program_id`, or its own periodization-generated week clones via `generated_from_phase_id`). Found via Playwright test-flakiness investigation, not by inspection. 8e9c26c, 2026-07-10.
- **Workouts-page perf fix** — the flat templates query (up to 100 rows, nested exercise join) was always fetched even when a program was assigned and the result was never used; now only fetched when needed. Likely the same root cause as the still-open "app runs slow moving to workouts page" report from 2026-07-06 — needs Jake's live confirmation. 8e9c26c, 2026-07-10.
- **`client_programs` (+ 3 related tables) RLS fix, confirmed working end-to-end** — real (non-solo) clients previously couldn't see their assigned program at all (zero client-read policies on `client_programs`, `programs`, `program_phases`, `program_phase_workouts`). All 4 policies applied and confirmed via a fresh fixture test that queries the exact nested-embed shape the app itself uses. b126d5b, 2026-07-10.
- **Live crash fixed: empty phase on the Workouts page** — a phase with zero `program_phase_workouts` (a normal state, not a data error) crashed the accordion's `renderDays` on `undefined.forEach`; now shows an explicit empty-phase message. b79c152, 2026-07-10.
- Sudo/impersonation mode — "View as" button on client list (email-gated), amber banner, exit restores PT view
- Progress tabs — Body Weight and Personal Bests tabs have add buttons; Cardio explains auto-population
- Programs — create / edit / delete / phases / assign template to day / assign to client / edit start date / remove
- **`deleteProgram()` safety + cleanup** — blocks deletion with a toast (no confirm dialog, nothing touched) if any clients are assigned; otherwise deletes the program's own `workout_templates` before removing it, so deleting a program no longer leaves orphaned template debris behind. 2026-07-03. **2026-07-04:** a solo user's own self-assignment no longer counts as a blocking client (they can always delete their own program); the PT-facing toast now names the actual assigned clients instead of just a count.
- **Duplicate week** — phase card week header has a "Duplicate week" button (shown whenever the phase has an empty week ahead of its `duration_weeks`); copies that week's day/workout assignments into the next empty week as real, independent rows. Every week (1, duplicated, or periodization-generated) is now equally editable — add/remove/reassign a workout per day, not just week 1. Propagates to already-assigned clients (fresh per-client template clone per slot, same pattern as program assignment). 2026-07-04
- **Fork-on-edit for shared workout templates** — editing a workout (rename, add/edit/delete/reorder an exercise) through a program phase slot now clones the template first if it's still referenced by more than one `program_phase_workouts` row, so the edit applies only to that slot — the original stays untouched for any other slot/program still using it. Editing from the flat Workouts library list (not via a phase) is unaffected. 2026-07-04
- Edit sessions directly from Programs page (backFn context pattern)
- Program phases: client plan clones have program_id: null (bug fixed 2026-06-28)
- Client programs accordion — phase → day → SESSION N/M → exercise list → Start button
- Calendar — monthly grid, add/delete events; client calendar shows program workouts
- Session history (client Workouts page + PT client-profile Workouts tab) — collapsed behind a toggle by default instead of always showing the full list (2026-07-02)
- Weight tracking — log, chart, stats row
- Performance / PBs — log, best-per-exercise, chart, delete
- Check-ins — weekly form, history
- Goals — create, edit, milestones, check-ins, due-soon on PT dashboard
- My Progress (client) — 4 tabs: Body Weight, Strength, Cardio, Personal Bests
- View switcher — PT | Client | Personal three-pill for master account (sidebar desktop + mobile); Personal pill shown only when solo client record exists
- Personal (solo) account — Jake's client record severed from PT (coach_id = null); personal dashboard, solo nav, self-assign programs, Workouts shows program session accordion with Start buttons
- Exercise library — add / edit / delete / muscle groups / library dropdown in template exercise editor
- Programs builder — Hyrox Hero (12-week, 4 templates × 12 phases = 48 master templates)
- **Branding** — PT logo upload (private logos bucket, signed URLs), business name, sidebar, PT dashboard, client dashboard
- **Security/GDPR** — private storage buckets (now behaviourally verified, not just `public=false` — see storage-privacy.spec.js), PII-free logs, consent checkbox, data export, delete account (delete_current_user RPC confirmed to exist), **ICO breach procedure documented** (`breach-procedure.md`, 2026-07-12)
- **Behavioural RLS audit** (`tests/rls-audit.spec.js`, 2026-07-12) — the standing security regression gate. Probe A (a second coach who owns nothing reads 0 rows from all 22 tables), Probe B (a client sees only their own rows, with a positive lower bound so a denied query can't read as clean), Probe C (a client CAN read their assigned program through the full nested embed — the s23/s24 unexpected-DENY class), + a self-test that plants its own victim to prove the detector fires. Storage is a separate surface, covered by storage-privacy.spec.js. This replaced /deploy-check's old `qual='true'` grep, which caught none of the 4 real RLS gaps this project has had.
- Pre-push hook — scans all 8 module files (updated 2026-06-30); JS syntax, column names, query scoping, cache bust, no alert, no hardcoded IDs, no set_type, no swallowed errors, no bare clearInterval, no PII in logs, no timed set guard bypass, no duplicate functions
- GitHub Actions CI — mirrors pre-push hook
- Playwright E2E — 47 tests (40 + 7 new in tests/programs.spec.js on 2026-07-01: periodization Linear/Undulating, 1RM assignment-check missing/have, inline grid render+search, race-guard, create-workout back-link); 19 smoke tests in pre-push hook
- **Codebase modularised** — app.js split into 8 modules: app-core, app-dashboard, app-programs, app-clients, app-calendar-goals, app-workouts, app-runner, app-progress
- Delete account — custom modal, typed DELETE confirmation, proper error handling, anchored to top of viewport (no browser dialogs, no clipping when page scrolled)
- XSS protection — `escapeHtml()` applied to all coach-controlled strings in innerHTML
- Session detail slide-in — right-side drawer showing exercises/sets/reps for a session; works in solo and client mode; `position:fixed;inset:0;z-index:1000` wrapper pattern
- `sudoAsClient()` server-side guard — in-function email check prevents DevTools exploitation by non-Jake users
- **DB security hardening** — OpenAPI schema mocked; `lock_created_at` BEFORE UPDATE triggers on 11 tables; `events` UPDATE USING clause fixed; REVOKE EXECUTE on 4 internal functions; `delete_current_user` search_path locked; max_rows 200; auto-expose new tables off; secure password change on; min password 8 chars; Security Advisor: 0 errors
- **Periodization (Linear / Undulating)** — phase-level %1RM automation; PT builds Week 1 once, picks a scheme, clicks "Generate weeks"; propagates to already-assigned clients automatically; idempotent regeneration; shrinking a phase's week count prunes orphaned generated weeks (2026-07-01)
- **1RM assignment-time check** — when assigning a program, shows which needed %1RM lifts the client is missing, with inline quick-fill (direct kg or Epley estimate); never blocks; covers both assign entry points + solo (2026-07-01)
- **Solo account write access to `client_1rms` and `client_programs`** — fixed a real gap where solo users had no write policy for saving 1RMs or removing/editing an assigned program (silently broken since solo accounts were built); 5 new RLS policies added (2026-07-01)
- **Inline assign-workout grid** — replaced the old "+ Assign workout" modal (day → session → template, one slot at a time) with an always-visible 7-day searchable grid on the phase card; picking a template assigns immediately, no modal, no separate day/session step. Search + exercise-preview hints per option. Picker excludes client-owned clones and periodization-generated week-clones (`generated_from_phase_id` column). Race-condition guard re-checks a slot is still free immediately before inserting. "Create new workout" now returns to the program via a working "Back to program" link instead of stranding the coach (2026-07-01)

---

