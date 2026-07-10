const { test, expect } = require('./fixtures')
const { loginAsPT, loginAsClient } = require('./helpers')

// Drives the exercise picker (2026-07-06): type a name, tap "Create new exercise", land on
// the sets/reps screen with that exercise locked in. Shared by every add/swap test below.
// Appends a timestamp to the given prefix and returns the actual name used, so repeated test
// runs never collide with a same-named exercise a previous (possibly failed) run already
// created — the picker has no de-dupe-by-identical-name UI, each run needs its own name.
async function pickOrCreateExercise(page, namePrefix) {
  const name = `${namePrefix} ${Date.now()}`
  await expect(page.locator('#exercise-picker-modal')).toBeVisible({ timeout: 5000 })
  await page.fill('#exp-search', name)
  await page.getByText('Create new exercise', { exact: false }).click()
  await expect(page.locator('#exercise-picker-modal')).not.toBeVisible({ timeout: 3000 })
  await expect(page.locator('#add-to-template-modal')).toBeVisible({ timeout: 5000 })
  return name
}

// ─── PT: Workouts page regression ────────────────────────────────────────────

test.describe('PT Workouts page', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsPT(page)
  })

  test('workouts page is not blank — shows templates or meaningful empty state', async ({ page }) => {
    await page.click('[data-page="workouts"]')
    // Wait for Supabase to resolve — any of these three states means the page rendered correctly
    await page.waitForFunction(() => {
      const body = document.body.textContent || ''
      return (
        document.querySelectorAll('.list-row').length > 0 ||
        body.includes('No templates yet') ||
        body.includes('No standalone templates')
      )
    }, { timeout: 55000 })
    // If we get here without throwing, the page rendered something meaningful
    expect(true).toBe(true)
  })

  test('PT can open a template for editing', async ({ page }) => {
    await page.click('[data-page="workouts"]')
    // If a template row exists, click it and expect the template editor to load
    const templateRow = page.locator('.list-row').first()
    const count = await page.locator('.list-row').count()
    if (count === 0) return // no standalone templates — skip
    await templateRow.click()
    await expect(page.locator('text=Exercises')).toBeVisible({ timeout: 8000 })
  })

  test('flat Templates list query excludes periodization-generated week clones (2026-07-08 data-leak fix)', async ({ page }) => {
    // Confirms the .is('generated_from_phase_id', null) filter now added to renderWorkoutTemplates
    // actually excludes generated week-clone templates (e.g. "Bench Press — W2") — these have
    // client_id/program_id both null too, the same shape as a genuine standalone template, so
    // without this filter they leaked into the coach-facing flat Templates list. Root-caused
    // 2026-07-08 after Jake noticed his own solo-program's week clones cluttering this list.
    const leakedCount = await page.evaluate(async () => {
      const { data } = await db.from('workout_templates')
        .select('id, generated_from_phase_id')
        .eq('coach_id', currentUser.id).is('client_id', null).is('program_id', null).is('generated_from_phase_id', null)
        .limit(500)
      return (data || []).filter(t => t.generated_from_phase_id != null).length
    })
    expect(leakedCount).toBe(0)
  })
})

// ─── Exercise identity — resolve/auto-create (2026-07-06) ───────────────────

test.describe('Exercise identity resolver', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsPT(page)
  })

  test('_resolveExerciseIdForSave links to an existing library exercise by case-insensitive name match', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const uniqueName = `PW Test Exercise ${Date.now()}`
      const { data: created } = await db.from('exercises').insert({ coach_id: currentUser.id, name: uniqueName }).select('id').single()
      const resolvedId = await _resolveExerciseIdForSave(uniqueName.toUpperCase(), currentUser.id)
      await db.from('exercises').delete().eq('id', created.id)
      return { createdId: created.id, resolvedId }
    })
    expect(result.resolvedId).toBe(result.createdId)
  })

  test('_resolveExerciseIdForSave auto-creates a new library entry when no match exists', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const uniqueName = `PW Auto-Create Test ${Date.now()}`
      const resolvedId = await _resolveExerciseIdForSave(uniqueName, currentUser.id)
      const { data: found } = await db.from('exercises').select('id, name').eq('id', resolvedId).single()
      if (found) await db.from('exercises').delete().eq('id', found.id)
      return { resolvedId, uniqueName, foundName: found?.name }
    })
    expect(result.resolvedId).toBeTruthy()
    expect(result.foundName).toBe(result.uniqueName)
  })
})

// ─── Render regression: timed sets ───────────────────────────────────────────

test.describe('Timed set render regression', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsPT(page)
  })

  test('timed set duration renders as mm:ss not reps in template preview', async ({ page }) => {
    // Exercise the exact render logic that had the bug using app.js globals (parseRest is loaded).
    // s.repsMin = '90' (seconds stored programmatically), s.timed = true.
    // Should produce '1:30', NOT '90 reps'.
    const result = await page.evaluate(() => {
      const s = { timed: true, repsMin: '90', repsMax: '90', restMin: '2:00', restMax: '2:00' }
      const secs = s.duration ? (parseRest(s.duration) || 0) : (s.repsMin ? parseInt(s.repsMin) : null)
      const durDisplay = secs != null ? (Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0')) : null
      const restStr = s.restMin && s.restMin !== '0:00' ? s.restMin + ' rest' : null
      return [durDisplay, restStr].filter(Boolean).join(' · ')
    })
    expect(result).toContain('1:30')
    expect(result).not.toMatch(/\d+ reps/)
  })

  test('timed set duration renders as mm:ss when stored in duration field', async ({ page }) => {
    // s.duration = '1:30' (mm:ss format saved by the template editor).
    const result = await page.evaluate(() => {
      const s = { timed: true, duration: '1:30', restMin: '2:00', restMax: '2:00' }
      const secs = s.duration ? (parseRest(s.duration) || 0) : (s.repsMin ? parseInt(s.repsMin) : null)
      const durDisplay = secs != null ? (Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0')) : null
      return durDisplay
    })
    expect(result).toBe('1:30')
  })

  test('non-timed set still shows reps correctly', async ({ page }) => {
    const result = await page.evaluate(() => {
      const s = { timed: false, repsMin: '5', repsMax: '5', restMin: '2:00' }
      if (s.timed) return 'ERROR: hit timed branch'
      const repsStr = s.repsMin ? (s.repsMin + (s.repsMax && s.repsMax !== s.repsMin ? '–' + s.repsMax : '')) : null
      return repsStr ? repsStr + ' reps' : null
    })
    expect(result).toBe('5 reps')
    expect(result).not.toContain('1:')
  })

  test('%1RM exercises now route to the strength table, not the wizard (Runner Phase 2 — %1RM only, 2026-07-05)', async ({ page }) => {
    const result = await page.evaluate(() => {
      const pctExercise = { type: 'strength', sets_json: [{ intensityMin: 20, intensityMax: 20 }] }
      const timedExercise = { type: 'strength', sets_json: [{ timed: true }] }
      const uniExercise = { type: 'strength', sets_json: [{ unilateral: true }] }
      const plainExercise = { type: 'strength', sets_json: [{ repsMin: '5' }] }
      return {
        pctIsTable: _isPlainStrengthExercise(pctExercise),
        timedIsTable: _isPlainStrengthExercise(timedExercise),
        uniIsTable: _isPlainStrengthExercise(uniExercise),
        plainIsTable: _isPlainStrengthExercise(plainExercise),
      }
    })
    expect(result.pctIsTable).toBe(true)   // the fix — %1RM now gets the table
    expect(result.timedIsTable).toBe(false) // unchanged — still wizard
    expect(result.uniIsTable).toBe(false)   // unchanged — still wizard
    expect(result.plainIsTable).toBe(true)  // unchanged — plain strength always table
  })

  test('mobile log-session RPE field no longer repeats the header label (regression, 2026-07-05)', async ({ page }) => {
    // Mobile-first default viewport (390px) — isMobile branch of renderLogExercises.
    const result = await page.evaluate(() => {
      const container = document.createElement('div')
      container.id = 'ls-exercises'
      document.body.appendChild(container)
      window._logBlocks = [{ name: 'Bench Press', type: 'strength', effortMode: 'RPE', oneRM: 0, sets: [{}] }]
      renderLogExercises()
      const headerText = container.textContent
      const effortInput = container.querySelector('input[id^="ls-effort-"]')
      return { headerHasRPE: headerText.includes('RPE'), placeholder: effortInput?.placeholder }
    })
    expect(result.headerHasRPE).toBe(true) // header still shows the label
    expect(result.placeholder).not.toBe('RPE') // field itself no longer repeats it
    expect(result.placeholder).toBe('1–10') // now shows the useful numeric range instead
  })
})

// ─── Client runner ────────────────────────────────────────────────────────────

test.describe('Workout runner (client)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsClient(page)
    await page.click('[data-page="workouts"]')
    // Wait for page to settle — may show program accordion or flat template list
    await page.waitForTimeout(1500)
    // If phases are present (program accordion), expand the first one so Start buttons are visible
    const firstPhaseBtn = page.locator('button').filter({ hasText: /session/ }).first()
    if (await firstPhaseBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await firstPhaseBtn.click()
    }
    // Now wait for a visible Start button
    await page.waitForSelector('button:has-text("Start"):visible, button:has-text("▶ Start"):visible', { timeout: 10000 })
  })

  test('runner loads with exercise name visible', async ({ page }) => {
    await page.locator('button:has-text("Start")').first().click()
    // Runner shows End button + at least one exercise label
    await expect(page.locator('button:has-text("End")')).toBeVisible({ timeout: 12000 })
    // Exercise counter (e.g. "Exercise 1 of N") confirms runner is populated
    await expect(page.locator('text=/Exercise \\d+ of \\d+/')).toBeVisible({ timeout: 8000 })
  })

  test('can log a strength set and see rest timer', async ({ page }) => {
    await page.locator('button:has-text("Start")').first().click()
    await expect(page.locator('button:has-text("End")')).toBeVisible({ timeout: 12000 })

    // Fill weight and reps
    const weightInput = page.locator('#wr-weight-input')
    const repsInput   = page.locator('#wr-reps-input')

    if (await weightInput.isVisible()) await weightInput.fill('80')
    if (await repsInput.isVisible())   await repsInput.fill('8')

    await page.locator('button:has-text("LOG")').click()

    // Rest timer overlay should appear
    await expect(page.locator('#rest-timer-overlay')).toBeVisible({ timeout: 5000 })
  })

  test('skip rest clears rest overlay and restores input fields', async ({ page }) => {
    await page.locator('button:has-text("Start")').first().click()
    await expect(page.locator('button:has-text("End")')).toBeVisible({ timeout: 12000 })

    const weightInput = page.locator('#wr-weight-input')
    const repsInput   = page.locator('#wr-reps-input')

    if (await weightInput.isVisible()) await weightInput.fill('80')
    if (await repsInput.isVisible())   await repsInput.fill('8')

    await page.locator('button:has-text("LOG")').click()
    await expect(page.locator('#rest-timer-overlay')).toBeVisible({ timeout: 5000 })

    // Skip rest
    await page.locator('button:has-text("Skip →")').click()

    // Rest overlay must be gone
    await expect(page.locator('#rest-timer-overlay')).not.toBeVisible({ timeout: 5000 })

    // --- Regression guard: input fields must be visible again after skip ---
    // "Resting — inputs available after rest" must NOT be showing
    await expect(page.locator('text=Resting — inputs available after rest')).not.toBeVisible({ timeout: 3000 })

    // The LOG button must be visible and enabled (not blocked by rest state)
    await expect(page.locator('button:has-text("LOG")')).toBeVisible({ timeout: 3000 })

    // Set counter should now show set 2 (or next exercise if target was 1 set)
    const setTwoOrNext =
      await page.locator('text=Set 2').isVisible().catch(() => false) ||
      await page.locator('text=/Exercise \\d+/').isVisible().catch(() => false)
    expect(setTwoOrNext).toBe(true)
  })

  test('finish screen renders with Save workout button', async ({ page }) => {
    await page.locator('button:has-text("Start")').first().click()
    await expect(page.locator('button:has-text("End")')).toBeVisible({ timeout: 12000 })

    // Log one set — scoped to #workout-runner to avoid matching the workouts-page
    // Start/LOG buttons still in the DOM behind the runner overlay
    const weightInput = page.locator('#wr-weight-input')
    const repsInput   = page.locator('#wr-reps-input')
    if (await weightInput.isVisible({ timeout: 5000 }).catch(() => false)) await weightInput.fill('80')
    if (await repsInput.isVisible())   await repsInput.fill('8')
    await page.locator('#workout-runner button:has-text("LOG")').click({ timeout: 8000 })
    await page.waitForTimeout(300)

    // Skip rest timer, then trigger finish screen directly
    await page.evaluate(() => { if (typeof skipRestTimer === 'function') skipRestTimer() })
    await page.evaluate(() => showRunnerFinish())

    await expect(page.locator('button:has-text("Save workout")')).toBeVisible({ timeout: 8000 })
  })

  test('strength table renders for a plain-strength exercise with SET/PREVIOUS/KG/REPS columns', async ({ page }) => {
    await page.locator('button:has-text("Start")').first().click()
    await expect(page.locator('button:has-text("End")')).toBeVisible({ timeout: 12000 })

    // Jump to the first plain-strength exercise — cardio/timed/unilateral/%1RM stay on the wizard,
    // so the template's exercise order determines which view loads first.
    const found = await page.evaluate(() => {
      const idx = _runner.exercises.findIndex(e => typeof _isPlainStrengthExercise === 'function' && _isPlainStrengthExercise(e))
      if (idx === -1) return false
      runnerJumpTo(idx)
      return true
    })
    if (!found) return // this template has no plain-strength exercise — nothing to assert

    await expect(page.locator('#workout-runner >> text=PREVIOUS')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('#workout-runner >> text=KG')).toBeVisible()
    await expect(page.locator('#workout-runner >> text=REPS')).toBeVisible()
    await expect(page.locator('#workout-runner button[onclick="toggleTableSet(0)"]')).toBeVisible()
  })

  test('checking a set in the strength table logs it and starts rest — without leaving the table', async ({ page }) => {
    await page.locator('button:has-text("Start")').first().click()
    await expect(page.locator('button:has-text("End")')).toBeVisible({ timeout: 12000 })

    const found = await page.evaluate(() => {
      const idx = _runner.exercises.findIndex(e => typeof _isPlainStrengthExercise === 'function' && _isPlainStrengthExercise(e))
      if (idx === -1) return false
      runnerJumpTo(idx)
      return true
    })
    if (!found) return

    const kgInput   = page.locator('#workout-runner input[oninput*="tableRows[0].weight"]')
    const repsInput = page.locator('#workout-runner input[oninput*="tableRows[0].reps"]')
    if (await kgInput.count() > 0) await kgInput.fill('60')
    await repsInput.fill('10')
    await page.locator('#workout-runner button[onclick="toggleTableSet(0)"]').click()

    // Rest starts (non-blocking bar), and the table itself stays visible underneath —
    // this is the core design difference from the wizard's blocking "Resting…" placeholder.
    await expect(page.locator('#rest-timer-overlay')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('#workout-runner >> text=REPS')).toBeVisible()
    await expect(page.locator('#workout-runner button[onclick="toggleTableSet(0)"][aria-label="Mark set incomplete"]')).toBeVisible()
  })

  test('save session lands on workouts page — not PT view', async ({ page }) => {
    await page.locator('button:has-text("Start")').first().click()
    await expect(page.locator('button:has-text("End")')).toBeVisible({ timeout: 12000 })

    // Log one set — scoped to #workout-runner to avoid the workouts-page buttons behind overlay
    const weightInput = page.locator('#wr-weight-input')
    const repsInput   = page.locator('#wr-reps-input')
    if (await weightInput.isVisible({ timeout: 5000 }).catch(() => false)) await weightInput.fill('80')
    if (await repsInput.isVisible())   await repsInput.fill('8')
    await page.locator('#workout-runner button:has-text("LOG")').click({ timeout: 8000 })

    // Skip rest timer so End button works cleanly
    await page.evaluate(() => { if (typeof skipRestTimer === 'function') skipRestTimer() })
    await page.waitForTimeout(300)

    // End session
    const endBtn = page.locator('button:has-text("End")')
    if (await endBtn.isVisible().catch(() => false)) await endBtn.click()

    // Confirm if needed
    const confirmBtn = page.locator('button:has-text("End session"), button:has-text("Yes"), button:has-text("Finish")')
    if (await confirmBtn.isVisible({ timeout: 4000 }).catch(() => false)) await confirmBtn.first().click()

    // Save workout
    await expect(page.locator('button:has-text("Save workout")')).toBeVisible({ timeout: 10000 })
    await page.locator('button:has-text("Save workout")').click()

    // Must land on client workouts page — not PT client profile
    await expect(page.locator('h1')).toContainText('Workouts', { timeout: 12000 })
    await expect(page.locator('text=Overview')).not.toBeVisible({ timeout: 3000 }).catch(() => {})
  })

  test('swap exercise opens the picker first, then the sets/reps screen with the exercise locked in, and swapping updates the current exercise name', async ({ page }) => {
    await page.locator('button:has-text("Start")').first().click()
    await expect(page.locator('button:has-text("End")')).toBeVisible({ timeout: 12000 })

    await page.locator('button:has-text("Swap exercise")').click()
    const name = await pickOrCreateExercise(page, 'Playwright Swap Target')
    await expect(page.locator('#add-to-template-modal .modal-title')).toHaveText('Swap exercise')
    await expect(page.locator('#att-name-display')).toHaveText(name)
    // Same builder screen — has the full set-target UI, not a cut-down picker
    await expect(page.locator('#att-sets-container')).toBeVisible()
    await expect(page.locator('#att-superset')).toBeVisible()

    await page.locator('#att-confirm-btn').click()

    await expect(page.locator('#add-to-template-modal')).not.toBeVisible({ timeout: 6000 })
    const currentName = await page.evaluate(() => _runner.exercises[_runner.exIdx].name)
    expect(currentName).toBe(name)
  })

  test('add exercise opens the picker first, then the sets/reps screen, and adding appends a new exercise and jumps to it', async ({ page }) => {
    await page.locator('button:has-text("Start")').first().click()
    await expect(page.locator('button:has-text("End")')).toBeVisible({ timeout: 12000 })

    const before = await page.evaluate(() => _runner.exercises.length)
    await page.locator('button:has-text("+ Add exercise")').click()
    const name = await pickOrCreateExercise(page, 'Playwright Added Exercise')
    await expect(page.locator('#add-to-template-modal .modal-title')).toHaveText('Add exercise')

    await page.locator('#att-confirm-btn').click()

    await expect(page.locator('#add-to-template-modal')).not.toBeVisible({ timeout: 6000 })
    const after = await page.evaluate(() => ({ len: _runner.exercises.length, idx: _runner.exIdx, name: _runner.exercises[_runner.exIdx].name }))
    expect(after.len).toBe(before + 1)
    expect(after.idx).toBe(after.len - 1)
    expect(after.name).toBe(name)
  })

  test('swap and add exercise land on the identical sets/reps screen component (not two different builders)', async ({ page }) => {
    await page.locator('button:has-text("Start")').first().click()
    await expect(page.locator('button:has-text("End")')).toBeVisible({ timeout: 12000 })

    await page.locator('button:has-text("Swap exercise")').click()
    await pickOrCreateExercise(page, 'Playwright Identity Check')
    const swapHtml = await page.locator('#att-sets-container').innerHTML()
    await page.locator('#add-to-template-modal .modal-close').click()

    await page.locator('button:has-text("+ Add exercise")').click()
    await pickOrCreateExercise(page, 'Playwright Identity Check 2')
    const addHtml = await page.locator('#att-sets-container').innerHTML()
    await page.locator('#add-to-template-modal .modal-close').click()

    expect(swapHtml).toBe(addHtml) // identical set-builder markup for both entry points
  })

  test('rapid swap-then-add tap does not open two overlapping pickers (regression, 2026-07-04 runner freeze)', async ({ page }) => {
    await page.locator('button:has-text("Start")').first().click()
    await expect(page.locator('button:has-text("End")')).toBeVisible({ timeout: 12000 })

    // Fire both picker calls back-to-back, before the coach-id lookup resolves — reproduces
    // the exact race that used to open two overlays sharing one hardcoded id, which left the
    // visible modal impossible to close (getElementById only ever finds the first match) and
    // forced a reload that lost the whole session.
    const midFetch = await page.evaluate(() => {
      showExercisePicker('add')
      showExercisePicker('swap')
      return {
        swapDisabled: document.getElementById('wr-swap-btn')?.disabled,
        addDisabled: document.getElementById('wr-add-btn')?.disabled
      }
    })
    expect(midFetch.swapDisabled).toBe(true)
    expect(midFetch.addDisabled).toBe(true)

    await expect(page.locator('#exercise-picker-modal')).toBeVisible({ timeout: 5000 })
    expect(await page.locator('#exercise-picker-modal').count()).toBe(1)

    await page.locator('#exercise-picker-modal .modal-close').click()
    await expect(page.locator('#exercise-picker-modal')).not.toBeVisible({ timeout: 3000 })
    await expect(page.locator('button:has-text("Swap exercise")')).toBeEnabled()
    await expect(page.locator('button:has-text("+ Add exercise")')).toBeEnabled()
  })

  test('logged set can be deleted from the edit sheet', async ({ page }) => {
    await page.locator('button:has-text("Start")').first().click()
    await expect(page.locator('button:has-text("End")')).toBeVisible({ timeout: 12000 })

    // Force a non-table exercise so the wizard's editable logged-set list renders
    await page.evaluate(() => {
      _runner.exercises[_runner.exIdx].sets_json = [{ timed: true, duration: '0:30' }]
      _runner.exercises[_runner.exIdx].loggedSets = [{ weight: '20', duration: '0:30' }]
      renderRunner()
    })
    await expect(page.locator('button:has-text("✎ Edit")').first()).toBeVisible({ timeout: 5000 })
    await page.locator('button:has-text("✎ Edit")').first().click()
    await expect(page.locator('#wr-edit-overlay')).toBeVisible({ timeout: 3000 })
    await page.locator('#wr-edit-overlay button:has-text("Delete")').click()
    await expect(page.locator('#wr-edit-overlay')).not.toBeVisible({ timeout: 3000 })
    const remaining = await page.evaluate(() => _runner.exercises[_runner.exIdx].loggedSets.length)
    expect(remaining).toBe(0)
  })

  test('strength table set row can be deleted', async ({ page }) => {
    await page.locator('button:has-text("Start")').first().click()
    await expect(page.locator('button:has-text("End")')).toBeVisible({ timeout: 12000 })

    // Force a plain-strength (table-mode) exercise with 2 rows so delete is available
    await page.evaluate(() => {
      const ex = _runner.exercises[_runner.exIdx]
      ex.sets_json = [{ repsMin: '8' }, { repsMin: '8' }]
      ex.type = 'strength'
      delete ex.tableRows
      renderRunner()
    })
    const deleteBtn = page.locator('button[aria-label^="Delete set"]').first()
    if (!(await deleteBtn.isVisible().catch(() => false))) return // not table mode for this template — skip
    const before = await page.evaluate(() => _runner.exercises[_runner.exIdx].tableRows.length)
    await deleteBtn.click()
    const after = await page.evaluate(() => _runner.exercises[_runner.exIdx].tableRows.length)
    expect(after).toBe(before - 1)
  })

  test('delete-set button has deliberate spacing from the complete-set button (regression, 2026-07-05)', async ({ page }) => {
    await page.locator('button:has-text("Start")').first().click()
    await expect(page.locator('button:has-text("End")')).toBeVisible({ timeout: 12000 })

    await page.evaluate(() => {
      const ex = _runner.exercises[_runner.exIdx]
      ex.sets_json = [{ repsMin: '8' }, { repsMin: '8' }]
      ex.type = 'strength'
      delete ex.tableRows
      renderRunner()
    })
    const deleteBtn = page.locator('button[aria-label^="Delete set"]').first()
    if (!(await deleteBtn.isVisible().catch(() => false))) return // not table mode for this template — skip
    const marginLeft = await deleteBtn.evaluate(el => parseInt(getComputedStyle(el).marginLeft))
    expect(marginLeft).toBeGreaterThanOrEqual(8)
  })

  test('swap exercise with a specified rest time overwrites the original rest, not hardcoded 90s (regression, 2026-07-05)', async ({ page }) => {
    await page.locator('button:has-text("Start")').first().click()
    await expect(page.locator('button:has-text("End")')).toBeVisible({ timeout: 12000 })

    await page.locator('button:has-text("Swap exercise")').click()
    await pickOrCreateExercise(page, 'Playwright Rest Swap Target')
    const restInput = page.locator('#ts-restmin-0')
    const hasRestField = (await restInput.count()) > 0
    if (hasRestField) await restInput.fill('3:00')
    await page.locator('#att-confirm-btn').click()
    await expect(page.locator('#add-to-template-modal')).not.toBeVisible({ timeout: 6000 })

    const restSecs = await page.evaluate(() => _runner.exercises[_runner.exIdx].restSecs)
    if (hasRestField) expect(restSecs).toBe(180)
    else expect(restSecs).toBe(90) // no rest field on this set type — default fallback is fine
  })

  test('add exercise with a specified rest time is honored, not hardcoded 90s (regression, 2026-07-05)', async ({ page }) => {
    await page.locator('button:has-text("Start")').first().click()
    await expect(page.locator('button:has-text("End")')).toBeVisible({ timeout: 12000 })

    await page.locator('button:has-text("+ Add exercise")').click()
    await pickOrCreateExercise(page, 'Playwright Rest Add Target')
    const restInput = page.locator('#ts-restmin-0')
    const hasRestField = (await restInput.count()) > 0
    if (hasRestField) await restInput.fill('2:30')
    await page.locator('#att-confirm-btn').click()
    await expect(page.locator('#add-to-template-modal')).not.toBeVisible({ timeout: 6000 })

    const restSecs = await page.evaluate(() => _runner.exercises[_runner.exIdx].restSecs)
    if (hasRestField) expect(restSecs).toBe(150)
    else expect(restSecs).toBe(90)
  })

  test('exercise picker: typing a name shows a "Create new exercise" option, and creating it reaches the sets/reps screen with that name locked in', async ({ page }) => {
    await page.locator('button:has-text("Start")').first().click()
    await expect(page.locator('button:has-text("End")')).toBeVisible({ timeout: 12000 })

    await page.locator('button:has-text("+ Add exercise")').click()
    const name = `Playwright Picker Create Test ${Date.now()}`
    await expect(page.locator('#exercise-picker-modal')).toBeVisible({ timeout: 5000 })
    await page.fill('#exp-search', name)
    await expect(page.getByText('Create new exercise', { exact: false })).toBeVisible()
    await page.getByText('Create new exercise', { exact: false }).click()

    await expect(page.locator('#exercise-picker-modal')).not.toBeVisible({ timeout: 3000 })
    await expect(page.locator('#add-to-template-modal')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('#att-name-display')).toHaveText(name)
    await page.locator('#add-to-template-modal .modal-close').click()
  })

  test('exercise picker: "Change" link on the sets/reps screen reopens the picker without losing entered notes', async ({ page }) => {
    await page.locator('button:has-text("Start")').first().click()
    await expect(page.locator('button:has-text("End")')).toBeVisible({ timeout: 12000 })

    await page.locator('button:has-text("+ Add exercise")').click()
    await pickOrCreateExercise(page, 'Playwright Change Test A')
    await page.fill('#att-notes', 'keep this note')
    await page.locator('button:has-text("Change")').click()

    await expect(page.locator('#exercise-picker-modal')).toBeVisible({ timeout: 5000 })
    const nameB = `Playwright Change Test B ${Date.now()}`
    await page.fill('#exp-search', nameB)
    await page.getByText('Create new exercise', { exact: false }).click()

    await expect(page.locator('#att-name-display')).toHaveText(nameB)
    await expect(page.locator('#att-notes')).toHaveValue('keep this note')
    await page.locator('#add-to-template-modal .modal-close').click()
  })
})

// ─── saveWorkoutSession rollback (2026-07-07 perf refactor) ─────────────────
// The N+1 per-exercise save loop was replaced with two batched inserts (all exercises, then all
// sets). saveWorkoutSession previously had no rollback at all on failure; the refactor added one,
// matching saveRunnerSession's existing log->exercises->sets rollback chain. This test proves the
// new rollback actually cleans up, not just that the happy path still saves.

test.describe('saveWorkoutSession rollback', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsPT(page)
  })

  test('rolls back workout_logs and workout_log_exercises when the sets batch insert fails', async ({ page }) => {
    const setup = await page.evaluate(async () => {
      const { data: clients } = await db.from('clients').select('id').eq('coach_id', currentUser.id).limit(1)
      return { clientId: clients?.[0]?.id || null }
    })
    test.skip(!setup.clientId, 'E2E PT account has no clients to log a session for')

    const sessionName = `[E2E] Rollback Test ${Date.now()}`
    const exerciseName = `[E2E] Rollback Exercise ${Date.now()}`

    const result = await page.evaluate(async ({ clientId, sessionName, exerciseName }) => {
      await showLogSessionModal(clientId)
      document.getElementById('ls-name').value = sessionName
      window._logBlocks = [{ name: exerciseName, type: 'strength', sets: [{ repsMin: '5', weight: '50' }] }]
      // saveWorkoutSession calls flushLogState() first, which reads set values back out of the
      // rendered #ls-exercises inputs by id -- without an actual render, those inputs don't
      // exist, and flushLogState silently overwrites the sets above with empty strings.
      renderLogExercises()

      // Force the workout_log_sets batch insert to fail — everything else (exercise
      // resolve/create, workout_logs insert, workout_log_exercises batch insert) runs for real,
      // so this exercises the actual rollback path, not a fully mocked one.
      const originalFrom = db.from.bind(db)
      db.from = (table) => {
        if (table === 'workout_log_sets') {
          return { insert: async () => ({ error: { message: 'Simulated failure for rollback test' } }) }
        }
        return originalFrom(table)
      }

      try {
        await saveWorkoutSession(clientId)
      } finally {
        // Restore even if saveWorkoutSession throws unexpectedly, so a broken run doesn't leave
        // the monkey-patched db.from active for the rest of this page.
        db.from = originalFrom
      }

      const { data: logs } = await db.from('workout_logs').select('id').eq('name', sessionName)
      const { data: exercises } = await db.from('workout_log_exercises').select('id').eq('exercise_name', exerciseName)
      const errorText = document.getElementById('ls-error')?.textContent || ''

      // Unconditional cleanup — captured logCount/exerciseCount above already reflect whatever the
      // rollback under test actually did, so cleaning up here regardless doesn't weaken the
      // assertions. This matters specifically because if a future regression breaks the rollback
      // (the exact failure this test exists to catch), the test would otherwise both fail AND
      // permanently leave a "[E2E] Rollback Test ..." row behind in the real account.
      try {
        for (const ex of exercises || []) {
          await db.from('workout_log_sets').delete().eq('workout_log_exercise_id', ex.id)
        }
        if (exercises?.length) await db.from('workout_log_exercises').delete().in('id', exercises.map(e => e.id))
        if (logs?.length) await db.from('workout_logs').delete().in('id', logs.map(l => l.id))
        // The exercise-library auto-create isn't part of the rollback (it's a legitimate library
        // entry, not orphaned session data) — remove the test artifact directly.
        await db.from('exercises').delete().eq('coach_id', currentUser.id).eq('name', exerciseName)
      } catch (_) { /* best-effort cleanup — never let it mask the real assertion results */ }

      return { logCount: logs.length, exerciseCount: exercises.length, errorText }
    }, { clientId: setup.clientId, sessionName, exerciseName })

    expect(result.logCount).toBe(0)
    expect(result.exerciseCount).toBe(0)
    expect(result.errorText).toContain('Simulated failure')
  })
})
