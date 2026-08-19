// The runner never said "per side" for a unilateral exercise (2026-08-19).
//
// Jake, verbatim: "the unilateral pill does not exist" / "it didnt appear in the runner".
//
// The 2026-08-14 change bundled two things: the Unilateral PILL in the builder (which shipped and
// works — verified by driving both the builder and the runner add-exercise modals) and unilateral L/R
// entry in the runner (which also shipped). What never existed is any indicator IN THE RUNNER that the
// target is per side. `_fmtSetDetail` gained "per side" that day (app-workouts.js:318); _buildTargetCols
// did not. AMRAP got its runner badge in the same change — unilateral did not, and that asymmetry is
// the whole bug: the athlete typing into L and R had nothing telling them 8-10 meant 8-10 EACH.
const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

// Drives the REAL _buildTargetCols. It is not exported, so go through the render path that uses it.
// Signature is _buildTargetCols(tgt, ex) — target first — and it returns { cols, needsOneRM }.
const cols = (page, ex, tgt) => page.evaluate(({ ex, tgt }) => {
  const out = _buildTargetCols(tgt, ex)
  return (out.cols || []).map(c => ({ val: String(c.val), label: String(c.label) }))
}, { ex, tgt })

test.describe('Runner shows per side for a unilateral exercise', () => {
  test('a unilateral rep target is labelled REPS/SIDE', async ({ page }) => {
    await loginAsPT(page)
    const r = await cols(page, { metricType: 'unilateral' }, { repsMin: '8', repsMax: '10' })
    const reps = r.find(c => c.label.startsWith('REPS'))
    expect(reps, 'a rep column must exist').toBeTruthy()
    expect(reps.label, 'the athlete must be told the target is per side').toBe('REPS/SIDE')
    expect(reps.val).toBe('8–10')
  })

  test('a BILATERAL exercise is unchanged — no stray /SIDE', async ({ page }) => {
    await loginAsPT(page)
    const r = await cols(page, { metricType: 'weight_reps' }, { repsMin: '8', repsMax: '10' })
    const reps = r.find(c => c.label.startsWith('REPS'))
    expect(reps.label, 'a barbell lift must not claim to be per side').toBe('REPS')
  })

  test('AMRAP and unilateral together keep BOTH facts', async ({ page }) => {
    await loginAsPT(page)
    const withFloor = await cols(page, { metricType: 'unilateral' }, { amrap: true, repsMin: '8' })
    const c = withFloor.find(x => x.label.includes('AMRAP'))
    expect(c, 'AMRAP must still be shown').toBeTruthy()
    // Losing either fact is a regression: AMRAP alone hides the per-side, /SIDE alone hides the AMRAP.
    expect(c.label).toBe('AMRAP/SIDE')
    expect(c.val).toBe('8+')

    const noFloor = await cols(page, { metricType: 'unilateral' }, { amrap: true })
    const n = noFloor.find(x => x.val === 'AMRAP')
    expect(n.label, 'with no rep floor the label carries the per-side').toBe('REPS/SIDE')
  })

  test('a unilateral set with weight but NO reps still says per side', async ({ page }) => {
    await loginAsPT(page)
    // The reps label is the only place per-side lives, so this shape would otherwise lose it entirely.
    const r = await cols(page, { metricType: 'unilateral' }, { weight: '20' })
    expect(r.some(c => c.label === 'PER SIDE'), 'must not silently drop the per-side marker').toBe(true)
  })

  test('a jump is still JUMPS, not REPS', async ({ page }) => {
    await loginAsPT(page)
    const r = await cols(page, { metricType: 'jump_height' }, { repsMin: '5' })
    expect(r.find(c => c.label.startsWith('JUMPS')), 'jump labelling must survive the refactor').toBeTruthy()
  })
})
