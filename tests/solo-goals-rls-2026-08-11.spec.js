// 2026-08-11 — a solo account could never have a goal at all.
//
// Found while building the solo-crash test: creating a goal for the solo record was refused by RLS,
// while the identical insert for a coached client got past RLS (it failed later on a CHECK, which is
// what made the two errors distinguishable). A direct query confirmed the solo record had ZERO goals,
// ever — yet the solo dashboard renders a goals card with milestone chips for it.
//
// Cause, from pg_policies: only ONE policy applies to INSERT — "Coach manages goals" (cmd: ALL) — and
// its with_check was NULL, so Postgres reused its USING clause:
//     exists (select 1 from clients where clients.id = goals.client_id
//                                     and clients.coach_id = auth.uid())
// A solo clients row has coach_id IS NULL, so `coach_id = auth.uid()` is NULL, not true → refused.
// The sixth instance of the coach_id-IS-NULL class, this time living in a policy rather than app code.
//
// Structurally the same pattern as the CRITICAL `events` gap (2026-08-02): a cmd:ALL policy with
// with_check:null silently reusing its qual for writes. There it was too permissive; here too strict.
//
// Fixed 2026-08-11 by Jake with an explicit WITH CHECK adding `(c.coach_id is null and c.user_id =
// auth.uid())` — deliberately narrower than the usual `.or(coach_id.eq, user_id.eq)` pattern, which
// would also match the coach's own client record under a DIFFERENT coach. USING was left untouched,
// so this only grants, never revokes.
//
// This test pins it. It went RED before that policy change (insert refused) and GREEN after.
const { test, expect } = require('@playwright/test')
const { loginAsPT } = require('./helpers')

const TAG = '[E2E] SoloGoal'

async function sweep (page) {
  await page.evaluate(async (TAG) => {
    const { data: goals } = await db.from('goals').select('id').like('title', TAG + '%')
    const ids = (goals || []).map(g => g.id)
    if (ids.length) {
      await db.from('goal_milestones').delete().in('goal_id', ids)
      await db.from('goals').delete().in('id', ids)
    }
  }, TAG)
}

test.describe('solo goals RLS (2026-08-11)', () => {
  test.beforeEach(async ({ page }) => { await loginAsPT(page); await sweep(page) })
  test.afterEach(async ({ page }) => { await sweep(page) })

  test('a goal can be created for the solo self-record, and for a coached client', async ({ page }) => {
    const soloId = await page.evaluate(() => window._soloClientId || null)
    test.skip(!soloId, 'This PT account has no solo client record')

    const res = await page.evaluate(async ({ TAG, soloId }) => {
      const mk = async (clientId, label) => {
        const { data, error } = await db.from('goals').insert({
          client_id: clientId, created_by: currentUser.id, title: TAG + ' ' + label,
          goal_type: 'strength', priority: 1, status: 'active'
        }).select('id').single()
        return { ok: !!data?.id, err: error ? error.message.slice(0, 90) : null }
      }
      const { data: coached } = await db.from('clients').select('id')
        .eq('coach_id', currentUser.id).limit(1)
      return {
        solo: await mk(soloId, 'solo'),
        coached: coached?.[0]?.id ? await mk(coached[0].id, 'coached') : { ok: true, err: null, skipped: true },
      }
    }, { TAG, soloId })

    console.log('solo insert   :', JSON.stringify(res.solo))
    console.log('coached insert:', JSON.stringify(res.coached))

    // The regression: this was `violates row-level security policy for table "goals"`.
    expect(res.solo.err).toBeNull()
    expect(res.solo.ok).toBe(true)
    // And the fix must not have broken the ordinary coached-client path it widened.
    expect(res.coached.err).toBeNull()
    expect(res.coached.ok).toBe(true)
  })

  test('the widened policy still refuses a goal against another coach\'s client', async ({ page, browser }) => {
    // The WITH CHECK was widened; prove it did not become a hole. An unrelated coach must still be
    // unable to plant a goal on this coach's client.
    const victim = await page.evaluate(async () => {
      const { data } = await db.from('clients').select('id').eq('coach_id', currentUser.id).limit(1)
      return data?.[0]?.id || null
    })
    test.skip(!victim, 'no coached client available')

    const { loginAsPT2 } = require('./helpers')
    const ctx = await browser.newContext()
    try {
      const p2 = await ctx.newPage()
      await loginAsPT2(p2)
      const out = await p2.evaluate(async ({ TAG, victim }) => {
        const { data, error } = await db.from('goals').insert({
          client_id: victim, created_by: currentUser.id, title: TAG + ' cross-tenant',
          goal_type: 'strength', priority: 1, status: 'active'
        }).select('id')
        return { rows: (data || []).length, refused: !!error }
      }, { TAG, victim })
      console.log('PT2 cross-tenant insert:', JSON.stringify(out))
      expect(out.rows).toBe(0)
    } finally { await ctx.close() }
  })
})
