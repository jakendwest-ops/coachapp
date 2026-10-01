// The runner's two destructive edits on a strength table, by real clicks (2026-10-01):
//   1. DELETING the top-set row mid-session;
//   2. CLEARING a field on a set that was already ticked, then finishing.
//
// Both were found by reading code during the RPE review round, filed as ledger rows, and left alone because each needed a
// decision. Neither had ever been pressed. The logic is pinned by tests-node/delete-table-row.test.mjs and
// tests-node/ticked-row-edit.test.mjs; this is the same two actions against the real page — real delete button, real
// typing into the real input, real End / Save — and what the database actually holds afterwards.
const { test, expect } = require('./fixtures')
const { loginAsPT, clickVisible } = require('./helpers')
const S = require('./rpe-journey-steps')

let F = null   // the live fixture, read by cleanup even when the test threw

test.afterEach(async ({ page }) => {
  if (!F) return
  const f = F; F = null
  try {
    const removed = await S.cleanupJourney(page, { tag: f.tag, exId: f.exId, fixtureClientId: f.clientId })
    console.log(`[runner-edit-delete] cleanup ${f.tag}: ${JSON.stringify(removed)}`)
  } catch (err) {
    console.warn(`[runner-edit-delete] CLEANUP FAILED for ${f.tag} — rows may remain in the test account:`, err.message)
  }
})

// Build the headline template (TOP SET 3 @ RPE 8, then 8 reps at 70% of today's top set) and open the runner on it.
async function openRunner(page, prefix) {
  await loginAsPT(page)
  const { tag, exName, tplName } = S.journeyTag(prefix)
  const ids = await page.evaluate(async ({ tag, exName }) => {
    const { data: ex, error: exErr } = await db.from('exercises').insert({ coach_id: currentUser.id, name: exName, metric_type: 'weight_reps' }).select('id').single()
    if (exErr) return { error: 'exercise: ' + exErr.message }
    const { data: client, error: cErr } = await db.from('clients').insert({ coach_id: currentUser.id, full_name: tag + ' Client' }).select('id').single()
    if (cErr) return { error: 'client: ' + cErr.message }
    return { exId: ex.id, clientId: client.id }
  }, { tag, exName })
  expect(ids.error, 'fixture setup must succeed before any assertion runs').toBeUndefined()
  F = { tag, exName, tplName, clientName: tag + ' Client', ...ids }

  await clickVisible(page, '[data-page="workouts"]')
  await S.buildTopSetTemplate(page, { tplName, exName })
  await S.readSavedTemplateExercise(page, exName)
  await clickVisible(page, '[data-page="clients"]')
  await page.locator('.list-row', { hasText: F.clientName }).click()
  await page.locator('button.tab-btn:has-text("Workouts")').click()
  await page.getByRole('button', { name: '▶ Start workout' }).click()
  await page.locator('#rs-template').selectOption({ label: tplName })
  await page.locator('#runner-setup button:has-text("▶ Start")').click()
  await expect(page.locator('#set-0-weight')).toBeVisible()
}

const tick = async (page, i, weight, reps, effort) => {
  await page.locator(`#set-${i}-weight`).fill(weight)
  await page.locator(`#set-${i}-reps`).fill(reps)
  if (effort !== undefined) await page.locator(`#set-${i}-effort`).fill(effort)
  await page.locator(`#set-${i}-done`).click()
}

test.describe('runner — destructive edits on a strength table', () => {
  test('deleting the TOP-SET row leaves no top set: no estimate chip, no computed backoff, an honest note', async ({ page }) => {
    await openRunner(page, '[E2E] RunnerDelTop')
    await tick(page, 0, '100', '3', '8')
    await expect(page.locator('#ex-e1rm-chip')).toContainText('115.9')
    await expect(page.locator('#set-1-weight'), 'the backoff resolves from the top set: 70% of 115.9').toHaveAttribute('placeholder', '80')

    await page.locator('button[aria-label="Delete set 1"]').click()

    await expect(page.locator('#ex-e1rm-chip'), 'the estimate came from the deleted set — it must go with it').toBeHidden()
    await expect(page.locator('#set-0-basis-note'), 'the old backoff is row 0 now; telling the lifter to "log the top set" would send them after a set that does not exist')
      .toContainText('No top set left')
    await expect(page.locator('#set-0-weight'), 'and it must not keep a load computed from the deleted set').not.toHaveAttribute('placeholder', '80')
    await expect(page.locator('#set-1-weight'), 'one row was deleted, so there is one row left').toHaveCount(0)
  })

  test('clearing the reps of a TICKED set before finishing: that set is not saved as a weight with no reps', async ({ page }) => {
    await openRunner(page, '[E2E] RunnerClearTick')
    await tick(page, 0, '100', '3', '8')
    await tick(page, 1, '80', '8')
    // the deliberate edit after the tick: wipe the reps of the backoff
    await page.locator('#set-1-reps').fill('')

    await page.locator('button[onclick="confirmEndRunner()"]').click()
    await expect(page.locator('#workout-runner')).toContainText('Workout complete')
    // Jake chose "warn": the set that was left out is SAID, on the finish screen, before Save — never a silent loss.
    await expect(page.locator('#wr-dropped-note'), 'the finish screen must say a ticked set was left out').toContainText('1 ticked set was left out')
    await page.locator('button[onclick="saveRunnerSession()"]').click()
    await expect(page.locator('#modal-post-session-1rm')).toBeVisible()
    await page.locator('#modal-post-session-1rm button:has-text("Done")').click()

    const r = await S.readSessionResult(page, { clientId: F.clientId, exName: F.exName })
    expect(r.sets.length, 'exactly the one complete set — a half-cleared set must not be stored').toBe(1)
    expect(Number(r.sets[0].weight_kg)).toBe(100)
    expect(r.sets[0].reps_achieved).toBe(3)
  })
})
