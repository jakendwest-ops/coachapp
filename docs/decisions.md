# Decisions

Append-only, reverse-chronological: significant, hard-to-reverse choices, one line each, newest first. A line says what was decided
and what was rejected; the full reasoning is archived verbatim and linked. Everything up to 2026-11-16, word for word:
[archive/decisions-2026-11-17-full-before-trim.md](archive/decisions-2026-11-17-full-before-trim.md) (it links the older archives in turn).

---

**2026-11-17** — Operating-system health check (Jake approved the recommendations): the predictions ledger is retired (file archived to
`docs/archive/`, `guardrails.mjs` Rule 6 and `os-lint`'s `stale-predictions` removed; rejected: grading 89 old predictions, hours for
little); `os-lint`'s `masthead-drift` removed (no doc carries a masthead); `/deploy-check` is due at a beta invite, not per release tag;
decisions are one line each here; `os-lint` gains a weekly count of Jake-reported bugs, the measure of whether the process pays.

**2026-11-16** — A workout can be put on a day in Personal view: a calendar event with `events.template_id` and a guard trigger (rejected:
a `scheduled_workouts` table). It counts like a plan session; a rest day's Today card offers it instead of "Train anyway". Personal view only.

**2026-11-14** — The logger gets "Fill from last time" and copy-down. Rows still start empty and every set is ticked by hand (2026-07-11 stands).

**2026-11-13** — The live rest timer is the strip's REST cell, not a bar above the sets (rejected: a reserved slot that pushed the first set down).

**2026-11-10** — Design system Stage 4: Inter and neutral colours stay until Jake picks a brand; logger density stays as it is.

**2026-11-09** — `audit_log` keeps 30 days (nightly `pg_cron` job `audit-log-keep-30-days`). If the database grows again, check that job first.

**2026-11-08** — A first-ever log is not a PR; one trophy per best set. On the plan page, occasional and destructive actions sit behind ⋯
(reverses 2026-10-16); the app-wide rule is [its own row](bugs/2026-11-08-no-app-wide-rule-for-menu-vs-on-screen-buttons.md).

**2026-11-01** — Personal Progress pills: Goals · Records · Performance · Bodyweight · Cardio; Performance: Lifts · Sessions · Blocks.

**2026-10-31** — Personal view has four destinations: Today, Train, Progress, More (supersedes D2's 5-item bar). Coach and client unchanged.

**2026-10-30** — The runner's next-session target is dropped (last time's grey text already shows it). Needs attention is ranked by `ATTENTION_RULES`.

**2026-10-29** — Check-ins get a coach review (UPDATE narrowed to 3 columns). Every push type-checks `js/` and the error count may only fall.
Coach work starts for a 25-client roster; a client's current plan is the most recently STARTED one. The old LLM wiki is dead to CoachApp.

**2026-10-28** — The exercise builder is rebuilt around set groups (`intensityBasis: 'topSetWeight'`); the runner's beeps are rebuilt after the page is hidden.

**2026-10-25** — A coach cannot link a row to another coach's client (guard trigger); every `anon` privilege revoked. The runner never speaks:
cues are tones, because `speechSynthesis` stops Spotify on iOS.

**2026-10-18** — Five data-leak push gates (`check-secrets`, `check-sql-definer`, `check-external-surface`, `check-pii-logs`, `check-query-scope`).

**2026-10-12 to 10-17** — The Personal Workouts page (plan first, Create a workout, search, edit in place); "Programs" renamed "Training plans".

**2026-10-11** — CI pins Node 24 like the dev machine; `verify-live.mjs <tag>` checks a release byte for byte.

**2026-10-05** — A session's ROOT must be the repo (a Vault-rooted session ran CoachApp for 16 days): a SessionStart guard and three `os-lint`
checks. Docs budgets are cleared by trimming, never by raising a ceiling.

**2026-09-26 to 10-04** — A release tag is pushed only after GitHub's check is green; a push runs static checks only; `assign_program()` is transactional.

**2026-09-15 to 09-21** — This repo is the system of record (the Vault is severed); unbounded reads are ratcheted; SQL is run locally (PGlite) first.
