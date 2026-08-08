// 2026-08-07 — Jake, live: "major slowdown on app when going into programs and editing the cardio
// workouts (tues/thurs/sat)". Root cause: openProgram eagerly fetched the day-slot picker's entire
// reuse pool — an uncapped workout_templates query with a nested workout_template_exercises join for
// every row, plus _buildProgramTemplatePool's own follow-up round-trip — and _editPhaseWorkout's back
// button is `backFn: () => openProgram(programId)`, so every "Back to program" paid it again.
// Measured on Jake's real account: 77 templates / 409 exercise rows / 391ms for that ONE query.
// Nothing openProgram renders reads that pool; its only consumer is the picker. Now lazy.
const { test, expect } = require('@playwright/test')
const { loginAsPT } = require('./helpers')

const TAG = '[E2E] bperf-'

async function makeFixture(page, tag) {
  return page.evaluate(async (tag) => {
    const { data: prog } = await db.from('programs')
      .insert({ coach_id: currentUser.id, is_personal: false, name: tag }).select().single()
    const { data: phase } = await db.from('program_phases')
      .insert({ program_id: prog.id, name: 'P1', duration_weeks: 1, order_index: 0 }).select().single()
    // A library template (program_id null) so it legitimately belongs in the picker's reuse pool.
    const { data: tmpl } = await db.from('workout_templates')
      .insert({ coach_id: currentUser.id, is_personal: false, name: tag + ' Lib' }).select().single()
    await db.from('workout_template_exercises').insert({
      template_id: tmpl.id, exercise_name: 'Rower', exercise_type: 'cardio',
      metric_type: 'cardio', order_index: 0, sets: 1, sets_json: [{ duration: '5:00' }]
    })
    return { progId: prog.id, phaseId: phase.id, tmplId: tmpl.id }
  }, tag)
}

async function sweep(page) {
  await page.evaluate(async (TAG) => {
    const { data: progs } = await db.from('programs').select('id')
      .eq('coach_id', currentUser.id).like('name', TAG + '%')
    const { data: tmpls } = await db.from('workout_templates').select('id')
      .eq('coach_id', currentUser.id).like('name', TAG + '%')
    const pIds = (progs || []).map(p => p.id), tIds = (tmpls || []).map(t => t.id)
    if (pIds.length) {
      const { data: phs } = await db.from('program_phases').select('id').in('program_id', pIds)
      const phIds = (phs || []).map(p => p.id)
      if (phIds.length) await db.from('program_phase_workouts').delete().in('phase_id', phIds)
      await db.from('program_phases').delete().in('program_id', pIds)
      await db.from('programs').delete().in('id', pIds)
    }
    if (tIds.length) {
      await db.from('workout_template_exercises').delete().in('template_id', tIds)
      await db.from('workout_templates').delete().in('id', tIds)
    }
  }, TAG)
}

test.describe('Programs builder — picker pool is off the page-load path', () => {
  test.beforeEach(async ({ page }) => { await loginAsPT(page); await sweep(page) })
  test.afterEach(async ({ page }) => { await sweep(page) })

  // RED before the fix: openProgram used to set window._programTemplates itself, so this was an
  // array. GREEN after: openProgram must leave it null — that is what proves the heavy query is no
  // longer on the page-load path (and therefore no longer re-run by every "Back to program").
  test('openProgram does not build the picker pool', async ({ page }) => {
    const fx = await makeFixture(page, TAG + Date.now())
    try {
      const pool = await page.evaluate(async (f) => {
        window._programTemplates = 'sentinel'
        await openProgram(f.progId)
        return window._programTemplates
      }, fx)
      expect(pool).toBeNull()
    } finally { await sweep(page) }
  })

  // The regression guard that matters: making it lazy must NOT break the picker. Opening it has to
  // build the pool on demand and actually list the coach's library workouts.
  test('opening the day-slot picker builds the pool and lists workouts', async ({ page }) => {
    const tag = TAG + Date.now()
    const fx = await makeFixture(page, tag)
    try {
      await page.evaluate(async (f) => { await openProgram(f.progId) }, fx)
      const res = await page.evaluate(async (d) => {
        await _openWorkoutPicker(d.phaseId, 1, 0, 1)
        return {
          poolBuilt: Array.isArray(window._programTemplates),
          listsOurs: (document.getElementById('wkp-results')?.innerText || '').includes(d.tag),
          stuckLoading: (document.getElementById('wkp-results')?.innerText || '').includes('Loading'),
        }
      }, { phaseId: fx.phaseId, tag })
      expect(res.poolBuilt).toBe(true)
      expect(res.listsOurs).toBe(true)
      expect(res.stuckLoading).toBe(false)
    } finally { await sweep(page) }
  })

  // Closing the picker mid-fetch must not repaint a dead modal, and must not leave the pool wedged.
  // A first cut of this asserted only `modalGone`, which the teardown already guarantees on its own —
  // review pointed out the guard could be deleted and the test would still pass. It now also asserts
  // the pool ended up usable and that reopening serves it from cache with no "Loading…" state.
  test('closing the picker during its lazy fetch leaves the pool usable, not wedged', async ({ page }) => {
    const fx = await makeFixture(page, TAG + Date.now())
    try {
      const res = await page.evaluate(async (f) => {
        await openProgram(f.progId)
        const p = _openWorkoutPicker(f.phaseId, 1, 0, 1)   // don't await — close underneath it
        _closeWorkoutPicker()
        await p
        const modalGone = !document.getElementById('workout-picker-modal')
        // Reopen: the pool must be usable and must NOT re-enter the loading state.
        await _openWorkoutPicker(f.phaseId, 1, 0, 1)
        const txt = document.getElementById('wkp-results')?.innerText || ''
        return { modalGone, poolUsable: Array.isArray(window._programTemplates), stuckLoading: txt.includes('Loading') }
      }, fx)
      expect(res.modalGone).toBe(true)
      expect(res.poolUsable).toBe(true)
      expect(res.stuckLoading).toBe(false)
    } finally { await sweep(page) }
  })

  // A failed pool fetch must leave the pool NULL so the next open retries — not cache [], which is
  // truthy and would make the picker claim "No reusable workouts yet" for the rest of the visit with
  // no retry. Before the pool went lazy this self-healed (openProgram rebuilt it every load).
  test('a failed pool fetch leaves the pool null so the next open retries', async ({ page }) => {
    const fx = await makeFixture(page, TAG + Date.now())
    try {
      const res = await page.evaluate(async (f) => {
        await openProgram(f.progId)
        const realFrom = db.from.bind(db)
        db.from = (t) => t === 'workout_templates'
          ? { select: () => ({ eq: () => ({ is: () => ({ is: () => ({ is: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: null, error: { message: 'simulated network failure' } }) }) }) }) }) }) }) }) }
          : realFrom(t)
        await _refreshProgramTemplates()
        const afterFailure = window._programTemplates
        db.from = realFrom
        await _refreshProgramTemplates()
        return { afterFailure, recovered: Array.isArray(window._programTemplates) }
      }, fx)
      expect(res.afterFailure).toBeNull()      // NOT [] — [] is truthy and would wedge the retry
      expect(res.recovered).toBe(true)
    } finally { await sweep(page) }
  })
})

// Solo is the role this codebase has had four separate bugs with (it shares the coach's auth.uid()
// but its clients row has coach_id NULL). Nothing else drives the lazy picker path as solo — the
// tests above run as PT, and solo-account.spec.js calls _refreshProgramTemplates directly rather
// than going through _openWorkoutPicker. Gap flagged by review, 2026-08-07.
test.describe('Programs builder — lazy picker pool works in solo view', () => {
  test('solo can open the day-slot picker and see its Personal workouts', async ({ page }) => {
    await loginAsPT(page)
    const soloOk = await page.evaluate(() => !!window._soloClientId)
    test.skip(!soloOk, 'No solo client record for this PT account')
    await page.evaluate(() => switchView('solo'))
    await page.waitForTimeout(1200)

    const tag = TAG + 'solo-' + Date.now()
    const fx = await page.evaluate(async (tag) => {
      const { data: prog } = await db.from('programs')
        .insert({ coach_id: currentUser.id, is_personal: true, name: tag }).select().single()
      const { data: phase } = await db.from('program_phases')
        .insert({ program_id: prog.id, name: 'P1', duration_weeks: 1, order_index: 0 }).select().single()
      await db.from('workout_templates')
        .insert({ coach_id: currentUser.id, is_personal: true, name: tag + ' Lib' })
      return { progId: prog.id, phaseId: phase.id }
    }, tag)

    try {
      const res = await page.evaluate(async (d) => {
        await openProgram(d.progId)
        await _openWorkoutPicker(d.phaseId, 1, 0, 1)
        const txt = document.getElementById('wkp-results')?.innerText || ''
        return { listsOurs: txt.includes(d.tag), stuckLoading: txt.includes('Loading') }
      }, { progId: fx.progId, phaseId: fx.phaseId, tag })
      expect(res.listsOurs).toBe(true)
      expect(res.stuckLoading).toBe(false)
    } finally { await sweep(page) }
  })
})
