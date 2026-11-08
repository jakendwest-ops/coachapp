const { test, expect } = require('./fixtures')
const { soloReady, soloNav } = require('./helpers')

// Phase 4a of docs/superpowers/plans/2026-11-08-solo-audit-response.md.
test.describe('Fewer taps to build', () => {
  test.setTimeout(120_000)
  const tag = '[E2E] taps ' + Date.now()
  const cleanup = (page) => page.evaluate(async (tag) => {
    const uid = currentUser.id
    const p = (await db.from('programs').select('id').eq('coach_id', uid).like('name', tag + '%')).data || []
    for (const x of p) { await db.from('program_phases').delete().eq('program_id', x.id).select('id'); await db.from('programs').delete().eq('id', x.id).select('id') }
    await db.from('workout_templates').delete().eq('coach_id', uid).like('name', tag + '%').select('id')
    await db.from('exercises').delete().eq('coach_id', uid).like('name', tag + '%').select('id')
  }, tag)
  test.beforeEach(async ({ page }) => { await soloReady(page) })
  test.afterEach(async ({ page }) => { await cleanup(page) })

  test('a new lift opens at 3 sets, and Add another goes straight back to the search', async ({ page }) => {
    const id = await page.evaluate(async (name) => {
      const t = (await db.from('workout_templates').insert({ coach_id: currentUser.id, name, is_personal: true }).select('id').single()).data
      await openTemplate(t.id)
      return t.id
    }, tag + ' w')
    await page.evaluate((id) => showAddExerciseToTemplateModal(id), id)
    await expect.poll(() => page.evaluate(() => !!_exercisePickerState?.loaded), { timeout: 30000 }).toBe(true)
    await page.fill('#exp-search', tag + ' one'); await page.locator('#exp-search').press('Enter')
    await expect(page.locator('#att-confirm-btn')).toBeVisible()
    expect(await page.evaluate(() => window._templateSets.length)).toBe(3)
    await page.click('#att-add-another')
    await expect(page.locator('#exp-search')).toBeVisible()
    expect(await page.evaluate(() => window._templateDraft.exercises.length)).toBe(1)
    await page.locator('#exercise-picker-modal button:has-text("✕")').first().click()
  })

  test('MIRROR: an interval keeps one starting row and the runner add has no Add another', async ({ page }) => {
    const r = await page.evaluate(() => {
      window._templateDraft = { exercises: [] }
      _showExerciseSetsModal({ targetId: 't', runnerCtx: null, coachId: 'c', picked: { id: 'x', name: 'Row' }, existingType: 'interval' })
      const interval = window._templateSets.length
      closeModal('add-to-template-modal')
      _showExerciseSetsModal({ targetId: 't', runnerCtx: { mode: 'add' }, coachId: 'c', picked: { id: 'x', name: 'Row' }, existingType: 'weight_reps' })
      const runner = [window._templateSets.length, !!document.getElementById('att-add-another')]
      closeModal('add-to-template-modal')
      return { interval, runner }
    })
    expect(r).toEqual({ interval: 1, runner: [1, false] })
  })

  test('a solo plan is made with its first block and the length you asked for', async ({ page }) => {
    await soloNav(page, 'programs')
    await page.click('button:has-text("+ New plan"):visible')
    await expect(page.locator('#pm-weeks')).toHaveValue('4')
    await page.fill('#pm-name', tag + ' plan'); await page.fill('#pm-weeks', '6')
    await page.click('#pm-save-btn')
    await expect(page.locator('.pgm-facts')).toContainText('1 block · 6 weeks', { timeout: 10000 })
  })

  test('the plan length is refused when it makes no sense', async ({ page }) => {
    await soloNav(page, 'programs')
    await page.click('button:has-text("+ New plan"):visible')
    await page.fill('#pm-name', tag + ' bad'); await page.fill('#pm-weeks', '0')
    await page.click('#pm-save-btn')
    await expect(page.locator('#pm-error')).toContainText('between 1 and 52')
  })

  test('the plan page can still open its Edit sheet', async ({ page }) => {
    const id = await page.evaluate(async (name) => (await db.from('programs').insert({ coach_id: currentUser.id, name, is_personal: true }).select('id').single()).data.id, tag + ' edit')
    await page.evaluate(async (id) => { await openProgram(id); showEditProgramModal(id, 'A name', 'A description') }, id)
    await expect(page.locator('#program-modal')).toBeVisible()
    await expect(page.locator('#pm-name')).toHaveValue('A name')
  })

  test('a plan already running means the new one starts today', async ({ page }) => {
    const v = await page.evaluate(async () => {
      const real = _otherPlansOf, el = document.createElement('div')
      el.innerHTML = '<p id="apc-replaces" hidden></p><input id="apc-start" value="2099-01-05">'; document.body.appendChild(el)
      _otherPlansOf = async () => [{ name: 'Old plan' }]
      await _showReplacedPlans('x')
      const value = document.getElementById('apc-start').value
      _otherPlansOf = real; el.remove()
      return value === _ymdLocal(new Date())
    })
    expect(v).toBe(true)
  })

  test('next Monday, and today when today is a Monday', async ({ page }) => {
    expect(await page.evaluate(() => ['2026-11-09', '2026-11-10', '2026-11-15'].map(_nextMondayYmd))).toEqual(['2026-11-09', '2026-11-16', '2026-11-16'])
  })
})
