// saveEvent (js/app-calendar-goals.js) had the same unguarded db.auth.getUser() shape found and
// fixed in savePerformanceLog (docs/bugs/2026-09-30-pb-consolidation-solo-write-path-fails-only-in-the-full-suite.md):
// a failed/expired session returns user: null, and created_by: user.id threw instead of telling the
// coach why nothing saved. Not found failing on its own — fixed proactively once the sibling bug's
// root cause (getUser() is a live, network-validated read, not a cached one) showed the same
// unguarded pattern existed here too.
const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

test.describe('saveEvent fails closed on a missing session', () => {
  test('(review) saveEvent shows a session message and inserts nothing, instead of throwing, when getUser() returns no user', async ({ page }) => {
    await loginAsPT(page)
    const title = '[E2E] null-user event ' + Date.now()
    const r = await page.evaluate(async (title) => {
      showAddEventModal()
      document.getElementById('ae-title').value = title

      const realGetUser = db.auth.getUser.bind(db.auth)
      db.auth.getUser = async () => ({ data: { user: null } })
      let threw = null
      try { await saveEvent() } catch (e) { threw = e.message } finally { db.auth.getUser = realGetUser }

      const { data } = await db.from('events').select('id').eq('title', title)
      return { threw, rowCount: data?.length ?? -1, errorText: document.getElementById('ae-error')?.textContent || '', modalStillOpen: !!document.getElementById('add-event-modal') }
    }, title)
    expect(r.threw, 'a missing session must be handled, not thrown').toBeNull()
    expect(r.rowCount, 'nothing is inserted without a real user').toBe(0)
    expect(r.errorText, 'the form says why, instead of silently doing nothing').toMatch(/session/i)
    expect(r.modalStillOpen, 'the modal stays open on failure, same as any other save error').toBe(true)
  })
})
