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

**2026-10-28 — Beeps stay, and the sound engine is rebuilt after the page is hidden.** Jake's gym use showed the beeps die for good once Safari is left (measured twice on his iPhone: the engine's clock stops while it still says "running" or "interrupted"; `resume()` does nothing, a new engine works). Voices never had this (speech does not use that engine) but pause Spotify on every cue, the original bug; Jake chose beeps ("fix using beeps"). `_unlockAudio` replaces a stale, closed, interrupted or clock-frozen engine at the next tap, a tap anywhere in the runner counts, and the rest timer never rebuilds. Known gap: a rest already running when he switches away stays silent until his first touch of the screen; a "Tap to turn beeps back on" prompt waits for his go-ahead.

**2026-10-25** — three SQL scripts applied (a guard so a coach cannot link a row to another coach's client; every `anon` privilege revoked, so signed-out requests answer 401; two `search_path` pins), the Security Advisor read (5 by design, 2 fixed, 1 not on this plan), `invite-client`'s source committed. And the runner never speaks: timer cues are tones, because any `speechSynthesis` call stops Spotify on iOS 18. Archived verbatim:
[archive/decisions-2026-10-25-security-and-runner.md](archive/decisions-2026-10-25-security-and-runner.md).

**2026-10-18** — the data-leak and PII audit: five push gates (`check-secrets`, `check-sql-definer`, `check-external-surface`, `check-pii-logs`, `check-query-scope`), each mutation-tested (129 of 129); two unanchored reads fixed. Archived verbatim:
[archive/decisions-2026-10-18-data-leak-audit.md](archive/decisions-2026-10-18-data-leak-audit.md).

**2026-10-12 to 2026-10-17** — the Personal account's Workouts page (the plan first, "Create a workout", a search, Edit in place, a plan lock) and "Programs" renamed "Training plans" everywhere they are read (one plan at a time for a solo account). Archived verbatim:
[archive/decisions-2026-10-12-to-2026-10-17-workouts-page.md](archive/decisions-2026-10-12-to-2026-10-17-workouts-page.md).

**2026-10-11** — CI pins Node 24 like the dev machine; `node scripts/verify-live.mjs <tag>` checks a release byte for byte; `savePeriodizationConfig` row-checks its writes. Archived verbatim:
[archive/decisions-2026-10-11-node24-live-check-row-checks.md](archive/decisions-2026-10-11-node24-live-check-row-checks.md).

**2026-10-05 — The Vault severing was verified on files and never on the session's folder: a desktop session rooted in the Vault ran CoachApp for 16 days. Fixed at the root, and made to refuse** (a SessionStart guard, three `os-lint` checks, one merged memory folder, CLAUDE.md saying the ROOT must be the repo). The summary that stood here, verbatim: [archive/decisions-2026-10-05-vault-rooted-summary.md](archive/decisions-2026-10-05-vault-rooted-summary.md); the full entry: [archive/decisions-2026-10-05-vault-rooted-session.md](archive/decisions-2026-10-05-vault-rooted-session.md).

**2026-10-05 (docs budget)** — the four red `os-lint` checks (`docs-budget`, `context-budget`, `ritual-budget`, `doc-obligations`) cleared by moving detail into `docs/archive/` verbatim,
never by raising a ceiling; each budget then re-pins to its new size, so headroom is always about 2% and older entries must be archived as they age. Full entry:
[archive/decisions-2026-10-05-docs-budget-trim.md](archive/decisions-2026-10-05-docs-budget-trim.md).

**2026-09-26 to 2026-10-04** — archived verbatim in
[archive/decisions-2026-09-26-to-2026-10-04.md](archive/decisions-2026-09-26-to-2026-10-04.md). It holds: the program-page rework and RPE periodization, the
pre-push review as a hard gate in `release.mjs`, a release tag pushed only after GitHub's check is green, a push running static checks only, the
transactional `assign_program()`, the 2026-09-27 operating-system cut-back, and the `clients.coach_id` re-point trigger.

---

**2026-09-19 to 2026-09-21** — the unbounded-reads ratchet, local SQL execution (PGlite), paged reads of growing tables,
automatic error capture and the feedback link, deleting the Benchmarks tab — archived verbatim in
[archive/decisions-2026-09-19-to-2026-09-21.md](archive/decisions-2026-09-19-to-2026-09-21.md).

**Older entries (2026-09-15 to 2026-09-18)** — the repo becoming the system of record, the full Vault severing,
predictions moving into the repo, ritual markers, and the OS retrospective — are archived verbatim in
[archive/decisions-2026-09-15-to-2026-09-18.md](archive/decisions-2026-09-15-to-2026-09-18.md).
