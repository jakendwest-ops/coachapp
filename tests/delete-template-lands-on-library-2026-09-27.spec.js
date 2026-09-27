const { test, expect } = require('./fixtures')
const { loginAsPT, acceptConfirm } = require('./helpers')

// Ledger row 2026-07-13-deleting-a-workout-template-from-the-templates-page-drops-yo (Jake-reported):
// "deleting a workout template from the templates page falls back to the workouts page."
//
// It is a SOLO bug. A coach's builder IS the `workouts` page, so for a coach it looks like a non-bug.
// In Personal view the builder lives on `library` and `workouts` is the read-only session accordion,
// so the old hardcoded navigate('workouts') ejected a solo user out of the Library after every delete.
// The fix (commit 134140f) returns via _templateGoBack, whose fallback for solo is `library`.
//
// Written 2026-09-27 to close the row on evidence (closure rule b): red with the old navigate('workouts')
// put back, green with the fix. Owns its fixture: a tagged personal template, deleted by the test itself.
const TAG = '[E2E-DELNAV]'

test('deleting a template opened from the Personal Library returns to the Library, not the Workouts page', async ({ page }) => {
  await loginAsPT(page)
  await expect.poll(() => page.evaluate(() => !!window._soloClientId), { timeout: 10000 }).toBe(true)
  // NOT a skip: a skipped test would prove nothing, and the whole point here is proof.

  await page.evaluate(() => switchView('solo'))
  await expect.poll(() => page.evaluate(() => currentProfile?.role)).toBe('solo')

  const name = `${TAG} delete-nav ${Date.now()}`
  const id = await page.evaluate(async (n) => {
    const { data, error } = await db.from('workout_templates')
      .insert({ coach_id: currentUser.id, name: n, is_personal: true }).select('id').single()
    if (error) throw new Error(error.message)
    return data.id
  }, name)

  try {
    await page.evaluate(() => navigate('library'))
    await expect.poll(() => page.evaluate(() => currentPage)).toBe('library')

    // Exactly what a tap on a Library list row does: openTemplate(id) with no back-context.
    await page.evaluate((tid) => openTemplate(tid), id)
    await expect.poll(() => page.evaluate(() => window._templateDraft?.templateId)).toBe(id)

    // deleteTemplate awaits a confirm dialog, so start it without awaiting and answer the dialog.
    await page.evaluate((tid) => { window.__del = deleteTemplate(tid) }, id)
    await acceptConfirm(page)
    await page.evaluate(() => window.__del)

    await expect.poll(() => page.evaluate(() => currentPage), {
      message: 'after deleting from the Personal Library the app must stay on Library (old bug: it went to Workouts)',
    }).toBe('library')

    const left = await page.evaluate(async (tid) =>
      (await db.from('workout_templates').select('id').eq('id', tid)).data?.length ?? -1, id)
    expect(left, 'the template must really be deleted').toBe(0)
  } finally {
    // Rowcount-checked cleanup, in case the delete never ran: a refused delete returns no error and no rows.
    await page.evaluate(async (n) => {
      const { data } = await db.from('workout_templates').delete().eq('coach_id', currentUser.id).eq('name', n).select('id')
      return (data || []).length
    }, name).catch(() => 0)
  }
})
