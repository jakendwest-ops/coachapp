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

  test('each row states when it was last used', async ({ page }) => {
    await loginAsPT(page)

    const r = await page.evaluate(async () => {
      const tag = `[E2E] row line ${Date.now()}`
      const out = { built: false, meta: null, cleanup: 0 }
      const { data: t } = await db.from('workout_templates')
        .insert({ coach_id: currentUser.id, client_id: null, program_id: null,
                  name: tag, is_personal: currentProfile?.role === 'solo' })
        .select('id').single()
      if (!t?.id) return out
      out.built = true
      try {
        const host = document.createElement('div')
        document.body.appendChild(host)
        await renderWorkoutTemplates(host)
        const row = [...host.querySelectorAll('.list-row')]
          .find(r2 => r2.querySelector('.row-name')?.textContent === tag)
        out.meta = row?.querySelector('.row-meta')?.textContent || null
        host.remove()
      } finally {
        const { data: gone } = await db.from('workout_templates')
          .delete().eq('id', t.id).eq('coach_id', currentUser.id).select('id')
        out.cleanup = (gone || []).length
      }
      return out
    })

    expect(r.built, 'the fixture must exist or this test asserts nothing').toBe(true)
    expect(r.meta, 'the row must state when it was last used').toContain('Last used')
    // Just created, so its updated_at is now — anything else means the merge in Task 2 is wrong.
    expect(r.meta).toContain('today')
    expect(r.cleanup, 'the fixture must be deleted, and the delete seen').toBe(1)
  })

  test('search filters the list as you type, and clearing restores it', async ({ page }) => {
    await loginAsPT(page)

    const r = await page.evaluate(async () => {
      const stamp = Date.now()
      const keep = `[E2E] findme ${stamp}`
      const hide = `[E2E] other ${stamp}`
      const out = { built: false, before: 0, filtered: 0, restored: 0, cleanup: 0 }

      const mk = async (name) => (await db.from('workout_templates')
        .insert({ coach_id: currentUser.id, client_id: null, program_id: null,
                  name, is_personal: currentProfile?.role === 'solo' })
        .select('id').single()).data?.id || null
      const a = await mk(keep)
      const b = await mk(hide)
      if (!a || !b) return out
      out.built = true

      try {
        const host = document.createElement('div')
        host.id = 'workout-tab-content'
        document.body.appendChild(host)
        await renderWorkoutTemplates(host)
        const visible = () => [...host.querySelectorAll('.list-row')]
          .filter(r2 => r2.style.display !== 'none').length

        out.before = visible()
        filterTemplates('findme')
        out.filtered = visible()
        filterTemplates('')
        out.restored = visible()
        host.remove()
      } finally {
        const { data: gone } = await db.from('workout_templates')
          .delete().in('id', [a, b]).eq('coach_id', currentUser.id).select('id')
        out.cleanup = (gone || []).length
      }
      return out
    })

    expect(r.built, 'both fixtures must exist or this test asserts nothing').toBe(true)
    expect(r.before, 'both fixtures must be listed before filtering').toBeGreaterThanOrEqual(2)
    expect(r.filtered, 'only the matching row may remain visible').toBe(1)
    expect(r.restored, 'clearing the box must restore every row').toBe(r.before)
    expect(r.cleanup, 'both fixtures must be deleted, and the delete seen').toBe(2)
  })

  // Both halves of this test are for bugs found in review, not in use. The search input is rendered
  // once by renderWorkoutLibrary and lives OUTSIDE #workout-tab-content, which is what lets it keep
  // its value across a re-render -- and is also what let it sit above the Exercise Library saying
  // "Search sessions".
  test('a re-render keeps the active search applied, and the box is hidden on the Exercise Library tab', async ({ page }) => {
    await loginAsPT(page)

    const r = await page.evaluate(async () => {
      const stamp = Date.now()
      const keep = `[E2E] findme ${stamp}`
      const hide = `[E2E] other ${stamp}`
      const out = { built: false, total: 0, afterRerender: 0, onExercises: null, backOnTemplates: null, cleanup: 0 }

      const mk = async (name) => (await db.from('workout_templates')
        .insert({ coach_id: currentUser.id, client_id: null, program_id: null,
                  name, is_personal: currentProfile?.role === 'solo' })
        .select('id').single()).data?.id || null
      const a = await mk(keep)
      const b = await mk(hide)
      if (!a || !b) return out
      out.built = true

      const host = document.createElement('div'); host.id = 'workout-tab-content'
      const search = document.createElement('input'); search.id = 'wt-search'
      const tabT = document.createElement('button'); tabT.id = 'wt-tab-templates'
      const tabE = document.createElement('button'); tabE.id = 'wt-tab-exercises'
      document.body.append(host, search, tabT, tabE)

      try {
        // A term is already in the box when the list is rebuilt -- the tab round-trip case.
        search.value = 'findme'
        await renderWorkoutTemplates(host)
        const rows = [...host.querySelectorAll('.list-row')]
        out.total = rows.length
        out.afterRerender = rows.filter(r2 => r2.style.display !== 'none').length

        switchWorkoutTab('exercises')
        out.onExercises = search.style.display
        switchWorkoutTab('templates')
        out.backOnTemplates = search.style.display
      } finally {
        host.remove(); search.remove(); tabT.remove(); tabE.remove()
        const { data: gone } = await db.from('workout_templates')
          .delete().in('id', [a, b]).eq('coach_id', currentUser.id).select('id')
        out.cleanup = (gone || []).length
      }
      return out
    })

    expect(r.built, 'both fixtures must exist or this test asserts nothing').toBe(true)
    expect(r.total, 'both fixtures must be rendered or the filter assertion is vacuous').toBeGreaterThanOrEqual(2)
    expect(r.afterRerender, 'a re-render must re-apply the term still sitting in the search box').toBe(1)
    expect(r.onExercises, 'the "Search sessions" box must be hidden on the Exercise Library tab').toBe('none')
    expect(r.backOnTemplates, 'and shown again on the Templates tab').toBe('')
    expect(r.cleanup, 'both fixtures must be deleted, and the delete seen').toBe(2)
  })

  // The TRAINED half of "last used" had no test at all until now, and that is a dangerous gap by
  // design: edit dates carry the label for every row, so if the trained half were wholly dead —
  // wrong scoping, the T00:00:00 parse, the comparator, an RLS refusal — every other test here would
  // still be green and the page would still look right. Task 1 (the runner recording template_id)
  // exists only to feed this half.
  //
  // Named so the assertion cannot pass by accident: alphabetically "aaa edited" comes FIRST, and it
  // is also the more recently EDITED of the two. Only the trained date can put "zzz trained" on top.
  test('a session trained recently outranks one edited more recently', async ({ page }) => {
    await loginAsPT(page)

    const r = await page.evaluate(async () => {
      const stamp = Date.now()
      const trainedName = `[E2E] zzz trained ${stamp}`
      const editedName = `[E2E] aaa edited ${stamp}`
      const today = new Date().toISOString().split('T')[0]
      const out = { built: false, order: [], trainedRowSays: null, cleanup: {} }

      const { data: client } = await db.from('clients')
        .insert({ coach_id: currentUser.id, full_name: `[E2E] lastused ${stamp}` }).select('id').single()
      const mk = async (name, updatedAt) => (await db.from('workout_templates')
        .insert({ coach_id: currentUser.id, client_id: null, program_id: null, name,
                  is_personal: currentProfile?.role === 'solo', updated_at: updatedAt })
        .select('id').single()).data?.id || null
      // Explicit updated_at survives the INSERT: the column carries a DEFAULT, which yields to a
      // supplied value. Probed against the real database on 2026-09-04.
      const trainedId = await mk(trainedName, '2020-01-01T00:00:00Z')
      const editedId = await mk(editedName, '2021-01-01T00:00:00Z')
      if (!client?.id || !trainedId || !editedId) return out

      const { data: logRow } = await db.from('workout_logs')
        .insert({ coach_id: currentUser.id, client_id: client.id, name: trainedName,
                  date: today, template_id: trainedId }).select('id').single()
      if (!logRow?.id) return out
      out.built = true

      try {
        const host = document.createElement('div')
        host.id = 'workout-tab-content'
        document.body.appendChild(host)
        await renderWorkoutTemplates(host)
        const rows = [...host.querySelectorAll('.list-row')]
          .filter(row => row.querySelector('.row-name')?.textContent.includes(String(stamp)))
        out.order = rows.map(row => row.querySelector('.row-name')?.textContent)
        out.trainedRowSays = rows.find(row => row.querySelector('.row-name')?.textContent === trainedName)
          ?.querySelector('.row-meta')?.textContent ?? null
        host.remove()
      } finally {
        const { data: lGone } = await db.from('workout_logs')
          .delete().eq('id', logRow.id).eq('coach_id', currentUser.id).select('id')
        const { data: tGone } = await db.from('workout_templates')
          .delete().in('id', [trainedId, editedId]).eq('coach_id', currentUser.id).select('id')
        const { data: cGone } = await db.from('clients')
          .delete().eq('id', client.id).eq('coach_id', currentUser.id).select('id')
        out.cleanup = { log: (lGone || []).length, templates: (tGone || []).length, client: (cGone || []).length }
      }
      return out
    })

    expect(r.built, 'the fixtures must exist or this test asserts nothing').toBe(true)
    expect(r.order.length, 'both fixture templates must be rendered').toBe(2)
    expect(r.order[0], 'a session trained today must outrank one edited a year later').toContain('zzz trained')
    expect(r.trainedRowSays, 'and its row must report the TRAINED date, not the 2020 edit date').toBe('Last used today')
    expect(r.cleanup.log, 'the fixture log must be deleted, and the delete seen').toBe(1)
    expect(r.cleanup.templates, 'both fixture templates must be deleted, and the delete seen').toBe(2)
    expect(r.cleanup.client, 'the fixture client must be deleted, and the delete seen').toBe(1)
  })
})
