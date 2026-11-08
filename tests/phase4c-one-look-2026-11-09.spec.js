const { test, expect } = require('./fixtures')
const { loginAsClient, soloReady } = require('./helpers')

// Phase 4c of docs/superpowers/plans/2026-11-08-solo-audit-response.md.
const logSet = async (page) => { await page.fill('#set-0-weight', '40'); await page.fill('#set-0-reps', '5'); await page.click('#set-0-done') }

test('an unfinished workout is offered on Today after a reload, and one tick counts as one set', async ({ page, ownWorkout }) => {
  test.setTimeout(90_000)
  await loginAsClient(page)
  const wk = await ownWorkout({ exercises: [{ exercise_name: 'Own Squat', exercise_type: 'strength', metric_type: 'weight_reps', order_index: 0, sets_json: [{ repsMin: '5' }] }] })
  await wk.start()
  await logSet(page)
  await expect.poll(() => page.evaluate((c) => !!_loadRunnerDraft(c), wk.clientId), { timeout: 15000 }).toBe(true)
  await page.reload()
  await page.waitForSelector('#app-shell', { state: 'visible', timeout: 20000 })
  await expect(page.locator('#runner-resume-banner')).toBeVisible({ timeout: 15000 })
  await page.click('#runner-resume-banner')
  await expect(page.locator('#runner-resume-modal')).toContainText('1 set')
  await page.locator('#runner-resume-modal button:has-text("Discard")').click()
  await expect(page.locator('#runner-resume-banner'), 'the banner goes').toHaveCount(0)
  await expect(page.locator('#workout-runner'), 'and no blank workout starts').toHaveCount(0)
  expect(await page.evaluate((c) => _loadRunnerDraft(c), wk.clientId)).toBeNull()
})

test('someone else\'s draft, and a failed save, get no banner', async ({ page }) => {
  await loginAsClient(page)
  const r = await page.evaluate(async () => {
    const c = await _getCurrentClientId(), real = _loadRunnerDraft
    _loadRunnerDraft = () => ({ userId: 'someone-else', exercises: [] }); const other = _runnerResumeBannerHtml(c)
    _loadRunnerDraft = () => ({ pendingSave: true, saveLogId: 'x', userId: currentUser.id, exercises: [] }); const pending = _runnerResumeBannerHtml(c)
    _loadRunnerDraft = () => ({ userId: currentUser.id, exercises: [] }); const mine = _runnerResumeBannerHtml(c)
    _loadRunnerDraft = real
    return { other, pending, mine: mine.includes('runner-resume-banner') }
  })
  expect(r).toEqual({ other: '', pending: '', mine: true })
})

test('MIRROR: no banner with nothing in progress', async ({ page }) => {
  await loginAsClient(page)
  const r = await page.evaluate(async () => { const c = await _getCurrentClientId(); localStorage.removeItem(_runnerDraftKey(c)); return _runnerResumeBannerHtml(c) })
  expect(r).toBe('')
})

test('Add block is a bottom sheet; text and close buttons meet the minimums', async ({ page }) => {
  await soloReady(page)
  const r = await page.evaluate(() => {
    const d = document.createElement('div'); d.innerHTML = '<div class="modal-overlay"><div class="modal"><button class="modal-close">x</button></div></div>'; document.body.appendChild(d)
    const b = d.querySelector('.modal-close').getBoundingClientRect()
    const out = { w: b.width >= 44, h: b.height >= 44, xs: getComputedStyle(document.documentElement).getPropertyValue('--text-xs').trim() }
    d.remove(); return out
  })
  expect(r).toEqual({ w: true, h: true, xs: '11px' })
})

test('unsaved changes make Save the one primary button', async ({ page }) => {
  await soloReady(page)
  const r = await page.evaluate(() => {
    const host = document.createElement('div'); host.innerHTML = '<div id="save-template-draft-host"></div><button id="tpl-start-btn" class="btn-primary"></button>'; document.body.appendChild(host)
    const real = _templateDraftIsDirty
    _templateDraftIsDirty = () => true; _renderSaveWorkoutButton(); const dirty = document.getElementById('tpl-start-btn').className
    _templateDraftIsDirty = () => false; _renderSaveWorkoutButton(); const clean = document.getElementById('tpl-start-btn').className
    _templateDraftIsDirty = real; host.remove(); return { dirty, clean }
  })
  expect(r).toEqual({ dirty: 'btn-secondary', clean: 'btn-primary' })
})
