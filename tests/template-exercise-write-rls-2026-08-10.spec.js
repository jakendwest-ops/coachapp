// 2026-08-10 — behavioural RLS audit of every WRITE to workout_template_exercises.
//
// Why this exists: _propagateExerciseChangeToTemplates (app-workouts.js) does DELETE, UPDATE and
// INSERT keyed on template_id + exercise_name with NO ownership verification and NO error check on
// any of the three, while both its siblings (saveEditTemplateExercise / deleteTemplateExercise) call
// _verifyTemplateOwnership first. It has sat on the ledger since 2026-08-01 as "reasoned as
// RLS-only-defended, not proven".
//
// "Reasoned safe" is exactly what was said about workout_logs and events earlier this year. Both
// turned out to be CONFIRMED EXPLOITABLE, and both were caught only by a live two-account probe —
// never by reading the code. This one DELETES, so it gets the same treatment.
//
// Probes the write surface from two directions that RLS must independently defend:
//   1. An unrelated coach (PT2, owns nothing) against another coach's master template.
//   2. A real client against their own coach's MASTER template — the client→coach direction that has
//      produced 4 separate stored-XSS incidents in this codebase.
// Each is attempted BOTH raw (proving the policy, not the app) and through the real app function
// (proving the reachable path).
const { test, expect } = require('@playwright/test')
const { loginAsPT, loginAsPT2, loginAsClient } = require('./helpers')

const TAG = '[E2E] TexRLS'

async function sweep (page) {
  await page.evaluate(async (TAG) => {
    const { data: tmpls } = await db.from('workout_templates').select('id')
      .eq('coach_id', currentUser.id).like('name', TAG + '%')
    const ids = (tmpls || []).map(t => t.id)
    if (ids.length) {
      await db.from('workout_template_exercises').delete().in('template_id', ids)
      await db.from('workout_templates').delete().in('id', ids)
    }
  }, TAG)
}

test.describe('workout_template_exercises write surface — behavioural RLS probe', () => {
  test('an unrelated coach and a client are both refused DELETE/UPDATE/INSERT on a coach-owned template', async ({ page, browser }) => {
    await loginAsPT(page)
    await sweep(page)

    // ── Victim fixture, owned by PT ────────────────────────────────────────────
    const fx = await page.evaluate(async (TAG) => {
      const { data: tmpl } = await db.from('workout_templates')
        .insert({ coach_id: currentUser.id, is_personal: false, client_id: null, name: TAG + ' Victim' })
        .select('id').single()
      const { data: tex } = await db.from('workout_template_exercises').insert({
        template_id: tmpl.id, exercise_name: TAG + ' Victim Lift', exercise_type: 'strength',
        metric_type: 'weight_reps', order_index: 0, sets: 3,
        sets_json: [{ repsMin: '5', weight: '100' }], notes: 'original'
      }).select('id').single()
      return { tmplId: tmpl.id, texId: tex.id, exName: TAG + ' Victim Lift' }
    }, TAG)

    const results = {}
    try {
      // ── Attacker 1: an unrelated coach who owns nothing ──────────────────────
      const ptx2 = await browser.newContext()
      try {
        const p2 = await ptx2.newPage()
        await loginAsPT2(p2)
        results.pt2 = await p2.evaluate(async (f) => {
          const out = {}
          // RAW — proves the policy itself, not the app's own guards.
          const del = await db.from('workout_template_exercises')
            .delete().eq('template_id', f.tmplId).eq('exercise_name', f.exName).select()
          out.rawDeleteRows = (del.data || []).length
          const upd = await db.from('workout_template_exercises')
            .update({ notes: 'PWNED-pt2' }).eq('template_id', f.tmplId).eq('exercise_name', f.exName).select()
          out.rawUpdateRows = (upd.data || []).length
          const ins = await db.from('workout_template_exercises')
            .insert({ template_id: f.tmplId, exercise_name: 'PWNED-pt2-insert', exercise_type: 'strength',
                      metric_type: 'weight_reps', order_index: 99 }).select()
          out.rawInsertRows = (ins.data || []).length
          out.rawInsertErr = !!ins.error
          // Through the REAL app function — the reachable path.
          await _propagateExerciseChangeToTemplates({ op: 'delete', matchName: f.exName }, [f.tmplId])
          await _propagateExerciseChangeToTemplates({ op: 'update', matchName: f.exName,
            row: { exercise_name: f.exName, notes: 'PWNED-pt2-fanout' } }, [f.tmplId])
          return out
        }, fx)
      } finally { await ptx2.close() }

      // ── Attacker 2: a real client of this coach ──────────────────────────────
      const cctx = await browser.newContext()
      try {
        const cp = await cctx.newPage()
        await loginAsClient(cp)
        results.client = await cp.evaluate(async (f) => {
          const out = {}
          const del = await db.from('workout_template_exercises')
            .delete().eq('template_id', f.tmplId).eq('exercise_name', f.exName).select()
          out.rawDeleteRows = (del.data || []).length
          const upd = await db.from('workout_template_exercises')
            .update({ notes: 'PWNED-client' }).eq('template_id', f.tmplId).eq('exercise_name', f.exName).select()
          out.rawUpdateRows = (upd.data || []).length
          const ins = await db.from('workout_template_exercises')
            .insert({ template_id: f.tmplId, exercise_name: 'PWNED-client-insert', exercise_type: 'strength',
                      metric_type: 'weight_reps', order_index: 98 }).select()
          out.rawInsertRows = (ins.data || []).length
          out.rawInsertErr = !!ins.error
          return out
        }, fx)
      } finally { await cctx.close() }

      // ── Verdict, read back as the legitimate owner ───────────────────────────
      const after = await page.evaluate(async (f) => {
        const { data } = await db.from('workout_template_exercises')
          .select('id, exercise_name, notes').eq('template_id', f.tmplId)
        return {
          rowCount: (data || []).length,
          victimSurvives: (data || []).some(r => r.id === f.texId),
          notes: (data || []).find(r => r.id === f.texId)?.notes,
          injected: (data || []).filter(r => /PWNED/.test(r.exercise_name)).map(r => r.exercise_name),
        }
      }, fx)

      console.log('PT2   attempts:', JSON.stringify(results.pt2))
      console.log('CLIENT attempts:', JSON.stringify(results.client))
      console.log('AFTER  state   :', JSON.stringify(after))

      // The victim must be untouched and nothing injected.
      expect(after.victimSurvives).toBe(true)          // not deleted by anyone
      expect(after.notes).toBe('original')             // not updated by anyone
      expect(after.injected).toEqual([])               // nothing inserted by anyone
      expect(after.rowCount).toBe(1)
    } finally {
      await sweep(page)
    }
  })

  // The OTHER direction, and the one with real history: a client writing to THEIR OWN plan clone.
  // A clone carries client_id = <that client>, and the client-read policy exists for exactly those
  // rows — so read access is intended. Write access is the open question (ledger, 2026-08-01):
  // "can a client write to their own plan clone's workout_template_exercises and have it render,
  // unescaped, in the coach's runner?" That is the client→coach shape behind 4 separate stored-XSS
  // incidents in this codebase (2026-07-13, -18, -23, -28), so it is worth settling behaviourally
  // rather than by reading policies.
  test('a client cannot write to their own plan clone\'s exercises (client→coach write path)', async ({ page, browser }) => {
    await loginAsPT(page)
    await sweep(page)

    // Resolve the client's OWN clients.id from the client session — never guess, and never hardcode.
    const cctx = await browser.newContext()
    let clientId
    try {
      const cp = await cctx.newPage()
      await loginAsClient(cp)
      clientId = await cp.evaluate(async () => {
        const { data } = await db.from('clients').select('id').eq('user_id', currentUser.id).single()
        return data?.id
      })
    } finally { await cctx.close() }
    expect(clientId).toBeTruthy()

    // A plan-clone-shaped template: coach-owned, but stamped to this client.
    const fx = await page.evaluate(async ({ TAG, clientId }) => {
      const { data: tmpl } = await db.from('workout_templates')
        .insert({ coach_id: currentUser.id, is_personal: false, client_id: clientId, name: TAG + ' Clone' })
        .select('id').single()
      const { data: tex } = await db.from('workout_template_exercises').insert({
        template_id: tmpl.id, exercise_name: TAG + ' Clone Lift', exercise_type: 'strength',
        metric_type: 'weight_reps', order_index: 0, sets: 3,
        sets_json: [{ repsMin: '5' }], notes: 'original'
      }).select('id').single()
      return { tmplId: tmpl.id, texId: tex.id, exName: TAG + ' Clone Lift' }
    }, { TAG, clientId })

    try {
      const ctx2 = await browser.newContext()
      let attempts
      try {
        const cp = await ctx2.newPage()
        await loginAsClient(cp)
        attempts = await cp.evaluate(async (f) => {
          const out = {}
          // Can the client even SEE it? (read access is expected and fine)
          const { data: readable } = await db.from('workout_template_exercises')
            .select('id').eq('template_id', f.tmplId)
          out.canRead = (readable || []).length
          // An XSS-shaped payload, so if the write lands we know the exact exposure.
          const payload = '<img src=x onerror=alert(1)>'
          const upd = await db.from('workout_template_exercises')
            .update({ exercise_name: payload, notes: payload }).eq('id', f.texId).select()
          out.updateRows = (upd.data || []).length
          const del = await db.from('workout_template_exercises')
            .delete().eq('id', f.texId).select()
          out.deleteRows = (del.data || []).length
          const ins = await db.from('workout_template_exercises')
            .insert({ template_id: f.tmplId, exercise_name: payload, exercise_type: 'strength',
                      metric_type: 'weight_reps', order_index: 50 }).select()
          out.insertRows = (ins.data || []).length
          return out
        }, fx)
      } finally { await ctx2.close() }

      const after = await page.evaluate(async (f) => {
        const { data } = await db.from('workout_template_exercises')
          .select('id, exercise_name, notes').eq('template_id', f.tmplId)
        return {
          rowCount: (data || []).length,
          survives: (data || []).some(r => r.id === f.texId),
          name: (data || []).find(r => r.id === f.texId)?.exercise_name,
          notes: (data || []).find(r => r.id === f.texId)?.notes,
          injected: (data || []).filter(r => /onerror/.test(r.exercise_name || '')).length,
        }
      }, fx)

      console.log('CLIENT→OWN-CLONE attempts:', JSON.stringify(attempts))
      console.log('AFTER state              :', JSON.stringify(after))

      expect(after.survives).toBe(true)
      expect(after.notes).toBe('original')
      expect(after.name).toBe(fx.exName)
      expect(after.injected).toBe(0)
    } finally {
      await sweep(page)
    }
  })
})
