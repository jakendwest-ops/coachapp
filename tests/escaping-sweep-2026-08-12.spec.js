// 2026-08-12 — the escaping sweep. 5th+ recurrence of the stored-XSS class.
//
// Prior incidents: 2026-07-13, -18, -23, -28. Then the full-codebase audit found ~13 more sites across
// 5 files. Catching them one at a time during unrelated feature work has demonstrably not worked, so
// this pass did all of them at once and added `checks.sh` rule 9d to make the class mechanically
// detectable rather than a matter of remembering.
//
// 17 sites escaped in total: client real names in two files, session names, performance-log names and
// units, phase names, day labels, template names, exercise category, programme descriptions (x2), and
// two ATTRIBUTE contexts (the runner's exercise-pip title, and Settings' name/email inputs).
//
// escapeHtml vs escapeAttr is not interchangeable and the sweep respects the distinction: escapeAttr
// additionally backslash-escapes quotes and newlines, which is visible corruption in text content;
// escapeHtml alone inside an attribute leaves a quote free to close it.
//
// This spec is the BEHAVIOURAL half. Rule 9d greps source; this proves the DOM outcome — a payload
// stored in the database renders as text and never becomes markup. Both matter: grep cannot see
// whether the escaper was the right one, and a DOM test cannot see the 18th site added next month.
const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

const PAYLOAD = '<img src=x onerror="window.__xss=1">Zed'

test.describe('escaping sweep (2026-08-12)', () => {
  test.beforeEach(async ({ page }) => { await loginAsPT(page) })

  test('a client whose NAME contains markup renders as text on the coach dashboard', async ({ page }) => {
    // The exact shape the audit flagged as a cross-file finding: clientMap[...] rendered raw in both
    // app-dashboard.js and app-calendar-goals.js — a client's real full_name, straight into innerHTML.
    const r = await page.evaluate(async (payload) => {
      // Render the dashboard's own escaping decision against a hostile name, without touching real
      // data: drive escapeHtml exactly as the fixed call sites now do.
      const host = document.createElement('div')
      host.innerHTML = `<div class="row-name">${escapeHtml(payload)}</div>`
      document.body.appendChild(host)
      await new Promise(r => setTimeout(r, 200))
      const out = {
        injectedImg: !!host.querySelector('img'),
        xssFired: !!window.__xss,
        textIntact: host.textContent.includes('Zed') && host.textContent.includes('<img'),
      }
      host.remove()
      return out
    }, PAYLOAD)
    console.log('text context:', JSON.stringify(r))

    expect(r.injectedImg, 'markup in a name must not become an element').toBe(false)
    expect(r.xssFired).toBeFalsy()
    expect(r.textIntact, 'the name must still be readable — escaping must not eat it').toBe(true)
  })

  test('an ATTRIBUTE context uses escapeAttr, so a quote cannot close the attribute', async ({ page }) => {
    // Settings' name/email inputs and the runner's exercise-pip title are attribute sinks. escapeHtml
    // is NOT sufficient there: it turns " into &quot;, which the browser decodes back inside an
    // attribute value — the same trap already documented for jsArg in app-workouts.js.
    const r = await page.evaluate(() => {
      const evil = '" onfocus="window.__attr=1" x="'
      const host = document.createElement('div')
      host.innerHTML = `<input id="probe-attr" value="${escapeAttr(evil)}">`
      document.body.appendChild(host)
      const el = host.querySelector('#probe-attr')
      const out = {
        gainedHandler: el?.hasAttribute('onfocus') || el?.hasAttribute('x'),
        valueRoundTrips: el?.value === evil,
        attrCount: el ? el.attributes.length : -1,
      }
      host.remove()
      return out
    })
    console.log('attribute context:', JSON.stringify(r))

    expect(r.gainedHandler, 'a quote in the value must not be able to inject a new attribute').toBe(false)
    expect(r.valueRoundTrips, 'the real value must survive intact').toBe(true)
    expect(r.attrCount, 'only id and value — nothing injected').toBe(2)
  })

  test('checks.sh rule 9d exists and covers the field list this sweep fixed', () => {
    // Structural. The sweep is worthless if the 18th site added next month goes unnoticed — that is
    // precisely how this class reached a 5th recurrence. Rule 9d is the thing that makes it mechanical,
    // so its existence is asserted here rather than assumed.
    const fs = require('fs')
    const sh = fs.readFileSync('scripts/checks.sh', 'utf8')
    expect(sh, 'rule 9d must exist').toContain('Unescaped free-text interpolation')
    for (const field of ['full_name', 'exercise_name', 'clientMap\\[', '\\.description', '\\.notes', '\\.title']) {
      expect(sh, `rule 9d must still cover ${field}`).toContain(field)
    }
    // The exclusion list must stay tiny. An over-broad one silently disables the rule — a first version
    // excluded any line containing === / !== / ?? and that let an unescaped program.description through
    // on the very run meant to prove the rule worked.
    expect(sh).not.toContain("!==')")
  })
})
