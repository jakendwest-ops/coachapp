// Reordering was doing three expensive things on every single tap.
//
// Measured 2026-09-06: each ▲/▼ press ran an ownership check, a fetch, two swap updates, then
// `_afterTemplateExerciseSave` — which calls `openTemplate()` (a full re-fetch and repaint of the
// whole session) AND `_checkClientPlanPropagation`. Moving an exercise from eighth to first was
// seven taps, seven full reloads and seven "update your other copies?" checks.
//
// Jake, 2026-09-06, picking all three of the offered complaints: it reloads every time, one position
// per tap is too slow, and it nags about duplicate sessions.
//
// Now: the rows swap in the DOM immediately, the two updates still persist every swap (so nothing is
// held unsaved and there is no work to lose), and the propagation check is DEBOUNCED — tap seven
// times quickly and you are asked once, after you stop.
//
// The debounce is deliberately not "ask when you leave the editor". That version had a hole: leaving
// by any route other than the back button would silently skip propagation, and silently failing to
// sync the copies is worse than being asked too often.

const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

// A hand-built list matching what openTemplate renders: a container, one card per exercise carrying
// its id, each with an up and a down button.
const buildList = (names) => `(() => {
  const wrap = document.createElement('div')
  wrap.id = 'tpl-ex-list'
  wrap.className = 'list'
  // The const on the next line matters: without it the array literal continues the previous
  // expression as string-indexing, which yields undefined. Automatic semicolon insertion does not
  // save you when the following line opens with a bracket. (No backticks in this comment: it lives
  // inside a template literal, and one would close the string.)
  const _names = ${JSON.stringify(names)}
  _names.forEach((n, i, arr) => {
    const card = document.createElement('div')
    card.className = 'card'
    card.dataset.exId = 'e' + (i + 1)
    card.dataset.exName = n
    card.innerHTML =
      '<button data-move="-1"' + (i === 0 ? ' disabled' : '') + '>up</button>' +
      '<button data-move="1"' + (i === arr.length - 1 ? ' disabled' : '') + '>down</button>' +
      '<span>' + n + '</span>'
    wrap.appendChild(card)
  })
  document.body.appendChild(wrap)
  return wrap
})()`

const readList = `(() => {
  const wrap = document.getElementById('tpl-ex-list')
  const cards = [...wrap.querySelectorAll('.card')]
  return {
    names: cards.map(c => c.dataset.exName),
    upDisabled: cards.map(c => c.querySelector('[data-move="-1"]').disabled),
    downDisabled: cards.map(c => c.querySelector('[data-move="1"]').disabled)
  }
})()`

test.describe('Reorder is instant, and asks about copies once (2026-09-06)', () => {
  test('_reorderRowsInDom swaps the rows and re-arms the arrows, without touching the network', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(`(() => {
      ${buildList(['Squat', 'Bench', 'Row'])}
      // Move 'Bench' (e2) up one.
      const names = _reorderRowsInDom('e2', -1)
      const after = ${readList}
      document.getElementById('tpl-ex-list').remove()
      return { names, after }
    })()`)
    expect(r.names, 'it returns the resulting order, which is what propagation needs').toEqual(['Bench', 'Squat', 'Row'])
    expect(r.after.names, 'and the DOM matches').toEqual(['Bench', 'Squat', 'Row'])
    // The arrows must follow the rows, or you can move something off the end of the list.
    expect(r.after.upDisabled, 'only the first row may have a disabled up arrow').toEqual([true, false, false])
    expect(r.after.downDisabled, 'only the last row may have a disabled down arrow').toEqual([false, false, true])
  })

  test('it refuses to move the first row up or the last row down', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(`(() => {
      ${buildList(['Squat', 'Bench', 'Row'])}
      const offTop = _reorderRowsInDom('e1', -1)
      const offEnd = _reorderRowsInDom('e3', 1)
      const missing = _reorderRowsInDom('nope', -1)
      const after = ${readList}
      document.getElementById('tpl-ex-list').remove()
      return { offTop, offEnd, missing, after }
    })()`)
    expect(r.offTop, 'moving the top row up is a no-op, not a wrap-around').toBe(null)
    expect(r.offEnd, 'moving the bottom row down is a no-op').toBe(null)
    expect(r.missing, 'an unknown id is a no-op, not a throw').toBe(null)
    expect(r.after.names, 'and nothing moved').toEqual(['Squat', 'Bench', 'Row'])
  })

  test('a reorder does NOT refetch and repaint the whole session', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(`(async () => {
      ${buildList(['Squat', 'Bench', 'Row'])}
      const rows = [
        { id: 'e1', order_index: 0, exercise_name: 'Squat' },
        { id: 'e2', order_index: 1, exercise_name: 'Bench' },
        { id: 'e3', order_index: 2, exercise_name: 'Row' }
      ]
      const saved = {
        openTemplate: window.openTemplate,
        check: window._checkClientPlanPropagation,
        resolveEditable: window._resolveEditableTemplateId,
        resolveOwner: window._resolveTemplateOwnerCoachId,
        verify: window._verifyTemplateOwnership,
        from: db.from.bind(db)
      }
      let opens = 0, checks = 0
      const writes = []
      window.openTemplate = async () => { opens++ }
      window._checkClientPlanPropagation = async () => { checks++ }
      window._resolveEditableTemplateId = async () => ({ templateId: 't1', exerciseId: 'e2' })
      window._resolveTemplateOwnerCoachId = async () => 'c1'
      window._verifyTemplateOwnership = async () => true
      db.from = (tbl) => {
        if (tbl !== 'workout_template_exercises') return saved.from(tbl)
        return {
          select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: rows, error: null }) }) }),
          update: (patch) => {
            const c = { _id: null,
              eq (col, v) { if (col === 'id') c._id = v; return c },
              select: () => { writes.push({ id: c._id, to: patch.order_index }); return Promise.resolve({ data: [{ id: c._id }], error: null }) } }
            return c
          }
        }
      }
      try {
        await moveTemplateExercise('t1', 'e2', -1)
        const immediately = ${readList}
        return { opens, checks, writes: writes.length, immediately }
      } finally {
        Object.assign(window, { openTemplate: saved.openTemplate, _checkClientPlanPropagation: saved.check,
          _resolveEditableTemplateId: saved.resolveEditable, _resolveTemplateOwnerCoachId: saved.resolveOwner,
          _verifyTemplateOwnership: saved.verify })
        db.from = saved.from
        document.getElementById('tpl-ex-list')?.remove()
      }
    })()`)
    expect(r.opens, 'no repaint DURING the tap — that per-tap refetch is what made this slow').toBe(0)
    expect(r.writes, 'the swap must still persist immediately: two updates, so nothing is left unsaved').toBe(2)
    expect(r.immediately.names, 'and the list has already moved by the time the call returns').toEqual(['Bench', 'Squat', 'Row'])
    expect(r.checks, 'propagation is debounced, so it has NOT run yet').toBe(0)
  })

  // A FORK must repaint immediately, not at settle.
  //
  // _resolveEditableTemplateId can clone a shared template and repoint the phase slot at the clone.
  // Every button on screen still carries the PRE-fork id, so leaving the repaint until the burst
  // settles means every remaining tap resolves a stale id — which no longer forks, still passes its
  // own ownership check because the same coach owns the master, and silently writes to the ORPHANED
  // master instead of the copy on screen.
  //
  // The first fix attempt did not close this, and the scoped re-review noted the existing tests could
  // not catch it because they stub the resolver to one fixed id. This one varies it.
  test('a fork repaints straight away, so the next tap cannot write to the orphaned master', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(`(async () => {
      ${buildList(['Squat', 'Bench', 'Row'])}
      const rows = [
        { id: 'f1', order_index: 0, exercise_name: 'Squat' },
        { id: 'f2', order_index: 1, exercise_name: 'Bench' },
        { id: 'f3', order_index: 2, exercise_name: 'Row' }
      ]
      const saved = { openTemplate: window.openTemplate, check: window._checkClientPlanPropagation,
        resolveEditable: window._resolveEditableTemplateId, resolveOwner: window._resolveTemplateOwnerCoachId,
        verify: window._verifyTemplateOwnership, from: db.from.bind(db) }
      const opened = []
      window.openTemplate = async (id) => { opened.push(id) }
      window._checkClientPlanPropagation = async () => {}
      window._resolveTemplateOwnerCoachId = async () => 'c1'
      window._verifyTemplateOwnership = async () => true
      // The fork: asked to edit 'shared', you are handed a CLONE with a different id.
      window._resolveEditableTemplateId = async () => ({ templateId: 'clone-1', exerciseId: 'f2' })
      db.from = (tbl) => {
        if (tbl !== 'workout_template_exercises') return saved.from(tbl)
        return {
          select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: rows, error: null }) }) }),
          update: () => ({ eq () { return this }, select: () => Promise.resolve({ data: [{ id: 'x' }], error: null }) })
        }
      }
      try {
        await moveTemplateExercise('shared', 'e2', -1)
        return { openedImmediately: [...opened] }
      } finally {
        Object.assign(window, { openTemplate: saved.openTemplate, _checkClientPlanPropagation: saved.check,
          _resolveEditableTemplateId: saved.resolveEditable, _resolveTemplateOwnerCoachId: saved.resolveOwner,
          _verifyTemplateOwnership: saved.verify })
        db.from = saved.from
        document.getElementById('tpl-ex-list')?.remove()
      }
    })()`)
    expect(r.openedImmediately.length, 'a fork must repaint before the call returns, not 1500ms later').toBe(1)
    expect(r.openedImmediately[0], 'and it must repaint the CLONE, never the id the buttons still carry').toBe('clone-1')
  })

  test('seven rapid moves ask about duplicate sessions ONCE, not seven times', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(`(async () => {
      ${buildList(['A', 'B', 'C', 'D'])}
      const rows = ['A','B','C','D'].map((n, i) => ({ id: 'e' + (i+1), order_index: i, exercise_name: n }))
      const saved = { openTemplate: window.openTemplate, check: window._checkClientPlanPropagation,
        resolveEditable: window._resolveEditableTemplateId, resolveOwner: window._resolveTemplateOwnerCoachId,
        verify: window._verifyTemplateOwnership, from: db.from.bind(db) }
      let checks = 0, opens = 0
      let lastChange = null
      window.openTemplate = async () => { opens++ }
      window._checkClientPlanPropagation = async (id, ctx, change) => { checks++; lastChange = change }
      window._resolveTemplateOwnerCoachId = async () => 'c1'
      window._verifyTemplateOwnership = async () => true
      db.from = (tbl) => {
        if (tbl !== 'workout_template_exercises') return saved.from(tbl)
        return {
          select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: rows, error: null }) }) }),
          update: () => ({ eq () { return this }, select: () => Promise.resolve({ data: [{ id: 'x' }], error: null }) })
        }
      }
      try {
        // Three moves in quick succession, as a person tapping would.
        for (const id of ['e2', 'e3', 'e4']) {
          window._resolveEditableTemplateId = async () => ({ templateId: 't1', exerciseId: id })
          await moveTemplateExercise('t1', id, -1)
        }
        const duringBurst = checks
        const opensDuringBurst = opens
        await new Promise(res => setTimeout(res, 2200))   // longer than the settle delay
        return { duringBurst, opensDuringBurst, afterSettling: checks, opensAfterSettling: opens, lastChange }
      } finally {
        Object.assign(window, { openTemplate: saved.openTemplate, _checkClientPlanPropagation: saved.check,
          _resolveEditableTemplateId: saved.resolveEditable, _resolveTemplateOwnerCoachId: saved.resolveOwner,
          _verifyTemplateOwnership: saved.verify })
        db.from = saved.from
        document.getElementById('tpl-ex-list')?.remove()
      }
    })()`)
    expect(r.duringBurst, 'nothing may prompt while the taps are still coming').toBe(0)
    expect(r.afterSettling, 'and exactly one check runs once they stop — this is the "stop nagging me" fix').toBe(1)
    // Review found the missing repaint left the position badges and, worse, the template ids in each
    // button's onclick stale — so after a fork the NEXT tap wrote to the orphaned master. One repaint
    // on settle restores every guarantee the per-tap repaint gave, at a seventh of the cost.
    expect(r.opensAfterSettling, 'exactly one repaint once the burst settles, never none').toBe(1)
    expect(r.lastChange?.op, 'it propagates a reorder').toBe('reorder')
    expect(r.lastChange?.names?.length, 'carrying the FINAL order, not an intermediate one').toBe(4)
  })
})
