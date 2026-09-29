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
