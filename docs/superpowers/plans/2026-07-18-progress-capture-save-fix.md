# Progress Capture — Runner Save-Persistence Fix (sub-project ②b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `saveRunnerSession` silently discarding the rich per-set data the in-gym wizard already captures — persist unilateral (as two `side`-tagged rows), timed holds, distance-strength, and heart-rate — and stamp `metric_type` onto each logged exercise so sub-project ③ can chart history by type.

**Architecture:** One focused change to `js/app-runner.js`. The runner already loads `metric_type` (the `_runnerTemplates` queries use `select('*, workout_template_exercises(*)')`, and ① added the column), so no query changes. We map `metric_type` onto the in-memory exercise, write it onto the `workout_log_exercises` row, and rewrite the per-set row-builder in `saveRunnerSession` to translate every `loggedSet` shape into the correct `workout_log_sets` columns added in ①. A Playwright test drives `saveRunnerSession()` directly with constructed `_runner` state and asserts the rows round-trip.

**Tech Stack:** Vanilla JS (no build); Supabase (`workout_log_sets` columns from ①: `avg_hr`, `max_hr`, `height_cm`, `side`; `workout_log_exercises.metric_type`); Playwright E2E via the app's own in-page authenticated `db` client (`page.evaluate`). Bump `app-runner.js ?v=N` in `index.html` in the same commit as the code change.

## Global Constraints

- **Builds on ① (already live in prod).** Columns `workout_log_sets.avg_hr` (smallint), `max_hr` (smallint),
  `height_cm` (numeric), `side` (text `left`/`right`, nullable), and `workout_log_exercises.metric_type`
  (text, default `weight_reps`) exist. Do not re-declare them.
- **Fix `saveRunnerSession` only.** The other save path, `saveWorkoutSession` (the PT manual-log
  modal, ~app-runner.js:2127-2147), uses a simpler `block.sets` shape that captures no unilateral/timed/
  height data, so it has nothing to recover here. Leave it unchanged in this slice (HR there is ②d).
- **`loggedSet` field contract** (the shapes the wizard/table produce; this slice defines how each maps to
  DB columns — later slices ②c/②d only populate these fields, they don't change the mapping):
  - `weight` — string kg, or the sentinel `'BW'` (bodyweight → store no `weight_kg`).
  - `reps` — string.
  - `rpe` — string → `effort_type:'rpe'`, `effort_value`.
  - `duration` — `m:ss` string (cardio OR timed hold) → `duration_seconds` via `parseDuration`.
  - `distance` — km string (cardio only) → `distance_m = round(km*1000)`.
  - `distance_m` — **metres** string (distance-strength / jump_distance) → `distance_m = round(metres)`.
  - `height_cm` — string (jump height; populated by ②c) → `height_cm`.
  - `leftWeight`/`leftReps`/`rightWeight`/`rightReps` — unilateral → **two rows**, one per side.
  - `avgHr`/`maxHr` — strings (populated by ②d) → `avg_hr`/`max_hr`.
- **Unilateral persists as two rows** sharing `set_number`, distinguished by `side` (`'left'`/`'right'`).
  A side with no reps is dropped. This is the L/R model ③ reads for imbalance charts.
- **No PII in `log.*`** — ids/counts/dates only.
- **Cache-bust:** bump `app-runner.js` `?v=N` in `index.html` in the same commit.
- Do not push (feature branch `progress-overhaul`; pushed only after the whole feature passes
  multi-agent-review).

---

### Task 1: Persist every captured field + stamp metric_type

**Files:**
- Modify: `js/app-runner.js` (the launchRunner exercise mapping ~line 40; the `saveRunnerSession`
  exercise-row insert ~line 1602; the per-set row-builder ~lines 1619-1634)
- Modify: `index.html` (bump `app-runner.js ?v=N`)

**Interfaces:**
- Consumes (from ①, live): `workout_log_sets.{avg_hr,max_hr,height_cm,side}`,
  `workout_log_exercises.metric_type`.
- Produces: `saveRunnerSession` now writes `metric_type` on each `workout_log_exercises` row and, for each
  `loggedSet`, the full set of `workout_log_sets` columns per the field contract above. Later slices rely
  on this mapping being in place.

- [ ] **Step 1: Carry `metric_type` onto the in-memory exercise**

In `js/app-runner.js` at the launchRunner mapping (~line 40), add `metricType` to the returned object.
Change the object that currently begins `return { name: ex.exercise_name, exerciseId: ex.exercise_id || null, type: ex.exercise_type || 'strength',` so it also carries:

```js
metricType: ex.metric_type || 'weight_reps',
```

Place it right after `type: ex.exercise_type || 'strength',` so the field sits beside the legacy type.

- [ ] **Step 2: Stamp `metric_type` on the logged-exercise rows**

In `saveRunnerSession`, the `exerciseRows` map (~line 1601-1604) currently reads:

```js
  const exerciseRows = exercises.map((ex, bi) => ({
    log_id: sessionLog.id, exercise_id: ex.exerciseId || null, exercise_name: ex.name, exercise_type: ex.type, order_index: bi,
    client_notes: ex.clientNotes || null
  }))
```

Add `metric_type`:

```js
  const exerciseRows = exercises.map((ex, bi) => ({
    log_id: sessionLog.id, exercise_id: ex.exerciseId || null, exercise_name: ex.name, exercise_type: ex.type,
    metric_type: ex.metricType || 'weight_reps', order_index: bi,
    client_notes: ex.clientNotes || null
  }))
```

- [ ] **Step 3: Rewrite the per-set row-builder**

Replace the entire existing block (currently ~lines 1619-1634):

```js
  const allSets = []
  exercises.forEach((ex, bi) => {
    const logExId = exerciseIdByOrderIndex[bi]
    ex.loggedSets.forEach((s, si) => {
      const row = { workout_log_exercise_id: logExId, set_number: si+1 }
      if (ex.type === 'cardio') {
        if (s.duration) row.duration_seconds = parseDuration(s.duration)
        if (s.distance) row.distance_m = Math.round(parseFloat(s.distance)*1000)
      } else {
        if (s.reps) row.reps_achieved = parseInt(s.reps)
        if (s.weight && s.weight !== 'BW') row.weight_kg = parseFloat(s.weight)
        if (s.rpe) { row.effort_type = 'rpe'; row.effort_value = parseFloat(s.rpe) }
      }
      if (Object.keys(row).length > 2) allSets.push(row)
    })
  })
```

with this version (persists every captured field; unilateral splits into two `side` rows):

```js
  const allSets = []
  exercises.forEach((ex, bi) => {
    const logExId = exerciseIdByOrderIndex[bi]
    ex.loggedSets.forEach((s, si) => {
      const setNumber = si + 1
      // Heart rate is common to any set shape (populated by sub-project ②d); apply it uniformly.
      const applyHr = (row) => {
        if (s.avgHr) row.avg_hr = parseInt(s.avgHr)
        if (s.maxHr) row.max_hr = parseInt(s.maxHr)
      }

      // Unilateral: the wizard captures both sides in ONE loggedSet. Persist as two rows sharing the
      // set_number, tagged by `side` — the L/R model progress imbalance charts read. Drop a side with
      // no reps. (base has 3 keys once `side` is added, so >3 means the row carries real data.)
      const isUnilateral = s.leftReps != null || s.rightReps != null || s.leftWeight != null || s.rightWeight != null
      if (isUnilateral) {
        for (const sd of [
          { side: 'left',  reps: s.leftReps,  weight: s.leftWeight },
          { side: 'right', reps: s.rightReps, weight: s.rightWeight }
        ]) {
          const row = { workout_log_exercise_id: logExId, set_number: setNumber, side: sd.side }
          if (sd.reps) row.reps_achieved = parseInt(sd.reps)
          if (sd.weight && sd.weight !== 'BW') row.weight_kg = parseFloat(sd.weight)
          applyHr(row)
          if (Object.keys(row).length > 3) allSets.push(row)
        }
        return
      }

      const row = { workout_log_exercise_id: logExId, set_number: setNumber }
      if (ex.type === 'cardio') {
        if (s.duration) row.duration_seconds = parseDuration(s.duration)
        if (s.distance) row.distance_m = Math.round(parseFloat(s.distance) * 1000) // cardio distance is km
      } else {
        // Timed hold: duration (+ optional load). Distance-strength / jump_distance: distance_m in METRES
        // (not km). Jump height: height_cm (populated by ②c). Plus the plain weight/reps/rpe case.
        if (s.duration)   row.duration_seconds = parseDuration(s.duration)
        if (s.distance_m) row.distance_m = Math.round(parseFloat(s.distance_m)) // already metres
        if (s.height_cm)  row.height_cm = parseFloat(s.height_cm)
        if (s.reps)       row.reps_achieved = parseInt(s.reps)
        if (s.weight && s.weight !== 'BW') row.weight_kg = parseFloat(s.weight)
        if (s.rpe) { row.effort_type = 'rpe'; row.effort_value = parseFloat(s.rpe) }
      }
      applyHr(row)
      if (Object.keys(row).length > 2) allSets.push(row)
    })
  })
```

- [ ] **Step 4: Bump the cache-bust**

In `index.html`, find the `app-runner.js?v=N` script tag and increment `N` by one (current is `v=23`
per the last session's live state — confirm the actual value in the file and add 1).

- [ ] **Step 5: Manually sanity-check with the app running**

Start the server (run-coachapp) if not up. As solo (Personal), open the runner on any template with a
plain strength exercise, log a couple of sets, and save — confirm it still saves cleanly (no regression
to the common path) and the "Session saved" toast appears. Full behavioural proof of the new shapes is
the Playwright test in Task 2.

- [ ] **Step 6: Commit**

```bash
git add js/app-runner.js index.html
git commit -m "sub-project 2b: persist unilateral/timed/distance/HR + metric_type in runner save"
```

---

### Task 2: Playwright round-trip regression test

**Files:**
- Create: `tests/runner-save-metrics.spec.js`

**Interfaces:**
- Consumes: `saveRunnerSession()` (global), the app's in-page `db` client, `_getCurrentClientId()` /
  `currentUser` (globals available in the app context after login).

- [ ] **Step 1: Write the failing test**

This test bypasses the fragile wizard UI: it constructs `window._runner` with one exercise per shape,
calls `saveRunnerSession()` directly (it reads `_runner`, falls back to `_runner.name`, and guards its
DOM lookups), then reads `workout_log_sets` back through the app's authenticated `db` client and asserts
every field persisted. It self-provisions and cleans up its own log.

Create `tests/runner-save-metrics.spec.js`:

```js
const { test, expect } = require('@playwright/test')
const { loginAsPT } = require('./helpers')

// Sub-project ②b: saveRunnerSession must persist unilateral (as two side-tagged rows), timed holds,
// distance-strength, and heart rate — data the wizard captures but the old save silently dropped.
test.describe('Runner save persists all metric shapes', () => {
  test('unilateral splits to L/R rows; timed, distance, and HR round-trip', async ({ page }) => {
    await loginAsPT(page)
    await page.click('text=Personal') // solo view — self-owned client, avoids cross-tenant setup
    await page.waitForTimeout(1500)

    const result = await page.evaluate(async () => {
      const clientId = await _getCurrentClientId()
      const tag = '[E2E] save-metrics ' + Date.now()
      // Construct runner state directly — one exercise per captured shape.
      window._runner = {
        clientId, name: tag, date: new Date().toISOString().split('T')[0], exercises: [
          { name: tag + ' Uni', type: 'strength', metricType: 'unilateral', exerciseId: null,
            loggedSets: [{ leftWeight: '20', leftReps: '10', rightWeight: '18', rightReps: '9' }] },
          { name: tag + ' Hold', type: 'strength', metricType: 'timed_hold', exerciseId: null,
            loggedSets: [{ duration: '1:30', weight: '5' }] },
          { name: tag + ' Jump', type: 'strength', metricType: 'jump_distance', exerciseId: null,
            loggedSets: [{ distance_m: '2.4' }] },
          { name: tag + ' Row', type: 'cardio', metricType: 'cardio', exerciseId: null,
            loggedSets: [{ duration: '20:00', distance: '5', avgHr: '150', maxHr: '175' }] }
        ]
      }
      await saveRunnerSession()

      // Read the log back through the app's authed db client.
      const { data: log } = await db.from('workout_logs').select('id').eq('client_id', clientId).eq('name', tag).single()
      const { data: exs } = await db.from('workout_log_exercises')
        .select('id, exercise_name, metric_type, workout_log_sets(set_number, side, reps_achieved, weight_kg, duration_seconds, distance_m, avg_hr, max_hr)')
        .eq('log_id', log.id)
      // cleanup
      const exIds = exs.map(e => e.id)
      await db.from('workout_log_sets').delete().in('workout_log_exercise_id', exIds)
      await db.from('workout_log_exercises').delete().eq('log_id', log.id)
      await db.from('workout_logs').delete().eq('id', log.id)
      return { exs }
    })

    const byName = Object.fromEntries(result.exs.map(e => [e.exercise_name.split(' ').pop(), e]))

    // Unilateral → two rows, one per side, same set_number, metric_type persisted.
    const uni = byName['Uni']
    expect(uni.metric_type).toBe('unilateral')
    const sides = uni.workout_log_sets.map(s => s.side).sort()
    expect(sides).toEqual(['left', 'right'])
    const left = uni.workout_log_sets.find(s => s.side === 'left')
    expect(left.reps_achieved).toBe(10)
    expect(Number(left.weight_kg)).toBe(20)

    // Timed hold → duration_seconds (90) + load.
    const hold = byName['Hold']
    expect(hold.metric_type).toBe('timed_hold')
    expect(hold.workout_log_sets[0].duration_seconds).toBe(90)
    expect(Number(hold.workout_log_sets[0].weight_kg)).toBe(5)

    // Jump distance → distance_m in metres (2.4 → 2, rounded), NOT km-scaled.
    const jump = byName['Jump']
    expect(jump.metric_type).toBe('jump_distance')
    expect(jump.workout_log_sets[0].distance_m).toBe(2)

    // Cardio → duration + km-scaled distance + heart rate.
    const row = byName['Row']
    expect(row.workout_log_sets[0].duration_seconds).toBe(1200)
    expect(row.workout_log_sets[0].distance_m).toBe(5000)
    expect(row.workout_log_sets[0].avg_hr).toBe(150)
    expect(row.workout_log_sets[0].max_hr).toBe(175)
  })
})
```

- [ ] **Step 2: Run it against the current (unfixed) code to confirm it fails**

Run: `npx playwright test tests/runner-save-metrics.spec.js --reporter=list`
Expected: **FAIL** — before Task 1, the unilateral/timed/jump rows are dropped or mis-mapped (e.g.
`sides` is empty, `duration_seconds` undefined for the hold, `distance_m` km-scaled for the jump). If you
run Task 2 after Task 1 it will pass directly; to see the red state, `git stash` the Task 1 change first.

- [ ] **Step 3: Run it against the fixed code**

Run: `npx playwright test tests/runner-save-metrics.spec.js --reporter=list`
Expected: **PASS** (1 passed).

- [ ] **Step 4: Run the full suite for regression**

Run: `npm test`
Expected: same baseline as ① close-out (153 passed / 2 skipped / 0 failed) **plus** this new test → 154
passed / 2 skipped / 0 failed. Read the real totals from the output.

- [ ] **Step 5: Commit**

```bash
git add tests/runner-save-metrics.spec.js
git commit -m "sub-project 2b: round-trip test for runner metric persistence"
```

---

## Self-Review

**1. Spec coverage (against spec ② + the ②b slice):**
- "Fix the save row-builders to persist every field the logging UI collected, keyed off metric_type" →
  Task 1 Step 3 (keyed off `loggedSet` shape, which is the reliable signal; `metric_type` is also
  stamped on the exercise row for ③). `saveWorkoutSession` deliberately out of scope (Global
  Constraints — it captures none of these shapes; HR there is ②d).
- Unilateral as two rows per set → Task 1 Step 3.
- "persist … heart rate" → mapped now (`avgHr`/`maxHr`), populated by ②d; test asserts cardio HR.
- metric_type onto logged exercises for ③ → Task 1 Steps 1-2.
- missed-check-to-test round-trip → Task 2.
- Cache-bust → Task 1 Step 4.
- **Out of scope, noted:** the finish-screen volume/summary (~app-runner.js:1420-1490) reads `s.weight`/
  `s.reps` and will under-count unilateral (L/R) and timed sets. That is display, belongs to ③, and is
  not touched here — flagged so it is not mistaken for a gap.

**2. Placeholder scan:** none — all code and commands are literal. The one "confirm actual value" (the
`app-runner.js ?v=N` number) is a real read-the-file instruction, not a vague placeholder.

**3. Type consistency:** the `loggedSet` field names in the row-builder (Task 1) exactly match the Global
Constraints contract and the shapes the wizard produces (`leftWeight`/`leftReps`/`rightWeight`/
`rightReps`, `duration`, `distance`, `distance_m`, `weight`, `reps`, `rpe`) and the test's constructed
sets (Task 2). DB column names (`side`, `reps_achieved`, `weight_kg`, `duration_seconds`, `distance_m`,
`avg_hr`, `max_hr`, `metric_type`) match ①'s migration exactly.

---

## Execution note

Unlike ①, this slice is fully agent-executable — no human-run SQL. The runner + Supabase are reachable
via the running preview server and the app's own authed `db` client, so the implementer can drive and
verify end-to-end.
