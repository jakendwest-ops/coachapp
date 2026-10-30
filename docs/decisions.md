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

**2026-10-30** — the runner's next-session target is DROPPED for now (Jake, after a prototype): last time's grey text already shows weight and reps, so a target only repeats it. It came from the product review, not from real use; rebuild only if Jake finds himself unsure what to lift, then as a bare "↑ +2.5 kg" signal ([plan](superpowers/plans/2026-10-29-solo-product-review.md)).

**2026-10-29** — check-ins get a coach review: UPDATE narrowed to 3 columns, server-stamped, never pre-filled on insert ([row](bugs/2026-10-29-client-check-ins-get-no-response.md)).

## 2026-10-29 - Type-check the classic scripts before any move to ES modules

**Decided (Jake approved the plan, 2026-10-29):** every push runs `tsc` over the nine `js/` files as the browser loads them (classic scripts, one global, `index.html` order, nothing emitted), and `scripts/check-types.mjs` fails if any file's error count rises above `scripts/type-baseline.json`. `db` is typed against `types/database.d.ts`, generated from the live schema, so a wrong column name blocks the push (mutation-checked: `.eq('coach_idd', …)` is caught). **Why:** asked whether the stack was right, the answer was yes; the costs were the shared global and no types. Measurement then put types first: ES modules hit ~500 inline `onclick` handlers needing `window` globals, 173 of 179 specs reaching into globals, strict mode, and load order, while types need no runtime change at all. **Why a ratchet, not zero:** 994 errors on day one, mostly harmless; requiring zero would mean no gate for weeks. The gate refuses runs it cannot trust (a canary file with exactly one error, `@ts-nocheck` refused, `@ts-ignore` counted). **Rejected:** TypeScript source (a build step); ES modules first. Modules are a later decision, plan: [superpowers/plans/2026-10-29-type-check-then-modules.md](superpowers/plans/2026-10-29-type-check-then-modules.md) (Phase 2, recommending splitting the big files as classic scripts).

**2026-10-29** — coach work starts, for a 25-client roster (overrides the 2026-09-26 roster deferral); a client's current plan is the most recently STARTED one, never the newest-assigned. Archived verbatim:
[archive/decisions-2026-10-29-coach-current-plan.md](archive/decisions-2026-10-29-coach-current-plan.md).

## 2026-10-29 - The old wiki is dead to CoachApp too

**Decided (Jake, 2026-10-29):** everything lives in the GitHub repo and nowhere else. **Why it was missed:** no repo file ever said so. On 2026-09-20 Jake asked "confirm if wiki is vault or repo"; I answered "a third, separate location" and the rituals kept using it (`save` Step 7, `hello-claude` Step 6, a memory note) until a `/save` wrote to it on 2026-10-29. **Done:** Step 7 retired, Step 6 starts from `docs/current-sprint.md`, memory rewritten, a `CLAUDE.md` table row, and `os-lint` warns on a pointer to it. Scope: CoachApp only; the wiki's other content is Jake's call. **Rejected:** a mirror "in case" (two places disagree).

**2026-10-28** — the exercise builder is rebuilt around set groups with a third "% of" choice (`intensityBasis: 'topSetWeight'`, the old `'topSet'` keeping its meaning of today's estimated 1RM), and the runner's beeps are rebuilt after the page is hidden (Jake: "fix using beeps"). Archived verbatim:
[archive/decisions-2026-10-28-builder-and-beeps.md](archive/decisions-2026-10-28-builder-and-beeps.md).

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
