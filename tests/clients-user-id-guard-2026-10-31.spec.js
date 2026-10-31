// The clients.user_id guard (scripts/add-clients-user-id-guard-2026-10-31.sql, approved by Jake 2026-10-31), against the LIVE API. Before it,
// a coach could link ANOTHER person's login to one of their client rows - by creating the row with user_id set, or by editing an existing
// row - and that person could then read the record (confirmed live 2026-10-31 with these two accounts). This spec was RED before Jake applied
// the script and is committed after it. It plants its own rows (tagged [E2E), and deletes every one in a finally, checking the count.
// The local proof, including the claim path and the admin exemption: scripts/sql-verify/clients-user-id-guard.verify.mjs.
const { test, expect } = require('./fixtures')
const { loginAsPT, loginAsPT2 } = require('./helpers')

const TAG = '[E2E user-id-guard 2026-10-31]'

test('a coach cannot link another person\'s login to a client row - by insert or by update - and adding and editing clients still work', async ({ page, browser }) => {
  const ctx2 = await browser.newContext()
  let victim
  try {
    const p2 = await ctx2.newPage()
    await loginAsPT2(p2)
    victim = await p2.evaluate(() => currentUser.id)
  } finally { await ctx2.close() }
  await loginAsPT(page)

  const r = await page.evaluate(async ({ victim, TAG }) => {
    const made = []
    const out = {}
    try {
      // 1. INSERT with someone else's login: refused by the guard (42501), not merely by the unique index (23505)
      const ins = await db.from('clients').insert({ coach_id: currentUser.id, full_name: TAG + ' insert', user_id: victim }).select('id')
      if (ins.data?.length) made.push(...ins.data.map(x => x.id))
      out.insert = { code: ins.error?.code || null, rows: ins.data?.length ?? 0 }

      // 2. A normal add still works, and a normal edit of it too
      const base = await db.from('clients').insert({ coach_id: currentUser.id, full_name: TAG + ' plain', email: null }).select('id')
      if (base.data?.length) made.push(...base.data.map(x => x.id))
      out.add = { code: base.error?.code || null, rows: base.data?.length ?? 0 }
      const id = base.data?.[0]?.id
      const edit = await db.from('clients').update({ notes: 'edited', status: 'inactive' }).eq('id', id).eq('coach_id', currentUser.id).select('id')
      out.edit = { code: edit.error?.code || null, rows: edit.data?.length ?? 0 }

      // 3. UPDATE linking someone else's login: refused, and the row is still unlinked
      const up = await db.from('clients').update({ user_id: victim }).eq('id', id).eq('coach_id', currentUser.id).select('id')
      out.update = { code: up.error?.code || null, rows: up.data?.length ?? 0 }
      const back = await db.from('clients').select('user_id').eq('id', id).eq('coach_id', currentUser.id).maybeSingle()
      out.after = back.data?.user_id ?? null
    } finally {
      if (made.length) {
        const del = await db.from('clients').delete().in('id', made).eq('coach_id', currentUser.id).select('id')
        out.cleanup = { wanted: made.length, deleted: del.data?.length ?? 0, code: del.error?.code || null }
      } else out.cleanup = { wanted: 0, deleted: 0 }
    }
    return out
  }, { victim, TAG })

  expect(r.cleanup.deleted, 'every planted row was deleted').toBe(r.cleanup.wanted)
  expect(r.insert, 'INSERT with another person\'s login is refused by the guard').toEqual({ code: '42501', rows: 0 })
  expect(r.add, 'adding a client still works').toEqual({ code: null, rows: 1 })
  expect(r.edit, 'editing a client still works').toEqual({ code: null, rows: 1 })
  expect(r.update.code, 'UPDATE linking another person\'s login is refused by the guard').toBe('42501')
  expect(r.after, 'and the row is still linked to nobody').toBeNull()
})
