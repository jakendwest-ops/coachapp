// The bodyweight toggle was unreachable (2026-08-17, weekly full-file review).
//
//   ${s.bodyweight ? tog('BW', s.bodyweight, `toggleTsSet(...)`) : ''}
//
// The pill that SETS `bodyweight` only rendered when `bodyweight` was already true, and that toggle
// is the only thing in the whole codebase that can set it — a bootstrap deadlock. So no template
// exercise created after that gate appeared could ever be marked bodyweight, which silently made
// every pull-up and dip a weight-and-reps lift, and made the reps-charting built for bodyweight
// lifts on 2026-08-16 unreachable for any new data.
//
// Verbatim the defect that got `assisted`/`assistWeight` deleted on 2026-08-11 — the note explaining
// that removal sits 220 lines above the twin that survived it.
//
// These tests drive the REAL set editor (renderTemplateSets / toggleTsSet / flushTemplateSets /
// _cleanTemplateSets), because the bug was in the render gate — asserting on a hand-built object
// would have stayed green throughout.
const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

const mountEditor = (page, type) => page.evaluate((t) => {
  document.getElementById('bwtest')?.remove()
  const host = document.createElement('div')
  host.id = 'bwtest'
  // renderTemplateSets writes into `containerId` and reads the type from `tid`; att-* is the
  // "add exercise to template" surface.
  host.innerHTML = '<select id="att-type"></select><div id="att-metric-pills"></div><div id="att-sets-container"></div>'
  document.body.appendChild(host)
  const sel = document.getElementById('att-type')
  sel.innerHTML = `<option value="${t}" selected>${t}</option>`
  window._templateSets = [{ repsMin: '5', repsMax: '8' }]   // a FRESH set: bodyweight is undefined
  renderTemplateSets('att-sets-container', t)
}, type)

test.describe('Bodyweight toggle', () => {
  test('a FRESH set offers the BW pill — the deadlock', async ({ page }) => {
    await loginAsPT(page)
    await mountEditor(page, 'weight_reps')
    const r = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('#att-sets-container button')].map(b => b.textContent.trim())
      return { hasBW: btns.includes('BW'), hasAMRAP: btns.includes('AMRAP'), bodyweightValue: window._templateSets[0].bodyweight }
    })
    expect(r.bodyweightValue, 'the set must start NOT bodyweight — that is the whole point').toBeFalsy()
    expect(r.hasAMRAP, 'AMRAP always rendered; BW is meant to match it').toBe(true)
    expect(r.hasBW, 'a fresh set must offer the BW pill, or it can never become bodyweight').toBe(true)
  })

  test('tapping BW sets the flag, and it survives the save cleaner', async ({ page }) => {
    await loginAsPT(page)
    await mountEditor(page, 'weight_reps')
    const r = await page.evaluate(() => {
      toggleTsSet(0, 'bodyweight', 'att-sets-container')       // the real handler the pill calls
      const afterToggle = window._templateSets[0].bodyweight
      // _cleanTemplateSets is an allowlist — a key it drops is gone from the saved row with no error.
      const cleaned = _cleanTemplateSets(window._templateSets, { exercise_type: 'strength' }, 'weight_reps')
      return { afterToggle, saved: cleaned[0].bodyweight }
    })
    expect(r.afterToggle, 'the toggle must actually set the flag').toBe(true)
    expect(r.saved, 'and _cleanTemplateSets must carry it through to the saved row').toBe(true)
  })

  test('BW is offered on every type the RUNNER can render it for', async ({ page }) => {
    await loginAsPT(page)
    const out = {}
    for (const t of ['weight_reps', 'unilateral', 'timed_hold', 'jump_height', 'cardio']) {
      await mountEditor(page, t)
      out[t] = await page.evaluate(() =>
        [...document.querySelectorAll('#att-sets-container button')].map(b => b.textContent.trim()).includes('BW'))
    }
    // The runner renders a BW cell for these three (app-runner.js:386-390) — a plank is bodyweight
    // by definition. Offering it where the runner ignores it would be a dead control.
    expect(out.weight_reps).toBe(true)
    expect(out.unilateral).toBe(true)
    expect(out.timed_hold).toBe(true)
    expect(out.jump_height, 'a jump has no bodyweight concept').toBe(false)
    expect(out.cardio, 'cardio has no bodyweight concept').toBe(false)
  })

  test('switching type away from a BW-capable type drops the stale flag', async ({ page }) => {
    await loginAsPT(page)
    await mountEditor(page, 'weight_reps')
    const r = await page.evaluate(() => {
      toggleTsSet(0, 'bodyweight', 'att-sets-container')
      // The user now changes the exercise type. flushTemplateSets deliberately preserves fields the
      // new type does not render, so without a gate the flag rides along onto a jump.
      const asJump = _cleanTemplateSets(window._templateSets, { exercise_type: 'strength' }, 'jump_height')
      const asHold = _cleanTemplateSets(window._templateSets, { exercise_type: 'strength' }, 'timed_hold')
      return { onJump: asJump[0].bodyweight, onHold: asHold[0].bodyweight }
    })
    expect(r.onJump, 'a jump must not keep a bodyweight flag').toBe(false)
    expect(r.onHold, 'a timed hold legitimately keeps it').toBe(true)
  })
})
