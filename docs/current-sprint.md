# Current Release Cycle

**Note on the filename:** this file is named `current-sprint.md` by request, but CoachApp does not
run sprints — it runs on a **tag-gated release cycle** (`docs/releases/*.md`, `scripts/release.mjs`,
[decisions.md](decisions.md)). Everything below describes that cycle.

**Snapshot taken:** 2026-09-20, from `git status`, `git log`, `git tag -l` and `docs/releases/`. A
point-in-time snapshot — re-run those commands rather than trusting this file for anything time-sensitive.

## Last shipped (tagged + deployed)

**`v2026.09.6`**, cut 2026-09-17 — the workout-template builder rebuilt from write-on-every-edit to a staged
draft with an explicit "Save workout", plus four smaller fixes. Three multi-agent review rounds each found real
bugs in the previous round's own fix; all were fixed. Full suite 675 passed / 0 failed / 0 flaky; deploy
confirmed live. Detail: [releases/v2026.09.6.md](releases/v2026.09.6.md).

## In flight, not yet shipped — three local commits on `master`, unpushed (Jake's choice), no release note

1. `7e32b72` — the Progress → Benchmarks tab deleted (Jake's call; [decisions.md](decisions.md) 2026-09-19).
2. `f0cd8e8` — the dashboard Benchmarks cards no longer pick the wrong "best" record (bug row closed on a
   red→green test).
3. `5419deb` — automatic error capture (`log.error` and global handlers → an `app_errors` table; the owner reads
   it in a Settings card) and a Send-feedback email link that stores nothing. Its SQL
   (`scripts/add-app-errors-2026-09-19.sql`) is **already run live**; the deployed app doesn't use the table until
   a release. Two independent reviewers found its rate limit evadable (a client could choose `created_at`) before
   it shipped — reproduced on the live table, fixed by a server-side trigger.

Not yet checked live: the owner's Error reports card on real data (no spec logs in as the owner). A release needs
the full `npm test`, a fresh `multi-agent-review` after the last commit, and `docs/releases/<version>.md`
(`scripts/release.mjs` refuses without them).

## Next: the release plans

A four-area product review (2026-09-19) produced a ranked 20-item backlog and detailed plans for five small
releases — **none built**:
[superpowers/plans/2026-09-19-product-review-ranked-backlog-and-releases.md](superpowers/plans/2026-09-19-product-review-ranked-backlog-and-releases.md).
Start at its "START HERE" section; R1 first.

## Recent commits (`git log --oneline -8`)

`5419deb`, `f0cd8e8`, `7e32b72` (above); `6610af2` docs(save) claude-config note; `9f6d831` feat(os): triage
digest, evidence-carrying ritual markers, checked Vault boundary; `79acded` chore: weekly health-check actions;
`a99ff90` chore: complete the Vault severing; `476e09a` chore: move the predictions ledger into this repo.

## Requires Validation

- Everything above reflects `git`/filesystem state at 2026-09-20. Re-run `git status`, `git tag -l`, and check
  `docs/releases/` for anything newer before relying on this file.
- Two of Jake's own git stashes (a worktree's `stash@{0}` and `master`'s `stash@{1}` at `7aeb3ae`) were found
  untouched on 2026-09-17 and deliberately left alone — never stash/pop on a shared tree; `stash@{1}` may be
  genuine work-in-progress worth Jake's own look. Not re-checked 2026-09-20.
