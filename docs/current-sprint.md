# Current Release Cycle

CoachApp runs on a **tag-gated release cycle** (`docs/releases/*.md`, `scripts/release.mjs`, [decisions.md](decisions.md)), not sprints;
the file keeps the name it was asked for.

**Snapshot taken:** 2026-10-11, from `git log`, `git tag -l`, `gh run list` and `docs/releases/`. Point-in-time: re-run those instead of
trusting this file for anything time-sensitive. The previous version is archived verbatim:
[archive/current-sprint-2026-10-11.md](archive/current-sprint-2026-10-11.md).

## Last shipped (tagged + deployed)

- **`v2026.10.3`**, cut 2026-10-15, live: deploy green, the 13 live files byte-identical (`verify-live`). Your workouts rows open in place, a dumbbell nav icon,
  the Body Weight and Personal Bests rework of My Progress, styled form classes, and the Streak tile (plan adherence, or weeks at a weekly target set in Settings;
  `profiles.weekly_session_target` applied first). 1190 passed / 0 failed / 9 flaky / 4 skipped. [releases/v2026.10.3.md](releases/v2026.10.3.md)
- **`v2026.10.2`** (2026-10-13): Training plans, "On my plan", the solo Workouts page. **`v2026.10.1`** (2026-10-11): the runner reports. **`v2026.09.15`** and
  **`v2026.09.14`** (2026-10-04): the program-page rework, RPE periodization, the one-skeleton dashboard. [releases/](releases/)
- **Earlier:** see `docs/releases/` (the full file is archived: [archive/current-sprint-2026-10-12.md](archive/current-sprint-2026-10-12.md)).

Everything from `v2026.09.14` on still awaits Jake's look on a phone (the `fixed-awaiting-jake` rows in [bugs/](bugs/)).

## In flight

Unreleased (on master): the Goals tab rework, built 2026-10-14. Waiting on Jake: his phone check; which session went missing in the "unscheduled day" row; whether **Sign out should
end only this device's session** ([row](bugs/2026-10-03-sign-out-ends-every-device-session.md)); the "Up next" slot-matching rule (recommendation:
leave it); the names "Biggest set" and "View training plan".

## Next: the release plans

R1, R2a, R2b, R2d and R4b are done (shipped across `v2026.09.7`-`v2026.09.9`); the rest is not started:
[superpowers/plans/2026-09-19-product-review-ranked-backlog-and-releases.md](superpowers/plans/2026-09-19-product-review-ranked-backlog-and-releases.md).

## Requires Validation

- Everything above reflects `git` and the filesystem at 2026-10-11; "pushed" is not "deployed", so confirm the deploy job in `gh run list`.
- The Stats sheet and the weekday day list were tested against stubbed data, not Jake's real history or a real assigned program
  ([releases/v2026.09.11.md](releases/v2026.09.11.md)).
- Two of Jake's own git stashes (a worktree's `stash@{0}` and `master`'s `stash@{1}` at `7aeb3ae`) were found untouched on 2026-09-17 and left alone.
