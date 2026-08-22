const { test, expect } = require('@playwright/test')
const { loginAsClient } = require('./helpers')

// ─── Client self-service writes verify the id belongs to the caller (2026-08-12 audit) ────────────
//
// saveClientPB / saveClientCheckIn / saveClientWeight each took `clientId` as a bare parameter,
// embedded into an inline onclick at render time and never re-checked at save time — so nothing in
// the APP stopped `saveClientWeight('<another clients uuid>')` from devtools.
//
// RLS already refuses these (proven 2026-08-12 by audit-ownership-anchors-rls-2026-08-12.spec.js,
// which is why the row was downgraded High -> Medium), so a database-level probe cannot go red before
// this fix. These assert the app-level refusal instead.
//
// The happy-path test is the important one. A guard that refuses everything would also "pass" the
// refusal tests, and would silently break every real weight/PB/check-in save — the exact shape of
// damage this project has shipped before. Refusal without a matching happy path is half a test.
const FOREIGN = '00000000-0000-0000-0000-0000000000ff'

test.describe('client self-service writes refuse a foreign client_id at the app layer', () => {
  test('all three refuse a client_id that is not the caller\'s own', async ({ page }) => {
    await loginAsClient(page)
    const r = await page.evaluate(async (foreign) => {
      const mk = (id, t = 'input') => { let e = document.getElementById(id); if (!e) { e = document.createElement(t); e.id = id; document.body.appendChild(e) } return e }
      const setv = (id, v) => { mk(id).value = v }

      // saveClientWeight
      mk('cwf-error', 'div'); setv('cwf-date', '2026-01-01'); setv('cwf-weight', '80'); setv('cwf-bf', ''); setv('cwf-notes', '')
      await saveClientWeight(foreign)
      const weightErr = document.getElementById('cwf-error').textContent

      // saveClientCheckIn
      mk('ci-error', 'div')
      for (const f of ['ci-sleep', 'ci-energy', 'ci-stress', 'ci-soreness']) setv(f, '3')
      setv('ci-notes', '')
      await saveClientCheckIn(foreign)
      const ciErr = document.getElementById('ci-error').textContent

      // saveClientPB
      mk('cpb-error', 'div')
      // cpb-unit and cpb-category are SELECTs already rendered by the real PB form on this page —
      // assigning .value to a select with no matching <option> silently yields '', which sent this
      // straight to the required-fields branch and never reached the guard. Populate, then select.
      setv('cpb-name', '[E2E] Never Lands'); setv('cpb-value', '10')
      const unitSel = mk('cpb-unit', 'select'); unitSel.innerHTML = '<option value="kg">kg</option>'; unitSel.value = 'kg'
      setv('cpb-date', '2026-01-01'); setv('cpb-notes', '')
      const cat = mk('cpb-category', 'select'); cat.innerHTML = '<option value="strength">s</option>'; cat.value = 'strength'
      await saveClientPB(foreign)
      const pbErr = document.getElementById('cpb-error').textContent

      // Nothing may have landed on the foreign id. Read it back from our own session: a client cannot
      // see another client's rows, so this is a weak signal on its own — the load-bearing assertions
      // are the three error strings above. Included because a zero here is still a necessary condition.
      const { data: leaked } = await db.from('weight_logs').select('id').eq('client_id', foreign)
      return { weightErr, ciErr, pbErr, leaked: (leaked || []).length }
    }, FOREIGN)

    expect(r.weightErr, 'saveClientWeight must refuse at its own guard').toContain('permission denied')
    expect(r.ciErr, 'saveClientCheckIn must refuse at its own guard').toContain('permission denied')
    expect(r.pbErr, 'saveClientPB must refuse at its own guard').toContain('permission denied')
    expect(r.leaked, 'no row may exist against the foreign client id').toBe(0)
  })

  test('the guard still lets a client write to their OWN record (happy path)', async ({ page }) => {
    await loginAsClient(page)
    const r = await page.evaluate(async () => {
      const mine = await _getCurrentClientId()
      const mk = (id, t = 'input') => { let e = document.getElementById(id); if (!e) { e = document.createElement(t); e.id = id; document.body.appendChild(e) } return e }
      mk('cwf-error', 'div')
      mk('cwf-date').value = '2026-01-02'
      mk('cwf-weight').value = '81'
      mk('cwf-bf').value = ''
      mk('cwf-notes').value = '[E2E] own-write probe'
      // saveClientWeight re-renders on success; stub the render entry points so the assertion is about
      // the WRITE, not about whatever view happens to be mounted in this bare page.
      const oP = window.renderProgressWeight, oD = window._renderOwnDashboard
      window.renderProgressWeight = () => {}; window._renderOwnDashboard = () => {}
      try {
        await saveClientWeight(mine)
      } finally { window.renderProgressWeight = oP; window._renderOwnDashboard = oD }

      const err = document.getElementById('cwf-error').textContent
      const { data } = await db.from('weight_logs').select('id').eq('client_id', mine).eq('date', '2026-01-02').eq('weight_kg', 81)
      const ids = (data || []).map(x => x.id)
      // Reap immediately — this is a real row on a real (fixture) client — and ASSERT the reap.
      // A policy-refused delete returns { data: [], error: null }: no error, zero rows. Without the
      // .select() this silently leaked the row and the test still passed — the exact class the commit
      // immediately before this one (a4725d4) fixed across four cross-tenant probes, and that the
      // source files in this same diff now guard against at ~20 sites. Caught by pre-push review.
      let reaped = 0
      if (ids.length) {
        const { data: gone } = await db.from('weight_logs').delete().in('id', ids).select('id')
        reaped = (gone || []).length
      }
      return { err, landed: ids.length, reaped }
    })

    expect(r.err, 'a write to my own record must NOT be refused').toBe('')
    expect(r.landed, 'the row must actually have been written').toBeGreaterThan(0)
    expect(r.reaped, 'the cleanup must actually have removed what it wrote, not silently no-op')
      .toBe(r.landed)
  })

  // The test whose ABSENCE let a regression into a commit. On 2026-08-21 these three writes were given
  // a strict "clientId must equal my own client record" guard; pre-push review on 2026-08-22 found it
  // broke "View as", because renderClientDashboard renders these very forms with the SUDO'D client's
  // id while currentUser stays the coach. Refusal tests all passed — the risk was never a stranger
  // getting in, it was the legitimate coach being refused, and no role-specific happy path covered it.
  //
  // sudoAsClient() itself is hard-gated to one real email (app-dashboard.js:241), so the E2E PT cannot
  // call it. This reproduces the STATE that function creates, which is all the guard can see:
  // window._sudoClientId set, currentProfile.role forced to 'client', currentUser still the COACH.
  test('a coach in "View as" can still log a weight for the client they are viewing', async ({ page }) => {
    const { loginAsPT } = require('./helpers')
    await loginAsPT(page)
    const r = await page.evaluate(async () => {
      const { data: c } = await db.from('clients').select('id').eq('coach_id', currentUser.id).limit(1).single()
      const origProfile = currentProfile
      const mk = (id) => { let e = document.getElementById(id); if (!e) { e = document.createElement('input'); e.id = id; document.body.appendChild(e) } return e }
      const err = document.createElement('p'); err.id = 'cwf-error'; document.body.appendChild(err)
      mk('cwf-date').value = '2026-01-03'
      mk('cwf-weight').value = '77'
      mk('cwf-bf').value = ''
      mk('cwf-notes').value = '[E2E] sudo probe'
      const oP = window.renderProgressWeight, oD = window._renderOwnDashboard
      window.renderProgressWeight = () => {}; window._renderOwnDashboard = () => {}

      window._sudoClientId = c.id
      currentProfile = { ...currentProfile, role: 'client' }   // exactly what sudoAsClient does
      try {
        await saveClientWeight(c.id)
      } finally {
        delete window._sudoClientId
        currentProfile = origProfile
        window.renderProgressWeight = oP; window._renderOwnDashboard = oD
      }

      const errText = document.getElementById('cwf-error').textContent
      const { data } = await db.from('weight_logs').select('id').eq('client_id', c.id).eq('date', '2026-01-03').eq('weight_kg', 77)
      const ids = (data || []).map(x => x.id)
      let reaped = 0
      if (ids.length) {
        const { data: gone } = await db.from('weight_logs').delete().in('id', ids).select('id')
        reaped = (gone || []).length
      }
      err.remove()
      return { errText, landed: ids.length, reaped }
    })

    expect(r.errText, 'a coach in View-as mode must NOT be refused — this is the 2026-08-22 regression').toBe('')
    expect(r.landed, 'the weight must actually have been written for the viewed client').toBeGreaterThan(0)
    expect(r.reaped, 'cleanup must remove what it wrote').toBe(r.landed)
  })
})
