# Current Release Cycle

**Note on the filename:** this file is named `current-sprint.md` by request, but CoachApp does not
run sprints — there is no evidence anywhere in the repo of sprint-based planning. It runs on a
**tag-gated release cycle** instead (`docs/releases/*.md`, `scripts/release.mjs`,
[decisions.md](decisions.md)). Everything below describes that cycle, reframed accordingly.

**Snapshot taken:** 2026-09-17, from `git status`, `git log`, `git tag -l`, and `docs/releases/`.
This is a point-in-time snapshot and will be stale on next read — re-run those commands rather than
trusting this file for anything time-sensitive.

## Last shipped (tagged + deployed)

**`v2026.09.6`**, cut 2026-09-17 — the workout-template builder rebuilt from write-on-every-edit to
a staged-draft model with an explicit "Save workout" action, plus four smaller fixes from a
2026-09-13 walkthrough. Full details, including three rounds of multi-agent review and the real
bugs each round found and fixed (a role-flip timing hazard, a duplicate-insert-on-retry bug, a
name-keyed reorder corruption with duplicate exercise names, a stranded-partial-failure-propagation
bug, an id-clobber via `Object.assign`, and a broken async test-polling pattern caught by the third
review round): [docs/releases/v2026.09.6.md](releases/v2026.09.6.md). Full suite: 675 passed / 0
failed / 0 flaky. Deploy confirmed live (`app-workouts.js?v=129` served, no console errors).

## In flight, not yet shipped

Nothing. The template-builder cycle above is fully shipped and deployed. No release note exists yet
for a `v2026.09.7`.

## Recent commit activity (most recent 8, from `git log`)

1. `42afabe` — docs(release): fill in v2026.09.6 verification numbers and known issues
2. `1c40dad` — template builder: fix critical/important findings from the whole-branch + scoped re-reviews
3. `e8e579c` — chore(os-lint): retire checkContinuityBudget, measure event-gate marker staleness
4. `a09a6b8` — Close 5 bugs on rule-(b) evidence, finish the skills migration, fix stale docs
5. `c7de3b3` — Action the AI-operating-system audit's recommendations
6. `10ff7d8` — Consolidate CoachApp's own hooks/skills into the repo
7. `17f08f7` — docs: migrate CoachApp's system of record from the Vault into the repo
8. `06461ce` — docs(checks): raise spec-hygiene baseline by 1 for a fault-injection mock, not a real gap

Reading top to bottom: the template-builder rework (commits further back than #8 above) merged and
shipped this cycle; in between, a separate, independent effort migrated the system of record from
the Vault into this repo's own `docs/` and consolidated hooks/skills — unrelated to the template
builder, done concurrently by a different working session while this one was between turns.

## Known process note this cycle

Three full rounds of multi-agent review ran on the template-builder fix before it shipped — a
whole-branch review, a scoped re-review of that review's own fix (which found two further real bugs
in the fix itself), and a confirmatory re-review of *that* fix (which found one more, in a new test
rather than production code). None of the three rounds' findings shipped unfixed. Lower-severity
items from all three rounds were deliberately deferred rather than silently dropped — see
`v2026.09.6.md`'s "Known issues" section and this cycle's own SDD ledger
(`.claude/worktrees/template-draft-save/.superpowers/sdd/2026-09-13-template-draft-save/progress.md`,
not yet cleaned up — see `docs/technical-debt.md`).

## Requires Validation

- Everything above reflects `git`/filesystem state at 2026-09-17. Re-run `git status`, `git tag -l`,
  and check `docs/releases/` for anything newer before relying on this file for current work.
- Two of Jake's own git stashes (`.claude/worktrees/template-draft-save`'s own `stash@{0}`, and
  `master`'s `stash@{1}` at commit `7aeb3ae`) were found untouched during this cycle's work and were
  deliberately left alone — never stash/pop on a shared tree. `stash@{1}` in particular may be Jake's
  own genuine work-in-progress predating this cycle; worth his own look, not something to act on
  automatically.
