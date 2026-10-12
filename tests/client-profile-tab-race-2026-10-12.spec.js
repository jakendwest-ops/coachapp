const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

// ─── Found while regression-testing on 2026-10-12 (docs/bugs/2026-10-12-client-profile-shows-the-overview-under-another-tab-when-the-overview-loads-last.md) ──
//
// openClient starts the Overview render WITHOUT waiting for it, and the Overview makes three queries before it writes #tab-content. Every tab render is async and
// they all wrote into the same #tab-content, so whichever finished last won: tap Workouts before the Overview's queries returned and the Overview landed over the
// Workouts pane while the Workouts button stayed highlighted. Three tests flaked on it in two days (a coach's "Start workout" click, "element was detached").
//
// Deterministic, no network: the Overview render is a stub that waits on a gate; the tab is switched while it waits; then the gate opens. Nothing is written.

test.describe('Client profile tabs: a late render cannot land over the tab that replaced it (2026-10-12)', () => {
  test('the Overview finishing AFTER Workouts was tapped does not replace the Workouts pane', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(async () => {
      const host = document.createElement('div')
      host.id = 'race-host'
      host.innerHTML = '<div class="tabs"><button class="tab-btn active" id="rb-o">Overview</button><button class="tab-btn" id="rb-w">Workouts</button></div><div id="tab-content"></div>'
      document.body.appendChild(host)
      const real = { o: window.renderClientOverview, w: window.renderClientWorkouts }
      let release; const gate = new Promise(res => { release = res })
      window.renderClientOverview = async (id, el) => { await gate; el.innerHTML = 'OVERVIEW CONTENT' }
      window.renderClientWorkouts = async (id, el) => { el.innerHTML = 'WORKOUTS CONTENT' }
      try {
        // what openClient does: start the Overview render into the pane and do not wait for it
        const slow = window.renderClientOverview('c', document.getElementById('tab-content'))
        switchTab(document.getElementById('rb-w'), 'tab-workouts', 'c')      // the athlete taps Workouts straight away
        await new Promise(res => setTimeout(res, 0))                           // the Workouts render has finished
        release(); await slow                                                  // and now the slow Overview lands
        return {
          shown: document.getElementById('tab-content').textContent,
          panes: document.querySelectorAll('#race-host #tab-content').length,
          active: document.querySelector('#race-host .tab-btn.active').textContent
        }
      } finally { window.renderClientOverview = real.o; window.renderClientWorkouts = real.w; host.remove() }
    })
    expect(r.shown, 'the pane shows the tab that was tapped, not the render that finished last').toBe('WORKOUTS CONTENT')
    expect(r.active, 'and the highlighted button agrees with it').toBe('Workouts')
    expect(r.panes, 'there is exactly one pane by that id, so code that repaints the tab by id finds the live one').toBe(1)
  })

  // A guard on the id, NOT the regression test (that is the test above): a pane that lost its id would make every repaint-by-id find nothing.
  test('the fresh pane keeps the id, so a repaint that looks #tab-content up by id after switching reaches the live pane', async ({ page }) => {
    await loginAsPT(page)
    const shown = await page.evaluate(async () => {
      const host = document.createElement('div')
      host.id = 'race-host2'
      host.innerHTML = '<div class="tabs"><button class="tab-btn active" id="rb2-o">Overview</button><button class="tab-btn" id="rb2-w">Workouts</button></div><div id="tab-content">old</div>'
      document.body.appendChild(host)
      const real = window.renderClientWorkouts
      window.renderClientWorkouts = async (id, el) => { el.innerHTML = 'FIRST' }
      try {
        switchTab(document.getElementById('rb2-w'), 'tab-workouts', 'c')
        await new Promise(res => setTimeout(res, 0))
        document.getElementById('tab-content').innerHTML = 'REPAINTED BY ID'      // what the app's own re-render calls do after an action
        return document.querySelector('#race-host2 #tab-content').textContent
      } finally { window.renderClientWorkouts = real; host.remove() }
    })
    expect(shown).toBe('REPAINTED BY ID')
  })
  // Review, 2026-10-12: switchTab's fresh pane stops a late render from painting over the live tab, but a late render still ran its GLOBAL side effects:
  // renderClientWeight and renderClientPerformance call _destroyManagedCharts (which destroys EVERY chart), Performance resets window.__perfChartData and
  // renderClient1RMs rebinds window._oneRMGridRows. A render whose pane is no longer in the page now stops after its fetch. Each test has a connected-pane
  // control, so a render that never gets that far cannot pass it. The control's render may throw on the stubbed empty data AFTER the point being measured; that
  // error is recorded and shown in the failure message, never swallowed.
  test('a superseded Performance render does not destroy the live tab\'s charts or reset its data', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(async () => {
      const real = { f: window._fetchAllRows, d: window._destroyManagedCharts }
      let destroyed = 0, err = null
      window._fetchAllRows = async () => ({ data: [], error: null })
      window._destroyManagedCharts = () => { destroyed++ }
      window.__perfChartData = 'live-tab-sentinel'
      try {
        await renderClientPerformance('c', document.createElement('div'))      // never in the page: the pane of a superseded render
        const afterGone = { destroyed, sentinel: window.__perfChartData }
        const live = document.createElement('div'); document.body.appendChild(live)
        try { await renderClientPerformance('c', live) } catch (e) { err = String(e).slice(0, 120) }   // control: a connected pane runs the whole render
        const out = { afterGone, destroyedAfterLive: destroyed, sentinelAfterLive: window.__perfChartData, err }
        live.remove()
        return out
      } finally { window._fetchAllRows = real.f; window._destroyManagedCharts = real.d; delete window.__perfChartData }
    })
    expect(r.afterGone, 'a pane that is gone touches nothing').toEqual({ destroyed: 0, sentinel: 'live-tab-sentinel' })
    expect(r.destroyedAfterLive, 'CONTROL: a connected pane does tear the charts down (render error: ' + r.err + ')').toBeGreaterThan(0)
    expect(r.sentinelAfterLive, 'and resets the data').not.toBe('live-tab-sentinel')
  })

  test('a superseded Weight render does not destroy the live tab\'s charts', async ({ page }) => {
    await loginAsPT(page)
    await page.route('**/rest/v1/clients*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ starting_weight_kg: null, goal_weight_kg: null }) }))
    const r = await page.evaluate(async () => {
      const real = { f: window._fetchAllRows, d: window._destroyManagedCharts }
      let destroyed = 0, err = null
      window._fetchAllRows = async () => ({ data: [], error: null })
      window._destroyManagedCharts = () => { destroyed++ }
      try {
        await renderClientWeight('c', document.createElement('div'))
        const afterGone = destroyed
        const live = document.createElement('div'); document.body.appendChild(live)
        try { await renderClientWeight('c', live) } catch (e) { err = String(e).slice(0, 120) }
        const out = { afterGone, afterLive: destroyed, err }
        live.remove()
        return out
      } finally { window._fetchAllRows = real.f; window._destroyManagedCharts = real.d }
    })
    expect(r.afterGone, 'a pane that is gone destroys nothing').toBe(0)
    expect(r.afterLive, 'CONTROL: a connected pane does (render error: ' + r.err + ')').toBeGreaterThan(0)
  })

  test('a superseded 1RMs render does not rebind the live tab\'s grid rows', async ({ page }) => {
    await loginAsPT(page)
    await page.route('**/rest/v1/client_1rms*', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
    const r = await page.evaluate(async () => {
      let err = null
      window._oneRMGridRows = 'live-tab-sentinel'
      try {
        await renderClient1RMs('c', document.createElement('div'))
        const afterGone = window._oneRMGridRows
        const live = document.createElement('div'); document.body.appendChild(live)
        try { await renderClient1RMs('c', live) } catch (e) { err = String(e).slice(0, 120) }
        const out = { afterGone, afterLive: window._oneRMGridRows, err }
        live.remove()
        return out
      } finally { delete window._oneRMGridRows }
    })
    expect(r.afterGone, 'a pane that is gone rebinds nothing').toBe('live-tab-sentinel')
    expect(r.afterLive, 'CONTROL: a connected pane rebinds it (render error: ' + r.err + ')').not.toBe('live-tab-sentinel')
  })
})
