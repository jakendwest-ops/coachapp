# Current Release Cycle

**Note on the filename:** this file is named `current-sprint.md` by request, but CoachApp does not
run sprints — it runs on a **tag-gated release cycle** (`docs/releases/*.md`, `scripts/release.mjs`,
[decisions.md](decisions.md)). Everything below describes that cycle.

**Snapshot taken:** 2026-10-04, just after the `v2026.09.14` release, from `git status`, `git log`, `git tag -l`, `gh run list` and
`docs/releases/`. A point-in-time snapshot — re-run those commands rather than trusting this file for anything time-sensitive.

## Last shipped (tagged + deployed)

**`v2026.09.14`**, cut 2026-10-04 — **live, verified on the live site** (GitHub run 37201615309: the check and the deploy job both green;
the index serves the new versions and the six changed files it serves are byte-identical to the tag). It is Jake's "push/deploy" of
17 commits: the shared exercise stats card (the runner's Stats sheet and the My progress exercise cards are one component, one set of
maths), the top-set exercise taking no ghost text from last session, the dashboard rework (one landing-page skeleton for the personal,
coached-client and coach dashboards), his 2026-10-04 items 1-3 (My progress cards fold up, with Collapse all / Expand all; the
Workouts "Up next" card names the next workout and points at the right one, with program weeks counted Monday to Sunday like the
calendar; the Last time panel shows the top set), the earlier test-login / sign-out fixes, `release.mjs` waiting for GitHub's check
before it pushes a tag, and the eight follow-up fixes from the pre-push `multi-agent-review` (coach "Programs ending" date, Today-card
names, inert cards under "view as client", "No more sessions are set up yet", fold-up bookkeeping). Full suite **1056 passed / 0 failed /
1 flaky / 4 skipped (45.0m)**; the flaky one is `progress-trend.spec.js:5` (the resting-HR chart on the Body tab: a fixed one-second
sleep before counting the chart; it passed on retry; nothing in this release touches that tab - carried in
[technical-debt.md](technical-debt.md)). Detail: [releases/v2026.09.14.md](releases/v2026.09.14.md). Everything in it still awaits
Jake's look on a phone (the rows in [bugs/](bugs/): stats, ghost text, dashboard, fold-up, Up next, Last time).

**`v2026.09.13`**, cut 2026-10-03 — live. It carries everything in `v2026.09.12` plus the CI fix that let it deploy: **`v2026.09.12` was
tagged and pushed on 2026-10-03 but NEVER deployed**, because GitHub's code-quality check failed on a Node-22-only failure in
`scripts/check-preview-server.selftest.mjs` (CI runs Node 22, the dev machine Node 24) and the deploy job needs that check. Content:
RPE top-set autoregulation, the runner's third and fourth walkthrough rounds, the client failed-save rollback, the Goals permissions
change, session-expired guards, Personal Bests as the one page for all personal records, and the second 2026-09-28 note's six items.
Detail: [releases/v2026.09.13.md](releases/v2026.09.13.md) and [releases/v2026.09.12.md](releases/v2026.09.12.md) (the content record).

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

## In flight

**Released and live as `v2026.09.15` (2026-10-04, about 23:17 BST; the live files are byte-identical to the tag): items 4 and 5 of Jake's
2026-10-04 note**, awaiting his look on a phone - the program-page rework (an
overview, fold-up phase cards, slim day rows, the occasional controls behind ⋯ sheets) and an RPE method for periodization (a
"% of 1RM | RPE" switch in the dialog, one method per phase; RPE steps the effort target of the Week-1 sets that have one, RIR
converting). Approved by Jake on 2026-10-04 after a prototype. 73 new unit tests, 42 new browser tests, 96 deliberate breakages each
caught, the full suite 1098 passed / 0 failed / 1 flaky (a local throwaway probe) / 4 skipped, `checks.sh` green, screenshots read at 480, 320
and 1280 px; two `multi-agent-review` rounds (no blocking finding; 15 smaller points: 11 fixed, 4 carried) are recorded in
[decisions.md](decisions.md). Jake noticed on 2026-10-04 that they were not on
the live site yet (correct at the time: the live site was `v2026.09.14`); he then said "finish your work and push/deploy". Rows:
[program page](bugs/2026-10-04-program-page-needs-a-ui-rework.md), [periodization](bugs/2026-10-04-periodization-has-no-rpe-method.md),
and one more: the Undulating tiers' Reps boxes were saved but never applied
([row](bugs/2026-10-04-undulating-tier-reps-are-saved-but-never-applied.md)). Jake answered both open questions that came with the build
("remove and open current phase"), and both are built into the same release: the Reps boxes are removed, and a program opens on the phase
the viewer's own plan is in (weeks counted Monday to Sunday, the same rule as the dashboard tile, which now shares one function with the
page), marked "Now".
Open questions waiting on Jake: whether the app's **Sign out should end only this device's session** (today it ends every one - see
[the open row](bugs/2026-10-03-sign-out-ends-every-device-session.md)); whether to build the Up next slot-matching rule (my
recommendation: leave it); naming ("Biggest set", "View program").

## Next: the release plans

A four-area product review (2026-09-19) produced a ranked 20-item backlog and detailed plans for five small
releases; R1, R2a and R2b are done (shipped across v2026.09.7-v2026.09.9), the rest not started:
[superpowers/plans/2026-09-19-product-review-ranked-backlog-and-releases.md](superpowers/plans/2026-09-19-product-review-ranked-backlog-and-releases.md).

## Requires Validation

- Everything above reflects `git`/filesystem state at 2026-10-04. Re-run `git status`, `git tag -l`, `gh run list`
  and check `docs/releases/` for anything newer before relying on this file. "Pushed" is not "deployed": confirm
  the deploy job in `gh run list`.
- The Stats sheet (v2026.09.11) and the weekday day list have not been checked against Jake's real workout
  history or a real assigned program — both were tested against stubbed/mock data. See
  [releases/v2026.09.11.md](releases/v2026.09.11.md)'s Verification section.
- Two of Jake's own git stashes (a worktree's `stash@{0}` and `master`'s `stash@{1}` at `7aeb3ae`), found
  untouched 2026-09-17 and deliberately left alone, were not re-checked this session.
