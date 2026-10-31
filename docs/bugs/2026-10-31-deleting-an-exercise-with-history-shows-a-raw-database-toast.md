---
id: 2026-10-31-deleting-an-exercise-with-history-shows-a-raw-database-toast
status: open
priority: low
reported: 2026-10-31
status_detail: "open — read in code, not reproduced: deleteExercise's dbq call keeps showUserError on, so a 23503 shows 'Save failed — <Postgres text>' before the friendly 'archive it instead' toast, and files an error report for a handled case (one on 2026-10-08)."
---

# Deleting an exercise that has history shows a raw database error first

`deleteExercise` (`js/app-workouts.js`) wraps its delete in `dbq('deleteExercise', …)` with the default `showUserError: true`.
On `23503` (the exercise is still used by logged history) `dbq` first toasts "Save failed — " plus the database's own message,
and only then does `deleteExercise` show its friendly "This exercise has history attached — archive it instead of deleting."
It also files an error report for a case the code handles on purpose (one on 2026-10-08, Library page).

**Closes when:** the friendly toast shows alone and no report is filed for the handled 23503, proven by a spec (red first).
