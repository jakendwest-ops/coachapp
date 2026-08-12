// 2026-08-12 — the escaping sweep, and the rule that stops the class recurring.
//
// 5th+ recurrence: 2026-07-13, -18, -23, -28, then the full-codebase audit found ~13 more across 5
// files. 20 sites escaped in this pass; the point is the detector, not the 20.
//
// THIS SPEC WAS REWRITTEN AFTER REVIEW. Its first version tested `escapeHtml`/`escapeAttr` directly on
// elements it built itself — so it touched none of the changed call sites and would have stayed green
// if the entire sweep were reverted. Worse, its attribute payload contained no apostrophe, so the
// assertion `valueRoundTrips === true` passed while asserting exactly the property that was broken.
// A test that asserts a broken property and passes is worse than no test.
const { test, expect } = require('./fixtures')

const MODULES = [
  'js/app-core.js', 'js/app-dashboard.js', 'js/app-programs.js', 'js/app-clients.js',
  'js/app-calendar-goals.js', 'js/app-workouts.js', 'js/app-runner.js', 'js/app-progress.js',
  'js/starter-content.js',
]

test.describe('escaping sweep (2026-08-12)', () => {
  test('no unescaped free-text interpolation survives anywhere in the shipped modules', () => {
    // The real regression guard: runs the SAME checker checks.sh runs, over the real source. Revert
    // any one of the 20 escaped sites and this goes red. Covers sites no DOM test could reach.
    const { execFileSync } = require('child_process')
    let out = '', code = 0
    try {
      out = execFileSync('node', ['scripts/check-escaping.mjs', ...MODULES], { encoding: 'utf8' })
    } catch (e) {
      code = e.status
      out = (e.stdout || '') + (e.stderr || '')
    }
    if (code) console.log(out)
    expect(code, `unescaped free-text interpolation(s) found:\n${out}`).toBe(0)
  })

  test('the detector actually fires — on a plain sink, a masked one, and a .name', () => {
    // A detector that has never gone red is not known to work. Both previous grep versions of this
    // rule reported CLEAN while real sinks sat in the tree: one filtered whole lines (so an escaped
    // interpolation masked an unescaped neighbour), and one omitted `.name` entirely.
    const fs = require('fs'), os = require('os'), path = require('path')
    const { execFileSync } = require('child_process')
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'esc-'))
    const f = path.join(dir, 'probe.js')
    fs.writeFileSync(f, [
      'const a = `<div>${c.notes}</div>`',                                    // plain sink
      'const b = `<div>${escapeHtml(c.name)}</div><div>${c.notes}</div>`',     // masked by a neighbour
      'const d = `<span>${p.name}</span>`',                                    // .name
      'const e = `${src.name} (coaching copy)`',                               // no markup -> not a sink
      'const g = `<div>${cat.label}</div>`',                                   // hardcoded constant
      'const h = `<div>${escapeHtml(c.description)}</div>`',                   // correctly escaped
    ].join('\n'))

    let out = '', code = 0
    try { execFileSync('node', ['scripts/check-escaping.mjs', f], { encoding: 'utf8' }) }
    catch (e) { code = e.status; out = e.stdout || '' }
    fs.rmSync(dir, { recursive: true, force: true })
    console.log(out.trim())

    expect(code, 'the detector must FAIL on a file containing sinks').toBe(1)
    expect(out).toContain('probe.js:1')   // plain
    expect(out).toContain('probe.js:2')   // the masked neighbour — the per-line hole
    expect(out).toContain('probe.js:3')   // .name — was missing from the field list entirely
    expect(out).not.toContain('probe.js:4')  // no markup on the line
    expect(out).not.toContain('probe.js:5')  // hardcoded label constant
    expect(out).not.toContain('probe.js:6')  // already escaped
  })

  test('escapeAttr is NOT used in a plain value=""/title="" attribute — it corrupts and then saves', async ({ page }) => {
    // The bug this sweep nearly shipped. escapeAttr is for a JS string INSIDE an attribute
    // (onclick="fn('${escapeAttr(x)}')"): it backslash-escapes BEFORE html-escaping. In a plain
    // value="", the browser decodes the entity and hands `.value` back WITH the backslash — and
    // saveSettingsProfile writes that straight to profiles.full_name. It compounds on every save:
    //   O'Brien -> O\'Brien -> O\\\'Brien -> O\\\\\\\'Brien
    // Note the payload MUST contain an apostrophe. Without one, escapeAttr's backslash pass never
    // fires and this test passes against the broken code — which is what the first version did.
    await page.goto('/')
    const r = await page.evaluate(() => {
      const name = "O'Brien"
      const mk = (val) => {
        const host = document.createElement('div')
        host.innerHTML = `<input id="p" value="${val}">`
        document.body.appendChild(host)
        const v = host.querySelector('#p').value
        host.remove()
        return v
      }
      return { viaHtml: mk(escapeHtml(name)), viaAttr: mk(escapeAttr(name)), original: name }
    })
    console.log('round-trip:', JSON.stringify(r))

    expect(r.viaHtml, 'escapeHtml must round-trip a name with an apostrophe exactly').toBe(r.original)
    expect(r.viaAttr, 'escapeAttr is EXPECTED to corrupt here — this documents why it must not be used')
      .not.toBe(r.original)
  })

  test('escapeHtml in an attribute is safe — a quote cannot close it', async ({ page }) => {
    // The counter-property. The attribute value is delimited by the parser BEFORE entity decoding,
    // so &quot;/&#39; are inert inside it and cannot inject a new attribute. This is why escapeHtml
    // is sufficient for plain attributes and escapeAttr's extra pass is unnecessary there.
    await page.goto('/')
    const r = await page.evaluate(() => {
      const evil = '" onfocus="window.__attr=1" x="'
      const host = document.createElement('div')
      host.innerHTML = `<input id="p2" value="${escapeHtml(evil)}">`
      document.body.appendChild(host)
      const el = host.querySelector('#p2')
      const out = { injected: el.hasAttribute('onfocus') || el.hasAttribute('x'), attrs: el.attributes.length, value: el.value }
      host.remove()
      return out
    })
    console.log('attribute injection:', JSON.stringify(r))

    expect(r.injected, 'a quote must not be able to inject an attribute').toBe(false)
    expect(r.attrs, 'only id and value').toBe(2)
    expect(r.value, 'and the value survives intact').toBe('" onfocus="window.__attr=1" x="')
  })
})
