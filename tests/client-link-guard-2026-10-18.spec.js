// A coach cannot point an event, a workout template or a goal at ANOTHER coach's client (data-leak audit, 2026-10-18; scripts/add-client-link-guard-2026-10-18.sql).
//
// The owner policies on these three tables pinned who owns the ROW but not whose client it is linked to, and permissive policies are OR'd, so a coach could UPDATE an owned event
// or template to another coach's client (found by reading the live policies, confirmed against the real API with these two test coaches), and could INSERT a template there.
// The guard trigger refuses the move. This spec runs against the real database: it is RED until that script has been applied and GREEN after.
//
// Fixtures: this test's OWN data, tagged [E2E]: coach B (PT2) owns a "victim" client; coach A (PT) owns a client, an event, a template and a goal on it. afterEach removes everything by tag from
// each owner's side and ASSERTS the row counts.
const { test, expect } = require('./fixtures')
const { loginAsPT, loginAsPT2 } = require('./helpers')

let TAG = null
let MADE_VICTIM = false
test.beforeEach(() => { TAG = '[E2E] LinkGuard ' + Date.now() + '-' + Math.random().toString(36).slice(2, 6); MADE_VICTIM = false })

const sweep = (page, tag) => page.evaluate(async (tag) => {
  const ev = ((await db.from('events').delete().ilike('title', tag + '%').select('id')).data || []).length
  const tp = ((await db.from('workout_templates').delete().ilike('name', tag + '%').select('id')).data || []).length
  const gl = ((await db.from('goals').delete().ilike('title', tag + '%').select('id')).data || []).length
  const cl = ((await db.from('clients').delete().ilike('full_name', tag + '%').select('id')).data || []).length
  return { ev, tp, gl, cl }
}, tag)

test.afterEach(async ({ browser }) => {
  if (!TAG) return
  const tag = TAG; TAG = null
  const c1 = await browser.newContext(), c2 = await browser.newContext()
  try {
    const a = await c1.newPage(), b = await c2.newPage()
    await loginAsPT(a); await loginAsPT2(b)
    const ra = await sweep(a, tag), rb = await sweep(b, tag)
    console.log(`[link-guard] cleanup ${tag}: A ${JSON.stringify(ra)} B ${JSON.stringify(rb)}`)
    const left = await a.evaluate(async (tag) => (await db.from('events').select('id').ilike('title', tag + '%')).data?.length || 0, tag)
    expect(left, 'cleanup must leave no event of this test behind').toBe(0)
    if (MADE_VICTIM) expect(rb.cl, 'the victim client must have been removed').toBe(1)
  } finally {
    for (const c of [c1, c2]) { try { await c.close() } catch (err) { console.warn('[link-guard] could not close a cleanup context:', err.message) } }
  }
})

test('a coach cannot link an event, a template or a goal to another coach\'s client, and everything legitimate still works', async ({ browser }) => {
  const c1 = await browser.newContext(), c2 = await browser.newContext()
  try {
    const a = await c1.newPage(), b = await c2.newPage()
    await loginAsPT(a); await loginAsPT2(b)

    const victim = await b.evaluate(async (tag) => {
      const { data, error } = await db.from('clients').insert({ coach_id: currentUser.id, full_name: tag + ' victim', status: 'active' }).select('id').single()
      return { id: data?.id, error: error?.message }
    }, TAG)
    expect(victim.id, victim.error).toBeTruthy()
    MADE_VICTIM = true

    const mine = await a.evaluate(async (tag) => {
      const uid = currentUser.id, today = _ymdLocal(new Date())
      const cl = await db.from('clients').insert({ coach_id: uid, full_name: tag + ' mine', status: 'active' }).select('id').single()
      if (cl.error) return { error: 'client: ' + cl.error.message }
      const ev = await db.from('events').insert({ title: tag + ' event', date: today, type: 'session', client_id: cl.data.id, notes: null, is_pt_assigned: true, created_by: uid }).select('id').single()
      const tp = await db.from('workout_templates').insert({ coach_id: uid, client_id: cl.data.id, name: tag + ' template', description: 'probe' }).select('id').single()
      const gl = await db.from('goals').insert({ client_id: cl.data.id, created_by: uid, title: tag + ' goal', goal_type: 'custom', priority: 1, status: 'active' }).select('id').single()
      return { clientId: cl.data.id, eventId: ev.data?.id, templateId: tp.data?.id, goalId: gl.data?.id, errors: [ev.error, tp.error, gl.error].filter(Boolean).map(e => e.message) }
    }, TAG)
    expect(mine.clientId, mine.error).toBeTruthy()
    expect(mine.errors, 'POSITIVE CONTROL: the coach can create an event, a template and a goal for their OWN client').toEqual([])

    // Each attempt reports what the database said. A refusal by the guard says so in words; a row-level-security refusal would not.
    const attempts = await a.evaluate(async ({ tag, mine, victimId }) => {
      const out = {}
      const say = (r) => ({ error: r.error ? (r.error.code + ' ' + r.error.message) : null, rows: (r.data || []).length })
      out.eventUpdate = say(await db.from('events').update({ client_id: victimId }).eq('id', mine.eventId).select('id'))
      out.templateUpdate = say(await db.from('workout_templates').update({ client_id: victimId }).eq('id', mine.templateId).select('id'))
      out.goalUpdate = say(await db.from('goals').update({ client_id: victimId }).eq('id', mine.goalId).select('id'))
      out.templateInsert = say(await db.from('workout_templates').insert({ coach_id: currentUser.id, client_id: victimId, name: tag + ' planted' }).select('id'))
      out.eventInsert = say(await db.from('events').insert({ title: tag + ' planted', date: _ymdLocal(new Date()), type: 'session', client_id: victimId, is_pt_assigned: true, created_by: currentUser.id }).select('id'))
      return out
    }, { tag: TAG, mine, victimId: victim.id })
    for (const k of ['eventUpdate', 'templateUpdate', 'goalUpdate', 'templateInsert', 'eventInsert']) {
      expect(attempts[k].error, `${k}: must be refused`).toBeTruthy()
      expect(attempts[k].rows, `${k}: must change no row`).toBe(0)
    }
    for (const k of ['eventUpdate', 'templateUpdate', 'goalUpdate', 'templateInsert']) {
      expect(attempts[k].error, `${k}: refused BY THE GUARD (not by an incidental policy)`).toMatch(/client_id must belong to one of your own clients/)
    }

    // The rows are where they were, and the victim's coach sees none of it.
    const where = await a.evaluate(async ({ mine }) => ({
      ev: (await db.from('events').select('client_id').eq('id', mine.eventId).single()).data?.client_id,
      tp: (await db.from('workout_templates').select('client_id').eq('id', mine.templateId).single()).data?.client_id,
      gl: (await db.from('goals').select('client_id').eq('id', mine.goalId).single()).data?.client_id,
    }), { mine })
    expect(where, 'every row stays linked to its own client').toEqual({ ev: mine.clientId, tp: mine.clientId, gl: mine.clientId })
    const seen = await b.evaluate(async (tag) => ({
      ev: (await db.from('events').select('id').ilike('title', tag + '%')).data?.length || 0,
      tp: (await db.from('workout_templates').select('id').ilike('name', tag + '%')).data?.length || 0,
      gl: (await db.from('goals').select('id').ilike('title', tag + '%')).data?.length || 0,
    }), TAG)
    expect(seen, 'the other coach sees nothing of this coach\'s rows').toEqual({ ev: 0, tp: 0, gl: 0 })

    // Legitimate edits still work: naming client_id with its CURRENT value is not a re-point, and a plain edit never fires the guard.
    const legit = await a.evaluate(async ({ mine }) => {
      const say = (r) => r.error ? (r.error.code + ' ' + r.error.message) : 'ok'
      return {
        eventTitle: say(await db.from('events').update({ notes: 'edited' }).eq('id', mine.eventId)),
        sameClient: say(await db.from('events').update({ client_id: mine.clientId, notes: 'edited again' }).eq('id', mine.eventId)),
        templateName: say(await db.from('workout_templates').update({ description: 'edited' }).eq('id', mine.templateId)),
        goalTitle: say(await db.from('goals').update({ description: 'edited' }).eq('id', mine.goalId)),
      }
    }, { mine })
    expect(legit, 'POSITIVE CONTROL: ordinary edits are untouched').toEqual({ eventTitle: 'ok', sameClient: 'ok', templateName: 'ok', goalTitle: 'ok' })
  } finally {
    for (const c of [c1, c2]) { try { await c.close() } catch (err) { console.warn('[link-guard] could not close a context:', err.message) } }
  }
})

// The guard must not refuse the LEGITIMATE user: this account (the master PT) is also a Personal (solo) account, so it holds its OWN record (clients.user_id = its uid,
// coach_id null) and links rows to it all the time; and a row linked to no client at all is a coach's own personal event or template. Both must still be written.
test('the guard still lets a coach link rows to their OWN personal record, and leaves client-less rows alone', async ({ browser }) => {
  const c1 = await browser.newContext()
  try {
    const a = await c1.newPage()
    await loginAsPT(a)
    const r = await a.evaluate(async (tag) => {
      const uid = currentUser.id, today = _ymdLocal(new Date()), own = window._soloClientId
      const say = (x) => x.error ? (x.error.code + ' ' + x.error.message) : 'ok'
      const out = { haveOwnRecord: !!own }
      // is_pt_assigned false is what saveClientEvent writes for a client's or a Personal account's own event (a PT-assigned event on a record the PT does not coach is another policy's refusal)
      out.eventToOwnRecord = say(await db.from('events').insert({ title: tag + ' own-record event', date: today, type: 'session', client_id: own, is_pt_assigned: false, created_by: uid }))
      out.eventNoClient = say(await db.from('events').insert({ title: tag + ' no-client event', date: today, type: 'session', client_id: null, is_pt_assigned: true, created_by: uid }))
      out.templateToOwnRecord = say(await db.from('workout_templates').insert({ coach_id: uid, client_id: own, name: tag + ' own-record template', description: 'probe' }))
      out.templateNoClient = say(await db.from('workout_templates').insert({ coach_id: uid, client_id: null, name: tag + ' no-client template', description: 'probe' }))
      out.goalToOwnRecord = say(await db.from('goals').insert({ client_id: own, created_by: uid, title: tag + ' own-record goal', goal_type: 'custom', priority: 1, status: 'active' }))
      return out
    }, TAG)
    expect(r, 'POSITIVE CONTROL: the coach\'s own record and a client-less row are accepted').toEqual({
      haveOwnRecord: true, eventToOwnRecord: 'ok', eventNoClient: 'ok', templateToOwnRecord: 'ok', templateNoClient: 'ok', goalToOwnRecord: 'ok'
    })
  } finally {
    try { await c1.close() } catch (err) { console.warn('[link-guard] could not close a context:', err.message) }
  }
})
