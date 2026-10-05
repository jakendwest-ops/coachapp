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
| app-runner | 3,476 | In-gym logger: strength table + wizard, rest timer, session autosave/resume; per-set effort (RPE/RIR) capture and a live top-set e1RM that backoff sets target |
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
global-setup that asserts the preview server is real, is CoachApp, and is serving **this**
checkout, and a global-teardown that reports (without failing on) leftover `[E2E]`-tagged fixture
rows. That last assertion exists because `.claude/launch.json` is git-tracked: a worktree used to
inherit the main checkout's server root and test code its author never wrote (2026-09-30, see
[the decisions archive](archive/decisions-2026-09-26-to-2026-10-04.md)).

`_estimate1RM` (`app-workouts.js`) is RPE-aware: given an effort value it reads the RTS/Tuchscherer
reps x RPE -> %1RM chart instead of Epley, which assumes every set went to failure. The chart itself
is covered by `tests-node/pure.test.mjs`, not a browser spec.

**A push runs no browser tests (since 2026-09-27).** The pre-push hook runs `checks.sh` in FAST mode
(static checks only, ~50 s). The full suite runs in `scripts/release.mjs` before any tag. The old
2-spec smoke run (`runner.spec.js` + `solo-account.spec.js`) is still available per push with
`CHECKS_SMOKE=1` (see [the decisions archive](archive/decisions-2026-09-26-to-2026-10-04.md)).

## CI/CD (evidenced from `.github/workflows/deploy.yml`)

One workflow, "Check & Deploy":
- **`check`** job — runs on every push/PR to `master`: `npm ci`, then `scripts/checks.sh`. On a tag
  push, also verifies `docs/releases/<tag>.md` exists before allowing deploy.
- **`deploy`** job — needs `check`; fires **only** on a `v*` tag push, so a push to `master` never deploys.
- No browser tests in CI since 2026-09-27 (see [the decisions archive](archive/decisions-2026-09-26-to-2026-10-04.md)): `scripts/release.mjs`
  runs the full suite locally. CI runs `checks.sh` in FULL mode (it includes the SQL mutation self-test
  that a local push skips).

## Homegrown quality tooling

`scripts/checks.sh` (~34KB) plus roughly a dozen modular `check-*.mjs` scripts (each with its own
`.selftest.mjs`), enforcing project-specific rules: column names, query scoping, cache-bust
versions, PII-in-logs, duplicate functions, escaping, policy-version matching, spec hygiene, count
ratchets. This substitutes for the linting layer a framework/TypeScript setup would normally
provide.

## Governance split (repo vs. user-level)

The repo's `.claude/settings.json` wires up SessionStart/PreToolUse/PostToolUse/Stop hooks.
`os-lint.mjs` and `guardrails.mjs` live in this repo (`.claude/hooks/`); `claim-check.mjs` lives at the
user level (`~/.claude/hooks/`). The UserPromptSubmit hook (`standing-behaviours.mjs`) was retired
2026-09-27 — its text is now in `CLAUDE.md` — because every hook invocation opens a visible console
window on this Windows machine (see [the decisions archive](archive/decisions-2026-09-26-to-2026-10-04.md)).
`docs/superpowers/subagent-contract.md` is the one governance document that does live in-repo. This
means some of the machinery enforcing quality gates today is not part of the repository itself.

## Known architecture debt — 2026-08-12 audit (historical, not re-verified)

The audit's five headline findings (thin `dbq()` adoption, no shared ownership-anchor helper, the stored-XSS recurrence, the recurring-bug-class
scorecard, documentation-vs-code disagreements) are archived verbatim in
[archive/architecture-known-debt-2026-08-12.md](archive/architecture-known-debt-2026-08-12.md); the full audit is
[archive/architecture-audit-2026-08-12.md](archive/architecture-audit-2026-08-12.md). It is over eight weeks old and the code has grown since: treat
each finding as a signal to check against [backlog.md](backlog.md) and `docs/bugs/`, not as a live fact.

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
