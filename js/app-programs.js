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

  const clientName = (clientData?.full_name || 'Client').replace(/'/g, "\\'")

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
                                    <span style="font-size:12px">${ex.exercise_name}</span>
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
                      <span style="font-size:11px;color:var(--text-muted);margin-left:8px">${phase.duration_weeks}w · ${allSessions.length} session${allSessions.length !== 1 ? 's' : ''}</span>
                    </div>
                    <svg id="${panelId}-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;color:var(--text-muted);transition:transform .2s;transform:rotate(0deg)"><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                  <div id="${panelId}" style="display:none">
                    ${!showWeeks ? renderDays(weekMap[weekNums[0]], panelId) : weekNums.map(w => `
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
        <button class="btn-primary" onclick="saveAssignProgram('${targetClientId}')">Assign</button>
      </div>
    </div>
  `
  document.body.appendChild(overlay)

  db.from('programs').select('id, name').eq('coach_id', currentUser.id).order('name').then(({ data }) => {
    const sel = document.getElementById('ap-program')
    if (!sel) return
    ;(data || []).forEach(p => {
      const opt = document.createElement('option')
      opt.value = p.id
      opt.textContent = p.name
      sel.appendChild(opt)
    })
  })
}

async function saveAssignProgram(clientId) {
  const programId = document.getElementById('ap-program').value
  const startDate = document.getElementById('ap-start').value || null
  const errorEl   = document.getElementById('ap-error')

  if (!programId) { errorEl.textContent = 'Please select a program'; return }

  const { data: cp, error } = await db.from('client_programs').insert({
    client_id: clientId,
    program_id: programId,
    start_date: startDate || null
  }).select('id').single()

  if (error) { log.error('saveAssignProgram', 'insert failed', error); errorEl.textContent = error.message; return }
  await _saveMissingOneRMEntries(clientId)
  closeModal('assign-program-modal')
  _cloneProgramForClient(cp.id, programId, clientId)
  renderClientPrograms(clientId, document.getElementById('tab-content'))
}

// Clones one master workout_template (+ its exercises) into a client-owned copy. Returns the new template id, or null on failure.
async function _cloneTemplateForClient(tmpl, clientId) {
  if (!tmpl) return null
  const { data: newTmpl, error: tErr } = await db
    .from('workout_templates')
    .insert({ coach_id: currentUser.id, client_id: clientId, program_id: null, name: tmpl.name, description: tmpl.description || null })
    .select('id').single()
  if (tErr || !newTmpl) { log.error('_cloneTemplateForClient', 'template clone failed', tErr); return null }

  const exs = (tmpl.workout_template_exercises || []).map(ex => ({
    template_id: newTmpl.id,
    exercise_id: ex.exercise_id || null,
    exercise_name: ex.exercise_name,
    exercise_type: ex.exercise_type,
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
    .select('id, program_phase_workouts(id, template_id, week_number, workout_templates(id, name, description, workout_template_exercises(*)))')
    .eq('program_id', programId)
    .order('order_index')

  if (phErr || !phases?.length) { log.error('_cloneProgramForClient', 'phase fetch failed', phErr); return }

  const cpwInserts = []

  for (const phase of phases) {
    for (const pw of (phase.program_phase_workouts || [])) {
      const newTemplateId = await _cloneTemplateForClient(pw.workout_templates, clientId)
      if (!newTemplateId) continue
      cpwInserts.push({ client_program_id: clientProgramId, program_phase_workout_id: pw.id, workout_template_id: newTemplateId, week_number: pw.week_number })
    }
  }

  if (cpwInserts.length) {
    const { error } = await db.from('client_program_workouts').insert(cpwInserts)
    if (error) log.error('_cloneProgramForClient', 'cpw insert failed', error)
  }

  log.ok('_cloneProgramForClient', `cloned ${cpwInserts.length} workouts`, { clientId, programId })
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
  const { error } = await db.from('client_programs').delete().eq('id', assignmentId)
  if (error) { log.error('unassignProgram', 'delete failed', error); return }
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
  document.body.appendChild(overlay)
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
        <button class="btn-primary" onclick="saveAssignProgramToClient('${programId}','${isSolo ? window._soloClientId : ''}')">Assign</button>
      </div>
    </div>`

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
  document.body.appendChild(overlay)

  if (!isSolo) {
    const { data: clients } = await db.from('clients').select('id, full_name').eq('coach_id', currentUser.id).order('full_name')
    const sel = document.getElementById('apc-client')
    if (sel) sel.innerHTML = '<option value="">Select client…</option>' + (clients || []).map(c => `<option value="${c.id}">${c.full_name}</option>`).join('')
  } else if (window._soloClientId) {
    _refreshMissingOneRMs(programId, window._soloClientId, 'apc-missing-1rm')
  }
}

async function saveAssignProgramToClient(programId, soloClientId) {
  const errEl = document.getElementById('apc-error')
  const clientId = soloClientId || document.getElementById('apc-client')?.value
  const startDate = document.getElementById('apc-start').value || null
  if (!clientId) { errEl.textContent = 'Please select a client'; return }
  const { data: cp, error } = await db.from('client_programs').insert({ client_id: clientId, program_id: programId, start_date: startDate || null }).select('id').single()
  if (error) { errEl.textContent = error.message; return }
  await _saveMissingOneRMEntries(clientId)
  document.getElementById('apc-modal')?.remove()
  _cloneProgramForClient(cp.id, programId, clientId)
  if (soloClientId) showToast('Program added to your plan', 'success')
}

// ─── PROGRAMS ─────────────────────────────────────────────────────────────────
async function renderPrograms(el) {
  log.info('renderPrograms', 'fetching programs')
  el.innerHTML = '<div class="loading-state">Loading…</div>'

  const { data: programs, error } = await db
    .from('programs')
    .select('id, name, description, created_at, program_phases(id)')
    .eq('coach_id', currentUser.id)
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
        <div class="empty-text">${currentProfile?.role === 'solo' ? 'Create a program to plan your own training.' : 'Create a program to organise training phases for your clients.'}</div>
        <button class="btn-primary" onclick="showCreateProgramModal()">+ Create program</button>
      </div>
    ` : `
      <div class="list">
        ${programs.map(p => `
          <div class="list-row" onclick="openProgram('${p.id}')">
            <div style="width:40px;height:40px;border-radius:10px;background:rgba(99,102,241,.12);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">📋</div>
            <div class="row-info">
              <div class="row-name">${p.name}</div>
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
    db.from('programs').select('id, name, description, created_at, program_phases(id, name, duration_weeks, order_index, periodization_type, periodization_config)').eq('id', programId).single(),
    // .is('program_id', null) excludes templates already created inline for a specific day slot
    // ("+ Create new workout") -- without it, every one-off slot creation stayed in this reuse
    // pool forever, ballooning the picker with indistinguishable same-named entries the coach had
    // no way to tell apart (found live, 2026-07-10: a 12-phase program's picker showed the same
    // "Lower Body - Dynamic Effort" name 4+ times with no indication which day each belonged to).
    // To genuinely reuse one workout across multiple days, build it once in the Workouts library.
    db.from('workout_templates').select('id, name, workout_template_exercises(exercise_name, order_index)').eq('coach_id', currentUser.id).is('client_id', null).is('program_id', null).is('generated_from_phase_id', null).order('name'),
  ])

  if (error) { log.error('openProgram', 'fetch failed', error); el.innerHTML = `<div class="loading-state">${error.message}</div>`; return }

  const phases = (program.program_phases || []).sort((a, b) => a.order_index - b.order_index)
  const totalWeeks = phases.reduce((sum, p) => sum + p.duration_weeks, 0)
  window._programTemplates = (templates || []).map(t => {
    const exs = [...(t.workout_template_exercises || [])].sort((a, b) => a.order_index - b.order_index)
    const names = exs.map(e => e.exercise_name)
    const preview = names.length ? names.slice(0, 3).join(', ') + (names.length > 3 ? ` +${names.length - 3} more` : '') : ''
    return { id: t.id, name: t.name, _exPreview: preview }
  })
  window._openProgramId = programId
  window._openProgramPhases = phases

  el.innerHTML = `
    <div style="margin-bottom:20px">
      <a href="#" onclick="navigate('programs');return false" style="font-size:13px;color:var(--accent);display:inline-flex;align-items:center;gap:4px;margin-bottom:12px">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><polyline points="15 18 9 12 15 6"/></svg>
        All programs
      </a>
      <h1 class="page-title" style="margin-bottom:4px">${program.name}</h1>
      ${program.description ? `<p style="color:var(--text-muted);font-size:14px">${program.description}</p>` : ''}
      <p style="font-size:12px;color:var(--text-muted);margin-top:4px">${phases.length} phase${phases.length !== 1 ? 's' : ''} · ${totalWeeks} week${totalWeeks !== 1 ? 's' : ''} total</p>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn btn-secondary" onclick="showEditProgramModal('${program.id}','${program.name.replace(/'/g,"\\'")}','${(program.description||'').replace(/'/g,"\\'")}')">Edit</button>
        <button class="btn btn-primary" onclick="showAssignProgramToClientModal('${program.id}')">${currentProfile?.role === 'solo' ? 'Add to my plan' : 'Assign to client'}</button>
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
                  <div style="font-weight:600;font-size:15px">${ph.name}</div>
                  <div style="font-size:12px;color:var(--text-muted)">${ph.duration_weeks} week${ph.duration_weeks !== 1 ? 's' : ''}</div>
                </div>
                <button class="btn-secondary" style="font-size:12px;padding:4px 10px" onclick="showEditPhaseForm('${program.id}','${ph.id}','${ph.name.replace(/'/g,"\\'")}',${ph.duration_weeks},${ph.order_index})">Edit</button>
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
    const { data, error } = await db.from('programs').insert({ coach_id: currentUser.id, name, description: desc || null }).select().single()
    if (error) { log.error('saveProgram', 'create failed', error); errorEl.textContent = error.message; return }
    log.ok('saveProgram', 'created', { id: data.id })
    closeProgramModal()
    openProgram(data.id)
  }
}

async function deleteProgram(programId) {
  const { data: assignedRows } = await db.from('client_programs').select('id, client_id').eq('program_id', programId)
  const soloId = window._soloClientId || null
  // A solo user's own self-assignment isn't "a client blocking deletion" — it's just their own plan.
  const blocking = (assignedRows || []).filter(r => r.client_id !== soloId)

  if (blocking.length) {
    const { data: blockingClients } = await db.from('clients').select('full_name').in('id', blocking.map(r => r.client_id))
    const names = (blockingClients || []).map(c => c.full_name).filter(Boolean).join(', ')
    showToast(`Assigned to ${names || `${blocking.length} client${blocking.length === 1 ? '' : 's'}`} — remove them from this program first.`, 'warn', 5000)
    return
  }

  if (!confirm('Delete this program, its phases, and its workout templates? This cannot be undone.')) return
  log.info('deleteProgram', 'deleting', { programId })

  // Only remaining assignment at this point (if any) is the user's own solo self-assignment —
  // clean it up (cascades to its client_program_workouts) before deleting the program itself.
  const soloAssignmentIds = (assignedRows || []).filter(r => r.client_id === soloId).map(r => r.id)
  if (soloAssignmentIds.length) await db.from('client_programs').delete().in('id', soloAssignmentIds)

  const { data: phases } = await db.from('program_phases').select('id').eq('program_id', programId)
  const phaseIds = (phases || []).map(p => p.id)
  if (phaseIds.length) {
    const { data: pws } = await db.from('program_phase_workouts').select('template_id').in('phase_id', phaseIds)
    const templateIds = [...new Set((pws || []).map(p => p.template_id).filter(Boolean))]
    if (templateIds.length) {
      // Only delete templates actually owned by this program -- either created for it directly
      // (program_id set to this program) or periodization-generated week clones from one of its
      // own phases (generated_from_phase_id in phaseIds; generatePhasePeriodization always
      // inserts these with program_id: null, so they need their own ownership check here or
      // they'd silently survive as orphans every time a periodized program is deleted). A slot
      // can also reference a shared standalone template (program_id AND generated_from_phase_id
      // both null) that the coach reuses elsewhere; deleting this program must not destroy that.
      const { data: owned, error: ownedErr } = await db.from('workout_templates').select('id')
        .in('id', templateIds)
        .or(`program_id.eq.${programId},generated_from_phase_id.in.(${phaseIds.join(',')})`)
      if (ownedErr) { log.error('deleteProgram', 'owned-template lookup failed', ownedErr); return }
      const ownedIds = (owned || []).map(t => t.id)
      if (ownedIds.length) {
        const { error: tErr } = await db.from('workout_templates').delete().in('id', ownedIds).or(`program_id.eq.${programId},generated_from_phase_id.in.(${phaseIds.join(',')})`)
        if (tErr) { log.error('deleteProgram', 'template cleanup failed', tErr); return }
      }
    }
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
    await _cleanupPhaseWeeksBeyond(phaseId, weeks)
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
  document.body.appendChild(overlay)
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
    .select('*, workout_templates(id, name, description, workout_template_exercises(*))')
    .eq('phase_id', phaseId).eq('week_number', 1)
  if (bwErr || !baseWorkouts?.length) { showToast('Add Week 1 sessions before generating', 'error'); return }

  if (!confirm(`Generate weeks 2–${phase.duration_weeks} from Week 1? This deletes any existing Week 2+ content for this phase — periodization-generated OR manually added/duplicated — and rebuilds it from Week 1.`)) return

  // Idempotent regeneration — clear any weeks generated by a previous run (or manually built via
  // "Duplicate week"/the add-workout grid) first: master rows + any already-propagated client copies
  await _cleanupPhaseWeeksBeyond(phaseId, 1)

  const config = phase.periodization_config || {}
  const newInserts = []

  for (let week = 2; week <= phase.duration_weeks; week++) {
    for (const bw of baseWorkouts) {
      const tmpl = bw.workout_templates
      if (!tmpl) continue

      const { data: newTmpl, error: tErr } = await db.from('workout_templates')
        .insert({ coach_id: currentUser.id, program_id: null, client_id: null, generated_from_phase_id: phaseId, name: `${tmpl.name} — W${week}`, description: tmpl.description || null })
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
    const { data: assignments } = await db.from('client_programs').select('id, client_id').eq('program_id', programId)
    if (assignments?.length && insertedPws?.length) {
      const { data: fullPws } = await db.from('program_phase_workouts')
        .select('id, week_number, workout_templates(id, name, description, workout_template_exercises(*))')
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

// Deletes generated program_phase_workouts (+ their workout_templates) beyond maxWeek for a phase,
// along with any client-side copies already propagated from a previous generation.
async function _cleanupPhaseWeeksBeyond(phaseId, maxWeek) {
  const { data: staleRows } = await db.from('program_phase_workouts').select('id, template_id').eq('phase_id', phaseId).gt('week_number', maxWeek)
  if (!staleRows?.length) return

  const stalePwIds = staleRows.map(r => r.id)
  const staleMasterTemplateIds = staleRows.map(r => r.template_id).filter(Boolean)

  const { data: staleCpws } = await db.from('client_program_workouts').select('id, workout_template_id').in('program_phase_workout_id', stalePwIds)
  if (staleCpws?.length) {
    await db.from('client_program_workouts').delete().in('id', staleCpws.map(c => c.id))
    const staleClientTemplateIds = staleCpws.map(c => c.workout_template_id).filter(Boolean)
    if (staleClientTemplateIds.length) await db.from('workout_templates').delete().in('id', staleClientTemplateIds)
  }

  await db.from('program_phase_workouts').delete().eq('phase_id', phaseId).gt('week_number', maxWeek)
  if (staleMasterTemplateIds.length) await db.from('workout_templates').delete().in('id', staleMasterTemplateIds)
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
  const { data: allPws, error: pwsError } = await db.from('program_phase_workouts').select('*, workout_templates(name)').in('phase_id', phaseIds).order('week_number').order('day_of_week').order('session_order')
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
    const maxWeek = Math.max(1, ...weekNums)
    const canDuplicateAny = maxWeek < durationWeeks

    el.innerHTML = weekNums.map(w => `<div style="margin-bottom:10px">${renderPhaseWeekGrid(fullPhase, w, byWeek[w] || [], canDuplicateAny)}</div>`).join('')
  }
}

// Every week (1, or any manually-duplicated/periodization-generated week beyond it) renders through
// this one grid — each day has its own always-visible native search + select; picking a template
// assigns it immediately, no modal, no separate day/session step. "Duplicate week" copies a week's
// day/workout assignments into the next empty week slot (see duplicatePhaseWeek below).
function renderPhaseWeekGrid(phase, weekNum, sessions, canDuplicateAny) {
  const dayLabels = ['MON','TUE','WED','THU','FRI','SAT','SUN']
  const tierColor = { heavy: '#ef4444', moderate: '#f59e0b', light: '#10b981' }
  const byDay = {}
  sessions.forEach(pw => { (byDay[pw.day_of_week] = byDay[pw.day_of_week] || []).push(pw) })

  return `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
      <div style="font-size:11px;font-weight:700;color:var(--accent)">WEEK ${weekNum}</div>
      <div style="display:flex;gap:6px">
        ${canDuplicateAny && sessions.length ? `<button class="btn-secondary" style="font-size:11px;padding:3px 9px" onclick="duplicatePhaseWeek('${phase.id}',${weekNum})">Duplicate week</button>` : ''}
        ${sessions.length ? `<button class="btn-secondary" style="font-size:11px;padding:3px 9px;color:#ef4444" onclick="deletePhaseWeek('${phase.id}',${weekNum})">Delete week</button>` : ''}
      </div>
    </div>
    <div style="display:flex;gap:8px;overflow-x:auto;scroll-snap-type:x proximity;padding-bottom:4px;-webkit-overflow-scrolling:touch">
      ${dayLabels.map((label, i) => {
        const dayNum = i + 1
        const daySessions = (byDay[dayNum] || []).sort((a, b) => a.session_order - b.session_order)
        const canAdd = daySessions.length < 2
        const nextSessionOrder = daySessions.length + 1
        return `<div style="flex:0 0 132px;scroll-snap-align:start;background:var(--surface-2);border-radius:10px;padding:8px">
          <div style="font-size:10px;font-weight:700;color:var(--text-muted);margin-bottom:6px">${label}</div>
          ${daySessions.map(pw => `
            <div style="display:flex;align-items:center;gap:4px;background:var(--surface);border-radius:6px;padding:5px 6px;margin-bottom:4px">
              ${pw.tier ? `<span style="font-size:8px;font-weight:700;color:${tierColor[pw.tier]};flex-shrink:0">${pw.tier[0].toUpperCase()}</span>` : ''}
              ${daySessions.length > 1 ? `<span style="font-size:8px;font-weight:700;color:var(--accent);flex-shrink:0">${pw.session_order===2?'PM':'AM'}</span>` : ''}
              <span style="font-size:11px;font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer" onclick="openSessionDetail('${pw.template_id}','${(pw.workout_templates?.name || 'Session').replace(/'/g, "\\'")}',{backLabel:'Back to program',backFn:()=>openProgram('${window._openProgramId}'),programId:'${window._openProgramId}',phaseWorkoutId:'${pw.id}'})">${escapeHtml(pw.workout_templates?.name || 'Unknown')}</span>
              <button onclick="removePhaseWorkout('${pw.id}','${phase.id}')" style="font-size:11px;color:var(--text-muted);background:none;border:none;cursor:pointer;padding:0;flex-shrink:0">✕</button>
            </div>`).join('')}
          ${canAdd ? `
            <input class="field-input pwg-search" placeholder="Filter workouts below…" title="Type to filter the workout list below" style="font-size:11px;padding:4px 6px;margin-bottom:3px;width:100%" oninput="_filterPwgOptions(this)">
            <select class="field-input pwg-select" style="font-size:11px;padding:4px 6px;width:100%" data-phase="${phase.id}" data-day="${dayNum}" data-session="${nextSessionOrder}" data-week="${weekNum}" onchange="_quickAssignPhaseWorkout(this)" title="Pick an existing reusable template below, or create one for just this day. To build a template you can reuse across multiple days, add it in Workouts → Templates instead.">
              <option value="">+ Add workout…</option>
              <option value="__new__">＋ Create new workout (this day only)</option>
              ${(window._programTemplates || []).map(t => `<option value="${t.id}" data-search="${escapeHtml((t.name + ' ' + (t._exPreview || '')).toLowerCase())}">${escapeHtml(t.name)}${t._exPreview ? ' — ' + escapeHtml(t._exPreview) : ''}</option>`).join('')}
            </select>` : ''}
        </div>`
      }).join('')}
    </div>`
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
  if (targetWeek > durationWeeks) { showToast('This phase has no more weeks to fill', 'warn'); return }

  const { data: sourceRows, error } = await db.from('program_phase_workouts').select('*').eq('phase_id', phaseId).eq('week_number', sourceWeek)
  if (error || !sourceRows?.length) { showToast('Could not load that week', 'error'); return }

  const inserts = sourceRows.map(r => ({
    phase_id: phaseId, day_of_week: r.day_of_week, day_label: r.day_label,
    session_order: r.session_order, template_id: r.template_id, week_number: targetWeek, tier: r.tier || null
  }))
  const { data: insertedPws, error: insErr } = await db.from('program_phase_workouts').insert(inserts).select('id, day_of_week, session_order')
  if (insErr) { log.error('duplicatePhaseWeek', 'insert failed', insErr); showToast('Could not duplicate week', 'error'); return }

  // Propagate to already-assigned clients — clone a fresh client-owned copy per new slot, same
  // pattern as _cloneProgramForClient/generatePhasePeriodization (never share a client clone across slots).
  const programId = window._openProgramId
  const { data: assignments } = await db.from('client_programs').select('id, client_id').eq('program_id', programId)
  if (assignments?.length) {
    const { data: fullSourceRows } = await db.from('program_phase_workouts')
      .select('id, day_of_week, session_order, workout_templates(id, name, description, workout_template_exercises(*))')
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

  showToast(`Week ${sourceWeek} duplicated to Week ${targetWeek}`, 'success')
  loadAllPhaseWorkouts([{ id: phaseId }])
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
    const { data: staleCpws } = await db.from('client_program_workouts').select('id, workout_template_id').in('program_phase_workout_id', stalePwIds)
    if (staleCpws?.length) {
      await db.from('client_program_workouts').delete().in('id', staleCpws.map(c => c.id))
      const staleClientTemplateIds = staleCpws.map(c => c.workout_template_id).filter(Boolean)
      if (staleClientTemplateIds.length) await db.from('workout_templates').delete().in('id', staleClientTemplateIds)
    }
    await db.from('program_phase_workouts').delete().eq('phase_id', phaseId).eq('week_number', weekNumber)

    if (staleTemplateIds.length) {
      const { data: owned } = await db.from('workout_templates').select('id')
        .in('id', staleTemplateIds)
        .or(`program_id.eq.${programId},generated_from_phase_id.eq.${phaseId}`)
      const ownedIds = (owned || []).map(t => t.id)
      if (ownedIds.length) {
        // "Duplicate week" is cheap by design -- the new week's rows point at the SAME
        // template_id as the source week, only forking into an independent copy once someone
        // actually edits one (_resolveEditableTemplateId). Deleting this week must not destroy a
        // template a sibling week's row (already deleted above, so only surviving rows remain)
        // still references. Found by multi-agent review 2026-07-10, not by inspection.
        const { data: stillUsed } = await db.from('program_phase_workouts').select('template_id').in('template_id', ownedIds)
        const stillUsedIds = new Set((stillUsed || []).map(r => r.template_id))
        const safeToDeleteIds = ownedIds.filter(id => !stillUsedIds.has(id))
        if (safeToDeleteIds.length) await db.from('workout_templates').delete().in('id', safeToDeleteIds)
      }
    }
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

// Per-day-column search — native input filtering its own <select>'s options, no custom dropdown widget.
function _filterPwgOptions(inputEl) {
  const query = inputEl.value.trim().toLowerCase()
  const sel = inputEl.nextElementSibling
  if (!sel || sel.tagName !== 'SELECT') return
  ;[...sel.options].forEach(opt => {
    if (!opt.value || opt.value === '__new__') return
    opt.hidden = query.length > 0 && !opt.dataset.search.includes(query)
  })
}

async function _quickAssignPhaseWorkout(selectEl) {
  const phaseId = selectEl.dataset.phase
  const dayOfWeek = parseInt(selectEl.dataset.day)
  const sessionOrder = parseInt(selectEl.dataset.session)
  const weekNumber = parseInt(selectEl.dataset.week) || 1
  const value = selectEl.value
  if (!value) return

  if (value === '__new__') {
    window._phaseWorkoutContext = { phaseId, dayOfWeek, weekNumber, programId: window._openProgramId || null }
    selectEl.value = ''
    showCreateTemplateModal()
    return
  }

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
    phase_id: phaseId, day_of_week: dayOfWeek, day_label: dayLabels[dayOfWeek], template_id: value, session_order: sessionOrder, week_number: weekNumber
  })
  if (error) { log.error('_quickAssignPhaseWorkout', 'insert failed', error); showToast('Could not assign workout — try again', 'error'); return }
  loadAllPhaseWorkouts([{ id: phaseId }])
}

async function removePhaseWorkout(pwId, phaseId) {
  const { error } = await dbq('removePhaseWorkout', db.from('program_phase_workouts').delete().eq('id', pwId))
  if (error) return
  loadAllPhaseWorkouts([{ id: phaseId }])
}

