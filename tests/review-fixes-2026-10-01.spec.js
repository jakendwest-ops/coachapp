// Browser checks for the pre-push multi-agent review's findings that need a real page (2026-10-01).
// The ones that do not are in tests-node/review-fixes-2026-10-01.test.mjs. Every fixture carries a unique [E2E tag and is
// removed in afterEach by that tag, with the row counts read back.
//
//   1. The exercise picker used to ignore a failed library read and say "No exercises yet — create your first one" — over a
//      library of thousands, which is exactly how a duplicate gets typed in. It must say the read failed, and offer no Create.
//   2. RENAMING an exercise onto an existing name made a duplicate (the fourth writer to exercises.name; the other three look
//      first). It must refuse — and must still let an ordinary rename through.
const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

let TAG = null

test.beforeEach(async ({ page }) => {
  TAG = '[E2E] RevFix ' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)
  await loginAsPT(page)
})

test.afterEach(async ({ page }) => {
  if (TAG) {
    const tag = TAG; TAG = null
    const removed = await page.evaluate(async (tag) => {
      const { data, error } = await db.from('exercises').delete().ilike('name', tag + '%').select('id')
      return { n: (data || []).length, error: error?.message || null }
    }, tag)
    console.log(`[review-fixes] cleanup ${tag}: ${JSON.stringify(removed)}`)
  }
})

test('the exercise picker says the library read FAILED instead of "No exercises yet", and offers no Create', async ({ page }) => {
  await page.evaluate(() => {
    window._realFetchAllRows = window._fetchAllRows
    window._fetchAllRows = async () => ({ data: null, error: { message: 'boom' } })
    _openExercisePicker(currentUser.id, () => {})
  })
  try {
    await expect(page.locator('#exp-load-failed')).toContainText('Could not load your exercises')
    await expect(page.locator('#exp-results')).not.toContainText('No exercises yet')
    await page.locator('#exp-search').fill(TAG + ' Typed')
    await expect(page.locator('#exp-results'), 'with the read failed there is nothing to match against, so no Create row').not.toContainText('Create new exercise')
  } finally {
    await page.evaluate(() => { window._fetchAllRows = window._realFetchAllRows; _closeExercisePicker() })
  }
})

test('renaming an exercise onto an existing name is refused; an ordinary rename still works', async ({ page }) => {
  const ids = await page.evaluate(async (tag) => {
    const mk = async name => {
      const { data, error } = await db.from('exercises').insert({ coach_id: currentUser.id, name, metric_type: 'weight_reps' }).select('id').single()
      if (error) throw new Error(error.message)
      return data.id
    }
    return { a: await mk(tag + ' Alpha'), b: await mk(tag + ' Beta') }
  }, TAG)

  const open = async id => { await page.evaluate(async (id) => { await showEditExerciseModal(id) }, id) }
  const nameOf = id => page.evaluate(async (id) => (await db.from('exercises').select('name').eq('id', id).single()).data.name, id)

  // 1. onto an existing name — in a DIFFERENT CASE, because the match is case-insensitive
  await open(ids.b)
  await page.locator('#ee-name').fill((TAG + ' alpha').toUpperCase())
  await page.evaluate(async (id) => { await saveEditExercise(id) }, ids.b)
  await expect(page.locator('#ee-error')).toContainText('already have an exercise called')
  expect(await nameOf(ids.b), 'the refused rename changed nothing').toBe(TAG + ' Beta')
  await page.evaluate(() => closeModal('edit-exercise-modal'))

  // 2. POSITIVE CONTROL: a rename to a name nobody has goes through, so the refusal above is the duplicate check and not a broken save
  await open(ids.b)
  await page.locator('#ee-name').fill(TAG + ' Gamma')
  await page.evaluate(async (id) => { await saveEditExercise(id) }, ids.b)
  await expect.poll(() => nameOf(ids.b)).toBe(TAG + ' Gamma')

  // 3. editing something OTHER than the name keeps working even though the name is its own (no self-clash)
  await open(ids.b)
  await page.locator('#ee-notes').fill('unchanged name')
  await page.evaluate(async (id) => { await saveEditExercise(id) }, ids.b)
  await expect.poll(async () => page.evaluate(async (id) => (await db.from('exercises').select('notes').eq('id', id).single()).data.notes, ids.b)).toBe('unchanged name')
})
