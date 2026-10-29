# Technical Debt

This file analyzes *what kinds* of debt exist and why they matter. For current bug counts, see [backlog.md](backlog.md); this file doesn't repeat
those numbers. Condensed 2026-10-05: each dated write-up below is one paragraph or less, and the full text of every one is in the verbatim copy
[archive/technical-debt-2026-10-05.md](archive/technical-debt-2026-10-05.md).

## Schema debt

**Closed 2026-09-15** — [schema.md](schema.md) is now the canonical reference (migrated from the Vault's `data-model.md`). The remaining debt:
it's a design reference kept in sync manually, not generated from `information_schema`, and this migration didn't independently re-verify it
against the live database — see its own Requires Validation.

## Known gaps

Real product/engineering debt, distinct from the process debt below. Migrated from the Vault 2026-09-15 and added to since; not all re-verified,
so check `docs/bugs/` and `docs/releases/` first.

- **Runner:** only cardio/intervals still use the one-set-at-a-time flow (everything else is in the fast table); "cardio runner needs the same UI"
  is a design question (`2026-07-11-runner-phase-2`, deferred). Superset auto-switch unbuilt; bodyweight-in-table not live-verified.
- **`deleteProgram()` orphan-cleanup** stops future debris, but a historical backlog of orphaned templates on the main coach account was never cleaned.
- **My Progress Strength tab** uses a PostgREST `!inner` join not verified live with real data.
- **Exercise stats card (2026-10-03):** the finish screen's PR check (`_prBaseline`) and the card's "Heaviest set" read the same history through
  different queries, so for a renamed lift they could in principle disagree. If a full card per exercise proves too long a scroll on a real
  history, `_fetchExerciseSessions` is the building block for loading one on demand.
- **Dashboard rework (2026-10-04):** the coach's Today card is logged-only ("2 of 5 done" needs a new database view of what was PLANNED, SQL for Jake);
  the coach page's logs and weigh-ins are scoped by the `clients` read the API cuts at 200 rows; and the rework left handlers with no caller
  (`showClientPBForm`, `saveClientPB`, `showGoalProgressForm`, `saveGoalProgress`, `toggleClientMilestone`, `showClientWeightForm`, and in
  `app-core.js` `_pbFormHtml`, `_PB_FORM_CATEGORIES`, `_pbUnitOptions`, `_pbSyncUnits`). Remove them together with the tests that pin their
  ownership checks (`tests/own-client-writes-2026-08-21.spec.js`), not one at a time.
- **Carried from the 2026-10-04 pre-push review (non-blocking, none fixed):** the "Up next" button puts
  raw uuids in its inline handler; the Stats sheet matches history by NAME only while the Last time panel matches by exercise id first;
  "View as client" works only on the dashboard ([row](bugs/2026-10-04-view-as-client-only-works-on-the-dashboard.md)); `_renderMetricChart` leaves
  a predecessor in `_activeCharts` until the next destroy (harmless); a phase with `duration_weeks` of 0 or null reads 0 weeks on the dashboard tile and
  1 on the calendar (only a direct database edit can produce it).
- **A PRESCRIBED weight of 0 still reads as empty (2026-10-11).** The zero-weight fix covers LOGGED weights (the runner's grey memory, the finish screen,
  the wizard's set list, the Stats sheet, Last time). The template builder's and library's set summaries and the runner's template defaults still test a
  prescribed weight for truthiness (`app-workouts.js` 352, 371, 480, 1665, 2192, 2212; `app-runner.js` 56, 3649). A prescribed 0 is not a real case today
  (bodyweight is its own flag), and `scripts/count-baseline.json` pins the count so a new one cannot appear.
- **A toast covers the lower half of a dialog on a phone (found 2026-10-11).** `showToast` sits at z-index 9999, bottom 80px, so it hides a
  dialog's last line. Fixed for the 1RM question only (it clears the toast); `app-workouts.js` 3237 still shows one over the copy-propagate dialog
  (a solo account with assigned clients). Also: `checks.sh` rule 9c greps `^function`, so it cannot see a duplicate `async function` (a manual scan
  of 731 names found none), and `showPostSessionOneRMModal` and the resume modal print `clientId` into an `onclick` without `escapeAttr` (own storage only).
- **Weekly check-in notification** always shows "Due" past 7 days with no dismiss until submitted (a UX gap). **Invite email** has no PT branding yet.
- **Runner vs. competitor apps:** background rest-timer alerts need an installable app (the wake lock covers most gym use); the last-session
  strip is strength-only. No pre-fill is Jake's choice (2026-07-11), not a gap.

**From the template-draft-save release (2026-09-17; deferred, detail in [releases/v2026.09.6.md](releases/v2026.09.6.md)):** `sudoAsClient`/`exitSudo`
flip `currentProfile.role` before the dirty-draft check (the shape of the `switchView` bug that release fixed; narrower exposure; the fix mirrors
`switchView`'s reorder); a propagation-dismissal modal can resolve `_waitForPropagationModalsToClear` before the handler's async work finishes
(a confusing render, not a data-safety problem); the template editor's Start button and a few other exits bypass the unsaved-changes prompt; and a
triplicated leave-guard block (`app-core.js` x2, `app-workouts.js` `_templateGoBack()`) wants one shared helper.

**From planning the product-review releases (2026-09-20; read from code, impact unmeasured):** capped reads (still open: the unpaged `clients`
roster reads and the sites `checks.sh` rule 9n pins); writes with no retry safety or transaction (workout save, program assignment,
`deletePhaseWeek`); two propagation regimes (a content edit *offers* "Update assigned clients?", week-structure edits change plans with no prompt:
Jake's call); stale backlog premises (3 of 20 ranked items rested on lines the code had left behind: check code first); and an unrunnable ad-hoc
probe recipe (`_adhoc*` is in `testIgnore`; the skills say `_debug-adhoc`, which is gitignored but not runner-ignored, so a leftover runs in `npm test`).

**From the 2026-09-27 app-code audit** ([archive/app-code-audit-2026-09-27.md](archive/app-code-audit-2026-09-27.md); point-in-time), still open in its
priority order:
- **No transactions on the programme lifecycle, half done.** Assign, restart and clone are one `assign_program()` transaction (shape in
  [archive/decisions-2026-09-26-to-2026-10-04.md](archive/decisions-2026-09-26-to-2026-10-04.md), 2026-09-27), with the first fault-injection spec.
  `deleteProgram` and `deletePhaseWeek` are still browser-orchestrated chains; `deletePhaseWeek` only touches the client copies the current view may
  touch, which the database cannot see, so it needs its own design. `_cloneProgramForClient` has no app caller but four older specs still call it.
- **Escaping is opt-in** (181 `innerHTML` writes, stored XSS x8): an auto-escaping `html` tagged template, ratcheted.
- **`dbq()` at 8% adoption** (26 of 318 `db.from` calls), and raw writes whose `error` is ignored never reach the error-report card: make it
  mandatory with a ratchet, or delete it.
- **History in comments:** 23% of `js/` lines are comments, 371 of them dated incident stories.

**From the 2026-10-18 data-leak audit** ([decisions.md](decisions.md)), still open:
- **`invite-client`** is deployed from the dashboard only, holds the service-role key and has never been read here (`KNOWN_MISSING`, `scripts/check-external-surface.mjs`).
- **Google Fonts** loads on every page view (allowlisted as temporary): self-host it, then add a CSP.
- **The coach calendar's `events` read has no client filter** (`SCOPE-OK`, `js/app-calendar-goals.js`): it also returns the master account's events on its own personal record, with no client name.
- **Gate limits:** `check-secrets` reads the tree's tip, not each pushed commit; `invite-solo-user` imports a floating `esm.sh` supabase-js@2.
- **Live objects with no origin here:** `audit_log` and its trigger, `sessions`, `session_exercises`, `logged_sessions`, a 2026-08-09 backup table, the `progress-photos` bucket.

## Test-gate coverage debt

Since 2026-09-27 a push runs **no** browser tests: the 2-spec smoke run was dropped from the pre-push hook (about 7 min to about 50 s a push, see
[archive/decisions-2026-09-26-to-2026-10-04.md](archive/decisions-2026-09-26-to-2026-10-04.md)). Every spec now runs only in the release's full suite.
That is the accepted tradeoff: master can carry a browser regression between releases, but nothing reaches the live site without the full suite
passing. Widening the old push gate had been tried once and reverted (2026-08-20: silent glob no-op, cleanup-unsafe cross-tenant probes at push frequency).

**Specs that build "today" from the UTC date**: fixed 2026-10-17, with the app itself (48 uses in 24 spec files now use `toLocaleDateString('en-CA')`). The 8 left are UTC calendar arithmetic on a fixed base and stay; `scripts/count-baseline.json` pins both counts, so none can come back.

**Specs that wait only for `_soloClientId`:** the app's start-up navigation can still land and close an open modal (the `v2026.10.4` release abort; a 2-minute hang on 2026-10-17, not reproduced). Ten specs now use `soloReady()` (`tests/helpers.js`, which also waits for `#dash-goals`) and a ratchet pins the rest; three keep their own start (`back-to-goals-fallback`, `delete-template-lands-on-library`, `personal-view-delete-boundary`, never seen failing).

**Solo specs skip silently:** they are `test.skip`-gated on `soloAvailable`; if `window._soloClientId` fails to populate they all skip and the run passes green. Nothing counts the skips.

## Process/tracking debt

The tracking system regularly self-reports its own decay (`os-lint --report` at session start); the live numbers belong to that report and
[backlog.md](backlog.md). The pattern worth recording: **the tracking system accumulates debt at roughly the rate it prevents it.** Fixes to the
mechanism are logged in [decisions.md](decisions.md) as they land (and in the archives it points to); don't duplicate that detail here.

**Unfixed:**
- **`docs/predictions.jsonl` has 7 duplicate `id` values**, 3 pairing a graded record with a still-overdue one (`pth-034`, `pth-090`, `pth-109`),
  which is ambiguous for Rule 6's id-keyed logic. Needs Jake's own pass.
- **Node: CI is pinned to 24 (2026-10-11); the dev machine is not.** CI ran 22 against local 24, which cost `v2026.09.12` its deploy. There is no
  `.nvmrc` or `engines`, so a future machine upgrade is caught only by `checks.sh`'s `[note]`, which is not a gate.
- **Git-in-a-temp-folder self-tests that inherit git's environment.** From a LINKED worktree, `git push` runs its hook with `GIT_DIR` pointing at
  the real repo, so a self-test that runs `git init / add / commit` in a temp folder instead commits to the worktree's own branch and leaves tracked
  files deleted (reproduced 2026-10-11). Fixed in `scripts/bump-versions.selftest.mjs` (it runs on every push), `scripts/verify-live.selftest.mjs` and,
  2026-10-29, `scripts/check-secrets.selftest.mjs` (every push), whose `git init` set `core.bare = true` in the SHARED `.git/config` and broke every checkout until set back.
  Still inherited, in release-only self-tests that need `CHECKS_FULL=1 git push` from a linked worktree to matter: `.claude/hooks/guardrails.selftest.mjs`,
  `scripts/check-guardrails-worktree.selftest.mjs` and `.claude/hooks/os-lint.selftest.mjs`. The worktree one tests worktree behaviour on purpose, so it needs
  care rather than a blanket strip.
- **From the 2026-10-04 reviews of the program page:** a stored periodization value whose `toString` and `valueOf`
  are not callable makes `String(v)` throw (it needs crafted jsonb from the phase's own owner); the program page's "Now" follows the viewer's
  assignment of THIS program while the dashboard tile, the Workouts hero and the calendar follow the newest assignment across ALL programs
  (cosmetic, rare); and `js/app-workouts.js` (about line 697) keeps a third copy of the phase loop, to fold into one function with `_programPhaseAt`.
- **From the Vault-rooted-session incident (2026-10-05, [decisions.md](decisions.md)):** (1) the desktop app's default folder for a NEW session is the
  Vision OS folder; that is the app's choice, so a session can still START in the wrong folder (the guard makes it visible, not impossible);
  (2) a `change_directory` move re-roots hooks and skills at once, CLAUDE.md only at a later post-compaction re-read and the memory path never;
  UNVERIFIED that the desktop app shows the guard's `systemMessage` to Jake (`~/.claude/state/session-root-guard.log` answers it); (3) the guard's
  user-level registration lives in `~/.claude/settings.json`, which is not backed up (`os-lint`'s `hooks` check goes RED if it is lost;
  `reference_vault_system.md` records how to re-add it); (4) stale July worktrees under the Vault still carry the old CoachApp launch config (inert);
  (5) memory notes are not scanned for Vault paths (`no-vault-pointers` reads hooks and skills only).

## Minor hygiene debt

A handful of stray debug artifacts sit at repo root (debug PNGs, a PDF, `modal-preview.html`), mostly already covered by `.gitignore` patterns.
Low priority, noted for completeness only.

## Requires Validation

- Whether the "fixed-awaiting-jake" bucket in the bug ledger (see [backlog.md](backlog.md)) represents a genuine confirmation-workflow bottleneck
  is not established: flagged as worth Jake's attention, not asserted as a problem.
- The live Supabase schema has not been independently verified against the 20 migration files; see [architecture.md](architecture.md).
