# Progress Capture — Adaptive Fast Table (sub-project ②c) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the runner's fast (Hevy-style) logging table adapt its columns to the exercise's `metric_type` — weight/reps, unilateral L/R, timed hold, jump height, jump distance — so those types are logged in the fast table instead of the step-by-step wizard, populating `loggedSets` with the exact fields ②b's save persists.

**Architecture:** All changes in `js/app-runner.js`. The runner already carries `ex.metricType` (loaded in ②b). We switch the fast-table gate `_isPlainStrengthExercise` to route by `metricType` (fast table for weight_reps/unilateral/timed_hold/jump_height/jump_distance; wizard only for cardio), make the table's row-shape / validate / sync / render functions `metricType`-aware, and fix the in-runner add/swap (`_confirmRunnerExerciseFromModal`) to carry `metricType` + derive the legacy fields (closing a gap ②a's picker change left).

**Tech Stack:** Vanilla JS (no build); the `loggedSet` field contract from ②b (`weight`/`reps`/`rpe`; `duration`; `distance_m` metres; `height_cm`; `leftWeight`/`leftReps`/`rightWeight`/`rightReps`; `avgHr`/`maxHr`). Playwright E2E via the app's in-page `db`. Bump `app-runner.js ?v=N` in `index.html` in the same commit.

## Global Constraints

- **Fast table serves 5 metric_types:** `weight_reps`, `unilateral`, `timed_hold`, `jump_height`,
  `jump_distance`. **Cardio stays on the wizard** (its rich block is out of scope here).
- **`loggedSet` shapes the table must emit** (must match ②b's `saveRunnerSession` row-builder exactly):
  - `weight_reps` → `{ weight, reps }` (weight `'BW'` sentinel when bodyweight)
  - `unilateral` → `{ leftWeight, leftReps, rightWeight, rightReps }`
  - `timed_hold` → `{ duration, weight }` (weight optional)
  - `jump_height` → `{ height_cm }`
  - `jump_distance` → `{ distance_m }` (metres)
- **Route by `metricType`, not `sets_json` flags.** `_isPlainStrengthExercise` reads `ex.metricType`; keep a
  fallback for drafts/rows without it (derive: cardio→wizard; else fast table).
- **No regression to the common `weight_reps` path** — the in-gym fast strength flow Jake relies on must
  behave exactly as today (empty rows, ghost text, tick-to-log, rest timer, target bar).
- **Preserve the "no pre-fill" rule** (les from 2026-07-11): rows start empty; last session shows as ghost
  placeholder only; nothing is logged until typed + ticked.
- **Cache-bust:** bump `app-runner.js ?v=N` in `index.html` same commit. No PII in `log.*`. Don't push.

## Per-type table columns (what `renderStrengthTable` shows)

- `weight_reps` — Set · **Kg** · **Reps** · ✓ (current behavior, unchanged).
- `unilateral` — two stacked sub-rows per set: **L: Kg · Reps** and **R: Kg · Reps**, one ✓ per set.
- `timed_hold` — Set · **Time (m:ss)** · **Kg** (optional) · ✓.
- `jump_height` — Set · **Height (cm)** · ✓.
- `jump_distance` — Set · **Distance (m)** · ✓.

---

### Task 1: metric_type-aware routing, row-shape, validate, and sync (the table's logic core)

**Files:**
- Modify: `js/app-runner.js` — `_isPlainStrengthExercise` (~266), `_ensureTableRows` (~281),
  `_syncLoggedSetsFromTable` (~296), `toggleTableSet` (~300), `addTableRow` (~328),
  `_confirmRunnerExerciseFromModal` (~1323, both swap+add branches).

**Interfaces:**
- Consumes: `ex.metricType` (from ②b's launchRunner mapping), the ②b `loggedSet` field contract.
- Produces: `ex.tableRows` shaped per metricType; `_syncLoggedSetsFromTable(ex)` emits the correct
  `loggedSet` shape; `_METRIC_TABLE_TYPES` set naming the fast-table metric_types (used by later render).

- [ ] **Step 1: Add the fast-table metric_type set + a metricType resolver**

Near the top of the runner's table section (just above `_isPlainStrengthExercise`), add:

```js
// The metric_types the fast logging table handles. Cardio stays on the wizard.
const _METRIC_TABLE_TYPES = new Set(['weight_reps','unilateral','timed_hold','jump_height','jump_distance'])

// Resolve an exercise's metric_type with a safe fallback for older drafts/rows that predate ②a/②b:
// derive from the legacy type/flags so nothing silently drops onto the wrong path.
function _exMetricType(ex) {
  if (ex.metricType) return ex.metricType
  if (ex.type === 'cardio') return 'cardio'
  const s0 = ex.sets_json?.[0] || {}
  if (s0.unilateral) return 'unilateral'
  if (s0.timed) return 'timed_hold'
  return 'weight_reps'
}
```

- [ ] **Step 2: Route by metric_type in `_isPlainStrengthExercise`**

Replace the body of `_isPlainStrengthExercise` (~266-272) with:

```js
function _isPlainStrengthExercise(ex) {
  if (!ex) return false
  return _METRIC_TABLE_TYPES.has(_exMetricType(ex))
}
```

(This retires the wizard for unilateral/timed/jump — they now match the fast table — and drops the old
`sets_json.length`/name-pattern gating. Cardio alone returns false → wizard.)

- [ ] **Step 3: Make `_ensureTableRows` shape rows per metric_type**

Replace `_ensureTableRows` (~281-294) so each row carries the fields its type needs:

```js
function _ensureTableRows(ex) {
  if (ex.tableRows) return
  const n = ex.targetSets || ex.sets_json?.length || 3
  const mt = _exMetricType(ex)
  const blank = () => {
    if (mt === 'unilateral') return { leftWeight: ex.bodyweight ? 'BW' : '', leftReps: '', rightWeight: ex.bodyweight ? 'BW' : '', rightReps: '', done: false }
    if (mt === 'timed_hold') return { duration: '', weight: ex.bodyweight ? 'BW' : '', done: false }
    if (mt === 'jump_height') return { height_cm: '', done: false }
    if (mt === 'jump_distance') return { distance_m: '', done: false }
    return { weight: ex.bodyweight ? 'BW' : '', reps: '', done: false }
  }
  ex.tableRows = Array.from({ length: n }, blank)
}
```

Update `addTableRow` (~328-341) to push `blank()`-equivalent for the type — extract the `blank(ex, mt)`
maker to a shared helper `_blankTableRow(ex)` and call it from both `_ensureTableRows` and `addTableRow`
(DRY; don't duplicate the shape literal).

- [ ] **Step 4: Make `_syncLoggedSetsFromTable` emit the right shape**

Replace `_syncLoggedSetsFromTable` (~296-298) with:

```js
function _syncLoggedSetsFromTable(ex) {
  const mt = _exMetricType(ex)
  ex.loggedSets = ex.tableRows.filter(r => r.done).map(r => {
    if (mt === 'unilateral') return { leftWeight: r.leftWeight || null, leftReps: r.leftReps || null, rightWeight: r.rightWeight || null, rightReps: r.rightReps || null }
    if (mt === 'timed_hold') return { duration: r.duration || null, weight: r.weight || null }
    if (mt === 'jump_height') return { height_cm: r.height_cm || null }
    if (mt === 'jump_distance') return { distance_m: r.distance_m || null }
    return { weight: r.weight || null, reps: r.reps }
  })
}
```

- [ ] **Step 5: Make `toggleTableSet` validate per type**

In `toggleTableSet` (~300-326), replace the reps/weight validation block (the two `if (!row.reps)` /
`if (!ex.bodyweight && !row.weight)` guards) with a per-type check:

```js
    const mt = _exMetricType(ex)
    if (mt === 'unilateral') {
      if (!row.leftReps && !row.rightReps) { showToast('Enter reps first', 'warn'); return }
    } else if (mt === 'timed_hold') {
      if (!row.duration || row.duration === '0:00') { showToast('Enter a duration first', 'warn'); return }
    } else if (mt === 'jump_height') {
      if (!row.height_cm) { showToast('Enter a height first', 'warn'); return }
    } else if (mt === 'jump_distance') {
      if (!row.distance_m) { showToast('Enter a distance first', 'warn'); return }
    } else {
      if (!row.reps) { showToast('Enter reps first', 'warn'); return }
      if (!ex.bodyweight && !row.weight) { showToast('Enter weight first', 'warn'); return }
    }
```

- [ ] **Step 6: Fix `_confirmRunnerExerciseFromModal` to carry metricType (both add + swap)**

`att-type` now holds a metric_type (②a). Read it as `metricType`, derive the legacy `type` + per-set
flags, and set `ex.metricType`. In `_confirmRunnerExerciseFromModal` (~1323): replace
`const type = document.getElementById('att-type').value` with:

```js
  const metricType = document.getElementById('att-type').value || 'weight_reps'
  const type = metricType === 'cardio' ? 'cardio' : 'strength'
```

In the `cleanSets` map, source the flags from metricType (not the removed toggles):
`unilateral: metricType === 'unilateral', timed: metricType === 'timed_hold',`.
In the **swap** branch add `ex.metricType = metricType` (next to `ex.type = type`). In the **add** branch
add `metricType,` to the pushed object literal.

- [ ] **Step 7: Verify parse + commit**

```bash
node --check js/app-runner.js
git add js/app-runner.js
git commit -m "sub-project 2c: metric_type-aware table row-shape, routing, validate, sync + add/swap"
```

---

### Task 2: Adaptive `renderStrengthTable` columns per metric_type

**Files:**
- Modify: `js/app-runner.js` — `renderStrengthTable` (~422-505); `index.html` (`app-runner.js ?v=N`).

**Interfaces:**
- Consumes: `ex.tableRows` (shaped by Task 1), `_exMetricType`, `_METRIC_TABLE_TYPES`.

- [ ] **Step 1: Branch the row + header render by metric_type**

Rewrite the row-render (the `ex.tableRows.map(...)`, ~453-489) and the column-header block (~495-500) to
render per `_exMetricType(ex)`, per the "Per-type table columns" mapping above. Keep the target bar,
one-RM banner, rest bar, `+ Add set`, and reps tally exactly as-is for `weight_reps`/`unilateral`; for
`timed_hold`/`jump_*` the target bar / ghost text / reps tally are largely N/A — render a minimal header
(Set · <metric> · ✓) and skip the reps tally. Concretely per type:
- `weight_reps` — unchanged (current Kg/Reps inputs, ghost placeholders, ✓, delete).
- `unilateral` — two input rows inside the set card: `L:` Kg+Reps and `R:` Kg+Reps (each
  `oninput="_runner.exercises[${_runner.exIdx}].tableRows[${i}].leftWeight=this.value"` etc.), one ✓
  toggling the whole set. Ghost placeholders from `prevMap[i]` if it carries per-side history, else `—`.
- `timed_hold` — a Time input (`type="text" placeholder="0:00" oninput="…fmtRestInput…; …tableRows[i].duration=this.value"`) + an optional Kg input (hidden when `ex.bodyweight`), one ✓.
- `jump_height` — one Height (cm) input (`type="number" inputmode="decimal"`) + ✓.
- `jump_distance` — one Distance (m) input (`type="number" inputmode="decimal" step="0.01"`) + ✓.
Keep the `isCurrent` highlight, the 44px ✓ button, and the Delete button pattern for all types.

Because this is intricate render code, implement it against the running app and screenshot each type
(mobile 390×844) — do not transcribe blind.

- [ ] **Step 2: Bump cache-bust**

Increment `app-runner.js ?v=N` by 1 in `index.html` (read the current value; ②b left it at v24 — confirm).

- [ ] **Step 3: Verify each type renders + logs in the running app**

Start the app (run-coachapp). Build a quick template with one exercise of each of the 5 types (via the ②a
picker), start the runner, and confirm each renders the right inputs, ticking a set validates + logs, and
the rest timer fires. Screenshot each at 390×844. This is mandatory (render can't be proven by diff).

- [ ] **Step 4: Commit**

```bash
git add js/app-runner.js index.html
git commit -m "sub-project 2c: adaptive fast-table columns per metric_type"
```

---

### Task 3: Playwright round-trip — log each type via the fast table

**Files:**
- Create: `tests/runner-fast-table-metrics.spec.js`

**Interfaces:**
- Consumes: the runner globals (`_runner`, `renderRunner`, `toggleTableSet`, `_syncLoggedSetsFromTable`,
  `_isPlainStrengthExercise`), the app's in-page `db`.

- [ ] **Step 1: Write the test**

Drive the table logic directly (like ②b/②a tests): construct `_runner` with one exercise per fast-table
type, set `tableRows` values, mark done, sync, and assert `loggedSets` carries the right shape; also
assert `_isPlainStrengthExercise` routes each of the 5 types to the table and cardio to the wizard.
Create `tests/runner-fast-table-metrics.spec.js`:

```js
const { test, expect } = require('@playwright/test')
const { loginAsPT } = require('./helpers')

// Sub-project ②c: the fast table handles 5 metric_types and emits the loggedSet shapes ②b persists.
test.describe('Runner fast table — metric_type aware', () => {
  test('routes 5 types to the table, cardio to wizard, and syncs correct loggedSet shapes', async ({ page }) => {
    await loginAsPT(page)
    await page.click('text=Personal')
    await page.waitForTimeout(1200)

    const res = await page.evaluate(() => {
      const clientId = 'x' // not persisted in this test — pure in-memory logic check
      const mk = (metricType, tableRows) => ({ name: metricType, type: metricType === 'cardio' ? 'cardio' : 'strength', metricType, sets_json: [{}], loggedSets: [], tableRows })
      const routing = {}
      for (const mt of ['weight_reps','unilateral','timed_hold','jump_height','jump_distance','cardio']) {
        routing[mt] = _isPlainStrengthExercise(mk(mt, []))
      }
      const sync = {}
      const cases = {
        weight_reps:   [{ weight: '100', reps: '5', done: true }],
        unilateral:    [{ leftWeight: '20', leftReps: '10', rightWeight: '18', rightReps: '9', done: true }],
        timed_hold:    [{ duration: '1:30', weight: '5', done: true }],
        jump_height:   [{ height_cm: '55', done: true }],
        jump_distance: [{ distance_m: '2.4', done: true }]
      }
      for (const [mt, rows] of Object.entries(cases)) {
        const ex = mk(mt, rows)
        _syncLoggedSetsFromTable(ex)
        sync[mt] = ex.loggedSets[0]
      }
      return { routing, sync }
    })

    // Routing: 5 fast-table types true, cardio false
    expect(res.routing.weight_reps).toBe(true)
    expect(res.routing.unilateral).toBe(true)
    expect(res.routing.timed_hold).toBe(true)
    expect(res.routing.jump_height).toBe(true)
    expect(res.routing.jump_distance).toBe(true)
    expect(res.routing.cardio).toBe(false)

    // Sync shapes match the ②b save contract
    expect(res.sync.weight_reps).toEqual({ weight: '100', reps: '5' })
    expect(res.sync.unilateral).toEqual({ leftWeight: '20', leftReps: '10', rightWeight: '18', rightReps: '9' })
    expect(res.sync.timed_hold).toEqual({ duration: '1:30', weight: '5' })
    expect(res.sync.jump_height).toEqual({ height_cm: '55' })
    expect(res.sync.jump_distance).toEqual({ distance_m: '2.4' })
  })
})
```

- [ ] **Step 2: Run it**

Run: `npx playwright test tests/runner-fast-table-metrics.spec.js --reporter=list`
Expected: PASS (1 passed).

- [ ] **Step 3: Full suite**

Run: `npm test`
Expected: 155 passed / 2 skipped / 0 failed (154 baseline + this; a lone unrelated runner-swap flake may
appear — re-run it in isolation to confirm green, as in ②a). Read the real totals.

- [ ] **Step 4: Commit**

```bash
git add tests/runner-fast-table-metrics.spec.js
git commit -m "sub-project 2c: test fast-table routing + loggedSet shapes per metric_type"
```

---

## Self-Review

**1. Spec coverage (spec ②c):**
- Fast table renders columns per metric_type → Task 2 (+ Task 1 row-shape).
- Retire wizard for unilateral/timed/jump → Task 1 Step 2 (`_isPlainStrengthExercise` by metricType;
  cardio-only wizard).
- Runner reads metric_type not sets_json flags → Task 1 (`_exMetricType`, with a safe legacy fallback).
- Populate loggedSets with fields ②b persists → Task 1 Step 4 (shapes match ②b contract; asserted Task 3).
- Fix mid-session add/swap to carry metricType → Task 1 Step 6 (also closes the latent ②a gap where
  att-type's metric_type value was being written into ex.type).
- **Out of scope, noted:** cardio stays on the wizard; the runner finish-screen volume summary still
  under-counts unilateral/timed (banked for ③); manual HR inputs are ②d.

**2. Placeholder scan:** Task 2's render is specified by per-type column mapping + exact input-binding
patterns rather than transcribed line-by-line — flagged as needing in-app implementation (intricate
render). The `?v=N` "confirm current value" is a real read instruction. No vague placeholders elsewhere.

**3. Type consistency:** the `loggedSet` shapes in Task 1 Step 4 match ②b's `saveRunnerSession` row-builder
field names exactly (`leftWeight`/`leftReps`/`rightWeight`/`rightReps`, `duration`, `distance_m`,
`height_cm`, `weight`/`reps`) and the Task 3 assertions. `_exMetricType`/`_METRIC_TABLE_TYPES`/
`_blankTableRow` names are used consistently across steps.

---

## Execution note

Fully agent-executable (no human SQL). Task 2's render genuinely needs eyes on the running app + mobile
screenshots — the largest, most iteration-heavy step of the whole feature. Given a prior implementer
subagent broke down on a comparably intricate runner-render task, consider implementing Task 2 with close
controller oversight (or inline) and keeping Task 1/3 as normal dispatches.
