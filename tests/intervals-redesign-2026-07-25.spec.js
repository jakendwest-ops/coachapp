const { test, expect } = require('@playwright/test')
const { loginAsPT } = require('./helpers')

// The block model's whole value is that it's a pure function: block in, ordered phases out.
// No DOM, no Supabase, no timers — so these run fast and pin the arithmetic exactly.
test.describe('Interval block expansion (2026-07-25)', () => {
  test('reproduces the reference app\'s 27:00 worked example exactly', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      const phases = _expandIntervalBlock({
        countdownSecs: 0, warmupSecs: 120, workSecs: 240, restSecs: 120,
        sets: 4, recoverySecs: 60, cycles: 1, cooldownSecs: 0
      })
      return { phases, total: _intervalTotalSecs(phases) }
    })
    // warmup 2:00 + 4 x (4:00 work + 2:00 rest) + 1:00 recovery = 27:00
    expect(r.total.total).toBe(1620)
    expect(r.total.hasUnknown).toBe(false)
    expect(r.phases[0].phase).toBe('warmup')
    expect(r.phases.filter(p => p.phase === 'work').length).toBe(4)
    expect(r.phases.filter(p => p.phase === 'rest').length).toBe(4)
    expect(r.phases.filter(p => p.phase === 'recovery').length).toBe(1)
  })

  test('omits zero-valued phases rather than emitting 0-second ones', async ({ page }) => {
    await loginAsPT(page)
    const kinds = await page.evaluate(() => _expandIntervalBlock({
      countdownSecs: 0, warmupSecs: 0, workSecs: 30, restSecs: 0,
      sets: 3, recoverySecs: 0, cycles: 1, cooldownSecs: 0
    }).map(p => p.phase))
    expect(kinds).toEqual(['work', 'work', 'work'])
  })

  test('nests sets inside cycles and tags each work round', async ({ page }) => {
    await loginAsPT(page)
    const work = await page.evaluate(() => _expandIntervalBlock({
      workSecs: 30, restSecs: 15, sets: 2, cycles: 3, recoverySecs: 60
    }).filter(p => p.phase === 'work').map(p => `${p.cycle}.${p.set}`))
    expect(work).toEqual(['1.1', '1.2', '2.1', '2.2', '3.1', '3.2'])
  })

  test('a distance block yields work rounds with no duration, and an honest partial total', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      const phases = _expandIntervalBlock({
        isDistanceBased: true, workDistanceM: 400, restSecs: 90, sets: 8, cycles: 1
      })
      return { first: phases.find(p => p.phase === 'work'), total: _intervalTotalSecs(phases) }
    })
    expect(r.first.secs).toBeNull()
    expect(r.first.distanceM).toBe(400)
    expect(r.total.hasUnknown).toBe(true)   // work time is unknowable without a sensor
    expect(r.total.total).toBe(720)          // 8 x 90s rest only
  })

  test('guards against a missing/zero sets or cycles count producing an empty block', async ({ page }) => {
    await loginAsPT(page)
    const n = await page.evaluate(() => _expandIntervalBlock({ workSecs: 30, sets: 0, cycles: 0 }).length)
    expect(n).toBe(1)   // clamped to at least 1 set x 1 cycle
  })
})
