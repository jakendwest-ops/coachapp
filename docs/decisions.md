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

**2026-10-18 — The data-leak and PII audit, and five push gates.** Jake: "tighten the whole codebase so prevent any data leaks or PII leaks"; plan approved first. *Measured:* a signed-out caller reads 0 rows on all 25 queried tables; no service-role key in any commit; 0 PII in 366 log calls; CDN scripts pinned with integrity hashes.
*Weak:* the gates were narrower than the code (query scoping covered 3 of 25 tables; the PII-log gate read one line per call and had no self-test) and a script published test-account passwords.
*Decided:* each gate is calibrated on the real tree, pinned AT the measurement, and `scripts/mutate-gates.mjs` removes each listed safeguard from a copy and requires its self-test to fail (129 of 129): `check-secrets` (9u), `check-sql-definer` (9v), `check-external-surface` (9w), `check-pii-logs` (9a, widened), `check-query-scope` (2, 21 tables; an unanchored read needs a stated `SCOPE-OK`, capped at 1).
It found two unanchored reads, fixed with live specs: the coach's "Goals due soon" (a join) and the Personal calendar's `events`. Google Fonts is TEMPORARY on the allowlist; `invite-client` is a dated KNOWN_MISSING. *Not chosen:* a CSP first.

**2026-10-12 to 2026-10-17** — the Personal account's Workouts page (the plan first, "Create a workout", a search, Edit in place, a plan lock) and "Programs" renamed "Training plans" everywhere they are read (one plan at a time for a solo account). Archived verbatim:
[archive/decisions-2026-10-12-to-2026-10-17-workouts-page.md](archive/decisions-2026-10-12-to-2026-10-17-workouts-page.md).

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
