const { test, expect } = require('./fixtures')
const { loginAsClient } = require('./helpers')

// ─── Supersets in the logger (Step D, docs/superpowers/plans/2026-11-15-workout-builder-speed.md; Jake's option 1) ────────────────────
//
// One exercise at a time: tick A1 -> A1's rest -> the screen moves to A2 by itself -> tick -> A2's rest -> back to A1, every round. A tag
// and "Superset A · round n of 2" in the header, a line naming what comes after this set. Skipping the rest moves on the same way; moving
// by hand never breaks the round count. The pure rules are pinned by tests-node/superset-runner.test.mjs; THESE drive the real runner.
//
// In-memory runner state, as runner-last-e1rm-2026-11-15.spec.js does: nothing is written to the database.

async function startRunner(page, { a1Rest = '1:00', a2Rest = '0:00' } = {}) {
  await loginAsClient(page)
  await page.evaluate(({ a1Rest, a2Rest }) => {
    window._unitPrefs = { ...(window._unitPrefs || {}), weight: 'kg', jumpHeight: 'cm' }
    const S = rest => ({ repsMin: '8', repsMax: '8', effortType: 'rpe', restMin: rest })
    const ex = (name, g, rest, restSecs) => ({ name, type: 'strength', metricType: 'weight_reps', targetSets: 2, sets_json: [S(rest), S(rest)], loggedSets: [], exerciseId: null, restSecs, supersetGroup: g, oneRM: null })
    _runner = {
      clientId: 'superset-spec', startTime: Date.now(), exIdx: 0, lastSession: {}, lastSessionDone: {},
      exercises: [ex('Press', 'A', a1Rest, a1Rest === '0:00' ? 90 : 60), ex('Row', 'a', a2Rest, 90), ex('Bench', null, '2:00', 120)],
    }
    renderRunner()
  }, { a1Rest, a2Rest })
  await expect(page.locator('#workout-runner button:text-is("End")')).toBeVisible()
}
const tick = async (page, i) => { await page.fill(`#set-${i}-weight`, '40'); await page.fill(`#set-${i}-reps`, '8'); await page.click(`#set-${i}-done`) }
const title = page => page.locator('#wr-title')

test('the header names the superset and the round, and a line says what comes after this set', async ({ page }) => {
  await startRunner(page)
  await expect(page.locator('#wr-ss-tag')).toHaveText('A1')
  await expect(page.locator('#wr-ss-round')).toHaveText('Superset A · round 1 of 2')
  await expect(page.locator('#wr-ss-next')).toContainText('A2 · Row')
  await page.click('#wr-tabs button >> nth=2')
  await expect(page.locator('#wr-ss'), 'Bench is not in a superset').toHaveCount(0)
  await expect(page.locator('#wr-ss-next')).toHaveCount(0)
})

test('tick A1 -> its rest -> A2 by itself; A2 with a 0:00 rest goes straight back to A1 for round 2', async ({ page }) => {
  await startRunner(page)
  await tick(page, 0)
  expect(await page.evaluate(() => [_runner.exIdx, _runner.restRemaining]), 'A1\'s own 60 s rest, still on A1').toEqual([0, 60])
  await page.evaluate(() => { _runner.restRemaining = 1 })   // let the real countdown run out
  await expect(title(page)).toHaveText('Row', { timeout: 5000 })
  await expect(page.locator('#wr-ss-round')).toHaveText('Superset A · round 1 of 2')
  await expect(page.locator('#wr-ss-next')).toContainText('A1 · Press')
  await tick(page, 0)
  await expect(title(page), 'a 0:00 rest: straight on').toHaveText('Press')
  await expect(page.locator('#wr-ss-round')).toHaveText('Superset A · round 2 of 2')
})

test('skipping the rest moves on the same way', async ({ page }) => {
  await startRunner(page)
  await tick(page, 0)
  await page.locator('button[onclick="skipRestTimer()"]').first().click()
  await expect(title(page)).toHaveText('Row')
})

test('after the last set of the superset the screen stays put (the Next button takes over)', async ({ page }) => {
  await startRunner(page)
  await tick(page, 0); await page.locator('button[onclick="skipRestTimer()"]').first().click()
  await tick(page, 0)                                   // Row, round 1 -> Press
  await tick(page, 1); await page.locator('button[onclick="skipRestTimer()"]').first().click()
  await tick(page, 1)                                   // Row, round 2: nothing left in the superset
  await expect(title(page)).toHaveText('Row')
  await expect(page.locator('#wr-ss-round')).toHaveText('Superset A · done')
  await expect(page.locator('#wr-ss-next')).toHaveCount(0)
  await expect(page.locator('#wr-cta-next')).toContainText('Bench')
})

test('moving by hand: a tick on another exercise during A1\'s rest never sends the screen to A2 later; the round count holds', async ({ page }) => {
  await startRunner(page)
  await tick(page, 0)                                   // A1 rest running, queued to move to A2
  await page.click('#wr-tabs button >> nth=2')          // look at Bench
  await tick(page, 0)                                   // Bench's own rest replaces A1's
  await page.evaluate(() => { _runner.restRemaining = 1 })
  await expect.poll(() => page.evaluate(() => _runner.restRemaining), { timeout: 5000 }).toBeNull()
  await expect(title(page), 'still on Bench').toHaveText('Bench')
  await page.click('#wr-tabs button >> nth=0')
  await expect(page.locator('#wr-ss-round'), 'A1 has one set ticked').toHaveText('Superset A · round 2 of 2')
})

test('unticking a set during the rest it started: the rest no longer moves the screen on', async ({ page }) => {
  await startRunner(page)
  await tick(page, 0)
  await page.click('#set-0-done')                       // untick
  await page.evaluate(() => { _runner.restRemaining = 1 })
  await expect.poll(() => page.evaluate(() => _runner.restRemaining), { timeout: 5000 }).toBeNull()
  await expect(title(page)).toHaveText('Press')
})

test('390 px: the superset lines fit, nothing runs off the side', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await startRunner(page)
  for (const id of ['#wr-ss-tag', '#wr-ss-round', '#wr-ss-next']) {
    const b = await page.locator(id).boundingBox()
    expect(b && b.x >= 0 && b.x + b.width <= 390 && b.y + b.height <= 844, id + ' on screen').toBe(true)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= 390)).toBe(true)
})

// ─── Review fixes, 2026-11-16 ────────────────────────────────────────────────────────────────────────────────────────────────────────
// A tick whose rest is 0:00 went straight on WITHOUT ending a rest still running for another member, so that rest's queued "move on"
// fired later (or on arrival) and bounced the screen to the wrong member. Both shapes the reviewers traced:

test("A1 60 s, A2 0:00: tick A1, tab to A2 at once and tick it: back on A1, and the old A1 rest never sends the screen to A2", async ({ page }) => {
  await startRunner(page, { a1Rest: '1:00', a2Rest: '0:00' })
  await tick(page, 0)                                   // A1 rest running, queued to move to A2
  await page.click('#wr-tabs button >> nth=1')          // straight to A2
  await tick(page, 0)                                   // A2 is 0:00: straight back to A1
  await expect(title(page)).toHaveText('Press')
  expect(await page.evaluate(() => _runner.restRemaining), 'the old rest ended with this tick').toBeNull()
  expect(await page.evaluate(() => [typeof _runner._afterRest, _runner._restInterval || null]), 'no rest and no queued move left to fire later').toEqual(['object', null])
})

test("A1 0:00, A2 90 s: the A2 rest runs out while looking at A1; ticking A1 goes on to A2, not bounced back to A1", async ({ page }) => {
  await startRunner(page, { a1Rest: '0:00', a2Rest: '1:30' })
  await tick(page, 0)                                   // A1 0:00 -> A2
  await expect(title(page)).toHaveText('Row')
  await tick(page, 0)                                   // A2 rest running, queued to move to A1
  await page.click('#wr-tabs button >> nth=0')          // look at A1 early
  await page.evaluate(() => { _runner.restRemaining = 1 })
  await expect.poll(() => page.evaluate(() => _runner._restPendingFire), { timeout: 5000 }).toBe(true)
  await tick(page, 1)                                   // A1 round 2, 0:00 rest -> A2
  await expect(title(page)).toHaveText('Row')
  await expect(page.locator('#wr-ss-round')).toHaveText('Superset A · round 2 of 2')
})
