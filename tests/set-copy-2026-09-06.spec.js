// Building four identical sets used to cost TWO taps per set.
//
// The set editor had a "+ Add set" button at the bottom AND a "Copy set N ↑" button on every row
// after the first. So repeating a set meant: tap "+ Add set" to get a blank row, then tap
// "Copy set N ↑" on that row to fill it. Jake, 2026-09-06: "at the moment you have to click add new
// set and THEN click copy set n... this eliminates at least 1 click for the user."
//
// Now there are two buttons at the bottom and none on the rows: "Copy previous set" adds a filled
// row, "+ Add new set" adds a blank one. One tap either way.
//
// These drive the editor through the DOM rather than through the set objects, because the whole
// point is what the person tapping actually gets — and because the set-object keys differ per metric
// type, so asserting on them would test the wrong layer.

const { test, expect } = require('@playwright/test')
const { loginAsPT } = require('./helpers')

// The editor needs three hosts to render into; renderTemplateSets fills the third.
const MOUNT = `
  const mk = (id, t = 'input') => {
    let e = document.getElementById(id)
    if (!e) { e = document.createElement(t); e.id = id; document.body.appendChild(e) }
    return e
  }
  mk('att-type', 'select'); mk('att-sets-container', 'div'); mk('att-metric-pills', 'div')
`

test.describe('Set editor: one tap to repeat a set (2026-09-06)', () => {
  test('the per-row "Copy set N" button is gone, and so is the function behind it', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(`(() => {
      ${MOUNT}
      window._templateSets = [{ effortType: 'rpe' }, { effortType: 'rpe' }, { effortType: 'rpe' }]
      renderTemplateSets('att-sets-container', 'weight_reps')
      const html = document.getElementById('att-sets-container').innerHTML
      return {
        perRowCopy: /Copy set \\d/.test(html),
        fnGone: typeof copyPrevTemplateSet === 'undefined'
      }
    })()`)
    expect(r.perRowCopy, 'with 3 sets there were 2 per-row copy buttons; they are replaced by one at the bottom').toBe(false)
    expect(r.fnGone, 'copyPrevTemplateSet had exactly one caller (that button) — dead code once it goes').toBe(true)
  })

  test('the two add-set buttons read as buttons, not text links (2026-09-08)', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(`(() => {
      ${MOUNT}
      window._templateSets = [{ effortType: 'rpe' }]
      renderTemplateSets('att-sets-container', 'weight_reps')
      const btns = [...document.getElementById('att-sets-container').querySelectorAll('button')]
        .filter(b => /Copy previous set|Add new set/.test(b.textContent))
      return btns.map(b => {
        const cs = getComputedStyle(b)
        return { borderStyle: cs.borderTopStyle, borderWidth: cs.borderTopWidth }
      })
    })()`)
    expect(r.length, 'both bottom buttons render').toBe(2)
    for (const b of r) {
      expect(b.borderStyle, 'a real outline button, not border:none like the old text link').not.toBe('none')
      expect(parseFloat(b.borderWidth)).toBeGreaterThan(0)
    }
  })

  test('"Copy previous set" adds a row already carrying the previous row\'s numbers', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(`(() => {
      ${MOUNT}
      window._templateSets = [{ effortType: 'rpe' }]
      renderTemplateSets('att-sets-container', 'weight_reps')

      // Type into set 1 the way a person would, so the copy is proved off real input values.
      const w0 = document.getElementById('ts-weight-0')
      const r0 = document.getElementById('ts-rmin-0')
      if (!w0 || !r0) return { built: false }
      w0.value = '60'; r0.value = '8'

      const btns = [...document.getElementById('att-sets-container').querySelectorAll('button')]
      const copy = btns.find(b => /Copy previous/i.test(b.textContent))
      if (!copy) return { built: true, copyButton: false }
      copy.click()

      return {
        built: true,
        copyButton: true,
        rows: window._templateSets.length,
        weight1: document.getElementById('ts-weight-1')?.value ?? null,
        reps1: document.getElementById('ts-rmin-1')?.value ?? null,
        // set 1 must survive the round trip — flushTemplateSets rewrites the array before pushing
        weight0: document.getElementById('ts-weight-0')?.value ?? null
      }
    })()`)
    expect(r.built, 'the editor must render its weight/reps inputs or this test asserts nothing').toBe(true)
    expect(r.copyButton, 'a "Copy previous set" button must exist at the bottom of the editor').toBe(true)
    expect(r.rows, 'copying adds one row').toBe(2)
    expect(r.weight1, 'the new row carries the previous row\'s weight').toBe('60')
    expect(r.reps1, 'the new row carries the previous row\'s reps').toBe('8')
    expect(r.weight0, 'and the row it copied from is untouched').toBe('60')
  })

  test('"Add new set" still adds a BLANK row, for a set that is genuinely different', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(`(() => {
      ${MOUNT}
      window._templateSets = [{ effortType: 'rpe' }]
      renderTemplateSets('att-sets-container', 'weight_reps')
      const w0 = document.getElementById('ts-weight-0')
      if (!w0) return { built: false }
      w0.value = '60'

      const btns = [...document.getElementById('att-sets-container').querySelectorAll('button')]
      const add = btns.find(b => /Add new set/i.test(b.textContent))
      if (!add) return { built: true, addButton: false }
      add.click()

      return {
        built: true,
        addButton: true,
        rows: window._templateSets.length,
        weight1: document.getElementById('ts-weight-1')?.value ?? null
      }
    })()`)
    expect(r.built, 'the editor must render or this test asserts nothing').toBe(true)
    expect(r.addButton, 'an "+ Add new set" button must remain — a drop set should start empty').toBe(true)
    expect(r.rows, 'adding adds one row').toBe(2)
    expect(r.weight1, 'a NEW set must be blank, not inherited').toBe('')
  })

  // Two buttons where there was one, inside a modal, on a phone. This repo has shipped exactly this
  // kind of break before — the mobile calendar grid blew out on a long workout name (ledger-fixes
  // 2026-08-02) — so the layout is asserted rather than eyeballed once and forgotten.
  test.describe('at a real phone width', () => {
    test.use({ viewport: { width: 390, height: 844 } })

    test('both buttons fit the editor without pushing it sideways', async ({ page }) => {
      await loginAsPT(page)
      const r = await page.evaluate(`(() => {
        ${MOUNT}
        // The real modal is padded inside a 390px screen; 340 is a fair inner width.
        const host = document.getElementById('att-sets-container')
        host.style.width = '340px'
        window._templateSets = [{ effortType: 'rpe' }]
        renderTemplateSets('att-sets-container', 'weight_reps')

        const btns = [...host.querySelectorAll('button')]
          .filter(b => /Copy previous|Add new set/i.test(b.textContent))
        if (btns.length !== 2) return { found: btns.length }
        const row = btns[0].parentElement
        return {
          found: 2,
          overflows: row.scrollWidth > row.clientWidth + 1,
          // Both must be a real tap target, not a squeezed sliver.
          widths: btns.map(b => Math.round(b.getBoundingClientRect().width)),
          heights: btns.map(b => Math.round(b.getBoundingClientRect().height))
        }
      })()`)
      expect(r.found, 'both buttons must render').toBe(2)
      expect(r.overflows, 'the button row must not scroll sideways at 390px').toBe(false)
      for (const w of r.widths) expect(w, 'each button needs a usable tap width').toBeGreaterThan(80)
      for (const h of r.heights) expect(h, 'and a usable tap height').toBeGreaterThan(16)
    })
  })
})
