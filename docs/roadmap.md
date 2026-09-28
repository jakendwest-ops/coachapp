# Roadmap

Rewritten 2026-09-15 from the Vault's `roadmap.md` (last Vault save: 2026-09-08), replacing an
earlier inference-based version of this file. The full 624-line source — every feature, every
dated session backlog — is archived verbatim at
[archive/roadmap-2026-09-08.md](archive/roadmap-2026-09-08.md). This file is a curated current-state
summary, not a replacement for that archive; go there for the full feature-by-feature ledger.

## Current cadence

Tag-gated releases, not sprints. See [current-sprint.md](current-sprint.md) for the in-flight
release cycle.

## GDPR consent capture: 5 of 6 steps live, the row still says `deferred`

Shipped 2026-08-25: privacy policy, consent checkbox, a consent gate in `showApp()`, and a `checks.sh` rule
coupling the policy version to the gate. Left: confirming `delete_current_user()` exists in the database
(needs Jake). Only Jake can change the row's status —
[the ledger row](bugs/2026-08-11-gdpr-no-consent-capture-and-no-privacy-policy.md).

## Current priorities (as of the Vault's last save, 2026-09-08)

- **Design system Stage 4 (branding) — now unblocked**, awaiting Jake: is Inter the brand typeface
  or a placeholder, how dense the runner should be, whether there's a brand direction to set token
  values against yet. Stages 1-3 (vocabulary, ratchet, conversion — 1,027→256 inline style literals)
  are done.
- **UX cleanup pass — 3 of 4 areas shipped** (runner, builder, progress); dashboards (D2-D4: solo
  bottom-nav restructure, dashboard filtering, PT stat-tile layout) not started, awaiting Jake's go.
- **Runner walkthrough of 2026-09-28 (8 items) — built, committed locally, held for one combined release.**
  Items 1-6 (weekday on the program day list, no Back button, full exercise names, Next goes to what is
  still to do, green/purple tabs, "beat it" removed) and items 7-8 (the "log-first" layout: Swap/Add/Units
  behind a "⋯" sheet, one-line prescription, set table straight under the tabs, an always-present Skip/Next/
  Finish bar, and a tappable "Last time → Stats" sheet with a progress chart). Decisions:
  [decisions.md](decisions.md), 2026-09-28.
- **Second 2026-09-28 note from Jake — six items, not started.** Template builder: Edit/Remove buttons too
  big ([ledger](bugs/2026-09-28-template-builder-edit-and-remove-buttons-squeeze-the-set-text.md)); interval
  "Initial countdown" should be `0:00`
  ([ledger](bugs/2026-09-28-interval-initial-countdown-is-the-only-time-field-not-in-0-00-format.md)). Solo
  dashboard: rename "Next up" to "My calendar"; replace the Benchmarks card with a "My progress" tile linking
  to the Progress page; merge the "Current program" strip and the next-session tile, which duplicate each
  other; and clarify "Goals does not have its own page" — a `goals` route exists (added 2026-08-30) but is
  reachable only from the dashboard tile, so what Jake wants there is an open question.
- **Solo/signup:** the data model and invite-based onboarding (an owner-gated Edge Function) are
  done. Genuine open public self-signup for new solo accounts remains a deliberate deferral, not
  scoped.
- **Security follow-up (2026-07-30):** the `workout_logs` RLS fix's sibling tables
  (`workout_log_exercises`/`workout_log_sets`) are reasoned-safe but not independently behaviourally
  tested. Several goal-related writes (`saveGoalProgress`, `saveEditGoal`, `toggleMilestone`,
  `toggleClientMilestone`) share the same unanchored-write shape, lower priority.
- **Product-review backlog — planned 2026-09-19, nothing built:** a ranked 20-item backlog and red-first plans
  for five small releases, in
  [superpowers/plans/2026-09-19-product-review-ranked-backlog-and-releases.md](superpowers/plans/2026-09-19-product-review-ranked-backlog-and-releases.md);
  it supersedes this list for *what to build next*. Its R1, R2a/b/d and R4b shipped in v2026.09.7/.8.
- **Roster-size features deferred — Jake, 2026-09-26: no clients yet.** Client-list search / filter / sort (R2c), the ranked
  "Needs attention" list (R3c), invite state and the programme-and-week row on the client list have no real roster to serve.
  Not started, and not to be built speculatively: they need a session once there are real clients, so Jake can say what he
  actually reaches for.

## Raised but deliberately deprioritized (Jake's own call, 2026-07-11 — still relevant, not lost)

- **Error monitoring** — live since v2026.09.7 (`app_errors`, read in Settings); the owner's card is unchecked on real data.
- **Backup/restore posture** — free-tier point-in-time recovery is limited; a real restore has never been tried.
- **Beta ops** — "Send feedback" email link live since v2026.09.7. Invite-email delivery to a non-Jake address never tested.
- **The API's silent 200-row cap** — the known screens were fixed in v2026.09.7/.8, and `checks.sh` rule 9n refuses a new
  unbounded read. **Open:** the `clients` roster reads on the dashboard and client list, plus the named sites in
  [the ledger row](bugs/2026-09-21-remaining-unbounded-reads-of-growing-tables-are-named-not-fixed.md).

## Named backlog items (from the full feature ledger, not yet scoped)

A sample of what's tracked as planned-but-unscoped in the full archive — not exhaustive, see the
archive for the complete list: a real superset data model (pairs of exercises tracked together, not
just a text field), the cardio side of runner Phase 2 (unilateral/timed/jump/%1RM already use the
fast table — corrected 2026-09-20), a proper client-detach/cancellation workflow (a client can currently self-detach from
their PT via the API with no workflow or PT-side notice), AMRAP/EMOM/circuit dedicated timer modes,
and a goals overhaul (granular mini-goals/milestones).

**New 2026-09-17, from shipping `v2026.09.6` (the template-builder staged-edits + Save workout
redesign — see [current-sprint.md](current-sprint.md) and
[releases/v2026.09.6.md](releases/v2026.09.6.md)):**

- **Program-workout edits already save once and prompt once** (corrected 2026-09-20, from code and specs —
  not run): a programme slot's Edit opens the same staged editor `v2026.09.6` built, so that ask is met for
  content. Still open: week-structure edits (duplicate/delete/generate weeks) change assigned clients' plans
  with no prompt — Jake's call (release plans, R5).
- **The same role-flip-before-dirty-check bug class in `app-dashboard.js`'s
  `sudoAsClient`/`exitSudo`** — found during this release's review but deferred (narrower exposure
  than the `switchView` case this release fixed; see [technical-debt.md](technical-debt.md)).

## Requires Validation

- Everything above is dated to the Vault's last save (2026-09-08) and not re-verified against
  current code in this migration pass — treat as a starting point, not a live status check.
- The beta timeline itself is deliberately not restated here — see [vision.md](vision.md)'s Requires
  Validation for why it's an open question, not resolved either way by this migration.
