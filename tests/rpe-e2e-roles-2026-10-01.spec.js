// RPE top-set autoregulation — the other two roles, end to end, by real clicks (2026-10-01).
//
// The coach journey (rpe-e2e-journey-2026-10-01.spec.js) proves the headline workflow for a coach. This runs the
// SAME steps (tests/rpe-journey-steps.js) as the roles that have bitten this project before:
//
//   CLIENT  — the coach builds the template in the UI; then the CLIENT, in their own session, taps Start on it from
//             their own Workouts page and saves a 1RM. All real clicks. (A client with no active programme sees the
//             coach's standalone library templates listed there, each with ▶ Start — renderClientWorkoutsPage's
//             fallback — so the template the coach just built is simply on their page.) A client saving "Save as my
//             1RM" depends on an RLS INSERT policy on client_1rms that no earlier test has exercised for this feature.
//   SOLO    — the master account's personal view does everything alone. Solo shares the coach's auth.uid() and its
//             `clients` row has coach_id = NULL: four shipped bugs have had exactly that shape, and a coach_id
//             filter silently excludes it.
//
// Cleanup removes ONLY rows carrying this run's unique [E2E] tag, as the coach/owner. It never deletes a client
// record: the client journey uses the shared E2E client, and the solo journey the real solo record.
const { test, expect } = require('./fixtures')
const { loginAsPT, loginAsClient, clickVisible, soloNav } = require('./helpers')
const S = require('./rpe-journey-steps')

const pending = []   // { tag, exId } to clean up as the owner, even when the test threw

test.afterEach(async ({ browser }) => {
  if (!pending.length) return
  const jobs = pending.splice(0)
  const ctx = await browser.newContext()
  try {
    const page = await ctx.newPage()
    await loginAsPT(page)
    for (const j of jobs) {
      try {
        const removed = await S.cleanupJourney(page, j)
        // Say what was removed. A cleanup that reports nothing is how 6,275 rows built up unnoticed.
        console.log(`[rpe-roles] cleanup ${j.tag}: ${JSON.stringify(removed)}`)
      } catch (err) {
        console.warn(`[rpe-roles] CLEANUP FAILED for ${j.tag} — rows may remain in the test account:`, err.message)
      }
    }
  } finally {
    try { await ctx.close() } catch (err) { console.warn('[rpe-roles] could not close the cleanup context:', err.message) }
  }
})

test.describe('RPE top set — client', () => {
  test('a coach builds it, a CLIENT runs it from their own page, and the 1RM saves against the client\'s own record', async ({ browser }) => {
    const { tag, exName, tplName } = S.journeyTag('Client')
    const ptCtx = await browser.newContext()
    const clCtx = await browser.newContext()
    try {
      // ── the coach builds the workout, in the UI ───────────────────────────────────────────────
      const pt = await ptCtx.newPage()
      await loginAsPT(pt)
      const exId = await pt.evaluate(async (exName) => {
        const { data, error } = await db.from('exercises').insert({ coach_id: currentUser.id, name: exName, metric_type: 'weight_reps' }).select('id').single()
        if (error) throw new Error('fixture exercise: ' + error.message)
        return data.id
      }, exName)
      pending.push({ tag, exId })
      await clickVisible(pt, '[data-page="workouts"]')
      await S.buildTopSetTemplate(pt, { tplName, exName })
      S.assertSavedShape(await S.readSavedTemplateExercise(pt, exName), { exId })

      // ── the CLIENT, in their own session ──────────────────────────────────────────────────────
      const cl = await clCtx.newPage()
      await loginAsClient(cl)
      const clientId = await cl.evaluate(async () => {
        const { data } = await db.from('clients').select('id').eq('user_id', currentUser.id).not('coach_id', 'is', null).maybeSingle()
        return data?.id
      })
      expect(clientId, 'the E2E client must have a coached client record').toBeTruthy()

      // The template the coach just built, by id — so the client taps THAT one's Start, not "whichever is first".
      const tplId = await pt.evaluate(async (tplName) => {
        const { data } = await db.from('workout_templates').select('id').eq('name', tplName).is('client_id', null).single()
        return data.id
      }, tplName)

      // A real click on the client's own Start button for that template.
      await clickVisible(cl, '[data-page="workouts"]')
      await expect(cl.locator(`button[onclick*="${tplId}"]`),
        "the client's own Workouts page must list the coach's template (needs a client with NO active programme — otherwise the page lists programme workouts instead)").toBeVisible()
      await cl.locator(`button[onclick*="${tplId}"]`).click()

      await S.runTopSetSessionAndAccept1RM(cl, { shotPrefix: 'client' })

      // ── what landed, read by the COACH (who owns the client) ──────────────────────────────────
      S.assertSessionResult(await S.readSessionResult(pt, { clientId, exName }), { clientId, exId })
    } finally {
      for (const c of [ptCtx, clCtx]) {
        try { await c.close() } catch (err) { console.warn('[rpe-roles] could not close a browser context:', err.message) }
      }
    }
  })
})

test.describe('RPE top set — solo', () => {
  test('the personal (solo) view builds, runs and saves the whole workflow against the solo record', async ({ page }) => {
    await loginAsPT(page)
    const soloId = await page.evaluate(() => window._soloClientId || null)
    test.skip(!soloId, 'no solo client record on this account')

    const { tag, exName, tplName } = S.journeyTag('Solo')
    await clickVisible(page, ['#vs-personal', '#mvs-personal'])
    await expect(page.locator('.solo-lower')).toBeVisible()

    const exId = await page.evaluate(async (exName) => {
      const { data, error } = await db.from('exercises').insert({ coach_id: currentUser.id, is_personal: true, name: exName, metric_type: 'weight_reps' }).select('id').single()
      if (error) throw new Error('fixture exercise: ' + error.message)
      return data.id
    }, exName)
    pending.push({ tag, exId })

    // Templates live under LIBRARY in the solo nav (Workouts there is just recent sessions) — found by looking, not guessing.
    await soloNav(page, 'library')
    await S.buildTopSetTemplate(page, { tplName, exName, shotPrefix: 'solo' })
    S.assertSavedShape(await S.readSavedTemplateExercise(page, exName), { exId })

    // The saved template's page offers ▶ Start for the solo record (app-workouts.js, the solo branch).
    await page.locator('button:has-text("▶ Start"):visible').first().click()
    await S.runTopSetSessionAndAccept1RM(page, { shotPrefix: 'solo' })

    S.assertSessionResult(await S.readSessionResult(page, { clientId: soloId, exName }), { clientId: soloId, exId })
  })
})
