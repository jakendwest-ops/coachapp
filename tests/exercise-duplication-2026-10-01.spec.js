// Exercise duplication — Jake's report 2026-10-01 ("the account shouldnt have nearly 7000 exercises,
// this appears to be a duplication bug"). docs/bugs/2026-10-01-exercise-library-holds-thousands-of-rows-*.md
//
// The 6,275 rows on the E2E account turned out to be TEST debris (unique timestamped names from
// runner.spec.js, never cleaned, and invisible to a reaper that matches case-sensitively). But looking
// for the cause turned up real ways the APP creates duplicates, and these tests pin each one:
//
//   1. The picker offers "+ Create new exercise" for ANY typed text — even when an exact match sits in
//      the list right under it — and creating never checked for an existing one.
//   2. The picker and the Library read `exercises` with no paging, so the API's silent 200-row cap hides
//      everything past row 200 (list AND search) — and with (1), the picker then invites creating the
//      exercise it cannot show.
//   3. The Library's "Add exercise" never checked for an existing name.
//   4. _resolveExerciseIdForSave used .maybeSingle() and ignored its error: with two same-named rows it
//      errors, `existing` is null, and it inserted a THIRD — an existing duplicate begets more.
//
// Every fixture is named with a unique tag; cleanup deletes by that tag, so it also removes rows the
// CODE UNDER TEST created.
const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

let TAG = null

test.beforeEach(async ({ page }) => {
  TAG = '[E2E] Dup ' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)
  await loginAsPT(page)
})

let FIXTURE_CLIENT = null   // a client THIS test created (never a borrowed one) — removed with its logs

test.afterEach(async ({ page }) => {
  if (!TAG) return
  const tag = TAG; TAG = null
  const clientId = FIXTURE_CLIENT; FIXTURE_CLIENT = null
  await page.evaluate(async ({ tag, clientId }) => {
    if (clientId) {
      const { data: logs } = await db.from('workout_logs').select('id').eq('client_id', clientId)
      const logIds = (logs || []).map(l => l.id)
      if (logIds.length) {
        const { data: exs } = await db.from('workout_log_exercises').select('id').in('log_id', logIds)
        const exIds = (exs || []).map(e => e.id)
        if (exIds.length) await db.from('workout_log_sets').delete().in('workout_log_exercise_id', exIds).select('id')
        await db.from('workout_log_exercises').delete().in('log_id', logIds).select('id')
        await db.from('workout_logs').delete().in('id', logIds).select('id')
      }
      await db.from('clients').delete().eq('id', clientId).select('id')
    }
    await db.from('exercises').delete().eq('coach_id', currentUser.id).ilike('name', tag + '%').select('id')
  }, { tag, clientId }).catch(err => console.warn('[exercise-duplication] CLEANUP FAILED — rows may be left in the test account:', err.message))
})

// ── fixtures / probes ──────────────────────────────────────────────────────────────────────────
const insertExercise = (page, name) => page.evaluate(async (name) => {
  const { data, error } = await db.from('exercises').insert({ coach_id: currentUser.id, name, metric_type: 'weight_reps' }).select('id').single()
  if (error) throw new Error('fixture insert failed: ' + error.message)
  return data.id
}, name)

const countNamed = (page, name) => page.evaluate(async (name) => {
  const { count } = await db.from('exercises').select('id', { count: 'exact', head: true }).eq('coach_id', currentUser.id).ilike('name', name)
  return count
}, name)

// The real picker, with a recording onPick instead of the builder's.
const openPicker = page => page.evaluate(() => {
  window.__picked = null
  _openExercisePicker(currentUser.id, ex => { window.__picked = ex })
})

// ── 1. the picker must not offer to create what is already there ───────────────────────────────
test.describe('exercise picker', () => {
  test('an exact existing name (any case) does NOT offer "Create new exercise" — picking it returns the existing one', async ({ page }) => {
    const name = `${TAG} Bench`
    const id = await insertExercise(page, name)
    await openPicker(page)
    await page.locator('#exp-search').fill(name.toLowerCase())
    await expect(page.locator('#exp-results').getByText(name, { exact: true })).toBeVisible({ timeout: 30000 })
    await expect(page.getByText('Create new exercise'), 'the create row sat directly above the match, one mis-tap from a duplicate').toHaveCount(0)
    await page.locator('#exp-results').getByText(name, { exact: true }).click()
    expect(await page.evaluate(() => window.__picked?.id)).toBe(id)
  })

  test('a genuinely NEW name still offers Create — and creating it works', async ({ page }) => {
    const name = `${TAG} Fresh`
    await openPicker(page)
    await page.locator('#exp-search').fill(name)
    await expect(page.getByText('Create new exercise')).toBeVisible({ timeout: 30000 })
    await page.getByText('Create new exercise').click()
    await expect.poll(() => countNamed(page, name)).toBe(1)
    expect(await page.evaluate(() => window.__picked?.name)).toBe(name)
  })

  // The create path itself, not just the button: an existing name must be PICKED, never inserted again.
  test('creating a name that already exists picks the existing exercise and inserts nothing (any case, padded)', async ({ page }) => {
    const name = `${TAG} Squat`
    const id = await insertExercise(page, name)
    const picked = await page.evaluate(async (n) => {
      window.__picked = null
      _exercisePickerState = { coachId: currentUser.id, onPick: ex => { window.__picked = ex }, allExercises: [] }
      await _createExerciseFromPicker('  ' + n.toUpperCase() + '  ')
      return window.__picked
    }, name)
    expect(picked?.id, 'it must hand back the EXISTING exercise').toBe(id)
    expect(await countNamed(page, name), 'and must not have inserted a second row').toBe(1)
  })

  test('creating the same new name twice, one after the other, yields ONE row', async ({ page }) => {
    const name = `${TAG} Row`
    const ids = await page.evaluate(async (n) => {
      const out = []
      for (let i = 0; i < 2; i++) {
        window.__picked = null
        _exercisePickerState = { coachId: currentUser.id, onPick: ex => { window.__picked = ex }, allExercises: [] }
        await _createExerciseFromPicker(n)
        out.push(window.__picked?.id)
      }
      return out
    }, name)
    expect(ids[0]).toBeTruthy()
    expect(ids[1], 'the second create must resolve to the first').toBe(ids[0])
    expect(await countNamed(page, name)).toBe(1)
  })

  // The 200-row cap. 201 fillers sort BEFORE the target, so on ANY account the target is past the
  // cap — this does not depend on how much debris the E2E account happens to hold.
  test('an exercise past row 200 is findable in the picker and listed on the Library page', async ({ page }) => {
    test.setTimeout(150000)
    const target = `${TAG} zzz Target`
    await page.evaluate(async ({ tag }) => {
      const rows = Array.from({ length: 201 }, (_, i) => ({ coach_id: currentUser.id, name: `${tag} A-filler ${String(i).padStart(3, '0')}`, metric_type: 'weight_reps' }))
      rows.push({ coach_id: currentUser.id, name: `${tag} zzz Target`, metric_type: 'weight_reps' })
      const { error } = await db.from('exercises').insert(rows)
      if (error) throw new Error('fixture insert failed: ' + error.message)
    }, { tag: TAG })

    await openPicker(page)
    await page.locator('#exp-search').fill(target)
    await expect(page.locator('#exp-results').getByText(target, { exact: true }),
      'past row 200 the picker could neither list nor search it').toBeVisible({ timeout: 60000 })
    await page.evaluate(() => document.getElementById('exercise-picker-modal')?.remove())

    const onLibrary = await page.evaluate(async (t) => {
      const el = document.createElement('div'); document.body.appendChild(el)
      await renderExerciseLibrary(el)
      const ok = el.textContent.includes(t)
      el.remove()
      return ok
    }, target)
    expect(onLibrary, 'the Library page listed only the first 200 exercises').toBe(true)
  })
})

// ── 3. the Library's "Add exercise" ───────────────────────────────────────────────────────────
test.describe('Library "Add exercise"', () => {
  const open = page => page.evaluate(() => showAddExerciseModal())

  test('a name that already exists is refused with a message, and nothing is inserted', async ({ page }) => {
    const name = `${TAG} Deadlift`
    await insertExercise(page, name)
    await open(page)
    await page.locator('#ae-name').fill(name.toUpperCase())
    await page.locator('#add-exercise-modal button:has-text("Add exercise")').click()
    await expect(page.locator('#ae-error')).toContainText('already exists')
    expect(await countNamed(page, name)).toBe(1)
  })

  test('a new name is still added', async ({ page }) => {
    const name = `${TAG} Press`
    await open(page)
    await page.locator('#ae-name').fill(name)
    await page.locator('#add-exercise-modal button:has-text("Add exercise")').click()
    await expect.poll(() => countNamed(page, name)).toBe(1)
  })
})

// ── 4. auto-create must not multiply an existing duplicate ────────────────────────────────────
test.describe('_resolveExerciseIdForSave', () => {
  test('with two same-named rows already present it links to the OLDEST and inserts no third', async ({ page }) => {
    const name = `${TAG} Curl`
    const first = await insertExercise(page, name)
    await insertExercise(page, name)                      // the pre-existing duplicate
    const resolved = await page.evaluate(n => _resolveExerciseIdForSave(n, currentUser.id), name)
    expect(resolved, 'it must pick the oldest').toBe(first)
    expect(await countNamed(page, name), '.maybeSingle() errored on two rows and it inserted a third').toBe(2)
  })

  test('an underscore or percent in a name is NOT a wildcard', async ({ page }) => {
    const base = `${TAG} Row_Wide`
    const other = `${TAG} RowXWide`                       // would match "Row_Wide" if _ were a wildcard
    const otherId = await insertExercise(page, other)
    const resolved = await page.evaluate(n => _resolveExerciseIdForSave(n, currentUser.id), base)
    expect(resolved, 'must create its own exercise, not link to the one the wildcard happened to match').not.toBe(otherId)
    expect(await countNamed(page, base.replace(/_/g, '\\_'))).toBe(1)
  })
})

// ── 5. the manual "Log past session" lowercased every exercise it auto-created ────────────────
// saveWorkoutSession de-duplicates names by .toLowerCase() and then passed THAT string to the function
// that creates the library entry, so logging a past session with a new "Hack Squat" put "hack squat" in the
// library. (It is also why runner.spec.js's rollback test left 588 rows behind: it cleaned up by the name as
// typed, which matched nothing.)
test.describe('manual Log Session', () => {
  test('a new exercise is added to the library with the name AS TYPED, not lowercased', async ({ page }) => {
    const typed = `${TAG} Hack Squat`
    FIXTURE_CLIENT = await page.evaluate(async (tag) => {
      const { data, error } = await db.from('clients').insert({ coach_id: currentUser.id, full_name: tag + ' Client' }).select('id').single()
      if (error) throw new Error('fixture client: ' + error.message)
      return data.id
    }, TAG)
    await page.evaluate(async ({ clientId, typed }) => {
      await showLogSessionModal(clientId)
      document.getElementById('ls-name').value = typed + ' session'
      window._logBlocks = [{ name: typed, type: 'strength', sets: [{ repsMin: '5', weight: '50' }] }]
      renderLogExercises()   // saveWorkoutSession reads set values back out of rendered inputs
      await saveWorkoutSession(clientId)
    }, { clientId: FIXTURE_CLIENT, typed })
    const stored = await page.evaluate(async (typed) => {
      const { data } = await db.from('exercises').select('name').eq('coach_id', currentUser.id).ilike('name', typed)
      return (data || []).map(r => r.name)
    }, typed)
    expect(stored, 'exactly one library entry, stored exactly as typed').toEqual([typed])
  })
})
