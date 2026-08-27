const { test, expect } = require('./fixtures')
const { loginAsPT, clickVisible } = require('./helpers')

// The day-slot workout picker became a tap-row modal on 2026-07-11, replacing the native <select>
// (an <option> can only hold plain text, which is why three same-named workouts were impossible to
// tell apart). These helpers keep every test driving the picker through one place.
const daySlotBtn = day => `button.pwg-add[data-day="${day}"]`
const pickerRow = id => `#wkp-results div[onclick="_pickWorkout('${id}')"]`
const CREATE_ROW = '#wkp-results div[onclick="_createWorkoutFromPicker()"]'

// Builds the picker's pool before reading it. As of 2026-08-07 openProgram no longer pre-fetches
// window._programTemplates (it sets it to null and the picker builds it lazily on first open), so
// reading the global straight after openProgram now always yields [] — which made every
// `test.skip(templateIds.length === 0, ...)` below fire unconditionally. Four tests went silently
// green-as-skipped, including the only DOM-level coverage of this picker's live search. Caught by
// all three review agents; corroborated by the suite's own skip count going 2 -> 6.
const availableTemplateIds = page => page.evaluate(async () => {
  await _refreshProgramTemplates()
  return (window._programTemplates || []).map(t => t.id)
})

async function openDayPicker(page, day) {
  await page.click(daySlotBtn(day))
  await page.waitForSelector('#workout-picker-modal', { state: 'visible', timeout: 5000 })
}

async function closeDayPicker(page) {
  await page.click('#workout-picker-modal .modal-close')
  await page.waitForSelector('#workout-picker-modal', { state: 'detached', timeout: 5000 })
}

async function assignWorkoutToDay(page, day, templateId) {
  await openDayPicker(page, day)
  await page.click(pickerRow(templateId))
  await page.waitForSelector('#workout-picker-modal', { state: 'detached', timeout: 5000 })
}

// ONE shared sweep for every UI-created program fixture in this file (2026-08-20).
//
// These tests build a program through the UI and tidy up with a trailing `Delete` click at the end of
// the body. That click never runs if the test skips or an assertion fails -- and the header comment
// above records that after 2026-08-07 the four `test.skip(templateIds.length === 0, …)` gates fired
// UNCONDITIONALLY for a window, so four tests went green-as-skipped and every run leaked a program +
// phase. Deliberately an afterEach rather than four try/finally blocks: an earlier pass at this class
// fixed the two instances a grep turned up and left five more in this same file, which is the exact
// fix-the-instance-not-the-class failure the project has a standing rule against.
//
// Idempotent and name-scoped, so it is safe to run after every test in the describe, including ones
// that create none of these. Programs cascade their phases and phase-workouts, so one delete is enough.
// coach_id is anchored on top of the id: a filter that costs nothing should not be omitted on a delete.
const E2E_PROGRAM_FIXTURES = [
  '[E2E] Periodization Test',
  '[E2E] Inline Grid Test',
  '[E2E] Grid Race Test',
  '[E2E] Duplicate Week Test',
]

const sweepProgramFixtures = page => page.evaluate(async (names) => {
  const { data } = await db.from('programs').select('id').eq('coach_id', currentUser.id).in('name', names)
  for (const p of data || []) {
    await db.from('programs').delete().eq('id', p.id).eq('coach_id', currentUser.id)
  }
}, E2E_PROGRAM_FIXTURES).catch(() => {})

test.describe('Program periodization', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsPT(page)
    await clickVisible(page, '[data-page="programs"]')
    await page.waitForSelector('h1:has-text("Programs")', { timeout: 8000 })
  })
  test.afterEach(async ({ page }) => { await sweepProgramFixtures(page) })

  test('configure Linear periodization on a multi-week phase and generate weeks', async ({ page }) => {
    // Create a throwaway test program
    await page.click('button:has-text("New program")')
    await page.fill('#pm-name', '[E2E] Periodization Test')
    await page.click('#pm-save-btn')
    await page.waitForSelector('h1:has-text("[E2E] Periodization Test")', { timeout: 8000 })

    // Add a 3-week phase
    await page.click('button:has-text("Add phase")')
    await page.fill('#pf-name', 'Block 1')
    await page.fill('#pf-weeks', '3')
    await page.click('#pf-save-btn')
    await expect(page.locator('text=Block 1')).toBeVisible({ timeout: 8000 })

    // Assign a workout to Monday, Week 1 via the tap-row picker.
    await expect(page.locator(daySlotBtn(1))).toBeVisible({ timeout: 8000 })
    const templateIds = await availableTemplateIds(page)
    test.skip(templateIds.length === 0, 'E2E PT account has no workout templates to assign')
    await assignWorkoutToDay(page, 1, templateIds[0])
    await expect(page.locator('[id^="phase-workouts-"] .pwk-slot-name').first()).toBeVisible({ timeout: 8000 })

    // Configure periodization on the phase
    await page.click('button:has-text("Configure")')
    await expect(page.locator('#periodization-modal')).toBeVisible({ timeout: 4000 })
    await page.click('#periodization-modal button:has-text("Linear")')
    await expect(page.locator('#pz-start')).toBeVisible({ timeout: 4000 })
    await page.fill('#pz-start', '65')
    await page.fill('#pz-end', '85')
    await page.click('#periodization-modal .modal-footer button:has-text("Save")')
    await page.waitForSelector('#periodization-modal', { state: 'detached', timeout: 4000 })
    await expect(page.locator('text=Periodization:').locator('..').locator('text=Linear')).toBeVisible({ timeout: 4000 })

    // Generate weeks 2-3 from the Week 1 base
    page.once('dialog', d => d.accept())
    await page.click('button:has-text("Generate weeks")')
    await expect(page.locator('.week-tab[data-week="2"]')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.week-tab[data-week="3"]')).toBeVisible({ timeout: 10000 })

    // Cleanup — delete the throwaway program
    page.once('dialog', d => d.accept())
    await page.click('button:has-text("Delete")')
    await page.waitForSelector('h1:has-text("Programs")', { timeout: 8000 })
  })

  test('periodization Configure modal — Undulating shows tier fields, Cancel closes without saving', async ({ page }) => {
    await page.click('button:has-text("New program")')
    await page.fill('#pm-name', '[E2E] Periodization Cancel Test')
    await page.click('#pm-save-btn')
    await page.waitForSelector('h1:has-text("[E2E] Periodization Cancel Test")', { timeout: 8000 })

    await page.click('button:has-text("Add phase")')
    await page.fill('#pf-name', 'Block 1')
    await page.fill('#pf-weeks', '4')
    await page.click('#pf-save-btn')
    await expect(page.locator('text=Block 1')).toBeVisible({ timeout: 8000 })

    await page.click('button:has-text("Configure")')
    await expect(page.locator('#periodization-modal')).toBeVisible({ timeout: 4000 })
    await page.click('#periodization-modal button:has-text("Undulating")')
    await expect(page.locator('#pz-tier-heavy-pct')).toBeVisible({ timeout: 4000 })
    await expect(page.locator('#pz-tier-moderate-pct')).toBeVisible()
    await expect(page.locator('#pz-tier-light-pct')).toBeVisible()

    await page.click('#periodization-modal .modal-footer button:has-text("Cancel")')
    await page.waitForSelector('#periodization-modal', { state: 'detached', timeout: 4000 })
    // Not saved — phase still shows None
    await expect(page.locator('text=Periodization:').locator('..').locator('text=None')).toBeVisible({ timeout: 4000 })

    page.once('dialog', d => d.accept())
    await page.click('button:has-text("Delete")')
    await page.waitForSelector('h1:has-text("Programs")', { timeout: 8000 })
  })
})

test.describe('Inline assign grid', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsPT(page)
    await clickVisible(page, '[data-page="programs"]')
    await page.waitForSelector('h1:has-text("Programs")', { timeout: 8000 })
  })
  test.afterEach(async ({ page }) => { await sweepProgramFixtures(page) })

  test('7-day grid renders, and the picker live-filters its rows', async ({ page }) => {
    await page.click('button:has-text("New program")')
    await page.fill('#pm-name', '[E2E] Inline Grid Test')
    await page.click('#pm-save-btn')
    await page.waitForSelector('h1:has-text("[E2E] Inline Grid Test")', { timeout: 8000 })

    await page.click('button:has-text("Add phase")')
    await page.fill('#pf-name', 'Block 1')
    await page.fill('#pf-weeks', '1')
    await page.click('#pf-save-btn')
    await expect(page.locator('text=Block 1')).toBeVisible({ timeout: 8000 })

    // The old day→session→template "+ Assign workout" modal stays gone (replaced 2026-07-01 by the
    // inline grid). The picker introduced 2026-07-11 is a different thing: a per-slot tap-row list.
    await expect(page.locator('button:has-text("+ Assign workout")')).toHaveCount(0)
    await expect(page.locator('#phase-workout-modal')).toHaveCount(0)

    // All 7 days present, each with its own add button
    for (let day = 1; day <= 7; day++) {
      await expect(page.locator(daySlotBtn(day))).toBeVisible({ timeout: 8000 })
    }

    const templateIds = await availableTemplateIds(page)
    test.skip(templateIds.length === 0, 'E2E PT account has no workout templates to test filtering')

    await openDayPicker(page, 1)
    // Retrying assertion, not a captured .count(). `.count()` is a one-shot snapshot with no
    // auto-waiting, so reading it straight after opening the picker races the render: under
    // full-suite load it can return 0 and fail a test that is perfectly correct.
    await expect(page.locator('#wkp-results div[onclick^="_pickWorkout"]')).not.toHaveCount(0)

    await page.fill('#wkp-search', 'zzz-no-such-template-zzz')
    await expect(page.locator('#wkp-results div[onclick^="_pickWorkout"]')).toHaveCount(0)
    // The create-new row stays available no matter the query — it's how you act on a no-match.
    await expect(page.locator(CREATE_ROW)).toBeVisible()
    await closeDayPicker(page)

    page.once('dialog', d => d.accept())
    await page.click('button:has-text("Delete")')
    await page.waitForSelector('h1:has-text("Programs")', { timeout: 8000 })
  })

  test('picking an already-filled slot is rejected instead of creating a duplicate', async ({ page }) => {
    await page.click('button:has-text("New program")')
    await page.fill('#pm-name', '[E2E] Grid Race Test')
    await page.click('#pm-save-btn')
    await page.waitForSelector('h1:has-text("[E2E] Grid Race Test")', { timeout: 8000 })

    await page.click('button:has-text("Add phase")')
    await page.fill('#pf-name', 'Block 1')
    await page.fill('#pf-weeks', '1')
    await page.click('#pf-save-btn')
    await expect(page.locator('text=Block 1')).toBeVisible({ timeout: 8000 })

    await expect(page.locator(daySlotBtn(1))).toBeVisible({ timeout: 8000 })
    const templateIds = await availableTemplateIds(page)
    test.skip(templateIds.length === 0, 'E2E PT account has no workout templates to assign')

    // Simulate a concurrent insert filling Monday's first slot behind the scenes, then try to
    // assign through the (now-stale) UI — the guard should reject it, not duplicate the row
    const phaseId = await page.locator(daySlotBtn(1)).getAttribute('data-phase')
    await page.evaluate(async ({ phaseId, templateId }) => {
      await db.from('program_phase_workouts').insert({ phase_id: phaseId, day_of_week: 1, day_label: 'Monday', template_id: templateId, session_order: 1, week_number: 1 })
    }, { phaseId, templateId: templateIds[0] })

    await assignWorkoutToDay(page, 1, templateIds[0])
    await expect(page.locator('text=That slot was just filled')).toBeVisible({ timeout: 8000 })

    const rowCount = await page.evaluate(async (phaseId) => {
      const { data } = await db.from('program_phase_workouts').select('id').eq('phase_id', phaseId).eq('day_of_week', 1).eq('session_order', 1)
      return data.length
    }, phaseId)
    expect(rowCount).toBe(1)

    page.once('dialog', d => d.accept())
    await page.click('button:has-text("Delete")')
    await page.waitForSelector('h1:has-text("Programs")', { timeout: 8000 })
  })

  test('creating a new workout from the grid returns to the program via "Back to program"', async ({ page }) => {
    await page.click('button:has-text("New program")')
    await page.fill('#pm-name', '[E2E] Grid Create Test')
    await page.click('#pm-save-btn')
    await page.waitForSelector('h1:has-text("[E2E] Grid Create Test")', { timeout: 8000 })

    await page.click('button:has-text("Add phase")')
    await page.fill('#pf-name', 'Block 1')
    await page.fill('#pf-weeks', '1')
    await page.click('#pf-save-btn')
    await expect(page.locator('text=Block 1')).toBeVisible({ timeout: 8000 })

    await expect(page.locator(daySlotBtn(1))).toBeVisible({ timeout: 8000 })
    await openDayPicker(page, 1)
    await page.click(CREATE_ROW)
    await expect(page.locator('#create-template-modal')).toBeVisible({ timeout: 4000 })
    await page.fill('#ct-name', '[E2E] Grid Created Template')
    await page.click('#create-template-modal button:has-text("Create")')

    await expect(page.locator('text=Back to program')).toBeVisible({ timeout: 8000 })
    await page.click('text=Back to program')
    await expect(page.locator('h1:has-text("[E2E] Grid Create Test")')).toBeVisible({ timeout: 8000 })

    // Cleanup — the created template isn't attached to the program via program_phase_workouts, delete separately
    await page.evaluate(async () => {
      const { data } = await db.from('workout_templates').select('id').eq('name', '[E2E] Grid Created Template')
      if (data?.length) await db.from('workout_templates').delete().in('id', data.map(t => t.id))
    })
    page.once('dialog', d => d.accept())
    await page.click('button:has-text("Delete")')
    await page.waitForSelector('h1:has-text("Programs")', { timeout: 8000 })
  })

  test('a template created inline for one day slot stays out of OTHER programs\' pickers (2026-07-10, narrowed 2026-08-14)', async ({ page }) => {
    // Regression: openProgram's template query had no .is('program_id', null) filter, so every
    // one-off "+ Create new workout" template stayed in the reuse pool forever -- found live when
    // a 12-phase program's picker showed the same name 4+ times with no way to tell which day
    // each already belonged to. The inline "__new__" option is also relabeled "(this day only)"
    // to make the distinction clear at the point of choice.
    //
    // NARROWED 2026-08-14 after Jake hit the other side of it live: *"threshold intervals is being
    // used ... however when I try to add this session into the Thursday workout slot it does not
    // appear to be in use, and therefore I cannot select it."* A session built inline was invisible
    // to its OWN programme forever, so it could never be reused on a second day.
    //
    // The two reports are reconcilable because the original complaint was INDISTINGUISHABILITY
    // ("no way to tell which day each already belonged to"), not presence -- and that was fixed
    // properly on 2026-07-22 by the usage labels ("Used in Phase 1 - Wk 3 - TUE"), plus a
    // "BUILT IN THIS PROGRAMME" badge added 2026-08-14. The blunt exclusion outlived its reason.
    //
    // What this test now guards is the half that still matters and that no other test covers: an
    // inline template must never leak into a DIFFERENT programme's picker. The positive half (it IS
    // offered inside its own programme) is covered surgically in
    // tests/workout-picker-2026-08-14.spec.js -- keep both, they fail for different reasons.
    await page.click('button:has-text("New program")')
    await page.fill('#pm-name', '[E2E] Picker Scope Test')
    await page.click('#pm-save-btn')
    await page.waitForSelector('h1:has-text("[E2E] Picker Scope Test")', { timeout: 8000 })

    await page.click('button:has-text("Add phase")')
    await page.fill('#pf-name', 'Block 1')
    await page.fill('#pf-weeks', '1')
    await page.click('#pf-save-btn')
    await expect(page.locator('text=Block 1')).toBeVisible({ timeout: 8000 })

    await openDayPicker(page, 1)
    await expect(page.locator(CREATE_ROW)).toHaveText('＋ Create new workout (this day only)')
    await closeDayPicker(page)

    const programId = await page.evaluate(async () => {
      const { data } = await db.from('programs').select('id').eq('name', '[E2E] Picker Scope Test').single()
      return data.id
    })
    const templateId = await page.evaluate(async (programId) => {
      const { data } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: programId, client_id: null, name: '[E2E] Day-Only Template' }).select('id').single()
      return data.id
    }, programId)

    try {
      // Build the pool explicitly (openProgram no longer does — 2026-08-07 lazy-load). Without this
      // the assertion below reads [] and passes vacuously, so the `.is('program_id', null)` filter
      // this test exists to guard could be deleted entirely and it would still go green.
      await page.evaluate(async (programId) => { await openProgram(programId); await _refreshProgramTemplates() }, programId)
      await page.waitForTimeout(300)
      const own = await page.evaluate(() => (window._programTemplates || []).map(t => t.name))
      expect(own.length).toBeGreaterThan(0)   // guards against the vacuous-pass shape above
      expect(own, 'its OWN programme must offer it — otherwise it can never be reused on a second day')
        .toContain('[E2E] Day-Only Template')

      // The guarantee that survived: a SECOND programme must not see it. Built as a bare row rather
      // than through the UI — this test already proves the UI path, and the pool query is what is
      // actually under test here.
      const otherPool = await page.evaluate(async () => {
        const { data: p2 } = await db.from('programs')
          .insert({ coach_id: currentUser.id, name: '[E2E] Picker Scope Other' }).select('id').single()
        await openProgram(p2.id)
        await _refreshProgramTemplates()
        const names = (window._programTemplates || []).map(t => t.name)
        await db.from('programs').delete().eq('id', p2.id)
        return names
      })
      expect(otherPool, 'a different programme must never see another programme\'s inline workout')
        .not.toContain('[E2E] Day-Only Template')
    } finally {
      // Swept by QUERY, not through the UI Delete button. The button needs the page to still be sitting
      // on this programme, and the assertions above deliberately navigate away (openProgram on a second
      // programme). When that cleanup silently no-op'd, three orphaned "[E2E] Picker Scope Test" rows
      // accumulated — and because the fixture lookup uses .single(), which ERRORS on multiple matches,
      // the debris broke the test on its next run rather than the run that created it.
      await page.evaluate(async (templateId) => {
        await db.from('workout_templates').delete().eq('id', templateId)
        const { data: progs } = await db.from('programs').select('id')
          .eq('coach_id', currentUser.id).like('name', '[E2E] Picker Scope%')
        const ids = (progs || []).map(p => p.id)
        if (!ids.length) return
        const { data: phs } = await db.from('program_phases').select('id').in('program_id', ids)
        const phIds = (phs || []).map(p => p.id)
        if (phIds.length) {
          await db.from('program_phase_workouts').delete().in('phase_id', phIds)
          await db.from('program_phases').delete().in('id', phIds)
        }
        await db.from('programs').delete().in('id', ids)
      }, templateId)
      await page.evaluate(() => navigate('programs'))
      await page.waitForSelector('h1:has-text("Programs")', { timeout: 8000 })
    }
  })
})

test.describe('Assignment-time 1RM check', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsPT(page)
    await clickVisible(page, '[data-page="programs"]')
    await page.waitForSelector('h1:has-text("Programs")', { timeout: 8000 })
  })

  test('assigning a program with a %1RM exercise shows the missing-1RM checklist and saves an entered value', async ({ page }) => {
    // Arrange directly via Supabase — template creation UI is covered elsewhere; this test is about the assign-flow check itself
    // Resolve the client BEFORE creating anything. This lookup used to sit at the END of the fixture
    // evaluate below, with test.skip() reading its result only after five rows had already been
    // written -- and a fired skip aborts the test before the try/finally is ever ENTERED, so the
    // cleanup never ran. Latent, not observed: the comment further down records fixing this same
    // class on the ASSERTION path, and the skip path was left behind. Instance fixed, class not.
    //
    // NOT the cause of the 12 orphaned '[E2E] 1RM Check Squat' CLONES cleaned out of the live DB on
    // 2026-08-20 -- that was checked and disproved. A fired skip returns before assignment, so no
    // clone can exist; every one of those 12 had client_id set, which proves the test ran to
    // completion and its finally block failed to remove them. Separate, still-open bug: see
    // bugs/2026-08-20-client-plan-clone-cleanup-silently-leaks.md.
    const clientId = await page.evaluate(async () => {
      const { data } = await db.from('clients').select('id').eq('coach_id', currentUser.id).limit(1)
      return data?.[0]?.id || null
    })
    test.skip(!clientId, 'E2E PT account has no clients to assign to')

    const setup = await page.evaluate(async (cid) => {
      const { data: prog } = await db.from('programs').insert({ coach_id: currentUser.id, name: '[E2E] 1RM Check Program' }).select('id').single()
      const { data: phase } = await db.from('program_phases').insert({ program_id: prog.id, name: 'Block 1', duration_weeks: 1, order_index: 0 }).select('id').single()
      const { data: tmpl } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: null, client_id: null, name: '[E2E] 1RM Check Squat' }).select('id').single()
      await db.from('workout_template_exercises').insert({ template_id: tmpl.id, exercise_name: '[E2E] Test Squat', exercise_type: 'strength', order_index: 0, sets_json: [{ effortType: 'rpe', repsMin: '5', repsMax: '5', intensityMin: '70', intensityMax: '70' }] })
      await db.from('program_phase_workouts').insert({ phase_id: phase.id, day_of_week: 1, day_label: 'Monday', session_order: 1, template_id: tmpl.id, week_number: 1 })
      await db.from('client_1rms').delete().eq('client_id', cid).eq('exercise_name', '[E2E] Test Squat')
      return { programId: prog.id, templateId: tmpl.id, clientId: cid }
    }, clientId)

    // Cleanup must run even if an assertion below fails — an earlier version of this test had the
    // cleanup AFTER the assertions with no try/finally, so any failed assertion (e.g. the 2026-07-25
    // weight_unit fixture-pollution incident) left the assignment, its cloned template, and the
    // program permanently stuck on the shared PT/client fixture. Found when that pollution incident's
    // failure leaked exactly this debris, which then made an unrelated client-workout.spec.js test
    // start failing (it had been silently vacuous every prior run because the client had no program).
    try {
      await page.reload()
      await page.waitForSelector('h1:has-text("Programs")', { timeout: 8000 })
      await page.click('text=[E2E] 1RM Check Program')
      await page.waitForSelector('button:has-text("Assign to client")', { timeout: 8000 })
      await page.click('button:has-text("Assign to client")')
      await expect(page.locator('#apc-modal')).toBeVisible({ timeout: 4000 })
      await page.selectOption('#apc-client', setup.clientId)
      await expect(page.locator('#apc-missing-1rm')).toContainText('[E2E] Test Squat', { timeout: 6000 })
      await expect(page.locator('#apc-missing-1rm')).toContainText('missing 1', { timeout: 4000 })

      await page.fill('#mor-0-weight', '100')
      await page.click('#apc-modal .modal-footer button:has-text("Assign")')
      await page.waitForSelector('#apc-modal', { state: 'detached', timeout: 8000 })

      // Modal-detach is NOT a barrier on the clone. js/app-programs.js:758 removes the modal, and
      // only THEN does :763 await _cloneProgramForClient -- which clones each template inside its
      // loop but inserts the client_program_workouts rows in ONE batch at the very end (:473).
      // The finally below discovers clones solely via those cpw rows, so racing ahead of that batch
      // made it read an empty list, delete nothing, and then delete the parent client_programs row --
      // killing the in-flight cpw insert on an FK violation and orphaning the clone permanently.
      // Confirmed mechanism behind 12 stranded '[E2E] 1RM Check Squat' clones cleaned out of the live
      // DB on 2026-08-20 (one per lost race). Wait for the clone to actually exist.
      await page.waitForFunction(async (cid) => {
        const { data } = await db.from('client_program_workouts')
          .select('id, client_programs!inner(client_id)').eq('client_programs.client_id', cid)
        return (data || []).length > 0
      }, setup.clientId, { timeout: 10000 }).catch(() => {})

      const saved = await page.evaluate(async (clientId) => {
        const { data } = await db.from('client_1rms').select('one_rm_kg').eq('client_id', clientId).eq('exercise_name', '[E2E] Test Squat')
        return data
      }, setup.clientId)
      expect(saved.length).toBe(1)
      expect(saved[0].one_rm_kg).toBe(100)
    } finally {
      await page.evaluate(async ({ programId, templateId, clientId }) => {
        const { data: cpRows } = await db.from('client_programs').select('id').eq('client_id', clientId).eq('program_id', programId)
        for (const cp of cpRows || []) {
          const { data: cpwRows } = await db.from('client_program_workouts').select('workout_template_id').eq('client_program_id', cp.id)
          await db.from('client_programs').delete().eq('id', cp.id)
          const ids = (cpwRows || []).map(r => r.workout_template_id).filter(Boolean)
          if (ids.length) await db.from('workout_templates').delete().in('id', ids)
        }
        await db.from('client_1rms').delete().eq('client_id', clientId).eq('exercise_name', '[E2E] Test Squat')
        await db.from('programs').delete().eq('id', programId)
        await db.from('workout_templates').delete().eq('id', templateId)
        // Backstop that does NOT depend on client_program_workouts. The cpw-driven discovery above is
        // what lost the race; the barrier now makes that unlikely, but a name+client anchored delete
        // cannot be raced at all, and it also reaps anything a PREVIOUS run stranded. Note the app's
        // own _removeAssignmentAndClones (js/app-programs.js:299) discovers clones the same cpw way,
        // so it shares the blind spot -- this is the only thing that closes it here.
        await db.from('workout_templates').delete()
          .eq('coach_id', currentUser.id).eq('client_id', clientId).eq('name', '[E2E] 1RM Check Squat')
      }, { programId: setup.programId, templateId: setup.templateId, clientId: setup.clientId })
    }
  })

  test('missing-1RM checklist shows read-only "on file" entries alongside the quick-entry ones', async ({ page }) => {
    // Same skip-before-try leak as the sibling test above — resolve the client BEFORE creating any
    // fixture, so a fired test.skip() cannot strand rows the try/finally was meant to remove.
    const clientId = await page.evaluate(async () => {
      const { data } = await db.from('clients').select('id').eq('coach_id', currentUser.id).limit(1)
      return data?.[0]?.id || null
    })
    test.skip(!clientId, 'E2E PT account has no clients to assign to')

    const setup = await page.evaluate(async (cid) => {
      const { data: prog } = await db.from('programs').insert({ coach_id: currentUser.id, name: '[E2E] 1RM Have Program' }).select('id').single()
      const { data: phase } = await db.from('program_phases').insert({ program_id: prog.id, name: 'Block 1', duration_weeks: 1, order_index: 0 }).select('id').single()
      const { data: tmpl } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: null, client_id: null, name: '[E2E] 1RM Have Squat' }).select('id').single()
      await db.from('workout_template_exercises').insert({ template_id: tmpl.id, exercise_name: '[E2E] Have Squat', exercise_type: 'strength', order_index: 0, sets_json: [{ effortType: 'rpe', repsMin: '5', repsMax: '5', intensityMin: '70', intensityMax: '70' }] })
      await db.from('program_phase_workouts').insert({ phase_id: phase.id, day_of_week: 1, day_label: 'Monday', session_order: 1, template_id: tmpl.id, week_number: 1 })
      await db.from('client_1rms').delete().eq('client_id', cid).eq('exercise_name', '[E2E] Have Squat')
      await db.from('client_1rms').insert({ client_id: cid, exercise_name: '[E2E] Have Squat', one_rm_kg: 123, recorded_at: new Date().toISOString().split('T')[0] })
      return { programId: prog.id, templateId: tmpl.id, clientId: cid }
    }, clientId)

    // See the sibling test above for why this is try/finally — a failed assertion here left
    // "[E2E] 1RM Have Program"/"[E2E] 1RM Have Squat" debris behind the same way.
    try {
      await page.reload()
      await page.waitForSelector('h1:has-text("Programs")', { timeout: 8000 })
      await page.click('text=[E2E] 1RM Have Program')
      await page.waitForSelector('button:has-text("Assign to client")', { timeout: 8000 })
      await page.click('button:has-text("Assign to client")')
      await expect(page.locator('#apc-modal')).toBeVisible({ timeout: 4000 })
      await page.selectOption('#apc-client', setup.clientId)
      await expect(page.locator('#apc-missing-1rm')).toContainText('all on file', { timeout: 6000 })
      await expect(page.locator('#apc-missing-1rm')).toContainText('123.0 kg (on file)')

      await page.click('#apc-modal .modal-footer button:has-text("Cancel")')
      await page.waitForSelector('#apc-modal', { state: 'detached', timeout: 4000 })
    } finally {
      await page.evaluate(async ({ programId, templateId, clientId }) => {
        await db.from('client_1rms').delete().eq('client_id', clientId).eq('exercise_name', '[E2E] Have Squat')
        await db.from('programs').delete().eq('id', programId)
        await db.from('workout_templates').delete().eq('id', templateId)
      }, { programId: setup.programId, templateId: setup.templateId, clientId: setup.clientId })
    }
  })
})

test.describe('Duplicate week / fork-on-edit / delete blocking', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsPT(page)
    await clickVisible(page, '[data-page="programs"]')
    await page.waitForSelector('h1:has-text("Programs")', { timeout: 8000 })
  })
  test.afterEach(async ({ page }) => { await sweepProgramFixtures(page) })

  test('duplicating a week copies its day/workout assignments into the next empty week', async ({ page }) => {
    await page.click('button:has-text("New program")')
    await page.fill('#pm-name', '[E2E] Duplicate Week Test')
    await page.click('#pm-save-btn')
    await page.waitForSelector('h1:has-text("[E2E] Duplicate Week Test")', { timeout: 8000 })

    await page.click('button:has-text("Add phase")')
    await page.fill('#pf-name', 'Block 1')
    await page.fill('#pf-weeks', '2')
    await page.click('#pf-save-btn')
    await expect(page.locator('text=Block 1')).toBeVisible({ timeout: 8000 })

    await expect(page.locator(daySlotBtn(1))).toBeVisible({ timeout: 8000 })
    const templateIds = await availableTemplateIds(page)
    test.skip(templateIds.length === 0, 'E2E PT account has no workout templates to assign')
    const phaseId = await page.locator(daySlotBtn(1)).getAttribute('data-phase')
    await assignWorkoutToDay(page, 1, templateIds[0])
    await expect(page.locator('[id^="phase-workouts-"] .pwk-slot-name').first()).toBeVisible({ timeout: 8000 })

    await expect(page.locator('button:has-text("Duplicate week")')).toBeVisible({ timeout: 4000 })
    await page.click('button:has-text("Duplicate week")')
    await expect(page.locator('.week-tab[data-week="2"]')).toBeVisible({ timeout: 8000 })

    const weeks = await page.evaluate(async (phaseId) => {
      const { data } = await db.from('program_phase_workouts').select('week_number, template_id').eq('phase_id', phaseId)
      return data
    }, phaseId)
    const week1 = weeks.find(w => w.week_number === 1)
    const week2Rows = weeks.filter(w => w.week_number === 2)
    expect(week2Rows.length).toBe(1)
    expect(week2Rows[0].template_id).toBe(week1.template_id)

    page.once('dialog', d => d.accept())
    await page.click('button:has-text("Delete")')
    await page.waitForSelector('h1:has-text("Programs")', { timeout: 8000 })
  })

  test('editing a workout assigned to two slots forks a copy instead of overwriting the shared one', async ({ page }) => {
    const setup = await page.evaluate(async () => {
      const { data: prog } = await db.from('programs').insert({ coach_id: currentUser.id, name: '[E2E] Fork Test Program' }).select('id').single()
      const { data: phase } = await db.from('program_phases').insert({ program_id: prog.id, name: 'Block 1', duration_weeks: 1, order_index: 0 }).select('id').single()
      const { data: tmpl } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: prog.id, client_id: null, name: '[E2E] Shared Workout' }).select('id').single()
      const { data: mon } = await db.from('program_phase_workouts').insert({ phase_id: phase.id, day_of_week: 1, day_label: 'Monday', session_order: 1, template_id: tmpl.id, week_number: 1 }).select('id').single()
      const { data: tue } = await db.from('program_phase_workouts').insert({ phase_id: phase.id, day_of_week: 2, day_label: 'Tuesday', session_order: 1, template_id: tmpl.id, week_number: 1 }).select('id').single()
      return { programId: prog.id, templateId: tmpl.id, mondayPwId: mon.id, tuesdayPwId: tue.id }
    })

    await page.reload()
    await page.waitForSelector('h1:has-text("Programs")', { timeout: 8000 })
    await page.click('text=[E2E] Fork Test Program')
    await page.waitForSelector('text=[E2E] Shared Workout', { timeout: 8000 })

    // Open Monday's session inline (first slot in day order), then Edit → the full template editor.
    await page.locator('.pwk-slot-head').first().click()
    await page.locator('.pwk-act.edit').first().click()
    await expect(page.locator('h1:has-text("[E2E] Shared Workout")')).toBeVisible({ timeout: 8000 })
    await page.click('button:has-text("Edit")')
    await expect(page.locator('#edit-template-modal')).toBeVisible({ timeout: 4000 })
    await page.fill('#et-name', '[E2E] Shared Workout (Monday only)')
    await page.click('#edit-template-modal button:has-text("Save")')
    await page.waitForSelector('#edit-template-modal', { state: 'detached', timeout: 8000 })

    const rows = await page.evaluate(async ({ mondayPwId, tuesdayPwId }) => {
      const { data: mon } = await db.from('program_phase_workouts').select('template_id').eq('id', mondayPwId).single()
      const { data: tue } = await db.from('program_phase_workouts').select('template_id').eq('id', tuesdayPwId).single()
      return { monTemplateId: mon.template_id, tueTemplateId: tue.template_id }
    }, { mondayPwId: setup.mondayPwId, tuesdayPwId: setup.tuesdayPwId })

    expect(rows.tueTemplateId).toBe(setup.templateId) // Tuesday untouched — still the shared original
    expect(rows.monTemplateId).not.toBe(setup.templateId) // Monday forked to its own copy

    // Cleanup
    await page.evaluate(async ({ programId, templateId, monTemplateId }) => {
      await db.from('workout_template_exercises').delete().eq('template_id', monTemplateId)
      await db.from('workout_templates').delete().eq('id', monTemplateId)
      await db.from('workout_templates').delete().eq('id', templateId)
      await db.from('programs').delete().eq('id', programId)
    }, { programId: setup.programId, templateId: setup.templateId, monTemplateId: rows.monTemplateId })
  })

  test('propagating a workout edit updates ONLY the changed exercise, never the whole target workout (2026-07-12)', async ({ page }) => {
    // Regression for the wholesale-overwrite bug: "Update all same-named sessions" used to delete
    // every exercise in each target and re-insert the source's full list, silently wiping any
    // exercise a target had that the source didn't. It must now apply only the one changed exercise,
    // matched by name, and leave everything else in the target intact.
    const setup = await page.evaluate(async () => {
      const mk = (name) => db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: null, client_id: null, name }).select('id').single().then(r => r.data.id)
      const t2 = await mk('[E2E] Prop Target')
      // Target has FOUR exercises, incl. "[E2E] Unique" which the source does not have.
      await db.from('workout_template_exercises').insert([
        { template_id: t2, exercise_name: '[E2E] Squat', exercise_type: 'strength', order_index: 0, sets: 3 },
        { template_id: t2, exercise_name: '[E2E] Bench', exercise_type: 'strength', order_index: 1, sets: 3, notes: 'original' },
        { template_id: t2, exercise_name: '[E2E] Row', exercise_type: 'strength', order_index: 2, sets: 3 },
        { template_id: t2, exercise_name: '[E2E] Unique', exercise_type: 'strength', order_index: 3, sets: 3 },
      ])
      return { t2 }
    })

    // UPDATE propagation: change only "[E2E] Bench".
    await page.evaluate(async (t2) => {
      const change = { op: 'update', matchName: '[E2E] Bench', row: { exercise_id: null, exercise_name: '[E2E] Bench', exercise_type: 'strength', sets: 5, sets_json: null, notes: 'CHANGED', superset_group: null } }
      await _propagateExerciseChangeToTemplates(change, [t2])
    }, setup.t2)

    const after = await page.evaluate(async (t2) => {
      const { data } = await db.from('workout_template_exercises').select('exercise_name, sets, notes').eq('template_id', t2).order('order_index')
      return data
    }, setup.t2)

    // All four exercises still present, in order — the target was NOT wiped.
    expect(after.map(e => e.exercise_name)).toEqual(['[E2E] Squat', '[E2E] Bench', '[E2E] Row', '[E2E] Unique'])
    // Only Bench changed.
    const bench = after.find(e => e.exercise_name === '[E2E] Bench')
    expect(bench.notes).toBe('CHANGED')
    expect(bench.sets).toBe(5)
    // "[E2E] Unique" (absent from the source) survived — the old wholesale copy would have deleted it.
    expect(after.some(e => e.exercise_name === '[E2E] Unique')).toBe(true)

    // DELETE propagation removes only the named exercise.
    await page.evaluate(async (t2) => {
      await _propagateExerciseChangeToTemplates({ op: 'delete', matchName: '[E2E] Row', row: null }, [t2])
    }, setup.t2)
    const afterDel = await page.evaluate(async (t2) => {
      const { data } = await db.from('workout_template_exercises').select('exercise_name').eq('template_id', t2).order('order_index')
      return (data || []).map(e => e.exercise_name)
    }, setup.t2)
    expect(afterDel).toEqual(['[E2E] Squat', '[E2E] Bench', '[E2E] Unique'])

    await page.evaluate(async (t2) => {
      await db.from('workout_template_exercises').delete().eq('template_id', t2)
      await db.from('workout_templates').delete().eq('id', t2)
    }, setup.t2)
  })

  test('_assignedCopiesForSession finds a real client copy of an edited session and names the client (2026-07-12)', async ({ page }) => {
    // #2's classifier finds the assigned client copies of a program session so a program edit can be
    // pushed to them without re-assigning. This proves the real-client path (prompt-gated) end to
    // end: build a program session, assign it to a real client with a cloned copy, and confirm the
    // classifier surfaces that copy under realClientIds with the client's name. (The symmetric
    // solo-self path can't be fixtured from the PT account — inserting a clients row with
    // coach_id=null is refused by RLS — so that half is verified live.)
    const setup = await page.evaluate(async () => {
      const { data: prog } = await db.from('programs').insert({ coach_id: currentUser.id, name: '[E2E] Copy Class Prog' }).select('id').single()
      const { data: phase } = await db.from('program_phases').insert({ program_id: prog.id, name: 'B1', duration_weeks: 1, order_index: 0 }).select('id').single()
      const { data: master } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: prog.id, client_id: null, name: '[E2E] Copy Class WO' }).select('id').single()
      const { data: ppw } = await db.from('program_phase_workouts').insert({ phase_id: phase.id, day_of_week: 1, day_label: 'Monday', session_order: 1, template_id: master.id, week_number: 1 }).select('id').single()

      const { data: realClient } = await db.from('clients').insert({ coach_id: currentUser.id, full_name: '[E2E] Real Client' }).select('id').single()
      const { data: realCp } = await db.from('client_programs').insert({ client_id: realClient.id, program_id: prog.id }).select('id').single()
      const { data: realCopy } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: null, client_id: realClient.id, name: '[E2E] Copy Class WO' }).select('id').single()
      await db.from('client_program_workouts').insert({ client_program_id: realCp.id, program_phase_workout_id: ppw.id, workout_template_id: realCopy.id, week_number: 1 })

      const res = await _assignedCopiesForSession([master.id])
      return { res, realClientId: realClient.id, realCopy: realCopy.id, progId: prog.id, master: master.id }
    })

    expect(setup.res.realClientIds).toContain(setup.realCopy)
    expect(setup.res.realClientNames).toContain('[E2E] Real Client')
    expect(setup.res.soloSelfIds).not.toContain(setup.realCopy) // a coached client is never mis-tagged as the user's own

    await page.evaluate(async (s) => {
      for (const t of [s.realCopy, s.master]) await db.from('workout_template_exercises').delete().eq('template_id', t)
      await db.from('client_programs').delete().eq('program_id', s.progId)
      // Delete the program FIRST so its cascade removes program_phase_workouts (which FK-references
      // the master template) — otherwise the master-template delete below can silently fail and
      // strand an [E2E] row.
      await db.from('programs').delete().eq('id', s.progId)
      for (const t of [s.realCopy, s.master]) await db.from('workout_templates').delete().eq('id', t)
      await db.from('clients').delete().eq('id', s.realClientId)
    }, setup)
  })

  test('_applyToAllSessions applies only the changed exercise to sibling sessions, end to end (2026-07-12)', async ({ page }) => {
    // Drives the actual "Update all same-named sessions" entry point (not just the primitive) so a
    // regression that restored the old delete-all/reinsert-all wholesale copy in _applyToAllSessions
    // itself would fail here. Source and one sibling target; the target has an extra exercise the
    // source lacks, which must survive.
    const setup = await page.evaluate(async () => {
      const mk = (name) => db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: null, client_id: null, name }).select('id').single().then(r => r.data.id)
      const src = await mk('[E2E] AllSess Source')
      const tgt = await mk('[E2E] AllSess Target')
      await db.from('workout_template_exercises').insert([
        { template_id: src, exercise_name: '[E2E] Squat', exercise_type: 'strength', order_index: 0, sets: 3 },
        { template_id: src, exercise_name: '[E2E] Bench', exercise_type: 'strength', order_index: 1, sets: 5, notes: 'new' },
      ])
      await db.from('workout_template_exercises').insert([
        { template_id: tgt, exercise_name: '[E2E] Squat', exercise_type: 'strength', order_index: 0, sets: 3 },
        { template_id: tgt, exercise_name: '[E2E] Bench', exercise_type: 'strength', order_index: 1, sets: 3, notes: 'old' },
        { template_id: tgt, exercise_name: '[E2E] Unique', exercise_type: 'strength', order_index: 2, sets: 3 },
      ])
      return { src, tgt }
    })

    await page.evaluate(async ({ src, tgt }) => {
      // Simulate the state _checkSiblingPropagation would have set right before showing the modal,
      // then invoke the button's handler. ctx has no programId, so the client-copy sync branch is skipped.
      window._templateCtx = {}
      window._propagateTargets = [tgt]
      window._lastExerciseChange = { op: 'update', matchName: '[E2E] Bench', row: { exercise_id: null, exercise_name: '[E2E] Bench', exercise_type: 'strength', sets: 5, sets_json: null, notes: 'new', superset_group: null } }
      await _applyToAllSessions(src)
    }, setup)

    const after = await page.evaluate(async (tgt) => {
      const { data } = await db.from('workout_template_exercises').select('exercise_name, sets, notes').eq('template_id', tgt).order('order_index')
      return data
    }, setup.tgt)

    expect(after.map(e => e.exercise_name)).toEqual(['[E2E] Squat', '[E2E] Bench', '[E2E] Unique']) // Unique survived; no wholesale wipe
    expect(after.find(e => e.exercise_name === '[E2E] Bench').notes).toBe('new') // only Bench changed
    expect(after.find(e => e.exercise_name === '[E2E] Bench').sets).toBe(5)
    expect(after.find(e => e.exercise_name === '[E2E] Squat').sets).toBe(3) // Squat untouched

    await page.evaluate(async ({ src, tgt }) => {
      for (const t of [src, tgt]) { await db.from('workout_template_exercises').delete().eq('template_id', t); await db.from('workout_templates').delete().eq('id', t) }
    }, setup)
  })

  test('deleting a program with an assigned client names them in the block toast', async ({ page }) => {
    // Same class as the two tests above, and it had BOTH leak paths: the client lookup sat after the
    // programs/client_programs inserts so a fired test.skip() stranded them, AND the cleanup was a
    // trailing evaluate with no try/finally, so a failed assertion stranded them too. Lookup hoisted
    // above the writes; cleanup moved into a finally. Found by multi-agent-review 2026-08-20 after the
    // first pass fixed only the two instances it happened to grep up — the class, not the instance.
    const client = await page.evaluate(async () => {
      const { data } = await db.from('clients').select('id, full_name').eq('coach_id', currentUser.id).limit(1)
      return data?.[0] ? { id: data[0].id, name: data[0].full_name } : null
    })
    test.skip(!client, 'E2E PT account has no clients to assign to')

    const setup = await page.evaluate(async (cid) => {
      const { data: prog } = await db.from('programs').insert({ coach_id: currentUser.id, name: '[E2E] Delete Block Test' }).select('id').single()
      await db.from('client_programs').insert({ client_id: cid, program_id: prog.id })
      return { programId: prog.id }
    }, client.id)

    try {
      await page.reload()
      await page.waitForSelector('h1:has-text("Programs")', { timeout: 8000 })
      await page.click('text=[E2E] Delete Block Test')
      await page.waitForSelector('button:has-text("Delete")', { timeout: 8000 })
      await page.click('button:has-text("Delete")')
      await expect(page.locator('#app-toast')).toContainText(client.name, { timeout: 4000 })
    } finally {
      await page.evaluate(async ({ programId, clientId }) => {
        await db.from('client_programs').delete().eq('client_id', clientId).eq('program_id', programId)
        await db.from('programs').delete().eq('id', programId)
      }, { programId: setup.programId, clientId: client.id }).catch(() => {})
    }
  })

  test('deleting a week removes its sessions and renumbers later weeks down by 1 (2026-07-10)', async ({ page }) => {
    const setup = await page.evaluate(async () => {
      const { data: prog } = await db.from('programs').insert({ coach_id: currentUser.id, name: '[E2E] Delete Week Test' }).select('id').single()
      const { data: phase } = await db.from('program_phases').insert({ program_id: prog.id, name: 'Block 1', duration_weeks: 3, order_index: 0 }).select('id').single()
      const mk = async (name) => (await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: prog.id, client_id: null, name }).select('id').single()).data.id
      const tmplW1 = await mk('[E2E] DW Week1 Session')
      const tmplW2 = await mk('[E2E] DW Week2 Session')
      const tmplW3 = await mk('[E2E] DW Week3 Session')
      await db.from('program_phase_workouts').insert({ phase_id: phase.id, day_of_week: 1, day_label: 'Monday', session_order: 1, template_id: tmplW1, week_number: 1 })
      await db.from('program_phase_workouts').insert({ phase_id: phase.id, day_of_week: 1, day_label: 'Monday', session_order: 1, template_id: tmplW2, week_number: 2 })
      await db.from('program_phase_workouts').insert({ phase_id: phase.id, day_of_week: 1, day_label: 'Monday', session_order: 1, template_id: tmplW3, week_number: 3 })
      return { programId: prog.id, phaseId: phase.id, tmplW1, tmplW2, tmplW3 }
    })

    try {
      await clickVisible(page, '[data-page="programs"]')
      await page.waitForSelector('h1:has-text("Programs")', { timeout: 8000 })
      await page.evaluate((programId) => openProgram(programId), setup.programId)
      await page.waitForSelector('.week-tab[data-week="3"]', { timeout: 8000 })
      await expect(page.locator('button:has-text("Delete week")').first()).toBeVisible({ timeout: 4000 })

      page.once('dialog', d => d.accept())
      await page.evaluate(({ phaseId }) => deletePhaseWeek(phaseId, 2), setup)
      await page.waitForTimeout(1000)

      const result = await page.evaluate(async ({ phaseId }) => {
        const { data: rows } = await db.from('program_phase_workouts').select('week_number, template_id').eq('phase_id', phaseId)
        const { data: phaseRow } = await db.from('program_phases').select('duration_weeks').eq('id', phaseId).single()
        return { rows, duration: phaseRow.duration_weeks }
      }, setup)

      expect(result.duration).toBe(2)
      expect(result.rows.length).toBe(2)
      const week1 = result.rows.find(r => r.week_number === 1)
      const week2 = result.rows.find(r => r.week_number === 2)
      expect(week1?.template_id).toBe(setup.tmplW1) // untouched
      expect(week2?.template_id).toBe(setup.tmplW3) // old week 3 shifted down into week 2's slot
      expect(result.rows.some(r => r.week_number === 3)).toBe(false)

      // The deleted week's own template is gone; the shifted-down week's template survives
      const remainingTemplates = await page.evaluate(async ({ tmplW2, tmplW3 }) => {
        const { data } = await db.from('workout_templates').select('id').in('id', [tmplW2, tmplW3])
        return (data || []).map(t => t.id)
      }, setup)
      expect(remainingTemplates).not.toContain(setup.tmplW2)
      expect(remainingTemplates).toContain(setup.tmplW3)
    } finally {
      await page.evaluate(async ({ programId, tmplW1, tmplW2, tmplW3 }) => {
        await db.from('programs').delete().eq('id', programId) // cascades program_phases -> program_phase_workouts
        await db.from('workout_templates').delete().in('id', [tmplW1, tmplW2, tmplW3])
      }, setup)
    }
  })

  test('deleting a week never destroys a shared standalone template also assigned to that slot (2026-07-10)', async ({ page }) => {
    // Regression guard for the exact bug deleteProgram() was fixed for this morning: a slot can
    // reference a template with program_id/generated_from_phase_id both null (a genuine
    // standalone template the coach reuses elsewhere) -- deleting the week must not delete it.
    const setup = await page.evaluate(async () => {
      const { data: prog } = await db.from('programs').insert({ coach_id: currentUser.id, name: '[E2E] Delete Week Shared Test' }).select('id').single()
      const { data: phase } = await db.from('program_phases').insert({ program_id: prog.id, name: 'Block 1', duration_weeks: 1, order_index: 0 }).select('id').single()
      const { data: shared } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: null, client_id: null, name: '[E2E] DW Shared Template' }).select('id').single()
      await db.from('program_phase_workouts').insert({ phase_id: phase.id, day_of_week: 1, day_label: 'Monday', session_order: 1, template_id: shared.id, week_number: 1 })
      return { programId: prog.id, phaseId: phase.id, sharedTemplateId: shared.id }
    })

    try {
      page.once('dialog', d => d.accept())
      await page.evaluate(({ phaseId }) => deletePhaseWeek(phaseId, 1), setup)
      await page.waitForTimeout(800)

      const stillExists = await page.evaluate(async (sharedTemplateId) => {
        const { data } = await db.from('workout_templates').select('id').eq('id', sharedTemplateId).maybeSingle()
        return !!data
      }, setup.sharedTemplateId)
      expect(stillExists).toBe(true)
    } finally {
      await page.evaluate(async ({ programId, sharedTemplateId }) => {
        await db.from('programs').delete().eq('id', programId)
        await db.from('workout_templates').delete().eq('id', sharedTemplateId)
      }, setup)
    }
  })

  test('deleting an un-forked duplicated week never destroys the template a sibling week still points at (2026-07-10, found by multi-agent review)', async ({ page }) => {
    // duplicatePhaseWeek is "cheap by design" -- the new week's row points at the SAME
    // template_id as the source week, only forking into an independent copy once someone edits
    // one (_resolveEditableTemplateId). deletePhaseWeek's ownership check alone ("does the coach
    // own this template") isn't enough here: the template IS owned by this program, but it's
    // still referenced by the surviving week's row. First version of the fix missed this and
    // would have silently emptied the surviving week's session.
    const setup = await page.evaluate(async () => {
      const { data: prog } = await db.from('programs').insert({ coach_id: currentUser.id, name: '[E2E] Delete Week Duplicate Test' }).select('id').single()
      const { data: phase } = await db.from('program_phases').insert({ program_id: prog.id, name: 'Block 1', duration_weeks: 2, order_index: 0 }).select('id').single()
      const { data: tmpl } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: prog.id, client_id: null, name: '[E2E] DW Duplicated Session' }).select('id').single()
      // Both weeks point at the SAME template_id -- exactly what "Duplicate week" produces before a fork.
      await db.from('program_phase_workouts').insert({ phase_id: phase.id, day_of_week: 1, day_label: 'Monday', session_order: 1, template_id: tmpl.id, week_number: 1 })
      await db.from('program_phase_workouts').insert({ phase_id: phase.id, day_of_week: 1, day_label: 'Monday', session_order: 1, template_id: tmpl.id, week_number: 2 })
      return { programId: prog.id, phaseId: phase.id, templateId: tmpl.id }
    })

    try {
      page.once('dialog', d => d.accept())
      await page.evaluate(({ phaseId }) => deletePhaseWeek(phaseId, 2), setup)
      await page.waitForTimeout(800)

      const result = await page.evaluate(async ({ phaseId, templateId }) => {
        const { data: templateStillExists } = await db.from('workout_templates').select('id').eq('id', templateId).maybeSingle()
        const { data: week1Row } = await db.from('program_phase_workouts').select('template_id').eq('phase_id', phaseId).eq('week_number', 1).single()
        return { templateExists: !!templateStillExists, week1TemplateId: week1Row?.template_id }
      }, setup)

      expect(result.templateExists).toBe(true)
      expect(result.week1TemplateId).toBe(setup.templateId)
    } finally {
      await page.evaluate(async ({ programId, templateId }) => {
        await db.from('programs').delete().eq('id', programId)
        await db.from('workout_templates').delete().eq('id', templateId)
      }, setup)
    }
  })
})

test.describe('Copy program workouts to Library + duplicate-week auto-extend (2026-07-11)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsPT(page)
    await clickVisible(page, '[data-page="programs"]')
    await page.waitForSelector('h1:has-text("Programs")', { timeout: 8000 })
  })

  test('duplicating the last week of a full phase extends the phase instead of refusing', async ({ page }) => {
    // Previously canDuplicateAny (maxWeek < durationWeeks) hid the button entirely on a 1-week
    // phase, and duplicatePhaseWeek bailed with "no more weeks to fill" -- so "repeat this week"
    // silently had no control at all, with no hint you had to go raise the phase duration first.
    const setup = await page.evaluate(async () => {
      const { data: prog } = await db.from('programs').insert({ coach_id: currentUser.id, name: '[E2E] AutoExtend Program' }).select('id').single()
      const { data: phase } = await db.from('program_phases').insert({ program_id: prog.id, name: 'Block 1', duration_weeks: 1, order_index: 0 }).select('id').single()
      const { data: tmpl } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: prog.id, client_id: null, name: '[E2E] AutoExtend Session' }).select('id').single()
      await db.from('program_phase_workouts').insert({ phase_id: phase.id, day_of_week: 1, day_label: 'Monday', session_order: 1, template_id: tmpl.id, week_number: 1 })
      return { programId: prog.id, phaseId: phase.id, templateId: tmpl.id }
    })

    try {
      await page.evaluate(async (programId) => { await openProgram(programId) }, setup.programId)
      await page.waitForSelector('h1:has-text("[E2E] AutoExtend Program")', { timeout: 8000 })

      // The button must now be present even though the phase is already "full" (1 of 1 weeks).
      const dupBtn = page.locator('button:has-text("Duplicate week")').first()
      await expect(dupBtn).toBeVisible({ timeout: 8000 })
      await dupBtn.click()
      await expect(page.locator('text=phase extended to 2 weeks')).toBeVisible({ timeout: 8000 })

      const after = await page.evaluate(async ({ phaseId }) => {
        const { data: ph } = await db.from('program_phases').select('duration_weeks').eq('id', phaseId).single()
        const { data: pws } = await db.from('program_phase_workouts').select('week_number').eq('phase_id', phaseId)
        return { durationWeeks: ph.duration_weeks, weeks: (pws || []).map(p => p.week_number).sort() }
      }, setup)
      expect(after.durationWeeks).toBe(2)        // the phase grew
      expect(after.weeks).toEqual([1, 2])        // and week 2 actually got the copied session
    } finally {
      await page.evaluate(async ({ programId, templateId }) => {
        await db.from('programs').delete().eq('id', programId)
        await db.from('workout_templates').delete().eq('id', templateId)
      }, setup)
    }
  })

  test('copying a program workout to the Library makes it standalone and reusable, and is idempotent', async ({ page }) => {
    // The bridge that was missing: a workout built with "+ Create new workout (this day only)"
    // carries program_id, so it is deliberately excluded from the reuse pool and could only be
    // reused by retyping it. Copying lifts it into the standalone library (all three ownership
    // columns null) without touching the original.
    const setup = await page.evaluate(async () => {
      const { data: prog } = await db.from('programs').insert({ coach_id: currentUser.id, name: '[E2E] CopyLib Program' }).select('id').single()
      const { data: phase } = await db.from('program_phases').insert({ program_id: prog.id, name: 'Block 1', duration_weeks: 1, order_index: 0 }).select('id').single()
      const { data: tmpl } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: prog.id, client_id: null, name: '[E2E] CopyLib Session', description: 'Heavy day' }).select('id').single()
      await db.from('workout_template_exercises').insert({ template_id: tmpl.id, exercise_name: '[E2E] CopyLib Bench', exercise_type: 'strength', order_index: 0, sets_json: [{ repsMin: '5', repsMax: '5' }] })
      await db.from('program_phase_workouts').insert({ phase_id: phase.id, day_of_week: 1, day_label: 'Monday', session_order: 1, template_id: tmpl.id, week_number: 1 })
      return { programId: prog.id, templateId: tmpl.id }
    })

    try {
      const first = await page.evaluate(async (programId) => {
        await copyProgramWorkoutsToLibrary(programId)
        const { data } = await db.from('workout_templates')
          .select('id, program_id, client_id, generated_from_phase_id, description, workout_template_exercises(exercise_name)')
          .eq('coach_id', currentUser.id).eq('name', '[E2E] CopyLib Session')
          .is('program_id', null)
        return data || []
      }, setup.programId)

      expect(first).toHaveLength(1)                                   // exactly one library copy
      expect(first[0].program_id).toBeNull()                          // standalone...
      expect(first[0].client_id).toBeNull()
      expect(first[0].generated_from_phase_id).toBeNull()             // ...and not a week-clone
      expect(first[0].description).toBe('Heavy day')                  // description carried over
      expect(first[0].workout_template_exercises).toHaveLength(1)     // exercises carried over

      // Idempotent: clicking again must not create a second copy.
      const second = await page.evaluate(async (programId) => {
        await copyProgramWorkoutsToLibrary(programId)
        const { data } = await db.from('workout_templates').select('id')
          .eq('coach_id', currentUser.id).eq('name', '[E2E] CopyLib Session').is('program_id', null)
        return (data || []).length
      }, setup.programId)
      expect(second).toBe(1)
    } finally {
      await page.evaluate(async ({ programId, templateId }) => {
        await db.from('programs').delete().eq('id', programId)
        await db.from('workout_templates').delete().eq('id', templateId)
        await db.from('workout_templates').delete().eq('coach_id', currentUser.id).eq('name', '[E2E] CopyLib Session')
      }, setup)
    }
  })

  test('Generate weeks never destroys a Week-1 workout whose template a duplicated week shares (found by multi-agent review, 2026-07-11)', async ({ page }) => {
    // _cleanupPhaseWeeksBeyond deleted EVERY template a stale week referenced, with no ownership and
    // no still-referenced check -- unlike its sibling deletePhaseWeek, which got both guards on
    // 2026-07-10. "Duplicate week" is cheap by design (the new week shares the source's template_id),
    // so regenerating periodization harvested Week 1's own template off the Week 2 row and deleted it
    // while Week 1 still pointed at it. Both now share _deleteOwnedUnreferencedTemplates.
    const setup = await page.evaluate(async () => {
      const { data: prog } = await db.from('programs').insert({ coach_id: currentUser.id, name: '[E2E] Cleanup Guard Program' }).select('id').single()
      const { data: phase } = await db.from('program_phases').insert({ program_id: prog.id, name: 'Block 1', duration_weeks: 2, order_index: 0, periodization_type: 'linear', periodization_config: { startPct: 70, endPct: 80 } }).select('id').single()
      const { data: tmpl } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: prog.id, client_id: null, name: '[E2E] Cleanup Guard Session' }).select('id').single()
      await db.from('workout_template_exercises').insert({ template_id: tmpl.id, exercise_name: '[E2E] Guard Squat', exercise_type: 'strength', order_index: 0, sets_json: [{ repsMin: '5', intensityMin: '70' }] })
      // Week 1 and a duplicated Week 2 BOTH point at the same template_id (the shared-until-forked case).
      await db.from('program_phase_workouts').insert([
        { phase_id: phase.id, day_of_week: 1, day_label: 'Monday', session_order: 1, template_id: tmpl.id, week_number: 1 },
        { phase_id: phase.id, day_of_week: 1, day_label: 'Monday', session_order: 1, template_id: tmpl.id, week_number: 2 },
      ])
      return { programId: prog.id, phaseId: phase.id, templateId: tmpl.id }
    })

    try {
      // Regenerating prunes week 2+ first — which must NOT take Week 1's still-referenced template with it.
      await page.evaluate(async ({ phaseId, programId }) => {
        window.confirm = () => true
        await generatePhasePeriodization(phaseId, programId)
      }, setup)
      await page.waitForTimeout(1500)

      const survived = await page.evaluate(async ({ templateId }) => {
        const { data } = await db.from('workout_templates').select('id').eq('id', templateId)
        return (data || []).length
      }, setup)
      expect(survived).toBe(1) // Week 1's workout must still exist
    } finally {
      await page.evaluate(async ({ programId, templateId }) => {
        // Delete the program FIRST — that cascades its phases, which SET NULL the
        // generated_from_phase_id on any periodization week-clone generated above. Those clones then
        // look like genuine standalone templates and orphan into the reusable pool, where they sort
        // ABOVE "Push Day A" ('[' < 'P') and get grabbed by the client-runner tests' "first Start
        // button" — breaking 8 of them. Sweep by name, or this test quietly poisons runner.spec.js.
        await db.from('programs').delete().eq('id', programId)
        await db.from('workout_templates').delete().eq('id', templateId)
        await db.from('workout_templates').delete().eq('coach_id', currentUser.id).ilike('name', '[E2E] Cleanup Guard Session%')
      }, setup)
    }
  })

  test('bulk copy does not silently drop distinct workouts that share a name (found by multi-agent review, 2026-07-11)', async ({ page }) => {
    // The bulk copy deduped its source list by NAME, so a program holding three genuinely different
    // "Upper Body" workouts copied only one — and the other two were reported as neither copied nor
    // skipped. Now deduped by template_id; same-name collisions are surfaced honestly instead.
    const setup = await page.evaluate(async () => {
      const { data: prog } = await db.from('programs').insert({ coach_id: currentUser.id, name: '[E2E] Dedupe Program' }).select('id').single()
      const { data: phase } = await db.from('program_phases').insert({ program_id: prog.id, name: 'Block 1', duration_weeks: 1, order_index: 0 }).select('id').single()
      // Two DIFFERENT workouts that happen to share a name — must not collapse into one.
      const { data: a } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: prog.id, client_id: null, name: '[E2E] Dedupe Upper Body' }).select('id').single()
      const { data: b } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: prog.id, client_id: null, name: '[E2E] Dedupe Upper Body' }).select('id').single()
      await db.from('program_phase_workouts').insert([
        { phase_id: phase.id, day_of_week: 1, day_label: 'Monday', session_order: 1, template_id: a.id, week_number: 1 },
        { phase_id: phase.id, day_of_week: 2, day_label: 'Tuesday', session_order: 1, template_id: b.id, week_number: 1 },
      ])
      return { programId: prog.id, aId: a.id, bId: b.id }
    })

    try {
      const outcome = await page.evaluate(async (programId) => {
        // Count how many distinct sources the bulk copy actually considered, via its real behaviour:
        // one gets copied, the same-named sibling is honestly reported as skipped (not dropped).
        await copyProgramWorkoutsToLibrary(programId)
        const { data } = await db.from('workout_templates').select('id')
          .eq('coach_id', currentUser.id).eq('name', '[E2E] Dedupe Upper Body').is('program_id', null)
        return (data || []).length
      }, setup.programId)
      // Exactly one library copy (the second collides on name and is skipped, not silently dropped)
      // — and critically, BOTH were considered, which the name-dedupe bug prevented.
      expect(outcome).toBe(1)
    } finally {
      await page.evaluate(async ({ programId, aId, bId }) => {
        await db.from('programs').delete().eq('id', programId)
        await db.from('workout_templates').delete().in('id', [aId, bId])
        await db.from('workout_templates').delete().eq('coach_id', currentUser.id).eq('name', '[E2E] Dedupe Upper Body')
      }, setup)
    }
  })

  test('the picker shows name, description and exercises so same-named workouts are distinguishable', async ({ page }) => {
    // The whole reason the <select> was replaced: an <option> is plain text, so three "Upper Body"
    // workouts were indistinguishable at the point of assignment (Jake, 2026-07-11).
    const setup = await page.evaluate(async () => {
      const { data: prog } = await db.from('programs').insert({ coach_id: currentUser.id, name: '[E2E] Picker Rows Program' }).select('id').single()
      const { data: phase } = await db.from('program_phases').insert({ program_id: prog.id, name: 'Block 1', duration_weeks: 1, order_index: 0 }).select('id').single()
      // Two standalone library workouts sharing a name — distinguishable only by description/exercises.
      const { data: a } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: null, client_id: null, name: '[E2E] Upper Body', description: 'Heavy day' }).select('id').single()
      const { data: b } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: null, client_id: null, name: '[E2E] Upper Body', description: 'Volume day' }).select('id').single()
      await db.from('workout_template_exercises').insert({ template_id: a.id, exercise_name: '[E2E] Heavy Bench', exercise_type: 'strength', order_index: 0, sets_json: [] })
      await db.from('workout_template_exercises').insert({ template_id: b.id, exercise_name: '[E2E] Volume Flye', exercise_type: 'strength', order_index: 0, sets_json: [] })
      return { programId: prog.id, phaseId: phase.id, aId: a.id, bId: b.id }
    })

    try {
      await page.evaluate(async (programId) => { await openProgram(programId) }, setup.programId)
      await page.waitForSelector('h1:has-text("[E2E] Picker Rows Program")', { timeout: 8000 })

      await openDayPicker(page, 1)
      const rowA = page.locator(pickerRow(setup.aId))
      const rowB = page.locator(pickerRow(setup.bId))
      await expect(rowA).toBeVisible({ timeout: 5000 })
      await expect(rowB).toBeVisible()
      // Same name, but each row carries what actually tells them apart.
      await expect(rowA).toContainText('Heavy day')
      await expect(rowA).toContainText('[E2E] Heavy Bench')
      await expect(rowB).toContainText('Volume day')
      await expect(rowB).toContainText('[E2E] Volume Flye')

      // Picking one assigns it to the slot. The modal closes before the insert resolves (the pick
      // handler fires it without awaiting, same as the exercise picker), so wait for the grid to
      // actually re-render with the assigned row rather than racing the DB read.
      await rowA.click()
      await page.waitForSelector('#workout-picker-modal', { state: 'detached', timeout: 5000 })
      await expect(page.locator('[id^="phase-workouts-"] .pwk-slot-name').first()).toBeVisible({ timeout: 8000 })
      const assigned = await page.evaluate(async ({ phaseId }) => {
        const { data } = await db.from('program_phase_workouts').select('template_id').eq('phase_id', phaseId)
        return (data || []).map(r => r.template_id)
      }, setup)
      expect(assigned).toEqual([setup.aId])
    } finally {
      await page.evaluate(async ({ programId, aId, bId }) => {
        await db.from('programs').delete().eq('id', programId)
        await db.from('workout_templates').delete().in('id', [aId, bId])
      }, setup)
    }
  })
})
