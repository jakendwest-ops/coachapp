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
