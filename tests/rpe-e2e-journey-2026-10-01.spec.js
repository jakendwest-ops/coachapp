// RPE top-set autoregulation — the END-TO-END journey, by real clicks (2026-10-01).
//
// WHY THIS FILE EXISTS. Every earlier check of this feature reached it through a shortcut:
// startWorkoutRunner(clientId, templateId) via page.evaluate, showEditTemplateExerciseModal via
// page.evaluate, a DOM stub for the builder. Two review rounds then found that those shortcuts had
// hidden real defects — the headline workflow (mark the top set, "Copy previous set", point the copy
// at "today's top set", save) was never pressed once, and it silently erased the backoff percentage.
//
// This drives the path a person takes, with clicks only for everything under test:
//   Workouts -> + New template -> + Add exercise -> pick -> TOP SET / RPE / Copy previous set /
//   "% of today's top set" -> Save  ->  Clients -> client -> Workouts tab -> Start workout ->
//   pick the template -> Start -> type weight/reps/RPE -> tick -> End -> Save workout ->
//   "Save as my 1RM" -> look at the 1RMs tab,
// then checks what actually landed in the database. DB inserts are used ONLY for fixtures (a client
// and a library exercise) — never for the thing being tested.
//
// Set E2E_SHOTS=<dir> to also save phone-size screenshots at each stop, to be LOOKED AT: a passing
// assertion is not a mobile check.
const { test, expect } = require('./fixtures')
const { loginAsPT, clickVisible } = require('./helpers')

const SHOTS = process.env.E2E_SHOTS
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }) }

let F = null   // the live fixture, read by cleanup even when the test threw

async function makeFixture(page) {
  const tag = '[E2E] RPE-Journey ' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)
  const ids = await page.evaluate(async (tag) => {
    const { data: ex, error: exErr } = await db.from('exercises')
      .insert({ coach_id: currentUser.id, name: tag + ' Bench', metric_type: 'weight_reps' }).select('id').single()
    if (exErr) return { error: 'exercise: ' + exErr.message }
    const { data: client, error: cErr } = await db.from('clients')
      .insert({ coach_id: currentUser.id, full_name: tag + ' Client' }).select('id').single()
    if (cErr) return { error: 'client: ' + cErr.message }
    return { exId: ex.id, clientId: client.id }
  }, tag)
  expect(ids.error, 'fixture setup must succeed before any assertion runs').toBeUndefined()
  F = { tag, exName: tag + ' Bench', tplName: tag + ' Template', clientName: tag + ' Client', ...ids }
  return F
}

// Everything the test could have created, keyed by the unique tag / the fixture client. FK-safe
// order; runs even when the test threw. The client row is the TEST'S OWN fixture, never a real one.
async function cleanup(page) {
  if (!F) return
  const f = F; F = null
  await page.evaluate(async ({ tag, clientId, exId }) => {
    const { data: tpls } = await db.from('workout_templates').select('id').ilike('name', tag + '%')
    const tplIds = (tpls || []).map(t => t.id)
    const { data: logs } = await db.from('workout_logs').select('id').eq('client_id', clientId)
    const logIds = (logs || []).map(l => l.id)
    if (logIds.length) {
      const { data: exs } = await db.from('workout_log_exercises').select('id').in('log_id', logIds)
      const exIds = (exs || []).map(e => e.id)
      if (exIds.length) await db.from('workout_log_sets').delete().in('workout_log_exercise_id', exIds).select('id')
      await db.from('workout_log_exercises').delete().in('log_id', logIds).select('id')
      await db.from('workout_logs').delete().in('id', logIds).select('id')
    }
    if (tplIds.length) {
      await db.from('workout_template_exercises').delete().in('template_id', tplIds).select('id')
      await db.from('workout_templates').delete().in('id', tplIds).select('id')
    }
    await db.from('client_1rms').delete().eq('client_id', clientId).select('id')
    await db.from('clients').delete().eq('id', clientId).select('id')
    await db.from('exercises').delete().eq('id', exId).select('id')
  }, f).catch(err => console.warn('[rpe-e2e-journey] CLEANUP FAILED — rows may be left in the test account:', err.message))
}

test.describe('RPE top set — real-click journey (coach)', () => {
  test.afterEach(async ({ page }) => { await cleanup(page) })

  test('build -> assign -> run -> save -> accept the 1RM, as a coach', async ({ page }) => {
    await loginAsPT(page)
    const f = await makeFixture(page)

    // ── 1. BUILD the template with real clicks ────────────────────────────────────────────────
    await clickVisible(page, '[data-page="workouts"]')
    await page.getByRole('button', { name: '+ New template' }).click()
    await page.locator('#ct-name').fill(f.tplName)
    await page.locator('#create-template-modal button:has-text("Create")').click()

    await page.locator('button:has-text("+ Add exercise"):visible').first().click()
    // Type to find it, like a person with a long library would — the list is alphabetical and long.
    await page.locator('#exercise-picker-modal input[placeholder^="Find or create"]').fill(f.exName)
    await page.locator('#exercise-picker-modal').getByText(f.exName, { exact: true }).click()
    await expect(page.locator('#add-to-template-modal')).toBeVisible()

    // Set 1 = the top set: 3 reps @ RPE 8.
    await page.locator('#ts-topset-0').click()
    await page.locator('#ts-rmin-0').fill('3')
    await page.locator('#ts-emin-0').fill('8')
    await expect(page.locator('#ts-topset-effort-warning'), 'an RPE is prescribed, so no warning').toBeHidden()
    // Set 2 = the backoff, made the way a coach would: Copy previous set, then 70% of today's top set.
    await page.locator('button:has-text("Copy previous set")').click()
    await expect(page.locator('#ts-rmin-1')).toBeVisible()
    await page.locator('#ts-rmin-1').fill('8')
    await page.locator('details.ts-more:has(#ts-imin-1) > summary').click()
    await page.locator('#ts-basis-1').selectOption('topSet')
    await page.locator('#ts-imin-1').fill('70')
    await shot(page, '01-builder-top-set-and-backoff')

    await page.locator('#att-confirm-btn').click()
    await expect(page.locator('#add-to-template-modal')).toHaveCount(0)
    await page.locator('#save-template-draft-btn').click()

    // What was SAVED — the data the headline workflow used to erase.
    await expect.poll(async () => page.evaluate(async (name) => {
      const { data } = await db.from('workout_template_exercises').select('exercise_id, sets_json').eq('exercise_name', name)
      return data?.length || 0
    }, f.exName), { message: 'the template exercise must be saved' }).toBe(1)
    const saved = await page.evaluate(async (name) => {
      const { data } = await db.from('workout_template_exercises').select('exercise_id, sets_json').eq('exercise_name', name).single()
      return data
    }, f.exName)
    expect(saved.exercise_id, 'the library link must ride along').toBe(f.exId)
    expect(saved.sets_json.length).toBe(2)
    expect(saved.sets_json[0].isTopSet).toBe(true)
    expect(Number(saved.sets_json[0].effortMin)).toBe(8)
    expect(saved.sets_json[1].isTopSet, 'a copied flag must not persist on the backoff row').toBeFalsy()
    expect(Number(saved.sets_json[1].intensityMin), 'the 70% survived Copy + save').toBe(70)
    expect(saved.sets_json[1].intensityBasis).toBe('topSet')

    // ── 2. START it for a client, the way a coach does ───────────────────────────────────────
    await clickVisible(page, '[data-page="clients"]')
    await page.locator('.list-row', { hasText: f.clientName }).click()
    await page.locator('button.tab-btn:has-text("Workouts")').click()
    await page.getByRole('button', { name: '▶ Start workout' }).click()
    await expect(page.locator('#runner-setup')).toBeVisible()
    await page.locator('#rs-template').selectOption({ label: f.tplName })
    await page.locator('#runner-setup button:has-text("▶ Start")').click()
    // Wait on a real control, not the #workout-runner wrapper: its only child is position:fixed, so the wrapper
    // itself has a 0x0 box and Playwright (correctly) calls it hidden.
    await expect(page.locator('#set-0-weight')).toBeVisible()

    // ── 3. RUN it ─────────────────────────────────────────────────────────────────────────────
    await expect(page.locator('#set-0-effort'), 'the top set prescribes an RPE, so it must offer a box for one').toBeVisible()
    await expect(page.locator('#set-1-basis-note')).toContainText('Log the top set first')
    await shot(page, '02-runner-before-top-set')
    await page.locator('#set-0-weight').fill('100')
    await page.locator('#set-0-reps').fill('3')
    await page.locator('#set-0-effort').fill('8')
    await page.locator('#set-0-done').click()
    await expect(page.locator('#ex-e1rm-chip')).toContainText('115.9')
    await expect(page.locator('#set-1-weight')).toHaveAttribute('placeholder', '80')
    await expect(page.locator('#wr-onerm-banner'), 'no stored 1RM is needed, so no banner demanding one').toHaveCount(0)
    await shot(page, '03-runner-after-top-set')
    await page.locator('#set-1-weight').fill('80')
    await page.locator('#set-1-reps').fill('8')
    await page.locator('#set-1-done').click()

    // ── 4. FINISH and SAVE ────────────────────────────────────────────────────────────────────
    await page.locator('button[onclick="confirmEndRunner()"]').click()
    await expect(page.locator('#workout-runner')).toContainText('Workout complete')
    await shot(page, '04-finish-screen')
    await page.locator('button[onclick="saveRunnerSession()"]').click()
    await expect(page.locator('#modal-post-session-1rm')).toBeVisible()
    await expect(page.locator('#psorm-estimate-0')).toContainText('115.9')
    await shot(page, '05-post-session-1rm-modal')
    await page.locator('#psorm-row-0 button:has-text("Save as my 1RM")').click()
    await expect(page.locator('#psorm-row-0')).toHaveCount(0)

    // ── 5. What landed in the DATABASE ────────────────────────────────────────────────────────
    const landed = await page.evaluate(async ({ clientId }) => {
      const { data: log } = await db.from('workout_logs').select('id').eq('client_id', clientId).order('created_at', { ascending: false }).limit(1).single()
      const { data: exs } = await db.from('workout_log_exercises').select('id').eq('log_id', log.id)
      const { data: sets } = await db.from('workout_log_sets').select('set_number, weight_kg, reps_achieved, effort_type, effort_value')
        .in('workout_log_exercise_id', exs.map(e => e.id)).order('set_number')
      const { data: rms } = await db.from('client_1rms').select('exercise_id, exercise_name, one_rm_kg').eq('client_id', clientId)
      return { sets, rms }
    }, f)
    expect(landed.sets.length).toBe(2)
    expect(Number(landed.sets[0].weight_kg)).toBe(100)
    expect(landed.sets[0].reps_achieved).toBe(3)
    expect(landed.sets[0].effort_type).toBe('rpe')
    expect(Number(landed.sets[0].effort_value)).toBe(8)
    expect(Number(landed.sets[1].weight_kg)).toBe(80)
    expect(landed.sets[1].effort_value, 'the backoff prescribed no effort, so none is stored').toBeNull()
    expect(landed.rms.length).toBe(1)
    expect(landed.rms[0].exercise_id, 'the 1RM is anchored on the library exercise, not just a name').toBe(f.exId)
    expect(Math.abs(Number(landed.rms[0].one_rm_kg) - 115.87)).toBeLessThan(0.1)

    // ── 6. And it SHOWS where the coach looks for it ──────────────────────────────────────────
    await page.locator('#modal-post-session-1rm button:has-text("Done")').click()
    await page.locator('button.tab-btn:has-text("1RMs")').click()
    await expect(page.locator('#tab-content')).toContainText(f.exName)
    await shot(page, '06-client-1rms-tab')
  })
})
