# Current Release Cycle

CoachApp runs on a **tag-gated release cycle** (`docs/releases/*.md`, `scripts/release.mjs`, [decisions.md](decisions.md)), not sprints;
the file keeps the name it was asked for.

**Snapshot taken:** 2026-10-11, from `git log`, `git tag -l`, `gh run list` and `docs/releases/`. Point-in-time: re-run those instead of
trusting this file for anything time-sensitive. The previous version is archived verbatim:
[archive/current-sprint-2026-10-11.md](archive/current-sprint-2026-10-11.md).

## Last shipped (tagged + deployed)

- **`v2026.10.1`**, cut 2026-10-11, live: the check and deploy jobs green and the 13 live files byte-identical to the tag (`verify-live`). Jake's
  three runner reports of the day (a 0 kg weight is logged, shown and remembered; Finish and End ask first, with Back to workout on the finish
  screen; the new-1RM estimate asks "view or update?" first), the periodization save checks and CI on Node 24. The first full-suite run failed on a
  stall (that test passes alone, 6 of 6); the second: 1117 passed / 0 failed / 2 flaky / 4 skipped. [releases/v2026.10.1.md](releases/v2026.10.1.md)
- **`v2026.09.15`** and **`v2026.09.14`** (both 2026-10-04): the program-page rework and RPE periodization; the shared exercise stats card, the
  one-skeleton dashboard, My progress fold-ups and "Up next". [releases/](releases/)
- **Earlier:** `v2026.09.13` (2026-10-03: RPE top-set autoregulation, the runner walkthrough rounds; `v2026.09.12` was tagged but never deployed,
  see [releases/v2026.09.12.md](releases/v2026.09.12.md)) and `v2026.09.11` (2026-09-28). `docs/releases/` is the record for anything older.

Everything from `v2026.09.14` on still awaits Jake's look on a phone (the `fixed-awaiting-jake` rows in [bugs/](bugs/)).

## In flight

Unreleased on master (Jake's 2026-10-12 items 1-4a): `app-dashboard` v33 (the streak starts with the plan), `app-programs` v73 (day headings), `app-progress` v79 (effort in the Performance tables, "@7 RPE"). Open: his 2026-10-12 rows for the Workouts page, plan add/remove and on-the-fly workouts (scoped, awaiting prototypes). Waiting on Jake: his phone check; which session went missing in the "unscheduled day" row; whether **Sign out should
end only this device's session** ([row](bugs/2026-10-03-sign-out-ends-every-device-session.md)); the "Up next" slot-matching rule (recommendation:
leave it); the names "Biggest set" and "View program".

## Next: the release plans

R1, R2a, R2b, R2d and R4b are done (shipped across `v2026.09.7`-`v2026.09.9`); the rest is not started:
[superpowers/plans/2026-09-19-product-review-ranked-backlog-and-releases.md](superpowers/plans/2026-09-19-product-review-ranked-backlog-and-releases.md).

## Requires Validation

- Everything above reflects `git` and the filesystem at 2026-10-11; "pushed" is not "deployed", so confirm the deploy job in `gh run list`.
- The Stats sheet and the weekday day list were tested against stubbed data, not Jake's real history or a real assigned program
  ([releases/v2026.09.11.md](releases/v2026.09.11.md)).
- Two of Jake's own git stashes (a worktree's `stash@{0}` and `master`'s `stash@{1}` at `7aeb3ae`) were found untouched on 2026-09-17 and left alone.
