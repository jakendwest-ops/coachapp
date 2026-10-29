# Session Context

A quick-orientation snapshot for picking up work on CoachApp. **This is a manually-refreshed, point-in-time file, not a live feed.** For anything
time-sensitive run the `/hello-claude` skill: it reads the live docs and checks current state every session.

Snapshot date: 2026-10-29. The longer version of this file is archived verbatim:
[archive/session-context-2026-10-05.md](archive/session-context-2026-10-05.md).

## Project Summary

CoachApp is a solo-built (by Jake, a PT) vanilla-JS + Supabase web app for coaches to manage clients and build/assign/track workout programmes,
with coach/client/solo roles. See [vision.md](vision.md).

## Current Release Cycle

Last shipped: **`v2026.10.8`** (2026-10-29, live, verified byte-identical to the tag); every release since `v2026.09.14` awaits Jake's look on a phone.
Unreleased on master: the current training plan chosen by date, which needs one SQL run first. See [current-sprint.md](current-sprint.md).

RPE top-set autoregulation is live (since `v2026.09.13`); its spec and plan are the `2026-09-29-rpe-top-set-autoregulation*` files under `docs/superpowers/`.

**Test-harness fact:** a spec that clicks Sign out revokes the shared saved login for the rest of the run. (Suite length and the deploy check: `CLAUDE.md`.)

## Current Priorities

- **Build from the release plans:** [superpowers/plans/2026-09-19-product-review-ranked-backlog-and-releases.md](superpowers/plans/2026-09-19-product-review-ranked-backlog-and-releases.md).
  R1, R2a/b/d and R4b are shipped; the rest is not started. Ownership work needs `multi-agent-review` before the commit.
- **What only Jake can unblock:** the open questions listed under "Current priorities" in [roadmap.md](roadmap.md); the read-only `pg_policies` query that unblocks the solo-milestones fix.

## Active Risks

- **Session root:** CoachApp's CLAUDE.md, skills, hooks and memory load only in a session rooted in this repo; a Vault-rooted one ran CoachApp for 16
  days with none of them. `session-root-guard.mjs`, three `os-lint` checks and `CLAUDE.md` now cover it ([decisions.md](decisions.md), 2026-10-05); the
  [bug row](bugs/2026-10-05-coachapp-session-ran-in-the-vault-folder-for-16-days.md) closes on Jake's check.
- 1 deferred **critical** bug: GDPR consent capture (deferred 2026-08-19; 5 of 6 steps shipped since, see [roadmap.md](roadmap.md)).
- Screens that read growing tables through the API's silent 200-row cap: the known ones are fixed and `checks.sh` rule 9n pins the rest
  ([technical-debt.md](technical-debt.md)).

## Immediate Next Actions

1. Jake's phone check of every release since `v2026.09.14` and his answers to the open questions ([roadmap.md](roadmap.md), [current-sprint.md](current-sprint.md)).
2. Read the release plan's "START HERE", answer its questions, then start the next unbuilt release.
3. Housekeeping still open: the ungraded-prediction backlog and duplicate ids ([technical-debt.md](technical-debt.md)).
4. Start the next session on this repo's folder (not the Vision OS one) and let `/hello-claude` run; confirm the guard per the
   [bug row](bugs/2026-10-05-coachapp-session-ran-in-the-vault-folder-for-16-days.md).

## Important Reference Documents

- `CLAUDE.md` (repo root) — stack constraints and rules that must not break; `README.md` — the front page of the GitHub repo
- The live docs are the `docs/*.md` files; [handover.md](handover.md) says how they relate.
- `docs/releases/*.md` — per-release notes; `docs/superpowers/plans/` — dated implementation plans; `docs/archive/` — verbatim history
- **Not the Vault.** This repo is the system of record; the Vault's old CoachApp copy is archived and must not be read as current.

## Requires Validation

This entire file is a manually-refreshed snapshot with no auto-refresh mechanism; the "Snapshot date" line is its only freshness guarantee.
