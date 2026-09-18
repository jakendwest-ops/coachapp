# Session Context

A quick-orientation snapshot for picking up work on CoachApp. **This is a manually-refreshed,
point-in-time file, not a live feed.** For anything time-sensitive, run the `/hello-claude` skill
instead — it pulls current state from the Vault every session. This file is for a fast read when
that ritual hasn't been run, or for a non-Claude-Code reader.

Snapshot date: 2026-09-15.

## Project Summary

CoachApp is a solo-built (by Jake, a PT) vanilla-JS + Supabase web app for coaches to manage clients
and build/assign/track workout programmes, with coach/client/solo roles. See
[vision.md](vision.md).

## Current Release Cycle

Last shipped: `v2026.09.5` (2026-09-11). A `v2026.09.6` release note exists but is not yet
committed or tagged — the work in flight is stabilizing a template-builder staged-draft rewrite.
See [current-sprint.md](current-sprint.md).

## Current Priorities

- Stabilizing the just-merged template-builder rewrite (active, per recent commits)
- Bug themes concentrated in RLS/ownership and data-integrity issues suggest an ongoing hardening
  phase — inferred, not a stated priority
- GDPR export completeness (profile section missing) remains open; consent capture is closer to
  done than the ledger status implies — see [roadmap.md](roadmap.md)'s correction

See [roadmap.md](roadmap.md) for detail and confidence levels.

## Active Risks

- 1 deferred **critical** bug: GDPR consent capture (deferred 2026-08-19, but 5 of 6 steps have
  since shipped — see [roadmap.md](roadmap.md))
- Pre-push test gate covers only 2 of 105 spec files — most RLS/ownership specs aren't gated on push
- No canonical database schema document — only 20 ordered migration files

See [technical-debt.md](technical-debt.md).

## Technical Debt Summary

43 open bugs, 1 deferred critical (GDPR consent capture). Full counts and analysis:
[backlog.md](backlog.md) (owns the numbers) and [technical-debt.md](technical-debt.md) (owns the
pattern analysis) — not repeated here to avoid a third copy that can drift out of sync.

## Immediate Next Actions

See [technical-debt.md](technical-debt.md)'s "Process/tracking debt" section for the current
OS-LINT snapshot (full-file-review status, ungraded predictions, deploy-check gate trace) — owned
there, not repeated here.

## Important Reference Documents

- `CLAUDE.md` (repo root) — stack constraints and rules that must not break
- [vision.md](vision.md), [roadmap.md](roadmap.md), [architecture.md](architecture.md),
  [decisions.md](decisions.md), [technical-debt.md](technical-debt.md), [backlog.md](backlog.md),
  [current-sprint.md](current-sprint.md), [handover.md](handover.md)
- `docs/releases/*.md` — per-release notes, existing and current
- **Not the Vault.** This repo (`docs/*.md`, `docs/bugs/`) has been the fuller live record since
  2026-09-15 — the Vault's old copy (`Vault\projects\CoachApp\`) was archived to
  `Vault\projects\_archive\CoachApp\` on 2026-09-18 specifically so nothing would read it as current
- `/hello-claude` skill — the live session-start ritual; run this, not this file, for anything
  current-as-of-right-now

## Requires Validation

This entire file is a manually-refreshed snapshot with no auto-refresh mechanism. Every section
above will drift; the "Snapshot date" line is the only guarantee of freshness this file offers.
