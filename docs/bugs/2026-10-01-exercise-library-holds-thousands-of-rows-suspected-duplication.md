---
id: 2026-10-01-exercise-library-holds-thousands-of-rows-suspected-duplication
status: open
priority: high
reported: 2026-10-01
status_detail: "REPORTED BY JAKE 2026-10-01 (mid-session, after I mentioned that the E2E PT account owns 6,275 exercises while the exercise picker returns only 200): 'the account shouldnt have nearly 7000 exercises, this appears to be a duplication bug'. Investigation not yet complete when this row was written (intake rule: the row exists before the work starts). What is MEASURED so far: the E2E PT account (a test account, not Jake's own) sees 6,275 exercises through RLS; a picker-style query returns 200."
closing_conditions: "Jake confirms, OR a test goes RED before and GREEN after the fix. Not closed by the picker/Library read being paged (that fixes what is VISIBLE, not why there are thousands of rows), and not closed by deleting the rows."
---

# The exercise library holds thousands of rows — suspected duplication bug

**Closes when:** Jake confirms it, or a test that goes RED before and GREEN after the fix shows that the code path creating the extra rows no longer does. Paging the picker/Library reads fixes what is *visible*, not *why there are thousands*, and deleting the rows fixes nothing.

## Reported

Jake, 2026-10-01: *"the account shouldnt have nearly 7000 exercises, this appears to be a duplication bug."*

## What triggered it

While running the first real-click end-to-end journey for the RPE top-set feature, the exercise picker
could not find an exercise the test had just created. A read-only count showed the E2E PT account sees
**6,275** exercises while the picker's query returns **200** (the API's silent `max_rows` cap — the
picker's read has no paging). That explains the invisible exercise; it does not explain 6,275 rows.

## Open question (to be answered from the data, not guessed)

Is this (a) test debris — specs that create a timestamped exercise per run and never delete it — or
(b) a genuine duplication bug in the app, where some code path inserts an exercise it believes is missing
because its "does it exist?" check reads a list truncated at 200 rows (a feedback loop: past 200 rows the
check goes blind, so it inserts again, so the table grows)? The two have different fixes and different
blast radii: (a) is hygiene, (b) can bloat a real coach's library.

## Findings (2026-10-01, measured on the E2E PT account, read-only)

**The 6,275 rows are test debris, not the app repeating itself.** 6,274 of 6,275 names are distinct. By
shape: ~600 each of `Playwright Swap Target / Added Exercise / Identity Check / Identity Check 2 /
Change Test A / Change Test B / Rest Swap Target / Rest Add Target / Picker Create Test <timestamp>`
(all from `tests/runner.spec.js`, via `pickOrCreateExercise`, which types a unique timestamped name and
clicks the real "Create new exercise" — and the describe has no `afterEach`), plus 810 lowercase `[e2e]`
rows (`rollback exercise` 588, `log-session-zero` 163, `reentry exercise` 59) from older spec versions.
Rows were created ~200-290 per day on busy days, 2026-07-06 onward.

**Why nothing cleaned it up — a safeguard reporting success while doing nothing.**
`scripts/reap-e2e-debris.mjs` matches names starting `[E2E` / `[TEST]` with a case-sensitive `LIKE`.
`LIKE '[E2E%'` matches **0** rows and `LIKE '[e2e%'` matches 810; the `Playwright …` rows carry no tag at all.
Its dry run says "exercises clean / No debris found" for an account holding 6,275 rows of it.

**The one exact repeat** (`[e2e] reentry exercise 1788528305907`) is two inserts **29 ms apart** on
2026-09-04, the day the re-entry guard spec was written. The other 58 `reentry` rows since are unique.

## The app DOES have real duplication paths (found while investigating; none caused the 6,275)

1. **The picker offers "+ Create new exercise" for any non-empty query, even when an exact match is in
   the list** (`const createRow = query.trim() ? …` in `_renderExercisePickerResults`), and
   `_createExerciseFromPicker` inserts without checking for an existing exercise. One mis-tap on the row
   above an existing match makes a duplicate.
2. **The picker and the Library page read `exercises` with no paging**, so the API's silent 200-row cap hides
   every exercise past row 200 from the list *and its search* — and with (1), the picker then invites
   creating the one it cannot show. `_fetchAllRows` exists for exactly this (2026-09-20) and neither site
   uses it. `check-unbounded-reads` does not watch `exercises` (its header says so, on purpose).
3. **`saveNewExercise` (Library "Add exercise") never checks for an existing name** — only a double-press guard.
4. **`_resolveExerciseIdForSave` uses `.maybeSingle()` and ignores its error.** With two existing rows of
   the same name `.maybeSingle()` errors, `existing` comes back null, and it inserts a THIRD — an existing
   duplicate begets more.
5. **No database constraint** prevents duplicate `(coach, name)` rows; every check is check-then-insert.
6. Smaller: `.ilike('name', trimmed)` is used as an EQUALITY test, so a `_` or `%` in an exercise name acts
   as a wildcard and can match a different exercise.

