const { test, expect } = require('@playwright/test')
const { loginAsPT, clickVisible } = require('./helpers')

// 5 fixes from Jake's 2026-07-29 live-use report. Each test is red-first verified against the
// pre-fix code before landing (reverted the file to HEAD, confirmed the assertion failed, restored).
//
// `_runner` is a top-level `let` in app-runner.js — a classic-script `let` binding does NOT mirror
// onto `window` (les-024), so tests must assign the bare identifier (`_runner = {...}`), never
// `window._runner = {...}` (that just creates an unrelated window property the real code never reads).

test.describe('B — assigning a program with no phases yet fails loud, not silent', () => {
  test('_cloneProgramForClient toasts instead of silently leaving the assignment empty', async ({ page }) => {
    await loginAsPT(page)
    await page.evaluate(() => localStorage.setItem('_activeView', 'solo'))
    await page.goto('/')
    await page.waitForSelector('h1', { timeout: 15000 })

    const res = await page.evaluate(async () => {
      const soloId = window._soloClientId
      const { data: prog } = await db.from('programs').insert({ coach_id: currentUser.id, is_personal: true, name: '[TEST] Zero Phase' }).select('id').single()

      let toastMsg = null, toastKind = null
      const origToast = window.showToast
      window.showToast = (msg, kind) => { toastMsg = msg; toastKind = kind }

      await _cloneProgramForClient('00000000-0000-0000-0000-000000000001', prog.id, soloId)

      window.showToast = origToast
      await db.from('programs').delete().eq('id', prog.id)
      return { toastMsg, toastKind }
    })

    expect(res.toastMsg).toBeTruthy() // NOT silent — this is the whole point of the fix
    expect(res.toastKind).toBe('warn')
  })

  test('saveAssignProgramToClient does not clobber that toast with its own unconditional success message', async ({ page }) => {
    await loginAsPT(page)
    await page.evaluate(() => localStorage.setItem('_activeView', 'solo'))
    await page.goto('/')
    await page.waitForSelector('h1', { timeout: 15000 })

    const res = await page.evaluate(async () => {
      const soloId = window._soloClientId
      const { data: prog } = await db.from('programs').insert({ coach_id: currentUser.id, is_personal: true, name: '[TEST] Zero Phase Assign' }).select('id').single()

      const toasts = []
      const origToast = window.showToast
      window.showToast = (msg, kind) => { toasts.push({ msg, kind }) }

      await showAssignProgramToClientModal(prog.id)
      await new Promise(r => setTimeout(r, 300))
      await saveAssignProgramToClient(prog.id, soloId)
      await new Promise(r => setTimeout(r, 500))

      window.showToast = origToast
      document.getElementById('apc-modal')?.remove()
      await db.from('client_programs').delete().eq('program_id', prog.id)
      await db.from('programs').delete().eq('id', prog.id)
      return toasts
    })

    // The zero-phases warning must be the LAST toast shown — not immediately overwritten by a
    // generic "Program added to your plan" success message.
    const last = res[res.length - 1]
    expect(last?.kind).toBe('warn')
    expect(res.some(t => t.kind === 'success')).toBe(false)
  })
})

test.describe('C1 — propagation context is snapshotted before the async re-render gap', () => {
  test('_afterTemplateExerciseSave passes an explicit ctx/change snapshot through, immune to a concurrent window._templateCtx overwrite', async ({ page }) => {
    await loginAsPT(page)
    await clickVisible(page, '[data-page="workouts"]')
    await page.waitForSelector('.list-row', { timeout: 15000 })

    const res = await page.evaluate(async () => {
      const { data: tmpl } = await db.from('workout_templates').select('id')
        .is('client_id', null).is('program_id', null).is('generated_from_phase_id', null).limit(1).single()
      if (!tmpl) return { skipped: true }

      window._templateCtx = { clientId: null, programId: 'SNAPSHOT-PROGRAM-ID', isClientPlan: false }
      window._lastExerciseChange = { op: 'update', matchName: 'irrelevant', row: {} }

      let capturedCtx = null
      const origPropagate = window._checkClientPlanPropagation
      window._checkClientPlanPropagation = async (templateId, ctxOverride) => {
        capturedCtx = ctxOverride
        // Simulate a concurrent navigation clobbering the global mid-flight — proves the function
        // is reading the snapshot argument, not re-reading window._templateCtx after this point.
        window._templateCtx = { clientId: 'someone-elses-client', programId: 'DIFFERENT-PROGRAM', isClientPlan: true }
      }

      const origOpen = window.openTemplate
      window.openTemplate = async (id, ctx) => { window._templateCtx = { ...ctx }; return }

      await _afterTemplateExerciseSave(tmpl.id)

      window._checkClientPlanPropagation = origPropagate
      window.openTemplate = origOpen
      return { skipped: false, capturedProgramId: capturedCtx?.programId }
    })

    if (res.skipped) test.skip(true, 'no standalone template available on this account to test against')
    expect(res.capturedProgramId).toBe('SNAPSHOT-PROGRAM-ID')
  })
})

test.describe('C2 — mid-rest Add/Swap exercise does not orphan the rest timer', () => {
  test('adding an exercise while resting elsewhere preserves the rest and drops the stale overlay', async ({ page }) => {
    await loginAsPT(page)
    const res = await page.evaluate(() => {
      const exA = { name: 'A (cardio)', type: 'cardio', metricType: 'cardio', loggedSets: [], targetSets: 1,
        sets_json: [{ duration: '0:30' }], restSecs: 90 }
      _runner = { exercises: [exA], exIdx: 0, startTime: Date.now() }
      const el = document.createElement('div'); el.id = 'workout-runner'; document.body.appendChild(el)
      startRestTimer(90) // wizard mode (cardio) — mounts the floating #rest-timer-overlay
      const overlayExistedBefore = !!document.getElementById('rest-timer-overlay')
      const restIntervalBefore = _runner._restInterval

      // Simulate "+ Add exercise" confirm's add-mode tail without the modal plumbing.
      const newEx = { name: 'B (new)', type: 'strength', metricType: 'weight_reps', loggedSets: [], targetSets: 3,
        sets_json: [{}], restSecs: 90 }
      _runner.exercises.push(newEx)
      _runner.exIdx = _runner.exercises.length - 1
      if (_runner.restRemaining != null) document.getElementById('rest-timer-overlay')?.remove()
      renderRunner()

      const overlayGoneAfter = !document.getElementById('rest-timer-overlay')
      const restStillActive = _runner._restInterval === restIntervalBefore && _runner.restRemaining != null
      const restStillForA = _runner._restForExIdx === 0

      clearTimer(_runner._restInterval)
      document.getElementById('workout-runner')?.remove()
      _runner = null
      return { overlayExistedBefore, overlayGoneAfter, restStillActive, restStillForA }
    })
    expect(res.overlayExistedBefore).toBe(true)
    expect(res.overlayGoneAfter).toBe(true)
    expect(res.restStillActive).toBe(true)
    expect(res.restStillForA).toBe(true)
  })

  test('skipRestTimer no-ops (does not fire _afterRest) if somehow called for a non-owning exercise', async ({ page }) => {
    await loginAsPT(page)
    const res = await page.evaluate(() => {
      let fired = false
      const exA = { name: 'A', type: 'strength', metricType: 'weight_reps', loggedSets: [], targetSets: 1, sets_json: [{}] }
      const exB = { name: 'B', type: 'strength', metricType: 'weight_reps', loggedSets: [], targetSets: 1, sets_json: [{}] }
      _runner = { exercises: [exA, exB], exIdx: 1, restRemaining: 45, restTotal: 90, _restInterval: 12345, _restForExIdx: 0, _afterRest: () => { fired = true } }
      skipRestTimer() // called as if from a stale overlay while viewing B, but the rest belongs to A
      const stillIntact = _runner.restRemaining === 45 && _runner._restInterval === 12345 && _runner._restForExIdx === 0
      const notFired = !fired
      _runner = null
      return { stillIntact, notFired }
    })
    expect(res.stillIntact).toBe(true)
    expect(res.notFired).toBe(true)
  })
})

test.describe('A1 — 0 weight is a real value, not treated as missing', () => {
  test('toggleTableSet accepts a typed 0, blocks a genuinely blank row', async ({ page }) => {
    await loginAsPT(page)
    const res = await page.evaluate(() => {
      const mkEx = () => ({ name: 'Test Squat', type: 'strength', metricType: 'weight_reps', loggedSets: [],
        sets_json: [{}], targetSets: 1, tableRows: [{ weight: 0, reps: '5', done: false }] })
      // Case 1: weight = 0 (typed), reps present — must NOT be blocked.
      const exZero = mkEx()
      _runner = { exercises: [exZero], exIdx: 0 }
      let toasted = false
      const origToast = window.showToast
      window.showToast = () => { toasted = true }
      toggleTableSet(0)
      const zeroBlocked = toasted
      const zeroDone = exZero.tableRows[0].done
      const zeroLoggedWeight = exZero.loggedSets[0]?.weight

      // Case 2: weight = '' (never touched), reps present — MUST still be blocked.
      toasted = false
      const exBlank = mkEx()
      exBlank.tableRows[0].weight = ''
      _runner = { exercises: [exBlank], exIdx: 0 }
      toggleTableSet(0)
      const blankBlocked = toasted
      const blankDone = exBlank.tableRows[0].done

      window.showToast = origToast
      _runner = null
      return { zeroBlocked, zeroDone, zeroLoggedWeight, blankBlocked, blankDone }
    })
    expect(res.zeroBlocked).toBe(false)
    expect(res.zeroDone).toBe(true)
    expect(res.zeroLoggedWeight).toBe(0) // not null — the whole point of the fix
    expect(res.blankBlocked).toBe(true)
    expect(res.blankDone).toBe(false)
  })

  test('_syncLoggedSetsFromTable preserves a real 0, still nulls blank/cleared', async ({ page }) => {
    await loginAsPT(page)
    const res = await page.evaluate(() => {
      const ex = { metricType: 'weight_reps', tableRows: [
        { weight: 0, reps: '5', done: true },
        { weight: null, reps: '5', done: true }, // cleared after typing
        { weight: '', reps: '5', done: true },   // never touched
      ] }
      _syncLoggedSetsFromTable(ex)
      return ex.loggedSets.map(s => s.weight)
    })
    expect(res).toEqual([0, null, null])
  })
})

test.describe('A2 — jump exercise last-session data', () => {
  test('renderStrengthTable ghosts last-session height/distance when no target is prescribed', async ({ page }) => {
    await loginAsPT(page)
    const html = await page.evaluate(() => {
      const ex = {
        name: 'Depth Jump', type: 'strength', metricType: 'jump_height', loggedSets: [],
        sets_json: [{}], targetSets: 1, tableRows: [{ height_cm: '', reps: '', done: false }],
      }
      _runner = {
        exercises: [ex], exIdx: 0,
        lastSession: { 'Depth Jump': { date: '2026-07-01', sets: [{ set_number: 1, height_cm: 42, distance_m: null, weight_kg: null, reps_achieved: 3 }] } },
      }
      const out = renderStrengthTable(ex)
      _runner = null
      return out
    })
    // 42cm is the last-session height; must appear as a ghost placeholder somewhere in the row.
    expect(html).toContain('42')
  })
})

test.describe('A3 — add/edit/delete template exercise re-renders even if propagation fails', () => {
  test('_afterTemplateExerciseSave re-renders immediately and toasts on a propagation failure', async ({ page }) => {
    await loginAsPT(page)
    await clickVisible(page, '[data-page="workouts"]')
    await page.waitForSelector('.list-row', { timeout: 15000 })

    const res = await page.evaluate(async () => {
      // Grab any real standalone template id this coach owns.
      const { data: tmpl } = await db.from('workout_templates').select('id')
        .is('client_id', null).is('program_id', null).is('generated_from_phase_id', null).limit(1).single()
      if (!tmpl) return { skipped: true }

      let toastMsg = null
      const origToast = window.showToast
      window.showToast = (msg) => { toastMsg = msg }
      const origPropagate = window._checkClientPlanPropagation
      window._checkClientPlanPropagation = async () => { throw new Error('simulated propagation failure') }

      window._templateCtx = { clientId: null, programId: null }
      let renderedId = null
      const origOpen = window.openTemplate
      window.openTemplate = async (id, ctx) => { renderedId = id; return origOpen(id, ctx) }

      await _afterTemplateExerciseSave(tmpl.id)

      window.showToast = origToast
      window._checkClientPlanPropagation = origPropagate
      window.openTemplate = origOpen
      return { skipped: false, renderedId, tmplId: tmpl.id, toastMsg }
    })

    if (res.skipped) test.skip(true, 'no standalone template available on this account to test against')
    expect(res.renderedId).toBe(res.tmplId) // re-rendered regardless of the propagation failure
    expect(res.toastMsg).toContain('failed') // failure surfaced, not swallowed silently
  })
})

test.describe('A4 — "Bodyweight" removed as an exercise Category', () => {
  test('add-exercise modal category dropdown has no Bodyweight option', async ({ page }) => {
    await loginAsPT(page)
    await clickVisible(page, '[data-page="workouts"]')
    await page.waitForSelector('.list-row', { timeout: 15000 })
    await page.evaluate(() => showAddExerciseModal())
    const options = await page.locator('#ae-category option').allTextContents()
    expect(options).not.toContain('Bodyweight')
    expect(options).toEqual(expect.arrayContaining(['Compound', 'Isolation', 'Cardio', 'Stretching']))
  })

  test('starter-content seed list no longer uses category: Bodyweight', async ({ page }) => {
    await loginAsPT(page)
    const categories = await page.evaluate(() => STARTER_EXERCISES.map(e => e.category))
    expect(categories).not.toContain('Bodyweight')
  })
})

test.describe('A5 — rest timer survives navigating to another exercise', () => {
  test('table mode: navigating away keeps the rest ticking and does not block the other exercise', async ({ page }) => {
    await loginAsPT(page)
    const res = await page.evaluate(() => {
      const exA = { name: 'A', type: 'strength', metricType: 'weight_reps', loggedSets: [], targetSets: 3,
        sets_json: [{}], tableRows: [{ weight: '100', reps: '5', done: false }], restSecs: 90 }
      const exB = { name: 'B', type: 'strength', metricType: 'weight_reps', loggedSets: [], targetSets: 3,
        sets_json: [{}], tableRows: [{ weight: '50', reps: '10', done: false }], restSecs: 90 }
      _runner = { exercises: [exA, exB], exIdx: 0, startTime: Date.now() }

      startRestTimer(90)
      const restIntervalBeforeJump = _runner._restInterval
      runnerJumpTo(1) // look at exercise B while A is resting

      const stillTicking = _runner._restInterval === restIntervalBeforeJump && _runner.restRemaining != null
      const restForExIdx = _runner._restForExIdx
      const exIdxAfterJump = _runner.exIdx

      // B's own LOG must not be blocked by A's rest.
      document.getElementById('workout-runner')?.remove() // avoid leaking a real overlay into later assertions
      const el = document.createElement('div'); el.id = 'workout-runner'; document.body.appendChild(el)
      renderRunner()
      exB.tableRows[0].done = false // ensure toggle path is exercised, not pre-done
      toggleTableSet(0) // exercise B, set 0 — should NOT be blocked by A's rest
      const bWasLogged = exB.tableRows[0].done

      clearTimer(_runner._restInterval)
      document.getElementById('workout-runner')?.remove()
      document.getElementById('rest-timer-overlay')?.remove()
      _runner = null
      return { stillTicking, restForExIdx, exIdxAfterJump, bWasLogged }
    })
    expect(res.stillTicking).toBe(true)
    expect(res.restForExIdx).toBe(0)
    expect(res.exIdxAfterJump).toBe(1)
    expect(res.bWasLogged).toBe(true)
  })

  test('returning to the resting exercise mid-countdown does not tear anything down', async ({ page }) => {
    await loginAsPT(page)
    const res = await page.evaluate(() => {
      const exA = { name: 'A', type: 'strength', metricType: 'weight_reps', loggedSets: [], targetSets: 3,
        sets_json: [{}], tableRows: [{ weight: '100', reps: '5', done: false }], restSecs: 90 }
      const exB = { name: 'B', type: 'strength', metricType: 'weight_reps', loggedSets: [], targetSets: 3,
        sets_json: [{}], tableRows: [{ weight: '50', reps: '10', done: false }], restSecs: 90 }
      _runner = { exercises: [exA, exB], exIdx: 0, startTime: Date.now() }

      startRestTimer(90)
      runnerJumpTo(1)
      runnerJumpTo(0) // back to A, still counting down
      const backOnA = _runner.exIdx === 0
      const stillRestingForA = _runner._restForExIdx === 0 && _runner.restRemaining != null
      const notPending = _runner._restPendingFire === false

      clearTimer(_runner._restInterval)
      document.getElementById('workout-runner')?.remove()
      document.getElementById('rest-timer-overlay')?.remove()
      _runner = null
      return { backOnA, stillRestingForA, notPending }
    })
    expect(res.backOnA).toBe(true)
    expect(res.stillRestingForA).toBe(true)
    expect(res.notPending).toBe(true)
  })

  test('runnerGoBack inherits the same nav-persistent rest behaviour', async ({ page }) => {
    await loginAsPT(page)
    const res = await page.evaluate(() => {
      const exA = { name: 'A', type: 'strength', metricType: 'weight_reps', loggedSets: [], targetSets: 3,
        sets_json: [{}], tableRows: [{ weight: '100', reps: '5', done: false }], restSecs: 90 }
      const exB = { name: 'B', type: 'strength', metricType: 'weight_reps', loggedSets: [], targetSets: 3,
        sets_json: [{}], tableRows: [{ weight: '50', reps: '10', done: false }], restSecs: 90 }
      _runner = { exercises: [exA, exB], exIdx: 0, startTime: Date.now() }
      startRestTimer(90)
      const restIntervalBeforeJump = _runner._restInterval // captured BEFORE any navigation
      runnerJumpTo(1)
      const stillTickingAfterJump = _runner._restInterval === restIntervalBeforeJump && _runner.restRemaining != null
      runnerGoBack()
      const backOnA = _runner.exIdx === 0
      const stillTickingAfterBack = _runner._restInterval === restIntervalBeforeJump && _runner.restRemaining != null

      clearTimer(_runner._restInterval)
      document.getElementById('workout-runner')?.remove()
      document.getElementById('rest-timer-overlay')?.remove()
      _runner = null
      return { backOnA, stillTickingAfterJump, stillTickingAfterBack }
    })
    expect(res.stillTickingAfterJump).toBe(true)
    expect(res.backOnA).toBe(true)
    expect(res.stillTickingAfterBack).toBe(true)
  })
})
