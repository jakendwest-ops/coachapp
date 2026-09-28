const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

// Ledger row 2026-07-13-runner-back-is-a-no-op-during-a-rest-and-edit-double-tap-sil, second half: a double tap
// on a logged set's ✎ appended TWO edit sheets sharing the same input ids. The user typed into the visible
// (top) one, saveEditRunnerSet read the buried one via getElementById, and the set saved UNCHANGED with no
// error. (The first half — Back during a rest — is pinned by tests/ledger-fixes-2026-07-29.spec.js.)
//
// Written 2026-09-27 to close the row on evidence: with the re-entrancy guard removed this must go red.
// Pure in-page runner state; writes nothing to the database.
test('double-tapping ✎ on a logged set opens ONE edit sheet, so the edit is not silently lost', async ({ page }) => {
  await loginAsPT(page)
  const res = await page.evaluate(() => {
    const ex = { name: 'Bench', type: 'strength', metricType: 'weight_reps', targetSets: 3, sets_json: [{}],
      loggedSets: [{ weight: '100', reps: '5' }], tableRows: [] }
    _runner = { exercises: [ex], exIdx: 0, startTime: Date.now() }
    editRunnerSet(0, 0)
    editRunnerSet(0, 0)   // the double tap
    const count = document.querySelectorAll('#wr-edit-overlay').length
    document.querySelectorAll('#wr-edit-overlay').forEach(o => o.remove())
    document.getElementById('workout-runner')?.remove()
    _runner = null
    return { count }
  })
  expect(res.count, 'a double tap must leave exactly one edit sheet (two = the edit is read from the buried one)').toBe(1)
})

// First half of the same row. After an exercise's last set, the rest queues "advance to the next exercise"
// in _afterRest. The old Back button called skipRestTimer() first, which FIRED that queued advance, then
// stepped back one — landing on the exercise you were already on, so Back did nothing. The existing
// tests/ledger-fixes-2026-07-29.spec.js Back test never queues an _afterRest, and a neuter run on
// 2026-09-27 showed it stays green against the old code; this one reproduces the real sequence.
// 2026-09-28: the Back button and runnerGoBack are gone; going back is a tap on an earlier numbered tab,
// which is runnerJumpTo(exIdx - 1) — the very call runnerGoBack made — so the same sequence is driven that way.
test('Going back to an earlier exercise during a rest that has queued "advance to the next exercise" goes back, not nowhere', async ({ page }) => {
  await loginAsPT(page)
  const res = await page.evaluate(() => {
    const mk = n => ({ name: n, type: 'strength', metricType: 'weight_reps', targetSets: 1, sets_json: [{}],
      loggedSets: [], tableRows: [{ weight: '50', reps: '5', done: false }], restSecs: 90 })
    _runner = { exercises: [mk('A'), mk('B'), mk('C')], exIdx: 1, startTime: Date.now() }
    startRestTimer(90)
    _runner._afterRest = () => { _runner.exIdx = 2; renderRunner() }   // what finishing B's last set queues
    runnerJumpTo(_runner.exIdx - 1)
    const landedOn = _runner.exIdx
    clearTimer(_runner._restInterval)
    document.getElementById('workout-runner')?.remove()
    document.getElementById('rest-timer-overlay')?.remove()
    _runner = null
    return { landedOn }
  })
  expect(res.landedOn, 'Back from exercise B must land on A (the old code fired the queued advance first and stayed on B)').toBe(0)
})
