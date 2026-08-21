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
        await db.from('workout_templates').delete().eq('coach_id', currentUser.id).eq('name', name)
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
