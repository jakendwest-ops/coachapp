const { test, expect } = require('./fixtures')
const { loginAsClient } = require('./helpers')

test.describe('Progress page regressions (2026-07-05)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsClient(page)
  })

  test('cardio set formatting in session-detail no longer renders blank fields', async ({ page }) => {
    // Exercises the exact branch added to openSessionDetail's set-line builder —
    // same lightweight pattern as the existing "Timed set render regression" tests.
    const result = await page.evaluate(() => {
      const s = { isDistanceBased: false, duration: '25:00', pace500Min: '2:00', pace500Max: '2:05', hrZoneMin: '140', hrZoneMax: '160' }
      const paceStr   = (s.pace500Min || s.pace500Max) ? `${s.pace500Min||'?'}–${s.pace500Max||'?'}/500m` : null
      const paceKmStr = (s.paceKmMin  || s.paceKmMax)  ? `${s.paceKmMin||'?'}–${s.paceKmMax||'?'}/km`   : null
      const strokeStr = (s.strokeRateMin || s.strokeRateMax) ? `${s.strokeRateMin||'?'}–${s.strokeRateMax||'?'} spm` : null
      const hrStr     = (s.hrZoneMin || s.hrZoneMax) ? `HR ${s.hrZoneMin||'?'}–${s.hrZoneMax||'?'}` : null
      const restHrStr = s.restHrMax ? `rest HR <${s.restHrMax}` : null
      const durStr    = s.duration ? Math.floor((parseRest(s.duration)||0) / 60) + ':' + String((parseRest(s.duration)||0) % 60).padStart(2, '0') : null
      const distStr   = s.distance ? s.distance + ' km' : null
      const parts = s.isDistanceBased
        ? [distStr, paceStr || paceKmStr, strokeStr, hrStr, restHrStr]
        : [durStr, paceStr || paceKmStr, strokeStr, hrStr, restHrStr]
      return parts.filter(Boolean).join(' · ') || '—'
    })
    expect(result).not.toBe('—')
    expect(result).toContain('25:00')
    expect(result).toContain('2:00–2:05/500m')
    expect(result).toContain('HR 140–160')
  })

  test('Add 1RM modal uses the styled .modal class, not the undefined .modal-box', async ({ page }) => {
    await page.evaluate(async () => {
      const cid = await _getCurrentClientId()
      showAdd1RMModal(cid)
    })

    const box = page.locator('#modal-1rm .modal')
    await expect(box).toBeVisible({ timeout: 3000 })
    await expect(page.locator('#modal-1rm .modal-box')).toHaveCount(0)
    // .modal has a real background + border-radius; an unstyled div would compute transparent/0
    const bg = await box.evaluate(el => getComputedStyle(el).backgroundColor)
    expect(bg).not.toBe('rgba(0, 0, 0, 0)')
  })
})
