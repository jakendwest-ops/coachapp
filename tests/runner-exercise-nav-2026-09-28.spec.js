const { test, expect } = require('./fixtures')
const { loginAsClient, loginAsPT } = require('./helpers')

// ─── Workout runner: exercise tabs, "Next exercise", header (Jake's 2026-09-28 walkthrough, items 1-6) ─────────
//
// Ledger: docs/bugs/2026-09-28-runner-tabs-show-position-not-completion-and-next-exercise-cannot-return-to-a-skipped-one.md
//
// The runner used to know an exercise only by its POSITION. The tab colour was "a lower number than the current
// one" and "Next exercise" was a bare `exIdx++`, so a user who jumped from 1 to 3 saw a never-touched 2 in purple
// and was carried on to 4. These tests pin what replaced it: an exercise is complete when every one of its sets is
// done; the tab shows that (green), the current one is purple, everything else is plain; and "Next exercise" goes to
// whatever is still to do.
//
// Everything here is IN-MEMORY runner state (a hand-built `_runner`, like ledger-fixes-2026-07-29 and
// runner-edit-set-double-tap): nothing is written to the database, so no fixture, no teardown, nothing to leak.
// Sets are marked done directly (then renderRunner) except in the rest-timer test, which ticks them for real.
// The REAL "Next exercise" button is what gets clicked.

// A runner with `n` plain-strength exercises "Nav A", "Nav B"..., two sets each, on exercise 1.
async function startRunner(page, { n = 4 } = {}) {
  await loginAsClient(page)
  await page.evaluate((n) => {
    const names = Array.from({ length: n }, (_, i) => 'Nav ' + String.fromCharCode(65 + i))
    _runner = {
      clientId: 'nav-spec', startTime: Date.now(), exIdx: 0, lastSession: {},
      exercises: names.map((name, i) => ({
        name, type: 'strength', metricType: 'weight_reps', targetSets: 2, sets_json: [{}, {}],
        loggedSets: [], exerciseId: null, order_index: i, restSecs: 60,
      })),
    }
    names.forEach(nm => { _runner.lastSession[nm] = null })   // "no history": the runner must not go and read any
    renderRunner()
  }, n)
  await expect(page.locator('#workout-runner button:text-is("End")')).toBeVisible()
}

// Every set of exercise i done, exactly as ticking them would leave the state, minus the rest timer.
const complete = (page, i) => page.evaluate((i) => {
  const ex = _runner.exercises[i]
  _ensureTableRows(ex)
  ex.tableRows.forEach(r => { r.weight = '20'; r.reps = '5'; r.done = true })
  _syncLoggedSetsFromTable(ex)
  renderRunner()
}, i)

// One set of two done: started, not finished.
const partial = (page, i) => page.evaluate((i) => {
  const ex = _runner.exercises[i]
  _ensureTableRows(ex)
  Object.assign(ex.tableRows[0], { weight: '20', reps: '5', done: true })
  _syncLoggedSetsFromTable(ex)
  renderRunner()
}, i)

const at = (page) => page.evaluate(() => _runner.exIdx)
const stubFinish = (page) => page.evaluate(() => { window.__finished = false; window.showRunnerFinish = () => { window.__finished = true } })
const finished = (page) => page.evaluate(() => window.__finished)

// The button the user actually presses. Its label is part of what is under test.
const nextBtn = (page) => page.locator('#workout-runner button[onclick="skipToNextExercise()"]')

// Tab fills, resolved from the app's own CSS variables so the test does not hard-code a palette.
const tabColours = (page) => page.evaluate(() => {
  const resolve = (v) => { const d = document.createElement('div'); d.style.background = `var(${v})`; document.body.appendChild(d); const c = getComputedStyle(d).backgroundColor; d.remove(); return c }
  const tabs = [...document.querySelectorAll('#workout-runner button[onclick^="runnerJumpTo("]')].filter(b => /^\d+$/.test(b.textContent.trim()))
  return { accent: resolve('--accent'), success: resolve('--success'), plain: resolve('--surface-2'), tabs: tabs.map(b => getComputedStyle(b).backgroundColor) }
})

test.describe('Runner exercise tabs and Next exercise (2026-09-28)', () => {
  test('a tab is green only for a completed exercise and purple only for the current one — never purple for merely being an earlier number', async ({ page }) => {
    await startRunner(page)

    // Do 1, then jump straight to 3 — the case from the walkthrough screenshot.
    await complete(page, 0)
    await page.evaluate(() => runnerJumpTo(2))
    let c = await tabColours(page)
    // The three fills must be three different colours, or every comparison below could pass blind (a renamed CSS
    // variable resolves to transparent on both sides).
    expect(new Set([c.accent, c.success, c.plain]).size, 'accent, success and plain resolve to three different colours').toBe(3)
    expect.soft(c.tabs[0], 'exercise 1 is complete').toBe(c.success)
    expect.soft(c.tabs[1], 'exercise 2 was skipped, so it must be plain — it is a LOWER number than the current one, which is not the same as done').toBe(c.plain)
    expect.soft(c.tabs[2], 'exercise 3 is the current one').toBe(c.accent)
    expect.soft(c.tabs[3], 'exercise 4 is not reached yet').toBe(c.plain)

    // Finishing the exercise you are ON turns its tab green straight away — that is the feedback.
    await complete(page, 2)
    c = await tabColours(page)
    expect(c.tabs[2], 'the current exercise, once every set is done, shows as complete').toBe(c.success)

    // Only a fully finished exercise counts: one set of two is not complete.
    await page.evaluate(() => runnerJumpTo(3))
    await partial(page, 1)
    c = await tabColours(page)
    expect(c.tabs[1], 'a started-but-unfinished exercise is not green').toBe(c.plain)
  })

  test('"Next exercise" goes back to the lowest exercise still to do — skip 1 to 3 and it returns to 2, not on to 4', async ({ page }) => {
    await startRunner(page)
    await stubFinish(page)

    await complete(page, 0)
    await page.evaluate(() => runnerJumpTo(2))
    await complete(page, 2)
    await expect(nextBtn(page)).toContainText('Next exercise')
    await nextBtn(page).click()
    expect(await at(page), 'from a finished 3, the next one to do is 2').toBe(1)

    await complete(page, 1)
    await expect(nextBtn(page), 'exercise 4 is still to do').toContainText('Next exercise')
    await nextBtn(page).click()
    expect(await at(page), 'then on to 4').toBe(3)

    await complete(page, 3)
    await expect(nextBtn(page), 'nothing left to do').toContainText('Finish')
    await nextBtn(page).click()
    expect(await finished(page), 'with everything complete, Next finishes the workout').toBe(true)
  })

  test('skipping an unfinished exercise only ever moves FORWARD — it does not jump back to an earlier undone one, and the last one finishes', async ({ page }) => {
    await startRunner(page)
    await stubFinish(page)

    // Sit on 2 with 1 untouched BEHIND it and 3, 4 untouched AHEAD, then skip. Going forward gives 3; a rule that
    // simply took "the lowest exercise still to do" would give 1 — this is the case that tells the two apart.
    await page.evaluate(() => runnerJumpTo(1))
    await partial(page, 1)
    await nextBtn(page).click()
    expect(await at(page), 'skipping 2 goes on to 3, not back to the untouched 1').toBe(2)

    await partial(page, 2)
    await nextBtn(page).click()
    expect(await at(page), 'skipping 3 goes on to 4').toBe(3)

    await partial(page, 3)
    await expect(nextBtn(page), 'nothing lies ahead of the last exercise, so the button says so').toContainText('Finish')
    await nextBtn(page).click()
    expect(await finished(page), 'skipping the last exercise finishes — it does not wrap round to the undone ones behind it').toBe(true)
  })

  test('with every exercise only half done, Next walks forward once and finishes — it never cycles', async ({ page }) => {
    await startRunner(page, { n: 3 })
    await stubFinish(page)
    const visited = [await at(page)]
    for (let i = 0; i < 2; i++) {
      await partial(page, await at(page))
      await nextBtn(page).click()
      visited.push(await at(page))
    }
    expect(visited, 'each exercise once, in order').toEqual([0, 1, 2])
    await partial(page, 2)
    await expect(nextBtn(page)).toContainText('Finish')
    await nextBtn(page).click()
    expect(await finished(page), 'the third press finishes; a wrapping rule would have gone back to 1 and cycled for ever').toBe(true)
  })

  test('an interval block is complete only when its WORK rounds are — its warm-up and cool-down are logged as sets too', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => ({
      warmupOnly:   _isExerciseComplete({ targetSets: 3, loggedSets: [{ phase: 'warmup' }] }),
      warmupPlusTwo: _isExerciseComplete({ targetSets: 3, loggedSets: [{ phase: 'warmup' }, { phase: 'work' }, { phase: 'work' }] }),
      warmupOneRound: _isExerciseComplete({ targetSets: 1, loggedSets: [{ phase: 'warmup' }] }),
      allWork:      _isExerciseComplete({ targetSets: 3, loggedSets: [{ phase: 'warmup' }, { phase: 'work' }, { phase: 'work' }, { phase: 'work' }, { phase: 'cooldown' }] }),
      steadyCardio: _isExerciseComplete({ targetSets: 1, loggedSets: [{ duration: 600 }] }),   // no phase: an ordinary set
      nothingLogged: _isExerciseComplete({ targetSets: 2, loggedSets: [] }),
    }))
    expect.soft(r.warmupOnly, 'a warm-up alone is not a round of work').toBe(false)
    expect.soft(r.warmupPlusTwo, 'warm-up + 2 of 3 work rounds must NOT read as 3 of 3').toBe(false)
    expect.soft(r.warmupOneRound, 'warm-up on a one-round block').toBe(false)
    expect.soft(r.allWork, 'all three work rounds done').toBe(true)
    expect.soft(r.steadyCardio, 'an ordinary steady set counts').toBe(true)
    expect.soft(r.nothingLogged).toBe(false)
  })

  test('pressing Next while a rest is running: the rest bar and the Next bar both name the exercise the button goes to, and the rest keeps counting', async ({ page }) => {
    await startRunner(page)
    try {
      await complete(page, 0)
      await page.evaluate(() => runnerJumpTo(2))
      // Tick exercise 3's two sets FOR REAL: the second tick starts the rest, which is the common path.
      await page.evaluate(() => { _ensureTableRows(_runner.exercises[2]); _runner.exercises[2].tableRows.forEach(r => { r.weight = '20'; r.reps = '5' }); toggleTableSet(0); toggleTableSet(1) })
      expect(await page.evaluate(() => _runner.restRemaining != null), 'ticking the last set started a rest').toBe(true)

      // 1 and 4 are candidates; 2 is the lowest one still to do. A positional rule would say 4.
      await expect(page.locator('#rest-timer-overlay'), 'the rest bar names the same exercise the button goes to').toContainText('Next: Nav B')
      await expect(page.locator('#wr-cta-next'), 'and so does the Next bar at the bottom (the header no longer repeats it)').toContainText('Nav B')
      await nextBtn(page).click()
      const s = await page.evaluate(() => ({ idx: _runner.exIdx, resting: _runner.restRemaining != null, restFor: _runner._restForExIdx }))
      expect(s.idx, 'Next went to 2').toBe(1)
      expect(s.resting, 'the rest is still counting down').toBe(true)
      expect(s.restFor, 'and still belongs to exercise 3').toBe(2)
      await expect(page.locator('#workout-runner div[onclick="runnerJumpTo(2)"]'), 'the rest chip for 3 is showing').toHaveCount(1)
    } finally {
      await page.evaluate(() => { try { clearTimer(_runner._restInterval) } catch {} ; document.getElementById('rest-timer-overlay')?.remove() })
    }
  })

  test('on a long workout the current tab is scrolled into view — the tabs are the only way back', async ({ page }) => {
    await startRunner(page, { n: 12 })
    const visible = () => page.evaluate(() => {
      const s = document.getElementById('wr-tabs').getBoundingClientRect()
      const c = document.querySelector('#wr-tabs [aria-current="step"]').getBoundingClientRect()
      return c.left >= s.left - 1 && c.right <= s.right + 1
    })
    await page.evaluate(() => runnerJumpTo(10))
    // Precondition: the strip really does need scrolling here, or this test proves nothing.
    await page.evaluate(() => { document.getElementById('wr-tabs').scrollLeft = 0 })
    expect(await visible(), '12 tabs do not fit at phone width: unscrolled, tab 11 is off-screen').toBe(false)
    await page.evaluate(() => runnerJumpTo(9))
    expect(await visible(), 'after a render the current tab is brought into view').toBe(true)
  })

  test('there is no Back button — the numbered tabs are the way back', async ({ page }) => {
    await startRunner(page)
    await page.evaluate(() => runnerJumpTo(1))
    // Sanity: the jump actually landed on exercise 2 -- "Exercise N of M" itself was removed
    // 2026-09-30 (Jake: redundant now the numbered tabs show position), so the active tab is now
    // this test's own proof the render happened.
    await expect(page.locator('#wr-tabs button[aria-current="step"]')).toHaveText('2')
    await expect(page.locator('#workout-runner button[onclick="runnerGoBack()"]'), 'this used to render whenever you were past the first exercise').toHaveCount(0)
    await page.locator('#workout-runner button[onclick="runnerJumpTo(0)"]').click()
    expect(await at(page), 'tapping tab 1 goes back to exercise 1').toBe(0)
  })

  for (const name of ['Flat Bench Dumbbell Press', 'Single Arm Dumbbell Bent Over Row With Rotation']) {
    test(`the exercise name is shown in full, not cut off: "${name}"`, async ({ page }) => {
      await startRunner(page)
      await page.evaluate((name) => { _runner.exercises[1].name = name; _runner.lastSession[name] = null; runnerJumpTo(1) }, name)
      const fit = await page.evaluate((name) => {
        const el = [...document.querySelectorAll('#workout-runner div')].find(d => d.children.length === 0 && d.textContent.trim() === name)
        if (!el) return { missing: true }
        return { clipped: el.scrollHeight > el.clientHeight + 1, fontPx: parseFloat(getComputedStyle(el).fontSize) }
      }, name)
      expect(fit.missing, 'the title element was found').toBeUndefined()
      expect(fit.clipped, 'every line of the name is visible (it used to be capped at two lines with an ellipsis)').toBe(false)
      expect(fit.fontPx, 'shrunk to fit at most, never to unreadable').toBeGreaterThanOrEqual(15)
    })
  }

  // Was written against the live "vs last session" chips; those are gone (2026-10-03, the Stats sheet is the shared exercise
  // card), so the guard now covers the "Last time" line that replaced them. The same words must stay out of the sheet too -
  // that is pinned in tests/exercise-stats-shared-2026-10-03.spec.js, which reads the whole card.
  test('the last-time line no longer says "beat it"', async ({ page }) => {
    await startRunner(page)
    const html = await page.evaluate(() => {
      const ex = _runner.exercises[0]
      _runner.lastSession[ex.name] = { date: '2026-09-25', sets: [{ set_number: 1, weight_kg: 60, reps_achieved: 8 }] }
      return _renderLastTimeCard(ex)
    })
    expect(html.toLowerCase(), 'the line still renders').toContain('last time')
    expect(html.toLowerCase()).not.toContain('beat it')
  })

  test('every "which exercise is next" decision goes through _nextExerciseTarget — no positional look-ahead is left in the runner', async ({ page }) => {
    await loginAsPT(page)
    const src = await page.evaluate(async () => (await fetch('/js/app-runner.js')).text())
    expect(src, 'the shared function exists').toContain('function _nextExerciseTarget(')
    expect(src, 'no "the first exercise after this index" lookup remains — those made the rest bar and the auto-advance disagree with the Next button').not.toMatch(/i\s*>\s*_runner\.exIdx\s*&&\s*e\.name/)
  })
})

test.describe('Program day labels (2026-09-28)', () => {
  test('a day reads as its weekday plus its day number — Day 1 is Monday', async ({ page }) => {
    await loginAsPT(page)
    const labels = await page.evaluate(() => typeof _dayHeadingLabel === 'function'
      ? [1, 3, 5, 7, 9, '2'].map(_dayHeadingLabel) : null)
    expect(labels, '_dayHeadingLabel exists').not.toBeNull()
    expect(labels.slice(0, 4)).toEqual(['MONDAY · DAY 1', 'WEDNESDAY · DAY 3', 'FRIDAY · DAY 5', 'SUNDAY · DAY 7'])
    expect(labels[4], 'a day past 7 has no weekday — it must not print "undefined"').toBe('DAY 9')
    expect(labels[5], 'a numeric string is treated as the number').toBe('TUESDAY · DAY 2')
  })

  test('both places that list a program\'s days use it — none still prints the bare day number', async ({ page }) => {
    await loginAsPT(page)
    for (const file of ['app-workouts.js', 'app-programs.js']) {
      const src = await page.evaluate(async (f) => (await fetch('/js/' + f)).text(), file)
      // "${_dayHeadingLabel(" is the CALL inside a template — the function's own definition has no "${" before it,
      // so app-programs.js (which also defines it) cannot pass on the definition alone.
      expect(src, `${file} builds the day heading with _dayHeadingLabel`).toContain('${_dayHeadingLabel(')
      expect(src, `${file} no longer prints "DAY \${day}" on its own`).not.toMatch(/>DAY \$\{day\}</)
    }
  })
})
