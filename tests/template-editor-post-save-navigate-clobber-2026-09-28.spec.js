const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

// Ledger row 2026-08-07-programs-builder-major-slowdown-editing-a-cardio-workout-and-* — the "save does
// nothing until refresh" half. Two fixture attempts on the plain edit-then-Back path came back green, and
// the row itself records why: `_checkSiblingPropagation`'s final fallback (app-workouts.js ~3145) fires a
// bare, UN-AWAITED `openTemplate(templateId, ctx)` for a template with no program/client context — a real
// network round trip that keeps running after saveTemplateDraft() has already returned 'ok'.
// tests/template-draft-save-2026-09-13.spec.js already proves openTemplate's own dirty-draft guard stops
// that abandoned repaint from clobbering a STILL-DIRTY draft. It does not test what happens after a
// SUCCESSFUL save, when the draft goes clean and the user navigates away immediately — openTemplate's guard
// (window._templateDraft?.templateId === id && _templateDraftIsDirty()) is explicitly scoped to the dirty
// case and says nothing about a clean draft for a page the user has already left. openTemplate paints into
// a raw document.getElementById('main-content') reference captured once at call time, never through
// navigate()'s _pageScopedContainer — so it has none of the staleness protection every navigate()-dispatched
// render has had since 2026-09-04.
const TAG = '[E2E-POSTSAVECLOBBER]'

test('after a successful save, the propagation chain\'s abandoned repaint must not clobber a page the user has already navigated to', async ({ page }) => {
  await loginAsPT(page)
  const stamp = Date.now()
  const before = `${TAG} ${stamp}`
  const after = `${TAG} EDITED ${stamp}`

  const fx = await page.evaluate(async ({ before }) => {
    const { data: t, error } = await db.from('workout_templates')
      .insert({ coach_id: currentUser.id, program_id: null, client_id: null, name: before })
      .select('id').single()
    if (error) throw new Error(error.message)
    await db.from('workout_template_exercises').insert({
      template_id: t.id, exercise_name: 'Row', exercise_type: 'strength', order_index: 0, sets_json: [{ repsMin: '5' }]
    })
    return { templateId: t.id }
  }, { before })

  try {
    // Open with NO ctx — a plain Library open. Neither ctx.isClientPlan nor ctx.programId is set, so
    // _checkSiblingPropagation takes its final fallback branch, the un-awaited one.
    await page.evaluate((id) => openTemplate(id), fx.templateId)
    await expect.poll(() => page.evaluate(() => window._templateDraft?.templateId)).toBe(fx.templateId)

    // Gate the SECOND fetch of this template's full row (the redundant, un-awaited repaint) so the race
    // window is deterministic. The FIRST fetch — saveTemplateDraft's own `await openTemplate(targetId, d.ctx)`
    // — passes straight through.
    let calls = 0
    let releaseGate
    const gate = new Promise(res => { releaseGate = res })
    await page.route('**/rest/v1/workout_templates*', async route => {
      const url = route.request().url()
      if (url.includes(fx.templateId) && url.includes('workout_template_exercises')) {
        calls++
        if (calls === 2) await gate
      }
      await route.continue()
    })

    await page.evaluate((newName) => {
      const mk = (id) => { let e = document.getElementById(id); if (!e) { e = document.createElement('input'); e.id = id; document.body.appendChild(e) } return e }
      mk('et-name').value = newName
      mk('et-desc').value = ''
      if (!document.getElementById('et-error')) { const d = document.createElement('div'); d.id = 'et-error'; document.body.appendChild(d) }
      _stageRenameTemplate()
    }, after)
    const saved = await page.evaluate(() => saveTemplateDraft())
    expect(saved, 'Save must report success').toBe('ok')
    // Not asserted synchronously: the fallback's own openTemplate() call is fired (not awaited) deep
    // inside _checkSiblingPropagation, so by the time saveTemplateDraft() resolves its underlying fetch
    // may not have reached the network layer yet — asserting `calls === 2` here was flaky. Its actual
    // arrival is instead proven below by `calls` reaching 2 before the final checks.

    // The draft is clean right after a successful save, so nothing blocks an immediate navigation away —
    // exactly what a user clicking straight to another tab after Save does. The EDITOR's own markup
    // (#template-exercise-list) is what "clobbered" means here — the renamed template's NEW name is
    // expected to show up legitimately in the workouts list's own row for it, so that string is not a
    // safe thing to assert absent.
    await page.evaluate(() => navigate('workouts'))
    await expect(page.locator('#main-content'), 'must be on the workouts page, not still showing the editor').not.toContainText('template-exercise-list')
    const pageRightAfterNav = await page.evaluate(() => currentPage)
    expect(pageRightAfterNav).toBe('workouts')

    // Release the gated, abandoned repaint and give it time to land. There is no positive DOM/JS signal
    // to poll for here — the test is proving an absence, same shape as the precedent in
    // tests/template-draft-save-2026-09-13.spec.js (see scripts/count-baseline.json's waitForTimeout entry).
    releaseGate()
    await page.waitForTimeout(1500)

    const after1500 = await page.evaluate(() => ({
      currentPage,
      isEditorShowing: !!document.getElementById('template-exercise-list'),
      onWorkoutsList: !!document.getElementById('workout-tab-content'),
    }))
    expect(calls, 'the propagation fallback\'s own repaint must actually have fired by now').toBe(2)
    expect(after1500.currentPage, 'the abandoned repaint must not silently change which page the router thinks is showing').toBe('workouts')
    expect(after1500.isEditorShowing, 'the abandoned repaint must not overwrite the workouts page with the template editor').toBe(false)
    expect(after1500.onWorkoutsList, 'the workouts page must still be the one actually on screen').toBe(true)
  } finally {
    const reaped = await page.evaluate(async (fx) => {
      const n = r => (r.data || []).length
      await db.from('workout_template_exercises').delete().eq('template_id', fx.templateId).select('id')
      return { template: n(await db.from('workout_templates').delete().eq('id', fx.templateId).eq('coach_id', currentUser.id).select('id')) }
    }, fx)
    expect(reaped, 'cleanup must remove the template').toEqual({ template: 1 })
  }
})
