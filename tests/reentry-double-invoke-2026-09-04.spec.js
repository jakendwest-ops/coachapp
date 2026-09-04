// Double-tapping "Save" must write ONE session, not two.
//
// `saveWorkoutSession` sat on the FROZEN_UNGUARDED list for months under the reason
// "manual-log twin of saveRunnerSession; navigates away on success". Both halves were false: the twin
// disables its button synchronously and this one has no disable at all, and `closeModal` came EIGHT
// awaits later. It has since been guarded — but nothing ever double-invoked it to prove the guard
// works on THIS function, which is what its ledger row asks for.
//
// The generic mechanism test in reentry-guard-2026-08-28.spec.js proves `guardReentry` itself blocks
// re-entry on a synthetic probe. That is a different claim from "the real save path, with its real
// eight awaits and three inserts, produces one session when pressed twice".
//
// Owns its own client fixture rather than borrowing the first one it finds. Borrowing is what left two
// specs silently depending on 242 rows of debris until that debris was reaped on 2026-08-30, and it is
// the standing rule here that a test owns and destroys its own data.

const { test, expect } = require('@playwright/test')
const { loginAsPT } = require('./helpers')

test.describe('A double-pressed save writes one row (2026-09-04)', () => {
  test('two concurrent saveWorkoutSession calls insert exactly ONE workout_logs row', async ({ page }) => {
    await loginAsPT(page)

    const stamp = Date.now()
    const clientName = `[E2E] reentry client ${stamp}`
    const sessionName = `[E2E] reentry session ${stamp}`
    const exerciseName = `[E2E] reentry exercise ${stamp}`

    const r = await page.evaluate(async ({ clientName, sessionName, exerciseName }) => {
      const out = { created: false, logCount: null, cleanup: {} }

      const { data: client } = await db.from('clients')
        .insert({ coach_id: currentUser.id, full_name: clientName }).select('id').single()
      if (!client?.id) return out
      out.created = true

      try {
        await showLogSessionModal(client.id)
        document.getElementById('ls-name').value = sessionName
        window._logBlocks = [{ name: exerciseName, type: 'strength', sets: [{ repsMin: '5', weight: '50' }] }]
        // saveWorkoutSession calls flushLogState() first, which reads the set values back out of the
        // rendered #ls-exercises inputs by id. Without a real render those inputs do not exist and the
        // blocks above are silently overwritten with empty strings.
        renderLogExercises()

        // THE DOUBLE TAP. Both calls are started before either is awaited — a real second press lands
        // while the first is mid-flight, which is the whole hazard. Awaiting the first and then calling
        // again would test something that cannot happen.
        await Promise.all([
          saveWorkoutSession(client.id).catch(e => { out.err1 = String(e && e.message) }),
          saveWorkoutSession(client.id).catch(e => { out.err2 = String(e && e.message) })
        ])

        const { data: logs } = await db.from('workout_logs')
          .select('id').eq('client_id', client.id).eq('name', sessionName)
        out.logCount = (logs || []).length

        // Children first, then parents. Every delete asks what it removed: an RLS-refused delete
        // resolves as { data: [], error: null } and is otherwise indistinguishable from success.
        const { data: exRows } = await db.from('workout_log_exercises')
          .select('id').in('workout_log_id', (logs || []).map(l => l.id).concat(['00000000-0000-0000-0000-000000000000']))
        for (const ex of exRows || []) {
          await db.from('workout_log_sets').delete().eq('workout_log_exercise_id', ex.id).select('id')
        }
        if (exRows?.length) {
          const { data: gone } = await db.from('workout_log_exercises')
            .delete().in('id', exRows.map(e => e.id)).select('id')
          out.cleanup.exercises = (gone || []).length
        }
        if (logs?.length) {
          const { data: gone } = await db.from('workout_logs')
            .delete().in('id', logs.map(l => l.id)).select('id')
          out.cleanup.logs = (gone || []).length
        }
        const { data: exGone } = await db.from('exercises')
          .delete().eq('coach_id', currentUser.id).eq('name', exerciseName).select('id')
        out.cleanup.libraryExercise = (exGone || []).length
      } finally {
        const { data: cGone } = await db.from('clients')
          .delete().eq('id', client.id).eq('coach_id', currentUser.id).select('id')
        out.cleanup.client = (cGone || []).length
      }
      return out
    }, { clientName, sessionName, exerciseName })

    expect(r.created, 'the fixture client must be created, or this test asserts nothing').toBe(true)
    // The load-bearing assertion. RED before the guard: two taps produced two workout_logs rows plus
    // their exercises and sets — a duplicated session, not one deletable line.
    expect(r.logCount, 'a double-pressed save must write exactly one session').toBe(1)
    // Cleanup must be seen to work, not assumed. A 0 here means the teardown was refused and the row
    // is still sitting in the live test account.
    expect(r.cleanup.client, 'the fixture client must be deleted, and the delete must be seen').toBe(1)
  })
})
