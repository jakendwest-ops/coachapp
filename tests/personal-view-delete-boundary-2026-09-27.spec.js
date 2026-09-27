const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

// Ledger row 2026-07-13-the-destructive-half-of-the-personal-pt-boundary-was-never-g: the ADDITIVE programme
// fan-outs (generate weeks, duplicate week) were limited to the solo record in Personal view, but the
// DESTRUCTIVE one was not — so a Personal-view "Generate weeks" / delete week removed EVERY assigned
// client's copies and then rebuilt only the solo one. Real clients silently lost their programme.
// The fix put both halves in one helper, _deleteClientCopiesForSlots, filtered by _propagationTargets.
//
// Written 2026-09-27 to close the row on evidence: with the filter removed this must go red. Drives the
// real helper in Personal view against a programme a REAL (tagged, fixture) client is assigned to.
const TAG = '[E2E-PVDEL]'

test('a Personal-view delete of week copies never touches a real client’s copy', async ({ page }) => {
  await loginAsPT(page)
  await expect.poll(() => page.evaluate(() => !!window._soloClientId), { timeout: 10000 }).toBe(true)
  const stamp = Date.now()

  const fx = await page.evaluate(async ({ tag, stamp }) => {
    const me = currentUser.id
    const one = async (table, row) => {
      const { data, error } = await db.from(table).insert(row).select('id').single()
      if (error) throw new Error(`${table}: ${error.message}`)
      return data.id
    }
    const clientId = await one('clients', { coach_id: me, full_name: `${tag} real client ${stamp}` })
    const programId = await one('programs', { coach_id: me, name: `${tag} program ${stamp}`, is_personal: false })
    const phaseId = await one('program_phases', { program_id: programId, name: `${tag} phase`, duration_weeks: 4, order_index: 0 })
    const tmplId = await one('workout_templates', { coach_id: me, name: `${tag} master ${stamp}`, is_personal: false, program_id: programId })
    const pwId = await one('program_phase_workouts', { phase_id: phaseId, template_id: tmplId, day_of_week: 1, day_label: 'Monday', week_number: 2 })
    const cpId = await one('client_programs', { client_id: clientId, program_id: programId, start_date: new Date().toISOString().split('T')[0] })
    const cloneId = await one('workout_templates', { coach_id: me, name: `${tag} clone ${stamp}`, is_personal: false, client_id: clientId })
    const cpwId = await one('client_program_workouts', { client_program_id: cpId, program_phase_workout_id: pwId, workout_template_id: cloneId, week_number: 2 })
    return { clientId, programId, pwId, cpwId, cloneId }
  }, { tag: TAG, stamp })

  try {
    await page.evaluate(() => switchView('solo'))
    await expect.poll(() => page.evaluate(() => currentProfile?.role)).toBe('solo')

    // The destructive fan-out, as generate-weeks / delete-week call it, from Personal view.
    await page.evaluate(({ pwId, programId }) => _deleteClientCopiesForSlots([pwId], programId), fx)

    await page.evaluate(() => switchView('coach'))
    await expect.poll(() => page.evaluate(() => currentProfile?.role)).not.toBe('solo')
    const left = await page.evaluate(async ({ cpwId, cloneId }) => ({
      cpw: (await db.from('client_program_workouts').select('id').eq('id', cpwId)).data?.length ?? -1,
      clone: (await db.from('workout_templates').select('id').eq('id', cloneId)).data?.length ?? -1,
    }), fx)
    expect(left.cpw, "the real client's week copy must survive a Personal-view delete").toBe(1)
    expect(left.clone, "the real client's workout clone must survive too").toBe(1)
  } finally {
    await page.evaluate(() => { if (currentProfile?.role === 'solo') switchView('coach') })
    // Rowcount-checked and NOT swallowed. The copy and clone may already be gone if the boundary failed,
    // so only the programme, the master template and the client are required to be reaped.
    const reaped = await page.evaluate(async (fx) => {
      const n = r => (r.data || []).length
      await db.from('client_program_workouts').delete().eq('id', fx.cpwId).select('id')
      await db.from('workout_templates').delete().eq('id', fx.cloneId).eq('coach_id', currentUser.id).select('id')
      return {
        program: n(await db.from('programs').delete().eq('id', fx.programId).eq('coach_id', currentUser.id).select('id')),
        master: n(await db.from('workout_templates').delete().eq('coach_id', currentUser.id).like('name', '[E2E-PVDEL]%').select('id')),
        client: n(await db.from('clients').delete().eq('id', fx.clientId).eq('coach_id', currentUser.id).select('id')),
      }
    }, fx)
    expect(reaped, 'cleanup must remove the programme, the master template and the client').toEqual({ program: 1, master: 1, client: 1 })
  }
})
