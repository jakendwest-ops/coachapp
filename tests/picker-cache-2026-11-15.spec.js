// The exercise picker keeps the library between opens (Step A of docs/superpowers/plans/2026-11-15-workout-builder-speed.md).
// Jake, 2026-11-14: "there was a delay" on Add exercise - the picker re-read the whole library, 200 rows per request, one
// request after another, on EVERY open, so "Add another" paid it again per exercise.
//
// Pinned here: (1) a second open makes NO exercises read; (2) an exercise created from the picker is in the next open with
// no read; (3) a library write elsewhere drops the kept copy, so the next open reads again and shows the new row.
const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

let TAG = null

test.beforeEach(async ({ page }) => {
  TAG = '[E2E] PickCache ' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)
  await loginAsPT(page)
})

test.afterEach(async ({ page }) => {
  if (!TAG) return
  const tag = TAG; TAG = null
  await page.evaluate(async (tag) => {
    await db.from('exercises').delete().eq('coach_id', currentUser.id).ilike('name', tag + '%').select('id')
  }, tag).catch(err => console.warn('[picker-cache] CLEANUP FAILED - rows may be left in the test account:', err.message))
})

// Counts GETs on the exercises table from the moment it is called.
function countExerciseReads(page) {
  const box = { n: 0 }
  page.on('request', r => { if (r.method() === 'GET' && /\/rest\/v1\/exercises\?/.test(r.url())) box.n++ })
  return box
}

const openPicker = page => page.evaluate(() => { window.__picked = null; _openExercisePicker(currentUser.id, ex => { window.__picked = ex }) })
const closePicker = page => page.evaluate(() => _closeExercisePicker())
const loaded = page => page.waitForFunction(() => _exercisePickerState?.loaded === true, null, { timeout: 60000 })

test('a second open of the picker reads nothing - the library is kept', async ({ page }) => {
  const reads = countExerciseReads(page)
  await openPicker(page); await loaded(page)
  const first = reads.n
  expect(first, 'the first open must read the library').toBeGreaterThan(0)
  await closePicker(page)
  await openPicker(page); await loaded(page)
  await expect(page.locator('#exp-results .loading-state')).toHaveCount(0)
  expect(reads.n - first, 'the second open re-read the library').toBe(0)
})

test('an exercise created from the picker is listed on the next open, with no re-read', async ({ page }) => {
  const name = `${TAG} Made here`
  await openPicker(page); await loaded(page)
  await page.locator('#exp-search').fill(name)
  await page.getByText('Create new exercise').click()
  await page.waitForFunction(() => window.__picked?.id, null, { timeout: 30000 })
  const reads = countExerciseReads(page)
  await openPicker(page); await loaded(page)
  await page.locator('#exp-search').fill(name)
  await expect(page.locator('#exp-results').getByText(name, { exact: true })).toBeVisible()
  expect(reads.n, 'reopening after a create re-read the library').toBe(0)
})

test('a library write elsewhere drops the kept copy: the next open reads again and shows the new row', async ({ page }) => {
  const name = `${TAG} Auto made`
  await openPicker(page); await loaded(page); await closePicker(page)
  // Auto-create on save is one of the library's writers (the others: the Library page's add / edit / archive / delete, the seed).
  const id = await page.evaluate(n => _resolveExerciseIdForSave(n, currentUser.id), name)
  expect(id).toBeTruthy()
  const reads = countExerciseReads(page)
  await openPicker(page); await loaded(page)
  expect(reads.n, 'the kept copy survived a library write - the new row would be missing').toBeGreaterThan(0)
  await page.locator('#exp-search').fill(name)
  await expect(page.locator('#exp-results').getByText(name, { exact: true })).toBeVisible()
})

test('coach and solo never share the kept copy: switching to the solo view reads the solo library', async ({ page }) => {
  await openPicker(page); await loaded(page); await closePicker(page)
  const reads = countExerciseReads(page)
  const role = await page.evaluate(() => { const r = currentProfile.role; currentProfile.role = 'solo'; return r })
  try {
    await openPicker(page); await loaded(page)
    expect(reads.n, 'the solo view was served the coach library from the kept copy').toBeGreaterThan(0)
  } finally {
    await page.evaluate(r => { _closeExercisePicker(); currentProfile.role = r }, role)
  }
})

test('an exercise created while the first read is still loading is not lost when that read lands', async ({ page }) => {
  const name = `${TAG} Mid read`
  // Hold the picker's library read (the only exercises read that selects muscle_group) until the create has landed.
  let release; const gate = new Promise(r => { release = r })
  const pickerRead = /\/rest\/v1\/exercises\?.*muscle_group/
  // The ANSWER is held, not the request: the server must answer from before the create, as a slow real read would.
  await page.route(pickerRead, async route => { const res = await route.fetch(); await gate; await route.fulfill({ response: res }) })
  await openPicker(page)
  const id = await page.evaluate(n => _resolveExerciseIdForSave(n, currentUser.id), name)
  expect(id).toBeTruthy()
  expect(await page.evaluate(() => _exercisePickerState?.loaded === true), 'the read finished before the create - this test proves nothing').toBe(false)
  release(); await loaded(page); await closePicker(page); await page.unroute(pickerRead)
  await openPicker(page); await loaded(page)
  await page.locator('#exp-search').fill(name)
  await expect(page.locator('#exp-results').getByText(name, { exact: true }), 'the in-flight read overwrote the library with a list that lacks the new exercise').toBeVisible()
})
