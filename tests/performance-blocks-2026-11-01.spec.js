const { test, expect } = require('./fixtures')
const { loginAsClient } = require('./helpers')

// ─── Performance > Blocks: this block against last block, per lift (Jake, 2026-11-01) ─────────────────────────────────────────────
// The page opens on a table: every lift trained in both blocks with its best estimated 1RM then and now and the change; a lift in only
// one block says so instead of showing a change. The old two-block overlay and pickers stay underneath, and tapping a row opens that lift in it.
// With no plan run the blocks are the last 6 weeks against the 6 before. Read-only: the two reads are replaced by fixtures in the page.

const ME = 'pb-me'
const ses = (date, kg, reps = 5) => ({ date, sets: [{ set_number: 1, weight_kg: kg, reps_achieved: reps }] })
const EXERCISES = [
  { name: 'Bench', metricType: 'weight_reps', sessions: [ses('2026-08-12', 90), ses('2026-08-26', 100), ses('2026-10-07', 105), ses('2026-10-21', 110)] },
  { name: 'Deadlift', metricType: 'weight_reps', sessions: [ses('2026-08-20', 150), ses('2026-09-03', 160)] },
  { name: 'Row', metricType: 'weight_reps', sessions: [ses('2026-10-14', 80)] },
]
const RUNS = [
  { key: 'live:2', progKey: 'p2', name: 'Block B', start: '2026-10-05', end: '2026-11-01', weeks: 4, open: true },
  { key: 'past:1', progKey: 'p1', name: 'Block A', start: '2026-08-10', end: '2026-10-04', weeks: 8, open: false },
]

async function showBlocks(page, { runs = RUNS, exercises = EXERCISES } = {}) {
  await page.evaluate(async ({ me, runs, exercises }) => {
    window._getCurrentClientId = async () => me
    window._loadProgramBlocks = async () => runs
    window._buildExerciseSeries = async () => exercises
    window._blockState = undefined
    document.getElementById('pbk-host')?.remove()
    const el = document.createElement('div'); el.id = 'pbk-host'; el.className = 'main-content'; document.body.appendChild(el)
    await renderProgressPerProgram(me, el)
  }, { me: ME, runs, exercises })
  await expect(page.locator('#pbk-host [data-blk-summary]')).toBeVisible()
}
const row = (page, name) => page.locator(`#pbk-host [data-blk-row="${name}"]`)

test.describe('Performance > Blocks: this block vs last block (2026-11-01)', () => {
  test.beforeEach(async ({ page }) => { await loginAsClient(page) })

  test('a lift trained in both blocks shows then, now and the change, with the percentage', async ({ page }) => {
    await showBlocks(page)
    const expected = await page.evaluate(() => {
      const e = p => _pbE1rmPoints([{ date: '2026-01-01', sets: [{ weight_kg: p, reps_achieved: 5 }] }])[0].kg
      return { last: e(100), now: e(110) }
    })
    const text = await row(page, 'Bench').innerText()
    expect(text).toContain('Bench')
    expect(text).toContain(String(Math.round(expected.last)))
    expect(text).toContain(String(Math.round(expected.now)))
    expect(text).toMatch(/\+\d+(\.\d)? kg/)
    expect(text).toMatch(/\+\d+(\.\d)?%/)
  })

  test('a lift in one block only says so; it never shows a change', async ({ page }) => {
    await showBlocks(page)
    await expect(row(page, 'Deadlift')).toContainText('not trained this block')
    await expect(row(page, 'Row')).toContainText('new this block')
    expect(await row(page, 'Deadlift').innerText()).not.toMatch(/[+−]\d/)
    expect(await row(page, 'Row').innerText()).not.toMatch(/[+−]\d/)
  })

  test('the heading says which dates are compared, and that it is sessions logged between them, not sessions "from" a plan', async ({ page }) => {
    await showBlocks(page)
    await expect(page.locator('#pbk-host [data-blk-summary]')).toContainText('Sessions logged between')
    await expect(page.locator('#pbk-host [data-blk-summary]')).toContainText('Block B')
    await expect(page.locator('#pbk-host [data-blk-summary]')).toContainText('Block A')
  })

  test('with no plan run it compares the last 6 weeks with the 6 before, and does not say there is nothing to compare', async ({ page }) => {
    await showBlocks(page, { runs: [] })
    await expect(page.locator('#pbk-host [data-blk-summary]')).toContainText('6 weeks')
    await expect(page.locator('#pbk-host')).not.toContainText('No training plan with a start date')
    await expect(page.locator('#pbk-host [data-blk-row]').first()).toBeVisible()
  })

  test('tapping a row opens that lift in the overlay below, with its chart', async ({ page }) => {
    await showBlocks(page)
    await row(page, 'Bench').click()
    await expect(page.locator('#pbk-host #blk-ex')).toHaveValue('Bench')
    await expect(page.locator('#pbk-host #blk-chart')).toBeVisible()
    await row(page, 'Deadlift').click()
    await expect(page.locator('#pbk-host #blk-ex')).toHaveValue('Deadlift')
  })

  test('the two block pickers are still there to choose other blocks', async ({ page }) => {
    await showBlocks(page)
    await expect(page.locator('#pbk-host #blk-a')).toBeVisible()
    await expect(page.locator('#pbk-host #blk-b')).toBeVisible()
  })

  test('a failed block read still says it could not load; an account with no sessions says so', async ({ page }) => {
    await page.evaluate(async (me) => {
      window._getCurrentClientId = async () => me
      window._loadProgramBlocks = async () => null
      window._buildExerciseSeries = async () => []
      document.getElementById('pbk-host')?.remove()
      const el = document.createElement('div'); el.id = 'pbk-host'; document.body.appendChild(el)
      await renderProgressPerProgram(me, el)
    }, ME)
    await expect(page.locator('#pbk-host')).toContainText("Couldn't load your training plans")
    await showBlocks(page, { runs: [], exercises: [] }).catch(() => {})
    await expect(page.locator('#pbk-host')).toContainText('No sessions logged yet')
  })

  for (const width of [390, 320]) {
    test(`no sideways scroll at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 })
      await showBlocks(page)
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
    })
  }
})
