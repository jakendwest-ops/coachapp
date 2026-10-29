# Current Release Cycle

CoachApp runs on a **tag-gated release cycle** (`docs/releases/*.md`, `scripts/release.mjs`, [decisions.md](decisions.md)), not sprints;
the file keeps the name it was asked for.

**Snapshot taken:** 2026-10-11, from `git log`, `git tag -l`, `gh run list` and `docs/releases/`. Point-in-time: re-run those instead of
trusting this file for anything time-sensitive. The previous version is archived verbatim:
[archive/current-sprint-2026-10-11.md](archive/current-sprint-2026-10-11.md).

## Last shipped (tagged + deployed)

- **`v2026.10.7`** (live 2026-10-29, verified byte-identical; 1334 passed, 0 failed, 2 flaky): the exercise builder rebuilt (sets edited as a group, "Today's top set weight", "Same as set N"); beeps survive leaving Safari. [releases/v2026.10.7.md](releases/v2026.10.7.md)
- **Earlier:** `v2026.10.6` (beeps keep Spotify playing; ghost text past 20 sessions) back to `v2026.09.14`: [releases/](releases/) (the full old file: [archive/current-sprint-2026-10-12.md](archive/current-sprint-2026-10-12.md)).

## In flight

Nothing unreleased. Next: dark mode as the default (waits for Jake's go), then the PT's Workouts page. Waiting on Jake: his phone check of the `fixed-awaiting-jake` rows in [bugs/](bugs/); the round-2 sound test on avoiding a tap after returning to Safari ([row](bugs/2026-10-28-runner-beeps-worked-for-two-exercises-then-were-never-heard-again.md)); whether **Sign out should end only this device's session** ([row](bugs/2026-10-03-sign-out-ends-every-device-session.md)); the "Up next" slot-matching rule (leave it, my view); the names "Biggest set" and "View training plan".

## Next: the release plans

R1, R2a, R2b, R2d and R4b are done (shipped across `v2026.09.7`-`v2026.09.9`); the rest is not started:
[superpowers/plans/2026-09-19-product-review-ranked-backlog-and-releases.md](superpowers/plans/2026-09-19-product-review-ranked-backlog-and-releases.md).

## Requires Validation

- Everything above reflects `git` and the filesystem at 2026-10-11; "pushed" is not "deployed", so confirm the deploy job in `gh run list`.
- The Stats sheet and the weekday day list were tested against stubbed data, not Jake's real history or a real assigned program
  ([releases/v2026.09.11.md](releases/v2026.09.11.md)).
- Two of Jake's own git stashes (a worktree's `stash@{0}` and `master`'s `stash@{1}` at `7aeb3ae`) were found untouched on 2026-09-17 and left alone.
