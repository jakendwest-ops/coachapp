# Session Context

A quick-orientation snapshot for picking up work on CoachApp. **This is a manually-refreshed, point-in-time file, not a live feed.** For anything
time-sensitive run the `/hello-claude` skill: it reads the live docs and checks current state every session.

Snapshot date: 2026-10-05. The longer version of this file is archived verbatim:
[archive/session-context-2026-10-05.md](archive/session-context-2026-10-05.md).

## Project Summary

CoachApp is a solo-built (by Jake, a PT) vanilla-JS + Supabase web app for coaches to manage clients and build/assign/track workout programmes,
with coach/client/solo roles. See [vision.md](vision.md).

## Current Release Cycle

Last shipped: **`v2026.09.15`** (2026-10-04, live and verified: the check and deploy jobs green, the live files byte-identical to the tag). Before
it, `v2026.09.14`. Both await Jake's look on a phone. See [current-sprint.md](current-sprint.md).

RPE top-set autoregulation is live (since `v2026.09.13`): a coach marks set 1 as the top set with a prescribed RPE, the runner estimates a live
e1RM from the RTS chart, and backoff sets target a percentage of that. Spec and plan: [superpowers/specs/2026-09-29-rpe-top-set-autoregulation-design.md](superpowers/specs/2026-09-29-rpe-top-set-autoregulation-design.md),
[superpowers/plans/2026-09-29-rpe-top-set-autoregulation.md](superpowers/plans/2026-09-29-rpe-top-set-autoregulation.md).

**Test-harness facts (learned 2026-10-03):** the full suite takes 47-59 min and needs a 2 h Bash timeout; specs that click Sign out as the PT
revoke the shared saved login for the rest of the run, so a test that needs a live session must sign in for real; CI runs Node 22 while this
machine runs Node 24; "pushed" is not "deployed", so check `gh run list`.

## Current Priorities

- **Build from the release plans:** [superpowers/plans/2026-09-19-product-review-ranked-backlog-and-releases.md](superpowers/plans/2026-09-19-product-review-ranked-backlog-and-releases.md).
  R1, R2a/b/d and R4b are shipped; the rest is not started. Ownership work needs `multi-agent-review` before the commit.
- **What only Jake can unblock:** his phone check of `v2026.09.14`/`.15`; the Sign-out question ([row](bugs/2026-10-03-sign-out-ends-every-device-session.md));
  the plan's yes/no questions (photos, AMRAP/EMOM, pre-fill, whether week-structure edits should ask before changing clients' plans, a PR badge);
  the read-only `pg_policies` query that unblocks the solo-milestones fix; the ledger's confirmation backlog.
- GDPR consent capture is closer to done than its row says: see [roadmap.md](roadmap.md).

## Active Risks

- **Session root:** CoachApp's CLAUDE.md, skills, hooks and memory load only in a session rooted in this repo; a Vault-rooted one ran CoachApp for 16
  days with none of them. `session-root-guard.mjs`, three `os-lint` checks and `CLAUDE.md` now cover it ([decisions.md](decisions.md), 2026-10-05); the
  [bug row](bugs/2026-10-05-coachapp-session-ran-in-the-vault-folder-for-16-days.md) closes on Jake's check.
- 1 deferred **critical** bug: GDPR consent capture (deferred 2026-08-19; 5 of 6 steps shipped since, see [roadmap.md](roadmap.md)).
- A push runs no browser tests (since 2026-09-27); only the release's full suite does. See `CLAUDE.md` and [technical-debt.md](technical-debt.md).
- Screens that read growing tables through the API's silent 200-row cap: the known ones are fixed and `checks.sh` rule 9n pins the rest
  ([technical-debt.md](technical-debt.md)); a workout save that is not retry-safe is also named there.

## Technical Debt Summary

Bug counts live in [backlog.md](backlog.md); pattern analysis in [technical-debt.md](technical-debt.md); not repeated here.

## Immediate Next Actions

1. Jake's phone check of `v2026.09.14`/`.15`, and his call on Sign out (end only this device's session?). No app code is waiting to be released.
2. Read the release plan's "START HERE", answer its questions, then start the next unbuilt release.
3. Housekeeping still open: the ungraded-prediction backlog and duplicate ids ([technical-debt.md](technical-debt.md)).
4. Start the next session on this repo's folder (not the Vision OS one) and let `/hello-claude` run; confirm the guard per the
   [bug row](bugs/2026-10-05-coachapp-session-ran-in-the-vault-folder-for-16-days.md).

## Important Reference Documents

- `CLAUDE.md` (repo root) — stack constraints and rules that must not break; `README.md` — the front page of the GitHub repo
- [vision.md](vision.md), [roadmap.md](roadmap.md), [architecture.md](architecture.md), [schema.md](schema.md), [decisions.md](decisions.md),
  [technical-debt.md](technical-debt.md), [backlog.md](backlog.md), [current-sprint.md](current-sprint.md), [handover.md](handover.md)
- `docs/releases/*.md` — per-release notes; `docs/superpowers/plans/` — dated implementation plans; `docs/archive/` — verbatim history
- **Not the Vault.** This repo is the system of record; the Vault's old CoachApp copy is archived and must not be read as current.

## Requires Validation

This entire file is a manually-refreshed snapshot with no auto-refresh mechanism; the "Snapshot date" line is its only freshness guarantee.
