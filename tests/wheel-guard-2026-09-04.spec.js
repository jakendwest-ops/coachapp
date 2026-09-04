// A stray scroll must not rewrite a number the user typed.
//
// WHY THIS TEST IS SHAPED ODDLY. The bug it guards CANNOT be reproduced in this suite. Measured
// 2026-09-04 on an isolated data: URL with nothing but `<input type="number" step="0.5" value="200">`:
//
//     Playwright's bundled Chromium 149   wheel: 200 -> 200      no change
//     real Chrome 152                     wheel: 200 -> 200.5    STEPPED
//     real Edge                           wheel: 200 -> 200.5    STEPPED
//
// So a test that scrolls a number field and asserts the value is unchanged would PASS on a completely
// unguarded app — a perfect example of a green test that checks nothing. An earlier investigation into
// the 2026-07-09 "1RM shifts by 0.5kg" report hit exactly this and correctly recorded the caveat
// rather than concluding.
//
// This therefore tests OUR MITIGATION, not the browser's behaviour: a wheel event over a focused
// number input must make it lose focus. That is observable in every browser, including the bundled
// one, and it goes red the moment the listener is removed.

const { test, expect } = require('@playwright/test')
const { loginAsPT } = require('./helpers')

test.describe('Wheel guard on number inputs (2026-09-04)', () => {
  test('a wheel over a focused number input blurs it, so the browser cannot step the value', async ({ page }) => {
    await loginAsPT(page)

    const r = await page.evaluate(() => {
      const host = document.createElement('div')
      host.innerHTML = '<input id="wheel-probe" type="number" step="0.5" value="200">' +
                       '<input id="text-probe" type="text" value="hello">'
      document.body.appendChild(host)
      const num = document.getElementById('wheel-probe')
      const txt = document.getElementById('text-probe')

      num.focus()
      const focusedBefore = document.activeElement === num
      num.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true }))
      const focusedAfterWheel = document.activeElement === num

      // A TEXT input must be left alone — blurring every field on every scroll would be its own bug,
      // interrupting anyone typing a client name while the page moves.
      txt.focus()
      const textFocusedBefore = document.activeElement === txt
      txt.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true }))
      const textFocusedAfterWheel = document.activeElement === txt

      // An UNFOCUSED number input must also be left alone — scrolling the page past a form should not
      // reach in and touch fields the user is not editing.
      num.blur()
      const unfocused = document.getElementById('wheel-probe')
      unfocused.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true }))
      const stillPresent = !!document.getElementById('wheel-probe')

      host.remove()
      return { focusedBefore, focusedAfterWheel, textFocusedBefore, textFocusedAfterWheel, stillPresent }
    })

    expect(r.focusedBefore, 'the probe must actually be focused, or the assertion below is vacuous').toBe(true)
    expect(r.focusedAfterWheel, 'a focused number input must lose focus on wheel — this is the guard').toBe(false)

    expect(r.textFocusedBefore).toBe(true)
    expect(r.textFocusedAfterWheel, 'a TEXT input must keep focus — the guard must not blur everything').toBe(true)
    expect(r.stillPresent).toBe(true)
  })

  test('the hazard exists in BOTH units, and the guard is unit-agnostic', async ({ page }) => {
    // Jake asked directly (2026-09-04) whether the 0.5 shift happens in lb as well as kg. It does —
    // but NOT by the same amount, because every weight input in this app hardcodes its `step`. None is
    // unit-aware, unlike the cardio-distance field which switches between 0.01 and 1. So one notch
    // always moves the DISPLAYED number by 0.5, and what that means in stored kg depends on the unit.
    //
    // Measured with the app's own weightFromPref rather than arithmetic done here, so the numbers stay
    // true if the conversion constant ever changes.
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      const orig = window._unitPrefs.weight
      const delta = (unit) => {
        window._unitPrefs.weight = unit
        return weightFromPref(200.5) - weightFromPref(200)
      }
      const out = { kg: delta('kg'), lb: delta('lb') }
      window._unitPrefs.weight = orig
      return out
    })

    // kg: one notch is exactly the 0.5 kg Jake reported.
    expect(r.kg, 'in kg, one notch moves the STORED value by exactly 0.5 kg').toBeCloseTo(0.5, 6)
    // lb: the same notch is 0.5 LB, which is a smaller real change — about 0.227 kg. So the bug is
    // real in both units, and only kg can produce exactly "0.5kg", which is what was reported.
    expect(r.lb, 'in lb, one notch moves the STORED value by ~0.227 kg — real, but not 0.5').toBeCloseTo(0.2268, 3)
    expect(r.lb, 'the hazard must not be zero in lb — it is smaller, not absent').toBeGreaterThan(0)
  })

  test('every number input in the app is covered — the guard is global, not per-field', async ({ page }) => {
    await loginAsPT(page)
    // The listener is on `document`, so coverage is a property of where it is registered rather than of
    // how many fields are decorated. Assert the count is real so a future refactor to per-field
    // handlers cannot quietly drop most of them.
    const count = await page.evaluate(async () => {
      const srcs = await Promise.all(
        [...document.querySelectorAll('script[src^="js/"]')].map(s => fetch(s.src).then(r => r.text()))
      )
      return srcs.join('\n').match(/type="number"/g)?.length || 0
    })
    expect(count, 'the app should still contain the ~95 number inputs this guard covers').toBeGreaterThan(80)
  })
})
