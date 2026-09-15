---
id: 2026-08-17-dead-code-and-lost-affordances-after-the-wizard-deletion
status: open
priority: low
reported: 2026-08-17
status_detail: "Weekly full-file review. Zero production references confirmed by grep across js/, index.html and tests/. Two items are a PRODUCT question, not cleanup."
---

# Dead code and two lost affordances left by the 2026-08-11 wizard deletion

## Structurally unreachable markup

`_isPlainStrengthExercise` reduces to `ex.type !== 'cardio'` (`js/app-runner.js:292-307`), so `isTable`
is equivalent to it and `!isTable && ex.type !== 'cardio'` is a contradiction. Two blocks can never
render:

- `app-runner.js:858` — the `#wr-last-session` **"↑ Beat · date"** strip. Also makes
  `renderRunnerLastSession`'s entire `el` branch (`:236-255`) dead. The async fetch is still needed (it
  feeds per-row ghost text), but the strip is a LOST AFFORDANCE.
- `app-runner.js:861` — the "Set N of M" counter and pip row. Also a lost affordance.

Both are the les-043 shape: removing a container takes every affordance it hosted with it.

## `editRunnerSet` is now reachable only for CARDIO, and is a weight/reps editor

The pencil Edit lives in the non-table branch (`app-runner.js:829`), which now renders only for
`ex.type === 'cardio'`. The modal offers **kg / Reps** (`:1810-1816`), and `saveEditRunnerSet` writes
`{weight, reps}` onto a `{duration, distanceM}` cardio set, guarded by `if (!reps) return` (`:1830`) — a
SILENT no-op, unlike every other input path here, which toasts.

Repro: log a Skierg round → Edit → Save → nothing happens, no message. Type reps → "saves" a value the
cardio save path (`:2401-2411`) discards.

## Confirmed-dead (zero production references)

- `startStrengthSetTimer` / `renderStrengthSetTimer` / `#wr-set-timer-overlay` / `#wr-duration-input`
  (`app-runner.js:1096-1172`) — only callers are `tests/weekly-review-2026-08-09.spec.js:23` and a
  comment. The timed-hold countdown is unreachable from the UI. Which means the 2026-08-09 fix adding
  `clearInterval(_runner?._setTimerInterval)` to `discardRunner:2271` defends a state production cannot
  enter, and the test proving it calls the function directly.
- `addExtraStrengthSet` (`app-runner.js:2048`) — zero references anywhere.
- `_METRIC_TABLE_TYPES` (`app-runner.js:280`) — referenced only by the comment recording its removal.
- `window._weightAllLogs` (`app-progress.js:857`) — written, never read.
- `#sd-save-library` fallback in `saveTemplateToLibrary` (`app-workouts.js:2619`) — the drawer button was
  removed; the sole caller always passes `this`.

## Decide before deleting

The two lost affordances are a PRODUCT question: were "↑ Beat" and "Set N of M" meant to survive the
wizard deletion? If yes this is a regression to restore, not dead code to remove. Ask Jake.
