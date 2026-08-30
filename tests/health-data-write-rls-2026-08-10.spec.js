// 2026-08-10 — behavioural RLS audit of the CLIENT HEALTH DATA write surface.
//
// The 2026-08-09 weekly full-file review found seven write functions in app-progress.js with zero
// app-level ownership anchor, and explicitly left the question open: "Needs the same live 2-account
// probe used for that 2026-07-30 incident before deciding whether this is a real hole or
// defense-in-depth-only."
//
//   save1RM            client_1rms      UPDATE .eq('id')  / INSERT client_id from an unverified param
//   delete1RM          client_1rms      DELETE .eq('id')  -- no anchor
//   savePerformanceLog performance_logs INSERT client_id from an unverified param
//   deletePerfLog      performance_logs DELETE .eq('id')  -- no anchor
//   saveWeightLog      weight_logs      INSERT client_id from an unverified param
//   deleteWeightLog    weight_logs      DELETE .eq('id')  -- no anchor
//   saveWeightGoals    clients          UPDATE .eq('id')  -- no anchor, and this is a TENANCY table
//
// Why this one matters more than the others: weights, body fat, personal bests and 1RMs are
// special-category health data under UK GDPR (CRITICAL.md). A cross-tenant write here is not a UX
// bug. Both CRITICAL gaps found this year (workout_logs 2026-07-30, events 2026-08-02) were
// "reasoned safe" until a live two-account probe proved otherwise.
//
// Every operation is probed SEPARATELY and RAW (bypassing the app, so this tests the POLICY rather
// than the app's own guards). sql-safety is explicit that a working INSERT does not imply UPDATE or
// DELETE also work -- they are distinct policies.
//
// Attack directions:
//   1. PT2  -- an unrelated coach who owns nothing.
//   2. The E2E client -- a REAL client of this coach, attacking a DIFFERENT client of the same coach
//      (the cross-client direction; a client writing their OWN health data is legitimate).
const { test, expect } = require('@playwright/test')
const { loginAsPT, loginAsPT2, loginAsClient } = require('./helpers')

const TAG = '[E2E] HealthRLS'

test.describe('client health data write surface — behavioural RLS probe', () => {
  test('an unrelated coach and another client are both refused writes to a client\'s health data', async ({ page, browser }) => {
    await loginAsPT(page)

    // ── Victim: a client of this coach that is NOT the logged-in E2E client account ──────────
    // (a client writing their own health data is legitimate; the question is cross-client).
    const fx = await page.evaluate(async (TAG) => {
      const { data: all } = await db.from('clients').select('id, user_id, starting_weight_kg, goal_weight_kg')
        .eq('coach_id', currentUser.id)
      // OWNS ITS VICTIM as of 2026-08-30. This used to BORROW any existing coach-owned client with no
      // user_id. That worked only because [E2E] debris happened to be lying around: once 18 stale
      // fixture clients were reaped the account had exactly one client, it HAS a user_id, and this
      // test failed with "no non-login client available as victim" — a fixture failure dressed as a
      // security-test failure. Borrowing shared data is the anti-pattern that caused real flakiness
      // here before; it also makes a security test silently dependent on litter.
      let victim = (all || []).find(c => !c.user_id)          // no user_id => not the E2E login
      let createdVictim = false
      if (!victim) {
        const { data: made, error: mkErr } = await db.from('clients')
          .insert({ coach_id: currentUser.id, full_name: TAG + ' Victim' })
          .select('id, user_id, starting_weight_kg, goal_weight_kg').single()
        if (mkErr) return { fail: 'could not create a victim client: ' + mkErr.message }
        victim = made
        createdVictim = true
      }

      const today = new Date().toISOString().split('T')[0]
      const errs = []
      const { data: oneRm, error: e1 } = await db.from('client_1rms').insert({
        client_id: victim.id, exercise_name: TAG + ' Squat', one_rm_kg: 100, recorded_at: today
      }).select('id').single()
      if (e1) errs.push('client_1rms: ' + e1.message)
      const { data: perf, error: e2 } = await db.from('performance_logs').insert({
        client_id: victim.id, logged_by: currentUser.id, date: today,
        category: 'strength', name: TAG + ' Bench', value: 80, unit: 'kg'
      }).select('id').single()
      if (e2) errs.push('performance_logs: ' + e2.message)
      const { data: wl, error: e3 } = await db.from('weight_logs').insert({
        client_id: victim.id, date: today, weight_kg: 80, notes: TAG
      }).select('id').single()
      if (e3) errs.push('weight_logs: ' + e3.message)
      if (errs.length) return { fail: errs.join(' || ') }

      return {
        clientId: victim.id, createdVictim, oneRmId: oneRm?.id, perfId: perf?.id, weightId: wl?.id,
        origStart: victim.starting_weight_kg, origGoal: victim.goal_weight_kg,
      }
    }, TAG)
    if (fx.fail) { console.log('FIXTURE FAILED:', fx.fail); expect(fx.fail).toBeFalsy() }
    expect(fx.oneRmId && fx.perfId && fx.weightId).toBeTruthy()

    const attack = async (loginFn, label) => {
      const ctx = await browser.newContext()
      try {
        const p = await ctx.newPage()
        await loginFn(p)
        return await p.evaluate(async (f) => {
          const out = {}
          const rows = r => (r.data || []).length
          // client_1rms — UPDATE, DELETE, INSERT are three separate policies.
          out.rm_update = rows(await db.from('client_1rms').update({ one_rm_kg: 999 }).eq('id', f.oneRmId).select())
          out.rm_delete = rows(await db.from('client_1rms').delete().eq('id', f.oneRmId).select())
          out.rm_insert = rows(await db.from('client_1rms').insert({
            client_id: f.clientId, exercise_name: 'PWNED', one_rm_kg: 1,
            recorded_at: new Date().toISOString().split('T')[0] }).select())
          // performance_logs
          out.pf_delete = rows(await db.from('performance_logs').delete().eq('id', f.perfId).select())
          out.pf_insert = rows(await db.from('performance_logs').insert({
            client_id: f.clientId, date: new Date().toISOString().split('T')[0],
            category: 'strength', name: 'PWNED', value: 1, unit: 'kg' }).select())
          // weight_logs — special-category health data
          out.wl_delete = rows(await db.from('weight_logs').delete().eq('id', f.weightId).select())
          out.wl_insert = rows(await db.from('weight_logs').insert({
            client_id: f.clientId, date: new Date().toISOString().split('T')[0], weight_kg: 999 }).select())
          // clients — a TENANCY table; saveWeightGoals updates it by id with no anchor.
          out.cl_update = rows(await db.from('clients')
            .update({ starting_weight_kg: 999, goal_weight_kg: 999 }).eq('id', f.clientId).select())
          return out
        }, fx)
      } finally { await ctx.close() }
    }

    let results = {}
    try {
      results.pt2 = await attack(loginAsPT2, 'PT2')
      results.client = await attack(loginAsClient, 'CLIENT')

      // ── Verdict, read back as the legitimate owning coach ────────────────────────────────
      const after = await page.evaluate(async (f) => {
        const one = (await db.from('client_1rms').select('id, one_rm_kg').eq('id', f.oneRmId)).data || []
        const pf  = (await db.from('performance_logs').select('id').eq('id', f.perfId)).data || []
        const wl  = (await db.from('weight_logs').select('id').eq('id', f.weightId)).data || []
        const cl  = (await db.from('clients').select('starting_weight_kg, goal_weight_kg').eq('id', f.clientId)).data || []
        const injected =
          ((await db.from('client_1rms').select('id').eq('client_id', f.clientId).eq('exercise_name', 'PWNED')).data || []).length +
          ((await db.from('performance_logs').select('id').eq('client_id', f.clientId).eq('name', 'PWNED')).data || []).length +
          ((await db.from('weight_logs').select('id').eq('client_id', f.clientId).eq('weight_kg', 999)).data || []).length
        return {
          oneRmSurvives: one.length === 1, oneRmValue: one[0]?.one_rm_kg,
          perfSurvives: pf.length === 1, weightSurvives: wl.length === 1,
          clientStart: cl[0]?.starting_weight_kg, clientGoal: cl[0]?.goal_weight_kg,
          injectedRows: injected,
        }
      }, fx)

      console.log('PT2    attempts:', JSON.stringify(results.pt2))
      console.log('CLIENT attempts:', JSON.stringify(results.client))
      console.log('AFTER  state   :', JSON.stringify(after))

      expect(after.oneRmSurvives).toBe(true)
      expect(Number(after.oneRmValue)).toBe(100)        // not overwritten to 999
      expect(after.perfSurvives).toBe(true)
      expect(after.weightSurvives).toBe(true)
      expect(after.injectedRows).toBe(0)                // nothing planted against this client
      expect(after.clientStart).not.toBe(999)           // clients row not hijacked
      expect(after.clientGoal).not.toBe(999)
    } finally {
      // Restore the victim's real goal values no matter what, then drop the fixtures.
      await page.evaluate(async (f) => {
        await db.from('clients').update({
          starting_weight_kg: f.origStart ?? null, goal_weight_kg: f.origGoal ?? null
        }).eq('id', f.clientId)
        if (f.oneRmId)  await db.from('client_1rms').delete().eq('id', f.oneRmId)
        if (f.perfId)   await db.from('performance_logs').delete().eq('id', f.perfId)
        if (f.weightId) await db.from('weight_logs').delete().eq('id', f.weightId)
        // Sweep anything an attack managed to plant, so a failure never strands rows on a real client.
        await db.from('client_1rms').delete().eq('client_id', f.clientId).eq('exercise_name', 'PWNED')
        await db.from('performance_logs').delete().eq('client_id', f.clientId).eq('name', 'PWNED')
        await db.from('weight_logs').delete().eq('client_id', f.clientId).eq('weight_kg', 999)
        // Reap the victim only if THIS run created it — never a client that already existed, which
        // would turn a security test into a destructive one. Rowcount-checked: a refused delete
        // returns { data: [], error: null } and would report success while leaving the row behind,
        // which is precisely how 18 stale fixture clients accumulated in the first place.
        if (f.createdVictim) {
          const { data: gone } = await db.from('clients')
            .delete().eq('id', f.clientId).eq('coach_id', currentUser.id).select('id')
          if (!(gone || []).length) console.error('CLEANUP: victim client not reaped', f.clientId)
        }
      }, fx)
    }
  })
})
