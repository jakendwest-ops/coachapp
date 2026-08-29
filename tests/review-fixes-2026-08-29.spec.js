const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')
const fs = require('fs')
const path = require('path')

// ─── Fixes from the 2026-08-29 weekly full-file review ──────────────────────────
//
// Two findings, two DIFFERENT kinds of test, and the difference is the point:
//
//  1. _resolveEditableTemplateId repointed a slot whose id nothing verified. That IS constructible
//     behaviourally with my own mismatched ids — RLS permits both rows, so the only thing between the
//     call and the wrong row being written is the pair anchor. Same design as
//     program-ownership-anchors-2026-08-22.spec.js, and for the same stated reason: a CROSS-TENANT
//     refusal test would pass with the guard deleted, because RLS already refuses that.
//
//  2. saveRunnerSession / saveWorkoutSession proved the clients row was READABLE, not OURS. That one
//     is NOT constructible behaviourally today: RLS already refuses a read of a foreign clients row,
//     so there is no "readable but not mine" id to pass. Writing a behavioural test anyway would be a
//     test that passes with the fix removed — decorative. So it is a CLASS guard over the source
//     instead, ratcheted, and the comment says why. Being honest about which kind of evidence is
//     available beats manufacturing the wrong kind.

test.describe('review fixes 2026-08-29', () => {
  const PREFIX = '[E2E] RevFix0829'
  const tag = PREFIX + ' ' + Date.now()

  test.afterEach(async ({ page }) => {
    await page.evaluate(async (p) => {
      // Rowcount-checked: a refused delete returns { data: [], error: null } and would report success
      // while leaving fixtures behind. Owner-anchored and by NAME, never by captured id, so a failed
      // run cannot strand rows (bugs/2026-08-20-cross-tenant-probes-not-cleanup-safe).
      const { data: progs } = await db.from('programs')
        .delete().eq('coach_id', currentUser.id).like('name', p + '%').select('id')
      if (!(progs || []).length) console.error('CLEANUP: no fixture programs reaped for', p)
      const { data: tmpls } = await db.from('workout_templates')
        .delete().eq('coach_id', currentUser.id).like('name', p + '%').select('id')
      if (!(tmpls || []).length) console.error('CLEANUP: no fixture templates reaped for', p)
    }, PREFIX).catch(() => {})
  })

  // ── Finding A1 ────────────────────────────────────────────────────────────────
  test('_resolveEditableTemplateId refuses a slot pointing at a different template of my own', async ({ page }) => {
    await loginAsPT(page)

    const fx = await page.evaluate(async (t) => {
      const mkT = async (name) => (await db.from('workout_templates')
        .insert({ coach_id: currentUser.id, name }).select('id').single()).data
      const tA = await mkT(t + ' TplA')       // the template we will "edit" — must sit in >1 slot
      const tB = await mkT(t + ' TplB')       // an unrelated template of mine

      const { data: prog } = await db.from('programs')
        .insert({ coach_id: currentUser.id, is_personal: false, name: t + ' Prog' }).select('id').single()
      const { data: phase } = await db.from('program_phases')
        .insert({ program_id: prog.id, name: 'P1', duration_weeks: 4, order_index: 0 }).select('id').single()

      // Column shape read from the app, not guessed: _quickAssignPhaseWorkout (app-programs.js:2550)
      // and the sibling spec both write { phase_id, day_of_week, day_label, template_id,
      // session_order, week_number }. day_of_week is 1-based (Monday = 1) everywhere it is stored.
      const DAYS = [null, 'Monday', 'Tuesday', 'Wednesday']
      const mkSlot = async (templateId, day) => (await db.from('program_phase_workouts')
        .insert({ phase_id: phase.id, day_of_week: day, day_label: DAYS[day], template_id: templateId, session_order: 0, week_number: 1 })
        .select('id').single()).data

      // TplA must occupy TWO slots, or _resolveEditableTemplateId returns early at its count <= 1
      // check and the write under test never runs — the test would pass vacuously.
      const a1 = await mkSlot(tA.id, 1)
      const a2 = await mkSlot(tA.id, 2)
      const bSlot = await mkSlot(tB.id, 3)    // ← the mismatched slot we will claim

      return { tA: tA?.id, tB: tB?.id, a1: a1?.id, a2: a2?.id, bSlot: bSlot?.id }
    }, tag)

    expect(fx.tA && fx.tB && fx.a1 && fx.a2 && fx.bSlot,
      'fixtures must exist before the probe means anything').toBeTruthy()

    // Non-zero denominator: prove TplA really does sit in >1 slot, so the fork path is reached.
    const slotCount = await page.evaluate(async (f) => (await db.from('program_phase_workouts')
      .select('id', { count: 'exact', head: true }).eq('template_id', f.tA)).count, fx)
    expect(slotCount, 'TplA must sit in >1 slot or the function returns before the write under test').toBeGreaterThan(1)

    const result = await page.evaluate(async (f) => {
      // Claim a slot that points at TplB, while asking to fork TplA.
      window._templateCtx = { phaseWorkoutId: f.bSlot, isClientPlan: false }
      const resolved = await _resolveEditableTemplateId(f.tA)
      const { data: after } = await db.from('program_phase_workouts')
        .select('template_id').eq('id', f.bSlot).maybeSingle()
      return { resolvedId: resolved?.templateId, bSlotPointsAt: after?.template_id }
    }, fx)

    // THE load-bearing assertion. Without .eq('template_id', templateId) on the update, the repoint
    // keys on the slot id alone, RLS allows it (every row here is mine), and TplB's slot is silently
    // repointed at a clone of TplA — the user's Tuesday workout becomes a copy of Monday's.
    expect(result.bSlotPointsAt, "the mismatched slot must NOT be repointed — it points at a different template")
      .toBe(fx.tB)

    // And the caller must fall back to the original id rather than returning a clone id that is in no
    // slot at all, which would send every subsequent edit into a template nothing renders.
    expect(result.resolvedId, 'a refused repoint must fall back to the original template id').toBe(fx.tA)
  })

  // ── Finding C2 ────────────────────────────────────────────────────────────────
  //
  // No network, no fixtures: this drives the MECHANISM. A double-tapped ▶ Start used to run
  // _startFreshRunner twice, and because :47 assigns a NEW _runner the first call's 1 Hz interval
  // became unreachable and ticked for the life of the page. Counting real timer ids is the only way
  // to see that — the UI looks identical either way, which is why it survived this long.
  test('a double-invoked launchRunner leaves exactly one live interval', async ({ page }) => {
    await loginAsPT(page)

    const result = await page.evaluate(async () => {
      // Count live intervals by wrapping the timer functions. setInterval/clearInterval are the only
      // things that can create or destroy one, so a wrapper sees every id with no guesswork.
      const live = new Set()
      const realSet = window.setInterval, realClear = window.clearInterval
      window.setInterval = function (...a) { const id = realSet.apply(this, a); live.add(id); return id }
      window.clearInterval = function (id) { live.delete(id); return realClear.call(this, id) }

      // Stub _startFreshRunner's slow half so this needs no DB: keep the two things that matter —
      // it SUSPENDS (so the guard has a window to hold across), and it starts the timer tick.
      const realFresh = window._startFreshRunner
      window._startFreshRunner = async function (clientId) {
        await new Promise(r => setTimeout(r, 60))          // the round-trip the button stays live across
        // BARE assignment, not window._runner: _runner is `let _runner = null` (app-workouts.js:3140),
        // a lexical binding that never becomes a window property. window._runner would be a different
        // slot the code never reads — which is exactly how this test failed on first write.
        _runner = { startTime: Date.now(), exercises: [], clientId }
        _startRunnerTimerTick()
      }
      window._loadRunnerDraft = () => null                  // force the fresh path, not the resume path

      try {
        // Both presses fired before the first resolves — exactly a hard double-tap.
        await Promise.all([launchRunner('probe-client'), launchRunner('probe-client')])
        await new Promise(r => setTimeout(r, 40))
        const liveCount = live.size
        // Tear down whatever survived so the probe cannot leak into later tests.
        for (const id of Array.from(live)) realClear.call(window, id)
        return { liveCount }
      } finally {
        window.setInterval = realSet
        window.clearInterval = realClear
        window._startFreshRunner = realFresh
        _runner = null
      }
    })

    // Without guardReentry('launchRunner') both presses run, the second overwrites _runner, and the
    // first interval is orphaned — liveCount is 2 and nothing can ever clear the first.
    expect(result.liveCount, 'a double-tapped Start must leave exactly one live interval — the second '
      + 'press overwrites _runner, so any interval the first press started can never be cleared again')
      .toBe(1)
  })

  // ── Finding C1 ────────────────────────────────────────────────────────────────
  //
  // Drives the REAL editRunnerSet / saveEditRunnerSet against a real cardio round, with no stubbing
  // of either — a test that re-typed the save logic would pass whether or not the source is fixed
  // (the decorative-test class). The sheet is opened, the field is typed into, Save is pressed.
  test('editing a logged cardio round actually saves — the Save button is not dead', async ({ page }) => {
    await loginAsPT(page)

    const result = await page.evaluate(async () => {
      // A duration-based cardio round, exactly the shape logRunnerSet writes at :986.
      _runner = {
        startTime: Date.now(), exIdx: 0, clientId: 'probe',
        exercises: [{ name: 'Skierg', type: 'cardio', loggedSets: [{ duration: '2:00', distanceM: '400' }] }]
      }

      editRunnerSet(0, 0)
      const sheetOpened = !!document.getElementById('wr-edit-overlay')
      // The cardio branch must render TIME/DISTANCE, not the weight/reps pair that made Save dead.
      const hasDuration = !!document.getElementById('wr-edit-duration')
      const hasReps     = !!document.getElementById('wr-edit-reps')
      const prefilled   = document.getElementById('wr-edit-duration')?.value

      document.getElementById('wr-edit-duration').value = '3:30'
      document.getElementById('wr-edit-distance').value = '750'
      saveEditRunnerSet(0, 0)

      const after = _runner.exercises[0].loggedSets[0]
      const stillOpen = !!document.getElementById('wr-edit-overlay')
      _runner = null
      return { sheetOpened, hasDuration, hasReps, prefilled, after, stillOpen }
    })

    expect(result.sheetOpened, 'the edit sheet must mount').toBe(true)
    expect(result.hasDuration, 'a cardio round must get a Time field').toBe(true)
    expect(result.hasReps, 'a cardio round must NOT get the Reps field — no cardio set shape carries reps, '
      + 'which is what made Save hit its bare `return` every time').toBe(false)
    expect(result.prefilled, 'the sheet must prefill from the logged round').toBe('2:00')

    // THE load-bearing assertion. Before the fix this was still 2:00 / 400 — Save read wr-edit-reps,
    // found it absent, and returned with no toast and no change.
    expect(result.after.duration, 'the edited time must persist').toBe('3:30')
    expect(result.after.distanceM, 'the edited distance must persist').toBe('750')
    expect(result.stillOpen, 'a successful save must close the sheet').toBe(false)
  })

  // ── Finding A2 ────────────────────────────────────────────────────────────────
  test('every client-scoped writer in app-runner calls _verifyClientAccess', async () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app-runner.js'), 'utf8')

    // The four writers that take a clientId and write rows attributed to that client. Before
    // 2026-08-29 only the two 1RM writers used the ownership helper; the two SAVE paths used a
    // readability check and were the finding.
    const WRITERS = ['saveRunnerSession', 'saveWorkoutSession', '_savePostSessionOneRM', 'saveRunnerOneRM']

    // COMMENTS ARE STRIPPED, and this is load-bearing. Verified 2026-08-29 by neutering: with the
    // guard replaced by `if (false)`, this test still PASSED — because the explanatory comment above
    // the call also contains the string "_verifyClientAccess". A scanner that reads prose as code is
    // decorative, and it is the SECOND time in two days I wrote one (the guardReentry class test had
    // the identical bug on 2026-08-28, caught the same way). Strip first, then match.
    const stripComments = s => s.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')

    const bodyOf = (name) => {
      const start = src.indexOf(`async function ${name}(`)
      if (start < 0) return null
      // Next top-level `async function` / `function` declaration marks the end.
      const rest = src.slice(start + 10)
      const nextIdx = rest.search(/\n(?:async )?function \w+\(/)
      return stripComments(nextIdx < 0 ? rest : rest.slice(0, nextIdx))
    }

    const missing = []
    for (const w of WRITERS) {
      const body = bodyOf(w)
      expect(body, `${w} must still exist — a renamed writer must not silently leave this list`).toBeTruthy()
      if (!body.includes('_verifyClientAccess')) missing.push(w)
    }

    // Non-zero denominator: a list that silently emptied would pass without asserting anything.
    expect(WRITERS.length, 'the writer list must not be empty').toBeGreaterThan(3)

    expect(missing, 'these writers attribute rows to a clientId without an OWNERSHIP check — a readable '
      + 'clients row is not an owned one, and _verifyClientAccess is the shared helper that asserts it')
      .toEqual([])
  })
})
