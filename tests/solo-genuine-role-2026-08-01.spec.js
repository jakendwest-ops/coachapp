const { test, expect } = require('@playwright/test')
const { loginAsPT } = require('./helpers')

test.describe('loadUserInfo treats role=solo as a native value, not a reassignment', () => {
  test('a native role=solo account gets window._soloClientId set correctly, with no solo_only flag needed', async ({ page }) => {
    await loginAsPT(page)

    // PT is used here, not PT2: this test needs an account with an existing self-referential
    // clients row (coach_id IS NULL) to flip role='solo' against. Confirmed live (2026-08-01):
    // the clients table's INSERT policy requires coach_id = auth.uid(), so a coach_id-IS-NULL row
    // can NEVER be self-inserted by any authenticated user via the app's normal RLS-governed
    // client — the one real solo_only account's row was always provisioned by Jake directly in
    // the SQL editor (an admin/service connection that bypasses RLS), never through app code. That
    // matches this feature's explicit scope boundary (no RLS policy change, no self-service
    // provisioning) — so this test reuses PT's own EXISTING solo clients row (part of its normal
    // master-account setup) instead of trying to plant a new one. Only `profiles.role` is mutated,
    // and only for the instant between the update and the restore, guarded by try/finally since PT
    // is the primary fixture used across nearly the whole suite.
    const result = await page.evaluate(async () => {
      const { data: existingSoloRec, error: lookupErr } = await db.from('clients').select('id').eq('user_id', currentUser.id).is('coach_id', null).maybeSingle()
      if (lookupErr) return { fatal: lookupErr.message }
      if (!existingSoloRec) return { fatal: 'PT has no existing solo clients row — test precondition not met' }

      let resultRole, resultSoloId, resultMasterAccount
      try {
        const { error: roleErr } = await db.from('profiles').update({ role: 'solo' }).eq('id', currentUser.id)
        if (roleErr) return { fatal: roleErr.message }

        // Reset in-memory state so loadUserInfo's own DB fetch is what's actually being tested, not
        // stale state from the normal loginAsPT(page) flow that already ran once this page load.
        window._soloClientId = undefined
        window._masterAccount = undefined

        await loadUserInfo()

        resultRole = currentProfile?.role
        resultSoloId = window._soloClientId
        resultMasterAccount = window._masterAccount
      } finally {
        // Restore PT to its normal master-account state, unconditionally, even if loadUserInfo threw.
        await db.from('profiles').update({ role: 'coach' }).eq('id', currentUser.id)
      }

      return { resultRole, resultSoloId, resultMasterAccount, expectedSoloId: existingSoloRec.id }
    })

    expect(result.fatal, 'setup failed, this test proves nothing').toBeUndefined()
    expect(result.resultRole).toBe('solo')
    expect(result.resultSoloId).toBe(result.expectedSoloId)
    expect(result.resultMasterAccount).toBeUndefined() // a native solo account is never a master account
  })
})
