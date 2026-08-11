// 2026-08-11 — the "assisted lift" flag is gone, and must not creep back.
//
// Why it was removed (Jake's call, during the refinement pass):
//
// 1. It was UNREACHABLE. The "Assist" toggle in the template set editor only rendered when
//    `s.assisted` was ALREADY true — `${s.assisted ? tog('Assist', …) : ''}` — so there was no way
//    to switch it on from the UI in the first place. Same for the assist-weight input. The only
//    surviving route in was hand-editing sets_json.
//
// 2. It silently CORRUPTED training data. In the runner, `if (ex.assisted) setData.assistWeight =
//    weight` meant the number the athlete typed was the ASSIST load, but it was still written to
//    workout_log_sets.weight_kg unchanged. So a pull-up with 20kg of band assistance — genuinely
//    -20kg of external load — persisted as +20kg LIFTED, and then fed straight into volume totals,
//    e1RM estimates and PB detection. Every one of those numbers would have been wrong, upward,
//    with nothing on screen to hint at it.
//
// A live count before removal found ZERO sets carrying the flag (52 template exercises scanned), so
// there was no history to repair — this is pure fix-forward, per the standing rule.
//
// This test pins the removal at both ends: the builder must not emit the fields, and the runner must
// not carry them. It goes RED the moment anyone reintroduces either half.
//
// NOTE: proper *assisted* loading (band/machine assistance as negative external load) is a legitimate
// feature — but it needs its own signed-load model, not a boolean that inverts the meaning of an
// existing column while sharing its storage. If it comes back, it comes back as that.
const { test, expect } = require('@playwright/test')
const { loginAsPT } = require('./helpers')

test.describe('assisted lift removed (2026-08-11)', () => {
  test.beforeEach(async ({ page }) => { await loginAsPT(page) })

  test('_cleanTemplateSets drops assisted/assistWeight even when handed them explicitly', async ({ page }) => {
    const out = await page.evaluate(() => {
      // Hand it the exact shape a legacy row would have had.
      const cleaned = _cleanTemplateSets(
        [{ reps: 8, weight: 20, assisted: true, assistWeight: 20, bodyweight: true }],
        { unilateral: false, timed: false }
      )
      return { keys: Object.keys(cleaned[0] || {}), json: JSON.stringify(cleaned[0] || {}) }
    })
    console.log('cleaned set keys:', out.keys.join(', '))

    expect(out.keys).not.toContain('assisted')
    expect(out.keys).not.toContain('assistWeight')
    // The sibling flag it used to sit beside must still survive — proves the allowlist wasn't over-trimmed.
    expect(out.keys).toContain('bodyweight')
    expect(out.json.toLowerCase()).not.toContain('assist')
  })

  test('no assist plumbing survives anywhere in the loaded app modules', async ({ page }) => {
    // The corruption lived in the runner, not the builder, so a builder-only assertion would miss it.
    // Fetch the shipped module text and check it directly — cheaper and far more complete than trying
    // to drive an unreachable UI control.
    const hits = await page.evaluate(async () => {
      const files = ['js/app-workouts.js', 'js/app-runner.js', 'js/app-programs.js', 'js/app-progress.js']
      const found = []
      for (const f of files) {
        const txt = await (await fetch(f + '?cachebust=' + Date.now())).text()
        txt.split('\n').forEach((l, i) => {
          if (!/assist/i.test(l)) return
          if (l.trim().startsWith('//')) return   // the explanatory comment is meant to stay
          found.push(f + ':' + (i + 1) + ' ' + l.trim().slice(0, 90))
        })
      }
      return found
    })
    if (hits.length) console.log('unexpected assist references:\n  ' + hits.join('\n  '))

    expect(hits).toEqual([])
  })
})
