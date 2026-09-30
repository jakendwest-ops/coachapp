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

async function startRunnerWithFixture(page, { sets }) {
  const tag = '[E2E] RPE-TopSet ' + Date.now() + '-' + Math.random().toString(36).slice(2, 7)
  const ids = await page.evaluate(async ({ tag, sets }) => {
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
    return { clientId: client.id, templateId: tmpl.id }
  }, { tag, sets })
  expect(ids.error, 'fixture setup must succeed before any assertion runs').toBeUndefined()
  fixture = ids

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
    await db.from('clients').delete().eq('id', clientId)
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
