const { test, expect } = require('./fixtures')
const { loginAsPT, loginAsClient, acceptConfirm, declineConfirm } = require('./helpers')

// ─── Jake, 2026-10-11 ─────────────────────────────────────────────────────────────────────────────────────────────────────────
//
// 1. "If a weight entry is entered as 0 then this is not saved properly in the runner/progress. 0 can still be a weight, for example
//    when performing a bodyweight exercise. Please make 0 be recorded the same way that any other weight entry is."  (answer: "0 should be
//    logged as 0".) The database already held the 0 (checked against his account: Tricep Dip 0 x 9, 0 x 6, 0 x 5). What dropped it was every
//    place that SHOWS or REMEMBERS a weight with a truthy test: the grey ghost number in the next session (weightToPref(0) is the NUMBER 0 in kg,
//    which the `||` chain read as "no value" and replaced with the word "kg"), the finish screen, the Stats sheet and the "Last time" strip.
// 2. "when you click 'finish workout' you should be asked 'are you sure...?' This also goes for the 'end' button", and the finish screen
//    needs a way back ("there should be a back to workout button").
//
// Every fixture is the test's own (the ownWorkout fixture builds the template as the PT and removes the logs it made, by name).
// Weights below use 12 reps on purpose: the post-session 1RM dialog only offers sets of 1-10 reps, and this file is not about it.

const DIPS = [{
  exercise_name: 'Own Dip', exercise_type: 'strength', metric_type: 'weight_reps', order_index: 0,
  sets_json: [{ repsMin: '8' }, { repsMin: '8' }]
}]

// A set in the fast table: the real inputs and the real tick.
async function logSet (page, i, weight, reps) {
  await page.fill(`#set-${i}-weight`, String(weight))
  await page.fill(`#set-${i}-reps`, String(reps))
  await page.click(`#set-${i}-done`)
}

// The save is finished when the runner has closed: saveRunnerSession inserts the log row FIRST, then its exercises and sets, and only then
// tears the runner down (clearing the draft). Polling for the log row alone returns while the save is still going, and a second start in
// that window correctly offers to resume the draft that is still there.
const saveFinished = (page) => expect.poll(() => page.evaluate(() => typeof _runner === 'undefined' || _runner === null), { message: 'the save finished and the runner closed' }).toBe(true)

const savedSets = (page, name) => page.evaluate(async (name) => {
  const { data } = await db.from('workout_logs').select('id, notes, workout_log_exercises(workout_log_sets(set_number, weight_kg, reps_achieved))').eq('name', name)
  return (data || []).map(l => ({
    notes: l.notes,
    sets: (l.workout_log_exercises || []).flatMap(e => e.workout_log_sets || []).sort((a, b) => a.set_number - b.set_number).map(s => [s.weight_kg, s.reps_achieved])
  }))
}, name)

test.describe('A weight of 0 is logged, shown and remembered like any other weight (2026-10-11)', () => {
  test('the stats formatters print a 0 weight, in kg and in lb, and still print a missing weight as reps only', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      const out = {}
      for (const unit of ['kg', 'lb']) {
        window._unitPrefs.weight = unit
        const zero = { weight_kg: 0, reps_achieved: 9 }, none = { weight_kg: null, reps_achieved: 9 }, real = { weight_kg: 2.5, reps_achieved: 6 }
        out[unit] = {
          zero: [_xsSetText(zero), _xsSetSpaced(zero), _xsSetWithUnit(zero)],
          none: [_xsSetText(none), _xsSetSpaced(none), _xsSetWithUnit(none)],
          real: [_xsSetText(real), _xsSetSpaced(real), _xsSetWithUnit(real)],
          // not weights at all: they must still read as reps only (a stored weight is a number or null, but the formatters should not trust that)
          junk: [_xsSetText({ weight_kg: 'BW', reps_achieved: 9 }), _xsSetSpaced({ weight_kg: NaN, reps_achieved: 9 }), _xsSetWithUnit({ weight_kg: 'abc', reps_achieved: 9 })],
          w25: _xsW(2.5)
        }
      }
      return out
    })
    expect(r.kg.zero, 'kg: a 0 is shown').toEqual(['0×9', '0 × 9', '0 kg × 9'])
    expect(r.lb.zero, 'lb: the same').toEqual(['0×9', '0 × 9', '0 lb × 9'])
    for (const u of ['kg', 'lb']) {
      expect(r[u].none, `${u}: no weight at all is still reps only`).toEqual(['9 reps', '9 reps', '9 reps'])
      expect(r[u].junk, `${u}: a non-numeric "weight" is not a weight`).toEqual(['9 reps', '9 reps', '9 reps'])
      expect(r[u].real, `${u}: a real weight is untouched`).toEqual([`${r[u].w25}×6`, `${r[u].w25} × 6`, `${r[u].w25} ${u} × 6`])
    }
  })

  test('0 is saved as 0, appears on the finish screen as "0 kg", and is the grey number and the Last time line next session', async ({ page, ownWorkout }) => {
    await loginAsClient(page)
    const wk = await ownWorkout({ exercises: DIPS })
    await wk.start()
    await expect(page.locator('#set-0-weight')).toBeVisible()
    await logSet(page, 0, 0, 9)
    await logSet(page, 1, 0, 6)

    await page.evaluate(() => showRunnerFinish())          // the confirm is its own test below
    await expect(page.getByText('Workout complete')).toBeVisible()
    const finish = await page.locator('#workout-runner').innerText()
    expect(finish, 'the finish screen shows the 0 like any weight').toContain('0 kg × 9 reps')
    expect(finish).toContain('0 kg × 6 reps')

    await page.click('button[onclick="saveRunnerSession()"]')
    await saveFinished(page)
    const saved0 = await savedSets(page, wk.name)
    expect(saved0, 'one session was saved').toHaveLength(1)
    expect(saved0[0].sets, 'saved as 0, not dropped').toEqual([[0, 9], [0, 6]])

    await wk.start()                                         // the next session of the same workout
    await expect(page.locator('#set-0-weight')).toBeVisible()
    await expect(page.locator('#set-0-weight'), 'the grey memory is the 0 that was lifted, not the word "kg"').toHaveAttribute('placeholder', '0')
    await expect(page.locator('#set-1-weight')).toHaveAttribute('placeholder', '0')
    await expect(page.locator('#wr-lasttime'), 'and the Last time line says what was done').toContainText('0 kg × 9')
  })

  test('a weighted set next to a 0 set still remembers each its own weight (nothing else moved)', async ({ page, ownWorkout }) => {
    await loginAsClient(page)
    const wk = await ownWorkout({ exercises: DIPS })
    await wk.start()
    await logSet(page, 0, 2.5, 12)
    await logSet(page, 1, 0, 12)
    await page.evaluate(() => showRunnerFinish())
    await page.click('button[onclick="saveRunnerSession()"]')
    await saveFinished(page)
    await wk.start()
    await expect(page.locator('#set-0-weight')).toHaveAttribute('placeholder', '2.5')
    await expect(page.locator('#set-1-weight')).toHaveAttribute('placeholder', '0')
  })
})

test.describe('Finish workout and End ask first; the finish screen has a way back (2026-10-11)', () => {
  test('Finish workout asks "are you sure"; Cancel leaves the workout exactly as it was; Finish goes on to the finish screen', async ({ page, ownWorkout }) => {
    await loginAsClient(page)
    const wk = await ownWorkout({ exercises: DIPS })
    await wk.start()
    await logSet(page, 0, 50, 12)

    await page.click('#wr-cta')
    await expect(page.locator('#confirm-dialog'), 'tapping Finish workout asks first').toBeVisible()
    await expect(page.locator('#confirm-dialog')).toContainText('Finish this workout')
    await declineConfirm(page)
    await expect(page.locator('#confirm-dialog')).toHaveCount(0)
    await expect(page.getByText('Workout complete'), 'Cancel does not finish it').toHaveCount(0)
    const kept = await page.evaluate(() => ({ done: _runner.exercises[0].tableRows[0].done, weight: _runner.exercises[0].tableRows[0].weight, timer: !!_runner._timerInterval }))
    expect(kept, 'the logged set, and the running timer, are untouched').toEqual({ done: true, weight: 50, timer: true })

    await page.click('#wr-cta')
    await acceptConfirm(page)
    await expect(page.getByText('Workout complete')).toBeVisible()
  })

  // Found by all three 2026-10-11 reviewers: saveRunnerSession's only re-entry guard is the Save button it disables, and going Back then finishing again
  // draws a NEW enabled Save beside the one still saving, so a second tap could insert a second log. Back is refused while Save is disabled.
  test('"Back to workout" does nothing while a save is under way, and works again once the Save button is enabled', async ({ page, ownWorkout }) => {
    test.setTimeout(120_000)
    await loginAsClient(page)
    const wk = await ownWorkout({ exercises: DIPS })
    await wk.start()
    await logSet(page, 0, 50, 12)
    await page.click('#wr-cta')
    await acceptConfirm(page)
    await expect(page.getByText('Workout complete')).toBeVisible()
    const saveButton = 'button[onclick="saveRunnerSession()"]'
    await page.evaluate((sel) => { document.querySelector(sel).disabled = true }, saveButton)      // exactly what a running save leaves behind
    await page.getByRole('button', { name: /Back to workout/ }).click()
    await expect(page.getByText('Workout complete'), 'Back is refused while Save is in flight').toBeVisible()
    await page.evaluate((sel) => { document.querySelector(sel).disabled = false }, saveButton)     // what a FAILED save does
    await page.getByRole('button', { name: /Back to workout/ }).click()
    await expect(page.locator('#set-0-weight'), 'and works again once the save is not running').toBeVisible()
  })

  test('Back gives a nameless exercise its blank name back: the finish screen\'s "Exercise 1" label is not made permanent', async ({ page, ownWorkout }) => {
    test.setTimeout(120_000)
    await loginAsClient(page)
    const wk = await ownWorkout({ exercises: DIPS })
    await wk.start()
    await logSet(page, 0, 50, 12)
    await page.evaluate(() => { _runner.exercises[0].name = '' })       // a custom workout's exercise that was never named
    await page.click('#wr-cta')
    await acceptConfirm(page)
    await expect(page.locator('#workout-runner')).toContainText('Exercise 1')
    expect(await page.evaluate(() => _runner.exercises[0].name), 'the label is on the live object while the finish screen is up').toBe('Exercise 1')
    await page.getByRole('button', { name: /Back to workout/ }).click()
    await expect(page.locator('#set-0-weight')).toBeVisible()
    expect(await page.evaluate(() => _runner.exercises[0].name), 'and is taken off again when the runner comes back').toBe('')
  })

  // Found by the 2026-10-11 security reviewer in lines this change edited: a cardio set's duration is free text typed in the Edit sheet and was printed raw
  // on the finish screen (and in the wizard's set list). Own browser only, but it is markup from a typed value.
  test('a typed cardio duration is shown as text on the finish screen, never run as markup', async ({ page }) => {
    await loginAsClient(page)
    const r = await page.evaluate(async () => {
      window.__pwned = 0
      const host = document.createElement('div'); host.id = 'workout-runner'; document.body.appendChild(host)
      _runner = {
        clientId: null, name: 'Esc', startTime: Date.now(), exIdx: 0, finishNotes: '',
        exercises: [{ name: 'Own Row', type: 'cardio', metricType: 'cardio', loggedSets: [{ duration: '<img src=x onerror="window.__pwned=1">', distanceM: 1000 }] }]
      }
      await showRunnerFinish()
      const out = { html: host.innerHTML, pwned: window.__pwned, imgs: host.querySelectorAll('img').length }
      host.remove(); _runner = null
      return out
    })
    expect(r.imgs, 'no element was made from the typed text').toBe(0)
    expect(r.pwned, 'and no handler ran').toBe(0)
    expect(r.html).toContain('&lt;img')
  })

  test('the grey "Finish workout" button on an untouched last exercise asks too, and says nothing has been logged', async ({ page, ownWorkout }) => {
    await loginAsClient(page)
    const wk = await ownWorkout({ exercises: DIPS })
    await wk.start()
    await expect(page.locator('#wr-cta')).toContainText('Finish workout')       // the grey one: a one-exercise workout, nothing ticked yet
    await page.click('#wr-cta')
    await expect(page.locator('#confirm-dialog')).toContainText('Nothing has been logged')
    await declineConfirm(page)
    await expect(page.locator('#set-0-weight'), 'Cancel keeps the workout open').toBeVisible()
    await page.click('#wr-cta')
    await acceptConfirm(page)
    await expect(page.locator('#workout-runner'), 'confirming ends it (nothing was logged, so there is no finish screen to show)').toHaveCount(0)
  })

  test('the End button asks too, with the same words when sets are logged, and says so when nothing is', async ({ page, ownWorkout }) => {
    await loginAsClient(page)
    const wk = await ownWorkout({ exercises: DIPS })
    await wk.start()
    await expect(page.locator('#set-0-weight')).toBeVisible()
    const endButton = page.locator('#workout-runner button:text-is("End")')

    // nothing logged yet: End closes the runner, so it asks, and says there is nothing to lose
    await endButton.click()
    await expect(page.locator('#confirm-dialog')).toContainText('Nothing has been logged')
    await declineConfirm(page)
    await expect(page.locator('#set-0-weight'), 'Cancel keeps the workout open').toBeVisible()
    await endButton.click()
    await acceptConfirm(page)
    await expect(page.locator('#workout-runner'), 'confirming closes it').toHaveCount(0)

    // with a set logged: the same question as Finish
    await wk.start()
    await logSet(page, 0, 40, 12)
    await endButton.click()
    await expect(page.locator('#confirm-dialog')).toContainText('Finish this workout')
    await declineConfirm(page)
    await expect(page.getByText('Workout complete')).toHaveCount(0)
    await endButton.click()
    await acceptConfirm(page)
    await expect(page.getByText('Workout complete')).toBeVisible()
  })

  // The finish screen looks up each lift's best earlier weight in the background and repaints itself (with the PR chips) when it returns. If
  // "Back to workout" is tapped first, that late repaint used to be able to draw the finish screen over the runner again. The lookup is HELD here
  // and released by the test only after Back, then waited for until it has settled: the race is decided by the test, not by network speed, and
  // there is no fixed sleep (proving an absence needs a moment when the thing WOULD have happened, and that moment is the settled lookup).
  test('a PR lookup that returns AFTER "Back to workout" does not put the finish screen back over the runner', async ({ page, ownWorkout }) => {
    test.setTimeout(120_000)
    await loginAsClient(page)
    const wk = await ownWorkout({ exercises: DIPS })
    await wk.start()
    await logSet(page, 0, 50, 12)
    await page.evaluate(() => {
      const real = window._prBaseline
      window.__prHeld = []; window.__prSettled = 0
      window._prBaseline = (...a) => new Promise(res => window.__prHeld.push(() => res(real(...a).then(v => { window.__prSettled++; return v }))))
    })
    await page.click('#wr-cta')
    await acceptConfirm(page)
    await expect(page.getByText('Workout complete')).toBeVisible()
    await page.getByRole('button', { name: /Back to workout/ }).click()
    await expect(page.locator('#set-0-weight')).toBeVisible()

    await page.evaluate(() => window.__prHeld.forEach(release => release()))      // the lookup returns NOW, after Back
    await expect.poll(() => page.evaluate(() => window.__prSettled), { message: 'the held lookup has settled' }).toBeGreaterThan(0)
    await page.evaluate(() => new Promise(r => setTimeout(r, 0)))                  // let the finish screen's continuation run (it follows the lookup by a microtask)
    await expect(page.getByText('Workout complete'), 'the finish screen did not come back by itself').toHaveCount(0)
    await expect(page.locator('#set-0-weight'), 'the runner is still the thing on screen').toBeVisible()
  })

  test('the finish screen has "Back to workout": what was logged and typed survives the round trip, the timer runs again, and nothing is saved twice', async ({ page, ownWorkout }) => {
    test.setTimeout(120_000)           // a long journey on purpose: the fixture's own PT login, two trips to the finish screen and a save
    await loginAsClient(page)
    const wk = await ownWorkout({ exercises: DIPS })
    await wk.start()
    await logSet(page, 0, 50, 12)
    await page.click('#wr-cta')
    await acceptConfirm(page)
    await expect(page.getByText('Workout complete')).toBeVisible()
    await page.fill('#rf-notes', 'felt strong')

    await page.getByRole('button', { name: /Back to workout/ }).click()
    await expect(page.getByText('Workout complete'), 'the finish screen is gone').toHaveCount(0)
    await expect(page.locator('#set-0-weight'), 'the runner is back with the weight typed').toHaveValue('50')
    const back = await page.evaluate(() => ({ done: _runner.exercises[0].tableRows[0].done, timer: !!_runner._timerInterval, wakeOff: !!_runner._wakeLockOff, draft: !!localStorage.getItem(_runnerDraftKey(_runner.clientId)) }))
    expect(back, 'the set is still ticked, the session timer and draft checkpoint run again, the screen may stay awake').toEqual({ done: true, timer: true, wakeOff: false, draft: true })

    await logSet(page, 1, 55, 12)       // keeps going after going back (the last prescribed set starts a rest; Finish is still the athlete's tap)
    await page.click('#wr-cta')
    await acceptConfirm(page)
    await expect(page.getByText('Workout complete')).toBeVisible()
    await expect(page.locator('#rf-notes'), 'what was typed on the finish screen is still there').toHaveValue('felt strong')
    await page.click('button[onclick="saveRunnerSession()"]')
    await saveFinished(page)
    const savedAll = await savedSets(page, wk.name)
    expect(savedAll, 'saved once, not twice').toHaveLength(1)
    const saved = savedAll[0]
    expect(saved.sets, 'both sets, the one logged before and the one after going back').toEqual([[50, 12], [55, 12]])
    expect(saved.notes).toBe('felt strong')
  })
})
