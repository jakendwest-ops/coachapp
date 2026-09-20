# Session Context

A quick-orientation snapshot for picking up work on CoachApp. **This is a manually-refreshed,
point-in-time file, not a live feed.** For anything time-sensitive, run the `/hello-claude` skill
instead — it reads the repo's live docs and checks current state every session. This file is for a
fast read when that ritual hasn't been run, or for a non-Claude-Code reader.

Snapshot date: 2026-09-20.

## Project Summary

CoachApp is a solo-built (by Jake, a PT) vanilla-JS + Supabase web app for coaches to manage clients
and build/assign/track workout programmes, with coach/client/solo roles. See
[vision.md](vision.md).

## Current Release Cycle

Last shipped: `v2026.09.6` (2026-09-17, tagged and deployed). Three commits sit on `master` unpushed, by
Jake's choice — a deleted tab, a dashboard fix, and automatic error capture with a Send-feedback link. See
[current-sprint.md](current-sprint.md).

## Current Priorities

- **Build from the release plans, R1 first** —
  [superpowers/plans/2026-09-19-product-review-ranked-backlog-and-releases.md](superpowers/plans/2026-09-19-product-review-ranked-backlog-and-releases.md):
  a ranked 20-item backlog and red-first plans for five small releases, written 2026-09-19, **nothing built**.
  R1 = close the open HIGH programme rows, fix the inverted stress/soreness colours, runner wake lock.
- **What only Jake can unblock:** SQL to run when scripts exist (R2, R3), the plan's yes/no questions (photos,
  AMRAP/EMOM, pre-fill, whether week-structure edits should ask before changing clients' plans, a PR badge), an
  on-phone wake-lock check, and the ledger's confirmation backlog.
- GDPR consent capture is closer to done than the ledger status implies — see [roadmap.md](roadmap.md)'s
  correction.

## Active Risks

- 1 deferred **critical** bug: GDPR consent capture (deferred 2026-08-19, but 5 of 6 steps have since shipped —
  see [roadmap.md](roadmap.md)).
- The pre-push test gate is a smoke gate, not the suite — see `CLAUDE.md` and
  [technical-debt.md](technical-debt.md).
- Found 2026-09-19 by reading code: screens that read growing tables through the API's 200-row cap (cap **measured**
  2026-09-20; weight tabs, data export, personal-best reads and the runner's PR baseline fixed locally; the dashboard adherence
  panel and client list are not), and a workout save that is not retry-safe — [technical-debt.md](technical-debt.md).

## Technical Debt Summary

Bug counts live in [backlog.md](backlog.md); pattern analysis in [technical-debt.md](technical-debt.md) — not
repeated here so there is no third copy to drift.

## Immediate Next Actions

1. Decide whether to push the three local commits (a push runs the pre-push checks and publishes them; nothing
   deploys without a `v*` tag).
2. Read the plan's "START HERE", answer its questions, then start R1 at rank 1 (ownership work —
   `multi-agent-review` before that commit).
3. Housekeeping still open: the ungraded-prediction backlog and duplicate ids —
   [technical-debt.md](technical-debt.md).

## Important Reference Documents

- `CLAUDE.md` (repo root) — stack constraints and rules that must not break
- [vision.md](vision.md), [roadmap.md](roadmap.md), [architecture.md](architecture.md),
  [schema.md](schema.md), [decisions.md](decisions.md), [technical-debt.md](technical-debt.md),
  [backlog.md](backlog.md), [current-sprint.md](current-sprint.md), [handover.md](handover.md)
- `docs/releases/*.md` — per-release notes; `docs/superpowers/plans/` — dated implementation plans
- **Not the Vault.** This repo (`docs/*.md`, `docs/bugs/`) is the system of record since 2026-09-15; the Vault's
  old CoachApp copy is archived and must not be read as current
- `/hello-claude` skill — the live session-start ritual; run this, not this file, for anything
  current-as-of-right-now

## Requires Validation

This entire file is a manually-refreshed snapshot with no auto-refresh mechanism. Every section
above will drift; the "Snapshot date" line is the only guarantee of freshness this file offers.
