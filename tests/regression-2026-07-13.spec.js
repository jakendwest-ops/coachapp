const { test, expect } = require('./fixtures')
const { loginAsPT, loginAsClient, clickVisible } = require('./helpers')

// Regressions from the first-ever FULL-FILE multi-agent review (2026-07-13).
//
// All three bugs were latent in code no recent diff had touched, which is exactly why ~14 diff-scoped
// pre-push reviews never saw them. Each test below is red against the pre-fix code and green after.

test.describe('XSS — user-controlled strings must never render as HTML', () => {
  // A client writes session name / exercise name / notes in the runner; the COACH opens that log.
  // openWorkoutLog interpolated all three with no escaping, so a client could run script in the
  // coach's browser with the coach's Supabase session — RLS is no defence against a stolen JWT.
  // The same class was live on the template lists (app-workouts.js) via the template name.
  const PAYLOAD = '[E2E] XSS"><img src=x onerror="window.__XSS_FIRED=1">'

  test('a template name containing an HTML payload renders as literal text, not markup', async ({ page }) => {
    await loginAsPT(page)

    let templateId = null
    try {
      templateId = await page.evaluate(async (name) => {
        const { data, error } = await db.from('workout_templates')
          .insert({ coach_id: currentUser.id, name, is_personal: false })
          .select('id').single()
        if (error) throw new Error(error.message)
        return data.id
      }, PAYLOAD)

      await clickVisible(page, '[data-page="workouts"]')
      await page.waitForSelector('h1:has-text("Workouts")', { timeout: 8000 })
      await page.waitForSelector(`.list-row`, { timeout: 8000 })

      // The payload must NOT have become a real element, and must NOT have executed.
      expect(await page.locator('img[src="x"]').count()).toBe(0)
      expect(await page.evaluate(() => window.__XSS_FIRED)).toBeUndefined()

      // It must still be VISIBLE to the user, as the literal text they typed — escaping, not stripping.
      await expect(page.locator('.row-name', { hasText: 'XSS' }).first()).toContainText('<img')
    } finally {
      if (templateId) {
        await page.evaluate(async (id) => { await db.from('workout_templates').delete().eq('id', id) }, templateId)
      }
    }
  })

  test('escapeAttr escapes for the JS-string-inside-HTML-attribute context, in the right order', async ({ page }) => {
    await loginAsPT(page)

    // The browser HTML-decodes an attribute value BEFORE the JS parser sees it. So a bare escapeHtml
    // turns ' into &#39;, which decodes straight back to a quote and terminates the JS string. And the
    // old `.replace(/'/g,"\\'")` idiom left `"` live — a " closes the attribute and lets an attacker
    // append their own event handler. escapeAttr must survive both.
    const out = await page.evaluate(() => ({
      quote:  escapeAttr("O'Brien"),
      dquote: escapeAttr('a" onmouseover="alert(1)'),
      tag:    escapeAttr('<img src=x>'),
      empty:  escapeAttr(null),
    }))

    expect(out.quote).toBe('O\\&#39;Brien')       // JS-escaped first, then HTML-escaped
    expect(out.dquote).not.toContain('"')          // cannot break out of the attribute
    expect(out.tag).not.toContain('<')             // cannot open a tag
    expect(out.empty).toBe('')
  })
})

test.describe('Zero-session phase must not crash the client Programs tab', () => {
  // app-programs.js renderDays() was called with weekMap[weekNums[0]] and NO !weekNums.length guard.
  // A phase with no sessions -> undefined.forEach -> TypeError thrown *while building the template
  // literal*, so the entire el.innerHTML assignment never lands: every phase of every program for that
  // client vanishes and the tab sticks on "Loading…". The identical guard has existed in the verbatim
  // twin (app-workouts.js) since 2026-07-10 — it was simply never ported. Fix-the-class, 5th time.
  // NOTE: this must drive renderClientPrograms — the coach's CLIENT-PROFILE Programs tab, which
  // requires an ASSIGNED program. A first version of this test drove the coach's own program builder
  // (openProgram) instead, and passed against the un-fixed code — a false green. It was caught only by
  // the mandatory red/green step: a test that passes before the fix is worthless. The fixture below
  // (own client + own program + own assignment) is the minimum that reaches the real code path.
  test('a phase with zero sessions renders an empty-state, not a crash', async ({ page }) => {
    await loginAsPT(page)

    const errors = []
    page.on('pageerror', e => errors.push(e.message))

    let ids = null
    try {
      ids = await page.evaluate(async () => {
        const { data: client, error: cErr } = await db.from('clients')
          .insert({ coach_id: currentUser.id, full_name: '[E2E] Zero-phase client' })
          .select('id').single()
        if (cErr) throw new Error('client: ' + cErr.message)

        const { data: prog, error: pErr } = await db.from('programs')
          .insert({ coach_id: currentUser.id, name: '[E2E] Zero-phase regression', is_personal: false })
          .select('id').single()
        if (pErr) throw new Error('program: ' + pErr.message)

        // A phase with NO program_phase_workouts — the normal state of a phase not yet filled in.
        const { error: phErr } = await db.from('program_phases')
          .insert({ program_id: prog.id, name: 'Empty Phase', duration_weeks: 4, order_index: 0 })
        if (phErr) throw new Error('phase: ' + phErr.message)

        const { data: cp, error: aErr } = await db.from('client_programs')
          .insert({ client_id: client.id, program_id: prog.id, start_date: new Date().toISOString().slice(0, 10) })
          .select('id').single()
        if (aErr) throw new Error('assignment: ' + aErr.message)

        return { clientId: client.id, programId: prog.id, cpId: cp.id }
      })

      // The real render the coach hits: Client profile → Programs tab.
      await page.evaluate(async (clientId) => {
        await renderClientPrograms(clientId, document.getElementById('main-content'))
      }, ids.clientId)

      // Pre-fix: renderDays(undefined) throws WHILE building the template literal, so the whole
      // el.innerHTML assignment never lands — the phase (and every other phase) simply never appears.
      await expect(page.locator('#main-content')).toContainText('Empty Phase', { timeout: 8000 })
      await expect(page.locator('#main-content')).toContainText('No sessions added to this phase yet')
      expect(errors.filter(e => /forEach|undefined|not iterable/i.test(e))).toEqual([])
    } finally {
      if (ids) {
        await page.evaluate(async ({ clientId, programId, cpId }) => {
          await db.from('client_programs').delete().eq('id', cpId)
          await db.from('programs').delete().eq('id', programId)
          await db.from('clients').delete().eq('id', clientId)
        }, ids)
      }
    }
  })
})

test.describe('Stale phase-workout context must not leak across views', () => {
  // THE DATA-LOSS CHAIN. _phaseWorkoutContext was a global, set by _createWorkoutFromPicker and cleared
  // in exactly ONE place: the success branch of saveNewTemplate. Cancelling the modal left it set. The
  // next template created ANYWHERE — including a personal one in the Library — was stamped with that
  // stale program_id and bound into that program's day slot, dropping a solo user into a COACHING
  // program's builder. From there "Generate weeks" deleted every assigned client's copies while
  // restoring only the solo one. The context is now an argument owned by showCreateTemplateModal, so
  // any entry point that isn't a phase slot implicitly clears it.
  test('cancelling create-from-phase-slot does not stamp the next library template with that program', async ({ page }) => {
    await loginAsPT(page)

    let programId = null
    let templateId = null
    try {
      // Simulate the phase-slot entry point, then abandon it (cancel).
      programId = await page.evaluate(async () => {
        const { data, error } = await db.from('programs')
          .insert({ coach_id: currentUser.id, name: '[E2E] Stale-ctx regression', is_personal: false })
          .select('id').single()
        if (error) throw new Error(error.message)
        return data.id
      })

      await page.evaluate((pid) => {
        showCreateTemplateModal({ phaseId: 'phase-x', dayOfWeek: 1, weekNumber: 1, programId: pid })
      }, programId)
      await page.waitForSelector('#create-template-modal', { state: 'visible', timeout: 5000 })
      await page.evaluate(() => closeModal('create-template-modal'))   // CANCEL — the leak point
      await page.waitForSelector('#create-template-modal', { state: 'detached', timeout: 5000 })

      // Now the Library entry point, which passes no context.
      await page.evaluate(() => showCreateTemplateModal())
      await page.waitForSelector('#create-template-modal', { state: 'visible', timeout: 5000 })

      // The stale context must be gone. Pre-fix it still held the coaching program's id.
      expect(await page.evaluate(() => window._phaseWorkoutContext)).toBeNull()

      await page.fill('#ct-name', '[E2E] Library template')
      await page.click('#create-template-modal button:has-text("Create")')
      await page.waitForSelector('#create-template-modal', { state: 'detached', timeout: 8000 })

      // The decisive assertion: the library template must NOT belong to the program.
      const row = await page.evaluate(async () => {
        const { data } = await db.from('workout_templates')
          .select('id, program_id').eq('coach_id', currentUser.id).eq('name', '[E2E] Library template')
          .order('created_at', { ascending: false }).limit(1)
        return data?.[0] || null
      })
      expect(row).not.toBeNull()
      templateId = row.id
      expect(row.program_id).toBeNull()
    } finally {
      // Idempotent, by-name, and unconditional — a strand here would poison later runs (les-041).
      await page.evaluate(async () => {
        await db.from('workout_templates').delete().eq('coach_id', currentUser.id).eq('name', '[E2E] Library template')
      })
      if (programId) {
        await page.evaluate(async (id) => { await db.from('programs').delete().eq('id', id) }, programId)
      }
    }
  })
})

test.describe('Permissions — a client must not get the coach\'s controls', () => {
  // openWorkoutLog is reachable by a CLIENT from their own session history and had NO role check:
  // it rendered the coach's Delete button and an EDITABLE "Coach notes" box to the person the notes
  // are written about. The write functions anchored on `id` alone, leaning entirely on RLS.
  test('a client sees read-only coach notes and no Delete button; solo (own coach) keeps both', async ({ page }) => {
    await loginAsPT(page)

    let logId = null
    try {
      logId = await page.evaluate(async () => {
        const { data: c } = await db.from('clients')
          .insert({ coach_id: currentUser.id, full_name: '[E2E] Perms client' }).select('id').single()
        const { data: l } = await db.from('workout_logs').insert({
          coach_id: currentUser.id, client_id: c.id, name: '[E2E] Perms session',
          date: new Date().toISOString().slice(0, 10), notes: 'Coach feedback here'
        }).select('id, client_id').single()
        window.__permsClientId = c.id
        return l.id
      })

      // As COACH: both controls present.
      await page.evaluate(async (id) => { await openWorkoutLog(id, window.__permsClientId) }, logId)
      await expect(page.locator('button:has-text("Delete")')).toBeVisible()
      await expect(page.locator('#wl-coach-notes')).toBeVisible()

      // As CLIENT: notes are read-only text, Delete is gone.
      await page.evaluate(async (id) => {
        currentProfile = { ...currentProfile, role: 'client' }      // bare name: it's a top-level `let` (les-024)
        await openWorkoutLog(id, window.__permsClientId)
      }, logId)
      expect(await page.locator('#wl-coach-notes').count()).toBe(0)
      expect(await page.locator('button:has-text("Delete")').count()).toBe(0)
      await expect(page.locator('#main-content')).toContainText('Coach feedback here')

      // And the write paths refuse even when invoked directly, not just hidden in the UI.
      const stillThere = await page.evaluate(async (id) => {
        await saveCoachNotes(id)
        await deleteWorkoutLog(id, window.__permsClientId)
        currentProfile = { ...currentProfile, role: 'coach' }
        const { data } = await db.from('workout_logs').select('id, notes').eq('id', id).maybeSingle()
        return data
      }, logId)
      expect(stillThere).not.toBeNull()                     // client could not delete it
      expect(stillThere.notes).toBe('Coach feedback here')  // client could not overwrite the notes
    } finally {
      await page.evaluate(async (id) => {
        if (id) await db.from('workout_logs').delete().eq('id', id)
        await db.from('clients').delete().eq('coach_id', currentUser.id).eq('full_name', '[E2E] Perms client')
      }, logId)
    }
  })
})

test.describe('Modal re-entrancy — a double-open must never bury a live modal', () => {
  // Two overlays sharing element ids means the user types into the SECOND (on top) while
  // getElementById resolves to the buried FIRST — so the save reads stale values and reports success,
  // and the visible modal's own close button can't close it. mountModal replaces on mount.
  test('opening the same modal twice leaves exactly one in the DOM', async ({ page }) => {
    await loginAsPT(page)
    const count = await page.evaluate(() => {
      showCreateTemplateModal()
      showCreateTemplateModal()
      return document.querySelectorAll('#create-template-modal').length
    })
    expect(count).toBe(1)
  })
})

test.describe('XSS class-sweep — sibling sites the first pass missed (found by pre-push review)', () => {
  // The client-1RM list is rendered by the COACH (client profile → 1RMs tab) and its exercise_name is
  // written by the CLIENT in the runner. It was untouched by the first XSS pass: raw ${exName} in the
  // body and the old .replace(/'/g,"\'") idiom in an onclick. Same class, sibling function.
  test('a client-controlled 1RM exercise name renders as text in the coach 1RM tab, never markup', async ({ page }) => {
    await loginAsPT(page)
    let ids = null
    try {
      ids = await page.evaluate(async () => {
        const { data: c } = await db.from('clients')
          .insert({ coach_id: currentUser.id, full_name: '[E2E] 1RM xss client' }).select('id').single()
        const { data: r, error: rErr } = await db.from('client_1rms').insert({
          client_id: c.id,
          exercise_name: '[E2E]"><img src=x onerror="window.__ORM_XSS=1">',
          one_rm_kg: 100, recorded_at: new Date().toISOString().split('T')[0]
        }).select('id').single()
        if (rErr) throw new Error('1rm insert: ' + rErr.message)
        return { clientId: c.id, ormId: r.id }
      })
      await page.evaluate(async (clientId) => {
        await renderClient1RMs(clientId, document.getElementById('main-content'))
      }, ids.clientId)
      await page.waitForTimeout(400)
      expect(await page.locator('#main-content img[src="x"]').count()).toBe(0)
      expect(await page.evaluate(() => window.__ORM_XSS)).toBeUndefined()
    } finally {
      if (ids) await page.evaluate(async ({ clientId, ormId }) => {
        if (ormId) await db.from('client_1rms').delete().eq('id', ormId)
        await db.from('clients').delete().eq('id', clientId)
      }, ids)
    }
  })
})

test.describe('deleteTemplate returns via _templateGoBack, never navigate(\'client\')', () => {
  // A first cut of the delete-template nav fix passed ctx.backTo straight to navigate(). But
  // backTo:'client' is a SENTINEL, not a page — navigate('client') hits the "Page not found" default.
  // _templateGoBack translates it via openClientProgramsTab. Regression caught by the pre-push review.
  test('deleting a client-plan template does not land on Page not found', async ({ page }) => {
    await loginAsPT(page)
    const landedOnNotFound = await page.evaluate(async () => {
      // A client-plan edit context: backTo sentinel + clientId, no backFn — the exact shape that broke.
      window._templateCtx = { backTo: 'client', clientId: 'nonexistent-client-id', clientName: 'X' }
      let hitNotFound = false
      const orig = window.navigate
      window.navigate = (p) => { if (p === 'client') hitNotFound = true; }   // catch the bad call
      try { window._templateGoBack() } catch (e) {}
      window.navigate = orig
      return hitNotFound
    })
    expect(landedOnNotFound).toBe(false)   // must route via openClientProgramsTab, not navigate('client')
  })
})

test.describe('Log-session: editing the 1RM must not wipe in-progress set inputs (found by pre-push review)', () => {
  // The block ReferenceError fix made the 1RM field's onchange re-render the modal. Re-render rebuilds
  // innerHTML from state, and the set inputs (reps/weight) are only captured by flushLogState. Without
  // a flush first, typing reps+weight then touching the 1RM field wiped them. Every other re-rendering
  // handler in this modal already flushes first; the 1RM field and the RPE/RIR buttons didn't.
  test('typing set values then editing the 1RM preserves the set values', async ({ page }) => {
    await loginAsPT(page)
    let clientId = null
    try {
      clientId = await page.evaluate(async () => {
        const { data } = await db.from('clients')
          .insert({ coach_id: currentUser.id, full_name: '[E2E] flush client' }).select('id').single()
        return data.id
      })
      await page.evaluate(async (cid) => { await showLogSessionModal(cid) }, clientId)
      await page.waitForSelector('#log-session-modal', { state: 'visible', timeout: 5000 })
      await page.evaluate(() => {
        window._logBlocks = [{ type: 'strength', name: 'Bench', effortMode: 'RPE', oneRM: '', sets: [{}] }]
        renderLogExercises()
      })
      await page.fill('#ls-rmin-0-0', '5')
      await page.fill('#ls-weight-0-0', '100')
      await page.fill('#ls-orm-0', '140')
      await page.locator('#ls-orm-0').blur()
      await page.waitForTimeout(200)
      expect(await page.inputValue('#ls-rmin-0-0')).toBe('5')
      expect(await page.inputValue('#ls-weight-0-0')).toBe('100')
      expect(await page.inputValue('#ls-orm-0')).toBe('140')
    } finally {
      await page.evaluate(() => { try { closeModal('log-session-modal') } catch(e){} })
      if (clientId) await page.evaluate(async (id) => { await db.from('clients').delete().eq('id', id) }, clientId)
    }
  })
})

test.describe('Log-session: exercise-name and set-field attribute escaping (2026-07-27 pre-push sweep)', () => {
  // renderLogExercises interpolates block.name (an exercise name — client-authored via the runner's
  // add/swap-exercise flow, per this same night's builder-editor sweep) and several raw set fields
  // straight into value="..." with no escapeAttr. loadTemplateIntoLog populates block.name from a real
  // workout_template_exercises row's exercise_name, so a coach loading their own template into "Log
  // session" can render a client-poisoned exercise name unescaped. Same client->coach stored-XSS shape
  // fixed repeatedly in js/app-workouts.js tonight, just reached via a different modal/file.
  test('a breakout exercise name and set fields cannot inject an attribute/handler', async ({ page }) => {
    // The full 7-field desktop branch (repsMax/pctMin/pctMax/rest only render when !isMobile) —
    // force desktop width so this test actually reaches every sink, rather than silently checking
    // fewer fields under the suite's mobile-first default viewport.
    await page.setViewportSize({ width: 1280, height: 800 })
    await loginAsPT(page)
    let clientId = null
    try {
      clientId = await page.evaluate(async () => {
        const { data } = await db.from('clients')
          .insert({ coach_id: currentUser.id, full_name: '[E2E] log-session xss client' }).select('id').single()
        return data.id
      })
      await page.evaluate(async (cid) => { await showLogSessionModal(cid) }, clientId)
      await page.waitForSelector('#log-session-modal', { state: 'visible', timeout: 5000 })
      const payload = '1" onmouseover="window.__xssFired=(window.__xssFired||0)+1" data-x="'
      const r = await page.evaluate((payload) => {
        window.__xssFired = 0
        window._logBlocks = [{
          type: 'strength', name: payload, effortMode: 'RPE', oneRM: '',
          sets: [{ repsMin: payload, repsMax: payload, effort: payload, pctMin: payload, pctMax: payload, rest: payload }],
        }]
        renderLogExercises()
        const ids = ['ls-exname-0', 'ls-rmin-0-0', 'ls-rmax-0-0', 'ls-effort-0-0', 'ls-pmin-0-0', 'ls-pmax-0-0', 'ls-rest-0-0']
        ids.forEach(id => document.getElementById(id)?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })))
        return {
          fired: window.__xssFired,
          strayDataAttr: document.querySelectorAll('[data-x]').length,
          anyHandlerProp: ids.some(id => typeof document.getElementById(id)?.onmouseover === 'function'),
          fieldsFound: ids.filter(id => !!document.getElementById(id)).length,
        }
      }, payload)
      expect(r.fieldsFound).toBe(7)
      expect(r.fired).toBe(0)
      expect(r.strayDataAttr).toBe(0)
      expect(r.anyHandlerProp).toBe(false)
    } finally {
      await page.evaluate(() => { try { closeModal('log-session-modal') } catch(e){} })
      if (clientId) await page.evaluate(async (id) => { await db.from('clients').delete().eq('id', id) }, clientId)
    }
  })

  // The cardio branch (duration field) and the mobile-viewport branch (a DIFFERENT set of ids —
  // repsMin/effort only, no repsMax/pctMin/pctMax/rest) take different code paths through
  // renderLogExercises than the desktop test above — cover both so a fix to one branch can't leave
  // a sibling branch unescaped. Uses the suite's own mobile-first default viewport (390px).
  test('cardio duration field and the mobile-viewport branch also escape a breakout payload', async ({ page }) => {
    await loginAsPT(page)
    let clientId = null
    try {
      clientId = await page.evaluate(async () => {
        const { data } = await db.from('clients')
          .insert({ coach_id: currentUser.id, full_name: '[E2E] log-session xss client 2' }).select('id').single()
        return data.id
      })
      await page.evaluate(async (cid) => { await showLogSessionModal(cid) }, clientId)
      await page.waitForSelector('#log-session-modal', { state: 'visible', timeout: 5000 })
      const payload = '1" onmouseover="window.__xssFired=(window.__xssFired||0)+1" data-x="'
      const r = await page.evaluate((payload) => {
        window.__xssFired = 0
        window._logBlocks = [
          { type: 'cardio', name: 'Row', effortMode: 'RPE', oneRM: '', sets: [{ duration: payload }] },
          { type: 'strength', name: 'Bench', effortMode: 'RPE', oneRM: '', sets: [{ repsMin: payload, effort: payload }] },
        ]
        renderLogExercises()
        const ids = ['ls-dur-0-0', 'ls-rmin-1-0', 'ls-effort-1-0']
        ids.forEach(id => document.getElementById(id)?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })))
        return {
          fired: window.__xssFired,
          strayDataAttr: document.querySelectorAll('[data-x]').length,
          fieldsFound: ids.filter(id => !!document.getElementById(id)).length,
        }
      }, payload)
      expect(r.fieldsFound).toBe(3)
      expect(r.fired).toBe(0)
      expect(r.strayDataAttr).toBe(0)
    } finally {
      await page.evaluate(() => { try { closeModal('log-session-modal') } catch(e){} })
      if (clientId) await page.evaluate(async (id) => { await db.from('clients').delete().eq('id', id) }, clientId)
    }
  })
})

test.describe('Exercise library: name escaping (2026-07-27 pre-push sweep)', () => {
  // A client can create a coach-owned exercises row with an arbitrary name via the exercise picker's
  // "+ Create new exercise" action (_createExerciseFromPicker, js/app-workouts.js — shared by the
  // builder, runner swap/add, and 1RM entry; inserts with coach_id resolved to the CLIENT's coach, not
  // the client). That row then rendered raw in two coach-facing surfaces: the library list row and the
  // edit-exercise modal's name input. No session-save or template-load needed — opening the library or
  // tapping Edit on a poisoned row is enough. Same client->coach stored-XSS shape closed 3 times
  // already tonight, found this time by a review sweeping for a possible 4th location.
  test('a breakout exercise name cannot inject markup in the library list or the edit-exercise modal', async ({ page }) => {
    await loginAsPT(page)
    let exId = null
    try {
      const payload = '<img src=x id="xss-lib-marker" onerror="window.__xssFired=(window.__xssFired||0)+1">'
      exId = await page.evaluate(async (name) => {
        const { data } = await db.from('exercises')
          .insert({ coach_id: currentUser.id, name, is_personal: false }).select('id').single()
        return data.id
      }, payload)

      const r1 = await page.evaluate(async () => {
        window.__xssFired = 0
        const el = document.createElement('div')
        document.body.appendChild(el)
        await renderExerciseLibrary(el)
        return { fired: window.__xssFired, markerExists: !!document.getElementById('xss-lib-marker') }
      })
      expect(r1.fired).toBe(0)
      expect(r1.markerExists).toBe(false)

      const attrPayload = '1" onmouseover="window.__xssFired2=(window.__xssFired2||0)+1" data-x="'
      await page.evaluate(async ({ id, name }) => {
        await db.from('exercises').update({ name }).eq('id', id)
      }, { id: exId, name: attrPayload })
      const r2 = await page.evaluate(async (id) => {
        window.__xssFired2 = 0
        await showEditExerciseModal(id)
        const el = document.getElementById('ee-name')
        el?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
        return {
          fired: window.__xssFired2,
          strayDataAttr: document.querySelectorAll('[data-x]').length,
          hasHandlerProp: typeof el?.onmouseover === 'function',
        }
      }, exId)
      expect(r2.fired).toBe(0)
      expect(r2.strayDataAttr).toBe(0)
      expect(r2.hasHandlerProp).toBe(false)
    } finally {
      await page.evaluate(() => { try { closeModal('edit-exercise-modal') } catch(e){} })
      if (exId) await page.evaluate(async (id) => { await db.from('exercises').delete().eq('id', id) }, exId)
    }
  })
})

test.describe('Client-profile / dashboard / goals escaping (2026-07-28, whole-branch review)', () => {
  // The whole-branch pre-push review (run before the intervals feature's final push) found this same
  // recurring client->coach stored-XSS class in an area the intervals branch never touched at all:
  // client_check_ins.notes (a client's own weekly check-in, free-typed on their dashboard) rendered
  // completely raw on the COACH's client-profile Overview tab -- the first thing a coach sees opening
  // a client. Confirmed live on production, unrelated to intervals. While closing it, a wider sweep of
  // the same three files found ~20 more unescaped sinks: client email/phone/notes (3 separate render
  // locations each), goal/milestone title/description, and event titles (saveClientEvent proves a
  // client can create their own event, stamped is_pt_assigned:false specifically to mark it
  // client-authored -- and the coach's own calendar renders it). All wrapped in escapeHtml/escapeAttr.
  const PAYLOAD = '"><img src=x id="xss-marker" onerror="window.__xssFired=(window.__xssFired||0)+1">'

  // client_check_ins RLS (correctly) refuses an insert unless the session IS the client submitting
  // it — a coach cannot plant a check-in on a client's behalf (confirmed directly: attempting it
  // returns 42501, and tests/rls-audit.spec.js already documents this same refusal). So the write
  // must come from a genuine client session, not a coach-authored fixture — matching the real
  // vulnerability's actual trigger path. Two browser contexts, same pattern rls-audit.spec.js uses
  // for exactly this reason (no sign-out dance, cleanup can't be skipped by a failed re-login).
  test('a check-in note cannot inject markup on the coach client-profile Overview tab', async ({ page, browser }) => {
    const clientCtx = await browser.newContext()
    const client = await clientCtx.newPage()
    let checkInId = null, clientId = null
    try {
      await loginAsClient(client)
      const planted = await client.evaluate(async (payload) => {
        const cid = await _getCurrentClientId()
        const { data, error } = await db.from('client_check_ins')
          .insert({ client_id: cid, sleep: 3, energy: 3, stress: 3, soreness: 3, notes: payload })
          .select('id').single()
        return { clientId: cid, checkInId: data?.id, error: error?.message }
      }, PAYLOAD)
      expect(planted.error, 'could not plant the check-in as a real client, so this proves nothing').toBeUndefined()
      clientId = planted.clientId; checkInId = planted.checkInId

      await loginAsPT(page)
      const r = await page.evaluate(async (id) => {
        window.__xssFired = 0
        const el = document.createElement('div')
        document.body.appendChild(el)
        await renderClientOverview(id, el)
        return { fired: window.__xssFired, markerExists: !!document.getElementById('xss-marker'), containsNoteText: el.textContent.includes('img src=x') }
      }, clientId)
      expect(r.fired).toBe(0)
      expect(r.markerExists).toBe(false)
      expect(r.containsNoteText).toBe(true)   // the literal text survived, just not as markup
    } finally {
      // client_check_ins has NO delete grant for either role via the client API — confirmed directly
      // (both client- and coach-session deletes return success with 0 rows affected, no error, no
      // effect). This call is a no-op today; kept in case a future policy adds delete rights. Until
      // then this test leaves one inert row (the escaped payload text, harmless — nothing renders it
      // unescaped anywhere anymore) in the shared Test Client fixture on every run. Jake has the
      // one-line cleanup SQL; this is the same class of accepted, tracked fixture debris as the
      // existing workout_logs erosion issue, not something worth an RLS change at this hour.
      if (checkInId) await client.evaluate(async (id) => { await db.from('client_check_ins').delete().eq('id', id) }, checkInId)
      await clientCtx.close()
    }
  })

  test('client email, phone, and notes cannot inject markup or break an attribute anywhere on the profile page', async ({ page }) => {
    await loginAsPT(page)
    let clientId = null
    try {
      const attrPayload = '1" onmouseover="window.__xssFired2=(window.__xssFired2||0)+1" data-x="'
      clientId = await page.evaluate(async ({ payload, attrPayload }) => {
        const { data } = await db.from('clients')
          .insert({ coach_id: currentUser.id, full_name: '[E2E] contact xss client', email: attrPayload, phone: attrPayload, notes: payload })
          .select('id').single()
        return data.id
      }, { payload: PAYLOAD, attrPayload })
      const r = await page.evaluate(async (id) => {
        window.__xssFired = 0; window.__xssFired2 = 0
        // Client list row
        const listEl = document.createElement('div')
        document.body.appendChild(listEl)
        await renderClients(listEl)
        // Full profile page (subtitle, invite/update-email buttons' onclick args)
        await openClient(id)
        // Edit-client modal (value= attributes + notes textarea)
        await showEditClientModal(id)
        document.getElementById('ec-email')?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
        document.getElementById('ec-phone')?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
        return {
          fired: window.__xssFired, fired2: window.__xssFired2,
          markerExists: !!document.getElementById('xss-marker'),
          strayDataAttr: document.querySelectorAll('[data-x]').length,
          emailHandlerProp: typeof document.getElementById('ec-email')?.onmouseover === 'function',
          phoneHandlerProp: typeof document.getElementById('ec-phone')?.onmouseover === 'function',
        }
      }, clientId)
      expect(r.fired).toBe(0)
      expect(r.fired2).toBe(0)
      expect(r.markerExists).toBe(false)
      expect(r.strayDataAttr).toBe(0)
      expect(r.emailHandlerProp).toBe(false)
      expect(r.phoneHandlerProp).toBe(false)
    } finally {
      await page.evaluate(() => { try { closeModal('edit-client-modal') } catch(e){} })
      if (clientId) await page.evaluate(async (id) => { await db.from('clients').delete().eq('id', id) }, clientId)
    }
  })

  test('a goal title/description and a milestone title cannot inject markup anywhere they render', async ({ page }) => {
    await loginAsPT(page)
    let clientId = null, goalId = null
    try {
      const ids = await page.evaluate(async (payload) => {
        const { data: client } = await db.from('clients')
          .insert({ coach_id: currentUser.id, full_name: '[E2E] goal xss client' }).select('id').single()
        const { data: goal } = await db.from('goals')
          .insert({ client_id: client.id, created_by: currentUser.id, title: payload, description: payload, goal_type: 'custom' })
          .select('id').single()
        await db.from('goal_milestones').insert({ goal_id: goal.id, title: payload })
        return { clientId: client.id, goalId: goal.id }
      }, PAYLOAD)
      clientId = ids.clientId; goalId = ids.goalId
      const r = await page.evaluate(async ({ clientId, goalId }) => {
        window.__xssFired = 0
        if (!document.getElementById('tab-content')) {
          const tc = document.createElement('div'); tc.id = 'tab-content'; document.body.appendChild(tc)
        }
        await openGoal(goalId, clientId)
        const afterOpenGoal = { fired: window.__xssFired, markerExists: !!document.getElementById('xss-marker') }
        await showEditGoalModal(goalId, clientId)
        const afterEditModal = { fired: window.__xssFired, markerExists: !!document.getElementById('xss-marker') }
        return { afterOpenGoal, afterEditModal }
      }, { clientId, goalId })
      expect(r.afterOpenGoal.fired).toBe(0)
      expect(r.afterOpenGoal.markerExists).toBe(false)
      expect(r.afterEditModal.fired).toBe(0)
      expect(r.afterEditModal.markerExists).toBe(false)
    } finally {
      await page.evaluate(() => { try { closeModal('edit-goal-modal') } catch(e){} })
      if (goalId) await page.evaluate(async (id) => { await db.from('goals').delete().eq('id', id) }, goalId)
      if (clientId) await page.evaluate(async (id) => { await db.from('clients').delete().eq('id', id) }, clientId)
    }
  })

  // events has no coach_id column at all -- RLS scopes it via client_id's owning coach, and the real
  // saveClientEvent() insert never sets one either. Same dual-context reasoning as the check-in test:
  // plant as the real client (matching its exact insert shape, is_pt_assigned:false marking it
  // client-authored), read back as the coach, matching the real unscoped events fetch this app uses.
  test('an event title created via the client-writable saveClientEvent path cannot inject markup on the coach calendar', async ({ page, browser }) => {
    const clientCtx = await browser.newContext()
    const client = await clientCtx.newPage()
    let eventId = null, eventDate = null
    try {
      await loginAsClient(client)
      const planted = await client.evaluate(async (payload) => {
        const { data: clientRow } = await db.from('clients').select('id').eq('user_id', currentUser.id).single()
        const date = new Date().toISOString().split('T')[0]
        const { data, error } = await db.from('events')
          .insert({ title: payload, date, type: 'other', notes: null, client_id: clientRow.id, is_pt_assigned: false, created_by: currentUser.id })
          .select('id').single()
        return { eventId: data?.id, date, error: error?.message }
      }, PAYLOAD)
      expect(planted.error, 'could not plant the event as a real client, so this proves nothing').toBeUndefined()
      eventId = planted.eventId; eventDate = planted.date

      await loginAsPT(page)
      const r = await page.evaluate(async (date) => {
        window.__xssFired = 0
        const { data: events } = await db.from('events').select('*').gte('date', date).lte('date', date).order('date')
        const el = document.createElement('div')
        document.body.appendChild(el)
        el.innerHTML = renderEventList(events || [], {})
        return { fired: window.__xssFired, markerExists: !!document.getElementById('xss-marker') }
      }, eventDate)
      expect(r.fired).toBe(0)
      expect(r.markerExists).toBe(false)
    } finally {
      if (eventId) await client.evaluate(async (id) => { await db.from('events').delete().eq('id', id) }, eventId)
      await clientCtx.close()
    }
  })

  // The client's own dashboard rendering of their own check-in note (self-view, no privilege
  // boundary crossed) was also fixed for consistency but isn't separately tested here — the coach-
  // facing test above already proves escapeHtml neutralises this exact payload shape, and a second
  // dual-context test for a self-XSS-only surface isn't worth the added fixture complexity.

  // The scoped re-review of the fix above found 9 more raw sinks in sibling functions in the same
  // two files: goal/milestone title on the coach's own "Goals due soon" widget and the client/solo
  // dashboards' own Goals widgets (js/app-dashboard.js), and workout template description across its
  // list row, detail page, and edit modal (js/app-workouts.js). Confirmed non-client-reachable
  // (`goals` INSERT is RLS-blocked for a client session, tested directly) -- self-XSS tier, not the
  // client->coach shape everything else tonight closed. Fixing them anyway for consistency, given a
  // source check rather than a full dashboard-fixture behavioural test: these render functions pull
  // in the whole dashboard (sessions, workouts, streaks) to reach one small sink, and the escaping
  // primitive itself (escapeHtml neutralising a real payload) is already proven behaviourally many
  // times over elsewhere in this file. Matches the established lighter-rigor pattern this codebase
  // already uses for confirmed-lower-risk sweep items (tests/review-fixes-2026-07-23.spec.js).
  test('goal/milestone title and template description sinks are escaped, not raw, in every render site', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      const dashboardSrc = renderDashboard.toString() + renderClientDashboard.toString() + renderSoloDashboard.toString()
      const templateSrc  = renderWorkoutTemplates.toString() + openTemplate.toString() + showEditTemplateModal.toString()
      return {
        rawGoalTitle: /\$\{g\.title\}|\$\{goal\.title\}/.test(dashboardSrc),
        rawMilestoneTitle: /\$\{m\.title\}/.test(dashboardSrc),
        rawClientFullName: /\$\{g\.clients\?\.full_name/.test(dashboardSrc),
        // Checks the exact pre-fix raw literals (not a generic heuristic) -- a negative-lookahead
        // regex here would false-positive on the fixed `? \`<p>${escapeHtml(...)}` site, since
        // escapeHtml doesn't immediately follow `${t.description`. Verified against the real source.
        rawDescription: templateSrc.includes("t.description || (t.workout_template_exercises.length")
          || templateSrc.includes('`<p class="page-subtitle">${t.description}</p>`')
          || templateSrc.includes('id="et-desc" rows="2" style="resize:vertical">${t.description || \'\'}</textarea>'),
        escapedGoalTitle: (dashboardSrc.match(/escapeHtml\((?:g|goal)\.title\)/g) || []).length,
        escapedMilestoneTitle: (dashboardSrc.match(/escapeHtml\(m\.title\)/g) || []).length,
        escapedDescription: (templateSrc.match(/escapeHtml\(t\.description/g) || []).length,
        neutralised: escapeHtml('<img src=x onerror=alert(1)>').includes('&lt;img'),
      }
    })
    expect(r.rawGoalTitle, 'goal title still interpolated raw somewhere').toBe(false)
    expect(r.rawMilestoneTitle, 'milestone title still interpolated raw somewhere').toBe(false)
    expect(r.rawClientFullName, 'client full_name still interpolated raw on the coach dashboard goals widget').toBe(false)
    expect(r.rawDescription, 'template description still interpolated raw somewhere').toBe(false)
    // 3 dashboards (coach/client/solo) each show goal title at least once; 2 show a milestone title;
    // 3 template surfaces (list row, detail page, edit modal) each show description once.
    expect(r.escapedGoalTitle).toBeGreaterThanOrEqual(3)
    expect(r.escapedMilestoneTitle).toBeGreaterThanOrEqual(2)
    expect(r.escapedDescription).toBeGreaterThanOrEqual(3)
    expect(r.neutralised).toBe(true)
  })
})
