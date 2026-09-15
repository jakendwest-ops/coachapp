---
id: 2026-08-17-three-1rm-writers-drifted-on-exercise-id
status: fixed-awaiting-jake
priority: low
status_detail: "FIXED 52923dd (2026-08-26). All 3 offenders persist exercise_id; 5 red-green tests incl. a class guard. Headline still says two of three — see the 2026-08-26 correction in the body: it is three of four."
reported: 2026-08-17
status_detail: "Weekly full-file review."
---

# Two of the three 1RM writers omit `exercise_id`, so runner-logged 1RMs break on rename

`save1RM` (`js/app-progress.js:380`) writes `exercise_id: picked.id`.

`saveRunnerOneRM` (`js/app-runner.js:2628`) and `_savePostSessionOneRM` (`:2509`) both insert WITHOUT it —
even though `launchRunner:29` builds `oneRMById` keyed on `exercise_id` and `_lookupClientOneRM:1925`
prefers it over the name.

Rows written from the runner therefore survive only on the name fallback, and break silently the moment
an exercise is renamed — the precise failure `exercise_id` was added to prevent.

The mode-switch and preview helpers (`_setRunnerOneRMMode`/`_setAdd1RMMode`,
`_updateRunnerEpleyPreview`/`_updateAdd1RMEpleyPreview`) are byte-level near-duplicates, which is the
likely reason the third writer was missed when `exercise_id` was introduced.

## CORRECTION 2026-08-26 — there are THREE offenders, not two, and a FOURTH writer this row never named

Re-enumerated from scratch rather than trusting this row’s own list (les-074: a row’s inventory is what
one person found on one day). `grep -rn "exercise_name:" js/*.js` returns **20** write sites across 6
files. Of those, the ones writing `client_1rms` WITHOUT `exercise_id` are:

1. `saveRunnerOneRM` (`js/app-runner.js:2659`) — named in this row.
2. `_savePostSessionOneRM` (`js/app-runner.js:2539`) — named in this row.
3. **`_saveMissingOneRMEntries` (`js/app-programs.js:711`) — NOT named in this row.** It is the
   quick-entry that fires during programme assignment. Its own source comment records that
   `app-programs.js` was absent from the app-core inventory comment entirely, which is how its
   `client_1rms` insert survived the 2026-08-21 sweep. It then survived this row too.

The row’s framing — “two of the three 1RM writers” — also undercounts the writers: `saveOneRMGrid`
(`js/app-progress.js:119`) is a fourth, and it DOES set `exercise_id` correctly.

**All three offenders already HAVE the id and throw it away**, which makes this a pure refactor with no
lookup and no risk of auto-creating library rows:

| site | where the id is lost |
|---|---|
| `_saveMissingOneRMEntries` | `neededByName` is a Map of name→exerciseId; `app-programs.js:608` does `missing.push(name)` |
| `_savePostSessionOneRM` | `ex.exerciseId` exists; `app-runner.js:2493` returns `{ name: ex.name, ...best }` |
| `saveRunnerOneRM` | `ex.exerciseId` is directly in scope at the insert |

Scoped and approved by Jake 2026-08-26 as “refactor phase 1”: populate `exercise_id` at all three, add a
red-first test per writer, and add a class guard so a fourth cannot appear silently. **Explicitly NOT
doing the migration half** — `exercise_name` must STAY. Exercises can be deleted
(`js/app-workouts.js:1083`), so the name is a historical snapshot, not a redundant copy; dropping it
would orphan every max recorded against a since-deleted lift. That makes this not a BCNF violation at
all: the defect is the MISSING id, not the PRESENT name.

## Also: a falsy-zero divergence between kg and lb

`app-runner.js:722`:

```js
const wPlaceholder = oneRMPh || (prev?.weight_kg != null ? weightToPref(prev.weight_kg) : '') || '—'
```

`weightToPref` returns the NUMBER `0` in kg (falsy → falls through to `'—'`) and the STRING `"0"` in lb
(truthy → shows `0`). A previous 0 kg set ghosts differently by unit preference. Cosmetic, but the
identical shape already fixed and documented in `_setDetailsLine` (`app-progress.js:1234-1237`) — sibling
site, unfixed.
