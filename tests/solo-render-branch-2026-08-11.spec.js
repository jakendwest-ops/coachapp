// 2026-08-11 — four post-write render callbacks had a client branch and no solo branch.
//
// The live break: toggleClientMilestone (app-calendar-goals.js) unconditionally called
// renderClientDashboard, but the milestone chips it powers are rendered on BOTH dashboards —
// app-dashboard.js:424 (client) and :753 (SOLO). A solo user tapping any milestone landed in
// renderClientDashboard, whose coached-record lookup finds nothing for a `coach_id IS NULL` row, so
// the whole page became "Unable to load your profile. Please contact your coach."
//
// Three siblings shared the shape and are fixed with it (fix the class, not the instance):
// saveGoalProgress, saveClientCheckIn (app-clients.js), saveWorkoutSession (app-runner.js). Those
// three are not solo-reachable *today* only because solo is missing the affordances that call them —
// which the refinement programme's parity pass is about to add. Fixing them now stops that pass
// silently reintroducing this crash.
//
// The correct pattern already existed in saveClientPB/saveClientWeight (app-clients.js):
//   role === 'solo' ? renderSoloDashboard(...) : renderClientDashboard(...)
const { test, expect } = require('@playwright/test')
const { loginAsPT } = require('./helpers')

const TAG = '[E2E] SoloBranch'

async function sweep (page) {
  await page.evaluate(async (TAG) => {
    const { data: goals } = await db.from('goals').select('id').like('title', TAG + '%')
    const ids = (goals || []).map(g => g.id)
    if (ids.length) {
      await db.from('goal_milestones').delete().in('goal_id', ids)
      await db.from('goals').delete().in('id', ids)
    }
  }, TAG)
}

test.describe('solo render branches (2026-08-11)', () => {
  test('a solo user toggling a goal milestone stays on the solo dashboard', async ({ page }) => {
    await loginAsPT(page)

    const soloId = await page.evaluate(() => window._soloClientId || null)
    test.skip(!soloId, 'This PT account has no solo client record')

    await sweep(page)

    // The milestone deliberately belongs to a COACHED client, not the solo record. Two reasons:
    // (a) the bug under test is purely the RENDER DISPATCH at the end of toggleClientMilestone --
    //     which dashboard it repaints -- and that does not depend on whose milestone it is; and
    // (b) the goals INSERT policy currently REFUSES a row whose client_id is the solo record
    //     (coach_id IS NULL), so a solo-owned goal cannot be created at all right now. That is a
    //     separate, real finding logged for Jake -- it is not this test's subject, and working
    //     around it here keeps this test about the crash rather than blocked behind an RLS fix.
    const fx = await page.evaluate(async (TAG) => {
      const { data: coached } = await db.from('clients').select('id')
        .eq('coach_id', currentUser.id).limit(1)
      const clientId = coached?.[0]?.id
      if (!clientId) return { fail: 'no coached client available' }
      const { data: goal, error: ge } = await db.from('goals').insert({
        client_id: clientId, created_by: currentUser.id, title: TAG + ' Goal',
        goal_type: 'strength', priority: 1, status: 'active'
      }).select('id').single()
      if (ge) return { fail: 'goals: ' + ge.message }
      const { data: ms, error: me } = await db.from('goal_milestones').insert({
        goal_id: goal.id, title: TAG + ' Milestone'
      }).select('id').single()
      if (me) return { fail: 'goal_milestones: ' + me.message }
      return { goalId: goal.id, milestoneId: ms.id }
    }, TAG)
    if (fx.fail) { console.log('FIXTURE FAILED:', fx.fail) }
    expect(fx.fail).toBeFalsy()

    try {
      // Switch into Personal view and land on the solo dashboard.
      await page.evaluate(() => switchView('solo'))
      await page.waitForTimeout(1800)

      const result = await page.evaluate(async (milestoneId) => {
        await toggleClientMilestone(milestoneId)
        await new Promise(r => setTimeout(r, 1200))
        const txt = document.getElementById('main-content')?.innerText || ''
        return {
          brokenProfileError: txt.includes('Unable to load your profile'),
          contactYourCoach: txt.includes('contact your coach'),
          snippet: txt.slice(0, 120),
        }
      }, fx.milestoneId)

      console.log('after toggle:', JSON.stringify(result))

      // The crash: renderClientDashboard's coached-record lookup fails for a coach_id IS NULL row.
      expect(result.brokenProfileError).toBe(false)
      expect(result.contactYourCoach).toBe(false)
    } finally {
      await page.evaluate(() => { try { switchView('coach') } catch (e) {} })
      await page.waitForTimeout(800)
      await sweep(page)
    }
  })
})
