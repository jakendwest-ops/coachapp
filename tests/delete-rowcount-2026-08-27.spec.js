// A policy-refused DELETE returns `{ data: [], error: null }`. An error-only guard therefore treats
// "refused" as "succeeded": the UI re-renders with the row still sitting there and the user reads it
// as "the button is broken". They tapped Delete, got no error, and the thing is still there.
//
// Three of the six user-initiated deletes had the check; three did not. Fixed 2026-08-27:
//   HAD IT      delete1RM · deletePerfLog · deleteWeightLog   (app-progress.js)
//   MISSING     deleteEvent · deleteGoal (app-calendar-goals.js) · deleteExercise (app-workouts.js)
//
// deleteGoal is the worst of the three: its confirm promises "this cannot be undone" and says it
// removes milestones and check-ins too, so a silent no-op leaves the user believing a cascade ran.
//
// DELIBERATELY NOT SWEPT: the other 23 `.delete()` calls in js/ are cascades and cleanups where zero
// rows is legitimate — deleteProgram's phase delete is correct on a programme with no phases. A
// mechanical sweep would manufacture false alarms, which is how a guard gets switched off
// (feedback_guard_risk_is_refusing_the_legitimate_user). This class is "the user asked to delete ONE
// named thing", nothing wider.
const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

test.describe('A user-initiated delete must not report success on zero rows', () => {

  // The class guard. Enumerates the functions from the shipped source rather than a hardcoded list —
  // a hardcoded inventory is how this project's last two class fixes each missed a member.
  test('every user-initiated delete pairs .select() with a rowcount check', async ({ page }) => {
    await loginAsPT(page)
    const scan = await page.evaluate(async () => {
      const html = await fetch('/index.html')
      if (!html.ok) return { fatal: 'index.html ' + html.status }
      const names = [...(await html.text()).matchAll(/src="(js\/[a-z-]+\.js)\?/g)].map(m => m[1])
      const srcs = {}
      for (const n of names) {
        const r = await fetch('/' + n)
        if (!r.ok) return { fatal: n + ' ' + r.status }
        srcs[n] = await r.text()
      }
      return { srcs, moduleCount: names.length }
    })
    expect(scan.fatal, 'the scan must not pass over an unreadable source').toBeUndefined()
    expect(scan.moduleCount, 'index.html must yield the real module list').toBeGreaterThanOrEqual(9)

    // EXEMPTIONS, each with the reason it is exempt. Polarity is deliberate: a NEW delete function
    // defaults to "must have the check", and exempting it means writing down why here. A regex
    // narrow enough to exclude these automatically would also quietly excuse a real offender.
    const EXEMPT = {
      // Multi-step cascades. A zero-row child delete is CORRECT here — deleteProgram on a programme
      // with no phases legitimately removes nothing. Sweeping these mechanically is what
      // bugs/2026-08-22-no-delete-in-the-programs-family... warns against, and a guard that flags
      // correct code is one that gets switched off.
      deleteProgram: 'cascade — zero rows is legitimate when the programme has no phases',
      deletePhase: 'cascade — same shape as deleteProgram',
      deletePhaseWeek: 'cascade — deletes week clones that may legitimately not exist',
      // Not a table delete at all.
      deleteAccountConfirmed: 'calls the delete_current_user RPC, not db.from().delete()'
    }

    // "delete<Thing>(" declared at top level = the user pressed a button to remove one named row.
    // Internal cascades are named with a leading underscore or a non-delete verb, so they are out.
    const offenders = []
    let found = 0
    let exempted = 0
    for (const [file, src] of Object.entries(scan.srcs)) {
      const lines = src.split('\n')
      lines.forEach((l, i) => {
        const m = l.match(/^async function (delete[A-Z1-9][A-Za-z0-9]*)\s*\(/)
        if (!m) return
        found++
        if (EXEMPT[m[1]]) { exempted++; return }
        const body = lines.slice(i, i + 26).join('\n')
        const hasSelect = /\.delete\(\)[\s\S]{0,220}?\.select\(/.test(body)
        const hasRowcount = /\?\.length/.test(body)
        if (!hasSelect || !hasRowcount) {
          offenders.push(`${file}:${i + 1} ${m[1]} (select:${hasSelect} rowcount:${hasRowcount})`)
        }
      })
    }
    // "all 0 of them are fine" is a switched-off checker. Thirteen exist today, 4 exempt.
    expect(found, 'the scan found NO delete<Thing> functions — it is inspecting nothing')
      .toBeGreaterThanOrEqual(13)
    // If an exemption stops matching a real function the list has gone stale and is excusing nothing
    // — or, worse, is silently excusing something it was never meant to.
    expect(exempted, 'every EXEMPT entry must still name a real function').toBe(Object.keys(EXEMPT).length)
    expect(offenders, 'a refused delete here reports success and the UI lies to the user').toEqual([])
  })

  // Behavioural: a refused delete must not be reported as done. Driven by deleting a row the current
  // user does not own — the ownership anchor makes the delete match zero rows, which is exactly the
  // shape a policy refusal produces.
  test('deleteEvent on a row this user does not own reports failure, not success', async ({ page }) => {
    await loginAsPT(page)
    let ids = null
    try {
      ids = await page.evaluate(async () => {
        // Column is `date`, not `event_date` — matched to the real insert at
        // js/app-calendar-goals.js:403 rather than guessed.
        const { data: ev, error } = await db.from('events')
          .insert({
            title: '[E2E] rowcount ' + Date.now(),
            date: new Date().toISOString().split('T')[0],
            type: 'session', is_pt_assigned: true, created_by: currentUser.id
          })
          .select('id').single()
        if (error) return { fatal: 'fixture insert failed: ' + error.message }
        return { eventId: ev.id }
      })
      expect(ids.fatal, 'the fixture must have been created').toBeUndefined()
      const out = await page.evaluate(async i => {
        // Force the zero-row case the way a policy refusal would: keep the id, break the owner anchor.
        const realUid = currentUser.id
        currentUser = { ...currentUser, id: '00000000-0000-0000-0000-000000000000' }
        const toasts = []
        const realToast = window.showToast
        window.showToast = (msg, kind) => toasts.push({ msg, kind })
        const realConfirm = window.confirm
        window.confirm = () => true
        try { await deleteEvent(i.eventId) } catch (e) { /* surfaced via toasts below */ }
        finally {
          window.confirm = realConfirm
          window.showToast = realToast
          currentUser = { ...currentUser, id: realUid }
        }
        const { data: still } = await db.from('events').select('id').eq('id', i.eventId)
        return { toasts, stillThere: (still || []).length }
      }, ids)
      expect(out.stillThere, 'the row must still exist — that is the premise of the test').toBe(1)
      expect(out.toasts.some(t => t.kind === 'error'),
        'THE BUG: a refused delete returned {data:[],error:null} and the UI said nothing').toBe(true)
    } finally {
      if (ids) await page.evaluate(async i => {
        await db.from('events').delete().eq('id', i.eventId)
      }, ids)
    }
  })
})
