// Session review (MVP item 6, approved by Jake 2026-10-31): the logged-session screen (openWorkoutLog) shows the plan workout the session came from
// beside what was done - "N of M planned exercises done", a Prescribed line, a Target per set, "Added" and "Not done" - and the coach's Recent
// sessions list (renderClientWorkouts) is open, 10 long, with each session's name and "N of M exercises". Real functions over a stubbed database
// (capped-api: nothing is written, any table it is not given throws). The pairing rules are pinned by tests-node/session-review.test.mjs.
const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')
const { installCappedApi, restoreCappedApi } = require('./capped-api')

const presc = (o = {}) => ({ repsMin: 8, repsMax: 8, weight: 80, effortMin: 8, effortType: 'rpe', ...o })
const tables = (uid, o = {}) => ({
  workout_logs: [{
    id: 'L1', client_id: 'c', coach_id: uid, template_id: 'T1', name: 'Upper A', date: '2026-10-28', notes: null,
    workout_log_exercises: [
      { id: 'E1', log_id: 'L1', exercise_id: 'x1', exercise_name: 'Bench Press', exercise_type: 'strength', metric_type: 'weight_reps', order_index: 0, client_notes: null },
      { id: 'E2', log_id: 'L1', exercise_id: 'x9', exercise_name: 'Curl', exercise_type: 'strength', metric_type: 'weight_reps', order_index: 1, client_notes: null },
    ],
  }],
  workout_log_sets: [
    { id: 'S1', workout_log_exercise_id: 'E1', set_number: 1, reps_achieved: 8, weight_kg: 80, effort_value: 8, effort_type: 'rpe' },
    { id: 'S2', workout_log_exercise_id: 'E1', set_number: 2, reps_achieved: 7, weight_kg: 80, effort_value: 9, effort_type: 'rpe' },
    { id: 'S3', workout_log_exercise_id: 'E2', set_number: 1, reps_achieved: 12, weight_kg: 10 },
  ],
  workout_templates: [{ id: 'T1', updated_at: '2026-10-20T10:00:00Z', workout_template_exercises: [
    { id: 'TE1', exercise_id: 'x1', exercise_name: 'Bench Press', exercise_type: 'strength', metric_type: 'weight_reps', sets: null, sets_json: [presc(), presc({ repsMin: 6, repsMax: 6, weight: 85 })], order_index: 0 },
    { id: 'TE2', exercise_id: 'x3', exercise_name: 'Row', exercise_type: 'strength', metric_type: 'weight_reps', sets: null, sets_json: [{ repsMin: 10, repsMax: 10 }], order_index: 1 },
  ] }],
  ...o,
})
const read = (page) => page.evaluate(() => {
  const el = document.getElementById('tab-content') || document.getElementById('main-content')
  const cards = [...el.querySelectorAll('.card')].filter(c => c.querySelector('table, .empty-text, [data-sr-prescribed]'))
  return {
    review: el.querySelector('[data-session-review]')?.getAttribute('data-session-review') || null,
    note: el.querySelector('[data-session-review]')?.textContent.trim() || '',
    warn: !!el.querySelector('.sr-note-warn'),
    prescribed: [...el.querySelectorAll('[data-sr-prescribed]')].map(e => e.textContent.trim()),
    targets: [...el.querySelectorAll('[data-sr-target]')].map(e => e.textContent.trim()),
    targetHeads: el.querySelectorAll('.sr-th').length,
    added: [...el.querySelectorAll('[data-sr-status="added"]')].map(e => e.closest('.card').querySelector('span[style*="font-weight:600"]')?.textContent.trim()),
    notDone: [...el.querySelectorAll('[data-sr-notdone] .sr-notdone-row span:first-child')].map(e => e.textContent.trim()),
    reps: [...el.querySelectorAll('tbody tr')].length,
    deleteBtn: !!el.querySelector('button.btn-danger'),
    cards: cards.length,
  }
})
const open = (page) => page.evaluate(() => openWorkoutLog('L1', 'c'))

test.describe('session review: the plan beside what was done', () => {
  test.beforeEach(async ({ page }) => { await loginAsPT(page) })

  test('coach: "1 of 2 planned exercises done", the prescribed line, a target per set, Curl Added, Row Not done', async ({ page }) => {
    const uid = await page.evaluate(() => currentUser.id)
    await installCappedApi(page, tables(uid))
    let r
    try { await open(page); r = await read(page) } finally { await restoreCappedApi(page) }
    expect(r.review).toBe('plan')
    expect(r.note).toBe('1 of 2 planned exercises done.')
    expect(r.warn).toBe(false)
    expect(r.prescribed).toHaveLength(1)
    expect(r.prescribed[0]).toMatch(/^Prescribed: .*8 reps.*RPE 8/)
    expect(r.targetHeads, 'only Bench Press has targets; Curl was not in the plan').toBe(1)
    expect(r.targets).toHaveLength(2)
    expect(r.targets[1]).toMatch(/6 reps/)
    expect(r.added).toEqual(['Curl'])
    expect(r.notDone).toEqual(['Row'])
    expect(r.reps, 'every logged set is still shown').toBe(3)
    expect(r.deleteBtn).toBe(true)
  })

  test('the client sees the same targets, read-only: no Delete', async ({ page }) => {
    const uid = await page.evaluate(() => currentUser.id)
    await installCappedApi(page, tables(uid))
    let r
    try {
      await page.evaluate(() => { window.__realProfile = currentProfile; currentProfile = { ...currentProfile, role: 'client' } })
      await open(page); r = await read(page)
    } finally {
      await page.evaluate(() => { currentProfile = window.__realProfile })
      await restoreCappedApi(page)
    }
    expect(r.prescribed).toHaveLength(1)
    expect(r.targets).toHaveLength(2)
    expect(r.deleteBtn).toBe(false)
  })

  test('a session logged without a plan workout looks as it did, plus one quiet line', async ({ page }) => {
    const uid = await page.evaluate(() => currentUser.id)
    const t = tables(uid); t.workout_logs[0].template_id = null
    delete t.workout_templates   // never read: the stub throws if it is
    await installCappedApi(page, t)
    let r
    try { await open(page); r = await read(page) } finally { await restoreCappedApi(page) }
    expect(r.review).toBe('none')
    expect(r.note, 'true whether it was never linked or its plan workout was deleted (ON DELETE SET NULL)').toBe('No plan workout is linked to this session.')
    expect(r.prescribed).toEqual([])
    expect(r.targetHeads).toBe(0)
    expect(r.added).toEqual([])
    expect(r.notDone).toEqual([])
    expect(r.reps).toBe(3)
  })

  test('a failed plan read says so and still shows every set', async ({ page }) => {
    const uid = await page.evaluate(() => currentUser.id)
    await installCappedApi(page, tables(uid, { workout_templates: { error: { code: 'XX000', message: 'boom' } } }))
    let r
    try { await open(page); r = await read(page) } finally { await restoreCappedApi(page) }
    expect(r.review).toBe('failed')
    expect(r.note).toContain('Could not load the plan')
    expect(r.warn).toBe(true)
    expect(r.added, 'nothing is called Added when the plan could not be read').toEqual([])
    expect(r.reps).toBe(3)
  })

  test('a plan read that THROWS: the same, never a blank screen', async ({ page }) => {
    const uid = await page.evaluate(() => currentUser.id)
    const t = tables(uid); delete t.workout_templates
    await installCappedApi(page, t)
    let r
    try { await open(page); r = await read(page) } finally { await restoreCappedApi(page) }
    expect(r.review).toBe('failed')
    expect(r.reps).toBe(3)
  })

  test('a deleted or unreadable plan workout: "no longer available", nothing marked', async ({ page }) => {
    const uid = await page.evaluate(() => currentUser.id)
    await installCappedApi(page, tables(uid, { workout_templates: [] }))
    let r
    try { await open(page); r = await read(page) } finally { await restoreCappedApi(page) }
    expect(r.review).toBe('gone')
    expect(r.note).toContain('no longer available')
    expect(r.added).toEqual([])
  })

  test('the plan edited after the session: a warning that the targets are today\'s', async ({ page }) => {
    const uid = await page.evaluate(() => currentUser.id)
    const t = tables(uid); t.workout_templates[0].updated_at = '2026-10-30T10:00:00Z'
    await installCappedApi(page, t)
    let r
    try { await open(page); r = await read(page) } finally { await restoreCappedApi(page) }
    expect(r.review).toBe('changed')
    expect(r.warn).toBe(true)
    expect(r.note).toContain('targets shown are today\'s')
  })

  test('review fixes: unilateral rows read "Set 1 L / R" beside set 1\'s target; a skipped set hides per-set targets; an exercise logged with no sets is Not done', async ({ page }) => {
    const uid = await page.evaluate(() => currentUser.id)
    const t = tables(uid)
    t.workout_logs[0].workout_log_exercises.push(
      { id: 'E3', log_id: 'L1', exercise_id: 'x4', exercise_name: 'Split Squat', exercise_type: 'strength', metric_type: 'unilateral', order_index: 2, client_notes: null },
      { id: 'E4', log_id: 'L1', exercise_id: 'x3', exercise_name: 'Row', exercise_type: 'strength', metric_type: 'weight_reps', order_index: 3, client_notes: null })
    t.workout_log_sets = t.workout_log_sets.filter(s => s.id !== 'S2').concat(
      { id: 'S4', workout_log_exercise_id: 'E3', set_number: 1, reps_achieved: 10, weight_kg: 20, side: 'left' },
      { id: 'S5', workout_log_exercise_id: 'E3', set_number: 1, reps_achieved: 10, weight_kg: 20, side: 'right' })
    t.workout_templates[0].workout_template_exercises.push({ id: 'TE4', exercise_id: 'x4', exercise_name: 'Split Squat', exercise_type: 'strength', metric_type: 'unilateral', sets: null, sets_json: [{ repsMin: 10, repsMax: 12, weight: 20 }], order_index: 2 })
    await installCappedApi(page, t)
    let r
    try {
      await open(page)
      r = await page.evaluate(() => {
        const el = document.getElementById('tab-content') || document.getElementById('main-content')
        const card = name => [...el.querySelectorAll('.card')].find(c => c.textContent.includes(name) && c.querySelector('table, .sr-tag, [data-sr-prescribed]'))
        const uni = card('Split Squat'), bench = card('Bench Press'), row = card('Row')
        return {
          uniLabels: [...uni.querySelectorAll('tbody tr td:first-child')].map(td => td.textContent.trim()),
          uniTargets: [...uni.querySelectorAll('[data-sr-target]')].map(td => td.textContent.trim()),
          benchTargets: bench.querySelectorAll('[data-sr-target]').length,
          benchHidden: !!bench.querySelector('[data-sr-targets-hidden]'),
          rowTag: row.querySelector('[data-sr-status]')?.getAttribute('data-sr-status') || null,
          note: el.querySelector('[data-session-review]').textContent.trim(),
          notDoneList: [...el.querySelectorAll('[data-sr-notdone] .sr-notdone-row span:first-child')].map(e => e.textContent.trim()),
        }
      })
    } finally { await restoreCappedApi(page) }
    expect(r.uniLabels).toEqual(['Set 1 L', 'Set 1 R'])
    expect(r.uniTargets).toHaveLength(2)
    expect(r.uniTargets[0]).toMatch(/per side/)
    expect(r.benchTargets, 'one set logged of two planned: no per-set targets').toBe(0)
    expect(r.benchHidden).toBe(true)
    expect(r.rowTag, 'a logged Row with no sets').toBe('not-done')
    expect(r.note).toBe('2 of 3 planned exercises done.')
    expect(r.notDoneList, 'Row is tagged on its own card, not listed twice').toEqual([])
  })

  test('a hostile exercise name and tempo are text, never markup', async ({ page }) => {
    const uid = await page.evaluate(() => currentUser.id)
    const t = tables(uid)
    t.workout_templates[0].workout_template_exercises[1].exercise_name = '<img src=x onerror="window.__pwned=1">Row'
    t.workout_templates[0].workout_template_exercises[0].sets_json[0].tempo = '<img src=x onerror="window.__pwned=1">'
    await installCappedApi(page, t)
    let r
    try {
      await open(page)
      r = await page.evaluate(() => { const el = document.getElementById('tab-content') || document.getElementById('main-content'); return { img: !!el.querySelector('img'), pwned: !!window.__pwned } })
    } finally { await restoreCappedApi(page) }
    expect(r.img).toBe(false)
    expect(r.pwned).toBe(false)
  })
})

test.describe('session review: the coach\'s Recent sessions list', () => {
  test.beforeEach(async ({ page }) => { await loginAsPT(page) })

  test('open by default, 10 rows, each with its name; "1 of 2 exercises" only where there is a plan workout', async ({ page }) => {
    const uid = await page.evaluate(() => currentUser.id)
    const base = tables(uid)
    const logs = Array.from({ length: 12 }, (_, i) => ({
      ...base.workout_logs[0], id: 'L' + (i + 1), date: `2026-10-${String(28 - i).padStart(2, '0')}`,
      template_id: i === 0 ? 'T1' : null, name: i === 0 ? 'Upper A' : 'Free session ' + i,
    }))
    await installCappedApi(page, { ...base, workout_logs: logs, client_programs: [], clients: [{ id: 'c', full_name: 'Cara' }] })
    let r
    try {
      r = await page.evaluate(async () => {
        const el = document.createElement('div'); el.id = 'sr-list-host'; document.body.prepend(el)
        await renderClientWorkouts('c', el)
        const rows = [...el.querySelectorAll('[data-recent-session]')]
        const out = {
          open: document.getElementById('pt-session-history').style.display !== 'none',
          n: rows.length,
          first: rows[0]?.querySelector('.row-name')?.textContent.trim(),
          firstDone: rows[0]?.querySelector('[data-sr-done]')?.textContent.trim() || null,
          secondDone: rows[1]?.querySelector('[data-sr-done]')?.textContent.trim() || null,
        }
        el.remove()
        return out
      })
    } finally { await restoreCappedApi(page) }
    expect(r.open).toBe(true)
    expect(r.n).toBe(10)
    expect(r.first).toBe('Upper A')
    expect(r.firstDone).toBe('1 of 2 exercises')
    expect(r.secondDone).toBe(null)
  })

  test('the plan read failing: the rows still show, with no count rather than a wrong one', async ({ page }) => {
    const uid = await page.evaluate(() => currentUser.id)
    const base = tables(uid)
    await installCappedApi(page, { ...base, workout_templates: { error: { code: 'XX000', message: 'boom' } }, client_programs: [], clients: [{ id: 'c', full_name: 'Cara' }] })
    let r
    try {
      r = await page.evaluate(async () => {
        const el = document.createElement('div'); document.body.prepend(el)
        await renderClientWorkouts('c', el)
        const out = { n: el.querySelectorAll('[data-recent-session]').length, done: el.querySelectorAll('[data-sr-done]').length }
        el.remove()
        return out
      })
    } finally { await restoreCappedApi(page) }
    expect(r.n).toBe(1)
    expect(r.done).toBe(0)
  })
})
