// An RLS denial must not become "it's mine".
//
// `_effectiveCoachIdForClient` used to end `|| currentUser.id`. A client row the database REFUSED to
// return comes back as 0 rows, so `data` is null — and that tail turned the refusal into the current
// user's own id, indistinguishable from a genuine solo record whose coach_id is legitimately NULL.
//
// It matters because one caller writes. `saveOneRMGrid` hands this value to `_resolveExerciseIdForSave`,
// which INSERTs into `exercises` — so a foreign client's lift name could become a permanent row in the
// current user's own exercise library.
//
// app-core.js names this function as the anti-model `_verifyClientAccess` was written against, and
// saveRunnerSession documents the same rule verbatim: "MUST fail loud, not fall back to currentUser.id".

const { test, expect } = require('@playwright/test')
const { loginAsPT } = require('./helpers')

test.describe('_effectiveCoachIdForClient fails loud (2026-09-04)', () => {
  test('an unreadable client id resolves to null, never to the current user', async ({ page }) => {
    await loginAsPT(page)

    const r = await page.evaluate(async () => {
      // A well-formed uuid that does not exist. To this client it is indistinguishable from a row that
      // exists but RLS refuses — both come back as zero rows, which is the whole point.
      const ghost = '00000000-0000-4000-8000-000000000000'
      return {
        me: currentUser.id,
        forGhost: await _effectiveCoachIdForClient(ghost)
      }
    })

    // THE ASSERTION. Before the fix this returned r.me — a denial silently reported as ownership.
    expect(r.forGhost, 'an unreadable client must resolve to null, not to my own id').toBeNull()
    expect(r.forGhost).not.toBe(r.me)
  })

  test('a REAL client still resolves — the guard must not refuse the legitimate case', async ({ page }) => {
    await loginAsPT(page)

    const r = await page.evaluate(async () => {
      const out = { created: false, resolved: null, expected: null, cleanup: 0 }
      const { data: c } = await db.from('clients')
        .insert({ coach_id: currentUser.id, full_name: `[E2E] resolver ${Date.now()}` })
        .select('id, coach_id').single()
      if (!c?.id) return out
      out.created = true
      out.expected = c.coach_id
      try {
        out.resolved = await _effectiveCoachIdForClient(c.id)
      } finally {
        const { data: gone } = await db.from('clients')
          .delete().eq('id', c.id).eq('coach_id', currentUser.id).select('id')
        out.cleanup = (gone || []).length
      }
      return out
    })

    expect(r.created, 'the fixture must exist for this to assert anything').toBe(true)
    // The false-refusal half. A guard whose real risk is refusing the legitimate user needs this as
    // much as it needs the refusal above — this project has broken "View as" exactly that way before.
    expect(r.resolved, 'a readable client must still resolve to its coach_id').toBe(r.expected)
    expect(r.cleanup, 'the fixture must be deleted, and the delete must be seen').toBe(1)
  })

  test('the solo shape still resolves via user_id, which is a real answer and not a guess', async ({ page }) => {
    await loginAsPT(page)
    // Solo's coach_id is legitimately NULL, so `|| user_id` is a genuine resolution — that clause STAYS.
    // Only the trailing `|| currentUser.id` was removed. Asserted against the source so the distinction
    // cannot be lost in a later cleanup that "simplifies" the chain.
    const src = await page.evaluate(async () => (await fetch('js/app-workouts.js')).text())
    const fn = /async function _effectiveCoachIdForClient[\s\S]*?\n\}/.exec(src)
    expect(fn, 'the resolver must exist').toBeTruthy()
    const code = fn[0].split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n')
    expect(code, 'the solo clause must survive').toContain('user_id')
    expect(code, 'the currentUser.id fallback must NOT come back').not.toMatch(/\|\|\s*currentUser\.id/)
  })
})
