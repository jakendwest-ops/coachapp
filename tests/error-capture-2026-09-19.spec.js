// Automatic error capture + the Send-feedback link (2026-09-19).
//
// WHY THIS FILE EXISTS. A beta tester's crash was invisible unless they told the owner: log.error only
// reached their own browser console, and no global error handler existed. The app now reports its own
// failures to a small table (app_errors) and the owner reads them, grouped, in Settings.
//
// THE CONSTRAINT THAT SHAPES EVERYTHING: privacy-policy.html promises error logs hold "only internal IDs
// and timestamps — never your name, email, or health values". So a stored report carries a static tag, an
// error CODE, a code LOCATION and technical context — and never the error message text, `details` or
// `hint` (Postgres puts row values in those). The tests below feed the reporter a message stuffed with an
// email and a body weight and assert neither survives anywhere in the row.
//
// The capture-logic tests run against a stand-in for the database call, so they need no table and cannot
// strand rows. Anything that needs the real table (RLS, the rate-limit trigger) is in the second describe.
const { test, expect } = require('./fixtures')
const { loginAsPT, loginAsClient } = require('./helpers')

const ALLOWED = ['role', 'kind', 'tag', 'detail', 'code', 'frame', 'page', 'build']   // user_id is the server's default

// Replaces db.from for app_errors with a recorder. `force` bypasses the navigator.webdriver suppression
// that keeps the E2E suite from flooding the live table; the suppression itself is tested separately.
async function installSpy(page, { fail = null, force = true } = {}) {
  await page.evaluate(({ fail, force }) => {
    window.__ins = []
    const orig = db.from.bind(db)
    db.from = (t) => t === 'app_errors'
      ? { insert: async (row) => {
          window.__ins.push(row)
          if (fail === 'throw') throw new Error('stand-in failure')
          return { error: fail === 'error' ? { code: 'X' } : null }
        } }
      : orig(t)
    window._errorReportingForce = force
  }, { fail, force })
}
const inserts = page => page.evaluate(() => window.__ins)

test.describe('error capture — what gets reported, and what never does', () => {
  test('a handled error is reported with tag, code and technical context — and none of the error text', async ({ page }) => {
    await loginAsClient(page)
    await installSpy(page)
    await page.evaluate(() => log.error('[E2E-ERR] probe', 'insert failed', {
      code: '42501',
      message: 'jake@x.com weighed 82.5kg',
      details: 'Key (email)=(jake@x.com) already exists',
      hint: '82.5kg',
    }))
    const rows = await inserts(page)
    expect(rows, 'exactly one report').toHaveLength(1)
    const row = rows[0]
    expect(Object.keys(row).every(k => ALLOWED.includes(k)), 'only allow-listed columns: ' + Object.keys(row)).toBe(true)
    expect(row).toMatchObject({ kind: 'log', tag: '[E2E-ERR] probe', detail: 'insert failed', code: '42501', role: 'client' })
    expect(row.page, 'page').toMatch(/^.{1,40}$/)
    expect(row.build, 'build lists the module versions').toMatch(/core\d+/)
    const blob = JSON.stringify(row)
    for (const secret of ['jake@x.com', '82.5', 'already exists', 'Key (email)']) {
      expect(blob, `"${secret}" must never reach the row`).not.toContain(secret)
    }
  })

  test('the same failure reported twice is stored once; distinct failures are capped at 25 a session', async ({ page }) => {
    await loginAsClient(page)
    await installSpy(page)
    await page.evaluate(() => { for (let i = 0; i < 3; i++) log.error('[E2E-ERR] same', 'm', { code: 'C1' }) })
    expect(await inserts(page), 'identical signature').toHaveLength(1)
    await page.evaluate(() => { for (let i = 0; i < 40; i++) log.error('[E2E-ERR] distinct ' + i, 'm', { code: 'C' + i }) })
    expect(await inserts(page), '1 + 24 more, then the cap').toHaveLength(25)
  })

  test('an uncaught error and an unhandled rejection are reported with a code location and no message', async ({ page }) => {
    await loginAsClient(page)
    await installSpy(page)
    await page.evaluate(() => {
      const e = new TypeError('boom jake@x.com')
      e.stack = 'TypeError: boom jake@x.com\n    at f (https://h.example/coachapp/js/app-dashboard.js?v=22:642:9)'
      window.dispatchEvent(new ErrorEvent('error', { error: e, message: 'boom jake@x.com' }))
      window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', {
        promise: Promise.resolve(),
        reason: { code: 'PGRST116', message: 'secret 82.5kg', stack: 'Error\n    at g (https://h.example/coachapp/js/app-clients.js?v=17:52:9)' },
      }))
    })
    const [u, r] = await inserts(page)
    expect(u).toMatchObject({ kind: 'uncaught', tag: 'uncaught', detail: null, code: 'TypeError', frame: 'js/app-dashboard.js?v=22:642' })
    expect(r).toMatchObject({ kind: 'rejection', tag: 'rejection', detail: null, code: 'PGRST116', frame: 'js/app-clients.js?v=17:52' })
    const blob = JSON.stringify([u, r])
    for (const secret of ['boom', 'jake@x.com', 'secret', '82.5']) expect(blob, `"${secret}"`).not.toContain(secret)
  })

  test('nothing is reported before consent, after sign-out, under WebDriver, or with no user', async ({ page }) => {
    await loginAsClient(page)
    expect(await page.evaluate(() => navigator.webdriver), 'this test needs the WebDriver signal to mean anything').toBe(true)
    expect(await page.evaluate(() => _errorReportingUid === currentUser.id), 'on, for THIS user, once showApp() has passed the consent gate').toBe(true)

    // 1. WebDriver, no force flag: this is what stops the E2E suite flooding the live table.
    await installSpy(page, { force: false })
    await page.evaluate(() => log.error('[E2E-ERR] webdriver', 'm', { code: 'W' }))
    expect(await inserts(page), 'WebDriver suppression').toHaveLength(0)

    // 2. Forced on, but the consent-gated switch is off.
    await page.evaluate(() => { window._errorReportingForce = true; window.__uid = _errorReportingUid; _errorReportingUid = null })
    await page.evaluate(() => log.error('[E2E-ERR] pre-consent', 'm', { code: 'P' }))
    expect(await inserts(page), 'before consent').toHaveLength(0)

    // 3. Switch on, but nobody is signed in.
    await page.evaluate(() => { _errorReportingUid = window.__uid; window.__user = currentUser; currentUser = null })
    await page.evaluate(() => log.error('[E2E-ERR] no-user', 'm', { code: 'N' }))
    expect(await inserts(page), 'no user').toHaveLength(0)
    await page.evaluate(() => { currentUser = window.__user })

    // 4. Control: with everything on, the same call IS reported — so the zeros above mean something.
    await page.evaluate(() => log.error('[E2E-ERR] control', 'm', { code: 'K' }))
    expect(await inserts(page), 'control').toHaveLength(1)
  })

  test('signing out switches capture off and forgets what was already reported', async ({ page }) => {
    await loginAsClient(page)
    await installSpy(page)
    await page.evaluate(() => log.error('[E2E-ERR] before-signout', 'm', { code: 'S' }))
    expect(await page.evaluate(() => _reportedSigs.size)).toBe(1)
    // scope:'local' revokes only THIS session, not every session for the account (the default 'global' would).
    // The injected session is shared with other tests through session-store.js, so they fall back to a form login
    // — slower, still correct, and the same thing the existing sign-out specs already cause.
    await page.evaluate(async () => { await db.auth.signOut({ scope: 'local' }) })
    await expect.poll(() => page.evaluate(() => _errorReportingUid)).toBeNull()
    expect(await page.evaluate(() => _reportedSigs.size), 'the next account starts with a clean slate').toBe(0)
  })

  test('a failing or throwing report never surfaces, loops, or throws into the caller', async ({ page }) => {
    await loginAsClient(page)
    await installSpy(page, { fail: 'error' })
    const r1 = await page.evaluate(async () => {
      try {
        log.error('[E2E-ERR] insert-fails', 'original', { code: 'F' })
        await new Promise(res => setTimeout(res, 50))          // let the failing insert's .then run BEFORE reading the toast
        return { threw: false, toast: document.getElementById('app-toast')?.textContent }
      } catch (e) { return { threw: true } }
    })
    expect(r1.threw).toBe(false)
    expect(r1.toast, 'the user still sees the ORIGINAL error, not one about reporting').toBe('[E2E-ERR] insert-fails: original')
    expect(await inserts(page), 'one attempt so far').toHaveLength(1)

    // A report that failed to store (offline at the gym) is retried when the same failure recurs — but only a
    // few times, so a broken pipe is not hammered forever: 5 failures in total, then capture goes quiet.
    await page.evaluate(async () => {
      for (let i = 0; i < 12; i++) { log.error('[E2E-ERR] insert-fails', 'original', { code: 'F' }); await new Promise(res => setTimeout(res, 20)) }
    })
    expect(await inserts(page), 'retried, then bounded at 5 attempts however often it recurs').toHaveLength(5)

    await installSpy(page, { fail: 'throw' })
    const r2 = await page.evaluate(() => { try { log.error('[E2E-ERR] insert-throws', 'm', { code: 'T' }); return false } catch (e) { return true } })
    expect(r2, 'a throwing insert must not throw out of log.error').toBe(false)
  })

  test('capture switches on only when THIS boot passes the consent gate — not before it, not for someone else', async ({ page }) => {
    await loginAsClient(page)
    await installSpy(page)
    const r = await page.evaluate(async () => {
      // A user who has NOT consented: showApp() must show the gate and leave capture off. (The previous test sets
      // the switch by hand, so it would still pass if the enabling line moved above the consent check.)
      const realLoad = window._loadConsentState
      window._loadConsentState = async () => ({ consented_at: null, consent_policy_version: null })
      await showApp()
      const gateShown = !!document.getElementById('consent-gate-modal')
      const uidAfterGate = _errorReportingUid
      log.error('[E2E-ERR] at-the-gate', 'm', { code: 'G' })
      const reportedAtGate = window.__ins.length
      window._loadConsentState = realLoad

      // Capture is bound to ONE user id: the same switch must not carry over to a different signed-in user.
      document.getElementById('consent-gate-modal')?.remove()
      await showApp()                                            // consented: switches on for this user
      const onForMe = _errorReportingUid === currentUser.id
      const me = currentUser
      currentUser = { ...me, id: 'a-different-user' }
      log.error('[E2E-ERR] someone-else', 'm', { code: 'S' })
      const reportedForOther = window.__ins.length
      currentUser = me
      return { gateShown, uidAfterGate, reportedAtGate, onForMe, reportedForOther }
    })
    expect(r.gateShown, 'control: the gate really was shown').toBe(true)
    expect(r.uidAfterGate, 'capture is off at the gate').toBeNull()
    expect(r.reportedAtGate, 'nothing reported at the gate').toBe(0)
    expect(r.onForMe, 'control: once consented, it is on for this user').toBe(true)
    expect(r.reportedForOther, 'and not for anyone else').toBe(0)
  })

  test('the owner viewing as a client is labelled "sudo", not "client"', async ({ page }) => {
    await loginAsClient(page)
    await installSpy(page)
    await page.evaluate(() => { window._sudoClientId = 'some-client'; log.error('[E2E-ERR] sudo', 'm', { code: 'U' }) })
    expect((await inserts(page))[0].role).toBe('sudo')
  })

  test('failed saves that go through dbq are reported too — label and code only, never the message', async ({ page }) => {
    await loginAsClient(page)
    await installSpy(page)
    const r = await page.evaluate(async () => {
      await dbq('e2e-probe:save', Promise.resolve({ data: null, error: { code: '42501', message: 'jake@x.com 82.5kg', details: 'Key (email)=(jake@x.com)' } }), { showUserError: false })
      await dbq('e2e-probe:nofound', Promise.resolve({ data: null, error: { code: 'PGRST116', message: 'no rows' } }), { showUserError: false })
      return window.__ins
    })
    expect(r, 'the save failure is reported and the expected "no row found" is not').toHaveLength(1)
    expect(r[0]).toMatchObject({ kind: 'log', tag: 'e2e-probe:save', code: '42501', detail: null })
    expect(JSON.stringify(r[0])).not.toMatch(/jake@x\.com|82\.5|Key \(email\)/)
  })

  test('the code location is the CALLER of log.error — proved with a real app function, not a hand-written stack', async ({ page }) => {
    await loginAsClient(page)
    await installSpy(page)
    // _verifyClientAccess (app-core.js) calls log.error itself when given no client id.
    await page.evaluate(() => _verifyClientAccess('e2e-probe-frame', undefined))
    const [row] = await inserts(page)
    expect(row.tag).toBe('e2e-probe-frame')
    expect(row.frame, 'a real js/app-core.js?v=N:line, taken from the second application frame').toMatch(/^js\/app-core\.js\?v=\d+:\d+$/)
  })

  test('the export pages through every report — the API caps a response at 200 rows', async ({ page }) => {
    await loginAsClient(page)
    // A stand-in that behaves like the capped API: 200 rows, then 37, then nothing. A single .limit(1000) query
    // would return the first 200 only and the export would silently omit 37.
    const r = await page.evaluate(async () => {
      const mk = (n, from) => Array.from({ length: n }, (_, i) => ({ created_at: '2026-01-01T00:00:00Z', kind: 'log', tag: 'row-' + (from + i) }))
      const pages = [mk(200, 0), mk(37, 200)]
      const calls = []
      const orig = db.from.bind(db)
      db.from = (t) => {
        if (t !== 'app_errors') return orig(t)
        const all = pages.flat()
        const b = { select: () => b, eq: () => b, order: () => b, range: async (a, z) => { calls.push([a, z]); return { data: all.slice(a, z + 1), error: null } } }
        return b
      }
      const bundle = await _buildMyDataBundle()
      return { n: bundle.appErrors.length, last: bundle.appErrors.at(-1)?.tag, calls }
    })
    expect(r.n, 'all 237 reports are in the export').toBe(237)
    expect(r.last).toBe('row-236')
    // Three requests: 200, 37, then the empty one that ends it. Each page starts where the rows read so far end
    // (200, then 237) — not on a fixed 200-row stride, which is what this asserted (0/200/400) while the export
    // hand-rolled its own loop. Since 2026-09-20 the export pages through the shared _fetchAllRows, and a stride
    // would silently SKIP rows the moment the API cap dropped below the page size. This stand-in does not report a
    // count, so the empty page is what ends the loop here; against the live API the count ends it a request sooner.
    expect(r.calls, 'three pages, each starting where the previous one ended').toEqual([[0, 199], [200, 399], [237, 436]])
  })

  test('helpers: printable-ASCII only, emails redacted, codes allow-listed, frames parsed from Chrome and Firefox stacks', async ({ page }) => {
    await loginAsClient(page)
    const r = await page.evaluate(() => {
      const chrome  = 'Error\n    at Object.error (https://h/coachapp/js/app-core.js?v=35:37:60)\n    at saveClientPB (https://h/coachapp/js/app-clients.js?v=17:52:9)'
      const firefox = 'error@https://h/coachapp/js/app-core.js?v=35:37:60\nsaveClientPB@https://h/coachapp/js/app-clients.js?v=17:52:9\n'
      return {
        clean1: _reportClean('failed for jake@x.com ok', 50),
        clean2: _reportClean('héllo\u0000 w', 50),
        clean3: _reportClean('abcdef', 3),
        cleanNull: _reportClean(null, 10),
        codeOk: [_reportCode({ code: '42501' }), _reportCode({ status: 401 }), _reportCode(new RangeError('x'))],
        codeBad: [_reportCode({ code: 'has space' }), _reportCode({ code: 'x'.repeat(40) }), _reportCode(null), _reportCode({ code: {} })],
        // `name` counts only on a real Error: an exercise or a client also has a name, and "Jake" passes the shape check.
        codeName: [_reportCode({ name: 'Jake' }), _reportCode(new TypeError('x')), _reportCode(new SyntaxError('x'))],
        chrome: _reportFrame(chrome, 1), firefox: _reportFrame(firefox, 1),
        starter: _reportFrame('e@https://h/coachapp/js/starter-content.js?v=5:10:3', 0),
        none: _reportFrame('Error\n    at <anonymous>:1:1', 0), tooDeep: _reportFrame(chrome, 5),
      }
    })
    expect(r.clean1).toBe('failed for [email] ok')
    expect(r.clean2).toBe('hllo w')
    expect(r.clean3).toBe('abc')
    expect(r.cleanNull).toBe('')
    expect(r.codeOk).toEqual(['42501', '401', 'RangeError'])
    expect(r.codeBad).toEqual([null, null, null, null])
    expect(r.codeName, "a plain object's name is never a code; a real Error's is").toEqual([null, 'TypeError', 'SyntaxError'])
    expect(r.chrome).toBe('js/app-clients.js?v=17:52')
    expect(r.firefox).toBe('js/app-clients.js?v=17:52')
    expect(r.starter).toBe('js/starter-content.js?v=5:10')
    expect(r.none).toBeNull()
    expect(r.tooDeep).toBeNull()
  })
})

test.describe('the owner card and the feedback card', () => {
  test('grouping counts repeats and distinct users; a hostile row renders as text and runs nothing', async ({ page }) => {
    await loginAsClient(page)
    const r = await page.evaluate(async () => {
      const base = { created_at: '2026-09-19T10:00:00Z', kind: 'log', code: '42501', frame: 'js/app-x.js?v=1:2', build: 'core1', detail: '"><script>window.__xss=2</script>' }
      const hostile = '<img src=x onerror="window.__xss=1">'
      const rows = [
        { ...base, id: 'a1', user_id: 'u1', tag: hostile },
        { ...base, id: 'a2', user_id: 'u2', tag: hostile, created_at: '2026-09-19T11:00:00Z' },
        { ...base, id: 'a3', user_id: 'u1', tag: 'saveClientPB', code: null, frame: null },
      ]
      const groups = _groupErrorReports(rows)
      const host = document.createElement('div')
      host.innerHTML = _errorReportsCardHtml(rows, false)
      document.body.appendChild(host)
      await new Promise(res => setTimeout(res, 250))            // give a vulnerable onerror time to fire
      const out = {
        groups: groups.map(g => ({ tag: g.tag, count: g.count, users: g.users, ids: g.ids })),
        xss: window.__xss ?? null,
        img: host.querySelectorAll('img').length,
        script: host.querySelectorAll('script').length,
        text: host.textContent.includes('<img src=x'),
        cardId: !!host.querySelector('#error-reports-card'),
      }
      host.remove()
      return out
    })
    expect(r.groups[0]).toEqual({ tag: '<img src=x onerror="window.__xss=1">', count: 2, users: 2, ids: ['a1', 'a2'] })
    expect(r.groups[1]).toMatchObject({ tag: 'saveClientPB', count: 1, users: 1 })
    expect(r.xss, 'a stored payload must not execute in the owner\'s session').toBeNull()
    expect(r.img + r.script, 'no element may be created from stored text').toBe(0)
    expect(r.text, 'it is shown as text instead').toBe(true)
    expect(r.cardId).toBe(true)
  })

  test('the owner card has honest empty and failed states', async ({ page }) => {
    await loginAsClient(page)
    const r = await page.evaluate(() => ({
      empty: _errorReportsCardHtml([], false), failed: _errorReportsCardHtml(null, true),
    }))
    expect(r.empty).toContain('No error reports')
    expect(r.failed).toContain('Couldn')
    expect(r.failed, 'a failed load must not claim "no reports"').not.toContain('No error reports')
  })

  for (const [label, login] of [['CLIENT', loginAsClient], ['COACH', loginAsPT]]) {
    test(`${label}: Settings offers Send feedback (an email link with no personal data) and no owner card`, async ({ page }) => {
      await login(page)
      await page.evaluate(() => navigate('settings'))
      const link = page.locator('#feedback-card a[href^="mailto:"]')
      await expect(link).toBeVisible()
      const info = await page.evaluate(() => ({
        href: document.querySelector('#feedback-card a[href^="mailto:"]').getAttribute('href'),
        email: currentUser.email, name: currentProfile?.full_name || '', owner: OWNER_EMAIL,
      }))
      expect(info.href.startsWith('mailto:' + info.owner)).toBe(true)
      const decoded = decodeURIComponent(info.href)
      expect(decoded).toContain('App build:')
      expect(decoded.toLowerCase(), 'the prefill must not carry the sender\'s email').not.toContain(info.email.toLowerCase())
      if (info.name.length > 2) expect(decoded.toLowerCase(), 'nor their name').not.toContain(info.name.toLowerCase())
      await expect(page.locator('#error-reports-card'), 'owner-only').toHaveCount(0)
    })
  }

  test('SOLO: Settings offers Send feedback', async ({ page }) => {
    await loginAsPT(page)
    const soloId = await page.evaluate(() => window._soloClientId || null)
    test.skip(!soloId, 'no solo client record on this account')
    await page.evaluate(() => switchView('solo'))
    await expect(page.locator('.solo-lower')).toBeVisible()
    await page.evaluate(() => navigate('settings'))
    await expect(page.locator('#feedback-card a[href^="mailto:"]')).toBeVisible()
  })

  test('OWNER: the error reports card renders for the owner account and survives a load that returns nothing', async ({ page }) => {
    await loginAsPT(page)
    // The gate is a UI affordance only; RLS decides what the query can return. For this account it returns
    // nothing (or the table does not exist yet) — the card must still render, not break Settings.
    await page.evaluate(() => { currentUser = { ...currentUser, email: OWNER_EMAIL } })
    await page.evaluate(() => renderSettings(document.getElementById('main-content')))
    await expect(page.locator('#error-reports-card')).toBeVisible()
    await expect(page.locator('#feedback-card')).toBeVisible()
  })
})

// ── The real table: who can do what ─────────────────────────────────────────────────────────────────────────
// These need scripts/add-app-errors-2026-09-19.sql to have been run. Every refusal is preceded by a control
// that proves the table is there and a well-formed write is accepted, so a missing table cannot pass as
// "refused". The OWNER's read/delete path cannot be asserted here — no spec can log in as the owner — so
// that one is confirmed by hand after deploy. Rows are tagged [E2E-ERR] and every test removes its own,
// checking the count (a refused delete removes 0 rows and returns no error).
const TAG = '[E2E-ERR] rls'
const myUid = page => page.evaluate(() => currentUser.id)
const insertRow = (page, row) => page.evaluate(async (row) => {
  const { error } = await db.from('app_errors').insert(row)
  return error ? { code: error.code, message: error.message } : null
}, row)
const mineByTag = (page, tag) => page.evaluate(async (tag) => {
  const { data, error } = await db.from('app_errors')
    .select('id, user_id, kind, tag, detail, code, role, frame, build').like('tag', tag + '%')
  return { error: error?.code || null, rows: data || [] }
}, tag)
async function removeMine (page, tagPrefix) {
  const r = await page.evaluate(async (p) => {
    const { error } = await db.from('app_errors').delete().like('tag', p + '%').select('id')
    const { data: left } = await db.from('app_errors').select('id').like('tag', p + '%')
    return { err: error?.code || null, remaining: (left || []).length }
  }, tagPrefix)
  expect(r.err, 'cleanup delete errored').toBeNull()
  expect(r.remaining, 'cleanup left rows behind').toBe(0)
}

// Every identity that inserted a row must delete its OWN — under RLS a client cannot see, let alone remove, a
// coach's row, so cleaning up from one page leaves the other's debris while its count check still passes.
// (Found by the reaper probe: the cross-read test stranded '[E2E-ERR] rls coach-row …' on every run.)
async function removeFrom (pages, ctx) {
  const failures = []
  for (const p of pages) {
    try { await removeMine(p, TAG) } catch (e) { failures.push(e) }
  }
  await ctx?.close()
  if (failures.length) throw failures[0]
}

test.describe('app_errors — the real table', () => {
  test('CLIENT: a real log.error travels the whole pipe — sanitised, stamped with their own id, accepted by every CHECK', async ({ page }) => {
    await loginAsClient(page)
    await removeMine(page, TAG)
    const tag = `${TAG} pipe ${Date.now()}`
    await page.evaluate(() => { window._errorReportingForce = true })
    try {
      await page.evaluate((tag) => log.error(tag, 'real insert', { code: '42501', message: 'jake@x.com 82.5kg' }), tag)
      await expect.poll(async () => (await mineByTag(page, tag)).rows.length, { timeout: 8000 }).toBe(1)
      const { rows } = await mineByTag(page, tag)
      expect(rows[0]).toMatchObject({ user_id: await myUid(page), kind: 'log', detail: 'real insert', code: '42501', role: 'client' })
      expect(rows[0].build, 'the real build string fits its CHECK and names the modules').toMatch(/core\d+/)
      expect(JSON.stringify(rows[0]), 'no error text reached the table').not.toMatch(/jake@x\.com|82\.5/)
    } finally {
      await page.evaluate(() => { window._errorReportingForce = false })
      await removeMine(page, tag)
    }
  })

  test('CLIENT: writes and reads their own row; cannot write as someone else, alter a row, or break a CHECK', async ({ page, browser }) => {
    await loginAsClient(page)
    const ptContext = await browser.newContext()
    const ptPage = await ptContext.newPage()
    const tag = `${TAG} own ${Date.now()}`
    try {
      await loginAsPT(ptPage)
      for (const p of [page, ptPage]) await removeMine(p, TAG)
      const ptUid = await myUid(ptPage)

      expect(await insertRow(page, { kind: 'log', tag }), 'control: a well-formed own row is accepted').toBeNull()
      expect((await mineByTag(page, tag)).rows, 'control: and they can read it back').toHaveLength(1)

      expect((await insertRow(page, { kind: 'log', tag: tag + ' spoof', user_id: ptUid }))?.code, 'another user\'s id is refused by RLS').toBe('42501')
      expect((await insertRow(page, { kind: 'bogus', tag }))?.code, 'kind CHECK').toBe('23514')
      expect((await insertRow(page, { kind: 'log', tag: TAG + ' ' + 'x'.repeat(80) }))?.code, 'length CHECK').toBe('23514')

      const upd = await page.evaluate(async (tag) => {
        const { data: mine } = await db.from('app_errors').select('id').eq('tag', tag)
        const { error } = await db.from('app_errors').update({ tag: tag + ' changed' }).eq('id', mine[0].id)
        const { data: after } = await db.from('app_errors').select('tag').eq('id', mine[0].id)
        return { err: error?.code || null, tagAfter: after?.[0]?.tag }
      }, tag)
      expect(upd.tagAfter, 'UPDATE is not granted: the row is unchanged').toBe(tag)
    } finally {
      await removeFrom([page, ptPage], ptContext)
    }
  })

  test('a coach and a client cannot read each other\'s reports', async ({ page, browser }) => {
    await loginAsClient(page)
    const ptContext = await browser.newContext()
    const ptPage = await ptContext.newPage()
    const stamp = Date.now()
    const clientTag = `${TAG} client-row ${stamp}`, ptTag = `${TAG} coach-row ${stamp}`
    try {
      await loginAsPT(ptPage)
      for (const p of [page, ptPage]) await removeMine(p, TAG)
      expect(await insertRow(page, { kind: 'log', tag: clientTag }), 'control: client row').toBeNull()
      expect(await insertRow(ptPage, { kind: 'log', tag: ptTag }), 'control: coach row').toBeNull()
      expect((await mineByTag(page, clientTag)).rows, 'client sees own').toHaveLength(1)
      expect((await mineByTag(ptPage, ptTag)).rows, 'coach sees own').toHaveLength(1)
      expect((await mineByTag(page, ptTag)).rows, 'client cannot see the coach\'s row').toHaveLength(0)
      expect((await mineByTag(ptPage, clientTag)).rows, 'a non-owner coach cannot see a client\'s row').toHaveLength(0)
    } finally {
      await removeFrom([page, ptPage], ptContext)     // each identity deletes the rows IT wrote
    }
  })

  test('the rate limit refuses the 61st report inside an hour', async ({ page }) => {
    await loginAsClient(page)
    await removeMine(page, TAG)     // a crashed earlier run must not eat into this hour's allowance
    const tag = `${TAG} rate ${Date.now()}`
    try {
      const outcomes = await page.evaluate(async (tag) => {
        const out = []
        for (let i = 0; i < 61; i++) {
          const { error } = await db.from('app_errors').insert({ kind: 'log', tag })
          out.push(error ? (error.message || error.code) : 'ok')
        }
        return out
      }, tag)
      expect(outcomes.slice(0, 60).every(o => o === 'ok'), 'the first 60 are accepted').toBe(true)
      expect(outcomes[60], 'the 61st is refused by the trigger').toMatch(/rate limit/i)
    } finally { await removeMine(page, TAG) }
  })

  // The trigger counts a user's rows by created_at, and created_at is a column the CLIENT can send. Found by
  // the pre-commit review (two independent reviewers): back-date the rows and none is ever counted, so the
  // flood cap only held for honest clients; future-date them and they sit above every real report in the
  // owner's newest-first list. The fix is server-side — the trigger overwrites created_at with now().
  test('the server, not the client, decides when a report happened (created_at cannot be forged)', async ({ page }) => {
    await loginAsClient(page)
    await removeMine(page, TAG)
    const tag = `${TAG} forge ${Date.now()}`
    try {
      const r = await page.evaluate(async (tag) => {
        const out = []
        for (const [label, when] of [['back-dated', '2000-01-01T00:00:00Z'], ['future-dated', '2999-01-01T00:00:00Z']]) {
          const { error } = await db.from('app_errors').insert({ kind: 'log', tag: tag + ' ' + label, created_at: when })
          const { data } = await db.from('app_errors').select('created_at').eq('tag', tag + ' ' + label)
          out.push({ label, err: error?.code || null, ageMinutes: data?.[0] ? Math.round((Date.now() - new Date(data[0].created_at).getTime()) / 60000) : null })
        }
        return out
      }, tag)
      for (const x of r) {
        expect(x.err, `control: the ${x.label} insert itself is accepted (its timestamp is overwritten, not refused)`).toBeNull()
        expect(Math.abs(x.ageMinutes), `${x.label}: created_at must be the server's now(), not the client's (${x.ageMinutes} minutes off)`).toBeLessThan(10)
      }
    } finally { await removeMine(page, TAG) }
  })

  test('the rate limit cannot be evaded by back-dating, nor by sending all the rows in one request', async ({ page }) => {
    await loginAsClient(page)
    await removeMine(page, TAG)
    const tag = `${TAG} evade ${Date.now()}`
    try {
      // (a) 61 single inserts, every one back-dated two hours: the honest-client test above cannot see this path.
      const outcomes = await page.evaluate(async (tag) => {
        const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString()
        const out = []
        for (let i = 0; i < 61; i++) {
          const { error } = await db.from('app_errors').insert({ kind: 'log', tag, created_at: twoHoursAgo })
          out.push(error ? (error.message || error.code) : 'ok')
        }
        return out
      }, tag)
      expect(outcomes.filter(o => o === 'ok').length, 'at most 60 back-dated rows may be stored').toBeLessThanOrEqual(60)
      expect(outcomes[60], 'the 61st is refused however it is dated').toMatch(/rate limit/i)
      await removeMine(page, TAG)

      // (b) 61 rows in ONE request: rows earlier in the same statement must count, and the statement is atomic.
      const bulk = await page.evaluate(async (tag) => {
        const { error } = await db.from('app_errors').insert(Array.from({ length: 61 }, () => ({ kind: 'log', tag: tag + ' bulk' })))
        const { data } = await db.from('app_errors').select('id').eq('tag', tag + ' bulk')
        return { err: error?.message || null, stored: (data || []).length }
      }, tag)
      expect(bulk.err, 'a 61-row single request is refused').toMatch(/rate limit/i)
      expect(bulk.stored, 'and refused whole — nothing half-stored').toBe(0)
    } finally { await removeMine(page, TAG) }
  })

  test('an anonymous request can neither write nor read the table', async ({ page }) => {
    await loginAsClient(page)
    const tag = `${TAG} anon-control ${Date.now()}`
    try {
      // Control: a MISSING table also refuses anonymous requests, so prove the table is there and holds a
      // row an anonymous reader would see if it could.
      expect(await insertRow(page, { kind: 'log', tag }), 'control: the table exists and accepts a signed-in write').toBeNull()
      const uid = await myUid(page)
      const r = await page.evaluate(async ({ tag, uid }) => {
        const h = { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' }
        const post = await fetch(SUPABASE_URL + '/rest/v1/app_errors', { method: 'POST', headers: h, body: JSON.stringify({ kind: 'log', tag: '[E2E-ERR] anon', user_id: uid }) })   // WITH a real user_id, so only grants/RLS can refuse it
        const get = await fetch(SUPABASE_URL + '/rest/v1/app_errors?select=id&tag=eq.' + encodeURIComponent(tag), { headers: h })
        return { post: post.status, get: get.status, rows: get.ok ? (await get.json()).length : null }
      }, { tag, uid })
      expect(r.post, 'anonymous insert refused').toBeGreaterThanOrEqual(400)
      expect(r.get >= 400 || r.rows === 0, `anonymous read must be refused or see nothing (status ${r.get}, rows ${r.rows})`).toBe(true)
    } finally { await removeMine(page, TAG) }
  })

  test('the data export contains the user\'s own report', async ({ page }) => {
    await loginAsClient(page)
    const tag = `${TAG} export ${Date.now()}`
    try {
      expect(await insertRow(page, { kind: 'log', tag }), 'control').toBeNull()
      const found = await page.evaluate(async (tag) => (await _buildMyDataBundle()).appErrors.some(r => r.tag === tag), tag)
      expect(found).toBe(true)
    } finally { await removeMine(page, TAG) }
  })
})

test.describe('export', () => {
  test('the data export carries the user\'s own error reports, and does not fail if there are none', async ({ page }) => {
    await loginAsClient(page)
    const r = await page.evaluate(async () => { const b = await _buildMyDataBundle(); return { has: 'appErrors' in b, isArray: Array.isArray(b.appErrors) } })
    expect(r).toEqual({ has: true, isArray: true })
  })
})
