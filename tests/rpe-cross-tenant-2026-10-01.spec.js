// Can an UNRELATED coach reach the RPE top-set feature's data? (2026-10-01)
//
// The feature added no new table and no new write path, and three reviewers found no tenancy defect by reading the
// code. This is the same question asked of the running system: a second, unrelated coach (PT2) tries every route the
// feature uses — the app's own "Save as my 1RM" function, a raw INSERT, an UPDATE, a DELETE, and reads of the victim's
// 1RMs, template sets and library — against a victim that THIS TEST created.
//
// The victim is a fixture client, exercise, template and 1RM made here and removed here, never a real record: if a
// future RLS regression made any of these succeed, the only thing it can touch is a row this test is about to delete,
// and cleanup deletes by the victim's id whatever the attack did. (The older cross-tenant probes derive their
// cleanup id from the INSERT under test, so a permissive policy strands a junk row on a real client.)
//
// A POSITIVE CONTROL runs the IDENTICAL attack as the victim's rightful owner and requires it to SUCCEED. Without it,
// "everything returned zero" proves nothing: a typo in the attack script produces the same zeros. With it, a zero for
// the unrelated coach means the policy refused, because the very same call visibly works for the owner.
//
// Every attempt by the stranger must fail CLOSED: no rows written, no rows changed, no rows read.
const { test, expect } = require('./fixtures')
const { loginAsPT, loginAsPT2 } = require('./helpers')
const S = require('./rpe-journey-steps')

const pending = []

test.afterEach(async ({ browser }) => {
  if (!pending.length) return
  const jobs = pending.splice(0)
  const ctx = await browser.newContext()
  try {
    const page = await ctx.newPage()
    await loginAsPT(page)
    for (const j of jobs) {
      try { console.log(`[rpe-xtenant] cleanup ${j.tag}: ${JSON.stringify(await S.cleanupJourney(page, j))}`) }
      catch (err) { console.warn(`[rpe-xtenant] CLEANUP FAILED for ${j.tag} — rows may remain in the test account:`, err.message) }
    }
  } finally {
    try { await ctx.close() } catch (err) { console.warn('[rpe-xtenant] could not close the cleanup context:', err.message) }
  }
})

// Everything the feature creates, made by its rightful owner (the PT).
async function makeVictim(pt, { tag, exName, tplName }) {
  return pt.evaluate(async ({ tag, exName, tplName }) => {
    const must = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data }
    const ex = must(await db.from('exercises').insert({ coach_id: currentUser.id, name: exName, metric_type: 'weight_reps' }).select('id').single(), 'exercise')
    const client = must(await db.from('clients').insert({ coach_id: currentUser.id, full_name: tag + ' Victim' }).select('id').single(), 'client')
    const rm = must(await db.from('client_1rms').insert({ client_id: client.id, exercise_id: ex.id, exercise_name: exName, one_rm_kg: 100, recorded_at: new Date().toISOString().split('T')[0] }).select('id').single(), '1rm')
    const tpl = must(await db.from('workout_templates').insert({ coach_id: currentUser.id, name: tplName }).select('id').single(), 'template')
    must(await db.from('workout_template_exercises').insert({
      template_id: tpl.id, exercise_id: ex.id, exercise_name: exName, exercise_type: 'strength', metric_type: 'weight_reps', order_index: 0,
      sets_json: [{ repsMin: 3, isTopSet: true, effortType: 'rpe', effortMin: 8, intensityBasis: 'stored' }, { repsMin: 8, intensityMin: 70, intensityBasis: 'topSet' }]
    }).select('id'), 'template exercise')
    return { exId: ex.id, clientId: client.id, rmId: rm.id, tplId: tpl.id, coachId: currentUser.id }
  }, { tag, exName, tplName })
}

// The SAME attack, run by whoever's page is passed in. Returns what each route achieved.
function runAttack(page, v, exName) {
  return page.evaluate(async ({ v, exName }) => {
    const out = {}
    const today = new Date().toISOString().split('T')[0]
    // 1. the app's OWN "Save as my 1RM" function, pointed at the victim's client
    await _savePostSessionOneRM(0, v.clientId, exName + ' via-app', 999, v.exId)
    out.viaApp = (await db.from('client_1rms').select('id').eq('client_id', v.clientId).eq('exercise_name', exName + ' via-app')).data?.length || 0
    // 2. a raw INSERT into the victim's 1RMs
    const ins = await db.from('client_1rms').insert({ client_id: v.clientId, exercise_id: v.exId, exercise_name: exName + ' raw', one_rm_kg: 998, recorded_at: today }).select('id')
    out.rawInsert = ins.data?.length || 0
    out.rawInsertError = ins.error?.message || null
    // 3. READ the victim's 1RMs, top-set template rows, library entry and client record
    out.read = {
      rms: (await db.from('client_1rms').select('id').eq('client_id', v.clientId)).data?.length || 0,
      tplEx: (await db.from('workout_template_exercises').select('sets_json').eq('template_id', v.tplId)).data?.length || 0,
      ex: (await db.from('exercises').select('id').eq('id', v.exId)).data?.length || 0,
      client: (await db.from('clients').select('id').eq('id', v.clientId)).data?.length || 0
    }
    // 4. the new lookup helper takes a coachId — hand it the VICTIM's coach and the victim's exercise name
    out.lookupFound = !!(await _findExerciseByName(v.coachId, false, exName)).row
    // 5. change and delete the victim's real 1RM
    out.update = (await db.from('client_1rms').update({ one_rm_kg: 1 }).eq('id', v.rmId).select('id')).data?.length || 0
    out.delete = (await db.from('client_1rms').delete().eq('id', v.rmId).select('id')).data?.length || 0
    return out
  }, { v, exName })
}

test.describe('RPE top set — cross-tenant', () => {
  // ── the CONTROL: the owner can do all of it. If this fails, the probe is broken and the next test means nothing. ──
  test('POSITIVE CONTROL — the rightful owner running the identical attack SUCCEEDS on every route', async ({ browser }) => {
    const names = S.journeyTag('[E2E] RPE-XTenantCtl')
    const ctx = await browser.newContext()
    try {
      const pt = await ctx.newPage(); await loginAsPT(pt)
      const v = await makeVictim(pt, names)
      pending.push({ tag: names.tag, exId: v.exId, fixtureClientId: v.clientId })
      const r = await runAttack(pt, v, names.exName)
      expect(r.viaApp, 'the owner\'s "Save as my 1RM" must write the row').toBe(1)
      expect(r.rawInsert, `the owner's raw INSERT must write (${r.rawInsertError})`).toBe(1)
      expect(r.read, 'the owner must read all of it').toEqual({ rms: 3, tplEx: 1, ex: 1, client: 1 })
      expect(r.lookupFound, 'the lookup helper must find the owner\'s own exercise').toBe(true)
      expect(r.update, 'the owner can update their client\'s 1RM').toBe(1)
      expect(r.delete, 'the owner can delete it').toBe(1)
    } finally {
      try { await ctx.close() } catch (err) { console.warn('[rpe-xtenant] could not close a context:', err.message) }
    }
  })

  test("an UNRELATED coach cannot write, change, delete or read the victim's top-set data through ANY route the feature uses", async ({ browser }) => {
    const names = S.journeyTag('[E2E] RPE-XTenant')
    const ptCtx = await browser.newContext()
    const pt2Ctx = await browser.newContext()
    try {
      const pt = await ptCtx.newPage(); await loginAsPT(pt)
      const pt2 = await pt2Ctx.newPage(); await loginAsPT2(pt2)
      const v = await makeVictim(pt, names)
      pending.push({ tag: names.tag, exId: v.exId, fixtureClientId: v.clientId })

      const a = await runAttack(pt2, v, names.exName)

      expect(a.viaApp, 'the app\'s own save function must write nothing for a stranger').toBe(0)
      expect(a.rawInsert, `a raw INSERT into the victim's 1RMs must write nothing (${a.rawInsertError})`).toBe(0)
      expect(a.update, "an UPDATE of the victim's 1RM must change nothing").toBe(0)
      expect(a.delete, "a DELETE of the victim's 1RM must remove nothing").toBe(0)
      expect(a.read, 'the unrelated coach must READ none of the victim\'s rows').toEqual({ rms: 0, tplEx: 0, ex: 0, client: 0 })
      expect(a.lookupFound, "the lookup helper must not reveal another coach's exercise").toBe(false)

      // ── the owner's view afterwards: untouched ─────────────────────────────────────────────────
      const after = await pt.evaluate(async (clientId) => (await db.from('client_1rms').select('id, exercise_name, one_rm_kg').eq('client_id', clientId)).data, v.clientId)
      expect(after.length, 'exactly the one seeded 1RM, no attacker rows').toBe(1)
      expect(after[0].id).toBe(v.rmId)
      expect(Number(after[0].one_rm_kg), 'and its value untouched').toBe(100)
    } finally {
      for (const c of [ptCtx, pt2Ctx]) { try { await c.close() } catch (err) { console.warn('[rpe-xtenant] could not close a context:', err.message) } }
    }
  })
})
