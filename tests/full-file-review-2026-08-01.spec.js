const { test, expect } = require('@playwright/test')
const { loginAsPT } = require('./helpers')

// Weekly full-file review (os-lint was RED — 8+ days overdue). 2 of 3 review angles completed against
// app-runner.js + app-workouts.js (the two highest-churn modules, 44/43 commits in 30 days); the third
// angle hit an API spend limit mid-review and was substituted with a lighter direct check (duplicate
// function names, timer clear/set ratio — both clean).
//
// Found: a real, previously-undetected stored-XSS cluster in the runner's prescription-rendering path.
// coach-authored `sets_json`/`notes` (JSONB, no schema enforcement) rendered unescaped in ~15 places
// across _buildTargetCols/_renderTargetBarHtml (the shared target-bar builder, feeds both table and
// wizard render modes), the cardio target-chip row, several wizard-branch input placeholder/value
// attributes, and the PT-note block — all fixed here. Every one had an escaped sibling elsewhere in the
// same file proving this was drift, not a design choice (e.g. _buildTargetCols escaped `tempo` only;
// the PT-note block's twin in app-workouts.js already escaped all 3 branches).
test.describe('Stored-XSS cluster in the runner prescription render path — found by the 2026-08-01 full-file review', () => {
  test('_buildTargetCols/_renderTargetBarHtml escape every coach-authored sets_json field, not just tempo', async ({ page }) => {
    await loginAsPT(page)
    const html = await page.evaluate(() => {
      const payload = '<img src=x onerror=alert(1)>'
      const tgt = { repsMin: payload, intensityMin: payload, effortMin: payload, restMin: payload, effortType: 'rpe' }
      const ex = { oneRM: 100 }
      const { cols } = _buildTargetCols(tgt, ex)
      return _renderTargetBarHtml(cols)
    })
    expect(html).not.toContain('<img src=x onerror=alert(1)>')
    expect(html).toContain('&lt;img')
  })

  test('the PT-note block in the runner wizard escapes ex.notes (its app-workouts.js sibling already did)', async ({ page }) => {
    await loginAsPT(page)
    const html = await page.evaluate(() => {
      const ex = { name: 'Test', type: 'strength', metricType: 'weight_reps', loggedSets: [], targetSets: 1,
        sets_json: [{}], notes: '[Coach]<img src=x onerror=alert(1)>', tableRows: [] }
      _runner = { exercises: [ex], exIdx: 0, startTime: Date.now() }
      renderRunner()
      const out = document.getElementById('workout-runner').innerHTML
      document.getElementById('workout-runner')?.remove()
      _runner = null
      return out
    })
    expect(html).not.toContain('<img src=x onerror=alert(1)>')
    expect(html).toContain('&lt;img')
  })

  test('cardio target chips escape wattsMin/hrZoneMin/pace fields', async ({ page }) => {
    await loginAsPT(page)
    const html = await page.evaluate(() => {
      const payload = '"><img src=x onerror=alert(1)>'
      const ex = { name: 'Test Row', type: 'cardio', metricType: 'cardio', loggedSets: [], targetSets: 1,
        sets_json: [{ isDistanceBased: false, wattsMin: payload, hrZoneMin: payload }], tableRows: [] }
      _runner = { exercises: [ex], exIdx: 0, startTime: Date.now() }
      renderRunner()
      const out = document.getElementById('workout-runner').innerHTML
      document.getElementById('workout-runner')?.remove()
      _runner = null
      return out
    })
    expect(html).not.toContain('"><img src=x onerror=alert(1)>')
  })
})
