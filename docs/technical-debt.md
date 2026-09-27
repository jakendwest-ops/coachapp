# Technical Debt

This file analyzes *what kinds* of debt exist and why they matter. For current bug counts, see
[backlog.md](backlog.md) — this file doesn't repeat those numbers.

## Schema debt

**Closed 2026-09-15** — [schema.md](schema.md) is now the canonical reference (migrated from the
Vault's `data-model.md`). The remaining debt: it's a design reference kept in sync manually, not
generated from `information_schema`, and this migration didn't independently re-verify it against
the live database — see its own Requires Validation.

## Known gaps

Migrated from `STATUS.md`'s 2026-09-08 save — real product/engineering debt, distinct from the
process/tracking debt below.

- **`app-workouts.js`'s own runner set-accuracy work** — built and Playwright-verified, historically
  shipped in stages; per-set target display, delete-a-set, live rep tally, and reusing the real
  add-exercise modal in the runner (not a simplified rebuild) all landed this way.
- **Runner Phase 2 — mostly done; this entry was stale (corrected 2026-09-20 from code and specs, not run):**
  every non-cardio exercise already logs through the fast table (`_isPlainStrengthExercise`), including
  unilateral, timed, jump and %1RM (`unilateral-runner-2026-08-19`, `runner-fast-table-metrics` specs). Only
  cardio/intervals keep the one-set-at-a-time flow; what is left is Jake's "cardio runner needs the same UI" —
  a design question (ledger row `2026-07-11-runner-phase-2`, deferred). Known v1 gaps stand: superset
  auto-switch (unconfirmed whether real templates use `supersetGroup`); bodyweight-in-table not live-verified.
- **`deleteProgram()` orphan-cleanup** stops future debris, but a historical backlog of orphaned
  templates on the main coach account (found while building that fix) was never separately cleaned
  up.
- **My Progress Strength tab** uses a PostgREST `!inner` join not verified live with real data.
- **Weekly check-in notification** always shows "Due" past 7 days with no dismiss until submitted —
  a UX gap, not a correctness bug.
- **Invite email** doesn't yet include PT branding/logo (Edge Function not updated for it).
- Runner-vs-"Hevy" gaps banked as build items — **partly stale (corrected 2026-09-20):** "not pre-filled" is
  a choice, not a gap (Jake removed automatic pre-fill 2026-07-11: a pre-filled value looks typed; guarded by
  `tests/runner.spec.js`), and the plate calculator was removed the same day. Still real: background rest-timer
  alerts need PWA/native (a screen wake lock covers most gym use — planned), and the last-session strip is
  strength-only.

Migrated as historical record, not re-verified against current code — cross-check against
[backlog.md](backlog.md)/`docs/bugs/` before treating any of the above as still accurate; several
may already be superseded by work in more recent release notes (`docs/releases/`).

**New 2026-09-17, from the template-draft-save release's own three review rounds (found, triaged,
deliberately deferred rather than fixed in that release — full detail in
[releases/v2026.09.6.md](releases/v2026.09.6.md)'s Known Issues, and this cycle's own SDD ledger at
`.claude/worktrees/template-draft-save/.superpowers/sdd/2026-09-13-template-draft-save/progress.md`,
which still needs deleting once its value is fully extracted):**

- `app-dashboard.js`'s `sudoAsClient`/`exitSudo` flip `currentProfile.role` before checking for a
  dirty template draft — the same shape a `switchView` bug this release fixed had. Narrower exposure
  (the `'client'` role doesn't trip the same solo-suppression `'solo'` does), and the actual
  write/disclosure decision is now safe regardless (a separate fix this release made locks that
  decision to a role snapshot, not a live read) — but the class itself is still open on these two
  call sites. The fix shape would mirror `switchView`'s own reorder exactly.
- A propagation-dismissal modal can resolve `_waitForPropagationModalsToClear` on its own DOM
  removal, before the dismissal handler's own async work (and a possible role flip) has actually
  finished — so the wrong template's editor can render under the wrong role after dismissing a
  propagation prompt mid-navigation. Confusing-render regression, not a data-safety one (per the
  role-snapshot fix above).
- The template editor's ▶ Start button (and a few other exit routes) still bypass the
  unsaved-changes prompt entirely — no data is lost, but a staged edit can be silently left staged
  while the user trains the pre-edit version of the workout.
- A triplicated leave-guard block (Save/Discard/Keep-editing choice-handling) across `app-core.js`
  (×2: `navigate()` and `switchView()`) and `app-workouts.js` (`_templateGoBack()`) — three
  near-identical copies that would benefit from one shared helper, deferred as a refactor-only change
  with no behavior risk.

**New 2026-09-20, from planning the product-review releases** (read from code, impact unmeasured; evidence in
[the release plans](superpowers/plans/2026-09-19-product-review-ranked-backlog-and-releases.md)): **capped reads**
(screens that read growing tables through the API's 200-row cap — **cap measured 2026-09-20; the two weight tabs, the data
export and the personal-best reads were fixed the same day (Release 2a, unreleased)**; the coach dashboard adherence panel and the client list
were fixed 2026-09-21 (Release 2b: they read the `coach_client_summary` view; unreleased); still open: their unpaged `clients`
roster reads, plus the named unbounded reads pinned by `checks.sh` rule 9n (Release 2d; the census also found and fixed the
Performance tab's exercise list losing exercises past ~200 logged rows); the runner's finish-screen PR baseline was fixed the same day, Release 4b, unreleased);
**writes with no retry safety or transaction** (workout save, program assignment, `deletePhaseWeek`); **two
propagation regimes** (a workout's content edit *offers* "Update assigned clients?", week-structure edits change
their plans with no prompt — Jake's call; [schema.md](schema.md) said otherwise until today); **stale backlog
premises** (3 of 20 ranked items rested on lines the code had left behind — check code first); **an unrunnable
ad-hoc probe recipe** (`_adhoc*` is in `testIgnore`; the skills now say `_debug-adhoc`, gitignored but not
runner-ignored, so a leftover runs in `npm test`); and no fault-injection test anywhere in `tests/`.

## Test-gate coverage debt

The pre-push gate covers 2 spec files (`runner.spec.js`, `solo-account.spec.js`) out of the whole suite. Most
RLS/ownership-relevant specs run only in the full local suite, not on every push. Widening this was
tried once and reverted (2026-08-20 — see [decisions.md](decisions.md)) for concrete reasons
(silent glob no-op, cleanup-unsafe cross-tenant probes at push frequency), so this is a known,
accepted tradeoff rather than an oversight — but it does mean a regression in an ungated spec can
ship undetected between full-suite runs.

## Process/tracking debt

The tracking system regularly self-reports its own decay (`os-lint --report` at session start) — the
live numbers (stale bugs, ungraded predictions, full-file-review age) belong to that report and
[backlog.md](backlog.md), not repeated here since they go stale within a day. The pattern worth
recording here, not there: **this is direct, ongoing evidence the tracking system itself accumulates
debt at roughly the same rate it prevents it** — close to the actual motivation for this whole
in-repo documentation set.

Specific fixes to the mechanism itself are logged in [decisions.md](decisions.md) as they land
(2026-09-16: `checkEventGateEvidence` added, `checkContinuityBudget` retired; 2026-09-17:
`predictions.jsonl` moved into the repo; 2026-09-18: full Vault severing, `checkGatesFired` deleted
outright) — don't duplicate that detail here.

**New, unfixed:** `docs/predictions.jsonl` has 7 duplicate `id` values, 3 pairing a graded record
with a still-overdue one (`pth-034`, `pth-090`, `pth-109`) — ambiguous for Rule 6's id-keyed logic.
Needs Jake's own pass; not something code evidence can resolve.

## Minor hygiene debt

A handful of stray debug artifacts sit at repo root (debug PNGs, a PDF, `modal-preview.html`),
mostly already covered by `.gitignore` patterns. Low priority, noted for completeness only.

## Requires Validation

- Whether the "fixed-awaiting-jake" bucket in the bug ledger (see [backlog.md](backlog.md))
  represents a genuine confirmation-workflow bottleneck is not established — flagged as worth
  Jake's attention, not asserted as a problem.
- The live Supabase schema has not been independently verified against the 20 migration files —
  see [architecture.md](architecture.md).
