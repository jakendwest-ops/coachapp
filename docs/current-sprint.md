# Current Release Cycle

CoachApp runs on a **tag-gated release cycle** (`docs/releases/*.md`, `scripts/release.mjs`, [decisions.md](decisions.md)), not sprints;
the file keeps the name it was asked for.

**Snapshot taken:** 2026-10-05, from `git log`, `git tag -l`, `gh run list` and `docs/releases/`. Point-in-time: re-run those instead of
trusting this file for anything time-sensitive. The longer 2026-10-04 version is archived verbatim:
[archive/current-sprint-2026-10-04.md](archive/current-sprint-2026-10-04.md).

## Last shipped (tagged + deployed)

- **`v2026.09.15`**, cut 2026-10-04 (about 23:17 BST), live: the check and deploy jobs were green and the live files are byte-identical to the
  tag. Items 4-5 of Jake's 2026-10-04 note (the program-page rework; an RPE method for periodization) plus his two answers of the same day (the
  Undulating Reps boxes removed; a program opens on the phase the viewer's own plan is in, marked "Now"). Full suite 1098 passed / 0 failed /
  1 flaky / 4 skipped. [releases/v2026.09.15.md](releases/v2026.09.15.md)
- **`v2026.09.14`**, cut 2026-10-04, live: the shared exercise stats card, the one-skeleton dashboard, items 1-3 of the same note (My progress
  fold-ups, the "Up next" card, the Last time top set) and eight follow-ups from the pre-push review. Full suite 1056 passed / 0 failed /
  1 flaky / 4 skipped. [releases/v2026.09.14.md](releases/v2026.09.14.md)
- **Earlier:** `v2026.09.13` (2026-10-03: RPE top-set autoregulation, the runner walkthrough rounds, Goals permissions, Personal Bests as one
  page; `v2026.09.12` was tagged but never deployed, a Node-22-only check failure, see [releases/v2026.09.12.md](releases/v2026.09.12.md)) and
  `v2026.09.11` (2026-09-28: the runner rebuilt around Jake's 8-item walkthrough). `docs/releases/` is the record for anything older.

Everything from `v2026.09.14` on still awaits Jake's look on a phone (the `fixed-awaiting-jake` rows in [bugs/](bugs/)).

## In flight

No unreleased app code is known: after the `v2026.09.15` tag, `master` holds a docs commit (`332d80f`) and the Vault-root guard (`cdd5b3b`,
[decisions.md](decisions.md) 2026-10-05), plus the docs-budget trim of 2026-10-05, which is uncommitted. Waiting on Jake: whether **Sign out
should end only this device's session** ([the open row](bugs/2026-10-03-sign-out-ends-every-device-session.md)); whether to build the "Up next"
slot-matching rule (recommendation: leave it); the names "Biggest set" and "View program".

## Next: the release plans

R1, R2a, R2b, R2d and R4b are done (shipped across `v2026.09.7`-`v2026.09.9`); the rest is not started:
[superpowers/plans/2026-09-19-product-review-ranked-backlog-and-releases.md](superpowers/plans/2026-09-19-product-review-ranked-backlog-and-releases.md).

## Requires Validation

- Everything above reflects `git` and the filesystem at 2026-10-05; "pushed" is not "deployed", so confirm the deploy job in `gh run list`.
- The Stats sheet and the weekday day list were tested against stubbed data, not Jake's real history or a real assigned program
  ([releases/v2026.09.11.md](releases/v2026.09.11.md)).
- Two of Jake's own git stashes (a worktree's `stash@{0}` and `master`'s `stash@{1}` at `7aeb3ae`) were found untouched on 2026-09-17 and left alone.
