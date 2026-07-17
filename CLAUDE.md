# CoachApp — project brief for Claude Code

Lean grounding file, auto-loaded every session. **The system of record is the Vault**
(`C:\Users\jaken\Claude\Vault\projects\CoachApp` — STATUS/LOG/CRITICAL/roadmap). Run `/hello-claude`
for the full briefing. **If this file and the Vault ever disagree, the Vault wins.** Keep this a
cheat-sheet, not a second manual — don't grow it into a copy of the Vault.

## What this is

A web app for personal trainers to manage clients and build / assign / track workout programmes.
Solo-built by Jake — a PT, and the app's primary user. Beta 31 July 2026.
Live: https://jakendwest-ops.github.io/coachapp

## Stack — do NOT assume otherwise

- **Plain vanilla JavaScript** (ES6+), browser-native. **No TypeScript. No React/Vue/framework.**
- **No build step.** Static site: `index.html` loads `css/main.css` and the `js/` modules directly.
- **Backend: Supabase** (Postgres + Row-Level Security + Auth + Storage), `supabase-js` v2. Project
  `avilxuiacmtgeoxxhfhc` (eu-west-1). SQL/setup scripts in `scripts/`.
- **Tests: Playwright** E2E only (`npm test`). No unit-test framework.
- **Deploy: push to `master` → GitHub Actions → GitHub Pages.** Committing straight to master is the
  normal, correct workflow here — there is no PR gate.

## The 9 modules (`js/`)

Each has its own `?v=N` cache-bust on its `<script>` tag in `index.html` — **bump the version of any
module you change**, in the same commit.

- **app-core** — auth, app shell, routing, shared helpers (`escapeHtml`/`escapeAttr`/`mountModal`, the
  `db` client, role + client-record resolution like `_getCurrentClientId`).
- **app-dashboard** — the three role dashboards (coach / client / solo).
- **app-clients** — client list + profile tabs; PB / weight / check-in forms.
- **app-programs** — programmes, phases, periodization, assign & clone to clients, client-programme views.
- **app-calendar-goals** — calendar and goals.
- **app-workouts** — workout templates / library, the template editor, session-detail drawer.
- **app-runner** — the in-gym workout logger (strength table + wizard, rest timer, session autosave).
- **app-progress** — My Progress (body weight, personal bests, cardio, charts).
- **starter-content** — new-coach first-login seed (~40 exercises + a sample workout + a sample programme).

## Rules that must not break (also enforced by hooks — this file only describes them)

- **Three roles: coach, client, solo.** SOLO shares the coach's `auth.uid()` and its `clients` row has
  `coach_id = NULL` — so a `.eq('coach_id', …)` filter **silently excludes solo**. Four separate bugs
  of this exact shape. Use `.or('coach_id.eq.<uid>,user_id.eq.<uid>')` for any query that must see solo.
- **`is_personal` is a DISPLAY flag, not a security boundary** — never put it in an RLS policy.
- **Multi-tenancy = `coach_id` + `client_id`.** Never trust a client-supplied id for ownership.
- **Never push without running `multi-agent-review`** (pre-push). `checks.sh` (pre-push hook) enforces
  column names, query scoping, cache-bust, PII-in-logs, and duplicate functions on every push.
- **No PII in `log.*` calls** — ids and dates only; never names, emails, weights, or health values.

## Where the real docs live

Vault: `STATUS.md` (live state + bug ledger), `LOG.md` (history), `CRITICAL.md` (infra/security/GDPR),
`roadmap.md`. Skills + the `os-lint` health check live in `~/.claude`. Start any real session with
`/hello-claude`.
