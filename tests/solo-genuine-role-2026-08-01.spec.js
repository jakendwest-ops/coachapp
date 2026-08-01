const { test, expect } = require('@playwright/test')
const { loginAsPT, loginAsPT2, sweepPT2 } = require('./helpers')

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

test.describe('starter-content seeding works for a native role=solo account', () => {
  test('_seedStarterContent runs for role=solo and writes is_personal:true, not false', async ({ page }) => {
    await loginAsPT2(page)
    try {
      await sweepPT2(page) // self-heal any prior strand — PT2's steady state is "owns nothing"

      // Stubbing STARTER_EXERCISES down to one tagged entry only changes what step 1 (exercises)
      // inserts. Steps 2–3 (workout_templates/workout_template_exercises, programs/program_phases/
      // program_phase_workouts) key off the hardcoded STARTER_TEMPLATE/STARTER_PROGRAM names, not
      // STARTER_EXERCISES — and since the sweep above leaves PT2 owning nothing, their own
      // existence-checks fall through to real INSERTs regardless of the stub. sweepPT2 in the
      // `finally` below cleans up those rows too, not just the tagged exercise.
      const result = await page.evaluate(async () => {
        const tag = ' [E2E-solo-seed ' + Date.now() + ']'
        const origProfile = { ...currentProfile }

        // Simulate: PT2 is (for this test only) a brand-new, native role=solo account that has never
        // been seeded. Don't touch the real profiles row's starter_seeded — only currentProfile, which
        // is all _seedStarterContent actually reads.
        currentProfile = { ...currentProfile, role: 'solo', starter_seeded: false }

        // Give the starter exercises a unique marker so this test's cleanup can find exactly what it
        // created, without touching PT2's own real seeded data (PT2 already carries starter_seeded=true
        // from its own real onboarding).
        const originalExercises = STARTER_EXERCISES.map(e => ({ ...e }))
        STARTER_EXERCISES.length = 0
        STARTER_EXERCISES.push({ name: 'E2E Solo Seed Test' + tag, muscle_group: 'Test', category: null })

        await _seedStarterContent()

        const { data: seededEx } = await db.from('exercises').select('id, is_personal').eq('coach_id', currentUser.id).eq('name', 'E2E Solo Seed Test' + tag).maybeSingle()

        // cleanup: restore the real STARTER_EXERCISES list and currentProfile, delete the test row
        STARTER_EXERCISES.length = 0
        originalExercises.forEach(e => STARTER_EXERCISES.push(e))
        currentProfile = origProfile
        if (seededEx?.id) await db.from('exercises').delete().eq('id', seededEx.id)

        return { seededEx }
      })

      expect(result.seededEx, 'seeding did not run at all for role=solo — the race is still present').toBeTruthy()
      expect(result.seededEx.is_personal).toBe(true)
    } finally {
      // Always restore PT2 to owning nothing, even if an assert above failed — this catches the
      // real workout_templates/programs (+ child) rows the run above creates as a side effect,
      // which the in-page cleanup above only ever touched for the one tagged exercise row.
      await sweepPT2(page)
    }
  })
})

test.describe('master accounts are unaffected by the solo=native-role change', () => {
  test('a master account (coach + own solo view) still gets window._masterAccount, its solo clientId, and role; masterClientId is mutually exclusive with it by schema', async ({ page }) => {
    await loginAsPT(page)
    const result = await page.evaluate(() => ({
      masterAccount: window._masterAccount,
      role: currentProfile?.role,
      masterClientId: window._masterClientId,
      soloClientId: window._soloClientId,
    }))
    // PT is a master account with role='coach' in the DB — untouched by this whole change.
    expect(result.masterAccount).toBe(true)
    // loginAsPT() sets localStorage._activeView='coach' before the app loads (see tests/helpers.js),
    // so loadUserInfo's view-switcher branch (js/app-core.js) always resolves activeView to 'coach'
    // here and never reassigns currentProfile.role to 'client'/'solo'. The plan's original loose
    // containment check (`toContain(['coach','client','solo'])`) would pass even if the view-switcher
    // branch were broken outright (e.g. if it always fell through to 'client'), so it's tightened to
    // the one value this fixture actually produces deterministically.
    expect(result.role).toBe('coach')
    // window._soloClientId comes from PT's own self-referential clients row (coach_id IS NULL) — the
    // "own solo view" half of "master account" — and is genuinely populated for PT. Verified 2026-08-01
    // via a direct query: PT's clients table currently holds exactly one row for its user_id, with
    // coach_id null.
    expect(result.soloClientId).toBeTruthy()
    // window._masterClientId (the OTHER branch of the untouched master-account code, js/app-core.js:
    // 263-267) comes from a DIFFERENT clients row for the same user_id where coach_id IS NOT NULL — i.e.
    // this account being coached BY someone else, not its own solo view. `clients.user_id` carries a
    // UNIQUE constraint (proven in tests/gdpr-export.spec.js:87, "clients.user_id is UNIQUE — a user
    // cannot hold two client records" — the DB refuses a second row), so one account can never have both
    // a soloRec (coach_id IS NULL) and a coachedRec (coach_id IS NOT NULL) at the same time: the two
    // queries in js/app-core.js:263-265 are mutually exclusive by construction, not by fixture gap.
    // Asserting masterClientId truthy here (as an earlier draft of this test did, per review feedback)
    // would be asserting something structurally impossible — PT's real data confirms it's unset.
    // window._masterClientId is initialized to `null` at js/app-core.js:66 and this account never
    // populates it (only the coachedRec branch at js/app-core.js:267 would set it, and PT has no
    // coachedRec) — so the in-page value genuinely is `null`, not `undefined`. (It can't be a
    // serialization-boundary artifact either: the sibling assertion two lines below,
    // `expect(result.resultMasterAccount).toBeUndefined()` in this same file, proves `undefined`
    // really does survive page.evaluate's boundary unchanged.)
    expect(result.masterClientId).toBeNull()
  })
})
