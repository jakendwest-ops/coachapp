# Handover

For a developer reviewing CoachApp independently: enough to orient without having lived in the codebase. It
summarises and points; it deliberately carries **no counts** (bug totals, test totals, line counts) — every copy
of a number in this doc set went stale, so each number lives in exactly one place, named below.

Rewritten 2026-09-27 (the 2026-09-15 version described the pre-migration world: a Vault ledger, "no schema
document", an unreleased v2026.09.6).

## Product

A web app for personal trainers to manage clients and build, assign and track workout programmes. Three roles:
coach, client, and solo (a coach who also trains themselves; their `clients` row has `coach_id = NULL`). Built
solo by Jake, a working PT and the app's primary user. Real beta use has started; there are no paying coaches'
client rosters yet. Vision and its confidence levels: [vision.md](vision.md).

## State

- **Live:** the latest `v*` tag — see `docs/releases/` (newest file) for what it contains and how it was verified.
- **In flight:** [current-sprint.md](current-sprint.md); priorities: [roadmap.md](roadmap.md).
- **Bugs:** one file per bug in `docs/bugs/`; counts in [backlog.md](backlog.md); the oldest fixes awaiting
  confirmation: `node scripts/ledger-batch.mjs`.

## Architecture

Plain ES6+ JavaScript, no build step, no framework. Supabase (Postgres + RLS + Auth + Storage). Nine modules in
`js/`, each with its own `?v=` cache-bust in `index.html`. Schema reference: [schema.md](schema.md). Module map,
data layer and multi-tenancy (`coach_id` / `client_id`, and the solo `NULL coach_id` trap):
[architecture.md](architecture.md). Security constraints and the breach procedure: [critical.md](critical.md).

## How changes are verified

- **Every push:** `scripts/checks.sh` (static checks and ratchets written for this codebase in place of a
  linter/type checker, and a local SQL verifier) runs as the pre-push hook in FAST mode (~50 s, no browser tests
  since 2026-09-27).
- **Every release:** `node scripts/release.mjs vYYYY.MM.N` refuses unless the tree is clean, the FULL suite is
  green on that code, a review saw exactly that code, and release notes exist. Only a `v*` tag deploys.
- **CI (GitHub Actions):** code checks only — no browser tests since 2026-09-27 (see [decisions.md](decisions.md)).
- **SQL:** run locally against a copy of the live schema (`scripts/sql-verify/`) before Jake runs it live.

## Known risks

- **GDPR:** consent capture is 5 of 6 steps live; `delete_current_user()` still needs confirming in the database.
- **Test coverage between releases:** no browser tests run on a push (since 2026-09-27). Only the release's full suite
  checks the browser.
- **One shared test account** for all local runs; two local runs at once collide.
- **Single operator:** confirmations, SQL and release decisions all go through Jake.
- Patterns and gaps: [technical-debt.md](technical-debt.md).

## Setup

```
npm ci                 # dev dependencies (playwright, supabase-js, dotenv, acorn, pglite)
npm test               # full Playwright suite
npm run test:unit      # Node unit tests (tests-node/)
```

Local preview server: `.claude/launch.json` (a static server on `http://localhost:3001`, which
`playwright.config.js` reads). Test credentials come from `.env`.

Before changing anything, read `CLAUDE.md` — the rules that must not break, and the standing behaviours.

## Requires Validation

- The live Supabase schema has not been independently diffed against [schema.md](schema.md).
- The beta timeline is an open question — see [vision.md](vision.md).
