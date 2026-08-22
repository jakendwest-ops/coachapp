const { test, expect } = require('@playwright/test')
const { loginAsPT, loginAsPT2 } = require('./helpers')

// ─── App-level ownership verification on the two odd-ones-out (2026-08-12 audit) ───────────────────
//
// `saveExerciseToTemplate` and `moveTemplateExercise` were the only members of the template write
// family that did not call `_verifyTemplateOwnership`, against a convention their own file documents
// by name at js/app-workouts.js:2907.
//
// These assert the APP-LEVEL refusal, not the database's. RLS already refuses a foreign write here —
// tests/template-exercise-write-rls-2026-08-10.spec.js proves that behaviourally — so a cross-tenant
// probe could not go red before this fix: the write was already blocked one layer down. What was
// missing was the app declining to try, which is the difference between "defended" and "defended by
// something we do not control and do not version in this repo".
//
// The distinction matters for how these tests are written: they drive the real shipped functions
// against a template owned by ANOTHER coach and assert the function bails at its own guard, before it
// ever reaches Supabase.
test.describe('saveExerciseToTemplate / moveTemplateExercise verify template ownership', () => {
  let foreignTemplateId = null
  const tag = '[E2E] Foreign Anchor Probe ' + Date.now()

  test.afterEach(async ({ browser }) => {
    // Owner-anchored cleanup: PT2 created it, so PT2 reaps it. Deleting by name+coach rather than by a
    // captured id means a failed run cannot strand it — the lesson from
    // bugs/2026-08-20-cross-tenant-probes-not-cleanup-safe.
    const ctx = await browser.newContext()
    try {
      const p = await ctx.newPage()
      await loginAsPT2(p)
      await p.evaluate(async (name) => {
        // Rowcount-checked: a refused delete returns { data: [], error: null } and would leave the
        // fixture template behind while this reported success. Same class as a4725d4.
        const { data: gone } = await db.from('workout_templates')
          .delete().eq('coach_id', currentUser.id).eq('name', name).select('id')
        if (!(gone || []).length) console.error('CLEANUP: nothing reaped for', name, '- may already be gone, or refused')
      }, tag).catch(() => {})
    } finally { await ctx.close().catch(() => {}) }
  })

  test('saveExerciseToTemplate refuses a template owned by another coach, at the app layer', async ({ browser }) => {
    const pt2Ctx = await browser.newContext()
    const ptCtx = await browser.newContext()
    try {
      const pt2Page = await pt2Ctx.newPage()
      await loginAsPT2(pt2Page)
      foreignTemplateId = await pt2Page.evaluate(async (name) => {
        const { data } = await db.from('workout_templates')
          .insert({ coach_id: currentUser.id, name, is_personal: false }).select('id').single()
        return data?.id || null
      }, tag)
      expect(foreignTemplateId, 'PT2 must be able to create its own template for this probe').not.toBeNull()

      const ptPage = await ptCtx.newPage()
      await loginAsPT(ptPage)
      const result = await ptPage.evaluate(async (tid) => {
        // Mount only the DOM the function reads, mirroring the builder modal.
        const mk = (id, t = 'input') => { let e = document.getElementById(id); if (!e) { e = document.createElement(t); e.id = id; document.body.appendChild(e) } return e }
        mk('att-error', 'div'); mk('att-notes'); mk('att-superset'); mk('att-sets-container', 'div')
        const sel = mk('att-type', 'select'); sel.innerHTML = '<option value="weight_reps">w</option>'; sel.value = 'weight_reps'
        window._exerciseDetailPicked = { name: '[E2E] Should Never Land', id: null }
        window._templateSets = [{ repsMin: '5' }]

        await saveExerciseToTemplate(tid)

        // Did anything actually land? Asked from PT2's perspective would be ideal, but PT cannot read
        // PT2's rows; a null/empty read here is therefore consistent with both "refused" and "invisible".
        // The load-bearing assertion is the app-level error message.
        return { err: document.getElementById('att-error').textContent }
      }, foreignTemplateId)

      expect(result.err, 'the app must refuse at its own guard, not rely on RLS to refuse for it')
        .toContain('permission denied')
    } finally {
      await ptCtx.close().catch(() => {})
      await pt2Ctx.close().catch(() => {})
    }
  })

  // _resolveEditableTemplateId is not a resolver — on the shared-slot path it INSERTS a cloned
  // workout_templates row plus its exercises and REPOINTS a program_phase_workouts row. Every caller
  // that verifies ownership does so AFTER calling it, so an unverified templateId could produce a
  // clone and a repoint before any check ran, and the caller's refusal would leave the clone behind.
  // Found by pre-push review 2026-08-22; the gate now lives inside the helper because there are SIX
  // callers, not the four the ledger row listed.
  //
  // Stubbed rather than driven live: the fork only triggers when a template is shared across >1 slot
  // AND _templateCtx carries a phaseWorkoutId, and building that against a FOREIGN coach's template
  // is not something the E2E PT can legitimately set up. The stub reproduces exactly the state the
  // helper reads, which is all the gate can see.
  test('_resolveEditableTemplateId refuses to fork a template owned by another coach', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(async () => {
      const orig = db.from.bind(db)
      let cloneAttempted = false
      db.from = (t) => {
        if (t === 'program_phase_workouts') return {
          select: () => ({ eq: () => Promise.resolve({ count: 2, error: null }) }),   // shared → fork path
          // update() supplied even though the gate should stop us reaching it: without it, a REGRESSION
          // (gate removed) throws 'update is not a function' and the test fails with a TypeError rather
          // than the assertion message that explains what broke. Still red either way — but a red test
          // that misreports the cause costs the next reader the same hour it cost to find this.
          update: () => { const c = { eq: () => c, select: () => Promise.resolve({ data: [], error: null }) }; return c },
        }
        if (t === 'workout_templates') return {
          // A template belonging to somebody else entirely.
          select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'FOREIGN', coach_id: 'SOMEONE-ELSE' }, error: null }) }) }),
          // delete() is here only so a REGRESSION reaches the assertion. With the gate removed the code
          // clones, fails the repoint, then reaps the clone — and an unstubbed delete throws a TypeError
          // that reports 'delete is not a function' instead of 'it must refuse BEFORE cloning'.
          delete: () => { const c = { eq: () => c, select: () => Promise.resolve({ data: [{ id: 'CLONE' }], error: null }) }; return c },
        }
        if (t === 'workout_template_exercises') return {
          delete: () => { const c = { eq: () => c, select: () => Promise.resolve({ data: [], error: null }) }; return c },
        }
        return orig(t)
      }
      const origClone = window._cloneSharedMasterTemplate
      window._cloneSharedMasterTemplate = async () => { cloneAttempted = true; return { id: 'CLONE' } }
      const seen = []
      const origErr = log.error
      log.error = (fn, msg, meta) => { seen.push(fn + '|' + msg); return origErr(fn, msg, meta) }
      window._templateCtx = { phaseWorkoutId: 'slot-1', isClientPlan: false }
      try {
        const out = await _resolveEditableTemplateId('FOREIGN', 'ex1')
        return { out, cloneAttempted, seen: seen.join(',') }
      } finally {
        db.from = orig; window._cloneSharedMasterTemplate = origClone
        log.error = origErr; window._templateCtx = {}
      }
    })

    // The load-bearing assertion: nothing was WRITTEN. A refusal that still clones has not prevented
    // anything — the orphan is the damage.
    expect(r.cloneAttempted, 'it must refuse BEFORE cloning, not clean up after').toBe(false)
    expect(r.seen, 'and say why').toContain('_resolveEditableTemplateId|refusing to fork a template we do not own')
    expect(r.out.templateId, 'the caller gets the original id back, unchanged').toBe('FOREIGN')
  })

  test('moveTemplateExercise refuses a template owned by another coach, at the app layer', async ({ browser }) => {
    const pt2Ctx = await browser.newContext()
    const ptCtx = await browser.newContext()
    try {
      const pt2Page = await pt2Ctx.newPage()
      await loginAsPT2(pt2Page)
      foreignTemplateId = await pt2Page.evaluate(async (name) => {
        const { data } = await db.from('workout_templates')
          .insert({ coach_id: currentUser.id, name, is_personal: false }).select('id').single()
        return data?.id || null
      }, tag)
      expect(foreignTemplateId).not.toBeNull()

      const ptPage = await ptCtx.newPage()
      await loginAsPT(ptPage)
      const result = await ptPage.evaluate(async (tid) => {
        // moveTemplateExercise has no error element — it is a drag-reorder. Its refusal is a log.error,
        // so capture that rather than re-typing the guard's logic in the test (a test that re-states
        // the source is decorative; this project has shipped three of those).
        const seen = []
        const orig = log.error
        log.error = (fn, msg, meta) => { seen.push(fn + '|' + msg); return orig(fn, msg, meta) }
        try {
          await moveTemplateExercise(tid, '00000000-0000-0000-0000-000000000001', 1)
        } finally { log.error = orig }
        return { seen }
      }, foreignTemplateId)

      expect(result.seen.join(','), 'moveTemplateExercise must log an ownership refusal and return')
        .toContain('moveTemplateExercise|ownership check failed')
    } finally {
      await ptCtx.close().catch(() => {})
      await pt2Ctx.close().catch(() => {})
    }
  })
})
