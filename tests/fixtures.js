const { test: base, expect } = require('@playwright/test')

/**
 * Extended test fixture that automatically captures browser console errors
 * and uncaught page exceptions on every test.
 *
 * Errors are surfaced as annotations in the HTML report — tests don't fail
 * automatically, but errors are always visible alongside the result.
 */
exports.test = base.extend({
  page: async ({ page }, use, testInfo) => {
    const consoleErrors = []
    const pageErrors = []

    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    page.on('pageerror', err => {
      pageErrors.push(err.message)
    })

    await use(page)

    if (consoleErrors.length > 0) {
      testInfo.annotations.push({
        type: 'console errors',
        description: consoleErrors.join('\n'),
      })
    }

    if (pageErrors.length > 0) {
      testInfo.annotations.push({
        type: 'page crash / uncaught error',
        description: pageErrors.join('\n'),
      })
    }
  },
})

// ─── ownWorkout — a workout this test alone owns ──────────────────────────────────────────────────
//
// WHY. Before this, ~23 runner tests reached the runner by clicking
// `button:has-text("Start")`.first() — "whatever workout happens to be first on the page". That is
// shared state: other tests in the same run create, edit and delete templates and programmes for the
// same client, so which workout is first changes mid-run. The result was 6-of-38 flaking in
// runner.spec.js, all of them passing in isolation, and checks.sh blocking good pushes at random
// (2026-08-11). Same root cause produced 58 stray [E2E] workout_logs in the test account, 48 of them
// with zero exercises, because nothing cleaned up either.
//
// A client CANNOT create its own template — RLS refuses `workout_templates` INSERT for the client
// role, correctly (clients don't author programming). So the template is created in a SECOND browser
// context as the PT, handed to the test by id, and started directly via
// `startWorkoutRunner(clientId, templateId)` — the same entry point the real Start button uses
// (js/app-workouts.js:2694), so this bypasses the page chrome without bypassing the code under test.
//
// Deliberately NOT a second helper module: tests/helpers.js and this file are already the two seams,
// and a third would be how they drift. Teardown mirrors sweepPT2's precedent in helpers.js.
const DEFAULT_EXERCISES = [
  {
    exercise_name: 'Own Squat', exercise_type: 'strength', metric_type: 'weight_reps', order_index: 0,
    sets_json: [{ repsMin: '8', weight: '60', restMin: '1:30' }, { repsMin: '8', weight: '60', restMin: '1:30' }],
  },
  {
    exercise_name: 'Own Press', exercise_type: 'strength', metric_type: 'weight_reps', order_index: 1,
    sets_json: [{ repsMin: '10', weight: '40', restMin: '1:00' }],
  },
]

exports.test = exports.test.extend({
  // Usage, AFTER logging in (the fixture needs a live session to read the client id from):
  //     const wk = await ownWorkout()                      // default 2-exercise strength workout
  //     const wk = await ownWorkout({ exercises: [...] })  // custom shape
  // then assert against wk.name / wk.exerciseNames rather than "whatever was first".
  ownWorkout: async ({ page, browser }, use) => {
    const { loginAsPT } = require('./helpers')
    const created = []

    const make = async ({ exercises = DEFAULT_EXERCISES } = {}) => {
      // Which client is this page? Works for a client session and for a coach/solo one.
      const target = await page.evaluate(async () => {
        const { data } = await db.from('clients').select('id, coach_id').eq('user_id', currentUser.id)
        const row = (data || []).find(c => c.coach_id) || (data || [])[0]
        return row ? { clientId: row.id, coachId: row.coach_id } : null
      })
      if (!target) throw new Error('ownWorkout: no clients row for the logged-in user — log in first')

      const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const name = `[E2E] own ${stamp}`
      const named = exercises.map(e => ({ ...e, exercise_name: `${e.exercise_name} ${stamp}` }))

      // Create as the PT — the client role cannot INSERT workout_templates (RLS).
      const ctx = await browser.newContext()
      try {
        const ptPage = await ctx.newPage()
        await loginAsPT(ptPage)
        const res = await ptPage.evaluate(async ({ name, target, named }) => {
          const { data: t, error } = await db.from('workout_templates')
            .insert({ coach_id: target.coachId, client_id: target.clientId, name, is_personal: false })
            .select('id').single()
          if (error) return { err: error.message }
          const { error: exErr } = await db.from('workout_template_exercises')
            .insert(named.map(e => ({ ...e, template_id: t.id })))
          if (exErr) {
            await db.from('workout_templates').delete().eq('id', t.id)
            return { err: 'exercises: ' + exErr.message }
          }
          return { templateId: t.id }
        }, { name, target, named })
        if (res.err) throw new Error('ownWorkout: ' + res.err)
        created.push({ templateId: res.templateId, name })
        return {
          templateId: res.templateId, name, clientId: target.clientId,
          exerciseNames: named.map(e => e.exercise_name),
          // Start THIS workout, not whatever is first. Same entry point as the real Start button.
          start: () => page.evaluate(
            ({ c, t }) => startWorkoutRunner(c, t), { c: target.clientId, t: res.templateId }),
        }
      } finally {
        await ctx.close().catch(() => {})
      }
    }

    await use(make)

    // Teardown as the PT, in FK-safe order. Runs even if the test threw. Never let cleanup fail a
    // test — but do not swallow it silently either: 48 orphaned logs is what silence looks like.
    if (created.length) {
      const ctx = await browser.newContext()
      try {
        const ptPage = await ctx.newPage()
        await loginAsPT(ptPage)
        const left = await ptPage.evaluate(async (created) => {
          const names = created.map(c => c.name)
          const { data: logs } = await db.from('workout_logs').select('id').in('name', names)
          const logIds = (logs || []).map(l => l.id)
          if (logIds.length) {
            const { data: exs } = await db.from('workout_log_exercises').select('id').in('log_id', logIds)
            const exIds = (exs || []).map(e => e.id)
            if (exIds.length) await db.from('workout_log_sets').delete().in('workout_log_exercise_id', exIds)
            await db.from('workout_log_exercises').delete().in('log_id', logIds)
            await db.from('workout_logs').delete().in('id', logIds)
          }
          for (const c of created) {
            await db.from('workout_template_exercises').delete().eq('template_id', c.templateId)
            await db.from('workout_templates').delete().eq('id', c.templateId)
          }
          const { data: stragglers } = await db.from('workout_logs').select('id').in('name', names)
          return (stragglers || []).length
        }, created)
        if (left) console.warn(`ownWorkout teardown: ${left} log(s) survived cleanup — check RLS on delete`)
      } catch (e) {
        console.warn('ownWorkout teardown failed:', e.message)
      } finally {
        await ctx.close().catch(() => {})
      }
    }
  },
})

exports.expect = expect
