const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

// ─── Jake, 2026-10-13: "the UI in this section needs a rework" (the Body Weight log form on My Progress) ───────────────────────────────────────────────────────────
// docs/bugs/2026-10-13-progress-page-needs-a-ui-rework-starting-with-the-body-weight-section.md
//
// The weight form, the plan create/edit and phase forms and the personal-best form were written with class="form-label" and class="form-input". Neither class had a rule
// anywhere (the stylesheet defines .field-label and .field-input), so every one of those inputs was an unstyled browser box: labels butted against inputs of different
// widths. The two classes are now selector aliases of the field rules (one rule set, not a second family). These tests pin that: the form classes compute exactly like their
// field twins, for every element type the forms use, and the real weight form is styled.
//
// Nothing is written to the database.

const STYLES = ['borderTopWidth', 'borderTopStyle', 'borderTopLeftRadius', 'paddingTop', 'paddingLeft', 'backgroundColor', 'display', 'fontWeight', 'marginBottom']

async function soloView(page) {
  await loginAsPT(page)
  await page.evaluate(() => localStorage.setItem('_activeView', 'solo'))
  await page.goto('/')
  await expect.poll(() => page.evaluate(() => !!window._soloClientId), { timeout: 15000 }).toBe(true)
}

test.describe('The form-input and form-label classes are styled (2026-10-13)', () => {
  test('each computes exactly like its field twin, for the input, select, textarea and label the forms use', async ({ page }) => {
    await soloView(page)
    const r = await page.evaluate((STYLES) => {
      const host = document.createElement('div'); host.id = 'fc-host'; document.body.appendChild(host)
      host.innerHTML = `
        <label id="a-label" class="form-label">x</label><label id="b-label" class="field-label">x</label>
        <input id="a-in" class="form-input"><input id="b-in" class="field-input">
        <select id="a-sel" class="form-input"><option>x</option></select><select id="b-sel" class="field-input"><option>x</option></select>
        <textarea id="a-ta" class="form-input"></textarea><textarea id="b-ta" class="field-input"></textarea>`
      const read = id => { const cs = getComputedStyle(document.getElementById(id)); return Object.fromEntries(STYLES.map(k => [k, cs[k]])) }
      const out = {}
      for (const k of ['label', 'in', 'sel', 'ta']) out[k] = { form: read('a-' + k), field: read('b-' + k) }
      host.remove()
      return out
    }, STYLES)
    for (const k of ['label', 'in', 'sel', 'ta']) expect(r[k].form, `.form-* on a ${k} computes like .field-*`).toEqual(r[k].field)
    // and the shared rules really are a styled box, not the browser's (whose input has a 2px inset border, square corners and 1px 2px padding)
    expect(r.in.form.borderTopStyle).toBe('solid')
    expect(r.in.form.borderTopLeftRadius).toBe('8px')
    expect(r.in.form.paddingTop).toBe('10px')
    expect(r.in.form.paddingLeft).toBe('12px')
    expect(r.label.form.display).toBe('block')
  })

  test('the real Body Weight log form is styled: a bordered, padded input with its label above it', async ({ page }) => {
    await soloView(page)
    await page.evaluate(() => { window._progressTab = 'Body Weight'; navigate('progress') })
    await expect(page.locator('.chip-row')).toBeVisible({ timeout: 15000 })
    await page.locator('button[onclick^="showClientWeightForm"]').first().click({ timeout: 15000 })
    const weight = page.locator('#cwf-weight')
    await expect(weight).toBeVisible()
    const s = await page.evaluate(() => {
      const input = document.getElementById('cwf-weight'), label = input.previousElementSibling
      const cs = getComputedStyle(input)
      return { borderStyle: cs.borderTopStyle, pad: cs.paddingLeft, radius: cs.borderTopLeftRadius, labelDisplay: getComputedStyle(label).display, labelAbove: label.getBoundingClientRect().bottom <= input.getBoundingClientRect().top + 1 }
    })
    expect(s.borderStyle, 'a real border, not the browser default inset one').toBe('solid')
    expect(s.pad).toBe('12px')
    expect(s.radius).toBe('8px')
    expect(s.labelDisplay, 'the label is a block above the box').toBe('block')
    expect(s.labelAbove).toBe(true)
  })

  test('the plan and personal-best forms are styled too', async ({ page }) => {
    await soloView(page)
    await page.evaluate(() => navigate('programs'))
    await expect(page.locator('h1:has-text("Training plans")')).toBeVisible({ timeout: 15000 })
    await page.evaluate(() => showCreateProgramModal())
    const plan = await page.evaluate(() => { const i = document.getElementById('pm-name'), t = document.getElementById('pm-desc'); return { name: getComputedStyle(i).borderTopLeftRadius, namePad: getComputedStyle(i).paddingLeft, desc: getComputedStyle(t).borderTopLeftRadius } })
    expect(plan).toEqual({ name: '8px', namePad: '12px', desc: '8px' })
  })
})
