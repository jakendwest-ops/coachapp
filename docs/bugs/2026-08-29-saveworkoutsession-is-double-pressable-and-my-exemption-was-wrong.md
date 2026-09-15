---
id: 2026-08-29-saveworkoutsession-is-double-pressable-and-my-exemption-was-wrong
status: closed
priority: high
reported: 2026-08-29
closed_by: tests/reentry-double-invoke-2026-09-04.spec.js + tests-node/exemptions.test.mjs
status_detail: "CLOSED 2026-09-04. Both clauses met. saveWorkoutSession is guarded (app-runner.js:3137) and a spec now double-invokes the real save path: RED without the guard (Received: 2 workout_logs), GREEN with it (1). The second clause — every remaining FROZEN_UNGUARDED reason checked against the code — is now MECHANISED rather than done once by hand, and found a second false exemption on its first run (generatePhasePeriodization)."
---

# `saveWorkoutSession` is double-pressable, and the exemption I wrote for it was factually wrong

**js/app-runner.js:2915** — found by the weekly full-file review (Agent B), verified line by line.

`tests/reentry-guard-2026-08-28.spec.js:69` exempts it with:

    saveWorkoutSession: 'manual-log twin of saveRunnerSession; navigates away on success'

**Both halves fail on inspection.**

1. **"twin of saveRunnerSession"** — `saveRunnerSession` disables its button **synchronously at :2336**,
   before the first await:

       const saveBtn = document.querySelector('#workout-runner button[onclick="saveRunnerSession()"]')
       if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...' }

   `saveWorkoutSession` has **no disable anywhere in its body** — verified by grepping the whole function
   range for `disabled`/`data-busy`, which returns nothing. Its button (`:2866`) carries no
   `data-busy-text` either. They are not twins in the only respect that mattered.

2. **"navigates away on success"** — `closeModal` is at **:3020**, after **eight awaits** including three
   inserts (`:2927` client lookup, `:2936` `workout_logs`, `:2952`, `:2962`
   `workout_log_exercises`, `:2965`, `:3005` `workout_log_sets`, `:3010`, `:3011`).

**Sequence:** two rapid taps both clear the synchronous validation at `:2917-2922` and both run the full
insert chain, producing **two duplicate `workout_logs` rows plus their exercises and sets.** Coach-only
path (reachable from `renderClientWorkouts`'s "Log past session", `app-workouts.js:3092`), so no solo
exposure.

## Why this matters beyond the one function

This is the **second** documented case of me writing a confident guard justification that does not survive
reading the code — the first was the decorative `showAddExerciseToTemplateModal` registration found by the
pre-push review on 2026-08-28. Both were found by review, not by me.

**A written exemption is a claim, and this project's rule is that a claim needs a check.** The exemption
list in that spec asserts things about code ("navigates away on success", "the button goes with it") that
nothing verifies. See [[feedback_written_rules_dont_reduce_errors]] and
[[feedback_reports_success_doing_nothing]].

**Fix:** guard it, and correct the exemption text. Then consider whether the exemption list can be made
checkable rather than prose — e.g. asserting the named mechanism actually exists (a `disabled` assignment
before the first await, a `closeModal` before the first await) instead of describing it.

**Closes when:** `saveWorkoutSession` is guarded and a spec double-invokes it asserting exactly one
`workout_logs` row (RED with the guard removed, GREEN with it), AND every remaining entry in
`FROZEN_UNGUARDED` has had its stated reason checked against the code rather than trusted.

---

## CLOSED 2026-09-04 — and the second clause is now a machine, not a one-off audit

**Clause 1 — guarded and proven.** `guardReentry('saveWorkoutSession')` is in place at
`app-runner.js:3137`, and `tests/reentry-double-invoke-2026-09-04.spec.js` now double-invokes the REAL
save path (both calls started before either is awaited — awaiting the first would test something that
cannot happen):

| | `workout_logs` rows |
|---|---|
| guard removed | **2** — the duplicated session this row described |
| guard in place | **1** |

The generic mechanism test in `reentry-guard-2026-08-28.spec.js` already proved `guardReentry` blocks
a synthetic probe. That is a different claim from *"the real path, with its eight awaits and three
inserts, writes one session"* — which is what this row asked for and what had never been tested.

The spec owns its own client fixture rather than borrowing the first one it finds
([[feedback_test_fixture_isolation]]), and every cleanup delete calls `.select()` and asserts the
rowcount, because an RLS-refused delete resolves as `{ data: [], error: null }`.

**Clause 2 — mechanised, and it immediately caught another one.** Rather than auditing the remaining 23
reasons by hand once, `tests-node/exemptions.test.mjs` checks the claim shapes on every run:

- `"internal — runs inside X"` → no inline `on*=` handler may name it (8 entries).
- `"confirm()-gated"` → the `confirm()` must be reached **synchronously**, before the first `await`.
- `"one row, …"` → exactly ONE insert (14 entries). This is the shape that was missed here:
  saveWorkoutSession's reason implied a single cheap row while it wrote three tables.

**It found `generatePhasePeriodization` on its first run** — a destructive, double-runnable operation.
Filed separately as [[2026-09-04-generatephaseperiodization-confirm-is-not-a-reentry-barrier]].

**What is still a human's job:** the 14 "one row" reasons also assert that a duplicate is *visible and
one tap to delete*. That is a product judgement and is deliberately not mechanised. The insert COUNT is
not a judgement, and it is what keeps the consequence small.

This row's wider point — *"a written exemption is a claim, and this project's rule is that a claim
needs a check"* ([[feedback_written_rules_dont_reduce_errors]]) — is now enforced rather than restated.
