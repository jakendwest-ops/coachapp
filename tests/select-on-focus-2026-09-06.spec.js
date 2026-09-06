// Tapping a prefilled weight should let you overtype it, not make you delete it first.
//
// Measured 2026-09-06: 143 numeric inputs across the app (58 in the builder, 35 in the runner) and
// ZERO onfocus handlers anywhere. So editing a set that already says 60 meant tapping in, getting a
// cursor, and backspacing — one-handed, mid-session, with a bar loaded.
//
// One document-level listener rather than 143 attributes, next to the wheel guard in app-core.js that
// already does exactly this shape of job for number inputs. The point is not tidiness: the
// alternative is a rule every future input has to remember, and this project has measured that
// written rules do not hold — only mechanisms do.
//
// THE ASSERTION IS BEHAVIOURAL ON PURPOSE. `type="number"` does not expose selectionStart in Chrome
// (reading it returns null), so a test asserting the selection range would pass or fail for reasons
// unrelated to what the user experiences. Typing a character and checking the field REPLACED rather
// than appended is the thing being promised.

const { test, expect } = require('@playwright/test')
const { loginAsPT } = require('./helpers')

test.describe('Numeric inputs select on focus (2026-09-06)', () => {
  test('typing into a focused, prefilled number field REPLACES the value', async ({ page }) => {
    await loginAsPT(page)

    const host = '#sof-probe'
    await page.evaluate(() => {
      const d = document.createElement('div')
      d.id = 'sof-probe'
      // Pinned on top: appended to the end of body it sat under the app shell, and page.click timed
      // out waiting for an element nothing could reach — a red for the wrong reason, which proves
      // nothing. The listener under test is document-level, so where the input sits is irrelevant.
      // Stacked, not a row. As a fixed-position flex ROW the four inputs overflowed the viewport and
      // the third was unreachable — Playwright reported "element is outside of the viewport" and a
      // fixed element cannot be scrolled into view. Narrow and vertical keeps all four clickable.
      d.style.cssText = 'position:fixed;inset:0 auto auto 0;z-index:99999;background:#fff;padding:10px;display:flex;flex-direction:column;gap:6px;width:180px'
      d.innerHTML = `
        <input id="sof-number"   type="number" value="60">
        <input id="sof-inputmode" type="text" inputmode="decimal" value="7.5">
        <input id="sof-text"     type="text" value="Bench Press">
        <input id="sof-search"   type="search" value="press">`
      document.body.appendChild(d)
    })

    // A real click + keypress, so the browser's own focus and input handling is in play — not a
    // synthetic .value assignment, which would bypass the very behaviour under test.
    await page.click('#sof-number')
    await page.keyboard.type('80')
    const numberVal = await page.inputValue('#sof-number')

    await page.click('#sof-inputmode')
    await page.keyboard.type('9')
    const inputmodeVal = await page.inputValue('#sof-inputmode')

    // A free-text field must NOT be hijacked — you append to an exercise name, you do not replace it.
    await page.click('#sof-text')
    await page.keyboard.type('!')
    const textVal = await page.inputValue('#sof-text')

    await page.click('#sof-search')
    await page.keyboard.type('!')
    const searchVal = await page.inputValue('#sof-search')

    await page.evaluate(sel => document.querySelector(sel)?.remove(), host)

    expect(numberVal, 'a type=number field must be replaced, not appended to').toBe('80')
    expect(inputmodeVal, 'an inputmode=decimal field must be replaced too — the builder uses these').toBe('9')
    // NOT toContain: a click lands the cursor wherever you clicked, so typing into the middle gives
    // "Bench Pre!ss" — correct behaviour that a contains-check reads as failure. The property being
    // asserted is that the field was not REPLACED, which is what select-all would have done.
    expect(textVal, 'a plain text field must not be select-all-replaced — you append to a name').not.toBe('!')
    expect(textVal.length, 'the original text must survive').toBeGreaterThan(5)
    expect(searchVal, 'a search box must never select-all — you refine a search, you do not retype it').not.toBe('!')
    expect(searchVal.length, 'the original search term must survive').toBeGreaterThan(3)
  })

  test('an EMPTY numeric field is untouched, and focus still lands', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(async () => {
      const el = document.createElement('input')
      el.id = 'sof-empty'
      el.type = 'number'
      document.body.appendChild(el)
      el.focus()
      const focused = document.activeElement === el
      el.remove()
      return { focused }
    })
    expect(r.focused, 'selecting nothing must not cost the field its focus').toBe(true)
  })
})
