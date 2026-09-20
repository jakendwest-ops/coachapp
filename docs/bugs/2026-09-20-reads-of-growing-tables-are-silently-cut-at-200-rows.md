---
id: 2026-09-20-reads-of-growing-tables-are-silently-cut-at-200-rows
status: closed
priority: medium
reported: 2026-09-20
closed_by: tests/capped-reads-2026-09-20.spec.js, tests/capped-api-selftest-2026-09-20.spec.js
status_detail: "CLOSED 2026-09-20 on rule-(b) evidence for the sixteen queries in six functions named below (red before, green after, neuter-proved). NOT closed: the coach dashboard's adherence panel and the client list (Release 2b) and an unclassified remainder (Release 2d). Found by reading code (the 2026-09-19 product review), then MEASURED on the live API. Whether real accounts have crossed 200 rows is unmeasured."
---

# Reads of growing tables were silently cut at 200 rows

**Plain English.** The database service returns at most 200 rows for any one request, however many were asked for, and it
says nothing when it cuts the list short. Several screens asked for "all of it". That is right until someone has 201 rows,
and wrong from then on with no error anywhere. A person who weighs in daily reaches 200 in about seven months.

**Measured, 2026-09-20** (a read-only probe as the E2E coach; `exercises` holds 5,564 rows): a request returns 200 rows for
`.range(0, 999)` and for `.limit(1000)` alike, with the true total reported alongside. An offset exactly at the end returns an
empty page; an offset past the end is an error (`PGRST103`). Those are the facts `tests/capped-api.js` reproduces.

## What was wrong (sixteen queries in six functions, all fixed)

| Read | What a person saw past 200 rows |
|---|---|
| Client weight tab (`renderProgressWeight`) — loaded oldest-first | **"Current" frozen at the 200th-oldest weigh-in**; every later one invisible; chart stopped there |
| Coach weight tab (`renderClientWeight`) — newest-first | Current right, but ENTRIES stuck at 200, the "since" date and the table cut at the 200th-newest |
| Data export, ten tables: seven health tables (weights, sessions, performance, goals, events, 1RMs, check-ins) **and the coach's clients, templates and programmes** | A subject-access export that **reported success while missing rows**. The coach block was missed by my first pass and found by two independent reviewers: a coach past 200 templates (every periodised week is one) got a truncated list and "Download started" |
| Data export, the same ten and the profile | A failed read was **discarded** (`{ data: weights }` ignores the error): a bundle with a hole in it and no sign of one |
| Weight tabs, same-day weigh-ins (found by the review) | `weight_logs` has no unique (client, date). The first paging pass broke a date tie by random `id`, so a morning and an evening weigh-in could show the *earlier* as "Current". Now the one logged later wins (`created_at`, then `id`) |
| Weight tabs, a failed read of the client record (found by the review) | The goals editor rendered **blank**, and "Save goals" would have written NULLs over the person's real starting and goal weights. Now an error |
| Client weight tab, failed load (found by the review) | My first error state removed "+ Log weight", which for a solo account is the only place to log a weight. It now keeps the button and offers "Try again" |
| Coach Performance tab (`renderClientPerformance`) | The oldest records — where a best usually lives — dropped off the tab and out of every "best" |
| Client and Solo dashboards, "Personal bests" tile | Best picked from the newest 200 only: an exercise not logged recently enough, or a record older than that, **vanished from the tile** |

## Fix

`_fetchAllRows(makeQuery)` in `js/app-core.js` pages with `.range()` until the count says it has everything (one request
for a normal history), starts each page where the rows read so far end (so a cap below the page size cannot skip rows),
and returns `{ data: null, error }` on any failure or when it runs out of pages — a partial list must never pass for a whole
one. The export's failed reads, and the profile read, now throw (`downloadMyData` already shows "Export failed"), and the
export allows 500 pages (100,000 rows) rather than the screens' 50, so a subject-access request never meets a wall. The export's hand-rolled
`app_errors` loop was re-pointed at the same helper so there is one implementation, not two that can drift; its existing
spec pinned fixed 200-row offsets, an implementation detail, and now asserts each page starts where the last one ended.

## Evidence

`tests/capped-reads-2026-09-20.spec.js` (18 tests) runs the real functions against `tests/capped-api.js`, a read-only
stand-in that caps at 200 like the live API and **fails closed**; its own 12-case self-test proves the cap bites. Red before
(as observed): the client tab's Current showed the 200th-oldest weigh-in (90.05 kg) instead of the newest (87.55 kg — the
fixture was rounded to 0.1 kg steps afterwards so the two tabs format alike), ENTRIES 200 instead of 250, all seven export
tables 200 instead of 230, the old deadlift missing from both dashboards and "250 records" / "50 entries" missing from the
Performance tab. Neuter proofs: every call site reverted to a bare query; the helper's stop condition, offset stride,
error return and page limit broken one at a time; a missing `.order('id')`; the `created_at` tie-break removed from each
tab; the client-read error ignored on each tab; the error state's button removed; and, the review's point, the
`client_id` filter deleted from the export, the coach weight tab, the Performance tab and the client dashboard (each fails,
because every table now also holds another tenant's rows dated to look newest). Each failed exactly the intended tests;
four breakages of the stand-in (no cap, no PGRST103, silent unknown methods, fixture-order ties) failed its own self-test. `gdpr-export.spec.js` (real database) runs the new `count` + `range` + `.in()` + embed
chain against the live API.

## Review of the first pass (2026-09-20)

Three pinned review angles (tenant scoping, solo-mode correctness, duplicates/render-safety/regressions) plus my own
verification of each claim. **No tenant leak: every filter is identical before and after, on every page.** Real findings,
all fixed above: the export's unpaged coach block and unthrown profile error (two reviewers, independently); the
same-day tie; the failed client read; the error state losing "+ Log weight"; the export's 10,000-row wall; a stub that
resolved ties in fixture order (so no test could fail without a unique tie-break) and fixtures with a single tenant (so no
test could fail without a tenant filter). One claim needed no action: `index.html`'s `?v=` was flagged unbumped, but the
pre-commit hook bumps every changed module in the commit (`scripts/bump-versions.mjs`). Also measured on the live API
(read-only) to close a reviewer's "untested against the real thing": with a three-level embed, `.range()` and `count`
apply to the top-level rows, an offset at the end is an empty page, and two `id`-tie-broken pages never overlap.

## Named, not fixed

- **Release 2b.** The coach dashboard's adherence panel (`.limit(100)` newest first — bounded, but wrong past 100 sessions
  in a month) and the client list's last-session lookup (newest 200 logs across ALL clients: a client not in that window
  reads "No sessions" instead of "35d ago"). These need a server-side summary, not paging.
- **Release 2d.** A rough census (scratch script, not committed) found about 13 more reads of history-shaped tables with no
  explicit bound (events 2, session logs 1, logged exercises 4, logged sets 3, goals 3); most are keyed to a single session, exercise or date window and are bounded in practice. Two of them, the
  runner's finish-screen PR baseline, were fixed in Release 4b (`2026-09-20-runner-finish-screen-claims-false-prs-and-loses-typed-notes`),
  leaving about 11. They need classifying, not
  blanket paging — a ratchet with a measured baseline is the planned tool.
- **Not atomic across pages:** a row written between two pages can shift a boundary by one. A history view shows it on
  refresh; it is not a wrong number. The export selects no `id`, so it cannot de-duplicate the rare repeated row.
- **A stale-render window that paging widens, for histories over 200 rows only** (a pre-existing shape): the weight and
  Performance tabs paint into `#tab-content` after an await with no "am I still current" check, so a slow multi-request
  load can paint over the tab the user has since switched to; and both dashboards call `_destroyManagedCharts()` before
  their page-scoped refusal. Display-only, and it needs a quick tab switch during a load of a few hundred ms; not fixed on
  evidence-first grounds.
- **The stand-in does not fake PostgREST's joins:** a select containing an embed returns the fixture row whole.
