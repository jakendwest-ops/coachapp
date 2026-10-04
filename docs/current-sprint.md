# Current Release Cycle

**Note on the filename:** this file is named `current-sprint.md` by request, but CoachApp does not
run sprints — it runs on a **tag-gated release cycle** (`docs/releases/*.md`, `scripts/release.mjs`,
[decisions.md](decisions.md)). Everything below describes that cycle.

**Snapshot taken:** 2026-10-03, from `git status`, `git log`, `git tag -l`, `gh run list` and `docs/releases/`. A
point-in-time snapshot — re-run those commands rather than trusting this file for anything time-sensitive.

## Last shipped (tagged + deployed)

**`v2026.09.13`**, cut 2026-10-03 — **live, verified on the live site** (GitHub run 37112719334). It carries
everything in `v2026.09.12` plus the CI fix that let it deploy: **`v2026.09.12` was tagged and pushed on
2026-10-03 but NEVER deployed**, because GitHub's code-quality check failed on a Node-22-only failure in
`scripts/check-preview-server.selftest.mjs` (CI runs Node 22, the dev machine Node 24) and the deploy job needs
that check. Content, 51 commits since v2026.09.11: RPE top-set autoregulation (mark a top set, live estimated
1RM, backoff sets as a % of today's top set), the runner's third and fourth walkthrough rounds, the client
failed-save rollback (database migration applied by Jake 2026-10-01), the Goals permissions change (a client
can no longer add/edit/delete goals), session-expired guards on Personal Bests and calendar saves, Personal
Bests as the one page for all personal records, and the second 2026-09-28 note's six items. Full suite 971
passed / 0 failed / 0 flaky / 5 skipped (50.2m). Detail: [releases/v2026.09.13.md](releases/v2026.09.13.md)
and [releases/v2026.09.12.md](releases/v2026.09.12.md) (the content record).
Re-checked against the live site on 2026-10-03: GitHub's Pages deployment is the tag's commit (`103ac2f`) and all
11 files the site serves are byte-identical to the tag.

**On master after the tag, CI-green, NOT yet released** (4 commits, `c8d1cab`..`c9a8d0f`, plus 2 docs commits): the quarantined
`pb-consolidation` SOLO test is fixed and un-quarantined (root cause: the suite's sign-out specs revoke the
shared test login); saved test sessions are re-captured when older than 25 min; a previous set that is only an
effort rating no longer counts as "last session" (app-runner v110 — the only user-visible change); the
session-expired guards now also log the server's reason (app-progress v73, app-calendar-goals v29); `release.mjs --push` now waits for GitHub's check before pushing the tag; a few widened
test waits. Validated by a complete run: 974 passed / 0 failed / 1 flaky (the known `progress-trend`) / 4
skipped (44.2m). They ship with the next release — Jake's call when.

**Committed locally after that, NOT pushed (2026-10-03 to 04):** (1) `d6134e6` an RPE top-set exercise takes no ghost text
from last session (app-runner v111; 188 runner/RPE tests green) and `ab4fd78` its docs; (2) the shared exercise stats card - the
runner's Stats sheet and the My progress exercise cards are now one component with one set of maths and one read (app-progress
v74, app-runner v112, css v24): 28 new unit tests, 17 new browser tests, ten old tests ported, the 14 affected spec files plus
the new one green (211 tests), static checks pass. Both await Jake's look on a phone ([ghost-text row](bugs/2026-10-03-runner-top-set-exercise-shows-last-sessions-weight-as-ghost-text.md),
[stats row](bugs/2026-10-03-runner-stats-sheet-shows-less-than-my-progress-and-computes-est-1rm-differently.md)) and his say-so to
push; they were self-reviewed and then went through the pre-push `multi-agent-review` on 2026-10-04 (no blocking findings). (3) The dashboard rework
(2026-10-04): one landing-page skeleton for the personal, coached-client and coach dashboards (app-dashboard v29, css v25) -
32 unit tests, 29 new browser tests, 43 older tests ported or retired, the 21
dashboard-related spec files green (214 tests), static checks pass, five ratchet baselines lowered; also awaiting his look
([row](bugs/2026-10-03-dashboard-needs-a-mobile-rework-as-a-landing-page.md)) and reviewed 2026-10-04 by multi-agent-review (diff mode: security and tenant scoping, solo-mode correctness, duplicates and regressions, plus a verifier pass; no blocking findings, follow-ups in docs/decisions.md).
(4) Jake's 2026-10-04 note, items 1-3 (also awaiting his look, also reviewed 2026-10-04 by multi-agent-review (diff mode: security and tenant scoping, solo-mode correctness, duplicates and regressions, plus a verifier pass; no blocking findings, follow-ups in docs/decisions.md)): the Per-exercise list on
My progress folds up, with a Collapse all / Expand all button and charts only for open cards (app-progress v76, css v26); the Workouts
"Up next" card names the next workout and points at the right one - today's session while it is not logged, else the next planned -
with program weeks counted Monday to Sunday like the calendar (app-workouts v145, app-dashboard v30, app-calendar-goals v30); and
the Last time panel shows the top set (app-progress v75, app-runner v113). 43 new unit tests, 29 new browser tests, 27 deliberate
breakages each caught, the specs around each change green, static checks pass
([fold-up](bugs/2026-10-04-my-progress-exercise-cards-cannot-be-collapsed.md), [Up next](bugs/2026-10-04-workouts-up-next-card-does-not-name-the-workout.md),
[Last time](bugs/2026-10-04-runner-last-time-panel-shows-no-top-set.md)). Items 4-5 of that note (the program page; an RPE method
for periodization) are scoped, with a prototype up for his reaction ([program page](bugs/2026-10-04-program-page-needs-a-ui-rework.md),
[periodization](bugs/2026-10-04-periodization-has-no-rpe-method.md)); nothing of them is built.

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

Nothing from Jake's walkthroughs is outstanding. The six items of his second 2026-09-28 note are all built and
shipped in `v2026.09.13`'s content (template-builder buttons, interval countdown format, "My calendar" rename,
"My progress" tile, merged current-program strip, a Goals tab on Progress); his runner rounds of 2026-09-30 and
2026-10-01 (ghost text, the full-width prescription boxes under the tabs, "Exercise N of M" removed) are shipped too.
Open questions waiting on Jake: whether the app's **Sign out should end only this device's session** (today it ends
every one — see [the open row](bugs/2026-10-03-sign-out-ends-every-device-session.md));
and when to release the four follow-up commits above.

## Next: the release plans

A four-area product review (2026-09-19) produced a ranked 20-item backlog and detailed plans for five small
releases; R1, R2a and R2b are done (shipped across v2026.09.7-v2026.09.9), the rest not started:
[superpowers/plans/2026-09-19-product-review-ranked-backlog-and-releases.md](superpowers/plans/2026-09-19-product-review-ranked-backlog-and-releases.md).

## Requires Validation

- Everything above reflects `git`/filesystem state at 2026-10-03. Re-run `git status`, `git tag -l`, `gh run list`
  and check `docs/releases/` for anything newer before relying on this file. "Pushed" is not "deployed": confirm
  the deploy job in `gh run list`.
- The Stats sheet (v2026.09.11) and the weekday day list have not been checked against Jake's real workout
  history or a real assigned program — both were tested against stubbed/mock data. See
  [releases/v2026.09.11.md](releases/v2026.09.11.md)'s Verification section.
- Two of Jake's own git stashes (a worktree's `stash@{0}` and `master`'s `stash@{1}` at `7aeb3ae`), found
  untouched 2026-09-17 and deliberately left alone, were not re-checked this session.
