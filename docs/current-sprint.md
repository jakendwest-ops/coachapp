# Current Release Cycle

CoachApp runs on a **tag-gated release cycle** (`docs/releases/*.md`, `scripts/release.mjs`, [decisions.md](decisions.md)), not sprints;
the file keeps the name it was asked for.

**Snapshot taken:** 2026-11-07 (at the v2026.11.2 cut), from `git log`, `git tag -l`, `gh run list` and `docs/releases/`. Point-in-time: re-run those instead of
trusting this file for anything time-sensitive. The previous version is archived verbatim:
[archive/current-sprint-2026-10-11.md](archive/current-sprint-2026-10-11.md).

## Last shipped (tagged + deployed)

- **`v2026.11.2`** (live 2026-11-07, verified byte-identical; 1509 passed, 0 failed, 1 flaky): the end-of-block review in Personal view, Sessions "vs last time" with weekly volume, and the coach's phone bar. [releases/v2026.11.2.md](releases/v2026.11.2.md)
- **Earlier:** `v2026.11.1` (Personal Progress's five pills) back to `v2026.09.14`: [releases/](releases/) (the full old file: [archive/current-sprint-2026-10-12.md](archive/current-sprint-2026-10-12.md)).

## In flight

Nothing built is unreleased as of the v2026.11.2 cut. Waiting on Jake: his phone check of the `fixed-awaiting-jake` rows in [bugs/](bugs/) (dark mode among them); the round-2 sound test on avoiding a tap after returning to Safari ([row](bugs/2026-10-28-runner-beeps-worked-for-two-exercises-then-were-never-heard-again.md)); whether **Sign out should end only this device's session** ([row](bugs/2026-10-03-sign-out-ends-every-device-session.md)); the "Up next" slot-matching rule (leave it, my view); the names "Biggest set" and "View training plan".

## Requires Validation

- Everything above reflects `git` and the filesystem at 2026-11-07; "pushed" is not "deployed", so confirm the deploy job in `gh run list`.
- The Stats sheet and the weekday day list were tested against stubbed data, not Jake's real history or a real assigned program
  ([releases/v2026.09.11.md](releases/v2026.09.11.md)).
- Two of Jake's own git stashes (a worktree's `stash@{0}` and `master`'s `stash@{1}` at `7aeb3ae`) were found untouched on 2026-09-17 and left alone.
