const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

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

      await page.click('[data-page="workouts"]')
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
