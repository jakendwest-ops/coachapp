const { test, expect } = require('@playwright/test')
const { loginAsPT, loginAsClient, clickVisible, acceptConfirm, declineConfirm } = require('./helpers')
const { failNext, offline, online } = require('./fault')

// R4a (2026-10-29): a workout saved on a bad gym connection must end as exactly ONE complete session, however the
// earlier attempt died, and must never be thrown away while it is unsaved. Ledger:
// docs/bugs/2026-10-29-workout-save-is-not-retry-safe.md. Each case drives the real save functions against the live
// database with a fault injected by tests/fault.js; every fixture is tagged and removed by this spec.
//
// Reps are 12 on purpose: the post-save "new 1RM?" prompt skips sets over 10 reps, so no prompt opens and no
// client_1rms row is ever written by these tests.

// Starts with "[E2E]" so the suite's debris reaper also removes anything a crashed run leaves behind.
const TAG = '[E2E] save-retry'

// Builds a runner in memory with two exercises and three logged sets. `_runner` is a top-level `let` in a classic
// script: assign the bare identifier (see tests/runner-save-metrics.spec.js).
async function startRunner (page, name) {
  return page.evaluate(async (name) => {
    const clientId = await _getCurrentClientId()
    // tableRows as well as loggedSets, as a real runner draft has them: a reopened runner re-derives loggedSets from the
    // ticked table rows, so a fixture without them would lose its sets on the reload test.
    const ex = (suffix, weights) => ({ name: name + ' ' + suffix, type: 'strength', metricType: 'weight_reps', exerciseId: null,
      tableRows: weights.map(w => ({ weight: w, reps: '12', done: true })), loggedSets: weights.map(w => ({ weight: w, reps: '12' })) })
    _runner = { clientId, name, date: _ymdLocal(new Date()), startTime: Date.now(), exIdx: 0, exercises: [ex('A', [20, 20]), ex('B', [10])] }
    _saveRunnerDraft()
    return clientId
  }, name)
}

// Every session whose name starts with `prefix`, with its exercise and set counts.
async function sessions (page, clientId, prefix) {
  return page.evaluate(async ({ clientId, prefix }) => {
    const { data, error } = await db.from('workout_logs')
      .select('id, name, notes, workout_log_exercises(id, workout_log_sets(id))')
      .eq('client_id', clientId).like('name', prefix + '%')
    if (error) throw new Error('read back failed: ' + error.message)
    return data.map(l => ({
      id: l.id, name: l.name, notes: l.notes,
      exercises: l.workout_log_exercises.length,
      sets: l.workout_log_exercises.reduce((n, e) => n + e.workout_log_sets.length, 0)
    }))
  }, { clientId, prefix })
}

// Coach-side cleanup: deleting a log cascades to its exercises and sets. Rowcount-checked against what was read.
async function cleanup (page, clientId, prefix) {
  // An injected fault still waiting to fire (a test that failed early) must not swallow the clean-up's own requests.
  await page.unrouteAll({ behavior: 'ignoreErrors' })
  const before = await sessions(page, clientId, prefix)
  if (!before.length) return
  const gone = await page.evaluate(async (ids) => {
    const { data, error } = await db.from('workout_logs').delete().in('id', ids).select('id')
    if (error) throw new Error('cleanup failed: ' + error.message)
    return data.length
  }, before.map(s => s.id))
  expect(gone, 'cleanup removed every fixture session').toBe(before.length)
}

async function soloPage (page) {
  await loginAsPT(page)
  await clickVisible(page, ['#vs-personal', '#mvs-personal'])
  await page.waitForFunction(() => typeof window._soloClientId === 'string' && !!window._soloClientId)
}

const unique = (what) => `${TAG} ${what} ${Date.now()}`

test.describe('Runner save converges to one complete session on a bad connection (R4a)', () => {
  test('the session insert reaches the server but the reply is lost; Save again gives ONE session', async ({ page }) => {
    await soloPage(page)
    const name = unique('lost-log')
    const clientId = await startRunner(page, name)
    try {
      const fault = await failNext(page, 'workout_logs', { mode: 'lost-response' })
      await page.evaluate(() => saveRunnerSession())
      expect(fault.hits, 'the fault fired').toBe(1)
      // A write was sent (and in fact landed), so the sets are locked: Back to the workout is refused.
      await page.evaluate(() => backToRunnerFromFinish())
      await expect(page.locator('#app-toast')).toContainText('waiting to be saved')
      await page.evaluate(() => saveRunnerSession())
      const got = await sessions(page, clientId, name)
      expect(got.length, 'exactly one session').toBe(1)
      expect(got[0].exercises).toBe(2)
      expect(got[0].sets).toBe(3)
    } finally { await cleanup(page, clientId, name) }
  })

  test('a save that failed before sending anything leaves the sets editable (Back is allowed)', async ({ page }) => {
    await soloPage(page)
    const name = unique('back-ok')
    const clientId = await startRunner(page, name)
    try {
      // The ownership check is the save's first request; with it refused nothing is written.
      await failNext(page, 'clients', { method: 'GET', mode: 'http-500', times: 10 })
      await page.evaluate(() => saveRunnerSession())
      await page.unrouteAll({ behavior: 'ignoreErrors' })
      const st = await page.evaluate(() => ({ pending: !!_runner?.pendingSave, sent: !!_runner?.saveWritesStarted }))
      expect(st, 'kept as not saved, but no write was sent').toEqual({ pending: true, sent: false })
      await page.evaluate(() => backToRunnerFromFinish())
      await expect(page.locator('#workout-runner'), 'Back reopened the runner').toHaveCount(1)
      await expect(page.locator('#app-toast')).not.toContainText('waiting to be saved')
      expect((await sessions(page, clientId, name)).length, 'nothing reached the server').toBe(0)
    } finally {
      await page.evaluate(() => { if (_runner) discardRunner() })
      await cleanup(page, clientId, name)
    }
  })

  test('the connection dies after the session insert, taking the clean-up with it; Save again gives ONE session', async ({ page }) => {
    await soloPage(page)
    const name = unique('dead-after-log')
    const clientId = await startRunner(page, name)
    try {
      const fault = await failNext(page, 'workout_log_exercises', { mode: 'abort' })
      await failNext(page, 'workout_logs', { method: 'DELETE', mode: 'abort', times: 5 })
      await page.evaluate(() => saveRunnerSession())
      expect(fault.hits, 'the fault fired').toBe(1)
      await page.evaluate(() => saveRunnerSession())
      const got = await sessions(page, clientId, name)
      expect(got.length, 'exactly one session, no empty one left behind').toBe(1)
      expect(got[0].exercises).toBe(2)
      expect(got[0].sets).toBe(3)
    } finally { await cleanup(page, clientId, name) }
  })

  test('the sets insert reaches the server but the reply is lost; Save again gives ONE session and no duplicate sets', async ({ page }) => {
    await soloPage(page)
    const name = unique('lost-sets')
    const clientId = await startRunner(page, name)
    try {
      const fault = await failNext(page, 'workout_log_sets', { mode: 'lost-response' })
      await page.evaluate(() => saveRunnerSession())
      expect(fault.hits, 'the fault fired').toBe(1)
      await page.evaluate(() => saveRunnerSession())
      const got = await sessions(page, clientId, name)
      expect(got.length).toBe(1)
      expect(got[0].sets, 'three sets, not six').toBe(3)
    } finally { await cleanup(page, clientId, name) }
  })

  test('a name changed between a failed attempt and the retry is the name that is saved', async ({ page }) => {
    await soloPage(page)
    const name = unique('rename')
    const clientId = await startRunner(page, name)
    try {
      await failNext(page, 'workout_logs', { mode: 'lost-response' })
      await page.evaluate(() => saveRunnerSession())
      await page.evaluate((n) => { _runner.name = n }, name + ' renamed')
      await page.evaluate(() => saveRunnerSession())
      const got = await sessions(page, clientId, name)
      expect(got.length, 'exactly one session').toBe(1)
      expect(got[0].name).toBe(name + ' renamed')
    } finally { await cleanup(page, clientId, name) }
  })

  test('a write that reports success but stores nothing is caught: the workout is not called saved, and Save again completes it', async ({ page }) => {
    await soloPage(page)
    const name = unique('fake-ok')
    const clientId = await startRunner(page, name)
    try {
      const fault = await failNext(page, 'workout_log_sets', { mode: 'fake-success' })
      await page.evaluate(() => saveRunnerSession())
      expect(fault.hits, 'the fault fired').toBe(1)
      await expect(page.locator('#app-toast')).toContainText('may not have saved completely')
      expect(await page.evaluate(() => !!_runner?.pendingSave), 'still marked as not saved').toBe(true)
      await page.evaluate(() => saveRunnerSession())
      const got = await sessions(page, clientId, name)
      expect(got.length).toBe(1)
      expect(got[0].sets).toBe(3)
    } finally { await cleanup(page, clientId, name) }
  })

  test('two overlapping saves of the same workout give ONE session', async ({ page }) => {
    await soloPage(page)
    const name = unique('double')
    const clientId = await startRunner(page, name)
    try {
      await page.evaluate(() => Promise.all([saveRunnerSession(), saveRunnerSession()]))
      const got = await sessions(page, clientId, name)
      expect(got.length, 'exactly one session').toBe(1)
      expect(got[0].sets).toBe(3)
    } finally { await cleanup(page, clientId, name) }
  })

  test('with no signal the workout is kept as not saved, says so in plain English, and survives a reload days later', async ({ page }) => {
    await soloPage(page)
    const name = unique('offline')
    const clientId = await startRunner(page, name)
    try {
      // The name and notes are TYPED on the finish screen, as a person would: a retry days later must save those, not the
      // name the workout started with (review finding, 2026-10-29).
      await page.evaluate(async () => { renderRunner(); await showRunnerFinish() })
      await page.locator('#rf-name').fill(name + ' typed')
      await page.locator('#rf-notes').fill('felt strong')
      const net = await offline(page)
      await page.locator('#workout-runner button[onclick="saveRunnerSession()"]').click()
      // Measured 2026-10-29: about 7 s with no signal. supabase-js 2.117 retries a failed read (the client lookup) with
      // back-off before it reports the failure; "Saving…" shows meanwhile.
      await expect(page.locator('#app-toast')).toContainText('kept on this phone', { timeout: 20000 })
      await online(page, net)
      expect(net.hits, 'requests really were cut off').toBeGreaterThan(0)
      await expect(page.locator('#app-toast')).toContainText('kept on this phone')
      await expect(page.locator('#app-toast')).not.toContainText('Failed to fetch')

      const pending = await page.evaluate((id) => JSON.parse(localStorage.getItem(_runnerDraftKey(id)) || 'null'), clientId)
      expect(pending?.pendingSave, 'the draft is marked as not saved').toBeTruthy()

      // Two days pass and the app is opened again.
      await page.evaluate((id) => {
        const k = _runnerDraftKey(id); const d = JSON.parse(localStorage.getItem(k))
        d.savedAt = Date.now() - 2 * 86400000; localStorage.setItem(k, JSON.stringify(d))
      }, clientId)
      await page.reload()
      await page.waitForSelector('#app-shell', { state: 'visible' })
      const bar = page.locator('#pending-save-bar')
      await expect(bar).toBeVisible({ timeout: 15000 })
      await expect(bar).toContainText(name)

      // Signal is back: Retry opens the workout's finish screen, and Save stores it once.
      await bar.locator('button', { hasText: 'Retry' }).click()
      await page.locator('#workout-runner button[onclick="saveRunnerSession()"]').click()
      // A finished save closes the runner; until then it reads "Saving…" and the rows are still being written.
      await expect(page.locator('#workout-runner')).toHaveCount(0, { timeout: 20000 })
      await expect(page.locator('#pending-save-bar')).toHaveCount(0)
      const got = await sessions(page, clientId, name)
      expect(got.length).toBe(1)
      expect(got[0].sets).toBe(3)
      expect(got[0].name, 'the typed name survived the reload').toBe(name + ' typed')
      expect(got[0].notes, 'the typed notes survived the reload').toBe('felt strong')
    } finally {
      await page.evaluate((id) => localStorage.removeItem(_runnerDraftKey(id)), clientId)
      await cleanup(page, clientId, name)
    }
  })

  test('Discard of a workout that had in fact saved deletes nothing and says so', async ({ page }) => {
    await soloPage(page)
    const name = unique('discard-saved')
    const clientId = await startRunner(page, name)
    try {
      // Every row lands; only the reply to the sets write is lost, so the phone believes the save failed.
      await failNext(page, 'workout_log_sets', { mode: 'lost-response' })
      await page.evaluate(() => saveRunnerSession())
      await page.evaluate(() => { _runner = null; _refreshPendingSaveBar() })
      const discarding = page.evaluate((id) => discardPendingSave(id), clientId)
      await acceptConfirm(page)
      await discarding
      await expect(page.locator('#app-toast')).toContainText('already saved')
      const got = await sessions(page, clientId, name)
      expect(got.length, 'the complete session is still there').toBe(1)
      expect(got[0].sets).toBe(3)
      expect(await page.evaluate((id) => localStorage.getItem(_runnerDraftKey(id)), clientId), 'the phone copy is dropped').toBeNull()
    } finally {
      await page.evaluate((id) => localStorage.removeItem(_runnerDraftKey(id)), clientId)
      await cleanup(page, clientId, name)
    }
  })

  test('Discard with no signal keeps the workout and leaves nothing half-tidied', async ({ page }) => {
    await soloPage(page)
    const name = unique('discard-offline')
    const clientId = await startRunner(page, name)
    try {
      // The session row lands, then the connection dies: a partial save is on the server and the phone holds the workout.
      await failNext(page, 'workout_log_exercises', { mode: 'abort' })
      await page.evaluate(() => saveRunnerSession())
      await page.evaluate(() => { _runner = null })
      const net = await offline(page)
      const discarding = page.evaluate((id) => discardPendingSave(id), clientId)
      await acceptConfirm(page)
      await discarding
      await online(page, net)
      await expect(page.locator('#app-toast')).toContainText('needs signal')
      const kept = await page.evaluate((id) => JSON.parse(localStorage.getItem(_runnerDraftKey(id)) || 'null'), clientId)
      expect(kept?.saveLogId, 'the workout is still on the phone').toBeTruthy()
      // With signal, Discard tidies the partial session away.
      const again = page.evaluate((id) => discardPendingSave(id), clientId)
      await acceptConfirm(page)
      await again
      expect((await sessions(page, clientId, name)).length, 'the partial session was removed').toBe(0)
    } finally {
      await page.evaluate((id) => localStorage.removeItem(_runnerDraftKey(id)), clientId)
      await cleanup(page, clientId, name)
    }
  })

  test('signing out over an unsaved workout asks first; the bar never stays on the sign-in screen', async ({ page }) => {
    await soloPage(page)
    const name = unique('signout')
    const clientId = await startRunner(page, name)
    try {
      await page.evaluate((id) => {
        const k = _runnerDraftKey(id); const d = JSON.parse(localStorage.getItem(k))
        d.pendingSave = { since: Date.now() }; d.saveLogId = crypto.randomUUID(); localStorage.setItem(k, JSON.stringify(d))
        _runner = null; _refreshPendingSaveBar()
      }, clientId)
      await expect(page.locator('#pending-save-bar')).toBeVisible()
      // A second unsaved workout on this phone, from ANOTHER account: sign-out clears every draft, so it is counted too.
      const otherKey = await page.evaluate(() => {
        const k = _runnerDraftKey(crypto.randomUUID())
        localStorage.setItem(k, JSON.stringify({ clientId: 'x', name: 'other', exercises: [], pendingSave: { since: Date.now() }, saveLogId: crypto.randomUUID(), userId: crypto.randomUUID(), savedAt: Date.now() }))
        return k
      })
      // Keep it: nothing is signed out (declining never reaches the real sign-out, which would end the suite's saved login).
      const asking = page.evaluate(() => signOutAndClearDrafts({ ask: true }))
      await expect(page.locator('#confirm-dialog')).toContainText('2 workouts have not been saved')
      await page.evaluate((k) => localStorage.removeItem(k), otherKey)
      await declineConfirm(page)
      expect(await asking, 'declining keeps the person signed in').toBe(false)
      expect(await page.evaluate((id) => !!localStorage.getItem(_runnerDraftKey(id)), clientId), 'the workout is still on the phone').toBe(true)
      // The sign-in screen removes the bar.
      await page.evaluate(() => showAuth())
      await expect(page.locator('#pending-save-bar')).toHaveCount(0)
    } finally {
      await page.evaluate((id) => localStorage.removeItem(_runnerDraftKey(id)), clientId)
    }
  })

  test("another person's unsaved workout on a shared phone is neither shown nor deleted", async ({ page }) => {
    await soloPage(page)
    const name = unique('shared-phone')
    const clientId = await startRunner(page, name)
    try {
      const r = await page.evaluate((id) => {
        const k = _runnerDraftKey(id); const d = JSON.parse(localStorage.getItem(k))
        Object.assign(d, { pendingSave: { since: Date.now() }, saveLogId: crypto.randomUUID(), userId: crypto.randomUUID() })
        localStorage.setItem(k, JSON.stringify(d))
        _runner = null; _refreshPendingSaveBar()
        return { loaded: !!_loadRunnerDraft(id), listed: _pendingSaveDrafts().length, stillStored: !!localStorage.getItem(k) }
      }, clientId)
      expect(r).toEqual({ loaded: false, listed: 0, stillStored: true })
      await expect(page.locator('#pending-save-bar')).toHaveCount(0)
      // Opening that client's runner must not start a fresh one over it - its draft checkpoint would overwrite the slot.
      const before = await page.evaluate((id) => localStorage.getItem(_runnerDraftKey(id)), clientId)
      await page.evaluate((id) => launchRunner(id), clientId)
      await expect(page.locator('#app-toast')).toContainText('Another account has an unsaved workout')
      const after = await page.evaluate((id) => ({ raw: localStorage.getItem(_runnerDraftKey(id)), runner: !!_runner }), clientId)
      expect(after.runner, 'no runner was started').toBe(false)
      expect(after.raw, "the other account's workout is untouched").toBe(before)
    } finally {
      await page.evaluate((id) => localStorage.removeItem(_runnerDraftKey(id)), clientId)
    }
  })

  test('an ordinary unfinished draft from a previous day is still discarded (the same-day rule stands)', async ({ page }) => {
    await soloPage(page)
    const name = unique('stale-draft')
    const clientId = await startRunner(page, name)
    const kept = await page.evaluate((id) => {
      const k = _runnerDraftKey(id); const d = JSON.parse(localStorage.getItem(k))
      d.savedAt = Date.now() - 2 * 86400000; localStorage.setItem(k, JSON.stringify(d))
      _runner = null
      return !!_loadRunnerDraft(id)
    }, clientId)
    expect(kept).toBe(false)
  })

  test('the manual Log session form locks its rows after a failed save, and closing it tidies the partial session', async ({ page }) => {
    await soloPage(page)
    const name = unique('manual-lock')
    const clientId = await page.evaluate(() => _getCurrentClientId())
    try {
      await page.evaluate(async ({ clientId, name }) => {
        await showLogSessionModal(clientId)
        document.getElementById('ls-name').value = name
        window._logBlocks = [{ name: name + ' A', type: 'strength', effortMode: 'RPE', oneRM: '',
          sets: [{ repsMin: '12', repsMax: '', weight: '20', pctMin: '', pctMax: '', effort: '', rest: '' }] }]
        renderLogExercises()
      }, { clientId, name })
      // The session and exercise rows land; the sets write is refused.
      const fault = await failNext(page, 'workout_log_sets', { mode: 'http-500' })
      await page.evaluate((id) => saveWorkoutSession(id), clientId)
      expect(fault.hits, 'the fault fired').toBe(1)
      await expect(page.locator('#ls-date')).toBeDisabled()
      await expect(page.locator('#ls-add-exercise')).toBeDisabled()
      await expect(page.locator('#ls-name'), 'the name stays editable').toBeEnabled()
      expect((await sessions(page, clientId, name)).length, 'a partial session is on the server').toBe(1)
      await page.locator('#log-session-modal .modal-close').click()
      await expect(page.locator('#log-session-modal')).toHaveCount(0)
      expect((await sessions(page, clientId, name)).length, 'closing the form removed it').toBe(0)
    } finally {
      await cleanup(page, clientId, name)
      const libGone = await page.evaluate(async (n) => {
        const { data, error } = await db.from('exercises').delete().like('name', n + '%').select('id')
        return error ? -1 : data.length
      }, name)
      expect(libGone, 'the library exercise this test created was removed').toBe(1)
    }
  })

  test('the manual Log session form: reply lost on the session insert, Save again gives ONE session', async ({ page }) => {
    await soloPage(page)
    const name = unique('manual')
    const clientId = await page.evaluate(() => _getCurrentClientId())
    try {
      await page.evaluate(async ({ clientId, name }) => {
        await showLogSessionModal(clientId)
        document.getElementById('ls-name').value = name
        window._logBlocks = [{ name: name + ' A', type: 'strength', effortMode: 'RPE', oneRM: '',
          sets: [{ repsMin: '12', repsMax: '', weight: '20', pctMin: '', pctMax: '', effort: '', rest: '' }] }]
        renderLogExercises()
      }, { clientId, name })
      const fault = await failNext(page, 'workout_logs', { mode: 'lost-response' })
      await page.evaluate((id) => saveWorkoutSession(id), clientId)
      expect(fault.hits, 'the fault fired').toBe(1)
      await page.evaluate((id) => saveWorkoutSession(id), clientId)
      const got = await sessions(page, clientId, name)
      expect(got.length, 'exactly one session').toBe(1)
      expect(got[0].sets).toBe(1)
    } finally {
      await cleanup(page, clientId, name)
      // The manual form resolves exercise names into the library, creating them if new: one library row, named for this test.
      const libGone = await page.evaluate(async (n) => {
        const { data, error } = await db.from('exercises').delete().like('name', n + '%').select('id')
        return error ? -1 : data.length
      }, name)
      expect(libGone, 'the library exercise this test created was removed').toBe(1)
    }
  })
})

test.describe('A CLIENT account retrying a save (R4a)', () => {
  // Cleanup runs as the coach: a client may delete only EMPTY sessions, which a complete one is not.
  test('reply lost on the session insert: Save again gives ONE session; a rename it cannot apply is said, not hidden', async ({ page, browser }) => {
    await loginAsClient(page)
    const name = unique('client')
    const clientId = await startRunner(page, name)
    const coachCtx = await browser.newContext()
    const coach = await coachCtx.newPage()
    try {
      await failNext(page, 'workout_logs', { mode: 'lost-response' })
      await page.evaluate(() => saveRunnerSession())
      await page.evaluate((n) => { _runner.name = n }, name + ' renamed')
      await page.evaluate(() => saveRunnerSession())
      await expect(page.locator('#app-toast')).toContainText('new name could not be applied')
      const got = await sessions(page, clientId, name)
      expect(got.length, 'exactly one session').toBe(1)
      expect(got[0].sets).toBe(3)
      expect(got[0].name, 'the client cannot update its own session, so the first name stands').toBe(name)
    } finally {
      await loginAsPT(coach)
      await cleanup(coach, clientId, name)
      await coachCtx.close()
    }
  })
})
