# Architecture

Snapshot date: 2026-09-15. See [decisions.md](decisions.md) for *why* several of these choices were
made, and [technical-debt.md](technical-debt.md) for known gaps in this layer.

## Stack constraints (evidenced)

- Plain ES6+ JavaScript, browser-native. No TypeScript, no React/Vue/framework.
- No build step — `index.html` loads `css/main.css` and the `js/` modules directly.
- Backend: Supabase (Postgres + Row-Level Security + Auth + Storage), `supabase-js` v2.
- No ESLint, Prettier, Babel, Webpack, Vite, or `tsconfig.json` exist anywhere in the repo (verified
  by direct search) — matches the "no build step" constraint exactly.

## The 9 modules (`js/`, verified line counts)

Each has its own `?v=N` cache-bust query string on its `<script>` tag in `index.html`.

| Module | Lines | Responsibility |
|---|---|---|
| app-workouts | 3,639 | Workout templates/library, template editor, session-detail drawer |
| app-runner | 3,476 | In-gym logger: strength table + wizard, rest timer, session autosave/resume |
| app-progress | 3,356 | Body weight, personal bests, cardio, charts. A "progress photos" feature was built then code-removed — data/bucket retained (per an in-file comment) |
| app-programs | 2,821 | Programmes, phases, periodization, assign/clone to clients; heaviest raw-query module, with its own ownership-anchor verification |
| app-calendar-goals | 1,134 | Calendar (maps assigned programmes onto real dates) and goals |
| app-core | 1,455 | Auth, app shell/routing, shared helpers (`escapeHtml`/`escapeAttr`/`mountModal`), the `db` client, role + client-record resolution, consent versioning |
| app-dashboard | 984 | The three role dashboards (coach/client/solo), including fetch-failure-visibility banners |
| app-clients | 565 | Client list + profile tabs; PB/weight/check-in forms |
| starter-content | 169 | New-coach first-login seed data (~40 exercises + sample workout + programme) |

**Total: 17,599 lines.** `app-core` is the shared foundation every other module depends on for
auth, escaping, and role/client-id resolution. The four largest modules (workouts, runner, progress,
programs) are also where open-bug themes concentrate — see
[technical-debt.md](technical-debt.md).

## Data layer

Supabase Postgres, no ORM — direct `supabase-js` calls throughout. **Canonical schema reference:
[schema.md](schema.md)** (migrated from the Vault 2026-09-15 — this closes a gap this file used to
flag as unfilled). The schema also exists as **20 dated, append-only SQL migration files** in
`scripts/` (verified count), applied in filename-date order, with no `supabase/migrations/`
directory and no Supabase CLI config — `schema.md` is reconciled against these, not a replacement
for reading them when precision matters.

Two multi-tenancy columns matter everywhere: `coach_id` and `client_id`. A solo account's `clients`
row has `coach_id = NULL` (it shares the coach's own `auth.uid()`), so any query filtering on
`.eq('coach_id', …)` alone silently excludes solo accounts — documented in `CLAUDE.md` as a bug
shape that has recurred 4 times. `is_personal` is a display flag, not a security boundary, and must
never appear in an RLS policy.

One Supabase Edge Function exists: `invite-solo-user`.

## Testing (verified counts)

Playwright E2E only. **105 spec files** in `tests/`, **757 individual `test(` calls** (direct grep
count — a reasonable but not exact proxy for test count, since it can include helper references). A
separate small Node-native unit-test layer (`tests-node/`, `node --test`) covers pure logic.

The suite runs single-worker/sequential (shared Supabase test-account auth state), with a
global-setup that asserts the preview server is real and a global-teardown that reports (without
failing on) leftover `[E2E]`-tagged fixture rows.

**The pre-push gate is deliberately narrow:** only `tests/runner.spec.js` and
`tests/solo-account.spec.js` — 2 of 105 spec files. Widening it was tried and reverted on
2026-08-20 (see [decisions.md](decisions.md)).

## CI/CD (evidenced from `.github/workflows/deploy.yml`)

One workflow, "Check & Deploy":
- **`check`** job — runs on every push/PR to `master`: `npm ci`, then `scripts/checks.sh`. On a tag
  push, also verifies `docs/releases/<tag>.md` exists before allowing deploy.
- **`e2e`** job — runs the same 2-spec smoke gate as the pre-push hook, gated on repository secrets;
  named "Smoke tests (57, skipped without secrets)" specifically so a green badge can't be misread
  as 57 tests having passed when the secrets are absent.
- **`deploy`** job — needs only `check`, deliberately not `e2e` (the e2e job's flakiness profile has
  never been measured). Fires **only** on a `v*` tag push. A push to `master` alone never deploys —
  see [decisions.md](decisions.md).

## Homegrown quality tooling

`scripts/checks.sh` (~34KB) plus roughly a dozen modular `check-*.mjs` scripts (each with its own
`.selftest.mjs`), enforcing project-specific rules: column names, query scoping, cache-bust
versions, PII-in-logs, duplicate functions, escaping, policy-version matching, spec hygiene, count
ratchets. This substitutes for the linting layer a framework/TypeScript setup would normally
provide.

## Governance split (repo vs. user-level)

The repo's `.claude/settings.json` wires up SessionStart/PreToolUse/PostToolUse/Stop/UserPromptSubmit
hooks, but the hook *implementations* (`os-lint.mjs`, `guardrails.mjs`, `claim-check.mjs`,
`standing-behaviours.mjs`) live at the user level (`~/.claude`), not in this repo. That
infrastructure is also shared with another project (PTHub) via a separate Vault git repo — see
[decisions.md](decisions.md) for what that means for the Vault-to-repo migration.
`docs/superpowers/subagent-contract.md` is the one governance document that does live in-repo. This
means some of the machinery enforcing quality gates today is not part of the repository itself.

## Known architecture debt — 2026-08-12 audit (historical, not re-verified)

The Vault held a full 9-module architecture audit from 2026-08-12 — the first-ever structured
review of every module (prior review tooling only ever covered a diff or the 2-3 highest-churn
files). Migrated in full to `docs/archive/architecture-audit-2026-08-12.md`. It is now 5+ weeks
old — the codebase has grown substantially since (that audit counted 13,745 lines across 9 modules;
this file's own verified count above is 17,599) — so treat every specific finding below as a
*historical* signal to check against `docs/backlog.md`/`docs/bugs/` for current status, not a live
fact:

- **`dbq()` (the query-wrapper convention) adoption was thin and uneven at audit time** — 23 of 292
  `db.from()` calls repo-wide (~8%), with `dbq()`'s own definer file using it for only 2 of its own
  8 calls. No lint/type/runtime friction flags a raw `db.from()` call as non-compliant.
- **No shared ownership-anchor helper existed for most tables that needed one.**
  `_verifyTemplateOwnership` (`app-workouts.js`) was the only such helper repo-wide at the time; the
  audit's top two recommendations were building equivalents for the client-scoped tables
  (`app-progress.js`/`app-runner.js`) and the programme tables (`app-programs.js`, ~20+ unanchored
  sites, its single largest finding). Current status of these specific gaps: not re-checked in this
  migration — cross-reference `docs/bugs/` for anything still open with an `id` from that audit.
- **Stored-XSS had recurred 5+ times as of that audit** (the class is separately tracked in
  [critical.md](critical.md)'s Security Timeline, which continues past this audit through an 8th
  instance on 2026-09-06).
- **A recurring-bug-class scorecard** (against `critical.md`'s incident history) found the
  ownership-anchor and stored-XSS classes still actively recurring, FK-cascade assumptions
  informational-only, and — the one class the audit found genuinely closed out — the solo
  `coach_id = NULL` trap absent everywhere it checked, despite 4 prior incidents.
- **Documentation-vs-code disagreements found at the time** (several since folded into
  [vision.md](vision.md) and [schema.md](schema.md) with their own "known stale" notes): a
  self-signup page `blueprint.md` described no longer existed; the documented canonical modal
  pattern predated `mountModal()`; the runner's `_runner` object carried more fields than documented;
  a third, undocumented template-ownership state existed in the schema.

Full detail, per-module findings, and the audit's own methodology/limitations:
`docs/archive/architecture-audit-2026-08-12.md`.

## Requires Validation

- The live Supabase schema has not been independently verified against the 20 migration files in
  this analysis — the files describe intent, not a confirmed current database state.
- The 757 `test(` count is a grep-based proxy, not a verified test-by-test count.
- No automated process currently keeps this file in sync with the codebase — see
  [decisions.md](decisions.md)/the original design discussion for the intended update trigger
  (same commit as any module-level restructuring).
- None of the 2026-08-12 audit findings above have been re-checked against current code in this
  migration pass — each needs cross-referencing against `docs/bugs/` before being treated as still
  open.
