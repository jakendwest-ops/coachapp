# Roadmap

Rewritten 2026-09-15 from the Vault's `roadmap.md` (last Vault save: 2026-09-08), replacing an
earlier inference-based version of this file. The full 624-line source — every feature, every
dated session backlog — is archived verbatim at
[archive/roadmap-2026-09-08.md](archive/roadmap-2026-09-08.md). This file is a curated current-state
summary, not a replacement for that archive; go there for the full feature-by-feature ledger.

## Current cadence

Tag-gated releases, not sprints. See [current-sprint.md](current-sprint.md) for the in-flight
release cycle.

## A correction this migration surfaced: GDPR consent capture is NOT still open

`docs/backlog.md`/`docs/critical.md` (and every earlier version of this documentation set) describe
GDPR consent capture as an unresolved deferred item. **That's stale.** Per the Vault's own roadmap,
the underlying work shipped 2026-08-25: privacy policy written, hosted, and linked; consent
checkbox live with a fail-safe write check; a read-side gate in `showApp()` blocking any role
without current consent; the version-coupling between the policy page and the gate enforced by a
`checks.sh` rule. **5 of 6 steps are built and live.** The one remaining step: verifying
`delete_current_user()` actually exists in the database — can't be tested without destroying a real
account, needs Jake directly.

**Why the bug ledger still says `deferred`:** per this project's own closure rule, a Jake-reported
item closes only on his confirmation or a red→green test — never by inference, which is exactly
right and exactly why this migration isn't closing the row itself. But the row's status is now
misleading relative to the actual work, and that gap is worth Jake's attention specifically. See
[docs/bugs/2026-08-11-gdpr-no-consent-capture-and-no-privacy-policy.md](bugs/2026-08-11-gdpr-no-consent-capture-and-no-privacy-policy.md).

A second, closed security item worth knowing about: **public self-signup was still enabled on live
for 44 days** after the 2026-07-24 code fix removed the signup form — a dashboard toggle was never
flipped. Closed 2026-09-06 (see [critical.md](critical.md) for the pattern: a code fix and a config
fix are not the same fix).

## Current priorities (as of the Vault's last save, 2026-09-08)

- **Design system Stage 4 (branding) — now unblocked**, awaiting Jake: is Inter the brand typeface
  or a placeholder, how dense the runner should be, whether there's a brand direction to set token
  values against yet. Stages 1-3 (vocabulary, ratchet, conversion — 1,027→256 inline style literals)
  are done.
- **UX cleanup pass — 3 of 4 areas shipped** (runner, builder, progress); dashboards (D2-D4: solo
  bottom-nav restructure, dashboard filtering, PT stat-tile layout) not started, awaiting Jake's go.
- **Solo/signup:** the data model and invite-based onboarding (an owner-gated Edge Function) are
  done. Genuine open public self-signup for new solo accounts remains a deliberate deferral, not
  scoped.
- **Security follow-up (2026-07-30):** the `workout_logs` RLS fix's sibling tables
  (`workout_log_exercises`/`workout_log_sets`) are reasoned-safe but not independently behaviourally
  tested. Several goal-related writes (`saveGoalProgress`, `saveEditGoal`, `toggleMilestone`,
  `toggleClientMilestone`) share the same unanchored-write shape, lower priority.
- **The 2026-07-11 "empty app" beta blocker is closed** — a brand-new coach used to land on zero
  exercises/templates/clients; `starter-content.js` (~40 seeded exercises + a sample workout and
  programme) resolved this. Confirmed present in the current codebase (see
  [architecture.md](architecture.md)).

## Raised but deliberately deprioritized (Jake's own call, 2026-07-11 — still relevant, not lost)

- **Error monitoring/crash reporting** — `log.error` only reaches the user's own browser console; a
  beta PT's crash is invisible to Jake unless self-reported.
- **Backup/restore posture** — Supabase free-tier point-in-time-recovery is limited; untested
  whether a real data-loss incident could actually be restored.
- **Beta ops** — no in-app feedback channel; invite-email deliverability to real (non-Jake)
  addresses has never been tested.
- **`max_rows = 200` cap** — set during DB hardening; has already silently truncated results once
  (Workouts page needed an explicit `.limit()`).

## Named backlog items (from the full feature ledger, not yet scoped)

A sample of what's tracked as planned-but-unscoped in the full archive — not exhaustive, see the
archive for the complete list: a real superset data model (pairs of exercises tracked together, not
just a text field), runner Phase 2 (extending the fast table to cardio/timed/unilateral/%1RM
exercises), a proper client-detach/cancellation workflow (a client can currently self-detach from
their PT via the API with no workflow or PT-side notice), AMRAP/EMOM/circuit dedicated timer modes,
and a goals overhaul (granular mini-goals/milestones).

**New 2026-09-17, from shipping `v2026.09.6` (the template-builder staged-edits + Save workout
redesign — see [current-sprint.md](current-sprint.md) and
[releases/v2026.09.6.md](releases/v2026.09.6.md)):**

- **The equivalent propagation-once-on-Save redesign for program-workout edits** — the
  2026-09-13 walkthrough's second ask (a confirm prompt when leaving a changed workout back to the
  phases page, instead of a per-edit propagation interruption). Explicitly out of scope for
  `v2026.09.6`, which covered only the template builder. Not yet scoped as its own plan.
- **The same role-flip-before-dirty-check bug class in `app-dashboard.js`'s
  `sudoAsClient`/`exitSudo`** — found during this release's review but deferred (narrower exposure
  than the `switchView` case this release fixed; see [technical-debt.md](technical-debt.md)).

## Requires Validation

- Everything above is dated to the Vault's last save (2026-09-08) and not re-verified against
  current code in this migration pass — treat as a starting point, not a live status check.
- The GDPR correction above is the one item in this file most worth Jake's direct attention — it
  changes the actual compliance picture materially from what every other doc in this set (written
  before this section was read) currently says.
- The beta timeline itself is deliberately not restated here — see [vision.md](vision.md)'s Requires
  Validation for why it's an open question, not resolved either way by this migration.
