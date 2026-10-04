const { test, expect } = require('./fixtures')
const { loginAsClient } = require('./helpers')

// ─── The Workouts page's Up next card names the workout, and points at the right one (Jake, 2026-10-04) ────────────────────────
//
// "Needs to include the next workout name." The card said "Operation 240 / Accumulation 1 · Week 1" and nothing about WHICH workout. Reading
// the code showed a second problem underneath: it always took the first session of the current program week, so after Monday's workout was
// done it still pointed at Monday's - naming it would have named the wrong one. It now finds the session with the calendar's own date map and
// the dashboard's rule (today's session while it is not logged, otherwise the next planned one). The rules themselves are pinned in
// tests-node/up-next.test.mjs; these prove the page: what the card shows, what Start launches, that names are text, and the layout on a phone.
//
// The clock is pinned and every read is stubbed: nothing is written to the database.

const CLIENT = 'wk-client'
const pw = (id, dow, week = 1, so = 1) => ({ id, day_of_week: dow, session_order: so, week_number: week })
// Upper Body on Monday, Lower Body on Thursday: a 4-week "Accumulation 1" that started Monday 28 Sep 2026.
const ASSIGNMENT = { id: 'cp-1', start_date: '2026-09-28', programs: { id: 'prog-1', name: 'Operation 240', description: null, program_phases: [
  { id: 'ph-1', name: 'Accumulation 1', order_index: 0, duration_weeks: 4, program_phase_workouts: [pw('pw-a', 1), pw('pw-b', 4)] }] } }
const clone = (pwId, id, name) => ({ program_phase_workout_id: pwId, workout_template_id: id, workout_templates: { id, name, description: null, workout_template_exercises: [] } })
const CLONES = [clone('pw-a', 'clone-a', 'Upper Body'), clone('pw-b', 'clone-b', 'Lower Body')]
const log = date => ({ id: 'log-' + date, name: 'Done', date, workout_log_exercises: [{ id: 'e-' + date }] })

// Renders the Workouts page for CLIENT into a scratch host, every read stubbed. A later call re-renders (as after logging a session).
async function showWorkouts(page, { today, logs = [], clones = CLONES, assignment = ASSIGNMENT }) {
  await page.clock.setFixedTime(new Date(today + 'T11:00:00'))
  await page.evaluate(async ({ CLIENT, assignment, clones, logs }) => {
    const q = data => { const o = { select: () => o, eq: () => o, in: () => o, order: () => o, limit: () => o, is: () => o, then: (res, rej) => Promise.resolve({ data, error: null }).then(res, rej) }; return o }
    window.__realFrom = window.__realFrom || db.from.bind(db)
    db.from = t => t === 'workout_logs' ? q(logs) : t === 'client_programs' ? q(assignment ? [assignment] : []) : t === 'client_program_workouts' ? q(clones) : window.__realFrom(t)
    window._getCurrentClientId = async () => CLIENT
    window.startWorkoutRunner = (...a) => { window.__started = a }
    document.getElementById('wk-host')?.remove()
    const el = document.createElement('div'); el.id = 'wk-host'; document.body.appendChild(el)
    await renderClientWorkoutsPage(el)
  }, { CLIENT, assignment, clones, logs })
  await expect(page.locator('#wk-hero')).toBeVisible()
}

// What the card says, as plain text.
const card = page => page.evaluate(() => {
  const t = sel => document.querySelector(`#wk-hero ${sel}`)?.textContent.replace(/\s+/g, ' ').trim() ?? null
  return { eyebrow: t('[data-hero-eyebrow]'), title: t('[data-hero-title]'), meta: t('[data-hero-meta]'), button: t('[data-hero-start]') }
})
const started = page => page.evaluate(() => window.__started ?? null)

test.describe('The Workouts page Up next card (2026-10-04)', () => {
  test.beforeEach(async ({ page }) => { await loginAsClient(page) })

  test('it names the workout, and says when and which week it belongs to', async ({ page }) => {
    await showWorkouts(page, { today: '2026-10-03', logs: [log('2026-09-28'), log('2026-10-01')] })   // Saturday; both of week 1 done
    expect(await card(page)).toEqual({ eyebrow: 'Up next · Mon 5 Oct', title: 'Upper Body', meta: 'Operation 240 · Accumulation 1 · Week 2', button: '▶ Start →' })
  })

  test('Start launches the session the card names - the CLIENT\'s own copy of it', async ({ page }) => {
    await showWorkouts(page, { today: '2026-10-03', logs: [log('2026-09-28'), log('2026-10-01')] })
    await page.locator('#wk-hero [data-hero-start]').click()
    expect(await started(page)).toEqual([CLIENT, 'clone-a'])
  })

  test('Jake\'s case: after Monday\'s workout is logged the card moves on to Thursday\'s - it used to keep pointing at Monday\'s', async ({ page }) => {
    await showWorkouts(page, { today: '2026-09-28' })                                    // Monday morning: nothing logged
    expect(await card(page)).toMatchObject({ eyebrow: 'Up next · Today', title: 'Upper Body' })
    await showWorkouts(page, { today: '2026-09-28', logs: [log('2026-09-28')] })         // Monday evening: Upper Body is done
    expect(await card(page)).toMatchObject({ eyebrow: 'Up next · Thu 1 Oct', title: 'Lower Body' })
    await page.locator('#wk-hero [data-hero-start]').click()
    expect(await started(page), 'and Start launches the one now named').toEqual([CLIENT, 'clone-b'])
  })

  test('a rest day shows the next planned day by its date', async ({ page }) => {
    await showWorkouts(page, { today: '2026-09-29', logs: [log('2026-09-28')] })         // Tuesday
    expect(await card(page)).toMatchObject({ eyebrow: 'Up next · Thu 1 Oct', title: 'Lower Body', meta: 'Operation 240 · Accumulation 1 · Week 1' })
  })

  test('when the whole program is done the card says so and offers a freeform session - it does not point at an old one', async ({ page }) => {
    await showWorkouts(page, { today: '2026-10-26' })                                    // the Monday after week 4
    expect(await card(page)).toMatchObject({ eyebrow: 'Program complete', title: 'Operation 240', button: 'Start a session →' })
    await page.locator('#wk-hero [data-hero-start]').click()
    expect(await started(page), 'a freeform session: no template').toEqual([CLIENT])
  })

  test('workout names are shown as text, never run as markup', async ({ page }) => {
    const evil = '<img src=x onerror="window.__pwned=1">'
    await showWorkouts(page, { today: '2026-09-28', clones: [clone('pw-a', 'clone-a', evil), clone('pw-b', 'clone-b', 'Lower Body')] })
    expect((await card(page)).title).toBe(evil)
    await expect(page.locator('#wk-hero img')).toHaveCount(0)
    expect(await page.evaluate(() => window.__pwned ?? null)).toBeNull()
  })

  test('the program list below the card is untouched (it still names both sessions)', async ({ page }) => {
    await showWorkouts(page, { today: '2026-10-03', logs: [log('2026-09-28')] })
    const below = await page.locator('#wk-host').innerText()
    expect(below).toContain('Accumulation 1')
    expect(below).toContain('Upper Body')
    expect(below).toContain('Lower Body')
  })

  test('on a phone, a long workout name wraps inside the card (nothing sticks out)', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 })
    const long = 'Deadlift + Threshold Intervals + Mobility Finisher'
    await showWorkouts(page, { today: '2026-09-28', clones: [clone('pw-a', 'clone-a', long), clone('pw-b', 'clone-b', 'Lower Body')] })
    const r = await page.evaluate(() => {
      const el = document.getElementById('wk-hero'), box = el.getBoundingClientRect()
      return { overflow: el.scrollWidth - el.clientWidth, right: Math.round(box.right), width: innerWidth, title: el.querySelector('[data-hero-title]').textContent }
    })
    expect(r.title).toBe(long)
    expect(r.overflow, 'no horizontal overflow inside the card').toBeLessThanOrEqual(0)
    expect(r.right, 'and the card stays on the screen').toBeLessThanOrEqual(r.width)
  })
})
