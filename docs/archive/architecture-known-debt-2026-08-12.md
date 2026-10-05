# Architecture debt summary (2026-08-12 audit)

Moved VERBATIM out of the live docs on 2026-10-05, because `os-lint`'s docs-budget / context-budget checks were red. Nothing below was edited. The full audit is [architecture-audit-2026-08-12.md](architecture-audit-2026-08-12.md).

---

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
