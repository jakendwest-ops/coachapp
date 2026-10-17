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

**2026-10-17 — The Personal account's Workouts page: the plan first, "Create a workout" with two choices, a search, Edit in place, and a plan lock.**
Jake, from a prototype and a clickable plan ("Approved - build"). *Create a workout:* Choose a template (My workouts saves a copy; Past sessions saves a workout of that session's exercises) or Create new (a name, then the existing editor);
both SAVE at once. "Train now" stays as a small link for a blank live session; "Start from a past session" is gone. *The lock:* a workout in the plan the account is on NOW has no Edit (it names the plan and
offers "Open in Training plans"; Make a copy still works); a plan that has run its course or been removed unlocks its workouts. *Not chosen:* ready-made starter workouts as templates; locking by workout name.
*Left for Phase 2:* the PT page (a Client filter, search and paging on the server), the Library page, and one shared code path for both roles. Known limits are in the ledger row.

**2026-10-12 — "Programs" are now "Training plans" everywhere they are read; a solo account is on one plan at a time; the Workouts page is for workouts made and used.**
Jake, from a prototype and clickable questions. *Words:* every visible "program/programme" became "training plan" (nav, headings, buttons, dialogs, toasts, coach screens); code names, tables,
ids and routes keep "program". *One plan at a time (solo):* adding a plan takes the other off (assign first, remove second; a failed removal warns and leaves both); "Remove from my plan" keeps every
logged session, drops the upcoming ones, and the plan stays in Training plans. A coach gets the same wording for a client. *Workouts page (solo only):* start buttons, "Up next" while a plan is on,
the plan folded away, "Your workouts" (made and used; a plan session joins once done), Recent sessions. "Start an empty workout" starts blank; "Save as a workout" on the finish screen is the only way
a session becomes reusable, and only when tapped. Not chosen: saving every session automatically; two plans at once. A coached client's page is unchanged.

**2026-10-11** — CI pins Node 24 like the dev machine; `node scripts/verify-live.mjs <tag>` checks a release byte for byte; `savePeriodizationConfig` row-checks its writes. Archived verbatim:
[archive/decisions-2026-10-11-node24-live-check-row-checks.md](archive/decisions-2026-10-11-node24-live-check-row-checks.md).

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
