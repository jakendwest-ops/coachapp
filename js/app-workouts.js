function parseDuration(str) {
  if (!str) return null
  const parts = str.split(':')
  if (parts.length === 2) return parseInt(parts[0]) * 60 + parseInt(parts[1])
  return parseInt(str) * 60
}
function normalizeDuration(v) {
  if (!v && v !== 0) return ''
  const s = String(v)
  if (s.includes(':')) return s
  const secs = parseInt(s, 10)
  return isNaN(secs) ? s : fmtDuration(secs)
}
function fmtDuration(secs) {
  if (!secs) return '—'
  const m = Math.floor(secs / 60), s = secs % 60
  return s ? `${m}:${String(s).padStart(2,'0')}` : `${m}:00`
}
function fmtRestInput(raw) {
  const digits = String(raw || '').replace(/\D/g, '').slice(-4)
  if (!digits) return ''
  if (digits.length <= 2) return '0:' + digits.padStart(2, '0')
  return (digits.slice(0, -2).replace(/^0+/, '') || '0') + ':' + digits.slice(-2)
}
function fmtSet(s, type) {
  if (type === 'cardio') {
    const parts = [s.duration_seconds ? fmtDuration(s.duration_seconds) : null, s.distance_m ? (s.distance_m/1000).toFixed(2)+' km' : null]
    return parts.filter(Boolean).join(' · ') || '—'
  }
  const parts = [s.reps_achieved ? s.reps_achieved+' reps' : null, s.weight_kg ? s.weight_kg+'kg' : null, s.effort_value ? 'RPE '+s.effort_value : null]
  return parts.filter(Boolean).join(' · ') || '—'
}

// ─── SESSION DETAIL SLIDE-IN ──────────────────────────────────────────────────
async function openSessionDetail(templateId, name, ctx = {}) {
  const existing = document.getElementById('session-detail-panel')
  if (existing) existing.remove()
  window._sessionDetailCtx = ctx

  const { data: exercises } = await db
    .from('workout_template_exercises')
    .select('exercise_name, exercise_type, order_index, sets_json, notes')
    .eq('template_id', templateId)
    .order('order_index')

  const panel = document.createElement('div')
  panel.id = 'session-detail-panel'
  panel.style.cssText = 'position:fixed;top:0;right:0;bottom:0;left:0;z-index:1000'

  const exHtml = !exercises?.length
    ? '<div class="empty-state"><div class="empty-title">No exercises added yet</div></div>'
    : exercises.map((ex, i) => {
        const sets = ex.sets_json || []
        const isLast = i === exercises.length - 1
        const setsHtml = sets.map((s, si) => {
          let label = `Set ${si + 1}`
          if (s.amrap) label = 'AMRAP'

          let detail = ''
          if (s.timed) {
            const secs = s.duration ? (parseRest(s.duration) || 0) : (s.repsMin ? parseInt(s.repsMin) : null)
            detail = secs != null ? Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0') : '—'
          } else {
            const repsRange = s.repsMin ? s.repsMin + (s.repsMax && s.repsMax !== s.repsMin ? '–' + s.repsMax : '') : null
            const reps = repsRange ? repsRange + ' reps' : null  // timed guard: only reached in else branch
            const weight = s.weight ? s.weight + 'kg' : null
            const intensity = s.intensityMin ? s.intensityMin + (s.intensityMax && s.intensityMax !== s.intensityMin ? '–' + s.intensityMax : '') + '% 1RM' : null
            const effort = s.effortMin ? ((s.effortType === 'rir' ? 'RIR ' : 'RPE ') + s.effortMin + (s.effortMax && s.effortMax !== s.effortMin ? '–' + s.effortMax : '')) : null
            detail = [reps, weight || intensity, effort].filter(Boolean).join(' · ') || '—'
          }
          const rest = s.restMin && s.restMin !== '0:00' ? s.restMin + (s.restMax && s.restMax !== s.restMin ? '–' + s.restMax : '') + ' rest' : null

          return `<div style="display:flex;align-items:baseline;gap:8px;padding:5px 0;border-bottom:1px solid var(--border)">
            <span style="font-size:11px;font-weight:700;color:var(--text-muted);width:56px;flex-shrink:0">${label}</span>
            <span style="font-size:13px;flex:1">${detail}</span>
            ${rest ? `<span style="font-size:11px;color:var(--text-muted);flex-shrink:0">${rest}</span>` : ''}
          </div>`
        }).join('')

        return `<div style="margin-bottom:${isLast ? 0 : 16}px;padding-bottom:${isLast ? 0 : 16}px;border-bottom:${isLast ? 'none' : '1px solid var(--border)'}">
          <div style="font-size:14px;font-weight:700;margin-bottom:6px">${escapeHtml(ex.exercise_name)}</div>
          ${setsHtml || '<span style="font-size:12px;color:var(--text-muted)">No sets defined</span>'}
          ${ex.notes ? `<div style="font-size:12px;color:var(--text-muted);margin-top:6px;font-style:italic">${escapeHtml(ex.notes)}</div>` : ''}
        </div>`
      }).join('')

  // Clients view their own prescribed program read-only; coach and solo (self-coached) can edit.
  const canEdit = currentProfile?.role !== 'client'

  panel.innerHTML = `
    <div onclick="closeSessionDetail()" style="position:absolute;top:0;right:0;bottom:0;left:0;background:rgba(0,0,0,.45)"></div>
    <div id="session-detail-drawer" style="position:absolute;top:0;right:0;bottom:0;width:min(420px,100vw);background:var(--surface);overflow-y:auto;display:flex;flex-direction:column;transform:translateX(100%);transition:transform .3s cubic-bezier(.32,.72,0,1)">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:20px 16px 14px;border-bottom:1px solid var(--border);flex-shrink:0">
        <h2 style="font-size:17px;font-weight:700;margin:0">${escapeHtml(name)}</h2>
        <div style="display:flex;align-items:center;gap:4px;flex-shrink:0">
          ${canEdit ? `<button onclick="_editFromSessionDetail('${templateId}')" style="border:1px solid var(--border);background:none;cursor:pointer;padding:5px 12px;border-radius:8px;color:var(--accent);font-size:13px;font-weight:700">Edit</button>` : ''}
          <button onclick="closeSessionDetail()" style="border:none;background:none;cursor:pointer;padding:4px 8px;color:var(--text-muted);font-size:22px;line-height:1">✕</button>
        </div>
      </div>
      <div style="padding:16px;flex:1">${exHtml}</div>
    </div>`

  document.body.appendChild(panel)
  setTimeout(() => {
    const d = document.getElementById('session-detail-drawer')
    if (d) d.style.transform = 'translateX(0)'
  }, 16)
}

// Session-detail drawer is a read-only preview; editing hands off to the full template
// editor (openTemplate), reusing its existing propagate-to-all-sessions prompt on save.
function _editFromSessionDetail(templateId) {
  const ctx = window._sessionDetailCtx || {}
  closeSessionDetail()
  openTemplate(templateId, ctx)
}

function closeSessionDetail() {
  const drawer = document.getElementById('session-detail-drawer')
  if (!drawer) return
  drawer.style.transform = 'translateX(100%)'
  setTimeout(() => { const p = document.getElementById('session-detail-panel'); if (p) p.remove() }, 300)
}

// ─── WORKOUTS PAGE ────────────────────────────────────────────────────────────
async function renderWorkouts(el) {
  if (currentProfile?.role === 'client' || currentProfile?.role === 'solo') { await renderClientWorkoutsPage(el); return }
  el.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Workouts</h1>
      <button class="btn-primary" onclick="showCreateTemplateModal()">+ New template</button>
    </div>
    <div class="tabs">
      <button class="tab-btn active" id="wt-tab-templates" onclick="switchWorkoutTab('templates')">Templates</button>
      <button class="tab-btn" id="wt-tab-exercises" onclick="switchWorkoutTab('exercises')">Exercise Library</button>
    </div>
    <div id="workout-tab-content"></div>
  `
  await renderWorkoutTemplates(document.getElementById('workout-tab-content'))
}

function toggleClientTemplate(id) {
  const panel = document.getElementById(`tmpl-detail-${id}`)
  const chevron = document.getElementById(`chevron-${id}`)
  if (!panel) return
  const open = panel.style.display === 'none'
  panel.style.display = open ? 'block' : 'none'
  if (chevron) chevron.style.transform = open ? 'rotate(90deg)' : ''
}

async function renderClientWorkoutsPage(el) {
  const { data: clientRecord } = await db.from('clients').select('id, coach_id').eq('user_id', currentUser.id).single()
  if (!clientRecord) { el.innerHTML = '<div class="empty-state"><div class="empty-title">No client profile found</div></div>'; return }
  const clientId = clientRecord.id

  const [{ data: templates }, { data: logs }, { data: oneRMRows }, { data: cpAssignments }] = await Promise.all([
    db.from('workout_templates').select('id, name, description, workout_template_exercises(id, exercise_name, exercise_type, order_index, sets_json, notes)').eq('coach_id', clientRecord.coach_id || currentUser.id).is('client_id', null).is('program_id', null).order('name'),
    db.from('workout_logs').select('id, name, date').eq('client_id', clientId).order('date', { ascending: false }).limit(20),
    db.from('client_1rms').select('exercise_name, one_rm_kg, recorded_at').eq('client_id', clientId).order('recorded_at', { ascending: false }),
    db.from('client_programs').select('id, programs(id, name, program_phases(id, name, order_index, duration_weeks, program_phase_workouts(id, day_of_week, session_order, week_number)))').eq('client_id', clientId).order('created_at', { ascending: false }).limit(1)
  ])
  const oneRMMap = {}
  ;(oneRMRows || []).forEach(r => { const k = r.exercise_name.trim().toLowerCase(); if (!oneRMMap[k]) oneRMMap[k] = parseFloat(r.one_rm_kg) })

  let cpwMap = {}
  const activeAssignment = cpAssignments?.[0]
  if (activeAssignment) {
    const { data: cpwRows } = await db.from('client_program_workouts')
      .select('program_phase_workout_id, workout_template_id, workout_templates(id, name, description, workout_template_exercises(id, exercise_name, exercise_type, order_index, sets_json, notes))')
      .eq('client_program_id', activeAssignment.id)
    ;(cpwRows || []).forEach(r => { cpwMap[r.program_phase_workout_id] = { templateId: r.workout_template_id, name: r.workout_templates?.name, desc: r.workout_templates?.description, exercises: r.workout_templates?.workout_template_exercises || [] } })
  }
  const hasProgram = activeAssignment && Object.keys(cpwMap).length > 0

  el.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Workouts</h1>
    </div>

    ${hasProgram ? (() => {
      const prog = activeAssignment.programs
      const phases = [...(prog?.program_phases || [])].sort((a, b) => a.order_index - b.order_index)
      return `<div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:10px">${prog?.name || 'My Program'}</div>
        <div style="margin-bottom:28px">
          ${phases.map((phase, pi) => {
            const allSessions = [...(phase.program_phase_workouts || [])].sort((a, b) => a.week_number - b.week_number || a.day_of_week - b.day_of_week || a.session_order - b.session_order)
            const weekMap = {}
            allSessions.forEach(pw => { (weekMap[pw.week_number || 1] = weekMap[pw.week_number || 1] || []).push(pw) })
            const weekNums = Object.keys(weekMap).map(Number).sort((a, b) => a - b)
            const showWeeks = weekNums.length > 1
            const panelId = `cl-phase-${activeAssignment.id}-${pi}`

            const renderDays = (sessions, idPrefix) => {
              const dayMap = {}
              sessions.forEach(pw => { (dayMap[pw.day_of_week] = dayMap[pw.day_of_week] || []).push(pw) })
              const days = Object.keys(dayMap).map(Number).sort((a,b) => a - b)
              return days.map(day => {
                const daySessions = dayMap[day]
                const multi = daySessions.length > 1
                const dayPanelId = `${idPrefix}-d${day}`
                const sessionSummary = daySessions.map(pw => (cpwMap[pw.id]?.name || 'Session').replace(/ — W\d+/, '')).join(', ')
                return `<div style="border-top:1px solid var(--border)">
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
                      const name = (cpw?.name || 'Session').replace(/ — W\d+/, '')
                      const templateId = cpw?.templateId
                      const exs = (cpw?.exercises || []).sort((a,b) => a.order_index - b.order_index)
                      return `<div style="margin-bottom:${si < daySessions.length - 1 ? '10px' : '0'};padding-bottom:${si < daySessions.length - 1 ? '10px' : '0'};border-bottom:${si < daySessions.length - 1 ? '1px solid var(--border)' : 'none'}">
                        ${multi ? `<div style="font-size:10px;font-weight:700;color:var(--accent);letter-spacing:.06em;margin-bottom:4px">SESSION ${si+1}/${daySessions.length}</div>` : ''}
                        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:${exs.length ? '8px' : '0'}">
                          ${templateId ? `<span style="font-size:13px;font-weight:600;cursor:pointer;text-decoration:underline;text-decoration-color:var(--border)" onclick="openSessionDetail('${templateId}','${name.replace(/'/g,"\\'")}',{clientId:'${clientId}',clientProgramId:'${activeAssignment.id}',isClientPlan:true,backLabel:'Workouts'})">` : `<span style="font-size:13px;font-weight:600">`}${name}</span>
                          ${templateId ? `<button class="btn-primary" style="font-size:12px;padding:3px 10px;flex-shrink:0" onclick="startWorkoutRunner('${clientId}','${templateId}')">▶ Start</button>` : `<span style="font-size:12px;color:var(--text-muted)">Not set up</span>`}
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

            return `<div style="margin-bottom:6px;border:1px solid var(--border);border-radius:10px;overflow:hidden">
              <button onclick="toggleClientPhase('${panelId}')" style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:var(--surface-2);border:none;cursor:pointer;text-align:left">
                <div>
                  <span style="font-size:13px;font-weight:700;color:var(--text)">${phase.name}</span>
                  <span style="font-size:11px;color:var(--text-muted);margin-left:8px">${phase.duration_weeks}w · ${allSessions.length} session${allSessions.length !== 1 ? 's' : ''}</span>
                </div>
                <svg id="${panelId}-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;color:var(--text-muted);transition:transform .2s;flex-shrink:0"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              <div id="${panelId}" style="display:none">
                ${!showWeeks ? renderDays(weekMap[weekNums[0]], panelId) : weekNums.map(w => `
                  <div style="padding:8px 14px 2px;font-size:11px;font-weight:700;color:var(--accent);background:var(--surface-2);border-top:1px solid var(--border)">WEEK ${w}</div>
                  ${renderDays(weekMap[w], `${panelId}-w${w}`)}
                `).join('')}
              </div>
            </div>`
          }).join('')}
        </div>`
    })() : (() => {
      const allTemplates = templates || []
      return `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:10px">Templates</div>
      ${!allTemplates.length ? `
        <div class="empty-state">
          <div class="empty-icon">💪</div>
          <div class="empty-title">No workouts yet</div>
          <div class="empty-text">Your coach hasn't added any workout templates yet.</div>
        </div>` : `<div style="margin-bottom:28px">${allTemplates.map(t => {
          const exs = (t.workout_template_exercises || []).sort((a,b) => a.order_index - b.order_index)
          return `<div style="border:1px solid var(--border);border-radius:12px;margin-bottom:8px;overflow:hidden;background:var(--surface)">
            <div style="display:flex;align-items:center;gap:12px;padding:12px 14px">
              <div class="row-info" style="flex:1;min-width:0;cursor:pointer" onclick="openSessionDetail('${t.id}','${t.name.replace(/'/g,"\\'")}')">
                <div class="row-name">${t.name}</div>
                <div class="row-meta">${exs.length} exercise${exs.length!==1?'s':''} · tap to preview</div>
              </div>
              <button class="btn-primary" style="font-size:13px;padding:6px 14px;flex-shrink:0" onclick="startWorkoutRunner('${clientId}','${t.id}')">▶ Start</button>
            </div>
          </div>`
        }).join('')}</div>`}
      `
    })()}

    ${oneRMRows?.length ? `
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:10px">Your 1RMs</div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:28px">
      ${(() => {
        const byEx = {}
        ;(oneRMRows || []).forEach(r => { if (!byEx[r.exercise_name]) byEx[r.exercise_name] = []; byEx[r.exercise_name].push(r) })
        return Object.entries(byEx).map(([name, entries]) => {
          const latest = entries[0]
          const history = entries.slice(1).map(e => parseFloat(e.one_rm_kg).toFixed(1)+' kg').join(' → ')
          return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--surface);border:1px solid var(--border);border-radius:10px">
            <div>
              <div style="font-size:13px;font-weight:600">${name}</div>
              ${history ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px">${history} → current</div>` : ''}
            </div>
            <span style="font-size:20px;font-weight:800;color:var(--accent)">${parseFloat(latest.one_rm_kg).toFixed(1)} kg</span>
          </div>`
        }).join('')
      })()}
    </div>` : ''}
    ${!(logs?.length) ? `
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:10px">Session history</div>
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <div class="empty-title">No sessions yet</div>
        <div class="empty-text">Complete a workout to see your history here.</div>
      </div>` : `
      <button onclick="toggleClientPhase('client-session-history')" style="width:100%;display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;background:none;border:none;padding:0;cursor:pointer;text-align:left">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted)">Session history</div>
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:12px;color:var(--text-muted)">${logs.length} sessions</span>
          <svg id="client-session-history-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;color:var(--text-muted);transition:transform .2s"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      </button>
      <div id="client-session-history" style="display:none">
        <div class="list" id="client-session-list">
          ${logs.map(l => `
            <div class="list-row" style="cursor:pointer" onclick="openWorkoutLog('${l.id}','${clientId}')">
              <div style="width:36px;height:36px;border-radius:8px;background:var(--surface-2);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:16px">✓</div>
              <div class="row-info">
                <div class="row-name">${l.name || 'Workout'}</div>
                <div class="row-meta">${new Date(l.date + 'T00:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})}</div>
              </div>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;color:var(--text-muted);flex-shrink:0"><polyline points="9 18 15 12 9 6"/></svg>
            </div>`).join('')}
        </div>
      </div>`}
  `
}

function switchWorkoutTab(tab) {
  document.getElementById('wt-tab-templates').classList.toggle('active', tab === 'templates')
  document.getElementById('wt-tab-exercises').classList.toggle('active', tab === 'exercises')
  const el = document.getElementById('workout-tab-content')
  if (tab === 'templates') renderWorkoutTemplates(el)
  else renderExerciseLibrary(el)
}

async function renderWorkoutTemplates(el) {
  log.info('renderWorkoutTemplates', 'fetching templates')
  el.innerHTML = '<div class="loading-state">Loading…</div>'
  const { data: templates, error } = await db.from('workout_templates').select('*, workout_template_exercises(id)').eq('coach_id', currentUser.id).is('client_id', null).is('program_id', null).order('name')

  if (error) { log.error('renderWorkoutTemplates', 'fetch failed', error); el.innerHTML = `<div class="loading-state">${error.message}</div>`; return }
  log.ok('renderWorkoutTemplates', `loaded ${templates.length} templates`)

  if (!templates.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">No standalone templates</div><div class="empty-text">Create one below, or if it's part of a phased plan, add it via Programs → phase view.</div><button class="btn-primary" onclick="showCreateTemplateModal()">+ Create template</button></div>`
    return
  }

  const templateRow = t => `
    <div class="list-row" onclick="openTemplate('${t.id}')">
      <div style="width:40px;height:40px;border-radius:10px;background:rgba(99,102,241,.12);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">💪</div>
      <div class="row-info">
        <div class="row-name">${t.name}</div>
        <div class="row-meta">${t.description || (t.workout_template_exercises.length + ' exercise' + (t.workout_template_exercises.length !== 1 ? 's' : ''))}</div>
      </div>
      <div class="row-right">
        <span style="font-size:12px;color:var(--text-muted)">${t.workout_template_exercises.length} ex</span>
        <svg style="width:15px;height:15px;color:#d1d5db" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
    </div>`

  el.innerHTML = `<div class="list">${templates.map(templateRow).join('')}</div>`
}

async function renderExerciseLibrary(el) {
  el.innerHTML = '<div class="loading-state">Loading…</div>'
  const { data: exercises, error } = await db.from('exercises').select('*').order('name')

  if (error) { log.error('renderExerciseLibrary', 'fetch failed', error); el.innerHTML = `<div class="loading-state">${error.message}</div>`; return }

  const groups = {}
  exercises.forEach(e => {
    const g = e.muscle_group || 'Other'
    if (!groups[g]) groups[g] = []
    groups[g].push(e)
  })

  el.innerHTML = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:16px">
      <button class="btn-primary" onclick="showAddExerciseModal()">+ Add exercise</button>
    </div>
    ${exercises.length === 0 ? `
      <div class="empty-state">
        <div class="empty-icon">🏋️</div>
        <div class="empty-title">No exercises yet</div>
        <div class="empty-text">Build your exercise library to use in workout templates</div>
        <button class="btn-primary" onclick="showAddExerciseModal()">+ Add exercise</button>
      </div>
    ` : Object.entries(groups).sort().map(([group, exs]) => `
      <div style="margin-bottom:24px">
        <div class="section-header"><h3 class="section-title">${group}</h3></div>
        <div class="list">
          ${exs.map(e => `
            <div class="list-row">
              <div class="row-info">
                <div class="row-name">${e.name}</div>
                <div class="row-meta">${[e.category, e.default_sets ? `${e.default_sets} sets × ${e.default_reps} reps` : null].filter(Boolean).join(' · ')}</div>
              </div>
              <button class="btn-secondary" style="font-size:12px;padding:4px 10px;flex-shrink:0" onclick="showEditExerciseModal('${e.id}');event.stopPropagation()">Edit</button>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('')}
  `
}

// ─── EXERCISE MODALS ──────────────────────────────────────────────────────────
function showAddExerciseModal() {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.id = 'add-exercise-modal'
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2 class="modal-title">Add exercise</h2>
        <button class="modal-close" onclick="closeModal('add-exercise-modal')">✕</button>
      </div>
      <div class="field">
        <label class="field-label">Exercise name <span style="color:var(--danger)">*</span></label>
        <input class="field-input" id="ae-name" placeholder="e.g. Barbell Back Squat">
      </div>
      <div class="field-row">
        <div class="field">
          <label class="field-label">Muscle group</label>
          <select class="field-input" id="ae-muscle">
            <option value="">— Select —</option>
            <option>Chest</option><option>Back</option><option>Shoulders</option>
            <option>Arms</option><option>Core</option><option>Legs</option>
            <option>Glutes</option><option>Cardio</option><option>Full Body</option>
          </select>
        </div>
        <div class="field">
          <label class="field-label">Category</label>
          <select class="field-input" id="ae-category">
            <option value="">— Select —</option>
            <option>Compound</option><option>Isolation</option>
            <option>Cardio</option><option>Bodyweight</option><option>Stretching</option>
          </select>
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label class="field-label">Default sets</label>
          <input class="field-input" id="ae-sets" type="number" placeholder="3" min="1" max="20">
        </div>
        <div class="field">
          <label class="field-label">Default reps</label>
          <input class="field-input" id="ae-reps" type="number" placeholder="10" min="1" max="100">
        </div>
      </div>
      <div class="field">
        <label class="field-label">Notes / coaching cues</label>
        <textarea class="field-input" id="ae-notes" rows="2" style="resize:vertical" placeholder="Form tips, progressions…"></textarea>
      </div>
      <p class="modal-error" id="ae-error"></p>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeModal('add-exercise-modal')">Cancel</button>
        <button class="btn-primary" onclick="saveNewExercise()">Add exercise</button>
      </div>
    </div>
  `
  document.body.appendChild(overlay)
  document.getElementById('ae-name').focus()
}

async function saveNewExercise() {
  const name = document.getElementById('ae-name').value.trim()
  const errorEl = document.getElementById('ae-error')
  if (!name) { errorEl.textContent = 'Name is required'; return }

  log.info('saveNewExercise', 'inserting exercise', { name })
  const { error } = await db.from('exercises').insert({
    coach_id:      currentUser.id,
    name,
    muscle_group:  document.getElementById('ae-muscle').value   || null,
    category:      document.getElementById('ae-category').value || null,
    default_sets:  document.getElementById('ae-sets').value     || null,
    default_reps:  document.getElementById('ae-reps').value     || null,
    notes:         document.getElementById('ae-notes').value.trim() || null
  })

  if (error) { log.error('saveNewExercise', 'insert failed', error); errorEl.textContent = error.message; return }
  log.ok('saveNewExercise', 'exercise created', { name })
  closeModal('add-exercise-modal')
  renderExerciseLibrary(document.getElementById('workout-tab-content'))
}

async function showEditExerciseModal(id) {
  const { data: e } = await db.from('exercises').select('*').eq('id', id).single()
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.id = 'edit-exercise-modal'
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2 class="modal-title">Edit exercise</h2>
        <button class="modal-close" onclick="closeModal('edit-exercise-modal')">✕</button>
      </div>
      <div class="field">
        <label class="field-label">Exercise name</label>
        <input class="field-input" id="ee-name" value="${e.name}">
      </div>
      <div class="field-row">
        <div class="field">
          <label class="field-label">Muscle group</label>
          <select class="field-input" id="ee-muscle">
            <option value="">— Select —</option>
            ${['Chest','Back','Shoulders','Arms','Core','Legs','Glutes','Cardio','Full Body'].map(g => `<option ${e.muscle_group===g?'selected':''}>${g}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label class="field-label">Category</label>
          <select class="field-input" id="ee-category">
            <option value="">— Select —</option>
            ${['Compound','Isolation','Cardio','Bodyweight','Stretching'].map(c => `<option ${e.category===c?'selected':''}>${c}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label class="field-label">Default sets</label>
          <input class="field-input" id="ee-sets" type="number" value="${e.default_sets || ''}">
        </div>
        <div class="field">
          <label class="field-label">Default reps</label>
          <input class="field-input" id="ee-reps" type="number" value="${e.default_reps || ''}">
        </div>
      </div>
      <div class="field">
        <label class="field-label">Notes / coaching cues</label>
        <textarea class="field-input" id="ee-notes" rows="2" style="resize:vertical">${e.notes || ''}</textarea>
      </div>
      <p class="modal-error" id="ee-error"></p>
      <div class="modal-footer">
        <button class="btn-danger" onclick="deleteExercise('${id}')">Delete</button>
        <div style="flex:1"></div>
        <button class="btn-secondary" onclick="closeModal('edit-exercise-modal')">Cancel</button>
        <button class="btn-primary" onclick="saveEditExercise('${id}')">Save</button>
      </div>
    </div>
  `
  document.body.appendChild(overlay)
}

async function saveEditExercise(id) {
  const name = document.getElementById('ee-name').value.trim()
  const errorEl = document.getElementById('ee-error')
  if (!name) { errorEl.textContent = 'Name is required'; return }

  log.info('saveEditExercise', 'updating exercise', { id, name })
  const { error } = await db.from('exercises').update({
    name,
    muscle_group:  document.getElementById('ee-muscle').value    || null,
    category:      document.getElementById('ee-category').value  || null,
    default_sets:  document.getElementById('ee-sets').value      || null,
    default_reps:  document.getElementById('ee-reps').value      || null,
    notes:         document.getElementById('ee-notes').value.trim() || null
  }).eq('id', id)

  if (error) { log.error('saveEditExercise', 'update failed', error); errorEl.textContent = error.message; return }
  log.ok('saveEditExercise', 'exercise updated', { id, name })
  closeModal('edit-exercise-modal')
  renderExerciseLibrary(document.getElementById('workout-tab-content'))
}

async function deleteExercise(id) {
  if (!confirm('Delete this exercise? It will be removed from any templates that use it.')) return
  log.info('deleteExercise', 'deleting exercise', { id })
  const { error } = await db.from('exercises').delete().eq('id', id)
  if (error) { log.error('deleteExercise', 'delete failed', error); return }
  log.ok('deleteExercise', 'exercise deleted', { id })
  closeModal('edit-exercise-modal')
  renderExerciseLibrary(document.getElementById('workout-tab-content'))
}

// ─── TEMPLATE CREATE / DETAIL ─────────────────────────────────────────────────
function showCreateTemplateModal() {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.id = 'create-template-modal'
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2 class="modal-title">New template</h2>
        <button class="modal-close" onclick="closeModal('create-template-modal')">✕</button>
      </div>
      <div class="field">
        <label class="field-label">Template name <span style="color:var(--danger)">*</span></label>
        <input class="field-input" id="ct-name" placeholder="e.g. Upper Body A, Full Body Strength">
      </div>
      <div class="field">
        <label class="field-label">Description</label>
        <textarea class="field-input" id="ct-desc" rows="2" style="resize:vertical" placeholder="What's this template for?"></textarea>
      </div>
      <p class="modal-error" id="ct-error"></p>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeModal('create-template-modal')">Cancel</button>
        <button class="btn-primary" onclick="saveNewTemplate()">Create</button>
      </div>
    </div>
  `
  document.body.appendChild(overlay)
  document.getElementById('ct-name').focus()
}

async function saveNewTemplate() {
  const name = document.getElementById('ct-name').value.trim()
  const errorEl = document.getElementById('ct-error')
  if (!name) { errorEl.textContent = 'Name is required'; return }

  log.info('saveNewTemplate', 'creating template', { name })
  const ctx = window._phaseWorkoutContext
  const { data, error } = await db.from('workout_templates').insert({
    coach_id:    currentUser.id,
    name,
    description: document.getElementById('ct-desc').value.trim() || null,
    program_id:  ctx?.programId || null
  }).select().single()

  if (error) { log.error('saveNewTemplate', 'insert failed', error); errorEl.textContent = error.message; return }
  log.ok('saveNewTemplate', 'template created', { id: data.id, name })
  closeModal('create-template-modal')

  if (ctx?.programId) {
    window._phaseWorkoutContext = null
    // Assign the new template straight back into the day slot it was created from —
    // without this, "Create new workout" left the slot empty and the coach had to
    // navigate back to the phase and re-pick it from the dropdown.
    if (ctx.phaseId && ctx.dayOfWeek) {
      const { data: existingSlots } = await db.from('program_phase_workouts').select('id').eq('phase_id', ctx.phaseId).eq('week_number', 1).eq('day_of_week', ctx.dayOfWeek)
      const dayLabels = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
      const { error: pwErr } = await db.from('program_phase_workouts').insert({
        phase_id: ctx.phaseId, day_of_week: ctx.dayOfWeek, day_label: dayLabels[ctx.dayOfWeek], template_id: data.id, session_order: (existingSlots?.length || 0) + 1, week_number: 1
      })
      if (pwErr) { log.error('saveNewTemplate', 'auto-assign to slot failed', pwErr); showToast('Workout created, but could not auto-assign to the slot — add it from the phase page', 'error') }
    }
    openTemplate(data.id, { backLabel: 'Back to program', backFn: () => openProgram(ctx.programId), programId: ctx.programId })
    return
  }

  openTemplate(data.id)
}

async function openTemplate(id, ctx = {}) {
  window._templateCtx = {
    backTo: ctx.backTo || null,
    backLabel: ctx.backLabel || 'Templates',
    backFn: ctx.backFn || null,
    clientId: ctx.clientId || null,
    clientName: ctx.clientName || null,
    clientProgramId: ctx.clientProgramId || null,
    programId: ctx.programId || null,
    isClientPlan: !!ctx.clientId
  }
  const el = document.getElementById('main-content')
  el.innerHTML = '<div class="loading-state">Loading…</div>'

  const { data: t, error } = await db
    .from('workout_templates')
    .select('*, workout_template_exercises(*)')
    .eq('id', id)
    .single()

  if (error) { log.error('openTemplate', 'fetch failed', error); el.innerHTML = `<div class="loading-state">${error.message}</div>`; return }

  const exercises = (t.workout_template_exercises || []).sort((a, b) => a.order_index - b.order_index)
  const _ctx = window._templateCtx

  el.innerHTML = `
    <a class="back-btn" href="#" onclick="_templateGoBack();return false">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
      ${_ctx.backLabel}
    </a>
    ${_ctx.isClientPlan ? `<div style="font-size:11px;font-weight:600;color:var(--accent);background:rgba(99,102,241,.08);border-radius:6px;padding:6px 10px;margin-bottom:12px">Editing ${_ctx.clientName || 'client'}’s plan — changes affect only this client</div>` : ''}

    <div class="page-header">
      <div>
        <h1 class="page-title">${t.name}</h1>
        ${t.description ? `<p class="page-subtitle">${t.description}</p>` : ''}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn-secondary" onclick="showEditTemplateModal('${id}')">Edit</button>
        <button class="btn-secondary" onclick="showAddExerciseToTemplateModal('${id}')">+ Add exercise</button>
        ${currentProfile?.role === 'solo'
          ? `<button class="btn-primary" onclick="startWorkoutRunner('${window._soloClientId}','${id}')">▶ Start</button>`
          : _ctx.clientId
            ? `<button class="btn-primary" onclick="startWorkoutRunner('${_ctx.clientId}','${id}')">▶ Start</button>`
            : ''}
      </div>
    </div>

    <div id="template-exercise-list">
      ${exercises.length === 0 ? `
        <div class="empty-state">
          <div class="empty-icon">➕</div>
          <div class="empty-title">No exercises yet</div>
          <div class="empty-text">Add exercises to build this template</div>
          <button class="btn-primary" onclick="showAddExerciseToTemplateModal('${id}')">+ Add exercise</button>
        </div>
      ` : `<div class="list">${exercises.map((ex, i) => {
        const isCardio = ex.exercise_type === 'cardio'
        const meta = isCardio
          ? [ex.sets ? `${ex.sets} sets` : null, 'Cardio'].filter(Boolean).join(' · ')
          : [ex.sets ? `${ex.sets} sets` : null, ex.reps ? `${ex.reps} reps` : null, ex.weight_kg ? `${ex.weight_kg}kg` : null].filter(Boolean).join(' · ') || 'No defaults set'
        return `
        <div class="card" style="margin-bottom:0">
          <div class="card-body" style="padding:12px 16px">
            <div style="display:flex;align-items:center;gap:10px">
              <div style="display:flex;flex-direction:column;gap:2px;flex-shrink:0">
                <button onclick="moveTemplateExercise('${id}','${ex.id}',-1)" ${i===0?'disabled':''} style="width:22px;height:20px;border-radius:4px;border:1px solid var(--border);background:transparent;color:${i===0?'var(--border)':'var(--text-muted)'};cursor:${i===0?'default':'pointer'};font-size:10px;display:flex;align-items:center;justify-content:center">▲</button>
                <button onclick="moveTemplateExercise('${id}','${ex.id}',1)" ${i===exercises.length-1?'disabled':''} style="width:22px;height:20px;border-radius:4px;border:1px solid var(--border);background:transparent;color:${i===exercises.length-1?'var(--border)':'var(--text-muted)'};cursor:${i===exercises.length-1?'default':'pointer'};font-size:10px;display:flex;align-items:center;justify-content:center">▼</button>
              </div>
              <div style="width:26px;height:26px;border-radius:50%;background:rgba(99,102,241,.12);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--accent);flex-shrink:0">${i + 1}</div>
              <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                  <span style="font-weight:600;font-size:14px">${ex.exercise_name}</span>
                  ${isCardio ? `<span style="font-size:11px;font-weight:600;padding:1px 7px;border-radius:4px;background:rgba(6,182,212,.12);color:#06b6d4">Cardio</span>` : ''}
                  ${ex.superset_group ? `<span style="font-size:11px;font-weight:700;padding:1px 7px;border-radius:4px;background:rgba(245,158,11,.15);color:#d97706">SS: ${ex.superset_group}</span>` : ''}
                  ${ex.sets_json?.[0]?.bodyweight ? `<span style="font-size:11px;font-weight:600;padding:1px 7px;border-radius:4px;background:rgba(16,185,129,.12);color:#059669">BW</span>` : ''}
                  ${ex.sets_json?.[0]?.assisted ? `<span style="font-size:11px;font-weight:600;padding:1px 7px;border-radius:4px;background:rgba(139,92,246,.12);color:#7c3aed">Assisted</span>` : ''}
                </div>
                ${ex.sets_json?.length ? (() => {
                  const rows = ex.sets_json.map((s, si) => {
                    let parts
                    if (isCardio) {
                      const fmtRV = v => { if (!v || v === '0:00') return null; if (typeof v === 'number') return fmtDuration(v); return String(v) }
                      const paceStr    = (s.pace500Min || s.pace500Max) ? `${s.pace500Min||'?'}–${s.pace500Max||'?'}/500m` : null
                      const paceKmStr  = (s.paceKmMin  || s.paceKmMax)  ? `${s.paceKmMin||'?'}–${s.paceKmMax||'?'}/km`   : null
                      const strokeStr  = (s.strokeRateMin || s.strokeRateMax) ? `${s.strokeRateMin||'?'}–${s.strokeRateMax||'?'} spm` : null
                      const rMin = fmtRV(s.restMin), rMax = fmtRV(s.restMax)
                      const restStr    = rMin ? (rMin === rMax || !rMax ? rMin+' rest' : rMin+'–'+rMax+' rest') : null
                      const hrStr      = (s.hrZoneMin || s.hrZoneMax) ? `HR ${s.hrZoneMin||'?'}–${s.hrZoneMax||'?'}` : null
                      const restHrStr  = s.restHrMax ? `rest HR <${s.restHrMax}` : null
                      const durStr     = s.duration ? fmtDuration(parseRest(s.duration)||0) : null
                      parts = s.isDistanceBased
                        ? [s.distance ? s.distance+' km' : null, paceStr||paceKmStr, strokeStr, restStr, hrStr, restHrStr]
                        : [durStr, paceStr||paceKmStr, strokeStr, restStr, hrStr, restHrStr]
                    } else {
                      const restStr2 = s.restMin && s.restMin !== '0:00' ? s.restMin+(s.restMax&&s.restMax!==s.restMin?'–'+s.restMax:'')+' rest' : (s.rest ? s.rest+' rest' : null)
                      if (s.timed) {
                        const secs = s.duration ? (parseRest(s.duration)||0) : (s.repsMin ? parseInt(s.repsMin) : null)
                        const durDisplay = secs != null ? (Math.floor(secs/60)+':'+String(secs%60).padStart(2,'0')) : null
                        parts = [durDisplay, restStr2]
                      } else {
                        const repsStr2 = s.repsMin ? (s.repsMin+(s.repsMax&&s.repsMax!==s.repsMin?'–'+s.repsMax:'')) : (s.reps || null)
                        const effortStr2 = s.effortMin ? ((s.effortType==='rir'?'RIR ':'RPE ')+s.effortMin+(s.effortMax&&s.effortMax!==s.effortMin?'–'+s.effortMax:'')) : (s.rpe ? 'RPE '+s.rpe : null)
                        parts = [repsStr2 ? repsStr2+' reps' : null, s.weight ? s.weight+'kg' : null, s.intensityMin ? s.intensityMin+(s.intensityMax&&s.intensityMax!==s.intensityMin?'–'+s.intensityMax:'')+'% 1RM' : null, effortStr2, restStr2]
                      }
                    }
                    const summary = parts.filter(Boolean).join(' · ')
                    return summary ? `<div style="font-size:11.5px;color:var(--text-muted)"><span style="font-weight:600;color:var(--text-muted)">Set ${si+1}:</span> ${summary}</div>` : null
                  }).filter(Boolean)
                  return rows.length ? `<div style="display:flex;flex-direction:column;gap:1px;margin-top:4px">${rows.join('')}</div>` : `<div style="font-size:12px;color:var(--text-muted);margin-top:2px">${meta}</div>`
                })() : `<div style="font-size:12px;color:var(--text-muted);margin-top:2px">${meta}</div>`}
                ${(() => {
                  if (!ex.notes) return ''
                  const m = ex.notes.match(/^\[([^\]]+)\]\s*([\s\S]*)$/)
                  if (m) return `<div style="margin-top:5px;display:flex;flex-direction:column;gap:2px"><span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;padding:1px 7px;border-radius:4px;background:rgba(99,102,241,.1);color:var(--accent);display:inline-block">${m[1]}</span>${m[2] ? `<div style="font-size:11.5px;color:var(--text-muted);margin-top:1px;font-style:italic">${m[2]}</div>` : ''}</div>`
                  return `<div style="font-size:11.5px;color:var(--accent);margin-top:3px;font-style:italic">${ex.notes}</div>`
                })()}
              </div>
              <button class="btn-secondary" style="font-size:12px;padding:4px 10px;flex-shrink:0" onclick="showEditTemplateExerciseModal('${ex.id}','${id}')">Edit</button>
            </div>
          </div>
        </div>`
      }).join('')}</div>`}
    </div>
  `
}

function _templateGoBack() {
  const ctx = window._templateCtx || {}
  if (ctx.backFn) {
    ctx.backFn()
  } else if (ctx.clientId) {
    openClientProgramsTab(ctx.clientId)
  } else {
    navigate(ctx.backTo || 'workouts')
  }
}

async function openClientProgramsTab(clientId) {
  await openClient(clientId)
  const btn = document.querySelector('[onclick*="tab-programs"]')
  if (btn) btn.click()
}

async function moveTemplateExercise(templateId, exId, dir) {
  const { data: all } = await db
    .from('workout_template_exercises')
    .select('id, order_index')
    .eq('template_id', templateId)
    .order('order_index')

  const idx = all.findIndex(e => e.id === exId)
  const swapIdx = idx + dir
  if (swapIdx < 0 || swapIdx >= all.length) return

  await Promise.all([
    db.from('workout_template_exercises').update({ order_index: all[swapIdx].order_index }).eq('id', all[idx].id),
    db.from('workout_template_exercises').update({ order_index: all[idx].order_index }).eq('id', all[swapIdx].id)
  ])
  openTemplate(templateId)
}

// ─── TEMPLATE SET HELPERS ─────────────────────────────────────────────────────
function calcPace1000(min500, max500) {
  const toSecs = s => { if (!s) return 0; const p = s.split(':'); return (parseInt(p[0])||0)*60+(parseInt(p[1])||0) }
  const fmt = s => { if (!s) return '—'; const m = Math.floor(s/60), sec = String(s%60).padStart(2,'0'); return `${m}:${sec}` }
  const minS = toSecs(min500) * 2, maxS = toSecs(max500) * 2
  if (!minS && !maxS) return '—'
  if (minS === maxS || !maxS) return fmt(minS)
  return fmt(minS) + ' – ' + fmt(maxS)
}

function tsPace500Input(i, containerId) {
  const minEl = document.getElementById(`ts-p500min-${i}`)
  const maxEl = document.getElementById(`ts-p500max-${i}`)
  if (minEl) minEl.value = fmtRestInput(minEl.value)
  if (maxEl) maxEl.value = fmtRestInput(maxEl.value)
  const el1000 = document.getElementById(`ts-p1000-${i}`)
  if (el1000) el1000.textContent = calcPace1000(minEl?.value, maxEl?.value)
}

function parseRest(str) {
  if (!str) return 0
  str = String(str)
  const parts = str.split(':')
  if (parts.length === 2) return (parseInt(parts[0])||0)*60 + (parseInt(parts[1])||0)
  const n = str.replace(/\D/g,'')
  if (n.length >= 3) return (parseInt(n.slice(0,-2))||0)*60 + (parseInt(n.slice(-2))||0)
  return parseInt(n)||0
}
function fmtRest(secs) {
  if (!secs) return ''
  const m = Math.floor(secs/60), s = String(secs%60).padStart(2,'0')
  return `${m}:${s}`
}

function flushTemplateSets(containerId) {
  ;(window._templateSets || []).forEach((s, i) => {
    s.repsMin      = document.getElementById(`ts-rmin-${i}`)?.value     ?? s.repsMin
    s.repsMax      = document.getElementById(`ts-rmax-${i}`)?.value     ?? s.repsMax
    s.weight       = document.getElementById(`ts-weight-${i}`)?.value   ?? s.weight
    s.intensityMin = document.getElementById(`ts-imin-${i}`)?.value     ?? s.intensityMin
    s.intensityMax = document.getElementById(`ts-imax-${i}`)?.value     ?? s.intensityMax
    s.restMin      = document.getElementById(`ts-restmin-${i}`)?.value  ?? s.restMin
    s.restMax      = document.getElementById(`ts-restmax-${i}`)?.value  ?? s.restMax
    s.effortMin    = document.getElementById(`ts-emin-${i}`)?.value     ?? s.effortMin
    s.effortMax    = document.getElementById(`ts-emax-${i}`)?.value     ?? s.effortMax
    s.tempo        = document.getElementById(`ts-tempo-${i}`)?.value    ?? s.tempo
    s.countdown    = document.getElementById(`ts-cd-${i}`)?.value       ?? s.countdown
    s.duration     = document.getElementById(`ts-duration-${i}`)?.value ?? s.duration
    s.distance     = document.getElementById(`ts-distance-${i}`)?.value ?? s.distance
    s.pace500Min    = document.getElementById(`ts-p500min-${i}`)?.value   ?? s.pace500Min
    s.pace500Max    = document.getElementById(`ts-p500max-${i}`)?.value   ?? s.pace500Max
    s.hrZoneMin     = document.getElementById(`ts-hrzmin-${i}`)?.value    ?? s.hrZoneMin
    s.hrZoneMax     = document.getElementById(`ts-hrzmax-${i}`)?.value    ?? s.hrZoneMax
    s.paceKmMin     = document.getElementById(`ts-pkmmin-${i}`)?.value    ?? s.paceKmMin
    s.paceKmMax     = document.getElementById(`ts-pkmmax-${i}`)?.value    ?? s.paceKmMax
    s.restHrMax     = document.getElementById(`ts-resthr-${i}`)?.value    ?? s.restHrMax
    s.strokeRateMin = document.getElementById(`ts-srmin-${i}`)?.value     ?? s.strokeRateMin
    s.strokeRateMax = document.getElementById(`ts-srmax-${i}`)?.value     ?? s.strokeRateMax
    s.assistWeight  = document.getElementById(`ts-assist-${i}`)?.value    ?? s.assistWeight
  })
}

function toggleTsSet(i, prop, containerId) {
  flushTemplateSets(containerId)
  window._templateSets[i][prop] = !window._templateSets[i][prop]
  const tid = containerId === 'att-sets-container' ? 'att-type' : 'ett-type'
  renderTemplateSets(containerId, document.getElementById(tid)?.value || 'strength')
}

function setTsEffort(i, type, containerId) {
  flushTemplateSets(containerId)
  window._templateSets[i].effortType = type
  const tid = containerId === 'att-sets-container' ? 'att-type' : 'ett-type'
  renderTemplateSets(containerId, document.getElementById(tid)?.value || 'strength')
}

function renderTemplateSets(containerId, type) {
  const container = document.getElementById(containerId)
  if (!container) return
  const isCardio = type === 'cardio'
  const tid = containerId === 'att-sets-container' ? 'att-type' : 'ett-type'
  const row = (label, right) => `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f3f4f6"><span style="font-size:13px;font-weight:600;color:#374151">${label}</span><div style="display:flex;align-items:center;gap:6px">${right}</div></div>`
  const mini = (id, opts='') => `<input id="${id}" class="field-input" style="width:60px;padding:5px 8px;font-size:13px;text-align:center" ${opts}>`
  const dash = `<span style="color:#9ca3af;font-size:12px">–</span>`
  container.innerHTML = (window._templateSets || []).map((s, i) => {
    const et = s.effortType || 'rpe'
    const tog = (label, active, onclick) => `<button type="button" onclick="${onclick}" style="padding:4px 10px;font-size:11px;font-weight:700;border-radius:6px;border:1px solid ${active?'var(--accent)':'#d1d5db'};background:${active?'var(--accent)':'transparent'};color:${active?'white':'#6b7280'};cursor:pointer">${label}</button>`
    const etbtn = (label, type) => `<button type="button" onclick="setTsEffort(${i},'${type}','${containerId}')" style="padding:4px 10px;font-size:11px;font-weight:700;border:1px solid ${et===type?'var(--accent)':'#d1d5db'};background:${et===type?'var(--accent)':'transparent'};color:${et===type?'white':'#6b7280'};cursor:pointer;${type==='rpe'?'border-radius:6px 0 0 6px':'border-radius:0 6px 6px 0;border-left:none'}">${label}</button>`
    return `<div style="background:#f8f9fa;border:1px solid #e5e7eb;border-radius:10px;padding:0 14px;margin-bottom:8px">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid #e5e7eb">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:12px;font-weight:700;color:#374151">Set ${i+1}</span>
          ${i > 0 ? `<button type="button" onclick="copyPrevTemplateSet(${i},'${containerId}','${tid}')" style="font-size:11px;font-weight:700;padding:3px 9px;border-radius:6px;border:none;background:var(--accent);color:#fff;cursor:pointer">Copy set ${i} ↑</button>` : ''}
        </div>
        <div style="display:flex;gap:4px">
          ${!isCardio ? `
            ${tog('AMRAP', s.amrap, `toggleTsSet(${i},'amrap','${containerId}')`)}
            ${tog('⟺ Uni', s.unilateral, `toggleTsSet(${i},'unilateral','${containerId}')`)}
            ${tog('⏱ Timed', s.timed, `toggleTsSet(${i},'timed','${containerId}')`)}
            ${tog('BW', s.bodyweight, `toggleTsSet(${i},'bodyweight','${containerId}')`)}
            ${tog('Assist', s.assisted, `toggleTsSet(${i},'assisted','${containerId}')`)}
          ` : ''}
          <button type="button" onclick="flushTemplateSets('${containerId}');window._templateSets.splice(${i},1);renderTemplateSets('${containerId}',document.getElementById('${tid}')?.value||'strength')" style="width:26px;height:26px;border-radius:6px;border:1px solid #d1d5db;background:transparent;color:#9ca3af;cursor:pointer;font-size:15px;line-height:1">×</button>
        </div>
      </div>
      ${isCardio ? `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f3f4f6">
          <span style="font-size:13px;font-weight:600;color:#374151">Target</span>
          <div style="display:flex;gap:4px">
            ${tog('Duration', !s.isDistanceBased, `toggleTsSet(${i},'isDistanceBased','${containerId}')`)}
            ${tog('Distance', s.isDistanceBased, `toggleTsSet(${i},'isDistanceBased','${containerId}')`)}
          </div>
        </div>
        ${!s.isDistanceBased ? row('Duration', mini(`ts-duration-${i}`,'type="text" placeholder="0:00" oninput="this.value=fmtRestInput(this.value)" value="'+(s.duration||'0:00')+'"')) : ''}
        ${s.isDistanceBased ? row('Distance (km)', mini(`ts-distance-${i}`, `type="number" step="0.01" placeholder="—"${s.distance ? ` value="${s.distance}"` : ''}`)) : ''}
        ${row('Pace / 500m', mini(`ts-p500min-${i}`, `type="text" placeholder="0:00" oninput="tsPace500Input(${i},'${containerId}')" value="${s.pace500Min||'0:00'}"`) + dash + mini(`ts-p500max-${i}`, `type="text" placeholder="0:00" oninput="tsPace500Input(${i},'${containerId}')" value="${s.pace500Max||'0:00'}"`))}

        ${row('Pace / 1000m', `<span id="ts-p1000-${i}" style="font-size:13px;font-weight:600;color:var(--accent);min-width:100px;text-align:right">${calcPace1000(s.pace500Min, s.pace500Max)}</span>`)}
        ${row('Rest', mini(`ts-restmin-${i}`,'type="text" placeholder="0:00" oninput="this.value=fmtRestInput(this.value)" value="'+(s.restMin||'0:00')+'"') + dash + mini(`ts-restmax-${i}`,'type="text" placeholder="0:00" oninput="this.value=fmtRestInput(this.value)" value="'+(s.restMax||'0:00')+'"'))}
        ${row('HR Zone (BPM)', mini(`ts-hrzmin-${i}`,'type="number" placeholder="—"'+(s.hrZoneMin?` value="${s.hrZoneMin}"`:'')) + dash + mini(`ts-hrzmax-${i}`,'type="number" placeholder="—"'+(s.hrZoneMax?` value="${s.hrZoneMax}"`:'')))}
        ${row('Pace / km', mini(`ts-pkmmin-${i}`, `type="text" placeholder="0:00" oninput="this.value=fmtRestInput(this.value)" value="${s.paceKmMin||'0:00'}"`) + dash + mini(`ts-pkmmax-${i}`, `type="text" placeholder="0:00" oninput="this.value=fmtRestInput(this.value)" value="${s.paceKmMax||'0:00'}"`))}
        ${row('Rest HR max (BPM)', mini(`ts-resthr-${i}`, 'type="number" placeholder="e.g. 150"'+(s.restHrMax ? ` value="${s.restHrMax}"` : '')))}
        ${row('Stroke rate (spm)', mini(`ts-srmin-${i}`, 'type="number" placeholder="—"'+(s.strokeRateMin?` value="${s.strokeRateMin}"`:'')) + dash + mini(`ts-srmax-${i}`, 'type="number" placeholder="—"'+(s.strokeRateMax?` value="${s.strokeRateMax}"`:'')))}
      ` : `
        ${s.timed
          ? row('Duration (mm:ss)', mini(`ts-duration-${i}`, `type="text" placeholder="0:00" oninput="this.value=fmtRestInput(this.value)" value="${s.duration||'0:00'}"`))
          : row('Reps', mini(`ts-rmin-${i}`,'type="number" placeholder="0"'+(s.repsMin?` value="${s.repsMin}"`:'')) + dash + mini(`ts-rmax-${i}`,'type="number" placeholder="0"'+(s.repsMax?` value="${s.repsMax}"`:'')))}
        ${s.bodyweight ? '' : row('Weight (kg)', mini(`ts-weight-${i}`,'type="text" placeholder="Optional"'+(s.weight?` value="${s.weight}"`:'')))}
        ${s.assisted ? row('Assist weight (kg)', mini(`ts-assist-${i}`,'type="number" placeholder="e.g. 20"'+(s.assistWeight?` value="${s.assistWeight}"`:''))): ''}
        ${row('Intensity (%1RM)', mini(`ts-imin-${i}`,'type="number" placeholder="Min"'+(s.intensityMin?` value="${s.intensityMin}"`:'')) + dash + mini(`ts-imax-${i}`,'type="number" placeholder="Max"'+(s.intensityMax?` value="${s.intensityMax}"`:'')))}
        ${row('Rest between sets', mini(`ts-restmin-${i}`,'type="text" placeholder="0:00" oninput="this.value=fmtRestInput(this.value)" value="'+(s.restMin||'0:00')+'"') + dash + mini(`ts-restmax-${i}`,'type="text" placeholder="0:00" oninput="this.value=fmtRestInput(this.value)" value="'+(s.restMax||'0:00')+'"'))}
        ${row(etbtn('RPE','rpe')+etbtn('RIR','rir'), mini(`ts-emin-${i}`,'type="number" step="0.5" min="1" max="10" placeholder="Min"'+(s.effortMin?` value="${s.effortMin}"`:'')) + dash + mini(`ts-emax-${i}`,'type="number" step="0.5" min="1" max="10" placeholder="Max"'+(s.effortMax?` value="${s.effortMax}"`:'')))}
        ${row('Tempo', mini(`ts-tempo-${i}`,'type="text" maxlength="4" placeholder="e.g. 3011"'+(s.tempo?` value="${s.tempo}"`:'')))}
        ${row('Countdown (s)', mini(`ts-cd-${i}`,'type="number" placeholder="Optional"'+(s.countdown?` value="${s.countdown}"`:'')))}
      `}
    </div>`
  }).join('') + `
  <button type="button" onclick="flushTemplateSets('${containerId}');window._templateSets.push({effortType:'rpe'});renderTemplateSets('${containerId}',document.getElementById('${tid}')?.value||'strength')" style="margin-top:6px;font-size:13px;color:var(--accent);background:none;border:none;cursor:pointer;font-weight:600">+ Add set</button>`
}

function copyPrevTemplateSet(i, containerId, tid) {
  flushTemplateSets(containerId)
  const sets = window._templateSets || []
  if (i < 1 || i >= sets.length) return
  const prev = { ...sets[i - 1] }
  sets[i] = prev
  renderTemplateSets(containerId, document.getElementById(tid)?.value || 'strength')
}

// runnerCtx = { mode: 'add'|'swap' } — set when opened from the workout runner's
// Swap/Add exercise buttons. Same modal, same set-target builder, either mode: the runner
// context saves session-only into _runner.exercises (via _confirmRunnerExerciseFromModal
// in app-runner.js) instead of writing a workout_template_exercises row — matches the
// existing session-only swap/add behaviour, just via the identical picking UI Jake builds
// workouts with, per his 2026-07-03 instruction that both buttons must open "the same modal".
function showAddExerciseToTemplateModal(templateId, runnerCtx = null) {
  const isRunner = !!runnerCtx
  const _addOrmClientId = isRunner ? _runner.clientId : (currentProfile?.role === 'solo' ? window._soloClientId : null)
  Promise.all([
    db.from('exercises').select('*').order('name'),
    _addOrmClientId
      ? db.from('client_1rms').select('exercise_name').eq('client_id', _addOrmClientId).order('exercise_name')
      : db.from('client_1rms').select('exercise_name').order('exercise_name')
  ]).then(([{ data: exercises }, { data: ormRows }]) => {
    window._templateSets = [{ effortType: 'rpe' }]
    // Deduplicate 1RM exercise names across all clients (RLS scopes to coach's clients)
    const ormNames = [...new Set((ormRows || []).map(r => r.exercise_name))].sort()
    const title = isRunner ? (runnerCtx.mode === 'swap' ? 'Swap exercise' : 'Add exercise') : 'Add exercise'
    const confirmLabel = isRunner ? (runnerCtx.mode === 'swap' ? 'Swap' : 'Add') : 'Add exercise'
    const confirmAction = isRunner ? `_confirmRunnerExerciseFromModal('${runnerCtx.mode}')` : `saveExerciseToTemplate('${templateId}')`
    const overlay = document.createElement('div')
    overlay.className = 'modal-overlay'
    overlay.id = 'add-to-template-modal'
    // .modal-overlay is z-index:200 in main.css — the runner is a fullscreen z-index:300
    // layer, so opened from the runner this needs to sit above it (matches session-detail-panel, 1000).
    if (isRunner) overlay.style.zIndex = '1000'
    overlay.innerHTML = `
      <div class="modal" style="max-width:560px;max-height:90vh;overflow-y:auto">
        <div class="modal-header">
          <h2 class="modal-title">${title}</h2>
          <button class="modal-close" onclick="closeModal('add-to-template-modal')">✕</button>
        </div>
        <div class="field-row">
          <div class="field" style="flex:2">
            <label class="field-label">Pick from library</label>
            <select class="field-input" id="att-exercise">
              <option value="">— or type a custom name below —</option>
              ${ormNames.length ? `<optgroup label="── 1RM lifts ──">${ormNames.map(n => `<option value="" data-name="${n}" data-is-orm="1">${n}</option>`).join('')}</optgroup>` : ''}
              ${(exercises || []).map(e => `<option value="${e.id}" data-name="${e.name}">${e.name}${e.muscle_group ? ' · '+e.muscle_group : ''}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label class="field-label">Type</label>
            <select class="field-input" id="att-type" onchange="flushTemplateSets('att-sets-container');renderTemplateSets('att-sets-container',this.value)">
              <option value="strength">Strength</option>
              <option value="cardio">Cardio</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label class="field-label">Exercise name <span style="color:var(--danger)">*</span></label>
          <input class="field-input" id="att-name" placeholder="e.g. Barbell Back Squat">
        </div>

        <div style="margin:16px 0 10px;font-size:13px;font-weight:600;color:var(--text)">Set targets</div>
        <div id="att-sets-container"></div>

        <div class="field" style="margin-top:14px">
          <label class="field-label">Notes / coaching cues</label>
          <textarea class="field-input" id="att-notes" placeholder="e.g. Pause 1s at bottom, 3s eccentric" rows="2" style="resize:vertical"></textarea>
        </div>
        <div class="field">
          <label class="field-label">Superset group <span style="font-weight:400;color:var(--text-muted)">(optional — enter same letter, e.g. A, to link exercises)</span></label>
          <input class="field-input" id="att-superset" placeholder="e.g. A" maxlength="3" style="width:80px">
        </div>
        <p class="modal-error" id="att-error"></p>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="closeModal('add-to-template-modal')">Cancel</button>
          <button class="btn-primary" id="att-confirm-btn" onclick="${confirmAction}">${confirmLabel}</button>
        </div>
      </div>
    `
    document.body.appendChild(overlay)
    renderTemplateSets('att-sets-container', 'strength')
    document.getElementById('att-name').focus()

    document.getElementById('att-exercise').addEventListener('change', function() {
      const opt = this.options[this.selectedIndex]
      if (opt.value || opt.dataset.name) {
        document.getElementById('att-name').value = opt.dataset.name || ''
        // If it's a 1RM lift, switch type to strength and scroll intensity fields into view
        if (opt.dataset.isOrm) {
          document.getElementById('att-type').value = 'strength'
          flushTemplateSets('att-sets-container')
          renderTemplateSets('att-sets-container', 'strength')
          setTimeout(() => document.querySelector('[id^="ts-imin-"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100)
        }
      }
    })
  })
}

async function saveExerciseToTemplate(templateId) {
  flushTemplateSets('att-sets-container')
  const exerciseId = document.getElementById('att-exercise').value
  const name = document.getElementById('att-name').value.trim()
  const errorEl = document.getElementById('att-error')
  if (!name) { errorEl.textContent = 'Exercise name is required'; return }
  log.info('saveExerciseToTemplate', 'adding exercise to template', { templateId, name })

  const { data: existing } = await db
    .from('workout_template_exercises')
    .select('order_index')
    .eq('template_id', templateId)
    .order('order_index', { ascending: false })
    .limit(1)

  const nextOrder = existing?.length ? (existing[0].order_index + 1) : 0
  const sets = window._templateSets || []

  const cleanSets = sets.map(s => ({
    amrap: !!s.amrap, unilateral: !!s.unilateral, timed: !!s.timed,
    bodyweight: !!s.bodyweight, assisted: !!s.assisted, assistWeight: s.assistWeight||null,
    repsMin: s.repsMin||null, repsMax: s.repsMax||null, weight: s.weight||null,
    intensityMin: s.intensityMin||null, intensityMax: s.intensityMax||null,
    restMin: s.restMin||null, restMax: s.restMax||null,
    effortType: s.effortType||'rpe', effortMin: s.effortMin||null, effortMax: s.effortMax||null,
    tempo: s.tempo||null, countdown: s.countdown||null,
    duration: s.duration||null, distance: s.distance||null
  }))
  const { error } = await db.from('workout_template_exercises').insert({
    template_id:   templateId,
    exercise_id:   exerciseId || null,
    exercise_name: name,
    exercise_type: document.getElementById('att-type').value,
    order_index:   nextOrder,
    sets:           cleanSets.length || null,
    sets_json:      cleanSets.length ? cleanSets : null,
    notes:          document.getElementById('att-notes').value.trim() || null,
    superset_group: document.getElementById('att-superset')?.value.trim().toUpperCase() || null
  })

  if (error) { log.error('saveExerciseToTemplate', 'insert failed', error); errorEl.textContent = error.message; return }
  log.ok('saveExerciseToTemplate', 'exercise added to template', { templateId, name })
  closeModal('add-to-template-modal')
  _checkClientPlanPropagation(templateId)
}

async function showEditTemplateExerciseModal(templateExId, templateId) {
  const ctx = window._templateCtx
  const ormClientId = ctx.clientId || (currentProfile?.role === 'solo' ? window._soloClientId : null)
  const [{ data: ex }, { data: ormRows }, { data: libraryExercises }] = await Promise.all([
    db.from('workout_template_exercises').select('*').eq('id', templateExId).single(),
    ormClientId
      ? db.from('client_1rms').select('exercise_name').eq('client_id', ormClientId).order('exercise_name')
      : Promise.resolve({ data: [] }),
    db.from('exercises').select('id, name, muscle_group').order('name')
  ])
  window._templateSets = ex.sets_json?.length ? ex.sets_json.map(s => ({...s})) : (ex.sets ? Array.from({length: ex.sets}, () => ({})) : [{}])

  const ormNames = [...new Set((ormRows || []).map(r => r.exercise_name))].sort()
  const libExercises = libraryExercises || []
  const ormDropdown = `
    <div class="field-row" style="margin-bottom:8px">
      <div class="field" style="flex:2">
        <label class="field-label">Pick from library</label>
        <select class="field-input" id="etex-lib-pick" onchange="if(this.value){document.getElementById('etex-name').value=this.value}">
          <option value="">— or type a custom name below —</option>
          ${ormNames.length ? `<optgroup label="── Client 1RM lifts ──">${ormNames.map(n => `<option value="${n}" ${n === ex.exercise_name ? 'selected' : ''}>${n}</option>`).join('')}</optgroup>` : ''}
          ${libExercises.map(e => `<option value="${e.name}" ${e.name === ex.exercise_name ? 'selected' : ''}>${e.name}${e.muscle_group ? ' · '+e.muscle_group : ''}</option>`).join('')}
        </select>
      </div>
    </div>`

  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.id = 'edit-tex-modal'
  overlay.innerHTML = `
    <div class="modal" style="max-width:560px;max-height:90vh;overflow-y:auto">
      <div class="modal-header">
        <h2 class="modal-title">Edit: ${ex.exercise_name}</h2>
        <button class="modal-close" onclick="closeModal('edit-tex-modal')">✕</button>
      </div>
      ${ormDropdown}
      <div class="field-row">
        <div class="field">
          <label class="field-label">Exercise name</label>
          <input class="field-input" id="etex-name" value="${ex.exercise_name}">
        </div>
        <div class="field">
          <label class="field-label">Type</label>
          <select class="field-input" id="ett-type" onchange="flushTemplateSets('ett-sets-container');renderTemplateSets('ett-sets-container',this.value)">
            <option value="strength" ${ex.exercise_type !== 'cardio' ? 'selected' : ''}>Strength</option>
            <option value="cardio" ${ex.exercise_type === 'cardio' ? 'selected' : ''}>Cardio</option>
          </select>
        </div>
      </div>

      <div style="margin:16px 0 10px;font-size:13px;font-weight:600;color:var(--text)">Set targets</div>
      <div id="ett-sets-container"></div>

      <div class="field" style="margin-top:14px">
        <label class="field-label">Notes / coaching cues</label>
        <input class="field-input" id="etex-notes" value="${ex.notes || ''}">
      </div>
      <div class="field">
        <label class="field-label">Superset group <span style="font-weight:400;color:var(--text-muted)">(optional — same letter links exercises, e.g. A)</span></label>
        <input class="field-input" id="etex-superset" value="${ex.superset_group || ''}" placeholder="e.g. A" maxlength="3" style="width:80px">
      </div>
      <p class="modal-error" id="etex-error"></p>
      <div class="modal-footer">
        <button class="btn-danger" onclick="deleteTemplateExercise('${templateExId}','${templateId}')">Remove</button>
        <div style="flex:1"></div>
        <button class="btn-secondary" onclick="closeModal('edit-tex-modal')">Cancel</button>
        <button class="btn-primary" onclick="saveEditTemplateExercise('${templateExId}','${templateId}')">Save</button>
      </div>
    </div>
  `
  document.body.appendChild(overlay)
  renderTemplateSets('ett-sets-container', ex.exercise_type || 'strength')
}

async function saveEditTemplateExercise(texId, templateId) {
  flushTemplateSets('ett-sets-container')
  const errorEl = document.getElementById('etex-error')
  const name = document.getElementById('etex-name').value.trim()
  if (!name) { errorEl.textContent = 'Name is required'; return }
  const sets = window._templateSets || []

  log.info('saveEditTemplateExercise', 'updating template exercise', { texId, name })
  const { error } = await db.from('workout_template_exercises').update({
    exercise_name: name,
    exercise_type: document.getElementById('ett-type').value,
    sets:           sets.length || null,
    sets_json:      sets.length ? sets : null,
    notes:          document.getElementById('etex-notes').value.trim() || null,
    superset_group: document.getElementById('etex-superset')?.value.trim().toUpperCase() || null
  }).eq('id', texId)
  if (error) { log.error('saveEditTemplateExercise', 'update failed', error); errorEl.textContent = error.message; return }
  log.ok('saveEditTemplateExercise', 'template exercise updated', { texId })
  closeModal('edit-tex-modal')
  _checkClientPlanPropagation(templateId)
}

async function deleteTemplateExercise(texId, templateId) {
  log.info('deleteTemplateExercise', 'removing exercise from template', { texId, templateId })
  const { error } = await db.from('workout_template_exercises').delete().eq('id', texId)
  if (error) { log.error('deleteTemplateExercise', 'delete failed', error); return }
  log.ok('deleteTemplateExercise', 'exercise removed', { texId })
  closeModal('edit-tex-modal')
  openTemplate(templateId)
}

async function _checkClientPlanPropagation(templateId) {
  const ctx = window._templateCtx

  const _showPropagateModal = (name, count, label) => {
    const overlay = document.createElement('div')
    overlay.className = 'modal-overlay'
    overlay.id = 'propagate-modal'
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h2 class="modal-title">Apply to other sessions?</h2>
          <button class="modal-close" onclick="closeModal('propagate-modal');openTemplate('${templateId}',window._templateCtx)">✕</button>
        </div>
        <p style="font-size:14px;line-height:1.6;margin:0 0 20px">There ${count === 1 ? 'is' : 'are'} <strong>${count}</strong> other session${count === 1 ? '' : 's'} named "<strong>${name}</strong>" in ${label}.</p>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="closeModal('propagate-modal');openTemplate('${templateId}',window._templateCtx)">Just this session</button>
          <button class="btn-primary" onclick="_applyToAllSessions('${templateId}')">Update all "${name}"</button>
        </div>
      </div>
    `
    document.body.appendChild(overlay)
  }

  // Client plan propagation
  if (ctx?.isClientPlan && ctx.clientProgramId) {
    const { data: tmpl } = await db.from('workout_templates').select('name').eq('id', templateId).single()
    if (!tmpl) return openTemplate(templateId, ctx)
    const { data: siblings } = await db.from('client_program_workouts')
      .select('workout_template_id, workout_templates(id, name)')
      .eq('client_program_id', ctx.clientProgramId)
    const matching = (siblings || []).filter(r =>
      r.workout_template_id !== templateId && r.workout_templates?.name === tmpl.name
    )
    if (!matching.length) return openTemplate(templateId, ctx)
    window._propagateTargets = matching.map(r => r.workout_template_id)
    _showPropagateModal(tmpl.name, matching.length, `${ctx.clientName || 'this client'}'s plan`)
    return
  }

  // Master program propagation (Programs builder — solo and PT)
  if (ctx?.programId) {
    const { data: tmpl } = await db.from('workout_templates').select('name').eq('id', templateId).single()
    if (!tmpl) return openTemplate(templateId, ctx)
    const { data: phases } = await db.from('program_phases').select('id').eq('program_id', ctx.programId)
    const phaseIds = (phases || []).map(p => p.id)
    if (!phaseIds.length) return openTemplate(templateId, ctx)
    const { data: pws } = await db.from('program_phase_workouts')
      .select('template_id, workout_templates(id, name)')
      .in('phase_id', phaseIds)
    const matching = (pws || []).filter(r =>
      r.template_id !== templateId && r.workout_templates?.name === tmpl.name
    )
    if (!matching.length) {
      // Template may be shared across multiple weeks — edits already apply to all
      const sharedCount = pws.filter(r => r.template_id === templateId).length
      if (sharedCount > 1) {
        const toast = document.createElement('div')
        toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:10px 18px;font-size:13px;font-weight:600;color:var(--text);z-index:9999;pointer-events:none;text-align:center;box-shadow:0 4px 12px rgba(0,0,0,.15)'
        toast.textContent = `✓ Changes apply to all ${sharedCount} "${tmpl.name}" sessions — they share this template`
        document.body.appendChild(toast)
        setTimeout(() => toast.remove(), 3500)
      }
      return openTemplate(templateId, ctx)
    }
    window._propagateTargets = matching.map(r => r.template_id)
    _showPropagateModal(tmpl.name, matching.length, 'this program')
    return
  }

  openTemplate(templateId, ctx)
}

async function _applyToAllSessions(sourceTemplateId) {
  closeModal('propagate-modal')
  const targetIds = window._propagateTargets || []
  if (!targetIds.length) { openTemplate(sourceTemplateId, window._templateCtx); return }

  const { data: sourceExs } = await db.from('workout_template_exercises')
    .select('*').eq('template_id', sourceTemplateId).order('order_index')

  for (const targetId of targetIds) {
    await db.from('workout_template_exercises').delete().eq('template_id', targetId)
    if (sourceExs?.length) {
      const copies = sourceExs.map(ex => ({
        template_id: targetId,
        exercise_id: ex.exercise_id || null,
        exercise_name: ex.exercise_name,
        exercise_type: ex.exercise_type,
        order_index: ex.order_index,
        sets: ex.sets || null,
        sets_json: ex.sets_json || null,
        notes: ex.notes || null,
        superset_group: ex.superset_group || null
      }))
      await db.from('workout_template_exercises').insert(copies)
    }
  }

  // If propagating from master program, also sync client plan copies
  // (client_program_workouts links back to program_phase_workouts via program_phase_workout_id)
  if (window._templateCtx?.programId) {
    const allMasterIds = [sourceTemplateId, ...targetIds]
    const { data: ppws } = await db.from('program_phase_workouts')
      .select('id').in('template_id', allMasterIds)
    if (ppws?.length) {
      const { data: cpws } = await db.from('client_program_workouts')
        .select('workout_template_id').in('program_phase_workout_id', ppws.map(r => r.id))
      const clientTmplIds = (cpws || []).map(r => r.workout_template_id).filter(Boolean)
      for (const clientTmplId of clientTmplIds) {
        await db.from('workout_template_exercises').delete().eq('template_id', clientTmplId)
        if (sourceExs?.length) {
          const copies = sourceExs.map(ex => ({
            template_id: clientTmplId,
            exercise_id: ex.exercise_id || null,
            exercise_name: ex.exercise_name,
            exercise_type: ex.exercise_type,
            order_index: ex.order_index,
            sets: ex.sets || null,
            sets_json: ex.sets_json || null,
            notes: ex.notes || null,
            superset_group: ex.superset_group || null
          }))
          await db.from('workout_template_exercises').insert(copies)
        }
      }
      log.ok('_applyToAllSessions', `synced ${clientTmplIds.length} client plan copies`)
    }
  }

  log.ok('_applyToAllSessions', `propagated to ${targetIds.length} sessions`)
  openTemplate(sourceTemplateId, window._templateCtx)
}

async function showEditTemplateModal(id) {
  const { data: t } = await db.from('workout_templates').select('*').eq('id', id).single()
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.id = 'edit-template-modal'
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2 class="modal-title">Edit template</h2>
        <button class="modal-close" onclick="closeModal('edit-template-modal')">✕</button>
      </div>
      <div class="field">
        <label class="field-label">Name</label>
        <input class="field-input" id="et-name" value="${t.name}">
      </div>
      <div class="field">
        <label class="field-label">Description</label>
        <textarea class="field-input" id="et-desc" rows="2" style="resize:vertical">${t.description || ''}</textarea>
      </div>
      <p class="modal-error" id="et-error"></p>
      <div class="modal-footer">
        <button class="btn-danger" onclick="deleteTemplate('${id}')">Delete template</button>
        <div style="flex:1"></div>
        <button class="btn-secondary" onclick="closeModal('edit-template-modal')">Cancel</button>
        <button class="btn-primary" onclick="saveEditTemplate('${id}')">Save</button>
      </div>
    </div>
  `
  document.body.appendChild(overlay)
}

async function saveEditTemplate(id) {
  const errorEl = document.getElementById('et-error')
  const name = document.getElementById('et-name').value.trim()
  if (!name) { errorEl.textContent = 'Name is required'; return }
  log.info('saveEditTemplate', 'updating template', { id, name })
  const { data, error } = await db.from('workout_templates').update({
    name,
    description: document.getElementById('et-desc').value.trim() || null
  }).eq('id', id).eq('coach_id', currentUser.id).select()
  if (error) { log.error('saveEditTemplate', 'update failed', error); errorEl.textContent = error.message; return }
  if (!data?.length) { log.error('saveEditTemplate', 'no rows updated — permission denied?', { id }); errorEl.textContent = 'Save failed — template not found or permission denied.'; return }
  log.ok('saveEditTemplate', 'template updated', { id })
  closeModal('edit-template-modal')
  openTemplate(id)
}

async function deleteTemplate(id) {
  if (!confirm('Delete this template? This cannot be undone.')) return
  log.info('deleteTemplate', 'deleting template', { id })
  const { data, error } = await db.from('workout_templates').delete().eq('id', id).eq('coach_id', currentUser.id).select()
  if (error) { log.error('deleteTemplate', 'delete failed', error); return }
  if (!data?.length) { log.error('deleteTemplate', 'no rows deleted — permission denied or already gone', { id }); return }
  log.ok('deleteTemplate', 'template deleted', { id })
  closeModal('edit-template-modal')
  navigate('workouts')
}

// ─── CLIENT WORKOUTS TAB ──────────────────────────────────────────────────────
async function renderClientWorkouts(clientId, el) {
  log.info('renderClientWorkouts', 'fetching', { clientId })
  el.innerHTML = '<div class="loading-state">Loading…</div>'

  const [{ data: logs, error }, { data: clientProgs }, { data: clientData }] = await Promise.all([
    db.from('workout_logs').select('*, workout_log_exercises(id)').eq('client_id', clientId).order('date', { ascending: false }).limit(20),
    db.from('client_programs').select('id, programs(id, name)').eq('client_id', clientId).order('created_at', { ascending: false }),
    db.from('clients').select('full_name').eq('id', clientId).single()
  ])

  if (error) { log.error('renderClientWorkouts', 'fetch failed', error); el.innerHTML = `<div class="loading-state">${error.message}</div>`; return }

  let programWorkoutsHtml = ''
  if (clientProgs?.length) {
    const cpIds = clientProgs.map(cp => cp.id)
    const { data: cpwRows } = await db.from('client_program_workouts')
      .select('workout_template_id, workout_templates(id, name)')
      .in('client_program_id', cpIds)

    if (cpwRows?.length) {
      const seen = new Set()
      const unique = cpwRows.filter(r => { const id = r.workout_template_id; if (seen.has(id)) return false; seen.add(id); return true })
      const programName = clientProgs[0]?.programs?.name || 'Program'
      programWorkoutsHtml = `
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:10px">${programName}</div>
        <div class="list" style="margin-bottom:20px">
          ${unique.map(r => `
            <div class="list-row" onclick="openTemplate('${r.workout_templates?.id||r.workout_template_id}',{backTo:'client',backLabel:'${(clientData?.full_name||'Client').replace(/'/g,"\\'")}',clientId:'${clientId}',clientName:'${(clientData?.full_name||'Client').replace(/'/g,"\\'")}',clientProgramId:'${cpIds[0]||''}'})">
              <div style="width:40px;height:40px;border-radius:10px;background:rgba(99,102,241,.12);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">💪</div>
              <div class="row-info">
                <div class="row-name">${r.workout_templates?.name||'Workout'}</div>
                <div class="row-meta">Tap to edit for this client</div>
              </div>
              <div class="row-right">
                <svg style="width:15px;height:15px;color:#d1d5db" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
              </div>
            </div>`).join('')}
        </div>`
    }
  }

  log.ok('renderClientWorkouts', `loaded ${logs?.length} sessions`)

  el.innerHTML = `
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-bottom:16px">
      <button class="btn-secondary" style="font-size:13px" onclick="showLogSessionModal('${clientId}')">Log past session</button>
      <button class="btn-primary" onclick="startWorkoutRunner('${clientId}')">▶ Start workout</button>
    </div>
    ${programWorkoutsHtml}
    ${!logs?.length ? `
      <div class="list">
        <div class="empty-state">
          <div class="empty-icon">💪</div>
          <div class="empty-title">No sessions logged yet</div>
          <div class="empty-text">Log a workout to start tracking this client's training</div>
          <button class="btn-primary" onclick="showLogSessionModal('${clientId}')">+ Log first session</button>
        </div>
      </div>
    ` : `
      <button onclick="toggleClientPhase('pt-session-history')" style="width:100%;display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;background:none;border:none;padding:0;cursor:pointer;text-align:left">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted)">Session history</div>
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:12px;color:var(--text-muted)">${logs.length} sessions</span>
          <svg id="pt-session-history-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;color:var(--text-muted);transition:transform .2s"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      </button>
      <div id="pt-session-history" style="display:none">
        <div class="list">
          ${logs.map(l => {
            const dateStr = new Date(l.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
            return `
              <div class="list-row" onclick="openWorkoutLog('${l.id}','${clientId}')">
                <div style="width:40px;height:40px;border-radius:10px;background:rgba(99,102,241,.12);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">💪</div>
                <div class="row-info">
                  <div class="row-name">${l.name}</div>
                  <div class="row-meta">${dateStr} · ${l.workout_log_exercises.length} exercise${l.workout_log_exercises.length !== 1 ? 's' : ''}</div>
                </div>
                <div class="row-right">
                  <svg style="width:15px;height:15px;color:#d1d5db" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                </div>
              </div>
            `
          }).join('')}
        </div>
      </div>
    `}
  `
}

// ─── WORKOUT RUNNER ───────────────────────────────────────────────────────────
let _runner = null

async function startWorkoutRunner(clientId, templateId) {
  // Unlock audio/speech here (the earliest real user gesture) instead of waiting for
  // the first LOG tap — gives the AudioContext maximum time to resume before the
  // first rest period needs it.
  _unlockAudio()
  _unlockSpeech()
  const coachId = currentProfile?.role === 'client'
    ? (await db.from('clients').select('coach_id').eq('user_id', currentUser.id).single()).data?.coach_id
    : currentUser.id

  // When a templateId is provided, fetch only that template to avoid max_rows truncation
  if (templateId) {
    const { data: tmpl } = await db.from('workout_templates').select('*, workout_template_exercises(*)').eq('id', templateId).single()
    window._runnerTemplates = tmpl ? [tmpl] : []
    const name = tmpl?.name || new Date().toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'}) + ' workout'
    _fakeRsTemplate = templateId
    _fakeRsName = name
    launchRunner(clientId)
    return
  }

  const { data: templates } = await db.from('workout_templates').select('*, workout_template_exercises(*)').eq('coach_id', coachId).order('name').limit(2000)
  window._runnerTemplates = templates || []

  const overlay = document.createElement('div')
  overlay.id = 'runner-setup'
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `
    <div class="modal modal-fullscreen-mobile" style="max-width:480px">
      <div class="modal-header">
        <h2 class="modal-title">Start workout</h2>
        <button class="modal-close" onclick="document.getElementById('runner-setup').remove()">✕</button>
      </div>
      <div class="field">
        <label class="field-label">Session name</label>
        <input class="field-input" id="rs-name" placeholder="e.g. Push A" value="${new Date().toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})} workout">
      </div>
      <div class="field">
        <label class="field-label">Load from template</label>
        <select class="field-input" id="rs-template">
          <option value="">— Custom / blank —</option>
          ${(templates||[]).map(t=>`<option value="${t.id}">${t.name}</option>`).join('')}
        </select>
      </div>
      <p class="modal-error" id="rs-error"></p>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="document.getElementById('runner-setup').remove()">Cancel</button>
        <button class="btn-primary" onclick="launchRunner('${clientId}')">▶ Start</button>
      </div>
    </div>
  `
  document.body.appendChild(overlay)
}

