const { test, expect } = require('./fixtures')
const { soloReady, loginAsClient } = require('./helpers')

// Phase 3 of docs/superpowers/plans/2026-11-08-solo-audit-response.md.
test('Performance opens on the story, ranked, with stalls named and names escaped', async ({ page }) => {
  await soloReady(page)
  const r = await page.evaluate(async () => {
    const real = _buildExerciseSeries, el = document.createElement('div'); document.body.appendChild(el)
    const d = n => { const x = new Date(); x.setDate(x.getDate() - n); return _ymdLocal(x) }
    const S = (n, kg) => ({ date: d(n), sets: [{ weight_kg: kg, reps_achieved: 5 }] })
    _buildExerciseSeries = async () => [
      { name: '<img src=x onerror=window.__x=1>', metricType: 'weight_reps', sessions: [S(30, 100), S(3, 110)] },
      { name: 'Bench', metricType: 'weight_reps', sessions: [S(28, 70), S(21, 70), S(14, 70), S(7, 70)] }]
    await renderProgressStrength(el)
    const card = el.querySelector('#perf-story')
    const out = { text: card.textContent, imgs: card.querySelectorAll('img').length, x: window.__x === 1 }
    _buildExerciseSeries = real; el.remove()
    return out
  })
  expect(r.text).toContain('Stronger on 1 of 2 lifts'); expect(r.text).toContain('1 stalled'); expect(r.text).toContain('+10%')
  expect([r.imgs, r.x]).toEqual([0, false])
})

test('MIRROR: nothing to compare draws no card', async ({ page }) => {
  await soloReady(page)
  expect(await page.evaluate(() => _liftStoryHtml({ rows: [], up: 0, stalled: [] }))).toBe('')
})

test.describe('Missed session', () => {
  const day = (ds, kind, planned = [], done = []) => ({ ds, kind, planned, done })
  const P = { _clientTemplateId: 't1', workout_templates: { name: 'Full Body B' } }
  const run = (page, days) => page.evaluate(({ days }) => { localStorage.removeItem('_dashMissSkip_cid'); return _dashMissedHtml(days, 'cid') }, { days })
  test.beforeEach(async ({ page }) => { await loginAsClient(page) })
  test('offers the missed session, and Skip is remembered', async ({ page }) => {
    const days = [day('2026-11-02', 'miss', [P]), day('2026-11-03', 'rest')]
    expect(await run(page, days)).toContain('Skip it')
    const after = await page.evaluate(({ days }) => { const box = document.createElement('div'); box.innerHTML = _dashMissedHtml(days, 'cid'); document.body.appendChild(box); box.querySelector('[data-skip-missed]').click(); const gone = !document.getElementById('dash-missed'); const again = _dashMissedHtml(days, 'cid'); box.remove(); localStorage.removeItem('_dashMissSkip_cid'); return { gone, again } }, { days })
    expect(after).toEqual({ gone: true, again: '' })
  })
  test('MIRROR: nothing when trained since, none missed, or no session to start', async ({ page }) => {
    expect(await run(page, [day('2026-11-02', 'miss', [P]), day('2026-11-03', 'done', [], [{ id: 'x' }])])).toBe('')
    expect(await run(page, [day('2026-11-02', 'rest')])).toBe('')
    expect(await run(page, [day('2026-11-02', 'miss', [{}])])).toBe('')
    expect(await run(page, [day('2026-11-02', 'miss', [P]), day('2026-11-03', 'plan', [P])]), 'today has its own session').toBe('')
  })
})

test.describe('One bodyweight target', () => {
  test.setTimeout(90_000)
  const tag = '[E2E] target ' + Date.now()
  test('a linked goal is the target on the Bodyweight tab, with no second editor', async ({ page }) => {
    await soloReady(page)
    try {
      const r = await page.evaluate(async (title) => {
        const c = window._soloClientId
        const w = await db.from('weight_logs').insert({ client_id: c, date: '2026-01-03', weight_kg: 83 }); if (w.error) throw new Error(w.error.message)
        const g = await db.from('goals').insert({ client_id: c, created_by: currentUser.id, title, status: 'active', start_value: 82, current_value: 82, target_value: 85, metric_unit: 'kg', linked_metric: 'bodyweight', priority: 1 }); if (g.error) throw new Error(g.error.message)
        const el = document.createElement('div'); document.body.appendChild(el)
        await renderProgressWeight(el)
        const out = { note: el.querySelector('#wg-linked')?.textContent, editor: !!el.querySelector('#wg-goal'), edit: el.textContent.includes('Edit start and goal') }
        await renderClientWeight(c, el)
        out.coachNote = el.querySelector('#wg-linked')?.textContent; out.coachEditor = !!el.querySelector('#wg-goal')
        el.remove(); return out
      }, tag)
      expect(r).toEqual({ note: 'Your target comes from your goal: 85 kg.', editor: false, edit: false, coachNote: 'Their target comes from their goal: 85 kg.', coachEditor: false })
    } finally {
      await page.evaluate(async (t) => { const c = window._soloClientId; await db.from('goals').delete().eq('client_id', c).eq('title', t).select('id'); await db.from('weight_logs').delete().eq('client_id', c).eq('date', '2026-01-03').select('id') }, tag)
    }
  })
})

test('MIRROR: a Records repaint while the history loads leaves the old read unpainted', async ({ page }) => {
  await soloReady(page)
  const hidden = await page.evaluate(async () => {
    const real = _buildExerciseSeries, el = document.createElement('div'); document.body.appendChild(el)
    el.innerHTML = '<span data-pb-logged="0" hidden></span>'
    _buildExerciseSeries = async () => { _pbLiftToken++; return [{ name: 'Squat', sessions: [{ date: '2026-11-02', sets: [{ weight_kg: 107.5, reps_achieved: 5 }] }] }] }
    await _showLoggedBests('c', [{ name: 'Squat', entries: [{ one_rm_kg: 100 }] }], el)
    const h = el.querySelector('[data-pb-logged]').hidden
    _buildExerciseSeries = real; el.remove(); return h
  })
  expect(hidden).toBe(true)
})

test('Records says when training has gone past a saved 1RM', async ({ page }) => {
  await soloReady(page)
  const r = await page.evaluate(async () => {
    const real = _buildExerciseSeries, el = document.createElement('div'); document.body.appendChild(el)
    el.innerHTML = '<span data-pb-logged="0" hidden></span><span data-pb-logged="1" hidden></span>'
    _buildExerciseSeries = async () => [{ name: 'Squat', sessions: [{ date: '2026-11-02', sets: [{ weight_kg: 107.5, reps_achieved: 5 }] }] }, { name: 'Bench', sessions: [{ date: '2026-11-02', sets: [{ weight_kg: 70, reps_achieved: 5 }] }] }]
    await _showLoggedBests('c', [{ name: 'Squat', entries: [{ one_rm_kg: 100 }] }, { name: 'Bench', entries: [{ one_rm_kg: 100 }] }], el)
    const out = [...el.querySelectorAll('[data-pb-logged]')].map(s => [s.hidden, s.textContent])
    _buildExerciseSeries = real; el.remove(); return out
  })
  expect(r[0][0]).toBe(false); expect(r[0][1]).toContain('Logged best'); expect(r[1]).toEqual([true, ''])
})

test('See every session opens the Sessions tab of Performance', async ({ page }) => {
  await soloReady(page)
  await page.evaluate(() => _openAllSessions())
  await expect(page.locator('#progress-tab-content button.active, #progress-tab-content button[aria-selected="true"]').filter({ hasText: 'Sessions' }).first()).toBeVisible({ timeout: 15000 })
})
