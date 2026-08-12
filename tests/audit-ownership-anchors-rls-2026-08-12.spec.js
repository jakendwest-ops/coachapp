// 2026-08-12 — does RLS actually backstop the architecture audit's ownership-anchor findings?
//
// The audit (Vault/projects/CoachApp/architecture-audit-2026-08-12.md) filed 7 High findings whose
// severity all hinges on one unanswered question, which the audit names as its own item 6: the app-level
// code has no ownership anchor, but is RLS catching it anyway? The audit could not answer that — no RLS
// SQL is tracked in this repo — so every one of those findings is "High, UNVERIFIED".
//
// Reading policy SQL would not settle it either, even if it were here. Four real RLS gaps in this
// project's history all had normal-looking policies that simply checked the wrong column, and PostgREST
// silently returns null for an unreadable embed rather than erroring. The only method that has ever
// worked here is behavioural: log in as the wrong tenant and attempt the write.
//
// The sharpest claim, quoted from the audit: "A signed-in client could call
// saveClientWeight('<another clients uuid>') directly from devtools." This tests exactly that, plus the
// same shape on every other table the audit flagged.
//
// Outcome either way is decisive:
//   all refused -> the 7 High findings become Medium/confirmed-RLS-backstopped. Anchors still worth
//                  adding as defence-in-depth, but nothing is leaking today.
//   any accepted -> Critical, confirmed, live. Fix immediately.
//
// Fixtures: this spec plants nothing it does not remove, and asserts the victim's row count is
// unchanged at the end rather than trusting the insert's own error.
const { test, expect } = require('@playwright/test')
const { loginAsPT, loginAsClient } = require('./helpers')

const TAG = '[E2E] AnchorProbe'

test.describe('ownership-anchor findings — does RLS backstop them? (2026-08-12)', () => {
  test('a signed-in client cannot write to ANOTHER client\'s health/performance rows', async ({ page, browser }) => {
    // 1. As the PT, find a client that is NOT the E2E client — the victim.
    const ptCtx = await browser.newContext()
    let victim = null
    let victimBefore = null
    try {
      const ptPage = await ptCtx.newPage()
      await loginAsPT(ptPage)
      victim = await ptPage.evaluate(async () => {
        const { data } = await db.from('clients').select('id, user_id, coach_id').eq('coach_id', currentUser.id)
        // any client row that is NOT the one belonging to the E2E client login
        const rows = data || []
        return rows.length ? rows[rows.length - 1].id : null
      })
      if (!victim) test.skip(true, 'PT has no client to use as a victim')

      victimBefore = await ptPage.evaluate(async (v) => ({
        weight: (await db.from('weight_logs').select('id').eq('client_id', v)).data?.length ?? -1,
        oneRm: (await db.from('client_1rms').select('id').eq('client_id', v)).data?.length ?? -1,
        perf: (await db.from('performance_logs').select('id').eq('client_id', v)).data?.length ?? -1,
        checkins: (await db.from('client_check_ins').select('id').eq('client_id', v)).data?.length ?? -1,
      }), victim)
    } finally { await ptCtx.close().catch(() => {}) }

    // 2. As the CLIENT, attempt every write the audit flagged, against the victim's id.
    await loginAsClient(page)
    const attempts = await page.evaluate(async ({ victim, TAG }) => {
      const me = (await db.from('clients').select('id').eq('user_id', currentUser.id)).data?.[0]?.id
      const t = async (label, q) => {
        const { data, error } = await q
        return { label, rows: (data || []).length, refused: !!error, err: error ? error.message.slice(0, 70) : null }
      }
      return {
        myClientId: me,
        victimIsDifferent: me !== victim,
        results: [
          await t('weight_logs.insert', db.from('weight_logs')
            .insert({ client_id: victim, date: '2026-01-01', weight_kg: 999 }).select('id')),
          await t('client_1rms.insert', db.from('client_1rms')
            .insert({ client_id: victim, exercise_name: TAG, one_rm_kg: 999 }).select('id')),
          await t('performance_logs.insert', db.from('performance_logs')
            .insert({ client_id: victim, name: TAG, category: 'strength', value: 999, unit: 'kg', date: '2026-01-01' }).select('id')),
          await t('client_check_ins.insert', db.from('client_check_ins')
            .insert({ client_id: victim, sleep: 5, energy: 5, stress: 5, soreness: 5, notes: TAG }).select('id')),
          // saveWeightGoals writes the canonical clients row — the audit called this the worst of the seven.
          await t('clients.update(goal)', db.from('clients')
            .update({ goal_weight_kg: 999 }).eq('id', victim).select('id')),
        ],
      }
    }, { victim, TAG })

    console.log('victim:', victim)
    console.log('client sees itself as:', attempts.myClientId, '| different from victim:', attempts.victimIsDifferent)
    for (const r of attempts.results) {
      console.log(`  ${r.label.padEnd(26)} rows=${r.rows} refused=${r.refused} ${r.err || ''}`)
    }

    // 3. Independently confirm from the PT session — never trust the attacker's own view of the result.
    // A FRESH context for the confirmation pass. Reusing the first one raced its already-navigated
    // page and timed out on login — and an unverifiable confirmation step is worse than none.
    let after = null
    const ptCtx2 = await browser.newContext()
    try {
      const ptPage2 = await ptCtx2.newPage()
      await loginAsPT(ptPage2)
      after = await ptPage2.evaluate(async ({ v, TAG }) => ({
        weight: (await db.from('weight_logs').select('id').eq('client_id', v)).data?.length ?? -1,
        oneRm: (await db.from('client_1rms').select('id').eq('client_id', v)).data?.length ?? -1,
        perf: (await db.from('performance_logs').select('id').eq('client_id', v)).data?.length ?? -1,
        checkins: (await db.from('client_check_ins').select('id').eq('client_id', v)).data?.length ?? -1,
        plantedWeight: (await db.from('weight_logs').select('id').eq('client_id', v).eq('weight_kg', 999)).data?.length ?? -1,
        plantedTag: (await db.from('client_1rms').select('id').eq('exercise_name', TAG)).data?.length ?? -1,
      }), { v: victim, TAG })

      // Clean up anything that DID land, so a leak doesn't also leave debris.
      await ptPage2.evaluate(async ({ v, TAG }) => {
        await db.from('weight_logs').delete().eq('client_id', v).eq('weight_kg', 999)
        await db.from('client_1rms').delete().eq('exercise_name', TAG)
        await db.from('performance_logs').delete().eq('name', TAG)
        await db.from('client_check_ins').delete().eq('client_id', v).eq('notes', TAG)
      }, { v: victim, TAG })
    } finally { await ptCtx2.close().catch(() => {}) }

    console.log('victim rows before:', JSON.stringify(victimBefore))
    console.log('victim rows after :', JSON.stringify(after))

    expect(attempts.victimIsDifferent, 'probe is meaningless if the victim IS the logged-in client').toBe(true)

    // The verdict. Row counts are the authority, not the insert's own reported error.
    expect(after.weight, 'a client must not be able to add a weight log to another client').toBe(victimBefore.weight)
    expect(after.oneRm, 'a client must not be able to add a 1RM to another client').toBe(victimBefore.oneRm)
    expect(after.perf, 'a client must not be able to add a performance log to another client').toBe(victimBefore.perf)
    expect(after.checkins, 'a client must not be able to add a check-in to another client').toBe(victimBefore.checkins)
    expect(after.plantedWeight, 'no planted weight row may survive').toBe(0)
    expect(after.plantedTag, 'no planted 1RM row may survive').toBe(0)
  })
})
