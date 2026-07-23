const { test, expect } = require('@playwright/test')
const { loginAsPT } = require('./helpers')

// GDPR Art. 15/20 — "Download my data" must actually contain the user's data.
//
// Found 2026-07-23 by the full-file review. NOTE the reviewers' stated root cause was WRONG and the
// correction matters, because it changes what this test has to guard:
//
//   Claimed: a master account holds TWO `clients` rows, so `.single()` threw PGRST116, the discarded
//            error skipped the whole personal block, and the export shipped as {exportedAt, profile}.
//   Actual:  `clients.user_id` carries a UNIQUE constraint (`clients_user_id_idx`) — proven by trying
//            to insert the second row, which the database refuses. A user can only ever hold ONE
//            clients row, so `.single()` cannot currently fire and the "empty export" cannot happen.
//
// The REAL bug was the if/else around it: `role === 'coach'` exported coaching assets ONLY. A coach
// who also trains here — which is the owner's own account — got clients/templates/programs and none
// of their own weights, workouts, PBs, goals, events or 1RMs, from any route. Special-category health
// data, silently absent, with the UI reporting success.
test.describe('GDPR data export', () => {
  test('a coach who also trains exports BOTH coaching assets and their own personal data', async ({ page }) => {
    await loginAsPT(page)   // PT view -> role 'coach', the branch that used to drop the personal half
    await page.waitForTimeout(1000)

    const r = await page.evaluate(async () => {
      // Seed one row so "absent" is unambiguous — an empty array is otherwise indistinguishable from
      // a user who has genuinely never logged a weight.
      // NOT _getCurrentClientId(): in coach view that deliberately looks for a COACHED row (non-null
      // coach_id) and returns null for an account whose only record is solo. The export resolves by
      // user_id, so the fixture must too, or it seeds nothing and the assertion tests itself.
      const { data: rows } = await db.from('clients').select('id').eq('user_id', currentUser.id)
      const cid = rows?.[0]?.id || null
      // Sentinel future date so this can never collide with a real entry, and capture the row's OWN id
      // so cleanup deletes exactly what it planted. Deleting by VALUE (.eq('weight_kg', 77.7)) with no
      // date filter would destroy every 77.7kg row on any date — the data-loss shape from 2026-07-10.
      let seeded = null
      if (cid) {
        const { data } = await db.from('weight_logs')
          .insert({ client_id: cid, date: '2027-03-01', weight_kg: 77.7 }).select('id').single()
        seeded = data?.id || null
      }
      try {
        const bundle = await _buildMyDataBundle()
        return {
          keys: Object.keys(bundle),
          hasCoaching: Array.isArray(bundle.clients),
          hasPersonal: Array.isArray(bundle.weightLogs),
          weightCount: (bundle.weightLogs || []).length,
          setKeysPresent: (bundle.workoutLogs || []).length === 0
            || Object.prototype.hasOwnProperty.call(bundle.workoutLogs[0], 'workout_log_exercises'),
        }
      } finally {
        if (seeded) await db.from('weight_logs').delete().eq('id', seeded)
      }
    })

    expect(r.hasCoaching, `no coaching assets; bundle had: ${r.keys}`).toBe(true)
    // A session header with no sets is the shape that made 200 logged workouts export as 200 empty
    // {name, date} pairs — assert the nested set data is actually reachable, not just the key.
    expect(r.setKeysPresent, 'workoutLogs exported without nested exercises/sets').toBe(true)
    // RED before the fix: the else-branch meant these keys never existed in coach view.
    expect(r.hasPersonal, `no personal data; bundle had: ${r.keys}`).toBe(true)
    expect(r.weightCount).toBeGreaterThan(0)
  })

  test('the export carries every personal-data category, in solo view too', async ({ page }) => {
    await loginAsPT(page)
    await page.evaluate(() => switchView('solo'))
    await page.waitForTimeout(1500)

    const keys = await page.evaluate(async () => Object.keys(await _buildMyDataBundle()))

    // Every category the app stores about a person must appear. A missing key here is a category
    // silently omitted from a legal disclosure — the failure mode that made this worth a test.
    // Every category the app stores about a person. checkIns is Art. 9 special-category data and was
    // in NO branch of the export until 2026-07-23; the nested set data under workoutLogs was likewise
    // absent, so an export listed 200 session headers and zero numbers.
    for (const k of ['weightLogs', 'workoutLogs', 'performanceLogs', 'goals', 'events', 'oneRepMaxes', 'checkIns']) {
      expect(keys, `export is missing "${k}"`).toContain(k)
    }
  })

  // Documents the constraint that disproved the reviewers' root cause, so a future session doesn't
  // re-derive the wrong story from the same code. If this ever fails, `clients.user_id` stopped being
  // unique and every `.single()` on it across the codebase needs re-auditing.
  test('clients.user_id is UNIQUE — a user cannot hold two client records', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(async () => {
      let error = null
      try {
        const res = await db.from('clients')
          .insert({ coach_id: currentUser.id, user_id: currentUser.id, full_name: '[E2E] dup-probe', status: 'active' })
          .select('id').single()
        error = res.error
      } finally {
        // UNCONDITIONAL: the insert can commit and still report an error (a refused read-back, a
        // constraint added later), so gating cleanup on !error skips it in exactly the case a row
        // CAN exist. By name, so it is idempotent and cannot touch a real client.
        await db.from('clients').delete().eq('user_id', currentUser.id).eq('full_name', '[E2E] dup-probe')
      }
      return { rejected: !!error, msg: error?.message || null }
    })
    expect(r.rejected, 'a second clients row was ACCEPTED — .single() audits needed').toBe(true)
    expect(r.msg).toContain('clients_user_id_idx')
  })
})
