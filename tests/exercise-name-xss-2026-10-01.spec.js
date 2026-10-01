// Hostile exercise names — through every surface the RPE top-set feature touches (2026-10-01).
//
// THE ATTACK. A CLIENT can create exercises in their COACH's library: the runner's "Add exercise" runs
// _createExerciseFromPicker with coach_id = their coach, and the INSERT is permitted (it is how 6,275 test
// exercises landed on the coach's account). So an exercise NAME is client-authored text that is later rendered
// on the COACH's screens — the stored-XSS class this app's own ledger says it has shipped seven times.
//
// This is not hypothetical decoration: the post-session 1RM modal embeds the name INSIDE an inline onclick
// handler's JS string, so a name containing a quote can either inject code or merely break the Save button.
// Both are checked: nothing executes, AND the button still works and stores the name exactly as typed.
//
// "Nothing executes" is checked two ways, because an absence needs more than a wait: no element the payload
// would create exists (<img src=x>, <svg onload>), and the canary window.__xss was never set.
const { test, expect } = require('./fixtures')
const { loginAsPT, loginAsClient, clickVisible } = require('./helpers')
const S = require('./rpe-journey-steps')

// Every payload class that matters: markup injection, an attribute breakout, and a JS-string breakout (the one
// that targets the onclick handler). The leading text keeps the name readable when it is rendered literally.
const HOSTILE = `<img src=x onerror="window.__xss=1"> O'Neil "Press" ');window.__xss=3;('`

const pending = []

test.afterEach(async ({ browser }) => {
  if (!pending.length) return
  const jobs = pending.splice(0)
  const ctx = await browser.newContext()
  try {
    const page = await ctx.newPage()
    await loginAsPT(page)
    for (const j of jobs) {
      try { console.log(`[xss] cleanup ${j.tag}: ${JSON.stringify(await S.cleanupJourney(page, j))}`) }
      catch (err) { console.warn(`[xss] CLEANUP FAILED for ${j.tag} — rows may remain in the test account:`, err.message) }
    }
  } finally {
    try { await ctx.close() } catch (err) { console.warn('[xss] could not close the cleanup context:', err.message) }
  }
})

// Did the payload run, or create an element? Settles first, because an <img onerror> fires asynchronously.
async function assertInert(page, where) {
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => setTimeout(r, 300))))
  const r = await page.evaluate(() => ({
    ran: window.__xss ?? null,
    injected: document.querySelectorAll('img[src="x"], svg[onload]').length
  }))
  expect(r.ran, `${where}: the payload EXECUTED (window.__xss = ${r.ran})`).toBeNull()
  expect(r.injected, `${where}: the payload created a live element`).toBe(0)
}

test.describe('hostile exercise names', () => {
  test("a CLIENT-authored hostile exercise is inert on every coach screen it reaches", async ({ browser }) => {
    const { tag, exName } = S.journeyTag('[E2E] RPE-XSS', HOSTILE)
    const ptCtx = await browser.newContext()
    const clCtx = await browser.newContext()
    try {
      const pt = await ptCtx.newPage(); await loginAsPT(pt)
      const cl = await clCtx.newPage(); await loginAsClient(cl)
      pending.push({ tag })

      // The attack: the client creates the exercise through the app's own create path, for their coach's library.
      const created = await cl.evaluate(async (name) => {
        const { data: row } = await db.from('clients').select('coach_id').eq('user_id', currentUser.id).not('coach_id', 'is', null).maybeSingle()
        window.__picked = null
        _exercisePickerState = { coachId: row.coach_id, onPick: ex => { window.__picked = ex }, allExercises: [] }
        await _createExerciseFromPicker(name)
        return window.__picked
      }, exName)
      test.skip(!created?.id, 'a client cannot create exercises in the coach library on this deployment — nothing to attack with')
      expect(created.name, 'stored exactly as typed — escaping belongs at RENDER time, never by mangling the data').toBe(exName)
      await assertInert(cl, "the client's own screen")

      // 1. the coach's Library page
      await clickVisible(pt, '[data-page="workouts"]')
      const libText = await pt.evaluate(async (tag) => {
        const el = document.createElement('div'); document.body.appendChild(el)
        await renderExerciseLibrary(el)
        const found = el.textContent.includes(tag)
        el.remove()
        return found
      }, tag)
      expect(libText, 'the hostile name must be listed — as TEXT').toBe(true)
      await assertInert(pt, 'Library page')

      // 2. the coach's exercise picker, typing to find it
      await pt.evaluate(() => { window.__picked = null; _openExercisePicker(currentUser.id, ex => { window.__picked = ex }) })
      await pt.locator('#exp-search').fill(tag)
      await expect(pt.locator('#exp-results')).toContainText(`O'Neil "Press"`)
      await assertInert(pt, 'exercise picker')
      await pt.locator('#exp-results').getByText(exName, { exact: true }).click()
      expect((await pt.evaluate(() => window.__picked))?.name, 'the picker handler must still pick it — a quote must not break it').toBe(exName)
    } finally {
      for (const c of [ptCtx, clCtx]) { try { await c.close() } catch (err) { console.warn('[xss] could not close a context:', err.message) } }
    }
  })

  test('a hostile name runs the WHOLE coach journey: builder, runner, finish, the 1RM modal — inert, and the Save button still works', async ({ page }) => {
    await loginAsPT(page)
    const { tag, exName, tplName } = S.journeyTag('[E2E] RPE-XSS2', HOSTILE)
    const exId = await page.evaluate(async (exName) => {
      const { data, error } = await db.from('exercises').insert({ coach_id: currentUser.id, name: exName, metric_type: 'weight_reps' }).select('id').single()
      if (error) throw new Error('fixture exercise: ' + error.message)
      return data.id
    }, exName)
    const clientId = await page.evaluate(async (tag) => {
      const { data, error } = await db.from('clients').insert({ coach_id: currentUser.id, full_name: tag + ' Client' }).select('id').single()
      if (error) throw new Error('fixture client: ' + error.message)
      return data.id
    }, tag)
    pending.push({ tag, exId, fixtureClientId: clientId })

    await clickVisible(page, '[data-page="workouts"]')
    await S.buildTopSetTemplate(page, { tplName, exName })
    S.assertSavedShape(await S.readSavedTemplateExercise(page, exName), { exId })
    await assertInert(page, 'the builder and the saved template')

    await clickVisible(page, '[data-page="clients"]')
    await page.locator('.list-row', { hasText: tag + ' Client' }).click()
    await page.locator('button.tab-btn:has-text("Workouts")').click()
    await page.getByRole('button', { name: '▶ Start workout' }).click()
    await page.locator('#rs-template').selectOption({ label: tplName })
    await page.locator('#runner-setup button:has-text("▶ Start")').click()

    // The runner, finish screen and the 1RM modal. runTopSetSessionAndAccept1RM CLICKS "Save as my 1RM": that
    // handler has the exercise name inside a JS string in an onclick attribute, so a name that breaks out of it
    // would make the click do nothing (the helper fails: the row would not go) — or run code (assertInert fails).
    await S.runTopSetSessionAndAccept1RM(page)
    await assertInert(page, 'the runner, the finish screen and the 1RM modal')

    const r = await S.readSessionResult(page, { clientId, exName })
    S.assertSessionResult(r, { clientId, exId })
    expect(r.rms[0].exercise_name, 'the 1RM is stored under the name exactly as typed').toBe(exName)

    await page.locator('#modal-post-session-1rm button:has-text("Done")').click()
    await page.locator('button.tab-btn:has-text("1RMs")').click()
    await expect(page.locator('#tab-content')).toContainText(`O'Neil "Press"`)
    await assertInert(page, 'the client 1RMs tab')
  })
})
