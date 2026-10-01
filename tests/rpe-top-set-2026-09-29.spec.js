// Effort capture in the runner's strength table (gap 0, 2026-09-29).
// Before this, app-runner.js:3038 recorded that the in-gym runner captured NO effort at all —
// effort only reached the DB through the manual Log Session modal.
const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

// Owns its fixtures end to end — a fresh client + a fresh template per test, created directly with
// the same db.from(...).insert(...) calls the other runner specs use (tests/runner.spec.js:61-70),
// never "whatever's first". That anti-pattern caused real flakiness and masked a deleteProgram
// data-loss bug on 2026-07-10 (see tests/fixtures.js's ownWorkout comment).
//
// startWorkoutRunner(clientId, templateId) is the same entry point the real "Start" button uses
// (js/app-workouts.js:3787) — this bypasses only the picker UI, not the code under test.
//
// Sets module-scope `fixture` (read by finishSessionAndReadSets and cleaned up in afterEach) rather
// than returning it, so the test bodies below can call it exactly as the brief specifies.
let fixture = null

// `storedOneRM` plants a client_1rms row for this fixture's exercise (Task 5). It must be inserted
// BEFORE startWorkoutRunner: launchRunner fetches client_1rms once at session load
// (js/app-runner.js:43) and never re-reads it, so a row written afterwards is invisible to the run.
// The lookup keys on trimmed-lowercase exercise_name here — the fixture's template exercise has no
// exercise_id, so the name fallback is the path under test.
//
// `unit` is a first-class fixture dimension, not a display detail: the whole suite runs in kg, so an
// lb-only fault is invisible to every other test (the 2026-08-14 lb-only 1RM grid crash is the
// precedent). Set before startWorkoutRunner so the first render already sees it.
async function startRunnerWithFixture(page, { sets, storedOneRM = null, unit = null }) {
  const tag = '[E2E] RPE-TopSet ' + Date.now() + '-' + Math.random().toString(36).slice(2, 7)
  const ids = await page.evaluate(async ({ tag, sets, storedOneRM }) => {
    const { data: client, error: clientErr } = await db.from('clients')
      .insert({ coach_id: currentUser.id, full_name: tag }).select('id').single()
    if (clientErr) return { error: 'client: ' + clientErr.message }
    const { data: tmpl, error: tmplErr } = await db.from('workout_templates')
      .insert({ coach_id: currentUser.id, name: tag }).select('id').single()
    if (tmplErr) return { error: 'template: ' + tmplErr.message }
    const { error: exErr } = await db.from('workout_template_exercises').insert({
      template_id: tmpl.id, exercise_name: tag + ' Exercise', exercise_type: 'strength',
      metric_type: 'weight_reps', order_index: 0, sets_json: sets
    })
    if (exErr) return { error: 'exercise: ' + exErr.message }
    if (storedOneRM != null) {
      const { error: rmErr } = await db.from('client_1rms').insert({
        client_id: client.id, exercise_name: tag + ' Exercise', one_rm_kg: storedOneRM,
        recorded_at: new Date().toISOString().split('T')[0]
      })
      if (rmErr) return { error: 'client_1rms: ' + rmErr.message }
    }
    return { clientId: client.id, templateId: tmpl.id }
  }, { tag, sets, storedOneRM })
  expect(ids.error, 'fixture setup must succeed before any assertion runs').toBeUndefined()
  fixture = ids

  if (unit) await page.evaluate(u => { window._unitPrefs.weight = u }, unit)
  await page.evaluate(({ clientId, templateId }) => startWorkoutRunner(clientId, templateId), ids)
  // startWorkoutRunner does not await launchRunner's async tail (_startFreshRunner fetches
  // client_1rms before rendering) — wait for the real signal, tableRows on the runner's first
  // exercise, rather than assuming the fire-and-forget call has finished by the time it returns.
  await page.waitForFunction(
    () => typeof _runner !== 'undefined' && !!(_runner && _runner.exercises && _runner.exercises[0] && _runner.exercises[0].tableRows),
    { timeout: 10000 }
  )
}

// Saves the live runner session (same call the real "Save workout" button makes) and reads back the
// workout_log_sets rows it wrote for THIS test's fixture client, ordered by set_number.
async function finishSessionAndReadSets(page) {
  await page.evaluate(() => saveRunnerSession())
  return page.evaluate(async (clientId) => {
    const { data: log } = await db.from('workout_logs').select('id')
      .eq('client_id', clientId).order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (!log) return []
    const { data: exs } = await db.from('workout_log_exercises').select('id').eq('log_id', log.id)
    const exIds = (exs || []).map(e => e.id)
    if (!exIds.length) return []
    const { data: setsRows } = await db.from('workout_log_sets').select('*')
      .in('workout_log_exercise_id', exIds).order('set_number')
    return setsRows || []
  }, fixture.clientId)
}

// FK-safe order; runs even if the test threw. E2E debris in the live DB was a real problem — see
// scripts/reap-e2e-debris.mjs.
async function cleanupFixture(page) {
  if (!fixture) return
  const { clientId, templateId } = fixture
  fixture = null
  await page.evaluate(async ({ clientId, templateId }) => {
    const { data: logs } = await db.from('workout_logs').select('id').eq('client_id', clientId)
    const logIds = (logs || []).map(l => l.id)
    if (logIds.length) {
      const { data: exs } = await db.from('workout_log_exercises').select('id').in('log_id', logIds)
      const exIds = (exs || []).map(e => e.id)
      if (exIds.length) await db.from('workout_log_sets').delete().in('workout_log_exercise_id', exIds)
      await db.from('workout_log_exercises').delete().in('log_id', logIds)
      await db.from('workout_logs').delete().in('id', logIds)
    }
    await db.from('workout_template_exercises').delete().eq('template_id', templateId)
    await db.from('workout_templates').delete().eq('id', templateId)
    // client_1rms is planted by storedOneRM and is FK'd to the client — delete it before the client,
    // or the client delete fails and strands the whole fixture.
    await db.from('client_1rms').delete().eq('client_id', clientId)
    await db.from('clients').delete().eq('id', clientId)
    // Restore kg. The page fixture is per-test so this should already be true, but an lb value
    // leaking into a later test would fail it in a way that points at the wrong code.
    if (window._unitPrefs) window._unitPrefs.weight = 'kg'
  }, { clientId, templateId }).catch(() => {})
}

test.describe('runner effort capture (gap 0, 2026-09-29)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsPT(page)
  })
  test.afterEach(async ({ page }) => {
    await cleanupFixture(page)
  })

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
})

// ─── Task 3: sets_json fields + the program builder UI (isTopSet / intensityBasis, 2026-09-29) ────
//
// _cleanTemplateSets is an ALLOWLIST: a sets_json key missing from it is silently dropped on save —
// no error, no warning. That is exactly how every cardio target was lost before les-036. These tests
// drive the REAL builder (openTemplate / showEditTemplateExerciseModal / renderTemplateSets /
// _stageEditExercise / saveTemplateDraft), not a hand-built object, because the bug this guards
// against lives in the render/save wiring, not in the data shape alone — asserting on a plain object
// would stay green even if the allowlist entry were missing.
//
// Owns its fixture end to end — a fresh template + one weight_reps exercise per test, created
// directly with the same db.from(...).insert(...) calls the runner fixtures above use, never
// "whatever's first" (see this file's header comment on that anti-pattern).
let builderFixture = null

async function openTemplateBuilderWithFixture(page, { sets }) {
  const tag = '[E2E] RPE-TopSet Builder ' + Date.now() + '-' + Math.random().toString(36).slice(2, 7)
  // Every seeded set carries a `tempo` value purely so this fixture's "+ More targets" <details>
  // starts OPEN -- more()'s own rule is "open whenever a field inside already holds a value"
  // (js/app-workouts.js, the `more` helper in renderTemplateSets). Without this, ts-imin-N/ts-basis-N
  // sit inside a CLOSED native <details>, and a real Playwright click/select/fill on them times out
  // waiting for visibility -- confirmed against the same pattern intervals-redesign-2026-07-25.spec.js
  // and builder-metric-type.spec.js both rely on ("open` is passed true whenever a field INSIDE
  // already holds a value").
  const seedSets = Array.from({ length: sets }, () => ({ effortType: 'rpe', tempo: '3010' }))
  const setup = await page.evaluate(async ({ tag, seedSets }) => {
    const { data: t, error: tErr } = await db.from('workout_templates')
      .insert({ coach_id: currentUser.id, program_id: null, client_id: null, name: tag }).select('id').single()
    if (tErr) return { error: 'template: ' + tErr.message }
    const { error: exErr } = await db.from('workout_template_exercises').insert({
      template_id: t.id, exercise_name: tag + ' Exercise', exercise_type: 'strength',
      metric_type: 'weight_reps', order_index: 0, sets_json: seedSets
    })
    if (exErr) return { error: 'exercise: ' + exErr.message }
    return { templateId: t.id }
  }, { tag, seedSets })
  expect(setup.error, 'fixture setup must succeed before any assertion runs').toBeUndefined()
  builderFixture = { templateId: setup.templateId }

  // openTemplate(...) + showEditTemplateExerciseModal(...) are the same real entry points the
  // exercise list's own "Edit" click uses (js/app-workouts.js:_renderTemplateExerciseList) -- this
  // bypasses only that click, not the code under test.
  await page.evaluate(async (id) => { await openTemplate(id) }, builderFixture.templateId)
  await page.evaluate(async () => {
    const row = window._templateDraft.exercises[0]
    await showEditTemplateExerciseModal(row._draftKey, window._templateDraft.templateId)
  })
  await page.waitForSelector('#ts-rmin-0', { state: 'visible' })
}

// Drives the real "Save" button in the exercise modal (-> _stageEditExercise, in-memory only, same
// as the real UI) and then the real saveTemplateDraft() the "Save workout" button calls -- so the
// _cleanTemplateSets allowlist is exercised exactly as a coach tapping through the UI would exercise
// it, not bypassed by calling a save function directly on a hand-built sets array.
async function saveTemplate(page) {
  await page.click('#att-confirm-btn')
  await page.waitForSelector('#save-template-draft-btn')
  const err = await page.evaluate(async () => {
    try { await saveTemplateDraft(); return null } catch (e) { return e?.message || String(e) }
  })
  expect(err, 'saveTemplateDraft must not throw').toBeNull()
}

// Fresh openTemplate() re-fetches the template from the database (not the in-memory draft this
// session already staged), then reopens the same exercise's edit modal -- proving the value actually
// round-tripped through the real save path, not merely survived in memory.
async function reopenTemplate(page) {
  await page.evaluate(async (id) => { await openTemplate(id) }, builderFixture.templateId)
  await page.evaluate(async () => {
    const row = window._templateDraft.exercises[0]
    await showEditTemplateExerciseModal(row._draftKey, window._templateDraft.templateId)
  })
  await page.waitForSelector('#ts-rmin-0', { state: 'visible' })
}

async function cleanupBuilderFixture(page) {
  if (!builderFixture) return
  const { templateId } = builderFixture
  builderFixture = null
  await page.evaluate(async (id) => {
    await db.from('workout_template_exercises').delete().eq('template_id', id)
    await db.from('workout_templates').delete().eq('id', id)
  }, templateId).catch(() => {})
}

test.describe('builder: top set + intensity basis (Task 3, 2026-09-29)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsPT(page)
  })
  test.afterEach(async ({ page }) => {
    await cleanupBuilderFixture(page)
  })

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

  test('turning the top set off warns instead of silently orphaning a later row\'s basis', async ({ page }) => {
    // The plan explicitly forbids silently rewriting sets_json here -- a training day's loads must
    // not change with no visible cause. This proves the warning fires and names the orphaned set,
    // not that anything gets auto-corrected.
    await openTemplateBuilderWithFixture(page, { sets: 2 })
    await page.click('#ts-topset-0')
    await page.selectOption('#ts-basis-1', 'topSet')
    const before = await page.locator('#att-sets-container').innerText()
    expect(before, 'no warning while set 1 IS still a top set').not.toContain('no longer a top set')

    await page.click('#ts-topset-0')   // turn set 1's top-set flag back off
    const after = await page.locator('#att-sets-container').innerText()
    expect(after).toContain('Set 2')
    expect(after).toContain('no longer a top set')

    // And the orphaned row's data must survive UNCHANGED -- the warning is informational only.
    const sets = await page.evaluate(() => window._templateSets)
    expect(sets[1].intensityBasis, 'the warning must not have silently rewritten the orphaned row').toBe('topSet')
  })

  test('switching to Unilateral clears the top-set-only UI, and still warns about the orphaned basis', async ({ page }) => {
    // Fix round 1, Important finding 2: toggleUnilateralType preserves every set field, INCLUDING
    // isTopSet, when it flips weight_reps<->unilateral -- "never discards anything the user has
    // already typed" is the whole point of that control. Without the topSetActive guard (gating every
    // top-set-driven render decision on `type === 'weight_reps'`, not the raw isTopSet flag alone), a
    // coach who marked a top set and then tapped "Unilateral (per side)" would be left looking at a
    // hidden weight cell and no TOP SET pill to turn it back off with. This test reaches that state
    // through the REAL Unilateral pill, not the TOP SET pill, so it actually exercises the toggle path
    // the guard was written for.
    await openTemplateBuilderWithFixture(page, { sets: 2 })
    await page.click('#ts-topset-0')
    await page.selectOption('#ts-basis-1', 'topSet')

    await page.click('#att-metric-pills button:has-text("Unilateral")')

    const r = await page.evaluate(() => ({
      type: document.getElementById('att-type')?.value,
      pillGone: !document.getElementById('ts-topset-0'),
      weightCellBack: !!document.getElementById('ts-weight-0'),
    }))
    expect(r.type, 'the type select must actually have flipped to unilateral').toBe('unilateral')
    expect(r.pillGone, 'the TOP SET pill only ever renders for weight_reps -- it must be gone').toBe(true)
    expect(r.weightCellBack, 'row 0 must get its weight input back once it is no longer an ACTIVE top set').toBe(true)

    const warningText = await page.locator('#att-sets-container').innerText()
    expect(warningText, 'row 1 still points at "Today\'s top set" with nothing active to point at -- must warn').toContain('Set 2')
    expect(warningText).toContain('no longer a top set')
  })
})

// ─── Task 4: live e1RM computation and the chip (2026-09-29) ───────────────────────────────────
//
// Reuses the SAME runner fixture helpers as the Task 2 describe block above (startRunnerWithFixture /
// cleanupFixture, module-scope `fixture`) rather than inventing a parallel set — this task's tests
// drive the exact same real entry point (startWorkoutRunner) with a top-set + backoff-set fixture.
//
// Scope note: the plan originally listed four tests here. Two asserted on `#set-1-basis-note` and on
// a backoff row's computed placeholder -- both belong to Task 5 (backoff target resolution), which
// owns those DOM hooks. They are NOT here; this task's tests exercise only its own surface: the
// computation (`ex._liveE1RM`) and the chip (`#ex-e1rm-chip`).
test.describe('runner: live e1RM from the top set (Task 4, 2026-09-29)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsPT(page)
  })
  test.afterEach(async ({ page }) => {
    await cleanupFixture(page)
  })

  test('ticking the top set computes an e1RM and shows the chip', async ({ page }) => {
    await startRunnerWithFixture(page, { sets: [
      { repsMin: 3, effortType: 'rpe', effortMin: 8, isTopSet: true },
      { repsMin: 8, intensityMin: 70, intensityBasis: 'topSet' }
    ] })
    await page.fill('#set-0-weight', '100')
    await page.fill('#set-0-reps', '3')
    await page.fill('#set-0-effort', '8')
    await page.click('#set-0-done')
    // 3 reps @ RPE 8 = 86.3% of 1RM, so 100 / 0.863 = 115.87 -> displayed 115.9
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

  // Verified against toggleTableSet's real behaviour (js/app-runner.js) before writing this: ticking
  // an already-done row un-ticks it (row.done -> false, no re-validation), so a SECOND click on the
  // same button is required to re-tick it (row.done -> true, re-validated against the now-corrected
  // fields). The double click below is not a guess -- it is what the function actually does.
  test('correcting the top set recomputes the e1RM, and an already-logged set keeps its typed value', async ({ page }) => {
    await startRunnerWithFixture(page, { sets: [
      { repsMin: 3, effortType: 'rpe', effortMin: 8, isTopSet: true },
      { repsMin: 8, intensityMin: 70, intensityBasis: 'topSet' }
    ] })
    await page.fill('#set-0-weight', '100'); await page.fill('#set-0-reps', '3')
    await page.fill('#set-0-effort', '8');   await page.click('#set-0-done')
    const first = await page.evaluate(() => _runner.exercises[0]._liveE1RM)
    await page.fill('#set-1-weight', '80');  await page.fill('#set-1-reps', '8')
    await page.click('#set-1-done')
    // Correct a typo on the top set and re-tick it.
    await page.fill('#set-0-weight', '110')
    await page.click('#set-0-done')
    await page.click('#set-0-done')
    const second = await page.evaluate(() => _runner.exercises[0]._liveE1RM)
    // 110 / 0.863 = 127.46, up from 115.87 — the estimate must follow the correction.
    expect(Math.round(second * 100) / 100).toBe(127.46)
    expect(second).not.toBe(first)
    // A set the lifter already logged is a record of what was actually lifted; it must not be rewritten.
    expect(await page.inputValue('#set-1-weight')).toBe('80')
  })
})

test.describe('runner: backoff sets resolve against the live e1RM (Task 5, 2026-09-29)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsPT(page)
  })
  test.afterEach(async ({ page }) => {
    await cleanupFixture(page)
  })

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
    await startRunnerWithFixture(page, {
      unit: 'lb',
      sets: [
        { repsMin: 3, effortType: 'rpe', effortMin: 8, isTopSet: true },
        { repsMin: 8, intensityMin: 70, intensityBasis: 'topSet' }
      ]
    })
    await page.fill('#set-0-weight', '220'); await page.fill('#set-0-reps', '3')
    await page.fill('#set-0-effort', '8');   await page.click('#set-0-done')
    await expect(page.locator('#ex-e1rm-chip')).toContainText('lb')
    // The brief's assertion here was `not.toBe('')`, which passed BEFORE this task was implemented —
    // an unresolved row falls back to the unit string ('lb'), which is also not empty. That is the
    // "reports success while doing nothing" class, so it is pinned to a value instead.
    // 220 lb = 99.79 kg -> /0.863 = 115.63 kg e1RM -> 70% = 80.94 -> floors to 80 kg -> ~176 lb.
    // The kg-vs-lb gap (80 vs 176) is the discriminator; the exact rounding of the conversion is not
    // pinned, because that belongs to weightToPref's own tests, not this one.
    const lbPh = parseFloat(await page.getAttribute('#set-1-weight', 'placeholder'))
    expect(lbPh, 'an lb backoff target must be the converted number, not the kg one').toBeGreaterThan(150)
  })
})

test.describe('post-session 1RM prefill (Task 6, 2026-09-29)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsPT(page)
  })
  test.afterEach(async ({ page }) => {
    await cleanupFixture(page)
  })

  // The modal has no input — the estimate is display text and the value is baked into the Save
  // button's onclick. The brief guessed at `toHaveValue`; showPostSessionOneRMModal was read first
  // and an id added to the line that actually shows the number, per the brief's own fallback.
  test('the post-session 1RM estimate comes from the top set, not plain Epley', async ({ page }) => {
    await startRunnerWithFixture(page, { sets: [
      { repsMin: 3, effortType: 'rpe', effortMin: 8, isTopSet: true }
    ] })
    await page.fill('#set-0-weight', '100'); await page.fill('#set-0-reps', '3')
    await page.fill('#set-0-effort', '8');   await page.click('#set-0-done')
    // Returning the promise from evaluate awaits the whole async save chain rather than sleeping.
    await page.evaluate(() => saveRunnerSession())
    // Plain Epley on 100x3 is 110.0; the RPE-aware estimate is 115.9. This number is therefore a
    // real discriminator between the two code paths, not merely "a number appeared".
    await expect(page.locator('#psorm-estimate-0')).toContainText('115.9')
  })

  // The sibling path. Every exercise without a top set must keep the estimate it always had —
  // this is the regression half of the change, and it is the half that has bitten before.
  test('an exercise with no top set still offers the plain Epley estimate', async ({ page }) => {
    await startRunnerWithFixture(page, { sets: [{ repsMin: 3 }] })
    await page.fill('#set-0-weight', '100'); await page.fill('#set-0-reps', '3')
    await page.click('#set-0-done')
    await page.evaluate(() => saveRunnerSession())
    await expect(page.locator('#psorm-estimate-0')).toContainText('110')
  })
})

// ── Fixes from the multi-agent review of 6d1598b..ffafa56 (2026-09-30) ────────────────────────
// Every test here pins a defect the review found and 18 green tests did not.
test.describe('RPE top set: review fixes (2026-09-30)', () => {
  test.beforeEach(async ({ page }) => { await loginAsPT(page) })
  test.afterEach(async ({ page }) => { await cleanupFixture(page) })

  // FINDING 1 (high): inCell's oninput writes to tableRows with no re-render, and saveRunnerSession
  // never re-synced. So an edited weight reached the modal HEADING (fresh tableRows) while the
  // estimate under it and the saved row stayed stale. Display value != stored value.
  test('editing the top set without re-ticking keeps the saved set, the heading and the estimate in agreement', async ({ page }) => {
    await startRunnerWithFixture(page, { sets: [
      { repsMin: 3, effortType: 'rpe', effortMin: 8, isTopSet: true }
    ] })
    await page.fill('#set-0-weight', '100'); await page.fill('#set-0-reps', '3')
    await page.fill('#set-0-effort', '8');   await page.click('#set-0-done')
    // Correct the weight and do NOT re-tick — the exact sequence that desynced them.
    await page.fill('#set-0-weight', '110')
    const rows = await finishSessionAndReadSets(page)
    // 110 x 3 @ RPE 8 -> 110/0.863 = 127.46 -> 127.5. NOT 115.9, which is the 100 kg answer.
    await expect(page.locator('#psorm-estimate-0')).toContainText('127.5')
    await expect(page.locator('#psorm-row-0')).toContainText('110')
    expect(rows.length, 'the ticked set must be saved').toBeGreaterThan(0)
    expect(Number(rows[0].weight_kg), 'the DB must store what the input showed').toBe(110)
  })

  // FINDING 2 (high): needsOneRM never learned about intensityBasis, so the amber banner demanded
  // the very thing this feature removes the need for — while the row below it showed a live target.
  test('a topSet-basis backoff row does not demand a stored 1RM', async ({ page }) => {
    await startRunnerWithFixture(page, { sets: [
      { repsMin: 3, effortType: 'rpe', effortMin: 8, isTopSet: true },
      { repsMin: 8, intensityMin: 70, intensityBasis: 'topSet' }
    ] })
    await page.fill('#set-0-weight', '100'); await page.fill('#set-0-reps', '3')
    await page.fill('#set-0-effort', '8');   await page.click('#set-0-done')
    await expect(page.locator('#set-1-weight')).toHaveAttribute('placeholder', '80')
    await expect(page.locator('#wr-onerm-banner'),
      'the target is right there — the banner contradicts it').toHaveCount(0)
  })

  // FINDING 2b: the column label still said "1RM TARGET" for a percentage of today's top set.
  test('a topSet-basis row is not labelled as a percentage of the stored 1RM', async ({ page }) => {
    await startRunnerWithFixture(page, { storedOneRM: 140, sets: [
      { repsMin: 3, effortType: 'rpe', effortMin: 8, isTopSet: true },
      { repsMin: 8, intensityMin: 70, intensityBasis: 'topSet' }
    ] })
    await page.fill('#set-0-weight', '100'); await page.fill('#set-0-reps', '3')
    await page.fill('#set-0-effort', '8');   await page.click('#set-0-done')
    const labels = await page.evaluate(() => _runnerTargetCols(_runner.exercises[0]).cols.map(c => c.label))
    expect(labels.join('|')).not.toContain('1RM TARGET')
  })

  // FINDING 3 (medium): the swap path cleared tableRows/loggedSets/oneRM but not _liveE1RM, and the
  // chip renders above the isTable branch — so a rowing machine displayed "Est. 1RM: 115.9 kg".
  test('the e1RM chip never renders on a non-table exercise', async ({ page }) => {
    await startRunnerWithFixture(page, { sets: [
      { repsMin: 3, effortType: 'rpe', effortMin: 8, isTopSet: true }
    ] })
    await page.fill('#set-0-weight', '100'); await page.fill('#set-0-reps', '3')
    await page.fill('#set-0-effort', '8');   await page.click('#set-0-done')
    await expect(page.locator('#ex-e1rm-chip')).toHaveCount(1)
    // Stand in for a strength -> cardio swap: the leftover _liveE1RM must not paint on cardio.
    await page.evaluate(() => { _runner.exercises[0].type = 'cardio'; renderRunner() })
    await expect(page.locator('#ex-e1rm-chip')).toHaveCount(0)
  })

  // FINDING 4 (high): the override replaced `best` outright, discarding a set the lifter actually
  // completed. A 120 kg single is direct evidence; an RPE-derived 115.9 must not outrank it.
  test('a heavier set actually lifted is not discarded by the top-set estimate', async ({ page }) => {
    await startRunnerWithFixture(page, { sets: [
      { repsMin: 3, effortType: 'rpe', effortMin: 8, isTopSet: true },
      { repsMin: 1 }
    ] })
    await page.fill('#set-0-weight', '100'); await page.fill('#set-0-reps', '3')
    await page.fill('#set-0-effort', '8');   await page.click('#set-0-done')
    await page.fill('#set-1-weight', '120'); await page.fill('#set-1-reps', '1')
    await page.click('#set-1-done')
    await page.evaluate(() => saveRunnerSession())
    // _estimate1RM(120, 1) returns 120 unchanged. The top set's 115.9 must not suppress it.
    await expect(page.locator('#psorm-estimate-0')).toContainText('120')
  })

  // FINDING 5 (medium, Agent A): the new effort input carried no min/max, unlike both of its
  // siblings in the manual Log Session modal, and nothing range-guarded the write.
  test('the effort input is bounded, and an out-of-range value never reaches the database', async ({ page }) => {
    await startRunnerWithFixture(page, { sets: [
      { repsMin: 3, effortType: 'rpe', effortMin: 8, isTopSet: true }
    ] })
    await expect(page.locator('#set-0-effort')).toHaveAttribute('min', '0')
    await expect(page.locator('#set-0-effort')).toHaveAttribute('max', '10')
    await page.fill('#set-0-weight', '100'); await page.fill('#set-0-reps', '3')
    await page.fill('#set-0-effort', '88');  await page.click('#set-0-done')
    const rows = await finishSessionAndReadSets(page)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0].effort_value, 'an impossible RPE is dropped, not stored').toBeFalsy()
    expect(Number(rows[0].weight_kg), 'but the real set still saves').toBe(100)
  })

  // Round 1 answered "typing the RPE after ticking does nothing" by re-rendering on every effort
  // edit. Round 2 showed that tears the table out from under a tap on ANY other control (see the
  // round-2 describe below), and that it made effort the ONLY field that behaved this way: weight and
  // reps also do nothing until you re-tick. So the mechanism is gone and the dead end is explained
  // instead — this pins the explanation, and that re-ticking is what resolves it.
  test('a top set ticked without an effort says what to do, and re-ticking resolves the targets', async ({ page }) => {
    await startRunnerWithFixture(page, { sets: [
      { repsMin: 3, effortType: 'rpe', effortMin: 8, isTopSet: true },
      { repsMin: 8, intensityMin: 70, intensityBasis: 'topSet' }
    ] })
    await page.fill('#set-0-weight', '100'); await page.fill('#set-0-reps', '3')
    await page.click('#set-0-done')                       // ticked with NO effort
    await expect(page.locator('#set-1-basis-note')).toContainText("Enter the top set's RPE")
    await page.fill('#set-0-effort', '8')
    await page.click('#set-0-done'); await page.click('#set-0-done')   // untick, re-tick: the contract weight/reps have
    await expect(page.locator('#set-1-weight')).toHaveAttribute('placeholder', '80')
  })
})

// ── Builder-side review fixes (2026-09-30) ───────────────────────────────────────────────────
test.describe('builder: top-set review fixes (2026-09-30)', () => {
  test.beforeEach(async ({ page }) => { await loginAsPT(page) })
  test.afterEach(async ({ page }) => { await cleanupBuilderFixture(page) })

  // FINDING (Agent C 1): the builder HIDES the Weight and Intensity cells on a top-set row, but
  // flushTemplateSets deliberately preserves an un-rendered field — so values entered before the
  // pill was tapped survived into sets_json with no visible control left to clear them, and the
  // runner rendered a kg target and a %1RM ghost on the one set the builder called unprescribed.
  test('marking a row as the top set clears the weight and %1RM it can no longer show', async ({ page }) => {
    await openTemplateBuilderWithFixture(page, { sets: 2 })
    await page.fill('#ts-weight-0', '100')
    await page.fill('#ts-imin-0', '85')
    await page.click('#ts-topset-0')          // hides both cells
    await saveTemplate(page)
    await reopenTemplate(page)
    const s0 = await page.evaluate(() => window._templateSets[0])
    expect(s0.isTopSet, 'the pill itself must still round-trip').toBe(true)
    expect(s0.weight, 'a hidden weight must not survive on a top set').toBeFalsy()
    expect(s0.intensityMin, 'a hidden %1RM must not survive on a top set').toBeFalsy()
  })

  // FINDING (Agents B 4 / C 2): a top set with no prescribed effort is a silent, permanent dead
  // end — no effort input renders in the runner, so no estimate can ever form and every
  // "Today's top set" row is targetless for the whole session. The coach is the only person who
  // can fix it and the only person who never sees it. Jake's call (2026-09-30): WARN, not refuse.
  test('a top set with no prescribed effort warns the coach at authoring time', async ({ page }) => {
    await openTemplateBuilderWithFixture(page, { sets: 2 })
    await expect(page.locator('#ts-topset-effort-warning'), 'no top set yet, so nothing to warn about').toHaveCount(0)
    await page.click('#ts-topset-0')
    await expect(page.locator('#ts-topset-effort-warning')).toBeVisible()
    await expect(page.locator('#ts-topset-effort-warning')).toContainText('Set 1 is a top set but has no RPE prescribed')
  })

  // The warning must clear once the coach does the thing it asks for — and it must do so WHILE
  // TYPING. The effort inputs carry no change handler of their own, so the first version of this
  // test called flushTemplateSets + renderTemplateSets by hand and a comment claimed every control
  // does the same; the one control the warning is about does not, so the banner would have stayed
  // up after the coach fixed it. This types into the real input and touches nothing else. A warning
  // that never goes away is noise — this project has measured alarm fatigue burying a real row.
  test('the no-effort warning clears as the coach types an RPE, with no other control touched', async ({ page }) => {
    await openTemplateBuilderWithFixture(page, { sets: 2 })
    await page.click('#ts-topset-0')
    await expect(page.locator('#ts-topset-effort-warning')).toBeVisible()
    await page.fill('#ts-emin-0', '8')                 // `input` only — nothing re-renders
    await expect(page.locator('#ts-topset-effort-warning')).toBeHidden()
    await page.fill('#ts-emin-0', '')
    await expect(page.locator('#ts-topset-effort-warning'), 'erasing it must bring the warning back').toBeVisible()
  })
})

// ── Jake's walkthrough of the merged feature (2026-09-30) ───────────────────────────────────────
//
// "The top set RPE calculator is correct, however the ghost reps that have been filled in are still
// showing the reps from the previous session (which could be confusing to a user, using this for the
// first time."
//
// js/app-runner.js's renderStrengthTable computes wPlaceholder (the weight ghost) as
// `oneRMPh || prev?.weight_kg || unit` -- the %1RM-derived target wins over last session's number
// when both exist. rPlaceholder (the reps ghost, one line below it) was only ever
// `prev?.reps_achieved || 'reps'` -- no equivalent first tier reading the row's OWN prescribed
// repsMin, so a backoff row's reps ghost always showed last time's number even when today's
// prescription disagreed. The jump_height/jump_distance branch a few lines below already gets this
// right (`jPh = rowTgt0?.repsMin ? ... : prev?.reps_achieved ...`) -- this brings the default
// weight_reps branch in line with its own sibling.
test.describe('runner: backoff row reps ghost prefers today\'s prescription over last session (Jake, 2026-09-30)', () => {
  test.beforeEach(async ({ page }) => { await loginAsPT(page) })
  test.afterEach(async ({ page }) => { await cleanupFixture(page) })

  test('a conflicting last session does not win over the prescribed repsMin', async ({ page }) => {
    // Not startRunnerWithFixture here: the prior session below must exist, under the SAME client_id
    // and exercise name the runner starts with, BEFORE startWorkoutRunner triggers
    // fetchRunnerLastSession (setTimeout(0) off renderRunner, app-runner.js:1453) -- once that
    // resolves it caches "no history" for this name (app-runner.js:276) and never re-fetches, so
    // seeding afterward would be invisible. Client and exercise name are both picked up front instead
    // of read back from the fixture afterward, which is what made the first draft of this test wrong
    // on two counts (wrong client, wrong name) rather than one.
    const tag = '[E2E] RPE-TopSet-ReppsGhost ' + Date.now() + '-' + Math.random().toString(36).slice(2, 7)
    const exName = tag + ' Exercise'
    const ids = await page.evaluate(async ({ tag, exName }) => {
      const { data: client, error: clientErr } = await db.from('clients')
        .insert({ coach_id: currentUser.id, full_name: tag }).select('id').single()
      if (clientErr) return { error: 'client: ' + clientErr.message }
      const { data: log, error: logErr } = await db.from('workout_logs').insert({
        coach_id: currentUser.id, client_id: client.id, name: tag + ' prior', date: '2026-09-01'
      }).select().single()
      if (logErr) return { error: 'log: ' + logErr.message }
      const { data: exRow, error: exErr } = await db.from('workout_log_exercises').insert({
        log_id: log.id, exercise_name: exName, exercise_type: 'strength', order_index: 0
      }).select().single()
      if (exErr) return { error: 'log exercise: ' + exErr.message }
      const { error: setsErr } = await db.from('workout_log_sets').insert([
        { workout_log_exercise_id: exRow.id, set_number: 1, reps_achieved: 3, weight_kg: 90 },
        // Deliberately far from today's prescribed 8 -- the exact adversarial condition Jake described.
        { workout_log_exercise_id: exRow.id, set_number: 2, reps_achieved: 15, weight_kg: 60 },
      ])
      if (setsErr) return { error: 'log sets: ' + setsErr.message }
      const { data: tmpl, error: tmplErr } = await db.from('workout_templates')
        .insert({ coach_id: currentUser.id, name: tag }).select('id').single()
      if (tmplErr) return { error: 'template: ' + tmplErr.message }
      const { error: tmplExErr } = await db.from('workout_template_exercises').insert({
        template_id: tmpl.id, exercise_name: exName, exercise_type: 'strength', metric_type: 'weight_reps',
        order_index: 0,
        sets_json: [
          { repsMin: 3, effortType: 'rpe', effortMin: 8, isTopSet: true },
          { repsMin: 8, intensityMin: 70, intensityBasis: 'topSet' },
        ]
      })
      if (tmplExErr) return { error: 'template exercise: ' + tmplExErr.message }
      return { clientId: client.id, templateId: tmpl.id }
    }, { tag, exName })
    expect(ids.error, 'fixture setup must succeed before any assertion runs').toBeUndefined()
    fixture = ids   // module-scope, so the shared afterEach's cleanupFixture(page) tears all of this down

    await page.evaluate(({ clientId, templateId }) => startWorkoutRunner(clientId, templateId), ids)
    await page.waitForFunction(
      () => typeof _runner !== 'undefined' && !!(_runner && _runner.exercises && _runner.exercises[0] && _runner.exercises[0].tableRows),
      { timeout: 10000 }
    )
    // != null, NOT !== undefined: fetchRunnerLastSession (app-runner.js:273-onward) sets
    // lastSession[name] = null SYNCHRONOUSLY before its own DB fetch even starts, so !== undefined
    // is satisfied instantly and proves nothing about the real fetch finishing -- a genuine gap found
    // while chasing this exact test's own false pass (review, 2026-09-30). != null waits for the
    // fetch to actually resolve into a real object, which this test's own seeded history guarantees
    // it eventually will (a test with no seeded history must not use this wait -- it would hang).
    await page.waitForFunction((n) => _runner?.lastSession?.[n] != null, exName, { timeout: 8000 })
    await page.evaluate(() => renderRunner())   // lastSession resolves after the initial render; repaint to pick it up

    expect(await page.getAttribute('#set-1-reps', 'placeholder'),
      'today\'s prescribed 8 must win over last session\'s conflicting 15').toBe('8')
  })

  test('with no conflicting history, the prescribed repsMin still wins over the bare "reps" placeholder', async ({ page }) => {
    await startRunnerWithFixture(page, { sets: [
      { repsMin: 3, effortType: 'rpe', effortMin: 8, isTopSet: true },
      { repsMin: 8, intensityMin: 70, intensityBasis: 'topSet' },
    ] })
    expect(await page.getAttribute('#set-1-reps', 'placeholder')).toBe('8')
  })

  test('a plain row with no repsMin prescribed still falls back to the bare word, unchanged', async ({ page }) => {
    // startRunnerWithFixture's client is fresh (no workout_logs at all), so this only proves tier 3
    // (the bare word) survives -- it does NOT exercise tier 2 (last session winning when tier 1 is
    // absent). That coverage gap was found by review, 2026-09-30; the test below closes it for real.
    await startRunnerWithFixture(page, { sets: [{ effortType: 'rpe', effortMin: 8 }] })
    expect(await page.getAttribute('#set-0-reps', 'placeholder')).toBe('reps')
  })

  test('a plain row with no repsMin prescribed still falls back to last session, when one exists', async ({ page }) => {
    // The regression half, actually exercised this time: a row that prescribes nothing specific must
    // keep showing last session's number exactly as it always has -- this fix adds a FIRST tier ahead
    // of it, it must not remove the second. Same inline-fixture reasoning as the first test in this
    // block: the prior session must exist, under the same client_id and exercise name, before
    // startWorkoutRunner triggers fetchRunnerLastSession, so startRunnerWithFixture (which creates its
    // own client/name internally, after this test would need to seed against them) cannot be used here.
    const tag = '[E2E] RPE-TopSet-ReppsGhostTier2 ' + Date.now() + '-' + Math.random().toString(36).slice(2, 7)
    const exName = tag + ' Exercise'
    const ids = await page.evaluate(async ({ tag, exName }) => {
      const { data: client, error: clientErr } = await db.from('clients')
        .insert({ coach_id: currentUser.id, full_name: tag }).select('id').single()
      if (clientErr) return { error: 'client: ' + clientErr.message }
      const { data: log, error: logErr } = await db.from('workout_logs').insert({
        coach_id: currentUser.id, client_id: client.id, name: tag + ' prior', date: '2026-09-01'
      }).select().single()
      if (logErr) return { error: 'log: ' + logErr.message }
      const { data: exRow, error: exErr } = await db.from('workout_log_exercises').insert({
        log_id: log.id, exercise_name: exName, exercise_type: 'strength', order_index: 0
      }).select().single()
      if (exErr) return { error: 'log exercise: ' + exErr.message }
      const { error: setsErr } = await db.from('workout_log_sets').insert([
        { workout_log_exercise_id: exRow.id, set_number: 1, reps_achieved: 12, weight_kg: 80 },
      ])
      if (setsErr) return { error: 'log sets: ' + setsErr.message }
      const { data: tmpl, error: tmplErr } = await db.from('workout_templates')
        .insert({ coach_id: currentUser.id, name: tag }).select('id').single()
      if (tmplErr) return { error: 'template: ' + tmplErr.message }
      // No repsMin anywhere on this row -- tier 1 must have nothing to win with.
      const { error: tmplExErr } = await db.from('workout_template_exercises').insert({
        template_id: tmpl.id, exercise_name: exName, exercise_type: 'strength', metric_type: 'weight_reps',
        order_index: 0, sets_json: [{ effortType: 'rpe', effortMin: 8 }]
      })
      if (tmplExErr) return { error: 'template exercise: ' + tmplExErr.message }
      return { clientId: client.id, templateId: tmpl.id }
    }, { tag, exName })
    expect(ids.error, 'fixture setup must succeed before any assertion runs').toBeUndefined()
    fixture = ids

    await page.evaluate(({ clientId, templateId }) => startWorkoutRunner(clientId, templateId), ids)
    await page.waitForFunction(
      () => typeof _runner !== 'undefined' && !!(_runner && _runner.exercises && _runner.exercises[0] && _runner.exercises[0].tableRows),
      { timeout: 10000 }
    )
    // != null, not !== undefined -- see the sibling test above for why (fetchRunnerLastSession sets
    // the key to null synchronously before its real fetch even starts).
    await page.waitForFunction((n) => _runner?.lastSession?.[n] != null, exName, { timeout: 8000 })
    await page.evaluate(() => renderRunner())

    expect(await page.getAttribute('#set-0-reps', 'placeholder'),
      'tier 1 is absent, so tier 2 (last session\'s 12) must win over tier 3 (the bare word)').toBe('12')
  })
})

// ── Review round 2 (2026-10-01) ───────────────────────────────────────────────────────────────
test.describe('RPE top set: review round 2 (2026-10-01)', () => {
  test.beforeEach(async ({ page }) => { await loginAsPT(page) })
  test.afterEach(async ({ page }) => { await cleanupFixture(page) })

  // C2-1 (high). Round 1's fix re-rendered the table whenever a TICKED row's effort changed. But
  // mousedown on any other control blurs the field first, `change` fires, renderRunner() replaces the
  // node under the pointer, and the click is never dispatched — so the tap on a different set's ✓
  // simply did nothing. Seven passing tests went red on the first, wider version of this fix; the
  // narrowed version only shrank the blast radius to "after editing a ticked row's effort", which is
  // the main flow it existed for. None of its own tests tapped anything else.
  test("editing a ticked set's effort does not swallow a tap on another set's tick", async ({ page }) => {
    await startRunnerWithFixture(page, { sets: [
      { repsMin: 3, effortType: 'rpe', effortMin: 8, isTopSet: true },
      { repsMin: 8 }
    ] })
    await page.fill('#set-0-weight', '100'); await page.fill('#set-0-reps', '3')
    await page.fill('#set-0-effort', '8');   await page.click('#set-0-done')
    await page.fill('#set-1-weight', '80');  await page.fill('#set-1-reps', '8')
    await page.fill('#set-0-effort', '9')              // edit the TICKED row; focus stays in it
    await page.click('#set-1-done')                    // the tap that used to be swallowed
    const done = await page.evaluate(() => _runner.exercises[0].tableRows[1].done)
    expect(done, "set 2 must log: the tap landed on a live button, not on a node a re-render had just detached").toBe(true)
  })

  // C2-3 (high). _loggedExercises() feeds BOTH the finish screen and the save, and its own caller
  // comment says "they must not diverge". Round 1 put the re-sync only in the save, so an edit made
  // without re-ticking showed 300 kg on the finish screen and stored 330 three seconds later.
  test('the finish screen and the saved set agree after an edit made without re-ticking', async ({ page }) => {
    await startRunnerWithFixture(page, { sets: [
      { repsMin: 3, effortType: 'rpe', effortMin: 8, isTopSet: true }
    ] })
    await page.fill('#set-0-weight', '100'); await page.fill('#set-0-reps', '3')
    await page.fill('#set-0-effort', '8');   await page.click('#set-0-done')
    await page.fill('#set-0-weight', '110')            // edit, do NOT re-tick
    await page.evaluate(() => showRunnerFinish())      // the screen, BEFORE anything has called the save
    await expect(page.locator('#workout-runner'), '110 x 3 = 330, not the stale 100 x 3 = 300').toContainText('330')
    const w = await page.evaluate(() => Number(_loggedExercises()[0].loggedSets[0].weight))
    expect(w).toBe(110)
  })

  // C2-5 (medium). _clampRpe floors at 6 and caps at 10, so a typed -5 became "RPE 6" and 88 became
  // "RPE 10": the database refused the value while the estimate, the chip, the backoff targets and a
  // post-session "Save as my 1RM" all happily used the clamped one.
  for (const bad of ['-5', '88']) {
    test(`an impossible effort (${bad}) yields no estimate, no chip and no backoff target`, async ({ page }) => {
      await startRunnerWithFixture(page, { sets: [
        { repsMin: 3, effortType: 'rpe', effortMin: 8, isTopSet: true },
        { repsMin: 8, intensityMin: 70, intensityBasis: 'topSet' }
      ] })
      await page.fill('#set-0-weight', '100'); await page.fill('#set-0-reps', '3')
      await page.fill('#set-0-effort', bad);   await page.click('#set-0-done')
      expect(await page.evaluate(() => _runner.exercises[0]._liveE1RM ?? null)).toBeNull()
      await expect(page.locator('#ex-e1rm-chip')).toHaveCount(0)
      await expect(page.locator('#set-1-basis-note')).toContainText("Enter the top set's RPE")
    })
  }
})

// ── Round 2, builder: the flow no earlier test used (2026-10-01) ────────────────────────────────
test.describe('builder: Copy previous set after a top set (review round 2, 2026-10-01)', () => {
  test.beforeEach(async ({ page }) => { await loginAsPT(page) })
  test.afterEach(async ({ page }) => { await cleanupBuilderFixture(page) })

  // The headline workflow: mark the top set, tap Copy previous set to make the backoff row, point it
  // at "Today's top set", save. "Copy previous set" copies a whole row — isTopSet included — and the
  // TOP SET pill exists only on row 0, so the copy had a flag nothing could clear. Round 1's fix 6
  // nulled weight and % on any flagged row, so saving silently erased the 70%. Every earlier builder
  // test seeded blank rows and never pressed Copy, which is how 28 green tests missed it.
  test("the backoff row's percentage survives Copy previous set + save + reopen", async ({ page }) => {
    await openTemplateBuilderWithFixture(page, { sets: 1 })
    await page.click('#ts-topset-0')
    await page.fill('#ts-emin-0', '8')                         // keep the no-effort warning out of it
    await page.locator('button', { hasText: 'Copy previous set' }).click()
    await page.selectOption('#ts-basis-1', 'topSet')
    await page.fill('#ts-imin-1', '70')
    await saveTemplate(page)
    await reopenTemplate(page)
    const sets = await page.evaluate(() => window._templateSets)
    expect(sets.length).toBe(2)
    expect(sets[0].isTopSet, 'row 0 is still the top set').toBe(true)
    expect(sets[1].isTopSet, 'the copied flag must not persist on a row that cannot show or clear it').toBeFalsy()
    expect(Number(sets[1].intensityMin), 'the 70% the coach typed must still be there').toBe(70)
    expect(sets[1].intensityBasis).toBe('topSet')
  })
})
