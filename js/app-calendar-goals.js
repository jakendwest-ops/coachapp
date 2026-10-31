// Maps a client's assigned programme onto real calendar dates: { 'YYYY-MM-DD': [phaseWorkout, ...] }.
//
// Extracted 2026-08-30 from the inline block inside renderCalendar, unchanged in behaviour, so the
// solo dashboard's "My calendar" (renamed 2026-09-28, was "Next up") and "Next session" tiles resolve
// dates by the SAME rule the calendar
// grid draws. Before this there was no function anywhere answering "what is scheduled on date X" —
// _buildWorkoutsHero (app-workouts.js:563) only returns the first session of the current programme
// WEEK, ignoring today's date entirely, so a tile built on it would disagree with the calendar.
//
// Each entry also carries _phaseName and _weekInPhase (2026-10-04): the Workouts page's Up next card says "Accumulation 1 · Week 2" for the
// session it names, and only this function knows which repeat of a non-periodised phase a date is.
//
// Returns {} rather than null for any unusable input: callers iterate the result, and a null here
// would move the failure into their loop instead of this function's own guard.
function _programWorkoutsByDate(cp0, cpwMap) {
  const byDate = {}
  // _mondayOfWeek returns null for an unparseable date. The original code guarded on this because
  // a null would throw at weekStart.getDate() and kill the WHOLE calendar render.
  if (!cp0?.start_date || !_mondayOfWeek(cp0.start_date)) return byDate
  const weekStart = _mondayOfWeek(cp0.start_date)
  const map = cpwMap || {}

  const phases = [...(cp0.programs?.program_phases || [])].sort((a, b) => a.order_index - b.order_index)
  let weekOffset = 0
  phases.forEach(phase => {
    // Group by week_number. A phase without generated periodization has only week_number=1 rows,
    // which repeat identically across every week of the phase. Once periodization generates weeks
    // 2+, each week's own rows are placed ONLY on their own week — no repeating.
    const pwsByWeek = {}
    ;(phase.program_phase_workouts || []).forEach(pw => { (pwsByWeek[pw.week_number || 1] = pwsByWeek[pw.week_number || 1] || []).push(pw) })
    const generated = Object.keys(pwsByWeek).length > 1
    for (let w = 0; w < (phase.duration_weeks || 1); w++) {
      const weekPws = generated ? (pwsByWeek[w + 1] || []) : (pwsByWeek[1] || [])
      weekPws.forEach(pw => {
        // day_of_week is 1-BASED everywhere it is stored (Monday = 1), hence the -1.
        const offset = ((weekOffset + w) * 7) + (pw.day_of_week - 1)
        const d = new Date(weekStart)
        d.setDate(weekStart.getDate() + offset)
        const ds = _ymdLocal(d)
        if (!byDate[ds]) byDate[ds] = []
        const _clone = map[pw.id]
        byDate[ds].push({ ...pw, _clientTemplateId: _clone?.templateId || null, _clientExercises: _clone?.exercises || null, _phaseName: phase.name || '', _weekInPhase: w + 1 })
      })
    }
    weekOffset += (phase.duration_weeks || 1)
  })
  Object.values(byDate).forEach(arr => arr.sort((a, b) => (a.session_order || 1) - (b.session_order || 1)))
  return byDate
}

// Several assignments on one map - in practice the current plan and the one booked after it (_currentAssignment, app-core.js). Each plan owns
// its dates until the NEXT plan's start DATE, the day _currentAssignment hands over on: a plan booked to start on a Thursday leaves Monday to
// Wednesday to the plan before it, never empty and never the new plan's (review, 2026-10-29). So every plan after the first also drops its own
// days before its start date; `fromStart` drops the FIRST plan's too - the dashboard's rule (_dashPlannedFrom), which used to be applied to the
// one plan it drew. Before 2026-10-29 every screen drew one plan only, so a block booked for next Monday left next week empty until it began.
// Plans with no usable start date draw nothing, as in _programWorkoutsByDate.
function _programWorkoutsByDateAll(assignments, cpwMap, { fromStart = false } = {}) {
  const dated = (assignments || []).filter(cp => cp?.start_date && _mondayOfWeek(cp.start_date))
    .sort((a, b) => _cmpText(String(a.start_date).slice(0, 10), String(b.start_date).slice(0, 10)) || _cmpText(a.created_at, b.created_at) || _cmpText(a.id, b.id))
  const out = {}
  dated.forEach((cp, i) => {
    const stop = dated[i + 1] ? String(dated[i + 1].start_date).slice(0, 10) : null
    const own = _programWorkoutsByDate(cp, cpwMap)
    for (const [ds, arr] of Object.entries(fromStart || i > 0 ? _dashPlannedFrom(own, cp.start_date) : own)) {
      if (!stop || ds < stop) out[ds] = arr
    }
  })
  return out
}

async function renderCalendar(el) {
  const now = new Date()
  calendarYear  = calendarYear  ?? now.getFullYear()
  calendarMonth = calendarMonth ?? now.getMonth()
  el.innerHTML = '<div class="loading-state">Loading…</div>'

  // Fetch events for this month + overflow days
  const firstDay = new Date(calendarYear, calendarMonth, 1)
  const lastDay  = new Date(calendarYear, calendarMonth + 1, 0)
  const localDate = _ymdLocal   // hoisted to app-core 2026-08-16; shared with the progress block window
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
      // Filtered to THIS client record, as the own-dashboard's events read is. It leaned on RLS alone until 2026-10-18, and for a master account in solo view
      // RLS also returns its coaching clients' events ("coach access"), so the Personal calendar showed them. Every events insert from a client or solo login sets
      // client_id (saveClientEvent), so their own events all stay; a master account's client-less events made in coach view are coach-calendar events and no longer
      // appear here (intended). A login with no client record has no events to show.
      clientsId
        ? db.from('events').select('*').eq('client_id', clientsId).gte('date', from).lte('date', to).order('date')
        : Promise.resolve({ data: [] }),
      clientsId
        // Every assignment, not the newest: the current plan is picked by date and the block booked after it is drawn too (2026-10-29).
        ? db.from('client_programs').select('id, start_date, created_at, programs(program_phases(duration_weeks, order_index, program_phase_workouts(id, day_of_week, session_order, week_number, workout_templates(id, name, workout_template_exercises(exercise_name, exercise_type, metric_type, order_index, sets_json)))))').eq('client_id', clientsId).order('created_at', { ascending: false })
        : Promise.resolve({ data: [] })
    ])
    events = evRes.data

    // Step 3: client_program_workouts scoped to the current plan and the one booked after it
    const _cpwMap = {}
    const { current: cp0, next: cpNext } = _currentAssignment(cpRes.data, _ymdLocal(now))
    const drawn = [cp0, cpNext].filter(Boolean)
    if (drawn.length) {
      // Embed the CLIENT'S cloned template's exercises, not just its id. The day modal renders the
      // full prescription as of 2026-08-14, and the clone is what ▶ Start actually runs — reading the
      // master template's sets_json here would print numbers the runner never uses the moment a
      // client's copy diverges. Same embed shape as renderClientWorkoutsPage (app-workouts.js:588),
      // which is the screen Jake compared this one against.
      const cpwRes = await db.from('client_program_workouts').select('program_phase_workout_id, workout_template_id, workout_templates(workout_template_exercises(exercise_name, exercise_type, metric_type, order_index, sets_json))').in('client_program_id', drawn.map(cp => cp.id))
      ;(cpwRes.data || []).forEach(r => { _cpwMap[r.program_phase_workout_id] = { templateId: r.workout_template_id, exercises: r.workout_templates?.workout_template_exercises || [] } })
    }
    window._calClientTemplateMap = _cpwMap

    // Map phase workouts to actual calendar dates
    // _mondayOfWeek returns null for an unparseable date, where the old inline code returned an
    // Invalid Date and degraded to unusable day keys. Null would throw at weekStart.getDate() below
    // and kill the WHOLE calendar render — a strictly worse failure than the one it replaced.
    // Extracted 2026-08-30 into _programWorkoutsByDate (top of this file) so the solo dashboard
    // tiles resolve dates by THIS exact rule instead of a second copy that would drift from the
    // grid. Guard and assignment kept verbatim: the original only published the global when the
    // start_date parsed, and a null _mondayOfWeek would throw and kill the whole calendar render.
    if (drawn.some(cp => cp.start_date && _mondayOfWeek(cp.start_date))) {
      Object.assign(programWorkoutsByDate, _programWorkoutsByDateAll(drawn, _cpwMap))
      window._calProgramWorkouts = programWorkoutsByDate
    }
  } else {
    const [evRes, clRes] = await Promise.all([
      // SCOPE-OK: the coach calendar spans every client AND the coach's own client-less events, so there is no single id to filter on; RLS ("coach access": events on the coach's clients, or any event the coach created) scopes it - which also returns the master account's events on its OWN personal record, drawn with no client name (named in docs/technical-debt.md)
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
    ${_isPersonalView() ? `<button type="button" class="wk-linkbtn" data-today-back onclick="navigate('solo-dashboard')">‹ Today</button>` : ''}
    <div class="page-header">
      <h1 class="page-title">Calendar</h1>
      <button class="btn-primary" onclick="${isClient ? 'showClientAddEventModal()' : 'showAddEventModal()'}">+ Add event</button>
    </div>

    <div class="card" style="margin-bottom:16px">
      <div class="card-body" style="padding:16px 20px">

        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
          <button class="btn-secondary" style="padding:6px 14px" onclick="calNav(-1)">←</button>
          <h2 style="font-size:var(--text-xl, 16px);font-weight:600">${monthName}</h2>
          <button class="btn-secondary" style="padding:6px 14px" onclick="calNav(1)">→</button>
        </div>

        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center">
          ${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d =>
            `<div style="font-size:var(--text-sm, 11px);font-weight:600;color:var(--text-muted);padding:4px 0">${d}</div>`
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
                padding:4px;border-radius:8px;cursor:pointer;min-height:52px;min-width:0;overflow:hidden;
                background:${isToday ? 'var(--accent)' : hasWorkouts ? 'var(--surface-2)' : 'transparent'};
                border:1px solid ${isToday ? 'transparent' : hasWorkouts ? 'var(--border)' : 'transparent'};
                transition:background 0.15s
              " onmouseover="this.style.background='${isToday ? 'var(--accent)' : 'var(--surface-2)'}'"
                 onmouseout="this.style.background='${isToday ? 'var(--accent)' : hasWorkouts ? 'var(--surface-2)' : 'transparent'}'">
                <div style="font-size:11px;font-weight:${isToday?'700':'500'};color:${isToday?'var(--on-accent)':'var(--text)'}">
                  ${d}
                </div>
                ${hasWorkouts ? dayWorkouts.map(pw => `
                  <div style="margin-top:2px">
                    ${dayWorkouts.length > 1 ? `<div style="font-size:7px;font-weight:700;color:${isToday?'var(--on-accent)':'var(--accent)'};opacity:${isToday?.8:1};letter-spacing:.04em;line-height:1">${pw.session_order===2?'PM':'AM'}</div>` : ''}
                    <div style="font-size:8px;font-weight:600;color:${isToday?'var(--on-accent)':'var(--text)'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.2">${escapeHtml((pw.workout_templates?.name||'').replace(/ —.*/, ''))}</div>
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
      <p style="color:var(--text-muted);font-size:var(--text-base, 13px)">No events this month</p>
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
                <div style="font-size:var(--text-xs, 10px);font-weight:600;color:var(--text-muted);text-transform:uppercase">${dateLabel.split(' ')[0]}</div>
                <div style="font-size:var(--text-2xl, 18px);font-weight:700;line-height:1.1">${dateLabel.split(' ')[1]}</div>
              </div>
              <div style="flex:1;min-width:0">
                <div style="font-size:var(--text-base, 13px);font-weight:600">${escapeHtml(e.title)}</div>
                <div style="display:flex;gap:6px;margin-top:3px;align-items:center">
                  <span style="font-size:11px;padding:2px 7px;border-radius:4px;background:${col.bg};color:${col.text};font-weight:600">${e.type}</span>
                  ${e.client_id ? `<span style="font-size:var(--legacy-text-11-5, 11.5px);color:var(--text-muted)">${escapeHtml(clientMap[e.client_id] || '')}</span>` : ''}
                </div>
              </div>
              <button onclick="deleteEvent('${e.id}')" style="background:none;border:none;color:var(--text-muted);cursor:pointer;padding:4px;font-size:var(--text-lg, 14px)" title="Delete">✕</button>
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

  // Modals in this file mount via mountModal() (app-core.js), NOT a bare document.body.appendChild.
  // mountModal removes any existing element with the same id first. Without it, opening the same modal
  // twice — a double-tap, or an async handler that awaits a fetch BEFORE mounting — stacks two identical
  // overlays: the user types into the top one and the handler reads the bottom one's inputs. That race
  // was fixed on 2026-07-04 and mountModal was written for it, but this file (and app-clients.js) never
  // adopted it, so the race was still live here. Found by the 2026-08-12 architecture audit.
  // Note two DIFFERENT modals in this file both use id 'add-event-modal' — exactly the collision
  // mountModal resolves.
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
          // Prefer the client's own cloned template — that is what ▶ Start runs, so it is the only
          // copy whose numbers are guaranteed to match the session the user is about to do. Falls
          // back to the master when no clone row exists. Copy before sorting: the embed array is
          // shared with window._calProgramWorkouts and .sort() mutates in place.
          const exs = [...(pw._clientExercises?.length ? pw._clientExercises : (pw.workout_templates?.workout_template_exercises || []))].sort((a,b) => a.order_index - b.order_index)
          const multi = workouts.length > 1
          return `
          <div style="padding:14px 0;border-bottom:1px solid var(--border)">
            ${multi ? `<div style="font-size:var(--text-xs, 10px);font-weight:700;color:var(--accent);letter-spacing:.06em;margin-bottom:4px">SESSION ${si+1}/${workouts.length}</div>` : ''}
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:${exs.length ? '8px' : '10px'}">
              <span style="font-size:var(--legacy-text-15, 15px);font-weight:600">${escapeHtml((pw.workout_templates?.name || 'Workout').replace(/ — W\d+/, ''))}</span>
            </div>
            ${exs.length ? `
            <div style="margin-bottom:10px;padding:6px 8px;background:var(--surface-2);border-radius:var(--radius-sm, 8px)">
              ${exs.map(ex => {
                // metric_type is the source of truth; exercise_type alone can't tell an interval
                // block from real cardio — _deriveFromMetricType writes 'cardio' as the legacy
                // exercise_type for both. _prescribedSetCount (app-workouts.js) reports the real
                // work-round count (sets × cycles) for a block instead of its raw sets_json.length
                // of 1 — see that function's comment for why.
                const _exIsInterval = (ex.metric_type || ex.exercise_type) === 'interval'
                // Jake, 2026-08-14: "The calendar for personal only shows the exercise name and does
                // not show the same data for the same workout that is present on the 'workouts' page."
                // Mirrors app-workouts.js:669-679 exactly — same helper, same options, same markup.
                // This was the ONLY prescription-rendering surface in the app that never called
                // _fmtSetsCollapsed, which is what app-workouts.js:198-199 already listed as a gap.
                // escapeHtml is load-bearing, not decoration: _fmtSetDetail concatenates raw sets_json
                // values and is explicitly NOT html-safe (see its header comment, app-workouts.js:216).
                const presc = _fmtSetsCollapsed(ex.sets_json, { isCardio: (ex.metric_type || ex.exercise_type) === 'cardio', isInterval: _exIsInterval, isUnilateral: _resolveMetricType(ex.metric_type, ex.exercise_type, ex.sets_json?.[0]) === 'unilateral' })
                const _setCount = _prescribedSetCount(ex.sets_json, _exIsInterval)
                return `
                <div style="padding:5px 0;border-bottom:1px solid var(--border)">
                  <div style="display:flex;justify-content:space-between;gap:8px">
                    <span style="font-size:var(--text-md, 12px);font-weight:600">${escapeHtml(ex.exercise_name)}</span>
                    <span style="font-size:var(--text-sm, 11px);color:var(--text-muted);flex-shrink:0">${_setCount} set${_setCount !== 1 ? 's' : ''}</span>
                  </div>
                  ${presc ? `<div style="font-size:var(--text-sm, 11px);color:var(--text-muted);margin-top:2px">${escapeHtml(presc)}</div>` : ''}
                </div>`}).join('')}
            </div>` : ''}
            <button onclick="startWorkoutRunner('${clientId}','${pw._clientTemplateId||pw.workout_templates?.id}');document.getElementById('client-day-modal').remove()" class="btn-primary" style="width:100%">▶ Start workout</button>
          </div>`}).join('') : `
          <div style="text-align:center;padding:24px 0">
            <div style="font-size:var(--text-display, 32px);margin-bottom:8px">🛋️</div>
            <div style="font-size:var(--legacy-text-15, 15px);font-weight:600;margin-bottom:4px">Rest day</div>
            <div style="font-size:var(--text-base, 13px);color:var(--text-muted)">No sessions scheduled</div>
          </div>`}
      </div>
    </div>`

  mountModal(overlay)
}

async function deleteEvent(id) {
  if (!(await confirmDialog('Delete this event?', { title: 'Delete event?', confirmLabel: 'Delete', danger: true }))) return
  log.info('deleteEvent', 'deleting event', { eventId: id })
  // Rowcount check, matching delete1RM / deletePerfLog / deleteWeightLog (app-progress.js). Without
  // it a REFUSED delete re-renders with the row still sitting there, which reads as "the button is
  // broken" — the user tapped Delete, got no error, and the thing is still there. A policy-refused
  // delete returns `{ data: [], error: null }`, so `error` alone can never detect it.
  const { data: removed, error } = await dbq('deleteEvent', db.from('events').delete().eq('id', id).eq('created_by', currentUser.id).select('id'))
  if (error) { log.error('deleteEvent', 'delete failed', error); return }
  if (!removed?.length) {
    log.error('deleteEvent', 'delete removed no rows — permission denied or already gone', { eventId: id })
    showToast('That event could not be deleted', 'error')
    return
  }
  log.ok('deleteEvent', 'event deleted', { eventId: id })
  renderCalendar(document.getElementById('main-content'))
}

function showAddEventModal(prefillDate = '') {
  const existing = document.getElementById('add-event-modal')
  if (existing) existing.remove()

  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.id = 'add-event-modal'

  const todayStr = _ymdLocal(new Date())

  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2 class="modal-title">Add event</h2>
        <button class="modal-close" onclick="closeModal('add-event-modal')">✕</button>
      </div>
      <div class="field">
        <label class="field-label">Title <span style="color:var(--danger-text)">*</span></label>
        <input class="field-input" id="ae-title" placeholder="e.g. Weekly check-in">
      </div>
      <div class="field-row">
        <div class="field">
          <label class="field-label">Date <span style="color:var(--danger-text)">*</span></label>
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
  mountModal(overlay)

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

  log.info('saveEvent', 'inserting event', { date, type, clientId })
  const { data: { user }, error: authErr } = await db.auth.getUser()
  // Same fail-closed guard as savePerformanceLog (app-progress.js): an expired or revoked session returns user: null here (the
  // auth server is asked, not the token on this device), and created_by: user.id below threw instead of telling the coach why
  // nothing saved. The server's reason goes to the log.
  if (!user) { log.error('saveEvent', 'no authenticated user — session expired or revoked', authErr); errorEl.textContent = 'Your session has expired — please sign in again.'; return }
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
  log.ok('saveEvent', 'event saved', { date })

  closeModal('add-event-modal')
  renderCalendar(document.getElementById('main-content'))
}

function showClientAddEventModal(prefillDate = '') {
  const existing = document.getElementById('add-event-modal')
  if (existing) existing.remove()

  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.id = 'add-event-modal'
  const todayStr = _ymdLocal(new Date())

  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2 class="modal-title">Add event</h2>
        <button class="modal-close" onclick="closeModal('add-event-modal')">✕</button>
      </div>
      <div class="field">
        <label class="field-label">Title <span style="color:var(--danger-text)">*</span></label>
        <input class="field-input" id="ae-title" placeholder="e.g. Local competition">
      </div>
      <div class="field-row">
        <div class="field">
          <label class="field-label">Date <span style="color:var(--danger-text)">*</span></label>
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
  mountModal(overlay)
}

async function saveClientEvent() {
  const title   = document.getElementById('ae-title').value.trim()
  const date    = document.getElementById('ae-date').value
  const type    = document.getElementById('ae-type').value
  const notes   = document.getElementById('ae-notes').value.trim() || null
  const errorEl = document.getElementById('ae-error')

  if (!title) { errorEl.textContent = 'Title is required'; return }
  if (!date)  { errorEl.textContent = 'Date is required'; return }

  // Save against the record THIS CALENDAR IS SHOWING, not a fresh guess from user_id.
  //
  // The old shape was `db.from('clients').select('id').eq('user_id', currentUser.id).single()`, which
  // is wrong in a way the ledger row for it described imprecisely. MEASURED 2026-09-04: the database
  // carries a UNIQUE index on clients.user_id (`clients_user_id_idx` — an insert of a second row for
  // the same user_id is refused with 23505), so it can never match two rows and the "PGRST116 on a
  // master account" story is not the mechanism. What IS real is the second half: the query was not
  // bound to the ACTIVE VIEW. It re-derived an id from the auth user while the page the user is
  // looking at had already resolved one, so the two could disagree.
  //
  // renderCalendar sets window._calClientId from _getCurrentClientId() before it paints the "+ Add
  // event" button that reaches this function, and that button is only rendered for a client/solo view.
  // Preferring it means the event lands on exactly the calendar the user is looking at. The resolver
  // stays as the fallback for a direct call.
  const clientId = window._calClientId || await _getCurrentClientId()
  if (!clientId) { errorEl.textContent = 'Could not find your client record'; return }

  const { error } = await db.from('events').insert({
    title, date, type, notes,
    client_id: clientId,
    is_pt_assigned: false,
    created_by: currentUser.id
  })

  if (error) { log.error('saveClientEvent', 'insert failed', error); errorEl.textContent = error.message; return }
  closeModal('add-event-modal')
  renderCalendar(document.getElementById('main-content'))
}

// ─── CLIENT GOALS ─────────────────────────────────────────────────────────────
// Who may change the goals THEMSELVES — add, edit, delete, or add a milestone to one? A COACH (for their clients) and a SOLO user (for
// themselves). A CLIENT tracks progress on goals their coach set — a check-in, a progress value, ticking a milestone — but does not add,
// edit or delete the goal (Jake, 2026-10-01). Anything that is not exactly coach or solo (a client, an unknown role) gets no controls.
const _canManageGoals = () => ['coach', 'solo'].includes(currentProfile?.role)

// ─── The goal model: plain functions the list, the goal page and their tests share (reworked 2026-10-14) ─────────────────────────────────────────
// Jake, 2026-10-13, on the Goals tab: "cramped or cluttered, progress unclear, milestones clumsy". Prototype: https://claude.ai/artifact/JEJgr7Q81rjzotfJAfDWox
// (his reactions: fuller list cards, no pace pill or weekly line, a step with a number ticks itself). A goal with a start and a target NUMBER has progress along
// the line between them, in its own direction (a weight loss runs downward); a goal without numbers is tracked by its steps alone. A "step" is a goal_milestones row.
// No DOM and no database in this block.
const _GL_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
// A calendar day (YYYY-MM-DD) as text, read as its own parts: new Date('2026-12-20') is UTC midnight and shows the day before west of UTC. (The month names are a copy of
// app-progress.js's _PW_MONTHS on purpose: that file loads later, and reading its const from here would add a backward read to check-references' ratchet.)
function _glDate(ymd, withYear = false) {
  const [y, m, d] = String(ymd || '').slice(0, 10).split('-').map(Number)
  return y && m && d ? `${d} ${_GL_MONTHS[m - 1]}${withYear ? ' ' + y : ''}` : ''
}
const _glNum = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null }
// One decimal at most, no trailing zero: 130, 88.4, 117.5.
const _glFmt = v => String(parseFloat(Number(v).toFixed(1)))

// The numbers a goal can be measured by, or null: a start AND a target that differ. cur falls back to the start (a goal made today has no check-in yet).
// A goal from the old form can have a target and a current number but NO start; the dashboard's _goalPct reads that as current / target, so it runs from 0 here
// too - the list, the goal page and the dashboard card then give the same percentage.
function _goalNums(g) {
  const target = _glNum(g?.target_value), cur = _glNum(g?.current_value)
  const start = _glNum(g?.start_value) ?? (target != null && target !== 0 && cur != null ? 0 : null)
  if (start == null || target == null || start === target) return null
  return { start, target, cur: cur ?? start, up: target > start }
}
// 0 to 1 along start -> target. Clamped: past the target is "there", the wrong way is 0.
const _goalFrac = n => Math.max(0, Math.min(1, (n.cur - n.start) / (n.target - n.start)))
const _goalToGo = n => Math.max(0, n.up ? n.target - n.cur : n.cur - n.target)

// The steps in the order they were made (the `order` column when it is set, then when they were created).
function _goalSteps(g) {
  return [...(g?.goal_milestones || [])].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || String(a.created_at || '').localeCompare(String(b.created_at || '')))
}
// A step with a target number is reached once progress passes it, in the goal's own direction - provided the number lies ON the goal's line, between its start and its
// target: a typo (14 for 140) or a number beyond the target must not tick itself, because a step cannot be deleted (it can still be ticked by hand). It is DERIVED, never
// written: completed_at stays what a person ticked.
function _goalStepReached(n, m) {
  const v = _glNum(m?.target_value)
  if (!n || v == null || v < Math.min(n.start, n.target) || v > Math.max(n.start, n.target)) return false
  return n.up ? n.cur >= v : n.cur <= v
}
const _goalStepDone = (g, m) => !!m?.completed_at || _goalStepReached(_goalNums(g), m)
const _goalNextStep = g => _goalSteps(g).find(m => !_goalStepDone(g, m)) || null

// "21 weeks left", "5 days left", "due today", "3 days past due", from two YYYY-MM-DD days; null without a valid due date. Whole days apart, so a clock change cannot move it.
function _goalTimeLeft(due, today) {
  const ms = ymd => { const [y, m, d] = String(ymd || '').slice(0, 10).split('-').map(Number); return y && m && d ? Date.UTC(y, m - 1, d) : null }
  const a = ms(due), b = ms(today)
  if (a == null || b == null) return null
  const days = Math.round((a - b) / 86400000), s = n => (n === 1 ? '' : 's')
  if (days < 0) return { text: `${-days} day${s(-days)} past due`, late: true }
  if (days === 0) return { text: 'due today', late: false }
  return { text: days < 14 ? `${days} day${s(days)} left` : `${Math.round(days / 7)} weeks left`, late: false }
}
const _goalFinished = g => g?.status === 'completed' || g?.status === 'abandoned'
const _GOAL_STATUS_PILL = { completed: 'Done', paused: 'Paused', abandoned: 'Abandoned' }

async function renderClientGoals(clientId, el) {
  log.info('renderClientGoals', 'fetching goals', { clientId })
  el.innerHTML = '<div class="loading-state">Loading…</div>'

  const { data: goals, error } = await db
    .from('goals')
    .select('*, goal_milestones(*), goal_check_ins(date)')
    .eq('client_id', clientId)
    .order('priority')
    .order('created_at')

  if (error) { log.error('renderClientGoals', 'fetch failed', error); el.innerHTML = `<div class="loading-state">${escapeHtml(error.message)}</div>`; return }
  log.ok('renderClientGoals', `loaded ${goals.length} goals`)

  const canManage = _canManageGoals()
  const open = goals.filter(g => !_goalFinished(g)), finished = goals.filter(_goalFinished)
  const cid = escapeAttr(clientId)
  el.innerHTML = `
    ${canManage ? `<div class="gl-top"><button class="btn-primary" onclick="showAddGoalModal('${cid}')">+ Add goal</button></div>` : ''}
    <div class="gl-list" id="goals-view">
      ${goals.length === 0 ? `
        <div class="empty-state">
          <div class="empty-icon">🎯</div>
          <div class="empty-title">No goals yet</div>
          <div class="empty-text">${currentProfile?.role === 'solo' ? 'Set a goal to give yourself a clear roadmap' : canManage ? 'Set a goal to give this client a clear roadmap to success' : 'Your coach sets your goals — they will show up here'}</div>
          ${canManage ? `<button class="btn-primary" onclick="showAddGoalModal('${cid}')">+ Add first goal</button>` : ''}
        </div>
      ` : `
        <div class="pw-group">In progress · ${open.length}</div>
        ${open.length ? open.map(g => goalCard(g, clientId)).join('') : `<p class="gl-none">${canManage ? 'Nothing in progress. Add a goal to get started.' : 'Nothing in progress right now.'}</p>`}
        ${finished.length ? `
          <button type="button" class="pw-link gl-link gl-finished-btn" aria-expanded="false" onclick="_toggleFinishedGoals(this)">Show finished goals (${finished.length})</button>
          <div id="gl-finished" class="gl-list" hidden>${finished.map(g => goalCard(g, clientId)).join('')}</div>` : ''}
      `}
    </div>
  `
}

// The finished goals sit folded under the list; the button says what it will do.
function _toggleFinishedGoals(btn) {
  const box = document.getElementById('gl-finished'); if (!box) return
  box.hidden = !box.hidden
  btn.setAttribute('aria-expanded', String(!box.hidden))
  const n = box.querySelectorAll('.gl-card').length
  btn.textContent = `${box.hidden ? 'Show' : 'Hide'} finished goals (${n})`
}

// One goal in the list: its name, where it stands (the number, or the steps), the bar, the next step, and when it was last updated and is due.
function goalCard(g, clientId) {
  const n = _goalNums(g), steps = _goalSteps(g), done = steps.filter(m => _goalStepDone(g, m)).length, next = _goalFinished(g) ? null : _goalNextStep(g)
  const unit = g.metric_unit ? ' ' + escapeHtml(g.metric_unit) : ''
  const pct = n ? Math.round(_goalFrac(n) * 100) : steps.length ? Math.round(done / steps.length * 100) : 0
  const last = (g.goal_check_ins || []).map(c => String(c.date || '')).sort().pop()
  const left = g.target_date && !_goalFinished(g) ? _goalTimeLeft(g.target_date, _ymdLocal(new Date())) : null
  // the year only when it is not this one (a goal due next March must not read as one due this March)
  const when = g.target_date ? `Due ${_glDate(g.target_date, String(g.target_date).slice(0, 4) !== _ymdLocal(new Date()).slice(0, 4))}${left ? ' · ' + left.text : ''}` : 'No date set'
  const pill = _GOAL_STATUS_PILL[g.status]
  const gid = escapeAttr(g.id), cid = escapeAttr(clientId)
  // The handlers are spelled out, not built from a variable: scripts/check-handler-targets.mjs can only verify a handler whose function NAME is in the source.
  return `
    <div class="card gl-card" role="button" tabindex="0" onclick="openGoal('${gid}','${cid}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openGoal('${gid}','${cid}')}">
      <div class="gl-card-head"><span class="gl-name">${escapeHtml(g.title)}</span>${pill ? `<span class="pw-pill">${pill}</span>` : ''}</div>
      <div class="gl-nums">
        ${n ? `<span><b>${_glFmt(n.cur)}</b> <span class="gl-muted">of ${_glFmt(n.target)}${unit}</span></span><span class="gl-muted">${_goalFinished(g) ? '' : `${_glFmt(_goalToGo(n))}${unit} to go`}</span>`
            : steps.length ? `<span><b>${done}</b> <span class="gl-muted">of ${steps.length} ${steps.length === 1 ? 'step' : 'steps'}</span></span>` : '<span class="gl-muted">No steps yet</span>'}
      </div>
      ${n || steps.length ? `<div class="pw-bar gl-bar"><i style="width:${pct}%"></i></div>` : ''}
      <div class="gl-meta">
        ${next ? `<div class="gl-next"><span class="gl-muted">Next</span> ${escapeHtml(next.title)}</div>` : steps.length && !_goalFinished(g) ? '<div class="gl-muted">All steps done</div>' : ''}
        <div class="gl-meta-row"><span>${n && steps.length ? `${done} of ${steps.length} steps · ` : ''}${last ? 'Updated ' + _glDate(last) : 'No updates yet'}</span><span class="${left?.late ? 'gl-late' : ''}">${when}</span></div>
      </div>
    </div>
  `
}

// ─── ADD GOAL SHEET ───────────────────────────────────────────────────────────
// Short on purpose (Jake, 2026-10-13: "cramped or cluttered"): what the goal is, how it is measured, where it goes from and to, and when. Everything the old form asked
// that is not needed to start - description, type, metric label, priority - is folded under "More options" with the same ids, so nothing was lost.
function showAddGoalModal(clientId) {
  if (!_canManageGoals()) { showToast('Only your coach can change your goals', 'warn'); return }
  const w = escapeHtml(window._unitPrefs?.weight || 'kg')
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.id = 'add-goal-modal'
  overlay.innerHTML = `
    <div class="modal gl-sheet">
      <div class="modal-header">
        <h2 class="modal-title">New goal</h2>
        <button class="modal-close" onclick="closeModal('add-goal-modal')">✕</button>
      </div>

      <div class="field">
        <label class="field-label" for="ag-title">What is the goal? <span class="gl-req">*</span></label>
        <input class="field-input" id="ag-title" placeholder="e.g. Squat 160 kg, Run 5K under 25 min" autocomplete="off">
      </div>
      <div class="field">
        <span class="field-label">How will you measure it?</span>
        <div class="gl-chips" id="ag-kind" role="group" aria-label="How will you measure it?">
          <button type="button" class="gl-chip" aria-pressed="true" data-unit="${w}" onclick="_pickGoalKind(this)">Weight (${w})</button>
          <button type="button" class="gl-chip" aria-pressed="false" data-unit="min" onclick="_pickGoalKind(this)">Time (min)</button>
          <button type="button" class="gl-chip" aria-pressed="false" data-unit="reps" onclick="_pickGoalKind(this)">Reps</button>
          <button type="button" class="gl-chip" aria-pressed="false" data-other="1" onclick="_pickGoalKind(this)">Other</button>
          <button type="button" class="gl-chip" aria-pressed="false" data-steps="1" onclick="_pickGoalKind(this)">Steps only</button>
        </div>
        <input class="field-input" id="ag-unit" value="${w}" placeholder="Unit, e.g. km or %" aria-label="Unit" hidden>
      </div>
      <div class="pw-grid2" id="ag-nums">
        <div class="field"><label class="field-label" for="ag-start">From</label><input class="field-input" id="ag-start" type="number" inputmode="decimal" step="any" placeholder="e.g. 100"></div>
        <div class="field"><label class="field-label" for="ag-target">To</label><input class="field-input" id="ag-target" type="number" inputmode="decimal" step="any" placeholder="e.g. 160"></div>
      </div>
      <div class="field">
        <label class="field-label" for="ag-date">Target date <span class="gl-muted">(optional)</span></label>
        <input class="field-input" id="ag-date" type="date">
      </div>
      <details class="gl-more">
        <summary>More options</summary>
        <div class="field">
          <label class="field-label" for="ag-desc">Description</label>
          <textarea class="field-input" id="ag-desc" rows="2" placeholder="What does achieving this goal look like?"></textarea>
        </div>
        <div class="pw-grid2">
          <div class="field">
            <label class="field-label" for="ag-type">Goal type</label>
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
            <label class="field-label" for="ag-priority">Priority</label>
            <select class="field-input" id="ag-priority">
              <option value="1">1 — Primary goal</option>
              <option value="2">2 — Secondary goal</option>
              <option value="3">3 — Tertiary goal</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label class="field-label" for="ag-metric">Metric label</label>
          <input class="field-input" id="ag-metric" placeholder="e.g. Bodyweight, Squat 1RM">
        </div>
      </details>

      <p class="modal-error" id="ag-error"></p>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeModal('add-goal-modal')">Cancel</button>
        <button class="btn-primary" onclick="saveNewGoal('${escapeAttr(clientId)}')">Add goal</button>
      </div>
    </div>
  `
  mountModal(overlay)
  document.getElementById('ag-title').focus()
}

// The measure chips set the unit; "Other" asks for one; "Steps only" hides the numbers (the goal is tracked by its steps alone).
function _pickGoalKind(btn) {
  const group = btn.closest('#ag-kind'); if (!group) return
  group.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === btn)))
  const stepsOnly = btn.hasAttribute('data-steps'), other = btn.hasAttribute('data-other')
  const unit = document.getElementById('ag-unit'), nums = document.getElementById('ag-nums')
  if (unit) { unit.hidden = !other; unit.value = other || stepsOnly ? '' : btn.dataset.unit; if (other) unit.focus() }
  if (nums) nums.hidden = stepsOnly
}

async function saveNewGoal(clientId) {
  if (!_canManageGoals()) { showToast('Only your coach can change your goals', 'warn'); return }
  const title   = document.getElementById('ag-title').value.trim()
  const errorEl = document.getElementById('ag-error')
  if (!title) { errorEl.textContent = 'Title is required'; return }

  // From and To are a pair: one without the other is a typo, not a goal. "Steps only" has neither.
  const stepsOnly = !!document.querySelector('#ag-kind [aria-pressed="true"][data-steps]')
  const startRaw = document.getElementById('ag-start').value.trim(), targetRaw = document.getElementById('ag-target').value.trim()
  const start = stepsOnly ? null : _glNum(startRaw), target = stepsOnly ? null : _glNum(targetRaw)
  if (!stepsOnly && (startRaw || targetRaw) && (start == null || target == null)) { errorEl.textContent = 'Enter both From and To, or choose Steps only.'; return }
  if (start != null && start === target) { errorEl.textContent = 'From and To are the same number.'; return }

  // The CREATE path. _verifyGoalAccess/_verifyMilestoneAccess key on an EXISTING goalId, so neither
  // can cover this one — it was missed by the 2026-08-21 goal sweep for exactly that reason and
  // found by pre-push review 2026-08-22, as the 15th member of the caller-supplied-clientId class.
  if (!(await _verifyClientAccess('saveNewGoal', clientId))) { errorEl.textContent = 'Save failed — permission denied.'; return }
  log.info('saveNewGoal', 'inserting goal', { clientId })
  const { error } = await db.from('goals').insert({
    client_id:    clientId,
    created_by:   currentUser.id,
    title,
    description:  document.getElementById('ag-desc').value.trim()   || null,
    goal_type:    document.getElementById('ag-type').value,
    metric_label: document.getElementById('ag-metric').value.trim() || null,
    metric_unit:  stepsOnly ? null : (document.getElementById('ag-unit').value.trim() || null),
    start_value:  start,
    current_value: start,
    target_value: target,
    target_date:  document.getElementById('ag-date').value          || null,
    priority:     parseInt(document.getElementById('ag-priority').value),
    status:       'active'
  })

  if (error) { log.error('saveNewGoal', 'insert failed', error); errorEl.textContent = error.message; return }
  log.ok('saveNewGoal', 'goal created', { clientId })

  closeModal('add-goal-modal')
  const tabContent = document.getElementById('tab-content')
  if (tabContent) renderClientGoals(clientId, tabContent)
}
guardReentry('saveNewGoal')   // a double tap on Add goal made two goals; see tests/reentry-guard-2026-08-28.spec.js

// ─── GOAL DETAIL ──────────────────────────────────────────────────────────────
// The goal's own page (reworked 2026-10-14): where it stands (the number, how far to go, the bar), the steps as a checklist with a one-line add, and the history of
// updates. "Update progress" is the old check-in (a number and a note). A step with a target number ticks itself once progress passes it (_goalStepDone, derived and
// never written); any other step is ticked by hand. A client keeps the tracking controls and none of the managing ones (_canManageGoals).
async function openGoal(goalId, clientId) {
  const el = document.getElementById('tab-content')
  el.innerHTML = '<div class="loading-state">Loading…</div>'

  const gid = escapeAttr(goalId), cid = escapeAttr(clientId)
  const back = `<a class="back-btn" href="#" onclick="backToGoals('${cid}');return false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>All goals</a>`
  const { data: g, error } = await db
    .from('goals')
    .select('*, goal_milestones(*), goal_check_ins(*)')
    .eq('id', goalId)
    .single()
  if (error || !g) { log.error('openGoal', 'fetch failed', error); el.innerHTML = `${back}<div class="loading-state">Could not load this goal. Check your connection and try again.</div>`; return }
  window._goalOpen = { id: goalId, clientId, goal: g }     // the Update progress sheet starts from this goal's number

  const canManage = _canManageGoals()
  const n = _goalNums(g)
  const steps = _goalSteps(g).map(m => ({ m, on: _goalStepDone(g, m), auto: !m.completed_at && _goalStepReached(n, m) }))
  const nDone = steps.filter(s => s.on).length
  const checkIns = [...(g.goal_check_ins || [])].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.created_at || '').localeCompare(String(a.created_at || '')))
  const unit = g.metric_unit ? ' ' + escapeHtml(g.metric_unit) : ''
  const pct = n ? Math.round(_goalFrac(n) * 100) : steps.length ? Math.round(nDone / steps.length * 100) : 0
  const left = g.target_date && !_goalFinished(g) ? _goalTimeLeft(g.target_date, _ymdLocal(new Date())) : null
  const sub = g.target_date ? `${_goalFinished(g) ? 'Target' : 'Due'} ${_glDate(g.target_date, true)}${left ? ' · ' + left.text : ''}` : 'No date set'
  const pill = _GOAL_STATUS_PILL[g.status] ? `<span class="pw-pill">${_GOAL_STATUS_PILL[g.status]}</span>` : ''
  const tick = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>'
  // A mark on the bar for every step that has a number inside the goal's range.
  const marks = n ? steps.map(({ m, on }) => {
    const v = _glNum(m.target_value), x = v == null ? null : (v - n.start) / (n.target - n.start)
    return x != null && x > 0 && x < 1 ? `<b class="gl-mark${on ? ' is-hit' : ''}" style="left:${(x * 100).toFixed(1)}%"></b>` : ''
  }).join('') : ''
  const started = g.created_at ? _glDate(_ymdLocal(new Date(g.created_at))) : ''
  const updateBtn = g.status === 'completed' || g.status === 'abandoned' ? '' : `<button type="button" class="btn-primary gl-update" onclick="showAddCheckInModal('${gid}','${cid}')">Update progress</button>`

  el.innerHTML = `
    ${back}
    <div class="gl-head">
      <div class="gl-head-main">
        <h2 class="gl-title">${escapeHtml(g.title)}</h2>
        <div class="gl-due${left?.late ? ' gl-late' : ''}">${sub}</div>
        ${g.description ? `<p class="gl-desc">${escapeHtml(g.description)}</p>` : ''}
      </div>
      ${canManage ? `<button class="btn-secondary gl-edit" onclick="showEditGoalModal('${gid}','${cid}')">Edit</button>` : ''}
    </div>

    <div class="pw-card gl-progress">
      ${g.metric_label ? `<div class="pw-label">${escapeHtml(g.metric_label)}</div>` : ''}
      ${n ? `
        <div class="pw-card-row"><div class="pw-big">${_glFmt(n.cur)}<span class="pw-big-unit">${unit}</span></div>${pill}</div>
        <div class="gl-sub">${g.status === 'completed' ? (pct >= 100 ? 'Goal reached' : `Marked as done · ${pct}% of the way`) : `${_glFmt(_goalToGo(n))}${unit} to go · ${pct}% there`}</div>
        <div class="gl-barwrap"><div class="pw-bar gl-bar"><i style="width:${pct}%"></i></div>${marks}</div>
        <div class="pw-legend"><span><strong>${_glFmt(n.start)}${unit}</strong><br>${started ? 'Started ' + started : 'Start'}</span><span class="gl-end"><strong>${_glFmt(n.target)}${unit}</strong><br>Target</span></div>`
      : `
        ${steps.length ? `<div class="pw-card-row"><div class="pw-big">${nDone}<span class="pw-big-unit"> of ${steps.length} ${steps.length === 1 ? 'step' : 'steps'}</span></div>${pill}</div>
        <div class="pw-bar gl-bar"><i style="width:${pct}%"></i></div>` : `<div class="pw-card-row"><div class="gl-sub gl-nothing">Nothing to track yet.${canManage ? ' Add a step below, or set From and To in Edit.' : ''}</div>${pill}</div>`}`}
      ${updateBtn}
    </div>

    <div class="pw-head gl-sec"><h3 class="pw-card-title">Steps</h3><span class="gl-muted">${nDone} of ${steps.length} done</span></div>
    <div class="pw-list gl-steps" id="milestone-list">
      ${steps.length ? steps.map(({ m, on, auto }) => `
        <div class="gl-step${on ? ' is-done' : ''}">
          <button type="button" class="gl-tick${on ? ' on' : ''}" onclick="toggleMilestone('${escapeAttr(m.id)}','${gid}','${cid}')" aria-label="${on ? 'Mark not done' : 'Mark done'}: ${escapeHtml(m.title)}"${auto ? ' disabled' : ''}>${tick}</button>
          <div class="gl-step-main">
            <div class="gl-step-t">${escapeHtml(m.title)}</div>
            ${auto ? '<div class="gl-auto">Ticked itself when your progress reached it</div>' : ''}
            ${m.target_date ? `<div class="gl-muted">${_glDate(m.target_date, true)}</div>` : ''}
          </div>
        </div>`).join('') : `<div class="gl-step"><div class="gl-step-main gl-muted">${canManage ? 'No steps yet. Add one below to break the goal up.' : 'No steps yet.'}</div></div>`}
      ${canManage ? `
        <div class="gl-addstep">
          <input class="field-input" id="step-title" placeholder="Add a step, e.g. Squat 140 kg" aria-label="New step" autocomplete="off" onkeydown="if(event.key==='Enter'){event.preventDefault();addStep('${gid}','${cid}')}">
          <button type="button" class="btn-primary" onclick="addStep('${gid}','${cid}')">Add</button>
        </div>` : ''}
    </div>
    ${canManage ? `<p class="gl-step-err" id="step-error" role="alert"></p><button type="button" class="pw-link gl-link" onclick="showAddMilestoneModal('${gid}','${cid}')">Add a step with a number or a date…</button>` : ''}

    ${checkIns.length ? `
      <div class="pw-head gl-sec"><h3 class="pw-card-title">History</h3><span class="gl-muted">${checkIns.length} ${checkIns.length === 1 ? 'update' : 'updates'}</span></div>
      <div class="pw-list" id="gl-history">
        ${checkIns.map((ci, i) => `
          <div class="gl-hist"${i >= 5 ? ' hidden' : ''}>
            <div>
              <div class="gl-hist-v">${ci.current_value != null && ci.current_value !== '' ? _glFmt(ci.current_value) + unit : 'Note'}</div>
              ${ci.notes ? `<div class="gl-muted gl-hist-n">${escapeHtml(ci.notes)}</div>` : ''}
            </div>
            <div class="gl-muted gl-hist-d">${_glDate(ci.date)}</div>
          </div>`).join('')}
      </div>
      ${checkIns.length > 5 ? `<button type="button" class="pw-link gl-link" aria-expanded="false" onclick="_toggleAllCheckIns(this)">Show all ${checkIns.length}</button>` : ''}` : ''}
  `
}

// The history shows the newest five; this opens the rest and folds them again.
function _toggleAllCheckIns(btn) {
  const rows = document.querySelectorAll('#gl-history .gl-hist')
  const open = btn.getAttribute('aria-expanded') === 'true'
  rows.forEach((r, i) => { r.hidden = open && i >= 5 })
  btn.setAttribute('aria-expanded', String(!open))
  btn.textContent = open ? `Show all ${rows.length}` : 'Show fewer'
}

function backToGoals(clientId) {
  // Matches backToClientWorkouts's fallback (app-runner.js) — found by the 2026-08-07 Back-button
  // audit as the one inconsistent affordance of 6 checked, left as a "latent, could not make it break"
  // gap. #tab-content is the same container id the coach's client-profile page and the solo Goals page
  // both mount (tests/solo-dashboard-tiles-2026-08-30.spec.js:307), so it is reachable if a role switch
  // or a navigation away happens while a goal detail is on screen or its fetch is in flight — without
  // this, the next call throws instead of landing somewhere real. Re-verified present in today's code
  // 2026-09-27, not assumed fixed by the audit note alone.
  //
  // navigate('workouts'), not navigate('goals') — deliberately copying the SIBLING'S actual literal, not
  // just its shape. This function is reached two ways: the coach's client-profile Goals tab
  // (js/app-clients.js), and solo's own dedicated 'goals' page (app-core.js's soloPages). 'workouts' is
  // valid for all three roles (coachPages/clientPages/soloPages, app-core.js); 'goals' is valid for solo
  // only. Corrected 2026-09-28 (multi-agent-review): a coach calling navigate('goals') would NOT hit
  // navigate()'s "Page not found" default — the 'goals' case has no role gate, so it would run and fall
  // through to _getCurrentClientId() finding no client row for a coach's own user_id, landing on "No
  // client profile found" instead. Either way it's a worse landing than 'workouts', which is why
  // 'workouts' is still the right fallback — the reasoning was wrong, the choice wasn't.
  const content = document.getElementById('tab-content')
  if (content) renderClientGoals(clientId, content)
  else navigate('workouts')
}

// ─── MILESTONE MODAL ──────────────────────────────────────────────────────────
function showAddMilestoneModal(goalId, clientId) {
  if (!_canManageGoals()) { showToast('Only your coach can change your goals', 'warn'); return }
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.id = 'add-milestone-modal'
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2 class="modal-title">Add a step</h2>
        <button class="modal-close" onclick="closeModal('add-milestone-modal')">✕</button>
      </div>
      <div class="field">
        <label class="field-label">Title <span style="color:var(--danger-text)">*</span></label>
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
        <button class="btn-primary" onclick="saveNewMilestone('${escapeAttr(goalId)}','${escapeAttr(clientId)}')">Add step</button>
      </div>
    </div>
  `
  mountModal(overlay)
  document.getElementById('am-title').focus()
}

async function saveNewMilestone(goalId, clientId) {
  if (!_canManageGoals()) { showToast('Only your coach can change your goals', 'warn'); return }
  const title   = document.getElementById('am-title').value.trim()
  const errorEl = document.getElementById('am-error')
  if (!title) { errorEl.textContent = 'Title is required'; return }
  if (!(await _verifyGoalAccess('saveNewMilestone', goalId))) { errorEl.textContent = 'Save failed — permission denied.'; return }

  log.info('saveNewMilestone', 'inserting milestone', { goalId })
  const { error } = await db.from('goal_milestones').insert({
    goal_id:      goalId,
    title,
    description:  document.getElementById('am-desc').value.trim()  || null,
    target_value: document.getElementById('am-value').value         || null,
    target_date:  document.getElementById('am-date').value          || null
  })

  if (error) { log.error('saveNewMilestone', 'insert failed', error); errorEl.textContent = error.message; return }
  log.ok('saveNewMilestone', 'milestone created', { goalId })
  closeModal('add-milestone-modal')
  openGoal(goalId, clientId)
}
guardReentry('saveNewMilestone')   // a double tap on Add made two steps; see tests/reentry-guard-2026-08-28.spec.js

// The one-line "Add a step": a title and Add, no dialog (Jake, 2026-10-13: the milestones were "clumsy"). A step with a number or a date still has its dialog
// (showAddMilestoneModal), linked underneath. Same ownership check as every other goal write in this file, and the database's own refusal is shown, not swallowed:
// a solo user's milestone insert is refused today (docs/bugs/2026-10-01-solo-user-cannot-add-milestones-to-their-own-goals.md).
async function addStep(goalId, clientId) {
  if (!_canManageGoals()) { showToast('Only your coach can change your goals', 'warn'); return }
  const input = document.getElementById('step-title'), errorEl = document.getElementById('step-error')
  const title = (input?.value || '').trim()
  if (!title) { if (errorEl) errorEl.textContent = 'Type the step first.'; return }
  if (errorEl) errorEl.textContent = ''
  if (!(await _verifyGoalAccess('addStep', goalId))) { if (errorEl) errorEl.textContent = 'Not added — permission denied.'; return }
  log.info('addStep', 'inserting step', { goalId })
  const { error } = await db.from('goal_milestones').insert({ goal_id: goalId, title })
  if (error) { log.error('addStep', 'insert failed', error); if (errorEl) errorEl.textContent = 'Could not add the step: ' + error.message; return }
  log.ok('addStep', 'step created', { goalId })
  await _repaintGoal(goalId, clientId, { focusStep: true })
}
guardReentry('addStep')   // a double tap (or Enter then a tap) added the step twice

// ONE ownership check for every goal/milestone write in this file (2026-08-12 audit + a 2026-08-02
// note that was never actually filed until 2026-08-12).
//
// Goal ownership means DIFFERENT THINGS PER ROLE, which is why a single `.eq('created_by', …)` anchor
// is the wrong fix here even though that is exactly what saveEditGoal correctly uses:
//   - a COACH owns a goal via `created_by` (they wrote it)
//   - a CLIENT or SOLO user owns it via `client_id` — their coach created it, so `created_by` is
//     someone else entirely
// saveGoalProgress and toggleClientMilestone are self-service paths (both end in _renderOwnDashboard),
// so anchoring them on created_by would refuse every client their own progress save. That is the
// coach_id-excludes-solo trap in a different coat, and this project has shipped four of those.
//
// `goal_milestones` has no owner column at all, so it resolves through its parent goal. The parent id
// is re-read FROM THE MILESTONE rather than trusted from the caller's argument — toggleMilestone
// receives goalId as a parameter, and a parameter is exactly what an attacker controls.
//
// NOT independently verified against live RLS. The already-closed siblings in this audit family
// (workout_template_exercises, the app-clients writes) were both proven RLS-backstopped before being
// downgraded; no equivalent probe exists for `goals`/`goal_milestones`, and `events` — the same file,
// same table family — is where a REAL exploitable write-policy gap was found live on 2026-08-02. So
// treat this as app-level defence whose database half is unconfirmed, not as belt-and-braces.
async function _verifyGoalAccess(fnName, goalId) {
  if (!goalId) { log.error(fnName, 'ownership check failed — no goalId'); return false }
  const { data: g } = await db.from('goals').select('id, client_id, created_by').eq('id', goalId).maybeSingle()
  if (!g) { log.error(fnName, 'ownership check failed — goal not visible', { goalId }); return false }
  if (g.created_by === currentUser.id) return true
  const mine = await _getCurrentClientId()
  if (mine && g.client_id === mine) return true
  log.error(fnName, 'ownership check failed — goal is neither mine nor my own client record\'s', { goalId })
  return false
}

async function _verifyMilestoneAccess(fnName, milestoneId) {
  if (!milestoneId) { log.error(fnName, 'ownership check failed — no milestoneId'); return false }
  const { data: m } = await db.from('goal_milestones').select('goal_id').eq('id', milestoneId).maybeSingle()
  if (!m?.goal_id) { log.error(fnName, 'ownership check failed — milestone not visible', { milestoneId }); return false }
  return await _verifyGoalAccess(fnName, m.goal_id)
}

// Repaints the goal page after a step is added or ticked without throwing the person back to the top: openGoal swaps the whole page for "Loading…" first, which collapses
// the scroll position - and ticking steps is now the page's main action. The step box gets the focus back after an add, ready for the next one.
async function _repaintGoal(goalId, clientId, { focusStep = false } = {}) {
  const main = document.getElementById('main-content')
  const y = window.scrollY, top = main ? main.scrollTop : 0
  await openGoal(goalId, clientId)
  window.scrollTo(0, y)
  if (main) main.scrollTop = top
  if (focusStep) document.getElementById('step-title')?.focus({ preventScroll: true })
}

async function toggleMilestone(milestoneId, goalId, clientId) {
  log.info('toggleMilestone', 'toggling milestone', { milestoneId })
  if (!(await _verifyMilestoneAccess('toggleMilestone', milestoneId))) return
  const { data: m, error: fetchErr } = await db.from('goal_milestones').select('completed_at').eq('id', milestoneId).single()
  if (fetchErr) { log.error('toggleMilestone', 'fetch failed', fetchErr); return }
  const newVal = m.completed_at ? null : new Date().toISOString()
  // Row-counted: an update the database refuses returns no error and no row, and the page would repaint with the tick unchanged as if nothing had been asked.
  const { data: changed, error } = await db.from('goal_milestones').update({ completed_at: newVal }).eq('id', milestoneId).select('id')
  if (error) { log.error('toggleMilestone', 'update failed', error); return }
  if (!(changed || []).length) { log.error('toggleMilestone', 'update changed no rows - permission denied or the step is gone', { milestoneId }); showToast('That step could not be changed', 'error'); return }
  log.ok('toggleMilestone', 'milestone toggled', { milestoneId, completed: !!newVal })
  await _repaintGoal(goalId, clientId)
}
guardReentry('toggleMilestone')   // a double tap toggled it twice - on, then off again

async function toggleClientMilestone(milestoneId) {
  if (!(await _verifyMilestoneAccess('toggleClientMilestone', milestoneId))) return
  const { data: m, error: fetchErr } = await db.from('goal_milestones').select('completed_at').eq('id', milestoneId).single()
  if (fetchErr) { log.error('toggleClientMilestone', 'fetch failed', fetchErr); return }
  const newVal = m.completed_at ? null : new Date().toISOString()
  const { error } = await db.from('goal_milestones').update({ completed_at: newVal }).eq('id', milestoneId)
  if (error) { log.error('toggleClientMilestone', 'update failed', error); return }
  // Repaint the dashboard the user is ACTUALLY on. The milestone chips this powers are rendered on
  // BOTH dashboards (app-dashboard.js:424 client, :753 solo), so hardcoding renderClientDashboard
  // sent a solo user into the client dashboard, whose coached-record lookup finds nothing for a
  // `coach_id IS NULL` row -- the page became "Unable to load your profile. Please contact your
  // coach." on a plain milestone tap. Same pattern saveClientPB/saveClientWeight already use.
  _renderOwnDashboard()
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
  if (!(await _verifyGoalAccess('saveGoalProgress', goalId))) { if (errEl) errEl.textContent = 'Save failed — permission denied.'; return }
  const { error } = await db.from('goals').update({ current_value: val }).eq('id', goalId)
  if (error) { log.error('saveGoalProgress', 'update failed', error); if (errEl) errEl.textContent = error.message; return }
  _renderOwnDashboard()   // see app-core.js — hardcoding the client dashboard breaks solo
}

// ─── UPDATE PROGRESS SHEET (the check-in) ─────────────────────────────────────
// A number and a note: the old "Log check-in" without the dialog's four fields. The number starts from where the goal stands, with − and + for a quick nudge (the step
// follows the size of the goal); the date is today unless changed under the fold. Every role can use it: a client tracks progress on the goal their coach set.
// A goal with no numbers (steps only) gets a plain optional number and a note.
function showAddCheckInModal(goalId, clientId) {
  const g = window._goalOpen?.goal?.id === goalId ? window._goalOpen.goal : null
  const n = g ? _goalNums(g) : null
  const unit = g?.metric_unit ? escapeHtml(g.metric_unit) : ''
  // A 30+ goal moves in 2.5s, reps in whole reps, anything else in halves.
  const step = !n ? 0.5 : Math.abs(n.target - n.start) >= 30 ? 2.5 : /^reps?$/i.test(String(g.metric_unit || '').trim()) ? 1 : 0.5
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.id = 'add-checkin-modal'
  overlay.innerHTML = `
    <div class="modal gl-sheet">
      <div class="modal-header">
        <h2 class="modal-title">Update progress</h2>
        <button class="modal-close" onclick="closeModal('add-checkin-modal')">✕</button>
      </div>
      ${g ? `<p class="gl-sheet-goal">${escapeHtml(g.title)}</p>` : ''}
      <div class="field">
        <label class="field-label" for="ci-value">${n ? 'Where you are now' : 'Number <span class="gl-muted">(optional)</span>'}</label>
        ${n ? `
        <div class="pw-stepper">
          <button type="button" class="pw-step" aria-label="Down" onclick="_stepGoalValue(this,-1)">−</button>
          <input class="form-input pw-big-input" id="ci-value" type="number" inputmode="decimal" step="any" data-step="${step}" value="${escapeHtml(String(n.cur))}">
          <button type="button" class="pw-step" aria-label="Up" onclick="_stepGoalValue(this,1)">+</button>
        </div>
        <div class="pw-unit">${unit || '&nbsp;'}</div>` : `
        <input class="field-input" id="ci-value" type="number" inputmode="decimal" step="any" placeholder="e.g. 87.5">`}
      </div>
      <div class="field">
        <label class="field-label" for="ci-notes">Note <span class="gl-muted">(optional)</span></label>
        <textarea class="field-input" id="ci-notes" rows="2" placeholder="How is it going?"></textarea>
      </div>
      <details class="gl-more">
        <summary>Change the date</summary>
        <div class="field"><label class="field-label" for="ci-date">Date</label><input class="field-input" id="ci-date" type="date" value="${_ymdLocal(new Date())}"></div>
      </details>
      <p class="modal-error" id="ci-error"></p>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeModal('add-checkin-modal')">Cancel</button>
        <button class="btn-primary" onclick="saveCheckIn('${escapeAttr(goalId)}','${escapeAttr(clientId)}')">Save</button>
      </div>
    </div>
  `
  mountModal(overlay)
}

// − and + on the number: one step of the size the sheet chose, to at most two decimals.
function _stepGoalValue(btn, dir) {
  const input = btn.parentElement?.querySelector('input'); if (!input) return
  const step = Number(input.dataset.step) || 0.5
  input.value = String(parseFloat(((parseFloat(input.value) || 0) + dir * step).toFixed(2)))
}

async function saveCheckIn(goalId, clientId) {
  const errorEl = document.getElementById('ci-error')
  const raw     = document.getElementById('ci-value').value.trim()
  const value   = raw === '' ? null : parseFloat(raw)
  const notes   = document.getElementById('ci-notes').value.trim() || null
  const date    = document.getElementById('ci-date')?.value || _ymdLocal(new Date())
  if (raw !== '' && !Number.isFinite(value)) { errorEl.textContent = 'Enter a number.'; return }
  if (value == null && !notes) { errorEl.textContent = 'Enter a number or a note.'; return }

  if (!(await _verifyGoalAccess('saveCheckIn', goalId))) { errorEl.textContent = 'Save failed — permission denied.'; return }
  log.info('saveCheckIn', 'inserting check-in', { goalId })
  const { error } = await db.from('goal_check_ins').insert({
    goal_id:       goalId,
    created_by:    currentUser.id,
    date,
    current_value: value,
    notes
  })

  if (error) { log.error('saveCheckIn', 'insert failed', error); errorEl.textContent = error.message; return }
  log.ok('saveCheckIn', 'check-in saved', { goalId })

  // The goal's own number follows the update - unless the update is OLDER than the newest one already in the history: logging last month's weigh-in must not pull the
  // goal back to last month's number. Rowcount-checked: an update the database refuses returns no error and no row, and the page would repaint with the old number as
  // if nothing had been asked.
  const open = window._goalOpen?.goal?.id === goalId ? window._goalOpen.goal : null
  const newest = open ? (open.goal_check_ins || []).map(c => String(c.date || '')).sort().pop() : null
  if (value != null && newest && date < newest) {
    showToast('Saved to the history. It is older than your latest update, so the goal\'s number stays as it is.', 'info')
  } else if (value != null) {
    log.info('saveCheckIn', 'updating goal current_value', { goalId })
    const { data: moved, error: updateErr } = await db.from('goals').update({ current_value: value, updated_at: new Date().toISOString() }).eq('id', goalId).select('id')
    if (updateErr || !(moved || []).length) {
      log.error('saveCheckIn', 'goal current_value update failed', updateErr || { code: 'NO_ROW' })
      showToast('Saved to the history, but the goal\'s number could not be updated.', 'error')
    }
  }

  closeModal('add-checkin-modal')
  openGoal(goalId, clientId)
}
guardReentry('saveCheckIn')   // a double tap on Save logged the update twice; see tests/reentry-guard-2026-08-28.spec.js

// ─── EDIT GOAL SHEET ──────────────────────────────────────────────────────────
// The same short shape as the new-goal sheet: the name, from and to, the date, and "Mark goal finished"; the rest (description, status, the current number, Delete) is under
// "More options" with the ids the save has always read. Start value is editable now (it never was), so a goal made without numbers can be given them.
async function showEditGoalModal(goalId, clientId) {
  if (!_canManageGoals()) { showToast('Only your coach can change your goals', 'warn'); return }
  const { data: g, error } = await db.from('goals').select('*').eq('id', goalId).single()
  if (error || !g) { log.error('showEditGoalModal', 'fetch failed', error); showToast('Could not load this goal', 'error'); return }
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.id = 'edit-goal-modal'
  const gid = escapeAttr(goalId), cid = escapeAttr(clientId)
  overlay.innerHTML = `
    <div class="modal gl-sheet">
      <div class="modal-header">
        <h2 class="modal-title">Edit goal</h2>
        <button class="modal-close" onclick="closeModal('edit-goal-modal')">✕</button>
      </div>
      <div class="field">
        <label class="field-label" for="eg-title">Goal title</label>
        <input class="field-input" id="eg-title" value="${escapeHtml(g.title)}">
      </div>
      <div class="pw-grid2">
        <div class="field"><label class="field-label" for="eg-start">From</label><input class="field-input" id="eg-start" type="number" inputmode="decimal" step="any" value="${escapeHtml(String(g.start_value ?? ''))}"></div>
        <div class="field"><label class="field-label" for="eg-target">To</label><input class="field-input" id="eg-target" type="number" inputmode="decimal" step="any" value="${escapeHtml(String(g.target_value ?? ''))}"></div>
      </div>
      <div class="field">
        <label class="field-label" for="eg-date">Target date</label>
        <input class="field-input" id="eg-date" type="date" value="${escapeHtml(g.target_date || '')}">
      </div>
      <details class="gl-more">
        <summary>More options</summary>
        <div class="field">
          <label class="field-label" for="eg-desc">Description</label>
          <textarea class="field-input" id="eg-desc" rows="2">${escapeHtml(g.description || '')}</textarea>
        </div>
        <div class="pw-grid2">
          <div class="field">
            <label class="field-label" for="eg-status">Status</label>
            <select class="field-input" id="eg-status">
              <option value="active"    ${g.status==='active'    ?'selected':''}>Active</option>
              <option value="completed" ${g.status==='completed' ?'selected':''}>Completed</option>
              <option value="paused"    ${g.status==='paused'    ?'selected':''}>Paused</option>
              <option value="abandoned" ${g.status==='abandoned' ?'selected':''}>Abandoned</option>
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="eg-current">Current value</label>
            <input class="field-input" id="eg-current" type="number" inputmode="decimal" step="any" value="${escapeHtml(String(g.current_value ?? ''))}">
          </div>
        </div>
      </details>
      <button type="button" class="btn-secondary gl-finish" onclick="_markGoalFinished('${gid}','${cid}','${g.status === 'completed' ? 'active' : 'completed'}')">${g.status === 'completed' ? 'Reopen goal' : 'Mark goal finished'}</button>
      <p class="modal-error" id="eg-error"></p>
      <div class="modal-footer">
        <button class="btn-danger" onclick="deleteGoal('${gid}','${cid}')">Delete goal</button>
        <div class="gl-grow"></div>
        <button class="btn-secondary" onclick="closeModal('edit-goal-modal')">Cancel</button>
        <button class="btn-primary" onclick="saveEditGoal('${gid}','${cid}')">Save</button>
      </div>
    </div>
  `
  mountModal(overlay)
}

// "Mark goal finished" / "Reopen goal" save the status the BUTTON names (given when the sheet was drawn, not whatever the Status box says now) through the one save,
// saveEditGoal: same ownership anchor, same row-count check, same repaint. If that save does not go through, the Status box is put back as it was, so a later plain Save
// cannot persist a status nobody chose.
async function _markGoalFinished(goalId, clientId, status) {
  const box = document.getElementById('eg-status'); if (!box) return
  const before = box.value
  box.value = status
  await saveEditGoal(goalId, clientId)
  if (document.getElementById('edit-goal-modal')) box.value = before
}

async function saveEditGoal(goalId, clientId) {
  if (!_canManageGoals()) { showToast('Only your coach can change your goals', 'warn'); return }
  const errorEl = document.getElementById('eg-error')
  const title   = document.getElementById('eg-title').value.trim()
  if (!title) { errorEl.textContent = 'Title is required'; return }
  // From without To is a typo and so is the same number twice (as on the new-goal sheet). A To without a From is left alone: a goal from the old form can have only a target.
  const startEl = document.getElementById('eg-start')
  if (startEl) {
    const s = _glNum(startEl.value), t = _glNum(document.getElementById('eg-target').value)
    if (startEl.value.trim() && t == null) { errorEl.textContent = 'Enter To as well, or clear From.'; return }
    if (s != null && s === t) { errorEl.textContent = 'From and To are the same number.'; return }
  }

  log.info('saveEditGoal', 'updating goal', { goalId })
  // .select('id') + rowcount, as deleteGoal below has: the `created_by` anchor means an account that did not create this goal
  // (a client opening the goal its COACH set) matches no row, and a policy-refused update returns { data: [], error: null } —
  // the modal used to close and the old values repaint, so the edit vanished without a word (multi-agent review, 2026-10-01).
  const { data: updated, error } = await db.from('goals').update({
    title,
    description:   document.getElementById('eg-desc').value.trim()    || null,
    status:        document.getElementById('eg-status').value,
    target_date:   document.getElementById('eg-date').value            || null,
    current_value: document.getElementById('eg-current').value         || null,
    target_value:  document.getElementById('eg-target').value          || null,
    ...(document.getElementById('eg-start') ? { start_value: document.getElementById('eg-start').value || null } : {}),
    updated_at:    new Date().toISOString()
  }).eq('id', goalId).eq('created_by', currentUser.id).select('id')

  if (error) { log.error('saveEditGoal', 'update failed', error); errorEl.textContent = error.message; return }
  if (!(updated || []).length) { errorEl.textContent = 'Not saved — only the person who set this goal can edit it.'; return }
  log.ok('saveEditGoal', 'goal updated', { goalId })
  closeModal('edit-goal-modal')
  openGoal(goalId, clientId)
}

async function deleteGoal(goalId, clientId) {
  if (!_canManageGoals()) { showToast('Only your coach can change your goals', 'warn'); return }
  if (!(await confirmDialog('Delete this goal and all its steps and updates? This cannot be undone.', { title: 'Delete goal?', confirmLabel: 'Delete', danger: true }))) return
  log.info('deleteGoal', 'deleting goal', { goalId })
  // Rowcount check, matching delete1RM / deletePerfLog / deleteWeightLog (app-progress.js). The
  // confirm promises "this cannot be undone" and deletes milestones and check-ins too, so a silent
  // no-op here is the worst version of this class: the user believes a cascade happened. A
  // policy-refused delete returns `{ data: [], error: null }`, so `error` alone cannot detect it.
  const { data: removed, error } = await dbq('deleteGoal', db.from('goals').delete().eq('id', goalId).eq('created_by', currentUser.id).select('id'))
  if (error) { log.error('deleteGoal', 'delete failed', error); return }
  if (!removed?.length) {
    log.error('deleteGoal', 'delete removed no rows — permission denied or already gone', { goalId })
    showToast('That goal could not be deleted', 'error')
    return
  }
  log.ok('deleteGoal', 'goal deleted', { goalId })
  closeModal('edit-goal-modal')
  const content = document.getElementById('tab-content')
  renderClientGoals(clientId, content)
}

// ─── WORKOUT HELPERS ─────────────────────────────────────────────────────────
