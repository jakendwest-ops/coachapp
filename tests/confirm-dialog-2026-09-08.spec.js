// window.confirm() is silently suppressed in embedded/automation browsers and some installed PWAs —
// the dialog never shows and the call returns false, so every `if (!confirm(...)) return` guard
// permanently cancels its own action. Jake hit this on Discard (runner) and Delete week (builder)
// while testing in an embedded preview, 2026-09-08. confirmDialog (js/app-core.js) is the DOM-modal
// replacement: a real .modal-overlay that resolves true/false.

const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

test.describe('confirmDialog — the window.confirm() replacement (2026-09-08)', () => {
  test.beforeEach(async ({ page }) => { await loginAsPT(page) })

  test('renders a real modal and resolves true on confirm, false on cancel / ✕ / backdrop', async ({ page }) => {
    // YES
    const yes = page.evaluate(() => confirmDialog('Proceed?', { confirmLabel: 'Do it' }))
    await expect(page.locator('#confirm-dialog')).toBeVisible()
    await expect(page.locator('#confirm-dialog')).toContainText('Proceed?')
    await page.click('#confirm-dialog .modal-footer [data-confirm="yes"]')
    expect(await yes).toBe(true)
    await expect(page.locator('#confirm-dialog')).toHaveCount(0)

    // Cancel button = false
    const no = page.evaluate(() => confirmDialog('Proceed?'))
    await page.click('#confirm-dialog .modal-footer [data-confirm="no"]')
    expect(await no).toBe(false)

    // ✕ in the header = false
    const x = page.evaluate(() => confirmDialog('Proceed?'))
    await page.click('#confirm-dialog .modal-close')
    expect(await x).toBe(false)

    // BACKDROP TAP = false (the safe default for a guard)
    const backdrop = page.evaluate(() => confirmDialog('Proceed?'))
    await page.locator('#confirm-dialog').click({ position: { x: 5, y: 5 } })
    expect(await backdrop).toBe(false)
  })

  test('danger:true paints the confirm button as destructive', async ({ page }) => {
    const p = page.evaluate(() => confirmDialog('Delete it?', { danger: true, confirmLabel: 'Delete' }))
    const cls = await page.locator('#confirm-dialog [data-confirm="yes"]').getAttribute('class')
    expect(cls).toContain('btn-danger')
    await page.click('#confirm-dialog [data-confirm="no"]')
    await p
  })

  test('a converted guard (deleteEvent) actually blocks when the dialog is declined', async ({ page }) => {
    const r = await page.evaluate(async () => {
      let deleteAttempted = false
      const origFrom = db.from
      db.from = (t) => {
        if (t === 'events') { deleteAttempted = true }
        return origFrom.call(db, t)
      }
      try {
        // Decline: click "no" as soon as the modal is up.
        const p = deleteEvent('00000000-0000-0000-0000-000000000000')
        await new Promise(res => setTimeout(res, 50))
        document.querySelector('#confirm-dialog [data-confirm="no"]')?.click()
        await p
        return { deleteAttempted }
      } finally { db.from = origFrom }
    })
    expect(r.deleteAttempted, 'declining confirmDialog must stop deleteEvent before it touches the DB').toBe(false)
  })
})
