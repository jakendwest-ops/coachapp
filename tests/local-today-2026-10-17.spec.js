const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

// ─── "Today" is the LOCAL day (docs/bugs/2026-10-13-dates-defaulted-from-the-utc-day-are-wrong-outside-utc.md and
// docs/bugs/2026-10-04-runner-saves-the-session-date-as-the-utc-day.md). The app took "today" from new Date().toISOString().split('T')[0], which is the UTC day: in the
// UK summer every default date was yesterday from 00:00 to 01:00, and for anyone west of UTC every default date was TOMORROW from their local evening (a session logged at
// 8 pm in New York was filed under the next day). The clock is pinned to a moment where the two days DISAGREE, in a London context and a New York one, and every place that
// builds a date from "now" must give the local day. Nothing is written to the database: the writes (a session's date, a 1RM, a plan block) are caught at db.from.

const CASES = [
  { zone: 'Europe/London', when: '00:30 on 16 July in London (BST)', at: '2026-07-15T23:30:00Z', local: '2026-07-16', utc: '2026-07-15' },
  { zone: 'America/New_York', when: '20:30 on 15 July in New York (EDT)', at: '2026-07-16T00:30:00Z', local: '2026-07-15', utc: '2026-07-16' }
]

async function soloAt(page, at) {
  await loginAsPT(page)
  await page.evaluate(() => localStorage.setItem('_activeView', 'solo'))
  await page.goto('/')
  await expect.poll(() => page.evaluate(() => !!window._soloClientId), { timeout: 15000 }).toBe(true)
  await expect(page.locator('#dash-goals')).toBeVisible({ timeout: 20000 })      // the app's start-up navigation has landed (it closes every open modal; a test that opens one first loses it)
  // The pinned time is set AFTER sign-in so the saved login is judged on the real clock; the app only reads "now" from here on.
  await page.clock.setFixedTime(new Date(at))
  await page.evaluate(() => { window._navigateNow = async () => {} })      // the app's late start-up navigation would close the dialogs these tests open
}

for (const c of CASES) {
  test.describe(`${c.when}`, () => {
    test.use({ timezoneId: c.zone })

    test('the scenario is real: the UTC day and the local day disagree', async ({ page }) => {
      await soloAt(page, c.at)
      // the UTC day written out by hand: this file is the one place that knows what the old expression produced
      const days = await page.evaluate(() => { const d = new Date(); return { utc: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`, local: _ymdLocal(d) } })
      expect(days.utc).toBe(c.utc)
      expect(days.local).toBe(c.local)
    })

    test('a stored date is shown as that same calendar day (not the day before, west of UTC)', async ({ page }) => {
      await soloAt(page, c.at)
      const labels = await page.evaluate(() => _aggregateSeries([{ date: '2026-07-15', v: 1 }, { date: '2026-12-31', v: 2 }], 'v', 'avg').map(p => p.label))
      expect(labels).toEqual(['15 Jul', '31 Dec'])
    })

    test('every form that defaults to today shows the local day', async ({ page }) => {
      test.setTimeout(90_000)
      await soloAt(page, c.at)
      const got = await page.evaluate(async () => {
        const out = {}
        const val = id => document.getElementById(id)?.value
        const none = '00000000-0000-4000-8000-000000000999'
        showAddEventModal(); out.addEvent = val('ae-date'); document.getElementById('add-event-modal')?.remove()
        showClientAddEventModal(); out.clientAddEvent = val('ae-date'); document.getElementById('add-event-modal')?.remove()
        showAssignProgramModal(window._soloClientId); out.assignDialog = val('ap-start'); document.getElementById('assign-program-modal')?.remove()
        await showAssignProgramToClientModal(none); out.addToMyPlan = val('apc-start'); document.getElementById('apc-modal')?.remove()
        const host = document.createElement('div'); document.body.appendChild(host)
        await renderClientWeight(window._soloClientId, host); out.logWeight = host.querySelector('#wl-date')?.value
        await renderClientPerformance(window._soloClientId, host); out.logPB = host.querySelector('#pl-date')?.value
        host.remove()
        await showLogSessionModal(window._soloClientId); out.logSession = val('ls-date'); document.getElementById('log-session-modal')?.remove()
        return out
      })
      for (const [form, day] of Object.entries(got)) expect.soft(day, form).toBe(c.local)
      expect(Object.keys(got)).toHaveLength(7)
    })

    test('a session is filed under the local day it was started, and so is a 1RM saved from the runner', async ({ page }) => {
      test.setTimeout(90_000)
      await soloAt(page, c.at)
      const out = await page.evaluate(async () => {
        const seen = []
        const real = window.__realFrom = window.__realFrom || db.from.bind(db)
        const empty = () => { const o = { select: () => o, eq: () => o, then: (res, rej) => Promise.resolve({ data: [], error: null }).then(res, rej) }; return o }      // the stored-1RM read the runner makes when it starts
        db.from = t => t === 'client_1rms'
          ? { select: empty, insert: p => { seen.push({ via: window.__via, rows: [].concat(p).map(r => r.recorded_at) }); return Promise.resolve({ data: null, error: null }) } }
          : real(t)
        try {
          window._runnerTemplates = []; window._fakeRsName = 'Date probe'; window._fakeRsTemplate = ''
          await _startFreshRunner(window._soloClientId)
          const sessionDate = _runner.date
          // the runner's own 1RM box, filled in with a straight weight
          const box = document.createElement('div')
          box.innerHTML = '<div id="rorm-epley-fields" style="display:none"></div><input id="rorm-weight" value="100"><p id="rorm-error"></p>'
          document.body.appendChild(box)
          window.__via = 'runner 1RM box'; try { await saveRunnerOneRM(0) } catch (e) { /* the screen after the save is not what is under test */ }
          box.remove()
          // the post-session 1RM suggestion
          window.__via = 'post-session suggestion'; try { await _savePostSessionOneRM(0, window._soloClientId, 'Date probe lift', 120, null) } catch (e) { }
          // the 1RMs asked for when a plan is added
          const quick = document.createElement('div'); quick.innerHTML = '<input id="mor-0-weight" value="80">'; document.body.appendChild(quick)
          window._missingOneRMExercises = [{ exerciseId: null, name: 'Date probe lift' }]
          window.__via = 'plan 1RM entry'; try { await _saveMissingOneRMEntries(window._soloClientId) } catch (e) { }
          quick.remove()
          return { sessionDate, seen }
        } finally { db.from = real }
      })
      expect(out.sessionDate, "the session's own date").toBe(c.local)
      expect(out.seen.map(s => s.via), 'all three 1RM saves reached the database call').toEqual(['runner 1RM box', 'post-session suggestion', 'plan 1RM entry'])
      for (const s of out.seen) expect.soft(s.rows, s.via).toEqual([c.local])
    })

    test('removing a plan files its history block under the local day, and the data download is named for it', async ({ page }) => {
      test.setTimeout(90_000)
      await soloAt(page, c.at)
      const out = await page.evaluate(async () => {
        const real = window.__realFrom = window.__realFrom || db.from.bind(db)
        const blocks = []
        const chain = data => { const o = { select: () => o, eq: () => o, maybeSingle: () => Promise.resolve({ data, error: null }) }; return o }
        db.from = t => t === 'client_programs'
          ? chain({ id: 'cp-x', client_id: window._soloClientId, program_id: null, start_date: '2026-07-06', created_at: '2026-07-06T09:00:00Z', programs: { name: 'Date probe plan', program_phases: [{ duration_weeks: 2 }] } })
          : t === 'client_program_blocks' ? { insert: p => { blocks.push(p.ended_at); return Promise.resolve({ error: null }) } }
          : real(t)
        const names = []
        const realClick = HTMLAnchorElement.prototype.click, realBundle = window._buildMyDataBundle
        HTMLAnchorElement.prototype.click = function () { names.push(this.download) }
        window._buildMyDataBundle = async () => ({})
        try {
          try { await _archiveAssignmentBlock('cp-x', 'removed') } catch (e) { }
          await downloadMyData()
        } finally { db.from = real; HTMLAnchorElement.prototype.click = realClick; window._buildMyDataBundle = realBundle }
        return { blocks, names }
      })
      expect(out.blocks, 'the block was written once, ended on the local day').toEqual([c.local])
      expect(out.names).toEqual([`coachapp-data-${c.local}.json`])
    })
  })
}
