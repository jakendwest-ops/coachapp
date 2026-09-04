// A session trained in the RUNNER must record which template it came from.
//
// Before this, only saveWorkoutSession (the manual "log a past session" form) set template_id.
// saveRunnerSession — the path actually used in a gym — inserted coach_id, client_id, name, date and
// notes, and nothing else. So the Library page could never know when a session was last trained.
//
// Historical logs cannot be backfilled: the link was never recorded and cannot be derived.

const { test, expect } = require('@playwright/test')
const { loginAsPT } = require('./helpers')

test.describe('The runner records template_id (2026-09-04)', () => {
  test('a session saved from the runner carries the template it was launched from', async ({ page }) => {
    await loginAsPT(page)

    const r = await page.evaluate(async () => {
      const tag = `[E2E] runner tmpl ${Date.now()}`
      const out = { built: false, templateIdOnLog: null, cleanup: {} }

      const { data: client } = await db.from('clients')
        .insert({ coach_id: currentUser.id, full_name: tag }).select('id').single()
      const { data: tmpl } = await db.from('workout_templates')
        .insert({ coach_id: currentUser.id, client_id: null, program_id: null, name: tag })
        .select('id').single()
      if (!client?.id || !tmpl?.id) return out
      out.built = true

      try {
        // Drive the real state the runner saves from, rather than the whole UI: this test is about
        // the insert carrying the id, not about how the runner is launched.
        _runner = {
          clientId: client.id, name: tag, date: new Date().toISOString().split('T')[0],
          // saveRunnerSession bails out before it ever inserts if _loggedExercises() (the same
          // "loggedSets.length" filter the finish screen uses) comes back empty — one real logged
          // set is required to reach the workout_logs insert this test is actually about. reps:15
          // stays outside the 1-10 range _estimate1RM requires, so this doesn't also trip the
          // post-session 1RM modal.
          exercises: [{ name: 'Test Exercise', type: 'strength', loggedSets: [{ reps: '15', weight: '20' }] }],
          exIdx: 0, startTime: Date.now(), _timerInterval: null,
          templateDesc: null, templateId: tmpl.id
        }
        await saveRunnerSession()

        const { data: logs } = await db.from('workout_logs')
          .select('id, template_id').eq('client_id', client.id).eq('name', tag)
        out.templateIdOnLog = logs?.[0]?.template_id ?? null

        if (logs?.length) {
          const { data: gone } = await db.from('workout_logs')
            .delete().in('id', logs.map(l => l.id)).select('id')
          out.cleanup.logs = (gone || []).length
        }
      } finally {
        const { data: tGone } = await db.from('workout_templates')
          .delete().eq('id', tmpl.id).eq('coach_id', currentUser.id).select('id')
        const { data: cGone } = await db.from('clients')
          .delete().eq('id', client.id).eq('coach_id', currentUser.id).select('id')
        out.cleanup.template = (tGone || []).length
        out.cleanup.client = (cGone || []).length
      }
      return out
    })

    expect(r.built, 'the fixture must exist or this test asserts nothing').toBe(true)
    expect(r.templateIdOnLog, 'the runner log must carry the template it was launched from').not.toBeNull()
    expect(r.cleanup.template, 'the fixture template must be deleted, and the delete seen').toBe(1)
    expect(r.cleanup.client, 'the fixture client must be deleted, and the delete seen').toBe(1)
  })
})
