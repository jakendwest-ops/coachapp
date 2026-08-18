// A policy-refused write must never report success (2026-08-18).
//
// PostgREST returns { data: [], error: null } for a policy-blocked write — NO error, ZERO rows. Six
// sites checked only `error`, so a refusal rendered as a success. Found by the weekly full-file review;
// six SIBLING functions already did it correctly, which is what made this drift rather than design.
//
// The two with a concrete real-world trigger: a client transferred between coaches keeps
// coach_id = the OLD coach on every pre-transfer workout_logs row, so the new coach types feedback,
// sees a green "Saved ✓", and writes nothing — and "deleting" such a session navigated away as though
// it had worked, with the row still there on the next render.
//
// Every test stubs the WRITE to return the refusal shape and asserts the user is told. That is the
// only way to exercise this: reproducing a real RLS refusal would need a second account and a
// transferred client, and the failure shape is identical either way.
const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

test.describe('A refused write must not report success', () => {
  test('saveCoachNotes does not show "Saved ✓" when nothing was written', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(async () => {
      const host = document.createElement('div')
      host.innerHTML = '<textarea id="wl-coach-notes">some feedback</textarea>' +
                       '<span id="wl-notes-saved" style="display:none">Saved</span>'
      document.body.appendChild(host)
      const orig = db.from.bind(db)
      db.from = (t) => {
        if (t !== 'workout_logs') return orig(t)
        const refusal = { data: [], error: null }
        const chain = { eq: () => chain, select: () => Promise.resolve(refusal) }
        return { update: () => chain }
      }
      let toast = ''
      const origToast = window.showToast
      window.showToast = (m) => { toast = m }
      try {
        await saveCoachNotes('00000000-0000-0000-0000-000000000000')
        return { savedShown: document.getElementById('wl-notes-saved').style.display, toast }
      } finally { db.from = orig; window.showToast = origToast; host.remove() }
    })
    // The whole bug: a green tick over a write that never landed.
    expect(r.savedShown, 'the Saved indicator must stay hidden').toBe('none')
    expect(r.toast.toLowerCase()).toContain('could not be saved')
  })

  test('deleteWorkoutLog does not navigate away when the row is still there', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(async () => {
      const orig = db.from.bind(db)
      db.from = (t) => {
        if (t !== 'workout_logs') return orig(t)
        const refusal = { data: [], error: null }
        const chain = { eq: () => chain, select: () => Promise.resolve(refusal) }
        return { delete: () => chain }
      }
      let navigated = false, toast = ''
      const origBack = window.backToClientWorkouts, origToast = window.showToast, origConfirm = window.confirm
      window.backToClientWorkouts = () => { navigated = true }
      window.showToast = (m) => { toast = m }
      window.confirm = () => true
      try {
        await deleteWorkoutLog('00000000-0000-0000-0000-000000000000', 'c1')
        return { navigated, toast }
      } finally {
        db.from = orig; window.backToClientWorkouts = origBack
        window.showToast = origToast; window.confirm = origConfirm
      }
    })
    // Navigating away IS the false success — it tells the user the session is gone.
    expect(r.navigated, 'must not navigate away from a delete that removed nothing').toBe(false)
    expect(r.toast.toLowerCase()).toContain('could not be deleted')
  })

  test('delete1RM reports a refusal instead of silently re-rendering', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(async () => {
      const orig = db.from.bind(db)
      db.from = (t) => {
        if (t !== 'client_1rms') return orig(t)
        const refusal = { data: [], error: null }
        const chain = { eq: () => chain, select: () => Promise.resolve(refusal) }
        return { delete: () => chain }
      }
      let refreshed = false, toast = ''
      const origRefresh = window._refresh1RMs, origToast = window.showToast, origConfirm = window.confirm
      window._refresh1RMs = () => { refreshed = true }
      window.showToast = (m) => { toast = m }
      window.confirm = () => true
      try {
        await delete1RM('00000000-0000-0000-0000-000000000000', 'c1')
        return { refreshed, toast }
      } finally {
        db.from = orig; window._refresh1RMs = origRefresh
        window.showToast = origToast; window.confirm = origConfirm
      }
    })
    expect(r.toast.toLowerCase()).toContain('could not be deleted')
    // Re-rendering with the row still present is what made this read as "the button is broken".
    expect(r.refreshed, 'must not re-render as though the delete worked').toBe(false)
  })

  test('propagation counts a refused ADD as a failure', async ({ page }) => {
    await loginAsPT(page)
    const failures = await page.evaluate(async () => {
      const orig = db.from.bind(db)
      db.from = (t) => {
        if (t !== 'workout_template_exercises') return orig(t)
        const empty = { data: [], error: null }
        const chain = {
          eq: () => chain, order: () => chain, limit: () => Promise.resolve(empty),
          select: () => Promise.resolve(empty),
        }
        return { select: () => chain, insert: () => ({ select: () => Promise.resolve(empty) }) }
      }
      const origToast = window.showToast
      window.showToast = () => {}
      try {
        return await _propagateExerciseChangeToTemplates(
          { op: 'add', matchName: 'X', row: { exercise_name: 'X', exercise_type: 'strength' } },
          ['t1', 't2'])
      } finally { db.from = orig; window.showToast = origToast }
    })
    // An INSERT returning zero rows has no benign reading — unlike update/delete, where 0 rows is the
    // documented "this target doesn't have that exercise" no-op and must NOT be counted.
    expect(failures, 'both refused inserts must be counted').toBe(2)
  })

  test('a refused update/delete propagation is NOT counted — 0 rows is a real no-op there', async ({ page }) => {
    await loginAsPT(page)
    const failures = await page.evaluate(async () => {
      const orig = db.from.bind(db)
      db.from = (t) => {
        if (t !== 'workout_template_exercises') return orig(t)
        const empty = { data: [], error: null }
        const chain = { eq: () => chain, select: () => Promise.resolve(empty), then: (r) => Promise.resolve(empty).then(r) }
        return { update: () => chain, delete: () => chain }
      }
      const origToast = window.showToast
      window.showToast = () => {}
      try {
        return await _propagateExerciseChangeToTemplates(
          { op: 'update', matchName: 'X', row: { exercise_name: 'X' } }, ['t1', 't2'])
      } finally { db.from = orig; window.showToast = origToast }
    })
    // Guards the deliberate asymmetry. Counting these would fire an alarm on the COMMON case — a
    // sibling session that simply doesn't contain the edited exercise.
    expect(failures, 'a 0-row update must stay a silent no-op').toBe(0)
  })

  // The most dangerous edit in the change, and the one the review found untested: this path CREATES a
  // row, DESTROYS a row, and changes which template id every caller then writes to. Getting it wrong
  // means edits silently land on a template that is in no slot at all.
  test('a refused slot repoint falls back to the shared template and reaps its clone', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(async () => {
      const orig = db.from.bind(db)
      const deletes = []
      db.from = (t) => {
        if (t === 'program_phase_workouts') return {
          // count > 1 == the template is shared across slots, so a fork is attempted.
          select: () => ({ eq: () => Promise.resolve({ count: 2, error: null }) }),
          // The repoint is REFUSED: no error, zero rows — the shape this whole change is about.
          update: () => { const c = { eq: () => c, select: () => Promise.resolve({ data: [], error: null }) }; return c },
        }
        if (t === 'workout_templates') return {
          select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'SHARED', coach_id: 'COACH-1' }, error: null }) }) }),
          delete: () => { const c = { eq: (col, v) => { c._f = { ...(c._f||{}), [col]: v }; return c },
            select: () => { deletes.push({ table: 'workout_templates', filters: c._f }); return Promise.resolve({ data: [{ id: 'CLONE' }], error: null }) } }; return c },
        }
        if (t === 'workout_template_exercises') return {
          delete: () => { const c = { eq: (col, v) => { c._f = { ...(c._f||{}), [col]: v }; return c },
            select: () => { deletes.push({ table: 'workout_template_exercises', filters: c._f }); return Promise.resolve({ data: [], error: null }) } }; return c },
        }
        return orig(t)
      }
      const origClone = window._cloneSharedMasterTemplate, origToast = window.showToast
      window._cloneSharedMasterTemplate = async () => ({ id: 'CLONE', exerciseIdMap: { ex1: 'ex1-clone' } })
      let toast = ''
      window.showToast = (m) => { toast = m }
      window._templateCtx = { phaseWorkoutId: 'slot-1', isClientPlan: false }
      try {
        const out = await _resolveEditableTemplateId('SHARED', 'ex1')
        return { out, deletes, toast }
      } finally {
        db.from = orig; window._cloneSharedMasterTemplate = origClone
        window.showToast = origToast; window._templateCtx = {}
      }
    })

    // 1. It must hand back the ORIGINAL id. Returning the clone would send every subsequent write to a
    //    template that no slot points at — silently discarded work, under a success toast.
    expect(r.out.templateId, 'must fall back to the shared template, not the orphan clone').toBe('SHARED')
    expect(r.out.exerciseId, 'the clone id map is discarded with the clone').toBe('ex1')

    // 2. It must tell the user the isolation did NOT happen — their edit now hits every slot.
    expect(r.toast.toLowerCase()).toContain('could not isolate')

    // 3. The clone must be reaped. Orphaned templates are what grew one real account to 2013 rows.
    const tmplDelete = r.deletes.find(d => d.table === 'workout_templates')
    expect(tmplDelete, 'the clone must be deleted').toBeTruthy()
    expect(tmplDelete.filters.id, 'it must delete the CLONE, never the shared original').toBe('CLONE')
    // 4. Ownership anchor — an id-only delete on workout_templates is the standing ledger finding.
    expect(tmplDelete.filters.coach_id, 'the reap must be ownership-anchored').toBe('COACH-1')
    expect(r.deletes.some(d => d.table === 'workout_template_exercises' && d.filters.template_id === 'CLONE'),
      'the clone exercises must be reaped too, anchored on the clone').toBe(true)
  })

  test('moveTemplateExercise warns when only half the swap lands', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(async () => {
      const orig = db.from.bind(db)
      let call = 0
      db.from = (t) => {
        if (t !== 'workout_template_exercises') return orig(t)
        const rows = { data: [{ id: 'a', order_index: 0 }, { id: 'b', order_index: 1 }], error: null }
        return {
          select: () => ({ eq: () => ({ order: () => Promise.resolve(rows) }) }),
          // First write lands, second is refused — the half-applied swap.
          update: () => { const mine = call++; const res = mine === 0 ? { data: [{ id: 'x' }], error: null } : { data: [], error: null }
            const chain = { eq: () => chain, select: () => Promise.resolve(res) }; return chain },
        }
      }
      let toast = ''
      const origToast = window.showToast, origOpen = window.openTemplate
      window.showToast = (m) => { toast = m }
      window.openTemplate = () => {}
      window._templateCtx = {}
      try {
        await moveTemplateExercise('t1', 'a', 1)
        return { toast }
      } finally { db.from = orig; window.showToast = origToast; window.openTemplate = origOpen }
    })
    // Two exercises sharing an order_index render in an arbitrary order that looks like a different bug.
    expect(r.toast.toLowerCase()).toContain('could not reorder')
  })
})
