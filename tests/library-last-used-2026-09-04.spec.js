// The Library list orders by when a session was last used, not alphabetically.
//
// "Last used" is the more recent of edited (workout_templates.updated_at, maintained by trigger) and
// trained (the newest workout_logs row pointing at it). One concept, one sort key.

const { test, expect } = require('@playwright/test')
const { loginAsPT } = require('./helpers')

test.describe('Library orders by last used (2026-09-04)', () => {
  test('a recently edited template sorts above an older one, regardless of name', async ({ page }) => {
    await loginAsPT(page)

    const r = await page.evaluate(async () => {
      const stamp = Date.now()
      // Names chosen so ALPHABETICAL order is the OPPOSITE of the expected order. Without this the
      // test would pass on the old alphabetical sort and prove nothing.
      const older = `[E2E] aaa older ${stamp}`
      const newer = `[E2E] zzz newer ${stamp}`
      const out = { built: false, order: [], guard: {}, cleanup: {} }

      // Seed by INSERTION ORDER rather than trying to backdate updated_at. Each INSERT is its own
      // transaction and gets its own now() at microsecond resolution, so inserting `older` first and
      // `newer` second reliably produces oldRow.updated_at < newRow.updated_at -- true whether or not
      // any ad hoc insert-time trigger is live on this table.
      const mk = async (name) => {
        const { data } = await db.from('workout_templates')
          .insert({ coach_id: currentUser.id, client_id: null, program_id: null,
                    name, is_personal: currentProfile?.role === 'solo' })
          .select('id, updated_at').single()
        return data || null
      }
      const oldRow = await mk(older)     // inserted FIRST  -> earlier updated_at
      const newRow = await mk(newer)     // inserted SECOND -> later   updated_at
      if (!oldRow?.id || !newRow?.id) return out
      out.built = true

      try {
        // Required guard: if the two timestamps ever tie, the sort is arbitrary and this test proves
        // nothing -- that must fail loudly rather than pass by luck.
        out.guard.oldUpdatedAt = oldRow.updated_at
        out.guard.newUpdatedAt = newRow.updated_at
        out.guard.differ = oldRow.updated_at !== newRow.updated_at
        out.guard.newIsLater = new Date(newRow.updated_at).getTime() > new Date(oldRow.updated_at).getTime()

        const host = document.createElement('div')
        document.body.appendChild(host)
        await renderWorkoutTemplates(host)
        out.order = [...host.querySelectorAll('.row-name')]
          .map(e => e.textContent)
          .filter(n => n.includes(String(stamp)))
        host.remove()
      } finally {
        const { data: gone } = await db.from('workout_templates')
          .delete().in('id', [oldRow.id, newRow.id]).eq('coach_id', currentUser.id).select('id')
        out.cleanup.templates = (gone || []).length
      }
      return out
    })

    expect(r.built, 'both fixtures must exist or this test asserts nothing').toBe(true)
    // The guard: if the two inserts ever landed with the same or reversed timestamps, the sort
    // assertion below would pass or fail by luck rather than by proof.
    expect(r.guard.differ, 'the two rows must have distinct updated_at values').toBe(true)
    expect(r.guard.newIsLater, 'the second-inserted row must have the later updated_at').toBe(true)
    expect(r.order.length, 'both fixtures must appear in the list').toBe(2)
    // The load-bearing assertion. Alphabetically "aaa older" comes first; by last-used it must not.
    expect(r.order[0], 'the recently edited template must sort first').toContain('zzz newer')
    expect(r.cleanup.templates, 'both fixtures must be deleted, and the delete seen').toBe(2)
  })
})
