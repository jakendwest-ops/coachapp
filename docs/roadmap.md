# Roadmap

A curated current-state summary. History: [archive/roadmap-2026-09-08.md](archive/roadmap-2026-09-08.md) and
[archive/roadmap-2026-10-05.md](archive/roadmap-2026-10-05.md). Releases: [current-sprint.md](current-sprint.md).

## GDPR consent capture: 5 of 6 steps live, the row still says `deferred`

Shipped 2026-08-25: privacy policy, consent checkbox, a consent gate in `showApp()`, and a `checks.sh` rule coupling the policy version to the
gate. Left: confirming `delete_current_user()` exists in the database (needs Jake). Only Jake can change the row's status:
[the ledger row](bugs/2026-08-11-gdpr-no-consent-capture-and-no-privacy-policy.md).

## Solo product review (2026-10-29)

Ranked MVP / V2 / V3: [superpowers/plans/2026-10-29-solo-product-review.md](superpowers/plans/2026-10-29-solo-product-review.md).
Built: R4a, installable app, four-destination nav (MVP 7). Next: the 2026-10-31 chart designs in `superpowers/specs/`.

## Current priorities

- **Awaiting Jake's look on a phone:** the `fixed-awaiting-jake` files in [bugs/](bugs/); beeps with no extra tap (his sound test,
  [row](bugs/2026-10-28-runner-beeps-worked-for-two-exercises-then-were-never-heard-again.md)).
- **Open product question:** should Sign out end only this device's session? Today it ends every session for the account
  ([row](bugs/2026-10-03-sign-out-ends-every-device-session.md)).
- **The release plans:** R1, R2a/b/d and R4b shipped; the rest is not started
  ([plan](superpowers/plans/2026-09-19-product-review-ranked-backlog-and-releases.md)). Week-structure edits still change assigned clients'
  plans with no prompt: Jake's call (R5).
- **Roster-size features (R2c, R3c, invite state):** in scope since 2026-10-29 ("design for 25"); built so far: the current plan by date and
  "Assign next block".
- **Solo/signup:** invite-based onboarding is done; open public self-signup is a deliberate deferral.
- **Security follow-up (2026-07-30):** `workout_log_exercises`/`workout_log_sets` are reasoned-safe but not behaviourally tested; several goal
  writes share the same unanchored-write shape, lower priority.

## Raised but deliberately deprioritized (Jake, 2026-07-11)

- **Error monitoring** is live (`app_errors`, read in Settings); the owner's card is unchecked on real data.
- **Backup/restore:** a real restore has never been tried.
- **Beta ops:** invite-email delivery to a non-Jake address was never tested.
- **The API's silent 200-row cap:** `checks.sh` rule 9n refuses new unbounded reads; still open:
  [the row](bugs/2026-09-21-remaining-unbounded-reads-of-growing-tables-are-named-not-fixed.md).

## Named backlog items (unscoped)

A client-detach/cancellation workflow; AMRAP/EMOM/circuit timer modes; a goals overhaul; the cardio side of runner Phase 2.
