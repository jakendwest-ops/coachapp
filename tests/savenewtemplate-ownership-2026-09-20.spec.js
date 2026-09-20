const { test, expect } = require('./fixtures')
const { loginAsPT, loginAsPT2 } = require('./helpers')

// ─── saveNewTemplate: ownership guard on the program day-slot context (R1a, 2026-09-20) ────────────
//
// Ledger: bugs/2026-09-18-savenewtemplate-writes-program_phase_workouts-with-no-ownership-check.
//
// saveNewTemplate takes a context ({ programId, phaseId, dayOfWeek, weekNumber }) and performs TWO
// writes keyed on caller-supplied ids: FIRST a workout_templates insert carrying program_id, THEN a
// program_phase_workouts insert carrying phase_id. Neither id was verified. So the guard has to run
// BEFORE the first insert and has to check the PAIR (the phase must belong to the programme passed
// with it) — verifying one id and writing another is the shape bugs/2026-08-22-guard-verifies-one-id-
// while-the-write-keys-on-another exists to keep closed.
//
// HOW THE TESTS ARE SPLIT, and why (same reasoning as tests/program-ownership-anchors-2026-08-22):
//   1. LOAD-BEARING — a mismatched pair of MY OWN ids. RLS permits both rows, so the only thing
//      standing between the call and a template stamped with one programme while slotted into another
//      programme's phase is the app-level pair check. Delete the guard and this goes red.
//   2. UI — the same refusal through the real modal and a real click, because the re-entry guard's
//      busy state hangs off window.event and a programmatic call never exercises it: after a refusal
//      the modal must still be open, say why, and have a usable Create button.
//   3. RECORDING — a genuinely foreign coach's ids. Measured red-first on the unguarded code: RLS
//      refuses the SECOND write (program_phase_workouts) but ACCEPTS the FIRST — another coach's
//      programme id landed in workout_templates.program_id. So the pt2Templates assertion is
//      load-bearing (red without the guard); the ptSlots assertion is an RLS canary that passes either
//      way and is there to notice if that second layer ever weakens.
//   4. MIRRORS — the rightful user is not refused: a matched own pair, an ordinary template with no
//      programme context, and the same in Personal (solo) view. A guard that refuses everything passes
//      every refusal test, and solo is the role this project has broken four times with a coach_id
//      filter — so it is exercised, not argued.
//
// Cleanup is owner-anchored and by NAME PREFIX, not by captured id, so a failed run cannot strand
// fixtures (bugs/2026-08-20-cross-tenant-probes-not-cleanup-safe). programs cascade to phases/slots.
test.describe('saveNewTemplate verifies the programme/phase it is about to write into', () => {
  const PREFIX = '[E2E-OWN] saveNewTemplate'
  const tag = PREFIX + ' ' + Date.now()

  // Set by the test body so cleanup only does — and only complains about — what that test could
  // have created. A blanket "nothing reaped" warning fires falsely for tests that make no programme.
  let madePrograms = false
  let usedPT2 = false
  test.beforeEach(() => { madePrograms = false; usedPT2 = false })

  // Reaps as the given account: programs first (cascades phases and slots), then templates. Returns the
  // counts to NODE — a console.error inside a raw browser.newContext() page goes to a console nobody
  // listens to (only the `page` fixture is instrumented), so it could never be seen.
  async function reap(browser, login, { programs }) {
    const ctx = await browser.newContext()
    try {
      const p = await ctx.newPage()
      await login(p)
      return await p.evaluate(async ({ prefix, programs }) => {
        // Rowcount-checked: a refused delete returns { data: [], error: null } and would report
        // success while leaving the fixtures behind.
        let programsGone = 0
        if (programs) {
          const { data } = await db.from('programs')
            .delete().eq('coach_id', currentUser.id).like('name', prefix + '%').select('id')
          programsGone = (data || []).length
        }
        const { data: t } = await db.from('workout_templates')
          .delete().eq('coach_id', currentUser.id).like('name', prefix + '%').select('id')
        return { programsGone, templatesGone: (t || []).length }
      }, { prefix: PREFIX, programs })
    } finally { await ctx.close() }
  }

  test.afterEach(async ({ browser }) => {
    try {
      // PT2 FIRST, and only when the test used it. Anything PT2 wrote stamped with one of PT's
      // programmes must go before PT's programmes do: the FK action on workout_templates.program_id
      // is not verified from this repo, and if it is not SET NULL / CASCADE the parent delete blocks.
      if (usedPT2) await reap(browser, loginAsPT2, { programs: false })
    } finally {
      const r = await reap(browser, loginAsPT, { programs: true })
      if (madePrograms && r.programsGone === 0) {
        throw new Error('CLEANUP: this test created programmes under ' + PREFIX + ' but none were reaped — fixtures are stranded')
      }
    }
  })

  // Builds the modal DOM the real function reads, runs the REAL saveNewTemplate against the given
  // context, and returns what the user would see. openTemplate is spied rather than run: this is about
  // the write guard, not the editor that opens afterwards.
  const runSave = (page, name, ctx) => page.evaluate(async ({ name, ctx }) => {
    const mk = (id, t = 'input') => { let e = document.getElementById(id); if (!e) { e = document.createElement(t); e.id = id; document.body.appendChild(e) } return e }
    mk('ct-name').value = name
    mk('ct-desc').value = ''
    const err = mk('ct-error', 'div'); err.textContent = ''
    mk('create-template-modal', 'div')
    const opened = []
    window.openTemplate = (id, c) => { opened.push({ id, programId: c?.programId ?? null, phaseWorkoutId: c?.phaseWorkoutId ?? null }) }
    window._phaseWorkoutContext = ctx
    await saveNewTemplate()
    document.getElementById('app-toast')?.remove()
    return { err: err.textContent, opened }
  }, { name, ctx })

  // Fixtures: two programmes of mine, a phase under A. `personal` makes them Personal-view programmes.
  const makeOwnFixtures = async (page, t, { personal = false } = {}) => {
    madePrograms = true
    return page.evaluate(async ({ t, personal }) => {
      const mk = async (name) => (await db.from('programs')
        .insert({ coach_id: currentUser.id, is_personal: personal, name }).select('id').single()).data
      const progA = await mk(t + ' A')
      const progB = await mk(t + ' B')
      const { data: phaseA } = await db.from('program_phases')
        .insert({ program_id: progA.id, name: 'PHASE-A', duration_weeks: 2, order_index: 0 }).select('id').single()
      return { progA: progA?.id, progB: progB?.id, phaseA: phaseA?.id }
    }, { t, personal })
  }

  const readState = (page, name, phaseA) => page.evaluate(async ({ name, phaseA }) => {
    const { data: tmpls } = await db.from('workout_templates').select('id, program_id, is_personal').eq('name', name)
    const { data: slots } = await db.from('program_phase_workouts').select('id, template_id, day_of_week').eq('phase_id', phaseA)
    return { tmpls: tmpls || [], slots: slots || [] }
  }, { name, phaseA })

  test('LOAD-BEARING: a phase of programme A with programme B claimed is refused before ANY write', async ({ page }) => {
    await loginAsPT(page)
    const fx = await makeOwnFixtures(page, tag + ' pair')
    expect(fx.progA && fx.progB && fx.phaseA, 'fixtures must exist before the probe means anything').toBeTruthy()

    const name = tag + ' pair-template'
    const result = await runSave(page, name, { programId: fx.progB, phaseId: fx.phaseA, dayOfWeek: 1, weekNumber: 1 })
    const state = await readState(page, name, fx.phaseA)

    // Without the pair check the first insert stamps a template with programme B, the second slots it
    // into programme A's phase, and RLS allows both because both programmes are mine.
    expect.soft(state.tmpls.length, 'no template may be created — the phase does not belong to the programme passed with it').toBe(0)
    expect.soft(state.slots.length, 'no slot may be written into the phase').toBe(0)
    expect(result.err, 'and the app must say so, rather than failing silently').toContain('permission denied')
    expect(result.opened.length, 'and must not open the editor for a template it never made').toBe(0)
  })

  test('UI: after a refusal the modal stays open, says why, and Create is usable again', async ({ page }) => {
    await loginAsPT(page)
    const fx = await makeOwnFixtures(page, tag + ' ui')
    expect(fx.progA && fx.progB && fx.phaseA, 'fixtures must exist before the probe means anything').toBeTruthy()

    const name = tag + ' ui-template'
    await page.evaluate((ctx) => showCreateTemplateModal(ctx), { programId: fx.progB, phaseId: fx.phaseA, dayOfWeek: 1, weekNumber: 1 })
    await page.fill('#ct-name', name)
    // A REAL click, so window.event is set and the re-entry guard puts the button into its busy state.
    await page.click('#create-template-modal .btn-primary')

    await expect(page.locator('#ct-error')).toContainText('permission denied')
    const create = page.locator('#create-template-modal .btn-primary')
    await expect(create, 'the busy state is released on the refusal path').toBeEnabled()
    await expect(create).toHaveText('Create')
    await expect(page.locator('#create-template-modal'), 'the modal is not torn down by a refusal').toBeVisible()

    const state = await readState(page, name, fx.phaseA)
    expect(state.tmpls.length, 'nothing was written').toBe(0)
    expect(state.slots.length).toBe(0)
  })

  test('RECORDING: a foreign coach\'s (matched) programme + phase — which layer refuses what', async ({ browser }) => {
    usedPT2 = true
    const ptCtx = await browser.newContext()
    const pt2Ctx = await browser.newContext()
    try {
      const ptPage = await ptCtx.newPage()
      await loginAsPT(ptPage)
      const fx = await makeOwnFixtures(ptPage, tag + ' foreign')
      expect(fx.progA && fx.phaseA, 'PT fixtures must exist before the probe means anything').toBeTruthy()

      const pt2Page = await pt2Ctx.newPage()
      await loginAsPT2(pt2Page)

      // (a) matched pair, but PT's — and (b) PT's programme id alone, no phase.
      const nameA = tag + ' foreign-pair-template'
      const nameB = tag + ' foreign-program-only-template'
      await runSave(pt2Page, nameA, { programId: fx.progA, phaseId: fx.phaseA, dayOfWeek: 1, weekNumber: 1 })
      await runSave(pt2Page, nameB, { programId: fx.progA })

      const pt2Templates = await pt2Page.evaluate(async ({ nameA, nameB }) => {
        const { data } = await db.from('workout_templates').select('name, program_id').in('name', [nameA, nameB])
        return data || []
      }, { nameA, nameB })
      const ptSlots = await ptPage.evaluate(async (phaseA) => {
        const { data } = await db.from('program_phase_workouts').select('id').eq('phase_id', phaseA)
        return data || []
      }, fx.phaseA)

      // State only. See the header: the first assertion is red without the guard, the second is a canary.
      expect.soft(pt2Templates.length, 'PT2 must not end up with a template stamped with PT\'s programme id: ' + JSON.stringify(pt2Templates)).toBe(0)
      expect(ptSlots.length, 'PT\'s phase must not gain a slot written by PT2').toBe(0)
    } finally {
      await ptCtx.close()
      await pt2Ctx.close()
    }
  })

  test('MIRROR: a matched pair of my own is still written, slotted and opened — the guard does not refuse the rightful user', async ({ page }) => {
    await loginAsPT(page)
    const fx = await makeOwnFixtures(page, tag + ' ok')
    expect(fx.progA && fx.phaseA, 'fixtures must exist before the probe means anything').toBeTruthy()

    const name = tag + ' ok-template'
    const result = await runSave(page, name, { programId: fx.progA, phaseId: fx.phaseA, dayOfWeek: 2, weekNumber: 1 })
    const state = await readState(page, name, fx.phaseA)

    expect(result.err, 'no refusal message for the rightful user').toBe('')
    expect(state.tmpls.length, 'the template is created').toBe(1)
    expect(state.tmpls[0]?.program_id, 'stamped with the programme it was created from').toBe(fx.progA)
    expect(state.slots.length, 'and slotted into the day it was created from').toBe(1)
    expect(state.slots[0]?.template_id).toBe(state.tmpls[0]?.id)
    expect(state.slots[0]?.day_of_week).toBe(2)
    expect(result.opened.length).toBe(1)
    expect(result.opened[0].programId).toBe(fx.progA)
    expect(result.opened[0].phaseWorkoutId, 'the editor opens against the new slot').toBe(state.slots[0]?.id)
  })

  test('MIRROR: an ordinary template with no programme context is unaffected', async ({ page }) => {
    await loginAsPT(page)
    const name = tag + ' plain-template'
    const result = await runSave(page, name, null)
    const tmpls = await page.evaluate(async (name) => {
      const { data } = await db.from('workout_templates').select('id, program_id').eq('name', name)
      return data || []
    }, name)

    expect(result.err).toBe('')
    expect(tmpls.length, 'created').toBe(1)
    expect(tmpls[0]?.program_id, 'standalone — no programme').toBeNull()
    expect(result.opened.length).toBe(1)
    expect(result.opened[0].programId).toBeNull()
  })

  // Solo's programmes carry the auth uid as coach_id (unlike its clients row, which is NULL), and the
  // guard tests programs.coach_id — that reasoning is exactly what has been wrong before in this
  // project, so the guard is driven from a real Personal view rather than argued (same call as
  // tests/builder-happy-path-2026-08-22.spec.js's Personal section).
  test('MIRROR (Personal view): a solo owner\'s matched pair is written and slotted too', async ({ page }) => {
    await loginAsPT(page)
    const soloAvailable = await page.evaluate(() => !!window._soloClientId)
    test.skip(!soloAvailable, 'requires the master account (window._soloClientId)')
    await page.evaluate(() => switchView('solo'))
    await page.waitForFunction(() => currentProfile?.role === 'solo')

    const fx = await makeOwnFixtures(page, tag + ' solo', { personal: true })
    expect(fx.progA && fx.phaseA, 'fixtures must exist before the probe means anything').toBeTruthy()

    const name = tag + ' solo-template'
    const result = await runSave(page, name, { programId: fx.progA, phaseId: fx.phaseA, dayOfWeek: 3, weekNumber: 1 })
    const role = await page.evaluate(() => currentProfile?.role)
    const state = await readState(page, name, fx.phaseA)

    expect(role, 'must actually be in the solo role for this to mean anything').toBe('solo')
    expect(result.err, 'no refusal for a solo owner of the programme').toBe('')
    expect(state.tmpls.length).toBe(1)
    expect(state.tmpls[0]?.program_id).toBe(fx.progA)
    expect(state.tmpls[0]?.is_personal, 'a template made in Personal view is personal').toBe(true)
    expect(state.slots.length).toBe(1)
    expect(state.slots[0]?.day_of_week).toBe(3)
  })
})
