# Roadmap

A curated current-state summary. The feature-by-feature ledger is archived verbatim in
[archive/roadmap-2026-09-08.md](archive/roadmap-2026-09-08.md); the fuller version of this file as it stood on 2026-10-05 (every shipped item
with its row link) is [archive/roadmap-2026-10-05.md](archive/roadmap-2026-10-05.md). Tag-gated releases, not sprints:
[current-sprint.md](current-sprint.md).

## GDPR consent capture: 5 of 6 steps live, the row still says `deferred`

Shipped 2026-08-25: privacy policy, consent checkbox, a consent gate in `showApp()`, and a `checks.sh` rule coupling the policy version to the
gate. Left: confirming `delete_current_user()` exists in the database (needs Jake). Only Jake can change the row's status:
[the ledger row](bugs/2026-08-11-gdpr-no-consent-capture-and-no-privacy-policy.md).

## Current priorities (corrected 2026-10-05)

- **Awaiting Jake's look on a phone:** everything in `v2026.09.14` and `v2026.09.15` — the one-skeleton dashboard (D1, built from the prototype he
  approved; the coach page is logged-only until a database view exists, [row](bugs/2026-10-03-dashboard-needs-a-mobile-rework-as-a-landing-page.md)),
  the shared exercise stats card, My progress fold-ups, the "Up next" card, the Last time top set, the program-page rework and the RPE method for
  periodization. The rows are the `fixed-awaiting-jake` files in [bugs/](bugs/).
- **Open product question:** should Sign out end only *this device's* session? Today it ends every session for the account, so another device
  looks signed in and then fails with "session expired". `signOut({ scope: 'local' })` would change that; it is a product and security call, so
  it is not changed: [the row](bugs/2026-10-03-sign-out-ends-every-device-session.md).
- **Design system Stage 4 (branding) — unblocked, awaiting Jake:** is Inter the brand typeface or a placeholder, how dense the runner should be,
  whether there is a brand direction to set token values against. Stages 1-3 (vocabulary, ratchet, conversion) are done.
- **The release plans:** R1, R2a/b/d and R4b shipped in `v2026.09.7`-`v2026.09.9`; the rest is not started
  ([plan](superpowers/plans/2026-09-19-product-review-ranked-backlog-and-releases.md), which supersedes this list for *what to build next*).
  Week-structure edits (duplicate/delete/generate weeks) still change assigned clients' plans with no prompt: Jake's call (R5).
- **Roster-size features deferred (Jake, 2026-09-26: no clients yet):** client-list search/filter/sort (R2c), the "Needs attention" list (R3c),
  invite state, the programme-and-week row on the client list. Not to be built speculatively; they need a session with a real roster.
- **Solo/signup:** the data model and invite-based onboarding are done; open public self-signup for new solo accounts is a deliberate deferral.
- **Security follow-up (2026-07-30):** `workout_log_exercises`/`workout_log_sets` are reasoned-safe but not behaviourally tested; several goal
  writes (`saveGoalProgress`, `saveEditGoal`, `toggleMilestone`, `toggleClientMilestone`) share the same unanchored-write shape, lower priority.

## Raised but deliberately deprioritized (Jake, 2026-07-11 — still relevant, not lost)

- **Error monitoring** is live (`app_errors`, read in Settings); the owner's card is unchecked on real data.
- **Backup/restore:** free-tier point-in-time recovery is limited; a real restore has never been tried.
- **Beta ops:** the "Send feedback" link is live; invite-email delivery to a non-Jake address was never tested.
- **The API's silent 200-row cap:** known screens are fixed and `checks.sh` rule 9n refuses new unbounded reads; still open are the `clients`
  roster reads and the sites named in [the row](bugs/2026-09-21-remaining-unbounded-reads-of-growing-tables-are-named-not-fixed.md).

## Named backlog items (unscoped)

A real superset data model; the cardio side of runner Phase 2; a client-detach/cancellation workflow (a client can self-detach via the API with
no PT-side notice); AMRAP/EMOM/circuit timer modes; a goals overhaul (mini-goals/milestones). The `sudoAsClient`/`exitSudo` role-flip class is in
[technical-debt.md](technical-debt.md).

## Requires Validation

- Priorities above were rebuilt on 2026-10-05 from `current-sprint.md`, the release notes and the ledger, not re-run against the code.
- The beta timeline is deliberately not restated here; see [vision.md](vision.md)'s Requires Validation.
