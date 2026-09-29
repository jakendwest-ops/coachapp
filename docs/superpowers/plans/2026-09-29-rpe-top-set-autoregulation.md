# RPE Top Set → Live e1RM → Autoregulated Backoff Sets — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A coach prescribes a top set (reps @ RPE); the lifter logs it in the runner; the app estimates their 1RM from that performance and uses it to set the target weight for that exercise's backoff sets, live, in the same session.

**Architecture:** One existing function (`_estimate1RM`) gains optional RPE awareness via a hard-coded RTS chart. Two new `sets_json` fields let a coach mark a top set and point later sets at it. The runner gains the effort input it has never had, computes the e1RM when the top set is ticked, and resolves those later sets against it through the existing `_calcWeightFromPct`. No new tables, no migration, no new queries.

**Tech Stack:** Vanilla ES6+ browser JS, no build step, no framework. Supabase (Postgres + RLS) via `supabase-js` v2. Tests: `node:test` for pure functions (`npm run test:unit`), Playwright for E2E (`npm test`).

**Spec:** `docs/superpowers/specs/2026-09-29-rpe-top-set-autoregulation-design.md`

## Global Constraints

- **Bump the `?v=N` cache-bust of every module you change, in the same commit.** Current: `js/app-workouts.js?v=135`, `js/app-runner.js?v=96` (`index.html:161-162`).
- **`_cleanTemplateSets` (`js/app-workouts.js:377`) is an ALLOWLIST.** A `sets_json` key absent from it is silently dropped on save — no error, no warning. Any new set field must be added there or it will appear to work and lose the value.
- **RIR and RPE run in opposite directions.** RIR 2 is near-maximal; RPE 2 is a warm-up. Never hardcode `effort_type`; always derive it from the prescription's `effortType`.
- **0 is a real value, never a falsy check.** RIR 0 means "to failure". Use `_hasNumVal`, not truthiness, for any effort or weight value.
- **No PII in `log.*` calls** — ids and dates only, never weights or health values.
- **Weights are stored and rounded in canonical kg**; only display converts, via `fmtWeight` / `weightToPref`.
- **`multi-agent-review` runs before the push** (this is not ownership/RLS work, so review gates the push, not each commit).
- Run `npm run test:unit` and the specs you touched before each commit. A push runs static checks only — no browser tests — so master can hold a browser regression if you skip this.

## Review Focus

Five failure modes the spec implies but no task's happy-path test would catch. Each has a test assigned to the task that owns the code.

1. **Top set ticked with an RPE but no weight** (or weight 0) → must produce no e1RM and no chip, not `NaN` or `Infinity`. *(Task 4)*
2. **Top set taken past 12 reps** → `_estimate1RM` returns null; backoff rows must say "Can't estimate from this set", not "Log the top set first", and must not crash. *(Task 4)*
3. **An effort value outside the table's 6–10 range** (RPE 3, or RIR 8 → RPE 2) → clamps to 6; must never index an undefined table cell and emit `NaN`. *(Task 1)*
4. **An lb-preference account** → the chip and every backoff target render in lb; the rounding still happens in kg. The suite runs in kg throughout, so this is invisible unless explicitly tested. *(Task 5)*
5. **`intensityBasis: 'topSet'` on a row whose exercise has no `isTopSet` row 0** (coach toggled it off, or legacy/hand-edited `sets_json`) → falls back to the placeholder, never to a stored-1RM number and never a crash. *(Task 5)*

---

## File Structure

| File | Responsibility | Tasks |
|---|---|---|
| `js/app-workouts.js` | `_RPE_PCT_TABLE`, `_effortToRPE`, `_clampRpe`, `_estimate1RM`; the `_cleanTemplateSets` allowlist; the builder's set-row UI | 1, 3 |
| `js/app-runner.js` | effort input + capture; live e1RM computation; the chip; backoff target resolution; post-session prefill | 2, 4, 5, 6 |
| `index.html` | `?v=N` cache-bust for both modules | every task |
| `tests-node/pure.test.mjs` | unit tests for the table and the estimator | 1 |
| `tests/rpe-top-set-2026-09-29.spec.js` | E2E for capture, builder round-trip, runner behaviour | 2, 3, 4, 5 |

---

### Task 1: RPE table and RPE-aware `_estimate1RM`

**Files:**
- Modify: `js/app-workouts.js:105-111` (add the table and helpers above `_estimate1RM`, change the function)
- Modify: `index.html:161` (`?v=135` → `?v=136`)
- Test: `tests-node/pure.test.mjs`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `_estimate1RM(weight, reps, opts)` where `opts` is `{ effortType, effortValue }` or omitted; returns a Number or `null`. `_RPE_PCT_TABLE[reps][rpe]` → Number (percent). `_effortToRPE({effortType, effortValue})` → Number or `null`. `_clampRpe(rpe)` → Number in [6,10] snapped to 0.5. Tasks 4 and 5 call `_estimate1RM` with `opts`.

- [ ] **Step 1: Write the failing tests**

Add to `tests-node/pure.test.mjs`, inside the existing describe block that holds the other `_estimate1RM` tests:

```js
test('_RPE_PCT_TABLE is internally consistent — X reps @ RPE Y equals (X + 10 - Y) reps @ RPE 10', () => {
  // An RPE 8 triple and a 5-rep max are the same performance. This invariant is the transcription
  // guard: it catches a mistyped cell that a spot-check of three values would sail past.
  const t = get('_RPE_PCT_TABLE')
  for (let reps = 1; reps <= 12; reps++) {
    for (let rpe = 6; rpe <= 10; rpe++) {
      const equivalent = reps + (10 - rpe)
      if (equivalent > 12) continue
      assert.equal(t[reps][rpe], t[equivalent][10],
        `${reps} reps @ RPE ${rpe} should equal ${equivalent} reps @ RPE 10`)
    }
  }
})

test('_estimate1RM uses the RPE table when an effort value is supplied', () => {
  // 3 @ RPE 8 = 86.3% of 1RM. 100 / 0.863 = 115.87...
  const r = get('_estimate1RM')(100, 3, { effortType: 'rpe', effortValue: 8 })
  assert.equal(Math.round(r * 100) / 100, 115.87)
})

test('_estimate1RM treats RIR 2 and RPE 8 as the same performance', () => {
  const f = get('_estimate1RM')
  assert.equal(f(100, 3, { effortType: 'rir', effortValue: 2 }),
               f(100, 3, { effortType: 'rpe', effortValue: 8 }))
})

test('_estimate1RM RPE-adjusts a submaximal single', () => {
  // 1 @ RPE 8 = 92.2%. The lifter says they had ~2 more in them, so this is NOT their max.
  const r = get('_estimate1RM')(100, 1, { effortType: 'rpe', effortValue: 8 })
  assert.equal(Math.round(r * 100) / 100, 108.46)
})

test('_estimate1RM still returns the weight for a single at RPE 10 or with no effort', () => {
  // The 2026-09-04 rule, narrowed not removed: a maximal or untagged single is measured fact.
  const f = get('_estimate1RM')
  assert.equal(f(100, 1, { effortType: 'rpe', effortValue: 10 }), 100)
  assert.equal(f(100, 1), 100)
  assert.equal(f(100, 1, {}), 100)
})

test('_estimate1RM clamps an out-of-range effort instead of returning NaN', () => {
  const f = get('_estimate1RM')
  // RPE 3 is below the chart. Clamp to 6 rather than index an undefined cell.
  assert.equal(f(100, 3, { effortType: 'rpe', effortValue: 3 }),
               f(100, 3, { effortType: 'rpe', effortValue: 6 }))
  // RIR 8 converts to RPE 2 — same clamp.
  assert.equal(f(100, 3, { effortType: 'rir', effortValue: 8 }),
               f(100, 3, { effortType: 'rpe', effortValue: 6 }))
  assert.ok(Number.isFinite(f(100, 3, { effortType: 'rpe', effortValue: 3 })))
})

test('_estimate1RM ignores a blank or non-numeric effort rather than throwing', () => {
  const f = get('_estimate1RM')
  assert.equal(f(100, 5, { effortType: 'rpe', effortValue: '' }), f(100, 5))
  assert.equal(f(100, 5, { effortType: 'rpe', effortValue: null }), f(100, 5))
  assert.equal(f(100, 5, { effortType: 'rpe', effortValue: 'abc' }), f(100, 5))
})

test('_estimate1RM still refuses beyond the rep cap even with an RPE', () => {
  assert.equal(get('_estimate1RM')(100, 13, { effortType: 'rpe', effortValue: 8 }), null)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit`
Expected: FAIL — `_RPE_PCT_TABLE` is undefined, and the RPE-aware assertions get plain Epley numbers.

- [ ] **Step 3: Add the table and helpers**

Insert immediately above `const _ESTIMATE_1RM_MAX_REPS = 12` at `js/app-workouts.js:105`:

```js
// RTS / Tuchscherer RPE chart: [reps][RPE] -> % of 1RM. RPE 6-10 in 0.5 steps, reps 1-12.
// Every formula on the Wikipedia 1RM page (Epley, Brzycki, et al.) is a TO-FAILURE model — it
// assumes the set ended because it could not continue. "3 @ RPE 8" is two reps short of that, so
// those formulas under-predict it. This chart is what makes a submaximal set estimable.
//
// Structural invariant, asserted in tests-node/pure.test.mjs: X reps @ RPE Y == (X + 10 - Y) reps
// @ RPE 10, because an RPE 8 triple and a 5-rep max are the same performance. Any edit to a cell
// here must keep that true.
const _RPE_PCT_TABLE = {
  1:  { 10:100.0, 9.5:97.8, 9:95.5, 8.5:93.9, 8:92.2, 7.5:90.7, 7:89.2, 6.5:87.8, 6:86.3 },
  2:  { 10:95.5,  9.5:93.9, 9:92.2, 8.5:90.7, 8:89.2, 7.5:87.8, 7:86.3, 6.5:85.0, 6:83.7 },
  3:  { 10:92.2,  9.5:90.7, 9:89.2, 8.5:87.8, 8:86.3, 7.5:85.0, 7:83.7, 6.5:82.4, 6:81.1 },
  4:  { 10:89.2,  9.5:87.8, 9:86.3, 8.5:85.0, 8:83.7, 7.5:82.4, 7:81.1, 6.5:79.9, 6:78.6 },
  5:  { 10:86.3,  9.5:85.0, 9:83.7, 8.5:82.4, 8:81.1, 7.5:79.9, 7:78.6, 6.5:77.4, 6:76.2 },
  6:  { 10:83.7,  9.5:82.4, 9:81.1, 8.5:79.9, 8:78.6, 7.5:77.4, 7:76.2, 6.5:75.1, 6:73.9 },
  7:  { 10:81.1,  9.5:79.9, 9:78.6, 8.5:77.4, 8:76.2, 7.5:75.1, 7:73.9, 6.5:72.3, 6:70.7 },
  8:  { 10:78.6,  9.5:77.4, 9:76.2, 8.5:75.1, 8:73.9, 7.5:72.3, 7:70.7, 6.5:69.4, 6:68.0 },
  9:  { 10:76.2,  9.5:75.1, 9:73.9, 8.5:72.3, 8:70.7, 7.5:69.4, 7:68.0, 6.5:66.7, 6:65.3 },
  10: { 10:73.9,  9.5:72.3, 9:70.7, 8.5:69.4, 8:68.0, 7.5:66.7, 7:65.3, 6.5:64.0, 6:62.6 },
  11: { 10:70.7,  9.5:69.4, 9:68.0, 8.5:66.7, 8:65.3, 7.5:64.0, 7:62.6, 6.5:61.3, 6:59.9 },
  12: { 10:68.0,  9.5:66.7, 9:65.3, 8.5:64.0, 8:62.6, 7.5:61.3, 7:59.9, 6.5:58.6, 6:57.4 }
}

// RIR and RPE are the SAME numeric field stored with different meanings and OPPOSITE directions:
// RIR 2 is near-maximal, RPE 2 is a warm-up. Converting here, once, is what stops that inversion
// reaching the estimate. (The display-side version of this bug was fixed 2026-08-11.)
function _effortToRPE(opts) {
  if (!opts) return null
  const v = parseFloat(opts.effortValue)
  if (!Number.isFinite(v)) return null
  return opts.effortType === 'rir' ? 10 - v : v
}

// Snap to the 0.5 steps the chart has, and clamp to its range. Below RPE 6 the set is too far from
// maximal to extrapolate from honestly, so 6 is the floor rather than an invented row.
function _clampRpe(rpe) {
  return Math.min(10, Math.max(6, Math.round(rpe * 2) / 2))
}
```

- [ ] **Step 4: Change `_estimate1RM`**

Replace the body of `_estimate1RM` (`js/app-workouts.js:106-111`) with:

```js
function _estimate1RM(weight, reps, opts) {
  const w = parseFloat(weight), r = parseInt(reps)
  if (!(w > 0) || !(r > 0) || r > _ESTIMATE_1RM_MAX_REPS) return null
  // An RPE-tagged submaximal set is estimable at ANY rep count, including 1 — at RPE 8 the lifter
  // is stating they had ~2 more in them, so the weight is not their max and returning it unchanged
  // would under-predict. This NARROWS the 2026-09-04 rule below rather than removing it: that rule
  // protects a single that is a genuine demonstrated max, which is what an untagged or RPE-10
  // single still is.
  const rpe = _effortToRPE(opts)
  if (rpe != null && rpe < 10) return w / (_RPE_PCT_TABLE[r][_clampRpe(rpe)] / 100)
  if (r === 1) return w                       // measured, not estimated
  return w * (1 + r / 30)
}
```

Leave the existing comment block at `:91-104` in place and above this — it documents why the cap and the singles rule exist.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:unit`
Expected: PASS, including the four pre-existing `_estimate1RM` tests, which must not be edited.

- [ ] **Step 6: Bump the cache-bust and commit**

Change `index.html:161` to `<script src="js/app-workouts.js?v=136"></script>`.

```bash
git add js/app-workouts.js index.html tests-node/pure.test.mjs
git commit -m "feat(1rm): RPE-aware estimation via the RTS chart

An RPE-tagged set is submaximal, so the to-failure formulas under-predict it.
Adds the reps x RPE -> %1RM table and an optional third argument to
_estimate1RM; callers that pass nothing are byte-identical to before.

Narrows the 2026-09-04 singles rule: a single at RPE < 10 is now estimated,
because the lifter has stated it was not their max. An untagged or RPE-10
single is still returned unchanged.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Runner effort capture (the gap-0 prerequisite)

Nothing after this works until the runner can record an RPE. `js/app-runner.js:3038` documents that it currently cannot.

**Files:**
- Modify: `js/app-runner.js:719-726` (`_blankTableRow`), `:739-748` (`_syncLoggedSetsFromTable`), `:999-1010` (`inCell`/`inDone` — add ids), `:1094-1106` (weight_reps table row), `:1127-1129` (table header), `:3044` (the parked write hook)
- Modify: `index.html:162` (`?v=96` → `?v=97`)
- Create: `tests/rpe-top-set-2026-09-29.spec.js`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `tableRows[i].effort` (String, may be `''`); `loggedSets[i].effort` (String or null) and `.effortType` (`'rpe'`|`'rir'`); `workout_log_sets.effort_value` (Number) + `.effort_type` written from the prescription. Every table input gains `id="set-<rowIndex>-<field>"` and each ✓ gains `id="set-<rowIndex>-done"` — Tasks 4, 5 and 6 address the table through these. Task 4 reads `tableRows[i].effort`.

- [ ] **Step 1: Write the failing tests**

Create `tests/rpe-top-set-2026-09-29.spec.js`. Follow the login/fixture helpers the existing specs use — read `tests/runner.spec.js`'s imports and `beforeEach` and copy that shape. This spec must create its **own** template and client fixture, never reuse "whatever is first" (shared-fixture reuse caused real flakiness here on 2026-07-10).

```js
// Effort capture in the runner's strength table (gap 0, 2026-09-29).
// Before this, app-runner.js:3038 recorded that the in-gym runner captured NO effort at all —
// effort only reached the DB through the manual Log Session modal.

test('a set row with a prescribed effort renders an effort input', async ({ page }) => {
  // fixture: one exercise, set 1 has effortType 'rpe' + effortMin 8
  await startRunnerWithFixture(page, { sets: [{ repsMin: 3, effortType: 'rpe', effortMin: 8 }] })
  await expect(page.locator('#set-0-effort')).toBeVisible()
})

test('a set row with NO prescribed effort renders no effort input', async ({ page }) => {
  // The other half of the rule. Without this the "only where prescribed" scoping is unproven,
  // and an input on every row would pass the test above just as well.
  await startRunnerWithFixture(page, { sets: [{ repsMin: 5 }] })
  await expect(page.locator('#set-0-effort')).toHaveCount(0)
})

test('a prescribed RIR saves effort_type rir, not rpe', async ({ page }) => {
  // app-runner.js:3044 hardcoded 'rpe'. RIR 2 is near-maximal, RPE 2 is a warm-up, so saving one
  // as the other does not mislabel the number — it inverts its meaning. Fixed for display
  // 2026-08-11; this is the capture-side equivalent.
  await startRunnerWithFixture(page, { sets: [{ repsMin: 5, effortType: 'rir', effortMin: 2 }] })
  await page.fill('#set-0-weight', '100')
  await page.fill('#set-0-reps', '5')
  await page.fill('#set-0-effort', '2')
  await page.click('#set-0-done')
  const saved = await finishSessionAndReadSets(page)
  expect(saved[0].effort_type).toBe('rir')
  expect(saved[0].effort_value).toBe(2)
})

test('a blank effort field saves no effort_value, and RIR 0 saves as 0', async ({ page }) => {
  // RIR 0 means "to failure" — a real, common prescription. A truthy check would drop it.
  await startRunnerWithFixture(page, { sets: [
    { repsMin: 5, effortType: 'rir', effortMin: 0 },
    { repsMin: 5, effortType: 'rir', effortMin: 0 }
  ] })
  await page.fill('#set-0-weight', '100'); await page.fill('#set-0-reps', '5')
  await page.fill('#set-0-effort', '0');   await page.click('#set-0-done')
  await page.fill('#set-1-weight', '100'); await page.fill('#set-1-reps', '5')
  await page.click('#set-1-done')
  const saved = await finishSessionAndReadSets(page)
  expect(saved[0].effort_value).toBe(0)
  expect(saved[1].effort_value ?? null).toBeNull()
})
```

Write `startRunnerWithFixture` and `finishSessionAndReadSets` as local helpers in this spec file, building the template through the same API calls the other runner specs use, and deleting the fixture in an `afterEach` (E2E debris in the live DB was a real problem — see `scripts/reap-e2e-debris.mjs`).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx playwright test tests/rpe-top-set-2026-09-29.spec.js`
Expected: FAIL — `#set-0-effort` does not exist.

- [ ] **Step 3: Give the table inputs ids so they can be addressed**

`inCell` (`js/app-runner.js:999`) renders its inputs with **no `id` attribute** — it binds via an
inline `oninput` that writes straight into `_runner.exercises[…].tableRows[i][field]`. Nothing in the
table is selectable by id today, so the tests above cannot target it and neither can any future
runner test.

Add an id to the `<input>` in `inCell` (`js/app-runner.js:1007`):

```js
    return `<input id="set-${i}-${field}" type="${fmt ? 'text' : 'number'}" inputmode="${mode}" ...
```

Do the same for the ✓ button in `inDone`, as `id="set-${i}-done"`. Use the `set-` prefix, **not**
`rt-`: `rt-countdown` and `rt-ring` already belong to the rest timer (`js/app-runner.js:959`, `:2148`)
and reusing that prefix for table rows would be actively confusing.

This is an additive attribute on a shared helper used by every metric type — no behaviour changes.

- [ ] **Step 4: Carry an effort field through the row lifecycle**

In `_blankTableRow` (`js/app-runner.js:725`), change the `weight_reps` default return to:

```js
  return { weight: ex.bodyweight ? 'BW' : '', reps: '', effort: '', done: false }
```

`_syncLoggedSetsFromTable` (`js/app-runner.js:739-748`) needs more care than a changed return line.
It currently does `ex.tableRows.filter(r => r.done).map(r => …)` — **the filter destroys the index**,
so inside that `map` the position is the index among *done* rows, not the row's real position. Look
up `ex.sets_json[i]` there and a session where set 1 was skipped would read set 1's prescription for
set 2. Keep the original index explicitly:

```js
function _syncLoggedSetsFromTable(ex) {
  const mt = _exMetricType(ex)
  // Index preserved BEFORE the filter: sets_json is keyed by real row position, so a skipped set
  // would otherwise shift every later row onto the wrong prescription.
  ex.loggedSets = ex.tableRows
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.done)
    .map(({ r, i }) => {
      if (mt === 'unilateral') return { leftWeight: r.leftWeight || null, leftReps: r.leftReps || null, rightWeight: r.rightWeight || null, rightReps: r.rightReps || null }
      if (mt === 'timed_hold') return { duration: r.duration || null, weight: _hasNumVal(r.weight) ? r.weight : null }
      if (mt === 'jump_height') return { height_cm: _hasNumVal(r.height_cm) ? r.height_cm : null, reps: r.reps || null }
      if (mt === 'jump_distance') return { distance_m: _hasNumVal(r.distance_m) ? r.distance_m : null, reps: r.reps || null }
      // effortType travels WITH the value: the save path must not guess which scale this number is on.
      return {
        weight: _hasNumVal(r.weight) ? r.weight : null,
        reps: r.reps,
        effort: _hasNumVal(r.effort) ? r.effort : null,
        effortType: ex.sets_json?.[i]?.effortType === 'rir' ? 'rir' : 'rpe'
      }
    })
}
```

`_hasNumVal`, not truthiness — RIR 0 is a real prescription meaning "to failure".

- [ ] **Step 5: Render the input only where effort was prescribed**

In the `weight_reps` branch of the table row render (`js/app-runner.js:1094-1106`), add above the `return`:

```js
    // Only where the coach actually prescribed an effort (Jake, 2026-09-29). A row with no
    // effortMin/effortMax renders exactly the two columns it always has — no layout change at all
    // for the exercises nobody asked for effort on.
    const wantsEffort = !!(rowTgt0?.effortMin || rowTgt0?.effortMax)
    const isRIR = rowTgt0?.effortType === 'rir'
```

and insert this cell between the reps cell and `inDone`:

```js
        ${wantsEffort ? inCell(i, row, 'effort', { mode:'decimal', step:'0.5', ph: isRIR ? '0–5' : '1–10' }) : ''}
```

Give the header the matching column — in the final `else` branch at `js/app-runner.js:1127-1129`, render the effort label when any row in this exercise prescribes one, reading `RIR` or `RPE` from that row's `effortType` the same way `_buildTargetCols` already does at `js/app-runner.js:907`.

- [ ] **Step 6: Write effort_type from the prescription, never hardcoded**

Replace `js/app-runner.js:3044`:

```js
        // effort_type comes from what was PRESCRIBED, never a literal. RIR and RPE run in opposite
        // directions, so a hardcoded 'rpe' here does not mislabel an RIR — it inverts its meaning.
        // (This line hardcoded 'rpe' while unreachable; it is reachable now.)
        if (_hasNumVal(s.effort)) {
          row.effort_type = s.effortType === 'rir' ? 'rir' : 'rpe'
          row.effort_value = parseFloat(s.effort)
        }
```

`s.effortType` is already on the synced set from Step 4. Delete the now-stale "UNREACHABLE as of 2026-08-11" comment at `js/app-runner.js:3038-3043` and replace it with one line noting capture landed 2026-09-29.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx playwright test tests/rpe-top-set-2026-09-29.spec.js`
Expected: PASS, all four.

- [ ] **Step 8: Check the phone layout**

Run the `mobile-check` skill against the runner at 390×844. A third input on a row that previously had two is exactly the squeeze that produced the 2026-09-28 template-builder bug. Confirm the two-column rows are untouched and the three-column rows still hit tap-target minimums.

- [ ] **Step 9: Bump the cache-bust and commit**

Change `index.html:162` to `<script src="js/app-runner.js?v=97"></script>`.

```bash
git add js/app-runner.js index.html tests/rpe-top-set-2026-09-29.spec.js
git commit -m "feat(runner): capture effort where the coach prescribed it

The in-gym runner captured no effort at all — its strength table had two
columns and effort only reached the DB via the manual Log Session modal
(recorded at app-runner.js:3038). An RPE/RIR input now renders on a set row
when, and only when, that row's sets_json prescribes one.

Writes effort_type from the prescription rather than the hardcoded 'rpe' the
parked hook carried: RIR and RPE run in opposite directions, so the literal
would have inverted every logged RIR.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: `sets_json` fields and the builder UI

**Files:**
- Modify: `js/app-workouts.js:436` (the `_cleanTemplateSets` allowlist), `:1963-1966` (the pill row), `:2018-2024` (the "+ More targets" block)
- Modify: `index.html:161` (`?v=136` → `?v=137`)
- Test: `tests/rpe-top-set-2026-09-29.spec.js`

**Interfaces:**
- Consumes: nothing from Tasks 1-2.
- Produces: `sets_json[i].isTopSet` (Boolean) and `sets_json[i].intensityBasis` (`'stored'`|`'topSet'`). Tasks 4 and 5 read both.

- [ ] **Step 1: Write the failing test**

Add to `tests/rpe-top-set-2026-09-29.spec.js`:

```js
test('isTopSet and intensityBasis survive a save and reload', async ({ page }) => {
  // _cleanTemplateSets is an ALLOWLIST: a key missing from it saves without error and loses the
  // value. That is how every cardio target was lost before les-036. This test is the guard.
  await openTemplateBuilderWithFixture(page, { sets: 2 })
  await page.click('#ts-topset-0')
  await page.selectOption('#ts-basis-1', 'topSet')
  await page.fill('#ts-imin-1', '70')
  await saveTemplate(page)
  await reopenTemplate(page)
  const sets = await page.evaluate(() => window._templateSets)
  expect(sets[0].isTopSet).toBe(true)
  expect(sets[1].intensityBasis).toBe('topSet')
  expect(sets[1].intensityMin).toBe('70')
})

test('a set with no basis chosen persists as stored, not undefined', async ({ page }) => {
  // Every pre-existing template must keep behaving exactly as it does today.
  await openTemplateBuilderWithFixture(page, { sets: 1 })
  await page.fill('#ts-imin-0', '75')
  await saveTemplate(page)
  await reopenTemplate(page)
  const sets = await page.evaluate(() => window._templateSets)
  expect(sets[0].intensityBasis).toBe('stored')
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test tests/rpe-top-set-2026-09-29.spec.js -g "survive a save"`
Expected: FAIL — `#ts-topset-0` does not exist.

- [ ] **Step 3: Add both fields to the allowlist**

In `_cleanTemplateSets` (`js/app-workouts.js`), immediately after the `bodyweight:` line at `:402`:

```js
    // Gated on metricType like `amrap` and `bodyweight` above, and for the same reason: switching an
    // exercise's type must not leave a stale top-set flag behind for the runner to render from.
    isTopSet: metricType === 'weight_reps' && !!s.isTopSet,
    // What intensityMin/Max is a percentage OF. 'stored' = the client's last saved 1RM, which is
    // every existing template's behaviour and therefore the default. 'topSet' = the e1RM this
    // session's top set produced.
    intensityBasis: metricType === 'weight_reps' && s.intensityBasis === 'topSet' ? 'topSet' : 'stored',
```

- [ ] **Step 4: Add the top-set pill**

In the pill row (`js/app-workouts.js:1963-1966`), add as the first pill, rendered only on row 0 of a `weight_reps` exercise. `toggleTsSet` (`:1756`) already flips an arbitrary boolean prop and re-renders, so no new handler is needed:

```js
            ${showAmrap && i === 0 ? tog('TOP SET', s.isTopSet, `toggleTsSet(${i},'isTopSet','${containerId}')`) : ''}
```

Give the pill `id="ts-topset-0"` so the test can click it — follow how `_togPill` renders its button and thread an id through.

- [ ] **Step 5: Swap the top set's inputs for the explanatory note**

In the `weight_reps` branch (`js/app-workouts.js:2011-2024`), when `s.isTopSet` is true: render the Reps and effort cells as now, omit the Weight cell (`:2014`) and the Intensity cell (`:2020`), and render instead:

```js
<div style="padding:8px 0;font-size:var(--text-sm, 11px);color:var(--text-muted)">Weight isn't prescribed — logged live in the runner, then used to calculate this session's e1RM for the sets below.</div>
```

- [ ] **Step 6: Add the basis selector**

Inside the "+ More targets" block, beside `Intensity (%1RM)` (`js/app-workouts.js:2020`), rendered only when `i > 0` and `window._templateSets[0]?.isTopSet`:

```js
${cell('% of', `<select id="ts-basis-${i}" class="field-input" style="font-size:var(--text-base, 13px)" onchange="flushTemplateSets('${containerId}');window._templateSets[${i}].intensityBasis=this.value">
  <option value="stored"${s.intensityBasis !== 'topSet' ? ' selected' : ''}>Last saved 1RM</option>
  <option value="topSet"${s.intensityBasis === 'topSet' ? ' selected' : ''}>Today's top set</option>
</select>`)}
```

Also add `s.intensityBasis = document.getElementById(\`ts-basis-${i}\`)?.value ?? s.intensityBasis` to `flushTemplateSets` (`js/app-workouts.js:1723`, beside the intensity lines), so a change survives a re-render.

- [ ] **Step 7: Warn instead of silently orphaning**

When row 0's top-set pill is switched OFF while any later row still has `intensityBasis === 'topSet'`,
render this above the set list. It must not silently rewrite those rows — a training day's loads
should not change without the coach seeing it happen.

```js
${!window._templateSets[0]?.isTopSet && window._templateSets.some(s => s.intensityBasis === 'topSet')
  ? `<div style="padding:8px 10px;margin-bottom:8px;border-radius:var(--radius-sm, 8px);background:var(--warn-light, rgba(234,179,8,.12));color:var(--text);font-size:var(--text-sm, 11px)">Set ${window._templateSets.map((s, n) => s.intensityBasis === 'topSet' ? n + 1 : null).filter(Boolean).join(', ')} still uses "Today's top set", but set 1 is no longer a top set. Those sets have no percentage to work from until you switch set 1 back on or change them to "Last saved 1RM".</div>`
  : ''}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx playwright test tests/rpe-top-set-2026-09-29.spec.js`
Expected: PASS — the two new tests, and the four from Task 2 still green.

- [ ] **Step 9: Bump the cache-bust and commit**

Change `index.html:161` to `?v=137`.

```bash
git add js/app-workouts.js index.html tests/rpe-top-set-2026-09-29.spec.js
git commit -m "feat(builder): mark a top set, and point later sets at it

Adds isTopSet and intensityBasis to sets_json and, critically, to the
_cleanTemplateSets allowlist — a key missing from there saves without error and
silently loses the value, which is how the cardio targets were lost before.

intensityBasis defaults to 'stored', so every existing template keeps its
current behaviour untouched.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Live e1RM computation and the chip

**Files:**
- Modify: `js/app-runner.js:750+` (`toggleTableSet`), plus a new `_recomputeLiveE1RM(ex)` beside it, and the exercise header render
- Modify: `index.html:162` (`?v=97` → `?v=98`)
- Test: `tests/rpe-top-set-2026-09-29.spec.js`

**Interfaces:**
- Consumes: `_estimate1RM(weight, reps, opts)` from Task 1; `tableRows[i].effort` from Task 2; `sets_json[i].isTopSet` from Task 3.
- Produces: `ex._liveE1RM` (Number or null). Task 5 reads it.

- [ ] **Step 1: Write the failing tests**

```js
test('ticking the top set computes an e1RM and shows the chip', async ({ page }) => {
  await startRunnerWithFixture(page, { sets: [
    { repsMin: 3, effortType: 'rpe', effortMin: 8, isTopSet: true },
    { repsMin: 8, intensityMin: 70, intensityBasis: 'topSet' }
  ] })
  await page.fill('#set-0-weight', '100')
  await page.fill('#set-0-reps', '3')
  await page.fill('#set-0-effort', '8')
  await page.click('#set-0-done')
  await expect(page.locator('#ex-e1rm-chip')).toContainText('115.9')
})

test('a top set with no weight produces no e1RM and no chip', async ({ page }) => {
  await startRunnerWithFixture(page, { sets: [
    { repsMin: 3, effortType: 'rpe', effortMin: 8, isTopSet: true },
    { repsMin: 8, intensityMin: 70, intensityBasis: 'topSet' }
  ] })
  await page.fill('#set-0-reps', '3')
  await page.fill('#set-0-effort', '8')
  await page.click('#set-0-done')
  await expect(page.locator('#ex-e1rm-chip')).toHaveCount(0)
  const v = await page.evaluate(() => _runner.exercises[0]._liveE1RM ?? null)
  expect(v).toBeNull()
})

test('a top set past the rep cap says it cannot estimate, not "log the top set first"', async ({ page }) => {
  // _estimate1RM refuses beyond 12 reps. The lifter HAS logged the set, so telling them to log it
  // is wrong — it reads as the app not having noticed.
  await startRunnerWithFixture(page, { sets: [
    { repsMin: 3, effortType: 'rpe', effortMin: 8, isTopSet: true },
    { repsMin: 8, intensityMin: 70, intensityBasis: 'topSet' }
  ] })
  await page.fill('#set-0-weight', '60')
  await page.fill('#set-0-reps', '15')
  await page.fill('#set-0-effort', '8')
  await page.click('#set-0-done')
  await expect(page.locator('#set-1-basis-note')).toContainText("Can't estimate")
})

test('editing the top set updates unlogged backoff rows but not logged ones', async ({ page }) => {
  await startRunnerWithFixture(page, { sets: [
    { repsMin: 3, effortType: 'rpe', effortMin: 8, isTopSet: true },
    { repsMin: 8, intensityMin: 70, intensityBasis: 'topSet' },
    { repsMin: 8, intensityMin: 70, intensityBasis: 'topSet' }
  ] })
  await page.fill('#set-0-weight', '100'); await page.fill('#set-0-reps', '3')
  await page.fill('#set-0-effort', '8');   await page.click('#set-0-done')
  await page.fill('#set-1-weight', '80');  await page.fill('#set-1-reps', '8')
  await page.click('#set-1-done')
  await page.fill('#set-0-weight', '110')  // correcting a typo on the top set
  await page.click('#set-0-done')          // re-tick
  expect(await page.inputValue('#set-1-weight')).toBe('80')          // logged: untouched
  await expect(page.locator('#set-2-weight')).toHaveAttribute('placeholder', /87\.5/)  // unlogged: updated
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx playwright test tests/rpe-top-set-2026-09-29.spec.js -g "e1rm|top set"`
Expected: FAIL — `#ex-e1rm-chip` does not exist.

- [ ] **Step 3: Add the recompute function**

Add beside `toggleTableSet` in `js/app-runner.js`:

```js
// The top set is always row 0 (Jake, 2026-09-29) — an exercise has at most one. Recomputed on every
// tick and every edit of that row, so correcting a typo corrects the backoff targets with it.
function _recomputeLiveE1RM(ex) {
  const tgt0 = ex.sets_json?.[0]
  if (!tgt0?.isTopSet) { ex._liveE1RM = null; return }
  const row = ex.tableRows?.[0]
  if (!row?.done || !_hasNumVal(row.weight) || !row.reps || !_hasNumVal(row.effort)) { ex._liveE1RM = null; return }
  ex._liveE1RM = _estimate1RM(row.weight, row.reps, { effortType: tgt0.effortType, effortValue: row.effort })
}
```

**Call it from the top of the strength-table render, not from the input handlers.** `inCell`'s
`oninput` writes straight into `tableRows[i][field]` and deliberately does **not** re-render
(`js/app-runner.js:1003-1006`) — so hooking every input would mean hooking a binding that was built
to avoid re-rendering on every keystroke. Recomputing once at the start of the render gives the
right behaviour for free: ticking a set re-renders, so the chip and every backoff placeholder update
in the same pass, and correcting the top set and re-ticking recomputes from the corrected values.

Also call it from `toggleTableSet` after `_syncLoggedSetsFromTable(ex)`, so `ex._liveE1RM` is
correct for any non-render consumer.

- [ ] **Step 4: Render the chip**

On the exercise header, when `ex._liveE1RM` is a finite number:

```js
<span id="ex-e1rm-chip" style="font-size:var(--text-sm, 11px);font-weight:700;color:var(--accent);padding:2px 8px;border-radius:999px;background:rgba(99,102,241,.12)">Est. 1RM: ${fmtWeight(ex._liveE1RM)}</span>
```

`fmtWeight`, so an lb account sees lb.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx playwright test tests/rpe-top-set-2026-09-29.spec.js`
Expected: PASS.

- [ ] **Step 6: Bump the cache-bust and commit**

`index.html:162` → `?v=98`.

```bash
git add js/app-runner.js index.html tests/rpe-top-set-2026-09-29.spec.js
git commit -m "feat(runner): estimate 1RM live from the top set

Ticking a top set computes an RPE-adjusted e1RM from what was actually lifted
and shows it on the exercise header. Session-local; nothing is written to
client_1rms mid-session.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Backoff targets resolve against the live e1RM

**Files:**
- Modify: `js/app-runner.js:1036-1041` (`oneRMPh`), `:1094-1106` (the placeholder and the note)
- Modify: `index.html:162` (`?v=98` → `?v=99`)
- Test: `tests/rpe-top-set-2026-09-29.spec.js`

**Interfaces:**
- Consumes: `ex._liveE1RM` from Task 4; `sets_json[i].intensityBasis` from Task 3.
- Produces: nothing later tasks read.

- [ ] **Step 1: Write the failing tests**

```js
test('backoff targets come from the live e1RM, floored to 2.5', async ({ page }) => {
  // 3 @ RPE 8 -> 86.3% -> 100/0.863 = 115.87. 70% = 81.11 -> floors to 80.
  await startRunnerWithFixture(page, { sets: [
    { repsMin: 3, effortType: 'rpe', effortMin: 8, isTopSet: true },
    { repsMin: 8, intensityMin: 70, intensityBasis: 'topSet' }
  ] })
  await page.fill('#set-0-weight', '100'); await page.fill('#set-0-reps', '3')
  await page.fill('#set-0-effort', '8');   await page.click('#set-0-done')
  await expect(page.locator('#set-1-weight')).toHaveAttribute('placeholder', '80')
})

test('before the top set is logged, backoff rows say so and show no number', async ({ page }) => {
  // Never fall back to the stored 1RM here: a plausible-looking stale number on the bar is worse
  // than an honest blank.
  await startRunnerWithFixture(page, {
    storedOneRM: 140,
    sets: [
      { repsMin: 3, effortType: 'rpe', effortMin: 8, isTopSet: true },
      { repsMin: 8, intensityMin: 70, intensityBasis: 'topSet' }
    ]
  })
  await expect(page.locator('#set-1-basis-note')).toContainText('Log the top set first')
  expect(await page.getAttribute('#set-1-weight', 'placeholder')).not.toContain('97.5')  // 70% of 140
})

test('a stored-basis row still uses the stored 1RM, unchanged', async ({ page }) => {
  await startRunnerWithFixture(page, {
    storedOneRM: 140,
    sets: [{ repsMin: 5, intensityMin: 70, intensityBasis: 'stored' }]
  })
  await expect(page.locator('#set-0-weight')).toHaveAttribute('placeholder', '97.5')
})

test('a topSet-basis row with no top set on row 0 falls back to the note, not the stored 1RM', async ({ page }) => {
  // Legacy or hand-edited sets_json, or a coach who turned the top-set pill back off.
  await startRunnerWithFixture(page, {
    storedOneRM: 140,
    sets: [
      { repsMin: 5 },
      { repsMin: 8, intensityMin: 70, intensityBasis: 'topSet' }
    ]
  })
  await expect(page.locator('#set-1-basis-note')).toBeVisible()
  expect(await page.getAttribute('#set-1-weight', 'placeholder')).not.toContain('97.5')
})

test('the chip and backoff targets render in lb for an lb account', async ({ page }) => {
  // The suite runs in kg throughout, so an lb-only fault here is invisible to every other test —
  // the 2026-08-14 lb-only 1RM grid crash is the precedent.
  await setWeightUnit(page, 'lb')
  await startRunnerWithFixture(page, { sets: [
    { repsMin: 3, effortType: 'rpe', effortMin: 8, isTopSet: true },
    { repsMin: 8, intensityMin: 70, intensityBasis: 'topSet' }
  ] })
  await page.fill('#set-0-weight', '220'); await page.fill('#set-0-reps', '3')
  await page.fill('#set-0-effort', '8');   await page.click('#set-0-done')
  await expect(page.locator('#ex-e1rm-chip')).toContainText('lb')
  expect(await page.getAttribute('#set-1-weight', 'placeholder')).not.toBe('')
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx playwright test tests/rpe-top-set-2026-09-29.spec.js -g "backoff|lb account"`
Expected: FAIL — backoff rows still resolve against `ex.oneRM`.

- [ ] **Step 3: Resolve the basis**

Replace `oneRMPh` (`js/app-runner.js:1039-1041`) with a version that picks its source from the row's basis:

```js
    // Which 1RM this row's percentage is OF. 'topSet' rows resolve against what was lifted TODAY;
    // everything else keeps the stored client_1rms value, which is every pre-existing template.
    const usesTopSet = rowTgt0?.intensityBasis === 'topSet'
    const basisRM = usesTopSet ? ex._liveE1RM : ex.oneRM
    const oneRMPh = (rowTgt0?.intensityMin && basisRM)
      ? weightToPref(_calcWeightFromPct(basisRM, rowTgt0.intensityMin)) + (rowTgt0.intensityMax && rowTgt0.intensityMax !== rowTgt0.intensityMin ? '–' + weightToPref(_calcWeightFromPct(basisRM, rowTgt0.intensityMax)) : '')
      : ''
```

- [ ] **Step 4: Render the note when a topSet row has no number yet**

In the `weight_reps` branch, when `usesTopSet && !basisRM`, render below the row:

```js
<div id="set-${i}-basis-note" style="font-size:var(--text-sm, 11px);color:var(--text-muted);padding:2px 0 0 28px">${ex.sets_json?.[0]?.isTopSet && ex.tableRows?.[0]?.done ? "Can't estimate from this set" : 'Log the top set first'}</div>
```

The two messages are different on purpose: telling someone to log a set they already logged reads as the app not having noticed.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx playwright test tests/rpe-top-set-2026-09-29.spec.js`
Expected: PASS — all of this task's tests plus every earlier one.

- [ ] **Step 6: Bump the cache-bust and commit**

`index.html:162` → `?v=99`.

```bash
git add js/app-runner.js index.html tests/rpe-top-set-2026-09-29.spec.js
git commit -m "feat(runner): backoff sets target a percentage of today's top set

A set whose intensityBasis is 'topSet' resolves its target weight against the
e1RM computed from this session's top set, through the same _calcWeightFromPct
every other %1RM set uses. Until that top set is logged it shows a note rather
than falling back to the stored 1RM — a plausible-looking stale number on the
bar is worse than an honest blank.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Post-session save prefill, full suite, docs

**Files:**
- Modify: `js/app-runner.js:3101` (`showPostSessionOneRMModal`)
- Modify: `index.html:162` (`?v=99` → `?v=100`)
- Modify: `docs/architecture.md`, `docs/session-context.md`, `CLAUDE.md`
- Test: `tests/rpe-top-set-2026-09-29.spec.js`

**Interfaces:**
- Consumes: `ex._liveE1RM` from Task 4.
- Produces: nothing.

- [ ] **Step 1: Write the failing test**

```js
test('the post-session 1RM modal is prefilled with the top-set e1RM', async ({ page }) => {
  await startRunnerWithFixture(page, { sets: [
    { repsMin: 3, effortType: 'rpe', effortMin: 8, isTopSet: true }
  ] })
  await page.fill('#set-0-weight', '100'); await page.fill('#set-0-reps', '3')
  await page.fill('#set-0-effort', '8');   await page.click('#set-0-done')
  await finishSession(page)
  await expect(page.locator(POST_SESSION_VALUE_SELECTOR)).toHaveValue(/115\.9/)
})
```

`POST_SESSION_VALUE_SELECTOR` is not guessed: read `showPostSessionOneRMModal`
(`js/app-runner.js:3101`) and use the id its value input actually renders. The modal's rows are
addressed as `psorm-row-N` in `_savePostSessionOneRM`, so the input is likely in that family — but
confirm it in the source rather than assuming, and if the input has no id, add one in the same
pattern as Task 2 Step 3.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test tests/rpe-top-set-2026-09-29.spec.js -g "post-session"`
Expected: FAIL — the field is empty or holds the plain-Epley candidate.

- [ ] **Step 3: Prefer the top-set e1RM as the candidate**

In `showPostSessionOneRMModal` (`js/app-runner.js:3101`), when an exercise has a finite `_liveE1RM`, use it as that exercise's candidate value in preference to the plain weight×reps estimate. Nothing writes to `client_1rms` before this modal is confirmed — that table is append-only and `_savePostSessionOneRM` carries a `guardReentry` against duplicate rows.

- [ ] **Step 4: Run it to verify it passes**

Run: `npx playwright test tests/rpe-top-set-2026-09-29.spec.js`
Expected: PASS, whole file.

- [ ] **Step 5: Run the full suite**

Run: `npm run test:unit && npm test`
Expected: PASS. If anything unrelated is red, stop and investigate — do not proceed to the review with a red suite.

- [ ] **Step 6: Update the docs**

- `docs/architecture.md` — the runner now captures effort; `_estimate1RM` is RPE-aware.
- `docs/session-context.md` — note the feature landed.
- `CLAUDE.md` — correct "Tests: Playwright E2E only. No unit-test framework." A `node:test` harness exists at `tests-node/pure.test.mjs`, run with `npm run test:unit`. This was already stale before this work.
- No `docs/decisions.md` entry is owed: the rounding rule was left at 2.5, and nothing else here reverses a prior decision.

- [ ] **Step 7: Run `multi-agent-review`, then commit**

Run the `multi-agent-review` skill in diff mode across the whole branch before pushing. This is not ownership/RLS work, so the review gates the push rather than each commit — but it must happen before the push, not after.

```bash
git add js/app-runner.js index.html tests/rpe-top-set-2026-09-29.spec.js docs/architecture.md docs/session-context.md CLAUDE.md
git commit -m "feat(runner): prefill the post-session 1RM from the top set

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 8: Verify against the golden path by hand**

Build a real workout with a 3-rep top set at RPE 8 and two backoff sets at 70%, run it in the browser via the `run-coachapp` skill, and confirm: the effort input appears on the top set only, the chip reads 115.9kg for a 100kg top set, and both backoff rows ghost 80kg. Type checking and specs verify code correctness, not feature correctness.
