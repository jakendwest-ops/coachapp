---
id: 2026-08-29-edit-sheet-save-does-nothing-for-every-cardio-set
status: closed
priority: high
reported: 2026-08-29
closed_by: "tests/review-fixes-2026-08-29.spec.js 'editing a logged cardio round actually saves — the Save button is not dead' — RED against the old behaviour (Expected '3:30', Received '2:00'), GREEN after. Fixed 89c2fb5."
status_detail: "CLOSED 89c2fb5. The sheet now branches on the SET shape and gives cardio Time+Distance; the strength path toasts instead of returning bare. Red-before: Expected 3:30, Received 2:00. The Edit affordance on a logged set renders only in the !isTable branch, which since the 2026-08-11 routing change means cardio only. The edit sheet has only Weight and Reps, and saveEditRunnerSet opens with a bare 'if (!reps) return'. No cardio set shape carries reps, so Save does nothing, every time, with no toast."
---

# The logged-set Edit sheet's Save button does nothing, 100% of the time

**js/app-runner.js:843** (the affordance) and **:1855-1858** (the handler) — found by the weekly
full-file review (Agent C).

`renderRunner` shows "✎ Edit" on a logged set **only inside the `!isTable` branch**, and
`isTable = _isPlainStrengthExercise(ex)`, which is literally `return ex.type !== 'cardio'`
(`app-runner.js:307`). So `!isTable` means cardio, and **Edit is reachable only for cardio/interval
exercises.**

But `editRunnerSet` renders a sheet with exactly two inputs — Weight and Reps — and
`saveEditRunnerSet` opens with:

    const reps = document.getElementById('wr-edit-reps')?.value.trim()
    if (!reps) return

**No cardio set shape carries `reps`.** `logRunnerSet` pushes `{distanceM}` or `{duration, distanceM}`
(`:973`, `:986`); `startIntervalTimer` pushes `{duration, distanceM}` (`:1360`); `_logIntervalPhase`
pushes `{phase, duration, distanceM}` (`:1336`). So `value="${s.reps||''}"` is always empty and Save
always hits the bare `return` — no toast, no message, the sheet just stays open.

**Sequence:** start a workout with a Skierg or interval exercise, complete a round, tap ✎ Edit on the
logged round, tap **Save** — nothing happens, ever. Delete works. Cancel works.

**Verified:** I confirmed `_isPlainStrengthExercise` is `ex.type !== 'cardio'`, that Edit sits in the
`!isTable` region, and that the handler's guard is a bare `return`. The exact branch nesting at `:827-843`
is taken from Agent C's reading.

**Corollary:** the branches at `:836-:841` (`s.distance_m`, `s.duration`, `s.leftReps`, plain weight/reps)
are dead — every non-cardio type now routes to the table.

**Fix:** either make the sheet metric-aware (duration/distance for cardio, matching `_blankTableRow`'s
dispatch), or drop the Edit affordance from the cardio list and use Delete + re-log. **Do not leave a bare
`return` on a required-field path** — this file's own convention (`toggleTableSet:430`,
`logRunnerSet:968`) is to toast.

**Closes when:** either editing a logged cardio round changes the stored value (spec: log a round, edit
it, assert the new value persists), or the affordance is removed and a spec asserts it is absent for
cardio. A bare unreachable-Save must not survive either way.

---

## CLOSED 2026-08-29 (`89c2fb5`) — fixed, not removed

Of the two options this row offered, the affordance was **made to work** rather than deleted. Editing a
logged round is obviously the intent — the button has been there all along — and Delete + re-log is a
worse answer mid-session.

- `editRunnerSet` now branches on **the SET's shape**, via `_isCardioSetShape`, not on `ex.type`. That
  matters: an interval round inside a mixed session is handled on its own shape, and a future metric
  cannot silently fall into the weight/reps branch.
- Cardio gets **Time + Distance (m)**, prefilled from the logged round.
- It requires **one of the two**, not duration outright. A distance-only Skierg round legitimately has
  no time, and demanding one would refuse a legitimate round —
  [[feedback_guard_risk_is_refusing_the_legitimate_user]].
- The strength branch now **toasts** instead of returning bare, matching `toggleTableSet:430` and
  `logRunnerSet:968`. **A silent return on a required field is what hid this bug**, so leaving the other
  branch silent would have left the same trap for the next metric.

**Proven both ways:**

    cardio branch bypassed -> Expected: "3:30", Received: "2:00"   (the dead button)
    cardio branch present  -> GREEN

The spec drives the real `editRunnerSet` and `saveEditRunnerSet` — no stubbing of either — so it cannot
pass by re-typing the logic it is meant to check.

**Not addressed here:** the corollary that the sheet's `s.distance_m` / `s.leftReps` branches are dead
because every non-cardio type routes to the table. That is dead code, and it belongs with the two
existing wizard-deletion rows rather than in this fix.
