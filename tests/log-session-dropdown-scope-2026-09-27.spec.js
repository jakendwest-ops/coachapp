const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

// Ledger row 2026-07-13-showlogsessionmodal-leaks-the-coach-personal-templates-perio: the coach's
// "Log session" modal for a REAL client listed the coach's PERSONAL templates and periodization
// week-clones in its template dropdown — the only workout_templates fetch missing the two filters every
// sibling carries (.eq('is_personal', …) and .is('generated_from_phase_id', null)).
//
// Written 2026-09-27 to close the row on evidence: each filter removed in turn must turn this red.
// Owns every fixture (tagged, deleted with rowcount checks).
const TAG = '[E2E-LOGDD]'

test('the coach Log-session template dropdown lists coaching templates only — no personal ones, no week-clones', async ({ page }) => {
  await loginAsPT(page)
  const stamp = Date.now()
  const names = { normal: `${TAG} normal ${stamp}`, personal: `${TAG} personal ${stamp}`, clone: `${TAG} clone ${stamp}` }

  const fx = await page.evaluate(async ({ names, tag, stamp }) => {
    const me = currentUser.id
    const ins = async (table, row) => {
      const { data, error } = await db.from(table).insert(row).select('id').single()
      if (error) throw new Error(`${table}: ${error.message}`)
      return data.id
    }
    const clientId = await ins('clients', { coach_id: me, full_name: `${tag} client ${stamp}` })
    const programId = await ins('programs', { coach_id: me, name: `${tag} program ${stamp}`, is_personal: false })
    const phaseId = await ins('program_phases', { program_id: programId, name: `${tag} phase`, duration_weeks: 4, order_index: 0 })
    await ins('workout_templates', { coach_id: me, name: names.normal, is_personal: false })
    await ins('workout_templates', { coach_id: me, name: names.personal, is_personal: true })
    await ins('workout_templates', { coach_id: me, name: names.clone, is_personal: false, generated_from_phase_id: phaseId })
    return { clientId, programId }
  }, { names, tag: TAG, stamp })

  try {
    await page.evaluate((cid) => showLogSessionModal(cid), fx.clientId)
    await expect(page.locator('#log-session-modal')).toBeVisible()
    const options = await page.locator('#log-session-modal option').allTextContents()

    expect(options, 'a normal coaching template must be offered').toContain(names.normal)
    expect(options, "the coach's PERSONAL template must not be offered for a real client").not.toContain(names.personal)
    expect(options, 'a periodization week-clone must not be offered').not.toContain(names.clone)
  } finally {
    await page.evaluate(() => { try { closeModal('log-session-modal') } catch {} })
    await page.evaluate(async ({ names, fx }) => {
      for (const n of Object.values(names)) await db.from('workout_templates').delete().eq('coach_id', currentUser.id).eq('name', n).select('id')
      await db.from('programs').delete().eq('id', fx.programId).eq('coach_id', currentUser.id).select('id')
      await db.from('clients').delete().eq('id', fx.clientId).eq('coach_id', currentUser.id).select('id')
    }, { names, fx }).catch(() => {})
  }
})
