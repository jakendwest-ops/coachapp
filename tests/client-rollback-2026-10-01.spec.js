// A CLIENT's failed-save rollback actually removes what the failed save wrote (2026-10-01).
//
// js/app-runner.js (saveRunnerSession / saveWorkoutSession) undoes a half-written session with plain delete() calls. Until the
// scripts/add-client-empty-session-delete-2026-10-01.sql grant, a client had no DELETE policy on workout_logs or workout_log_exercises, so
// the undo was refused WITHOUT an error and the session stayed (found by reading Jake's pg_policies, then proved by a probe: the rollback
// returned no error and deleted nothing). This runs the app's exact rollback sequence as the E2E client, on a session the client just made.
//
// RED until the script is applied to the live project; committed only AFTER it is (a red-by-design spec blocks the release gate).
// POSITIVE CONTROLS: a session that HAS a set must NOT be deletable by the client (the grant is narrow), and the coach's cleanup must work.
const { test, expect } = require('./fixtures')
const { loginAsPT, loginAsClient } = require('./helpers')

const pending = { tag: null }

test.afterEach(async ({ browser }) => {
  if (!pending.tag) return
  const tag = pending.tag; pending.tag = null
  const ctx = await browser.newContext()
  try {
    const pt = await ctx.newPage(); await loginAsPT(pt)
    const c = await pt.evaluate(async (tag) => {
      const { data: logs } = await db.from('workout_logs').select('id').ilike('name', tag + '%')
      const ids = (logs || []).map(l => l.id)
      if (!ids.length) return { found: 0, sets: 0, exercises: 0, logs: 0 }
      const { data: exs } = await db.from('workout_log_exercises').select('id').in('log_id', ids)
      const exIds = (exs || []).map(e => e.id)
      const sets = exIds.length ? ((await db.from('workout_log_sets').delete().in('workout_log_exercise_id', exIds).select('id')).data || []).length : 0
      const exercises = ((await db.from('workout_log_exercises').delete().in('log_id', ids).select('id')).data || []).length
      const lg = ((await db.from('workout_logs').delete().in('id', ids).select('id')).data || []).length
      return { found: ids.length, sets, exercises, logs: lg }
    }, tag)
    console.log(`[client-rollback] cleanup ${tag}: ${JSON.stringify(c)}`)
  } catch (err) {
    console.warn(`[client-rollback] CLEANUP FAILED for ${tag} — rows may remain in the test account:`, err.message)
  } finally {
    try { await ctx.close() } catch (err) { console.warn('[client-rollback] could not close the cleanup context:', err.message) }
  }
})

test("a client's rollback removes a failed save's session and exercise rows, but never a session that has a set", async ({ browser }) => {
  const tag = `[E2E] ClientRollback ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  pending.tag = tag
  const ctx = await browser.newContext()
  try {
    const cl = await ctx.newPage(); await loginAsClient(cl)
    const r = await cl.evaluate(async (tag) => {
      const out = {}
      const { data: me } = await db.from('clients').select('id, coach_id').eq('user_id', currentUser.id).not('coach_id', 'is', null).maybeSingle()
      if (!me) return { skip: true }
      const today = new Date().toISOString().split('T')[0]
      const mkLog = async (name) => (await db.from('workout_logs').insert({ coach_id: me.coach_id, client_id: me.id, name: tag + ' ' + name, date: today }).select('id').single()).data.id
      const mkEx = async (logId) => (await db.from('workout_log_exercises').insert([{ log_id: logId, exercise_name: tag + ' Ex', exercise_type: 'strength', metric_type: 'weight_reps', order_index: 0 }]).select('id')).data[0].id

      // 1. THE FAILED SAVE: the log and its exercises exist, the sets batch "failed" (none written). The app's rollback, verbatim:
      const failedLog = await mkLog('failed save'); const failedEx = await mkEx(failedLog)
      const d1 = await db.from('workout_log_exercises').delete().in('id', [failedEx]).select('id')
      const d2 = await db.from('workout_logs').delete().eq('id', failedLog).select('id')
      out.failedRollback = { exercisesDeleted: (d1.data || []).length, logDeleted: (d2.data || []).length, errors: [d1.error?.message || null, d2.error?.message || null] }
      out.failedStillThere = {
        ex: (await db.from('workout_log_exercises').select('id').eq('id', failedEx)).data?.length || 0,
        log: (await db.from('workout_logs').select('id').eq('id', failedLog)).data?.length || 0 }

      // 2. POSITIVE CONTROL for the grant's limit: a FINISHED session (it has a set) must survive the very same calls
      const doneLog = await mkLog('finished'); const doneEx = await mkEx(doneLog)
      const ins = await db.from('workout_log_sets').insert([{ workout_log_exercise_id: doneEx, set_number: 1, weight_kg: 100, reps_achieved: 5 }]).select('id')
      out.setInsertError = ins.error?.message || null
      const e1 = await db.from('workout_log_exercises').delete().in('id', [doneEx]).select('id')
      const e2 = await db.from('workout_logs').delete().eq('id', doneLog).select('id')
      out.finishedAttempt = { exercisesDeleted: (e1.data || []).length, logDeleted: (e2.data || []).length }
      out.finishedStillThere = {
        ex: (await db.from('workout_log_exercises').select('id').eq('id', doneEx)).data?.length || 0,
        log: (await db.from('workout_logs').select('id').eq('id', doneLog)).data?.length || 0,
        sets: (await db.from('workout_log_sets').select('id').eq('workout_log_exercise_id', doneEx)).data?.length || 0 }
      return out
    }, tag)
    test.skip(r.skip, 'the E2E client has no coach on this deployment — nothing to roll back against')

    expect(r.failedRollback.errors, 'the rollback must not error').toEqual([null, null])
    expect(r.failedRollback.exercisesDeleted, "a client's rollback must delete the exercise rows of a failed save").toBe(1)
    expect(r.failedRollback.logDeleted, "…and the session row").toBe(1)
    expect(r.failedStillThere, 'nothing of the failed save may be left behind').toEqual({ ex: 0, log: 0 })

    expect(r.setInsertError, 'the control session must really have a set').toBeNull()
    expect(r.finishedAttempt, 'a client must NOT be able to delete a session that has a set — the grant is only for empty ones').toEqual({ exercisesDeleted: 0, logDeleted: 0 })
    expect(r.finishedStillThere, 'the finished session, its exercise and its set are all still there').toEqual({ ex: 1, log: 1, sets: 1 })
  } finally {
    try { await ctx.close() } catch (err) { console.warn('[client-rollback] could not close a context:', err.message) }
  }
})
