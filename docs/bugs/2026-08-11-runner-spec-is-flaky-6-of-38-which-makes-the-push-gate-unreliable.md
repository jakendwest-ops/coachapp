---
id: 2026-08-11-runner-spec-is-flaky-6-of-38-which-makes-the-push-gate-unreliable
status: fixed-awaiting-jake
priority: medium
reported: 2026-08-11
---

# runner.spec.js is flaky (6 of 38), so checks.sh blocks pushes at random

Measured 2026-08-11 across three runs:

- Full suite: 384 passed, **0 failed**, 8 flaky
- `runner.spec.js` alone: 32 passed, **0 failed**, 6 flaky
- `checks.sh`: 1 "failed" (`runner.spec.js:623`) — which passes alone AND in a full runner.spec.js run

Different tests flake each run and all pass on retry, so this is not a code regression — a regression
would fail the SAME test every time. It is the fixture-borrowing pattern already recorded as a lesson:
tests that `.first()` against shared data rather than owning their fixtures.

**Why it matters:** `checks.sh` is the pre-push gate. A gate that fails at random either blocks good
pushes or trains you to ignore it — and an ignored gate is worse than no gate.

Not caused by this session's work; surfaced by running the suite many times in one day.
NOT YET FIXED — needs the flaky tests given their own fixtures.

---

**✅ FIXED + LIVE `ee928b3` + `c15eb82` (2026-08-12). The gate is trustworthy again.**

Root cause confirmed: `runner.spec.js` reached the runner by clicking
`button:has-text("Start")`.first() — "whatever workout is first on the page" — 22 times. Other tests
in the same run mutate that client's templates and programmes, so which workout is first changed
mid-run.

Fixed with an `ownWorkout` fixture in `tests/fixtures.js`: each test gets a workout it alone owns,
created as the PT in a second context (a client CANNOT insert a `workout_templates` row — probed it,
RLS refuses, correctly), started via `startWorkoutRunner(clientId, templateId)` — the same entry
point the real Start button uses, so no code under test is bypassed.

**Evidence it is closed:** `checks.sh` run three consecutive times — **56 passed, 0 failed, 0 flaky
in every one**. Full suite went from 382-387 passed / 6-9 flaky to **413 passed / 0-1 flaky**.

The conversion also exposed a test that could not fail: 'save session lands on workouts page' passed
whether or not post-save navigation ever ran, because the old beforeEach had already navigated there.

NOT converted, deliberately: `programs.spec.js` and `client-workout.spec.js` still borrow fixtures.
Per Jake's standing rule of 2026-08-12 — *"do not change code to fix a problem that does not exist
yet"* — the gate is measurably clean, so there is no evidence pointing at either file.
