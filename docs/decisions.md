# Decisions

A flat, append-only, reverse-chronological log of significant, hard-to-reverse choices and why they
were made. New entries go at the top. No numbering, no per-decision files — see
[architecture.md](architecture.md) for the resulting shape, not the reasoning.

**Migrated 2026-09-15** from the Vault's `STATUS.md` "Continuity block" — ~40 dated, code-specific
engineering lessons. Most are too granular/line-specific to be "decisions" in this file's sense and
would go stale as the code changes; they're preserved in full, unedited, at
[archive/status-continuity-2026-09-08.md](archive/status-continuity-2026-09-08.md). The 5 genuinely
process-level entries below were pulled out and belong here.

---

**2026-10-12 — "Programs" are now "Training plans" everywhere they are read; a solo account is on one plan at a time; the Workouts page is for workouts made and used.**
Jake, from a prototype and clickable questions. *Words:* every visible "program/programme" became "training plan" (nav, headings, buttons, dialogs, toasts, coach screens); code names, tables,
ids and routes keep "program". *One plan at a time (solo):* adding a plan takes the other off (assign first, remove second; a failed removal warns and leaves both); "Remove from my plan" keeps every
logged session, drops the upcoming ones, and the plan stays in Training plans. A coach gets the same wording for a client. *Workouts page (solo only):* start buttons, "Up next" while a plan is on,
the plan folded away, "Your workouts" (made and used; a plan session joins once done), Recent sessions. "Start an empty workout" starts blank; "Save as a workout" on the finish screen is the only way
a session becomes reusable, and only when tapped. Not chosen: saving every session automatically; two plans at once. A coached client's page is unchanged.

**2026-10-11 — CI runs Node 24 like the dev machine, a release is checked live by script, and a database write that can be refused silently is row-checked.**
Jake approved three tooling fixes from his board ("approved"). *Node:* `deploy.yml` pinned 22 while this machine runs 24, which cost `v2026.09.12` its deploy; it now pins 24
(not chosen: pinning the machine down to 22, since everything is verified on 24; no `.nvmrc` or `engines` added, and `checks.sh` still prints a `[note]` if the two ever differ).
*Live check:* `node scripts/verify-live.mjs <tag>` compares every file the app loads with the tag, byte for byte, retrying while Pages catches up (exit 0 identical, 1 differs,
2 could not check); its self-test runs on every push (`checks.sh` 9t) and eight deliberate breakages each turn it red. *Silent refusals:* `savePeriodizationConfig` now row-checks each
tier write and the phase write (row-level security answers a refused UPDATE with 200 and no rows) and anchors the tier write on the verified phase, which closes the 2026-09-06 row.
*Found by the pre-push review:* a self-test that runs git in a temp folder inherits `GIT_DIR` from a pre-push hook run in a LINKED worktree and then commits to the real repo (reproduced);
the `verify-live` and `bump-versions` self-tests now strip `GIT_*`, and three release-only ones are named in `technical-debt.md`. The reviewers saw the version before the last fixes (the
anchor, the phase-row check, the self-test hardening): those are covered by tests and by deliberate breakage, not by a second review.

**2026-10-05 — The Vault severing was verified on files and never on the session's folder: a desktop session rooted in the Vault ran CoachApp for 16 days. Fixed at the root, and made to refuse** (a SessionStart guard, three `os-lint` checks, one merged memory folder, CLAUDE.md saying the ROOT must be the repo). The summary that stood here, verbatim: [archive/decisions-2026-10-05-vault-rooted-summary.md](archive/decisions-2026-10-05-vault-rooted-summary.md); the full entry: [archive/decisions-2026-10-05-vault-rooted-session.md](archive/decisions-2026-10-05-vault-rooted-session.md).

**2026-10-05 (docs budget)** — the four red `os-lint` checks (`docs-budget`, `context-budget`, `ritual-budget`, `doc-obligations`) cleared by moving detail into `docs/archive/` verbatim,
never by raising a ceiling; each budget then re-pins to its new size, so headroom is always about 2% and older entries must be archived as they age. Full entry:
[archive/decisions-2026-10-05-docs-budget-trim.md](archive/decisions-2026-10-05-docs-budget-trim.md).

**2026-09-26 to 2026-10-04** — archived verbatim in
[archive/decisions-2026-09-26-to-2026-10-04.md](archive/decisions-2026-09-26-to-2026-10-04.md). It holds: the program page as an overview plus
fold-up phases and the RPE method for periodization (and Jake's two answers: remove the Undulating Reps boxes, open the current phase); the
pre-push multi-agent review as a hard gate in `release.mjs`; "Up next", Monday-to-Sunday program weeks, the Last time top set and fold-up
progress cards; the one-skeleton dashboard; the shared exercise stats card and the no-ghost-text rule for RPE top sets; a release tag pushed
only after GitHub's check is green; hooks and dev servers that resolve the tree they run in; the runner's "log-first" layout and "Next goes to
what is still to do"; a push running static checks only; the transactional `assign_program()` shape; the 2026-09-27 operating-system cut-back;
CI no longer running browser tests; and a client being allowed to detach but not to re-point `clients.coach_id` (a trigger).

---

**2026-09-19 to 2026-09-21** — the unbounded-reads ratchet, local SQL execution (PGlite), paged reads of growing tables,
automatic error capture and the feedback link, deleting the Benchmarks tab — archived verbatim in
[archive/decisions-2026-09-19-to-2026-09-21.md](archive/decisions-2026-09-19-to-2026-09-21.md).

**Older entries (2026-09-15 to 2026-09-18)** — the repo becoming the system of record, the full Vault severing,
predictions moving into the repo, ritual markers, and the OS retrospective — are archived verbatim in
[archive/decisions-2026-09-15-to-2026-09-18.md](archive/decisions-2026-09-15-to-2026-09-18.md).
