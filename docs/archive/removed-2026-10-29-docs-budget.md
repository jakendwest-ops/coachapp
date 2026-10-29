# Moved verbatim on 2026-10-29 to bring `docs/*.md` back under the `os-lint` docs-budget

History only, not current instructions. The live files now point at `roadmap.md` / `current-sprint.md` instead of restating these.

## From `docs/session-context.md` ("Current Priorities")

- **What only Jake can unblock:** his phone check of `v2026.09.14`/`.15`; the Sign-out question ([row](bugs/2026-10-03-sign-out-ends-every-device-session.md));
  the plan's yes/no questions (photos, AMRAP/EMOM, pre-fill, whether week-structure edits should ask before changing clients' plans, a PR badge);
  the read-only `pg_policies` query that unblocks the solo-milestones fix; the ledger's confirmation backlog.

## From `docs/session-context.md` ("Immediate Next Actions", item 1; it was glued to item 2 with no line break)

1. Jake's phone check of `v2026.09.14` to `v2026.10.5` (the Streak tile and Weekly target, My Progress Body Weight and Personal Bests, Goals, the Workouts rework, the week buttons, the local-day dates), his answer on which
   session went missing in the "unscheduled day" row, and his call on Sign out (end only this device's session?).

## From `docs/session-context.md` (two pointers that only repeated `CLAUDE.md` and `technical-debt.md`)

- A push runs no browser tests (since 2026-09-27); only the release's full suite does. See `CLAUDE.md` and [technical-debt.md](technical-debt.md).

## Technical Debt Summary

Bug counts live in [backlog.md](backlog.md); pattern analysis in [technical-debt.md](technical-debt.md); not repeated here.

## From `docs/technical-debt.md` ("Test-gate coverage debt"; fixed and ratcheted, so no longer debt)

**Specs that build "today" from the UTC date**: fixed 2026-10-17, with the app itself (48 uses in 24 spec files now use `toLocaleDateString('en-CA')`). The 8 left are UTC calendar arithmetic on a fixed base and stay; `scripts/count-baseline.json` pins both counts, so none can come back.
