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
//
// UPDATED 2026-09-30: Jake — "personal bests page should be the only page that contains all of this
// data." The form now lives on the CLIENT dashboard only (js/app-dashboard.js's renderClientDashboard,
// untouched here); the SOLO dashboard's own copy is gone, and the Personal Bests tab now mounts
// renderClientPerformance (js/app-progress.js) alongside the 1RM grid so it genuinely is the one place
// with all of it. "the form lives on both dashboards" above is stale for solo specifically — see the
// tests below this note for the current, real state.
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

  // SUPERSEDED 2026-09-30 (Jake: "personal bests page should be the only page that contains all of
  // this data"). This test used to drive the solo DASHBOARD's own copy of the form (#client-pb-form,
  // showClientPBForm/saveClientPB) — that copy is gone now; js/app-dashboard.js's My-progress tile is a
  // preview + link only, per the same instruction. The real write path a solo user reaches today is
  // Progress -> Personal Bests -> the performance-log form renderClientPerformance mounts alongside the
  // 1RM grid (savePerformanceLog, #pb-performance-section) — this test now proves THAT path end to end,
  // keeping the original's actual intent (solo can genuinely write a performance_logs row, not just a
  // unit that tolerates a missing field) rather than the specific UI it used to go through.
  test('SOLO: the real write path (Progress -> Personal Bests) actually writes a row', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(async () => {
      if (!window._soloClientId) return { skip: true }
      await switchView('solo')
      // switchView resolves before renderSoloDashboard's own async fetches finish — without this wait,
      // that late completion overwrites the renderProgress call below moments after it runs (found live:
      // #main-content read back the SOLO DASHBOARD's own markup, not Progress, when this was missing).
      // The original test this one replaces already knew this — same wait, same reason.
      await new Promise(res => setTimeout(res, 2500))
      window._progressTab = 'Personal Bests'
      await renderProgress(document.getElementById('main-content'))
      await new Promise(res => setTimeout(res, 800))
      const name = '[E2E-PB] 5k ' + Date.now()
      if (!document.getElementById('pb-performance-section')) return { err: 'Personal Bests tab has no #pb-performance-section' }
      if (!document.getElementById('pl-name')) return { err: 'renderClientPerformance did not mount its own add-form' }

      document.getElementById('pl-category').value = 'cardio'
      updatePerfUnits()
      document.getElementById('pl-name').value = name
      document.getElementById('pl-value').value = '24.5'
      document.getElementById('pl-unit').value = 'min'
      document.getElementById('pl-date').value = '2026-08-17'
      document.getElementById('pl-notes').value = 'felt strong'
      await savePerformanceLog(window._soloClientId)
      await new Promise(res => setTimeout(res, 1500))

      const { data } = await db.from('performance_logs')
        .select('id, name, category, unit, value, notes').eq('client_id', window._soloClientId).eq('name', name)
      const row = data?.[0]
      if (row) await db.from('performance_logs').delete().eq('id', row.id)   // owns its fixture
      return { row, formError: document.getElementById('perf-error')?.textContent || '' }
    })
    test.skip(!!r.skip, 'no solo client record on this account')
    expect(r.err).toBeUndefined()
    expect(r.formError, 'the form must not report an error').toBe('')
    expect(r.row, 'a row must actually exist in performance_logs').toBeTruthy()
    expect(r.row.category).toBe('cardio')
    expect(r.row.unit).toBe('min')
    expect(r.row.notes, 'notes must persist through the real form').toBe('felt strong')
  })

  // Companion to the test above: proves the OLD dashboard-tile path is genuinely gone, not just
  // untested — "only page that contains all of this data" means the dashboard no longer offers an
  // independent way to create one.
  test('SOLO: the dashboard no longer hosts its own PB form — My progress is a preview + link only', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(async () => {
      if (!window._soloClientId) return { skip: true }
      await switchView('solo')
      await new Promise(res => setTimeout(res, 1500))
      return {
        hasForm: !!document.getElementById('client-pb-form'),
        hasLogRecordButton: [...document.querySelectorAll('button')].some(b => b.textContent.trim() === '+ Log record'),
      }
    })
    test.skip(!!r.skip, 'no solo client record on this account')
    expect(r.hasForm, 'the old inline form must not be on the solo dashboard any more').toBe(false)
    expect(r.hasLogRecordButton, 'the old dashboard button must not be on the solo dashboard any more').toBe(false)
  })

  // The structural half of "only page that contains all of this data": both sections must mount
  // together, not just the one a given test happens to drive.
  test('Personal Bests tab mounts the 1RM grid AND the performance-log categories, both from one tab', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(async () => {
      if (!window._soloClientId) return { skip: true }
      await switchView('solo')
      // See the "SOLO: the real write path" test's own comment just above for why this wait is load-bearing.
      await new Promise(res => setTimeout(res, 2500))
      window._progressTab = 'Personal Bests'
      await renderProgress(document.getElementById('main-content'))
      await new Promise(res => setTimeout(res, 800))
      return {
        has1RMSection: !!document.getElementById('pb-1rms-section'),
        hasPerfSection: !!document.getElementById('pb-performance-section'),
        // Real markers from each render function's own output, not just the wrapper ids existing.
        has1RMHeading: document.getElementById('pb-1rms-section')?.textContent.includes('Personal Bests') ?? false,
        hasPerfForm: !!document.getElementById('pl-category'),
        // #pb-1rms-section must come first in the DOM — the 1RM grid is the more-used surface
        // (BIG_5 quick-entry) and shouldn't make a user scroll past the less-common category list.
        orderCorrect: (() => {
          const a = document.getElementById('pb-1rms-section'), b = document.getElementById('pb-performance-section')
          return !!(a && b) && !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
        })(),
      }
    })
    test.skip(!!r.skip, 'no solo client record on this account')
    expect(r.has1RMSection).toBe(true)
    expect(r.hasPerfSection).toBe(true)
    expect(r.has1RMHeading, 'the 1RM grid actually rendered, not just an empty wrapper').toBe(true)
    expect(r.hasPerfForm, 'renderClientPerformance actually rendered, not just an empty wrapper').toBe(true)
    expect(r.orderCorrect, '1RM grid comes before the performance-log section').toBe(true)
  })

  // _refresh1RMs (js/app-progress.js:23) already has this exact guard, with its own comment
  // explaining why: a caller on a surface hosting neither container must not throw when the write
  // that already succeeded tries to redraw. _refreshClientPerformance mirrors it — test it the same way.
  test('_refreshClientPerformance does not throw when neither container is on the page', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(async () => {
      document.getElementById('pb-performance-section')?.remove()
      document.getElementById('tab-content')?.remove()
      try {
        await _refreshClientPerformance('00000000-0000-0000-0000-000000000000')
        return { threw: false }
      } catch (e) { return { threw: true, message: e.message } }
    })
    expect(r.threw, 'must resolve quietly, not throw: ' + r.message).toBe(false)
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
