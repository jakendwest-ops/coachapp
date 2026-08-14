// Jake drove the live app on 2026-08-14 and sent 8 screenshots with 5 numbered items. This file
// pins the two of them that had no existing coverage anywhere:
//
//   * "The calendar for personal only shows the exercise name and does not show the same data for the
//     same workout that is present on the 'workouts' page."
//   * "AMRAP ... as pills that the user can toggle on/off for each exercise" — the runner half of it.
//
// The builder half of AMRAP and the Unilateral pill live in ledger-fixes-2026-08-02.spec.js, beside
// the removal assertions they reverse, so the reversal is visible next to the decision it undid.
const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

test.describe('Calendar day modal shows the full prescription, like the Workouts page', () => {
  // showClientDayDetail was the ONLY prescription-rendering surface in the app that never called
  // _fmtSetsCollapsed — app-workouts.js:198-199 already listed it as a gap. Everything it needed was
  // present: sets_json is in the calendar's own embed (app-calendar-goals.js:27) and the helper is
  // reachable cross-file at click time (it already called _prescribedSetCount from the same module).
  test('renders reps/load/effort/rest, not just a name and a set count', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      window._calClientId = 'test-client'
      window._calProgramWorkouts = {
        '2026-08-17': [{
          id: 'pw-1',
          workout_templates: {
            id: 'tmpl-1',
            name: 'Upper STR A',
            workout_template_exercises: [{
              exercise_name: 'Seated Jump',
              exercise_type: 'strength', metric_type: 'weight_reps', order_index: 0,
              sets_json: [
                { effortType: 'rpe', repsMin: '3', weight: '60', effortMin: '5', restMin: '1:30', tempo: 'X' },
                { effortType: 'rpe', repsMin: '3', weight: '60', effortMin: '5', restMin: '1:30', tempo: 'X' },
                { effortType: 'rpe', repsMin: '3', weight: '60', effortMin: '5', restMin: '1:30', tempo: 'X' },
              ]
            }]
          }
        }]
      }
      showClientDayDetail('2026-08-17')
      const text = document.getElementById('client-day-modal')?.innerText || ''
      document.getElementById('client-day-modal')?.remove()
      return { text }
    })
    // The set count was all this modal ever showed. It must survive…
    expect(r.text).toContain('3 sets')
    // …and now carry the actual prescription beside it.
    expect(r.text).toContain('3 reps')
    expect(r.text).toContain('60kg')
    expect(r.text).toContain('RPE 5')
    expect(r.text).toContain('1:30 rest')
  })

  // The modal renders the MASTER template's exercises but its ▶ Start button launches the client's
  // own clone (_clientTemplateId). While it showed only names and set counts that divergence was
  // nearly invisible; showing full prescriptions would have printed numbers the runner never uses.
  // So the clone became the source, with the master as fallback.
  test('prefers the client clone over the master, since that is what Start actually runs', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      window._calClientId = 'test-client'
      const masterEx = {
        exercise_name: 'Back Squat', exercise_type: 'strength', metric_type: 'weight_reps',
        order_index: 0, sets_json: [{ effortType: 'rpe', repsMin: '5', weight: '100' }]
      }
      const cloneEx = {
        exercise_name: 'Back Squat', exercise_type: 'strength', metric_type: 'weight_reps',
        order_index: 0, sets_json: [{ effortType: 'rpe', repsMin: '5', weight: '140' }]
      }
      const base = { id: 'pw-1', workout_templates: { id: 'master-1', name: 'Legs', workout_template_exercises: [masterEx] } }

      window._calProgramWorkouts = { '2026-08-18': [{ ...base, _clientTemplateId: 'clone-1', _clientExercises: [cloneEx] }] }
      showClientDayDetail('2026-08-18')
      const withClone = document.getElementById('client-day-modal')?.innerText || ''
      document.getElementById('client-day-modal')?.remove()

      // No clone row (an assignment made before cloning, or an empty fetch) must still render.
      window._calProgramWorkouts = { '2026-08-18': [{ ...base, _clientTemplateId: null, _clientExercises: null }] }
      showClientDayDetail('2026-08-18')
      const withoutClone = document.getElementById('client-day-modal')?.innerText || ''
      document.getElementById('client-day-modal')?.remove()

      return { withClone, withoutClone }
    })
    expect(r.withClone, "the clone's load is the one the athlete will actually lift").toContain('140kg')
    expect(r.withClone).not.toContain('100kg')
    expect(r.withoutClone, 'falls back to the master rather than rendering nothing').toContain('100kg')
  })

  // _fmtSetDetail concatenates RAW sets_json values and is explicitly not html-safe (its own header,
  // app-workouts.js:216). On a client PLAN CLONE those rows belong to the client, so an unescaped
  // sink here is the client→coach stored-XSS shape this codebase has shipped three times. The sibling
  // test in day-row-prescriptions.spec.js covers the NAME fields; this covers the new presc string.
  test('escapes the prescription string, which is not html-safe by design', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      window._calClientId = 'test-client'
      window._calProgramWorkouts = {
        '2026-08-19': [{
          id: 'pw-1',
          workout_templates: {
            id: 'tmpl-1', name: 'Session',
            workout_template_exercises: [{
              exercise_name: 'Bench', exercise_type: 'strength', metric_type: 'weight_reps', order_index: 0,
              // tempo is free text and rides into the prescription string verbatim
              sets_json: [{ effortType: 'rpe', repsMin: '8', tempo: '<img src=x id="presc-xss" onerror="window.__prescXss=true">' }]
            }]
          }
        }]
      }
      window.__prescXss = false
      showClientDayDetail('2026-08-19')
      const out = {
        markerCreated: !!document.getElementById('presc-xss'),
        fired: window.__prescXss === true,
        // the payload must still be VISIBLE, as inert text — escaping it away entirely would hide
        // a real coaching cue from the athlete
        rendersAsText: (document.getElementById('client-day-modal')?.innerText || '').includes('<img'),
      }
      document.getElementById('client-day-modal')?.remove()
      return out
    })
    expect(r.markerCreated, 'an escaped payload must never materialise as a real element').toBe(false)
    expect(r.fired).toBe(false)
    expect(r.rendersAsText).toBe(true)
  })
})

test.describe('1RM grid is the only state, not just the empty one', () => {
  // The layout Jake preferred was the EMPTY state. Populated, the same function rendered a totally
  // different card-per-exercise view, so on his own account he could never see the grid again. This
  // asserts the grid survives having data in it -- which is the entire report.
  test('renders the grid with values inline once 1RMs exist', async ({ page }) => {
    await loginAsPT(page)
    let clientId = null
    try {
      // Owns its fixture: a dedicated client row, never `_getCurrentClientId()`. A coach account has
      // no client record of its own, and borrowing shared data is the pattern that produced real
      // flakiness in this suite before (see the ownWorkout fixture, 2026-08-11).
      const r = await page.evaluate(async () => {
        const { data: c } = await db.from('clients')
          .insert({ coach_id: currentUser.id, full_name: '[E2E] 1RM grid client' }).select('id').single()
        const { error: iErr } = await db.from('client_1rms').insert({
          client_id: c.id, exercise_name: '[E2E] Grid Lift', one_rm_kg: 100,
          recorded_at: new Date().toISOString().split('T')[0]
        })
        if (iErr) throw new Error('1rm insert: ' + iErr.message)
        const host = document.createElement('div'); host.id = 'orm-test-host'; document.body.appendChild(host)
        await renderClient1RMs(c.id, host)
        const rows = window._oneRMGridRows || []
        const out = {
          clientId: c.id,
          // A recorded lift and an un-recorded Big 5 lift must BOTH be rows in the same grid.
          rowCount: rows.length,
          hasRecorded: rows.some(x => x.name === '[E2E] Grid Lift'),
          hasBig5: rows.some(x => x.name === 'Back Squat'),
          hasUpdateButton: /\+ Update</.test(host.innerHTML),   // the card layout is gone
          hasSaveAll: /Save all</.test(host.innerHTML),
          recordedValue: document.getElementById(`orm-${rows.findIndex(x => x.name === '[E2E] Grid Lift')}`)?.value,
        }
        host.remove()
        return out
      })
      clientId = r.clientId
      expect(r.hasRecorded, 'the recorded lift is a row, not a card').toBe(true)
      expect(r.hasBig5, 'un-recorded Big 5 lifts stay in the same grid, not a separate empty state').toBe(true)
      expect(r.rowCount).toBeGreaterThan(1)
      expect(r.hasUpdateButton, 'the card layout with its +Update button is gone').toBe(false)
      expect(r.hasSaveAll).toBe(true)
      expect(r.recordedValue, 'the stored value is prefilled, editable in place').toBe('100')
    } finally {
      if (clientId) await page.evaluate(async id => {
        await db.from('client_1rms').delete().eq('client_id', id)
        await db.from('clients').delete().eq('id', id)
      }, clientId)
    }
  })

  // client_1rms is APPEND-ONLY -- the newest row per exercise wins and "+ Update" always inserted.
  // So a Save-all that wrote every row would stamp a duplicate against today for every lift the user
  // never touched, burying the real history. Only genuine edits may be written.
  test('Save all writes ONLY changed rows, never every row', async ({ page }) => {
    await loginAsPT(page)
    let clientId = null
    try {
      const r = await page.evaluate(async () => {
        const today = new Date().toISOString().split('T')[0]
        const names = ['[E2E] Untouched', '[E2E] Edited']
        const { data: c } = await db.from('clients')
          .insert({ coach_id: currentUser.id, full_name: '[E2E] 1RM save client' }).select('id').single()
        const { error: iErr } = await db.from('client_1rms').insert([
          { client_id: c.id, exercise_name: names[0], one_rm_kg: 100, recorded_at: today },
          { client_id: c.id, exercise_name: names[1], one_rm_kg: 100, recorded_at: today },
        ])
        if (iErr) throw new Error('1rm insert: ' + iErr.message)
        // Mounted as #pb-1rms-section, the real container id, so saveOneRMGrid's own post-write
        // refresh (_refresh1RMs) resolves here and is genuinely exercised rather than short-circuited.
        const host = document.createElement('div'); host.id = 'pb-1rms-section'; document.body.appendChild(host)
        await renderClient1RMs(c.id, host)

        const idxOf = n => (window._oneRMGridRows || []).findIndex(x => x.name === n)
        // Touch exactly one input; leave every other row -- including the blank Big 5 rows -- alone.
        document.getElementById(`orm-${idxOf(names[1])}`).value = '110'
        await saveOneRMGrid(c.id)

        const { data } = await db.from('client_1rms').select('exercise_name, one_rm_kg')
          .eq('client_id', c.id).in('exercise_name', names)
        // A blank Big 5 row must not be written either -- that would invent a 1RM the user never set.
        const { data: big5 } = await db.from('client_1rms').select('id')
          .eq('client_id', c.id).eq('exercise_name', 'Back Squat')
        host.remove()
        return {
          clientId: c.id,
          untouched: data.filter(d => d.exercise_name === names[0]).length,
          edited: data.filter(d => d.exercise_name === names[1]).map(d => Number(d.one_rm_kg)).sort((a, b) => a - b),
          blankBig5Written: (big5 || []).length,
        }
      })
      clientId = r.clientId
      expect(r.untouched, 'an untouched lift must NOT gain a duplicate row dated today').toBe(1)
      expect(r.edited, 'the edited lift appends, preserving the old value as history').toEqual([100, 110])
      expect(r.blankBig5Written, 'a blank row is not an edit — nothing to save').toBe(0)
    } finally {
      if (clientId) await page.evaluate(async id => {
        await db.from('client_1rms').delete().eq('client_id', id)
        await db.from('clients').delete().eq('id', id)
      }, clientId)
    }
  })
})

// Found by the pre-push multi-agent review, not by the suite — because the ENTIRE suite runs at the
// kg default (app-core.js:72) and nothing ever flips the unit. weightToPref returns a NUMBER in kg
// but a STRING in lb, so calling .toFixed() on its return value threw for every lb user with a
// recorded 1RM, taking down the whole Progress page. Pinned here as a unit-matrix test so the next
// weight-rendering surface can't repeat it.
test.describe('1RM grid survives a non-default weight unit', () => {
  for (const unit of ['kg', 'lb']) {
    test(`renders with a recorded 1RM when weight unit is ${unit}`, async ({ page }) => {
      await loginAsPT(page)
      let clientId = null
      try {
        const r = await page.evaluate(async u => {
          const { data: c } = await db.from('clients')
            .insert({ coach_id: currentUser.id, full_name: `[E2E] 1RM ${u} client` }).select('id').single()
          await db.from('client_1rms').insert({
            client_id: c.id, exercise_name: '[E2E] Unit Lift', one_rm_kg: 100,
            recorded_at: new Date().toISOString().split('T')[0]
          })
          const prev = window._unitPrefs.weight
          window._unitPrefs.weight = u
          const host = document.createElement('div'); host.id = 'orm-unit-host'; document.body.appendChild(host)
          let threw = null
          try { await renderClient1RMs(c.id, host) } catch (e) { threw = String(e && e.message || e) }
          const rows = window._oneRMGridRows || []
          const idx = rows.findIndex(x => x.name === '[E2E] Unit Lift')
          const out = {
            clientId: c.id, threw,
            value: document.getElementById(`orm-${idx}`)?.value,
            rendered: /Save all</.test(host.innerHTML),
          }
          window._unitPrefs.weight = prev
          host.remove()
          return out
        }, unit)
        clientId = r.clientId
        expect(r.threw, `renderClient1RMs must not throw in ${unit}`).toBeNull()
        expect(r.rendered, 'the grid renders rather than dying mid-template').toBe(true)
        // 100kg is 100 in kg and ~220.5 in lb — the point is that BOTH are finite numbers, not NaN
        // and not a crash.
        expect(r.value).toBe(unit === 'kg' ? '100' : '220.5')
      } finally {
        if (clientId) await page.evaluate(async id => {
          await db.from('client_1rms').delete().eq('client_id', id)
          await db.from('clients').delete().eq('id', id)
        }, clientId)
      }
    })
  }
})

test.describe('AMRAP reaches the gym, not just the builder', () => {
  // flushTemplateSets deliberately PRESERVES fields the current type doesn't render, so toggling
  // AMRAP on and then switching Type to Jump/Timed leaves a stale amrap:true behind. Ungated it
  // reached three surfaces that then disagreed: the runner said "AMRAP jumps", the detail views
  // relabelled the set "AMRAP:", and the collapsed day row showed nothing. Gated once, at the
  // allowlist, so all three agree — the same "fix the class, not the instance" shape as the
  // tgt.weight/!isJumpMt guard already sitting in _buildTargetCols.
  test('a stale amrap flag is stripped on save for types where it has no meaning', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      const sets = [{ amrap: true, repsMin: '8' }]
      const clean = mt => _cleanTemplateSets(sets, _deriveFromMetricType(mt), mt)[0].amrap
      return {
        weightReps: clean('weight_reps'),
        unilateral: clean('unilateral'),
        jumpHeight: clean('jump_height'),
        jumpDistance: clean('jump_distance'),
        timedHold: clean('timed_hold'),
        interval: clean('interval'),
      }
    })
    expect(r.weightReps, 'kept where the pill is actually offered').toBe(true)
    expect(r.unilateral).toBe(true)
    expect(r.jumpHeight, 'a jump has a height target, not "AMRAP jumps"').toBe(false)
    expect(r.jumpDistance).toBe(false)
    expect(r.timedHold, 'repsMin holds SECONDS on a timed set').toBe(false)
    expect(r.interval).toBe(false)
  })

  // AMRAP was display-only for its entire previous life — it never touched app-runner.js at all. Jake
  // chose "show AMRAP as the target" over an exact revert, so this is the part that is genuinely new
  // rather than restored. _buildTargetCols reads ex.sets_json[curIdx], i.e. THIS set's own entry, so a
  // per-set flag changes the bar as the athlete advances through the exercise.
  test('the target bar shows AMRAP instead of a rep number', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      const ex = { metric_type: 'weight_reps', sets_json: [] }
      const cols = t => _buildTargetCols(t, ex).cols
      const find = (c, label) => c.find(x => x.label === label)
      const plain = cols({ effortType: 'rpe', repsMin: '8', repsMax: '10' })
      const withFloor = cols({ effortType: 'rpe', repsMin: '8', repsMax: '10', amrap: true })
      const noFloor = cols({ effortType: 'rpe', amrap: true, weight: '60' })
      // repsMin holds SECONDS on a timed set, so AMRAP must not hijack it there.
      const timed = cols({ effortType: 'rpe', timed: true, duration: '1:30', repsMin: '90', amrap: true })
      return {
        plainReps: find(plain, 'REPS')?.val,
        plainHasAmrapCol: !!find(plain, 'AMRAP'),
        withFloor: find(withFloor, 'AMRAP')?.val,
        withFloorHasPlainReps: !!find(withFloor, 'REPS'),
        noFloorReps: find(noFloor, 'REPS')?.val,
        noFloorHasAmrapCol: !!find(noFloor, 'AMRAP'),
        timedDuration: find(timed, 'DURATION')?.val,
        timedHasAmrapCol: !!find(timed, 'AMRAP'),
      }
    })
    // Unflagged sets are completely unchanged — this is opt-in.
    expect(r.plainReps).toBe('8–10')
    expect(r.plainHasAmrapCol).toBe(false)
    // A rep target alongside AMRAP is a FLOOR: "at least 8–10, then keep going".
    expect(r.withFloor, 'the floor is kept and marked, not discarded').toBe('8–10+')
    expect(r.withFloorHasPlainReps, 'never both — the bar would read AMRAP twice').toBe(false)
    // With no floor the word has to carry the column itself.
    expect(r.noFloorReps).toBe('AMRAP')
    expect(r.noFloorHasAmrapCol).toBe(false)
    // A timed hold's repsMin is a duration in seconds — "90+" reps would be nonsense.
    expect(r.timedDuration).toBe('1:30')
    expect(r.timedHasAmrapCol).toBe(false)
  })
})
