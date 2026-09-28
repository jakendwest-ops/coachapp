---
id: 2026-09-28-runner-tabs-show-position-not-completion-and-next-exercise-cannot-return-to-a-skipped-one
status: fixed-awaiting-jake
priority: medium
reported: 2026-09-28
status_detail: "FIXED 2026-09-28, uncommitted-to-release until Jake confirms in the real app. Reported by Jake from a walkthrough of the workout runner (screenshots), items 4 and 5 of 8. Red first: tests/runner-exercise-nav-2026-09-28.spec.js went 9 of 9 red on the old code for the intended reasons (tab 1, complete, painted rgba(99,102,241,0.45) instead of green; Next from a finished 3 landed on index 3, not 1), then green. A fresh-context review then found two flaws in my FIRST fix — interval warm-up/cool-down counted as work rounds, and a wrap-round rule that cycles for ever when every exercise is half done — both fixed and each now has a test that fails when the fix is removed (5 deliberate breakages, each turned its test red, file restored byte-identical). Same root: the runner had no notion of an exercise being 'completed', only of a position (exIdx)."
---

# Runner: the numbered tabs show position, not completion — and "Next exercise" can never go back

## What Jake saw

- **Tabs go purple for exercises that were never done.** Screenshot: on exercise 6, tabs 4 and 5 are light purple,
  and Jake's words are "should not turn purple if the exercise has not been completed."
- **Skipping ahead breaks "Next".** From exercise 1 a user taps 3. When they finish and press "Next exercise" they
  should go back to 2 (the next one in order that isn't done). Completed tabs should turn green.

## What the code does (confirmed by reading, not yet by running)

`js/app-runner.js:927` — tab background:

    i < _runner.exIdx ? 'rgba(99,102,241,0.45)' : i === _runner.exIdx ? 'var(--accent)' : 'var(--surface-2)'

The light purple means "an earlier number than the current exercise". It is purely positional: skip 1 to 3 and the
never-touched 2 turns purple; do 3 first, go back to 1, and the finished 3 does not.

`js/app-runner.js:2065-2074` — `skipToNextExercise` is the only place the runner advances, and it is a bare
`_runner.exIdx++`, falling to `showRunnerFinish()` on the last index. It cannot return to a skipped exercise, and on
the last exercise it finishes the workout even if earlier ones were never done.

## Where completion already lives (so this needs no new state)

A plain strength exercise's completed sets are `ex.tableRows.filter(r => r.done)`; other types use
`ex.loggedSets`. Both are already read for the draft-resume check (`js/app-runner.js:201`, `:226`). What is missing
is one helper that turns them into "this exercise is complete".

## Not decided

What counts as complete for an exercise with some sets ticked but not all — proposed: only when every listed set is
ticked, otherwise it stays grey. Jake's wording ("completed") supports that; not yet confirmed.

**Closes when** a spec that fails today passes: (1) a tab is green only for a completed exercise and purple only for
the current one; (2) skip 1→3, finish 3, "Next exercise" lands on 2; (3) with everything complete, "Next" finishes.

## Resolution (2026-09-28)

`js/app-runner.js`: `_isExerciseComplete(ex)` (every set done; interval blocks count WORK rounds only, through the same
`_countableSets` filter the finish screen and My Progress use) and `_nextExerciseTarget()`:

- from a **completed** exercise, Next goes to the lowest one still to do — skip 1 to 3, finish 3, and it returns to 2;
- from an **unfinished** one (a skip) it goes to the next unfinished one after it, and **finishes if there is none**.

Tabs: green = complete (a finished exercise you are on keeps its green and gets a white inner ring), purple = the current
one, plain = anything else. The "Next:" lines, the button label, both rest bars and the cardio/interval auto-advance all
ask `_nextExerciseTarget`, so they cannot disagree; `skipToNextExercise` now goes through `runnerJumpTo`.

**What changed between my first fix and this one, and why.** My first version wrapped round to the start when nothing lay
ahead. The reviewer's case: two exercises, both half done — A goes to B, B wraps to A, and the button never says Finish.
The first version also counted an interval block's warm-up and cool-down as sets, so 'warm-up + 2 of 3 rounds' read as
complete. Both were mine; neither was in the tests until the review.

**Left open, on purpose.**
- An exercise with **no sets logged** has no Next/Skip button — only "↑ Log a set to continue". Now that Next can send a user
  back to a skipped exercise, the way out of one they don't want to do is the tabs or the red End button. The runner
  restructure (item 7, fixed bottom bar) is the right place to fix it.
- "Done" is shown by colour only (green vs plain). The tab title says "— done" for screen readers; there is no tick.
- The tab strip is centred on the current tab after each render, but not re-fitted on rotate/resize.
