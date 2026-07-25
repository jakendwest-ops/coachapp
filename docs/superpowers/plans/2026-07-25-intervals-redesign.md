# Intervals Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the cloned-rows interval workaround with a single `interval` exercise type whose `sets_json` holds one block, expanded at launch into a flat phase list the runner walks by index.

**Architecture:** One new `metric_type` (`interval`). Its block is expanded by a **pure function** into an ordered phase array (`countdown → warmup → [(work → rest) × sets → recovery] × cycles → cooldown`). The builder renders one labelled-row screen and reads a live total from that same expansion; the runner walks the same array. Cardio is untouched.

**Tech Stack:** Vanilla ES6 (no build step, no framework), Supabase (Postgres + RLS), Playwright E2E only.

## Global Constraints

- **No TypeScript, no framework, no build step.** Plain browser-native ES6 in `js/`.
- **Every module changed must have its own `?v=N` bumped in `index.html` in the same commit.** Expected here: `app-workouts`, `app-runner`, `app-progress`.
- **No PII in `log.*` calls** — ids and dates only.
- **`multi-agent-review` (3 angles + verifier) before any push.** Non-negotiable.
- **Full Playwright suite before push** (currently 220 tests, real 390px viewport). Never piped through `tail`; never run concurrently against one `:3001`.
- **les-053: never edit application source while a Playwright run is in flight against the live dev server.**
- Interval exercises **must** carry `exercise_type = 'cardio'` — see Task 3, Step 3. Getting this wrong silently drops `duration_seconds`/`distance_m` on save.
- Spec: `docs/superpowers/specs/2026-07-25-intervals-redesign-design.md`

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `scripts/add-interval-type-2026-07-25.sql` | `metric_type` CHECK re-run + `workout_log_sets.phase` | Create |
| `js/app-workouts.js` | Pure expansion + total; builder block editor; prescription formatting; save derivation | Modify |
| `js/app-runner.js` | Phase-walking runner, overlay, save | Modify |
| `js/app-progress.js` | Exclude warmup/cooldown from aggregates | Modify |
| `index.html` | Cache-bust bumps | Modify |
| `tests/intervals-redesign-2026-07-25.spec.js` | All new coverage | Create |

`_expandIntervalBlock` lives in `js/app-workouts.js` because that file loads **before** `app-runner.js` and both consume it — the same arrangement already used for `_fmtSetDetail`, `_estimate1RM`, and `_resolveMetricType`.

**Natural checkpoint:** Tasks 1–4 deliver working *prescription* (build a block, see it on day rows). Tasks 5–8 deliver *running and logging*.

---

### Task 1: Migration — `interval` type and the `phase` column

**Files:**
- Create: `scripts/add-interval-type-2026-07-25.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `metric_type` accepts `'interval'`; `workout_log_sets.phase` exists, nullable, constrained to `'warmup'|'work'|'cooldown'`.

- [ ] **Step 1: Write the migration**

```sql
-- Intervals redesign, 2026-07-25.
-- (1) metric_type gains 'interval'. Idempotent drop-then-add, mirroring
--     scripts/add-metric-type-2026-07-18.sql — three tables, three constraint names.
alter table exercises                  drop constraint if exists exercises_metric_type_chk;
alter table workout_template_exercises drop constraint if exists wte_metric_type_chk;
alter table workout_log_exercises      drop constraint if exists wle_metric_type_chk;

alter table exercises add constraint exercises_metric_type_chk
  check (metric_type in ('weight_reps','cardio','unilateral','amrap','timed_hold','jump_height','jump_distance','interval'));
alter table workout_template_exercises add constraint wte_metric_type_chk
  check (metric_type in ('weight_reps','cardio','unilateral','amrap','timed_hold','jump_height','jump_distance','interval'));
alter table workout_log_exercises add constraint wle_metric_type_chk
  check (metric_type in ('weight_reps','cardio','unilateral','amrap','timed_hold','jump_height','jump_distance','interval'));

-- (2) phase marks which part of an interval block a logged row came from.
--     NULL = an ordinary set (every pre-existing row, all strength, all steady-state cardio).
--     'rest'/'recovery' are deliberately absent: neither is ever recorded.
alter table workout_log_sets add column if not exists phase text;
alter table workout_log_sets drop constraint if exists wls_phase_chk;
alter table workout_log_sets add constraint wls_phase_chk
  check (phase is null or phase in ('warmup','work','cooldown'));
```

- [ ] **Step 2: Commit**

```bash
git add scripts/add-interval-type-2026-07-25.sql
git commit -m "sql: interval metric_type + workout_log_sets.phase"
```

- [ ] **Step 3: 🛑 STOP — Jake runs this in Supabase before any further task**

Paste the SQL inline to Jake (never a file path — he copies it straight into the Supabase SQL editor). Wait for explicit confirmation it ran.

**Do not start Task 2 until confirmed.** On 2026-07-24 a `.select()` referencing a not-yet-migrated column, edited while a Playwright suite was live, silently corrupted a real account's role in production (les-053). Every later task in this plan reads or writes one of these two things.

---

### Task 2: Phase expansion — the pure function everything rests on

**Files:**
- Modify: `js/app-workouts.js` (add after `_resolveMetricType`, ~line 111)
- Test: `tests/intervals-redesign-2026-07-25.spec.js` (create)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `_expandIntervalBlock(block) → Array<{phase:'countdown'|'warmup'|'work'|'rest'|'recovery'|'cooldown', secs:number|null, distanceM?:number, set?:number, cycle?:number}>`
  - `_intervalTotalSecs(phases) → { total:number, hasUnknown:boolean }`

- [ ] **Step 1: Write the failing tests**

Create `tests/intervals-redesign-2026-07-25.spec.js`:

```js
const { test, expect } = require('@playwright/test')
const { loginAsPT } = require('./helpers')

// The block model's whole value is that it's a pure function: block in, ordered phases out.
// No DOM, no Supabase, no timers — so these run fast and pin the arithmetic exactly.
test.describe('Interval block expansion (2026-07-25)', () => {
  test('reproduces the reference app\'s 27:00 worked example exactly', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      const phases = _expandIntervalBlock({
        countdownSecs: 0, warmupSecs: 120, workSecs: 240, restSecs: 120,
        sets: 4, recoverySecs: 60, cycles: 1, cooldownSecs: 0
      })
      return { phases, total: _intervalTotalSecs(phases) }
    })
    // warmup 2:00 + 4 x (4:00 work + 2:00 rest) + 1:00 recovery = 27:00
    expect(r.total.total).toBe(1620)
    expect(r.total.hasUnknown).toBe(false)
    expect(r.phases[0].phase).toBe('warmup')
    expect(r.phases.filter(p => p.phase === 'work').length).toBe(4)
    expect(r.phases.filter(p => p.phase === 'rest').length).toBe(4)
    expect(r.phases.filter(p => p.phase === 'recovery').length).toBe(1)
  })

  test('omits zero-valued phases rather than emitting 0-second ones', async ({ page }) => {
    await loginAsPT(page)
    const kinds = await page.evaluate(() => _expandIntervalBlock({
      countdownSecs: 0, warmupSecs: 0, workSecs: 30, restSecs: 0,
      sets: 3, recoverySecs: 0, cycles: 1, cooldownSecs: 0
    }).map(p => p.phase))
    expect(kinds).toEqual(['work', 'work', 'work'])
  })

  test('nests sets inside cycles and tags each work round', async ({ page }) => {
    await loginAsPT(page)
    const work = await page.evaluate(() => _expandIntervalBlock({
      workSecs: 30, restSecs: 15, sets: 2, cycles: 3, recoverySecs: 60
    }).filter(p => p.phase === 'work').map(p => `${p.cycle}.${p.set}`))
    expect(work).toEqual(['1.1', '1.2', '2.1', '2.2', '3.1', '3.2'])
  })

  test('a distance block yields work rounds with no duration, and an honest partial total', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      const phases = _expandIntervalBlock({
        isDistanceBased: true, workDistanceM: 400, restSecs: 90, sets: 8, cycles: 1
      })
      return { first: phases.find(p => p.phase === 'work'), total: _intervalTotalSecs(phases) }
    })
    expect(r.first.secs).toBeNull()
    expect(r.first.distanceM).toBe(400)
    expect(r.total.hasUnknown).toBe(true)   // work time is unknowable without a sensor
    expect(r.total.total).toBe(720)          // 8 x 90s rest only
  })

  test('guards against a missing/zero sets or cycles count producing an empty block', async ({ page }) => {
    await loginAsPT(page)
    const n = await page.evaluate(() => _expandIntervalBlock({ workSecs: 30, sets: 0, cycles: 0 }).length)
    expect(n).toBe(1)   // clamped to at least 1 set x 1 cycle
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx playwright test tests/intervals-redesign-2026-07-25.spec.js --reporter=list`
Expected: FAIL — `_expandIntervalBlock is not defined`.

- [ ] **Step 3: Implement**

Add to `js/app-workouts.js` immediately after `_resolveMetricType` (~line 111):

```js
// ─── INTERVAL BLOCKS (2026-07-25) ─────────────────────────────────────────────
// An interval exercise's sets_json holds ONE entry describing the whole block; this expands it into
// the flat, ordered phase list both the builder (for its total-time readout) and the runner (which
// walks it by index) consume.
//
// Deliberately PURE — no DOM, no globals, no timers. The previous interval implementation chained
// work -> rest -> a one-shot `_afterRest` callback, which is untestable without driving a browser and
// is the shape behind past stray-timer bugs. An array you can assert on is the point of this rewrite.
//
// Rest runs after EVERY work round and recovery after EVERY cycle, including the last of each. That
// is not arbitrary: it reproduces the reference app's own 27:00 arithmetic (see the spec). Zero-valued
// phases are omitted entirely rather than emitted as 0-second entries.
function _expandIntervalBlock(b) {
  const block = b || {}
  const n = v => Math.max(0, parseInt(v, 10) || 0)
  const countdown = n(block.countdownSecs)
  const warmup    = n(block.warmupSecs)
  const work      = n(block.workSecs)
  const rest      = n(block.restSecs)
  const recovery  = n(block.recoverySecs)
  const cooldown  = n(block.cooldownSecs)
  // Clamped so a blank/0 never collapses the block to nothing at all.
  const sets      = Math.max(1, n(block.sets))
  const cycles    = Math.max(1, n(block.cycles))
  const isDist    = !!block.isDistanceBased
  const workDist  = isDist ? (parseFloat(block.workDistanceM) || 0) : null

  const phases = []
  if (countdown) phases.push({ phase: 'countdown', secs: countdown })
  if (warmup)    phases.push({ phase: 'warmup',    secs: warmup })
  for (let cycle = 1; cycle <= cycles; cycle++) {
    for (let set = 1; set <= sets; set++) {
      // secs:null marks a round that cannot auto-advance — there is no distance sensor, so the
      // athlete taps Done. The runner branches on exactly this.
      phases.push(isDist
        ? { phase: 'work', secs: null, distanceM: workDist, set, cycle }
        : { phase: 'work', secs: work, set, cycle })
      if (rest) phases.push({ phase: 'rest', secs: rest, set, cycle })
    }
    if (recovery) phases.push({ phase: 'recovery', secs: recovery, cycle })
  }
  if (cooldown) phases.push({ phase: 'cooldown', secs: cooldown })
  return phases
}

// Sum of a phase list. `hasUnknown` is true when any work round is distance-based, because its
// duration genuinely cannot be known up front — callers must qualify the number rather than present
// a confident total that is simply wrong.
function _intervalTotalSecs(phases) {
  let total = 0, hasUnknown = false
  for (const p of (phases || [])) {
    if (p.secs == null) hasUnknown = true
    else total += p.secs
  }
  return { total, hasUnknown }
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx playwright test tests/intervals-redesign-2026-07-25.spec.js --reporter=list`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add js/app-workouts.js tests/intervals-redesign-2026-07-25.spec.js
git commit -m "intervals: pure block-to-phase expansion + total-time helper"
```

---

### Task 3: Builder — the `interval` type and its block editor

**Files:**
- Modify: `js/app-workouts.js` — `_deriveFromMetricType` (~1655), `_cleanTemplateSets` (~229), `renderTemplateSets` (~1243), `flushTemplateSets` (~1188), the `att-type` `<select>` (~1455)
- Test: `tests/intervals-redesign-2026-07-25.spec.js`

**Interfaces:**
- Consumes: `_expandIntervalBlock`, `_intervalTotalSecs` (Task 2); existing `row()`, `mini()`, `tog()`, `dash`, `more()` helpers inside `renderTemplateSets`; `distanceToPref`/`distanceFromPref`.
- Produces: `metric_type='interval'` exercises saving exactly one `sets_json` entry with `exercise_type='cardio'`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/intervals-redesign-2026-07-25.spec.js`:

```js
test.describe('Interval builder (2026-07-25)', () => {
  test('an 8-set block saves ONE sets_json entry, not eight', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(async () => {
      const tag = '[E2E] interval block ' + Date.now()
      const { data: t } = await db.from('workout_templates')
        .insert({ coach_id: currentUser.id, client_id: null, program_id: null, name: tag, is_personal: false })
        .select('id').single()
      window._templateCtx = {}
      const mk = (id, el = 'input') => { let e = document.getElementById(id); if (!e) { e = document.createElement(el); e.id = id; document.body.appendChild(e) } return e }
      mk('att-type', 'select'); mk('att-notes'); mk('att-superset'); mk('att-error'); mk('add-to-template-modal', 'div')
      document.getElementById('att-type').innerHTML = '<option value="interval">Interval</option>'
      document.getElementById('att-type').value = 'interval'
      window._exerciseDetailPicked = { id: null, name: tag + ' Row' }
      window._templateSets = [{ countdownSecs: 5, warmupSecs: 0, workSecs: 30, restSecs: 30, sets: 8, recoverySecs: 0, cycles: 1, cooldownSecs: 0 }]
      await saveExerciseToTemplate(t.id)
      const { data } = await db.from('workout_template_exercises')
        .select('exercise_type, metric_type, sets_json').eq('template_id', t.id).single()
      await db.from('workout_template_exercises').delete().eq('template_id', t.id)
      await db.from('workout_templates').delete().eq('id', t.id)
      return data
    })
    // The entire point of the redesign: rounds are a number, not N cloned rows.
    expect(r.sets_json.length).toBe(1)
    expect(r.sets_json[0].sets).toBe(8)
    expect(r.metric_type).toBe('interval')
    // Load-bearing: runner + save gate cardio behaviour on the LEGACY exercise_type column in three
    // places. Wrong value here and logged rounds silently lose duration_seconds / distance_m.
    expect(r.exercise_type).toBe('cardio')
  })

  test('the block editor renders one screen of measures, with no per-set repeat control', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      const mk = (id, el = 'input') => { let e = document.getElementById(id); if (!e) { e = document.createElement(el); e.id = id; document.body.appendChild(e) } return e }
      mk('att-type', 'select'); mk('att-sets-container', 'div')
      window._templateSets = [{ workSecs: 30, restSecs: 30, sets: 8, cycles: 1 }]
      renderTemplateSets('att-sets-container', 'interval')
      return {
        hasWork:     !!document.getElementById('ts-worksecs-0'),
        hasSets:     !!document.getElementById('ts-sets-0'),
        hasCycles:   !!document.getElementById('ts-cycles-0'),
        hasWarmup:   !!document.getElementById('ts-warmup-0'),
        hasCooldown: !!document.getElementById('ts-cooldown-0'),
        hasTotal:    !!document.getElementById('ts-interval-total'),
        repeatBoxes: document.querySelectorAll('[id^="ts-repeatn-"]').length,
        addSetBtns:  Array.from(document.querySelectorAll('button')).filter(b => /Add set/i.test(b.textContent)).length,
      }
    })
    expect(r.hasWork && r.hasSets && r.hasCycles && r.hasWarmup && r.hasCooldown).toBe(true)
    expect(r.hasTotal).toBe(true)
    expect(r.repeatBoxes).toBe(0)   // the control Jake called out — gone for intervals
    expect(r.addSetBtns).toBe(0)    // a block is one thing; there are no sets to add
  })

  test('flushTemplateSets round-trips every block field', async ({ page }) => {
    await loginAsPT(page)
    const b = await page.evaluate(() => {
      const mk = (id, el = 'input') => { let e = document.getElementById(id); if (!e) { e = document.createElement(el); e.id = id; document.body.appendChild(e) } return e }
      mk('att-type', 'select'); mk('att-sets-container', 'div')
      window._templateSets = [{}]
      renderTemplateSets('att-sets-container', 'interval')
      document.getElementById('ts-countdown-0').value = '5'
      document.getElementById('ts-warmup-0').value    = '2:00'
      document.getElementById('ts-worksecs-0').value  = '0:30'
      document.getElementById('ts-restsecs-0').value  = '0:45'
      document.getElementById('ts-sets-0').value      = '6'
      document.getElementById('ts-recovery-0').value  = '1:00'
      document.getElementById('ts-cycles-0').value    = '3'
      document.getElementById('ts-cooldown-0').value  = '3:00'
      flushTemplateSets('att-sets-container')
      return window._templateSets[0]
    })
    expect(b.countdownSecs).toBe(5)
    expect(b.warmupSecs).toBe(120)
    expect(b.workSecs).toBe(30)
    expect(b.restSecs).toBe(45)
    expect(b.sets).toBe(6)
    expect(b.recoverySecs).toBe(60)
    expect(b.cycles).toBe(3)
    expect(b.cooldownSecs).toBe(180)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx playwright test tests/intervals-redesign-2026-07-25.spec.js -g "Interval builder" --reporter=list`
Expected: FAIL — no `interval` branch; `ts-worksecs-0` undefined.

- [ ] **Step 3: Derive the legacy `exercise_type` — do this first, it is the trap**

In `js/app-workouts.js`, `_deriveFromMetricType` (~1655):

```js
function _deriveFromMetricType(metricType) {
  return {
    // 'interval' MUST resolve to the legacy 'cardio' exercise_type. The runner's cardio input branch
    // (app-runner.js:803), logRunnerSet's chaining (:1068) and saveRunnerSession's column mapping
    // (:1962) all gate on `ex.type === 'cardio'`, NOT on metric_type. An interval exercise typed
    // 'strength' here falls into the strength branch of all three and silently loses its
    // duration_seconds / distance_m on save, with no error anywhere.
    exercise_type: (metricType === 'cardio' || metricType === 'interval') ? 'cardio' : 'strength',
    unilateral: metricType === 'unilateral',
    timed: metricType === 'timed_hold'
  }
}
```

- [ ] **Step 4: Carry the block keys through the save allowlist**

In `_cleanTemplateSets` (~229), add to the returned object, after the jump targets line:

```js
    // Jump targets.
    targetHeightCm: s.targetHeightCm || null, targetDistanceM: s.targetDistanceM || null,
    // Interval block (2026-07-25). This allowlist is an allowlist — a key absent here is silently
    // dropped on save, which is exactly how every cardio target was lost before les-036.
    countdownSecs: s.countdownSecs ?? null, warmupSecs: s.warmupSecs ?? null,
    workSecs: s.workSecs ?? null, workDistanceM: s.workDistanceM ?? null,
    restSecs: s.restSecs ?? null, sets: s.sets ?? null,
    recoverySecs: s.recoverySecs ?? null, cycles: s.cycles ?? null,
    cooldownSecs: s.cooldownSecs ?? null
```

(`??` not `||` — a deliberate `0` for warmup/cooldown must survive, and `0 || null` would erase it.)

- [ ] **Step 5: Add the type option**

In the `att-type` `<select>` (~1461), after the `jump_distance` option:

```html
          <option value="interval"      ${existingType === 'interval'      ? 'selected' : ''}>Intervals</option>
```

Also add `&& existingType !== 'interval'` to the `weight_reps` option's fallback condition on line 1456, so an interval exercise doesn't select both.

- [ ] **Step 6: Render the block editor**

In `renderTemplateSets` (~1243), add alongside the existing type flags (~1249):

```js
  const isInterval = type === 'interval'
```

An interval always edits exactly one block — before the `.map()`, normalise:

```js
  // A block is one thing. Anything that arrived as N rows (a type switch from cardio, a clone)
  // collapses to the first; anything empty seeds sensible defaults.
  if (isInterval) {
    const b = (window._templateSets || [])[0] || {}
    window._templateSets = [{ countdownSecs: b.countdownSecs ?? 5, warmupSecs: b.warmupSecs ?? 0,
      isDistanceBased: !!b.isDistanceBased, workSecs: b.workSecs ?? 30, workDistanceM: b.workDistanceM ?? null,
      restSecs: b.restSecs ?? 30, sets: b.sets ?? 8, recoverySecs: b.recoverySecs ?? 0,
      cycles: b.cycles ?? 1, cooldownSecs: b.cooldownSecs ?? 0, ...b }]
  }
```

Render the block using the **existing** `row()` / `mini()` / `tog()` helpers — no new visual language. Emit one `<div>` (not the per-set card): omit the whole `Set N` header bar, so the `ts-repeatn-*` input, `Copy set ↑`, `AMRAP/BW/Assist` and the `×` delete button are all absent. Rows, in order, with these exact ids:

| Row label | Input id | Kind |
|---|---|---|
| `Initial countdown` | `ts-countdown-0` | seconds, `type="number"` |
| `Warm-up` | `ts-warmup-0` | mm:ss, `oninput="this.value=fmtRestInput(this.value)"` |
| `Work` | `ts-worksecs-0` / `ts-workdist-0` | mm:ss, or metres when `isDistanceBased` |
| `Rest` | `ts-restsecs-0` | mm:ss |
| `Sets` | `ts-sets-0` | `type="number" min="1"` |
| `Recovery` | `ts-recovery-0` | mm:ss |
| `Cycles` | `ts-cycles-0` | `type="number" min="1"` |
| `Cool-down` | `ts-cooldown-0` | mm:ss |

Above the Work row, a Time|Distance switch reusing `tog()` exactly as the cardio branch does:

```js
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
          <span style="font-size:13px;font-weight:600;color:var(--text)">Work measured by</span>
          <div style="display:flex;gap:4px">
            ${tog('Time', !s.isDistanceBased, `toggleTsSet(0,'isDistanceBased','${containerId}')`)}
            ${tog('Distance', s.isDistanceBased, `toggleTsSet(0,'isDistanceBased','${containerId}')`)}
          </div>
        </div>
```

Below the last row, the total readout:

```js
        ${(() => {
          const { total, hasUnknown } = _intervalTotalSecs(_expandIntervalBlock(s))
          // Never present a confident total for a distance block — work-round duration is unknowable
          // without a sensor, so say so rather than show a number that is simply wrong.
          const txt = hasUnknown ? `${fmtRestCountdown(total)} + work time` : fmtRestCountdown(total)
          return row('<span style="font-weight:700">Total time</span>',
            `<span id="ts-interval-total" style="font-size:13px;font-weight:700;color:var(--accent)">${txt}</span>`)
        })()}
```

Finally reuse the existing `more('+ More targets', …)` disclosure with the cardio pace/watts/HR/stroke-rate rows verbatim, so those targets remain prescribable.

- [ ] **Step 7: Read the block back**

In `flushTemplateSets` (~1188), before the existing per-set reads, short-circuit for intervals:

```js
  // An interval block is a single entry with its own ids (no -${i} fan-out) — read it and return.
  const intervalBlock = document.getElementById('ts-worksecs-0') || document.getElementById('ts-workdist-0')
  if (intervalBlock && (window._templateSets || []).length === 1) {
    const s = window._templateSets[0]
    const num  = id => { const el = document.getElementById(id); return el ? (parseInt(el.value, 10) || 0) : undefined }
    const mmss = id => { const el = document.getElementById(id); return el ? (parseRest(el.value) || 0) : undefined }
    const set = (k, v) => { if (v !== undefined) s[k] = v }
    set('countdownSecs', num('ts-countdown-0'))
    set('warmupSecs',    mmss('ts-warmup-0'))
    set('workSecs',      mmss('ts-worksecs-0'))
    set('restSecs',      mmss('ts-restsecs-0'))
    set('sets',          num('ts-sets-0'))
    set('recoverySecs',  mmss('ts-recovery-0'))
    set('cycles',        num('ts-cycles-0'))
    set('cooldownSecs',  mmss('ts-cooldown-0'))
    { const el = document.getElementById('ts-workdist-0'); if (el) s.workDistanceM = distanceFromPref(el.value) ?? null }
    return
  }
```

The `undefined` sentinel matters: an id absent from the DOM leaves the stored value alone, while a *rendered but blank* field legitimately writes `0` — the same "missing element vs deliberately cleared" distinction the units work established.

- [ ] **Step 8: Run to verify they pass**

Run: `npx playwright test tests/intervals-redesign-2026-07-25.spec.js --reporter=list`
Expected: 8 passed.

- [ ] **Step 9: Commit**

```bash
git add js/app-workouts.js tests/intervals-redesign-2026-07-25.spec.js
git commit -m "intervals: builder block editor, one entry per block, exercise_type derivation"
```

---

### Task 4: Prescription display

**Files:**
- Modify: `js/app-workouts.js` — `_fmtSetDetail` (~127)
- Test: `tests/intervals-redesign-2026-07-25.spec.js`

**Interfaces:**
- Consumes: `_expandIntervalBlock`, `_intervalTotalSecs`.
- Produces: an interval branch in the shared prescription formatter, so day rows, session detail, the picker preview and builder slot previews all read correctly from one place.

- [ ] **Step 1: Write the failing test**

```js
test('day rows describe an interval block, not a bare set count', async ({ page }) => {
  await loginAsPT(page)
  const s = await page.evaluate(() => [
    _fmtSetDetail({ workSecs: 30, restSecs: 30, sets: 8, cycles: 1 }, { isInterval: true }),
    _fmtSetDetail({ isDistanceBased: true, workDistanceM: 400, restSecs: 90, sets: 8, cycles: 1 }, { isInterval: true }),
    _fmtSetDetail({ workSecs: 60, restSecs: 30, sets: 4, cycles: 3, recoverySecs: 120 }, { isInterval: true }),
  ])
  expect(s[0]).toContain('8 × 0:30 / 0:30')
  expect(s[1]).toContain('400')
  expect(s[2]).toContain('3 cycles')
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx playwright test tests/intervals-redesign-2026-07-25.spec.js -g "day rows describe" --reporter=list`
Expected: FAIL — returns a generic/empty string.

- [ ] **Step 3: Implement**

Add an `isInterval` option to `_fmtSetDetail`'s destructured signature and branch **before** the cardio branch:

```js
function _fmtSetDetail(s, { isCardio = false, isInterval = false, includeRest = false, markAmrap = true } = {}) {
  if (!s) return '—'
  if (isInterval) {
    const work = s.isDistanceBased
      ? fmtDistanceM(s.workDistanceM)
      : fmtRestCountdown(Math.max(0, parseInt(s.workSecs, 10) || 0))
    const rest = fmtRestCountdown(Math.max(0, parseInt(s.restSecs, 10) || 0))
    const sets = Math.max(1, parseInt(s.sets, 10) || 0)
    const cycles = Math.max(1, parseInt(s.cycles, 10) || 0)
    const parts = [`${sets} × ${work}${rest !== '0:00' ? ' / ' + rest : ''}`]
    if (cycles > 1) parts.push(`${cycles} cycles`)
    const { total, hasUnknown } = _intervalTotalSecs(_expandIntervalBlock(s))
    if (total) parts.push(hasUnknown ? `${fmtRestCountdown(total)}+ total` : `${fmtRestCountdown(total)} total`)
    return parts.join(' · ')
  }
  // …existing body unchanged…
```

Then update every caller that formats a set for an interval exercise to pass `isInterval`. Find them with:

```bash
grep -rn "_fmtSetDetail(\|_fmtSetsCollapsed(" js/
```

Each call site already computes an `isCardio` flag from the resolved metric type; add the parallel `isInterval: mt === 'interval'` beside it. `_fmtSetsCollapsed` must **not** collapse an interval (there is only ever one entry) — pass the single entry straight through.

- [ ] **Step 4: Run to verify it passes**

Run: `npx playwright test tests/intervals-redesign-2026-07-25.spec.js --reporter=list`
Expected: 9 passed.

- [ ] **Step 5: Commit**

```bash
git add js/app-workouts.js tests/intervals-redesign-2026-07-25.spec.js
git commit -m "intervals: prescription formatting for blocks"
```

---

### Task 5: Runner — walk the phase list

**Files:**
- Modify: `js/app-runner.js` — `launchRunner` exercise mapping (~40), `startIntervalTimer` (~1279), new phase-walk functions
- Test: `tests/intervals-redesign-2026-07-25.spec.js`

**Interfaces:**
- Consumes: `_expandIntervalBlock` (Task 2); existing `startRestTimer`, `stopIntervalTimer`, `speakCue`, `playBeep`, `clearTimer`.
- Produces: `_runner.exercises[i].phases` (array), `_runner._phaseIdx` (number), `_startPhaseAt(idx)`, `_advancePhase()`.

- [ ] **Step 1: Write the failing tests**

```js
test.describe('Interval runner phase walk (2026-07-25)', () => {
  test('an interval exercise carries an expanded phase list and starts at phase 0', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      _runner = { clientId: 'x', exercises: [{
        name: 'Row', type: 'cardio', metricType: 'interval', loggedSets: [],
        sets_json: [{ warmupSecs: 60, workSecs: 30, restSecs: 30, sets: 4, cycles: 1 }]
      }], exIdx: 0, startTime: Date.now() }
      _initIntervalPhases(_runner.exercises[0])
      return { n: _runner.exercises[0].phases.length, first: _runner.exercises[0].phases[0].phase }
    })
    expect(r.n).toBe(9)          // warmup + 4 x (work + rest)
    expect(r.first).toBe('warmup')
  })

  test('advancing walks phases in order and stops at the end', async ({ page }) => {
    await loginAsPT(page)
    const seq = await page.evaluate(() => {
      _runner = { clientId: 'x', exercises: [{
        name: 'Row', type: 'cardio', metricType: 'interval', loggedSets: [],
        sets_json: [{ workSecs: 10, restSecs: 5, sets: 2, cycles: 1, cooldownSecs: 20 }]
      }], exIdx: 0, startTime: Date.now() }
      const ex = _runner.exercises[0]
      _initIntervalPhases(ex)
      return ex.phases.map(p => p.phase)
    })
    expect(seq).toEqual(['work', 'rest', 'work', 'rest', 'cooldown'])
  })

  test('a distance work round is marked as needing a manual advance', async ({ page }) => {
    await loginAsPT(page)
    const p = await page.evaluate(() => {
      _runner = { clientId: 'x', exercises: [{
        name: 'Run', type: 'cardio', metricType: 'interval', loggedSets: [],
        sets_json: [{ isDistanceBased: true, workDistanceM: 400, restSecs: 60, sets: 3, cycles: 1 }]
      }], exIdx: 0, startTime: Date.now() }
      _initIntervalPhases(_runner.exercises[0])
      return _runner.exercises[0].phases.find(x => x.phase === 'work')
    })
    // secs:null is the runner's signal to show Done instead of auto-advancing — and is why distance
    // rounds no longer dead-end the way they did before this redesign.
    expect(p.secs).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx playwright test tests/intervals-redesign-2026-07-25.spec.js -g "phase walk" --reporter=list`
Expected: FAIL — `_initIntervalPhases is not defined`.

- [ ] **Step 3: Implement**

In `js/app-runner.js`, add near the other interval functions:

```js
// Interval exercises walk a pre-expanded phase list rather than chaining one-shot callbacks. The old
// approach (work -> rest -> _afterRest) is a single-slot callback with no queue; across 8 phase types
// and 2 nesting levels it becomes the shape that has produced stray-timer bugs here before.
function _isIntervalExercise(ex) {
  return !!ex && _exMetricType(ex) === 'interval'
}

function _initIntervalPhases(ex) {
  ex.phases = _expandIntervalBlock(ex.sets_json?.[0] || {})
  ex.targetSets = ex.phases.filter(p => p.phase === 'work').length
  _runner._phaseIdx = 0
  return ex.phases
}

// Starts the phase at `idx`. Timed phases auto-advance; a distance work round (secs === null) waits
// for the athlete's Done tap, since there is no sensor to end it.
function _startPhaseAt(idx) {
  const ex = _runner.exercises[_runner.exIdx]
  const phases = ex.phases || []
  _runner._phaseIdx = idx
  if (idx >= phases.length) { _finishIntervalExercise(); return }
  const p = phases[idx]
  if (p.phase === 'rest' || p.phase === 'recovery') {
    // Rest and recovery reuse the existing rest bar and are never logged.
    _runner._afterRest = () => _advancePhase()
    startRestTimer(p.secs)
    return
  }
  if (p.secs == null) { renderIntervalTimer(); return }   // distance round — Done tap advances
  startIntervalPhaseTimer(p.secs)
}

function _advancePhase() {
  _startPhaseAt((_runner._phaseIdx || 0) + 1)
}
```

Rewrite `startIntervalTimer` into `startIntervalPhaseTimer(secs)`: keep the existing tick body verbatim (countdown text, colour flip at ≤5, `speakCue`, ring `strokeDashoffset`), but replace the entire at-zero block (`js/app-runner.js:1287-1323`) with:

```js
    if (_runner._intervalRemaining <= 0) {
      stopIntervalTimer()
      playBeep(1046, 0.5, 0.95)
      const p = (_runner.exercises[_runner.exIdx].phases || [])[_runner._phaseIdx] || {}
      if (p.phase === 'work' || p.phase === 'warmup' || p.phase === 'cooldown') _logIntervalPhase(p)
      _advancePhase()
      renderRunner()
      return
    }
```

Keep the legacy `startIntervalTimer` in place for non-interval cardio exercises — **do not** delete it. Steady-state cardio still uses it and is explicitly out of scope.

In `launchRunner`'s exercise mapping (~40), after the object is built, initialise phases for interval exercises so `targetSets` reflects real work rounds rather than `sets_json.length` (which is always 1 for a block).

- [ ] **Step 4: Run to verify they pass**

Run: `npx playwright test tests/intervals-redesign-2026-07-25.spec.js --reporter=list`
Expected: 12 passed.

- [ ] **Step 5: Commit**

```bash
git add js/app-runner.js tests/intervals-redesign-2026-07-25.spec.js
git commit -m "intervals: runner walks an expanded phase list"
```

---

### Task 6: Runner overlay — phase name, sets, cycles, remaining

**Files:**
- Modify: `js/app-runner.js` — `renderIntervalTimer` (~1347)
- Test: `tests/intervals-redesign-2026-07-25.spec.js`

**Interfaces:**
- Consumes: `_runner._phaseIdx`, `ex.phases`, `_intervalTotalSecs`.
- Produces: overlay showing current phase + `Set n of N · Cycle c of C` + remaining total; a **Done** button on distance rounds in place of *Done early — LOG*.

- [ ] **Step 1: Write the failing test**

```js
test('the overlay names the current phase and shows set/cycle position', async ({ page }) => {
  await loginAsPT(page)
  const txt = await page.evaluate(() => {
    _runner = { clientId: 'x', exercises: [{
      name: 'Row', type: 'cardio', metricType: 'interval', loggedSets: [],
      sets_json: [{ workSecs: 30, restSecs: 30, sets: 4, cycles: 2 }]
    }], exIdx: 0, startTime: Date.now(), _intervalRemaining: 30, _intervalSecs: 30 }
    _initIntervalPhases(_runner.exercises[0])
    _runner._phaseIdx = 0
    renderIntervalTimer()
    const t = document.getElementById('wr-interval-overlay')?.innerText || ''
    document.getElementById('wr-interval-overlay')?.remove()
    return t
  })
  expect(txt).toMatch(/WORK/i)
  expect(txt).toMatch(/Set 1 of 4/i)
  expect(txt).toMatch(/Cycle 1 of 2/i)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx playwright test tests/intervals-redesign-2026-07-25.spec.js -g "names the current phase" --reporter=list`
Expected: FAIL — overlay still says `INTERVAL IN PROGRESS` / `Round N of M`.

- [ ] **Step 3: Implement**

In `renderIntervalTimer`, when `_isIntervalExercise(ex)`:
- Replace the hardcoded `INTERVAL IN PROGRESS` label with the current phase name, upper-cased (`WARM-UP` / `WORK` / `REST` / `RECOVERY` / `COOL-DOWN`).
- Replace `roundLabel` with `Set ${p.set} of ${setsPerCycle}` plus `· Cycle ${p.cycle} of ${cycles}` when `cycles > 1`.
- Add a remaining-total line beneath, summing `secs` over `phases.slice(_phaseIdx)` via `_intervalTotalSecs`, qualified with `+` when `hasUnknown`.
- When the current phase is a **distance** work round, replace the *Done early — LOG* button with **`Done — ${fmtDistanceM(p.distanceM)}`** wired to `_logIntervalPhase(p); _advancePhase()`.
- Keep the ring SVG, the optional distance/pace inputs and `mountModal` exactly as they are. Non-interval cardio keeps the existing rendering untouched.

- [ ] **Step 4: Run to verify it passes**

Run: `npx playwright test tests/intervals-redesign-2026-07-25.spec.js --reporter=list`
Expected: 13 passed.

- [ ] **Step 5: Commit**

```bash
git add js/app-runner.js tests/intervals-redesign-2026-07-25.spec.js
git commit -m "intervals: phase-aware runner overlay"
```

---

### Task 7: Save — write `phase`, and only for recorded phases

**Files:**
- Modify: `js/app-runner.js` — `_logIntervalPhase` (new), `saveRunnerSession` set mapping (~1962)
- Test: `tests/intervals-redesign-2026-07-25.spec.js`

**Interfaces:**
- Consumes: `_runner.exercises[i].loggedSets`.
- Produces: `workout_log_sets` rows carrying `phase`; rest and recovery produce no rows at all.

- [ ] **Step 1: Write the failing test**

```js
test('only work, warmup and cooldown are logged — rest and recovery write nothing', async ({ page }) => {
  await loginAsPT(page)
  const r = await page.evaluate(() => {
    _runner = { clientId: 'x', exercises: [{
      name: 'Row', type: 'cardio', metricType: 'interval', loggedSets: [],
      sets_json: [{ warmupSecs: 60, workSecs: 30, restSecs: 30, sets: 3, cycles: 1, cooldownSecs: 45 }]
    }], exIdx: 0, startTime: Date.now() }
    const ex = _runner.exercises[0]
    _initIntervalPhases(ex)
    ex.phases.forEach(p => { if (p.phase !== 'rest' && p.phase !== 'recovery') _logIntervalPhase(p) })
    return ex.loggedSets.map(s => s.phase)
  })
  expect(r).toEqual(['warmup', 'work', 'work', 'work', 'cooldown'])
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx playwright test tests/intervals-redesign-2026-07-25.spec.js -g "only work, warmup and cooldown" --reporter=list`
Expected: FAIL — `_logIntervalPhase is not defined`.

- [ ] **Step 3: Implement**

```js
// Records one phase as a logged set. Rest and recovery never reach here — they are timed only, the
// same call Jake made for rest on 2026-07-23, extended to recovery because it IS a rest between
// cycles. The phase column exists so the Progress page can exclude warmup/cooldown from set counts.
function _logIntervalPhase(p) {
  const ex = _runner.exercises[_runner.exIdx]
  const g = id => document.getElementById(id)?.value?.trim() || null
  ex.loggedSets.push({
    phase: p.phase,
    duration: p.secs != null ? fmtRestCountdown(p.secs) : null,
    distanceM: p.distanceM != null ? String(p.distanceM) : g('wr-cardio-dist-opt'),
    avgHr: g('wr-cardio-avg-hr'), maxHr: g('wr-cardio-max-hr'), avgWatts: g('wr-cardio-watts')
  })
}
```

In `saveRunnerSession`'s per-set mapping (~1962), inside the `ex.type === 'cardio'` branch, add:

```js
        if (s.phase) row.phase = s.phase
```

`set_number` continues to come from the loop index, so work rounds keep a 1-based round index.

- [ ] **Step 4: Run to verify it passes**

Run: `npx playwright test tests/intervals-redesign-2026-07-25.spec.js --reporter=list`
Expected: 14 passed.

- [ ] **Step 5: Commit**

```bash
git add js/app-runner.js tests/intervals-redesign-2026-07-25.spec.js
git commit -m "intervals: log phases, skip rest and recovery"
```

---

### Task 8: Progress aggregates must exclude warmup and cooldown

**Files:**
- Modify: `js/app-progress.js` — `_diaryExMetrics`, `_exerciseRecords`, `_metricPointsFor`, `renderProgressPerSession` session totals
- Test: `tests/intervals-redesign-2026-07-25.spec.js`

**Interfaces:**
- Consumes: `workout_log_sets.phase`.
- Produces: aggregates that count only real work.

- [ ] **Step 1: Write the failing test**

```js
test('warmup and cooldown rows do not inflate set counts or volume', async ({ page }) => {
  await loginAsPT(page)
  const m = await page.evaluate(() => _diaryExMetrics({
    exercise_name: 'Row', exercise_type: 'cardio', metric_type: 'interval',
    workout_log_sets: [
      { set_number: 1, phase: 'warmup',   duration_seconds: 60 },
      { set_number: 1, phase: 'work',     duration_seconds: 30, distance_m: 200 },
      { set_number: 2, phase: 'work',     duration_seconds: 30, distance_m: 210 },
      { set_number: 3, phase: 'cooldown', duration_seconds: 45 },
    ]
  }))
  expect(m.sets).toBe(2)   // two work rounds — not four rows
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx playwright test tests/intervals-redesign-2026-07-25.spec.js -g "do not inflate" --reporter=list`
Expected: FAIL — `sets` is 4.

- [ ] **Step 3: Implement**

Add one shared helper near the top of `js/app-progress.js`:

```js
// Warmup and cooldown are recorded (Jake, 2026-07-25) but are not training volume. Every aggregate
// must filter through this, or recording a warmup silently inflates every session's set count.
// NULL phase = an ordinary set: all strength, all steady-state cardio, and every row logged before
// the phase column existed.
function _countableSets(sets) {
  return (sets || []).filter(s => !s.phase || s.phase === 'work')
}
```

Apply it at the top of `_diaryExMetrics` and `_exerciseRecords`, in `_metricPointsFor`'s per-session set list, and in `renderProgressPerSession`'s session-total reduce. Find every site with:

```bash
grep -n "workout_log_sets\b" js/app-progress.js
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx playwright test tests/intervals-redesign-2026-07-25.spec.js --reporter=list`
Expected: 15 passed.

- [ ] **Step 5: Bump cache-busts**

In `index.html`: `app-workouts` v35→v36, `app-runner` v34→v35, `app-progress` v27→v28.

- [ ] **Step 6: Commit**

```bash
git add js/app-progress.js index.html tests/intervals-redesign-2026-07-25.spec.js
git commit -m "intervals: exclude warmup/cooldown from progress aggregates; cache-bust"
```

---

### Task 9: Regression sweep and push

- [ ] **Step 1: Confirm existing cardio is untouched**

```js
test('steady-state cardio still prescribes and formats exactly as before', async ({ page }) => {
  await loginAsPT(page)
  const r = await page.evaluate(() => {
    const mk = (id, el = 'input') => { let e = document.getElementById(id); if (!e) { e = document.createElement(el); e.id = id; document.body.appendChild(e) } return e }
    mk('att-type', 'select'); mk('att-sets-container', 'div')
    window._templateSets = [{ effortType: 'rpe', isDistanceBased: true, distanceM: '5000' }]
    renderTemplateSets('att-sets-container', 'cardio')
    return { hasDistInput: !!document.getElementById('ts-distm-0'), hasIntervalInput: !!document.getElementById('ts-worksecs-0') }
  })
  expect(r.hasDistInput).toBe(true)
  expect(r.hasIntervalInput).toBe(false)
})
```

- [ ] **Step 2: Full suite at the real 390px viewport**

Run: `npx playwright test --reporter=list > /tmp/intervals-full.log 2>&1`
Expected: all pass (220 existing + the new spec). Never pipe through `tail`; read the log.

- [ ] **Step 3: multi-agent-review**

Invoke the `multi-agent-review` skill (diff mode). Pay particular attention to:
- Agent C: that no `_fmtSetDetail` / `_fmtSetsCollapsed` call site was missed (Task 4, Step 3), and that no Progress aggregate was missed (Task 8, Step 3) — both are "fix the class, not the instance" shapes with several sibling call sites.
- Agent B: that solo/client roles reach interval exercises identically.

- [ ] **Step 4: Push**

```bash
git push origin master
```

- [ ] **Step 5: Update the Vault**

STATUS.md live-state versions + a LOG.md entry; mark the intervals roadmap item done. Record that **Solo slipped from pre-beta to post-beta** — the ledger currently claims pre-beta and that is no longer true.

---

## Self-Review

**Spec coverage** — every spec section maps to a task: model → Task 2; storage/migration → Task 1; the legacy `exercise_type` trap → Task 3 Step 3; builder screen + total time → Task 3 Steps 6–7; distance rounds → Tasks 2, 5, 6; runner phase walk → Task 5; overlay → Task 6; logging + `phase` → Task 7; Progress-aggregate consequence → Task 8; "existing cardio untouched" → Task 9 Step 1.

**Deliberately not covered, matching the spec's out-of-scope list:** per-round variation, presets, replacing cardio, persisting `paceAchieved` (pre-existing gap, ledgered separately), and relabelling the repeat control on strength types (separate follow-up).

**Type consistency** — `_expandIntervalBlock` / `_intervalTotalSecs` / `_initIntervalPhases` / `_startPhaseAt` / `_advancePhase` / `_logIntervalPhase` / `_isIntervalExercise` / `_countableSets` are each defined once and used with the same signature throughout. Phase strings are the same six everywhere. Input ids use the `-0` suffix consistently (a block is always index 0).
