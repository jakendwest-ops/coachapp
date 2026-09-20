const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

// ─── "Copy to coaching programs" needs a coaching view to copy INTO (R1c, 2026-09-20) ───────────────
//
// Ledger: bugs/2026-09-06-copy-to-coaching-creates-an-undeletable-orphan-for-a-solo-user.
//
// The programme manage menu offered "Copy to coaching programs" on every personal programme, gated on
// `is_personal` alone. A NATIVE solo account has no coaching view (loadUserInfo's solo branch sets
// _soloClientId but deliberately not _masterAccount, so there is no view switcher and no way to list, open,
// edit or delete an is_personal=false programme). Pressing it created exactly such a programme, dragging a
// full clone of every template with it, and pressing it again hit the name-collision guard — a permanent
// dead end. The inbound bridge (moveProgramToPersonal) was fixed for the same reason on 2026-07-13; this
// is the other direction of the same argument.
//
// HOW A NATIVE SOLO IS SIMULATED. The E2E account is a master account (a coach WITH a solo record), so it
// can enter Personal view for real. A native solo is the same thing minus _masterAccount, so the tests
// enter Personal view and then clear that one flag — the only thing that differs.
//
// NO ROWS ARE CREATED BY THE REFUSAL TESTS, even against the unfixed code: confirmDialog is stubbed to
// decline and db.from is wrapped to record which tables were touched, so the red run cannot make the
// stranded copy the bug describes. The only row is the personal programme the menu is opened on.
//
// The mirror proves the gate does not refuse the rightful user — a master account in Personal view still
// gets the button and is still asked to confirm.
test.describe('Copy to coaching programs requires a coaching view', () => {
  const PREFIX = '[E2E-C2C] copy-to-coaching'
  const tag = PREFIX + ' ' + Date.now()
  let madePrograms = false
  test.beforeEach(() => { madePrograms = false })

  test.afterEach(async ({ browser }) => {
    const ctx = await browser.newContext()
    try {
      const p = await ctx.newPage()
      await loginAsPT(p)
      const gone = await p.evaluate(async (prefix) => {
        // Rowcount-checked: a refused delete returns { data: [], error: null }. A "(coaching copy)" of a
        // fixture starts with the same prefix, so a copy the fix failed to prevent is reaped too.
        const { data } = await db.from('programs').delete().eq('coach_id', currentUser.id).like('name', prefix + '%').select('id')
        return (data || []).length
      }, PREFIX)
      if (madePrograms && gone === 0) throw new Error('CLEANUP: a personal programme was created under ' + PREFIX + ' but none was reaped')
    } finally { await ctx.close() }
  })

  // Logs in as the master account, enters Personal view for real, creates one personal programme.
  async function enterPersonalView(page, name) {
    await loginAsPT(page)
    const soloAvailable = await page.evaluate(() => !!window._soloClientId)
    test.skip(!soloAvailable, 'requires the master account (window._soloClientId)')
    await page.evaluate(() => switchView('solo'))
    await page.waitForFunction(() => currentProfile?.role === 'solo')
    madePrograms = true
    return page.evaluate(async (name) => {
      const { data } = await db.from('programs').insert({ coach_id: currentUser.id, is_personal: true, name }).select('id').single()
      return { id: data?.id, master: window._masterAccount === true }
    }, name)
  }

  // Opens the REAL programme page and returns the manage menu's markup.
  const openManageMenu = (page, id) => page.evaluate(async (id) => {
    await openProgram(id)
    return document.getElementById('program-manage-modal')?.innerHTML ?? null
  }, id)

  test('a native solo (no coaching view) is not offered the button, and the menu still renders', async ({ page }) => {
    const fx = await enterPersonalView(page, tag + ' menu')
    expect(fx.id, 'the personal programme must exist before the probe means anything').toBeTruthy()
    expect(fx.master, 'the E2E account must be a master account for this simulation to mean anything').toBe(true)

    await page.evaluate(() => { window._masterAccount = false })   // ← the ONE thing a native solo lacks
    const menu = await openManageMenu(page, fx.id)

    expect(menu, 'the manage menu must render (otherwise "absent" proves nothing)').toContain('Delete program')
    expect(menu, 'a user with no coaching view must not be offered a copy INTO it').not.toContain('copyProgramToCoaching')
  })

  test('copyProgramToCoaching refuses a user with no coaching view before touching anything', async ({ page }) => {
    const fx = await enterPersonalView(page, tag + ' fn')
    expect(fx.id, 'the personal programme must exist before the probe means anything').toBeTruthy()

    const r = await page.evaluate(async (id) => {
      window._masterAccount = false
      const touched = []
      const realFrom = db.from.bind(db)
      db.from = (t) => { touched.push(t); return realFrom(t) }
      let confirms = 0
      const realConfirm = window.confirmDialog
      window.confirmDialog = async () => { confirms++; return false }     // decline: nothing can be written
      try { await copyProgramToCoaching(id) } finally { db.from = realFrom; window.confirmDialog = realConfirm }
      return { touched, confirms, toast: document.getElementById('app-toast')?.textContent || '' }
    }, fx.id)

    expect.soft(r.touched, 'no database call at all — not even the source read').toEqual([])
    expect.soft(r.confirms, 'and the user is never asked to confirm a copy that cannot land anywhere').toBe(0)
    expect(r.toast, 'and is told why, rather than the button silently doing nothing').toContain('no coaching view')
  })

  test('MIRROR: a master account in Personal view still gets the button and is still asked to confirm', async ({ page }) => {
    const fx = await enterPersonalView(page, tag + ' master')
    expect(fx.id, 'the personal programme must exist before the probe means anything').toBeTruthy()
    expect(fx.master, 'must be a master account for this to be the rightful-user case').toBe(true)

    const menu = await openManageMenu(page, fx.id)
    expect(menu, 'the rightful user is offered the button').toContain('copyProgramToCoaching')

    const r = await page.evaluate(async (id) => {
      const touched = []
      const realFrom = db.from.bind(db)
      db.from = (t) => { touched.push(t); return realFrom(t) }
      let confirms = 0
      const realConfirm = window.confirmDialog
      window.confirmDialog = async () => { confirms++; return false }     // decline: no copy is created
      try { await copyProgramToCoaching(id) } finally { db.from = realFrom; window.confirmDialog = realConfirm }
      return { touched, confirms }
    }, fx.id)

    expect(r.touched, 'the function proceeds: it reads the source programme').toContain('programs')
    expect(r.confirms, 'and asks the user to confirm before writing anything').toBe(1)
  })
})
