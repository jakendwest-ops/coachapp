# Current Release Cycle

CoachApp runs on a **tag-gated release cycle** (`docs/releases/*.md`, `scripts/release.mjs`, [decisions.md](decisions.md)), not sprints;
the file keeps the name it was asked for.

**Snapshot taken:** 2026-11-10 (at the v2026.11.3 cut), from `git log`, `git tag -l`, `gh run list` and `docs/releases/`. Point-in-time: re-run those instead of
trusting this file for anything time-sensitive. The previous version is archived verbatim:
[archive/current-sprint-2026-10-11.md](archive/current-sprint-2026-10-11.md).

## Last shipped (tagged + deployed)

- **`v2026.11.3`** (live 2026-11-10, verified byte-identical; 1582 passed, 0 failed, 0 flaky): Phases 1-4 of the [solo audit response](superpowers/plans/2026-11-08-solo-audit-response.md), the plan page, week arrows and the Sessions Change column. [releases/v2026.11.3.md](releases/v2026.11.3.md)
- **Earlier:** `v2026.11.2` (end-of-block review) back to `v2026.09.14`: [releases/](releases/) (the full old file: [archive/current-sprint-2026-10-12.md](archive/current-sprint-2026-10-12.md)).

## In flight

Nothing built is unreleased as of the v2026.11.3 cut. Supabase log ingestion is over the Free plan's limit until 19 Nov (`audit_log` now keeps 30 days, [decisions.md](decisions.md)). Waiting on Jake: a phone run of v2026.11.3; the Fill-from-last-time prototype, the brand typeface and logger density, the rest-timer row jump, and Phase 5 (all in the audit plan); his phone check of the `fixed-awaiting-jake` rows in [bugs/](bugs/) (dark mode among them); the round-2 sound test on avoiding a tap after returning to Safari ([row](bugs/2026-10-28-runner-beeps-worked-for-two-exercises-then-were-never-heard-again.md)); whether **Sign out should end only this device's session** ([row](bugs/2026-10-03-sign-out-ends-every-device-session.md)); the "Up next" slot-matching rule (leave it, my view); the names "Biggest set" and "View training plan".

## Requires Validation

- Everything above reflects `git` and the filesystem at 2026-11-10; "pushed" is not "deployed", so confirm the deploy job in `gh run list`.
- The Stats sheet and the weekday day list were tested against stubbed data, not Jake's real history or a real assigned program
  ([releases/v2026.09.11.md](releases/v2026.09.11.md)).
- Two of Jake's own git stashes (a worktree's `stash@{0}` and `master`'s `stash@{1}` at `7aeb3ae`) were found untouched on 2026-09-17 and left alone.
