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

## From `docs/roadmap.md` ("Current priorities", the first bullet, after v2026.10.8 shipped; the rows it points at carry the detail)

- **Awaiting Jake's look on a phone:** every release from `v2026.09.14` to `v2026.10.7` (Training plans, the Workouts page, the Goals tab, the new exercise builder) — the one-skeleton dashboard (D1, built from the prototype he
  approved; the coach page is logged-only until a database view exists, [row](bugs/2026-10-03-dashboard-needs-a-mobile-rework-as-a-landing-page.md)),
  the shared exercise stats card, My progress fold-ups, the "Up next" card, the Last time top set, the program-page rework and the RPE method for
  periodization. The rows are the `fixed-awaiting-jake` files in [bugs/](bugs/).
- **Waiting on Jake:** beeps with no extra tap (his sound test, [row](bugs/2026-10-28-runner-beeps-worked-for-two-exercises-then-were-never-heard-again.md)); dark mode as the default ([row](bugs/2026-10-28-dark-mode-should-be-the-default-across-the-app.md)).

## From `docs/technical-debt.md` ("Test-gate coverage debt"; fixed and ratcheted, so no longer debt)

**Specs that build "today" from the UTC date**: fixed 2026-10-17, with the app itself (48 uses in 24 spec files now use `toLocaleDateString('en-CA')`). The 8 left are UTC calendar arithmetic on a fixed base and stay; `scripts/count-baseline.json` pins both counts, so none can come back.

## Second pass, 2026-10-29 (the /save after v2026.10.8): moved verbatim to make room for the unreleased current-plan work in the sprint note

### From `docs/session-context.md` ("Current Release Cycle")

Last shipped: **`v2026.10.8`** (2026-10-29, live, verified byte-identical to the tag), after `v2026.10.7`, `v2026.10.6`, `v2026.10.5`, `v2026.10.4`, `v2026.10.3`,
`v2026.10.2`, `v2026.10.1`, `.09.15` and `.09.14`. All ten await Jake's look on a phone. See [current-sprint.md](current-sprint.md).

RPE top-set autoregulation is live (since `v2026.09.13`): a coach marks set 1 as the top set with a prescribed RPE, the runner estimates a live
e1RM from the RTS chart, and backoff sets target a percentage of that. Spec and plan: [superpowers/specs/2026-09-29-rpe-top-set-autoregulation-design.md](superpowers/specs/2026-09-29-rpe-top-set-autoregulation-design.md),
[superpowers/plans/2026-09-29-rpe-top-set-autoregulation.md](superpowers/plans/2026-09-29-rpe-top-set-autoregulation.md).

**Test-harness facts:** the full suite takes about an hour (CLAUDE.md has the timeout); a spec that clicks Sign out revokes the shared saved login for the rest of the
run; "pushed" is not "deployed": `gh run list`, then `node scripts/verify-live.mjs <tag>`.

### From `docs/session-context.md` ("Current Priorities", a bullet that repeated the Active Risks entry)

- GDPR consent capture is closer to done than its row says: see [roadmap.md](roadmap.md).

### From `docs/session-context.md` ("Important Reference Documents")

- [vision.md](vision.md), [roadmap.md](roadmap.md), [architecture.md](architecture.md), [schema.md](schema.md), [decisions.md](decisions.md),
  [technical-debt.md](technical-debt.md), [backlog.md](backlog.md), [current-sprint.md](current-sprint.md), [handover.md](handover.md)

### From `docs/roadmap.md` ("Current priorities"; replaced when Jake overrode the deferral on 2026-10-29)

- **Roster-size features deferred (Jake, 2026-09-26: no clients yet):** client-list search/filter/sort (R2c), the "Needs attention" list (R3c),
  invite state, the programme-and-week row on the client list. Not to be built speculatively; they need a session with a real roster.

### From `docs/current-sprint.md` ("Next: the release plans"; the same plan is already linked from roadmap.md's "The release plans" bullet)

## Next: the release plans

R1, R2a, R2b, R2d and R4b are done (shipped across `v2026.09.7`-`v2026.09.9`); the rest is not started:
[superpowers/plans/2026-09-19-product-review-ranked-backlog-and-releases.md](superpowers/plans/2026-09-19-product-review-ranked-backlog-and-releases.md).
