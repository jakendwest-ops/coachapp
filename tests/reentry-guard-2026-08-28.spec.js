// Jake, live 2026-08-28: "adding new exercises takes ages to load, and if you press the button more
// than once it duplicates the exercise several times".
//
// saveExerciseToTemplate (js/app-workouts.js) closes its modal AFTER every await, so the confirm
// button stays live and tappable for the whole multi-second chain. It is also a non-atomic
// select-max-then-insert: two presses read the same max order_index and both insert.
//
// NO DATABASE CONSTRAINT CAN CLOSE THIS. UNIQUE(template_id, exercise_name) would refuse legitimate
// work — a template may list the same exercise twice with different set schemes, contemplated in the
// source at js/app-workouts.js:2262. UNIQUE(template_id, order_index) would break
// moveTemplateExercise, which reorders via two sequential updates through a transient collision.
// So the client-side guard is the ONLY available defence, not a convenience layer.
//
// This class has already caused live damage: scripts/fix_session_order.cjs (2026-06-25) is a manual
// service-key repair script whose step 1 is "Find duplicate templates (same name, same coach,
// created today)".
//
// ENUMERATION IS BY INSERT, NOT BY onclick=. A scan of literal onclick strings provably MISSES
// saveExerciseToTemplate: its handler is assembled in a variable (js/app-workouts.js:1815-1817) and
// only interpolated at :1876. An onclick-based test would have declared today's bug out of scope.
const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

// Every inserter NOT guarded, each with the reason it is safe to leave. This is a RATCHET, not a
// to-do list: the assertion below requires the real unguarded set to EQUAL this exactly, so a NEW
// unguarded inserter goes red, AND guarding one without delisting it also goes red.
//
// The criterion for guarding (all three required):
//   (a) it INSERTs a new row — a double-tapped UPDATE or DELETE keyed by id is idempotent;
//   (b) no DB constraint can reject the duplicate;
//   (c) the chain is slow enough that a human taps twice AND the duplicate is costly to undo.
const FROZEN_UNGUARDED = {
  // ── Internal helpers: only ever run INSIDE an already-guarded entry point. Guarding them would
  //    guard the same gesture twice and add a second flag that can disagree with the first.
  _archiveAssignmentBlock:            'internal — runs inside saveAssignProgram* (already guarded)',
  _cloneTemplateForClient:            'internal — runs inside the assign/clone/periodization callers',
  _cloneProgramForClient:             'internal — runs inside saveAssignProgram* (already guarded)',
  _saveMissingOneRMEntries:           'internal — runs inside the assign flow after it has succeeded',
  _resolveExerciseIdForSave:          'internal — runs inside saveOneRMGrid / the Big-5 quick form',
  _propagateExerciseChangeToTemplates:'internal — runs inside _applyToAllSessions after a guarded save',
  _cloneSharedMasterTemplate:         'internal — runs inside _resolveEditableTemplateId',
  _seedStarterContent:                'internal — runs once from loadUserInfo on first login, no button',

  // ── Confirm-gated: a native confirm() blocks the main thread, so the second tap cannot start
  //    until the first has been accepted. The dialog IS the re-entry barrier.
  generatePhasePeriodization:         'confirm()-gated before any write — the dialog blocks re-entry',

  // ── Single-row modal saves. The modal closes on success and the row appears immediately in a list
  //    the user is already looking at, so a duplicate is visible and one tap to delete. Fails (c).
  saveEvent:                          'one row, modal closes, immediately visible and deletable',
  saveClientEvent:                    'one row, modal closes, immediately visible and deletable',
  saveNewGoal:                        'one row, modal closes, immediately visible and deletable',
  saveNewMilestone:                   'one row, appears in the goal detail list, deletable',
  saveCheckIn:                        'one row, appears in the goal detail list, deletable',
  saveClientPB:                       'one row, appears in the PB list, deletable',
  saveClientCheckIn:                  'one row, appears in the check-in list, deletable',
  saveClientWeight:                   'one row, appears in the weight history, deletable',
  saveNewClient:                      'one row, lands in the client list, deletable',
  saveProgram:                        'one row, lands in the programs list, deletable',
  savePhase:                          'one row, appears in the builder immediately, deletable',
  save1RM:                            'one row, client_1rms is append-only by design, deletable',
  savePerformanceLog:                 'one row, appears in the log list, deletable',
  saveWeightLog:                      'one row, appears in the weight history, deletable',

  // ── The runner/session-save category USED to live here, under one shared justification:
  //    "each is reached from a screen that is torn down on success, so the button does not survive the
  //    first press to be pressed again." That reasoning was FALSE for all three, and the weekly
  //    full-file review caught it on 2026-08-29. In every one the teardown runs AFTER the awaits —
  //    precisely the window a second press lands in — and none disabled its button. The claimed
  //    "twin", saveRunnerSession, disables synchronously at app-runner.js:2336 before its first await,
  //    which is the difference the word "twin" was hiding.
  //
  //    _savePostSessionOneRM, saveRunnerOneRM and saveWorkoutSession are now GUARDED and appear in
  //    MUST_BE_GUARDED below. Left as a comment rather than deleted, because the failure mode worth
  //    remembering is not the three functions — it is that ONE plausible sentence exempted a whole
  //    category, and nothing checked it against the code for four days.
}

// Phase-1 members: guarded in this commit. Named here so the test states the intended set rather
// than inferring it, and so removing a guard fails loudly.
const MUST_BE_GUARDED = [
  'saveExerciseToTemplate',   // the reported bug
  'saveNewTemplate',          // double-tap = two templates AND two day slots (fix_session_order.cjs)
  'saveNewExercise',          // duplicates land in the picker Jake is already complaining about
  '_quickAssignPhaseWorkout', // check-then-insert on a day slot
  'duplicatePhaseWeek',       // double-tap duplicates an entire training week
  'copyProgramToCoaching',    // 100-line deep copy, NOT confirm-gated — found by applying the criterion
  '_createExerciseFromPicker', // already guarded, but by the strandable form — converted

  // ── Added 2026-08-29 by the weekly full-file review, all three moved out of FROZEN_UNGUARDED.
  //    Their shared exemption ("torn down on success") described what happens AFTER the awaits.
  'saveWorkoutSession',       // double-tap = TWO workout_logs rows plus their exercises and sets
  'saveRunnerOneRM',          // double-tap = two identical client_1rms rows; modal .remove() is after
  '_savePostSessionOneRM'     // same; the psorm-row-N .remove() is after both awaits

  // NOT added: launchRunner. It IS guarded (app-runner.js), but it inserts nothing, so it is invisible
  // to the enumeration below and listing it here would assert membership of a set it is not in. That
  // gap is the point — see bugs/2026-08-29-runner-timer-interval-leaks-on-a-double-tapped-start:
  // "a double press causes damage" is a strictly wider set than "a double press inserts a row".
]

async function readModules (page) {
  return page.evaluate(async () => {
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
}

// One definition of "is this function an inserter, and is it guarded", used by every assertion below
// so they cannot drift apart.
function scanInserters (srcs) {
  const all = []
  for (const [file, src] of Object.entries(srcs)) {
    const lines = src.split('\n')
    lines.forEach((l, i) => {
      const m = l.match(/^async function ([A-Za-z_][A-Za-z0-9_]*)\s*\(/)
      if (!m) return
      let end = i + 1
      while (end < lines.length && !/^(async )?function /.test(lines[end])) end++
      const body = lines.slice(i, end).join('\n')
      if (!/db\.from\([^)]*\)[\s\S]{0,200}?\.insert\(/.test(body)) return
      const guarded = /\.disabled\s*=\s*true/.test(body)
        || new RegExp(`guardReentry\\(['"]${m[1]}['"]\\)`).test(src)
      all.push({ file, line: i + 1, name: m[1], guarded })
    })
  }
  return all
}

test.describe('A double-pressed write must not insert twice', () => {

  test('every inserter is either guarded or on the frozen list, with a written reason', async ({ page }) => {
    await loginAsPT(page)
    const scan = await readModules(page)
    expect(scan.fatal, 'the scan must not pass over an unreadable source').toBeUndefined()
    expect(scan.moduleCount, 'index.html must yield the real module list').toBeGreaterThanOrEqual(9)

    const found = scanInserters(scan.srcs)
    // "all 0 inserters are fine" is a switched-off checker. 37 exist today.
    expect(found.length, 'the scan found no inserters — it is inspecting nothing').toBeGreaterThanOrEqual(37)

    for (const name of MUST_BE_GUARDED) {
      const fn = found.find(f => f.name === name)
      expect(fn, `${name} must still exist as an inserter`).toBeTruthy()
      expect(fn.guarded, `${name} is a phase-1 member and must be guarded`).toBe(true)
    }

    // The ratchet, both directions.
    const unguarded = found.filter(f => !f.guarded).map(f => f.name).sort()
    const frozen = Object.keys(FROZEN_UNGUARDED).sort()
    expect(unguarded,
      'an unguarded inserter is not on the frozen list (new one?), or a listed one is now guarded '
      + 'and must be delisted — the list may not rot').toEqual(frozen)

    // A frozen entry that no longer names a real function is excusing nothing.
    const names = new Set(found.map(f => f.name))
    expect(frozen.filter(n => !names.has(n)),
      'every FROZEN_UNGUARDED entry must still name a real inserter').toEqual([])
  })

  test('no bespoke in-flight flag remains — the release must live in one try/finally', async ({ page }) => {
    await loginAsPT(page)
    const scan = await readModules(page)
    expect(scan.fatal).toBeUndefined()
    const offenders = []
    for (const [file, src] of Object.entries(scan.srcs)) {
      src.split('\n').forEach((l, i) => {
        if (/^let\s+_[A-Za-z0-9_]*Pending\s*=\s*false/.test(l)) offenders.push(`${file}:${i + 1}`)
      })
    }
    // Red today: three exist and only ONE uses try/finally. The other two release on the happy path
    // only, so an unexpected rejection strands them `true` and silently kills that button for the
    // rest of the session. One shared guard with one finally makes that impossible by construction.
    expect(offenders, 'a hand-rolled in-flight flag owns its own release path and will be got wrong')
      .toEqual([])
  })

  test('every guardReentry() call names a function that actually exists', async ({ page }) => {
    await loginAsPT(page)
    const scan = await readModules(page)
    expect(scan.fatal).toBeUndefined()
    const declared = new Set()
    const registered = []
    for (const src of Object.values(scan.srcs)) {
      for (const m of src.matchAll(/^(?:async )?function ([A-Za-z_][A-Za-z0-9_]*)\s*\(/gm)) declared.add(m[1])
      // Skip COMMENT lines. app-core.js's own doc comment contains guardReentry('name'), and the
      // first version of this scan counted that prose as a real registration — a scanner reading
      // documentation as code, which is the same shape as the bug it is here to catch.
      for (const line of src.split('\n')) {
        if (/^\s*(\/\/|\*)/.test(line)) continue
        for (const m of line.matchAll(/guardReentry\(['"]([A-Za-z_][A-Za-z0-9_]*)['"]\)/g)) registered.push(m[1])
      }
    }
    // A typo here leaves the path unguarded while LOOKING guarded, which is worse than no guard.
    expect(registered.filter(n => !declared.has(n)),
      'guardReentry() names a function that does not exist — silently unguarded').toEqual([])
    expect(registered.length, 'no guardReentry registrations found at all').toBeGreaterThanOrEqual(7)
  })

  // THE BUG ITSELF, deterministic — no throttling, no timing, no flake.
  test('two concurrent saveExerciseToTemplate calls insert exactly ONE exercise', async ({ page }) => {
    await loginAsPT(page)
    let ids = null
    try {
      ids = await page.evaluate(async () => {
        const tag = '[E2E] reentry ' + Date.now()
        const { data: t, error } = await db.from('workout_templates')
          .insert({ coach_id: currentUser.id, name: tag, is_personal: false }).select('id').single()
        if (error) return { fatal: error.message }
        return { templateId: t.id, tag }
      })
      expect(ids.fatal, 'fixture template must have been created').toBeUndefined()

      const out = await page.evaluate(async i => {
        // Drive the REAL save path twice concurrently — exactly what a double-tap produces.
        window._exerciseDetailPicked = { name: i.tag + ' Lift', id: null, metric_type: 'weight_reps' }
        window._templateSets = [{ repsMin: '8', weight: '60' }]
        window._templateCtx = {}
        const mk = (id, tag2 = 'div') => {
          let e = document.getElementById(id)
          if (!e) { e = document.createElement(tag2); e.id = id; document.body.appendChild(e) }
          return e
        }
        // The REAL inputs saveExerciseToTemplate reads unguarded: att-type (.value), att-notes
        // (.value.trim()), att-superset (optional-chained). Omitting them makes the function throw
        // BEFORE the insert — which is how the first version of this test went red for the wrong
        // reason and looked like it had reproduced the duplicate when it had reproduced nothing.
        mk('att-error', 'p'); mk('add-to-template-modal'); mk('att-sets-container')
        const sel = mk('att-type', 'select'); sel.innerHTML = '<option value="weight_reps">w</option>'
        sel.value = 'weight_reps'
        mk('att-notes', 'textarea').value = ''
        mk('att-superset', 'input').value = ''
        await Promise.all([
          saveExerciseToTemplate(i.templateId).catch(e => e),
          saveExerciseToTemplate(i.templateId).catch(e => e)
        ])
        await new Promise(r => setTimeout(r, 1500))
        const { data: rows } = await db.from('workout_template_exercises')
          .select('id, exercise_name').eq('template_id', i.templateId)
        return { rows: rows || [] }
      }, ids)

      // Exactly one — and it must be the RIGHT one, so a guard that swallows BOTH calls also fails.
      expect(out.rows.length,
        'THE BUG: a double press inserted the exercise more than once').toBe(1)
      expect(out.rows[0].exercise_name, 'the surviving row must be the exercise that was added')
        .toBe(ids.tag + ' Lift')
    } finally {
      if (ids && ids.templateId) await page.evaluate(async i => {
        await db.from('workout_template_exercises').delete().eq('template_id', i.templateId)
        await db.from('workout_templates').delete().eq('id', i.templateId)
      }, ids)
    }
  })

  // The two properties of the MECHANISM itself, with no network and no real write path involved —
  // so a failure here points at guardReentry, not at any one caller.
  test('the guard blocks re-entry, gives feedback, and cannot strand its flag on a throw', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(async () => {
      let slowRuns = 0, throwRuns = 0
      window.__probeSlow = async () => { slowRuns++; await new Promise(r2 => setTimeout(r2, 250)) }
      window.__probeThrow = async () => { throwRuns++; throw new Error('boom') }
      guardReentry('__probeSlow')
      guardReentry('__probeThrow')

      const btn = document.createElement('button')
      btn.id = 'probe-btn'
      btn.textContent = 'Go'
      btn.setAttribute('data-busy-text', 'Saving…')
      btn.setAttribute('onclick', '__probeSlow()')
      document.body.appendChild(btn)

      btn.click()                                   // press 1
      await new Promise(r2 => setTimeout(r2, 60))
      const mid = { disabled: btn.disabled, busy: btn.getAttribute('aria-busy'), text: btn.textContent }
      btn.click(); btn.click()                      // presses 2 and 3, mid-flight
      await new Promise(r2 => setTimeout(r2, 400))
      const after = { disabled: btn.disabled, busy: btn.getAttribute('aria-busy'), text: btn.textContent }

      // A throw must still release the flag, or that button is dead for the rest of the session.
      await window.__probeThrow().catch(() => {})
      await window.__probeThrow().catch(() => {})

      btn.remove()
      return { slowRuns, throwRuns, mid, after }
    })

    expect(r.mid.disabled, 'the button must disable on the first press, before any await').toBe(true)
    expect(r.mid.busy, 'aria-busy drives the CSS that stops picker rows being tapped').toBe('true')
    expect(r.mid.text, 'data-busy-text is an opt-in label swap').toBe('Saving…')
    expect(r.slowRuns, 'presses 2 and 3 landed while press 1 was in flight and must be swallowed').toBe(1)
    expect(r.after.disabled, 'the button must be re-enabled after the call settles').toBe(false)
    expect(r.after.busy, 'aria-busy must be removed').toBeNull()
    expect(r.after.text, 'the original label must be restored').toBe('Go')
    expect(r.throwRuns, 'a throw must NOT strand the flag — the second call must still run').toBe(2)
  })
})
