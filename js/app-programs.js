async function renderClientPrograms(clientId, el) {
  el.innerHTML = '<div class="loading-state">Loading…</div>'

  const [{ data: assignments, error }, { data: clientData }] = await Promise.all([
    db.from('client_programs')
      .select('id, start_date, programs(id, name, program_phases(id, name, order_index, duration_weeks, program_phase_workouts(id, day_of_week, session_order, week_number)))')
      .eq('client_id', clientId),
    db.from('clients').select('full_name').eq('id', clientId).single()
  ])

  if (error) {
    el.innerHTML = `<div class="card"><div class="card-body" style="padding:20px">
      <p style="color:var(--danger);font-size:13px">${error.message}</p>
    </div></div>`
    return
  }

  if (!assignments?.length) {
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h2 class="section-title">Assigned programs</h2>
        <button class="btn-primary" onclick="showAssignProgramModal('${clientId}')">+ Assign program</button>
      </div>
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <div class="empty-title">No programs assigned</div>
        <div class="empty-text">Assign a program from your library to give this client a structured training plan.</div>
        <button class="btn-primary" onclick="showAssignProgramModal('${clientId}')">+ Assign program</button>
      </div>`
    return
  }

  const cpIds = assignments.map(a => a.id)
  const { data: cpwRows } = await db.from('client_program_workouts')
    .select('client_program_id, program_phase_workout_id, workout_template_id, workout_templates(id, name, workout_template_exercises(exercise_name, order_index, sets_json))')
    .in('client_program_id', cpIds)

  const cpwMap = {}
  ;(cpwRows || []).forEach(r => { cpwMap[r.program_phase_workout_id] = { templateId: r.workout_template_id, name: r.workout_templates?.name, exercises: r.workout_templates?.workout_template_exercises || [] } })

  const clientName = escapeAttr(clientData?.full_name || 'Client')

  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h2 class="section-title">Assigned programs</h2>
      <button class="btn-primary" onclick="showAssignProgramModal('${clientId}')">+ Assign program</button>
    </div>
    ${assignments.map(a => {
      const p = a.programs
      const phases = [...(p?.program_phases || [])].sort((x, y) => x.order_index - y.order_index)
      const startLabel = a.start_date ? new Date(a.start_date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No start date'
      return `
        <div class="card" style="margin-bottom:16px">
          <div class="card-body">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">
              <div>
                <div style="font-size:16px;font-weight:700">${p?.name || 'Unknown program'}</div>
                <div style="font-size:12px;color:var(--text-muted);margin-top:2px">Started ${startLabel}</div>
              </div>
              <div style="display:flex;gap:6px;flex-shrink:0">
                <button class="btn-secondary" style="font-size:12px;padding:4px 10px" onclick="showEditStartDateModal('${clientId}','${a.id}','${a.start_date||''}')">Edit date</button>
                <button class="btn-secondary" style="font-size:12px;padding:4px 10px;color:var(--danger);border-color:var(--danger)" onclick="unassignProgram('${clientId}','${a.id}')">Remove</button>
              </div>
            </div>
            ${phases.map((phase, pi) => {
              const allSessions = [...(phase.program_phase_workouts || [])].sort((x, y) => x.week_number - y.week_number || x.day_of_week - y.day_of_week || x.session_order - y.session_order)
              const weekMap = {}
              allSessions.forEach(pw => { (weekMap[pw.week_number || 1] = weekMap[pw.week_number || 1] || []).push(pw) })
              const weekNums = Object.keys(weekMap).map(Number).sort((a, b) => a - b)
              const showWeeks = weekNums.length > 1
              const panelId = `phase-panel-${a.id}-${pi}`

              const renderDays = (sessions, idPrefix) => {
                const dayMap = {}
                sessions.forEach(pw => { (dayMap[pw.day_of_week] = dayMap[pw.day_of_week] || []).push(pw) })
                const days = Object.keys(dayMap).map(Number).sort((a,b) => a - b)
                return days.map(day => {
                  const daySessions = dayMap[day]
                  const multi = daySessions.length > 1
                  const dayPanelId = `${idPrefix}-d${day}`
                  const sessionSummary = daySessions.map(pw => (cpwMap[pw.id]?.name || 'Session').replace(/ — W\d+/, '')).join(', ')
                  return `
                    <div style="border-top:1px solid var(--border)">
                      <button onclick="toggleClientPhase('${dayPanelId}')" style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:none;border:none;cursor:pointer;text-align:left">
                        <div>
                          <span style="font-size:12px;font-weight:700;color:var(--accent)">DAY ${day}</span>
                          <span style="font-size:13px;font-weight:500;color:var(--text);margin-left:8px">${sessionSummary}</span>
                        </div>
                        <svg id="${dayPanelId}-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;flex-shrink:0;color:var(--text-muted);transition:transform .2s;transform:rotate(0deg)"><polyline points="6 9 12 15 18 9"/></svg>
                      </button>
                      <div id="${dayPanelId}" style="display:none;padding:0 14px 12px">
                        ${daySessions.map((pw, si) => {
                          const cpw = cpwMap[pw.id]
                          const sessionName = (cpw?.name || 'Session').replace(/ — W\d+/, '')
                          const templateId = cpw?.templateId
                          const exs = [...(cpw?.exercises || [])].sort((a,b) => a.order_index - b.order_index)
                          return `
                            <div style="margin-bottom:${si < daySessions.length - 1 ? '10px' : '0'};padding-bottom:${si < daySessions.length - 1 ? '10px' : '0'};border-bottom:${si < daySessions.length - 1 ? '1px solid var(--border)' : 'none'}">
                              ${multi ? `<div style="font-size:10px;font-weight:700;color:var(--accent);letter-spacing:.06em;margin-bottom:4px">SESSION ${si+1}/${daySessions.length}</div>` : ''}
                              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:${exs.length ? '8px' : '0'}">
                                <span style="font-size:13px;font-weight:600">${sessionName}</span>
                                ${templateId ? `<button class="btn-secondary" style="font-size:12px;padding:3px 8px;flex-shrink:0" onclick="openTemplate('${templateId}',{backTo:'client',backLabel:'${clientName}',clientId:'${clientId}',clientName:'${clientName}',clientProgramId:'${a.id}'})">Edit</button>` : `<span style="font-size:12px;color:var(--text-muted)">Not set up</span>`}
                              </div>
                              ${exs.length ? `
                              <div style="padding:6px 8px;background:var(--surface-2);border-radius:6px">
                                ${exs.map(ex => `
                                  <div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--border)">
                                    <span style="font-size:12px">${escapeHtml(ex.exercise_name)}</span>
                                    <span style="font-size:11px;color:var(--text-muted)">${ex.sets_json?.length || 0} set${(ex.sets_json?.length || 0) !== 1 ? 's' : ''}</span>
                                  </div>`).join('')}
                              </div>` : ''}
                            </div>`
                        }).join('')}
                      </div>
                    </div>`
                }).join('')
              }

              return `
                <div style="margin-bottom:6px;border:1px solid var(--border);border-radius:10px;overflow:hidden">
                  <button onclick="toggleClientPhase('${panelId}')" style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:var(--surface-2);border:none;cursor:pointer;text-align:left">
                    <div>
                      <span style="font-size:13px;font-weight:700;color:var(--text)">${phase.name}</span>
                      <span style="font-size:11px;color:var(--text-muted);margin-left:8px">${_builtWeekCount(allSessions)}w · ${allSessions.length} session${allSessions.length !== 1 ? 's' : ''}</span>
                    </div>
                    <svg id="${panelId}-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;color:var(--text-muted);transition:transform .2s;transform:rotate(0deg)"><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                  <div id="${panelId}" style="display:none">
                    ${!weekNums.length ? '<div style="padding:10px 14px;font-size:12px;color:var(--text-muted)">No sessions added to this phase yet</div>' :
                      !showWeeks ? renderDays(weekMap[weekNums[0]], panelId) : weekNums.map(w => `
                      <div style="padding:8px 14px 2px;font-size:11px;font-weight:700;color:var(--accent);background:var(--surface-2);border-top:1px solid var(--border)">WEEK ${w}</div>
                      ${renderDays(weekMap[w], `${panelId}-w${w}`)}
                    `).join('')}
                  </div>
                </div>`
            }).join('')}
          </div>
        </div>`
    }).join('')}
  `
}

function toggleClientPhase(panelId) {
  const panel = document.getElementById(panelId)
  const chevron = document.getElementById(panelId + '-chevron')
  if (!panel) return
  const isOpen = panel.style.display !== 'none'
  panel.style.display = isOpen ? 'none' : 'block'
  if (chevron) chevron.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)'
}

function showAssignProgramModal(clientId) {
  const existing = document.getElementById('assign-program-modal')
  if (existing) existing.remove()

  // Solo view: auto-assign to personal account — no client picker needed
  const targetClientId = (currentProfile?.role === 'solo' && window._soloClientId) ? window._soloClientId : clientId

  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.id = 'assign-program-modal'
  const todayStr = new Date().toISOString().split('T')[0]

  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2 class="modal-title">${currentProfile?.role === 'solo' ? 'Add to my plan' : 'Assign program'}</h2>
        <button class="modal-close" onclick="closeModal('assign-program-modal')">✕</button>
      </div>
      <div class="field">
        <label class="field-label">Program <span style="color:var(--danger)">*</span></label>
        <select class="field-input" id="ap-program" onchange="_refreshMissingOneRMs(this.value,'${targetClientId}','ap-missing-1rm')">
          <option value="">Select a program…</option>
        </select>
      </div>
      <div id="ap-missing-1rm"></div>
      <div class="field">
        <label class="field-label">Start date</label>
        <input class="field-input" id="ap-start" type="date" value="${todayStr}">
      </div>
      <p class="modal-error" id="ap-error"></p>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeModal('assign-program-modal')">Cancel</button>
        <button class="btn-primary" id="ap-save-btn" onclick="saveAssignProgram('${targetClientId}')">Assign</button>
      </div>
    </div>
  `
  mountModal(overlay)

  // Personal programs must never appear in a dropdown that assigns a program TO a client — that is
  // exactly how real clients ended up on a personal program. Filtered by the current view, matching
  // every other is_personal read site.
  db.from('programs').select('id, name').eq('coach_id', currentUser.id).eq('is_personal', currentProfile?.role === 'solo').order('name').then(({ data, error }) => {
    const sel = document.getElementById('ap-program')
    if (!sel) return
    // Surface the error. This query was discarding it, so a failure rendered an EMPTY dropdown and
    // the coach would conclude they had no programs — the same silent-empty failure that hid the
    // Personal Bests bug for months (a rejected query whose error was thrown away).
    if (error) {
      log.error('showAssignProgramModal', 'program fetch failed', error)
      const errEl = document.getElementById('ap-error')
      if (errEl) errEl.textContent = 'Could not load your programs. Please reload.'
      return
    }
    ;(data || []).forEach(p => {
      const opt = document.createElement('option')
      opt.value = p.id
      opt.textContent = p.name
      sel.appendChild(opt)
    })
  })
}

// Is this program ALREADY assigned to this person? Both assign paths (saveAssignProgram and
// saveAssignProgramToClient) previously inserted a client_programs row with no duplicate check at
// all — so assigning the same program twice silently stacked a second assignment AND re-cloned every
// template in it. Found 2026-07-13: Jake's own account had 32 stacked self-assignments of one
// program, each having minted a fresh client-owned clone of all ~30 of its sessions. Nothing looked
// broken because every read does .order('created_at', desc).limit(1) and takes the newest, leaving
// the rest as invisible debris. Preventing silent double-assign has been the stated intent since
// 2026-07-03; it was never actually built. ONE shared helper, called by BOTH paths.
async function _existingAssignment(clientId, programId) {
  const { data, error } = await db.from('client_programs').select('id, start_date')
    .eq('client_id', clientId).eq('program_id', programId)
    .order('created_at', { ascending: false }).limit(1)
  // FAIL CLOSED. Returning "not assigned" on a lookup error would re-create the exact duplicate this
  // guard exists to prevent, silently, on any network/RLS blip. Callers treat `error` as "abort".
  if (error) { log.error('_existingAssignment', 'lookup failed', error); return { error } }
  return data?.[0] || null
}

// Removes an assignment AND the client-owned template clones it created.
//
// unassignProgram used to delete ONLY the client_programs row. Its client_program_workouts cascade
// away with it, but the workout_templates those rows pointed at do NOT — the FK runs the other way
// (workout_templates → client_program_workouts is CASCADE, i.e. deleting the TEMPLATE deletes the
// cpw, never the reverse). So every removal stranded ~30 clones forever. Together with the
// unguarded re-assign path, that is how one account accumulated 2013 client-owned templates, 1223
// of them dead (2026-07-13). ONE helper, used by every path that drops an assignment, so the two
// cannot diverge again.
//
// Deliberately does NOT delete a clone that a workout_log points at: workout_logs.template_id is
// SET NULL on delete, so history survives either way, but keeping the link means a logged session
// can still say which workout it came from.
async function _removeAssignmentAndClones(clientProgramId) {
  const { data: cpws } = await db.from('client_program_workouts')
    .select('workout_template_id').eq('client_program_id', clientProgramId)
  const cloneIds = [...new Set((cpws || []).map(r => r.workout_template_id).filter(Boolean))]

  const { error: delErr } = await db.from('client_programs').delete().eq('id', clientProgramId)
  if (delErr) { log.error('_removeAssignmentAndClones', 'assignment delete failed', delErr); return false }

  if (cloneIds.length) {
    // Only clones nothing else still needs: not referenced by any surviving assignment, and never
    // trained from. Same two-guard shape as _deleteOwnedUnreferencedTemplates.
    const { data: stillUsed } = await db.from('client_program_workouts')
      .select('workout_template_id').in('workout_template_id', cloneIds)
    const { data: logged } = await db.from('workout_logs')
      .select('template_id').in('template_id', cloneIds)
    const keep = new Set([
      ...(stillUsed || []).map(r => r.workout_template_id),
      ...(logged || []).map(r => r.template_id)
    ])
    const dead = cloneIds.filter(id => !keep.has(id))
    if (dead.length) {
      const { error: tErr } = await db.from('workout_templates').delete().in('id', dead).not('client_id', 'is', null)
      if (tErr) log.error('_removeAssignmentAndClones', 'clone cleanup failed', tErr) // assignment is gone either way
      else log.ok('_removeAssignmentAndClones', 'cleaned clones', { count: dead.length })
    }
  }
  return true
}

async function saveAssignProgram(clientId) {
  const programId = document.getElementById('ap-program').value
  const startDate = document.getElementById('ap-start').value || null
  const errorEl   = document.getElementById('ap-error')
  const btn       = document.getElementById('ap-save-btn')

  if (!programId) { errorEl.textContent = 'Please select a program'; return }

  // Disable for the whole run. A check-then-insert in the browser cannot beat a double-tap: two
  // invocations both await the lookup before either INSERT lands, both see zero rows, and both
  // insert — re-cloning every template in the program twice. The unique index on
  // (client_id, program_id) is the real backstop; this stops the user ever provoking it.
  if (btn?.disabled) return
  if (btn) { btn.disabled = true; btn.textContent = 'Assigning…' }
  const _release = () => { if (btn) { btn.disabled = false; btn.textContent = 'Assign' } }

  const existing = await _existingAssignment(clientId, programId)
  if (existing?.error) { errorEl.textContent = 'Could not check existing assignments. Try again.'; _release(); return }
  if (existing) {
    const started = existing.start_date ? ` (started ${existing.start_date})` : ''
    if (!confirm(`That client already has this program${started}.\n\nRestart it from the new start date? Their logged sessions are kept — only the plan itself is rebuilt.`)) { _release(); return }
    if (!await _removeAssignmentAndClones(existing.id)) { errorEl.textContent = 'Could not replace the existing assignment.'; _release(); return }
  }

  const { data: cp, error } = await db.from('client_programs').insert({
    client_id: clientId,
    program_id: programId,
    start_date: startDate || null
  }).select('id').single()

  if (error) {
    log.error('saveAssignProgram', 'insert failed', error)
    // 23505 = the unique index fired: a concurrent assign won the race.
    errorEl.textContent = error.code === '23505' ? 'That program is already assigned to this client.' : error.message
    _release(); return
  }
  await _saveMissingOneRMEntries(clientId)
  closeModal('assign-program-modal')
  // Must AWAIT the clone: it builds the client_program_workouts rows every calendar/Workouts/dashboard
  // view reads to show the assigned sessions. Fire-and-forget here meant the re-render (and any page
  // the user navigated to next) raced ahead of those rows and showed the pre-assignment state until a
  // manual refresh — the "old data until refresh" bug, most visible when the program starts today.
  const tabEl = document.getElementById('tab-content')
  if (tabEl) tabEl.innerHTML = '<div class="loading-state">Assigning program…</div>'
  await _cloneProgramForClient(cp.id, programId, clientId)
  renderClientPrograms(clientId, tabEl)
}

// Clones one master workout_template (+ its exercises) into a client-owned copy. Returns the new template id, or null on failure.
async function _cloneTemplateForClient(tmpl, clientId) {
  if (!tmpl) return null
  const { data: newTmpl, error: tErr } = await db
    .from('workout_templates')
    .insert({ coach_id: currentUser.id, client_id: clientId, program_id: null, is_personal: tmpl.is_personal, name: tmpl.name, description: tmpl.description || null })
    .select('id').single()
  if (tErr || !newTmpl) { log.error('_cloneTemplateForClient', 'template clone failed', tErr); return null }

  const exs = (tmpl.workout_template_exercises || []).map(ex => ({
    template_id: newTmpl.id,
    exercise_id: ex.exercise_id || null,
    exercise_name: ex.exercise_name,
    exercise_type: ex.exercise_type,
    // metric_type drives the runner's whole shape routing (fast table vs wizard, jump/timed/unilateral
    // columns). Omitted here until 2026-07-22, so every ASSIGNED copy silently fell back to
    // weight_reps. The source select is workout_template_exercises(*), so it was always available.
    metric_type: ex.metric_type || null,
    order_index: ex.order_index,
    sets: ex.sets || null,
    sets_json: ex.sets_json || null,
    notes: ex.notes || null,
    superset_group: ex.superset_group || null
  }))
  if (exs.length) await db.from('workout_template_exercises').insert(exs)
  return newTmpl.id
}

async function _cloneProgramForClient(clientProgramId, programId, clientId) {
  const { data: phases, error: phErr } = await db
    .from('program_phases')
    .select('id, program_phase_workouts(id, template_id, week_number, workout_templates(id, name, description, is_personal, workout_template_exercises(*)))')
    .eq('program_id', programId)
    .order('order_index')

  if (phErr || !phases?.length) { log.error('_cloneProgramForClient', 'phase fetch failed', phErr); return }

  const cpwInserts = []

  let skipped = 0
  for (const phase of phases) {
    for (const pw of (phase.program_phase_workouts || [])) {
      // FAIL LOUD. A slot that HAS a template_id but whose `workout_templates` embed came back null
      // means PostgREST silently NULLed that level (an RLS gap), not that the slot is empty. The old
      // code did a bare `continue` and then logged "cloned N workouts" as a success — so the client
      // got a program with sessions quietly missing and nobody, on either side, was told. This exact
      // detection already exists in copyProgramToCoaching; four siblings, one guard.
      if (pw.template_id && !pw.workout_templates) { skipped++; continue }
      const newTemplateId = await _cloneTemplateForClient(pw.workout_templates, clientId)
      if (!newTemplateId) { if (pw.template_id) skipped++; continue }
      cpwInserts.push({ client_program_id: clientProgramId, program_phase_workout_id: pw.id, workout_template_id: newTemplateId, week_number: pw.week_number })
    }
  }

  if (cpwInserts.length) {
    const { error } = await db.from('client_program_workouts').insert(cpwInserts)
    if (error) log.error('_cloneProgramForClient', 'cpw insert failed', error)
  }

  if (skipped) {
    log.error('_cloneProgramForClient', `${skipped} session(s) could not be copied`, { clientId, programId, skipped })
    showToast(`${skipped} session${skipped > 1 ? 's' : ''} could not be copied to this client — do not rely on this assignment`, 'error', 8000)
  }
  log.ok('_cloneProgramForClient', `cloned ${cpwInserts.length} workouts`, { clientId, programId, skipped })
}

// ─── Assignment-time 1RM check ─────────────────────────────────────────────────
// Week 1 is sufficient to determine which exercises this program needs — generated
// periodization weeks (2+) always reuse the same exercise names, just different %1RM values.
async function _getProgramOneRMStatus(programId, clientId) {
  const { data: phases } = await db.from('program_phases')
    .select('program_phase_workouts(week_number, workout_templates(workout_template_exercises(exercise_id, exercise_name, sets_json)))')
    .eq('program_id', programId)

  // Keyed by name (needed regardless of ID availability, since that's what gets displayed/matched
  // against). exercise_id is carried alongside so the have/missing check can prefer it over name.
  const neededByName = new Map()
  ;(phases || []).forEach(phase => {
    ;(phase.program_phase_workouts || []).filter(pw => (pw.week_number || 1) === 1).forEach(pw => {
      ;(pw.workout_templates?.workout_template_exercises || []).forEach(ex => {
        const usesPct = (ex.sets_json || []).some(s => s.intensityMin != null || s.intensityMax != null)
        if (usesPct) neededByName.set(ex.exercise_name, ex.exercise_id || null)
      })
    })
  })
  if (!neededByName.size) return { have: [], missing: [] }

  const { data: existing } = await db.from('client_1rms').select('exercise_id, exercise_name, one_rm_kg').eq('client_id', clientId).order('recorded_at', { ascending: false })
  const haveByName = {}, haveById = {}
  ;(existing || []).forEach(r => {
    const k = r.exercise_name.trim().toLowerCase()
    if (!(k in haveByName)) haveByName[k] = r.one_rm_kg
    if (r.exercise_id && !(r.exercise_id in haveById)) haveById[r.exercise_id] = r.one_rm_kg
  })

  const have = [], missing = []
  neededByName.forEach((exerciseId, name) => {
    const k = name.trim().toLowerCase()
    if (exerciseId && exerciseId in haveById) have.push({ name, kg: haveById[exerciseId] })
    else if (k in haveByName) have.push({ name, kg: haveByName[k] })
    else missing.push(name)
  })
  return { have, missing }
}

// One toggleable "I know it (kg) / Estimate from a set" row. idPrefix must be unique per row on the page.
function _renderOneRMQuickEntry(idPrefix, exerciseName) {
  return `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:8px">
      <div style="font-size:12px;font-weight:700;margin-bottom:8px">${escapeHtml(exerciseName)}</div>
      <div style="display:flex;gap:6px;margin-bottom:8px">
        <button type="button" id="${idPrefix}-mode-direct" onclick="_setOneRMQuickEntryMode('${idPrefix}','direct')" class="btn-primary" style="flex:1;font-size:11px;padding:6px">I know it (kg)</button>
        <button type="button" id="${idPrefix}-mode-epley" onclick="_setOneRMQuickEntryMode('${idPrefix}','epley')" class="btn-secondary" style="flex:1;font-size:11px;padding:6px">Estimate from a set</button>
      </div>
      <div id="${idPrefix}-direct-fields">
        <input class="field-input" id="${idPrefix}-weight" type="number" step="0.5" inputmode="decimal" placeholder="1RM (kg)">
      </div>
      <div id="${idPrefix}-epley-fields" style="display:none">
        <div style="display:flex;gap:6px">
          <input class="field-input" id="${idPrefix}-est-weight" type="number" step="0.5" inputmode="decimal" placeholder="Weight (kg)" oninput="_updateOneRMQuickEntryPreview('${idPrefix}')">
          <input class="field-input" id="${idPrefix}-est-reps" type="number" inputmode="numeric" placeholder="Reps" oninput="_updateOneRMQuickEntryPreview('${idPrefix}')">
        </div>
        <p id="${idPrefix}-epley-preview" style="font-size:11px;color:var(--text-muted);margin:6px 0 0"></p>
      </div>
    </div>`
}

function _setOneRMQuickEntryMode(idPrefix, mode) {
  document.getElementById(`${idPrefix}-direct-fields`).style.display = mode === 'direct' ? 'block' : 'none'
  document.getElementById(`${idPrefix}-epley-fields`).style.display = mode === 'epley' ? 'block' : 'none'
  document.getElementById(`${idPrefix}-mode-direct`).className = mode === 'direct' ? 'btn-primary' : 'btn-secondary'
  document.getElementById(`${idPrefix}-mode-epley`).className = mode === 'epley' ? 'btn-primary' : 'btn-secondary'
}

function _updateOneRMQuickEntryPreview(idPrefix) {
  const w = parseFloat(document.getElementById(`${idPrefix}-est-weight`)?.value)
  const r = parseInt(document.getElementById(`${idPrefix}-est-reps`)?.value)
  const preview = document.getElementById(`${idPrefix}-epley-preview`)
  const est = _epley1RM(w, r)
  preview.textContent = est ? `≈ Epley estimate: ${est.toFixed(1)} kg` : ''
}

// Reads back one row's entered value (direct or Epley-estimated). Null if nothing valid was entered.
function _readOneRMQuickEntry(idPrefix) {
  const mode = document.getElementById(`${idPrefix}-epley-fields`)?.style.display === 'block' ? 'epley' : 'direct'
  if (mode === 'direct') {
    const v = parseFloat(document.getElementById(`${idPrefix}-weight`)?.value)
    return (v && v > 0) ? v : null
  }
  const w = parseFloat(document.getElementById(`${idPrefix}-est-weight`)?.value)
  const r = parseInt(document.getElementById(`${idPrefix}-est-reps`)?.value)
  return _epley1RM(w, r)
}

function _renderProgramOneRMChecklist(status) {
  const total = status.have.length + status.missing.length
  if (!total) return ''
  const haveHtml = status.have.map(h => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;font-size:12px;color:var(--text-muted)">
      <span>✓ ${escapeHtml(h.name)}</span>
      <span>${parseFloat(h.kg).toFixed(1)} kg (on file)</span>
    </div>`).join('')
  const missingHtml = status.missing.map((name, i) => _renderOneRMQuickEntry(`mor-${i}`, name)).join('')
  return `
    <div style="background:rgba(245,158,11,.08);border:1px solid #f59e0b;border-radius:10px;padding:12px;margin-bottom:14px">
      <div style="font-size:12px;font-weight:700;color:#b45309;margin-bottom:8px">This program uses %1RM for ${total} lift${total!==1?'s':''}${status.missing.length ? ` — missing ${status.missing.length}` : ' — all on file'}</div>
      ${haveHtml}
      ${missingHtml}
    </div>`
}

let _oneRMRefreshToken = 0

// Token-guarded: if the program/client selection changes again while this call is still
// awaiting Supabase, its (now-stale) result is discarded instead of overwriting the newer one.
async function _refreshMissingOneRMs(programId, clientId, containerId) {
  const container = document.getElementById(containerId)
  if (!container) return
  const myToken = ++_oneRMRefreshToken
  if (!programId || !clientId) { container.innerHTML = ''; window._missingOneRMExercises = []; return }
  container.innerHTML = '<p style="font-size:12px;color:var(--text-muted)">Checking 1RMs…</p>'
  const status = await _getProgramOneRMStatus(programId, clientId)
  if (myToken !== _oneRMRefreshToken) return
  window._missingOneRMExercises = status.missing
  const el = document.getElementById(containerId)
  if (!el) return
  el.innerHTML = _renderProgramOneRMChecklist(status)
}

// Saves whatever quick-entry rows were filled in. Skipped rows are silently left for the runner's own inline prompt to catch later.
async function _saveMissingOneRMEntries(clientId) {
  const missing = window._missingOneRMExercises || []
  const today = new Date().toISOString().split('T')[0]
  const rows = []
  missing.forEach((name, i) => {
    const val = _readOneRMQuickEntry(`mor-${i}`)
    if (val) rows.push({ client_id: clientId, exercise_name: name, one_rm_kg: val, recorded_at: today })
  })
  if (!rows.length) return
  const { error } = await db.from('client_1rms').insert(rows)
  if (error) { log.error('_saveMissingOneRMEntries', 'insert failed', error); showToast(`Assigned, but the 1RM${rows.length!==1?'s':''} you entered didn't save — try adding ${rows.length!==1?'them':'it'} again from the client's 1RMs tab`, 'error') }
}

async function unassignProgram(clientId, assignmentId) {
  if (!confirm('Remove this program from the client?')) return
  // Was a bare delete of the client_programs row. Its client_program_workouts cascade away, but the
  // client-owned template clones they pointed at do NOT (the FK runs the other way), so every
  // removal stranded ~30 orphan templates forever — for real clients as well as the owner. Now goes
  // through the shared helper, which removes the assignment AND its dead clones. 2026-07-13.
  if (!await _removeAssignmentAndClones(assignmentId)) { showToast('Could not remove the program', 'error'); return }
  renderClientPrograms(clientId, document.getElementById('tab-content'))
}

function showEditStartDateModal(clientId, assignmentId, currentDate) {
  const existing = document.getElementById('esd-modal')
  if (existing) existing.remove()

  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.id = 'esd-modal'
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2 class="modal-title">Edit start date</h2>
        <button class="modal-close" onclick="document.getElementById('esd-modal').remove()">✕</button>
      </div>
      <div class="modal-body">
        <div class="field">
          <label class="field-label">Program start date</label>
          <input class="field-input" type="date" id="esd-date" value="${currentDate}">
        </div>
        <p style="font-size:12px;color:var(--text-muted);margin-top:8px">Changing the start date shifts all scheduled workouts on the client's calendar.</p>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="document.getElementById('esd-modal').remove()">Cancel</button>
        <button class="btn-primary" onclick="saveEditStartDate('${clientId}','${assignmentId}')">Save</button>
      </div>
    </div>`
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
  mountModal(overlay)
}

async function saveEditStartDate(clientId, assignmentId) {
  const newDate = document.getElementById('esd-date')?.value
  if (!newDate) return
  const { error } = await db.from('client_programs').update({ start_date: newDate }).eq('id', assignmentId)
  if (error) { log.error('saveEditStartDate', 'update failed', error); return }
  document.getElementById('esd-modal')?.remove()
  renderClientPrograms(clientId, document.getElementById('tab-content'))
}

async function showAssignProgramToClientModal(programId) {
  const existing = document.getElementById('apc-modal')
  if (existing) existing.remove()

  const isSolo = currentProfile?.role === 'solo'
  const todayStr = new Date().toISOString().split('T')[0]
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.id = 'apc-modal'

  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2 class="modal-title">${isSolo ? 'Add to my plan' : 'Assign to client'}</h2>
        <button class="modal-close" onclick="document.getElementById('apc-modal').remove()">✕</button>
      </div>
      ${isSolo ? '' : `
      <div class="field">
        <label class="field-label">Client <span style="color:var(--danger)">*</span></label>
        <select class="field-input" id="apc-client" onchange="_refreshMissingOneRMs('${programId}',this.value,'apc-missing-1rm')"><option value="">Loading…</option></select>
      </div>`}
      <div id="apc-missing-1rm"></div>
      <div class="field">
        <label class="field-label">Start date</label>
        <input class="field-input" type="date" id="apc-start" value="${todayStr}">
      </div>
      <p class="modal-error" id="apc-error"></p>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="document.getElementById('apc-modal').remove()">Cancel</button>
        <button class="btn-primary" id="apc-save-btn" onclick="saveAssignProgramToClient('${programId}','${isSolo ? window._soloClientId : ''}')">Assign</button>
      </div>
    </div>`

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
  mountModal(overlay)

  if (!isSolo) {
    const { data: clients } = await db.from('clients').select('id, full_name').eq('coach_id', currentUser.id).order('full_name')
    const sel = document.getElementById('apc-client')
    if (sel) sel.innerHTML = '<option value="">Select client…</option>' + (clients || []).map(c => `<option value="${c.id}">${escapeHtml(c.full_name)}</option>`).join('')
  } else if (window._soloClientId) {
    _refreshMissingOneRMs(programId, window._soloClientId, 'apc-missing-1rm')
  }
}

async function saveAssignProgramToClient(programId, soloClientId) {
  const errEl = document.getElementById('apc-error')
  const clientId = soloClientId || document.getElementById('apc-client')?.value
  const startDate = document.getElementById('apc-start').value || null
  if (!clientId) { errEl.textContent = 'Please select a client'; return }

  const btn = document.getElementById('apc-save-btn')
  if (btn?.disabled) return
  if (btn) { btn.disabled = true; btn.textContent = 'Assigning…' }
  const _release = () => { if (btn) { btn.disabled = false; btn.textContent = 'Assign' } }

  // Already assigned? Do NOT just refuse. Every "which program am I on?" read takes the NEWEST
  // assignment (.order('created_at', desc).limit(1)), and solo view has no Remove/Edit-date control
  // anywhere — those live in renderClientPrograms, which is only reachable from a coach's
  // client-detail tab, and a solo client record (coach_id IS NULL) is never listed there. So
  // RE-ASSIGNING has been the only way a solo user could restart a block or go back to an earlier
  // program. A bare refusal would remove the sole escape hatch and strand them on whatever program
  // they last assigned. Offer a real restart instead: drop the old assignment (and its now-dead
  // clones) and re-clone fresh. Caught by two independent review agents, 2026-07-13.
  const existing = await _existingAssignment(clientId, programId)
  if (existing?.error) { errEl.textContent = 'Could not check existing assignments. Try again.'; _release(); return }
  if (existing) {
    const started = existing.start_date ? ` (started ${existing.start_date})` : ''
    const ok = confirm(soloClientId
      ? `This program is already in your plan${started}.\n\nRestart it from the new start date? Your logged sessions are kept — only the plan itself is rebuilt.`
      : `That client already has this program${started}.\n\nRestart it from the new start date? Their logged sessions are kept — only the plan itself is rebuilt.`)
    if (!ok) { _release(); return }
    if (!await _removeAssignmentAndClones(existing.id)) { errEl.textContent = 'Could not replace the existing assignment.'; _release(); return }
  }

  const { data: cp, error } = await db.from('client_programs').insert({ client_id: clientId, program_id: programId, start_date: startDate || null }).select('id').single()
  if (error) {
    log.error('saveAssignProgramToClient', 'insert failed', error)
    errEl.textContent = error.code === '23505' ? 'That program is already assigned.' : error.message
    _release(); return
  }
  await _saveMissingOneRMEntries(clientId)
  document.getElementById('apc-modal')?.remove()
  // AWAIT the clone before re-rendering — same "old data until refresh" race as saveAssignProgram:
  // the client_program_workouts rows must exist before any view reads them. Then re-render the
  // current page so the new assignment shows immediately (Workouts/Calendar/dashboard), no refresh.
  showToast('Adding program…', 'info', 1500)
  await _cloneProgramForClient(cp.id, programId, clientId)
  if (soloClientId) showToast('Program added to your plan', 'success')
  if (typeof currentPage === 'string') navigate(currentPage, 'replace')
}

// ─── PROGRAMS ─────────────────────────────────────────────────────────────────
async function renderPrograms(el) {
  log.info('renderPrograms', 'fetching programs')
  el.innerHTML = '<div class="loading-state">Loading…</div>'

  // The PT and Personal views share one coach_id/auth.uid(), so without this filter the Programs page
  // is a single merged list — a personal program shows up in the coaching pool and vice versa. Same
  // split already applied to exercises (2026-07-10) and workout_templates (2026-07-11); programs was
  // the one table that never got it, which is how real clients ended up assigned to a personal
  // program. Jake, 2026-07-13.
  const { data: programs, error } = await db
    .from('programs')
    .select('id, name, description, created_at, program_phases(id)')
    .eq('coach_id', currentUser.id)
    .eq('is_personal', currentProfile?.role === 'solo')
    .order('created_at', { ascending: false })

  if (error) { log.error('renderPrograms', 'fetch failed', error); el.innerHTML = `<div class="loading-state">${error.message}</div>`; return }

  log.ok('renderPrograms', 'loaded', { count: programs?.length })

  el.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Programs</h1>
      <button class="btn btn-primary" onclick="showCreateProgramModal()">+ New program</button>
    </div>

    ${!programs?.length ? `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <div class="empty-title">No programs yet</div>
        <div class="empty-text">${currentProfile?.role === 'solo'
          ? `Create a program to plan your own training.${window._soloClientId ? ' <br><br>Built a personal program before today? It’s still in your <strong>PT</strong> view — open it there and use “Move to Personal” to bring it across.' : ''}`
          : 'Create a program to organise training phases for your clients.'}</div>
        <button class="btn-primary" onclick="showCreateProgramModal()">+ Create program</button>
      </div>
    ` : `
      <div class="list">
        ${programs.map(p => `
          <div class="list-row" onclick="openProgram('${p.id}')">
            <div style="width:40px;height:40px;border-radius:10px;background:rgba(99,102,241,.12);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">📋</div>
            <div class="row-info">
              <div class="row-name">${escapeHtml(p.name)}</div>
              <div class="row-meta">${p.description || `${p.program_phases?.length || 0} phase${p.program_phases?.length !== 1 ? 's' : ''}`}</div>
            </div>
            <div class="row-right">
              <span style="font-size:12px;color:var(--text-muted)">${p.program_phases?.length || 0} phase${p.program_phases?.length !== 1 ? 's' : ''}</span>
              <svg style="width:15px;height:15px;color:#d1d5db" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
            </div>
          </div>`).join('')}
      </div>
    `}

    <!-- Create/Edit program modal -->
    <div id="program-modal" class="modal-overlay" style="display:none" onclick="if(event.target===this)closeProgramModal()">
      <div class="modal">
        <div class="modal-header">
          <h2 class="modal-title" id="program-modal-title">New program</h2>
          <button class="btn-icon" onclick="closeProgramModal()">✕</button>
        </div>
        <div style="margin-bottom:14px">
          <label class="form-label">Program name <span style="color:#ef4444">*</span></label>
          <input type="text" id="pm-name" class="form-input" placeholder="e.g. 12-Week Strength Block">
        </div>
        <div style="margin-bottom:14px">
          <label class="form-label">Description <span style="color:var(--text-muted)">(optional)</span></label>
          <textarea id="pm-desc" class="form-input" rows="3" placeholder="What is this program for?" style="resize:vertical"></textarea>
        </div>
        <p id="pm-error" style="color:#ef4444;font-size:12px;margin:0 0 10px"></p>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn btn-secondary" onclick="closeProgramModal()">Cancel</button>
          <button class="btn btn-primary" id="pm-save-btn" onclick="saveProgram()">Create program</button>
        </div>
      </div>
    </div>`

}

async function openProgram(programId) {
  const el = document.getElementById('main-content')
  log.info('openProgram', 'loading', { programId })
  el.innerHTML = '<div class="loading-state">Loading…</div>'

  const [{ data: program, error }, { data: templates }] = await Promise.all([
    db.from('programs').select('id, name, description, created_at, is_personal, program_phases(id, name, duration_weeks, order_index, periodization_type, periodization_config)').eq('id', programId).single(),
    // .is('program_id', null) excludes templates already created inline for a specific day slot
    // ("+ Create new workout") -- without it, every one-off slot creation stayed in this reuse
    // pool forever, ballooning the picker with indistinguishable same-named entries the coach had
    // no way to tell apart (found live, 2026-07-10: a 12-phase program's picker showed the same
    // "Lower Body - Dynamic Effort" name 4+ times with no indication which day each belonged to).
    // To genuinely reuse one workout across multiple days, build it once in the Workouts library.
    db.from('workout_templates').select('id, name, description, workout_template_exercises(exercise_name, order_index)').eq('coach_id', currentUser.id).is('client_id', null).is('program_id', null).is('generated_from_phase_id', null).eq('is_personal', currentProfile?.role === 'solo').order('name'),
  ])

  if (error) { log.error('openProgram', 'fetch failed', error); el.innerHTML = `<div class="loading-state">${error.message}</div>`; return }

  const phases = (program.program_phases || []).sort((a, b) => a.order_index - b.order_index)
  const totalWeeks = phases.reduce((sum, p) => sum + p.duration_weeks, 0)
  window._programTemplates = (templates || []).map(t => {
    const exs = [...(t.workout_template_exercises || [])].sort((a, b) => a.order_index - b.order_index)
    const names = exs.map(e => e.exercise_name)
    const preview = names.length ? names.slice(0, 3).join(', ') + (names.length > 3 ? ` +${names.length - 3} more` : '') : ''
    return { id: t.id, name: t.name, description: t.description || '', _exPreview: preview, _exCount: names.length }
  })
  window._openProgramId = programId
  window._openProgramPhases = phases

  el.innerHTML = `
    <div style="margin-bottom:20px">
      <a href="#" onclick="navigate('programs');return false" style="font-size:13px;color:var(--accent);display:inline-flex;align-items:center;gap:4px;margin-bottom:12px">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><polyline points="15 18 9 12 15 6"/></svg>
        All programs
      </a>
      <h1 class="page-title" style="margin-bottom:4px">${escapeHtml(program.name)}</h1>
      ${program.description ? `<p style="color:var(--text-muted);font-size:14px">${program.description}</p>` : ''}
      <p style="font-size:12px;color:var(--text-muted);margin-top:4px">${phases.length} phase${phases.length !== 1 ? 's' : ''} · ${totalWeeks} week${totalWeeks !== 1 ? 's' : ''} total</p>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
        <button class="btn btn-secondary" onclick="showEditProgramModal('${program.id}','${escapeAttr(program.name)}','${escapeAttr((program.description||''))}')">Edit</button>
        ${_assignBtnHtml(program)}
        <button class="btn btn-secondary" onclick="copyProgramWorkoutsToLibrary('${program.id}')" title="Copy every workout in this program into your reusable Library">Copy workouts to Library</button>
        ${program.is_personal
          ? `<button class="btn btn-secondary" onclick="copyProgramToCoaching('${program.id}')" title="Make a coaching copy of this personal program that you can assign to clients">Copy to coaching programs</button>`
          : (window._soloClientId && currentProfile?.role !== 'solo' ? `<button class="btn btn-secondary" onclick="moveProgramToPersonal('${program.id}')" title="Move this program into your Personal view — it will no longer be assignable to clients">Move to Personal</button>` : '')}
        <button class="btn btn-danger" onclick="deleteProgram('${program.id}')">Delete</button>
      </div>
    </div>

    <!-- Phases -->
    <div style="margin-bottom:16px;display:flex;justify-content:space-between;align-items:center">
      <h2 style="font-size:15px;font-weight:600">Phases</h2>
      <button class="btn btn-primary" onclick="showAddPhaseForm('${program.id}')">+ Add phase</button>
    </div>

    <div id="phases-list">
      ${!phases.length ? `<p style="color:var(--text-muted);font-size:13px">No phases yet. Add the first phase to get started.</p>` :
        phases.map((ph, i) => `
          <div class="card" style="margin-bottom:12px">
            <div class="card-body">
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
                <div style="width:32px;height:32px;border-radius:50%;background:var(--accent);color:#fff;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${i + 1}</div>
                <div style="flex:1">
                  <div style="font-weight:600;font-size:15px">${escapeHtml(ph.name)}</div>
                  <div style="font-size:12px;color:var(--text-muted)">${ph.duration_weeks} week${ph.duration_weeks !== 1 ? 's' : ''}</div>
                </div>
                <button class="btn-secondary" style="font-size:12px;padding:4px 10px" onclick="showEditPhaseForm('${program.id}','${ph.id}','${escapeAttr(ph.name)}',${ph.duration_weeks},${ph.order_index})">Edit</button>
                <button class="btn-danger" style="font-size:12px;padding:4px 10px" onclick="deletePhase('${program.id}','${ph.id}')">Remove</button>
              </div>
              ${ph.duration_weeks > 1 ? `
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;background:var(--surface-2);border-radius:8px;padding:8px 12px;margin-bottom:10px">
                <div style="font-size:12px">
                  <span style="font-weight:600;color:var(--text-muted)">Periodization:</span>
                  <span style="font-weight:700;margin-left:4px">${ph.periodization_type === 'linear'
                    ? `Linear${ph.periodization_config?.startPct != null && ph.periodization_config?.endPct != null ? ` (${ph.periodization_config.startPct}→${ph.periodization_config.endPct}%)` : ''}`
                    : ph.periodization_type === 'undulating'
                    ? `Undulating${ph.periodization_config?.tiers ? ` (${['heavy','moderate','light'].filter(t=>ph.periodization_config.tiers[t]?.pct != null).map(t=>ph.periodization_config.tiers[t].pct+'%').join('/')})` : ''}`
                    : 'None'}</span>
                </div>
                <div style="display:flex;gap:6px">
                  <button class="btn-secondary" style="font-size:11px;padding:3px 9px" onclick="showPeriodizationModal('${ph.id}','${program.id}')">Configure</button>
                  ${ph.periodization_type ? `<button class="btn-primary" style="font-size:11px;padding:3px 9px" onclick="generatePhasePeriodization('${ph.id}','${program.id}')">Generate weeks</button>` : ''}
                </div>
              </div>` : ''}
              <div id="phase-workouts-${ph.id}"><div style="color:var(--text-muted);font-size:12px">Loading workouts…</div></div>
            </div>
          </div>`).join('')}
    </div>

    <!-- Add/edit phase form -->
    <div id="phase-form" style="display:none;background:var(--surface-2);border-radius:10px;padding:16px;margin-top:12px">
      <h3 style="font-size:14px;font-weight:600;margin-bottom:12px" id="phase-form-title">Add phase</h3>
      <input type="hidden" id="pf-phase-id">
      <input type="hidden" id="pf-order-index">
      <div style="display:grid;grid-template-columns:1fr auto;gap:10px;margin-bottom:10px">
        <div>
          <label class="form-label">Phase name <span style="color:#ef4444">*</span></label>
          <input type="text" id="pf-name" class="form-input" placeholder="e.g. Base Building">
        </div>
        <div>
          <label class="form-label">Duration (weeks)</label>
          <input type="number" id="pf-weeks" class="form-input" placeholder="4" min="1" max="52" style="width:90px">
        </div>
      </div>
      <p id="pf-error" style="color:#ef4444;font-size:12px;margin:0 0 8px"></p>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" style="font-size:13px;padding:6px 14px" id="pf-save-btn" onclick="savePhase('${program.id}')">Add phase</button>
        <button class="btn-secondary" style="font-size:13px;padding:6px 14px" onclick="document.getElementById('phase-form').style.display='none'">Cancel</button>
      </div>
    </div>


    <!-- Edit program modal -->
    <div id="program-modal" class="modal-overlay" style="display:none" onclick="if(event.target===this)closeProgramModal()">
      <div class="modal">
        <div class="modal-header">
          <h2 class="modal-title" id="program-modal-title">Edit program</h2>
          <button class="btn-icon" onclick="closeProgramModal()">✕</button>
        </div>
        <div style="margin-bottom:14px">
          <label class="form-label">Program name <span style="color:#ef4444">*</span></label>
          <input type="text" id="pm-name" class="form-input">
        </div>
        <div style="margin-bottom:14px">
          <label class="form-label">Description <span style="color:var(--text-muted)">(optional)</span></label>
          <textarea id="pm-desc" class="form-input" rows="3" style="resize:vertical"></textarea>
        </div>
        <p id="pm-error" style="color:#ef4444;font-size:12px;margin:0 0 10px"></p>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn btn-secondary" onclick="closeProgramModal()">Cancel</button>
          <button class="btn btn-primary" id="pm-save-btn" onclick="saveProgram('${program.id}')">Save changes</button>
        </div>
      </div>
    </div>`

  loadAllPhaseWorkouts(phases)
}

let _editingProgramId = null

function showCreateProgramModal() {
  _editingProgramId = null
  document.getElementById('program-modal-title').textContent = 'New program'
  document.getElementById('pm-name').value = ''
  document.getElementById('pm-desc').value = ''
  document.getElementById('pm-error').textContent = ''
  document.getElementById('pm-save-btn').textContent = 'Create program'
  document.getElementById('program-modal').style.display = 'flex'
}

function showEditProgramModal(id, name, description) {
  _editingProgramId = id
  document.getElementById('program-modal-title').textContent = 'Edit program'
  document.getElementById('pm-name').value = name
  document.getElementById('pm-desc').value = description
  document.getElementById('pm-error').textContent = ''
  document.getElementById('pm-save-btn').textContent = 'Save changes'
  document.getElementById('program-modal').style.display = 'flex'
}

function closeProgramModal() {
  document.getElementById('program-modal').style.display = 'none'
}

async function saveProgram(programId) {
  const name = document.getElementById('pm-name').value.trim()
  const desc = document.getElementById('pm-desc').value.trim()
  const errorEl = document.getElementById('pm-error')
  if (!name) { errorEl.textContent = 'Program name is required.'; return }
  errorEl.textContent = ''

  const id = programId || _editingProgramId

  if (id) {
    log.info('saveProgram', 'updating', { id })
    const { error } = await db.from('programs').update({ name, description: desc || null }).eq('id', id)
    if (error) { log.error('saveProgram', 'update failed', error); errorEl.textContent = error.message; return }
    log.ok('saveProgram', 'updated', { id })
    closeProgramModal()
    openProgram(id)
  } else {
    log.info('saveProgram', 'creating')
    const { data, error } = await db.from('programs').insert({ coach_id: currentUser.id, is_personal: currentProfile?.role === 'solo', name, description: desc || null }).select().single()
    if (error) { log.error('saveProgram', 'create failed', error); errorEl.textContent = error.message; return }
    log.ok('saveProgram', 'created', { id: data.id })
    closeProgramModal()
    openProgram(data.id)
  }
}

// Which button the program header shows for "give this program to someone".
// A PERSONAL program is never assignable to a client — that is the whole point of the boundary, and
// the reason 2 real clients ended up on a personal program in the first place. Solo always sees
// "Add to my plan" (assigning to yourself is what a personal program is for).
function _assignBtnHtml(program) {
  if (currentProfile?.role === 'solo') return `<button class="btn btn-primary" onclick="showAssignProgramToClientModal('${program.id}')">Add to my plan</button>`
  if (program.is_personal) return ''
  return `<button class="btn btn-primary" onclick="showAssignProgramToClientModal('${program.id}')">Assign to client</button>`
}

// Who is actually assigned to this program, split into the user's OWN solo self-assignment vs. real
// clients. Extracted from deleteProgram so deleteProgram and moveProgramToPersonal share ONE
// definition of "a real client is blocking this". The 2026-07-11 data-loss bug happened because a
// guard was fixed in one function and not its sibling — a shared helper cannot silently diverge.
async function _programAssignments(programId) {
  const { data: rows } = await db.from('client_programs').select('id, client_id').eq('program_id', programId)
  const soloId = window._soloClientId || null
  const all = rows || []
  return {
    all,
    realClients: all.filter(r => r.client_id !== soloId),
    soloOwnIds: all.filter(r => r.client_id === soloId).map(r => r.id)
  }
}

// coach_id anchor is deliberate: this resolves ids into real client NAMES that get rendered in a
// toast. RLS holds today (Probe A proves a coach who owns nothing reads 0 rows), but a name lookup
// filtered by `id` alone is precisely the shape of the s25 leak — one anchor here covers both
// callers (deleteProgram and moveProgramToPersonal) rather than trusting the policy alone.
// Who a structural program edit (generate-weeks, duplicate-week) is allowed to fan out to.
//
// Both of those paths re-clone templates into EVERY assignee's plan. Neither had any role split, so
// a Personal-view edit of a program that still has real clients on it (exactly the state every
// pre-existing program is in — they all default to is_personal = false) would write straight into
// those clients' plans. That is the same bug _checkClientPlanPropagation was fixed for today; these
// two are its siblings and were about to be left behind. In Personal view, the only legitimate
// target is the user's own solo assignment. Same rule, one helper, both callers.
function _propagationTargets(assignments) {
  const rows = assignments || []
  if (currentProfile?.role !== 'solo') return rows
  return rows.filter(a => a.client_id === window._soloClientId)
}

async function _blockingClientNames(realClientRows) {
  const { data } = await db.from('clients').select('full_name')
    .in('id', realClientRows.map(r => r.client_id)).eq('coach_id', currentUser.id)
  return (data || []).map(c => c.full_name).filter(Boolean).join(', ')
}

// Reclassify an existing program as Personal. Needed because the is_personal migration defaults every
// PRE-EXISTING program to false (fix-forward — no retroactive reclassification), so programs the user
// actually built for themselves still sit in the coaching pool until they say otherwise.
// Refuses while any real client is assigned: a program a client is training on is, by definition, a
// coaching program. This is the deliberate "conscious choice" gate.
async function moveProgramToPersonal(programId) {
  // Gate on _soloClientId, NOT _masterAccount. _masterAccount is also true for a coach who is merely
  // someone else's client (they have _masterClientId but no solo record) — that user has no Personal
  // view at all, so moving a program there would make it unlistable, uneditable and UNDELETABLE
  // (deleteProgram is only reachable from openProgram). _soloClientId is the thing that actually
  // proves a Personal view exists. Caught by review, 2026-07-13.
  if (!window._soloClientId) { showToast('You have no Personal view to move this into.', 'warn'); return }

  const { realClients } = await _programAssignments(programId)
  if (realClients.length) {
    const names = await _blockingClientNames(realClients)
    showToast(`Assigned to ${names || `${realClients.length} client${realClients.length === 1 ? '' : 's'}`} — a program a client is training on can't be personal. Remove them first.`, 'warn', 6000)
    return
  }
  if (!confirm('Move this program to your Personal view? It will no longer appear in your PT programs and can no longer be assigned to clients.')) return

  log.info('moveProgramToPersonal', 'moving', { programId })
  // .select() is not optional here: PostgREST returns error:null for an UPDATE that matches ZERO
  // rows (RLS-filtered, or a coach_id mismatch). Without it, a write that changed nothing reports a
  // green "Moved to Personal" — which would also mask any future RLS regression on programs UPDATE.
  const { data, error } = await db.from('programs').update({ is_personal: true })
    .eq('id', programId).eq('coach_id', currentUser.id).select('id')
  if (error || data?.length !== 1) {
    log.error('moveProgramToPersonal', 'update failed', error || { rows: data?.length })
    showToast('Could not move program', 'error'); return
  }
  log.ok('moveProgramToPersonal', 'moved', { programId })
  showToast('Moved to Personal. Switch to the Personal view to see it.', 'success', 5000)
  // Back to the list, not openProgram: this program has just LEFT the pool the user is looking at,
  // and re-rendering it in PT view would offer them the coaching template picker plus a "Copy to
  // coaching programs" button — an immediate offer to undo what they just did.
  navigate('programs')
}

// The bridge OUT of Personal: make a coaching copy of a personal program so it can be assigned to
// clients. Without this, sealing the boundary would strand the user exactly the way the template
// boundary did on 2026-07-11 (6 workouts retyped by hand because there was no way across).
// The copy lands in the PT pool (is_personal: false) regardless of which view we're copying FROM —
// same explicit-override trick _copyTemplateToLibrary uses, rather than reading the current role.
async function copyProgramToCoaching(programId) {
  const { data: src, error: srcErr } = await db.from('programs')
    .select('id, name, description, is_personal, program_phases(id, name, duration_weeks, order_index, periodization_type, periodization_config)')
    .eq('id', programId).eq('coach_id', currentUser.id).single()
  if (srcErr || !src) { log.error('copyProgramToCoaching', 'source fetch failed', srcErr); showToast('Could not load that program', 'error'); return }

  // Name-collision guard against the DESTINATION pool. Plain fetch + JS compare — .ilike() would
  // treat the name as a LIKE pattern (_ and % are wildcards) and .maybeSingle() ERRORS on >1 match,
  // and a discarded error reads as null, so the guard would fail open exactly when duplicates exist.
  const newName = `${src.name} (coaching copy)`
  const { data: existing, error: exErr } = await db.from('programs').select('id')
    .eq('coach_id', currentUser.id).eq('is_personal', false).eq('name', newName)
  if (exErr) { log.error('copyProgramToCoaching', 'collision check failed', exErr); showToast('Could not copy program', 'error'); return }
  if (existing?.length) {
    showToast('A coaching copy of this program already exists.', 'warn', 5000)
    return
  }

  if (!confirm(`Create a coaching copy of "${src.name}"? The copy can be assigned to clients; this personal program stays untouched.`)) return
  log.info('copyProgramToCoaching', 'copying', { programId })
  showToast('Copying…', 'info', 2000)

  const { data: newProg, error: pErr } = await db.from('programs')
    .insert({ coach_id: currentUser.id, is_personal: false, name: newName, description: src.description || null })
    .select('id').single()
  if (pErr || !newProg) { log.error('copyProgramToCoaching', 'program insert failed', pErr); showToast('Could not copy program', 'error'); return }

  // Any failure after the program row exists must roll it back. Otherwise a half-copied program is
  // left in the COACHING pool — is_personal:false, so it is listed and assignable to a real client
  // with phases/days missing — and the name-collision guard above then blocks the retry, stranding
  // the user with a broken copy they must hunt down and delete by hand. (Same partial-failure class
  // as the starter-seed stranding fixed 2026-07-12.) program_phases and program_phase_workouts
  // cascade from programs, so one delete unwinds the lot; the template clones are removed explicitly.
  const _rollback = async (msg) => {
    const { data: orphanTmpls } = await db.from('workout_templates').select('id').eq('program_id', newProg.id)
    if (orphanTmpls?.length) await db.from('workout_templates').delete().in('id', orphanTmpls.map(t => t.id))
    await db.from('programs').delete().eq('id', newProg.id).eq('coach_id', currentUser.id)
    log.error('copyProgramToCoaching', 'rolled back partial copy', { programId: newProg.id })
    showToast(msg, 'error', 5000)
  }

  const phases = [...(src.program_phases || [])].sort((a, b) => a.order_index - b.order_index)
  // Clone each source template ONCE, even when several slots share it (a duplicated-but-unforked week
  // legitimately points multiple slots at one template — copying it per-slot would silently fork them
  // apart and break that "cheap by design" sharing).
  const templateMap = new Map()

  for (const ph of phases) {
    const { data: newPhase, error: phErr } = await db.from('program_phases').insert({
      program_id: newProg.id, name: ph.name, duration_weeks: ph.duration_weeks, order_index: ph.order_index,
      periodization_type: ph.periodization_type || null, periodization_config: ph.periodization_config || null
    }).select('id').single()
    if (phErr || !newPhase) { await _rollback('Could not copy a phase — nothing was changed.'); return }

    const { data: slots } = await db.from('program_phase_workouts')
      .select('*, workout_templates(*, workout_template_exercises(*))').eq('phase_id', ph.id)

    const inserts = []
    for (const slot of (slots || [])) {
      let newTemplateId = null
      // A slot with template_id set but a NULL embed means the workout couldn't be read (an
      // unreadable nested level, or a dangling FK). Copying it as an empty day and reporting success
      // would silently drop a workout — this codebase has been bitten by silently-nulled embeds
      // three times. Fail loudly instead.
      if (slot.template_id && !slot.workout_templates) {
        await _rollback('Could not read one of the workouts in this program — nothing was copied.')
        return
      }
      if (slot.template_id && slot.workout_templates) {
        if (templateMap.has(slot.template_id)) {
          newTemplateId = templateMap.get(slot.template_id)
        } else {
          const clone = await _cloneSharedMasterTemplate(slot.workout_templates, {
            is_personal: false,
            program_id: newProg.id,
            // A week-clone's generated_from_phase_id must point at the NEW phase, or the ownership
            // checks in deleteProgram/_deleteOwnedUnreferencedTemplates won't recognise it as owned.
            generated_from_phase_id: slot.workout_templates.generated_from_phase_id ? newPhase.id : null
          })
          if (!clone?.id) { await _rollback('Could not copy one of the workouts — nothing was changed.'); return }
          newTemplateId = clone.id
          templateMap.set(slot.template_id, newTemplateId)
        }
      }
      inserts.push({
        phase_id: newPhase.id, day_of_week: slot.day_of_week, day_label: slot.day_label,
        session_order: slot.session_order, template_id: newTemplateId,
        week_number: slot.week_number, tier: slot.tier || null
      })
    }
    if (inserts.length) {
      const { error: sErr } = await db.from('program_phase_workouts').insert(inserts)
      if (sErr) { log.error('copyProgramToCoaching', 'slot insert failed', sErr); await _rollback('Could not copy the day slots — nothing was changed.'); return }
    }
  }

  log.ok('copyProgramToCoaching', 'copied', { from: programId, to: newProg.id, templates: templateMap.size })
  showToast(`Copied to your coaching programs as "${newName}".`, 'success', 6000)
}

async function deleteProgram(programId) {
  const { realClients: blocking, soloOwnIds } = await _programAssignments(programId)

  if (blocking.length) {
    const names = await _blockingClientNames(blocking)
    showToast(`Assigned to ${names || `${blocking.length} client${blocking.length === 1 ? '' : 's'}`} — remove them from this program first.`, 'warn', 5000)
    return
  }

  if (!confirm('Delete this program, its phases, and its workout templates? This cannot be undone.')) return
  log.info('deleteProgram', 'deleting', { programId })

  // The only remaining assignment at this point (if any) is the user's own solo self-assignment.
  // This was a bare `client_programs.delete()`, which is exactly the bug _removeAssignmentAndClones
  // was written to eliminate: client_program_workouts cascade away, but the client-owned
  // workout_templates CLONES they pointed at do NOT (the FK runs the other way). Every self-assigned
  // program you deleted stranded its clones — invisible to every library query (they all filter
  // `.is('client_id', null)`), so they could never be found or removed again. That is the same
  // generator behind the 2013-templates / 1223-dead figure. The helper was wired into unassignProgram
  // and both assign paths, and not into this one. (Fix the class, not the instance.)
  // ABORT if the clone cleanup fails. _removeAssignmentAndClones returns false on error, and pressing
  // on would delete the program anyway — permanently orphaning the very clones this call exists to
  // remove, with the program row gone so nothing can ever find them again. Fail closed.
  for (const cpId of soloOwnIds) {
    if (!await _removeAssignmentAndClones(cpId)) {
      showToast('Could not clean up this program’s workout copies — nothing was deleted. Try again.', 'error')
      return
    }
  }

  const { data: phases } = await db.from('program_phases').select('id').eq('program_id', programId)
  const phaseIds = (phases || []).map(p => p.id)
  if (phaseIds.length) {
    const { data: pws } = await db.from('program_phase_workouts').select('template_id').in('phase_id', phaseIds)
    const templateIds = [...new Set((pws || []).map(p => p.template_id).filter(Boolean))]

    // Drop our own slot rows BEFORE the ownership sweep, so the helper's still-referenced check sees
    // only genuinely EXTERNAL survivors (another program still using a shared standalone template).
    // These rows would cascade with the phases anyway; removing them first is what makes the shared
    // helper usable here at all.
    await db.from('program_phase_workouts').delete().in('phase_id', phaseIds)
    await _deleteOwnedUnreferencedTemplates(templateIds, programId, phaseIds)
  }

  const { error } = await db.from('programs').delete().eq('id', programId).eq('coach_id', currentUser.id)
  if (error) { log.error('deleteProgram', 'failed', error); return }
  log.ok('deleteProgram', 'deleted', { programId })
  navigate('programs')
}

function showAddPhaseForm(programId) {
  document.getElementById('phase-form-title').textContent = 'Add phase'
  document.getElementById('pf-phase-id').value = ''
  document.getElementById('pf-order-index').value = ''
  document.getElementById('pf-name').value = ''
  document.getElementById('pf-weeks').value = ''
  document.getElementById('pf-error').textContent = ''
  document.getElementById('pf-save-btn').textContent = 'Add phase'
  document.getElementById('phase-form').style.display = 'block'
  document.getElementById('pf-name').focus()
}

function showEditPhaseForm(programId, phaseId, name, weeks, orderIndex) {
  document.getElementById('phase-form-title').textContent = 'Edit phase'
  document.getElementById('pf-phase-id').value = phaseId
  document.getElementById('pf-order-index').value = orderIndex
  document.getElementById('pf-name').value = name
  document.getElementById('pf-weeks').value = weeks
  document.getElementById('pf-error').textContent = ''
  document.getElementById('pf-save-btn').textContent = 'Save phase'
  document.getElementById('phase-form').style.display = 'block'
  document.getElementById('pf-name').focus()
}

async function savePhase(programId) {
  const name     = document.getElementById('pf-name').value.trim()
  const weeks    = parseInt(document.getElementById('pf-weeks').value)
  const phaseId  = document.getElementById('pf-phase-id').value
  const errorEl  = document.getElementById('pf-error')

  if (!name || isNaN(weeks) || weeks < 1) { errorEl.textContent = 'Name and duration are required.'; return }
  errorEl.textContent = ''

  if (phaseId) {
    log.info('savePhase', 'updating', { phaseId })
    const { error } = await db.from('program_phases').update({ name, duration_weeks: weeks }).eq('id', phaseId)
    if (error) { log.error('savePhase', 'update failed', error); errorEl.textContent = error.message; return }
    // If duration shrank below any already-generated weeks, prune the now out-of-range rows (master + propagated client copies)
    await _cleanupPhaseWeeksBeyond(phaseId, weeks, programId)
    log.ok('savePhase', 'updated', { phaseId })
  } else {
    // Get current max order_index to append at end
    const { data: existing } = await db.from('program_phases').select('order_index').eq('program_id', programId).order('order_index', { ascending: false }).limit(1)
    const nextIndex = (existing?.[0]?.order_index ?? -1) + 1
    log.info('savePhase', 'creating', { programId, nextIndex })
    const { error } = await db.from('program_phases').insert({ program_id: programId, name, duration_weeks: weeks, order_index: nextIndex })
    if (error) { log.error('savePhase', 'create failed', error); errorEl.textContent = error.message; return }
    log.ok('savePhase', 'created')
  }

  document.getElementById('phase-form').style.display = 'none'
  openProgram(programId)
}

async function deletePhase(programId, phaseId) {
  if (!confirm('Remove this phase?')) return
  log.info('deletePhase', 'deleting', { phaseId })

  // Deleting the phase row cascades its program_phase_workouts (and, through them, the client copies)
  // — but it does NOT touch the workout_templates those slots pointed at. So this used to orphan, on
  // every call: every periodization week-clone generated from this phase (those carry program_id:
  // null, so NO other code path can ever find them again), plus any template this program created that
  // only this phase referenced. One 4-week periodized phase with 4 sessions/week = 12 templates
  // stranded forever. Collect the ids and the client copies BEFORE the cascade destroys the trail.
  const { data: pws } = await db.from('program_phase_workouts').select('id, template_id').eq('phase_id', phaseId)
  const templateIds = [...new Set((pws || []).map(p => p.template_id).filter(Boolean))]
  const pwIds = (pws || []).map(p => p.id)

  await _deleteClientCopiesForSlots(pwIds, programId)
  await db.from('program_phase_workouts').delete().eq('phase_id', phaseId)   // before the sweep, so
  await _deleteOwnedUnreferencedTemplates(templateIds, programId, phaseId)   // survivors are external

  const { error } = await db.from('program_phases').delete().eq('id', phaseId)
  if (error) { log.error('deletePhase', 'failed', error); return }
  log.ok('deletePhase', 'deleted', { phaseId })
  openProgram(programId)
}

// ─── PERIODIZATION ────────────────────────────────────────────────────────────
function showPeriodizationModal(phaseId, programId) {
  const phase = (window._openProgramPhases || []).find(p => p.id === phaseId)
  if (!phase) return
  const existing = document.getElementById('periodization-modal')
  if (existing) existing.remove()

  window._pzPhaseId = phaseId
  window._pzProgramId = programId
  window._pzType = phase.periodization_type || ''
  window._pzConfig = phase.periodization_config || {}
  window._pzDaySlots = []

  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.id = 'periodization-modal'
  overlay.innerHTML = `
    <div class="modal" style="max-width:480px">
      <div class="modal-header">
        <h2 class="modal-title">Periodization — ${phase.name}</h2>
        <button class="modal-close" onclick="closeModal('periodization-modal')">✕</button>
      </div>
      <div id="pz-body"></div>
      <p class="modal-error" id="pz-error"></p>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeModal('periodization-modal')">Cancel</button>
        <button class="btn-primary" onclick="savePeriodizationConfig()">Save</button>
      </div>
    </div>`
  mountModal(overlay)
  renderPeriodizationBody(phase.duration_weeks)
}

function setPeriodizationType(type, durationWeeks) {
  window._pzType = type
  renderPeriodizationBody(durationWeeks)
}

function renderPeriodizationBody(durationWeeks) {
  const body = document.getElementById('pz-body')
  if (!body) return
  const type = window._pzType
  const cfg = window._pzConfig || {}
  const tierDefault = { heavy: 85, moderate: 70, light: 55 }
  const repsDefault = { heavy: '3-5', moderate: '6-8', light: '10-12' }
  const tog = (label, val) => `<button type="button" onclick="setPeriodizationType('${val}',${durationWeeks})" style="padding:6px 14px;font-size:12px;font-weight:700;border-radius:6px;border:1px solid ${type===val?'var(--accent)':'#d1d5db'};background:${type===val?'var(--accent)':'transparent'};color:${type===val?'white':'#6b7280'};cursor:pointer">${label}</button>`

  body.innerHTML = `
    <div class="field">
      <label class="field-label">Type</label>
      <div style="display:flex;gap:6px">${tog('None', '')}${tog('Linear', 'linear')}${tog('Undulating', 'undulating')}</div>
    </div>
    ${type === 'linear' ? `
      <p style="font-size:12px;color:var(--text-muted);margin:4px 0 10px">Intensity steps evenly from the start % to the end % across ${durationWeeks} weeks. Every %1RM set in Week 1 is regenerated per week — reps, rest and tempo stay exactly as you set them.</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="field"><label class="field-label">Start %1RM</label><input class="field-input" id="pz-start" type="number" min="1" max="100" value="${cfg.startPct ?? 65}"></div>
        <div class="field"><label class="field-label">End %1RM</label><input class="field-input" id="pz-end" type="number" min="1" max="100" value="${cfg.endPct ?? 85}"></div>
      </div>
      <div class="field">
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600;cursor:pointer">
          <input type="checkbox" id="pz-deload-on" ${cfg.deloadWeek ? 'checked' : ''} onchange="document.getElementById('pz-deload-fields').style.display=this.checked?'grid':'none'">
          Add a deload week
        </label>
      </div>
      <div id="pz-deload-fields" style="display:${cfg.deloadWeek ? 'grid' : 'none'};grid-template-columns:1fr 1fr;gap:10px">
        <div class="field"><label class="field-label">Deload week #</label><input class="field-input" id="pz-deload-week" type="number" min="2" max="${durationWeeks}" value="${cfg.deloadWeek || Math.min(durationWeeks, 4)}"></div>
        <div class="field"><label class="field-label">Deload %1RM</label><input class="field-input" id="pz-deload-pct" type="number" min="1" max="100" value="${cfg.deloadPct ?? 50}"></div>
      </div>
    ` : ''}
    ${type === 'undulating' ? `
      <p style="font-size:12px;color:var(--text-muted);margin:4px 0 10px">The same Heavy/Moderate/Light pattern repeats every week — it doesn't progress week to week. Assign a tier to each Week 1 session below, and set what each tier means.</p>
      <div style="margin-bottom:12px">
        ${['heavy', 'moderate', 'light'].map(t => `
          <div style="display:grid;grid-template-columns:70px 1fr 1fr;gap:8px;align-items:center;margin-bottom:6px">
            <span style="font-size:12px;font-weight:700;text-transform:capitalize">${t}</span>
            <input class="field-input" id="pz-tier-${t}-pct" type="number" min="1" max="100" placeholder="%1RM" value="${cfg.tiers?.[t]?.pct ?? tierDefault[t]}">
            <input class="field-input" id="pz-tier-${t}-reps" type="text" placeholder="Reps e.g. 3-5" value="${cfg.tiers?.[t]?.reps ?? repsDefault[t]}">
          </div>`).join('')}
      </div>
      <div id="pz-day-tiers"><div style="color:var(--text-muted);font-size:12px">Loading Week 1 sessions…</div></div>
    ` : ''}
  `
  if (type === 'undulating') loadDayTierAssignment(window._pzPhaseId)
}

async function loadDayTierAssignment(phaseId) {
  const el = document.getElementById('pz-day-tiers')
  if (!el) return
  const { data: pws } = await db.from('program_phase_workouts')
    .select('id, day_of_week, day_label, session_order, tier, workout_templates(name)')
    .eq('phase_id', phaseId).eq('week_number', 1).order('day_of_week').order('session_order')
  if (!pws?.length) { el.innerHTML = '<p style="font-size:12px;color:var(--text-muted)">Add Week 1 sessions first (use "+ Assign workout" below), then reopen this to assign tiers.</p>'; return }
  window._pzDaySlots = pws.map(pw => ({ id: pw.id, tier: pw.tier || 'moderate' }))
  el.innerHTML = pws.map(pw => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)">
      <span style="font-size:12px">${pw.day_label} — ${pw.workout_templates?.name || 'Untitled'}</span>
      <select class="field-input" style="width:120px;padding:4px 8px;font-size:12px" onchange="_pzTierChange('${pw.id}', this.value)">
        <option value="heavy" ${pw.tier === 'heavy' ? 'selected' : ''}>Heavy</option>
        <option value="moderate" ${(!pw.tier || pw.tier === 'moderate') ? 'selected' : ''}>Moderate</option>
        <option value="light" ${pw.tier === 'light' ? 'selected' : ''}>Light</option>
      </select>
    </div>`).join('')
}

function _pzTierChange(pwId, tier) {
  const slot = (window._pzDaySlots || []).find(s => s.id === pwId)
  if (slot) slot.tier = tier
}

async function savePeriodizationConfig() {
  const phaseId = window._pzPhaseId
  const programId = window._pzProgramId
  const errEl = document.getElementById('pz-error')
  const type = window._pzType || null
  let config = null

  if (type === 'linear') {
    const startPct = parseFloat(document.getElementById('pz-start')?.value)
    const endPct = parseFloat(document.getElementById('pz-end')?.value)
    if (isNaN(startPct) || isNaN(endPct)) { errEl.textContent = 'Enter start and end %1RM'; return }
    config = { startPct, endPct }
    if (document.getElementById('pz-deload-on')?.checked) {
      const deloadWeek = parseInt(document.getElementById('pz-deload-week')?.value)
      const deloadPct = parseFloat(document.getElementById('pz-deload-pct')?.value)
      if (!isNaN(deloadWeek) && !isNaN(deloadPct)) { config.deloadWeek = deloadWeek; config.deloadPct = deloadPct }
    }
  } else if (type === 'undulating') {
    config = { tiers: {} }
    for (const t of ['heavy', 'moderate', 'light']) {
      config.tiers[t] = {
        pct: parseFloat(document.getElementById(`pz-tier-${t}-pct`)?.value) || null,
        reps: document.getElementById(`pz-tier-${t}-reps`)?.value.trim() || null
      }
    }
    for (const slot of (window._pzDaySlots || [])) {
      await db.from('program_phase_workouts').update({ tier: slot.tier }).eq('id', slot.id)
    }
  }

  const { error } = await db.from('program_phases').update({ periodization_type: type, periodization_config: config }).eq('id', phaseId)
  if (error) { log.error('savePeriodizationConfig', 'update failed', error); errEl.textContent = error.message; return }
  log.ok('savePeriodizationConfig', 'saved', { phaseId, type })
  closeModal('periodization-modal')
  openProgram(programId)
}

async function generatePhasePeriodization(phaseId, programId) {
  const { data: phase, error: phErr } = await db.from('program_phases').select('*').eq('id', phaseId).single()
  if (phErr || !phase) { showToast('Could not load phase', 'error'); return }
  if (!phase.periodization_type) { showToast('Set a periodization type first', 'error'); return }
  if (phase.duration_weeks < 2) { showToast('Phase must be at least 2 weeks to generate', 'error'); return }

  const { data: baseWorkouts, error: bwErr } = await db.from('program_phase_workouts')
    .select('*, workout_templates(id, name, description, is_personal, workout_template_exercises(*))')
    .eq('phase_id', phaseId).eq('week_number', 1)
  if (bwErr || !baseWorkouts?.length) { showToast('Add Week 1 sessions before generating', 'error'); return }

  if (!confirm(`Generate weeks 2–${phase.duration_weeks} from Week 1? This deletes any existing Week 2+ content for this phase — periodization-generated OR manually added/duplicated — and rebuilds it from Week 1.`)) return

  // Idempotent regeneration — clear any weeks generated by a previous run (or manually built via
  // "Duplicate week"/the add-workout grid) first: master rows + any already-propagated client copies
  await _cleanupPhaseWeeksBeyond(phaseId, 1, programId)

  const config = phase.periodization_config || {}
  const newInserts = []

  for (let week = 2; week <= phase.duration_weeks; week++) {
    for (const bw of baseWorkouts) {
      const tmpl = bw.workout_templates
      if (!tmpl) continue

      const { data: newTmpl, error: tErr } = await db.from('workout_templates')
        .insert({ coach_id: currentUser.id, program_id: null, client_id: null, generated_from_phase_id: phaseId, is_personal: tmpl.is_personal, name: `${tmpl.name} — W${week}`, description: tmpl.description || null })
        .select('id').single()
      if (tErr || !newTmpl) { log.error('generatePhasePeriodization', 'template clone failed', tErr); continue }

      const exs = (tmpl.workout_template_exercises || []).map(ex => {
        const sets = (ex.sets_json || []).map(s => {
          if (s.intensityMin == null && s.intensityMax == null) return s
          const pct = _computePeriodizedPct(phase.periodization_type, config, week, phase.duration_weeks, bw.tier)
          return pct == null ? s : { ...s, intensityMin: pct, intensityMax: pct }
        })
        return {
          template_id: newTmpl.id, exercise_id: ex.exercise_id || null, exercise_name: ex.exercise_name,
          exercise_type: ex.exercise_type, order_index: ex.order_index, sets: ex.sets || null,
          sets_json: sets, notes: ex.notes || null, superset_group: ex.superset_group || null
        }
      })
      if (exs.length) await db.from('workout_template_exercises').insert(exs)

      newInserts.push({
        phase_id: phaseId, day_of_week: bw.day_of_week, day_label: bw.day_label,
        session_order: bw.session_order, template_id: newTmpl.id, week_number: week,
        tier: bw.tier || null, notes: bw.notes
      })
    }
  }

  let propagated = 0
  if (newInserts.length) {
    const { data: insertedPws, error } = await db.from('program_phase_workouts').insert(newInserts).select('id, week_number, template_id')
    if (error) { log.error('generatePhasePeriodization', 'insert failed', error); showToast('Generation failed — see console', 'error'); return }

    // Propagate the newly generated weeks to any clients already assigned to this program —
    // otherwise their calendar/workouts page would show weeks 2+ as "Not set up" until reassigned.
    const { data: allAssignments } = await db.from('client_programs').select('id, client_id').eq('program_id', programId)
    const assignments = _propagationTargets(allAssignments)
    if (assignments?.length && insertedPws?.length) {
      const { data: fullPws } = await db.from('program_phase_workouts')
        .select('id, week_number, workout_templates(id, name, description, is_personal, workout_template_exercises(*))')
        .in('id', insertedPws.map(p => p.id))

      for (const assignment of assignments) {
        const cpwInserts = []
        for (const pw of (fullPws || [])) {
          const newTemplateId = await _cloneTemplateForClient(pw.workout_templates, assignment.client_id)
          if (!newTemplateId) continue
          cpwInserts.push({ client_program_id: assignment.id, program_phase_workout_id: pw.id, workout_template_id: newTemplateId, week_number: pw.week_number })
        }
        if (cpwInserts.length) {
          const { error: cpwErr } = await db.from('client_program_workouts').insert(cpwInserts)
          if (cpwErr) log.error('generatePhasePeriodization', 'client propagation failed', cpwErr, { clientId: assignment.client_id })
          else propagated++
        }
      }
    }
  }

  log.ok('generatePhasePeriodization', 'generated', { phaseId, weeks: phase.duration_weeks - 1, sessions: newInserts.length, propagatedToClients: propagated })
  showToast(`Generated weeks 2–${phase.duration_weeks} (${newInserts.length} sessions)${propagated ? `, synced to ${propagated} assigned client${propagated!==1?'s':''}` : ''}`, 'success')
  openProgram(programId)
}

// Deletes ONLY the templates this program/phase actually owns AND that nothing else still points at.
// Two separate questions, and both must be asked — they look alike but are not:
//   • ownership  — is this the program's own template (program_id) or its own periodization
//     week-clone (generated_from_phase_id)? A coach's reusable STANDALONE template merely slotted
//     into a week is not ours to delete: destroying it would rip it out of every other program too
//     (the exact deleteProgram() data-loss bug fixed 2026-07-10).
//   • live references — "Duplicate week" is cheap by design: the new week's rows share the SOURCE
//     week's template_id until someone forks on edit. So a template we DO own may still be needed by
//     a surviving row in another week.
// Callers must delete their own program_phase_workouts rows FIRST, so anything still referencing the
// template afterwards is a genuine survivor.
// `phaseIds` accepts a single id OR an array. It used to take one `phaseId` and .eq() it — which is
// precisely why deleteProgram (inherently multi-phase) COULDN'T use this helper and hand-rolled its
// own copy of the ownership check, which then drifted. Widening it to an array is what lets all five
// delete paths share one implementation, which is the only durable way to stop this class recurring.
//
// CALLERS MUST DELETE THEIR OWN program_phase_workouts ROWS FIRST. The still-referenced check below
// asks "does any surviving row still point at this template?" — so the rows you are tearing down have
// to be gone before you ask, or every template will look busy and none will be cleaned up.
async function _deleteOwnedUnreferencedTemplates(templateIds, programId, phaseIds) {
  const ids = [...new Set((templateIds || []).filter(Boolean))]
  if (!ids.length) return
  const phases = [...new Set((Array.isArray(phaseIds) ? phaseIds : [phaseIds]).filter(Boolean))]

  // (1) OWNERSHIP — ours only if this program created it (program_id), or one of OUR phases generated
  // it as a periodization week-clone (generated_from_phase_id; those carry program_id: null, so they
  // need this second clause or they survive as permanent orphans). A coach's reusable STANDALONE
  // template merely slotted into a week is NOT ours to delete — destroying it rips it out of every
  // other program using it (the deleteProgram data-loss bug, 2026-07-10).
  const clauses = []
  if (programId) clauses.push(`program_id.eq.${programId}`)
  if (phases.length) clauses.push(`generated_from_phase_id.in.(${phases.join(',')})`)
  if (!clauses.length) return

  const { data: owned, error } = await db.from('workout_templates').select('id').in('id', ids).or(clauses.join(','))
  if (error) { log.error('_deleteOwnedUnreferencedTemplates', 'ownership lookup failed', error); return }
  const ownedIds = (owned || []).map(t => t.id)
  if (!ownedIds.length) return

  // (2) LIVE REFERENCES — a DIFFERENT question from ownership, and the pair is why this helper exists.
  // "Duplicate week" is cheap by design: the new week's rows share the SOURCE week's template_id until
  // someone forks on edit. So a template we genuinely own may still be needed by a surviving row.
  const { data: stillUsed } = await db.from('program_phase_workouts').select('template_id').in('template_id', ownedIds)
  const stillUsedIds = new Set((stillUsed || []).map(r => r.template_id))
  const safeToDelete = ownedIds.filter(id => !stillUsedIds.has(id))
  if (safeToDelete.length) await db.from('workout_templates').delete().in('id', safeToDelete)
}

// Deletes generated program_phase_workouts (+ the workout_templates it owns) beyond maxWeek for a
// Deletes the client-side copies of a set of program_phase_workouts slots — but ONLY for assignments
// the current view is actually allowed to touch (_propagationTargets). In Personal view the only
// legitimate target is the user's own solo self-assignment; a real client's plan must never be mutated
// by a Personal-view action.
//
// The ADDITIVE fan-out (generatePhasePeriodization, duplicatePhaseWeek) was given this guard; the
// DESTRUCTIVE fan-out was not. So a Personal-view "Generate weeks" deleted EVERY assigned client's
// weeks 2+ and then rebuilt only the solo copy — the delete was wide and the restore was narrow, and
// real clients silently lost their program. Both halves of the fan-out live in one helper now so they
// cannot diverge again. (Fix the class, not the instance — the 5th time this exact drift has bitten.)
async function _deleteClientCopiesForSlots(stalePwIds, programId) {
  if (!stalePwIds?.length) return

  const { data: staleCpws } = await db.from('client_program_workouts')
    .select('id, workout_template_id, client_program_id')
    .in('program_phase_workout_id', stalePwIds)
  if (!staleCpws?.length) return

  const { data: allAssignments } = await db.from('client_programs').select('id, client_id').eq('program_id', programId)
  const allowed = new Set(_propagationTargets(allAssignments).map(a => a.id))
  const deletable = staleCpws.filter(c => allowed.has(c.client_program_id))
  if (!deletable.length) return

  await db.from('client_program_workouts').delete().in('id', deletable.map(c => c.id))
  // Client clones are per-slot by construction (never shared), so these are always safe to remove.
  const cloneIds = deletable.map(c => c.workout_template_id).filter(Boolean)
  if (cloneIds.length) await db.from('workout_templates').delete().in('id', cloneIds)
}

// phase, along with any client-side copies already propagated from a previous generation.
async function _cleanupPhaseWeeksBeyond(phaseId, maxWeek, programId) {
  const { data: staleRows } = await db.from('program_phase_workouts').select('id, template_id').eq('phase_id', phaseId).gt('week_number', maxWeek)
  if (!staleRows?.length) return

  const stalePwIds = staleRows.map(r => r.id)
  const staleMasterTemplateIds = staleRows.map(r => r.template_id).filter(Boolean)

  await _deleteClientCopiesForSlots(stalePwIds, programId)

  await db.from('program_phase_workouts').delete().eq('phase_id', phaseId).gt('week_number', maxWeek)
  // Was an unguarded `delete().in('id', staleMasterTemplateIds)` — it deleted EVERY template a stale
  // week referenced, with no ownership or still-referenced check, unlike its sibling deletePhaseWeek.
  // That destroyed (a) a Week-1 workout whose template_id a duplicated Week 2 shared, and (b) any
  // standalone library template assigned into a later week, removing it from every program using it.
  // Found by multi-agent review 2026-07-11.
  await _deleteOwnedUnreferencedTemplates(staleMasterTemplateIds, programId, phaseId)
}

function _computePeriodizedPct(type, config, week, totalWeeks, tier) {
  if (type === 'linear') {
    const { startPct, endPct, deloadWeek, deloadPct } = config
    if (deloadWeek && week === deloadWeek && deloadPct != null) return Math.round(deloadPct)
    if (startPct == null || endPct == null) return null
    const denom = Math.max(totalWeeks - 1, 1)
    return Math.round(startPct + (endPct - startPct) * ((week - 1) / denom))
  }
  if (type === 'undulating') {
    const t = (config.tiers || {})[tier || 'moderate']
    return t?.pct != null ? Math.round(t.pct) : null
  }
  return null
}

async function loadAllPhaseWorkouts(phases) {
  // One batched fetch for all phases instead of a sequential per-phase round-trip —
  // programs with many phases (e.g. Hyrox Hero's 12) were queuing up 12 awaits in a row.
  const phaseIds = phases.map(ph => ph.id)
  const { data: allPws, error: pwsError } = await db.from('program_phase_workouts').select('*, workout_templates(name, workout_template_exercises(exercise_name, order_index, sets_json))').in('phase_id', phaseIds).order('week_number').order('day_of_week').order('session_order')
  if (pwsError) log.error('loadAllPhaseWorkouts', 'fetch failed', pwsError)
  const pwsByPhase = {}
  ;(allPws || []).forEach(pw => { (pwsByPhase[pw.phase_id] = pwsByPhase[pw.phase_id] || []).push(pw) })

  for (const ph of phases) {
    const el = document.getElementById(`phase-workouts-${ph.id}`)
    if (!el) continue
    // Callers sometimes reload with a minimal {id} shape (e.g. after adding/removing one
    // workout) — look up the full phase record for duration_weeks rather than assuming it's present.
    const fullPhase = (window._openProgramPhases || []).find(p => p.id === ph.id) || ph
    const durationWeeks = fullPhase.duration_weeks || 1

    const pws = pwsByPhase[ph.id] || []
    const byWeek = {}
    pws.forEach(pw => { (byWeek[pw.week_number || 1] = byWeek[pw.week_number || 1] || []).push(pw) })
    const weekNums = Object.keys(byWeek).map(Number).sort((a, b) => a - b)
    if (!weekNums.length) weekNums.push(1)

    // Weeks are tabs — one week on screen at a time. Active week persists per phase across the
    // re-renders that add/remove/duplicate/delete trigger (all reload via loadAllPhaseWorkouts).
    // Clamp to a valid week so deleting the active one can't leave a dangling selection.
    window._builderActiveWeek = window._builderActiveWeek || {}
    window._builderWeekData = window._builderWeekData || {}
    const stored = window._builderActiveWeek[ph.id]
    const active = weekNums.includes(stored) ? stored : weekNums[0]
    window._builderActiveWeek[ph.id] = active
    // Cache this phase's per-week data so the tab handler can re-render one week without a refetch.
    window._builderWeekData[ph.id] = { phase: fullPhase, byWeek }

    const tabsHtml = weekNums.length > 1
      ? `<div class="week-tabs">${weekNums.map(w => `<button class="week-tab" data-phase="${ph.id}" data-week="${w}" aria-selected="${w === active}" onclick="_selectBuilderWeek('${ph.id}',${w})"><span class="wt-n">WEEK</span>${w}</button>`).join('')}</div>`
      : ''
    // Only the active week's grid is in the DOM at once — keeps the day/add/remove controls unambiguous
    // (one set on screen) and avoids duplicating a whole phase's grid per week.
    el.innerHTML = tabsHtml + `<div class="bw-week" id="phase-week-${ph.id}" data-phase="${ph.id}">${renderPhaseWeekGrid(fullPhase, active, byWeek[active] || [])}</div>`
  }
}

// Switch the visible week within a phase on the builder. Re-renders just the active week's grid from
// the data cached by loadAllPhaseWorkouts (no refetch); the choice persists across later re-renders.
function _selectBuilderWeek(phaseId, week) {
  window._builderActiveWeek = window._builderActiveWeek || {}
  window._builderActiveWeek[phaseId] = week
  const d = window._builderWeekData?.[phaseId]
  const container = document.getElementById('phase-week-' + phaseId)
  if (d && container) container.innerHTML = renderPhaseWeekGrid(d.phase, week, d.byWeek[week] || [])
  document.querySelectorAll(`.week-tab[data-phase="${phaseId}"]`).forEach(b => {
    b.setAttribute('aria-selected', Number(b.dataset.week) === week)
  })
}

// Every week (1, or any manually-duplicated/periodization-generated week beyond it) renders through
// this one grid — each day has its own always-visible native search + select; picking a template
// assigns it immediately, no modal, no separate day/session step. "Duplicate week" copies a week's
// day/workout assignments into the next empty week slot (see duplicatePhaseWeek below).
function renderPhaseWeekGrid(phase, weekNum, sessions) {
  const dayLabels = ['MON','TUE','WED','THU','FRI','SAT','SUN']
  const tierColor = { heavy: '#ef4444', moderate: '#f59e0b', light: '#10b981' }
  const byDay = {}
  sessions.forEach(pw => { (byDay[pw.day_of_week] = byDay[pw.day_of_week] || []).push(pw) })

  // A slotted workout: tap the head to reveal its exercises inline + Edit / Remove (no slider —
  // matches the read Workouts page). Exercises come from the embed extended in loadAllPhaseWorkouts.
  const slotHtml = (pw, multi) => {
    const name = pw.workout_templates?.name || 'Unknown'
    const exs = [...(pw.workout_templates?.workout_template_exercises || [])].sort((a, b) => a.order_index - b.order_index)
    const exHtml = exs.length
      ? exs.map(ex => `<div class="pwk-ex"><span>${escapeHtml(ex.exercise_name)}</span><span class="s">${ex.sets_json?.length || 0} set${(ex.sets_json?.length || 0) !== 1 ? 's' : ''}</span></div>`).join('')
      : '<div class="pwk-ex" style="color:var(--text-muted)">No exercises yet</div>'
    return `<div class="pwk-slot">
      <div class="pwk-slot-head" role="button" tabindex="0" onclick="_toggleBuilderSlot('${pw.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();_toggleBuilderSlot('${pw.id}')}">
        ${pw.tier ? `<span class="pwk-tier" style="color:${tierColor[pw.tier]}">${pw.tier[0].toUpperCase()}</span>` : ''}
        ${multi ? `<span class="pwk-ampm">${pw.session_order === 2 ? 'PM' : 'AM'}</span>` : ''}
        <span class="pwk-slot-name">${escapeHtml(name)}</span>
        <svg id="pwk-chev-${pw.id}" class="pwk-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="pwk-slot-body" id="pwk-body-${pw.id}" style="display:none">
        ${exHtml}
        <div class="pwk-slot-actions">
          <button class="pwk-act edit" onclick="_editPhaseWorkout('${pw.template_id}','${pw.id}')">✎ Edit workout</button>
          <button class="pwk-act remove" onclick="removePhaseWorkout('${pw.id}','${phase.id}')">✕ Remove</button>
        </div>
        <button class="pwk-act" style="width:100%;margin-top:6px;color:var(--text-muted)" onclick="saveTemplateToLibrary('${pw.template_id}',this)" title="Make this workout reusable in any program">Save to Library</button>
      </div>
    </div>`
  }

  return `
    <div class="pwk-weekhead">
      ${sessions.length ? `<button class="btn-secondary" style="font-size:11px;padding:3px 9px" onclick="duplicatePhaseWeek('${phase.id}',${weekNum})">Duplicate week</button>` : ''}
      ${sessions.length ? `<button class="btn-secondary" style="font-size:11px;padding:3px 9px;color:#ef4444" onclick="deletePhaseWeek('${phase.id}',${weekNum})">Delete week</button>` : ''}
    </div>
    <div class="pwk-days">
      ${dayLabels.map((label, i) => {
        const dayNum = i + 1
        const daySessions = (byDay[dayNum] || []).sort((a, b) => a.session_order - b.session_order)
        const multi = daySessions.length > 1
        const canAdd = daySessions.length < 2
        const nextSessionOrder = daySessions.length + 1
        return `<div class="pwk-day">
          <div class="pwk-dow">${label}</div>
          ${daySessions.map(pw => slotHtml(pw, multi)).join('')}
          ${canAdd ? `<button class="pwk-add pwg-add" data-phase="${phase.id}" data-day="${dayNum}" data-session="${nextSessionOrder}" data-week="${weekNum}" onclick="_openWorkoutPicker('${phase.id}',${dayNum},${nextSessionOrder},${weekNum})">+ Add workout…</button>` : ''}
        </div>`
      }).join('')}
    </div>`
}

// Expand/collapse a builder workout slot to preview its exercises + Edit/Remove actions.
function _toggleBuilderSlot(pwId) {
  const body = document.getElementById('pwk-body-' + pwId)
  const chev = document.getElementById('pwk-chev-' + pwId)
  if (!body) return
  const open = body.style.display !== 'none'
  body.style.display = open ? 'none' : 'block'
  if (chev) chev.style.transform = open ? 'rotate(0deg)' : 'rotate(180deg)'
}

// Edit a program-slotted workout: hand off to the full template editor with the program back-context —
// the same ctx the session-detail slider used to pass, so the propagate-to-clients prompt still fires on save.
function _editPhaseWorkout(templateId, phaseWorkoutId) {
  const programId = window._openProgramId
  openTemplate(templateId, { backLabel: 'Back to program', backFn: () => openProgram(programId), programId, phaseWorkoutId })
}

// Copies a week's day→workout assignments into the next empty week slot (up to the phase's
// duration_weeks) as real, independent program_phase_workouts rows — not a display-only repeat.
// Cheap by design: new rows point at the SAME template_id as the source week; they only become
// independent workouts once someone actually edits one (see _resolveEditableTemplateId in app-workouts.js).
async function duplicatePhaseWeek(phaseId, sourceWeek) {
  const phase = (window._openProgramPhases || []).find(p => p.id === phaseId)
  const durationWeeks = phase?.duration_weeks || 1

  const { data: existingWeeks } = await db.from('program_phase_workouts').select('week_number').eq('phase_id', phaseId)
  const maxWeek = Math.max(1, ...(existingWeeks || []).map(w => w.week_number || 1))
  const targetWeek = maxWeek + 1

  const { data: sourceRows, error } = await db.from('program_phase_workouts').select('*').eq('phase_id', phaseId).eq('week_number', sourceWeek)
  if (error || !sourceRows?.length) { showToast('Could not load that week', 'error'); return }

  const inserts = sourceRows.map(r => ({
    phase_id: phaseId, day_of_week: r.day_of_week, day_label: r.day_label,
    session_order: r.session_order, template_id: r.template_id, week_number: targetWeek, tier: r.tier || null
  }))
  const { data: insertedPws, error: insErr } = await db.from('program_phase_workouts').insert(inserts).select('id, day_of_week, session_order')
  if (insErr) { log.error('duplicatePhaseWeek', 'insert failed', insErr); showToast('Could not duplicate week', 'error'); return }

  // "Repeat this week" should just work. This used to bail with "no more weeks to fill" when the
  // phase was already full (and the button was hidden outright on a 1-week phase), forcing the user
  // to go raise the phase duration first with no hint that's what was needed. Growing the phase IS
  // what duplicating its last week means, so do it for them.
  // Deliberately AFTER the insert: bumping duration_weeks first would, on a failed copy, leave the
  // phase permanently claiming a week that has no sessions in it — and for an already-assigned
  // client that silently lengthens their program and shifts every later phase out by a week.
  let extendedTo = null
  if (targetWeek > durationWeeks) {
    const { error: durErr } = await db.from('program_phases').update({ duration_weeks: targetWeek }).eq('id', phaseId)
    if (durErr) log.error('duplicatePhaseWeek', 'duration extend failed', durErr) // sessions exist either way — don't discard them
    else {
      if (phase) phase.duration_weeks = targetWeek // keep the in-memory phase in sync for this render pass
      extendedTo = targetWeek
    }
  }

  // Propagate to already-assigned clients — clone a fresh client-owned copy per new slot, same
  // pattern as _cloneProgramForClient/generatePhasePeriodization (never share a client clone across slots).
  const programId = window._openProgramId
  const { data: allAssignments } = await db.from('client_programs').select('id, client_id').eq('program_id', programId)
  const assignments = _propagationTargets(allAssignments)
  if (assignments?.length) {
    const { data: fullSourceRows } = await db.from('program_phase_workouts')
      // `is_personal` MUST be in this projection. A nested explicit column list is an ALLOWLIST — an
      // omitted column comes back `undefined`, supabase-js drops undefined keys from the insert
      // payload, and the clone silently falls back to the DB default instead of inheriting. Silent at
      // every layer (les-036). Both sibling embeds already list it.
      .select('id, day_of_week, session_order, workout_templates(id, name, description, is_personal, workout_template_exercises(*))')
      .in('id', sourceRows.map(r => r.id))
    for (const a of assignments) {
      const cpwInserts = []
      for (const srcRow of (fullSourceRows || [])) {
        const newPw = insertedPws.find(p => p.day_of_week === srcRow.day_of_week && p.session_order === srcRow.session_order)
        if (!newPw || !srcRow.workout_templates) continue
        const newTemplateId = await _cloneTemplateForClient(srcRow.workout_templates, a.client_id)
        if (!newTemplateId) continue
        cpwInserts.push({ client_program_id: a.id, program_phase_workout_id: newPw.id, workout_template_id: newTemplateId, week_number: targetWeek })
      }
      if (cpwInserts.length) await db.from('client_program_workouts').insert(cpwInserts)
    }
  }

  showToast(extendedTo
    ? `Week ${sourceWeek} duplicated to Week ${targetWeek} — phase extended to ${extendedTo} week${extendedTo === 1 ? '' : 's'}`
    : `Week ${sourceWeek} duplicated to Week ${targetWeek}`, 'success')
  // Full re-render (not just loadAllPhaseWorkouts) — when the phase was extended, its duration and
  // the program's "N weeks total" header both changed, and only openProgram redraws those.
  // Land on the week we just created (the tab render reads this on reload).
  window._builderActiveWeek = window._builderActiveWeek || {}
  window._builderActiveWeek[phaseId] = targetWeek
  if (extendedTo && window._openProgramId) openProgram(window._openProgramId)
  else loadAllPhaseWorkouts([{ id: phaseId }])
}

// Deletes one week from a phase entirely — its own program_phase_workouts (+ the templates it
// actually owns) and any client-propagated copies + their clones, then renumbers every later
// week down by 1 so slots stay contiguous (matches "Duplicate week"'s existing expectation).
// Same 4-step cleanup pattern as _cleanupPhaseWeeksBeyond, filtered to exactly this week instead
// of everything beyond a cutoff -- plus the same ownership check deleteProgram() uses (program_id
// or generated_from_phase_id match), since a slot can reference a shared standalone template the
// coach reuses elsewhere; deleting this week must not destroy that.
async function deletePhaseWeek(phaseId, weekNumber) {
  if (!confirm(`Delete Week ${weekNumber}? This removes every session in this week and cannot be undone. Later weeks will shift down.`)) return

  const programId = window._openProgramId
  const { data: staleRows } = await db.from('program_phase_workouts').select('id, template_id').eq('phase_id', phaseId).eq('week_number', weekNumber)
  const stalePwIds = (staleRows || []).map(r => r.id)
  const staleTemplateIds = [...new Set((staleRows || []).map(r => r.template_id).filter(Boolean))]

  if (stalePwIds.length) {
    await _deleteClientCopiesForSlots(stalePwIds, programId)
    await db.from('program_phase_workouts').delete().eq('phase_id', phaseId).eq('week_number', weekNumber)

    // Shared with _cleanupPhaseWeeksBeyond — both must apply the ownership AND still-referenced
    // checks, and keeping them in one helper is what stops the two from silently diverging again
    // (they did: this one got the guards on 2026-07-10, the other didn't until 2026-07-11).
    await _deleteOwnedUnreferencedTemplates(staleTemplateIds, programId, phaseId)
  }

  // Renumber every later week down by 1 -- master rows first, then any client-propagated copies
  // of those same rows. client_program_workouts carries its own week_number column (used by
  // periodization display), kept in sync via program_phase_workout_id rather than re-derived,
  // since a client copy can be created at a different time than the master row it points at.
  const { data: laterMaster } = await db.from('program_phase_workouts').select('id, week_number').eq('phase_id', phaseId).gt('week_number', weekNumber)
  for (const row of laterMaster || []) {
    await db.from('program_phase_workouts').update({ week_number: row.week_number - 1 }).eq('id', row.id)
  }
  const laterPwIds = (laterMaster || []).map(r => r.id)
  if (laterPwIds.length) {
    const { data: laterCpws } = await db.from('client_program_workouts').select('id, week_number').in('program_phase_workout_id', laterPwIds)
    for (const cpw of laterCpws || []) {
      await db.from('client_program_workouts').update({ week_number: cpw.week_number - 1 }).eq('id', cpw.id)
    }
  }

  const phase = (window._openProgramPhases || []).find(p => p.id === phaseId)
  const newDuration = Math.max(1, (phase?.duration_weeks || 1) - 1)
  await db.from('program_phases').update({ duration_weeks: newDuration }).eq('id', phaseId)
  if (phase) phase.duration_weeks = newDuration

  showToast(`Week ${weekNumber} deleted`, 'success')
  loadAllPhaseWorkouts([{ id: phaseId }])
}

// ─── Workout picker (program phase day-slot) ─────────────────────────────────
// Replaces the old native <select> + sibling filter input. A <select>'s <option> can only hold
// plain text, which is exactly why a coach with three "Upper Body" workouts couldn't tell them
// apart when assigning one (Jake, 2026-07-11) — and it also gave no visible feedback until opened,
// and grew unmanageable as the library grew (both tracked as open complaints since 2026-07-03).
// A tap-row list fixes all three: each row can show name + description + the exercises inside it.
// Deliberately mirrors _openExercisePicker (app-workouts.js) — same modal shape, same live-filter,
// same visualViewport height sync for the mobile keyboard. Same component family, no new patterns.
let _workoutPickerState = null

// Rebuilds window._programTemplates (the picker's pool) without redrawing the page. Needed after a
// copy-to-Library: only openProgram() builds that pool, so without this the workout you just copied
// wouldn't appear in the picker on the page you're standing on — making the "you can now reuse it in
// any program" toast untrue until a reload. Mirrors openProgram's own query + shaping exactly.
async function _refreshProgramTemplates() {
  if (!window._openProgramId) return
  const { data: templates } = await db.from('workout_templates')
    .select('id, name, description, workout_template_exercises(exercise_name, order_index)')
    .eq('coach_id', currentUser.id)
    .is('client_id', null).is('program_id', null).is('generated_from_phase_id', null)
    .eq('is_personal', currentProfile?.role === 'solo')
    .order('name')
  window._programTemplates = (templates || []).map(t => {
    const exs = [...(t.workout_template_exercises || [])].sort((a, b) => a.order_index - b.order_index)
    const names = exs.map(e => e.exercise_name)
    const preview = names.length ? names.slice(0, 3).join(', ') + (names.length > 3 ? ` +${names.length - 3} more` : '') : ''
    return { id: t.id, name: t.name, description: t.description || '', _exPreview: preview, _exCount: names.length }
  })
}

function _openWorkoutPicker(phaseId, dayOfWeek, sessionOrder, weekNumber) {
  // Re-entrancy guard, same as _openExercisePicker's. Without it a fast double-tap appends a SECOND
  // overlay sharing the same element ids — getElementById then resolves to the buried first copy, so
  // results render into the hidden modal while the visible one stays empty, and one close leaves a
  // dead overlay behind. That exact double-tap race froze the runner's picker on 2026-07-04.
  if (document.getElementById('workout-picker-modal')) return
  _workoutPickerState = { phaseId, dayOfWeek, sessionOrder, weekNumber }

  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.id = 'workout-picker-modal'
  overlay.innerHTML = `
    <div class="modal" id="wkp-modal-box" style="max-width:480px;height:70vh;max-height:85vh;display:flex;flex-direction:column">
      <div class="modal-header">
        <h2 class="modal-title">Add workout</h2>
        <button class="modal-close" onclick="_closeWorkoutPicker()">✕</button>
      </div>
      <input class="field-input" id="wkp-search" placeholder="Search your workouts…" style="margin-bottom:14px" autocomplete="off" oninput="_renderWorkoutPickerResults(this.value)">
      <div id="wkp-results" style="overflow-y:auto;flex:1"></div>
    </div>
  `
  mountModal(overlay)
  document.getElementById('wkp-search').focus()
  if (window.visualViewport) {
    _syncWorkoutPickerHeight()
    window.visualViewport.addEventListener('resize', _syncWorkoutPickerHeight)
  }
  _renderWorkoutPickerResults('')
}

function _syncWorkoutPickerHeight() {
  const box = document.getElementById('wkp-modal-box')
  if (!box || !window.visualViewport) return
  const vh = window.visualViewport.height
  box.style.height = Math.round(vh * 0.7) + 'px'
  box.style.maxHeight = Math.round(vh * 0.85) + 'px'
}

function _closeWorkoutPicker() {
  if (window.visualViewport) window.visualViewport.removeEventListener('resize', _syncWorkoutPickerHeight)
  _workoutPickerState = null
  document.getElementById('workout-picker-modal')?.remove()
}

function _renderWorkoutPickerResults(query) {
  const resultsEl = document.getElementById('wkp-results')
  if (!resultsEl || !_workoutPickerState) return
  const q = (query || '').trim().toLowerCase()
  const all = window._programTemplates || []
  const matches = q
    ? all.filter(t => (t.name + ' ' + (t.description || '') + ' ' + (t._exPreview || '')).toLowerCase().includes(q))
    : all

  const createRow = `<div onclick="_createWorkoutFromPicker()" style="padding:12px;border:1.5px dashed var(--accent);border-radius:10px;background:rgba(99,102,241,.06);color:var(--accent);font-weight:600;font-size:14px;cursor:pointer;margin-bottom:12px">＋ Create new workout (this day only)</div>`

  // Name + description + exercise preview is what makes three same-named workouts distinguishable.
  const rowHtml = t => `
    <div onclick="_pickWorkout('${t.id}')" style="padding:12px 4px;border-bottom:1px solid var(--border);cursor:pointer;min-height:44px">
      <div style="font-size:14px;font-weight:600">${escapeHtml(t.name)}</div>
      ${t.description ? `<div style="font-size:12px;color:var(--text-muted);margin-top:2px">${escapeHtml(t.description)}</div>` : ''}
      ${t._exPreview ? `<div style="font-size:11px;color:var(--text-muted);margin-top:3px">${escapeHtml(t._exPreview)}</div>` : '<div style="font-size:11px;color:var(--text-muted);margin-top:3px;font-style:italic">No exercises yet</div>'}
    </div>`

  resultsEl.innerHTML = `
    ${createRow}
    ${matches.length
      ? matches.map(rowHtml).join('')
      : `<div class="empty-state" style="padding:20px 0"><div class="empty-text">${q ? 'No workouts match that search.' : 'No reusable workouts yet — build one in Workouts → Templates, or create one for this day above.'}</div></div>`}
  `
}

function _createWorkoutFromPicker() {
  const s = _workoutPickerState
  if (!s) return
  _closeWorkoutPicker()
  showCreateTemplateModal({ phaseId: s.phaseId, dayOfWeek: s.dayOfWeek, weekNumber: s.weekNumber, programId: window._openProgramId || null })
}

function _pickWorkout(templateId) {
  const s = _workoutPickerState
  if (!s) return
  _closeWorkoutPicker()
  _quickAssignPhaseWorkout(s, templateId)
}

async function _quickAssignPhaseWorkout(slot, templateId) {
  const { phaseId, dayOfWeek, sessionOrder, weekNumber } = slot
  if (!templateId) return

  // sessionOrder was computed from the grid's state as of its last render, which can go stale
  // under concurrent edits (two tabs, or two fast picks before the refresh below completes) —
  // re-check the slot is still free immediately before inserting.
  const { data: existing } = await db.from('program_phase_workouts').select('id').eq('phase_id', phaseId).eq('week_number', weekNumber).eq('day_of_week', dayOfWeek).eq('session_order', sessionOrder)
  if (existing?.length) {
    showToast('That slot was just filled — refreshing…', 'error')
    loadAllPhaseWorkouts([{ id: phaseId }])
    return
  }

  const dayLabels = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const { error } = await db.from('program_phase_workouts').insert({
    phase_id: phaseId, day_of_week: dayOfWeek, day_label: dayLabels[dayOfWeek], template_id: templateId, session_order: sessionOrder, week_number: weekNumber
  })
  if (error) { log.error('_quickAssignPhaseWorkout', 'insert failed', error); showToast('Could not assign workout — try again', 'error'); return }
  loadAllPhaseWorkouts([{ id: phaseId }])
}

async function removePhaseWorkout(pwId, phaseId) {
  // Removing the slot used to leave its template behind. If that template was created inline via
  // "+ Create new workout (this day only)" it carries program_id, which EXCLUDES it from the reusable
  // library list — so it became unreachable debris the moment its only slot was removed. deleteProgram
  // could not clean it up later either: that sweep only collects template_ids from SURVIVING slot rows.
  const { data: pw } = await db.from('program_phase_workouts').select('template_id').eq('id', pwId).maybeSingle()
  const programId = window._openProgramId || null

  await _deleteClientCopiesForSlots([pwId], programId)
  const { error } = await dbq('removePhaseWorkout', db.from('program_phase_workouts').delete().eq('id', pwId))
  if (error) return
  // After the slot is gone, so a template still referenced by a sibling week is correctly spared.
  if (pw?.template_id) await _deleteOwnedUnreferencedTemplates([pw.template_id], programId, phaseId)

  loadAllPhaseWorkouts([{ id: phaseId }])
}

