const { test, expect } = require('./fixtures')
const { loginAsPT, acceptConfirm } = require('./helpers')

// Ledger row 2026-07-13-deleting-a-workout-template-from-the-templates-page-drops-yo (Jake-reported):
// "deleting a workout template from the templates page falls back to the workouts page."
// The rule it pins: after deleting a workout you land back where your workouts are listed, never somewhere else.
//
// REWRITTEN 2026-10-31 for Personal view's four destinations. Until then Personal view listed its workouts in the Library, so the fix
// (commit 134140f, _templateGoBack) returned a solo user to `library`. The Library is now the Exercise library only and Personal view's
// workouts are on Train › Workouts ("Your workouts", whose Edit opens the editor with backTo 'workouts'), so the right landing place is
// `workouts`, both from that Edit and from an editor opened with no back-context (_templateGoBack's fallback).
// Owns its fixture: a tagged personal template, deleted by the test itself.
const TAG = '[E2E-DELNAV]'

for (const [how, open] of [
  ['opened from Your workouts (Edit)', (tid) => editWorkout(tid)],
  ['opened with no back-context', (tid) => openTemplate(tid)],
]) {
  test(`Personal view: deleting a workout ${how} lands on Train › Workouts, where the workouts are listed`, async ({ page }) => {
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
      await page.evaluate(() => navigate('workouts'))
      await expect.poll(() => page.evaluate(() => currentPage)).toBe('workouts')

      await page.evaluate(`(${open.toString()})(${JSON.stringify(id)})`)
      await expect.poll(() => page.evaluate(() => window._templateDraft?.templateId)).toBe(id)

      // deleteTemplate awaits a confirm dialog, so start it without awaiting and answer the dialog.
      await page.evaluate((tid) => { window.__del = deleteTemplate(tid) }, id)
      await acceptConfirm(page)
      await page.evaluate(() => window.__del)

      await expect.poll(() => page.evaluate(() => currentPage), {
        message: 'after deleting a workout Personal view must land on Train › Workouts (the Library no longer lists workouts)',
      }).toBe('workouts')

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
}
