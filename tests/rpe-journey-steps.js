// Shared real-click steps for the RPE top-set end-to-end journeys (coach, client, solo) — 2026-10-01.
//
// ONE copy of "build the workout in the builder" and "run it and accept the 1RM", so every role is tested
// through IDENTICAL steps and cannot drift apart. The role-specific part — how you reach the builder and how
// you start the workout — stays in each spec. Everything here is a click or a keystroke; nothing reaches the
// app through page.evaluate except reading results back.
const { expect } = require('./fixtures')

const SHOTS = process.env.E2E_SHOTS
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }) }

// A unique identity for one journey, so cleanup — and the reaper, if cleanup is skipped — can find it.
// The CALLER writes the tag prefix (the fixture-tagging gate wants "[E2E" in the spec's own code, where it can
// see it) and this REFUSES anything that does not start with it: an untagged fixture cannot be reaped, and
// that is how 6,275 exercises piled up. Enforced at run time, not merely satisfied textually.
function journeyTag(prefix, exSuffix = 'Bench') {
  if (!String(prefix).startsWith('[E2E')) {
    throw new Error(`journeyTag: "${prefix}" must start with "[E2E" so scripts/reap-e2e-debris.mjs can find these rows`)
  }
  const tag = `${prefix} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  // exSuffix lets a journey run with a HOSTILE exercise name; the tag stays first so cleanup still finds it.
  return { tag, exName: `${tag} ${exSuffix}`, tplName: `${tag} Template` }
}

// From the page that lists templates: New template -> Add exercise -> pick it -> TOP SET, 3 reps @ RPE 8 ->
// Copy previous set -> 8 reps at 70% of TODAY'S top set -> confirm -> Save. The headline workflow.
async function buildTopSetTemplate(page, { tplName, exName, shotPrefix }) {
  await page.getByRole('button', { name: '+ New template' }).click()
  await page.locator('#ct-name').fill(tplName)
  await page.locator('#create-template-modal button:has-text("Create")').click()

  await page.locator('button:has-text("+ Add exercise"):visible').first().click()
  // Type to find it, like a person with a long library would.
  await page.locator('#exercise-picker-modal input[placeholder^="Find or create"]').fill(exName)
  await page.locator('#exercise-picker-modal').getByText(exName, { exact: true }).click()
  await expect(page.locator('#add-to-template-modal')).toBeVisible()

  await page.locator('#ts-topset-0').click()
  await page.locator('#ts-rmin-0').fill('3')
  await page.locator('#ts-emin-0').fill('8')
  await expect(page.locator('#ts-topset-effort-warning'), 'an RPE is prescribed, so no warning').toBeHidden()
  await page.locator('button:has-text("Copy previous set")').click()
  await expect(page.locator('#ts-rmin-1')).toBeVisible()
  await page.locator('#ts-rmin-1').fill('8')
  await page.locator('details.ts-more:has(#ts-imin-1) > summary').click()
  await page.locator('#ts-basis-1').selectOption('topSet')
  await page.locator('#ts-imin-1').fill('70')
  if (shotPrefix) await shot(page, `${shotPrefix}-builder`)

  await page.locator('#att-confirm-btn').click()
  await expect(page.locator('#add-to-template-modal')).toHaveCount(0)
  await page.locator('#save-template-draft-btn').click()
}

// What the builder SAVED (read-only) — the data the Copy-previous-set bug used to erase.
async function readSavedTemplateExercise(page, exName) {
  await expect.poll(async () => page.evaluate(async (name) => {
    const { data } = await db.from('workout_template_exercises').select('id').eq('exercise_name', name)
    return data?.length || 0
  }, exName), { message: 'the template exercise must be saved' }).toBe(1)
  return page.evaluate(async (name) => {
    const { data } = await db.from('workout_template_exercises').select('exercise_id, sets_json').eq('exercise_name', name).single()
    return data
  }, exName)
}

function assertSavedShape(saved, { exId } = {}) {
  if (exId) expect(saved.exercise_id, 'the library link must ride along').toBe(exId)
  expect(saved.sets_json.length).toBe(2)
  expect(saved.sets_json[0].isTopSet).toBe(true)
  expect(Number(saved.sets_json[0].effortMin)).toBe(8)
  expect(saved.sets_json[1].isTopSet, 'a copied flag must not persist on the backoff row').toBeFalsy()
  expect(Number(saved.sets_json[1].intensityMin), 'the 70% survived Copy + save').toBe(70)
  expect(saved.sets_json[1].intensityBasis).toBe('topSet')
}

// With the runner open on the template's first exercise: log the top set (100 x 3 @ RPE 8), watch the backoff
// retarget (70% of 115.9 -> 80), log it, End, Save, and accept the 1RM estimate. Returns nothing — what
// landed in the database is read back by the caller, as the role that is allowed to see it.
async function runTopSetSessionAndAccept1RM(page, { shotPrefix } = {}) {
  // Wait on a real control, not the #workout-runner wrapper: its only child is position:fixed, so the wrapper
  // itself has a 0x0 box and Playwright (correctly) calls it hidden.
  await expect(page.locator('#set-0-weight')).toBeVisible()
  await expect(page.locator('#set-0-effort'), 'the top set prescribes an RPE, so it must offer a box for one').toBeVisible()
  await expect(page.locator('#set-1-basis-note')).toContainText('Log the top set first')
  if (shotPrefix) await shot(page, `${shotPrefix}-runner-before`)

  await page.locator('#set-0-weight').fill('100')
  await page.locator('#set-0-reps').fill('3')
  await page.locator('#set-0-effort').fill('8')
  await page.locator('#set-0-done').click()
  await expect(page.locator('#ex-e1rm-chip')).toContainText('115.9')
  await expect(page.locator('#set-1-weight')).toHaveAttribute('placeholder', '80')
  await expect(page.locator('#wr-onerm-banner'), 'no stored 1RM is needed, so no banner demanding one').toHaveCount(0)
  if (shotPrefix) await shot(page, `${shotPrefix}-runner-after`)

  await page.locator('#set-1-weight').fill('80')
  await page.locator('#set-1-reps').fill('8')
  await page.locator('#set-1-done').click()

  await page.locator('button[onclick="confirmEndRunner()"]').click()
  await expect(page.locator('#workout-runner')).toContainText('Workout complete')
  await expect(page.locator('#wr-dropped-note'), 'every set here is complete, so there is nothing to warn about').toHaveCount(0)
  await page.locator('button[onclick="saveRunnerSession()"]').click()
  await expect(page.locator('#modal-post-session-1rm')).toBeVisible()
  await expect(page.locator('#psorm-estimate-0')).toContainText('115.9')
  if (shotPrefix) await shot(page, `${shotPrefix}-1rm-modal`)
  await page.locator('#psorm-row-0 button:has-text("Save as my 1RM")').click()
  await expect(page.locator('#psorm-row-0'), 'the 1RM row goes only when the save succeeded').toHaveCount(0)
}

// What a session of this journey must have produced, for one client record. Read as a role that can see it.
async function readSessionResult(page, { clientId, exName }) {
  return page.evaluate(async ({ clientId, exName }) => {
    const { data: exs } = await db.from('workout_log_exercises').select('id, log_id').eq('exercise_name', exName)
    const ids = (exs || []).map(e => e.id)
    const { data: sets } = ids.length
      ? await db.from('workout_log_sets').select('set_number, weight_kg, reps_achieved, effort_type, effort_value').in('workout_log_exercise_id', ids).order('set_number')
      : { data: [] }
    const { data: logs } = await db.from('workout_logs').select('id, client_id').in('id', (exs || []).map(e => e.log_id))
    const { data: rms } = await db.from('client_1rms').select('client_id, exercise_id, exercise_name, one_rm_kg').eq('client_id', clientId).eq('exercise_name', exName)
    return { sets: sets || [], logClientIds: (logs || []).map(l => l.client_id), rms: rms || [] }
  }, { clientId, exName })
}

function assertSessionResult(r, { clientId, exId } = {}) {
  expect(r.logClientIds, 'the session must be saved against THIS client record').toEqual([clientId])
  expect(r.sets.length).toBe(2)
  expect(Number(r.sets[0].weight_kg)).toBe(100)
  expect(r.sets[0].reps_achieved).toBe(3)
  expect(r.sets[0].effort_type).toBe('rpe')
  expect(Number(r.sets[0].effort_value)).toBe(8)
  expect(Number(r.sets[1].weight_kg)).toBe(80)
  expect(r.sets[1].reps_achieved).toBe(8)
  // The backoff row carries a prescribed RPE too (Copy previous set copies it) but the lifter left it blank, so
  // NOTHING is stored — not 0, not a default. A blank effort must never become a number.
  expect(r.sets[1].effort_value).toBeNull()
  expect(r.rms.length, 'exactly one 1RM row').toBe(1)
  expect(r.rms[0].client_id).toBe(clientId)
  if (exId) expect(r.rms[0].exercise_id, 'the 1RM is anchored on the library exercise, not just a name').toBe(exId)
  expect(Math.abs(Number(r.rms[0].one_rm_kg) - 115.87)).toBeLessThan(0.1)
}

// FK-safe removal of everything one journey could have made, keyed by its unique tag. NEVER deletes a client
// record: the coach journey makes (and passes in) its own fixture client, but the client and solo journeys run
// against the shared E2E client and the real solo record, which must survive. Each delete reads back its rows.
async function cleanupJourney(page, { tag, exId = null, fixtureClientId = null }) {
  return page.evaluate(async ({ tag, exId, fixtureClientId }) => {
    const removed = {}
    const del = async (label, q) => { const { data, error } = await q; if (error) throw new Error(`${label}: ${error.message}`); removed[label] = (data || []).length }
    const { data: exs } = await db.from('workout_log_exercises').select('id, log_id').ilike('exercise_name', tag + '%')
    const exIds = (exs || []).map(e => e.id), logIds = [...new Set((exs || []).map(e => e.log_id))]
    if (exIds.length) await del('sets', db.from('workout_log_sets').delete().in('workout_log_exercise_id', exIds).select('id'))
    if (exIds.length) await del('log_exercises', db.from('workout_log_exercises').delete().in('id', exIds).select('id'))
    if (logIds.length) await del('logs', db.from('workout_logs').delete().in('id', logIds).select('id'))
    const { data: tpls } = await db.from('workout_templates').select('id').ilike('name', tag + '%')
    const tplIds = (tpls || []).map(t => t.id)
    if (tplIds.length) {
      await del('template_exercises', db.from('workout_template_exercises').delete().in('template_id', tplIds).select('id'))
      await del('templates', db.from('workout_templates').delete().in('id', tplIds).select('id'))
    }
    await del('one_rms', db.from('client_1rms').delete().ilike('exercise_name', tag + '%').select('id'))
    if (fixtureClientId) await del('fixture_client', db.from('clients').delete().eq('id', fixtureClientId).select('id'))
    await del('exercises', db.from('exercises').delete().ilike('name', tag + '%').select('id'))
    return removed
  }, { tag, exId, fixtureClientId })
}

module.exports = { shot, journeyTag, buildTopSetTemplate, readSavedTemplateExercise, assertSavedShape,
                   runTopSetSessionAndAccept1RM, readSessionResult, assertSessionResult, cleanupJourney }
