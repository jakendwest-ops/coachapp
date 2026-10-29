# Current Release Cycle

CoachApp runs on a **tag-gated release cycle** (`docs/releases/*.md`, `scripts/release.mjs`, [decisions.md](decisions.md)), not sprints;
the file keeps the name it was asked for.

**Snapshot taken:** 2026-10-29, from `git log`, `git tag -l`, `gh run list` and `docs/releases/`. Point-in-time: re-run those instead of
trusting this file for anything time-sensitive. The previous version is archived verbatim:
[archive/current-sprint-2026-10-11.md](archive/current-sprint-2026-10-11.md).

## Last shipped (tagged + deployed)

- **`v2026.10.8`** (live 2026-10-29, verified byte-identical; 1343 passed, 0 failed, 2 flaky): dark mode is the default; Settings > Appearance (Dark, Light, Match my phone, kept on the phone). [releases/v2026.10.8.md](releases/v2026.10.8.md)
- **Earlier:** `v2026.10.7` (the exercise builder rebuilt; beeps survive leaving Safari) back to `v2026.09.14`: [releases/](releases/) (the full old file: [archive/current-sprint-2026-10-12.md](archive/current-sprint-2026-10-12.md)).

## In flight

On master, not yet released (merge `fee3dd8`): a client's current training plan is chosen by date, and the client's Training plans tab gains "Assign next block" ([row](bugs/2026-10-29-current-plan-is-picked-by-assignment-order-not-by-date.md)). **Jake runs `scripts/fix-coach-client-summary-current-plan-2026-10-29.sql` before it ships:** the coach Home reads the view's new `next_program_start` column. After that, the PT's Workouts page. Waiting on Jake: his phone check of the `fixed-awaiting-jake` rows in [bugs/](bugs/) (dark mode among them); the round-2 sound test on avoiding a tap after returning to Safari ([row](bugs/2026-10-28-runner-beeps-worked-for-two-exercises-then-were-never-heard-again.md)); whether **Sign out should end only this device's session** ([row](bugs/2026-10-03-sign-out-ends-every-device-session.md)); the "Up next" slot-matching rule (leave it, my view); the names "Biggest set" and "View training plan".

## Requires Validation

- Everything above reflects `git` and the filesystem at 2026-10-29; "pushed" is not "deployed", so confirm the deploy job in `gh run list`.
- The Stats sheet and the weekday day list were tested against stubbed data, not Jake's real history or a real assigned program
  ([releases/v2026.09.11.md](releases/v2026.09.11.md)).
- Two of Jake's own git stashes (a worktree's `stash@{0}` and `master`'s `stash@{1}` at `7aeb3ae`) were found untouched on 2026-09-17 and left alone.
