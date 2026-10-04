// Periodization by RPE (Jake, 2026-10-04: "Add periodization should come with a % and RPE tab so the user can choose how they wish
// to periodize their training"; scoped as ONE method per phase).
//
// tests-node/periodization-rpe.test.mjs pins the maths. This runs the real generator against real rows and drives the real dialog:
// the Method switch, the RPE fields, the live week-by-week preview, the heads-up, what is saved, and that a % phase is exactly what
// it was. Every generation test has a POSITIVE CONTROL (a value that must visibly step in the very same run), so "untouched" can
// never pass because the generator did nothing at all.
const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

const TAG = '[E2E] PerRpe'

// Sweep by name - see periodization-metric-type-2026-08-09.spec.js for why deleting the program alone strands the week clones.
async function sweep (page) {
  const r = await page.evaluate(async (TAG) => {
    const out = { programsFound: 0, programsRemoved: 0, exRemoved: 0, templatesFound: 0, templatesRemoved: 0 }
    const { data: progs } = await db.from('programs').select('id').eq('coach_id', currentUser.id).like('name', TAG + '%')
    out.programsFound = (progs || []).length
    for (const p of progs || []) { const { data } = await db.from('programs').delete().eq('id', p.id).select('id'); out.programsRemoved += (data || []).length }
    const { data: tmpls } = await db.from('workout_templates').select('id').eq('coach_id', currentUser.id).like('name', TAG + '%')
    const ids = (tmpls || []).map(t => t.id)
    out.templatesFound = ids.length
    if (ids.length) {
      const { data: exs } = await db.from('workout_template_exercises').delete().in('template_id', ids).select('id')
      out.exRemoved = (exs || []).length
      const { data: ts } = await db.from('workout_templates').delete().in('id', ids).select('id')
      out.templatesRemoved = (ts || []).length
    }
    return out
  }, TAG)
  // Said out loud: a refused delete returns { data: [], error: null } and would otherwise look like a clean teardown.
  if (r.programsRemoved !== r.programsFound || r.templatesRemoved !== r.templatesFound) console.warn(`[periodization-rpe] CLEANUP INCOMPLETE: ${JSON.stringify(r)}`)
}

// One program, one phase, and a Week-1 slot per entry of `slots`: { day, label, tier?, exercises: [{ name, sets }] }.
const seed = (page, { weeks = 4, type = null, config = null, slots }) => page.evaluate(async ({ TAG, weeks, type, config, slots }) => {
  const { data: prog } = await db.from('programs').insert({ coach_id: currentUser.id, name: TAG + ' Program' }).select('id').single()
  const { data: phase } = await db.from('program_phases').insert({
    program_id: prog.id, name: 'Block 1', duration_weeks: weeks, order_index: 0, periodization_type: type, periodization_config: config
  }).select('id').single()
  const templateIds = []
  for (const [i, slot] of slots.entries()) {
    const { data: tmpl } = await db.from('workout_templates')
      .insert({ coach_id: currentUser.id, program_id: prog.id, client_id: null, name: `${TAG} Session ${i + 1}` }).select('id').single()
    await db.from('workout_template_exercises').insert(slot.exercises.map((e, k) => ({
      template_id: tmpl.id, exercise_name: `${TAG} ${e.name}`, exercise_type: 'strength', metric_type: 'weight_reps', order_index: k, sets_json: e.sets
    })))
    await db.from('program_phase_workouts').insert({
      phase_id: phase.id, day_of_week: slot.day, day_label: slot.label, session_order: 1, template_id: tmpl.id, week_number: 1, tier: slot.tier ?? null
    })
    templateIds.push(tmpl.id)
  }
  return { programId: prog.id, phaseId: phase.id, templateIds }
}, { TAG, weeks, type, config, slots })

// Runs the real generator (the confirm is auto-accepted) and waits until every generated week exists.
const generate = async (page, s, expectedWeekRows) => {
  await page.evaluate(async ({ phaseId, programId }) => {
    window.confirmDialog = () => Promise.resolve(true)
    await generatePhasePeriodization(phaseId, programId)
  }, s)
  await expect.poll(() => page.evaluate(async (phaseId) => {
    const { data } = await db.from('program_phase_workouts').select('id').eq('phase_id', phaseId).gt('week_number', 1)
    return (data || []).length
  }, s.phaseId), { message: 'the generated weeks must exist' }).toBe(expectedWeekRows)
}

// What the generator wrote: out[week][day][exercise short name] = sets_json (generated weeks only).
const readWeeks = (page, phaseId) => page.evaluate(async (phaseId) => {
  const { data: pws } = await db.from('program_phase_workouts').select('week_number, day_of_week, template_id').eq('phase_id', phaseId).gt('week_number', 1)
  const out = {}
  for (const pw of pws || []) {
    const { data: exs } = await db.from('workout_template_exercises').select('exercise_name, sets_json').eq('template_id', pw.template_id)
    ;((out[pw.week_number] = out[pw.week_number] || {})[pw.day_of_week] = {})
    for (const e of exs || []) out[pw.week_number][pw.day_of_week][e.exercise_name.split(' ').pop()] = e.sets_json
  }
  return out
}, phaseId)

const effort = s => [Number(s.effortMin), Number(s.effortMax)]
const rpeSet = (v, extra = {}) => ({ repsMin: '5', effortType: 'rpe', effortMin: String(v), effortMax: String(v), ...extra })
const rirSet = v => ({ repsMin: '5', effortType: 'rir', effortMin: String(v), effortMax: String(v) })

test.describe('Periodization by RPE - the generator', () => {
  test.beforeEach(async ({ page }) => { await loginAsPT(page); await sweep(page) })
  test.afterEach(async ({ page }) => { await sweep(page) })

  test('Linear RPE steps every set that has an RPE; a RIR set converts; % fields and effort-less sets are untouched', async ({ page }) => {
    const s = await seed(page, {
      weeks: 4, type: 'linear', config: { basis: 'rpe', startRpe: 7, endRpe: 9 },
      slots: [{ day: 1, label: 'Monday', exercises: [
        { name: 'Bench', sets: [
          rpeSet(7, { isTopSet: true, repsMin: '3', intensityBasis: 'stored' }),
          { repsMin: '8', intensityMin: '70', intensityMax: '70', intensityBasis: 'topSet' }] },
        { name: 'Squat', sets: [{ ...rirSet(3), intensityMin: '80', intensityMax: '80' }] },
        { name: 'Row', sets: [{ repsMin: '10', weightMin: '40' }] }
      ] }]
    })
    await generate(page, s, 3)
    const weeks = await readWeeks(page, s.phaseId)
    expect(Object.keys(weeks).sort(), 'weeks 2, 3 and 4').toEqual(['2', '3', '4'])

    // linear RPE 7 -> 9 over 4 weeks, half-point rounded: 7.5, 8.5, 9. RIR = 10 - RPE: 2.5, 1.5, 1.
    const rpe = { 2: 7.5, 3: 8.5, 4: 9 }, rir = { 2: 2.5, 3: 1.5, 4: 1 }
    for (const w of ['2', '3', '4']) {
      const { Bench, Squat, Row } = weeks[w][1]
      // POSITIVE CONTROLS - the wave really ran, on both scales
      expect(effort(Bench[0]), `week ${w}: the top set's RPE steps`).toEqual([rpe[w], rpe[w]])
      expect(Bench[0].effortType).toBe('rpe')
      expect(effort(Squat[0]), `week ${w}: a RIR set converts and stays on its own scale`).toEqual([rir[w], rir[w]])
      expect(Squat[0].effortType).toBe('rir')
      // THE POINT - nothing else moved
      expect(Bench[0].isTopSet, 'the top set stays the top set').toBe(true)
      expect(Bench[0].intensityBasis).toBe('stored')
      expect(Bench[1].intensityBasis, `week ${w}: the back-off is still pointed at the top set`).toBe('topSet')
      expect([Number(Bench[1].intensityMin), Number(Bench[1].intensityMax)], `week ${w}: its % is the one the coach typed`).toEqual([70, 70])
      expect([Number(Squat[0].intensityMin), Number(Squat[0].intensityMax)], `week ${w}: a %1RM on an RPE-phase set is NOT stepped`).toEqual([80, 80])
      expect(Row, `week ${w}: a set with no effort target is copied as typed`).toEqual([{ repsMin: '10', weightMin: '40' }])
    }

    // Week 1 is the base: the generator never rewrites it.
    const week1 = await page.evaluate(async (id) => (await db.from('workout_template_exercises').select('exercise_name, sets_json').eq('template_id', id)).data, s.templateIds[0])
    const bench1 = week1.find(e => e.exercise_name.endsWith('Bench')).sets_json[0]
    expect(effort(bench1)).toEqual([7, 7])
  })

  test('Undulating RPE gives each session its tier\'s RPE in every generated week', async ({ page }) => {
    const s = await seed(page, {
      weeks: 3, type: 'undulating',
      config: { basis: 'rpe', tiers: { heavy: { rpe: 9 }, moderate: { rpe: 8 }, light: { rpe: 7 } } },
      slots: [
        { day: 1, label: 'Monday', tier: 'heavy', exercises: [{ name: 'Bench', sets: [rpeSet(5)] }] },
        { day: 3, label: 'Wednesday', tier: 'light', exercises: [{ name: 'Bench', sets: [rpeSet(5)] }] },
        { day: 5, label: 'Friday', tier: null, exercises: [{ name: 'Bench', sets: [rpeSet(5)] }] }
      ]
    })
    await generate(page, s, 6)
    const weeks = await readWeeks(page, s.phaseId)
    for (const w of ['2', '3']) {
      expect(effort(weeks[w][1].Bench[0]), `week ${w}: Heavy`).toEqual([9, 9])
      expect(effort(weeks[w][3].Bench[0]), `week ${w}: Light`).toEqual([7, 7])
      expect(effort(weeks[w][5].Bench[0]), `week ${w}: a session with no tier is Moderate`).toEqual([8, 8])
    }
  })

  test('a deload week gets the deload RPE and the other weeks still step across the whole phase', async ({ page }) => {
    const s = await seed(page, {
      weeks: 4, type: 'linear', config: { basis: 'rpe', startRpe: 7, endRpe: 9, deloadWeek: 4, deloadRpe: 6 },
      slots: [{ day: 1, label: 'Monday', exercises: [{ name: 'Bench', sets: [rpeSet(7)] }] }]
    })
    await generate(page, s, 3)
    const weeks = await readWeeks(page, s.phaseId)
    expect(['2', '3', '4'].map(w => Number(weeks[w][1].Bench[0].effortMin))).toEqual([7.5, 8.5, 6])
  })

  test('an RPE phase whose Week 1 has no RPE says so instead of reporting a green success', async ({ page }) => {
    const s = await seed(page, {
      weeks: 3, type: 'linear', config: { basis: 'rpe', startRpe: 7, endRpe: 9 },
      slots: [{ day: 1, label: 'Monday', exercises: [{ name: 'Bench', sets: [{ repsMin: '5', intensityMin: '80', intensityMax: '80' }] }] }]
    })
    await generate(page, s, 2)
    const toast = page.locator('#app-toast')
    await expect(toast).toContainText('Generated weeks 2–3')
    await expect(toast).toContainText('no set in Week 1 has an RPE')
    await expect(toast, 'an amber warning, not the green success').toHaveCSS('background-color', 'rgb(245, 158, 11)')
    // and the weeks really are copies - the % was not stepped either
    const weeks = await readWeeks(page, s.phaseId)
    expect([weeks[2][1].Bench[0].intensityMin, weeks[3][1].Bench[0].intensityMin]).toEqual(['80', '80'])
  })

  test('a % phase is exactly what it was: the % steps, an RPE target is copied as typed, the toast is the green one', async ({ page }) => {
    const s = await seed(page, {
      weeks: 3, type: 'linear', config: { startPct: 70, endPct: 90 },
      slots: [{ day: 1, label: 'Monday', exercises: [{ name: 'Squat', sets: [rpeSet(8, { intensityMin: '70', intensityMax: '70' })] }] }]
    })
    await generate(page, s, 2)
    // the toast first: the success one lasts four seconds
    await expect(page.locator('#app-toast')).toContainText('Generated weeks 2–3')
    await expect(page.locator('#app-toast'), 'the success toast keeps its colour').toHaveCSS('background-color', 'rgb(16, 185, 129)')
    const weeks = await readWeeks(page, s.phaseId)
    const [w2, w3] = [weeks[2][1].Squat[0], weeks[3][1].Squat[0]]
    expect([Number(w2.intensityMin), Number(w3.intensityMin)], 'POSITIVE CONTROL: the % wave ran').toEqual([80, 90])
    expect([Number(w2.effortMin), Number(w3.effortMin)], 'the RPE target is copied as typed').toEqual([8, 8])
  })
})

test.describe('Periodization by RPE - the dialog', () => {
  test.beforeEach(async ({ page }) => { await loginAsPT(page); await sweep(page) })
  test.afterEach(async ({ page }) => { await sweep(page) })

  // Week 1 holds three sets with an RPE: a top set at RPE 7 and two sets written as RIR 3 (= RPE 7), plus a back-off at a % of the top set.
  const weekOne = [{ day: 1, label: 'Monday', exercises: [
    { name: 'Bench', sets: [rpeSet(7, { isTopSet: true, repsMin: '3', intensityBasis: 'stored' }), { repsMin: '8', intensityMin: '70', intensityMax: '70', intensityBasis: 'topSet' }] },
    { name: 'Squat', sets: [rirSet(3), rirSet(3)] }
  ] }]

  const openDialog = async (page, s) => {
    await page.evaluate(id => openProgram(id), s.programId)
    await page.waitForSelector(`#phase-workouts-${s.phaseId} .pwk-slot-name`, { timeout: 10000 })
    await page.click('button:has-text("Add periodization")')
    await expect(page.locator('#periodization-modal')).toBeVisible({ timeout: 4000 })
  }
  const savedPhase = (page, id) => page.evaluate(async (id) => (await db.from('program_phases').select('periodization_type, periodization_config').eq('id', id).single()).data, id)

  test('the Method switch, RPE fields, live preview and heads-up; typed numbers survive a flip; the choice is saved and reopens', async ({ page }) => {
    const s = await seed(page, { weeks: 4, slots: weekOne })
    await openDialog(page, s)

    await expect(page.locator('#pz-basis-pct'), 'a new periodization starts on %').toHaveAttribute('aria-pressed', 'true')
    await page.click('#pz-basis-rpe')
    await expect(page.locator('#pz-basis-rpe')).toHaveAttribute('aria-pressed', 'true')
    await page.click('#periodization-modal button:has-text("Linear")')

    await expect(page.locator('#pz-start-rpe')).toHaveValue('7')
    await expect(page.locator('#pz-end-rpe')).toHaveValue('9')
    await expect(page.locator('#pz-start'), 'the % fields are not on screen under RPE').toHaveCount(0)

    // the preview: Week 1 is what the coach typed (RPE 7 - the RIR 3 sets are the same effort), the rest is the wave
    const cells = page.locator('#pz-preview .pz-prev b')
    await expect(cells).toHaveText(['7', '7.5', '8.5', '9'])
    // the heads-up counts exactly the sets generation will rewrite
    const note = page.locator('#pz-check .pz-note')
    await expect(note).toContainText('Week 1 has 3 sets with an RPE')
    await expect(note).toContainText('2 are written in RIR')
    await expect(note, 'all three sit at RPE 7 - nothing to warn about').not.toHaveClass(/warn/)

    // live: a keystroke redraws the preview
    await page.fill('#pz-end-rpe', '10')
    await expect(cells).toHaveText(['7', '8', '9', '10'])

    // flipping the method keeps what was typed
    await page.click('#pz-basis-pct')
    await expect(page.locator('#pz-start')).toHaveValue('65')
    await expect(page.locator('#pz-start-rpe')).toHaveCount(0)
    await page.click('#pz-basis-rpe')
    await expect(page.locator('#pz-end-rpe'), 'the RPE numbers typed before the flip are still there').toHaveValue('10')

    // a deload week
    await page.check('#pz-deload-on')
    await expect(page.locator('#pz-deload-rpe')).toBeVisible()
    await page.fill('#pz-deload-week', '4')
    await page.fill('#pz-deload-rpe', '6')
    await expect(cells).toHaveText(['7', '8', '9', '6'])

    await page.click('#periodization-modal .modal-footer button:has-text("Save")')
    await page.waitForSelector('#periodization-modal', { state: 'detached', timeout: 6000 })
    const row = await savedPhase(page, s.phaseId)
    expect(row.periodization_type).toBe('linear')
    expect(row.periodization_config, 'only the active method is saved, as numbers, tagged rpe').toEqual({ basis: 'rpe', startRpe: 7, endRpe: 10, deloadWeek: 4, deloadRpe: 6 })

    // the phase header chip names the method, and Edit reopens on it
    await expect(page.getByText('Linear RPE 7→10')).toBeVisible({ timeout: 6000 })
    await page.click('button:has-text("Edit periodization")')
    await expect(page.locator('#pz-basis-rpe')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('#pz-end-rpe')).toHaveValue('10')
    await expect(page.locator('#pz-deload-rpe')).toHaveValue('6')
  })

  test('flipping the Method or the Type captures what is on screen even when no input event fired (autofill, a script)', async ({ page }) => {
    const s = await seed(page, { weeks: 4, slots: weekOne })
    await openDialog(page, s)
    await page.click('#pz-basis-rpe')
    await page.click('#periodization-modal button:has-text("Linear")')
    await page.evaluate(() => { document.getElementById('pz-end-rpe').value = '9.5' })   // set without an input event
    await page.click('#pz-basis-pct')
    await page.click('#pz-basis-rpe')
    await expect(page.locator('#pz-end-rpe'), 'the Method switch keeps it').toHaveValue('9.5')
    await page.evaluate(() => { document.getElementById('pz-start-rpe').value = '6.5' })
    await page.click('#periodization-modal button:has-text("Undulating")')
    await page.click('#periodization-modal button:has-text("Linear")')
    await expect(page.locator('#pz-start-rpe'), 'and so does the Type switch').toHaveValue('6.5')
  })

  test('numbers typed on the % side survive flipping the Method and the Type too', async ({ page }) => {
    const s = await seed(page, { weeks: 4, slots: weekOne })
    await openDialog(page, s)
    await page.click('#periodization-modal button:has-text("Linear")')
    await page.fill('#pz-start', '61'); await page.fill('#pz-end', '79')
    await page.check('#pz-deload-on'); await page.fill('#pz-deload-week', '3'); await page.fill('#pz-deload-pct', '48')
    await page.click('#pz-basis-rpe')
    await expect(page.locator('#pz-basis-rpe'), 'the tapped switch keeps keyboard focus through the repaint').toBeFocused()
    await page.click('#pz-basis-pct')
    await expect(page.locator('#pz-start')).toHaveValue('61')
    await expect(page.locator('#pz-end')).toHaveValue('79')
    await expect(page.locator('#pz-deload-on')).toBeChecked()
    await expect(page.locator('#pz-deload-week')).toHaveValue('3')
    await expect(page.locator('#pz-deload-pct')).toHaveValue('48')
    await page.click('#periodization-modal button:has-text("Undulating")')
    await page.fill('#pz-tier-heavy-pct', '90'); await page.fill('#pz-tier-heavy-reps', '2-4')
    await page.click('#pz-basis-rpe'); await page.click('#pz-basis-pct')
    await expect(page.locator('#pz-tier-heavy-pct')).toHaveValue('90')
    await expect(page.locator('#pz-tier-heavy-reps')).toHaveValue('2-4')
    await page.click('#periodization-modal button:has-text("Linear")')
    await expect(page.locator('#pz-start'), 'and back on Linear the first numbers are still there').toHaveValue('61')
  })

  test('an RPE that is not a half point between 1 and 10 is refused with the reason, and nothing is saved', async ({ page }) => {
    const s = await seed(page, { weeks: 4, slots: weekOne })
    await openDialog(page, s)
    await page.click('#pz-basis-rpe')
    await page.click('#periodization-modal button:has-text("Linear")')
    for (const bad of ['7.3', '11', '0', '']) {
      await page.fill('#pz-start-rpe', bad)
      await page.click('#periodization-modal .modal-footer button:has-text("Save")')
      await expect(page.locator('#pz-error'), `"${bad}" is refused`).toContainText('half points')
      await expect(page.locator('#periodization-modal')).toBeVisible()
    }
    expect((await savedPhase(page, s.phaseId)).periodization_type, 'nothing was written').toBeNull()
  })

  test('Undulating RPE saves a tier RPE for each tier, and the tier choices survive a flip of the method', async ({ page }) => {
    const s = await seed(page, { weeks: 3, slots: weekOne })
    await openDialog(page, s)
    await page.click('#pz-basis-rpe')
    await page.click('#periodization-modal button:has-text("Undulating")')
    await expect(page.locator('#pz-tier-heavy-rpe')).toHaveValue('9')
    await expect(page.locator('#pz-tier-moderate-rpe')).toHaveValue('8')
    await expect(page.locator('#pz-tier-light-rpe')).toHaveValue('7')
    await expect(page.locator('#pz-tier-heavy-reps'), 'no Reps box on the RPE side: the % side\'s are saved but never applied').toHaveCount(0)
    await page.fill('#pz-tier-heavy-rpe', '9.5')

    // the Week-1 session gets a tier, and it survives a flip to % and back (the sessions are re-read from the database on each render)
    const tierSelect = page.locator('#pz-day-tiers select').first()
    await expect(tierSelect).toBeVisible({ timeout: 6000 })
    await tierSelect.selectOption('heavy')
    await page.click('#pz-basis-pct')
    await page.click('#pz-basis-rpe')
    await expect(page.locator('#pz-day-tiers select').first()).toHaveValue('heavy')
    await expect(page.locator('#pz-tier-heavy-rpe'), 'and so does the number typed').toHaveValue('9.5')

    await page.click('#periodization-modal .modal-footer button:has-text("Save")')
    await page.waitForSelector('#periodization-modal', { state: 'detached', timeout: 6000 })
    const row = await savedPhase(page, s.phaseId)
    expect(row.periodization_type).toBe('undulating')
    expect(row.periodization_config).toEqual({ basis: 'rpe', tiers: { heavy: { rpe: 9.5 }, moderate: { rpe: 8 }, light: { rpe: 7 } } })
    const tier = await page.evaluate(async (id) => (await db.from('program_phase_workouts').select('tier').eq('phase_id', id).eq('week_number', 1).single()).data.tier, s.phaseId)
    expect(tier, 'the session\'s tier was saved with the phase').toBe('heavy')
    await expect(page.getByText('Undulating RPE (9.5/8/7)')).toBeVisible({ timeout: 6000 })
  })

  test('saving on the % side writes the shape it always did: no basis key, so existing phases never change meaning', async ({ page }) => {
    const s = await seed(page, { weeks: 4, slots: weekOne })
    await openDialog(page, s)
    await page.click('#periodization-modal button:has-text("Linear")')
    await page.fill('#pz-start', '60')
    await page.fill('#pz-end', '80')
    // nothing in this Week 1 carries a stored-1RM %, so Week 1 reads "as typed"; the rest is 60 -> 80 over four weeks
    await expect(page.locator('#pz-preview .pz-prev b')).toHaveText(['as typed', '67%', '73%', '80%'])
    await page.click('#periodization-modal .modal-footer button:has-text("Save")')
    await page.waitForSelector('#periodization-modal', { state: 'detached', timeout: 6000 })
    const row = await savedPhase(page, s.phaseId)
    expect(row.periodization_config).toEqual({ startPct: 60, endPct: 80 })
    await expect(page.getByText(/Linear 60.80%/)).toBeVisible({ timeout: 6000 })
  })

  test('the heads-up warns when Week 1 has nothing to step, and when it mixes values', async ({ page }) => {
    // nothing to step: sessions, but no set carries an RPE
    const none = await seed(page, { weeks: 3, slots: [{ day: 1, label: 'Monday', exercises: [{ name: 'Bench', sets: [{ repsMin: '5', intensityMin: '80', intensityMax: '80' }] }] }] })
    await openDialog(page, none)
    await page.click('#pz-basis-rpe')
    await page.click('#periodization-modal button:has-text("Linear")')
    await expect(page.locator('#pz-check .pz-note.warn')).toContainText('No set in Week 1 has an RPE yet')
    // the same Week 1 is fine on the % side
    await page.click('#pz-basis-pct')
    await expect(page.locator('#pz-check .pz-note')).toContainText('Week 1 has 1 set with a %')
    await expect(page.locator('#pz-check .pz-note')).not.toHaveClass(/warn/)
    await page.click('#periodization-modal .modal-footer button:has-text("Cancel")')
    await page.waitForSelector('#periodization-modal', { state: 'detached', timeout: 4000 })
    await sweep(page)

    // mixed: two values in Week 1 - every generated week gives them all one value
    const mixed = await seed(page, { weeks: 3, slots: [{ day: 1, label: 'Monday', exercises: [{ name: 'Bench', sets: [rpeSet(7), rpeSet(8)] }] }] })
    await openDialog(page, mixed)
    await page.click('#pz-basis-rpe')
    await page.click('#periodization-modal button:has-text("Linear")')
    await expect(page.locator('#pz-check .pz-note.warn')).toContainText('different RPEs now (7, 8)')
    await expect(page.locator('#pz-preview .pz-prev b').first(), 'Week 1 is shown as typed when it holds more than one value').toHaveText('as typed')
  })

  test('RPE inputs render stored config values as data, not markup', async ({ page }) => {
    const open = (type, config) => page.evaluate(({ type, config }) => {
      delete window.__xss
      window._openProgramPhases = [{ id: crypto.randomUUID(), name: 'Phase', duration_weeks: 6, periodization_type: type, periodization_config: config }]
      showPeriodizationModal(window._openProgramPhases[0].id, crypto.randomUUID())
      const body = document.getElementById('pz-body')
      for (const input of body.querySelectorAll('input')) {
        input.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); input.dispatchEvent(new MouseEvent('mouseenter')); input.focus()
      }
      const attrs = id => { const e = document.getElementById(id); return e ? e.getAttributeNames().sort() : null }
      return {
        injected: body.querySelectorAll('img, script, svg').length, xss: window.__xss ?? null,
        ids: Object.fromEntries(['pz-start-rpe', 'pz-end-rpe', 'pz-deload-week', 'pz-deload-rpe', 'pz-tier-heavy-rpe', 'pz-tier-light-rpe'].map(id => [id, attrs(id)])),
        previewText: document.getElementById('pz-preview')?.textContent ?? null,
        pressed: document.getElementById('pz-basis-rpe')?.getAttribute('aria-pressed') ?? null
      }
    }, { type, config })

    const lin = await open('linear', {
      basis: 'rpe', startRpe: '7" onmouseover="window.__xss=1', endRpe: '9"><img src=x onerror=window.__xss=2><input value="',
      deloadWeek: '3" autofocus onfocus="window.__xss=3', deloadRpe: '6" onmouseover="window.__xss=4'
    })
    const numberAttrs = ['class', 'id', 'max', 'min', 'step', 'type', 'value']
    expect.soft(lin.ids['pz-start-rpe'], 'start RPE').toEqual(numberAttrs)
    expect.soft(lin.ids['pz-end-rpe'], 'end RPE').toEqual(numberAttrs)
    expect.soft(lin.ids['pz-deload-week'], 'deload week').toEqual(['class', 'id', 'max', 'min', 'type', 'value'])
    expect.soft(lin.ids['pz-deload-rpe'], 'deload RPE').toEqual(numberAttrs)
    expect.soft(lin.injected, 'no element may be injected').toBe(0)
    expect(lin.xss, 'nothing may have executed').toBeNull()
    expect(lin.pressed, 'a stored basis of rpe opens on the RPE side').toBe('true')

    const und = await open('undulating', { basis: 'rpe', tiers: { heavy: { rpe: '9" onmouseover="window.__xss=5' }, moderate: { rpe: 8 }, light: { rpe: '7"><img src=x onerror=window.__xss=6>' } } })
    const tierAttrs = ['aria-label', 'class', 'id', 'max', 'min', 'placeholder', 'step', 'type', 'value']
    expect.soft(und.ids['pz-tier-heavy-rpe']).toEqual(tierAttrs)
    expect.soft(und.ids['pz-tier-light-rpe']).toEqual(tierAttrs)
    expect.soft(und.injected).toBe(0)
    expect(und.xss).toBeNull()

    // and the legitimate user is not refused: benign stored values render as stored, with the preview computed from them
    const ok = await open('linear', { basis: 'rpe', startRpe: 6.5, endRpe: 9.5 })
    expect(ok.previewText).toContain('9.5')
  })
})
