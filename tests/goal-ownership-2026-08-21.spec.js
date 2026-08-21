const { test, expect } = require('@playwright/test')
const { loginAsPT, loginAsClient } = require('./helpers')

// ─── Goal / milestone writes verify ownership, per ROLE (2026-08-12 audit) ────────────────────────
//
// saveGoalProgress, saveCheckIn's goal-update, toggleMilestone and toggleClientMilestone all wrote
// with `.eq('id', X)` and nothing else. `goal_milestones` has no owner column at all.
//
// The reason this needed a helper rather than an anchor: goal ownership means different things per
// role. A coach owns via `created_by`; a client or solo user owns via `client_id`, because their
// COACH created the goal. saveEditGoal's `.eq('created_by', currentUser.id)` is correct on the coach
// path and would refuse every client their own progress save if copied to the self-service paths.
//
// So the client HAPPY PATH is the load-bearing test here. A guard that only refuses would pass every
// refusal assertion while silently breaking the thing clients actually use.
const FOREIGN_GOAL = '00000000-0000-0000-0000-0000000000fe'
const TAG = '[E2E] Goal Ownership ' + Date.now()

test.describe('goal + milestone writes verify ownership per role', () => {
  let goalId = null

  test.beforeEach(async ({ browser }) => {
    // Resolve the E2E CLIENT's own clients.id first, then have the PT create the goal against exactly
    // that id. The first draft used `.eq('coach_id', currentUser.id).limit(1)` from the PT session —
    // borrowed shared data, and it is NOT the E2E client account (verified: PT's first client is a
    // different record entirely). The client happy-path test then failed, correctly, because the client
    // really did not own that goal. A test must own its fixture; "pick whatever is first" has caused
    // real flakiness here before.
    const clientCtx = await browser.newContext()
    let ownClientId = null
    try {
      const cp = await clientCtx.newPage()
      await loginAsClient(cp)
      ownClientId = await cp.evaluate(async () => await _getCurrentClientId())
    } finally { await clientCtx.close().catch(() => {}) }
    expect(ownClientId, 'the E2E client must have a clients row').not.toBeNull()

    const ctx = await browser.newContext()
    try {
      const p = await ctx.newPage()
      await loginAsPT(p)
      goalId = await p.evaluate(async ({ title, cid }) => {
        const { data } = await db.from('goals').insert({
          client_id: cid, created_by: currentUser.id, title,
          goal_type: 'custom', priority: 1, status: 'active', current_value: 1
        }).select('id').single()
        return data?.id || null
      }, { title: TAG, cid: ownClientId })
    } finally { await ctx.close().catch(() => {}) }
    expect(goalId, 'fixture goal must exist').not.toBeNull()
  })

  test.afterEach(async ({ browser }) => {
    // Name-anchored, owner-side cleanup — cannot be stranded by a failed assertion, and reaps any
    // debris a previous run left. bugs/2026-08-20-cross-tenant-probes-not-cleanup-safe.
    const ctx = await browser.newContext()
    try {
      const p = await ctx.newPage()
      await loginAsPT(p)
      await p.evaluate(async (title) => {
        const { data: gs } = await db.from('goals').select('id').eq('created_by', currentUser.id).eq('title', title)
        const ids = (gs || []).map(g => g.id)
        if (ids.length) {
          await db.from('goal_milestones').delete().in('goal_id', ids)
          await db.from('goal_check_ins').delete().in('goal_id', ids)
          await db.from('goals').delete().in('id', ids)
        }
      }, TAG).catch(() => {})
    } finally { await ctx.close().catch(() => {}) }
  })

  test('a CLIENT can still save progress on their own goal (the role-asymmetry happy path)', async ({ page }) => {
    await loginAsClient(page)
    const r = await page.evaluate(async (gid) => {
      const mk = (id) => { let e = document.getElementById(id); if (!e) { e = document.createElement('input'); e.id = id; document.body.appendChild(e) } return e }
      mk('gpf-val-' + gid).value = '42'
      const err = document.createElement('p'); err.id = 'gpf-err-' + gid; document.body.appendChild(err)
      const orig = window._renderOwnDashboard
      window._renderOwnDashboard = () => {}
      try { await saveGoalProgress(gid) } finally { window._renderOwnDashboard = orig }
      const { data } = await db.from('goals').select('current_value').eq('id', gid).maybeSingle()
      return { err: err.textContent, current: data?.current_value ?? null }
    }, goalId)

    expect(r.err, 'a client saving progress on their OWN goal must not be refused').toBe('')
    expect(Number(r.current), 'the value must actually have been written').toBe(42)
  })

  test('a client is refused on a goal that is not theirs', async ({ page }) => {
    await loginAsClient(page)
    const err = await page.evaluate(async (gid) => {
      const e = document.createElement('input'); e.id = 'gpf-val-' + gid; e.value = '99'; document.body.appendChild(e)
      const p = document.createElement('p'); p.id = 'gpf-err-' + gid; document.body.appendChild(p)
      const orig = window._renderOwnDashboard
      window._renderOwnDashboard = () => {}
      try { await saveGoalProgress(gid) } finally { window._renderOwnDashboard = orig }
      return p.textContent
    }, FOREIGN_GOAL)

    expect(err, 'the app must refuse at its own guard').toContain('permission denied')
  })

  test('toggleClientMilestone refuses a milestone whose parent goal is not the caller\'s', async ({ browser }) => {
    // HONEST SCOPE: this exercises _verifyMilestoneAccess's "milestone not visible" branch, not its
    // parent-goal-ownership branch. Verified by neutering each in turn — neutering _verifyGoalAccess
    // leaves this test GREEN; neutering the not-visible branch turns it RED (it falls through to the
    // pre-existing 'fetch failed' path).
    //
    // That is not a weakness in the guard, it is the shape of reality: for a client, a foreign
    // milestone is ALWAYS invisible first, because RLS hides the row before ownership is ever
    // computed. The deeper branch is only reachable if a caller can READ a milestone whose parent goal
    // is neither theirs nor their client record's — which no current role can do. It is kept as
    // defence for a future RLS change, and is deliberately left untested rather than pretended-tested.
    const ctx = await browser.newContext()
    try {
      const p = await ctx.newPage()
      await loginAsClient(p)
      const seen = await p.evaluate(async () => {
        const captured = []
        const orig = log.error
        log.error = (fn, msg, meta) => { captured.push(fn + '|' + msg); return orig(fn, msg, meta) }
        const origRender = window._renderOwnDashboard
        window._renderOwnDashboard = () => {}
        try {
          await toggleClientMilestone('00000000-0000-0000-0000-0000000000fd')
        } finally { log.error = orig; window._renderOwnDashboard = origRender }
        return captured.join(',')
      })
      expect(seen, 'must refuse at the milestone ownership guard, not fall through to the update')
        .toContain('toggleClientMilestone|ownership check failed')
    } finally { await ctx.close().catch(() => {}) }
  })

  test('a COACH can still toggle a milestone on a goal they created (coach happy path)', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(async (gid) => {
      const { data: m } = await db.from('goal_milestones')
        .insert({ goal_id: gid, title: '[E2E] Milestone' }).select('id, completed_at').single()
      const origOpen = window.openGoal
      window.openGoal = () => {}
      try { await toggleMilestone(m.id, gid, null) } finally { window.openGoal = origOpen }
      const { data: after } = await db.from('goal_milestones').select('completed_at').eq('id', m.id).maybeSingle()
      return { before: m.completed_at, after: after?.completed_at ?? null }
    }, goalId)

    expect(r.before, 'fixture milestone starts incomplete').toBeNull()
    expect(r.after, 'the coach toggle must still land').not.toBeNull()
  })
})
