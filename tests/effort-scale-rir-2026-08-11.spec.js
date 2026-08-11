// 2026-08-11 — a logged RIR was displayed as RPE, which INVERTS its meaning.
//
// Effort is stored with its scale: workout_log_sets carries both `effort_type` ('rpe' | 'rir') and
// `effort_value`. The manual Log Session modal writes that pair correctly — `block.effortMode ===
// 'RIR' ? 'rir' : 'rpe'`. But the session-detail screen (openWorkoutLog) ignored effort_type entirely
// and hardcoded the word: a "RPE" column header and `'RPE ' + s.effort_value` in every cell.
//
// This is not a cosmetic mislabel. The two scales run in OPPOSITE directions:
//   RIR 2 = two reps left in reserve  → near-maximal, very hard
//   RPE 2 = 2 out of 10               → a warmup
// So a set logged as "RIR 2" — brutal — was shown back to the coach as "RPE 2" — trivial. Any coach
// reading session history to decide next week's load would have been reading the effort backwards.
//
// Fixed by deriving the label from the data. Three cases, all pinned below:
//   * all sets RIR  → column reads "RIR"
//   * all sets RPE  → column reads "RPE" (also the fallback for legacy rows with a null effort_type,
//                     which were written by the RPE-only path)
//   * mixed         → column reads "Effort" and each cell carries its own scale, because showing one
//                     label over both would be the same inversion again
//
// Fixtures are created and torn down by this file — it never reads a pre-existing session.
const { test, expect } = require('@playwright/test')
const { loginAsPT } = require('./helpers')

const TAG = '[E2E] EffortScale'

async function sweep (page) {
  await page.evaluate(async (TAG) => {
    const { data: logs } = await db.from('workout_logs').select('id').like('name', TAG + '%')
    const ids = (logs || []).map(l => l.id)
    if (!ids.length) return
    const { data: exs } = await db.from('workout_log_exercises').select('id').in('log_id', ids)
    const exIds = (exs || []).map(e => e.id)
    if (exIds.length) await db.from('workout_log_sets').delete().in('workout_log_exercise_id', exIds)
    await db.from('workout_log_exercises').delete().in('log_id', ids)
    await db.from('workout_logs').delete().in('id', ids)
  }, TAG)
}

// Builds a one-exercise session whose sets carry the given (effort_type, effort_value) pairs, renders
// the session-detail screen, and hands back the table markup.
async function renderSessionWith (page, label, efforts) {
  return page.evaluate(async ({ TAG, label, efforts }) => {
    const { data: client } = await db.from('clients').select('id').eq('coach_id', currentUser.id).limit(1)
    const clientId = client?.[0]?.id
    if (!clientId) return { skip: 'no coached client' }

    const { data: logRow, error: logErr } = await db.from('workout_logs').insert({
      coach_id: currentUser.id, client_id: clientId,
      name: TAG + ' ' + label, date: new Date().toISOString().slice(0, 10)
    }).select().single()
    if (logErr) return { err: 'log: ' + logErr.message }

    const { data: exRow, error: exErr } = await db.from('workout_log_exercises').insert({
      log_id: logRow.id, exercise_name: TAG + ' Squat',
      exercise_type: 'strength', order_index: 0
    }).select().single()
    if (exErr) return { err: 'exercise: ' + exErr.message }

    const { error: setErr } = await db.from('workout_log_sets').insert(
      efforts.map((e, i) => ({
        workout_log_exercise_id: exRow.id, set_number: i + 1,
        reps_achieved: 5, weight_kg: 100,
        effort_type: e.type, effort_value: e.value
      }))
    )
    if (setErr) return { err: 'sets: ' + setErr.message }

    await openWorkoutLog(logRow.id, clientId)
    const el = document.getElementById('tab-content') || document.getElementById('main-content')
    return { html: el.innerHTML }
  }, { TAG, label, efforts })
}

// Pulls the effort column's header text and its cell values out of the rendered table.
function readColumn (html) {
  const headers = [...html.matchAll(/<th[^>]*>([^<]*)<\/th>/g)].map(m => m[1].trim())
  return { headers, hasRir: /RIR/.test(html), hasRpe: /RPE/.test(html), hasEffort: headers.includes('Effort') }
}

test.describe('effort scale is displayed as logged (2026-08-11)', () => {
  test.beforeEach(async ({ page }) => { await loginAsPT(page); await sweep(page) })
  test.afterEach(async ({ page }) => { await sweep(page) })

  test('a set logged as RIR is shown as RIR, never as RPE', async ({ page }) => {
    const res = await renderSessionWith(page, 'rir', [{ type: 'rir', value: 2 }, { type: 'rir', value: 1 }])
    test.skip(!!res.skip, res.skip)
    expect(res.err, 'fixture setup failed').toBeFalsy()

    const col = readColumn(res.html)
    console.log('headers:', col.headers.join(' | '))

    // The regression: this column said "RPE" and the cells said "RPE 2" / "RPE 1".
    expect(col.headers).toContain('RIR')
    expect(col.hasRpe, 'a session with only RIR sets must not say RPE anywhere').toBe(false)
  })

  test('a set logged as RPE still reads RPE — the fix must not flip the common case', async ({ page }) => {
    const res = await renderSessionWith(page, 'rpe', [{ type: 'rpe', value: 8 }])
    test.skip(!!res.skip, res.skip)
    expect(res.err, 'fixture setup failed').toBeFalsy()

    const col = readColumn(res.html)
    expect(col.headers).toContain('RPE')
    expect(col.hasRir).toBe(false)
  })

  test('a legacy set with no effort_type falls back to RPE, not to a blank or ambiguous label', async ({ page }) => {
    // Rows predating effort_type read back null. They were all written by the RPE-only path, so RPE is
    // the correct — and the only honest — fallback.
    const res = await renderSessionWith(page, 'legacy', [{ type: null, value: 7 }])
    test.skip(!!res.skip, res.skip)
    expect(res.err, 'fixture setup failed').toBeFalsy()

    const col = readColumn(res.html)
    expect(col.headers).toContain('RPE')
    expect(col.hasRir).toBe(false)
  })

  test('an exercise mixing both scales labels the column Effort and tags every cell', async ({ page }) => {
    const res = await renderSessionWith(page, 'mixed', [{ type: 'rir', value: 2 }, { type: 'rpe', value: 8 }])
    test.skip(!!res.skip, res.skip)
    expect(res.err, 'fixture setup failed').toBeFalsy()

    const col = readColumn(res.html)
    console.log('mixed headers:', col.headers.join(' | '))

    expect(col.hasEffort, 'a mixed column must not claim to be one scale').toBe(true)
    // Neither value may be shown bare — each has to carry the scale it was logged on.
    expect(res.html).toContain('RIR 2')
    expect(res.html).toContain('RPE 8')
  })
})
