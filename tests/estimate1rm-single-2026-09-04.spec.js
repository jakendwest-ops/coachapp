// A one-rep set is a MEASURED 1RM, not an estimate. Jake's call, 2026-09-04.
//
// Plain Epley is w * (1 + r/30), which credits a 100kg single as 103.33kg — 3.3% the lifter never
// lifted. That number drives %1RM prescription, and app-progress.js:1839/:2482 apply _estimate1RM to
// sets ALREADY LOGGED, so the e1RM charts were overstating real performance without anyone asking for
// a projection.
//
// tests-node/pure.test.mjs covers the same rule in milliseconds and went RED before this fix. This
// spec exists because that one runs in a vm sandbox: it proves the behaviour in the module the
// BROWSER actually loads, which is the thing users get. Deliberately creates no database rows, so it
// has no teardown to get wrong (see checks.sh rule 9k).

const { test, expect } = require('@playwright/test')
const { loginAsPT } = require('./helpers')

test.describe('_estimate1RM — a single is measured, not estimated (2026-09-04)', () => {
  test('one rep returns exactly the weight lifted, and 2+ reps still use Epley', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => ({
      single: _estimate1RM(100, 1),          // RED before this fix: 103.33333333333334
      singleDecimal: _estimate1RM(62.5, 1),  // must pass a non-integer through untouched
      double: _estimate1RM(100, 2),
      five: _estimate1RM(100, 5),
      atCeiling: _estimate1RM(100, 12),
      overCeiling: _estimate1RM(100, 13)
    }))

    expect(r.single, 'a 100kg single must report 100kg, not an inflated estimate').toBe(100)
    expect(r.singleDecimal).toBe(62.5)

    // The rest of the curve is untouched. Without these the fix could have been "return w always",
    // which would pass the assertion above while destroying every genuine estimate.
    expect(r.double).toBeCloseTo(106.67, 1)
    expect(r.five).toBeCloseTo(116.67, 1)
    expect(r.atCeiling).not.toBeNull()
    expect(r.overCeiling, 'the 12-rep ceiling must still hold').toBeNull()
  })

  test('the preview label does not call a single an estimate', async ({ page }) => {
    await loginAsPT(page)

    // Drives the real preview function against the three elements it reads, rather than navigating a
    // modal open — same code path, no dependency on where the modal currently lives.
    const out = await page.evaluate(() => {
      const host = document.createElement('div')
      host.innerHTML = `
        <input id="probe-est-weight" value="100">
        <input id="probe-est-reps" value="1">
        <p id="probe-epley-preview"></p>`
      document.body.appendChild(host)
      const read = (reps) => {
        document.getElementById('probe-est-reps').value = String(reps)
        _updateOneRMQuickEntryPreview('probe')
        return document.getElementById('probe-epley-preview').textContent
      }
      const single = read(1)
      const five = read(5)
      host.remove()
      return { single, five }
    })

    expect(out.single, 'a single must not be labelled an Epley estimate').not.toContain('Epley estimate')
    expect(out.single).toContain('a single IS your 1RM')
    // The label must still be honest for a real estimate — otherwise the fix has just removed the
    // word "estimate" from a screen that genuinely is estimating.
    expect(out.five, 'a 5-rep entry IS an estimate and must still say so').toContain('Epley estimate')
  })
})
