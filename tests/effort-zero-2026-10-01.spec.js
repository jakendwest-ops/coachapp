// RIR 0 ("to failure") prescribed in the builder reaches the runner, by real clicks (2026-10-01).
//
// The node tests (tests-node/effort-zero.test.mjs) pin the three truthy-zero sites with a NUMERIC 0, which is what
// imported or hand-edited sets_json carries. This is the path a coach actually takes: type 0 into the RIR box, save,
// start the workout, and look at the target bar. The builder's inputs hand back the STRING '0' (truthy), so this path
// mostly worked by accident before the fix — it is here so it cannot stop working, and so the min="1" on those inputs
// (which made 0 look like an invalid entry) stays gone.
const { test, expect } = require('./fixtures')
const { loginAsPT, clickVisible } = require('./helpers')
const S = require('./rpe-journey-steps')

let F = null   // the live fixture, read by cleanup even when the test threw

test.afterEach(async ({ page }) => {
  if (!F) return
  const f = F; F = null
  try {
    const removed = await S.cleanupJourney(page, { tag: f.tag, exId: f.exId, fixtureClientId: f.clientId })
    console.log(`[effort-zero] cleanup ${f.tag}: ${JSON.stringify(removed)}`)
  } catch (err) {
    console.warn(`[effort-zero] CLEANUP FAILED for ${f.tag} — rows may remain in the test account:`, err.message)
  }
})

test('RIR 0 typed in the builder is saved, shown in the builder, and shown in the runner target bar', async ({ page }) => {
  await loginAsPT(page)
  const { tag, exName, tplName } = S.journeyTag('[E2E] RIR0')
  const ids = await page.evaluate(async ({ tag, exName }) => {
    const { data: ex, error: exErr } = await db.from('exercises').insert({ coach_id: currentUser.id, name: exName, metric_type: 'weight_reps' }).select('id').single()
    if (exErr) return { error: 'exercise: ' + exErr.message }
    const { data: client, error: cErr } = await db.from('clients').insert({ coach_id: currentUser.id, full_name: tag + ' Client' }).select('id').single()
    if (cErr) return { error: 'client: ' + cErr.message }
    return { exId: ex.id, clientId: client.id }
  }, { tag, exName })
  expect(ids.error, 'fixture setup must succeed before any assertion runs').toBeUndefined()
  F = { tag, exName, tplName, clientName: tag + ' Client', ...ids }

  // BUILD: one strength exercise, 5 reps, RIR 0.
  await clickVisible(page, '[data-page="workouts"]')
  await page.getByRole('button', { name: '+ New template' }).click()
  await page.locator('#ct-name').fill(tplName)
  await page.locator('#create-template-modal button:has-text("Create")').click()
  await page.locator('button:has-text("+ Add exercise"):visible').first().click()
  await page.locator('#exercise-picker-modal input[placeholder^="Find or create"]').fill(exName)
  await page.locator('#exercise-picker-modal').getByText(exName, { exact: true }).click()
  await expect(page.locator('#add-to-template-modal')).toBeVisible()
  await page.locator('#ts-rmin-0').fill('5')
  await page.locator('button[onclick^="setTsEffort(0,\'rir\'"]').click()
  await page.locator('#ts-emin-0').fill('0')
  await expect(page.locator('#ts-emin-0'), 'a 0 in the effort box is a valid entry, not an invalid one').toHaveJSProperty('validity.valid', true)
  await page.locator('#att-confirm-btn').click()
  await expect(page.locator('#add-to-template-modal')).toHaveCount(0)
  await page.locator('#save-template-draft-btn').click()

  // SAVED: the 0 must be in the database, as an effort — not dropped to null.
  const saved = await S.readSavedTemplateExercise(page, exName)
  expect(saved.sets_json[0].effortType, 'the RIR toggle must persist').toBe('rir')
  expect(saved.sets_json[0].effortMin, 'a prescribed 0 must not be saved as null').not.toBeNull()
  expect(Number(saved.sets_json[0].effortMin)).toBe(0)

  // RUNNER: start it for the fixture client and read the target bar.
  await clickVisible(page, '[data-page="clients"]')
  await page.locator('.list-row', { hasText: F.clientName }).click()
  await page.locator('button.tab-btn:has-text("Workouts")').click()
  await page.getByRole('button', { name: '▶ Start workout' }).click()
  await page.locator('#rs-template').selectOption({ label: tplName })
  await page.locator('#runner-setup button:has-text("▶ Start")').click()
  await expect(page.locator('#set-0-weight')).toBeVisible()
  const rirCell = page.locator('#wr-rx > div', { hasText: 'RIR' })
  await expect(rirCell, 'the target bar must carry an RIR column for a prescribed 0').toHaveCount(1)
  await expect(rirCell.locator('div').first(), 'and it must read 0').toHaveText('0')
})
