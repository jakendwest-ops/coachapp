// A render that was still loading when you navigated must not paint over the page you moved to.
//
// ROOT CAUSE of a flake that had defeated four investigations. Every async `render*` follows the same
// shape: paint "Loading…", await several Supabase queries, then write `el.innerHTML`. Nothing checks
// whether the page is still the one that asked for the render. So if a navigation happens while those
// awaits are in flight, the OLD page's render lands last and replaces the new page's content — while
// the nav highlight, which `navigate()` sets synchronously, stays on the new page.
//
// That produces a very specific and very confusing end state, reproduced directly:
//
//     afterNav          "Library"        navigate() worked
//     afterStaleRender  "My Training"    the old page's render landed afterwards
//     nav active        "library"        the highlight still says Library
//     currentPage       "library"        the app believes it is on Library
//
// Which is byte-for-byte the state in the preserved failure screenshot of solo-account.spec.js:48:
// bottom nav highlighting Library, content showing the solo dashboard.
//
// It is position-dependent in the suite for the obvious reason: deep into a 30-minute run the queries
// take longer, so the window in which a navigation can overtake a render is wider.
//
// MEASURED: 24 of 26 async render* functions write innerHTML after an await, and only 3 carry any
// staleness guard. Fixing them one at a time would be 24 chances to miss one, so the guard lives in
// navigate() instead — the single place every page render is dispatched from.

const { test, expect } = require('@playwright/test')
const { loginAsPT } = require('./helpers')

test.describe('A stale render cannot clobber the page you navigated to (2026-09-04)', () => {
  test('a slow render that resolves after a navigation does not repaint', async ({ page }) => {
    await loginAsPT(page)

    const r = await page.evaluate(async () => {
      const out = {}
      const sleep = (ms) => new Promise(res => setTimeout(res, ms))

      // Replace the dashboard render with a deliberately slow one. `renderSoloDashboard` is a
      // top-level function declaration, so it IS a property of the global object and navigate()'s
      // switch resolves it through that property — the same mechanism guardReentry relies on.
      const original = window.renderSoloDashboard
      window.renderSoloDashboard = async (el) => {
        await sleep(1200)
        el.innerHTML = '<h1 class="page-title">My Training</h1><p>stale content</p>'
      }

      try {
        // switchView, not just the localStorage key: the Library page titles itself from
        // currentProfile.role, so without a real view switch the heading reads "Workouts" and the
        // assertions below would be pinned to the wrong page name. Caught by this test failing for
        // that reason on its first run.
        localStorage.setItem('_activeView', 'solo')
        switchView('solo')
        await sleep(2000)

        navigate('solo-dashboard')      // starts the slow render
        await sleep(150)                // still in flight
        navigate('library')             // move on before it finishes
        await sleep(600)
        out.afterNavigate = document.querySelector('h1')?.textContent

        await sleep(1500)               // the stale render's await now resolves
        out.afterStaleResolved = document.querySelector('h1')?.textContent
        out.navActive = [...document.querySelectorAll('.bottom-nav-item.active, .nav-item.active')]
          .map(e => e.dataset.page)[0]
        out.currentPage = currentPage
      } finally {
        window.renderSoloDashboard = original
      }
      return out
    })

    // The navigation itself must have worked — otherwise the assertion below passes for the wrong
    // reason and this test proves nothing.
    expect(r.afterNavigate, 'the navigation must land before the stale render resolves').toContain('Library')

    // THE ASSERTION. Before the fix this was "My Training": the stale render overwrote the page.
    expect(r.afterStaleResolved, 'a render from the page you LEFT must not repaint over the page you are on').toContain('Library')

    // And the app's own idea of where it is must agree with what is on screen — the disagreement is
    // what made this so hard to recognise as a race rather than a broken click.
    expect(r.navActive).toBe('library')
    expect(r.currentPage).toBe('library')
  })
})
