---
id: 2026-08-22-zero-sessions-guard-exists-twice-only-one-copy-is-tested
status: confirmed
priority: medium
reported: 2026-08-22
closed_by: "clause (b) 2026-08-22 — but the row's PREMISE WAS FALSE and that is the finding. BOTH copies are tested, one spec each: app-programs.js:140 by regression-2026-07-13.spec.js, app-workouts.js:747 by client-workout.spec.js:225 ('a phase with no sessions assigned yet'). Proven by neutering EACH guard in turn against ITS OWN spec — the app-workouts one fails with the original crash, TypeError: Cannot read properties of undefined (reading forEach). I originally concluded it was untested because I neutered the app-workouts guard and ran the app-PROGRAMS spec, which of course still passed. Third time in one day I tested the wrong path and drew a conclusion from it. SHIPPED ANYWAY (core v15/programs v43/workouts v75): the empty-state markup is now the shared NO_SESSIONS_EMPTY_STATE so the two literals cannot drift, and the false claim is corrected in the code comment. Also settled by review: the guard is NOT dead code — the phase list is a PostgREST embed (left join) so zero-session phases DO return; my repro failed because of the hasProgram gate at app-workouts.js:641, which needs an empty phase ALONGSIDE a populated one, exactly what client-workout.spec.js already builds."
status_detail: "Found 2026-08-22 while establishing red-before for the 2026-07-13 zero-sessions crash. Found by accident: I neutered the wrong copy, the test still passed, and checking why revealed a second untested copy."
---

# The zero-sessions crash guard exists in TWO places; only one has a test

The 2026-07-13 critical — *"a phase with zero sessions kills the coach's entire client Programs tab"* —
was fixed with a `!weekNums.length` empty-state guard. That guard exists **twice**, byte-identical:

- `js/app-programs.js:140` — inside `renderClientPrograms` (coach → client profile → Programs tab).
  **Covered** by `regression-2026-07-13.spec.js`; red-before established 2026-08-22.
- `js/app-workouts.js:747` — the sibling render. **No test.** Neutering it changes nothing that any
  spec observes.

## How it was found

By accident, which is the uncomfortable part. Establishing red-before for the critical row, I neutered
`app-workouts.js:747` first, the test still passed, and I was one step from reporting the test as
decorative. Checking *which module owns `renderClientPrograms`* showed I had simply broken an
unobserved code path.

So the near-miss was mine — but the underlying fact stands: **one of the two copies of a fix for a
CRITICAL live crash has no coverage at all.**

## Why it matters

This is the documented `deletePhaseWeek` / `_cleanupPhaseWeeksBeyond` shape (2026-07-10): a fix landed
where the bug was *found*, its sibling was missed, and the sibling destroyed real Week-1 workouts for a
day. Here both copies got the fix — but only one got the test, so only one is defended against
regression.

The guard is a duplicated literal, which is the other half of the problem: the empty-state markup is
copy-pasted rather than shared, so the two can drift.

**Closes when:** either the `app-workouts.js:747` path gets its own red-before/green-after test, or the
two copies are collapsed into one shared helper that the existing test already covers.

---

## PARTIAL 2026-08-22 — drift closed, coverage gap NOT closed

**Done:** the empty-state markup is now `NO_SESSIONS_EMPTY_STATE` in app-core.js, referenced by both
sites (app-core v15 / app-programs v43 / app-workouts v75). The two byte-identical literals can no
longer drift. Verified the guard still bites through the indirection: neutering
`!weekNums.length` at app-programs.js:140 still fails regression-2026-07-13.spec.js.

**NOT done — and an honest complication.** The two sites cannot be collapsed further: after the guard
app-programs renders a plain week list and app-workouts renders week TABS with `_selectReadWeek`. So
the GUARD is still duplicated, and the app-workouts copy still has no test.

I wrote one and could not make it reproduce. Assigning a programme whose only phase has zero sessions
to the E2E client, then calling `renderClientWorkoutsPage`, renders 6067 chars of page with no trace
of the phase at all — not the empty-state, not the phase name. **That suggests the phase list on this
path may require `program_phase_workouts` to exist (an inner join), in which case a zero-session phase
never reaches the guard and the guard is unreachable dead code on this site.**

Deliberately did NOT ship a test that passes for the wrong reason, and did NOT delete the guard on a
suspicion. The next step is to read `renderClientWorkoutsPage`'s phase query and settle which it is:
if the join excludes empty phases the guard should be deleted with a comment saying why; if it does
not, the test needs a different fixture shape.
