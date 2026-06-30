async function renderClientPrograms(clientId, el) {
  el.innerHTML = '<div class="loading-state">Loading…</div>'

  const [{ data: assignments, error }, { data: clientData }] = await Promise.all([
    db.from('client_programs')
      .select('id, start_date, programs(id, name, program_phases(id, name, order_index, duration_weeks, program_phase_workouts(id, day_of_week, session_order)))')
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
              const allSessions = [...(phase.program_phase_workouts || [])].sort((x, y) => x.day_of_week - y.day_of_week || x.session_order - y.session_order)
              const dayMap = {}
              allSessions.forEach(pw => {
                if (!dayMap[pw.day_of_week]) dayMap[pw.day_of_week] = []
                dayMap[pw.day_of_week].push(pw)
              })
              const days = Object.keys(dayMap).map(Number).sort((a,b) => a - b)
              const panelId = `phase-panel-${a.id}-${pi}`
              return `
                <div style="margin-bottom:6px;border:1px solid var(--border);border-radius:10px;overflow:hidden">
                  <button onclick="toggleClientPhase('${panelId}')" style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:var(--surface-2);border:none;cursor:pointer;text-align:left">
                    <div>
                      <span style="font-size:13px;font-weight:700;color:var(--text)">${phase.name}</span>
                      <span style="font-size:11px;color:var(--text-muted);margin-left:8px">${phase.duration_weeks}w · ${days.length} day${days.length !== 1 ? 's' : ''} · ${allSessions.length} session${allSessions.length !== 1 ? 's' : ''}</span>
                    </div>
                    <svg id="${panelId}-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;color:var(--text-muted);transition:transform .2s;transform:rotate(0deg)"><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                  <div id="${panelId}" style="display:none">
                    ${days.map(day => {
                      const daySessions = dayMap[day]
                      const multi = daySessions.length > 1
                      const dayPanelId = `${panelId}-d${day}`
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
                    }).join('')}
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
        <select class="field-input" id="ap-program">
          <option value="">Select a program…</option>
        </select>
      </div>
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
  closeModal('assign-program-modal')
  _cloneProgramForClient(cp.id, programId, clientId)
  renderClientPrograms(clientId, document.getElementById('tab-content'))
}

async function _cloneProgramForClient(clientProgramId, programId, clientId) {
  const { data: phases, error: phErr } = await db
    .from('program_phases')
    .select('id, program_phase_workouts(id, template_id, workout_templates(id, name, description, workout_template_exercises(*)))')
    .eq('program_id', programId)
    .order('order_index')

  if (phErr || !phases?.length) { log.error('_cloneProgramForClient', 'phase fetch failed', phErr); return }

  const cpwInserts = []

  for (const phase of phases) {
    for (const pw of (phase.program_phase_workouts || [])) {
      const tmpl = pw.workout_templates
      if (!tmpl) continue

      const { data: newTmpl, error: tErr } = await db
        .from('workout_templates')
        .insert({ coach_id: currentUser.id, client_id: clientId, program_id: null, name: tmpl.name, description: tmpl.description || null })
        .select('id').single()

      if (tErr || !newTmpl) { log.error('_cloneProgramForClient', 'template clone failed', tErr); continue }

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

      cpwInserts.push({ client_program_id: clientProgramId, program_phase_workout_id: pw.id, workout_template_id: newTmpl.id })
    }
  }

  if (cpwInserts.length) {
    const { error } = await db.from('client_program_workouts').insert(cpwInserts)
    if (error) log.error('_cloneProgramForClient', 'cpw insert failed', error)
  }

  log.ok('_cloneProgramForClient', `cloned ${cpwInserts.length} workouts`, { clientId, programId })
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
        <select class="field-input" id="apc-client"><option value="">Loading…</option></select>
      </div>`}
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
  }
}

async function saveAssignProgramToClient(programId, soloClientId) {
  const errEl = document.getElementById('apc-error')
  const clientId = soloClientId || document.getElementById('apc-client')?.value
  const startDate = document.getElementById('apc-start').value || null
  if (!clientId) { errEl.textContent = 'Please select a client'; return }
  const { data: cp, error } = await db.from('client_programs').insert({ client_id: clientId, program_id: programId, start_date: startDate || null }).select('id').single()
  if (error) { errEl.textContent = error.message; return }
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
    db.from('programs').select('id, name, description, created_at, program_phases(id, name, duration_weeks, order_index)').eq('id', programId).single(),
    db.from('workout_templates').select('id, name').eq('coach_id', currentUser.id).order('name'),
  ])

  if (error) { log.error('openProgram', 'fetch failed', error); el.innerHTML = `<div class="loading-state">${error.message}</div>`; return }

  const phases = (program.program_phases || []).sort((a, b) => a.order_index - b.order_index)
  const totalWeeks = phases.reduce((sum, p) => sum + p.duration_weeks, 0)
  window._programTemplates = templates || []
  window._openProgramId = programId

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
              <div id="phase-workouts-${ph.id}"><div style="color:var(--text-muted);font-size:12px">Loading workouts…</div></div>
              <button onclick="showAddPhaseWorkout('${ph.id}','${program.id}')" class="btn-secondary" style="margin-top:10px;font-size:12px;padding:4px 12px">+ Assign workout</button>
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
        <button class="btn" style="font-size:13px;padding:6px 14px" onclick="document.getElementById('phase-form').style.display='none'">Cancel</button>
      </div>
    </div>

    <!-- Add phase workout modal -->
    <div id="phase-workout-modal" class="modal-overlay" style="display:none">
      <div class="modal" style="max-width:420px">
        <div class="modal-header">
          <h2 class="modal-title">Assign workout to phase</h2>
          <button class="modal-close" onclick="document.getElementById('phase-workout-modal').style.display='none'">✕</button>
        </div>
        <input type="hidden" id="pwm-phase-id">
        <div style="display:grid;grid-template-columns:1fr auto;gap:10px" class="field">
          <div>
            <label class="field-label">Day of week</label>
            <select class="field-input" id="pwm-day">
              <option value="1">Monday</option>
              <option value="2">Tuesday</option>
              <option value="3">Wednesday</option>
              <option value="4">Thursday</option>
              <option value="5">Friday</option>
              <option value="6">Saturday</option>
              <option value="7">Sunday</option>
            </select>
          </div>
          <div>
            <label class="field-label">Session</label>
            <select class="field-input" id="pwm-session-order">
              <option value="1">AM</option>
              <option value="2">PM</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label class="field-label">Workout template</label>
          <select class="field-input" id="pwm-template">
            ${(window._programTemplates||[]).map(t=>`<option value="${t.id}">${t.name}</option>`).join('')}
          </select>
          <button type="button" onclick="createWorkoutFromPhaseModal()" style="background:none;border:none;color:var(--primary);font-size:13px;cursor:pointer;padding:4px 0;margin-top:4px">+ Create new workout</button>
        </div>
        <div class="field">
          <label class="field-label">Notes <span style="font-weight:400;color:var(--text-muted)">(optional)</span></label>
          <input class="field-input" id="pwm-notes" placeholder="e.g. Higher intensity week">
        </div>
        <p id="pwm-error" class="modal-error"></p>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="document.getElementById('phase-workout-modal').style.display='none'">Cancel</button>
          <button class="btn-primary" onclick="savePhaseWorkout()">Assign</button>
        </div>
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
  if (!confirm('Delete this program and all its phases?')) return
  log.info('deleteProgram', 'deleting', { programId })
  const { error } = await db.from('programs').delete().eq('id', programId)
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

async function loadAllPhaseWorkouts(phases) {
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
  for (const ph of phases) {
    const el = document.getElementById(`phase-workouts-${ph.id}`)
    if (!el) continue
    const { data: pws } = await db.from('program_phase_workouts').select('*, workout_templates(name)').eq('phase_id', ph.id).order('day_of_week').order('session_order')
    if (!pws?.length) { el.innerHTML = '<div style="font-size:12px;color:var(--text-muted)">No workouts assigned yet.</div>'; continue }
    const byDay = {}
    pws.forEach(pw => { byDay[pw.day_of_week] = byDay[pw.day_of_week] || []; byDay[pw.day_of_week].push(pw) })
    el.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:6px">
      ${Object.entries(byDay).sort(([a],[b])=>a-b).map(([day, wks]) => `
        <div style="background:var(--surface-2);border-radius:8px;padding:8px 12px;min-width:120px">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px">${days[day-1]}</div>
          ${wks.map((w, wi) => `
            <div style="display:flex;align-items:center;gap:6px;margin-top:4px">
              ${wks.length > 1 ? `<span style="font-size:9px;font-weight:700;color:var(--accent);min-width:18px">${w.session_order===2?'PM':'AM'}</span>` : ''}
              <span style="font-size:12px;font-weight:600">${w.workout_templates?.name || 'Unknown'}</span>
              <button onclick="openTemplate('${w.template_id}',{backLabel:'Back to program',backFn:()=>openProgram('${window._openProgramId}'),programId:'${window._openProgramId}'})" style="font-size:11px;color:var(--accent);background:none;border:none;cursor:pointer;padding:0 2px">Edit</button>
              <button onclick="removePhaseWorkout('${w.id}','${ph.id}')" style="font-size:11px;color:var(--text-muted);background:none;border:none;cursor:pointer;padding:0">✕</button>
            </div>`).join('')}
        </div>`).join('')}
    </div>`
  }
}

function showAddPhaseWorkout(phaseId, programId) {
  const modal = document.getElementById('phase-workout-modal')
  if (!modal) return
  window._phaseWorkoutContext = null
  window._currentProgramId = programId || null
  document.getElementById('pwm-phase-id').value = phaseId
  const sel = document.getElementById('pwm-template')
  sel.innerHTML = (window._programTemplates||[]).map(t=>`<option value="${t.id}">${t.name}</option>`).join('')
  modal.style.display = 'flex'
}

function createWorkoutFromPhaseModal() {
  const phaseId   = document.getElementById('pwm-phase-id').value
  const dayOfWeek = document.getElementById('pwm-day').value
  window._phaseWorkoutContext = { phaseId, dayOfWeek, programId: window._currentProgramId || null }
  document.getElementById('phase-workout-modal').style.display = 'none'
  showCreateTemplateModal()
}

async function savePhaseWorkout() {
  const phaseId      = document.getElementById('pwm-phase-id').value
  const dayOfWeek    = parseInt(document.getElementById('pwm-day').value)
  const templateId   = document.getElementById('pwm-template').value
  const notes        = document.getElementById('pwm-notes')?.value.trim() || null
  const sessionOrder = parseInt(document.getElementById('pwm-session-order')?.value || '1')
  const errEl        = document.getElementById('pwm-error')
  if (!templateId) { errEl.textContent = 'Pick a template'; return }
  const dayLabels = ['','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']

  // Validation: prevent duplicate session_order on same day
  const { data: existing } = await db.from('program_phase_workouts').select('id, session_order, workout_templates(name)').eq('phase_id', phaseId).eq('day_of_week', dayOfWeek).eq('session_order', sessionOrder)
  if (existing?.length) {
    const clash = existing[0].workout_templates?.name || 'another workout'
    showToast(`${sessionOrder === 1 ? 'AM' : 'PM'} slot already taken by "${clash}" — choose a different slot or day`, 'error')
    return
  }

  const { error } = await db.from('program_phase_workouts').insert({ phase_id: phaseId, day_of_week: dayOfWeek, day_label: dayLabels[dayOfWeek] || 'Day', template_id: templateId, notes, session_order: sessionOrder })
  if (error) { log.error('savePhaseWorkout', 'insert failed', error); errEl.textContent = error.message; return }
  document.getElementById('phase-workout-modal').style.display = 'none'
  if (window._openProgramId) openProgram(window._openProgramId)
}

async function removePhaseWorkout(pwId, phaseId) {
  const { error } = await dbq('removePhaseWorkout', db.from('program_phase_workouts').delete().eq('id', pwId))
  if (error) return
  if (window._openProgramId) openProgram(window._openProgramId)
}

