const { test, expect } = require('./fixtures')
const { loginAsClient, acceptConfirm, declineConfirm } = require('./helpers')

// ─── Jake, 2026-10-11 ─────────────────────────────────────────────────────────────────────────────────────────────────────────
//
// "Has this ever actually been used? I don't think it should display in full, I think it should be asked to the user 'do you wish to view/update
// your new predicted 1rm's' or something like that."  (His saved 1RMs are all whole numbers typed by hand, so none came from the dialog; and it
// fired for a 1 kg x 5 test because the lift's name did not match the stored 1RM's, so the app thought he had none.)
//
// After a session that points to a new estimated 1RM the runner now asks one short question first; the full list opens only on "View". Fixtures
// are the ownWorkout fixture's (it removes the logs by name); nothing here saves a 1RM, so there is nothing else to clean up.

const LIFT = [{
  exercise_name: 'Own Squat', exercise_type: 'strength', metric_type: 'weight_reps', order_index: 0,
  sets_json: [{ repsMin: '5' }, { repsMin: '5' }]
}]

async function logSet (page, i, weight, reps) {
  await page.fill(`#set-${i}-weight`, String(weight))
  await page.fill(`#set-${i}-reps`, String(reps))
  await page.click(`#set-${i}-done`)
}
const saveFinished = (page) => expect.poll(() => page.evaluate(() => typeof _runner === 'undefined' || _runner === null), { message: 'the save finished' }).toBe(true)

test.describe('The post-session 1RM estimate asks first (2026-10-11)', () => {
  test('a session that points to a new 1RM asks a short question, and the list is NOT shown; "Not now" goes on without saving anything', async ({ page, ownWorkout }) => {
    test.setTimeout(120_000)
    await loginAsClient(page)
    const wk = await ownWorkout({ exercises: LIFT })
    await wk.start()
    await logSet(page, 0, 100, 5)
    await page.evaluate(() => saveRunnerSession())
    await expect(page.locator('#confirm-dialog'), 'a question, not the list').toBeVisible()
    await expect(page.locator('#confirm-dialog')).toContainText('estimated 1RM')
    await expect(page.locator('#confirm-dialog'), 'the question itself says the workout is saved').toContainText('Workout saved')
    // Counted at once, not with toHaveCount(0): that retries, and the toast would be gone by itself after 2.5 s. Seen on a phone: it covered the question's last line.
    expect(await page.locator('#app-toast').count(), 'the "Workout saved!" toast is not left on top of the question').toBe(0)
    await expect(page.locator('#modal-post-session-1rm'), 'the full list is not shown by itself').toHaveCount(0)
    await declineConfirm(page)                                            // "Not now"
    await expect(page.locator('#modal-post-session-1rm')).toHaveCount(0)
    await expect(page.locator('h1'), 'it goes on to the Workouts page, as it does after the list').toContainText('Workouts', { timeout: 12000 })
    const saved = await page.evaluate(async (name) => {
      const { data } = await db.from('client_1rms').select('id').eq('exercise_name', name)
      return (data || []).length
    }, wk.exerciseNames[0])
    expect(saved, 'declining saved no 1RM').toBe(0)
  })

  test('"View" opens the full list with the estimate, and Done goes on to the Workouts page', async ({ page, ownWorkout }) => {
    test.setTimeout(120_000)
    await loginAsClient(page)
    const wk = await ownWorkout({ exercises: LIFT })
    await wk.start()
    await logSet(page, 0, 100, 5)
    await page.evaluate(() => saveRunnerSession())
    await acceptConfirm(page)                                             // "View"
    await expect(page.locator('#modal-post-session-1rm')).toBeVisible()
    await expect(page.locator('#psorm-estimate-0')).toContainText('116')
    await page.locator('#modal-post-session-1rm button:has-text("Done")').click()
    await expect(page.locator('h1')).toContainText('Workouts', { timeout: 12000 })
  })

  // Found by the 2026-10-11 review: navigate() sweeps every open overlay, which resolves the question false ("Not now"), and "Not now" routes on to
  // the Workouts page. So leaving by another route (browser Back, code) was followed by a SECOND navigation the athlete never asked for.
  test('leaving the page while the question is open does not send the athlete on to Workouts as well', async ({ page, ownWorkout }) => {
    test.setTimeout(120_000)
    await loginAsClient(page)
    const wk = await ownWorkout({ exercises: LIFT })
    await wk.start()
    await logSet(page, 0, 100, 5)
    await page.evaluate(() => saveRunnerSession())
    await expect(page.locator('#confirm-dialog')).toBeVisible()
    await page.evaluate(() => navigate('calendar'))                                       // somewhere else, by a route that is not the question
    await expect(page.locator('#confirm-dialog'), 'the navigation swept the question away').toHaveCount(0)
    await page.evaluate(() => new Promise(r => setTimeout(r, 0)))                          // let the swept question's continuation run
    expect(await page.evaluate(() => currentPage), 'and the athlete is still where they went, not pulled to Workouts').toBe('calendar')
  })

  test('a session with no new estimate to offer (sets above 10 reps) asks nothing', async ({ page, ownWorkout }) => {
    test.setTimeout(120_000)
    await loginAsClient(page)
    const wk = await ownWorkout({ exercises: LIFT })
    await wk.start()
    await logSet(page, 0, 100, 12)
    await page.evaluate(() => saveRunnerSession())
    await saveFinished(page)
    await expect(page.locator('h1')).toContainText('Workouts', { timeout: 12000 })
    await expect(page.locator('#confirm-dialog')).toHaveCount(0)
    await expect(page.locator('#modal-post-session-1rm')).toHaveCount(0)
  })
})
