# CoachApp — project brief for Claude Code

Lean grounding file, auto-loaded every session — keep it a cheat-sheet, not a second manual. Don't
grow this file into a copy of `docs/*.md` or the Vault; point to them instead.

## Repository source of truth

**Resolved 2026-09-15: this repo replaces the Vault.** Jake's explicit decision, ending what had
been an open question — the repo, not the Vault and not conversational memory, is CoachApp's
system of record going forward. `docs/*.md` is authoritative for vision, architecture, schema,
decisions, technical debt, and the bug ledger (`docs/bugs/`, migrated wholesale from the Vault).

**Conversational memory is never authoritative.** Never rely on what a previous session said
happened, what you remember doing, or an unverified summary carried over in context — if `docs/`
has an answer, read the file.

**Migration complete, 2026-09-15/16.** All 9 skills (`hello-claude`, `save`, `run-coachapp`,
`deploy-check`, `feature-audit`, `mobile-check`, `multi-agent-review`, `playwright`, `sql-safety`)
and both hooks (`os-lint.mjs`, `guardrails.mjs`) now live in this repo (`.claude/hooks/`,
`.claude/skills/`), not `~/.claude` — CoachApp is fully self-contained for its own ritual/lint
automation. PTHub (the other project that previously justified keeping this machinery shared) ended
2026-09-15; its own PTHub-specific branches were stripped from the moved hooks at the same time.
`claim-check.mjs` and `standing-behaviours.mjs` stay in `~/.claude` — confirmed generic, not
CoachApp-specific. **Not yet verified:** whether a fresh session reliably resolves bare
`/save`/"hello claude" to this new location — see `docs/decisions.md`'s 2026-09-15 entries for
what's confirmed vs. still open.

**Correction, 2026-09-16 — the Vault is not uniformly "historical."** The line above and the
2026-09-15 decision both describe the CoachApp-specific project files (`STATUS.md`, `LOG.md`,
`bugs/`) that were migrated wholesale into `docs/`. Separately, `Vault/memory/predictions.jsonl`,
`lessons.jsonl`, and `beliefs.jsonl` are a **different, still-live, cross-project** memory ledger
(shared with PTHub's own historical entries) that was never part of that migration and isn't
CoachApp-specific — `guardrails.mjs` Rule 6 actively reads and blocks on `predictions.jsonl` state on
every commit. The Vault itself is its own git repo (`github.com/jakendwest-ops/vault.git`), so this
isn't an unversioned-data risk, just a doctrine statement that overreached: "the Vault is retired"
was true of the project-specific files, not of this cross-project ledger. The Vault folder itself
has not been deleted — retained as a historical archive for the migrated project files (most of it
is now duplicated into `docs/archive/` anyway) pending Jake's own decision on its fate; the live
JSONL ledger is the one part of it that is not archival.

## What this is

A web app for personal trainers to manage clients and build / assign / track workout programmes.
Solo-built by Jake — a PT, and the app's primary user. Beta 31 July 2026 (possibly stale — see
`docs/vision.md`'s Requires Validation; not corrected here without Jake's confirmation).
Live: https://jakendwest-ops.github.io/coachapp

## Stack — do NOT assume otherwise

- **Plain vanilla JavaScript** (ES6+), browser-native. **No TypeScript. No React/Vue/framework.**
- **No build step.** Static site: `index.html` loads `css/main.css` and the `js/` modules directly.
- **Backend: Supabase** (Postgres + Row-Level Security + Auth + Storage), `supabase-js` v2. Project
  `avilxuiacmtgeoxxhfhc` (eu-west-1). SQL/setup scripts in `scripts/`.
- **Tests: Playwright** E2E only (`npm test`). No unit-test framework.
- **Deploy: a `v*` TAG → GitHub Actions → GitHub Pages.** Changed 2026-09-05: **pushing to master no
  longer deploys.** A push still runs the checks, so master stays verified, but the live site only
  moves when a release tag is pushed. Committing straight to master is still the normal workflow —
  there is still no PR gate — the gate is at the release, not the commit.
- **Cutting a release: `node scripts/release.mjs vYYYY.MM.N`** (date-based: year.month.sequence). It
  REFUSES unless the tree is clean, you are on master, the tag is new, the FULL suite is green on that
  exact commit, `checks.sh` passes, a `multi-agent-review` ran *after* the last commit, and filled-in
  release notes exist at `docs/releases/<version>.md`. It does not push unless given `--push`.

## The 9 modules (`js/`)

Each has its own `?v=N` cache-bust on its `<script>` tag in `index.html` — **bump the version of any
module you change**, in the same commit. Full module map + data layer: `docs/architecture.md`.

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

## Session startup

Run `/hello-claude` first — it boots the preview server and scans for bugs. **Note the transitional
caveat above: it still reads Vault paths, which are now historical snapshots, not live.** For
anything about current priorities/risks/bugs, prefer:

- `docs/session-context.md` — priorities, risks, immediate next actions (point-in-time snapshot)
- `docs/current-sprint.md` — the current release cycle's in-flight state
- `docs/bugs/` — the live bug ledger

## Rules that must not break (also enforced by hooks — this file only describes them)

- **Three roles: coach, client, solo.** SOLO shares the coach's `auth.uid()` and its `clients` row has
  `coach_id = NULL` — so a `.eq('coach_id', …)` filter **silently excludes solo**. Four separate bugs
  of this exact shape. Use `.or('coach_id.eq.<uid>,user_id.eq.<uid>')` for any query that must see solo.
- **`is_personal` is a DISPLAY flag, not a security boundary** — never put it in an RLS policy.
- **Multi-tenancy = `coach_id` + `client_id`.** Never trust a client-supplied id for ownership.
- **`multi-agent-review` before the COMMIT for ownership/RLS work** (`_verifyX`, `coach_id`, `client_id`,
  `auth.uid`, policies), before the **push** for everything else. Moved 2026-08-22: reviewing at push
  time caught things a full cycle late — every ownership commit reviewed that day came back with a real
  finding. `hooks/guardrails.mjs` **blocks** `git commit` on unreviewed ownership diffs; the review skill
  writes the marker that clears it. `checks.sh` (pre-push hook) enforces
  column names, query scoping, cache-bust, PII-in-logs, and duplicate functions on every push.
- **The pre-push Playwright gate is a SMOKE gate, not the suite** — `runner.spec.js` +
  `solo-account.spec.js` only, **~59 of ~757 tests** (grep-based `test(` counts, verified 2026-09-15;
  supersedes the previously-cited "57 of 523" figure — see `docs/architecture.md` for how this was
  checked). Run `npm test` yourself before any push touching a module you have not hand-tested; the
  gate will not catch it. A spec outside the gate sat RED for 3 days across ~4 deploys and nothing
  noticed. Widening it was tried and reverted on 2026-08-20 (the glob silently no-ops, and the
  cross-tenant probes aren't cleanup-safe at push frequency) — see LOG and `docs/decisions.md`.
- **No PII in `log.*` calls** — ids and dates only; never names, emails, weights, or health values.

Development work should also follow `docs/architecture.md` for module boundaries, the data layer,
and CI/CD — don't re-derive these by re-reading the codebase each session.

## Documentation maintenance

Keep `docs/*.md` current as a side effect of the commit that makes them stale, not as a separate
pass:

| File | Update when |
|---|---|
| `docs/architecture.md` | a module is added/removed/majorly restructured |
| `docs/roadmap.md` | priorities shift, or a release is cut |
| `docs/current-sprint.md` | at each release cut (`scripts/release.mjs`) |
| `docs/session-context.md` | at natural session checkpoints — light touch, not every session |
| `docs/handover.md` | when enough of the above changes that a fresh reviewer's summary would mislead |

None of the above has an enforced check yet (`docs/technical-debt.md` names this as a real
maintainability gap) — this table is the convention until one exists. Don't let that become an
excuse to skip it; the whole point of these files is to not rely on memory.

### Decision logging

Record a decision in `docs/decisions.md` the moment a significant, hard-to-reverse choice is made —
deploy/release process changes, review-timing changes, stack-level choices, anything a future
session might otherwise accidentally re-litigate or reverse. One dated entry: what, why, what
alternative was rejected if relevant. Append-only, reverse-chronological, no per-decision files.

### Technical debt tracking

Live bugs live in `docs/bugs/` (one file per bug, YAML frontmatter — `status`, `priority`,
`reported`, `status_detail`). **Intake rule:** the moment Jake reports a bug, it becomes a file —
before investigation starts. **Closure rule:** a Jake-reported item closes only on (a) Jake
confirming it, or (b) a test that went red before the fix and green after — never by inference,
never because a commit message claimed it. `docs/technical-debt.md` is for *patterns* (schema gaps,
test-gate coverage, process decay); `docs/backlog.md` is a periodically-refreshed count snapshot
over `docs/bugs/`. If a number is going to be repeated in more than one `docs/*.md` file, put it in
exactly one of them and link to it from the rest — three copies of the same OS-LINT snapshot
already happened once and needed cleanup, and a stale ledger status (GDPR consent capture marked
`deferred` for a month after 5 of 6 steps shipped) was caught during the 2026-09-15 migration
precisely because two places disagreed.

## End-of-session review

Before ending a working session, review what changed and **recommend** (don't silently make)
updates to:

- `docs/session-context.md` — if priorities/risks shifted
- `docs/roadmap.md` — if priorities shifted
- `docs/current-sprint.md` — if a release was cut
- `docs/decisions.md` — if a significant choice was made
- `docs/technical-debt.md` — if a debt pattern was introduced, resolved, or newly understood
- `docs/handover.md` — if enough of the above changed that its summary would now mislead a reviewer

This is separate from, and does not replace, the Vault's own `/save` end-of-session ritual for
`STATUS.md`/`LOG.md`.

## Where the real docs live

**Repo (`docs/*.md`, the source of truth since 2026-09-15):** `vision.md`, `roadmap.md`,
`schema.md`, `critical.md`, `backlog.md`, `current-sprint.md`, `architecture.md`, `decisions.md`,
`technical-debt.md`, `session-context.md`, `handover.md`, plus the live bug ledger in `docs/bugs/`
(227 files as of the migration). `docs/archive/` holds full historical material migrated verbatim
from the Vault (`LOG.md`, the full pre-migration `STATUS.md`/`roadmap.md`, the 2026-08-12
architecture audit, and other point-in-time audits) — read it for detail/traceability, don't treat
it as current. See `docs/handover.md` for how the live docs relate to each other. Every file carries
its own "Requires Validation" section; treat unmarked claims as checked, marked ones as open.

**Vault (`C:\Users\jaken\Claude\Vault\projects\CoachApp`) — now a historical archive, not live.**
Retained, not deleted; see "Repository source of truth" above for what (if anything) still reads it.

**All 9 skills and both hooks live in this repo's own `.claude/hooks/` and `.claude/skills/`** —
fully self-contained since 2026-09-16 (`hello-claude`/`save`/`run-coachapp` moved 2026-09-15;
`deploy-check`/`feature-audit`/`mobile-check`/`multi-agent-review`/`playwright`/`sql-safety`
followed 2026-09-16, once PTHub — the other project the shared `~/.claude` location served — had
ended). `claim-check` and `standing-behaviours` stay in `~/.claude` (generic, used across other
projects too). Start any real session with `/hello-claude`.
