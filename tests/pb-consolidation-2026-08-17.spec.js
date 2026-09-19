// Personal Bests consolidation (2026-08-17).
//
// Jake: "'Personal Bests' page is redundant now that the 1RM page has the data I need. Please delete
// the current 'personal best' page, and rename the 1RM page to 'personal bests'."
//
// His real data said the first half was right and the second was not safe as stated:
//   - strength on the old page IS superseded — 4 exercises, unused since 25 June, against the 1RM
//     tab's 12 from 1 July onward;
//   - but that page has been the ONLY home for cardio bests since the 2026-07-08 fold-in, and
//     deleting it would take 6 months of 5k times, a Skierg PB and 11 entries with notes with it.
//
// So: the 1RM tab takes the name, the old page keeps its data as "Benchmarks", and the entry form
// stops offering strength so the two cannot diverge again.
//
// UPDATED 2026-09-19: Jake had the "Benchmarks" tab deleted regardless (see docs/decisions.md). The
// form and saveClientPB tests below still stand — the form lives on both dashboards — and the first
// test now pins that Benchmarks is no longer a tab and that a stored 'Benchmarks' migrates forward.
const { test, expect } = require('./fixtures')
const { loginAsPT, loginAsClient } = require('./helpers')

test.describe('Personal Bests consolidation', () => {
  test('Benchmarks is no longer a tab; a stored "1RMs" or "Benchmarks" migrates to Personal Bests and any other unknown name falls back to Body Weight', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(async () => {
      const migrated = {}
      for (const stored of ['1RMs', 'Benchmarks', 'NoSuchTab']) {
        window._progressTab = stored          // what a returning user has in memory
        await renderProgress(document.getElementById('main-content'))
        migrated[stored] = {
          tab: window._progressTab,
          selected: document.querySelector('.chip-row .chip[aria-selected="true"]')?.textContent.trim() ?? null,
        }
      }
      const tabs = [...document.querySelectorAll('#main-content button')]
        .map(b => b.textContent.trim())
        .filter(t => ['Body Weight', 'Personal Bests', 'Benchmarks', 'Performance', '1RMs'].includes(t))
      return { migrated, tabs }
    })
    // Without the migration a stored name that is no longer a tab matches no chip and no branch, and the
    // page sits on its "Coming soon" placeholder — the `||` default only covers an EMPTY value.
    expect(r.migrated['1RMs'], 'a stored 1RMs must become Personal Bests').toEqual({ tab: 'Personal Bests', selected: 'Personal Bests' })
    expect(r.migrated['Benchmarks'], 'a stored Benchmarks must become Personal Bests').toEqual({ tab: 'Personal Bests', selected: 'Personal Bests' })
    expect(r.migrated['NoSuchTab'], 'an unknown name must fall back to Body Weight with a chip selected').toEqual({ tab: 'Body Weight', selected: 'Body Weight' })
    expect(r.tabs).toEqual(['Body Weight', 'Personal Bests', 'Performance'])
  })

  test('the PB form is ONE definition, and every field it needs is present', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      const host = document.createElement('div')
      host.innerHTML = _pbFormHtml('abc-123')
      const ids = ['cpb-name', 'cpb-category', 'cpb-value', 'cpb-unit', 'cpb-date', 'cpb-notes', 'cpb-error']
      return {
        present: ids.filter(id => host.querySelector('#' + id)),
        unitTag: host.querySelector('#cpb-unit')?.tagName,
        categories: [...(host.querySelector('#cpb-category')?.options || [])].map(o => o.value),
        units: [...(host.querySelector('#cpb-unit')?.options || [])].map(o => o.value),
        date: host.querySelector('#cpb-date')?.getAttribute('value'),
      }
    })
    // #cpb-notes is the one the SOLO copy never rendered — saveClientPB read it unconditionally and
    // threw before the insert, silently, making the page Jake wanted deleted the only working path.
    expect(r.present).toEqual(['cpb-name', 'cpb-category', 'cpb-value', 'cpb-unit', 'cpb-date', 'cpb-notes', 'cpb-error'])
    // The unit was a free-text box despite PERF_CATEGORIES carrying the right lists all along.
    expect(r.unitTag, 'unit must be a dropdown, not free text').toBe('SELECT')
    expect(r.categories, 'strength belongs on the Personal Bests tab now').not.toContain('strength')
    // Canonical PERF_CATEGORIES order, minus strength — not the order of the allow-list constant.
    expect(r.categories).toEqual(['cardio', 'body_metric', 'benchmark'])
    expect(r.units, 'units must come from the chosen category').toEqual(['min', 'sec', 'km', 'mi'])
    // Seeded from _ymdLocal, not toISOString — the latter reports yesterday between 00:00-01:00 BST.
    expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  test('changing the category repopulates the units', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      const host = document.createElement('div')
      host.innerHTML = _pbFormHtml('abc-123')
      document.body.appendChild(host)
      try {
        const before = [...document.getElementById('cpb-unit').options].map(o => o.value)
        document.getElementById('cpb-category').value = 'benchmark'
        _pbSyncUnits()
        const after = [...document.getElementById('cpb-unit').options].map(o => o.value)
        return { before, after }
      } finally { host.remove() }
    })
    expect(r.before).toEqual(['min', 'sec', 'km', 'mi'])          // cardio
    expect(r.after).toEqual(['min', 'sec', 'reps'])               // benchmark
  })

  test('saving from a form with NO notes field does not throw', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(async () => {
      // The exact shape of the old solo dashboard form: every field EXCEPT #cpb-notes.
      const host = document.createElement('div')
      host.innerHTML = '<div id="client-pb-form">' +
        '<input id="cpb-name" value=""><select id="cpb-category"><option value="cardio">Cardio</option></select>' +
        '<input id="cpb-value" value=""><select id="cpb-unit"><option value="min">min</option></select>' +
        '<input id="cpb-date" value=""><p id="cpb-error"></p></div>'
      document.body.appendChild(host)
      try {
        // Left blank on purpose: this exercises the VALIDATION path, not a real insert. Before the
        // fix it threw a TypeError on #cpb-notes before reaching validation, and showed nothing.
        await saveClientPB('00000000-0000-0000-0000-000000000000')
        return { threw: false, error: document.getElementById('cpb-error').textContent }
      } catch (e) {
        return { threw: true, message: e.message }
      } finally { host.remove() }
    })
    expect(r.threw, 'saveClientPB threw: ' + r.message).toBe(false)
    expect(r.error, 'it must reach validation and tell the user what is wrong').toContain('required')
  })

  // The whole point of the fix, end to end. Until now this path had NEVER completed a successful
  // insert: saveClientPB read #cpb-notes unconditionally, the solo dashboard's form never rendered
  // it, so every attempt threw a TypeError before the insert and showed the user nothing. A unit test
  // proving saveClientPB tolerates a missing field does not prove the real form saves — this does.
  test('SOLO: the dashboard form actually writes a row', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(async () => {
      if (!window._soloClientId) return { skip: true }
      await switchView('solo')
      await new Promise(res => setTimeout(res, 2500))
      const name = '[E2E-PB] 5k ' + Date.now()
      showClientPBForm(window._soloClientId)
      const form = document.getElementById('client-pb-form')
      if (!form) return { err: 'solo dashboard rendered no PB form' }
      if (!document.getElementById('cpb-notes')) return { err: 'solo form still has no #cpb-notes' }

      document.getElementById('cpb-name').value = name
      document.getElementById('cpb-category').value = 'cardio'
      _pbSyncUnits()
      document.getElementById('cpb-value').value = '24.5'
      document.getElementById('cpb-unit').value = 'min'
      document.getElementById('cpb-date').value = '2026-08-17'
      document.getElementById('cpb-notes').value = 'felt strong'
      await saveClientPB(window._soloClientId)
      await new Promise(res => setTimeout(res, 1500))

      const { data } = await db.from('performance_logs')
        .select('id, name, category, unit, value, notes').eq('client_id', window._soloClientId).eq('name', name)
      const row = data?.[0]
      if (row) await db.from('performance_logs').delete().eq('id', row.id)   // owns its fixture
      return { row, formError: document.getElementById('cpb-error')?.textContent || '' }
    })
    test.skip(!!r.skip, 'no solo client record on this account')
    expect(r.err).toBeUndefined()
    expect(r.formError, 'the form must not report an error').toBe('')
    expect(r.row, 'a row must actually exist in performance_logs').toBeTruthy()
    expect(r.row.category).toBe('cardio')
    expect(r.row.unit).toBe('min')
    expect(r.row.notes, 'the notes field that used to crash this path must persist').toBe('felt strong')
  })

  // Restores the client-role coverage that went with the Benchmarks tab (2026-09-19): the deleted "Log
  // record button opens the form" test was the only one that drove a CLIENT's PB form, and the solo test
  // above is the only other end-to-end save. This drives the real button and the real save on the
  // client dashboard, and checks the card redraws with the new row.
  test('CLIENT: the dashboard "+ Log record" opens the form, and saving writes a row and redraws the card', async ({ page }) => {
    await loginAsClient(page)
    const name = '[E2E-PB] Client 5k ' + Date.now()
    const clientId = await page.evaluate(async () => {
      const { data } = await db.from('clients').select('id').eq('user_id', currentUser.id).single()
      return data.id
    })
    const card = page.locator('.dashboard-card', { has: page.locator('h2.card-title', { hasText: 'Benchmarks' }) })
    try {
      await expect(page.locator('#client-pb-form')).toBeHidden()
      await card.getByRole('button', { name: '+ Log record' }).click()
      await expect(page.locator('#client-pb-form')).toBeVisible()
      await page.evaluate((n) => {
        document.getElementById('cpb-name').value = n
        document.getElementById('cpb-category').value = 'cardio'
        _pbSyncUnits()
        document.getElementById('cpb-value').value = '24.5'
        document.getElementById('cpb-unit').value = 'min'
        // Today, so it is the newest row and lands inside the card's four-record cut.
        document.getElementById('cpb-date').value = new Date().toLocaleDateString('en-CA')
      }, name)
      await page.evaluate(id => saveClientPB(id), clientId)
      await expect(card.locator(`text=${name}`)).toBeVisible({ timeout: 5000 })   // saved AND the card redrew
    } finally {
      // Verify the cleanup actually cleaned: an RLS-denied delete removes 0 rows and returns no error.
      const cleanup = await page.evaluate(async ({ clientId, name }) => {
        const { error } = await db.from('performance_logs').delete().eq('client_id', clientId).eq('name', name).select('id')
        const { data: left } = await db.from('performance_logs').select('id').eq('client_id', clientId).eq('name', name)
        return { err: error ? error.message : null, remaining: (left || []).length }
      }, { clientId, name })
      expect(cleanup.err, 'cleanup delete errored').toBeNull()
      expect(cleanup.remaining, 'cleanup deleted nothing — RLS likely denies a client DELETE on performance_logs, and this test would strand rows').toBe(0)
    }
  })

  test('a unit that does not belong to the category is rejected', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(async () => {
      const host = document.createElement('div')
      host.innerHTML = '<div id="client-pb-form">' +
        '<input id="cpb-name" value="Skierg"><select id="cpb-category"><option value="cardio" selected>Cardio</option></select>' +
        '<input id="cpb-value" value="2250"><input id="cpb-unit" value="5km">' +
        '<input id="cpb-date" value="2026-07-08"><input id="cpb-notes" value=""><p id="cpb-error"></p></div>'
      document.body.appendChild(host)
      try {
        await saveClientPB('00000000-0000-0000-0000-000000000000')
        return document.getElementById('cpb-error').textContent
      } finally { host.remove() }
    })
    // Jake's real Skierg row: unit "5km" is a DISTANCE, and the value held seconds.
    expect(r).toContain('Unit must be one of')
    expect(r).toContain('sec')
  })
})
