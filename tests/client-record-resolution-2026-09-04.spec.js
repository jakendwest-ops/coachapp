// `saveClientEvent` must save against the record the calendar is SHOWING.
//
// The ledger row for this said a MASTER account has two `clients` rows sharing one `user_id`, so
// `.eq('user_id', …).single()` threw PGRST116. MEASURED 2026-09-04, that premise is FALSE: the
// database carries a unique index on `clients.user_id`, so a second row for the same user_id is
// refused outright and `.single()` can never see two. The first test below pins that fact, because a
// wrong premise sitting in the ledger is what sends the next investigation down the same dead end.
//
// What IS real is the other half of the row: the query re-derived an id from the auth user while the
// page the user is looking at had already resolved one, so the two could disagree. renderCalendar sets
// window._calClientId before painting the "+ Add event" button that reaches saveClientEvent, and the
// save now prefers it.

const { test, expect } = require('@playwright/test')
const { loginAsPT } = require('./helpers')

test.describe('Client-record resolution (2026-09-04)', () => {
  test('the database forbids two clients rows sharing a user_id — the master-account premise is false', async ({ page }) => {
    await loginAsPT(page)

    const r = await page.evaluate(async () => {
      const out = {}
      const { data: before } = await db.from('clients').select('id').eq('user_id', currentUser.id)
      out.rowsForThisUser = (before || []).length

      const { data: extra, error } = await db.from('clients')
        .insert({ user_id: currentUser.id, coach_id: currentUser.id, full_name: `[E2E] uniq probe ${Date.now()}` })
        .select('id').single()

      out.code = error?.code || null
      out.message = error?.message || null
      // If the constraint ever goes away this insert SUCCEEDS, and the row must not be left behind.
      if (extra?.id) {
        const { data: gone } = await db.from('clients')
          .delete().eq('id', extra.id).eq('coach_id', currentUser.id).select('id')
        out.leaked = (gone || []).length !== 1
        out.inserted = true
      }
      return out
    })

    expect(r.rowsForThisUser, 'the account must have exactly one clients row').toBe(1)
    expect(r.inserted, 'a second row for the same user_id must be REFUSED').toBeUndefined()
    expect(r.code, 'the refusal must be a unique-violation (23505)').toBe('23505')
    expect(r.message, 'and it must name the user_id index, not some other constraint').toContain('user_id')
  })

  test('saveClientEvent binds to the calendar it is rendered on, not a fresh user_id lookup', async ({ page }) => {
    await loginAsPT(page)
    const src = await page.evaluate(async () => (await fetch('js/app-calendar-goals.js')).text())
    const fn = /async function saveClientEvent[\s\S]*?\n\}/.exec(src)
    expect(fn, 'saveClientEvent must exist').toBeTruthy()

    // COMMENTS ARE NOT CODE. The first version of this assertion went red against the CORRECT source,
    // because the fix's own comment quotes the old `db.from('clients')…single()` line it replaced.
    // That is the third time in this project a check has counted a comment as code, so strip them
    // before matching rather than writing a cleverer regex.
    const code = fn[0].split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

    // Guards the specific regression. If the bare lookup comes back, the save silently stops agreeing
    // with the calendar the user is looking at — and that disagreement is invisible until the event
    // shows up on the wrong record.
    expect(code, 'must prefer the id the calendar resolved').toContain('_calClientId')
    expect(code, 'must not re-derive it with a bare .single() on clients').not.toMatch(/from\('clients'\)[\s\S]*?\.single\(/)
  })

  test('renderCalendar really does set the id that save now depends on', async ({ page }) => {
    await loginAsPT(page)
    // Without this the test above pins a variable that nothing populates — the save would fall through
    // to the resolver on every real use and the binding would be decorative.
    const src = await page.evaluate(async () => (await fetch('js/app-calendar-goals.js')).text())
    expect(src).toMatch(/window\._calClientId\s*=\s*resolvedId/)
  })
})
