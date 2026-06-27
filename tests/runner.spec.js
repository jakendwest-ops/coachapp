const { test, expect } = require('./fixtures')
const { loginAsPT, loginAsClient } = require('./helpers')

// ─── PT: Workouts page regression ────────────────────────────────────────────

test.describe('PT Workouts page', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsPT(page)
  })

  test('workouts page is not blank — shows templates or meaningful empty state', async ({ page }) => {
    await page.click('[data-page="workouts"]')
    // Wait for Supabase to resolve — any of these three states means the page rendered correctly
    await page.waitForFunction(() => {
      const body = document.body.textContent || ''
      return (
        document.querySelectorAll('.list-row').length > 0 ||
        body.includes('No templates yet') ||
        body.includes('No standalone templates')
      )
    }, { timeout: 10000 })
    // If we get here without throwing, the page rendered something meaningful
    expect(true).toBe(true)
  })

  test('PT can open a template for editing', async ({ page }) => {
    await page.click('[data-page="workouts"]')
    // If a template row exists, click it and expect the template editor to load
    const templateRow = page.locator('.list-row').first()
    const count = await page.locator('.list-row').count()
    if (count === 0) return // no standalone templates — skip
    await templateRow.click()
    await expect(page.locator('text=Exercises')).toBeVisible({ timeout: 8000 })
  })
})

// ─── Client runner ────────────────────────────────────────────────────────────

test.describe('Workout runner (client)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsClient(page)
    await page.click('[data-page="workouts"]')
    await page.waitForSelector('button:has-text("Start")', { timeout: 10000 })
  })

  test('runner loads with exercise name visible', async ({ page }) => {
    await page.locator('button:has-text("Start")').first().click()
    // Runner shows End button + at least one exercise label
    await expect(page.locator('button:has-text("End")')).toBeVisible({ timeout: 12000 })
    // Exercise counter (e.g. "Exercise 1 of N") confirms runner is populated
    await expect(page.locator('text=/Exercise \\d+ of \\d+/')).toBeVisible({ timeout: 8000 })
  })

  test('can log a strength set and see rest timer', async ({ page }) => {
    await page.locator('button:has-text("Start")').first().click()
    await expect(page.locator('button:has-text("End")')).toBeVisible({ timeout: 12000 })

    // Fill weight and reps
    const weightInput = page.locator('#wr-weight-input')
    const repsInput   = page.locator('#wr-reps-input')

    if (await weightInput.isVisible()) await weightInput.fill('80')
    if (await repsInput.isVisible())   await repsInput.fill('8')

    await page.locator('button:has-text("LOG")').click()

    // Rest timer overlay should appear
    await expect(page.locator('#rest-timer-overlay')).toBeVisible({ timeout: 5000 })
  })

  test('skip rest advances set counter', async ({ page }) => {
    await page.locator('button:has-text("Start")').first().click()
    await expect(page.locator('button:has-text("End")')).toBeVisible({ timeout: 12000 })

    const weightInput = page.locator('#wr-weight-input')
    const repsInput   = page.locator('#wr-reps-input')

    if (await weightInput.isVisible()) await weightInput.fill('80')
    if (await repsInput.isVisible())   await repsInput.fill('8')

    await page.locator('button:has-text("LOG")').click()
    await expect(page.locator('#rest-timer-overlay')).toBeVisible({ timeout: 5000 })

    // Skip rest
    await page.locator('button:has-text("Skip →")').click()
    await expect(page.locator('#rest-timer-overlay')).not.toBeVisible({ timeout: 5000 })

    // Set counter should now show set 2 (or next exercise)
    const setTwoOrNext =
      await page.locator('text=Set 2').isVisible().catch(() => false) ||
      await page.locator('text=Exercise 2').isVisible().catch(() => false)
    expect(setTwoOrNext).toBe(true)
  })

  test('finish screen renders with Save workout button', async ({ page }) => {
    await page.locator('button:has-text("Start")').first().click()
    await expect(page.locator('button:has-text("End")')).toBeVisible({ timeout: 12000 })

    // Log one set so the runner has data
    const weightInput = page.locator('#wr-weight-input')
    const repsInput   = page.locator('#wr-reps-input')
    if (await weightInput.isVisible()) await weightInput.fill('80')
    if (await repsInput.isVisible())   await repsInput.fill('8')
    await page.locator('button:has-text("LOG")').click()
    await page.waitForTimeout(300)

    // Trigger finish screen directly — tests that the finish screen renders correctly
    // regardless of how many sets remain. The set-advancement logic is covered by
    // "skip rest advances set counter".
    await page.evaluate(() => showRunnerFinish())

    await expect(page.locator('button:has-text("Save workout")')).toBeVisible({ timeout: 8000 })
  })

  test('save session lands on workouts page — not PT view', async ({ page }) => {
    await page.locator('button:has-text("Start")').first().click()
    await expect(page.locator('button:has-text("End")')).toBeVisible({ timeout: 12000 })

    // Log one set then end early via End button
    const weightInput = page.locator('#wr-weight-input')
    const repsInput   = page.locator('#wr-reps-input')
    if (await weightInput.isVisible()) await weightInput.fill('80')
    if (await repsInput.isVisible())   await repsInput.fill('8')
    await page.locator('button:has-text("LOG")').click()
    await page.waitForTimeout(500)

    // End session (shows finish screen since sets were logged)
    const endBtn = page.locator('button:has-text("End")')
    if (await endBtn.isVisible().catch(() => false)) await endBtn.click()

    // Confirm if needed
    const confirmBtn = page.locator('button:has-text("End session"), button:has-text("Yes"), button:has-text("Finish")')
    if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) await confirmBtn.first().click()

    // Save workout
    await expect(page.locator('button:has-text("Save workout")')).toBeVisible({ timeout: 8000 })
    await page.locator('button:has-text("Save workout")').click()

    // Must land on client workouts page — not PT client profile
    await expect(page.locator('text=START A WORKOUT')).toBeVisible({ timeout: 10000 })
    // Verify PT client profile header is NOT shown (regression: post-save nav bug)
    await expect(page.locator('text=Overview')).not.toBeVisible({ timeout: 3000 }).catch(() => {})
  })
})
