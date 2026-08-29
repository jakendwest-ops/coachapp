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
