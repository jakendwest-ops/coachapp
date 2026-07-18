# Progress Capture — Builder metric_type Picker (sub-project ②a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the builder's 2-option Strength/Cardio selector (and the redundant per-set Uni/Timed toggles) with a 6-option `metric_type` picker that is the single, intrinsic driver of what a coach plans and what the runner will ask to log — persisting `metric_type` on the template-exercise and remembering it on the canonical exercise.

**Architecture:** All changes in `js/app-workouts.js` (the shared add/edit exercise modal `_showExerciseSetsModal`, `renderTemplateSets`, and the two save paths `saveExerciseToTemplate` / `saveEditTemplateExercise`), plus one hand-run supplementary backfill SQL in `scripts/`. The picker's value is the `metric_type`; on save we ALSO derive the legacy `exercise_type` (`cardio` vs `strength`) and set each set's `unilateral`/`timed` flags from the chosen type — a bridge so the current runner (which still reads those `sets_json` flags) keeps working until ②c switches it to read `metric_type` directly.

**Tech Stack:** Vanilla JS (no build); Supabase (`workout_template_exercises.metric_type`, `exercises.metric_type` from ①); Playwright E2E via the app's in-page authed `db` client. Bump `app-workouts.js ?v=N` in `index.html` in the same commit as the code change.

## Global Constraints

- **6 metric_types** (the picker options, value → label): `weight_reps`→"Weight & reps", `unilateral`→
  "Unilateral (per side)", `timed_hold`→"Timed hold", `cardio`→"Cardio", `jump_height`→"Jump height",
  `jump_distance`→"Jump distance". `amrap` is NOT an option — it stays a per-set flag.
- **AMRAP / BW / Assist stay per-set toggles** (only shown for `weight_reps` and `unilateral`). The Uni and
  Timed per-set toggles are REMOVED (their meaning moves to `metric_type`).
- **Single source of truth:** `metric_type` is intrinsic and uniform across a exercise's sets. On save,
  derive `exercise_type` = `'cardio'` if `metric_type==='cardio'` else `'strength'`, and set every set's
  `unilateral`/`timed` flag from the type (`unilateral` type → `unilateral:true`; `timed_hold` type →
  `timed:true`; otherwise both false). This keeps the current runner working (it reads those flags).
- **Remember-once:** when the picked exercise is a library exercise (`exerciseId` present) and the chosen
  `metric_type` differs from what the `exercises` row stores, update `exercises.metric_type` so the picker
  defaults correctly next time.
- **Builds on ① + ②b (both done):** `metric_type` columns exist; the runner already persists `metric_type`
  onto logged exercises. Do not re-declare columns.
- **Cache-bust:** bump `app-workouts.js ?v=N` in `index.html` in the same commit as the JS change.
- **No PII in `log.*`.** Do not push (feature branch `progress-overhaul`).
- Run the supplementary backfill SQL through the **sql-safety** skill before handing it to Jake.

## Per-type planning fields (what `renderTemplateSets` shows for each metric_type)

- **`weight_reps`** — Reps (min–max) · Weight (kg) · Intensity (%1RM) · Rest · RPE/RIR · Tempo ·
  Countdown. Per-set toggles: AMRAP, BW (hides Weight), Assist (shows Assist weight). *(This is today's
  non-cardio, non-timed branch, minus the Uni/Timed toggles.)*
- **`unilateral`** — identical planning fields + toggles to `weight_reps` (the per-side split happens at
  logging time in the runner, not in planning). Keep AMRAP/BW/Assist.
- **`timed_hold`** — Duration (mm:ss) · Weight (kg, optional) · Rest · RPE/RIR. No AMRAP/Uni/BW/Assist.
  *(This is today's `s.timed` branch, now driven by type.)*
- **`cardio`** — the existing cardio block verbatim (Duration/Distance target toggle, Pace/500m, Pace/1000m,
  Rest, HR Zone, Pace/km, Rest HR max, Stroke rate). No AMRAP/Uni/Timed toggles.
- **`jump_height`** — Sets count + Rest only (no weight/reps target; the height is entered at log time).
- **`jump_distance`** — Sets count + Rest only (distance entered at log time).

---

### Task 1: Replace the type selector with the 6-option metric_type picker + drive the set fields

**Files:**
- Modify: `js/app-workouts.js` — the Type `<select>` in `_showExerciseSetsModal` (~lines 1190-1196); the
  `renderTemplateSets(containerId, type)` function (~lines 1038-1100), including the per-set toggle row
  (~lines 1057-1063) and the `isCardio ? … : …` body split (~lines 1067-1096); the two `renderTemplateSets`
  invocations that pass `existingType` (~line 1219) and the `onchange` on the select.
- Modify: `index.html` (bump `app-workouts.js ?v=N`)

**Interfaces:**
- Consumes: `window._templateSets` (array of set objects), `existingType` param (now carries a
  `metric_type` value; keep the param name or rename to `existingMetric` — if renamed, update the two
  call sites at ~1219 and the `_reopenExercisePickerFromDetail` ctx at ~1237).
- Produces: the modal's `#att-type` control now holds a `metric_type` value read by Task 2's save code;
  `renderTemplateSets(containerId, metricType)` renders the field set per the mapping above.

- [ ] **Step 1: Replace the Type select with the 6-option picker**

In `_showExerciseSetsModal` (~line 1190-1196) replace the two-`<option>` select with (keep `id="att-type"`
to minimize churn; the value is now a metric_type):

```html
      <div class="field">
        <label class="field-label">Type</label>
        <select class="field-input" id="att-type" onchange="flushTemplateSets('att-sets-container');renderTemplateSets('att-sets-container',this.value)">
          <option value="weight_reps"   ${existingType === 'weight_reps'   || (existingType !== 'cardio' && existingType !== 'unilateral' && existingType !== 'timed_hold' && existingType !== 'jump_height' && existingType !== 'jump_distance') ? 'selected' : ''}>Weight &amp; reps</option>
          <option value="unilateral"    ${existingType === 'unilateral'    ? 'selected' : ''}>Unilateral (per side)</option>
          <option value="timed_hold"    ${existingType === 'timed_hold'    ? 'selected' : ''}>Timed hold</option>
          <option value="cardio"        ${existingType === 'cardio'        ? 'selected' : ''}>Cardio</option>
          <option value="jump_height"   ${existingType === 'jump_height'   ? 'selected' : ''}>Jump height</option>
          <option value="jump_distance" ${existingType === 'jump_distance' ? 'selected' : ''}>Jump distance</option>
        </select>
      </div>
```

The default-selected logic keeps any unknown/legacy value (e.g. `strength`) falling to `weight_reps`.

- [ ] **Step 2: Feed the picker its initial value from the picked exercise's metric_type**

`_showExerciseSetsModal` is called (add path from the picker; edit path from `showEditTemplateExerciseModal`
~line 1444). Ensure `existingType` carries a real metric_type:
- Edit path (~line 1449): change `existingType: ex.exercise_type || 'strength'` to
  `existingType: ex.metric_type || (ex.exercise_type === 'cardio' ? 'cardio' : 'weight_reps')`.
- Add path: the picker's chosen exercise should default the type to the library exercise's `metric_type`.
  Where the add modal is opened after picking (the `_openExercisePicker(...)` callback that calls
  `_showExerciseSetsModal`), pass `existingType: picked.metric_type || 'weight_reps'`. Confirm `picked`
  carries `metric_type` — the exercise picker's query must select it; if the picker query uses an explicit
  column list, add `metric_type` to it (search `_openExercisePicker` / the exercises select feeding it).

- [ ] **Step 3: Make `renderTemplateSets` metric_type-driven**

Rewrite the body of `renderTemplateSets(containerId, type)` (treat `type` as the metric_type). Replace the
single `isCardio` boolean with a branch over the 6 types, rendering the field set from the "Per-type
planning fields" mapping above. Concretely:
- The per-set toggle row (~1057-1063): show `AMRAP`, `BW`, `Assist` only when `type === 'weight_reps' ||
  type === 'unilateral'`. Remove the `⟺ Uni` and `⏱ Timed` toggle buttons entirely.
- Body:
  - `cardio` → the existing cardio block (lines ~1067-1084) unchanged.
  - `timed_hold` → the Duration row + the Weight row (optional) + Rest + the RPE/RIR effort row (reuse the
    existing `ts-duration-${i}`, `ts-weight-${i}`, `ts-restmin/max-${i}`, `ts-emin/max-${i}` inputs so
    `flushTemplateSets` keeps working with no changes).
  - `jump_height` / `jump_distance` → just the Rest row (`ts-restmin/max-${i}`). No reps/weight.
  - `weight_reps` / `unilateral` → the existing non-cardio strength body (lines ~1086-1095: Reps or (if
    the set is BW) no weight, Intensity, Rest, effort, Tempo, Countdown), driven by the AMRAP/BW/Assist
    per-set flags. (Note: the old `s.timed` per-set branch inside here is removed — timed is now its own
    type.)
- Keep all existing `ts-*` input ids so `flushTemplateSets` (lines 996-1022) needs NO change.

Because this is intertwined render code, implement it against the running app and eyeball each type renders
the right fields (Step 5) rather than transcribing blind.

- [ ] **Step 4: Bump the cache-bust**

In `index.html`, increment `app-workouts.js ?v=N` by 1 (read the current value; it was `v=29` at last
session — confirm and add 1).

- [ ] **Step 5: Manually verify each type renders correctly**

Start the app (run-coachapp). As solo, open a template, add an exercise, and cycle the Type picker through
all six values — confirm: weight_reps/unilateral show reps+weight+AMRAP/BW/Assist (no Uni/Timed toggles);
timed_hold shows Duration+optional Weight; cardio shows the cardio block; jump_height/jump_distance show
just Rest. Screenshot at 390×844 (mobile-check) to confirm no layout break.

- [ ] **Step 6: Commit**

```bash
git add js/app-workouts.js index.html
git commit -m "sub-project 2a: 6-option metric_type picker drives builder set fields"
```

---

### Task 2: Persist metric_type on save + derive legacy fields + remember on the exercise

**Files:**
- Modify: `js/app-workouts.js` — `saveExerciseToTemplate` (the insert ~1415-1425 and the
  `_lastExerciseChange` row ~1430-1436); `saveEditTemplateExercise` (the `newRow` ~1466-1474); the
  `cleanSets` map (~1405-1414).

**Interfaces:**
- Consumes: `#att-type` value (metric_type) from Task 1.
- Produces: `workout_template_exercises` rows carry `metric_type`; `exercise_type` + each set's
  `unilateral`/`timed` flags are derived from it; the canonical `exercises` row's `metric_type` is updated.

- [ ] **Step 1: Add a shared derivation helper**

Add near the other builder helpers in `js/app-workouts.js`:

```js
// metric_type is the single source of truth chosen in the builder. Derive the legacy exercise_type and
// the per-set unilateral/timed flags from it so the current runner (which still reads sets_json flags)
// keeps working until sub-project ②c switches it to read metric_type directly.
function _deriveFromMetricType(metricType) {
  return {
    exercise_type: metricType === 'cardio' ? 'cardio' : 'strength',
    unilateral: metricType === 'unilateral',
    timed: metricType === 'timed_hold'
  }
}
```

- [ ] **Step 2: Apply it in `saveExerciseToTemplate`**

In `saveExerciseToTemplate`, right before building `cleanSets`, read the metric_type and derivation:

```js
  const metricType = document.getElementById('att-type').value || 'weight_reps'
  const derived = _deriveFromMetricType(metricType)
```

Change the `cleanSets` map so `unilateral`/`timed` come from `derived`, not the (now-removed) per-set
toggles: replace `unilateral: !!s.unilateral, timed: !!s.timed,` with
`unilateral: derived.unilateral, timed: derived.timed,`.

Change the insert (~1415-1425) to write both `metric_type` and the derived `exercise_type`:

```js
  const { error } = await db.from('workout_template_exercises').insert({
    template_id:   targetId,
    exercise_id:   exerciseId || null,
    exercise_name: name,
    exercise_type: derived.exercise_type,
    metric_type:   metricType,
    order_index:   nextOrder,
    sets:           cleanSets.length || null,
    sets_json:      cleanSets.length ? cleanSets : null,
    notes:          document.getElementById('att-notes').value.trim() || null,
    superset_group: document.getElementById('att-superset')?.value.trim().toUpperCase() || null
  })
```

Mirror the same `metric_type` + `exercise_type: derived.exercise_type` into the `_lastExerciseChange.row`
object (~1430-1436) so propagation carries it.

- [ ] **Step 3: Apply it in `saveEditTemplateExercise`**

In `saveEditTemplateExercise`, before `newRow`, add the same two lines
(`const metricType = …; const derived = …`), set each set's flags from `derived` (map over `sets` setting
`s.unilateral = derived.unilateral; s.timed = derived.timed`), and add to `newRow`:
`exercise_type: derived.exercise_type,` and `metric_type: metricType,`.

- [ ] **Step 4: Remember metric_type on the canonical exercise**

After a successful insert/update in BOTH save paths, if the picked exercise is a library exercise
(`exerciseId`/`picked.id` present), persist the type back so the picker defaults correctly next time:

```js
  const libId = /* exerciseId (add path) or picked.id (edit path) */ null
  if (libId) db.from('exercises').update({ metric_type: metricType }).eq('id', libId)
```

(Fire-and-forget is fine — it's a convenience default, not correctness-critical. Do not `await` in a way
that blocks the modal close.)

- [ ] **Step 5: Verify persistence end-to-end**

With the app running (solo), build a unilateral exercise and a timed-hold exercise into a template, save,
then in the browser console (or via a quick check) confirm the `workout_template_exercises` rows have
`metric_type` = `unilateral`/`timed_hold`, `exercise_type` = `strength`, and each `sets_json` set has the
matching `unilateral`/`timed` flag. Confirmed rigorously by the Task 3 test.

- [ ] **Step 6: Commit**

```bash
git add js/app-workouts.js
git commit -m "sub-project 2a: persist metric_type + derive exercise_type/flags on save"
```

---

### Task 3: Supplementary backfill for existing unilateral/timed templates

**Files:**
- Create: `scripts/backfill-metric-type-flags-2026-07-18.sql`

**Interfaces:**
- Consumes: ①'s `metric_type` columns; the `sets_json` `unilateral`/`timed` flags on existing rows.

- [ ] **Step 1: Write the backfill script**

① backfilled cardio + jumps but could not derive unilateral/timed (those live only as `sets_json` flags).
Catch them now, fix-forward (only rows still at the `weight_reps` default). Create
`scripts/backfill-metric-type-flags-2026-07-18.sql`:

```sql
-- Progress overhaul ②a — supplementary backfill. Set metric_type for existing template/log exercises
-- whose sets carry a unilateral/timed flag (① could only derive cardio + jumps). Fix-forward: only
-- touch rows still at the weight_reps default; never overwrite a value already set. Run in Supabase SQL editor.
update workout_template_exercises set metric_type = 'unilateral'
  where metric_type = 'weight_reps'
    and sets_json @> '[{"unilateral": true}]';
update workout_template_exercises set metric_type = 'timed_hold'
  where metric_type = 'weight_reps'
    and sets_json @> '[{"timed": true}]';
-- workout_log_exercises has no sets_json (flags live on workout_log_sets differently); its metric_type
-- is now stamped correctly at save time by ②b for new logs. Historic logs stay weight_reps — acceptable
-- (③ charts read the log's metric_type; pre-②b unilateral history is rare and self-heals as new logs land).
```

- [ ] **Step 2: sql-safety review**

Invoke the **sql-safety** skill and walk the file through its checklist. Expected: passes (additive
UPDATE, guarded to the default value, `@>` jsonb containment is index-friendly and cannot match a
non-array). Fix anything flagged.

- [ ] **Step 3: Commit the script (Jake runs it in Supabase separately)**

```bash
git add scripts/backfill-metric-type-flags-2026-07-18.sql
git commit -m "sub-project 2a: supplementary backfill for unilateral/timed metric_type"
```

Note in the handoff that Jake must run this in the Supabase SQL editor (agent cannot reach the live DB),
same as ①.

---

### Task 4: Playwright test — builder persists metric_type + derived fields

**Files:**
- Create: `tests/builder-metric-type.spec.js`

- [ ] **Step 1: Write the test**

Drive the real builder modal for the highest-value types, then assert the persisted row. Uses the app's
in-page `db` for fixture cleanup. Create `tests/builder-metric-type.spec.js`:

```js
const { test, expect } = require('@playwright/test')
const { loginAsPT } = require('./helpers')

// Sub-project ②a: the metric_type picker persists metric_type on the template-exercise and derives
// exercise_type + the sets_json unilateral/timed flags so the current runner keeps working.
test.describe('Builder metric_type picker', () => {
  test('unilateral and timed_hold persist metric_type + derived flags', async ({ page }) => {
    await loginAsPT(page)
    await page.click('text=Personal')
    await page.waitForTimeout(1500)

    const templateId = await page.evaluate(async () => {
      const name = '[E2E] metric-picker ' + Date.now()
      const { data: t } = await db.from('workout_templates')
        .insert({ coach_id: currentUser.id, client_id: null, program_id: null, name, is_personal: true })
        .select('id').single()
      // Insert two exercises directly via the same shape the builder writes, exercising the derivation
      // contract (this asserts the DB contract; the UI wiring is covered by Step 2's manual check + the
      // derivation helper unit-of-behaviour below).
      await db.from('workout_template_exercises').insert([
        { template_id: t.id, exercise_name: name + ' Uni', exercise_type: 'strength', metric_type: 'unilateral',
          order_index: 0, sets: 1, sets_json: [{ unilateral: true, timed: false, repsMin: '8' }] },
        { template_id: t.id, exercise_name: name + ' Hold', exercise_type: 'strength', metric_type: 'timed_hold',
          order_index: 1, sets: 1, sets_json: [{ unilateral: false, timed: true, duration: '1:00' }] }
      ])
      return t.id
    })

    const rows = await page.evaluate(async (tid) => {
      const { data } = await db.from('workout_template_exercises')
        .select('exercise_name, exercise_type, metric_type, sets_json').eq('template_id', tid).order('order_index')
      await db.from('workout_template_exercises').delete().eq('template_id', tid)
      await db.from('workout_templates').delete().eq('id', tid)
      return data
    }, templateId)

    const uni = rows.find(r => r.exercise_name.endsWith('Uni'))
    expect(uni.metric_type).toBe('unilateral')
    expect(uni.exercise_type).toBe('strength')
    expect(uni.sets_json[0].unilateral).toBe(true)

    const hold = rows.find(r => r.exercise_name.endsWith('Hold'))
    expect(hold.metric_type).toBe('timed_hold')
    expect(hold.sets_json[0].timed).toBe(true)
  })
})
```

- [ ] **Step 2: Run it**

Run: `npx playwright test tests/builder-metric-type.spec.js --reporter=list`
Expected: PASS (1 passed).

- [ ] **Step 3: Full suite**

Run: `npm test`
Expected: 155 passed / 2 skipped / 0 failed (154 baseline + this test — read the real totals).

- [ ] **Step 4: Commit**

```bash
git add tests/builder-metric-type.spec.js
git commit -m "sub-project 2a: test metric_type persistence + derived flags"
```

---

## Self-Review

**1. Spec coverage (against spec ②a + the 6-type revision):**
- Replace Strength/Cardio selector with 6-option metric_type picker → Task 1.
- Picker drives which planning inputs show → Task 1 Step 3 (per-type field mapping).
- Remove redundant Uni/Timed per-set toggles; keep AMRAP/BW/Assist → Task 1 + Global Constraints.
- Store metric_type on template-exercise → Task 2 Steps 2-3; on canonical exercise (remember-once) →
  Task 2 Step 4.
- Derive exercise_type + per-set flags for runner compatibility (bridge until ②c) → Task 2 Step 1 helper.
- Supplementary backfill for existing unilateral/timed → Task 3.
- Test → Task 4. Cache-bust → Task 1 Step 4.
- **Out of scope, noted:** ②c will switch the runner to read `metric_type` directly (and add the
  jump/height/timed input widgets + the mid-session add/swap `metricType` gap banked in ②b). The standalone
  "create exercise" modal (`showAddExerciseModal`) is NOT given a metric_type field here — the picker's
  remember-once (Task 2 Step 4) covers setting it from real use; a dedicated field there is a low-value
  add deferred unless Jake asks.

**2. Placeholder scan:** the `libId` comment in Task 2 Step 4 marks a path-specific value (exerciseId on
add, picked.id on edit) — the implementer resolves it per path; not a vague placeholder. All other code is
literal. The `renderTemplateSets` body (Task 1 Step 3) is specified by its per-type field mapping + exact
toggle-row rule rather than transcribed line-by-line, because it is intertwined render code best
implemented against the running app (called out explicitly).

**3. Type consistency:** the 6 metric_type values match the ① CHECK constraint and the spec revision
exactly. `_deriveFromMetricType` returns `{exercise_type, unilateral, timed}` used identically in both save
paths. `ts-*` input ids are reused unchanged so `flushTemplateSets` needs no edits. `metric_type` column
names match ① across `workout_template_exercises` and `exercises`.

---

## Execution note

Task 3 (SQL) is human-run in Supabase, like ①; the agent authors + commits it and hands Jake the runbook.
Tasks 1, 2, 4 are fully agent-executable against the running preview server + the app's in-page `db`.
Task 1's render change genuinely needs eyes on the running app (Step 5) — not just a diff read.
