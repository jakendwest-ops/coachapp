---
id: 2026-08-29-two-renderrunner-branches-can-never-be-true
status: open
priority: medium
reported: 2026-08-29
status_detail: "_isPlainStrengthExercise is 'return ex.type !== cardio', so isTable === (type !== cardio) and !isTable === (type === cardio). Line :872's condition is therefore (type === cardio && type !== cardio) - false for every exercise. #wr-last-session is never in the DOM, making half of renderRunnerLastSession dead. They read as live guards; the wizard deletion made them contradictory."
---

# Two `renderRunner` branches are provably always false, and read as live guards

**js/app-runner.js:872 and :875** — found by the weekly full-file review (Agent C). **Verified: this
one is airtight, not a judgement call.**

    _isPlainStrengthExercise(ex)  =>  return ex.type !== 'cardio'        // :307
    const isTable = _isPlainStrengthExercise(ex)                          // :784

So `!isTable` is exactly `ex.type === 'cardio'`, which makes `:872`:

    !isTable && ex.type !== 'cardio'    ===    ex.type === 'cardio' && ex.type !== 'cardio'

**False for every exercise, always.** Therefore `#wr-last-session` is never in the DOM, which makes the
entire `if (el) { ... }` block of `renderRunnerLastSession` (`:238-255`, the "↑ Beat · <date>" strip)
dead code.

Line `:875`'s set counter is dead for a different reason: `!isTable` restricts it to cardio, and the
pre-Start card already prints "Set N" at `:922` — so it renders twice for cardio and never for anything
else.

**These read as live guards.** Before the 2026-08-11 routing change `_isPlainStrengthExercise` was a
five-type allowlist and both conditions could be simultaneously true. The wizard deletion made them
contradictory and nothing noticed — the same shape as
[[feedback_removing_container_drops_affordances]].

**Do NOT remove the fetch.** `fetchRunnerLastSession` still feeds `_prevSetsByIndex` ghost text, so the
DB work behind the strip is live even though the strip is not.

**Fix:** delete both branches and the dead `if (el)` half of `renderRunnerLastSession`, or restate the
intent as `ex.type === 'cardio'` if the strip is still wanted for cardio. **This is a product decision,
not just a cleanup** — the "↑ Beat · <date>" strip was a real feature that silently stopped rendering.

**Closes when:** the contradiction is gone AND it is recorded which way it was resolved (restored for
cardio, or deleted) — plus, if restored, a spec asserting the strip renders.
