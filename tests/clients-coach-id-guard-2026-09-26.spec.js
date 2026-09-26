const { test, expect } = require('@playwright/test')
const { loginAsPT, loginAsClient } = require('./helpers')

// ─── A client cannot re-point their own clients.coach_id at another coach (2026-09-26) ─────────────────────
//
// Ledger: docs/bugs/2026-09-26-a-client-can-rewrite-the-coach-id-of-their-own-clients-row.md
//
// The live UPDATE policy `clients_update_own_row` pins only user_id, so a client could set coach_id on their
// own row to anyone's id. scripts/add-clients-coach-id-guard-2026-09-26.sql adds a BEFORE UPDATE OF coach_id
// trigger that refuses it for the API roles (authenticated / anon). The local verifier proves the SQL on a
// copy of the live schema; THIS spec proves it on the real API — that PostgREST really runs the statement as
// `authenticated`, which the guard relies on to tell a signed-in user from the SQL editor and the service role.
//
// It is written to change NOTHING while the hole is open. The target is a uuid that belongs to no profile: with
// the hole open the policy lets the update through and the foreign key on coach_id refuses it (23503, "violates
// foreign key constraint"); with the guard in place the trigger refuses first, with its own message. Same
// verdict on the data either way (nothing moves), and the two are told apart by the message, so this goes RED
// before the script is run and green after — and never strands the shared E2E client on someone else's roster.
// A safety net restores the row if anything did move.
//
// Deliberately NOT tested live: a client detaching themselves (coach_id -> NULL). It is allowed (accepted by
// Jake, 2026-09-26) and cannot be undone by a client afterwards, so a test would strand the fixture. The
// local verifier covers it.
const NOBODY = '00000000-0000-4000-8000-00000000c0ac'   // a uuid that is no profile
const TAG = '[E2E-COACHID]'
const GUARD_MESSAGE = 'coach_id cannot be changed'

test.describe('clients.coach_id is not writable by the API roles (2026-09-26)', () => {
  test('a client cannot point their own row at another coach, but can still make harmless updates to it', async ({ page }) => {
    await loginAsClient(page)
    const r = await page.evaluate(async (nobody) => {
      const mine = await _getCurrentClientId()
      const read = async () => (await db.from('clients').select('coach_id, goal_weight_kg').eq('id', mine).single()).data
      const before = await read()
      const attempt = await db.from('clients').update({ coach_id: nobody }).eq('id', mine).select('id')
      const after = await read()
      let restored = null
      if (after && before && after.coach_id !== before.coach_id) {
        const back = await db.from('clients').update({ coach_id: before.coach_id }).eq('id', mine).select('id')
        restored = !back.error && (back.data || []).length === 1
      }
      // harmless updates that must keep working: another column, and coach_id "set" to the value it already has
      const sameGoal = await db.from('clients').update({ goal_weight_kg: before.goal_weight_kg }).eq('id', mine).select('id')
      const sameCoach = await db.from('clients').update({ coach_id: before.coach_id }).eq('id', mine).select('id')
      return {
        before: before?.coach_id, after: after?.coach_id, restored,
        attempt: { code: attempt.error?.code || null, message: attempt.error?.message || null, rows: (attempt.data || []).length },
        sameGoal: { error: sameGoal.error?.message || null, rows: (sameGoal.data || []).length },
        sameCoach: { error: sameCoach.error?.message || null, rows: (sameCoach.data || []).length },
      }
    }, NOBODY)

    expect(r.restored, 'the row moved and could not be put back — the shared E2E client is stranded, restore it by hand').toBeNull()
    expect(r.attempt.rows, 'the re-point must not update any row').toBe(0)
    expect(r.attempt.message, 'the trigger must refuse first (a foreign-key message means the policy let it through)').toContain(GUARD_MESSAGE)
    expect(r.attempt.code).toBe('42501')
    expect(r.after, 'the row must still belong to its coach').toBe(r.before)
    expect(r.sameGoal, 'a client must still be able to update their own weight goals').toEqual({ error: null, rows: 1 })
    expect(r.sameCoach, 'naming coach_id without changing it must not be refused').toEqual({ error: null, rows: 1 })
  })

  // A CONTROL, green before and after the SQL is applied: the coach policies already refuse this (their WITH CHECK pins coach_id to
  // the caller), so it proves the guard did not make a coach LESS able to work, not that the guard does anything. Only the first
  // and third tests below discriminate (by the guard's message and code).
  test('a coach still edits their own client but cannot move it to another coach (own tagged fixture)', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(async ({ tag, nobody }) => {
      const me = currentUser.id
      const ins = await db.from('clients').insert({ coach_id: me, full_name: tag + ' ' + Date.now() }).select('id').single()
      const id = ins.data?.id
      if (!id) return { inserted: false, error: ins.error?.message || null }
      const out = { inserted: true, me }
      try {
        const attempt = await db.from('clients').update({ coach_id: nobody }).eq('id', id).select('id')
        out.attempt = { refused: !!attempt.error, rows: (attempt.data || []).length }
        out.after = (await db.from('clients').select('coach_id').eq('id', id).single()).data?.coach_id
        const edit = await db.from('clients').update({ notes: 'edited' }).eq('id', id).eq('coach_id', me).select('id, notes')
        out.edit = { error: edit.error?.message || null, rows: (edit.data || []).length, notes: edit.data?.[0]?.notes }
      } finally {
        // rowcount-checked: a refused delete returns no error and no rows
        const gone = await db.from('clients').delete().eq('id', id).select('id')
        out.reaped = (gone.data || []).length
      }
      return out
    }, { tag: TAG, nobody: NOBODY })

    expect(r.inserted, 'the coach must be able to create their own client for this probe').toBe(true)
    expect(r.attempt, 'a coach cannot move their client to another coach').toEqual({ refused: true, rows: 0 })
    expect(r.after, 'the client must still be the coach\'s').toBe(r.me)
    expect(r.edit, 'a coach must still be able to edit their own client').toEqual({ error: null, rows: 1, notes: 'edited' })
    expect(r.reaped, 'the fixture must be removed').toBe(1)
  })

  test('the owner\'s own (solo) record cannot be attached to a coach either', async ({ page }) => {
    await loginAsPT(page)
    const hasSolo = await page.evaluate(() => !!window._soloClientId)
    test.skip(!hasSolo, 'the E2E owner account has no solo record here — same gate as solo-account.spec.js')
    const r = await page.evaluate(async (nobody) => {
      const id = window._soloClientId
      const read = async () => (await db.from('clients').select('coach_id').eq('id', id).single()).data?.coach_id
      const before = await read()
      const attempt = await db.from('clients').update({ coach_id: nobody }).eq('id', id).select('id')
      const after = await read()
      let restored = null
      if (after !== before) {
        const back = await db.from('clients').update({ coach_id: before }).eq('id', id).select('id')
        restored = !back.error && (back.data || []).length === 1
      }
      const same = await db.from('clients').update({ coach_id: before }).eq('id', id).select('id')
      return {
        before, after, restored,
        attempt: { code: attempt.error?.code || null, message: attempt.error?.message || null, rows: (attempt.data || []).length },
        same: { error: same.error?.message || null, rows: (same.data || []).length },
      }
    }, NOBODY)

    expect(r.restored, 'the solo record moved and could not be put back — restore it by hand').toBeNull()
    expect(r.attempt.rows).toBe(0)
    expect(r.attempt.message, 'the trigger must refuse first').toContain(GUARD_MESSAGE)
    expect(r.attempt.code).toBe('42501')
    expect(r.after, 'the record must keep the coach it had').toBe(r.before)
    expect(r.same, 'naming coach_id without changing it must not be refused').toEqual({ error: null, rows: 1 })
  })
})
