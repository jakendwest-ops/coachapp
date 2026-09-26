---
id: 2026-09-21-remaining-unbounded-reads-of-growing-tables-are-named-not-fixed
status: open
priority: low
reported: 2026-09-21
status_detail: "OPEN, named findings. Found by the census behind checks.sh rule 9n (scripts/check-unbounded-reads.mjs). It pins the count AT the measured number so a NEW unbounded read fails the push; the sites below are the residue, each classified by reading the code. One (the exercise-progress read) is a real defect and has its own row. Impact on real accounts is unmeasured for all of them."
---

# Unbounded reads of growing tables that remain, and what each one is

The API returns at most 200 rows per response and says nothing when it cuts a list short (measured 2026-09-20). Rule 9n
flags a read of a table that grows with use (`weight_logs`, `workout_logs`, `workout_log_exercises`,
`workout_log_sets`, `performance_logs`, `client_check_ins`, `events`, `goal_check_ins`, `app_errors`) that has no bound.
**9 sites at the 2026-09-21 measurement, 7 after two were dealt with the same day** (one fixed, one made honest — the table
below says which; 38 reads examined, the other 31 are limited, single-row, counts or paged). Structural tables (programmes,
templates, phase slots) grow with a coach's own authoring and are out of scope on purpose. The checker's baseline is pinned at 7.

| Site | What it reads | Verdict |
|---|---|---|
| js/app-progress.js `_buildExerciseSeries` | every exercise a client ever logged, alphabetical | **FIXED 2026-09-21** (paged; its own row `2026-09-21-exercise-progress-lists-lose-exercises-past-200-logged-rows`) — no longer counted |
| js/app-workouts.js:933 | recent logs for the library's "last used" | **MADE HONEST 2026-09-21:** it said `.limit(500)`, which returns 200 (the checker treats a limit wider than the cap as no bound); now `.limit(200)`, no behaviour change, with the residual limit stated in the code — no longer counted. **Residual, accepted:** a template not trained within the newest 200 sessions on the templates on screen falls back to its edit date instead of "trained". Closing it properly needs a server-side "newest session per template" (a view or an RPC) |
| js/app-calendar-goals.js:71, :106 | events in the visible month | Bounded by a date window, not a count. A coach's month across a very large roster could pass 200; unlikely today |
| js/app-programs.js:403 | `workout_logs.template_id` for the clones of a programme being unassigned | A **delete guard** reading a capped list: a clone whose logs were all cut would look unused and be deleted (its logs' `template_id` FK behaviour unverified). Needs over 200 logs across one assignment's clones — unlikely, but it is a destructive path. Not fixed: `_removeAssignmentAndClones` writes, so the read-only test stand-in cannot exercise it |
| js/app-runner.js:290, :293 | one exercise's sets across the newest 20 logs | Bounded by construction (`.in('log_id', …)` over at most 20 ids) |
| js/app-runner.js:3366, :3385 | one session's sets (and the previous session's) | Bounded by construction (one session); a session with over 200 sets is not realistic |

**How to clear one:** bound it (`.limit(n)` for the newest few, `.single()`, `head: true` for a count, or page it with
`_fetchAllRows` and a unique tie-break), or — if it is genuinely bounded by construction — say why on or just above the
`.from(` line: `// unbounded-ok: <reason>`. Then lower `UNBOUNDED_READS_BASELINE` in the checker.

**Not covered by the check, by design:** views and RPCs (the cap applies to them just the same — the two coach screens
page their view reads), the structural tables above, and any read whose bound the check cannot see (it reads chains,
not data: `.in('log_id', ids)` over twenty ids and over two thousand look identical).

## Outside the nine tables — NOT counted, found by the reviews of 2026-09-21 (impact unmeasured)

The checker's first cut deliberately covers nine tables (widening the subject and raising the severity together is how a gate
becomes a wall). Other tables grow too, and these reads are unbounded; they are listed here so they are not lost. If the
gate is widened, each becomes a counted site.

- **`client_1rms` — the one with a correctness edge.** The runner inserts a row whenever a client accepts a new 1RM after a
  session. `js/app-runner.js:43` reads a client's whole list with NO order and NO limit and builds `oneRMByName` /
  `oneRMById` with `Object.fromEntries`, so the LAST row for a name wins. That is order-dependent even under 200 rows (it is
  right today only because a heap tends to return rows oldest-first), and past 200 rows the API returns an arbitrary 200 —
  so the runner could work out %1RM target weights from an old 1RM. Needs over 200 rows for one client, so unlikely soon.
  Also unbounded (both newest-first, so the cap drops the OLDEST): `js/app-progress.js:188` (the 1RM tab) and
  `js/app-programs.js:626` (the assign-programme checklist). Bounded, for the record: the runner's single-exercise lookup
  (`_lookupClientOneRM`, `js/app-runner.js:2150` and `:2155`, is `.limit(1).maybeSingle()`) and the data export's read (paged).
- **`exercises`** (a coach's library): `js/app-workouts.js:998` (the library list, `select('*')` by name) and `:2323` (the
  picker), both unbounded — past 200 exercises the library would silently show the first 200 alphabetically. (The test account
  holds thousands of rows, most of them fixture debris; a real coach's library size is unmeasured.)
- **`workout_templates`, `.limit(2000)`** at `js/app-programs.js:2647` (the programme builder's workout-picker pool; its own
  comment says the runner's "Load from template" picker uses the same limit): the same wider-than-the-cap shape the checker
  refuses on the nine tables — it returns 200, so past 200 reusable templates the pool is cut alphabetically.
- **`clients`:** the two coach screens' roster reads (see the coach-dashboard row).
