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
// 2026-09-11 walkthrough — a per-row control came BACK, for a different job. Jake had edited Set 1
// of an exercise that already had 3-4 sets (typed earlier, or from "Copy previous set") and had no
// fast way to push that edit into the sets below it — only delete-and-recopy from the bottom, one
// tap per set removed. The new `copyPrevTsSet` button (Set 2+, a small "↑" beside the "Set N" label,
// not a labelled pill in the AMRAP/BW/× row) syncs ONE existing set to match the one above it. It
// does not reopen the "two clicks to add a set" problem this file's other tests guard — those bottom
// buttons, and the "+ Add new set" / "Copy previous set" split, are untouched.
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
  test('the OLD per-row "Copy set N" pill (in the AMRAP/BW/x row) is gone, and so is the function behind it', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(`(() => {
      ${MOUNT}
      window._templateSets = [{ effortType: 'rpe' }, { effortType: 'rpe' }, { effortType: 'rpe' }]
      renderTemplateSets('att-sets-container', 'weight_reps')
      return {
        // The 2026-09-06 pill read "Copy set N" as its own VISIBLE button label. Today's
        // replacement (copyPrevTsSet, tested below) is an unlabelled "↑" icon beside "Set N" —
        // its aria-label/title carry "Copy set N" for a screen reader/tooltip, which is why this
        // checks rendered textContent (what a person tapping actually sees), not raw innerHTML.
        oldPillText: [...document.querySelectorAll('#att-sets-container button')].some(b => /Copy set \\d/.test(b.textContent)),
        fnGone: typeof copyPrevTemplateSet === 'undefined'
      }
    })()`)
    expect(r.oldPillText, 'the 2026-09-06 labelled pill must not have come back').toBe(false)
    expect(r.fnGone, 'copyPrevTemplateSet had exactly one caller (that pill) — dead code once it goes').toBe(true)
  })

  test('a per-row "copy set above" control exists on Set 2+ (not Set 1) and syncs that set to the one above it (2026-09-11)', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(`(() => {
      ${MOUNT}
      window._templateSets = [{ effortType: 'rpe' }, { effortType: 'rpe' }]
      renderTemplateSets('att-sets-container', 'weight_reps')

      const w0 = document.getElementById('ts-weight-0')
      const r0 = document.getElementById('ts-rmin-0')
      if (!w0 || !r0) return { built: false }
      w0.value = '60'; r0.value = '8'

      const set1HasNoCopyBtn = !document.querySelector('[onclick^="copyPrevTsSet(0,"]')
      const copyBtn = document.querySelector('[onclick^="copyPrevTsSet(1,"]')
      if (!copyBtn) return { built: true, set1HasNoCopyBtn, copyBtn: false }
      copyBtn.click()

      return {
        built: true,
        set1HasNoCopyBtn,
        copyBtn: true,
        weight1: document.getElementById('ts-weight-1')?.value ?? null,
        reps1: document.getElementById('ts-rmin-1')?.value ?? null,
        // the source row must survive the round trip
        weight0: document.getElementById('ts-weight-0')?.value ?? null
      }
    })()`)
    expect(r.built, 'the editor must render its weight/reps inputs or this test asserts nothing').toBe(true)
    expect(r.set1HasNoCopyBtn, 'Set 1 has nothing above it, so it gets no copy button').toBe(true)
    expect(r.copyBtn, 'Set 2 must have a "copy set above" button').toBe(true)
    expect(r.weight1, 'Set 2 now matches Set 1\'s weight').toBe('60')
    expect(r.reps1, 'Set 2 now matches Set 1\'s reps').toBe('8')
    expect(r.weight0, 'and the row it copied from is untouched').toBe('60')
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
