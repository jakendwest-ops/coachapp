async function renderCalendar(el) {
  const now = new Date()
  calendarYear  = calendarYear  ?? now.getFullYear()
  calendarMonth = calendarMonth ?? now.getMonth()
  el.innerHTML = '<div class="loading-state">Loading…</div>'

  // Fetch events for this month + overflow days
  const firstDay = new Date(calendarYear, calendarMonth, 1)
  const lastDay  = new Date(calendarYear, calendarMonth + 1, 0)
  const localDate = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  const from = localDate(firstDay)
  const to   = localDate(lastDay)

  const isClient = currentProfile?.role === 'client' || currentProfile?.role === 'solo'
  let events, clientMap = {}, programWorkoutsByDate = {}

  if (isClient) {
    // Step 1: get clients.id — solo uses personal record, coached client uses coached record
    const resolvedId = await _getCurrentClientId()
    window._calClientId = resolvedId
    const clientsId = resolvedId

    // Step 2: events + client_programs in parallel (client_programs uses clients.id not auth uid)
    const [evRes, cpRes] = await Promise.all([
      db.from('events').select('*').gte('date', from).lte('date', to).order('date'),
      clientsId
        ? db.from('client_programs').select('id, start_date, programs(program_phases(duration_weeks, program_phase_workouts(id, day_of_week, session_order, workout_templates(id, name, workout_template_exercises(exercise_name, exercise_type, order_index, sets_json)))))').eq('client_id', clientsId).order('created_at', { ascending: false }).limit(1)
        : Promise.resolve({ data: [] })
    ])
    events = evRes.data

    // Step 3: client_program_workouts scoped to this assignment
    const _cpwMap = {}
    const cp0 = cpRes.data?.[0]
    if (cp0?.id) {
      const cpwRes = await db.from('client_program_workouts').select('program_phase_workout_id, workout_template_id').eq('client_program_id', cp0.id)
      ;(cpwRes.data || []).forEach(r => { _cpwMap[r.program_phase_workout_id] = r.workout_template_id })
    }
    window._calClientTemplateMap = _cpwMap

    // Map phase workouts to actual calendar dates
    if (cp0?.start_date) {
      const programStart = new Date(cp0.start_date + 'T00:00:00')
      // Normalise to Monday of that week
      const dayOfWeekJS = programStart.getDay() // 0=Sun
      const daysFromMon = (dayOfWeekJS + 6) % 7
      const weekStart = new Date(programStart)
      weekStart.setDate(programStart.getDate() - daysFromMon)

      const phases = cp0.programs?.program_phases || []
      let weekOffset = 0
      phases.forEach(phase => {
        for (let w = 0; w < (phase.duration_weeks || 1); w++) {
          ;(phase.program_phase_workouts || []).forEach(pw => {
            const offset = ((weekOffset + w) * 7) + (pw.day_of_week - 1)
            const d = new Date(weekStart)
            d.setDate(weekStart.getDate() + offset)
            const ds = localDate(d)
            if (!programWorkoutsByDate[ds]) programWorkoutsByDate[ds] = []
            programWorkoutsByDate[ds].push({ ...pw, _clientTemplateId: _cpwMap[pw.id] || null })
          })
        }
        weekOffset += (phase.duration_weeks || 1)
      })
      // Sort each day by session_order
      Object.values(programWorkoutsByDate).forEach(arr => arr.sort((a,b)=>(a.session_order||1)-(b.session_order||1)))
      window._calProgramWorkouts = programWorkoutsByDate
    }
  } else {
    const [evRes, clRes] = await Promise.all([
      db.from('events').select('*').gte('date', from).lte('date', to).order('date'),
      db.from('clients').select('id, full_name').eq('coach_id', currentUser.id).order('full_name')
    ])
    events = evRes.data
    ;(clRes.data || []).forEach(c => { clientMap[c.id] = c.full_name })
  }

  // Group events by date
  const byDate = {}
  ;(events || []).forEach(e => {
    if (!byDate[e.date]) byDate[e.date] = []
    byDate[e.date].push(e)
  })

  const monthName = firstDay.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  const todayStr  = localDate(now)

  // Build calendar grid (Mon-start)
  const startDow = (firstDay.getDay() + 6) % 7 // 0=Mon
  const daysInMonth = lastDay.getDate()
  let cells = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  el.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Calendar</h1>
      <button class="btn-primary" onclick="${isClient ? 'showClientAddEventModal()' : 'showAddEventModal()'}">+ Add event</button>
    </div>

    <div class="card" style="margin-bottom:16px">
      <div class="card-body" style="padding:16px 20px">

        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
          <button class="btn-secondary" style="padding:6px 14px" onclick="calNav(-1)">←</button>
          <h2 style="font-size:16px;font-weight:600">${monthName}</h2>
          <button class="btn-secondary" style="padding:6px 14px" onclick="calNav(1)">→</button>
        </div>

        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center">
          ${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d =>
            `<div style="font-size:11px;font-weight:600;color:var(--text-muted);padding:4px 0">${d}</div>`
          ).join('')}
          ${cells.map(d => {
            if (!d) return `<div style="padding:4px;min-height:52px"></div>`
            const dateStr = `${calendarYear}-${String(calendarMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
            const dayEvents = byDate[dateStr] || []
            const dayWorkouts = programWorkoutsByDate[dateStr] || []
            const isToday = dateStr === todayStr
            const hasWorkouts = dayWorkouts.length > 0
            return `
              <div onclick="showDayEvents('${dateStr}')" style="
                padding:4px;border-radius:8px;cursor:pointer;min-height:52px;
                background:${isToday ? 'var(--accent)' : hasWorkouts ? 'var(--surface-2)' : 'transparent'};
                border:1px solid ${isToday ? 'transparent' : hasWorkouts ? 'var(--border)' : 'transparent'};
                transition:background 0.15s
              " onmouseover="this.style.background='${isToday ? 'var(--accent)' : 'var(--surface-2)'}'"
                 onmouseout="this.style.background='${isToday ? 'var(--accent)' : hasWorkouts ? 'var(--surface-2)' : 'transparent'}'">
                <div style="font-size:11px;font-weight:${isToday?'700':'500'};color:${isToday?'#fff':'var(--text)'}">
                  ${d}
                </div>
                ${hasWorkouts ? dayWorkouts.map(pw => `
                  <div style="margin-top:2px">
                    ${dayWorkouts.length > 1 ? `<div style="font-size:7px;font-weight:700;color:${isToday?'rgba(255,255,255,.7)':'var(--accent)'};letter-spacing:.04em;line-height:1">${pw.session_order===2?'PM':'AM'}</div>` : ''}
                    <div style="font-size:8px;font-weight:600;color:${isToday?'#fff':'var(--text)'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.2">${(pw.workout_templates?.name||'').replace(/ —.*/, '')}</div>
                  </div>`).join('') : ''}
                <div style="display:flex;flex-wrap:wrap;gap:2px;margin-top:2px">
                  ${dayEvents.slice(0,3).map(e =>
                    `<div style="width:4px;height:4px;border-radius:50%;background:${EVENT_COLOURS[e.type]?.dot || '#9ca3af'}"></div>`
                  ).join('')}
                </div>
              </div>
            `
          }).join('')}
        </div>

      </div>
    </div>

    <!-- Event list for selected month -->
    <div id="cal-event-list">
      ${renderEventList(events || [], clientMap)}
    </div>
  `
}

function renderEventList(events, clientMap) {
  if (!events.length) return `
    <div class="card"><div class="card-body" style="padding:20px;text-align:center">
      <p style="color:var(--text-muted);font-size:13px">No events this month</p>
    </div></div>
  `
  return `
    <div class="card">
      <div class="card-header" style="padding:16px 20px 0">
        <h2 class="section-title">This month</h2>
      </div>
      <div class="card-body" style="padding:8px 20px 16px">
        ${events.map(e => {
          const col = EVENT_COLOURS[e.type] || EVENT_COLOURS.other
          const dateLabel = new Date(e.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
          return `
            <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">
              <div style="width:40px;text-align:center;flex-shrink:0">
                <div style="font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase">${dateLabel.split(' ')[0]}</div>
                <div style="font-size:18px;font-weight:700;line-height:1.1">${dateLabel.split(' ')[1]}</div>
              </div>
              <div style="flex:1;min-width:0">
                <div style="font-size:13px;font-weight:600">${e.title}</div>
                <div style="display:flex;gap:6px;margin-top:3px;align-items:center">
                  <span style="font-size:11px;padding:2px 7px;border-radius:4px;background:${col.bg};color:${col.text};font-weight:600">${e.type}</span>
                  ${e.client_id ? `<span style="font-size:11.5px;color:var(--text-muted)">${clientMap[e.client_id] || ''}</span>` : ''}
                </div>
              </div>
              <button onclick="deleteEvent('${e.id}')" style="background:none;border:none;color:var(--text-muted);cursor:pointer;padding:4px;font-size:14px" title="Delete">✕</button>
            </div>
          `
        }).join('')}
      </div>
    </div>
  `
}

function calNav(dir) {
  calendarMonth += dir
  if (calendarMonth > 11) { calendarMonth = 0; calendarYear++ }
  if (calendarMonth < 0)  { calendarMonth = 11; calendarYear-- }
  renderCalendar(document.getElementById('main-content'))
}

function showDayEvents(dateStr) {
  if (currentProfile?.role === 'client' || currentProfile?.role === 'solo') showClientDayDetail(dateStr)
  else showAddEventModal(dateStr)
}

function showClientDayDetail(dateStr) {
  const existing = document.getElementById('client-day-modal')
  if (existing) existing.remove()

  const workouts = (window._calProgramWorkouts || {})[dateStr] || []
  const clientId = window._calClientId || ''
  const dateLabel = new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.id = 'client-day-modal'
  overlay.onclick = e => { if (e.target === overlay) overlay.remove() }

  overlay.innerHTML = `
    <div class="modal" style="max-width:420px;width:92%">
      <div class="modal-header">
        <h2 class="modal-title">${dateLabel}</h2>
        <button class="modal-close" onclick="document.getElementById('client-day-modal').remove()">✕</button>
      </div>
      <div style="padding:16px 20px 20px">
        ${workouts.length ? workouts.map((pw, si) => {
          const exs = (pw.workout_templates?.workout_template_exercises || []).sort((a,b) => a.order_index - b.order_index)
          const multi = workouts.length > 1
          return `
          <div style="padding:14px 0;border-bottom:1px solid var(--border)">
            ${multi ? `<div style="font-size:10px;font-weight:700;color:var(--accent);letter-spacing:.06em;margin-bottom:4px">SESSION ${si+1}/${workouts.length}</div>` : ''}
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:${exs.length ? '8px' : '10px'}">
              <span style="font-size:15px;font-weight:600">${(pw.workout_templates?.name || 'Workout').replace(/ — W\d+/, '')}</span>
            </div>
            ${exs.length ? `
            <div style="margin-bottom:10px;padding:6px 8px;background:var(--surface-2);border-radius:8px">
              ${exs.map(ex => `
                <div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--border)">
                  <span style="font-size:12px">${ex.exercise_name}</span>
                  <span style="font-size:11px;color:var(--text-muted)">${ex.sets_json?.length || 0} set${(ex.sets_json?.length || 0) !== 1 ? 's' : ''}</span>
                </div>`).join('')}
            </div>` : ''}
            <button onclick="startWorkoutRunner('${clientId}','${pw._clientTemplateId||pw.workout_templates?.id}');document.getElementById('client-day-modal').remove()" class="btn-primary" style="width:100%">▶ Start workout</button>
          </div>`}).join('') : `
          <div style="text-align:center;padding:24px 0">
            <div style="font-size:32px;margin-bottom:8px">🛋️</div>
            <div style="font-size:15px;font-weight:600;margin-bottom:4px">Rest day</div>
            <div style="font-size:13px;color:var(--text-muted)">No sessions scheduled</div>
          </div>`}
      </div>
    </div>`

  document.body.appendChild(overlay)
}

async function deleteEvent(id) {
  if (!confirm('Delete this event?')) return
  log.info('deleteEvent', 'deleting event', { eventId: id })
  const { error } = await db.from('events').delete().eq('id', id)
  if (error) { log.error('deleteEvent', 'delete failed', error); return }
  log.ok('deleteEvent', 'event deleted', { eventId: id })
  renderCalendar(document.getElementById('main-content'))
}

function showAddEventModal(prefillDate = '') {
  const existing = document.getElementById('add-event-modal')
  if (existing) existing.remove()

  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.id = 'add-event-modal'

  const todayStr = new Date().toISOString().split('T')[0]

  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2 class="modal-title">Add event</h2>
        <button class="modal-close" onclick="closeModal('add-event-modal')">✕</button>
      </div>
      <div class="field">
        <label class="field-label">Title <span style="color:var(--danger)">*</span></label>
        <input class="field-input" id="ae-title" placeholder="e.g. Weekly check-in">
      </div>
      <div class="field-row">
        <div class="field">
          <label class="field-label">Date <span style="color:var(--danger)">*</span></label>
          <input class="field-input" id="ae-date" type="date" value="${prefillDate || todayStr}">
        </div>
        <div class="field">
          <label class="field-label">Type</label>
          <select class="field-input" id="ae-type">
            <option value="session">Session</option>
            <option value="review">Review</option>
            <option value="competition">Competition</option>
            <option value="holiday">Holiday</option>
            <option value="gym">Gym</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>
      <div class="field">
        <label class="field-label">Client (optional)</label>
        <select class="field-input" id="ae-client">
          <option value="">— All clients / no specific client —</option>
        </select>
      </div>
      <div class="field">
        <label class="field-label">Notes</label>
        <textarea class="field-input" id="ae-notes" rows="2" style="resize:vertical" placeholder="Optional"></textarea>
      </div>
      <p class="modal-error" id="ae-error"></p>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeModal('add-event-modal')">Cancel</button>
        <button class="btn-primary" onclick="saveEvent()">Save event</button>
      </div>
    </div>
  `
  document.body.appendChild(overlay)

  // Populate client dropdown
  db.from('clients').select('id, full_name').eq('coach_id', currentUser.id).order('full_name').then(({ data }) => {
    const sel = document.getElementById('ae-client')
    if (!sel) return
    ;(data || []).forEach(c => {
      const opt = document.createElement('option')
      opt.value = c.id
      opt.textContent = c.full_name
      sel.appendChild(opt)
    })
  })
}

async function saveEvent() {
  const title   = document.getElementById('ae-title').value.trim()
  const date    = document.getElementById('ae-date').value
  const type    = document.getElementById('ae-type').value
  const clientId = document.getElementById('ae-client').value || null
  const notes   = document.getElementById('ae-notes').value.trim() || null
  const errorEl = document.getElementById('ae-error')

  if (!title) { errorEl.textContent = 'Title is required'; return }
  if (!date)  { errorEl.textContent = 'Date is required'; return }

  log.info('saveEvent', 'inserting event', { title, date, type, clientId })
  const { data: { user } } = await db.auth.getUser()
  const { error } = await db.from('events').insert({
    title,
    date,
    type,
    client_id: clientId,
    notes,
    is_pt_assigned: true,
    created_by: user.id
  })

  if (error) { log.error('saveEvent', 'insert failed', error); errorEl.textContent = error.message; return }
  log.ok('saveEvent', 'event saved', { title, date })

  closeModal('add-event-modal')
  renderCalendar(document.getElementById('main-content'))
}

function showClientAddEventModal(prefillDate = '') {
  const existing = document.getElementById('add-event-modal')
  if (existing) existing.remove()

  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.id = 'add-event-modal'
  const todayStr = new Date().toISOString().split('T')[0]

  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2 class="modal-title">Add event</h2>
        <button class="modal-close" onclick="closeModal('add-event-modal')">✕</button>
      </div>
      <div class="field">
        <label class="field-label">Title <span style="color:var(--danger)">*</span></label>
        <input class="field-input" id="ae-title" placeholder="e.g. Local competition">
      </div>
      <div class="field-row">
        <div class="field">
          <label class="field-label">Date <span style="color:var(--danger)">*</span></label>
          <input class="field-input" id="ae-date" type="date" value="${prefillDate || todayStr}">
        </div>
        <div class="field">
          <label class="field-label">Type</label>
          <select class="field-input" id="ae-type">
            <option value="competition">Competition</option>
            <option value="holiday">Holiday</option>
            <option value="gym">Gym</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>
      <div class="field">
        <label class="field-label">Notes</label>
        <textarea class="field-input" id="ae-notes" rows="2" style="resize:vertical" placeholder="Optional"></textarea>
      </div>
      <p class="modal-error" id="ae-error"></p>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeModal('add-event-modal')">Cancel</button>
        <button class="btn-primary" onclick="saveClientEvent()">Save event</button>
      </div>
    </div>
  `
  document.body.appendChild(overlay)
}

async function saveClientEvent() {
  const title   = document.getElementById('ae-title').value.trim()
  const date    = document.getElementById('ae-date').value
  const type    = document.getElementById('ae-type').value
  const notes   = document.getElementById('ae-notes').value.trim() || null
  const errorEl = document.getElementById('ae-error')

  if (!title) { errorEl.textContent = 'Title is required'; return }
  if (!date)  { errorEl.textContent = 'Date is required'; return }

  const { data: clientRow, error: clientErr } = await db.from('clients').select('id').eq('user_id', currentUser.id).single()
  if (clientErr || !clientRow) { errorEl.textContent = 'Could not find your client record'; return }

  const { error } = await db.from('events').insert({
    title, date, type, notes,
    client_id: clientRow.id,
    is_pt_assigned: false,
    created_by: currentUser.id
  })

  if (error) { log.error('saveClientEvent', 'insert failed', error); errorEl.textContent = error.message; return }
  closeModal('add-event-modal')
  renderCalendar(document.getElementById('main-content'))
}

// ─── CLIENT GOALS ─────────────────────────────────────────────────────────────
async function renderClientGoals(clientId, el) {
  log.info('renderClientGoals', 'fetching goals', { clientId })
  el.innerHTML = '<div class="loading-state">Loading…</div>'

  const { data: goals, error } = await db
    .from('goals')
    .select('*, goal_milestones(*)')
    .eq('client_id', clientId)
    .order('priority')
    .order('created_at')

  if (error) { log.error('renderClientGoals', 'fetch failed', error); el.innerHTML = `<div class="loading-state">${error.message}</div>`; return }
  log.ok('renderClientGoals', `loaded ${goals.length} goals`)

  el.innerHTML = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:16px">
      <button class="btn-primary" onclick="showAddGoalModal('${clientId}')">+ Add goal</button>
    </div>
    <div class="list">
      ${goals.length === 0 ? `
        <div class="empty-state">
          <div class="empty-icon">🎯</div>
          <div class="empty-title">No goals yet</div>
          <div class="empty-text">Set a goal to give this client a clear roadmap to success</div>
          <button class="btn-primary" onclick="showAddGoalModal('${clientId}')">+ Add first goal</button>
        </div>
      ` : goals.map(g => goalCard(g, clientId)).join('')}
    </div>
  `
}

function goalCard(g, clientId) {
  const milestones  = g.goal_milestones || []
  const completed   = milestones.filter(m => m.completed_at).length
  const progress    = g.target_value && g.start_value != null
    ? Math.min(100, Math.round(((g.current_value - g.start_value) / (g.target_value - g.start_value)) * 100))
    : null
  const dueStr = g.target_date
    ? new Date(g.target_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : null

  return `
    <div class="card" style="margin-bottom:0;cursor:pointer" onclick="openGoal('${g.id}','${clientId}')">
      <div class="card-body">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px">
          <div>
            <div style="font-weight:600;font-size:15px;margin-bottom:3px">${g.title}</div>
            ${g.description ? `<div style="color:var(--text-muted);font-size:13px">${g.description}</div>` : ''}
          </div>
          <span class="badge badge-${g.status === 'active' ? 'accent' : g.status === 'completed' ? 'active' : 'inactive'}">${g.status}</span>
        </div>

        ${progress !== null ? `
          <div style="margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-muted);margin-bottom:5px">
              <span>${g.metric_label || 'Progress'}</span>
              <span>${g.current_value ?? g.start_value} → ${g.target_value} ${g.metric_unit || ''}</span>
            </div>
            <div style="height:6px;background:var(--border);border-radius:99px;overflow:hidden">
              <div style="height:100%;width:${Math.max(0, progress)}%;background:var(--accent);border-radius:99px;transition:width 0.4s"></div>
            </div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${progress}% complete</div>
          </div>
        ` : ''}

        <div style="display:flex;align-items:center;gap:16px;font-size:12px;color:var(--text-muted)">
          ${dueStr ? `<span>📅 Target: ${dueStr}</span>` : ''}
          ${milestones.length ? `<span>🏁 ${completed}/${milestones.length} milestones</span>` : ''}
          <span style="margin-left:auto;color:var(--accent);font-weight:500">View →</span>
        </div>
      </div>
    </div>
  `
}

// ─── ADD GOAL MODAL ───────────────────────────────────────────────────────────
function showAddGoalModal(clientId) {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.id = 'add-goal-modal'
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2 class="modal-title">Add goal</h2>
        <button class="modal-close" onclick="closeModal('add-goal-modal')">✕</button>
      </div>

      <div class="field">
        <label class="field-label">Goal title <span style="color:var(--danger)">*</span></label>
        <input class="field-input" id="ag-title" placeholder="e.g. Lose 10kg, Squat 100kg, Run 5K">
      </div>
      <div class="field">
        <label class="field-label">Description</label>
        <textarea class="field-input" id="ag-desc" rows="2" placeholder="What does achieving this goal look like?" style="resize:vertical"></textarea>
      </div>
      <div class="field-row">
        <div class="field">
          <label class="field-label">Goal type</label>
          <select class="field-input" id="ag-type">
            <option value="custom">Custom</option>
            <option value="weight">Weight loss / gain</option>
            <option value="strength">Strength</option>
            <option value="cardio">Cardio / endurance</option>
            <option value="body_composition">Body composition</option>
            <option value="habit">Habit</option>
          </select>
        </div>
        <div class="field">
          <label class="field-label">Target date</label>
          <input class="field-input" id="ag-date" type="date">
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label class="field-label">Metric label</label>
          <input class="field-input" id="ag-metric" placeholder="e.g. Bodyweight, Squat 1RM">
        </div>
        <div class="field">
          <label class="field-label">Unit</label>
          <input class="field-input" id="ag-unit" placeholder="e.g. kg, lbs, mins">
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label class="field-label">Start value</label>
          <input class="field-input" id="ag-start" type="number" placeholder="e.g. 90">
        </div>
        <div class="field">
          <label class="field-label">Target value</label>
          <input class="field-input" id="ag-target" type="number" placeholder="e.g. 80">
        </div>
      </div>
      <div class="field">
        <label class="field-label">Priority</label>
        <select class="field-input" id="ag-priority">
          <option value="1">1 — Primary goal</option>
          <option value="2">2 — Secondary goal</option>
          <option value="3">3 — Tertiary goal</option>
        </select>
      </div>

      <p class="modal-error" id="ag-error"></p>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeModal('add-goal-modal')">Cancel</button>
        <button class="btn-primary" onclick="saveNewGoal('${clientId}')">Add goal</button>
      </div>
    </div>
  `
  document.body.appendChild(overlay)
  document.getElementById('ag-title').focus()
}

async function saveNewGoal(clientId) {
  const title   = document.getElementById('ag-title').value.trim()
  const errorEl = document.getElementById('ag-error')
  if (!title) { errorEl.textContent = 'Title is required'; return }

  log.info('saveNewGoal', 'inserting goal', { clientId, title })
  const startVal = document.getElementById('ag-start').value
  const { error } = await db.from('goals').insert({
    client_id:    clientId,
    created_by:   currentUser.id,
    title,
    description:  document.getElementById('ag-desc').value.trim()   || null,
    goal_type:    document.getElementById('ag-type').value,
    metric_label: document.getElementById('ag-metric').value.trim() || null,
    metric_unit:  document.getElementById('ag-unit').value.trim()   || null,
    start_value:  startVal || null,
    current_value: startVal || null,
    target_value: document.getElementById('ag-target').value        || null,
    target_date:  document.getElementById('ag-date').value          || null,
    priority:     parseInt(document.getElementById('ag-priority').value),
    status:       'active'
  })

  if (error) { log.error('saveNewGoal', 'insert failed', error); errorEl.textContent = error.message; return }
  log.ok('saveNewGoal', 'goal created', { clientId, title })

  closeModal('add-goal-modal')
  const tabContent = document.getElementById('tab-content')
  if (tabContent) renderClientGoals(clientId, tabContent)
}

// ─── GOAL DETAIL ──────────────────────────────────────────────────────────────
async function openGoal(goalId, clientId) {
  const el = document.getElementById('tab-content')
  el.innerHTML = '<div class="loading-state">Loading…</div>'

  const { data: g } = await db
    .from('goals')
    .select('*, goal_milestones(*), goal_check_ins(*)')
    .eq('id', goalId)
    .single()

  const milestones = (g.goal_milestones || []).sort((a, b) => a.order - b.order)
  const checkIns   = (g.goal_check_ins  || []).sort((a, b) => b.date.localeCompare(a.date))
  const progress   = g.target_value && g.start_value != null
    ? Math.min(100, Math.round(((g.current_value - g.start_value) / (g.target_value - g.start_value)) * 100))
    : null

  el.innerHTML = `
    <a class="back-btn" href="#" onclick="backToGoals('${clientId}');return false">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
      All goals
    </a>

    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:24px;flex-wrap:wrap">
      <div>
        <h2 style="font-size:20px;font-weight:700;margin-bottom:4px">${g.title}</h2>
        ${g.description ? `<p style="color:var(--text-muted)">${g.description}</p>` : ''}
      </div>
      <div style="display:flex;gap:8px">
        <span class="badge badge-${g.status === 'active' ? 'accent' : g.status === 'completed' ? 'active' : 'inactive'}">${g.status}</span>
        <button class="btn-secondary" style="font-size:13px;padding:6px 12px" onclick="showEditGoalModal('${goalId}','${clientId}')">Edit</button>
      </div>
    </div>

    ${progress !== null ? `
      <div class="card" style="margin-bottom:16px">
        <div class="card-body">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <span style="font-weight:600">${g.metric_label || 'Progress'}</span>
            <span style="font-size:22px;font-weight:700;color:var(--accent)">${progress}%</span>
          </div>
          <div style="height:8px;background:var(--border);border-radius:99px;overflow:hidden;margin-bottom:8px">
            <div style="height:100%;width:${Math.max(0, progress)}%;background:var(--accent);border-radius:99px"></div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-muted)">
            <span>Start: ${g.start_value} ${g.metric_unit || ''}</span>
            <span>Current: <strong style="color:var(--text)">${g.current_value ?? '—'} ${g.metric_unit || ''}</strong></span>
            <span>Target: ${g.target_value} ${g.metric_unit || ''}</span>
          </div>
        </div>
      </div>
    ` : ''}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">

      <!-- Milestones -->
      <div>
        <div class="section-header">
          <h3 class="section-title">Milestones</h3>
          <button class="btn-primary" style="font-size:12px;padding:5px 10px" onclick="showAddMilestoneModal('${goalId}','${clientId}')">+ Add</button>
        </div>
        <div class="list" id="milestone-list">
          ${milestones.length === 0 ? `<div class="empty-state" style="padding:30px"><div class="empty-text">No milestones yet</div></div>` :
            milestones.map(m => `
              <div class="card" style="margin-bottom:0">
                <div class="card-body" style="padding:14px 16px;display:flex;align-items:flex-start;gap:10px">
                  <button onclick="toggleMilestone('${m.id}','${goalId}','${clientId}')" style="margin-top:1px;flex-shrink:0">
                    <div style="width:18px;height:18px;border-radius:50%;border:2px solid ${m.completed_at ? 'var(--success)' : 'var(--border)'};background:${m.completed_at ? 'var(--success)' : 'transparent'};display:flex;align-items:center;justify-content:center">
                      ${m.completed_at ? '<svg style="width:10px;height:10px;stroke:white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
                    </div>
                  </button>
                  <div>
                    <div style="font-weight:500;font-size:13.5px;${m.completed_at ? 'text-decoration:line-through;color:var(--text-muted)' : ''}">${m.title}</div>
                    ${m.target_date ? `<div style="font-size:12px;color:var(--text-muted);margin-top:2px">${new Date(m.target_date).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</div>` : ''}
                  </div>
                </div>
              </div>
            `).join('')}
        </div>
      </div>

      <!-- Check-ins -->
      <div>
        <div class="section-header">
          <h3 class="section-title">Check-ins</h3>
          <button class="btn-primary" style="font-size:12px;padding:5px 10px" onclick="showAddCheckInModal('${goalId}','${clientId}')">+ Add</button>
        </div>
        <div class="list">
          ${checkIns.length === 0 ? `<div class="empty-state" style="padding:30px"><div class="empty-text">No check-ins yet</div></div>` :
            checkIns.map(ci => `
              <div class="card" style="margin-bottom:0">
                <div class="card-body" style="padding:14px 16px">
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                    <span style="font-size:12px;color:var(--text-muted)">${new Date(ci.date).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</span>
                    ${ci.current_value != null ? `<span style="font-weight:600;color:var(--accent)">${ci.current_value} ${g.metric_unit || ''}</span>` : ''}
                  </div>
                  ${ci.notes ? `<div style="font-size:13px;color:var(--text-muted)">${ci.notes}</div>` : ''}
                </div>
              </div>
            `).join('')}
        </div>
      </div>
    </div>
  `
}

function backToGoals(clientId) {
  const content = document.getElementById('tab-content')
  renderClientGoals(clientId, content)
}

// ─── MILESTONE MODAL ──────────────────────────────────────────────────────────
function showAddMilestoneModal(goalId, clientId) {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.id = 'add-milestone-modal'
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2 class="modal-title">Add milestone</h2>
        <button class="modal-close" onclick="closeModal('add-milestone-modal')">✕</button>
      </div>
      <div class="field">
        <label class="field-label">Title <span style="color:var(--danger)">*</span></label>
        <input class="field-input" id="am-title" placeholder="e.g. Hit 85kg bodyweight">
      </div>
      <div class="field">
        <label class="field-label">Description</label>
        <textarea class="field-input" id="am-desc" rows="2" style="resize:vertical" placeholder="Optional detail…"></textarea>
      </div>
      <div class="field-row">
        <div class="field">
          <label class="field-label">Target value</label>
          <input class="field-input" id="am-value" type="number" placeholder="e.g. 85">
        </div>
        <div class="field">
          <label class="field-label">Target date</label>
          <input class="field-input" id="am-date" type="date">
        </div>
      </div>
      <p class="modal-error" id="am-error"></p>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeModal('add-milestone-modal')">Cancel</button>
        <button class="btn-primary" onclick="saveNewMilestone('${goalId}','${clientId}')">Add milestone</button>
      </div>
    </div>
  `
  document.body.appendChild(overlay)
  document.getElementById('am-title').focus()
}

async function saveNewMilestone(goalId, clientId) {
  const title   = document.getElementById('am-title').value.trim()
  const errorEl = document.getElementById('am-error')
  if (!title) { errorEl.textContent = 'Title is required'; return }

  log.info('saveNewMilestone', 'inserting milestone', { goalId, title })
  const { error } = await db.from('goal_milestones').insert({
    goal_id:      goalId,
    title,
    description:  document.getElementById('am-desc').value.trim()  || null,
    target_value: document.getElementById('am-value').value         || null,
    target_date:  document.getElementById('am-date').value          || null
  })

  if (error) { log.error('saveNewMilestone', 'insert failed', error); errorEl.textContent = error.message; return }
  log.ok('saveNewMilestone', 'milestone created', { goalId, title })
  closeModal('add-milestone-modal')
  openGoal(goalId, clientId)
}

async function toggleMilestone(milestoneId, goalId, clientId) {
  log.info('toggleMilestone', 'toggling milestone', { milestoneId })
  const { data: m, error: fetchErr } = await db.from('goal_milestones').select('completed_at').eq('id', milestoneId).single()
  if (fetchErr) { log.error('toggleMilestone', 'fetch failed', fetchErr); return }
  const newVal = m.completed_at ? null : new Date().toISOString()
  const { error } = await db.from('goal_milestones').update({ completed_at: newVal }).eq('id', milestoneId)
  if (error) { log.error('toggleMilestone', 'update failed', error); return }
  log.ok('toggleMilestone', 'milestone toggled', { milestoneId, completed: !!newVal })
  openGoal(goalId, clientId)
}

async function toggleClientMilestone(milestoneId) {
  const { data: m, error: fetchErr } = await db.from('goal_milestones').select('completed_at').eq('id', milestoneId).single()
  if (fetchErr) { log.error('toggleClientMilestone', 'fetch failed', fetchErr); return }
  const newVal = m.completed_at ? null : new Date().toISOString()
  const { error } = await db.from('goal_milestones').update({ completed_at: newVal }).eq('id', milestoneId)
  if (error) { log.error('toggleClientMilestone', 'update failed', error); return }
  renderClientDashboard(document.getElementById('main-content'))
}

function showGoalProgressForm(goalId, currentVal) {
  const form = document.getElementById(`gpf-${goalId}`)
  const input = document.getElementById(`gpf-val-${goalId}`)
  if (!form || !input) return
  input.value = currentVal || ''
  form.style.display = 'block'
  input.focus()
}

async function saveGoalProgress(goalId) {
  const input  = document.getElementById(`gpf-val-${goalId}`)
  const errEl  = document.getElementById(`gpf-err-${goalId}`)
  const val    = parseFloat(input?.value)
  if (isNaN(val)) { if (errEl) errEl.textContent = 'Enter a valid number'; return }
  const { error } = await db.from('goals').update({ current_value: val }).eq('id', goalId)
  if (error) { log.error('saveGoalProgress', 'update failed', error); if (errEl) errEl.textContent = error.message; return }
  renderClientDashboard(document.getElementById('main-content'))
}

// ─── CHECK-IN MODAL ───────────────────────────────────────────────────────────
function showAddCheckInModal(goalId, clientId) {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.id = 'add-checkin-modal'
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2 class="modal-title">Log check-in</h2>
        <button class="modal-close" onclick="closeModal('add-checkin-modal')">✕</button>
      </div>
      <div class="field-row">
        <div class="field">
          <label class="field-label">Date</label>
          <input class="field-input" id="ci-date" type="date" value="${new Date().toISOString().split('T')[0]}">
        </div>
        <div class="field">
          <label class="field-label">Current value</label>
          <input class="field-input" id="ci-value" type="number" placeholder="e.g. 87.5">
        </div>
      </div>
      <div class="field">
        <label class="field-label">Notes</label>
        <textarea class="field-input" id="ci-notes" rows="3" style="resize:vertical" placeholder="How is the client progressing? Any observations…"></textarea>
      </div>
      <p class="modal-error" id="ci-error"></p>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeModal('add-checkin-modal')">Cancel</button>
        <button class="btn-primary" onclick="saveCheckIn('${goalId}','${clientId}')">Save check-in</button>
      </div>
    </div>
  `
  document.body.appendChild(overlay)
}

async function saveCheckIn(goalId, clientId) {
  const errorEl = document.getElementById('ci-error')
  const value   = document.getElementById('ci-value').value

  log.info('saveCheckIn', 'inserting check-in', { goalId, value })
  const { error } = await db.from('goal_check_ins').insert({
    goal_id:       goalId,
    created_by:    currentUser.id,
    date:          document.getElementById('ci-date').value,
    current_value: value || null,
    notes:         document.getElementById('ci-notes').value.trim() || null
  })

  if (error) { log.error('saveCheckIn', 'insert failed', error); errorEl.textContent = error.message; return }
  log.ok('saveCheckIn', 'check-in saved', { goalId, value })

  // Update goal's current_value if a value was provided
  if (value) {
    log.info('saveCheckIn', 'updating goal current_value', { goalId, value })
    const { error: updateErr } = await db.from('goals').update({ current_value: parseFloat(value), updated_at: new Date().toISOString() }).eq('id', goalId)
    if (updateErr) log.error('saveCheckIn', 'goal current_value update failed', updateErr)
  }

  closeModal('add-checkin-modal')
  openGoal(goalId, clientId)
}

// ─── EDIT GOAL MODAL ──────────────────────────────────────────────────────────
async function showEditGoalModal(goalId, clientId) {
  const { data: g } = await db.from('goals').select('*').eq('id', goalId).single()
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.id = 'edit-goal-modal'
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2 class="modal-title">Edit goal</h2>
        <button class="modal-close" onclick="closeModal('edit-goal-modal')">✕</button>
      </div>
      <div class="field">
        <label class="field-label">Goal title</label>
        <input class="field-input" id="eg-title" value="${g.title}">
      </div>
      <div class="field">
        <label class="field-label">Description</label>
        <textarea class="field-input" id="eg-desc" rows="2" style="resize:vertical">${g.description || ''}</textarea>
      </div>
      <div class="field-row">
        <div class="field">
          <label class="field-label">Status</label>
          <select class="field-input" id="eg-status">
            <option value="active"    ${g.status==='active'    ?'selected':''}>Active</option>
            <option value="completed" ${g.status==='completed' ?'selected':''}>Completed</option>
            <option value="paused"    ${g.status==='paused'    ?'selected':''}>Paused</option>
            <option value="abandoned" ${g.status==='abandoned' ?'selected':''}>Abandoned</option>
          </select>
        </div>
        <div class="field">
          <label class="field-label">Target date</label>
          <input class="field-input" id="eg-date" type="date" value="${g.target_date || ''}">
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label class="field-label">Current value</label>
          <input class="field-input" id="eg-current" type="number" value="${g.current_value ?? ''}">
        </div>
        <div class="field">
          <label class="field-label">Target value</label>
          <input class="field-input" id="eg-target" type="number" value="${g.target_value ?? ''}">
        </div>
      </div>
      <p class="modal-error" id="eg-error"></p>
      <div class="modal-footer">
        <button class="btn-danger" onclick="deleteGoal('${goalId}','${clientId}')">Delete goal</button>
        <div style="flex:1"></div>
        <button class="btn-secondary" onclick="closeModal('edit-goal-modal')">Cancel</button>
        <button class="btn-primary" onclick="saveEditGoal('${goalId}','${clientId}')">Save</button>
      </div>
    </div>
  `
  document.body.appendChild(overlay)
}

async function saveEditGoal(goalId, clientId) {
  const errorEl = document.getElementById('eg-error')
  const title   = document.getElementById('eg-title').value.trim()
  if (!title) { errorEl.textContent = 'Title is required'; return }

  log.info('saveEditGoal', 'updating goal', { goalId, title })
  const { error } = await db.from('goals').update({
    title,
    description:   document.getElementById('eg-desc').value.trim()    || null,
    status:        document.getElementById('eg-status').value,
    target_date:   document.getElementById('eg-date').value            || null,
    current_value: document.getElementById('eg-current').value         || null,
    target_value:  document.getElementById('eg-target').value          || null,
    updated_at:    new Date().toISOString()
  }).eq('id', goalId)

  if (error) { log.error('saveEditGoal', 'update failed', error); errorEl.textContent = error.message; return }
  log.ok('saveEditGoal', 'goal updated', { goalId })
  closeModal('edit-goal-modal')
  openGoal(goalId, clientId)
}

async function deleteGoal(goalId, clientId) {
  if (!confirm('Delete this goal and all its milestones and check-ins? This cannot be undone.')) return
  log.info('deleteGoal', 'deleting goal', { goalId })
  const { error } = await db.from('goals').delete().eq('id', goalId)
  if (error) { log.error('deleteGoal', 'delete failed', error); return }
  log.ok('deleteGoal', 'goal deleted', { goalId })
  closeModal('edit-goal-modal')
  const content = document.getElementById('tab-content')
  renderClientGoals(clientId, content)
}

// ─── WORKOUT HELPERS ─────────────────────────────────────────────────────────
