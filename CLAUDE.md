# CoachApp — project brief for Claude Code

Lean grounding file, auto-loaded every session: a cheat-sheet, not a second manual. Point to `docs/*.md`; don't copy it here.

## Repository source of truth

**This repo is CoachApp's only system of record.** `docs/*.md` is authoritative for vision, architecture, schema, decisions,
technical debt and the bug ledger (`docs/bugs/`). Conversational memory is never authoritative: if `docs/` has an answer, read the file.

| Thing | Lives in |
|---|---|
| Docs, bug ledger, all 9 skills, `os-lint.mjs`, `guardrails.mjs`, `session-root-guard.mjs` | this repo (the root guard is registered in `~/.claude/settings.json` so it fires anywhere; `os-lint`'s `hooks` check goes RED if that is lost) |
| `claim-check.mjs`, this project's memory | `~/.claude` (private `claude-config` repo). Memory has ONE home: `~/.claude/projects/c--Users-jaken-OneDrive-coachapp/memory/` |
| The Vault, the old LLM wiki | nothing. Never read or write them; `os-lint`'s `no-vault-pointers` and `memory-split` enforce it |

**The session's ROOT must be this repo.** CLAUDE.md, skills, hooks and memory load only in a session rooted here. If the first
command shows a cwd other than `C:\Users\jaken\OneDrive\coachapp`, or `/hello-claude` answers "Unknown skill", STOP: start a new
session on the repo folder, or move this one with `mcp__ccd_directory__change_directory` (then Read this file and `MEMORY.md`
yourself). Never `cd` past it. Enforced by `session-root-guard.mjs` and `os-lint`.

## What this is

A web app for personal trainers to manage clients and build / assign / track workout programmes. Solo-built by Jake, a PT and
the app's primary user. No beta date is set and he has no clients on it yet; the quality gates stay.
Live: https://jakendwest-ops.github.io/coachapp

## Stack — do NOT assume otherwise

- **Plain vanilla JavaScript** (ES6+). **No TypeScript, no framework, no build step:** `index.html` loads `css/main.css` and `js/`.
- **Supabase** (Postgres + RLS + Auth + Storage), `supabase-js` v2, project `avilxuiacmtgeoxxhfhc` (eu-west-1). SQL in `scripts/`.
- **Tests:** Playwright E2E (`npm test`) and `node:test` for pure functions (`tests-node/*.test.mjs`, `npm run test:unit`).
- **Deploy: a `v*` tag → GitHub Actions → GitHub Pages.** Pushing to master does not deploy; a push runs the static checks
  only, so master can hold a browser regression. Committing straight to master is normal.
- **Release: `node scripts/release.mjs vYYYY.MM.N --push`.** Write and commit `docs/releases/<version>.md` from `TEMPLATE.md`
  first, keeping its `{{AUTO:VERIFICATION}}` line. It refuses unless the tree is clean, on master, the tag is new, a
  `multi-agent-review` saw this code, `checks.sh` passes and the full suite is green; it pushes the tag only after GitHub's
  check is green. Then confirm with `gh run list --limit 4` and `node scripts/verify-live.mjs <tag>`. The suite takes about
  65-70 min: run it with `run_in_background: true` and `timeout: 7200000`. Solo-view specs use `soloReady()`
  (`tests/helpers.js`); a throwaway probe runs with `-c playwright.probe.config.js`.

## The 9 modules (`js/`)

Each has its own `?v=N` on its `<script>` tag in `index.html`; the pre-commit hook bumps it for any changed module. Full map:
`docs/architecture.md`.

- **app-core** — auth, app shell, routing, shared helpers (`escapeHtml`/`escapeAttr`/`mountModal`, the `db` client, `_getCurrentClientId`).
- **app-dashboard** — the three role dashboards (coach / client / solo).
- **app-clients** — client list + profile tabs; PB / weight / check-in forms.
- **app-programs** — programmes, phases, periodization, assign & clone to clients, client-programme views.
- **app-calendar-goals** — calendar and goals.
- **app-workouts** — workout templates / library, the template editor, session-detail drawer.
- **app-runner** — the in-gym workout logger (strength table, rest timer, session autosave).
- **app-progress** — My Progress (body weight, personal bests, cardio, charts).
- **starter-content** — new-coach first-login seed (~40 exercises + a sample workout + a sample programme).

## Session startup

Start in the repo folder and run `/hello-claude` (root check, preview server, where we left off, open bug rows). For current
state read `docs/current-sprint.md`, `docs/session-context.md` and `docs/bugs/`.

## Rules that must not break (enforced by hooks; this file only describes them)

- **Three roles: coach, client, solo.** Solo shares the coach's `auth.uid()` and its `clients` row has `coach_id = NULL`, so a
  `.eq('coach_id', …)` filter **silently excludes solo** (four bugs of this shape). Use `.or('coach_id.eq.<uid>,user_id.eq.<uid>')`.
- **`is_personal` is a DISPLAY flag, not a security boundary** — never put it in an RLS policy.
- **Multi-tenancy = `coach_id` + `client_id`.** Never trust a client-supplied id for ownership.
- **`multi-agent-review` before the COMMIT for ownership/RLS work** (`_verifyX`, `coach_id`, `client_id`, `auth.uid`, policies);
  `guardrails.mjs` blocks the commit until it has run. Before the push for everything else. `checks.sh` (pre-push) enforces
  column names, query scoping, cache-bust, PII in logs, secrets, SQL lock-down, outside hosts, duplicate functions and a
  type-error ratchet (`npm run typecheck` lists them).
- **A push runs no browser tests.** Run the specs for what you touched before pushing work you have not hand-tested.
  `CHECKS_SMOKE=1 git push` adds the 2-spec smoke run; `CHECKS_FULL=1` adds the mutation self-test.
- **No PII in `log.*` calls** — ids and dates only.

## Standing behaviours

Rules 2 and 3 are also enforced by hooks (`guardrails.mjs`, `claim-check.mjs`); the rest by this list alone.

1. Technical + plain-English pair after every significant change — inline, unasked.
2. Fix the CLASS: grep every sibling doing the same job, COUNT them, fix all or name what you left.
3. No claim without a check you actually ran. If unrun, say "unverified".
4. SQL: read the schema first; one query per message; never anchor on something that can be NULL.
5. Ownership/RLS work: `multi-agent-review` before the COMMIT; everything else before the push.
6. An absolute instruction ("I don't want X", "no exceptions") is executed fully, first pass. State any cost AFTER doing it.
7. Minimise shell calls: each fires two hooks, and on this Windows machine each hook opens a console window. Use file tools
   and batch shell work into one script.
8. Before building anything: present ONE summary of every file, change and SQL statement, and wait for "approved". Silence or "looks good" is not approval.
9. Before every commit, the blast-radius sweep: every other caller of what changed; coach, client AND solo; every exercise type (cardio, timed, unilateral, %1RM, bodyweight); empty, zero and null; what the old code hid that the new code exposes; which spec covers the changed line.

## Docs

Keep `docs/*.md` current in the commit that makes them stale: `architecture.md` (module changes), `roadmap.md` (priorities, a
release), `current-sprint.md` (each release), `session-context.md` (checkpoints), `handover.md` (when its summary would mislead).
Delete what is no longer true; `os-lint`'s `docs-budget` and `context-budget` keep the files small.

- **Decisions:** one dated line in `docs/decisions.md` for a significant, hard-to-reverse choice (what, and what was rejected).
- **Bugs:** one file per bug in `docs/bugs/`. **Intake:** the moment Jake reports a bug it becomes a file, before investigation.
  **Closure:** a Jake-reported item closes only on (a) Jake confirming it or (b) a test that went red before the fix and green
  after — never by inference. `technical-debt.md` holds patterns; keep any number in one doc only and link to it.
- `docs/archive/` is history, not current. `/save` is this repo's end-of-session skill and touches nothing outside it.
