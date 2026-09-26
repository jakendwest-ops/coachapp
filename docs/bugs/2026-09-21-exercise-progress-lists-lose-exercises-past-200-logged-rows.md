---
id: 2026-09-21-exercise-progress-lists-lose-exercises-past-200-logged-rows
status: closed
priority: high
reported: 2026-09-21
closed_by: tests/exercise-series-paging-2026-09-21.spec.js
status_detail: "CLOSED 2026-09-21 on rule-(b) evidence: red before (5 of the first 6 tests failed on the unchanged code — 20 of 25 exercises listed, 200 of 250 sessions, one request), green after, and deliberate breakages of the fix (no paging, no unique tie-break, the read error thrown away, the tenant filter dropped, the !inner dropped, both callers' null handling removed) each caught. Found by the census behind the unbounded-reads check (rule 9n), not reported. By code shape it was certain past 200 logged exercise rows (about 11 weeks at three sessions a week); whether any real account had crossed that is unmeasured. NOT released: the tab changes only when a tag ships."
---

# The Performance tab's per-exercise list and the per-programme comparison lose exercises past 200 logged rows

**Plain English.** The API returns at most 200 rows per request and says nothing when it cuts a list short.
`_buildExerciseSeries` (js/app-progress.js) reads **every exercise a person has ever logged, in alphabetical
order**, in one request. So the first 200 rows alphabetically are kept and the rest vanish: past about 11 weeks of
training (three sessions a week, six exercises a session) whole exercises disappear from Performance → Per exercise
and from the Per programme comparison, starting from the END of the alphabet — "Squat", "Overhead press", "Pull-up"
go first. Nothing says a list was cut, and the page just shows fewer exercises than the person has trained.

**A second fault in the same function.** It destructures `{ data }` and throws the error away, so a FAILED read
renders as "No sessions logged yet." — the same words as a genuinely new account.

**Callers (both affected):** `renderProgressStrength` (Performance ▸ Per exercise) and `renderProgressPerProgram`
(Performance ▸ Per programme). No other caller.

**Related, not the same:** the open 2026-07-05 row "Test the My Progress strength tab on live with real data" — this
could be why a real account looked wrong; unverified.

## The fix

Page the read with `_fetchAllRows` (app-core.js), ordered `exercise_name` then `id` (the unique tie-break paging needs),
and return `null` on a failed read so both callers can say "couldn't load" instead of showing an empty list. Same class
and same remedy as Release 2a's sixteen reads; found by the census `scripts/check-unbounded-reads.mjs` runs.
