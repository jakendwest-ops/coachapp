# Current Release Cycle

**Note on the filename:** this file is named `current-sprint.md` by request, but CoachApp does not
run sprints — there is no evidence anywhere in the repo of sprint-based planning. It runs on a
**tag-gated release cycle** instead (`docs/releases/*.md`, `scripts/release.mjs`,
[decisions.md](decisions.md)). Everything below describes that cycle, reframed accordingly.

**Snapshot taken:** 2026-09-15, from `git status`, `git log`, `git tag -l`, and `docs/releases/`.
This is a point-in-time snapshot and will be stale on next read — re-run those commands rather than
trusting this file for anything time-sensitive.

## Last shipped (tagged + deployed)

**`v2026.09.5`**, cut 2026-09-11 — builder panel placement, a per-row set-sync control, a row-level
Remove button, and three smaller runner UI fixes. 5 confirmed self-contained fixes, no deferrals.

## In flight, not yet shipped

A release note for **`v2026.09.6`** exists at `docs/releases/v2026.09.6.md`, dated 2026-09-15, but
as of this snapshot **it is an untracked file — not committed, and no `v2026.09.6` git tag exists.**
The release it describes has not shipped. Its stated scope: rebuilding the workout template builder
from write-on-every-edit to a staged-draft model with an explicit "Save workout" action, plus four
smaller fixes from a 2026-09-13 walkthrough (weight-log button styling, a tab heading, per-program
comparison scoping, and an editor button placement change).

## Recent commit activity (most recent 8, from `git log`)

1. `06461ce` — docs(checks): raise spec-hygiene baseline by 1 for a fault-injection mock, not a real gap
2. `6cb22ee` — template builder: fix checks.sh debt this branch introduced
3. `20db166` — Merge branch 'worktree-template-draft-save': template builder staged-edits + Save workout
4. `bbc19b7` — template builder: fix 4 critical + 5 important findings from final branch review
5. `4cf863e` — docs(plan): insert Task 14 -- fix findings from the final whole-branch review
6. `c7050bb` — template builder: cache-bust app-workouts.js for the staged-edits redesign
7. `1225344` — tests: poll for real Save-then-navigate completion instead of a fixed sleep
8. `eac4197` — docs(plan): insert Task 13b -- replace a fixed sleep with a real completion wait

Reading top to bottom: the template-builder rework merged, then several commits paid down
`checks.sh`/review debt it introduced — i.e., this cycle is currently in a stabilization tail, not
new development.

## The Vault's last recorded live state (2026-09-08 save — now superseded by git above)

Migrated for completeness, and as a worked example of exactly the staleness problem this migration
is meant to fix: the Vault's `STATUS.md` recorded LIVE as tag `v2026.09.2` as of its last save
(2026-09-08) — three tagged releases (`v2026.09.3`, `.4`, `.5`) shipped after that save and were
never reflected there. **Git, not a hand-updated status file, is the current source of truth for
what's live** — that's the whole reason this file is now built from `git`/`docs/releases/` directly
rather than from a narrative status doc.

The 2026-09-08 entry itself, for historical record: a "UX cleanup pass" — 16 items across
runner/builder/progress/dashboards from a `/superpowers:brainstorming` design, 3 of 4 commits
shipped (runner, builder, progress), the 4th (dashboards D2-D4) not started. Design tokens landed
2026-08-23, cutting `js/` style literals from 1,027 to 256.

## Requires Validation

- Everything above reflects `git`/filesystem state at 2026-09-15. Re-run `git status`, `git tag -l`,
  and check `docs/releases/` for anything newer before relying on this for current work.
- Whether `v2026.09.6` ships as drafted, gets amended, or gets superseded before tagging is unknown
  — the release note existing is not a commitment that it ships unchanged.
- The dashboards D2-D4 work (solo bottom-nav restructure, dashboard filtering, PT stat-tile layout)
  was "not started" as of 2026-09-08 — not re-checked against current commits in this migration.
