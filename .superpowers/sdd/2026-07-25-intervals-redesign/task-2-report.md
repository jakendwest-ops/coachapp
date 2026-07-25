# Task 2 Report: Phase expansion — the pure function everything rests on

## Status
DONE

## Commit
- SHA: `d8538a6` — "intervals: pure block-to-phase expansion + total-time helper"

## Test Summary
5 tests passed (12.1s total)
- ✅ reproduces the reference app's 27:00 worked example exactly
- ✅ omits zero-valued phases rather than emitting 0-second ones
- ✅ nests sets inside cycles and tags each work round
- ✅ a distance block yields work rounds with no duration, and an honest partial total
- ✅ guards against a missing/zero sets or cycles count producing an empty block

## Interfaces Implemented
- `_expandIntervalBlock(block) → Array<{phase, secs, distanceM?, set?, cycle?}>`
- `_intervalTotalSecs(phases) → { total: number, hasUnknown: boolean }`

## Implementation Details
- Added two pure functions to `js/app-workouts.js` after `_resolveMetricType` (line ~111)
- Created `tests/intervals-redesign-2026-07-25.spec.js` with 5 Playwright E2E test cases
- Transcribed code exactly from the brief without any modifications
- Both functions are deliberately pure (no DOM, no globals, no timers)
- Handles all phase types: countdown, warmup, work, rest, recovery, cooldown
- Correctly clamps sets and cycles to minimum 1 (guards against empty blocks)
- Correctly marks distance-based work rounds with `secs: null` for manual completion
- Correctly tracks set and cycle indices for proper nesting

## Concerns
None. All tests pass; implementation follows the brief exactly.

---

## Fix Round 1

### Issue

Cache-bust version in `index.html` was not bumped for `app-workouts.js`. CLAUDE.md requires bumping `?v=N` in the same commit as any module change.

### Change

In `index.html`, line 107:

- Before: `<script src="js/app-workouts.js?v=35"></script>`
- After: `<script src="js/app-workouts.js?v=36"></script>`

### Verification

Command: `npx playwright test tests/intervals-redesign-2026-07-25.spec.js --reporter=list`

Output:

```text
Running 5 tests using 1 worker

  ok 1 [chromium] › tests\intervals-redesign-2026-07-25.spec.js:7:3 › Interval block expansion (2026-07-25) › reproduces the reference app's 27:00 worked example exactly (4.3s)
  ok 2 [chromium] › tests\intervals-redesign-2026-07-25.spec.js:25:3 › Interval block expansion (2026-07-25) › omits zero-valued phases rather than emitting 0-second ones (2.1s)
  ok 3 [chromium] › tests\intervals-redesign-2026-07-25.spec.js:34:3 › Interval block expansion (2026-07-25) › nests sets inside cycles and tags each work round (1.8s)
  ok 4 [chromium] › tests\intervals-redesign-2026-07-25.spec.js:42:3 › Interval block expansion (2026-07-25) › a distance block yields work rounds with no duration, and an honest partial total (1.8s)
  ok 5 [chromium] › tests\intervals-redesign-2026-07-25.spec.js:56:3 › Interval block expansion (2026-07-25) › guards against a missing/zero sets or cycles count producing an empty block (1.7s)

  5 passed (13.1s)
```

Result: All tests still pass with the bumped version.
