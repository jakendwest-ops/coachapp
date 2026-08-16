// Programme block history. Jake wants to compare an exercise across two training blocks, but
// re-assigning a programme HARD-DELETES the previous assignment (unique index on
// (client_id, program_id) means a restart cannot keep it), destroying the start_date that defines the
// block's window. workout_logs carries no programme reference at all, so a block can only ever BE a
// date range — which is why that range has to be captured at the moment it would otherwise be lost.
const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

const TAG = '[E2E] blocks'

async function sweep(page, tag) {
  await page.evaluate(async t => {
    const { data: progs } = await db.from('programs').select('id').eq('coach_id', currentUser.id).like('name', t + '%')
    const pIds = (progs || []).map(p => p.id)
    if (pIds.length) {
      const { data: phs } = await db.from('program_phases').select('id').in('program_id', pIds)
      const phIds = (phs || []).map(p => p.id)
      if (phIds.length) {
        await db.from('program_phase_workouts').delete().in('phase_id', phIds)
        await db.from('program_phases').delete().in('id', phIds)
      }
    }
    const { data: cs } = await db.from('clients').select('id').eq('coach_id', currentUser.id).like('full_name', t + '%')
    const cIds = (cs || []).map(c => c.id)
    if (cIds.length) {
      const { data: cps } = await db.from('client_programs').select('id').in('client_id', cIds)
      if (cps?.length) {
        await db.from('client_program_workouts').delete().in('client_program_id', cps.map(x => x.id))
        await db.from('client_programs').delete().in('id', cps.map(x => x.id))
      }
      // client_program_blocks cascades with the client — that cascade is asserted below.
      await db.from('clients').delete().in('id', cIds)
    }
    if (pIds.length) await db.from('programs').delete().in('id', pIds)
  }, tag)
}

test.describe('Programme block history', () => {
  test.afterEach(async ({ page }) => { await sweep(page, TAG) })

  // THE requirement. The old start date must survive the restart that destroys the assignment.
  test('a restart archives the block it replaces, carrying the OLD start date', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(async t => {
      const { data: c } = await db.from('clients').insert({ coach_id: currentUser.id, full_name: t + ' client' }).select('id').single()
      const { data: prog } = await db.from('programs').insert({ coach_id: currentUser.id, is_personal: false, name: t + ' prog' }).select('id, name').single()
      await db.from('program_phases').insert([
        { program_id: prog.id, name: 'Block 1', duration_weeks: 4, order_index: 0 },
        { program_id: prog.id, name: 'Block 2', duration_weeks: 8, order_index: 1 },
      ])
      const { data: cp } = await db.from('client_programs')
        .insert({ client_id: c.id, program_id: prog.id, start_date: '2026-04-01' }).select('id').single()

      const ok = await _removeAssignmentAndClones(cp.id, 'restarted')
      const { data: blocks } = await db.from('client_program_blocks').select('*').eq('client_id', c.id)
      const { data: live } = await db.from('client_programs').select('id').eq('client_id', c.id)
      return { ok, blocks: blocks || [], liveCount: (live || []).length, progName: prog.name }
    }, TAG)

    expect(r.ok, 'the removal must report success').toBe(true)
    expect(r.blocks).toHaveLength(1)
    expect(r.blocks[0].start_date, 'the window that would otherwise be destroyed').toBe('2026-04-01')
    expect(r.blocks[0].program_name).toBe(r.progName)
    expect(r.blocks[0].ended_reason).toBe('restarted')
    expect(r.blocks[0].planned_weeks, 'summed from the phases — 4 + 8').toBe(12)
    expect(r.liveCount, 'the assignment itself is still removed').toBe(0)
  })

  // The subtlest way this design can fail, and it would stay invisible for months. EVERY other foreign
  // key in this area is CASCADE (confirmed against information_schema), so `cascade` would have been
  // the locally-consistent choice — and deleteProgram archives the assignment and THEN deletes the
  // programme, so the history row would be wiped milliseconds after being written.
  test('a block survives its programme being deleted', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(async t => {
      const { data: c } = await db.from('clients').insert({ coach_id: currentUser.id, full_name: t + ' client2' }).select('id').single()
      const { data: prog } = await db.from('programs').insert({ coach_id: currentUser.id, is_personal: false, name: t + ' doomed' }).select('id').single()
      await db.from('program_phases').insert({ program_id: prog.id, name: 'B1', duration_weeks: 6, order_index: 0 })
      const { data: cp } = await db.from('client_programs')
        .insert({ client_id: c.id, program_id: prog.id, start_date: '2026-01-06' }).select('id').single()
      await _removeAssignmentAndClones(cp.id, 'program_deleted')
      await db.from('programs').delete().eq('id', prog.id)
      const { data: blocks } = await db.from('client_program_blocks').select('program_id, program_name, start_date').eq('client_id', c.id)
      return { blocks: blocks || [] }
    }, TAG)

    expect(r.blocks, 'the block must OUTLIVE its programme').toHaveLength(1)
    expect(r.blocks[0].program_id, 'set null, not cascade').toBeNull()
    expect(r.blocks[0].program_name, 'the snapshot is what makes a null program_id survivable').toContain('doomed')
    expect(r.blocks[0].start_date).toBe('2026-01-06')
  })

  // The structural backstop against the 32 stacked self-assignments once found on this account. It is
  // the reason history went in a separate table rather than an archived_at flag: an archived row plus
  // a live one for the same programme would have forced the unique index to become partial.
  test('archiving does not reintroduce stacked assignments', async ({ page }) => {
    await loginAsPT(page)
    const n = await page.evaluate(async t => {
      const { data: c } = await db.from('clients').insert({ coach_id: currentUser.id, full_name: t + ' client3' }).select('id').single()
      const { data: prog } = await db.from('programs').insert({ coach_id: currentUser.id, is_personal: false, name: t + ' stack' }).select('id').single()
      const { data: cp } = await db.from('client_programs')
        .insert({ client_id: c.id, program_id: prog.id, start_date: '2026-02-02' }).select('id').single()
      await _removeAssignmentAndClones(cp.id, 'restarted')
      await db.from('client_programs').insert({ client_id: c.id, program_id: prog.id, start_date: '2026-05-04' })
      const { data } = await db.from('client_programs').select('id').eq('client_id', c.id).eq('program_id', prog.id)
      return (data || []).length
    }, TAG)
    expect(n, 'exactly ONE live assignment per (client, programme), as before').toBe(1)
  })

  // Fail-closed. If the snapshot cannot be written, the assignment must NOT be deleted — losing the
  // history silently in exchange for a successful-looking removal is the one outcome worse than an error.
  test('a failed archive ABORTS the removal instead of deleting anyway', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(async t => {
      const { data: c } = await db.from('clients').insert({ coach_id: currentUser.id, full_name: t + ' client4' }).select('id').single()
      const { data: prog } = await db.from('programs').insert({ coach_id: currentUser.id, is_personal: false, name: t + ' failsafe' }).select('id').single()
      const { data: cp } = await db.from('client_programs')
        .insert({ client_id: c.id, program_id: prog.id, start_date: '2026-03-03' }).select('id').single()

      // Self-returning stub that resolves to an error however the query is shaped — deliberately not a
      // hand-built chain, which would break the moment the insert is reshaped.
      const realFrom = db.from.bind(db)
      const failing = new Proxy({}, {
        get: (_t, prop) => prop === 'then'
          ? (resolve) => resolve({ data: null, error: { message: 'simulated archive failure' } })
          : () => failing,
      })
      db.from = (tbl) => tbl === 'client_program_blocks' ? failing : realFrom(tbl)
      let ok
      try { ok = await _removeAssignmentAndClones(cp.id, 'restarted') } finally { db.from = realFrom }

      const { data: live } = await db.from('client_programs').select('id').eq('id', cp.id)
      return { ok, stillThere: (live || []).length }
    }, TAG)

    expect(r.ok, 'the caller must be told it failed — all four treat false as abort').toBe(false)
    expect(r.stillThere, 'the assignment SURVIVES a failed archive').toBe(1)
  })

  // GDPR erasure must stay complete despite the table having no DELETE policy.
  test('blocks are erased when their client is', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(async t => {
      const { data: c } = await db.from('clients').insert({ coach_id: currentUser.id, full_name: t + ' client5' }).select('id').single()
      const { data: prog } = await db.from('programs').insert({ coach_id: currentUser.id, is_personal: false, name: t + ' gdpr' }).select('id').single()
      const { data: cp } = await db.from('client_programs')
        .insert({ client_id: c.id, program_id: prog.id, start_date: '2026-06-01' }).select('id').single()
      await _removeAssignmentAndClones(cp.id, 'removed')
      const { data: before } = await db.from('client_program_blocks').select('id').eq('client_id', c.id)
      await db.from('clients').delete().eq('id', c.id)
      const { data: after } = await db.from('client_program_blocks').select('id').eq('client_id', c.id)
      return { before: (before || []).length, after: (after || []).length }
    }, TAG)
    expect(r.before).toBe(1)
    expect(r.after, 'the cascade is what keeps erasure complete without a DELETE policy').toBe(0)
  })
})
