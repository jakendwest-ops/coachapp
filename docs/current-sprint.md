# Current Release Cycle

Tag-gated releases (`docs/releases/*.md`, `scripts/release.mjs`), not sprints; the file keeps the name it was asked for.

**Snapshot taken:** 2026-11-18, from `git log` and `docs/releases/`. Re-run those rather than trusting this file for anything time-sensitive.

## Last shipped

- **`v2026.11.7`** (cut 2026-11-16): supersets in the builder and the logger; schedule one of your own workouts on a day. [releases/v2026.11.7.md](releases/v2026.11.7.md)
- **`v2026.11.6`** (live 2026-11-16): the faster workout builder (the picker loads once, a new Add exercise form). [releases/v2026.11.6.md](releases/v2026.11.6.md)
- **Earlier:** [releases/](releases/).

## In flight

Unreleased since `v2026.11.7`: on the sets sheet, Fixed / Range and rest − / + now keep "same for every set" instead of switching to
"Each set different" (`5218e0f`, tidied in `51a9a57`; [row](bugs/2026-11-17-fixed-range-or-rest-step-switches-the-sets-sheet-to-each-set-different.md)).
Its multi-agent review saw `5218e0f`; re-record the review on HEAD before the next release. Jake does not want the old overwritten
Week 2-4 Mondays restored (2026-11-15). The Add exercise sheet is parked with a settled list. Waiting on Jake: his phone check of the `fixed-awaiting-jake` rows in
[bugs/](bugs/); the round-2 sound test ([row](bugs/2026-10-28-runner-beeps-worked-for-two-exercises-then-were-never-heard-again.md)); whether
Sign out should end only this device's session ([row](bugs/2026-10-03-sign-out-ends-every-device-session.md)).

## Requires Validation

- "Pushed" is not "deployed": confirm the deploy job in `gh run list` and run `node scripts/verify-live.mjs <tag>`.
