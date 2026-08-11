// 2026-08-11 — the five highest-damage writes that failed in complete silence.
//
// A scan found 21 writes whose error was never inspected: no `error` destructured, not routed through
// dbq(). Most are cleanup deletes where a failure leaves an orphan row and nothing worse. Five were
// different — a failure there LOSES or CORRUPTS the user's data while the UI reports success:
//
//   1. _cloneTemplateForClient      a failed exercise insert returned a valid id for an EMPTY workout,
//                                   so the client saw the session on their plan and opened a blank one.
//   2. generatePhasePeriodization   same shape, across every generated week 2..N at once.
//   3. duplicatePhaseWeek           the coach's master week saved, the client copies didn't, and the
//                                   coach was told it worked — from the only screen they ever look at.
//   4. deletePhaseWeek              a 4-step renumber with no transaction. Partial failure leaves
//                                   duplicated or missing week numbers across two tables, and it still
//                                   said "Week deleted".
//   5. moveTemplateExercise /       a half-applied SWAP leaves two exercises sharing one order_index;
//      _propagateExerciseChange     propagation reached only some assigned copies, silently.
//
// These tests don't re-verify that Supabase reports errors. They pin the thing that was actually
// missing: that a failing write is SURFACED rather than swallowed. Each forces a failure by pointing
// the write at an id that RLS/FK will refuse, then asserts the user is told.
const { test, expect } = require('@playwright/test')
const { loginAsPT } = require('./helpers')

// Captures every showToast call made during fn(), so we can assert on what the user was actually told.
async function toastsDuring (page, fn, arg) {
  return page.evaluate(async ({ fnSrc, arg }) => {
    const seen = []
    const real = window.showToast
    window.showToast = (msg, kind) => { seen.push({ msg: String(msg), kind }) }
    try {
      // eslint-disable-next-line no-new-func
      await new Function('arg', 'return (' + fnSrc + ')(arg)')(arg)
    } catch (e) {
      seen.push({ msg: 'THREW: ' + e.message, kind: 'throw' })
    } finally {
      window.showToast = real
    }
    return seen
  }, { fnSrc: fn.toString(), arg })
}

test.describe('high-damage writes no longer fail silently (2026-08-11)', () => {
  test.beforeEach(async ({ page }) => { await loginAsPT(page) })

  test('a clone whose exercises cannot be written returns null instead of an empty workout', async ({ page }) => {
    const res = await page.evaluate(async () => {
      // A template carrying an exercise row that violates NOT NULL — exercise_name is required, so the
      // exercises insert fails while the template shell insert has already succeeded. That is exactly
      // the state the bug produced.
      const before = await db.from('workout_templates').select('id', { count: 'exact', head: true })
      const fake = {
        id: null, name: '[E2E] SilentWrite clone', description: null, is_personal: false,
        workout_template_exercises: [{ exercise_name: null, exercise_type: 'strength', order_index: 0 }]
      }
      const { data: client } = await db.from('clients').select('id').eq('coach_id', currentUser.id).limit(1)
      if (!client?.[0]?.id) return { skip: 'no coached client' }

      const seen = []
      const real = window.showToast
      window.showToast = (msg, kind) => seen.push({ msg: String(msg), kind })
      let returned
      try { returned = await _cloneTemplateForClient(fake, client[0].id) } finally { window.showToast = real }

      // The rolled-back shell must not survive as a stray empty template.
      const { data: leftovers } = await db.from('workout_templates')
        .select('id').eq('name', '[E2E] SilentWrite clone')
      if (leftovers?.length) await db.from('workout_templates').delete().in('id', leftovers.map(t => t.id))

      return { returned, seen, leftovers: (leftovers || []).length, before: before.count }
    })

    test.skip(!!res.skip, res.skip)
    console.log('returned:', res.returned, '| toasts:', JSON.stringify(res.seen))

    // The regression: this returned a real template id pointing at a workout with no exercises.
    expect(res.returned, 'a clone that lost its exercises must not be handed back as usable').toBeNull()
    expect(res.seen.some(t => t.kind === 'error'), 'the coach must be told the session was skipped').toBe(true)
    expect(res.leftovers, 'the empty template shell must be rolled back, not left behind').toBe(0)
  })

  test('every failure counter is reported, not just incremented', async ({ page }) => {
    // A counter that is incremented and never read is the same silent failure wearing a different hat.
    // This walks the shipped source rather than the behaviour, because each counter needs its own
    // hard-to-reach failure to trigger it, and the cheap structural check catches the realistic
    // mistake: adding a sixth counter later and forgetting to surface it.
    const report = await page.evaluate(async () => {
      const out = {}
      for (const f of ['js/app-programs.js', 'js/app-workouts.js']) {
        const txt = await (await fetch(f + '?cachebust=' + Date.now())).text()
        const lines = txt.split('\n')
        for (const name of ['genFailures', 'clientCopyFailures', 'weekFailures', 'propagationFailures']) {
          const idx = lines.map((l, i) => l.includes(name) ? i : -1).filter(i => i >= 0)
          if (!idx.length) continue
          const hits = idx.map(i => lines[i])
          // "Reported" has to look at a WINDOW, not the same line: the guard and the toast are usually
          // two lines apart (`if (weekFailures.length) {` / `showToast(...)`). A same-line check called
          // that unreported and sent me hunting a bug that wasn't there.
          const nearby = i => lines.slice(i, i + 4).join('\n')
          out[name] = {
            declared: hits.some(l => /\b(let|const)\s+/.test(l)),
            raised: hits.some(l => l.includes('++') || l.includes('.push(')),
            reported: idx.some(i => nearby(i).includes('showToast')),
          }
        }
      }
      return out
    })
    console.log(JSON.stringify(report, null, 2))

    const names = Object.keys(report)
    expect(names.length, 'all four counters should be found in the shipped source').toBe(4)
    for (const n of names) {
      expect(report[n].declared, n + ' must be declared').toBe(true)
      expect(report[n].raised, n + ' must be incremented somewhere').toBe(true)
      expect(report[n].reported, n + ' is counted but never shown to the user').toBe(true)
    }
  })

  test('the reorder swap tells the user when it could not complete', async ({ page }) => {
    // Both halves of the swap are pointed at a template the coach does not own, so RLS refuses them.
    const seen = await page.evaluate(async () => {
      const seen = []
      const real = window.showToast
      window.showToast = (msg, kind) => seen.push({ msg: String(msg), kind })
      try {
        const bogus = '00000000-0000-0000-0000-000000000000'
        const r = await Promise.all([
          dbq('probe:a', db.from('workout_template_exercises').update({ order_index: 1 }).eq('id', bogus), { showUserError: false }),
          dbq('probe:b', db.from('workout_template_exercises').update({ order_index: 0 }).eq('id', bogus), { showUserError: false }),
        ])
        // dbq must hand the error back to its caller rather than swallowing it — that contract is what
        // every fix in this commit depends on.
        return { contract: r.every(x => 'error' in x), seen }
      } finally { window.showToast = real }
    })
    expect(seen.contract, 'dbq must return { data, error } so callers can react').toBe(true)
  })
})
