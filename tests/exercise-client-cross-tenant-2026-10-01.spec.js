// What can a CLIENT do to the exercise library — their own coach's, and an unrelated coach's? (2026-10-01)
//
// A client may create exercises in their COACH's library (the runner's "Add exercise" does it), which makes an exercise NAME
// client-authored text that the coach later sees. The policy text Jake read from the live project says the INSERT is allowed only
// for `coach_id IN (the client's own coach)`, that a client can SELECT only that coach's exercises, and that a client has no
// UPDATE or DELETE policy at all. The earlier cross-tenant probe (rpe-cross-tenant-2026-10-01.spec.js) attacks as an unrelated
// COACH; this one attacks as the CLIENT, and proves the policy text by behaviour rather than by reading it.
//
// POSITIVE CONTROLS: the same client, the same call, aimed at their OWN coach, must SUCCEED — otherwise "refused" could just mean
// "this probe is broken". Every fixture carries a unique [E2E tag and is removed by its owner with the row count read back.
const { test, expect } = require('./fixtures')
const { loginAsPT, loginAsPT2, loginAsClient } = require('./helpers')

const pending = { ptTag: null, pt2Tag: null }

test.afterEach(async ({ browser }) => {
  const jobs = [['pt', loginAsPT, pending.ptTag], ['pt2', loginAsPT2, pending.pt2Tag]].filter(j => j[2])
  pending.ptTag = null; pending.pt2Tag = null
  for (const [who, login, tag] of jobs) {
    const ctx = await browser.newContext()
    try {
      const page = await ctx.newPage()
      await login(page)
      const r = await page.evaluate(async (tag) => {
        const { data, error } = await db.from('exercises').delete().ilike('name', tag + '%').select('id')
        return { n: (data || []).length, error: error?.message || null }
      }, tag)
      console.log(`[exercise-client-xtenant] cleanup as ${who} ${tag}: ${JSON.stringify(r)}`)
    } catch (err) {
      console.warn(`[exercise-client-xtenant] CLEANUP FAILED as ${who} for ${tag} — rows may remain in the test account:`, err.message)
    } finally {
      try { await ctx.close() } catch (err) { console.warn('[exercise-client-xtenant] could not close a context:', err.message) }
    }
  }
})

test("a CLIENT can add to their OWN coach's library but not an unrelated coach's, and cannot read, change or delete another library", async ({ browser }) => {
  const stamp = Date.now() + '-' + Math.random().toString(36).slice(2, 6)
  const ptTag = `[E2E] ClientXT-own ${stamp}`
  const pt2Tag = `[E2E] ClientXT-other ${stamp}`
  pending.ptTag = ptTag; pending.pt2Tag = pt2Tag
  const ptCtx = await browser.newContext(), pt2Ctx = await browser.newContext(), clCtx = await browser.newContext()
  try {
    const pt = await ptCtx.newPage(); await loginAsPT(pt)
    const pt2 = await pt2Ctx.newPage(); await loginAsPT2(pt2)
    const cl = await clCtx.newPage(); await loginAsClient(cl)

    const pt2Id = await pt2.evaluate(() => currentUser.id)
    const ownCoachId = await cl.evaluate(async () => {
      const { data } = await db.from('clients').select('coach_id').eq('user_id', currentUser.id).not('coach_id', 'is', null).maybeSingle()
      return data?.coach_id || null
    })
    test.skip(!ownCoachId, 'the E2E client has no coach on this deployment — nothing to attack with')
    expect(ownCoachId, 'the unrelated coach must really be a different account').not.toBe(pt2Id)

    // A fixture row in the UNRELATED coach's library, made by that coach, so there is something for the client to try to read.
    await pt2.evaluate(async (name) => {
      const { error } = await db.from('exercises').insert({ coach_id: currentUser.id, name, metric_type: 'weight_reps' })
      if (error) throw new Error('pt2 fixture: ' + error.message)
    }, pt2Tag + ' Fixture')

    // ── POSITIVE CONTROL: aimed at the client's OWN coach, the insert works ───────────────────────
    const own = await cl.evaluate(async ({ coachId, name }) => {
      const r = await db.from('exercises').insert({ coach_id: coachId, name, metric_type: 'weight_reps' }).select('id')
      return { n: (r.data || []).length, id: r.data?.[0]?.id || null, error: r.error?.message || null }
    }, { coachId: ownCoachId, name: ptTag + ' Own' })
    expect(own.n, `the client's insert into their OWN coach's library must work (${own.error})`).toBe(1)

    // ── THE ATTACKS, as the client ────────────────────────────────────────────────────────────────
    const attack = await cl.evaluate(async ({ otherCoach, ownExId, pt2Tag, ptTag }) => {
      const out = {}
      const ins = await db.from('exercises').insert({ coach_id: otherCoach, name: pt2Tag + ' INJECTED', metric_type: 'weight_reps' }).select('id')
      out.insertIntoOther = (ins.data || []).length
      out.insertError = ins.error?.message || null
      out.readOther = (await db.from('exercises').select('id').ilike('name', pt2Tag + '%')).data?.length || 0
      out.readOwn = (await db.from('exercises').select('id').ilike('name', ptTag + '%')).data?.length || 0
      out.updateOwnCoachs = (await db.from('exercises').update({ name: ptTag + ' RENAMED BY CLIENT' }).eq('id', ownExId).select('id')).data?.length || 0
      out.deleteOwnCoachs = (await db.from('exercises').delete().eq('id', ownExId).select('id')).data?.length || 0
      return out
    }, { otherCoach: pt2Id, ownExId: own.id, pt2Tag, ptTag })

    expect(attack.insertIntoOther, `a client must NOT be able to insert into an unrelated coach's library (${attack.insertError})`).toBe(0)
    expect(attack.readOther, "a client must not READ an unrelated coach's exercises").toBe(0)
    expect(attack.readOwn, "POSITIVE CONTROL: a client reads their own coach's exercises (the one they just made)").toBe(1)
    expect(attack.updateOwnCoachs, "a client has no UPDATE policy: they cannot rename an exercise in their coach's library").toBe(0)
    expect(attack.deleteOwnCoachs, 'a client has no DELETE policy: they cannot remove one either').toBe(0)

    // ── the owners' views afterwards: nothing was written, changed or removed ─────────────────────
    const ptView = await pt.evaluate(async (ptTag) => (await db.from('exercises').select('name').ilike('name', ptTag + '%')).data, ptTag)
    expect(ptView.map(r => r.name), "the coach's library holds exactly the client's one legitimate row, unrenamed").toEqual([ptTag + ' Own'])
    const pt2View = await pt2.evaluate(async (pt2Tag) => (await db.from('exercises').select('name').ilike('name', pt2Tag + '%')).data, pt2Tag)
    expect(pt2View.map(r => r.name), "the unrelated coach's library holds only its own fixture — nothing injected").toEqual([pt2Tag + ' Fixture'])
  } finally {
    for (const c of [ptCtx, pt2Ctx, clCtx]) { try { await c.close() } catch (err) { console.warn('[exercise-client-xtenant] could not close a context:', err.message) } }
  }
})
