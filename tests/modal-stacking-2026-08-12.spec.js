// 2026-08-12 — two files never adopted mountModal(), so a fixed modal-stacking race was still live.
//
// mountModal (js/app-core.js) removes any existing element with the same id before appending. It was
// written for the 2026-07-04 double-overlay incident. app-clients.js and app-calendar-goals.js — 10
// modals between them — still used a bare `document.body.appendChild(overlay)`.
//
// What that costs: open the same modal twice (a double-tap, or an async handler that awaits a fetch
// BEFORE mounting) and you get two identical overlays stacked. The user types into the one painted on
// top; the save handler reads `document.getElementById(...)` which returns the FIRST match — the one
// underneath, still empty. So the form appears filled in and saves blank.
//
// Measured before the fix: 7 of the 10 had NO guard at all (all 3 in app-clients.js, including the
// async showEditClientModal the audit named, plus 4 in app-calendar-goals.js). The other 3 hand-rolled
// the same `existing.remove()` logic mountModal provides — correct, but three private copies of one
// rule is how it drifts. Routing all 10 through mountModal closes the live race AND deletes the copies.
//
// Two DIFFERENT functions here — showAddEventModal and showClientAddEventModal — both build an overlay
// with id 'add-event-modal', so they can collide with each other, not just with themselves.
//
// Found by the 2026-08-12 full-codebase architecture audit.
const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

test.describe('modal stacking (2026-08-12)', () => {
  test('opening the same modal twice leaves exactly one overlay, and inputs resolve to the visible one', async ({ page }) => {
    await loginAsPT(page)

    const res = await page.evaluate(() => {
      document.querySelectorAll('.modal-overlay').forEach(m => m.remove())
      showAddClientModal()
      // Type into the first instance, then reopen — a double-tap.
      const first = document.getElementById('nc-name')
      if (first) first.value = 'FIRST INSTANCE'
      showAddClientModal()

      const overlays = document.querySelectorAll('#add-client-modal')
      const nameInputs = document.querySelectorAll('#nc-name')
      // What a save handler would actually read.
      const whatSaveSees = document.getElementById('nc-name')?.value
      document.querySelectorAll('.modal-overlay').forEach(m => m.remove())
      return { overlays: overlays.length, nameInputs: nameInputs.length, whatSaveSees }
    })
    console.log('add-client:', JSON.stringify(res))

    // The regression: 2 overlays, 2 #nc-name inputs, and getElementById returned the stale first one.
    expect(res.overlays, 'a second open must replace the first, not stack on it').toBe(1)
    expect(res.nameInputs, 'duplicate ids are what make the save handler read the wrong field').toBe(1)
    expect(res.whatSaveSees, 'the fresh modal must be the one a save handler reads').toBe('')
  })

  test("app-calendar-goals' two different modals sharing id 'add-event-modal' cannot coexist", async ({ page }) => {
    await loginAsPT(page)
    const res = await page.evaluate(async () => {
      document.querySelectorAll('.modal-overlay').forEach(m => m.remove())
      const clientId = (await db.from('clients').select('id').eq('coach_id', currentUser.id).limit(1)).data?.[0]?.id
      if (!clientId) return { skip: true }
      // Two DIFFERENT functions, both building an overlay with id 'add-event-modal'.
      showAddEventModal('2026-01-01')
      showClientAddEventModal('2026-01-01')
      const count = document.querySelectorAll('#add-event-modal').length
      document.querySelectorAll('.modal-overlay').forEach(m => m.remove())
      return { count }
    })
    test.skip(!!res.skip, 'no client available')
    console.log('add-event-modal instances:', res.count)

    expect(res.count, 'two modals sharing one id must never both be in the DOM').toBe(1)
  })

  test('every modal in these two files mounts through mountModal', () => {
    // Structural guard. The bug was not any single modal — it was that a whole file never adopted the
    // helper, so each new modal added there inherited the race. A per-modal test would not catch the
    // eleventh one someone adds next month.
    //
    // Read from DISK, not via fetch in the page: this asserts on source, so it needs no browser, no
    // login and no server. The first attempt fetched a relative URL from a page that had never been
    // navigated (this test does not log in), which cannot resolve — and a test that ERRORS rather than
    // asserting looks the same as one that passes to anyone not reading the output.
    const fs = require('fs')
    const bare = []
    for (const f of ['js/app-clients.js', 'js/app-calendar-goals.js']) {
      fs.readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
        if (/document\.body\.appendChild\(overlay\)/.test(l)) bare.push(`${f}:${i + 1}`)
      })
    }
    expect(bare, 'a modal appended directly bypasses mountModal and reintroduces the stacking race').toEqual([])
  })
})
