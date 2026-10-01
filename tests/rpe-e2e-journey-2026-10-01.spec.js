// RPE top-set autoregulation — the END-TO-END journey for a COACH, by real clicks (2026-10-01).
//
// WHY THIS FILE EXISTS. Every earlier check of this feature reached it through a shortcut:
// startWorkoutRunner(clientId, templateId) via page.evaluate, showEditTemplateExerciseModal via
// page.evaluate, a DOM stub for the builder. Two review rounds then found those shortcuts had hidden real
// defects — the headline workflow (mark the top set, "Copy previous set", point the copy at "today's top
// set", save) was never pressed once, and it silently erased the backoff percentage.
//
// This drives the path a person takes, with clicks only for everything under test:
//   Workouts -> + New template -> + Add exercise -> pick -> TOP SET / RPE / Copy previous set / "% of today's
//   top set" -> Save  ->  Clients -> client -> Workouts tab -> Start workout -> pick the template -> Start ->
//   type weight/reps/RPE -> tick -> End -> Save workout -> "Save as my 1RM" -> look at the 1RMs tab,
// then checks what actually landed in the database. DB inserts are used ONLY for fixtures (a client and a
// library exercise) — never for the thing being tested.
//
// The build and run steps live in tests/rpe-journey-steps.js and are SHARED with the client and solo journeys
// (rpe-e2e-roles-2026-10-01.spec.js), so the three roles cannot drift apart.
//
// Set E2E_SHOTS=<dir> to also save phone-size screenshots at each stop, to be LOOKED AT: a passing assertion
// is not a mobile check.
const { test, expect } = require('./fixtures')
const { loginAsPT, clickVisible } = require('./helpers')
const S = require('./rpe-journey-steps')

let F = null   // the live fixture, read by cleanup even when the test threw

test.afterEach(async ({ page }) => {
  if (!F) return
  const f = F; F = null
  try {
    // Says what it removed: a cleanup that reports nothing is how 6,275 exercises built up unnoticed.
    const removed = await S.cleanupJourney(page, { tag: f.tag, exId: f.exId, fixtureClientId: f.clientId })
    console.log(`[rpe-journey] cleanup ${f.tag}: ${JSON.stringify(removed)}`)
  } catch (err) {
    console.warn(`[rpe-journey] CLEANUP FAILED for ${f.tag} — rows may remain in the test account:`, err.message)
  }
})

test.describe('RPE top set — real-click journey (coach)', () => {
  test('build -> assign -> run -> save -> accept the 1RM, as a coach', async ({ page }) => {
    await loginAsPT(page)
    const { tag, exName, tplName } = S.journeyTag('[E2E] RPE-Coach')
    // Fixtures only: a library exercise and a client of this test's own (never a borrowed one).
    const ids = await page.evaluate(async ({ tag, exName }) => {
      const { data: ex, error: exErr } = await db.from('exercises').insert({ coach_id: currentUser.id, name: exName, metric_type: 'weight_reps' }).select('id').single()
      if (exErr) return { error: 'exercise: ' + exErr.message }
      const { data: client, error: cErr } = await db.from('clients').insert({ coach_id: currentUser.id, full_name: tag + ' Client' }).select('id').single()
      if (cErr) return { error: 'client: ' + cErr.message }
      return { exId: ex.id, clientId: client.id }
    }, { tag, exName })
    expect(ids.error, 'fixture setup must succeed before any assertion runs').toBeUndefined()
    F = { tag, exName, tplName, clientName: tag + ' Client', ...ids }

    // ── 1. BUILD the template with real clicks ────────────────────────────────────────────────
    await clickVisible(page, '[data-page="workouts"]')
    await S.buildTopSetTemplate(page, { tplName, exName, shotPrefix: 'coach' })
    S.assertSavedShape(await S.readSavedTemplateExercise(page, exName), { exId: F.exId })

    // ── 2. START it for a client, the way a coach does ───────────────────────────────────────
    await clickVisible(page, '[data-page="clients"]')
    await page.locator('.list-row', { hasText: F.clientName }).click()
    await page.locator('button.tab-btn:has-text("Workouts")').click()
    await page.getByRole('button', { name: '▶ Start workout' }).click()
    await expect(page.locator('#runner-setup')).toBeVisible()
    await page.locator('#rs-template').selectOption({ label: tplName })
    await page.locator('#runner-setup button:has-text("▶ Start")').click()

    // ── 3. RUN it, FINISH, SAVE, accept the 1RM ───────────────────────────────────────────────
    await S.runTopSetSessionAndAccept1RM(page, { shotPrefix: 'coach' })

    // ── 4. What landed in the DATABASE ────────────────────────────────────────────────────────
    S.assertSessionResult(await S.readSessionResult(page, { clientId: F.clientId, exName }), { clientId: F.clientId, exId: F.exId })

    // ── 5. And it SHOWS where the coach looks for it ──────────────────────────────────────────
    await page.locator('#modal-post-session-1rm button:has-text("Done")').click()
    await page.locator('button.tab-btn:has-text("1RMs")').click()
    await expect(page.locator('#tab-content')).toContainText(exName)
    await S.shot(page, 'coach-1rms-tab')
  })
})
