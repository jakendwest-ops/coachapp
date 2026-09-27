const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

// Ledger row 2026-08-19-ctx-backlabel-and-clientname-rendered-raw: the template editor's Back button
// rendered `_ctx.backLabel` raw. That label carries a CLIENT'S NAME (openTemplate is called with
// backLabel: '<client name>' from the client-programme views), so a client named
// `<img src=x onerror=…>` ran script in the COACH's browser with the coach's session.
//
// Why a behavioural test and not the escaping checker: a neuter run on 2026-09-27 showed that removing the
// escapeHtml here failed NOTHING. scripts/check-escaping.mjs only treats a line as markup if the line itself
// contains `<`, and this interpolation sits on its own continuation line of a multi-line template. That
// blind spot is filed separately. This test drives the real render instead. Owns its fixture.
const TAG = '[E2E-BACKLABEL]'

test('a hostile client name in the template Back button renders as text, never as an element', async ({ page }) => {
  await loginAsPT(page)
  const name = `${TAG} ${Date.now()}`
  const id = await page.evaluate(async (n) => {
    const { data, error } = await db.from('workout_templates')
      .insert({ coach_id: currentUser.id, name: n, is_personal: false }).select('id').single()
    if (error) throw new Error(error.message)
    return data.id
  }, name)
  try {
    const payload = '<img id="xss-backlabel-probe" src="x">Client'
    await page.evaluate(({ tid, p }) => openTemplate(tid, { backLabel: p, backFn: () => {} }), { tid: id, p: payload })
    await expect(page.locator('.back-btn')).toBeVisible()

    expect(await page.locator('#xss-backlabel-probe').count(),
      'the back label must not create an element — it is client-controlled text').toBe(0)
    expect(await page.locator('.back-btn').textContent(), 'the label must still be shown, as literal text')
      .toContain('<img id="xss-backlabel-probe"')
  } finally {
    await page.evaluate(async (n) => {
      const { data } = await db.from('workout_templates').delete().eq('coach_id', currentUser.id).eq('name', n).select('id')
      return (data || []).length
    }, name).catch(() => 0)
  }
})
