---
id: 2026-08-17-a-policy-refused-write-reports-success-6-sites
status: confirmed
closed_by: "clause (b) — silent-refusal-2026-08-18.spec.js ran GREEN 2026-08-20 in a serialized 192-test run; red-before is recorded in this file's body. Closed on test evidence, NOT on a Jake confirmation."
priority: high
reported: 2026-08-17
status_detail: "FIXED commit ad83591, live 2026-08-18 (app-runner v71 / app-workouts v69 / app-progress v48). 7 red-before tests in tests/silent-refusal-2026-08-18.spec.js. Awaiting Jake: no live confirmation. Review caught the clone-reap being itself an unchecked unanchored write; fixed in the same commit."
---

# Six writes report success when the database refused them

A policy-blocked write in PostgREST returns `{ data: [], error: null }` — no error, zero rows. Code that
checks only `error` treats a refusal as success. Six sites do; six SIBLING functions already do it
correctly, which makes this drift rather than a design gap.

| Site | What the user is told |
|---|---|
| `js/app-runner.js:3198` `saveCoachNotes` | green "Saved ✓", note never written |
| `js/app-runner.js:3210` `deleteWorkoutLog` | navigates away as though deleted; row still there next render |
| `js/app-workouts.js:2146-2165` `_propagateExerciseChangeToTemplates` | failure count stays 0, coach told it propagated |
| `js/app-workouts.js:2695` `_resolveEditableTemplateId` | green toast "your changes now apply only to this one" |
| `js/app-workouts.js:1315` / `:1318` `moveTemplateExercise` | reorder appears to work |
| `js/app-progress.js:394` `delete1RM` | re-renders with the row still present |

## The one with a concrete trigger

`saveCoachNotes` / `deleteWorkoutLog` anchor on `.eq('coach_id', currentUser.id)`, which duplicates the
live RLS policy — so the only case where the anchor bites is the case the policy already refuses.

**Coach B takes over a client from coach A.** Pre-transfer `workout_logs` rows still carry
`coach_id = A`. Coach B opens the session, types feedback, taps Save notes → "Saved ✓", zero rows
written, note gone. Only discoverable by reloading.

## The correct pattern, already here

`.select()` on the write, then `if (!data?.length)`. Used by `saveEditTemplate`
(`app-workouts.js:2765`), `deleteTemplate` (`:2782`), `saveEditTemplateExercise` (`:2100`),
`deleteTemplateExercise` (`:2120`), `deletePerfLog` (`app-progress.js:708`), `deleteWeightLog`
(`app-progress.js:1017`), `_propagateRenameToTemplates` (`app-workouts.js:2481-2484`) — the last in the
SAME FILE as three broken ones, with a comment explaining this exact hazard.

## Caveat

For `update`/`delete`, 0 rows is genuinely ambiguous with a legitimate no-op. The **insert** branch of
`_propagateExerciseChangeToTemplates` (`:2163`) is unambiguous — an insert returning zero rows is a
refusal — so tighten that one first without risking false alarms.
