# Current Release Cycle

**Note on the filename:** this file is named `current-sprint.md` by request, but CoachApp does not
run sprints — it runs on a **tag-gated release cycle** (`docs/releases/*.md`, `scripts/release.mjs`,
[decisions.md](decisions.md)). Everything below describes that cycle.

**Snapshot taken:** 2026-09-28, from `git status`, `git log`, `git tag -l` and `docs/releases/`. A
point-in-time snapshot — re-run those commands rather than trusting this file for anything time-sensitive.

## Last shipped (tagged + deployed)

**`v2026.09.11`**, cut 2026-09-28 — the workout runner rebuilt around Jake's 8-item phone walkthrough: tabs
that show completion (green/purple, not position), "Next exercise" goes to what is still to do, no Back
button, full exercise names, the "log-first" layout (set table straight under the tabs, Swap/Add/Units
behind a "⋯" sheet), and a tappable "Last time → Stats" sheet with a progress chart. Two commits
(`a2365a3`, `657e912`), each reviewed by three fresh-context reviewers before it was committed, plus a
confirmatory review after the second round's fixes — no blockers at any stage. 881 passed / 0 failed / 1
flaky / 4 skipped (43.0m). Detail: [releases/v2026.09.11.md](releases/v2026.09.11.md).

Between v2026.09.6 and v2026.09.11, four more tags shipped (`v2026.09.7` duplicate-exercise propagation
fix + the whole product-review batch; `v2026.09.8`, `v2026.09.9`, `v2026.09.10` process/tooling and bug-row
work) — see their own notes in `docs/releases/`. This file no longer tracks that history; the release notes
are the record.

## In flight, not yet built

**Jake sent a second set of six items the same day (2026-09-28), after the runner walkthrough above.**
Not started:
1. Template builder: the Edit and Remove buttons are too big and squeeze the set text onto separate lines —
   [ledger row](bugs/2026-09-28-template-builder-edit-and-remove-buttons-squeeze-the-set-text.md). Needs
   Jake's call on icon buttons vs. a second row.
2. Interval editor "Initial countdown" should read `0:00` like its sibling fields —
   [ledger row](bugs/2026-09-28-interval-initial-countdown-is-the-only-time-field-not-in-0-00-format.md).
3. Solo dashboard, four changes, none designed yet: rename "Next up" to "My calendar"; replace the
   Benchmarks card with a "My progress" tile linking to the Progress page; merge the "Current program" strip
   with the next-session tile (they duplicate each other); and a `goals` page exists but is reachable only
   from a dashboard tile (not in navigation) — Jake has not yet said which fix he wants.

## Next: the release plans

A four-area product review (2026-09-19) produced a ranked 20-item backlog and detailed plans for five small
releases; R1, R2a and R2b are done (shipped across v2026.09.7-v2026.09.9), the rest not started:
[superpowers/plans/2026-09-19-product-review-ranked-backlog-and-releases.md](superpowers/plans/2026-09-19-product-review-ranked-backlog-and-releases.md).

## Recent commits (`git log --oneline -8`)

`c1c46d5` docs(release) v2026.09.11 notes, `657e912`/`a2365a3` runner rebuild (above), `8a0a631`/`5d8a432`
v2026.09.10 release, `b88ec86` waitForTimeout ratchet bump, `4d7fb9a` `backToGoals` comment correction,
`13b2699` error-rate row's first measurement.

## Requires Validation

- Everything above reflects `git`/filesystem state at 2026-09-28. Re-run `git status`, `git tag -l`, and
  check `docs/releases/` for anything newer before relying on this file.
- The Stats sheet (v2026.09.11) and the weekday day list have not been checked against Jake's real workout
  history or a real assigned program — both were tested against stubbed/mock data. See
  [releases/v2026.09.11.md](releases/v2026.09.11.md)'s Verification section.
- Two of Jake's own git stashes (a worktree's `stash@{0}` and `master`'s `stash@{1}` at `7aeb3ae`), found
  untouched 2026-09-17 and deliberately left alone, were not re-checked this session.
