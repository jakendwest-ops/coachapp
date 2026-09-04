// A refused DELETE must not report success.
//
// PostgREST returns `error: null` for a DELETE that matched ZERO rows. So an RLS refusal and a real
// deletion are indistinguishable to code that only checks `error` — and every delete in
// js/app-programs.js checked only `error` until 2026-09-04. The user pressed Remove, the app logged
// "deleted", re-rendered, and the row was still there.
//
// This test makes the delete return exactly that shape — `{ data: [], error: null }` — WITHOUT
// touching the database, so it reproduces a refusal faithfully rather than simulating an error. Every
// other query in the function runs for real against a real fixture, including the ownership check,
// which is what makes this exercise the actual branch rather than a mock of it.

const { test, expect } = require('@playwright/test')
const { loginAsPT } = require('./helpers')

test.describe('A refused DELETE reports failure, not success (2026-09-04)', () => {
  test('removePhaseWorkout tells the user when the delete removed nothing', async ({ page }) => {
    await loginAsPT(page)

    const r = await page.evaluate(async () => {
      const tag = `[E2E] rowcount ${Date.now()}`
      const out = { built: false, toasts: [], rowSurvived: null, cleanup: {} }

      // ── real fixture, owned by this test ──────────────────────────────────────────────────────────
      const { data: prog } = await db.from('programs')
        .insert({ coach_id: currentUser.id, name: tag }).select('id').single()
      if (!prog?.id) return out
      const { data: phase } = await db.from('program_phases')
        .insert({ program_id: prog.id, name: 'Block 1', duration_weeks: 2, order_index: 0 }).select('id').single()
      const { data: tmpl } = await db.from('workout_templates')
        .insert({ coach_id: currentUser.id, program_id: prog.id, client_id: null, name: tag }).select('id').single()
      const { data: pw } = await db.from('program_phase_workouts')
        .insert({ phase_id: phase.id, day_of_week: 1, day_label: 'Monday', session_order: 1, template_id: tmpl.id, week_number: 1 })
        .select('id').single()
      out.built = !!(phase?.id && tmpl?.id && pw?.id)
      if (!out.built) return out

      const origFrom = db.from.bind(db)
      const origToast = window.showToast
      try {
        window.showToast = (msg, kind) => { out.toasts.push({ msg: String(msg), kind }) }

        // Only the program_phase_workouts DELETE is intercepted. It resolves as a zero-row success —
        // the genuine RLS-refusal shape — while selects, inserts and the ownership check stay real.
        db.from = (table) => {
          const real = origFrom(table)
          if (table !== 'program_phase_workouts') return real
          const realDelete = real.delete.bind(real)
          real.delete = () => {
            void realDelete   // keep the reference; we deliberately never issue the query
            const stub = {}
            for (const m of ['eq', 'in', 'is', 'not', 'gt', 'gte', 'lt', 'lte', 'neq', 'or',
              'select', 'order', 'limit', 'single', 'maybeSingle']) stub[m] = () => stub
            stub.then = (res) => res({ data: [], error: null })
            return stub
          }
          return real
        }

        await removePhaseWorkout(pw.id, phase.id)
      } finally {
        db.from = origFrom
        window.showToast = origToast
      }

      // The row must still be there — the delete never actually ran, so anything else would mean the
      // test intercepted the wrong call.
      const { data: still } = await origFrom('program_phase_workouts').select('id').eq('id', pw.id)
      out.rowSurvived = (still || []).length === 1

      // ── teardown, every delete rowcount-checked ───────────────────────────────────────────────────
      const gone = async (t, col, val) => {
        const { data } = await origFrom(t).delete().eq(col, val).select('id')
        return (data || []).length
      }
      out.cleanup.pw = await gone('program_phase_workouts', 'id', pw.id)
      out.cleanup.tmpl = await gone('workout_templates', 'id', tmpl.id)
      out.cleanup.phase = await gone('program_phases', 'id', phase.id)
      out.cleanup.prog = await gone('programs', 'id', prog.id)
      return out
    })

    expect(r.built, 'the fixture must be created, or this test asserts nothing').toBe(true)
    expect(r.rowSurvived, 'the intercept must have prevented the real delete').toBe(true)

    // THE ASSERTION. RED before the fix: removePhaseWorkout checked only `error`, so a zero-row
    // delete fell straight through to the re-render and the user was told nothing at all.
    const errors = r.toasts.filter(t => t.kind === 'error')
    expect(errors.length, `a refused delete must surface an error toast; got ${JSON.stringify(r.toasts)}`).toBeGreaterThan(0)

    // TWO toasts fire, and that is by design rather than a bug: log.error() itself calls showToast
    // (app-core.js:37) with the technical "<tag>: <message>" line, and the human-readable one follows.
    // showToast REMOVES any existing toast before painting, so the user actually sees only the second —
    // the console keeps the detail, the screen gets the sentence. Assert across all of them rather than
    // the first, or this test pins an ordering it does not care about.
    const human = errors.some(t => t.msg.toLowerCase().includes('could not remove'))
    expect(human, `one toast must be the human-readable message; got ${JSON.stringify(r.toasts)}`).toBe(true)

    // Teardown must be seen to work, not assumed.
    expect(r.cleanup.pw, 'fixture slot must be deleted').toBe(1)
    expect(r.cleanup.prog, 'fixture programme must be deleted').toBe(1)
  })
})
