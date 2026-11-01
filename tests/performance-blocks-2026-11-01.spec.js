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
  { name: 'Squat', metricType: 'weight_reps', sessions: [ses('2026-08-26', 120), ses('2026-10-21', 110)] },   // got weaker: reads as a drop
  { name: 'Split squat', metricType: 'unilateral', sessions: [ses('2026-08-26', 40), ses('2026-10-21', 45)] },   // no estimated 1RM: no row
]
// Dates relative to today, for the test with no plan run: its windows slide with the real date.
const ago = n => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
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

  test('a lift that got weaker reads as a drop with a minus; a lift with no estimated 1RM has no row', async ({ page }) => {
    await showBlocks(page)
    const text = await row(page, 'Squat').innerText()
    expect(text).toMatch(/−\d+(\.\d)? kg/)
    expect(text).toMatch(/−\d+(\.\d)?%/)
    expect(text).not.toContain('+')
    await expect(row(page, 'Split squat')).toHaveCount(0)
  })

  test('the heading says which dates are compared, and that it is sessions logged between them, not sessions "from" a plan', async ({ page }) => {
    await showBlocks(page)
    await expect(page.locator('#pbk-host [data-blk-summary]')).toContainText('Sessions logged between')
    await expect(page.locator('#pbk-host [data-blk-summary]')).toContainText('Block B')
    await expect(page.locator('#pbk-host [data-blk-summary]')).toContainText('Block A')
  })

  test('with no plan run it compares the last 6 weeks with the 6 before, and does not say there is nothing to compare', async ({ page }) => {
    const recent = [{ name: 'Bench', metricType: 'weight_reps', sessions: [ses(ago(60), 100), ses(ago(10), 110)] }]
    await showBlocks(page, { runs: [], exercises: recent })
    await expect(page.locator('#pbk-host [data-blk-summary]')).toContainText('6 weeks')
    await expect(page.locator('#pbk-host')).not.toContainText('No training plan with a start date')
    await expect(page.locator('#pbk-host [data-blk-row]').first()).toBeVisible()
  })

  test('tapping a row opens that lift in the overlay below, with its chart', async ({ page }) => {
    await showBlocks(page)
    await row(page, 'Bench').click()
    await page.locator('#pbk-host #blk-result button', { hasText: 'Volume' }).click()   // a measure chip tapped first...
    await row(page, 'Bench').click()                                                  // ...must not leave the overlay on it after a row tap
    await expect(page.locator('#pbk-host #blk-ex')).toHaveValue('Bench')
    await expect(page.locator('#pbk-host #blk-chart')).toBeVisible()
    // The table is in estimated 1RM, so the overlay under it opens on the same measure: two views of one lift must not disagree.
    await expect(page.locator('#pbk-host #blk-result button', { hasText: 'Est 1RM' })).toHaveCSS('color', 'rgb(255, 255, 255)')
    await row(page, 'Deadlift').click()
    await expect(page.locator('#pbk-host #blk-ex')).toHaveValue('Deadlift')
  })

  test('tapping a row after the pickers were changed puts the pickers back on this block vs last, so the lift is in the dropdown', async ({ page }) => {
    await showBlocks(page)
    await page.selectOption('#pbk-host #blk-b', '')            // comparison switched off: Deadlift (last block only) is not in the list now
    await row(page, 'Deadlift').click()
    await expect(page.locator('#pbk-host #blk-ex')).toHaveValue('Deadlift')
    await expect(page.locator('#pbk-host #blk-a')).toHaveValue('live:2')
    await expect(page.locator('#pbk-host #blk-b')).toHaveValue('past:1')
    await expect(page.locator('#pbk-host #blk-result')).toContainText('Deadlift')
  })

  test('two plans running at once: the overlay counts only the days the table counts, so no session is in both blocks', async ({ page }) => {
    const both = [
      { key: 'live:b', progKey: 'pb', name: 'Block B', start: '2026-10-05', end: '2026-11-01', weeks: 4, open: true },
      { key: 'live:a', progKey: 'pa', name: 'Block A', start: '2026-08-03', end: '2026-11-01', weeks: 12, open: true },
    ]
    await showBlocks(page, { runs: both })
    await row(page, 'Bench').click()
    const text = await page.locator('#pbk-host #blk-result').innerText()
    // Bench: 12 and 26 Aug are in A before B began; 7 and 21 Oct are in B. A's window ends the day before B starts.
    expect(text, 'last block holds its own two sessions, not B\'s as well').not.toContain('4 sessions')
    expect((text.match(/2 sessions/g) || []).length, 'two blocks, two sessions each').toBe(2)
  })

  test('the two block pickers are still there to choose other blocks', async ({ page }) => {
    await showBlocks(page)
    await expect(page.locator('#pbk-host #blk-a')).toBeVisible()
    await expect(page.locator('#pbk-host #blk-b')).toBeVisible()
  })

  // The page drawn with the two reads replaced, for the cases that have no summary to wait for.
  const drawBare = (page, runs, exercises) => page.evaluate(async ({ me, runs, exercises }) => {
    window._getCurrentClientId = async () => me
    window._loadProgramBlocks = async () => runs
    window._buildExerciseSeries = async () => exercises
    document.getElementById('pbk-host')?.remove()
    const el = document.createElement('div'); el.id = 'pbk-host'; document.body.appendChild(el)
    await renderProgressPerProgram(me, el)
  }, { me: ME, runs, exercises })

  test('a failed block read still says it could not load', async ({ page }) => {
    await drawBare(page, null, [])
    await expect(page.locator('#pbk-host')).toContainText("Couldn't load your training plans")
  })

  test('an account with no sessions says so, rather than an empty table', async ({ page }) => {
    await drawBare(page, [], [])
    await expect(page.locator('#pbk-host')).toContainText('No sessions logged yet')
    await expect(page.locator('#pbk-host [data-blk-summary]')).toHaveCount(0)
  })

  for (const width of [390, 320]) {
    test(`no sideways scroll at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 })
      await showBlocks(page)
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
    })
  }
})
