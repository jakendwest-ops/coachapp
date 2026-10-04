const { test, expect } = require('./fixtures')
const { loginAsClient, loginAsPT } = require('./helpers')
const { installCappedApi, restoreCappedApi, cappedApiCalls } = require('./capped-api')

// ─── The dashboard rework: one landing page and hub for all three roles (Jake, 2026-10-03) ─────────────────────────────────
//
// "The whole dashboard needs a rework for mobile view, as nothing really flows or stands out as a dashboard or makes it feel like
// this is the landing page and hub of your account." Scoped with him: all three dashboards in one design; today's session first and
// then the week; body weight, streak ("weeks hitting my whole plan"), program progress and calendar; Goals stay; the PT | Personal
// switch stays floating. These run the REAL render functions against tests/capped-api.js (a read-only stand-in that caps responses
// at 200 rows, models `!inner`, and fails closed on anything it does not implement) with the clock PINNED, so nothing depends on
// the weekday the suite runs on and no rows are created anywhere. The pure rules (streak, week strip, program tile) are pinned in
// tests-node/dashboard-model.test.mjs; what is tested here is what the SCREENS do with them.
//
// The pinned "now" is Saturday 3 Oct 2026, 11:00 in London. The week is Mon 28 Sep .. Sun 4 Oct.
test.use({ timezoneId: 'Europe/London' })

const NOW = new Date('2026-10-03T10:00:00Z')
const TODAY = '2026-10-03', MON = '2026-09-28'
const addDays = (s, n) => new Date(Date.parse(s + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10)
const FAILING = { error: { code: 'XX000', message: 'boom' } }

// ── data for the client and solo pages ──────────────────────────────────────────────────────────────────────────────────────
// A 12-week program of three 4-week phases, four sessions a week (Mon, Wed, Fri, Sat), started two weeks ago: today is week 3.
const PLAN = [[1, 'Upper Body'], [3, 'Deadlift + Threshold'], [5, 'Lower Body'], [6, 'Squat + Threshold']]
let seq = 0
const log = (cid, name, date, extra = {}) => ({ id: 'log-' + (++seq), client_id: cid, name, date, created_at: date + 'T07:40:00Z', workout_log_exercises: [{ id: 'x1' }, { id: 'x2' }, { id: 'x3' }, { id: 'x4' }, { id: 'x5' }], ...extra })
const namesByDow = Object.fromEntries(PLAN)

function programTables(cid) {
  const pws = PLAN.map(([dow, name]) => ({ id: 'pw-' + dow, day_of_week: dow, session_order: 1, week_number: 1, notes: null, workout_templates: { id: 't-' + dow, name } }))
  return {
    client_programs: [{ id: 'cp1', client_id: cid, created_at: '2026-09-01T00:00:00Z', start_date: addDays(MON, -14),
      programs: { name: 'Operation 240', description: 'x', program_phases: [
        { id: 'ph1', name: 'Accumulation 1', duration_weeks: 4, order_index: 1, program_phase_workouts: pws },
        { id: 'ph2', name: 'Intensification', duration_weeks: 4, order_index: 2, program_phase_workouts: [] },
        { id: 'ph3', name: 'Peak', duration_weeks: 4, order_index: 3, program_phase_workouts: [] } ] } }],
    // The CLIENT'S CLONE of each session's template: the id Start must launch (never the master slot's template id above).
    client_program_workouts: pws.map(p => ({ id: 'cpw-' + p.id, client_program_id: 'cp1', program_phase_workout_id: p.id, workout_template_id: 'ct-' + p.id })),
  }
}
// The three finished weeks before this one are complete (all four sessions); this week has Mon, Wed and Fri logged.
function defaultLogs(cid) {
  const out = []
  for (const back of [-21, -14, -7]) for (const [dow, name] of PLAN) out.push(log(cid, name, addDays(MON, back + dow - 1)))
  for (const dow of [1, 3, 5]) out.push(log(cid, namesByDow[dow], addDays(MON, dow - 1)))
  return out
}
function ownTables(cid, uid, { program = true, logs, goals, events, weights, checkIns } = {}) {
  const prog = program ? programTables(cid) : { client_programs: [], client_program_workouts: [] }
  return {
    ...prog,
    workout_logs: logs ?? (program ? defaultLogs(cid) : [log(cid, 'Freeform', addDays(MON, -6)), log(cid, 'Freeform', addDays(MON, -13))]),
    weight_logs: weights ?? Array.from({ length: 14 }, (_, i) => ({ client_id: cid, date: addDays(TODAY, -13 + i), weight_kg: i === 13 ? 108 : i === 12 ? 107.6 : 105 + i * 0.1 })),
    goals: goals ?? [
      { id: 'g1', client_id: cid, title: 'Squat 160 kg', target_date: addDays(TODAY, 62), status: 'active', start_value: 100, current_value: 130, target_value: 160, goal_milestones: [] },
      { id: 'g2', client_id: cid, title: 'Body weight 112 kg', target_date: addDays(TODAY, 120), status: 'active', start_value: 105, current_value: 108, target_value: 112, goal_milestones: [] },
      { id: 'g3', client_id: cid, title: 'Run 5k under 25 min', target_date: null, status: 'active', start_value: null, current_value: null, target_value: null, goal_milestones: [] },
    ],
    events: events ?? [{ id: 'e1', client_id: cid, title: 'Body check-in', date: addDays(TODAY, 8), type: 'review', notes: '' }],
    client_check_ins: checkIns ?? [{ id: 'ci1', client_id: cid, created_at: new Date(NOW.getTime() - 9 * 86400000).toISOString(), sleep: 4, energy: 3, stress: 2, soreness: 3, notes: '' }],
    clients: [{ id: cid, user_id: uid, coach_id: 'coach-x', full_name: 'Jake West' }],
  }
}

// ── data for the coach page ─────────────────────────────────────────────────────────────────────────────────────────────────
const PEOPLE = [['c1', 'Priya M'], ['c2', 'Sam K'], ['c3', 'Dan R'], ['c4', 'Lena W'], ['c5', 'Tom B'], ['c6', 'Ana C']]
const summaryRow = (id, name, over = {}) => ({
  client_id: id, full_name: name, status: 'active', sessions_7d: 0, last_session_date: null, last_weigh_in_date: null,
  program_name: null, program_start: null, program_weeks: null, ...over,
})
function coachTables(uid, { quietToday = false } = {}) {
  const summaries = [
    summaryRow('c1', 'Priya M', { sessions_7d: 3, last_session_date: TODAY, last_weigh_in_date: addDays(TODAY, -1), program_name: 'Operation Strength', program_weeks: 12, program_start: addDays(TODAY, 12 - 83) }),   // ends in 12 days
    summaryRow('c2', 'Sam K', { sessions_7d: 2, last_session_date: TODAY, last_weigh_in_date: TODAY, program_name: 'Hypertrophy block', program_weeks: 8, program_start: addDays(TODAY, 5 - 55) }),        // ends in 5 days
    summaryRow('c3', 'Dan R', { sessions_7d: 0, last_session_date: addDays(TODAY, -12), last_weigh_in_date: addDays(TODAY, -9) }),
    summaryRow('c4', 'Lena W', { sessions_7d: 1, last_session_date: addDays(TODAY, -3), last_weigh_in_date: addDays(TODAY, -2), program_name: 'Base', program_weeks: 12, program_start: addDays(TODAY, -20) }),
    summaryRow('c5', 'Tom B'),                                                                                                                                                                          // never trained
    summaryRow('c6', 'Ana C', { sessions_7d: 4, last_session_date: addDays(TODAY, -1), last_weigh_in_date: addDays(TODAY, -3), program_name: 'Peak', program_weeks: 6, program_start: addDays(TODAY, -10) }),
  ]
  const perDay = [4, 3, 5, 4, 3, quietToday ? 0 : 2, 0]   // Mon .. Sun this week
  const logs = [log('c1', 'Previous week', addDays(MON, -1))]   // inside the 7-day window but NOT in this week's bars
  perDay.forEach((count, i) => {
    for (let k = 0; k < count; k++) {
      const p = PEOPLE[(i + k) % PEOPLE.length]
      logs.push({ id: 'cl-' + (++seq), client_id: p[0], name: ['Lower A', 'Upper B', 'Push', 'Pull', 'Legs'][k % 5], date: addDays(MON, i), created_at: addDays(MON, i) + 'T' + String(7 + k).padStart(2, '0') + ':' + (k % 2 ? '15' : '40') + ':00Z', workout_log_exercises: [{ id: 'x' }, { id: 'y' }] })
    }
  })
  return {
    clients: PEOPLE.map(p => ({ id: p[0], full_name: p[1], status: 'active', coach_id: uid })),
    coach_client_summary: summaries,
    workout_logs: logs,
    weight_logs: [['c1', 62.4, -1], ['c2', 91.2, 0], ['c4', 70.8, -2], ['c6', 58.1, -3]].map(([c, kg, d]) => ({ client_id: c, weight_kg: kg, created_at: new Date(NOW.getTime() + d * 86400000).toISOString() })),
    goals: [
      { id: 'g1', title: 'Bench 100 kg', status: 'active', target_date: addDays(TODAY, 7), client_id: 'c2', clients: { full_name: 'Sam K' } },
      { id: 'g2', title: 'Body fat 22%', status: 'active', target_date: addDays(TODAY, 11), client_id: 'c1', clients: { full_name: 'Priya M' } },
    ],
  }
}

// ── plumbing ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
async function prepare(page) {
  await page.clock.setFixedTime(NOW)   // after login: the saved session was issued against the real clock
  await page.evaluate(() => { window._unitPrefs = { ...(window._unitPrefs || {}), weight: 'kg' }; window._branding = { businessName: 'West Strength', logoUrl: null } })
}
const install = (page, tables) => installCappedApi(page, tables)
const render = async (page, fn) => {
  await page.evaluate(async (fn) => { await window[fn](document.getElementById('main-content')) }, fn)
  await expect(page.locator('#dash-root')).toBeVisible()
}
// Everything on the page a person reads, as plain data.
const read = (page) => page.evaluate(() => {
  const t = (sel) => { const e = document.querySelector(sel); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null }
  const hero = document.getElementById('dash-hero')
  return {
    eyebrow: t('.dash-eyebrow'), greet: t('.dash-greet'), date: t('.dash-date'),
    hero: hero && {
      kind: hero.dataset.kind, calm: hero.classList.contains('dash-hero-calm'), eyebrow: t('#dash-hero .dash-hero-eyebrow'),
      title: t('#dash-hero .dash-hero-title'), meta: t('#dash-hero .dash-hero-meta'), buttons: [...hero.querySelectorAll('.dash-btn')].map(b => b.textContent.trim()),
    },
    weekSub: t('#dash-week .dash-card-sub'),
    days: [...document.querySelectorAll('#dash-week .dash-day')].map(b => ({
      label: b.querySelector('.dash-dn').textContent, num: b.querySelector('.dash-dd').textContent,
      kind: [...b.querySelector('.dash-dc').classList].find(c => c.startsWith('dash-dc-')).slice(8), pressed: b.getAttribute('aria-pressed'), today: b.classList.contains('dash-day-today'),
    })),
    streak: t('#dash-streak'), program: t('#dash-program'), weight: t('#dash-weight'), calendar: t('#dash-calendar'), goals: t('#dash-goals'),
    banner: t('.dash-banner'), checkin: !!document.getElementById('checkin-card'),
  }
})
const kinds = (r) => r.days.map(d => d.kind)

test.describe('the client and solo dashboard', () => {
  test.beforeEach(async ({ page }) => { await loginAsClient(page); await prepare(page) })
  const withData = async (page, opts = {}, fn = 'renderClientDashboard') => {
    const uid = await page.evaluate(() => currentUser.id)
    if (fn === 'renderSoloDashboard') await page.evaluate(() => { window._soloClientId = 'dash-c1' })
    await install(page, ownTables('dash-c1', uid, opts))
    await render(page, fn)
  }

  test('a training day: the Today card, the week, the streak and the program all tell one story', async ({ page }) => {
    await withData(page)
    const r = await read(page)
    expect(r.greet, 'the greeting keeps the "Hi," form the login helpers wait for').toMatch(/^Hi, /)
    expect(r.date).toBe('Saturday 3 October')
    expect(r.eyebrow).toBe('Coached by West Strength')

    expect(r.hero.kind).toBe('plan')
    expect(r.hero.calm, 'the Today card is the one saturated block').toBe(false)
    expect(r.hero.eyebrow).toBe('Up next · Operation 240')
    expect(r.hero.title).toBe('Squat + Threshold')
    expect(r.hero.meta).toBe('Session 4 of 4 this week')
    expect(r.hero.buttons).toEqual(['▶ Start workout', 'View program'])

    expect(kinds(r), 'Mon-Fri done or rest, Saturday planned').toEqual(['done', 'rest', 'done', 'rest', 'done', 'plan', 'rest'])
    expect(r.days.map(d => d.num)).toEqual(['28', '29', '30', '1', '2', '3', '4'])
    expect(r.days[5].today).toBe(true)
    expect(r.days.filter(d => d.pressed === 'true').map(d => d.label), 'the pressed day is the one the Today card shows').toEqual(['Sat'])
    expect(r.weekSub).toBe('3 of 4 sessions done')

    expect(r.streak, 'three finished weeks with every planned session logged; this week, unfinished, is ignored').toContain('3 week streak')
    expect(r.streak).toContain('hitting your whole plan')
    expect(r.program).toContain('Wk 3')
    expect(r.program).toContain('of 12')
    expect(r.program).toContain('Accumulation 1 · Operation 240')
    await expect(page.locator('#dash-program .dash-meter i')).toHaveAttribute('style', /width:\s*25%/)
  })

  test('Start launches the CLIENT\'S CLONE of the session\'s template - never the master slot\'s - and is a real button', async ({ page }) => {
    await withData(page)
    await page.evaluate(() => { window.__started = null; window.startWorkoutRunner = (...a) => { window.__started = a } })
    await page.locator('#dash-hero .dash-btn-primary').click()
    expect(await page.evaluate(() => window.__started), 'client id, then the clone template id (ct-..., not the master t-...)').toEqual(['dash-c1', 'ct-pw-6'])
  })

  test('tapping a day swaps the Today card in place - no new read - and the same day again, or Back to today, returns', async ({ page }) => {
    await withData(page)
    const readsBefore = (await cappedApiCalls(page)).length
    await page.locator('#dash-week .dash-day').nth(2).click()                    // Wednesday: done
    let r = await read(page)
    expect(r.hero).toMatchObject({ kind: 'done', calm: true, eyebrow: 'Wed 30 Sept · Done', title: 'Deadlift + Threshold', meta: '5 exercises logged' })
    expect(r.hero.buttons).toEqual(['View session', 'Back to today'])
    expect(r.days.filter(d => d.pressed === 'true').map(d => d.label)).toEqual(['Wed'])
    await expect(page.locator('#dash-week .dash-day[data-day="2026-09-30"]'), 'focus follows the tap, so a keyboard user is not dropped').toBeFocused()

    await page.locator('#dash-week .dash-day').nth(6).click()                    // Sunday: nothing planned
    r = await read(page)
    expect(r.hero).toMatchObject({ kind: 'rest', calm: true, eyebrow: 'Sun 4 Oct', title: 'Rest day', meta: 'Recovery is part of the plan.' })

    await page.locator('#dash-week .dash-day').nth(4).click()                    // Friday: done
    expect((await read(page)).hero.title).toBe('Lower Body')
    await page.locator('#dash-week .dash-day').nth(4).click()                    // the same day again: back to today
    r = await read(page)
    expect(r.hero.kind).toBe('plan')
    expect(r.days.filter(d => d.pressed === 'true').map(d => d.label)).toEqual(['Sat'])

    await page.locator('#dash-week .dash-day').nth(0).click()
    await page.locator('#dash-hero').getByText('Back to today').click()
    expect((await read(page)).hero.kind).toBe('plan')
    expect((await cappedApiCalls(page)).length, 'swapping the card never reads anything').toBe(readsBefore)
  })

  test('a day that was planned and not logged reads as missed; a later planned day shows when it is', async ({ page }) => {
    // Drop Friday's log: Friday was planned, has gone, and has nothing logged.
    const uid = await page.evaluate(() => currentUser.id)
    await install(page, ownTables('dash-c1', uid, { logs: defaultLogs('dash-c1').filter(l => l.date !== addDays(MON, 4)) }))
    await render(page, 'renderClientDashboard')
    let r = await read(page)
    expect(kinds(r)).toEqual(['done', 'rest', 'done', 'rest', 'miss', 'plan', 'rest'])
    expect(r.weekSub).toBe('2 of 4 sessions done')
    await page.locator('#dash-week .dash-day').nth(4).click()
    r = await read(page)
    expect(r.hero).toMatchObject({ kind: 'miss', calm: true, eyebrow: 'Fri 2 Oct · Missed', title: 'Lower Body', meta: 'Planned, not logged.' })
    expect(r.hero.buttons, 'nothing to start on a past day').toEqual(['Back to today'])

    // From Wednesday (only Monday's session logged so far) the Friday and Saturday sessions are still ahead: "later".
    await restoreCappedApi(page)
    await page.clock.setFixedTime(new Date('2026-09-30T10:00:00Z'))
    await install(page, ownTables('dash-c1', uid, { logs: defaultLogs('dash-c1').filter(l => l.date <= MON) }))
    await render(page, 'renderClientDashboard')
    r = await read(page)
    expect(kinds(r)).toEqual(['done', 'rest', 'plan', 'rest', 'later', 'later', 'rest'])
    await page.locator('#dash-week .dash-day').nth(5).click()
    r = await read(page)
    expect(r.hero).toMatchObject({ kind: 'later', eyebrow: 'Sat 3 Oct', title: 'Squat + Threshold', meta: 'In 3 days' })
  })

  test('a finished day and a rest day', async ({ page }) => {
    // Done: a session logged today.
    const uid = await page.evaluate(() => currentUser.id)
    await install(page, ownTables('dash-c1', uid, { logs: [...defaultLogs('dash-c1'), log('dash-c1', 'Squat + Threshold', TODAY)] }))
    await render(page, 'renderClientDashboard')
    let r = await read(page)
    expect(r.hero).toMatchObject({ kind: 'done', calm: true, eyebrow: 'Today · Done', title: 'Squat + Threshold', meta: '5 exercises logged' })
    expect(r.hero.buttons).toEqual(['View session'])
    expect(r.weekSub).toBe('4 of 4 sessions done')
    expect(r.streak, 'the week is now complete, so it counts: four weeks').toContain('4 week streak')
    await restoreCappedApi(page)

    // Rest: Sunday, nothing planned. The next session is named.
    await page.clock.setFixedTime(new Date('2026-10-04T10:00:00Z'))
    await install(page, ownTables('dash-c1', uid))
    await render(page, 'renderClientDashboard')
    r = await read(page)
    expect(r.hero).toMatchObject({ kind: 'rest', calm: true, eyebrow: 'Today', title: 'Rest day', meta: 'Next up: Upper Body, Mon 5 Oct' })
    expect(r.hero.buttons).toEqual(['Log a workout', 'View program'])
  })

  test('without a program (solo): a freeform prompt, a streak of any session a week, and a way to build one', async ({ page }) => {
    await withData(page, { program: false }, 'renderSoloDashboard')
    const r = await read(page)
    expect(r.eyebrow).toBe('My training')
    expect(r.hero).toMatchObject({ kind: 'rest', calm: true, eyebrow: 'Today', title: 'Nothing planned', meta: 'Start a freeform session whenever you like.' })
    expect(r.hero.buttons).toEqual(['Log a workout'])
    expect(kinds(r)).toEqual(Array(7).fill('rest'))
    expect(r.weekSub).toBe('Nothing planned this week')
    expect(r.streak, 'one session in each of the last two weeks').toContain('2 week streak')
    expect(r.streak).toContain('a session every week')
    expect(r.program).toContain('None')
    expect(r.program).toContain('Build one in Programs')
    expect(r.checkin, 'the weekly check-in is a client thing').toBe(false)
  })

  test('an abandoned start (a log with no exercises in it) is not a session: not done, not counted, not a streak week', async ({ page }) => {
    // The runner can leave a log behind when a workout is started and abandoned (D3, 2026-09-07). It must not tick today off.
    const uid = await page.evaluate(() => currentUser.id)
    await install(page, ownTables('dash-c1', uid, { logs: [...defaultLogs('dash-c1'), log('dash-c1', 'Squat + Threshold', TODAY, { workout_log_exercises: [] })] }))
    await render(page, 'renderClientDashboard')
    const r = await read(page)
    expect(r.hero.kind, 'still planned, not done').toBe('plan')
    expect(r.weekSub).toBe('3 of 4 sessions done')
    expect(r.streak, 'and the unfinished week still does not count').toContain('3 week streak')
  })

  test('the streak breaks on a week that missed the plan - and nothing before the gap counts', async ({ page }) => {
    const uid = await page.evaluate(() => currentUser.id)
    // Last week only 3 of 4 sessions: broken. The two weeks before it were complete, but they are behind the gap.
    await install(page, ownTables('dash-c1', uid, { logs: defaultLogs('dash-c1').filter(l => l.date !== addDays(MON, -7 + 5)) }))
    await render(page, 'renderClientDashboard')
    const r = await read(page)
    expect(r.streak).toContain('0 week streak')
    expect(r.streak).toContain("finish this week's plan to start one")
  })

  test('every card goes where its job lives', async ({ page }) => {
    await withData(page)
    await page.evaluate(() => { window.__nav = []; window.navigate = (p) => window.__nav.push([p, window._progressTab || null]) })
    await page.locator('#dash-weight').click()
    await page.locator('#dash-calendar').click()
    await page.locator('#dash-goals').click()
    await page.locator('#dash-program').click()
    await page.locator('#dash-hero').getByText('View program').click()
    expect(await page.evaluate(() => window.__nav)).toEqual([
      ['progress', 'Body Weight'], ['calendar', 'Body Weight'], ['progress', 'Goals'], ['workouts', 'Goals'], ['workouts', 'Goals'],
    ])
  })

  test('a solo user\'s goals open the Goals page; the weekly check-in form and banner are for coached clients only', async ({ page }) => {
    await withData(page, {}, 'renderSoloDashboard')
    await page.evaluate(() => { window.__nav = []; window.navigate = (p) => window.__nav.push(p) })
    await page.locator('#dash-goals').click()
    expect(await page.evaluate(() => window.__nav)).toEqual(['goals'])
    const r = await read(page)
    expect(r.banner).toBeNull()
    expect(r.checkin).toBe(false)
  })

  test('the weekly check-in: a banner when due that scrolls to the form, and the form is still there', async ({ page }) => {
    await withData(page)
    const r = await read(page)
    expect(r.banner).toContain('Your weekly check-in is due.')
    expect(r.checkin).toBe(true)
    await expect(page.locator('#checkin-form')).toBeVisible()
    await expect(page.locator('#ci-sleep')).toBeVisible()
    await expect(page.locator('.dash-banner button')).toHaveText('Do it now')
    // Recently done: no banner, the scores show instead of the form.
    await restoreCappedApi(page)
    const uid = await page.evaluate(() => currentUser.id)
    await install(page, ownTables('dash-c1', uid, { checkIns: [{ id: 'ci2', client_id: 'dash-c1', created_at: new Date(NOW.getTime() - 86400000).toISOString(), sleep: 4, energy: 3, stress: 2, soreness: 3, notes: 'felt good' }] }))
    await render(page, 'renderClientDashboard')
    const r2 = await read(page)
    expect(r2.banner).toBeNull()
    await expect(page.locator('#checkin-form')).toBeHidden()
    await expect(page.locator('#checkin-card')).toContainText('4/5')
  })

  test('body weight: the change since the weigh-in before it, in the user\'s unit, with one chart', async ({ page }) => {
    await withData(page)
    let r = await read(page)
    expect(r.weight).toContain('108')
    expect(r.weight).toContain('↑ 0.4 kg since Fri 2 Oct')
    await expect.poll(() => page.evaluate(() => typeof Chart === 'undefined' ? -1 : Object.keys(Chart.instances).length), { message: 'one sparkline' }).toBe(1)
    // Pounds: 108 kg is 238.1 lb; the change is converted, not concatenated.
    await page.evaluate(async () => { window._unitPrefs.weight = 'lb'; await renderClientDashboard(document.getElementById('main-content')) })
    r = await read(page)
    expect(r.weight).toContain('238.1')
    expect(r.weight).toContain('↑ 0.9 lb')
    expect(await page.evaluate(() => Object.keys(Chart.instances).length), 'repainting does not leave the old chart behind').toBe(1)
  })

  test('a year of sessions is read in pages - the streak counts every week, not the newest 200 rows', async ({ page }) => {
    // No program: five sessions a week for the last 46 finished weeks = 230 rows, more than one response holds. A read capped at
    // 200 would lose the oldest weeks and the streak would come up short.
    const uid = await page.evaluate(() => currentUser.id)
    const logs = []
    for (let w = 1; w <= 46; w++) for (let k = 0; k < 5; k++) logs.push(log('dash-c1', 'Freeform', addDays(MON, -7 * w + k)))
    await install(page, ownTables('dash-c1', uid, { program: false, logs }))
    await render(page, 'renderClientDashboard')
    const r = await read(page)
    expect(r.streak, '46 finished weeks, this one not yet started').toContain('46 week streak')
    const reads = (await cappedApiCalls(page)).filter(c => c.table === 'workout_logs')
    expect(reads.length, 'more than one request').toBeGreaterThan(1)
    for (const c of reads) expect(c.desc, 'every page is scoped to this person and ordered by a unique key').toEqual(expect.arrayContaining(['eq(client_id)', 'order(id desc)']))
  })

  test('a failed read is a notice, not an empty week: the banner names it and the rest still renders', async ({ page }) => {
    const uid = await page.evaluate(() => currentUser.id)
    await install(page, { ...ownTables('dash-c1', uid), weight_logs: FAILING, workout_logs: FAILING })
    await render(page, 'renderClientDashboard')
    const text = await page.locator('#dash-root').innerText()
    expect(text).toContain("Couldn't load: weight history, recent sessions")
    await expect(page.locator('#dash-goals')).toBeVisible()
    await expect(page.locator('#dash-calendar')).toBeVisible()
  })

  test('(review) every name on the page is text, never markup', async ({ page }) => {
    const evil = '<img src=x onerror="window.__xss=1">'
    const uid = await page.evaluate(() => currentUser.id)
    const t = ownTables('dash-c1', uid, { goals: [{ id: 'g1', client_id: 'dash-c1', title: evil, target_date: addDays(TODAY, 5), status: 'active', start_value: null, current_value: null, target_value: null, goal_milestones: [] }], events: [{ id: 'e1', client_id: 'dash-c1', title: evil, date: addDays(TODAY, 3), type: 'other', notes: '' }] })
    t.client_programs[0].programs.name = evil
    t.client_programs[0].programs.program_phases[0].program_phase_workouts[3].workout_templates.name = evil
    t.workout_logs[0].name = evil
    t.clients[0].full_name = evil
    await page.evaluate((e) => { window._branding = { businessName: e, logoUrl: null }; currentProfile = { ...currentProfile, full_name: e } }, evil)
    await install(page, t)
    await render(page, 'renderClientDashboard')
    expect(await page.evaluate(() => window.__xss), 'nothing ran').toBeUndefined()
    expect(await page.locator('#dash-root img').count(), 'no image element was created from any name').toBe(0)
    await expect(page.locator('.dash-hero-title')).toHaveText(evil)
  })

  for (const width of [480, 320]) {
    test(`at a ${width}px phone nothing sticks out sideways or is cut off`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await withData(page)
      const m = await page.evaluate(() => {
        const root = document.getElementById('dash-root'), rr = root.getBoundingClientRect()
        const wide = [...root.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > rr.right + 1).map(e => e.className || e.tagName)
        const clipped = [...root.querySelectorAll('.dash-big, .dash-hero-title, .dash-dn, .dash-dd, .dash-btn')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent.trim())
        return { pageScroll: document.documentElement.scrollWidth - innerWidth, wide, clipped, days: document.querySelectorAll('#dash-week .dash-day').length }
      })
      expect(m.pageScroll, 'the page does not scroll sideways').toBeLessThanOrEqual(0)
      expect(m.wide, 'nothing runs past the page edge').toEqual([])
      expect(m.clipped, 'no figure or label is cut off').toEqual([])
      expect(m.days).toBe(7)
    })
  }

  test('the floating PT | Personal switch never hides the last card: the page ends clear above it', async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 800 })
    await withData(page)
    // The master account is the only one that shows the switch; give it the class the app gives it.
    await page.evaluate(() => document.getElementById('mobile-view-switcher').classList.add('mvs-on'))
    await expect(page.locator('#mobile-view-switcher')).toBeVisible()
    const gap = await page.evaluate(() => {
      const main = document.getElementById('main-content'); main.scrollTop = main.scrollHeight
      const last = [...document.querySelectorAll('#dash-root > *')].at(-1).getBoundingClientRect()
      const sw = document.getElementById('mobile-view-switcher').getBoundingClientRect()
      return sw.top - last.bottom
    })
    expect(gap, 'the last card ends above the switch, not behind it').toBeGreaterThanOrEqual(0)
  })
})

test.describe('the coach dashboard', () => {
  test.beforeEach(async ({ page }) => { await loginAsPT(page); await prepare(page) })
  const withData = async (page, opts = {}) => {
    const uid = await page.evaluate(() => currentUser.id)
    await install(page, { ...coachTables(uid, opts) })
    await render(page, 'renderDashboard')
  }
  const coachRead = (page) => page.evaluate(() => {
    const t = (sel) => { const e = document.querySelector(sel); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null }
    const hero = document.getElementById('dash-hero')
    return {
      greet: t('.dash-greet'), eyebrow: t('.dash-eyebrow'),
      hero: { kind: hero.dataset.kind, calm: hero.classList.contains('dash-hero-calm'), eyebrow: t('#dash-hero .dash-hero-eyebrow'), title: t('#dash-hero .dash-hero-title'), buttons: [...hero.querySelectorAll('.dash-btn')].map(b => b.textContent.trim()), rows: [...hero.querySelectorAll('.dash-hrow')].map(r => r.textContent.replace(/\s+/g, ' ').trim()) },
      weekSub: t('#dash-week .dash-card-sub'),
      bars: [...document.querySelectorAll('#dash-week .dash-bar-col')].map(b => ({ n: b.querySelector('.dash-bn').textContent, day: b.querySelector('.dash-dn').textContent, pressed: b.getAttribute('aria-pressed') })),
      trained: t('#dash-trained'), ending: t('#dash-ending'), attention: t('#dash-attn'), attentionNames: [...document.querySelectorAll('#dash-attn .dash-row-main b')].map(b => b.textContent),
      weighins: t('#dash-weighins'), coming: t('#dash-coming'), goals: t('#dash-goals'), banner: t('.dash-banner'),
    }
  })

  test('a busy day: who logged today, the week as bars, who trained, who needs a nudge, what is ending', async ({ page }) => {
    await withData(page)
    const r = await coachRead(page)
    expect(r.greet, 'the coach greeting keeps the "Welcome back," form the login helpers wait for').toMatch(/^Welcome back, /)
    expect(r.eyebrow).toBe('West Strength')

    expect(r.hero).toMatchObject({ kind: 'logged', calm: false, eyebrow: 'Today · Your clients', title: '2 sessions logged' })
    expect(r.hero.rows, 'each row: who, which session, when').toHaveLength(2)
    expect(r.hero.rows.join(' ')).toMatch(/Ana C\s*Lower A/)
    expect(r.hero.rows.join(' ')).toMatch(/Priya M\s*Upper B/)
    expect(r.hero.buttons).toEqual(['See clients', '2 need attention'])

    expect(r.weekSub, "this week's bars: 4+3+5+4+3+2+0 - last Sunday's session is not in them").toBe('21 sessions logged')
    expect(r.bars.map(b => b.n)).toEqual(['4', '3', '5', '4', '3', '2', '–'])
    expect(r.bars.map(b => b.day)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
    expect(r.bars.filter(b => b.pressed === 'true').map(b => b.day), 'the pressed bar is the one the Today card shows').toEqual(['Sat'])

    expect(r.trained, '4 of 6 clients logged a session in the last 7 days').toContain('4 of 6')
    expect(r.ending, 'Sam K ends in 5 days, Priya M in 12').toContain('2 soon')
    expect(r.attentionNames, 'someone who never trained comes first, then the longest gap').toEqual(['Tom B', 'Dan R'])
    expect(r.attention).toContain('No sessions yet')
    expect(r.attention).toContain('Last trained Mon 21 Sept')
    expect(r.weighins).toContain('4 of 6 this week')
    expect(r.weighins).toContain('Sam K')
    expect(r.weighins).toContain('91.2 kg')
    expect(r.coming).toMatch(/Sam K · program ends\s*Hypertrophy block\s*In 5 days/)
    expect(r.coming).toMatch(/Priya M · program ends\s*Operation Strength\s*In 12 days/)
    expect(r.goals).toContain('Bench 100 kg')
    expect(r.goals).toContain('Sam K · In 7 days')
  })

  test('a quiet morning: a calm card that says so, and still points at the clients who need a nudge', async ({ page }) => {
    await withData(page, { quietToday: true })
    const r = await coachRead(page)
    expect(r.hero).toMatchObject({ kind: 'none', calm: true, eyebrow: 'Today · Your clients', title: 'Nothing logged yet' })
    expect(r.hero.buttons).toEqual(['See clients', '2 need attention'])
    expect(r.bars.map(b => b.n).at(-2), "Saturday has no sessions yet").toBe('–')
  })

  test('tapping a bar shows that day\'s sessions, with a way back - and reads nothing', async ({ page }) => {
    await withData(page)
    const before = (await cappedApiCalls(page)).length
    await page.locator('#dash-week .dash-bar-col').nth(0).click()                // Monday: 4 sessions
    let r = await coachRead(page)
    await expect(page.locator('#dash-week .dash-bar-col').nth(0), 'focus follows the tap, so a keyboard user is not dropped').toBeFocused()
    expect(r.hero).toMatchObject({ kind: 'logged', calm: true, eyebrow: 'Mon 28 Sept · Your clients', title: '4 sessions logged' })
    expect(r.hero.rows).toHaveLength(3)
    await expect(page.locator('#dash-hero')).toContainText('+1 more')
    expect(r.bars.filter(b => b.pressed === 'true').map(b => b.day)).toEqual(['Mon'])
    expect(r.hero.buttons).toEqual(['See clients', 'Back to today'])
    await page.locator('#dash-week .dash-bar-col').nth(6).click()                // Sunday: nothing
    r = await coachRead(page)
    expect(r.hero).toMatchObject({ kind: 'none', title: 'No sessions logged' })
    await page.locator('#dash-hero').getByText('Back to today').click()
    expect((await coachRead(page)).hero.title).toBe('2 sessions logged')
    expect((await cappedApiCalls(page)).length).toBe(before)
  })

  test('a failed summary read: the numbers are UNAVAILABLE, never zero - no "needs attention", no "0 trained"', async ({ page }) => {
    const uid = await page.evaluate(() => currentUser.id)
    await install(page, { ...coachTables(uid), coach_client_summary: FAILING })
    await render(page, 'renderDashboard')
    const r = await coachRead(page)
    expect(await page.locator('#dash-root').innerText(), 'the shared failure notice names the read that failed').toContain("Couldn't load: session summaries")
    expect(r.trained, 'the tile does not claim 0 trained').toContain('—')
    expect(r.ending).toContain('—')
    expect(r.attention, 'and does not accuse anyone of not training').toBeNull()
    await expect(page.locator('#dash-root')).not.toContainText('No active clients')
  })

  test('past 200 clients every summary row still counts (the API cap applies to a view too)', async ({ page }) => {
    const uid = await page.evaluate(() => currentUser.id)
    const many = Array.from({ length: 250 }, (_, i) => summaryRow('m-' + String(i).padStart(3, '0'), 'Client ' + i, { sessions_7d: 1, last_session_date: TODAY }))
    await install(page, { ...coachTables(uid), coach_client_summary: many })
    await render(page, 'renderDashboard')
    const r = await coachRead(page)
    expect(r.trained, '250 clients x 1 session, not the 200 that fit in one response').toContain('250 of 250')
    expect(r.attention, 'all 250 trained: nobody needs a nudge').toBeNull()
    expect((await cappedApiCalls(page)).filter(c => c.table === 'coach_client_summary').length, 'read in pages').toBeGreaterThan(1)
  })

  test('only ACTIVE clients are counted or chased; an inactive client is neither', async ({ page }) => {
    const uid = await page.evaluate(() => currentUser.id)
    const t = coachTables(uid)
    t.coach_client_summary = [summaryRow('c1', 'Priya M', { sessions_7d: 2, last_session_date: TODAY }), summaryRow('c2', 'Sam K', { sessions_7d: 0, last_session_date: addDays(TODAY, -8) }), summaryRow('c3', 'Old Client', { status: 'inactive', sessions_7d: 0 })]
    await install(page, t)
    await render(page, 'renderDashboard')
    const r = await coachRead(page)
    expect(r.trained).toContain('1 of 2')
    expect(r.attentionNames).toEqual(['Sam K'])
  })

  test('a week with more than 200 sessions is read in pages and every one lands in its bar', async ({ page }) => {
    const uid = await page.evaluate(() => currentUser.id)
    const t = coachTables(uid)
    t.workout_logs = Array.from({ length: 230 }, (_, i) => ({ id: 'bulk-' + String(i).padStart(4, '0'), client_id: PEOPLE[i % 6][0], name: 'Bulk', date: addDays(MON, i % 6), created_at: addDays(MON, i % 6) + 'T09:00:00Z', workout_log_exercises: [{ id: 'x' }] }))
    await install(page, t)
    await render(page, 'renderDashboard')
    const r = await coachRead(page)
    expect(r.weekSub, 'all 230, not the first 200').toBe('230 sessions logged')
    expect((await cappedApiCalls(page)).filter(c => c.table === 'workout_logs').length).toBeGreaterThan(1)
  })

  test('no clients yet: a calm card that offers the one thing to do', async ({ page }) => {
    const uid = await page.evaluate(() => currentUser.id)
    await install(page, { clients: [], coach_client_summary: [], workout_logs: [], weight_logs: [], goals: [] })
    await render(page, 'renderDashboard')
    const r = await coachRead(page)
    expect(r.hero).toMatchObject({ kind: 'empty', calm: true, title: 'No clients yet' })
    expect(r.hero.buttons).toEqual(['+ Add client'])
  })

  test('(review) a client\'s name and a session\'s name are text, never markup', async ({ page }) => {
    const evil = '<img src=x onerror="window.__xss=1">'
    const uid = await page.evaluate(() => currentUser.id)
    const t = coachTables(uid)
    t.coach_client_summary = t.coach_client_summary.map((s, i) => (i < 2 ? { ...s, full_name: evil } : s))
    t.workout_logs.forEach(l => { l.name = evil })
    t.goals[0].title = evil
    await page.evaluate((e) => { window._branding = { businessName: e, logoUrl: null } }, evil)
    await install(page, t)
    await render(page, 'renderDashboard')
    expect(await page.evaluate(() => window.__xss)).toBeUndefined()
    expect(await page.locator('#dash-root img').count()).toBe(0)
  })

  for (const width of [480, 320]) {
    test(`at a ${width}px phone nothing sticks out sideways or is cut off`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await withData(page)
      const m = await page.evaluate(() => {
        const root = document.getElementById('dash-root'), rr = root.getBoundingClientRect()
        return {
          pageScroll: document.documentElement.scrollWidth - innerWidth,
          wide: [...root.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > rr.right + 1).map(e => e.className || e.tagName),
          clipped: [...root.querySelectorAll('.dash-big, .dash-hero-title, .dash-btn, .dash-hrow-st')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent.trim()),
        }
      })
      expect(m.pageScroll).toBeLessThanOrEqual(0)
      expect(m.wide).toEqual([])
      expect(m.clipped).toEqual([])
    })
  }
})
