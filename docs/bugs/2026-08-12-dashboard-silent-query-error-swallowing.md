---
id: 2026-08-12-dashboard-silent-query-error-swallowing
status: confirmed
closed_by: "clause (b) — dashboard-fetch-failures-2026-08-12.spec.js ran GREEN 2026-08-20 in a serialized 192-test run; red-before is recorded in this file's body. Closed on test evidence, NOT on a Jake confirmation."
priority: high
reported: 2026-08-12
status_detail: "found by the full-codebase architecture audit; first-page-every-login render path"
---

# All 3 dashboards (coach/client/solo) silently swallow every query error — a failed fetch renders as "no data" instead of an error

Found by the 2026-08-12 full-codebase audit (`architecture-audit-2026-08-12.md`).

## The sites

`js/app-dashboard.js` — each of the three role dashboards' bulk `Promise.all` fetch blocks destructures only `{ data }`/`{ count }` and never checks `error`:
- `renderDashboard` (coach) — 13-25, 5 queries
- `renderClientDashboard` — 249-265, 7 queries
- `renderSoloDashboard` — 609-623, 6 queries

## Why this matters

If any of these 18 queries fails (an RLS misconfiguration, a transient network blip, schema drift after a migration), the affected section silently renders its empty state — "No activity in the last 7 days," "No active goals," "No records yet" — which is visually indistinguishable from a legitimately empty account. There is no error surfaced to the user and, per the audit's count, essentially no error-path logging either: `app-dashboard.js` has only 6 `log.*` calls total across the whole file, and none of them sit inside an error branch for any of these 18 queries.

This is the first thing every user sees on every login — a silent failure here is the hardest possible place for it to go unnoticed, since "nothing loaded" looks identical to "nothing exists yet."

## Relationship to prior work

This is a different instance of the same silent-failure class that commit `d4b2689` ("the five highest-damage writes no longer fail in silence") already fixed elsewhere — but that fix was scoped to *writes*; these are *reads*, and app-dashboard.js was not touched by it.

## Suggested fix direction

Check `error` on each destructure (or route through `dbq()`, which already handles this) and at minimum `log.error` on failure so a real outage is distinguishable from an empty account in the console — a user-facing toast/banner is a product decision (a dashboard-wide "some data couldn't load" banner vs. per-card) worth scoping separately.

---

**✅ FIXED + LIVE `c343924` (2026-08-12).** Worse than reported: not 18 fetches but **19** — the
coach dashboard's own client-list query was not in the audit's tally. None destructured `error`.

All three dashboards now capture every fetch error, a shared `_failedFetches` collects them by
human-readable label, and `_fetchFailureBanner` renders ONE banner naming exactly what failed with a
Retry that re-enters through `navigate(page, 'replace')` — the app's own router, rather than
re-implementing "which dashboard am I", which the master account's view-switching makes non-obvious.

Labelled per item ("your goals", "weight history") rather than "something went wrong": a message that
does not say WHAT failed cannot tell the user whether the missing thing mattered.

Pinned by `tests/dashboard-fetch-failures-2026-08-12.spec.js` (3 tests), verified red-before by
neutering the banner. The third test is the one that stops this becoming its own problem: a HEALTHY
dashboard must show NO banner. A permanent warning is one nobody reads.
