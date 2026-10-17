const { test, expect } = require('./fixtures')
const { loginAsPT, acceptConfirm, soloReady } = require('./helpers')

// ─── Jake, 2026-10-13: the Goals tab is "cramped or cluttered, progress unclear, milestones clumsy" ──────────────────────────────────────────────────────────────────────────────
// Prototype https://claude.ai/artifact/JEJgr7Q81rjzotfJAfDWox; his reactions: fuller list cards, no pace pill or weekly line, a step with a number ticks itself.
//
// The list: a card per goal (the number, how far to go, a bar, the next step, the steps count, the last update, the date), finished goals folded away. The goal page: the number first,
// "Update progress" (a number and a note), the steps as a checklist with a one-line add, the history. Short sheets to add and edit. A client keeps the tracking controls (update, tick)
// and none of the managing ones; a coach and a solo user keep everything.
//
// Every read is answered from fixtures made here (the real renderers run on them) and every write is captured, never made.

const NOW_ISO = '2026-10-13T12:00:00Z'
const SQUAT = {
  id: 'g-squat', client_id: 'cid', created_by: 'me', title: 'Squat 160 kg', description: 'Back squat, paused', status: 'active', priority: 1, metric_label: 'Back squat 1RM', metric_unit: 'kg',
  start_value: 100, current_value: 130, target_value: 160, target_date: '2027-03-13', created_at: '2026-07-01T09:00:00Z'
}
const WEIGHT = {
  id: 'g-weight', client_id: 'cid', created_by: 'me', title: 'Body weight 85 kg', status: 'active', priority: 2, metric_unit: 'kg',
  start_value: 92, current_value: 88.4, target_value: 85, target_date: '2027-01-20', created_at: '2026-08-01T09:00:00Z'
}
const RUN = { id: 'g-run', client_id: 'cid', created_by: 'me', title: 'Run 5k under 25 min', status: 'active', priority: 3, created_at: '2026-09-01T09:00:00Z' }
const DEAD = {
  id: 'g-dead', client_id: 'cid', created_by: 'me', title: 'Deadlift 200 kg', status: 'completed', priority: 1, metric_unit: 'kg',
  start_value: 160, current_value: 200, target_value: 200, target_date: '2026-09-20', created_at: '2026-02-01T09:00:00Z'
}
const PAUSED = { id: 'g-paused', client_id: 'cid', created_by: 'me', title: 'Pull-ups x10', status: 'paused', priority: 2, created_at: '2026-06-01T09:00:00Z' }
const MS = [
  { id: 'm1', goal_id: 'g-squat', title: 'Squat 120 kg', target_value: 120, order: 1, created_at: '2026-07-02T09:00:00Z', completed_at: null },
  { id: 'm2', goal_id: 'g-squat', title: 'Squat 140 kg', target_value: 140, order: 2, created_at: '2026-07-02T09:01:00Z', completed_at: null },
  { id: 'm3', goal_id: 'g-squat', title: 'Squat 150 kg', target_value: 150, order: 3, created_at: '2026-07-02T09:02:00Z', completed_at: null },
  { id: 'm4', goal_id: 'g-weight', title: 'Under 90 kg', target_value: 90, order: 1, created_at: '2026-08-02T09:00:00Z', completed_at: null },
  { id: 'm5', goal_id: 'g-weight', title: 'Under 87 kg', target_value: 87, order: 2, created_at: '2026-08-02T09:01:00Z', completed_at: null },
  { id: 'm6', goal_id: 'g-run', title: 'Run 5k without stopping', order: 1, created_at: '2026-09-02T09:00:00Z', completed_at: '2026-09-20T10:00:00Z' },
  { id: 'm7', goal_id: 'g-run', title: 'Under 30 minutes', order: 2, created_at: '2026-09-02T09:01:00Z', completed_at: null },
  { id: 'm8', goal_id: 'g-run', title: 'Under 25 minutes', order: 3, created_at: '2026-09-02T09:02:00Z', completed_at: null }
]
const CI = [
  { id: 'c1', goal_id: 'g-squat', date: '2026-10-03', current_value: 130, notes: 'Paused triples felt strong', created_at: '2026-10-03T10:00:00Z' },
  { id: 'c2', goal_id: 'g-squat', date: '2026-09-12', current_value: 125, notes: null, created_at: '2026-09-12T10:00:00Z' },
  { id: 'c3', goal_id: 'g-squat', date: '2026-08-15', current_value: 117.5, notes: 'New belt', created_at: '2026-08-15T10:00:00Z' },
  { id: 'c4', goal_id: 'g-weight', date: '2026-10-10', current_value: 88.4, notes: null, created_at: '2026-10-10T10:00:00Z' }
]

// Installs the stub and (unless told not to) renders the list into a #tab-content host. `role` is the viewer's role for the duration of the test.
async function setup(page, { goals = [SQUAT, WEIGHT, RUN, DEAD, PAUSED], ms = MS, ci = CI, role = 'solo', fail = {}, render = 'list' } = {}) {
  await page.evaluate(async ({ goals, ms, ci, role, fail, render, now }) => {
    window.__realFrom = window.__realFrom || db.from.bind(db)
    const store = { goals: JSON.parse(JSON.stringify(goals)), goal_milestones: JSON.parse(JSON.stringify(ms)), goal_check_ins: JSON.parse(JSON.stringify(ci)) }
    window.__store = store
    window.__writes = { insert: [], update: [], delete: [] }
    let seq = 100
    const withEmbeds = g => ({ ...g, goal_milestones: store.goal_milestones.filter(m => m.goal_id === g.id), goal_check_ins: store.goal_check_ins.filter(c => c.goal_id === g.id) })
    const table = t => {
      const q = { f: {}, op: 'select', patch: null, rows: null, returning: false, order: [] }
      const matches = () => store[t].filter(r => Object.entries(q.f).every(([c, v]) => r[c] === v))
      const exec = () => {
        if (fail[t + '.' + q.op]) return { data: null, error: { message: 'E2E refused ' + t + '.' + q.op } }
        if (q.op === 'select') {
          const sorted = matches().sort((a, b) => { for (const [c, asc] of q.order) { const x = a[c] ?? '', y = b[c] ?? ''; if (x !== y) return (x < y ? -1 : 1) * (asc ? 1 : -1) } return 0 })
          return { data: t === 'goals' ? sorted.map(withEmbeds) : sorted, error: null }
        }
        if (q.op === 'insert') {
          const made = q.rows.map(r => ({ id: 'new-' + (++seq), created_at: now, ...r }))
          window.__writes.insert.push({ table: t, rows: q.rows })
          store[t].push(...made)
          return { data: q.returning ? made.map(m => ({ id: m.id })) : null, error: null }
        }
        if (q.op === 'update') {
          window.__writes.update.push({ table: t, patch: q.patch, filters: { ...q.f } })
          if (fail[t + '.update.norow']) return { data: [], error: null }
          const hit = matches(); hit.forEach(r => Object.assign(r, q.patch))
          return { data: q.returning ? hit.map(r => ({ id: r.id })) : null, error: null }
        }
        if (q.op === 'delete') {
          window.__writes.delete.push({ table: t, filters: { ...q.f } })
          const hit = matches(); store[t] = store[t].filter(r => !hit.includes(r))
          return { data: q.returning ? hit.map(r => ({ id: r.id })) : null, error: null }
        }
      }
      const o = {
        select: () => { if (q.op !== 'select') q.returning = true; return o },
        eq: (c, v) => { q.f[c] = v; return o },
        order: (c, opts) => { q.order.push([c, !(opts && opts.ascending === false)]); return o },
        insert: rows => { q.op = 'insert'; q.rows = Array.isArray(rows) ? rows : [rows]; return o },
        update: patch => { q.op = 'update'; q.patch = patch; return o },
        delete: () => { q.op = 'delete'; return o },
        single: () => Promise.resolve().then(() => (window.__delay ? new Promise(r => setTimeout(r, window.__delay)) : null)).then(() => { const r = exec(); return r.error ? r : r.data.length === 1 ? { data: r.data[0], error: null } : { data: null, error: { code: 'PGRST116' } } }),
        maybeSingle: () => Promise.resolve().then(() => (window.__delay ? new Promise(r => setTimeout(r, window.__delay)) : null)).then(() => { const r = exec(); return r.error ? r : { data: r.data[0] ?? null, error: null } }),
        // window.__delay (ms) makes the database slow, so a second tap lands while the first save is still in flight (the double-tap tests); 0 otherwise.
        then: (res, rej) => Promise.resolve().then(() => (window.__delay ? new Promise(r => setTimeout(r, window.__delay)) : null)).then(exec).then(res, rej)
      }
      return o
    }
    db.from = t => (t in store ? table(t) : window.__realFrom(t))
    window._verifyClientAccess = async () => true
    window._verifyGoalAccess = async () => true
    window._verifyMilestoneAccess = async () => true
    window._getCurrentClientId = async () => 'cid'
    window._navigateNow = async () => {}
    window.__toasts = []
    window.showToast = (m, type) => { window.__toasts.push({ m, type }) }
    window.__me = currentUser.id
    for (const g of store.goals) if (g.created_by === 'me') g.created_by = currentUser.id
    window.__role0 = window.__role0 || currentProfile.role
    currentProfile = { ...currentProfile, role }
    document.getElementById('tab-content')?.remove()
    const el = document.createElement('div'); el.id = 'tab-content'; document.body.appendChild(el)
    if (render === 'list') await renderClientGoals('cid', el)
    else if (render) await openGoal(render, 'cid')
  }, { goals, ms, ci, role, fail, render, now: NOW_ISO })
}
async function soloView(page) {
  await soloReady(page)
  // _soloClientId is set BEFORE the dashboard paints. Until it has, a test that mounts into #main-content is overwritten by the late paint (the scroll test
  // failed twice in the 2026-10-15 release suite, on a slow Supabase evening, with the dashboard on screen instead of the goal page).
  await expect(page.locator('#dash-goals')).toBeVisible({ timeout: 20000 })
  // The bottom bar and the floating PT / Personal switch are fixed over the foot of the page and can sit over what a test clicks: this spec is about the Goals screens, not the chrome.
  await page.addStyleTag({ content: '#mobile-view-switcher, #mobile-view-switcher.mvs-on, .bottom-nav { display: none !important }' })
}
const tab = page => page.locator('#tab-content')
const card = (page, title) => page.locator('#goals-view .gl-card', { hasText: title })
const writes = page => page.evaluate(() => window.__writes)
const toasts = page => page.evaluate(() => window.__toasts.map(t => t.m))
const localToday = page => page.evaluate(() => _ymdLocal(new Date()))

test.describe('Goals list (2026-10-14)', () => {
  test('in progress first, a card per goal with the number, how far to go, the bar, the next step, the steps count, the last update and the date', async ({ page }) => {
    await soloView(page)
    await setup(page)
    await expect(tab(page).locator('.pw-group')).toHaveText(['In progress · 4'])
    await expect(tab(page).locator('#goals-view > .gl-card .gl-name'), 'by priority, then when they were made').toHaveText(['Squat 160 kg', 'Pull-ups x10', 'Body weight 85 kg', 'Run 5k under 25 min'])
    const squat = card(page, 'Squat 160 kg')
    await expect(squat.locator('.gl-nums')).toContainText('130')
    await expect(squat.locator('.gl-nums')).toContainText('of 160 kg')
    await expect(squat.locator('.gl-nums')).toContainText('30 kg to go')
    await expect(squat.locator('.gl-bar i')).toHaveAttribute('style', /width:\s*50%/)
    await expect(squat.locator('.gl-next')).toHaveText('Next Squat 140 kg')
    await expect(squat.locator('.gl-meta-row')).toContainText('1 of 3 steps · Updated 3 Oct')
    await expect(squat.locator('.gl-meta-row')).toContainText('Due 13 Mar')
    const weight = card(page, 'Body weight 85 kg')
    await expect(weight.locator('.gl-nums')).toContainText('88.4')
    await expect(weight.locator('.gl-nums')).toContainText('3.4 kg to go')
    await expect(weight.locator('.gl-next'), '90 has ticked itself on the way down, so 87 is next').toHaveText('Next Under 87 kg')
    const run = card(page, 'Run 5k under 25 min')
    await expect(run.locator('.gl-nums')).toContainText('1 of 3 steps')
    await expect(run.locator('.gl-bar i')).toHaveAttribute('style', /width:\s*33%/)
    await expect(run.locator('.gl-meta-row')).toContainText('No updates yet')
    await expect(run.locator('.gl-meta-row')).toContainText('No date set')
    await expect(card(page, 'Pull-ups x10').locator('.pw-pill')).toHaveText('Paused')
    await expect(page.locator('#goals-view .gl-card .pw-pill:text-is("Done")'), 'a finished goal is folded away').toBeHidden()
  })

  test('finished goals sit folded under the list; the button says what it will do', async ({ page }) => {
    await soloView(page)
    await setup(page)
    const btn = tab(page).locator('.gl-finished-btn')
    await expect(btn).toHaveText('Show finished goals (1)')
    await expect(page.locator('#gl-finished')).toBeHidden()
    await btn.click()
    await expect(page.locator('#gl-finished .gl-name')).toHaveText(['Deadlift 200 kg'])
    await expect(page.locator('#gl-finished .pw-pill')).toHaveText('Done')
    await expect(btn).toHaveText('Hide finished goals (1)')
    await expect(btn).toHaveAttribute('aria-expanded', 'true')
    await btn.click()
    await expect(page.locator('#gl-finished')).toBeHidden()
    await expect(btn).toHaveText('Show finished goals (1)')
  })

  test('a goal opens by tap and by keyboard, and All goals comes back to the list', async ({ page }) => {
    await soloView(page)
    await setup(page)
    await card(page, 'Squat 160 kg').click()
    await expect(tab(page).locator('.gl-title')).toHaveText('Squat 160 kg')
    await tab(page).locator('.back-btn', { hasText: 'All goals' }).click()
    await expect(card(page, 'Squat 160 kg')).toBeVisible()
    await card(page, 'Body weight 85 kg').focus()
    await page.keyboard.press('Enter')
    await expect(tab(page).locator('.gl-title')).toHaveText('Body weight 85 kg')
  })

  test('empty states: each role is told the truth, and only a coach or solo user is offered a way to add', async ({ page }) => {
    await soloView(page)
    await setup(page, { goals: [], role: 'solo' })
    await expect(tab(page)).toContainText('Set a goal to give yourself a clear roadmap')
    await expect(tab(page).getByRole('button', { name: '+ Add first goal' })).toBeVisible()
    await setup(page, { goals: [], role: 'coach' })
    await expect(tab(page)).toContainText('give this client a clear roadmap')
    await expect(tab(page).getByRole('button', { name: '+ Add goal' })).toBeVisible()
    await setup(page, { goals: [], role: 'client' })
    await expect(tab(page)).toContainText('Your coach sets your goals')
    await expect(tab(page).locator('button[onclick^="showAddGoalModal"]')).toHaveCount(0)
  })

  test('only finished goals: the list says nothing is in progress, and the finished ones are still one tap away', async ({ page }) => {
    await soloView(page)
    await setup(page, { goals: [DEAD] })
    await expect(tab(page).locator('.pw-group')).toHaveText(['In progress · 0'])
    await expect(tab(page).locator('.gl-none')).toHaveText('Nothing in progress. Add a goal to get started.')
    await setup(page, { goals: [DEAD], role: 'client' })
    await expect(tab(page).locator('.gl-none')).toHaveText('Nothing in progress right now.')
    await expect(tab(page).locator('.gl-finished-btn')).toBeVisible()
  })

  test('a failed read is a message, not an empty list', async ({ page }) => {
    await soloView(page)
    await setup(page, { fail: { 'goals.select': true } })
    await expect(tab(page)).toContainText('E2E refused goals.select')
    await expect(tab(page).locator('.gl-card')).toHaveCount(0)
  })
})

test.describe('A goal\'s page (2026-10-14)', () => {
  test('the number first: where it is, how far to go, the bar with a mark for each step, and where it started and is headed', async ({ page }) => {
    await soloView(page)
    await setup(page, { render: 'g-squat' })
    await expect(tab(page).locator('.gl-title')).toHaveText('Squat 160 kg')
    await expect(tab(page).locator('.gl-desc')).toHaveText('Back squat, paused')
    await expect(tab(page).locator('.gl-due')).toContainText('Due 13 Mar 2027')
    const p = tab(page).locator('.gl-progress')
    await expect(p.locator('.pw-label')).toHaveText('Back squat 1RM')
    await expect(p.locator('.pw-big')).toHaveText('130 kg')
    await expect(p.locator('.gl-sub')).toHaveText('30 kg to go · 50% there')
    await expect(p.locator('.gl-bar i')).toHaveAttribute('style', /width:\s*50%/)
    // marks at 120 (33%), 140 (67%) and 150 (83%); the one already passed is green
    await expect(p.locator('.gl-mark')).toHaveCount(3)
    await expect(p.locator('.gl-mark.is-hit')).toHaveCount(1)
    await expect(p.locator('.gl-mark').first()).toHaveAttribute('style', /left:\s*33\.3%/)
    await expect(p.locator('.pw-legend')).toContainText('100 kg')
    await expect(p.locator('.pw-legend')).toContainText('Started 1 Jul')
    await expect(p.locator('.pw-legend')).toContainText('160 kg')
    await expect(p.getByRole('button', { name: 'Update progress' })).toBeVisible()
  })

  test('a weight loss reads downward, and a goal with no numbers is its steps', async ({ page }) => {
    await soloView(page)
    await setup(page, { render: 'g-weight' })
    const p = tab(page).locator('.gl-progress')
    await expect(p.locator('.pw-big')).toHaveText('88.4 kg')
    await expect(p.locator('.gl-sub')).toHaveText('3.4 kg to go · 51% there')
    await expect(p.locator('.gl-mark.is-hit'), '90 kg is behind it').toHaveCount(1)
    await setup(page, { render: 'g-run' })
    const r = tab(page).locator('.gl-progress')
    await expect(r.locator('.pw-big')).toContainText('1 of 3 steps')
    await expect(r.locator('.gl-mark')).toHaveCount(0)
    await expect(r.getByRole('button', { name: 'Update progress' }), 'a goal with no numbers can still be logged against').toBeVisible()
  })

  test('a goal with no numbers and no steps says there is nothing to track yet (no "0 of 0", no empty bar), and tells a manager how to fix it', async ({ page }) => {
    await soloView(page)
    await setup(page, { render: 'g-paused' })
    await expect(tab(page).locator('.gl-progress')).toContainText('Nothing to track yet. Add a step below, or set From and To in Edit.')
    await expect(tab(page).locator('.gl-progress .pw-bar')).toHaveCount(0)
    await setup(page, { role: 'client', render: 'g-paused' })
    await expect(tab(page).locator('.gl-progress')).toContainText('Nothing to track yet.')
    await expect(tab(page).locator('.gl-progress')).not.toContainText('Add a step')
    await setup(page, { role: 'client' })
    await expect(card(page, 'Pull-ups x10').locator('.gl-bar')).toHaveCount(0)
  })

  test('a finished goal reads "Goal reached" and offers no Update progress; a paused one wears a pill', async ({ page }) => {
    await soloView(page)
    await setup(page, { render: 'g-dead' })
    await expect(tab(page).locator('.gl-sub')).toHaveText('Goal reached')
    await expect(tab(page).locator('.gl-progress .pw-pill')).toHaveText('Done')
    await expect(tab(page).getByRole('button', { name: 'Update progress' })).toHaveCount(0)
    await expect(tab(page).locator('.gl-due')).toContainText('Target 20 Sep 2026')
    await setup(page, { render: 'g-paused' })
    await expect(tab(page).locator('.gl-progress .pw-pill')).toHaveText('Paused')
  })

  test('the steps: one ticks itself and cannot be unticked, the rest are ticked by hand and saved, and the count follows', async ({ page }) => {
    await soloView(page)
    await setup(page, { render: 'g-squat' })
    const list = page.locator('#milestone-list')
    await expect(tab(page).locator('.gl-sec', { hasText: 'Steps' })).toContainText('1 of 3 done')
    const auto = list.locator('.gl-step', { hasText: 'Squat 120 kg' })
    await expect(auto).toHaveClass(/is-done/)
    await expect(auto.locator('.gl-auto')).toHaveText('Ticked itself when your progress reached it')
    await expect(auto.locator('.gl-tick')).toBeDisabled()
    const hand = list.locator('.gl-step', { hasText: 'Squat 140 kg' })
    await expect(hand.locator('.gl-tick')).toBeEnabled()
    await hand.locator('.gl-tick').click()
    await expect(list.locator('.gl-step', { hasText: 'Squat 140 kg' })).toHaveClass(/is-done/)
    await expect(tab(page).locator('.gl-sec', { hasText: 'Steps' })).toContainText('2 of 3 done')
    const w = await writes(page)
    expect(w.update, 'one write: the tick').toHaveLength(1)
    expect(w.update[0]).toMatchObject({ table: 'goal_milestones', filters: { id: 'm2' } })
    expect(w.update[0].patch.completed_at, 'an ISO time, not a flag').toMatch(/^\d{4}-\d{2}-\d{2}T/)
    // and back again
    await list.locator('.gl-step', { hasText: 'Squat 140 kg' }).locator('.gl-tick').click()
    await expect(list.locator('.gl-step', { hasText: 'Squat 140 kg' })).not.toHaveClass(/is-done/)
    expect((await writes(page)).update[1].patch.completed_at).toBeNull()
  })

  test('a step the person ticked early is done, and the next-step line skips it', async ({ page }) => {
    await soloView(page)
    const ms = MS.map(m => m.id === 'm3' ? { ...m, completed_at: '2026-10-01T10:00:00Z' } : m)
    await setup(page, { ms })
    await expect(card(page, 'Squat 160 kg').locator('.gl-meta-row')).toContainText('2 of 3 steps')
    await expect(card(page, 'Squat 160 kg').locator('.gl-next')).toHaveText('Next Squat 140 kg')
  })

  test('adding a step: type it and Add (or Enter); empty is refused; the input does not need a dialog', async ({ page }) => {
    await soloView(page)
    await setup(page, { render: 'g-squat' })
    await tab(page).getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.locator('#step-error')).toHaveText('Type the step first.')
    expect((await writes(page)).insert).toHaveLength(0)
    await page.locator('#step-title').fill('  Squat 145 kg  ')
    await page.locator('#step-title').press('Enter')
    await expect(page.locator('#milestone-list .gl-step', { hasText: 'Squat 145 kg' })).toBeVisible()
    const w = await writes(page)
    expect(w.insert).toHaveLength(1)
    expect(w.insert[0]).toEqual({ table: 'goal_milestones', rows: [{ goal_id: 'g-squat', title: 'Squat 145 kg' }] })
    await expect(page.locator('#step-title'), 'the page repainted with an empty box').toHaveValue('')
  })

  test('a double tap on Add adds ONE step', async ({ page }) => {
    await soloView(page)
    await setup(page, { render: 'g-squat' })
    await page.locator('#step-title').fill('Squat 145 kg')
    await page.evaluate(() => { window.__delay = 400 })
    await tab(page).getByRole('button', { name: 'Add', exact: true }).dblclick()
    await expect(page.locator('#milestone-list .gl-step', { hasText: 'Squat 145 kg' })).toHaveCount(1)
    expect((await writes(page)).insert, 'one row, not two').toHaveLength(1)
  })

  test('the database refusing a step is shown, not swallowed, and the box keeps what was typed', async ({ page }) => {
    await soloView(page)
    await setup(page, { render: 'g-squat', fail: { 'goal_milestones.insert': true } })
    await page.locator('#step-title').fill('Squat 145 kg')
    await tab(page).getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.locator('#step-error')).toContainText('Could not add the step')
    await expect(page.locator('#step-title')).toHaveValue('Squat 145 kg')
  })

  test('a step with a number or a date still has its dialog, linked under the list', async ({ page }) => {
    await soloView(page)
    await setup(page, { render: 'g-squat' })
    await tab(page).getByRole('button', { name: /Add a step with a number or a date/ }).click()
    await expect(page.locator('#add-milestone-modal')).toBeVisible()
    await page.locator('#am-title').fill('Squat 155 kg')
    await page.locator('#am-value').fill('155')
    await expect(page.locator('#add-milestone-modal .modal-title')).toHaveText('Add a step')
    await page.locator('#add-milestone-modal').getByRole('button', { name: 'Add step' }).click()
    await expect(page.locator('#add-milestone-modal')).toHaveCount(0)
    const w = await writes(page)
    expect(w.insert[0].rows[0]).toMatchObject({ goal_id: 'g-squat', title: 'Squat 155 kg', target_value: '155' })
    await expect(page.locator('#milestone-list .gl-step', { hasText: 'Squat 155 kg' })).toBeVisible()
  })

  test('history: the newest five, "Show all" opens the rest and "Show fewer" folds them', async ({ page }) => {
    await soloView(page)
    const many = Array.from({ length: 7 }, (_, i) => ({ id: 'h' + i, goal_id: 'g-squat', date: `2026-09-${String(20 - i).padStart(2, '0')}`, current_value: 120 + i, notes: i === 0 ? 'newest' : null, created_at: '2026-09-20T10:00:00Z' }))
    await setup(page, { render: 'g-squat', ci: many })
    const rows = page.locator('#gl-history .gl-hist')
    await expect(tab(page).locator('.gl-sec', { hasText: 'History' })).toContainText('7 updates')
    await expect(rows.first().locator('.gl-hist-v')).toHaveText('120 kg')
    await expect(rows.first().locator('.gl-hist-d')).toHaveText('20 Sep')
    await expect(page.locator('#gl-history .gl-hist:visible')).toHaveCount(5)
    await tab(page).getByRole('button', { name: 'Show all 7' }).click()
    await expect(page.locator('#gl-history .gl-hist:visible')).toHaveCount(7)
    await tab(page).getByRole('button', { name: 'Show fewer' }).click()
    await expect(page.locator('#gl-history .gl-hist:visible')).toHaveCount(5)
  })

  test('no history, no History heading; a note-only update reads "Note"', async ({ page }) => {
    await soloView(page)
    await setup(page, { render: 'g-weight', ci: [] })
    await expect(tab(page).locator('.gl-sec', { hasText: 'History' })).toHaveCount(0)
    await setup(page, { render: 'g-weight', ci: [{ id: 'n1', goal_id: 'g-weight', date: '2026-10-11', current_value: null, notes: 'Felt flat', created_at: '2026-10-11T10:00:00Z' }] })
    await expect(page.locator('#gl-history .gl-hist-v')).toHaveText('Note')
    await expect(page.locator('#gl-history .gl-hist-n')).toHaveText('Felt flat')
  })

  test('a goal that cannot be read says so and offers the way back', async ({ page }) => {
    await soloView(page)
    await setup(page, { render: 'g-squat', fail: { 'goals.select': true } })
    await expect(tab(page)).toContainText('Could not load this goal')
    await expect(tab(page).locator('.back-btn', { hasText: 'All goals' })).toBeVisible()
  })
})

test.describe('Update progress (2026-10-14)', () => {
  test('the sheet starts from where the goal is, − and + move it a step the size of the goal, and Save writes the update and the goal\'s number', async ({ page }) => {
    await soloView(page)
    await setup(page, { render: 'g-squat' })
    await tab(page).getByRole('button', { name: 'Update progress' }).click()
    const sheet = page.locator('#add-checkin-modal')
    await expect(sheet.locator('.modal-title')).toHaveText('Update progress')
    await expect(sheet.locator('.gl-sheet-goal')).toHaveText('Squat 160 kg')
    await expect(sheet.locator('#ci-value')).toHaveValue('130')
    await expect(sheet.locator('.pw-unit')).toHaveText('kg')
    await sheet.getByRole('button', { name: 'Up' }).click()
    await expect(sheet.locator('#ci-value'), 'a 60 kg goal moves in 2.5s').toHaveValue('132.5')
    await sheet.getByRole('button', { name: 'Down' }).click()
    await sheet.getByRole('button', { name: 'Down' }).click()
    await expect(sheet.locator('#ci-value')).toHaveValue('127.5')
    await sheet.getByRole('button', { name: 'Up' }).click()
    await sheet.getByRole('button', { name: 'Up' }).click()
    await sheet.getByRole('button', { name: 'Up' }).click()
    await sheet.locator('#ci-notes').fill('New PB')
    await sheet.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(sheet).toHaveCount(0)
    const today = await localToday(page)
    const w = await writes(page)
    expect(w.insert).toHaveLength(1)
    expect(w.insert[0]).toMatchObject({ table: 'goal_check_ins', rows: [{ goal_id: 'g-squat', date: today, current_value: 135, notes: 'New PB' }] })
    expect(w.update).toHaveLength(1)
    expect(w.update[0]).toMatchObject({ table: 'goals', patch: { current_value: 135 }, filters: { id: 'g-squat' } })
    await expect(tab(page).locator('.gl-progress .pw-big')).toHaveText('135 kg')
    await expect(page.locator('#gl-history .gl-hist').first()).toContainText('135 kg')
    await expect(page.locator('#gl-history .gl-hist').first()).toContainText('New PB')
  })

  test('the date is today (the local day, not the UTC one) unless changed under the fold; the fold is closed', async ({ page }) => {
    await soloView(page)
    await setup(page, { render: 'g-squat' })
    await tab(page).getByRole('button', { name: 'Update progress' }).click()
    const sheet = page.locator('#add-checkin-modal')
    await expect(sheet.locator('details.gl-more')).not.toHaveAttribute('open', '')
    expect(await sheet.locator('#ci-date').inputValue()).toBe(await localToday(page))
    await sheet.locator('summary').click()
    await sheet.locator('#ci-date').fill('2026-10-01')
    await sheet.locator('#ci-value').fill('131')
    await sheet.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(sheet).toHaveCount(0)
    expect((await writes(page)).insert[0].rows[0].date).toBe('2026-10-01')
  })

  test('nothing entered, or something that is not a number, is refused with a message and nothing is written', async ({ page }) => {
    await soloView(page)
    await setup(page, { render: 'g-squat' })
    await tab(page).getByRole('button', { name: 'Update progress' }).click()
    const sheet = page.locator('#add-checkin-modal')
    await sheet.locator('#ci-value').fill('')
    await sheet.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(sheet.locator('#ci-error')).toHaveText('Enter a number or a note.')
    await sheet.locator('#ci-value').evaluate(el => { el.type = 'text' })
    await sheet.locator('#ci-value').fill('abc')
    await sheet.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(sheet.locator('#ci-error')).toHaveText('Enter a number.')
    expect((await writes(page)).insert).toHaveLength(0)
    expect((await writes(page)).update).toHaveLength(0)
  })

  test('a note on its own is an update that leaves the goal\'s number alone', async ({ page }) => {
    await soloView(page)
    await setup(page, { render: 'g-squat' })
    await tab(page).getByRole('button', { name: 'Update progress' }).click()
    const sheet = page.locator('#add-checkin-modal')
    await sheet.locator('#ci-value').fill('')
    await sheet.locator('#ci-notes').fill('Deload week')
    await sheet.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(sheet).toHaveCount(0)
    const w = await writes(page)
    expect(w.insert[0].rows[0]).toMatchObject({ goal_id: 'g-squat', current_value: null, notes: 'Deload week' })
    expect(w.update, 'no number, so the goal is not touched').toHaveLength(0)
    await expect(tab(page).locator('.gl-progress .pw-big')).toHaveText('130 kg')
  })

  test('if the goal\'s own number cannot be updated, the person is told, the update is still in the history, and nothing is shown as "saved" silently', async ({ page }) => {
    await soloView(page)
    await setup(page, { render: 'g-squat', fail: { 'goals.update.norow': true } })
    await tab(page).getByRole('button', { name: 'Update progress' }).click()
    await page.locator('#ci-value').fill('133')
    await page.locator('#add-checkin-modal').getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.locator('#add-checkin-modal')).toHaveCount(0)
    // (log.error also toasts, but showToast keeps one toast on screen, so the person sees the last: ours)
    expect((await toasts(page)).at(-1)).toBe("Saved to the history, but the goal's number could not be updated.")
    await expect(page.locator('#gl-history .gl-hist').first()).toContainText('133 kg')
    await expect(tab(page).locator('.gl-progress .pw-big'), 'the page shows the number the database kept').toHaveText('130 kg')
  })

  test('a refused insert keeps the sheet open with the reason', async ({ page }) => {
    await soloView(page)
    await setup(page, { render: 'g-squat', fail: { 'goal_check_ins.insert': true } })
    await tab(page).getByRole('button', { name: 'Update progress' }).click()
    await page.locator('#ci-value').fill('133')
    await page.locator('#add-checkin-modal').getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.locator('#ci-error')).toContainText('E2E refused goal_check_ins.insert')
    await expect(page.locator('#add-checkin-modal')).toBeVisible()
    expect((await writes(page)).update).toHaveLength(0)
  })

  test('a double tap on Save logs ONE update', async ({ page }) => {
    await soloView(page)
    await setup(page, { render: 'g-squat' })
    await tab(page).getByRole('button', { name: 'Update progress' }).click()
    await page.locator('#ci-value').fill('133')
    await page.evaluate(() => { window.__delay = 400 })
    await page.locator('#add-checkin-modal').getByRole('button', { name: 'Save', exact: true }).dblclick()
    await expect(page.locator('#add-checkin-modal')).toHaveCount(0)
    expect((await writes(page)).insert, 'one row, not two').toHaveLength(1)
  })

  test('a goal with no numbers gets a plain optional number and a note', async ({ page }) => {
    await soloView(page)
    await setup(page, { render: 'g-run' })
    await tab(page).getByRole('button', { name: 'Update progress' }).click()
    const sheet = page.locator('#add-checkin-modal')
    await expect(sheet.locator('.pw-stepper')).toHaveCount(0)
    await expect(sheet.locator('#ci-value')).toHaveValue('')
    await expect(sheet.locator('label[for="ci-value"]')).toContainText('optional')
    await sheet.locator('#ci-value').fill('7')
    await sheet.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(sheet).toHaveCount(0)
    expect((await writes(page)).update[0].patch.current_value, 'a number given still moves the goal').toBe(7)
  })
})

test.describe('Add and edit a goal (2026-10-14)', () => {
  test('the new-goal sheet is short; the old fields are folded under More options with their old ids', async ({ page }) => {
    await soloView(page)
    await setup(page)
    await tab(page).getByRole('button', { name: '+ Add goal' }).click()
    const sheet = page.locator('#add-goal-modal')
    await expect(sheet.locator('.modal-title')).toHaveText('New goal')
    for (const id of ['ag-title', 'ag-start', 'ag-target', 'ag-date']) await expect(sheet.locator('#' + id), id).toBeVisible()
    await expect(sheet.locator('details.gl-more')).not.toHaveAttribute('open', '')
    for (const id of ['ag-desc', 'ag-type', 'ag-priority', 'ag-metric']) await expect(sheet.locator('#' + id), id + ' is folded').toBeHidden()
    await sheet.locator('summary', { hasText: 'More options' }).click()
    for (const id of ['ag-desc', 'ag-type', 'ag-priority', 'ag-metric']) await expect(sheet.locator('#' + id), id).toBeVisible()
  })

  test('the measure chips: Weight is the default and uses the person\'s unit; Other asks for a unit; Steps only hides the numbers', async ({ page }) => {
    await soloView(page)
    await setup(page)
    await page.evaluate(() => { window._unitPrefs.weight = 'lb' })
    await tab(page).getByRole('button', { name: '+ Add goal' }).click()
    const sheet = page.locator('#add-goal-modal')
    await expect(sheet.locator('#ag-kind button[aria-pressed="true"]')).toHaveText('Weight (lb)')
    await expect(sheet.locator('#ag-unit')).toHaveValue('lb')
    await expect(sheet.locator('#ag-unit')).toBeHidden()
    await sheet.getByRole('button', { name: 'Time (min)' }).click()
    await expect(sheet.locator('#ag-unit')).toHaveValue('min')
    await sheet.getByRole('button', { name: 'Other' }).click()
    await expect(sheet.locator('#ag-unit')).toBeVisible()
    await expect(sheet.locator('#ag-unit')).toHaveValue('')
    await sheet.locator('#ag-unit').fill('km')
    await sheet.getByRole('button', { name: 'Steps only' }).click()
    await expect(sheet.locator('#ag-nums')).toBeHidden()
    await expect(sheet.locator('#ag-unit')).toBeHidden()
    await expect(sheet.locator('#ag-kind button[aria-pressed="true"]')).toHaveText('Steps only')
    await sheet.getByRole('button', { name: 'Reps' }).click()
    await expect(sheet.locator('#ag-nums')).toBeVisible()
    await expect(sheet.locator('#ag-unit')).toHaveValue('reps')
  })

  test('Add goal writes one row with the numbers as numbers, the current value starting at From, and the old defaults', async ({ page }) => {
    await soloView(page)
    await setup(page)
    await tab(page).getByRole('button', { name: '+ Add goal' }).click()
    const sheet = page.locator('#add-goal-modal')
    await sheet.locator('#ag-title').fill('  Bench 100 kg  ')
    await sheet.locator('#ag-start').fill('80')
    await sheet.locator('#ag-target').fill('100')
    await sheet.locator('#ag-date').fill('2027-01-31')
    await sheet.getByRole('button', { name: 'Add goal', exact: true }).click()
    await expect(sheet).toHaveCount(0)
    const w = await writes(page)
    expect(w.insert).toHaveLength(1)
    const uid = await page.evaluate(() => window.__me)
    expect(w.insert[0]).toEqual({ table: 'goals', rows: [{
      client_id: 'cid', created_by: uid, title: 'Bench 100 kg', description: null, goal_type: 'custom', metric_label: null, metric_unit: 'kg',
      start_value: 80, current_value: 80, target_value: 100, target_date: '2027-01-31', priority: 1, status: 'active' }] })
    await expect(card(page, 'Bench 100 kg')).toBeVisible()
    await expect(card(page, 'Bench 100 kg').locator('.gl-nums')).toContainText('100 kg')
  })

  test('Steps only writes no numbers and no unit even if some were typed first; the folded fields are still saved', async ({ page }) => {
    await soloView(page)
    await setup(page)
    await tab(page).getByRole('button', { name: '+ Add goal' }).click()
    const sheet = page.locator('#add-goal-modal')
    await sheet.locator('#ag-title').fill('Do a muscle-up')
    await sheet.locator('#ag-start').fill('1')      // typed first, then the person chooses Steps only: the numbers must not be saved
    await sheet.locator('#ag-target').fill('5')
    await sheet.getByRole('button', { name: 'Steps only' }).click()
    await sheet.locator('summary', { hasText: 'More options' }).click()
    await sheet.locator('#ag-desc').fill('Strict')
    await sheet.locator('#ag-type').selectOption('habit')
    await sheet.locator('#ag-priority').selectOption('2')
    await sheet.locator('#ag-metric').fill('Muscle-up')
    await sheet.getByRole('button', { name: 'Add goal', exact: true }).click()
    await expect(sheet).toHaveCount(0)
    expect((await writes(page)).insert[0].rows[0]).toMatchObject({
      title: 'Do a muscle-up', description: 'Strict', goal_type: 'habit', priority: 2, metric_label: 'Muscle-up', metric_unit: null, start_value: null, current_value: null, target_value: null, target_date: null })
  })

  test('refused with a message and nothing written: no title; From without To; the same number twice', async ({ page }) => {
    await soloView(page)
    await setup(page)
    await tab(page).getByRole('button', { name: '+ Add goal' }).click()
    const sheet = page.locator('#add-goal-modal'), save = () => sheet.getByRole('button', { name: 'Add goal', exact: true }).click()
    await save()
    await expect(sheet.locator('#ag-error')).toHaveText('Title is required')
    await sheet.locator('#ag-title').fill('Bench 100 kg')
    await sheet.locator('#ag-start').fill('80')
    await save()
    await expect(sheet.locator('#ag-error')).toHaveText('Enter both From and To, or choose Steps only.')
    await sheet.locator('#ag-target').fill('80')
    await save()
    await expect(sheet.locator('#ag-error')).toHaveText('From and To are the same number.')
    expect((await writes(page)).insert).toHaveLength(0)
  })

  test('a double tap on Add goal makes ONE goal', async ({ page }) => {
    await soloView(page)
    await setup(page)
    await tab(page).getByRole('button', { name: '+ Add goal' }).click()
    await page.locator('#ag-title').fill('Bench 100 kg')
    await page.locator('#ag-start').fill('80')
    await page.locator('#ag-target').fill('100')
    await page.evaluate(() => { window.__delay = 400 })
    await page.locator('#add-goal-modal').getByRole('button', { name: 'Add goal', exact: true }).dblclick()
    await expect(page.locator('#add-goal-modal')).toHaveCount(0)
    expect((await writes(page)).insert, 'one row, not two').toHaveLength(1)
  })

  test('the edit sheet: the name, From and To (From is editable now) and the date; the rest under More options; Save writes them', async ({ page }) => {
    await soloView(page)
    await setup(page, { render: 'g-squat' })
    await tab(page).getByRole('button', { name: 'Edit' }).click()
    const sheet = page.locator('#edit-goal-modal')
    await expect(sheet.locator('#eg-title')).toHaveValue('Squat 160 kg')
    await expect(sheet.locator('#eg-start')).toHaveValue('100')
    await expect(sheet.locator('#eg-target')).toHaveValue('160')
    await expect(sheet.locator('#eg-date')).toHaveValue('2027-03-13')
    for (const id of ['eg-desc', 'eg-status', 'eg-current']) await expect(sheet.locator('#' + id), id + ' is folded').toBeHidden()
    await sheet.locator('#eg-title').fill('Squat 165 kg')
    await sheet.locator('#eg-start').fill('105')
    await sheet.locator('#eg-target').fill('165')
    await sheet.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(sheet).toHaveCount(0)
    const uid = await page.evaluate(() => window.__me)
    const w = await writes(page)
    expect(w.update).toHaveLength(1)
    expect(w.update[0]).toMatchObject({ table: 'goals', filters: { id: 'g-squat', created_by: uid }, patch: { title: 'Squat 165 kg', start_value: '105', target_value: '165', status: 'active', description: 'Back squat, paused', current_value: '130' } })
    await expect(tab(page).locator('.gl-title')).toHaveText('Squat 165 kg')
  })

  test('"Mark goal finished" saves the status through the one save and the goal moves to Done; "Reopen goal" undoes it', async ({ page }) => {
    await soloView(page)
    await setup(page, { render: 'g-squat' })
    await tab(page).getByRole('button', { name: 'Edit' }).click()
    await page.locator('#edit-goal-modal').getByRole('button', { name: 'Mark goal finished' }).click()
    await expect(page.locator('#edit-goal-modal')).toHaveCount(0)
    let w = await writes(page)
    expect(w.update[0].patch.status).toBe('completed')
    await expect(tab(page).locator('.gl-sub'), 'finished at 50%: not claimed as reached').toHaveText('Marked as done · 50% of the way')
    await expect(tab(page).getByRole('button', { name: 'Update progress' })).toHaveCount(0)
    await tab(page).getByRole('button', { name: 'Edit' }).click()
    await page.locator('#edit-goal-modal').getByRole('button', { name: 'Reopen goal' }).click()
    await expect(page.locator('#edit-goal-modal')).toHaveCount(0)
    w = await writes(page)
    expect(w.update[1].patch.status).toBe('active')
    await expect(tab(page).getByRole('button', { name: 'Update progress' })).toBeVisible()
  })

  test('a save the database does not apply (someone else\'s goal) is reported on the sheet, never closed as if it worked', async ({ page }) => {
    await soloView(page)
    await setup(page, { render: 'g-squat', fail: { 'goals.update.norow': true } })
    await tab(page).getByRole('button', { name: 'Edit' }).click()
    await page.locator('#edit-goal-modal').getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.locator('#eg-error')).toContainText('only the person who set this goal can edit it')
    await expect(page.locator('#edit-goal-modal')).toBeVisible()
  })

  test('Delete goal asks first, then removes it and returns to the list', async ({ page }) => {
    await soloView(page)
    await setup(page, { render: 'g-squat' })
    await tab(page).getByRole('button', { name: 'Edit' }).click()
    await page.locator('#edit-goal-modal').getByRole('button', { name: 'Delete goal' }).click()
    await acceptConfirm(page)
    await expect(page.locator('#edit-goal-modal')).toHaveCount(0)
    expect((await writes(page)).delete).toHaveLength(1)
    await expect(card(page, 'Squat 160 kg')).toHaveCount(0)
    await expect(card(page, 'Body weight 85 kg')).toBeVisible()
  })
})

test.describe('Who can do what (2026-10-14)', () => {
  test('a client tracks and ticks but does not add, edit or manage steps', async ({ page }) => {
    await soloView(page)
    await setup(page, { role: 'client' })
    await expect(tab(page).locator('button[onclick^="showAddGoalModal"]')).toHaveCount(0)
    await card(page, 'Squat 160 kg').click()
    await expect(tab(page).locator('.gl-title')).toBeVisible()
    await expect(tab(page).getByRole('button', { name: 'Edit' })).toHaveCount(0)
    await expect(tab(page).locator('#step-title')).toHaveCount(0)
    await expect(tab(page).locator('button[onclick^="showAddMilestoneModal"]')).toHaveCount(0)
    await expect(tab(page).getByRole('button', { name: 'Update progress' }), 'POSITIVE CONTROL: the tracking control stays').toBeVisible()
    await expect(tab(page).locator('#milestone-list .gl-step', { hasText: 'Squat 140 kg' }).locator('.gl-tick')).toBeEnabled()
    await page.locator('#milestone-list .gl-step', { hasText: 'Squat 140 kg' }).locator('.gl-tick').click()
    expect((await writes(page)).update[0]).toMatchObject({ table: 'goal_milestones', filters: { id: 'm2' } })
  })

  test('a client with a goal that has no steps is told so without being invited to add one', async ({ page }) => {
    await soloView(page)
    await setup(page, { role: 'client', goals: [WEIGHT], ms: [], render: 'g-weight' })
    await expect(page.locator('#milestone-list')).toContainText('No steps yet.')
    await expect(page.locator('#milestone-list')).not.toContainText('Add one below')
    await setup(page, { role: 'coach', goals: [WEIGHT], ms: [], render: 'g-weight' })
    await expect(page.locator('#milestone-list')).toContainText('Add one below')
  })

  test('a coach has every control, on the list and on the goal', async ({ page }) => {
    await soloView(page)
    await setup(page, { role: 'coach' })
    await expect(tab(page).getByRole('button', { name: '+ Add goal' })).toBeVisible()
    await card(page, 'Squat 160 kg').click()
    await expect(tab(page).getByRole('button', { name: 'Edit' })).toBeVisible()
    await expect(page.locator('#step-title')).toBeVisible()
    await expect(tab(page).getByRole('button', { name: 'Update progress' })).toBeVisible()
  })
})

test.describe('Text a person typed is text (2026-10-14)', () => {
  test('a hostile title, description, label, unit, step and note never become markup anywhere on the list, the page or the sheets', async ({ page }) => {
    await soloView(page)
    const bad = '<img src=x onerror="window.__xss=1">'
    const goal = { ...SQUAT, title: bad, description: bad, metric_label: bad, metric_unit: '<svg onload="window.__xss=2"></svg>kg' }
    const ms = [{ id: 'x1', goal_id: 'g-squat', title: bad, target_value: 140, order: 1, created_at: '2026-07-02T09:00:00Z', completed_at: null }]
    const ci = [{ id: 'x2', goal_id: 'g-squat', date: '2026-10-03', current_value: 130, notes: bad, created_at: '2026-10-03T10:00:00Z' }]
    await setup(page, { goals: [goal], ms, ci })
    const inert = async where => {
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => setTimeout(r, 200))))
      const s = await page.evaluate(() => ({ ran: window.__xss ?? null, injected: document.querySelectorAll('#tab-content img[src="x"], #tab-content svg[onload], .modal-overlay img[src="x"]').length }))
      expect(s.ran, `${where}: the payload EXECUTED`).toBeNull()
      expect(s.injected, `${where}: the payload created a live element`).toBe(0)
    }
    await inert('the list')
    await expect(tab(page)).toContainText('<img src=x')
    await card(page, 'onerror').click()
    await expect(tab(page).locator('.gl-title')).toBeVisible()
    await inert('the goal page')
    await expect(tab(page).locator('#gl-history')).toContainText('<img src=x')
    await expect(tab(page).locator('#milestone-list')).toContainText('<img src=x')
    await tab(page).getByRole('button', { name: 'Update progress' }).click()
    await inert('the update sheet')
    await page.locator('#add-checkin-modal .modal-close').click()
    await tab(page).getByRole('button', { name: 'Edit' }).click()
    await inert('the edit sheet')
    await expect(page.locator('#eg-title')).toHaveValue(bad)
  })
})

test.describe('Review fixes (2026-10-14)', () => {
  const LEGACY = { id: 'g-legacy', client_id: 'cid', created_by: 'me', title: 'Old goal', status: 'active', priority: 1, metric_unit: 'kg', target_value: 100, current_value: 80, created_at: '2026-01-01T09:00:00Z' }
  const REPS = { id: 'g-reps', client_id: 'cid', created_by: 'me', title: 'Pull-ups x10', status: 'active', priority: 1, metric_unit: 'reps', start_value: 0, current_value: 4, target_value: 10, created_at: '2026-06-01T09:00:00Z' }

  test('"Mark goal finished" saves the status the BUTTON names, whatever the Status box was set to; "Reopen goal" likewise', async ({ page }) => {
    await soloView(page)
    await setup(page, { render: 'g-squat' })
    await tab(page).getByRole('button', { name: 'Edit' }).click()
    await page.locator('#edit-goal-modal summary', { hasText: 'More options' }).click()
    await page.locator('#eg-status').selectOption('completed')     // the box already says Completed: the old code FLIPPED it to active
    await page.locator('#edit-goal-modal').getByRole('button', { name: 'Mark goal finished' }).click()
    await expect(page.locator('#edit-goal-modal')).toHaveCount(0)
    expect((await writes(page)).update[0].patch.status).toBe('completed')
    await setup(page, { render: 'g-dead' })
    await tab(page).getByRole('button', { name: 'Edit' }).click()
    await page.locator('#edit-goal-modal summary', { hasText: 'More options' }).click()
    await page.locator('#eg-status').selectOption('paused')         // the old code flipped Paused to completed
    await page.locator('#edit-goal-modal').getByRole('button', { name: 'Reopen goal' }).click()
    await expect(page.locator('#edit-goal-modal')).toHaveCount(0)
    expect((await writes(page)).update[0].patch.status).toBe('active')
  })

  test('if the save does not go through, the Status box goes back to what it was (a later plain Save must not persist it)', async ({ page }) => {
    await soloView(page)
    await setup(page, { render: 'g-squat' })
    await tab(page).getByRole('button', { name: 'Edit' }).click()
    await page.locator('#eg-title').fill('')
    await page.locator('#edit-goal-modal').getByRole('button', { name: 'Mark goal finished' }).click()
    await expect(page.locator('#eg-error')).toHaveText('Title is required')
    await expect(page.locator('#eg-status')).toHaveValue('active')
    expect((await writes(page)).update).toHaveLength(0)
  })

  test('the edit sheet refuses From without To and the same number twice, but lets a goal from the old form (a target and no start) be saved', async ({ page }) => {
    await soloView(page)
    await setup(page, { render: 'g-legacy', goals: [LEGACY], ms: [], ci: [] })
    await tab(page).getByRole('button', { name: 'Edit' }).click()
    const sheet = page.locator('#edit-goal-modal'), save = () => sheet.getByRole('button', { name: 'Save', exact: true }).click()
    await sheet.locator('#eg-start').fill('50')
    await sheet.locator('#eg-target').fill('')
    await save()
    await expect(sheet.locator('#eg-error')).toHaveText('Enter To as well, or clear From.')
    await sheet.locator('#eg-start').fill('100')
    await sheet.locator('#eg-target').fill('100')
    await save()
    await expect(sheet.locator('#eg-error')).toHaveText('From and To are the same number.')
    expect((await writes(page)).update).toHaveLength(0)
    await sheet.locator('#eg-start').fill('')
    await sheet.locator('#eg-target').fill('100')
    await sheet.locator('#eg-title').fill('Old goal renamed')
    await save()
    await expect(sheet).toHaveCount(0)
    expect((await writes(page)).update[0].patch).toMatchObject({ title: 'Old goal renamed', start_value: null, target_value: '100' })
  })

  test('an update OLDER than the newest in the history goes into the history and leaves the goal\'s number alone, with a message; a newer one moves it', async ({ page }) => {
    await soloView(page)
    await setup(page, { render: 'g-squat' })     // newest check-in is 3 Oct
    await tab(page).getByRole('button', { name: 'Update progress' }).click()
    let sheet = page.locator('#add-checkin-modal')
    await sheet.locator('summary').click()
    await sheet.locator('#ci-date').fill('2026-09-01')
    await sheet.locator('#ci-value').fill('110')
    await sheet.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(sheet).toHaveCount(0)
    let w = await writes(page)
    expect(w.insert[0].rows[0]).toMatchObject({ date: '2026-09-01', current_value: 110 })
    expect(w.update, 'the goal was not touched').toHaveLength(0)
    expect((await toasts(page)).at(-1)).toBe("Saved to the history. It is older than your latest update, so the goal's number stays as it is.")
    await expect(tab(page).locator('.gl-progress .pw-big')).toHaveText('130 kg')
    await tab(page).getByRole('button', { name: 'Update progress' }).click()
    sheet = page.locator('#add-checkin-modal')
    await sheet.locator('summary').click()
    await sheet.locator('#ci-date').fill('2026-10-05')
    await sheet.locator('#ci-value').fill('135')
    await sheet.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(sheet).toHaveCount(0)
    w = await writes(page)
    expect(w.update).toHaveLength(1)
    expect(w.update[0].patch.current_value).toBe(135)
  })

  test('the sheet starts from the STORED number, not a rounded one, and a note on its own writes that same number back', async ({ page }) => {
    await soloView(page)
    await setup(page, { render: 'g-squat', goals: [{ ...SQUAT, current_value: 87.25, start_value: 80, target_value: 100 }] })
    await tab(page).getByRole('button', { name: 'Update progress' }).click()
    await expect(page.locator('#ci-value')).toHaveValue('87.25')
    await page.locator('#ci-notes').fill('Felt fine')
    await page.locator('#add-checkin-modal').getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.locator('#add-checkin-modal')).toHaveCount(0)
    const w = await writes(page)
    expect(w.insert[0].rows[0].current_value).toBe(87.25)
    expect(w.update[0].patch.current_value).toBe(87.25)
  })

  test('a reps goal moves in whole reps, a big one in 2.5s', async ({ page }) => {
    await soloView(page)
    await setup(page, { render: 'g-reps', goals: [REPS], ms: [], ci: [] })
    await tab(page).getByRole('button', { name: 'Update progress' }).click()
    await page.getByRole('button', { name: 'Up', exact: true }).click()
    await expect(page.locator('#ci-value')).toHaveValue('5')
  })

  test('ticking a step the database refuses says so and leaves the step as it was', async ({ page }) => {
    await soloView(page)
    await setup(page, { render: 'g-squat', fail: { 'goal_milestones.update.norow': true } })
    await page.locator('#milestone-list .gl-step', { hasText: 'Squat 140 kg' }).locator('.gl-tick').click()
    await expect.poll(() => toasts(page).then(t => t.at(-1))).toBe('That step could not be changed')
    await expect(page.locator('#milestone-list .gl-step', { hasText: 'Squat 140 kg' })).not.toHaveClass(/is-done/)
  })

  test('a double tap on a tick toggles it ONCE (twice would put it back)', async ({ page }) => {
    await soloView(page)
    await setup(page, { render: 'g-squat' })
    await page.evaluate(() => { window.__delay = 400 })
    await page.locator('#milestone-list .gl-step', { hasText: 'Squat 140 kg' }).locator('.gl-tick').dblclick()
    await expect(page.locator('#milestone-list .gl-step', { hasText: 'Squat 140 kg' })).toHaveClass(/is-done/)
    expect((await writes(page)).update, 'one write, not two').toHaveLength(1)
  })

  test('ticking or adding a step keeps the scroll position, and an add gives the focus back to the step box', async ({ page }) => {
    await soloView(page)
    // A tall goal: 40 more steps. The page scrolls inside .main-content (overflow-y: auto), not the window, so give that a fixed height.
    const extra = Array.from({ length: 40 }, (_, i) => ({ id: 'z' + i, goal_id: 'g-squat', title: 'Extra step ' + i, order: 20 + i, created_at: '2026-08-01T09:' + String(i).padStart(2, '0') + ':00Z', completed_at: null }))
    await setup(page, { render: null, ms: [...MS, ...extra] })
    await page.evaluate(async () => {
      const m = document.getElementById('main-content')
      m.innerHTML = ''; m.style.height = '500px'; m.style.overflowY = 'auto'; m.appendChild(document.getElementById('tab-content'))
      await openGoal('g-squat', 'cid')
      m.scrollTop = 1500
    })
    const pos = () => page.evaluate(() => Math.round(document.getElementById('main-content').scrollTop))
    const y = await pos()
    expect(y, 'the page is scrolled well down the steps').toBeGreaterThan(1200)
    await page.evaluate(() => { window.__delay = 250 })      // a real database takes time: the page is 'Loading…' (a few lines tall) while it answers
    await page.locator('#milestone-list .gl-step', { hasText: 'Extra step 30' }).locator('.gl-tick').evaluate(b => b.click())
    await expect(page.locator('#milestone-list .gl-step', { hasText: 'Extra step 30' })).toHaveClass(/is-done/)
    expect(Math.abs((await pos()) - y), 'a tick does not throw the page back to the top').toBeLessThanOrEqual(2)
    await page.locator('#step-title').fill('One more')       // typing scrolls the box into view, so measure from here
    const y2 = await pos()
    await page.locator('#step-title').press('Enter')
    await expect(page.locator('#milestone-list .gl-step', { hasText: 'One more' })).toBeAttached()
    await expect(page.locator('#step-title'), 'ready for the next one').toBeFocused()
    expect(Math.abs((await pos()) - y2), 'an add does not throw the page back to the top either').toBeLessThanOrEqual(2)
  })

  test('a step shows its date, and a step that ticks itself keeps its date beside the note', async ({ page }) => {
    await soloView(page)
    const ms = [{ id: 'd1', goal_id: 'g-squat', title: 'By Christmas', target_value: 120, target_date: '2026-12-25', order: 1, created_at: '2026-07-02T09:00:00Z', completed_at: null },
      { id: 'd2', goal_id: 'g-squat', title: 'By Easter', target_value: 150, target_date: '2027-04-04', order: 2, created_at: '2026-07-02T09:01:00Z', completed_at: null }]
    await setup(page, { render: 'g-squat', ms })
    const auto = page.locator('#milestone-list .gl-step', { hasText: 'By Christmas' })
    await expect(auto.locator('.gl-auto')).toBeVisible()
    await expect(auto, 'the date is not lost once it ticks itself').toContainText('25 Dec 2026')
    await expect(page.locator('#milestone-list .gl-step', { hasText: 'By Easter' })).toContainText('4 Apr 2027')
  })

  test('a step whose number is off the goal\'s line does not tick itself: a typo (14 for 140) or a number beyond the target', async ({ page }) => {
    await soloView(page)
    const ms = [...MS, { id: 't1', goal_id: 'g-squat', title: 'Typo 14', target_value: 14, order: 9, created_at: '2026-07-03T09:00:00Z', completed_at: null }, { id: 't2', goal_id: 'g-squat', title: 'Beyond 170', target_value: 170, order: 10, created_at: '2026-07-03T09:01:00Z', completed_at: null }]
    await setup(page, { render: 'g-squat', ms })
    for (const t of ['Typo 14', 'Beyond 170']) {
      const row = page.locator('#milestone-list .gl-step', { hasText: t })
      await expect(row, t).not.toHaveClass(/is-done/)
      await expect(row.locator('.gl-tick'), t + ' can still be ticked by hand').toBeEnabled()
    }
    await expect(page.locator('#milestone-list .gl-step', { hasText: 'Squat 120 kg' }).locator('.gl-auto'), 'a step on the line still ticks itself').toBeVisible()
  })

  test('a finished goal: "Done" once, no "Next", and "Marked as done" when it is not all the way there', async ({ page }) => {
    await soloView(page)
    const part = { ...SQUAT, id: 'g-part', title: 'Half done', status: 'completed' }
    await setup(page, { goals: [DEAD, part] })
    await tab(page).locator('.gl-finished-btn').click()
    const dead = card(page, 'Deadlift 200 kg')
    await expect(dead.locator('.pw-pill')).toHaveText('Done')
    await expect(dead.locator('.gl-nums')).not.toContainText('Done')
    await expect(page.locator('#gl-finished .gl-next')).toHaveCount(0)
    await setup(page, { render: 'g-part', goals: [part], ms: MS.map(m => ({ ...m, goal_id: m.goal_id === 'g-squat' ? 'g-part' : m.goal_id })), ci: [] })
    await expect(tab(page).locator('.gl-sub')).toHaveText('Marked as done · 50% of the way')
  })

  test('a goal from the old form (a target and a number, no start) reads like the dashboard: 80 of 100, 80%', async ({ page }) => {
    await soloView(page)
    await setup(page, { goals: [LEGACY], ms: [], ci: [] })
    const c = card(page, 'Old goal')
    await expect(c.locator('.gl-nums')).toContainText('80')
    await expect(c.locator('.gl-nums')).toContainText('of 100 kg')
    await expect(c.locator('.gl-nums')).toContainText('20 kg to go')
    await expect(c.locator('.gl-bar i')).toHaveAttribute('style', /width:\s*80%/)
    expect(await page.evaluate(g => _goalPct(g), LEGACY), 'the dashboard card says the same').toBe(80)
  })

  test('updates made on the same day are listed newest-made first', async ({ page }) => {
    await soloView(page)
    const ci = [{ id: 's1', goal_id: 'g-squat', date: '2026-10-03', current_value: 128, notes: 'morning', created_at: '2026-10-03T08:00:00Z' }, { id: 's2', goal_id: 'g-squat', date: '2026-10-03', current_value: 130, notes: 'evening', created_at: '2026-10-03T19:00:00Z' }]
    await setup(page, { render: 'g-squat', ci })
    await expect(page.locator('#gl-history .gl-hist-n')).toHaveText(['evening', 'morning'])
  })

  test('Space opens a goal card as well as Enter', async ({ page }) => {
    await soloView(page)
    await setup(page)
    await card(page, 'Squat 160 kg').focus()
    await page.keyboard.press('Space')
    await expect(tab(page).locator('.gl-title')).toHaveText('Squat 160 kg')
  })

  test('a due date shows its year only when it is not this year', async ({ page }) => {
    await soloView(page)
    await page.clock.setFixedTime(new Date('2026-10-13T12:00:00Z'))
    const thisYear = { ...RUN, id: 'g-ty', title: 'Due this year', target_date: '2026-12-20' }
    await setup(page, { goals: [thisYear, SQUAT], ms: [], ci: [] })
    await expect(card(page, 'Due this year').locator('.gl-meta-row')).toContainText('Due 20 Dec')
    await expect(card(page, 'Due this year').locator('.gl-meta-row')).not.toContainText('2026')
    await expect(card(page, 'Squat 160 kg').locator('.gl-meta-row')).toContainText('Due 13 Mar 2027')
  })
})

test.describe('The screens at a phone width (2026-10-14)', () => {
  // GOALS_SHOTS=<folder> saves a picture of each screen for the eye; without it this only proves each screen fits a 390px phone with no sideways scroll.
  test('the list, a goal, and the three sheets fit 390px and nothing scrolls sideways', async ({ page }) => {
    await soloView(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await setup(page)
    const shot = async name => {
      if (process.env.GOALS_SHOTS) await page.evaluate(() => Promise.allSettled(document.getAnimations().map(x => x.finished)))   // let a sheet finish sliding in
      if (process.env.GOALS_SHOTS) await page.screenshot({ path: `${process.env.GOALS_SHOTS}/${name}.png`, fullPage: true })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${name}: the page scrolls sideways`).toBe(true)
      expect(await page.evaluate(() => [...document.querySelectorAll('.modal')].every(m => m.scrollWidth <= m.clientWidth + 1)), `${name}: a sheet scrolls sideways`).toBe(true)
    }
    await expect(card(page, 'Squat 160 kg')).toBeVisible()
    await tab(page).locator('.gl-finished-btn').click()
    await shot('1-list')
    await card(page, 'Squat 160 kg').click()
    await expect(tab(page).locator('.gl-title')).toBeVisible()
    await shot('2-goal')
    await tab(page).getByRole('button', { name: 'Update progress' }).click()
    await shot('3-update-sheet')
    await page.locator('#add-checkin-modal .modal-close').click()
    await tab(page).getByRole('button', { name: 'Edit' }).click()
    await shot('4-edit-sheet')
    await page.locator('#edit-goal-modal .modal-close').click()
    await tab(page).locator('.back-btn').click()
    await tab(page).getByRole('button', { name: '+ Add goal' }).click()
    await shot('5-add-sheet')
  })
})

test.describe('Writes on an existing goal check ownership first (2026-10-14)', () => {
  test('when the check refuses, a step, an update and a milestone write NOTHING and each says so', async ({ page }) => {
    await soloView(page)
    await setup(page, { render: 'g-squat' })
    await page.evaluate(() => { window._verifyGoalAccess = async () => false })
    await page.locator('#step-title').fill('Squat 145 kg')
    await tab(page).getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.locator('#step-error')).toHaveText('Not added — permission denied.')
    await tab(page).getByRole('button', { name: 'Update progress' }).click()
    await page.locator('#ci-value').fill('133')
    await page.locator('#add-checkin-modal').getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.locator('#ci-error')).toHaveText('Save failed — permission denied.')
    await page.locator('#add-checkin-modal .modal-close').click()
    await tab(page).getByRole('button', { name: /Add a step with a number or a date/ }).click()
    await page.locator('#am-title').fill('Squat 155 kg')
    await page.locator('#add-milestone-modal').getByRole('button', { name: 'Add step' }).click()
    await expect(page.locator('#am-error')).toHaveText('Save failed — permission denied.')
    const w = await writes(page)
    expect(w.insert, 'nothing was inserted').toHaveLength(0)
    expect(w.update, 'nothing was updated').toHaveLength(0)
  })
})

test.describe('The day an update is dated (2026-10-14)', () => {
  test.use({ timezoneId: 'Pacific/Auckland' })
  test('is the person\'s own day: 12:30 on the 14th in Auckland is still the 13th in UTC, and the update says the 14th', async ({ page }) => {
    await soloView(page)
    await page.clock.setFixedTime(new Date('2026-10-13T23:30:00Z'))
    await setup(page, { render: 'g-squat' })
    await tab(page).getByRole('button', { name: 'Update progress' }).click()
    await expect(page.locator('#ci-date')).toHaveValue('2026-10-14')
    await page.locator('#ci-value').fill('133')
    await page.locator('#add-checkin-modal').getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.locator('#add-checkin-modal')).toHaveCount(0)
    expect((await writes(page)).insert[0].rows[0].date).toBe('2026-10-14')
  })
})
