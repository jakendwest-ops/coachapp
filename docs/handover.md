# Handover

Written for a developer performing an independent review of CoachApp — enough to orient without
having lived in the codebase. Deeper detail lives in the linked documents; this file summarizes,
it doesn't duplicate.

Snapshot date: 2026-09-15.

## Product Overview

CoachApp is a web app for personal trainers to manage clients and build, assign, and track workout
programmes. Three roles: coach, client, and solo (a coach who is also their own client). Solo-built
by Jake, a working PT, who is also the app's primary user. See [vision.md](vision.md) for the fuller
picture and its confidence levels — no formal written vision document exists, so parts of that file
are inference, clearly marked.

## Current Status

Most recently *shipped* (tagged and deployed) release: `v2026.09.5`, cut 2026-09-11. A
`v2026.09.6` release note exists in `docs/releases/` but was not yet committed or tagged as of this
snapshot — see [current-sprint.md](current-sprint.md). `CLAUDE.md` states a beta target of 31 July
2026; this is possibly stale (flagged in [vision.md](vision.md), not confirmed).

## Major Features

- Auth + 3-role system (coach/client/solo) with role-aware routing and dashboards
- Client list/profiles; personal-best, weight, and check-in forms
- Programme builder: phases, periodization, assign/clone to clients
- Calendar mapped to assigned programmes; goals
- Workout template library/editor (recently rewritten to a staged-draft model with an explicit Save)
- In-gym workout runner: strength table + wizard, rest timer, session autosave/resume
- My Progress: body weight, personal bests, cardio, charts
- New-coach starter-content seeding (~40 exercises + a sample workout + programme)
- Privacy policy page + versioned consent tracking (partial GDPR — see Known Risks)
- Tag-gated release engineering with an automated preflight (`scripts/release.mjs`)

Module-level detail: [architecture.md](architecture.md).

## Architecture Summary

Plain ES6+ JavaScript, no build step, no framework, no TypeScript. Supabase (Postgres + RLS + Auth
+ Storage) backend, no ORM. 9 frontend modules totaling 17,599 lines (largest: `app-workouts`
3,639 lines, `app-runner` 3,476, `app-progress` 3,356, `app-programs` 2,821). Testing is Playwright
E2E only — 105 spec files, a narrow 2-file pre-push smoke gate, a single GitHub Actions workflow
that deploys only on a `v*` tag push. A hand-built `checks.sh` + `check-*.mjs` layer substitutes for
ESLint/TypeScript. Full detail, including the multi-tenancy model
(`coach_id`/`client_id`, and the solo-account `NULL coach_id` behavior that has caused 4 separate
bugs of the same shape): [architecture.md](architecture.md).

## Key Decisions

The highest-impact entries from [decisions.md](decisions.md) (full log there):

- **2026-09-05** — deploy only fires on a `v*` tag push; a push to `master` runs checks but never
  ships. Shipping is now a deliberate, separate act.
- **2026-08-22** — ownership/RLS-touching diffs require `multi-agent-review` *before the commit*
  (not just before the push), after reviewing at push time caught issues a full cycle late.
- **2026-08-20** — widening the pre-push test gate beyond 2 spec files was tried and reverted; the
  narrow gate is a deliberate, accepted tradeoff, not an oversight.

## Technical Debt Summary

43 open bugs (oldest 72 days) out of 227 tracked in the Vault ledger; 1 deferred critical (GDPR
consent capture). No canonical database schema document exists — only 20 ordered migration files.
Pre-push test coverage is narrow (2 of 105 spec files). Full counts and analysis (not repeated here
to keep this the only copy of the prose, not the numbers): [backlog.md](backlog.md) owns the
counts, [technical-debt.md](technical-debt.md) owns the analysis.

## Known Risks

- **GDPR:** consent capture is technically still a deferred bug in the ledger, but 5 of its 6 steps
  shipped 2026-08-25 (policy, hosting, linking, checkbox, enforcement gate) — see
  [roadmap.md](roadmap.md)'s correction. Only DB verification of `delete_current_user()` remains,
  needing Jake. A separate open bug notes the data export ships without its profile section.
- **Test-gate coverage:** most RLS/ownership-relevant specs run only in the full local suite, not on
  every push — a regression there can ship between full-suite runs.
- **Schema documentation:** no single current-state schema reference; reconstructing it requires
  reading 20 migration files in order.
- **Process/tracking decay:** this repo's own automated health check (OS-LINT) reported real gaps
  at session start — some of the machinery meant to catch these risks has itself been drifting.
  Detail owned by [technical-debt.md](technical-debt.md), not repeated here.

## Roadmap Summary

Current work is stabilizing the just-merged template-builder rewrite. Open-bug theme concentration
(RLS/ownership, data integrity) suggests an ongoing hardening phase rather than new-feature work,
though this is inferred, not stated. Several named-but-unscoped backlog items exist as bug-ledger
titles only (supersets/WOD redesign, per-exercise unit override, global swipe-to-delete, coach
parity). Full detail and confidence levels: [roadmap.md](roadmap.md).

## Setup Instructions

No standalone `README.md` exists in the repo, so this is currently the only place these steps are
written down:

```
npm ci                        # install devDependencies (playwright, supabase-js, dotenv, acorn)
npm test                      # full Playwright E2E suite (playwright.config.js)
npm run test:unit             # Node-native unit tests (tests-node/*.test.mjs)
npm run near-dup               # duplicate/near-duplicate function detector
```

Local preview server: `.claude/launch.json` defines a PowerShell-based static file server on
`http://localhost:3001` (480x844 mobile-first viewport), which `playwright.config.js` reads by
default; CI overrides it with `python3 -m http.server 3001` via `PREVIEW_SERVER_CMD`.

**Cutting a release:** `node scripts/release.mjs vYYYY.MM.N` — refuses unless the tree is clean, on
`master`, the tag is new, the full suite is green on that commit, `checks.sh` passes, a
`multi-agent-review` ran after the last commit, and filled-in release notes exist at
`docs/releases/<version>.md`. Add `--push` to actually push.

**Working safely in this repo:** see `CLAUDE.md`'s "Rules that must not break" section — in
particular the solo-account `coach_id IS NULL` filter trap, `is_personal` never belonging in an RLS
policy, and the multi-agent-review timing rule in [decisions.md](decisions.md).

## Recommended Next Steps

- Resolve two decisions Jake deferred during this documentation effort: (1) whether this repo fully
  replaces, partially replaces, or splits responsibility with the external Vault as system of
  record; (2) whether the bug ledger ever migrates in-repo (current default: no — see
  [backlog.md](backlog.md)).
- Address the deferred GDPR critical and the open GDPR-export bug — the only compliance-tagged
  items currently outstanding.
- Reconcile stale figures in `CLAUDE.md` itself (the beta date, and its cited "523 tests" — the
  actual current suite has 105 spec files and roughly 757 `test(` calls).
- Consider whether a `README.md` is worth adding — this handover's Setup Instructions section is
  currently its only copy.

## Requires Validation

- The Vault's `STATUS.md`, `LOG.md`, `CRITICAL.md`, and `roadmap.md` were not accessible while
  writing this document set — anything from them is necessarily missing here, not just incomplete.
- The live Supabase schema was not independently verified against the migration files.
- The beta-date correction in [vision.md](vision.md) is sourced from a prior session's memory, not
  from this repo analysis — confirm before treating it as fact.
- All bug-ledger counts and OS-LINT figures are a 2026-09-15 snapshot and will drift — see
  [backlog.md](backlog.md) and [technical-debt.md](technical-debt.md) for their own caveats.
