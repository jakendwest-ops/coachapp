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
// Cardio distance for a set — PRESCRIBED (sets_json) or ACHIEVED (loggedSets) — always in METRES.
//
// Both used the same `distance` key meaning km, and the runner multiplied by 1000 on save. From
// 2026-07-22 both enter and write metres under a NEW key, `distanceM`; `distance` is never written
// again and never rewritten, so every pre-existing template and in-flight draft keeps its original
// meaning (fix forward, don't retroactively reclassify). One function for both because they are the
// same conversion — duplicating it per call site is how sibling paths silently drift (les-037).
//
// NB: distinct from the `distance_m` set key / column, which is achieved metres for jump_distance and
// distance-strength (carry/sled) and was always metres.
function _cardioDistanceM(s) {
  if (!s) return 0
  if (s.distanceM != null && s.distanceM !== '') return parseFloat(s.distanceM) || 0
  return s.distance ? (parseFloat(s.distance) || 0) * 1000 : 0
}

// Metres under 1km, km above — a 5000m row reads better as "5km" on a chart or a target chip, while
// a 400m interval reads better as "400m". Entry is always metres; only display adapts.
function fmtDistanceM(m) {
  const n = Math.round(parseFloat(m) || 0)   // round BEFORE the threshold test, or 999.6 renders "1000 m"
  if (!n) return ''
  return n < 1000 ? `${n} m` : `${(n / 1000).toFixed(2).replace(/\.?0+$/, '')} km`
}

// A mm:ss target of '0:00' means "unset", but it is a truthy string — so a bare `s.pace500Min ?` check
// treats every legacy cardio set as having a pace, rendering a "0:00 /500m" chip in the runner and
// forcing the builder's optional-field disclosure permanently open. The builder used to default these
// inputs to '0:00', so essentially every set built before 2026-07-22 carries them. Anything time-shaped
// must go through here before being treated as present. Lives here, not in app-runner.js, because both
// the runner AND the builder need it (found by the pre-push review, which caught the builder still
// using raw truthiness while the runner had been fixed).
function _hasTimeTarget(v) { return !!v && v !== '0:00' && v !== '00:00' }

// THE single source of truth for a sets_json payload.
//
// This was an explicit key allowlist duplicated in TWO builders — saveExerciseToTemplate (here) and
// _confirmRunnerExerciseFromModal (app-runner.js) — and it had silently dropped EVERY cardio-specific
// target since the cardio fields were introduced: isDistanceBased, pace500Min/Max, hrZoneMin/Max,
// restHrMax, strokeRateMin/Max, paceKmMin/Max. So a coach adding a cardio exercise kept only duration
// and distance, while EDITING one (saveEditTemplateExercise, which writes sets_json raw) kept
// everything. Two siblings doing one job, drifted, failing silently at every layer — les-036/les-037.
// It became load-bearing on 2026-07-22: the runner branches on `tgt.isDistanceBased`, so a newly added
// distance-cardio exercise rendered as duration and its metres target never appeared.
// Found by the pre-push multi-agent review, independently, by two agents.
//
// One function, both callers. Do not re-inline it.
function _cleanTemplateSets(sets, derived) {
  return (sets || []).map(s => ({
    amrap: !!s.amrap, unilateral: derived.unilateral, timed: derived.timed,
    bodyweight: !!s.bodyweight, assisted: !!s.assisted, assistWeight: s.assistWeight || null,
    repsMin: s.repsMin || null, repsMax: s.repsMax || null, weight: s.weight || null,
    intensityMin: s.intensityMin || null, intensityMax: s.intensityMax || null,
    restMin: s.restMin || null, restMax: s.restMax || null,
    effortType: s.effortType || 'rpe', effortMin: s.effortMin || null, effortMax: s.effortMax || null,
    tempo: s.tempo || null, countdown: s.countdown || null,
    duration: s.duration || null,
    // `distance` (km) is carried through untouched so legacy templates keep their original meaning;
    // `distanceM` (metres) is what the builder writes from 2026-07-22. See _cardioDistanceM.
    distance: s.distance || null, distanceM: s.distanceM || null,
    // Cardio shape + targets. isDistanceBased is the one the runner branches on.
    isDistanceBased: !!s.isDistanceBased,
    pace500Min: s.pace500Min || null, pace500Max: s.pace500Max || null,
    paceKmMin: s.paceKmMin || null, paceKmMax: s.paceKmMax || null,
    wattsMin: s.wattsMin || null, wattsMax: s.wattsMax || null,
    hrZoneMin: s.hrZoneMin || null, hrZoneMax: s.hrZoneMax || null,
    restHrMax: s.restHrMax || null,
    strokeRateMin: s.strokeRateMin || null, strokeRateMax: s.strokeRateMax || null,
    // Jump targets.
    targetHeightCm: s.targetHeightCm || null, targetDistanceM: s.targetDistanceM || null
  }))
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
        const isCardio = ex.exercise_type === 'cardio'
        const setsHtml = sets.map((s, si) => {
          let label = `Set ${si + 1}`
          if (s.amrap) label = 'AMRAP'

          let detail = ''
          if (isCardio) {
            // Same field set/formatting as the template card preview (openTemplate) — reused for consistency.
            const paceStr   = (s.pace500Min || s.pace500Max) ? `${s.pace500Min||'?'}–${s.pace500Max||'?'}/500m` : null
            const paceKmStr = (s.paceKmMin  || s.paceKmMax)  ? `${s.paceKmMin||'?'}–${s.paceKmMax||'?'}/km`   : null
            const strokeStr = (s.strokeRateMin || s.strokeRateMax) ? `${s.strokeRateMin||'?'}–${s.strokeRateMax||'?'} spm` : null
            const hrStr     = (s.hrZoneMin || s.hrZoneMax) ? `HR ${s.hrZoneMin||'?'}–${s.hrZoneMax||'?'}` : null
            const restHrStr = s.restHrMax ? `rest HR <${s.restHrMax}` : null
            const durStr    = s.duration ? Math.floor((parseRest(s.duration)||0) / 60) + ':' + String((parseRest(s.duration)||0) % 60).padStart(2, '0') : null
            const distStr   = fmtDistanceM(_cardioDistanceM(s)) || null
            const parts = s.isDistanceBased
              ? [distStr, paceStr || paceKmStr, strokeStr, hrStr, restHrStr]
              : [durStr, paceStr || paceKmStr, strokeStr, hrStr, restHrStr]
            detail = parts.filter(Boolean).join(' · ') || '—'
          } else if (s.timed) {
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
  // "Save to Library" lives on the Programs-builder slot itself now (renderPhaseWeekGrid) — the drawer
  // is no longer opened from a program slot, so it doesn't offer it here.

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

  mountModal(panel)
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
  await renderWorkoutLibrary(el)
}

async function renderWorkoutLibrary(el) {
  const title = currentProfile?.role === 'solo' ? 'Library' : 'Workouts'
  el.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">${title}</h1>
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

// Hero card for the Workouts page (2026-07-08) — same phase/week math the dashboards' own
// "Up next" hero already computes (app-dashboard.js:324-336 client, :652-663 solo), extended one
// step further since we're already ON the Workouts page: also resolves the actual next session's
// templateId (first program_phase_workouts row in the current phase/week, by day_of_week/
// session_order) so the Start button can jump straight into it instead of just linking back here.
// Deliberately a standalone pair of functions, not shared with the dashboards' inline copies —
// avoids touching two already-shipped, already-tested renders for a pure dedup benefit.
// How many weeks of this phase actually EXIST to train, as opposed to how many it declares.
// The accordion header printed phase.duration_weeks (the plan) directly above a body rendered from
// the real program_phase_workouts rows (what's been built) — so a 3-week phase with 2 weeks built
// read "3w" above 2 weeks of content, with nothing explaining the third. On the program BUILDER,
// duration_weeks is the right number to show (it is the intent). On the Workouts page the reader is
// the person about to train, and they need what is really there. Jake, 2026-07-13.
function _builtWeekCount(sessions) {
  return new Set((sessions || []).map(s => s.week_number || 1)).size
}

function _buildWorkoutsHero(clientId, activeAssignment, cpwMap) {
  if (!activeAssignment?.programs) {
    return { title: 'No program assigned', meta: 'Start a freeform session below, or ask your PT to assign a program.', action: `startWorkoutRunner('${clientId}')`, btnLabel: 'Start a session' }
  }
  const prog = activeAssignment.programs
  // start_date is nullable (the assign form doesn't require it) -- treat unset as "just started"
  // (week 1 of phase 1) rather than letting `new Date(null + ...)` produce NaN, which silently
  // fell through to the LAST phase/week instead of the real current one.
  const weeksSinceStart = activeAssignment.start_date
    ? Math.max(0, Math.floor((Date.now() - new Date(activeAssignment.start_date + 'T00:00:00')) / (7 * 24 * 60 * 60 * 1000)))
    : 0
  const phases = [...(prog.program_phases || [])].sort((a, b) => a.order_index - b.order_index)
  let cumWeeks = 0, currentPhase = phases[phases.length - 1] || null, weekInPhase = 1
  for (const p of phases) {
    if (weeksSinceStart < cumWeeks + p.duration_weeks) { currentPhase = p; weekInPhase = weeksSinceStart - cumWeeks + 1; break }
    cumWeeks += p.duration_weeks
  }
  const title = prog.name || 'Your program'
  const meta = currentPhase ? currentPhase.name + ' · Week ' + weekInPhase : (prog.description || '')
  // "Next up": first day/session in the current phase's current week; falls back to the phase's
  // first available week if that exact week has no rows yet (e.g. periodization not generated
  // that far, or a non-periodized phase where everything sits at week_number 1).
  const allRows = [...(currentPhase?.program_phase_workouts || [])].sort((a, b) => a.day_of_week - b.day_of_week || a.session_order - b.session_order)
  const thisWeekRows = allRows.filter(pw => (pw.week_number || 1) === weekInPhase)
  const next = thisWeekRows[0] || allRows[0] || null
  const nextTemplateId = next ? cpwMap[next.id]?.templateId : null
  return {
    title, meta,
    action: nextTemplateId ? `startWorkoutRunner('${clientId}','${nextTemplateId}')` : `startWorkoutRunner('${clientId}')`,
    btnLabel: '▶ Start'
  }
}

function _renderWorkoutsHeroHtml(hero) {
  return `
    <div style="background:var(--accent);border-radius:12px;padding:18px 20px;margin-bottom:16px;color:#fff">
      <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;opacity:.75;margin-bottom:5px">Up next</div>
      <div style="font-size:19px;font-weight:700;margin-bottom:3px">${escapeHtml(hero.title)}</div>
      <div style="font-size:13px;opacity:.8;margin-bottom:14px">${escapeHtml(hero.meta)}</div>
      <button onclick="${hero.action}" style="padding:8px 20px;border-radius:8px;background:rgba(255,255,255,.18);color:#fff;border:1.5px solid rgba(255,255,255,.35);font-size:13px;font-weight:700;cursor:pointer">${hero.btnLabel} →</button>
    </div>`
}

// Switch the visible week within a phase panel on the read Workouts page. Weeks are tabs; each week's
// day list is pre-rendered into a hidden .rw-week panel keyed by phase, so switching is instant (no refetch).
function _selectReadWeek(panelId, week) {
  document.querySelectorAll(`.rw-week[data-panel="${panelId}"]`).forEach(d => {
    d.style.display = Number(d.dataset.week) === week ? 'block' : 'none'
  })
  document.querySelectorAll(`.week-tab[data-panel="${panelId}"]`).forEach(b => {
    b.setAttribute('aria-selected', Number(b.dataset.week) === week)
  })
}

async function renderClientWorkoutsPage(el) {
  // Role-aware, and it MUST be. A master account holds TWO clients rows — a coached one (coach_id set)
  // and a personal/solo one (coach_id NULL). The old query was
  //   .from('clients').eq('user_id', currentUser.id).single()
  // with no discriminator: on two rows PostgREST throws PGRST116, data comes back null, and this page
  // rendered "No client profile found" — the whole Workouts page dead, silently. Even with one row it
  // bound nothing to the active view, so solo could read the coached record's data and vice versa.
  // _getCurrentClientId() is the canonical resolver (app-core.js) and already answers this correctly.
  const clientId = await _getCurrentClientId()
  if (!clientId) { el.innerHTML = '<div class="empty-state"><div class="empty-title">No client profile found</div></div>'; return }

  const [{ data: logs }, { data: cpAssignments }] = await Promise.all([
    db.from('workout_logs').select('id, name, date').eq('client_id', clientId).order('date', { ascending: false }).limit(20),
    db.from('client_programs').select('id, start_date, programs(id, name, program_phases(id, name, order_index, duration_weeks, program_phase_workouts(id, day_of_week, session_order, week_number)))').eq('client_id', clientId).order('created_at', { ascending: false }).limit(1)
  ])

  let cpwMap = {}
  const activeAssignment = cpAssignments?.[0]
  if (activeAssignment) {
    const { data: cpwRows } = await db.from('client_program_workouts')
      .select('program_phase_workout_id, workout_template_id, workout_templates(id, name, description, workout_template_exercises(id, exercise_name, exercise_type, order_index, sets_json, notes))')
      .eq('client_program_id', activeAssignment.id)
    ;(cpwRows || []).forEach(r => { cpwMap[r.program_phase_workout_id] = { templateId: r.workout_template_id, name: r.workout_templates?.name, desc: r.workout_templates?.description, exercises: r.workout_templates?.workout_template_exercises || [] } })
  }
  const hasProgram = activeAssignment && Object.keys(cpwMap).length > 0

  // The flat template list below is only ever rendered as a fallback when there's no active
  // program -- skip this fetch entirely when it won't be used. It matters: it joins nested
  // workout_template_exercises across up to 100 rows against a coach_id account known to carry
  // a large historical orphan-template backlog (~993 rows, tracked in STATUS.md), and was
  // previously always fetched via Promise.all above even when hasProgram made it dead weight.
  // Found 2026-07-10 investigating reported slowness opening the Workouts page on a personal
  // (solo) account, which shares coach_id with the orphan-heavy PT account and almost always
  // has an active program (making this the common, not edge, case for that account).
  let templates = null
  if (!hasProgram) {
    // .limit(100) bounds cost against that same orphan backlog -- not a product ceiling on
    // real template count. .is('generated_from_phase_id', null) excludes periodization-generated
    // week clones (e.g. "Bench Press — W2") -- these have client_id/program_id both null too
    // (same shape as a genuine standalone template), so without this they'd leak into this flat
    // fallback list. Same fix as renderWorkoutTemplates below.
    const coachId = await _effectiveCoachIdForClient(clientId)
    const { data } = await db.from('workout_templates').select('id, name, description, workout_template_exercises(id, exercise_name, exercise_type, order_index, sets_json, notes)').eq('coach_id', coachId).is('client_id', null).is('program_id', null).is('generated_from_phase_id', null).eq('is_personal', currentProfile?.role === 'solo').order('name').limit(100)
    templates = data
  }

  el.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Workouts</h1>
    </div>

    ${hasProgram ? _renderWorkoutsHeroHtml(_buildWorkoutsHero(clientId, activeAssignment, cpwMap)) : ''}

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
                      <span style="font-size:13px;font-weight:500;color:var(--text);margin-left:8px">${escapeHtml(sessionSummary)}</span>
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
                        <div style="display:flex;align-items:center;justify-content:${multi ? 'space-between' : 'flex-end'};margin-bottom:${exs.length ? '8px' : '0'}">
                          ${multi ? `<span style="font-size:13px;font-weight:600">${escapeHtml(name)}</span>` : ''}
                          ${templateId ? `<button class="btn-primary" style="font-size:12px;padding:3px 10px;flex-shrink:0" onclick="startWorkoutRunner('${clientId}','${templateId}')">▶ Start</button>` : `<span style="font-size:12px;color:var(--text-muted)">Not set up</span>`}
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

            return `<div style="margin-bottom:6px;border:1px solid var(--border);border-radius:10px;overflow:hidden">
              <button onclick="toggleClientPhase('${panelId}')" style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:var(--surface-2);border:none;cursor:pointer;text-align:left">
                <div>
                  <span style="font-size:13px;font-weight:700;color:var(--text)">${phase.name}</span>
                  <span style="font-size:11px;color:var(--text-muted);margin-left:8px">${_builtWeekCount(allSessions)}w · ${allSessions.length} session${allSessions.length !== 1 ? 's' : ''}</span>
                </div>
                <svg id="${panelId}-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;color:var(--text-muted);transition:transform .2s;flex-shrink:0;transform:rotate(${pi === 0 ? '180deg' : '0deg'})"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              <div id="${panelId}" style="display:${pi === 0 ? 'block' : 'none'}">
                ${!weekNums.length ? '<div style="padding:10px 14px;font-size:12px;color:var(--text-muted)">No sessions added to this phase yet</div>' :
                  !showWeeks ? renderDays(weekMap[weekNums[0]], panelId) : `
                  <div class="week-tabs" style="padding:12px 12px 0;margin-bottom:2px">${weekNums.map((w, wi) => `<button class="week-tab" data-panel="${panelId}" data-week="${w}" aria-selected="${wi === 0}" onclick="_selectReadWeek('${panelId}',${w})"><span class="wt-n">WEEK</span>${w}</button>`).join('')}</div>
                  ${weekNums.map((w, wi) => `<div class="rw-week" data-panel="${panelId}" data-week="${w}" style="display:${wi === 0 ? 'block' : 'none'}">${renderDays(weekMap[w], `${panelId}-w${w}`)}</div>`).join('')}`}
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
              <div class="row-info" style="flex:1;min-width:0;cursor:pointer" onclick="openSessionDetail('${t.id}','${escapeAttr(t.name)}')">
                <div class="row-name">${escapeHtml(t.name)}</div>
                <div class="row-meta">${exs.length} exercise${exs.length!==1?'s':''} · tap to preview</div>
              </div>
              <button class="btn-primary" style="font-size:13px;padding:6px 14px;flex-shrink:0" onclick="startWorkoutRunner('${clientId}','${t.id}')">▶ Start</button>
            </div>
          </div>`
        }).join('')}</div>`}
      `
    })()}

    ${!(logs?.length) ? `
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:10px">Recent sessions</div>
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <div class="empty-title">No sessions yet</div>
        <div class="empty-text">Complete a workout to see your history here.</div>
      </div>` : `
      <button onclick="toggleClientPhase('client-session-history')" style="width:100%;display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;background:none;border:none;padding:0;cursor:pointer;text-align:left">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted)">Recent sessions</div>
        <div style="display:flex;align-items:center;gap:6px">
          <svg id="client-session-history-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;color:var(--text-muted);transition:transform .2s"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      </button>
      <div id="client-session-history" style="display:none">
        <div class="list" id="client-session-list">
          ${logs.slice(0, 5).map(l => `
            <div class="list-row" style="cursor:pointer" onclick="openWorkoutLog('${l.id}','${clientId}')">
              <div style="width:36px;height:36px;border-radius:8px;background:var(--surface-2);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:16px">✓</div>
              <div class="row-info">
                <div class="row-name">${new Date(l.date + 'T00:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric'})}</div>
              </div>
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
  // .limit(100) bounds cost against the known historical orphan-template backlog on this
  // account (~993 rows, tracked in STATUS.md) -- not a product ceiling on real template count.
  // .is('generated_from_phase_id', null) excludes periodization-generated week clones (e.g.
  // "Bench Press — W2") -- these have client_id/program_id both null too (same shape as a genuine
  // standalone template), so without this filter they leak into the flat coach-facing Templates
  // list. Confirmed root cause 2026-07-08: Jake's own solo-program week-clones were cluttering
  // this list, since solo shares coach_id with the PT account. Matches the filter already used
  // correctly elsewhere (the phase day-slot assign picker, app-programs.js).
  const { data: templates, error } = await db.from('workout_templates').select('*, workout_template_exercises(id)').eq('coach_id', currentUser.id).is('client_id', null).is('program_id', null).is('generated_from_phase_id', null).eq('is_personal', currentProfile?.role === 'solo').order('name').limit(100)

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
        <div class="row-name">${escapeHtml(t.name)}</div>
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
  const { data: exercises, error } = await db.from('exercises').select('*').eq('coach_id', currentUser.id).eq('is_personal', currentProfile?.role === 'solo').order('name')

  if (error) { log.error('renderExerciseLibrary', 'fetch failed', error); el.innerHTML = `<div class="loading-state">${error.message}</div>`; return }

  const active = exercises.filter(e => !e.is_archived)
  const archived = exercises.filter(e => e.is_archived)

  const groupRows = (list) => {
    const groups = {}
    list.forEach(e => {
      const g = e.muscle_group || 'Other'
      if (!groups[g]) groups[g] = []
      groups[g].push(e)
    })
    return Object.entries(groups).sort().map(([group, exs]) => `
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
    `).join('')
  }

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
    ` : groupRows(active)}
    ${archived.length ? `
      <div style="margin-top:8px">
        <button type="button" onclick="_toggleArchivedExerciseLibrary()" style="width:100%;text-align:left;padding:10px 4px;background:none;border:none;color:var(--text-muted);font-size:13px;font-weight:600;cursor:pointer">Archived Exercises (${archived.length}) ▾</button>
        <div id="exl-archived-list" style="display:none">${groupRows(archived)}</div>
      </div>
    ` : ''}
  `
}

function _toggleArchivedExerciseLibrary() {
  const el = document.getElementById('exl-archived-list')
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none'
}

async function toggleExerciseArchived(id, archive) {
  const { error } = await db.from('exercises').update({ is_archived: archive }).eq('id', id)
  if (error) { log.error('toggleExerciseArchived', 'update failed', error); showToast('Could not update — try again.', 'error'); return }
  closeModal('edit-exercise-modal')
  renderExerciseLibrary(document.getElementById('workout-tab-content'))
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
  mountModal(overlay)
  document.getElementById('ae-name').focus()
}

async function saveNewExercise() {
  const name = document.getElementById('ae-name').value.trim()
  const errorEl = document.getElementById('ae-error')
  if (!name) { errorEl.textContent = 'Name is required'; return }

  log.info('saveNewExercise', 'inserting exercise', { name })
  const { error } = await db.from('exercises').insert({
    coach_id:      currentUser.id,
    is_personal:   currentProfile?.role === 'solo',
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
        <button class="btn-secondary" onclick="toggleExerciseArchived('${id}', ${!e.is_archived})">${e.is_archived ? 'Unarchive' : 'Archive'}</button>
        <div style="flex:1"></div>
        <button class="btn-secondary" onclick="closeModal('edit-exercise-modal')">Cancel</button>
        <button class="btn-primary" onclick="saveEditExercise('${id}')">Save</button>
      </div>
    </div>
  `
  mountModal(overlay)
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
  if (!confirm('Delete this exercise? This only works if it has never been used in a template, log, or 1RM entry — use Archive instead for exercises with history.')) return
  log.info('deleteExercise', 'deleting exercise', { id })
  const { error } = await db.from('exercises').delete().eq('id', id)
  if (error) {
    // 23503 = foreign_key_violation — this exercise is still referenced by real history
    if (error.code === '23503') { showToast('This exercise has history attached — archive it instead of deleting.', 'warn', 5000); return }
    log.error('deleteExercise', 'delete failed', error)
    return
  }
  log.ok('deleteExercise', 'exercise deleted', { id })
  closeModal('edit-exercise-modal')
  renderExerciseLibrary(document.getElementById('workout-tab-content'))
}

// ─── TEMPLATE CREATE / DETAIL ─────────────────────────────────────────────────
// `phaseCtx` binds this template to a program day slot. It is OWNED by this function: passing nothing
// clears it. Previously it was a global (`window._phaseWorkoutContext`) set by _createWorkoutFromPicker
// and cleared in exactly ONE place — the success branch of saveNewTemplate — so cancelling the modal
// (or an empty name, or an insert error, or switching view) left it set indefinitely. The next template
// you created ANYWHERE, including a personal one in the Library, was then stamped with that stale
// program_id and bound into that program's day slot. Combined with the unguarded delete fan-out in
// _cleanupPhaseWeeksBeyond, that let a Personal-view action wipe real clients' program weeks.
// The context is now an argument, so every entry point that isn't a phase slot implicitly clears it.
function showCreateTemplateModal(phaseCtx = null) {
  window._phaseWorkoutContext = phaseCtx
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
  mountModal(overlay)
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
    is_personal: currentProfile?.role === 'solo',
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
    let newPwId = null
    if (ctx.phaseId && ctx.dayOfWeek) {
      const weekNumber = ctx.weekNumber || 1
      const { data: existingSlots } = await db.from('program_phase_workouts').select('id').eq('phase_id', ctx.phaseId).eq('week_number', weekNumber).eq('day_of_week', ctx.dayOfWeek)
      const dayLabels = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
      const { data: newPw, error: pwErr } = await db.from('program_phase_workouts').insert({
        phase_id: ctx.phaseId, day_of_week: ctx.dayOfWeek, day_label: dayLabels[ctx.dayOfWeek], template_id: data.id, session_order: (existingSlots?.length || 0) + 1, week_number: weekNumber
      }).select('id').single()
      if (pwErr) { log.error('saveNewTemplate', 'auto-assign to slot failed', pwErr); showToast('Workout created, but could not auto-assign to the slot — add it from the phase page', 'error') }
      else newPwId = newPw.id
    }
    openTemplate(data.id, { backLabel: 'Back to program', backFn: () => openProgram(ctx.programId), programId: ctx.programId, phaseWorkoutId: newPwId })
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
    phaseWorkoutId: ctx.phaseWorkoutId || null,
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
        <h1 class="page-title">${escapeHtml(t.name)}</h1>
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
                  <span style="font-weight:600;font-size:14px">${escapeHtml(ex.exercise_name)}</span>
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
                        ? [fmtDistanceM(_cardioDistanceM(s)) || null, paceStr||paceKmStr, strokeStr, restStr, hrStr, restHrStr]
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
  } else if (ctx.clientId && currentProfile?.role !== 'solo' && currentProfile?.role !== 'client') {
    // Coach-only. openClientProgramsTab -> openClient(), which queries clients scoped by
    // `.eq('coach_id', currentUser.id)`. A SOLO client record has coach_id = NULL, so for a solo user
    // that matched 0 rows, .single() errored, and the raw PostgREST error was painted into
    // #main-content — the Back button landed you on an error page. Same shape as the 298d88d solo
    // runner bug: a shared function special-cased 'client' and let 'solo' fall into a PT-only path.
    openClientProgramsTab(ctx.clientId)
  } else {
    // `'client'` is a sentinel handled by the branch above, never a page — guard against it reaching
    // navigate() (→ "Page not found"). Solo's builder lives on `library`, not `workouts` (that's its
    // read-only accordion); a coach's builder IS `workouts`.
    const fallback = currentProfile?.role === 'solo' ? 'library' : 'workouts'
    navigate(ctx.backTo && ctx.backTo !== 'client' ? ctx.backTo : fallback)
  }
}

async function openClientProgramsTab(clientId) {
  await openClient(clientId)
  const btn = document.querySelector('[onclick*="tab-programs"]')
  if (btn) btn.click()
}

async function moveTemplateExercise(templateId, exId, dir) {
  const { templateId: targetId, exerciseId: targetExId } = await _resolveEditableTemplateId(templateId, exId)
  const { data: all } = await db
    .from('workout_template_exercises')
    .select('id, order_index')
    .eq('template_id', targetId)
    .order('order_index')

  const idx = all.findIndex(e => e.id === targetExId)
  const swapIdx = idx + dir
  if (idx < 0 || swapIdx < 0 || swapIdx >= all.length) return

  await Promise.all([
    db.from('workout_template_exercises').update({ order_index: all[swapIdx].order_index }).eq('id', all[idx].id),
    db.from('workout_template_exercises').update({ order_index: all[idx].order_index }).eq('id', all[swapIdx].id)
  ])
  openTemplate(targetId, window._templateCtx)
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
    // METRES (2026-07-22). `s.distance` (km) is legacy-read-only and deliberately never written here —
    // see _cardioDistanceM. A missing input leaves the existing value alone, per the ?? pattern above.
    s.distanceM    = document.getElementById(`ts-distm-${i}`)?.value    ?? s.distanceM
    s.pace500Min    = document.getElementById(`ts-p500min-${i}`)?.value   ?? s.pace500Min
    s.pace500Max    = document.getElementById(`ts-p500max-${i}`)?.value   ?? s.pace500Max
    s.hrZoneMin     = document.getElementById(`ts-hrzmin-${i}`)?.value    ?? s.hrZoneMin
    s.hrZoneMax     = document.getElementById(`ts-hrzmax-${i}`)?.value    ?? s.hrZoneMax
    s.wattsMin      = document.getElementById(`ts-wattsmin-${i}`)?.value  ?? s.wattsMin
    s.wattsMax      = document.getElementById(`ts-wattsmax-${i}`)?.value  ?? s.wattsMax
    // Legacy-only inputs (rendered solely when the set already carries a value) — the ?? keeps the
    // stored value intact for every set where the input isn't rendered at all.
    s.paceKmMin     = document.getElementById(`ts-pkmmin-${i}`)?.value    ?? s.paceKmMin
    s.paceKmMax     = document.getElementById(`ts-pkmmax-${i}`)?.value    ?? s.paceKmMax
    s.restHrMax     = document.getElementById(`ts-resthr-${i}`)?.value    ?? s.restHrMax
    s.strokeRateMin = document.getElementById(`ts-srmin-${i}`)?.value     ?? s.strokeRateMin
    s.strokeRateMax = document.getElementById(`ts-srmax-${i}`)?.value     ?? s.strokeRateMax
    s.targetHeightCm   = document.getElementById(`ts-jheight-${i}`)?.value ?? s.targetHeightCm
    s.targetDistanceM  = document.getElementById(`ts-jdist-${i}`)?.value   ?? s.targetDistanceM
    s.assistWeight  = document.getElementById(`ts-assist-${i}`)?.value    ?? s.assistWeight
  })
}

function toggleTsSet(i, prop, containerId) {
  flushTemplateSets(containerId)
  window._templateSets[i][prop] = !window._templateSets[i][prop]
  const tid = containerId === 'att-sets-container' ? 'att-type' : 'ett-type'
  renderTemplateSets(containerId, document.getElementById(tid)?.value || 'weight_reps')
}

function setTsEffort(i, type, containerId) {
  flushTemplateSets(containerId)
  window._templateSets[i].effortType = type
  const tid = containerId === 'att-sets-container' ? 'att-type' : 'ett-type'
  renderTemplateSets(containerId, document.getElementById(tid)?.value || 'weight_reps')
}

function renderTemplateSets(containerId, type) {
  const container = document.getElementById(containerId)
  if (!container) return
  // type is a metric_type value (weight_reps/unilateral/timed_hold/cardio/jump_height/jump_distance).
  // Any unrecognised/legacy value (e.g. old 'strength' rows not yet resaved) falls into the
  // weight_reps/unilateral bucket below, matching the picker's own default-selected logic.
  const isCardio = type === 'cardio'
  const isTimedHold = type === 'timed_hold'
  const isJump = type === 'jump_height' || type === 'jump_distance'
  const showSetToggles = type === 'weight_reps' || type === 'unilateral'
  const tid = containerId === 'att-sets-container' ? 'att-type' : 'ett-type'
  const row = (label, right) => `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)"><span style="font-size:13px;font-weight:600;color:var(--text)">${label}</span><div style="display:flex;align-items:center;gap:6px">${right}</div></div>`
  const mini = (id, opts='') => `<input id="${id}" class="field-input" style="width:60px;padding:5px 8px;font-size:13px;text-align:center" ${opts}>`
  const dash = `<span style="color:var(--text-muted);font-size:12px">–</span>`
  // Progressive disclosure for the fields that are genuinely optional. Native <details> so there is no
  // open/closed state to track (a re-render would lose it anyway) and no extra key polluting sets_json.
  // Collapsed inputs are still in the DOM, so flushTemplateSets reads them exactly as before.
  //
  // `open` is passed true whenever a field INSIDE already holds a value. Collapsing a populated field
  // would hide real prescribed data behind a control the coach has no reason to open — the same class
  // of silent loss as dropping an affordance along with the container that hosted it (les-043).
  const more = (label, open, inner) => `<details class="ts-more"${open ? ' open' : ''}><summary>${label}${open ? ' <span style="font-weight:600;color:var(--text-muted)">· in use</span>' : ''}</summary><div style="padding-bottom:4px">${inner}</div></details>`
  container.innerHTML = (window._templateSets || []).map((s, i) => {
    const et = s.effortType || 'rpe'
    const tog = (label, active, onclick) => `<button type="button" onclick="${onclick}" style="padding:4px 10px;font-size:11px;font-weight:700;border-radius:6px;border:1px solid ${active?'var(--accent)':'var(--border)'};background:${active?'var(--accent)':'transparent'};color:${active?'white':'var(--text-muted)'};cursor:pointer">${label}</button>`
    const etbtn = (label, type) => `<button type="button" onclick="setTsEffort(${i},'${type}','${containerId}')" style="padding:4px 10px;font-size:11px;font-weight:700;border:1px solid ${et===type?'var(--accent)':'var(--border)'};background:${et===type?'var(--accent)':'transparent'};color:${et===type?'white':'var(--text-muted)'};cursor:pointer;${type==='rpe'?'border-radius:6px 0 0 6px':'border-radius:0 6px 6px 0;border-left:none'}">${label}</button>`
    return `<div style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:0 14px;margin-bottom:8px">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:12px;font-weight:700;color:var(--text)">Set ${i+1}</span>
          ${i > 0 ? `<button type="button" onclick="copyPrevTemplateSet(${i},'${containerId}','${tid}')" style="font-size:11px;font-weight:700;padding:3px 9px;border-radius:6px;border:none;background:var(--accent);color:#fff;cursor:pointer">Copy set ${i} ↑</button>` : ''}
        </div>
        <div style="display:flex;gap:4px">
          ${showSetToggles ? `
            ${tog('AMRAP', s.amrap, `toggleTsSet(${i},'amrap','${containerId}')`)}
            ${tog('BW', s.bodyweight, `toggleTsSet(${i},'bodyweight','${containerId}')`)}
            ${tog('Assist', s.assisted, `toggleTsSet(${i},'assisted','${containerId}')`)}
          ` : ''}
          <button type="button" onclick="flushTemplateSets('${containerId}');window._templateSets.splice(${i},1);renderTemplateSets('${containerId}',document.getElementById('${tid}')?.value||'weight_reps')" style="width:26px;height:26px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--text-muted);cursor:pointer;font-size:15px;line-height:1">×</button>
        </div>
      </div>
      ${isCardio ? `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
          <span style="font-size:13px;font-weight:600;color:var(--text)">Target</span>
          <div style="display:flex;gap:4px">
            ${tog('Duration', !s.isDistanceBased, `toggleTsSet(${i},'isDistanceBased','${containerId}')`)}
            ${tog('Distance', s.isDistanceBased, `toggleTsSet(${i},'isDistanceBased','${containerId}')`)}
          </div>
        </div>
        ${!s.isDistanceBased ? row('Duration', mini(`ts-duration-${i}`,'type="text" placeholder="0:00" oninput="this.value=fmtRestInput(this.value)" value="'+(s.duration||'0:00')+'"')) : ''}
        ${s.isDistanceBased ? row('Distance (m)', mini(`ts-distm-${i}`, `type="number" step="1" inputmode="numeric" placeholder="—"${_cardioDistanceM(s) ? ` value="${_cardioDistanceM(s)}"` : ''}`)) : ''}
        ${row('Rest', mini(`ts-restmin-${i}`,'type="text" placeholder="0:00" oninput="this.value=fmtRestInput(this.value)" value="'+(s.restMin||'0:00')+'"') + dash + mini(`ts-restmax-${i}`,'type="text" placeholder="0:00" oninput="this.value=fmtRestInput(this.value)" value="'+(s.restMax||'0:00')+'"'))}
        ${more('+ More targets', !!(_hasTimeTarget(s.pace500Min) || _hasTimeTarget(s.pace500Max) || s.wattsMin || s.wattsMax || s.hrZoneMin || s.hrZoneMax || s.restHrMax || s.strokeRateMin || s.strokeRateMax || _hasTimeTarget(s.paceKmMin) || _hasTimeTarget(s.paceKmMax)), `
          ${row('Pace / 500m', mini(`ts-p500min-${i}`, `type="text" placeholder="0:00" oninput="tsPace500Input(${i},'${containerId}')" value="${s.pace500Min||''}"`) + dash + mini(`ts-p500max-${i}`, `type="text" placeholder="0:00" oninput="tsPace500Input(${i},'${containerId}')" value="${s.pace500Max||''}"`))}
          ${row('Pace / 1000m', `<span id="ts-p1000-${i}" style="font-size:13px;font-weight:600;color:var(--accent);min-width:100px;text-align:right">${calcPace1000(s.pace500Min, s.pace500Max)}</span>`)}
          ${row('Watts', mini(`ts-wattsmin-${i}`,'type="number" inputmode="numeric" placeholder="—"'+(s.wattsMin?` value="${s.wattsMin}"`:'')) + dash + mini(`ts-wattsmax-${i}`,'type="number" inputmode="numeric" placeholder="—"'+(s.wattsMax?` value="${s.wattsMax}"`:'')))}
          ${row('HR Zone (BPM)', mini(`ts-hrzmin-${i}`,'type="number" inputmode="numeric" placeholder="—"'+(s.hrZoneMin?` value="${s.hrZoneMin}"`:'')) + dash + mini(`ts-hrzmax-${i}`,'type="number" inputmode="numeric" placeholder="—"'+(s.hrZoneMax?` value="${s.hrZoneMax}"`:'')))}
          ${row('Rest HR max (BPM)', mini(`ts-resthr-${i}`, 'type="number" inputmode="numeric" placeholder="—"'+(s.restHrMax ? ` value="${s.restHrMax}"` : '')))}
          ${/* Pace/km was removed 2026-07-22 as redundant — it duplicated the computed Pace/1000m row
                above, derived from Pace/500m. But simply deleting the input would strand any legacy
                template that already has a value: the runner would keep showing its "x /km" chip with
                no way left to edit or clear it (les-043 — removing a control removes the ability to
                undo what it set). So it renders for legacy sets ONLY, purely as an escape hatch. */''}
          ${(_hasTimeTarget(s.paceKmMin) || _hasTimeTarget(s.paceKmMax)) ? row('Pace / km <span style="font-weight:500;color:var(--text-muted)">(legacy)</span>', mini(`ts-pkmmin-${i}`, `type="text" placeholder="0:00" oninput="this.value=fmtRestInput(this.value)" value="${s.paceKmMin||''}"`) + dash + mini(`ts-pkmmax-${i}`, `type="text" placeholder="0:00" oninput="this.value=fmtRestInput(this.value)" value="${s.paceKmMax||''}"`)) : ''}
          ${row('Stroke rate (spm)', mini(`ts-srmin-${i}`, 'type="number" inputmode="numeric" placeholder="—"'+(s.strokeRateMin?` value="${s.strokeRateMin}"`:'')) + dash + mini(`ts-srmax-${i}`, 'type="number" inputmode="numeric" placeholder="—"'+(s.strokeRateMax?` value="${s.strokeRateMax}"`:'')))}
        `)}
      ` : isTimedHold ? `
        ${row('Duration (mm:ss)', mini(`ts-duration-${i}`, `type="text" placeholder="0:00" oninput="this.value=fmtRestInput(this.value)" value="${s.duration||'0:00'}"`))}
        ${row('Weight (kg)', mini(`ts-weight-${i}`,'type="text" placeholder="—"'+(s.weight?` value="${s.weight}"`:'')))}
        ${row('Rest between sets', mini(`ts-restmin-${i}`,'type="text" placeholder="0:00" oninput="this.value=fmtRestInput(this.value)" value="'+(s.restMin||'0:00')+'"') + dash + mini(`ts-restmax-${i}`,'type="text" placeholder="0:00" oninput="this.value=fmtRestInput(this.value)" value="'+(s.restMax||'0:00')+'"'))}
        ${row(etbtn('RPE','rpe')+etbtn('RIR','rir'), mini(`ts-emin-${i}`,'type="number" step="0.5" min="1" max="10" placeholder="Min"'+(s.effortMin?` value="${s.effortMin}"`:'')) + dash + mini(`ts-emax-${i}`,'type="number" step="0.5" min="1" max="10" placeholder="Max"'+(s.effortMax?` value="${s.effortMax}"`:'')))}
      ` : isJump ? `
        ${type === 'jump_height'
          ? row('Target height (cm)', mini(`ts-jheight-${i}`, 'type="number" step="1" inputmode="numeric" placeholder="—"'+(s.targetHeightCm?` value="${s.targetHeightCm}"`:'')))
          : row('Target distance (m)', mini(`ts-jdist-${i}`, 'type="number" step="0.01" inputmode="decimal" placeholder="—"'+(s.targetDistanceM?` value="${s.targetDistanceM}"`:'')))}
        ${row('Jumps per set', mini(`ts-rmin-${i}`,'type="number" inputmode="numeric" placeholder="—"'+(s.repsMin?` value="${s.repsMin}"`:'')))}
        ${row('Rest between sets', mini(`ts-restmin-${i}`,'type="text" placeholder="0:00" oninput="this.value=fmtRestInput(this.value)" value="'+(s.restMin||'0:00')+'"') + dash + mini(`ts-restmax-${i}`,'type="text" placeholder="0:00" oninput="this.value=fmtRestInput(this.value)" value="'+(s.restMax||'0:00')+'"'))}
        ${row(etbtn('RPE','rpe')+etbtn('RIR','rir'), mini(`ts-emin-${i}`,'type="number" step="0.5" min="1" max="10" placeholder="Min"'+(s.effortMin?` value="${s.effortMin}"`:'')) + dash + mini(`ts-emax-${i}`,'type="number" step="0.5" min="1" max="10" placeholder="Max"'+(s.effortMax?` value="${s.effortMax}"`:'')))}
      ` : `
        ${row('Reps', mini(`ts-rmin-${i}`,'type="number" placeholder="0"'+(s.repsMin?` value="${s.repsMin}"`:'')) + dash + mini(`ts-rmax-${i}`,'type="number" placeholder="0"'+(s.repsMax?` value="${s.repsMax}"`:'')))}
        ${s.bodyweight ? '' : row('Weight (kg)', mini(`ts-weight-${i}`,'type="text" placeholder="—"'+(s.weight?` value="${s.weight}"`:'')))}
        ${s.assisted ? row('Assist weight (kg)', mini(`ts-assist-${i}`,'type="number" placeholder="e.g. 20"'+(s.assistWeight?` value="${s.assistWeight}"`:''))): ''}
        ${row('Rest between sets', mini(`ts-restmin-${i}`,'type="text" placeholder="0:00" oninput="this.value=fmtRestInput(this.value)" value="'+(s.restMin||'0:00')+'"') + dash + mini(`ts-restmax-${i}`,'type="text" placeholder="0:00" oninput="this.value=fmtRestInput(this.value)" value="'+(s.restMax||'0:00')+'"'))}
        ${row(etbtn('RPE','rpe')+etbtn('RIR','rir'), mini(`ts-emin-${i}`,'type="number" step="0.5" min="1" max="10" placeholder="Min"'+(s.effortMin?` value="${s.effortMin}"`:'')) + dash + mini(`ts-emax-${i}`,'type="number" step="0.5" min="1" max="10" placeholder="Max"'+(s.effortMax?` value="${s.effortMax}"`:'')))}
        ${more('+ More targets', !!(s.intensityMin || s.intensityMax || s.tempo || s.countdown), `
          ${row('Intensity (%1RM)', mini(`ts-imin-${i}`,'type="number" placeholder="Min"'+(s.intensityMin?` value="${s.intensityMin}"`:'')) + dash + mini(`ts-imax-${i}`,'type="number" placeholder="Max"'+(s.intensityMax?` value="${s.intensityMax}"`:'')))}
          ${row('Tempo', mini(`ts-tempo-${i}`,'type="text" maxlength="4" placeholder="e.g. 3011"'+(s.tempo?` value="${s.tempo}"`:'')))}
          ${row('Countdown (s)', mini(`ts-cd-${i}`,'type="number" placeholder="—"'+(s.countdown?` value="${s.countdown}"`:'')))}
        `)}
      `}
    </div>`
  }).join('') + `
  <button type="button" onclick="flushTemplateSets('${containerId}');window._templateSets.push({effortType:'rpe'});renderTemplateSets('${containerId}',document.getElementById('${tid}')?.value||'weight_reps')" style="margin-top:6px;font-size:13px;color:var(--accent);background:none;border:none;cursor:pointer;font-weight:600">+ Add set</button>`
}

function copyPrevTemplateSet(i, containerId, tid) {
  flushTemplateSets(containerId)
  const sets = window._templateSets || []
  if (i < 1 || i >= sets.length) return
  const prev = { ...sets[i - 1] }
  sets[i] = prev
  renderTemplateSets(containerId, document.getElementById(tid)?.value || 'weight_reps')
}

// runnerCtx = { mode: 'add'|'swap' } — set when opened from the workout runner's
// Swap/Add exercise buttons. Same modal, same set-target builder, either mode: the runner
// context saves session-only into _runner.exercises (via _confirmRunnerExerciseFromModal
// in app-runner.js) instead of writing a workout_template_exercises row — matches the
// existing session-only swap/add behaviour, just via the identical picking UI Jake builds
// workouts with, per his 2026-07-03 instruction that both buttons must open "the same modal".
let _addExerciseModalPending = false

// Guards against the picker's own fetch-latency race: showExercisePicker fires this
// on tap, but the overlay isn't appended until the Promise.all below resolves — a fast
// Swap-then-Add (or same-button double-tap) in that gap used to spawn two overlays
// sharing the hardcoded id 'add-to-template-modal', and getElementById/closeModal only
// ever operate on the first one, permanently freezing the second (visible) modal.
async function showAddExerciseToTemplateModal(templateId, runnerCtx = null) {
  if (_addExerciseModalPending || document.getElementById('add-to-template-modal') || document.getElementById('exercise-picker-modal')) return
  _addExerciseModalPending = true
  const isRunner = !!runnerCtx
  if (isRunner) _setExercisePickerButtonsDisabled(true)

  let coachId, targetId
  try {
    if (isRunner) {
      const { data: clientRecord } = await db.from('clients').select('coach_id').eq('id', _runner.clientId).single()
      coachId = clientRecord?.coach_id || currentUser.id
      targetId = templateId
    } else {
      const resolved = await _resolveEditableTemplateId(templateId)
      targetId = resolved.templateId
      const { data: tmplRow } = await db.from('workout_templates').select('coach_id').eq('id', targetId).single()
      coachId = tmplRow?.coach_id || currentUser.id
    }
  } catch (err) {
    _addExerciseModalPending = false
    if (isRunner) _setExercisePickerButtonsDisabled(false)
    log.error('showAddExerciseToTemplateModal', 'failed to resolve coach', err)
    showToast('Could not open exercise picker — try again.', 'error', 3000)
    return
  }
  _addExerciseModalPending = false
  if (isRunner) _setExercisePickerButtonsDisabled(false)
  _openExercisePicker(coachId, picked => {
    _showExerciseSetsModal({ targetId, runnerCtx, coachId, picked, existingType: picked.metric_type || 'weight_reps' })
  })
}

// Step 2 of add/swap/edit — sets/reps/notes screen, shown once an exercise has been picked.
// Shared by the workout builder (add + edit) and the runner swap/add modal.
function _showExerciseSetsModal({ targetId, runnerCtx, coachId, picked, editingTexId = null, existingSets = null, existingType = 'weight_reps', existingNotes = '', existingSuperset = '' }) {
  const isRunner = !!runnerCtx
  const title = editingTexId ? `Edit: ${picked.name}` : (isRunner ? (runnerCtx.mode === 'swap' ? 'Swap exercise' : 'Add exercise') : 'Add exercise')
  const confirmLabel = editingTexId ? 'Save' : (isRunner ? (runnerCtx.mode === 'swap' ? 'Swap' : 'Add') : 'Add exercise')
  const modalId = editingTexId ? 'edit-tex-modal' : 'add-to-template-modal'
  const confirmAction = editingTexId
    ? `saveEditTemplateExercise('${editingTexId}','${targetId}')`
    : (isRunner ? `_confirmRunnerExerciseFromModal('${runnerCtx.mode}')` : `saveExerciseToTemplate('${targetId}')`)

  window._exerciseDetailPicked = picked
  window._exerciseDetailReopenCtx = { targetId, runnerCtx, editingTexId, coachId }

  document.getElementById(modalId)?.remove()
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.id = modalId
  // .modal-overlay is z-index:200 in main.css — the runner is a fullscreen z-index:300
  // layer, so opened from the runner this needs to sit above it (matches session-detail-panel, 1000).
  if (isRunner) overlay.style.zIndex = '1000'
  overlay.innerHTML = `
    <div class="modal" style="max-width:560px;max-height:90vh;overflow-y:auto">
      <div class="modal-header">
        <h2 class="modal-title">${title}</h2>
        <button class="modal-close" onclick="closeModal('${modalId}')">✕</button>
      </div>
      <div class="field">
        <label class="field-label">Exercise</label>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface-2)">
          <span id="att-name-display" style="font-size:15px;font-weight:700">${escapeHtml(picked.name)}</span>
          <button type="button" class="btn-secondary" style="font-size:12px;padding:5px 12px;flex-shrink:0" onclick="_reopenExercisePickerFromDetail()">Change</button>
        </div>
      </div>
      <div class="field">
        <label class="field-label">Type</label>
        <select class="field-input" id="att-type" onchange="flushTemplateSets('att-sets-container');renderTemplateSets('att-sets-container',this.value)">
          <option value="weight_reps"   ${existingType === 'weight_reps'   || (existingType !== 'cardio' && existingType !== 'unilateral' && existingType !== 'timed_hold' && existingType !== 'jump_height' && existingType !== 'jump_distance') ? 'selected' : ''}>Weight &amp; reps</option>
          <option value="unilateral"    ${existingType === 'unilateral'    ? 'selected' : ''}>Unilateral (per side)</option>
          <option value="timed_hold"    ${existingType === 'timed_hold'    ? 'selected' : ''}>Timed hold</option>
          <option value="cardio"        ${existingType === 'cardio'        ? 'selected' : ''}>Cardio</option>
          <option value="jump_height"   ${existingType === 'jump_height'   ? 'selected' : ''}>Jump height</option>
          <option value="jump_distance" ${existingType === 'jump_distance' ? 'selected' : ''}>Jump distance</option>
        </select>
      </div>

      <div style="margin:16px 0 10px;font-size:13px;font-weight:600;color:var(--text)">Set targets</div>
      <div id="att-sets-container"></div>

      <div class="field" style="margin-top:14px">
        <label class="field-label">Notes / coaching cues</label>
        <textarea class="field-input" id="att-notes" placeholder="e.g. Pause 1s at bottom, 3s eccentric" rows="2" style="resize:vertical">${escapeHtml(existingNotes || '')}</textarea>
      </div>
      <div class="field">
        <label class="field-label">Superset group <span style="font-weight:400;color:var(--text-muted)">(optional — enter same letter, e.g. A, to link exercises)</span></label>
        <input class="field-input" id="att-superset" placeholder="e.g. A" maxlength="3" style="width:80px" value="${escapeHtml(existingSuperset || '')}">
      </div>
      <p class="modal-error" id="att-error"></p>
      <div class="modal-footer">
        ${editingTexId ? `<button class="btn-danger" onclick="deleteTemplateExercise('${editingTexId}','${targetId}')">Remove</button><div style="flex:1"></div>` : ''}
        <button class="btn-secondary" onclick="closeModal('${modalId}')">Cancel</button>
        <button class="btn-primary" id="att-confirm-btn" onclick="${confirmAction}">${confirmLabel}</button>
      </div>
    </div>
  `
  mountModal(overlay)
  window._templateSets = existingSets && existingSets.length ? existingSets.map(s => ({...s})) : [{ effortType: 'rpe' }]
  renderTemplateSets('att-sets-container', existingType)
}

// "Change" link on the sets/reps screen — reopens the picker without losing whatever the user
// has already entered for sets/type/notes/superset.
function _reopenExercisePickerFromDetail() {
  const ctx = window._exerciseDetailReopenCtx
  if (!ctx) return
  const modalId = ctx.editingTexId ? 'edit-tex-modal' : 'add-to-template-modal'
  flushTemplateSets('att-sets-container')
  const currentType = document.getElementById('att-type')?.value || 'weight_reps'
  const currentNotes = document.getElementById('att-notes')?.value || ''
  const currentSuperset = document.getElementById('att-superset')?.value || ''
  const currentSets = window._templateSets
  document.getElementById(modalId)?.remove()
  _openExercisePicker(ctx.coachId, picked => {
    _showExerciseSetsModal({
      targetId: ctx.targetId, runnerCtx: ctx.runnerCtx, coachId: ctx.coachId, picked,
      editingTexId: ctx.editingTexId, existingSets: currentSets, existingType: currentType,
      existingNotes: currentNotes, existingSuperset: currentSuperset
    })
  })
}

function _setExercisePickerButtonsDisabled(disabled) {
  ['wr-swap-btn', 'wr-add-btn'].forEach(id => {
    const btn = document.getElementById(id)
    if (!btn) return
    btn.disabled = disabled
    btn.style.opacity = disabled ? '0.4' : '1'
    btn.style.pointerEvents = disabled ? 'none' : ''
  })
}

// Resolves the effective coach_id for a client row — for a normal client this is coach_id
// directly; for a solo/personal client record coach_id is null by design (severed from any
// PT), so the owning "coach" is the same person's own account (clients.user_id).
async function _effectiveCoachIdForClient(clientId) {
  const { data: clientRow } = await db.from('clients').select('coach_id, user_id').eq('id', clientId).single()
  return clientRow?.coach_id || clientRow?.user_id || currentUser.id
}

// Silent resolve-or-create — kept only for the Big 5 quick-start 1RM form, which has no free
// text entry at all (fixed labelled inputs), so there's nothing for a user to explicitly pick.
// Every other exercise-identity entry point goes through the explicit picker below instead.
async function _resolveExerciseIdForSave(name, coachId) {
  const trimmed = (name || '').trim()
  if (!trimmed || !coachId) return null
  const isPersonal = currentProfile?.role === 'solo'
  const { data: existing } = await db.from('exercises').select('id').eq('coach_id', coachId).eq('is_personal', isPersonal).ilike('name', trimmed).maybeSingle()
  if (existing) return existing.id
  const { data: created, error } = await db.from('exercises').insert({ coach_id: coachId, is_personal: isPersonal, name: trimmed }).select('id').single()
  if (error) { log.error('_resolveExerciseIdForSave', 'auto-create failed', error); return null }
  return created.id
}

// ─── Exercise picker (shared: workout builder, runner swap/add, 1RM entry) ──
// Search-as-you-type over the coach's exercise library, with an explicit "create new" action
// and a collapsible archived section — replaces the old dropdown+free-text combo everywhere.

let _exercisePickerState = null

async function _openExercisePicker(coachId, onPick) {
  if (document.getElementById('exercise-picker-modal')) return
  _exercisePickerState = { coachId, onPick, allExercises: [] }
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.id = 'exercise-picker-modal'
  overlay.style.zIndex = '1001' // above the runner (300) and the sets/reps detail modal (1000)
  overlay.innerHTML = `
    <div class="modal" id="exp-modal-box" style="max-width:480px;height:70vh;max-height:85vh;display:flex;flex-direction:column">
      <div class="modal-header">
        <h2 class="modal-title">Exercises</h2>
        <button class="modal-close" onclick="_closeExercisePicker()">✕</button>
      </div>
      <input class="field-input" id="exp-search" placeholder="Find or create exercise with name…" style="margin-bottom:14px" autocomplete="off" oninput="_renderExercisePickerResults(this.value)">
      <div id="exp-results" style="overflow-y:auto;flex:1"><div class="loading-state">Loading…</div></div>
    </div>
  `
  mountModal(overlay)
  document.getElementById('exp-search').focus()
  // vh units are sized against the layout viewport, which most mobile browsers do NOT shrink
  // when the on-screen keyboard opens — so a plain height:70vh box can end up partly hidden
  // behind the keyboard instead of resizing to fit above it. window.visualViewport DOES track
  // the actual visible area, so sync to that when available (falls back to the vh sizing above
  // on browsers without VisualViewport support).
  if (window.visualViewport) {
    _syncExercisePickerHeight()
    window.visualViewport.addEventListener('resize', _syncExercisePickerHeight)
  }
  const { data } = await db.from('exercises').select('id, name, muscle_group, is_archived, metric_type').eq('coach_id', coachId).eq('is_personal', currentProfile?.role === 'solo').order('name')
  if (!_exercisePickerState) return // closed before the fetch resolved
  _exercisePickerState.allExercises = data || []
  // Re-render using whatever is CURRENTLY typed, not '' — the user may have already started
  // typing while this fetch was in flight, and blindly re-rendering with an empty query would
  // wipe their input's visible results out from under them.
  _renderExercisePickerResults(document.getElementById('exp-search')?.value || '')
}

function _renderExercisePickerResults(query) {
  const resultsEl = document.getElementById('exp-results')
  if (!resultsEl || !_exercisePickerState) return
  const q = query.trim().toLowerCase()
  const all = _exercisePickerState.allExercises || []
  const filterList = list => q ? list.filter(e => e.name.toLowerCase().includes(q)) : list
  const activeMatches = filterList(all.filter(e => !e.is_archived))
  const archivedMatches = filterList(all.filter(e => e.is_archived))
  // JS-string-escape the RAW name for the onclick argument — escapeHtml() converts ' to &#39;
  // first, which the browser then decodes back to a raw ' inside the attribute, breaking the
  // inline handler for any name with an apostrophe (e.g. "Farmer's Carry"). Keep escapeHtml()
  // only for the separately-rendered visible text.
  const jsArg = escapeAttr   // was a local JS-escape that left `"` live — a " closes the HTML attribute
  const rowHtml = e => `<div onclick="_pickExercise('${e.id}','${jsArg(e.name)}','${e.metric_type || 'weight_reps'}')" style="padding:12px 4px;border-bottom:1px solid var(--border);cursor:pointer;font-size:14px">${escapeHtml(e.name)}${e.muscle_group ? `<span style="color:var(--text-muted);font-size:12px"> · ${escapeHtml(e.muscle_group)}</span>` : ''}</div>`
  const createRow = query.trim() ? `<div onclick="_createExerciseFromPicker('${jsArg(query.trim())}')" style="padding:12px;border:1.5px dashed var(--accent);border-radius:10px;background:rgba(99,102,241,.06);color:var(--accent);font-weight:600;font-size:14px;cursor:pointer;margin-bottom:12px">+ Create new exercise: "${escapeHtml(query.trim())}"</div>` : ''
  resultsEl.innerHTML = `
    ${createRow}
    ${activeMatches.length ? activeMatches.map(rowHtml).join('') : (!q ? '<div class="empty-state" style="padding:20px 0"><div class="empty-text">No exercises yet — search above to create your first one.</div></div>' : '')}
    ${archivedMatches.length ? `
    <div style="margin-top:10px">
      <button type="button" onclick="_toggleArchivedExercisePicks()" style="width:100%;text-align:left;padding:8px 4px;background:none;border:none;color:var(--text-muted);font-size:12px;font-weight:600;cursor:pointer">Archived Exercises (${archivedMatches.length}) ▾</button>
      <div id="exp-archived-list" style="display:none">${archivedMatches.map(rowHtml).join('')}</div>
    </div>` : ''}
  `
}

function _toggleArchivedExercisePicks() {
  const el = document.getElementById('exp-archived-list')
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none'
}

function _pickExercise(id, name, metricType) {
  const cb = _exercisePickerState?.onPick
  _closeExercisePicker()
  if (cb) cb({ id, name, metric_type: metricType || 'weight_reps' })
}

let _createExerciseFromPickerPending = false

async function _createExerciseFromPicker(name) {
  // Guards against a fast double-tap firing two concurrent inserts before either resolves —
  // same failure class as the exercise-picker-modal race fixed 2026-07-04 (les-013/pth pattern).
  if (_createExerciseFromPickerPending) return
  _createExerciseFromPickerPending = true
  const coachId = _exercisePickerState?.coachId
  const trimmed = (name || '').trim()
  if (!trimmed || !coachId) { _createExerciseFromPickerPending = false; return }
  const { data: created, error } = await db.from('exercises').insert({ coach_id: coachId, is_personal: currentProfile?.role === 'solo', name: trimmed }).select('id, name').single()
  _createExerciseFromPickerPending = false
  if (error) { log.error('_createExerciseFromPicker', 'insert failed', error); showToast('Could not create exercise — try again.', 'error'); return }
  _pickExercise(created.id, created.name)
}

function _syncExercisePickerHeight() {
  const box = document.getElementById('exp-modal-box')
  if (!box || !window.visualViewport) return
  const vh = window.visualViewport.height
  box.style.height = Math.round(vh * 0.7) + 'px'
  box.style.maxHeight = Math.round(vh * 0.85) + 'px'
}

function _closeExercisePicker() {
  document.getElementById('exercise-picker-modal')?.remove()
  _exercisePickerState = null
  if (window.visualViewport) window.visualViewport.removeEventListener('resize', _syncExercisePickerHeight)
}

// metric_type is the single source of truth chosen in the builder. Derive the legacy exercise_type and
// the per-set unilateral/timed flags from it so the current runner (which still reads sets_json flags)
// keeps working until sub-project ②c switches it to read metric_type directly.
function _deriveFromMetricType(metricType) {
  return {
    exercise_type: metricType === 'cardio' ? 'cardio' : 'strength',
    unilateral: metricType === 'unilateral',
    timed: metricType === 'timed_hold'
  }
}

// Fire-and-forget: remember the chosen metric_type on the library exercise so the picker defaults to it
// next time. A convenience default, not correctness-critical — never block the modal close on it.
function _rememberExerciseMetricType(libId, metricType) {
  if (!libId) return
  db.from('exercises').update({ metric_type: metricType }).eq('id', libId)
    .then(({ error }) => { if (error) log.error('_rememberExerciseMetricType', 'update failed', error) })
}

async function saveExerciseToTemplate(templateId) {
  flushTemplateSets('att-sets-container')
  const picked = window._exerciseDetailPicked
  const errorEl = document.getElementById('att-error')
  if (!picked?.name) { errorEl.textContent = 'Exercise name is required'; return }
  const name = picked.name
  const exerciseId = picked.id || null
  const metricType = document.getElementById('att-type').value || 'weight_reps'
  const derived = _deriveFromMetricType(metricType)
  const { templateId: targetId } = await _resolveEditableTemplateId(templateId)
  log.info('saveExerciseToTemplate', 'adding exercise to template', { templateId: targetId, name })

  const { data: existing } = await db
    .from('workout_template_exercises')
    .select('order_index')
    .eq('template_id', targetId)
    .order('order_index', { ascending: false })
    .limit(1)

  const nextOrder = existing?.length ? (existing[0].order_index + 1) : 0
  const sets = window._templateSets || []

  const cleanSets = _cleanTemplateSets(sets, derived)
  const { error } = await db.from('workout_template_exercises').insert({
    template_id:   targetId,
    exercise_id:   exerciseId || null,
    exercise_name: name,
    exercise_type: derived.exercise_type,
    metric_type:   metricType,
    order_index:   nextOrder,
    sets:           cleanSets.length || null,
    sets_json:      cleanSets.length ? cleanSets : null,
    notes:          document.getElementById('att-notes').value.trim() || null,
    superset_group: document.getElementById('att-superset')?.value.trim().toUpperCase() || null
  })

  if (error) { log.error('saveExerciseToTemplate', 'insert failed', error); errorEl.textContent = error.message; return }
  log.ok('saveExerciseToTemplate', 'exercise added to template', { templateId: targetId, name })
  _rememberExerciseMetricType(exerciseId, metricType)
  closeModal('add-to-template-modal')
  window._lastExerciseChange = { op: 'add', matchName: name, row: {
    exercise_id: exerciseId || null, exercise_name: name,
    exercise_type: derived.exercise_type, metric_type: metricType,
    sets: cleanSets.length || null, sets_json: cleanSets.length ? cleanSets : null,
    notes: document.getElementById('att-notes').value.trim() || null,
    superset_group: document.getElementById('att-superset')?.value.trim().toUpperCase() || null
  } }
  _checkClientPlanPropagation(targetId)
}

async function showEditTemplateExerciseModal(templateExId, templateId) {
  const { data: ex } = await db.from('workout_template_exercises').select('*').eq('id', templateExId).single()
  const { data: tmplRow } = await db.from('workout_templates').select('coach_id').eq('id', templateId).single()
  const coachId = tmplRow?.coach_id || currentUser.id
  _showExerciseSetsModal({
    targetId: templateId, runnerCtx: null, coachId,
    picked: { id: ex.exercise_id || null, name: ex.exercise_name },
    editingTexId: templateExId,
    existingSets: ex.sets_json?.length ? ex.sets_json : (ex.sets ? Array.from({ length: ex.sets }, () => ({})) : [{}]),
    existingType: ex.metric_type || (ex.exercise_type === 'cardio' ? 'cardio' : 'weight_reps'),
    existingNotes: ex.notes || '',
    existingSuperset: ex.superset_group || ''
  })
}

async function saveEditTemplateExercise(texId, templateId) {
  flushTemplateSets('att-sets-container')
  const errorEl = document.getElementById('att-error')
  const picked = window._exerciseDetailPicked
  if (!picked?.name) { errorEl.textContent = 'Name is required'; return }
  const sets = window._templateSets || []

  const metricType = document.getElementById('att-type').value || 'weight_reps'
  const derived = _deriveFromMetricType(metricType)
  // metric_type is the single source of truth; keep each set's legacy flags in sync with it.
  sets.forEach(s => { s.unilateral = derived.unilateral; s.timed = derived.timed })
  const { templateId: targetId, exerciseId: targetExId } = await _resolveEditableTemplateId(templateId, texId)
  // Capture the ORIGINAL name before the update — propagation matches the changed exercise by name
  // across other sessions (Jake's choice, 2026-07-12), and a rename must still find the old row.
  const { data: origRow } = await db.from('workout_template_exercises').select('exercise_name').eq('id', targetExId).single()
  const newRow = {
    exercise_id:    picked.id || null,
    exercise_name: picked.name,
    exercise_type: derived.exercise_type,
    metric_type:   metricType,
    sets:           sets.length || null,
    sets_json:      sets.length ? sets : null,
    notes:          document.getElementById('att-notes').value.trim() || null,
    superset_group: document.getElementById('att-superset')?.value.trim().toUpperCase() || null
  }
  log.info('saveEditTemplateExercise', 'updating template exercise', { texId: targetExId, name: picked.name })
  const { error } = await db.from('workout_template_exercises').update(newRow).eq('id', targetExId)
  if (error) { log.error('saveEditTemplateExercise', 'update failed', error); errorEl.textContent = error.message; return }
  log.ok('saveEditTemplateExercise', 'template exercise updated', { texId: targetExId })
  _rememberExerciseMetricType(picked.id || null, metricType)
  closeModal('edit-tex-modal')
  window._lastExerciseChange = { op: 'update', matchName: origRow?.exercise_name || picked.name, row: newRow }
  _checkClientPlanPropagation(targetId)
}

async function deleteTemplateExercise(texId, templateId) {
  const { templateId: targetId, exerciseId: targetExId } = await _resolveEditableTemplateId(templateId, texId)
  // Capture the name before deleting so the change can propagate by name to other sessions.
  const { data: delRow } = await db.from('workout_template_exercises').select('exercise_name').eq('id', targetExId).single()
  log.info('deleteTemplateExercise', 'removing exercise from template', { texId: targetExId, templateId: targetId })
  const { error } = await db.from('workout_template_exercises').delete().eq('id', targetExId)
  if (error) { log.error('deleteTemplateExercise', 'delete failed', error); return }
  log.ok('deleteTemplateExercise', 'exercise removed', { texId: targetExId })
  closeModal('edit-tex-modal')
  // If the pre-delete name fetch failed, DON'T propagate: a stale window._lastExerciseChange from a
  // previous edit would otherwise be replayed and silently applied to assigned copies. Clear it and
  // just reopen.
  if (!delRow?.exercise_name) { window._lastExerciseChange = null; return openTemplate(targetId, window._templateCtx) }
  window._lastExerciseChange = { op: 'delete', matchName: delRow.exercise_name, row: null }
  _checkClientPlanPropagation(targetId)
}

// Applies ONE captured exercise change (window._lastExerciseChange) to a set of target templates,
// matched BY EXERCISE NAME (Jake's choice, 2026-07-12). This replaces the old wholesale
// "delete every exercise, re-insert the source's full list" propagation, which silently wiped any
// per-session differences in the targets. A target that doesn't contain the changed exercise is
// left untouched.
//   update: find the exercise by its ORIGINAL name in the target, overwrite its fields (a rename
//           is fine — change.row carries the new name).
//   delete: remove that exercise from the target.
//   add:    append it to the target only if the target doesn't already have an exercise by that name.
async function _propagateExerciseChangeToTemplates(change, targetIds) {
  if (!change || !targetIds?.length) return
  for (const tid of targetIds) {
    if (change.op === 'delete') {
      await db.from('workout_template_exercises').delete().eq('template_id', tid).eq('exercise_name', change.matchName)
    } else if (change.op === 'update') {
      // Update every row in the target that matches the name (0 rows = a safe no-op when the target
      // doesn't have that exercise). Acts on ALL same-named rows, matching the delete branch — so a
      // session that happens to list an exercise name twice is treated consistently, never left
      // half-updated. A rename is fine: change.row carries the new name.
      await db.from('workout_template_exercises').update(change.row).eq('template_id', tid).eq('exercise_name', change.matchName)
    } else if (change.op === 'add') {
      const { data: exists } = await db.from('workout_template_exercises').select('id').eq('template_id', tid).eq('exercise_name', change.row.exercise_name).limit(1)
      if (!exists?.length) {
        const { data: last } = await db.from('workout_template_exercises').select('order_index').eq('template_id', tid).order('order_index', { ascending: false }).limit(1)
        await db.from('workout_template_exercises').insert({ template_id: tid, order_index: last?.length ? last[0].order_index + 1 : 0, ...change.row })
      }
    }
  }
}

// For a set of MASTER program templates, finds every already-assigned client copy of those sessions
// (client_program_workouts → the cloned client-owned template), split into the current user's OWN
// solo/personal copies vs. real coached clients' copies. Used to keep assigned plans in sync with a
// program edit WITHOUT re-assigning (Jake, 2026-07-12). Queries clients directly rather than via a
// deep nested embed, so an unreadable embed level can't silently misclassify a copy.
async function _assignedCopiesForSession(masterTemplateIds) {
  const out = { soloSelfIds: [], realClientIds: [], realClientNames: [], realClientCount: 0 }
  if (!masterTemplateIds?.length) return out
  const { data: ppws } = await db.from('program_phase_workouts').select('id').in('template_id', masterTemplateIds)
  const ppwIds = (ppws || []).map(r => r.id)
  if (!ppwIds.length) return out
  // Two flat queries, NOT a nested embed. The comment above claimed this already — it didn't: the old
  // code embedded `client_programs(client_id)`, and if PostgREST NULLed that level (an RLS gap) every
  // row was dropped by the `&& cid` filter, realClientCount came back 0, and the caller concluded
  // NOBODY has this workout assigned. In the one function whose entire job is deciding who a write
  // fans out to, that fails SILENT and in the dangerous direction: the "Update assigned clients?"
  // confirm never appears. A flat join can't be silently nulled — a missing row is a missing row.
  const { data: cpws } = await db.from('client_program_workouts')
    .select('workout_template_id, client_program_id').in('program_phase_workout_id', ppwIds)
  const cpIds = [...new Set((cpws || []).map(r => r.client_program_id).filter(Boolean))]
  if (!cpIds.length) return out
  const { data: assignments } = await db.from('client_programs').select('id, client_id').in('id', cpIds)
  const clientByCp = Object.fromEntries((assignments || []).map(a => [a.id, a.client_id]))

  const idsByClient = {}
  ;(cpws || []).forEach(r => {
    const cid = clientByCp[r.client_program_id]
    if (r.workout_template_id && cid) (idsByClient[cid] = idsByClient[cid] || []).push(r.workout_template_id)
  })
  const clientIds = Object.keys(idsByClient)
  if (!clientIds.length) return out
  // Ownership anchor — this resolves ids into rendered client NAMES, and its sibling
  // _blockingClientNames anchors for exactly that reason.
  //
  // It must be an .or(), NOT a bare .eq('coach_id', currentUser.id). A SOLO client record has
  // coach_id = NULL, so a plain coach_id anchor silently EXCLUDES the user's own solo record —
  // soloSelfIds comes back empty and solo's own program copies quietly stop syncing, which is the very
  // feature this function exists to drive. (I introduced exactly that regression writing this fix; the
  // pre-push review caught it. Solo's NULL coach_id defeats a coach_id filter every single time — it is
  // the most reliable way to break solo in this codebase.)
  const { data: clients } = await db.from('clients').select('id, user_id, coach_id, full_name')
    .in('id', clientIds)
    .or(`coach_id.eq.${currentUser.id},user_id.eq.${currentUser.id}`)
  const names = new Set()
  // The Personal view must never reach a real client — not to write to their plan, and not even to
  // read their name. Solo and PT share one auth.uid(), so a program built in Personal view is
  // indistinguishable from a coaching program at the DB level (programs.is_personal fixes that going
  // forward, but every PRE-EXISTING program defaults to false, so this guard cannot depend on it).
  // Real-client copies are surfaced as a bare COUNT in solo — enough to warn honestly, with no write
  // target and no name disclosure. Jake, 2026-07-13.
  const isSolo = currentProfile?.role === 'solo'
  ;(clients || []).forEach(cl => {
    const ids = idsByClient[cl.id] || []
    const isSoloSelf = cl.coach_id == null && cl.user_id === currentUser.id
    if (isSoloSelf) { out.soloSelfIds.push(...ids); return }
    out.realClientCount++
    if (isSolo) return
    out.realClientIds.push(...ids)
    if (cl.full_name) names.add(cl.full_name)
  })
  out.realClientNames = [...names]
  return out
}

// Orchestrates what happens after a program/plan workout is edited (add/edit/delete of an exercise).
// (#2) First keep already-assigned copies of THIS session in sync so the edit shows on the calendar
//      without re-assigning: the user's own solo copies update silently; real clients' copies update
//      only after a confirm. (#3) Then offer to apply the same change to other same-named sessions.
async function _checkClientPlanPropagation(templateId) {
  const ctx = window._templateCtx
  const change = window._lastExerciseChange

  // (#2) Sync assigned copies of the edited session — master program edits only (a direct client-plan
  // edit is already editing the client's own copy, so there's nothing downstream to sync).
  if (change && ctx?.programId && !ctx.isClientPlan) {
    const copies = await _assignedCopiesForSession([templateId])
    if (copies.soloSelfIds.length) await _propagateExerciseChangeToTemplates(change, copies.soloSelfIds)
    // In Personal view, real clients are never a write target (_assignedCopiesForSession leaves
    // realClientIds empty). Say so rather than saying nothing: silently skipping the sync would let
    // the user assume their clients' plans had been updated, which is worse than the bug this fixes.
    if (currentProfile?.role === 'solo' && copies.realClientCount) {
      showToast(`Personal edit — ${copies.realClientCount} assigned client${copies.realClientCount === 1 ? "'s plan was" : "s' plans were"} not changed. Switch to PT view to update them.`, 'info', 6000)
    }
    if (copies.realClientIds.length) {
      window._pendingClientCopyProp = { change, ids: copies.realClientIds }
      _showClientCopyPropagateModal(copies.realClientNames, templateId)
      return
    }
  }

  return _checkSiblingPropagation(templateId)
}

// (#2) prompt shown when real clients have the edited session assigned.
function _showClientCopyPropagateModal(clientNames, templateId) {
  const names = clientNames.length <= 3 ? clientNames.join(', ') : `${clientNames.slice(0, 3).join(', ')} +${clientNames.length - 3} more`
  const n = clientNames.length
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.id = 'client-copy-modal'
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2 class="modal-title">Update assigned clients?</h2>
        <button class="modal-close" onclick="_continueAfterClientCopy('${templateId}',false)">✕</button>
      </div>
      <p style="font-size:14px;line-height:1.6;margin:0 0 20px"><strong>${n}</strong> client${n === 1 ? ' has' : 's have'} this workout assigned (${escapeHtml(names)}). Apply your change to their copies too?</p>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="_continueAfterClientCopy('${templateId}',false)">Not now</button>
        <button class="btn-primary" onclick="_continueAfterClientCopy('${templateId}',true)">Update their copies</button>
      </div>
    </div>
  `
  mountModal(overlay)
}

async function _continueAfterClientCopy(templateId, doIt) {
  closeModal('client-copy-modal')
  const p = window._pendingClientCopyProp
  if (doIt && p) await _propagateExerciseChangeToTemplates(p.change, p.ids)
  window._pendingClientCopyProp = null
  _checkSiblingPropagation(templateId)
}

// (#3) offer to apply the same change to other sessions that share this one's name.
async function _checkSiblingPropagation(templateId) {
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
        <p style="font-size:14px;line-height:1.6;margin:0 0 20px">There ${count === 1 ? 'is' : 'are'} <strong>${count}</strong> other session${count === 1 ? '' : 's'} named "<strong>${name}</strong>" in ${label}. Only the exercise you changed will be applied.</p>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="closeModal('propagate-modal');openTemplate('${templateId}',window._templateCtx)">Just this session</button>
          <button class="btn-primary" onclick="_applyToAllSessions('${templateId}')">Update all "${name}"</button>
        </div>
      </div>
    `
    mountModal(overlay)
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
    // Note: a template still shared across multiple phase slots at this point would mean
    // _resolveEditableTemplateId's fork didn't run (e.g. edited with no phaseWorkoutId context) —
    // that's a pre-existing edge case, not one this check needs to warn about separately.
    if (!matching.length) return openTemplate(templateId, ctx)
    window._propagateTargets = matching.map(r => r.template_id)
    _showPropagateModal(tmpl.name, matching.length, 'this program')
    return
  }

  openTemplate(templateId, ctx)
}

// Applies the single captured change to the other same-named sessions (surgically, by name) and to
// THEIR assigned client copies — never a wholesale workout overwrite.
async function _applyToAllSessions(sourceTemplateId) {
  closeModal('propagate-modal')
  const targetIds = window._propagateTargets || []
  const change = window._lastExerciseChange
  if (!targetIds.length || !change) { openTemplate(sourceTemplateId, window._templateCtx); return }

  await _propagateExerciseChangeToTemplates(change, targetIds)

  // Master-program siblings: keep the user's OWN (solo) copies of those sessions in sync too. Real
  // clients' copies are deliberately NOT touched here — writing to a real client's plan only ever
  // happens through the per-session "Update assigned clients?" confirm in _checkClientPlanPropagation,
  // so bulk "Update all same-named sessions" can never silently change a client's plan without consent.
  if (window._templateCtx?.programId) {
    const copies = await _assignedCopiesForSession(targetIds)
    await _propagateExerciseChangeToTemplates(change, copies.soloSelfIds)
  }

  log.ok('_applyToAllSessions', `propagated one change to ${targetIds.length} sessions`)
  openTemplate(sourceTemplateId, window._templateCtx)
}

// Clones a shared master template (name + description + exercises), preserving its coach/program
// ownership by default. Used by _resolveEditableTemplateId so an edit made via one phase slot never
// silently changes the same template reused by another slot (or another program).
// `overrides` lets a caller redirect where the clone lands without duplicating the exercise-copy
// logic — _copyTemplateToLibrary passes { program_id: null, generated_from_phase_id: null } to lift
// a program-owned workout out into the standalone (reusable) library pool.
async function _cloneSharedMasterTemplate(tmpl, overrides = {}) {
  const { data: newTmpl, error } = await db.from('workout_templates').insert({
    coach_id: tmpl.coach_id, client_id: null, program_id: tmpl.program_id || null,
    is_personal: tmpl.is_personal, name: tmpl.name, description: tmpl.description || null,
    ...overrides
  }).select('id').single()
  if (error || !newTmpl) { log.error('_cloneSharedMasterTemplate', 'clone failed', error); return null }

  const origExs = tmpl.workout_template_exercises || []
  const exMap = {}
  if (origExs.length) {
    const { data: insertedExs, error: exErr } = await db.from('workout_template_exercises').insert(origExs.map(ex => ({
      template_id: newTmpl.id, exercise_id: ex.exercise_id || null, exercise_name: ex.exercise_name,
      // See _cloneTemplateForClient — metric_type must survive a fork-on-edit clone too.
      exercise_type: ex.exercise_type, metric_type: ex.metric_type || null,
      order_index: ex.order_index, sets: ex.sets || null,
      sets_json: ex.sets_json || null, notes: ex.notes || null, superset_group: ex.superset_group || null
    }))).select('id, order_index')
    if (exErr) log.error('_cloneSharedMasterTemplate', 'exercise clone failed', exErr)
    const origByOrder = {}
    origExs.forEach(ex => { origByOrder[ex.order_index] = ex.id })
    ;(insertedExs || []).forEach(newEx => { const oldId = origByOrder[newEx.order_index]; if (oldId) exMap[oldId] = newEx.id })
  }
  return { id: newTmpl.id, exerciseIdMap: exMap }
}

// Lifts a workout built inside a program (program_id set, so it's locked to that one day slot and
// deliberately excluded from the reuse pool — see openProgram's picker filter) out into the
// standalone, reusable library. This is the missing bridge between "+ Create new workout (this day
// only)" and Workouts → Templates; without it the only way to reuse a program-built workout was to
// retype it by hand.
// Returns 'copied' | 'exists' | 'failed' so the bulk caller can report honestly.
async function _copyTemplateToLibrary(templateId) {
  const { data: tmpl, error } = await db.from('workout_templates')
    .select('*, workout_template_exercises(*)')
    .eq('id', templateId)
    .single()
  if (error || !tmpl) { log.error('_copyTemplateToLibrary', 'source fetch failed', error); return 'failed' }

  const isPersonal = currentProfile?.role === 'solo'

  // Idempotency guard: a library workout with this name already exists, so don't make a second one.
  // Matters because the bulk "Copy all" action must be safe to click twice — silently creating
  // duplicate-named templates is exactly the clutter the picker filter was fixed to prevent.
  // Compared in JS rather than in the query on purpose:
  //   • .ilike() would treat the name as a LIKE PATTERN — "Day_1" would match "Day-1", and a name
  //     containing % would match unrelated rows, wrongly reporting 'exists' and refusing to copy.
  //   • .maybeSingle() ERRORS when more than one row matches, and a discarded error yields null —
  //     i.e. the anti-duplicate guard would fail open precisely when duplicates already exist.
  const { data: libraryRows } = await db.from('workout_templates')
    .select('name')
    .eq('coach_id', tmpl.coach_id)
    .eq('is_personal', isPersonal)
    .is('client_id', null)
    .is('program_id', null)
    .is('generated_from_phase_id', null)
  const norm = s => (s || '').trim().toLowerCase()
  if ((libraryRows || []).some(r => norm(r.name) === norm(tmpl.name))) return 'exists'

  const cloned = await _cloneSharedMasterTemplate(
    { ...tmpl, is_personal: isPersonal },
    { program_id: null, generated_from_phase_id: null }
  )
  return cloned ? 'copied' : 'failed'
}

// Per-workout entry point — the button lives in the session-detail drawer (openSessionDetail),
// which already has the template in context and room for it; the phase-grid row is just name + ✕.
async function saveTemplateToLibrary(templateId, btnEl) {
  const btn = btnEl || document.getElementById('sd-save-library')
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…' }
  const result = await _copyTemplateToLibrary(templateId)
  if (btn) { btn.disabled = false; btn.textContent = 'Save to Library' }
  if (result === 'copied') {
    showToast('Saved to your Library — you can now reuse it in any program', 'success')
    await _refreshProgramTemplates() // or the picker behind this drawer wouldn't list it until reload
  }
  else if (result === 'exists') showToast('A workout with this name is already in your Library', 'warn')
  else showToast('Could not save to Library — try again.', 'error')
}

// Bulk entry point — solves the real case that prompted this: a program built entirely with
// "+ Create new workout (this day only)", whose workouts are all trapped in that program.
async function copyProgramWorkoutsToLibrary(programId) {
  const { data: phases } = await db.from('program_phases').select('id').eq('program_id', programId)
  const phaseIds = (phases || []).map(p => p.id)
  if (!phaseIds.length) { showToast('This program has no workouts yet', 'warn'); return }

  // Exclude periodization week-clones (generated_from_phase_id set) — they're derivatives of Week 1,
  // not source workouts, and copying them would litter the library with "Bench Press — W2" entries.
  const { data: rows } = await db.from('program_phase_workouts')
    .select('template_id, workout_templates(id, name, generated_from_phase_id)')
    .in('phase_id', phaseIds)

  // Dedupe by template_id, NOT by name. A duplicated week shares its source week's template_id, so
  // id-dedupe already collapses those. Deduping by name instead would silently DROP genuinely
  // different workouts that happen to share a name (three distinct "Upper Body" days) — the exact
  // case that motivated the picker rewrite — and they'd be reported as neither copied nor skipped.
  const seenIds = new Set()
  const sources = []
  for (const r of (rows || [])) {
    const t = r.workout_templates
    if (!t || t.generated_from_phase_id) continue
    if (seenIds.has(t.id)) continue
    seenIds.add(t.id)
    sources.push(t.id)
  }
  if (!sources.length) { showToast('This program has no workouts to copy', 'warn'); return }

  // Sequential, not Promise.all: each copy's name guard must see the rows written by the ones before
  // it, or two same-named workouts in the same program would both pass the check and both be created.
  const results = []
  for (const id of sources) results.push(await _copyTemplateToLibrary(id))
  const copied = results.filter(r => r === 'copied').length
  const exists = results.filter(r => r === 'exists').length
  const failed = results.filter(r => r === 'failed').length

  const parts = [`${copied} copied`]
  // Worded as "skipped — same name" rather than "already in your Library": that's true both when
  // you click twice AND when a genuinely different workout collides on name, where claiming it was
  // already there would be a lie. Renaming it in the program and re-copying is the way through.
  if (exists) parts.push(`${exists} skipped (same name already in Library)`)
  if (failed) parts.push(`${failed} failed`)
  showToast(parts.join(' · '), failed ? 'error' : 'success')
  log.ok('copyProgramWorkoutsToLibrary', 'done', { programId, copied, exists, failed })
  if (copied) await _refreshProgramTemplates()
}

// If this template is currently assigned to more than one program-phase slot, clones it and
// repoints only the slot this edit came from (window._templateCtx.phaseWorkoutId) — so an edit made
// from a phase never leaks into other slots/programs that happen to reuse the same template row.
// Client-plan templates are never shared this way (each slot already gets its own clone at
// assignment time), so this only applies to master-side (non-client-plan) edits.
async function _resolveEditableTemplateId(templateId, exerciseId = null) {
  const ctx = window._templateCtx || {}
  if (!ctx.phaseWorkoutId || ctx.isClientPlan) return { templateId, exerciseId }

  const { count } = await db.from('program_phase_workouts').select('id', { count: 'exact', head: true }).eq('template_id', templateId)
  if ((count || 0) <= 1) return { templateId, exerciseId }

  const { data: tmpl } = await db.from('workout_templates').select('*, workout_template_exercises(*)').eq('id', templateId).single()
  if (!tmpl) return { templateId, exerciseId }
  const cloned = await _cloneSharedMasterTemplate(tmpl)
  if (!cloned) return { templateId, exerciseId }

  await db.from('program_phase_workouts').update({ template_id: cloned.id }).eq('id', ctx.phaseWorkoutId)
  showToast('This workout is used in other slots — your changes now apply only to this one', 'success', 4000)
  return { templateId: cloned.id, exerciseId: exerciseId ? (cloned.exerciseIdMap[exerciseId] || exerciseId) : exerciseId }
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
        <input class="field-input" id="et-name" value="${escapeHtml(t.name)}">
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
  mountModal(overlay)
}

// Resolves the coach_id that should own this template's row, matching the same role-check
// already used by startWorkoutRunner: a 'client' role's currentUser.id is the client's own auth
// id, never a coach_id, so it must be looked up via their client record; 'coach' and 'solo' share
// one login where currentUser.id already is the correct coach_id.
async function _resolveTemplateOwnerCoachId() {
  if (currentProfile?.role !== 'client') return currentUser.id
  const { data } = await db.from('clients').select('coach_id').eq('user_id', currentUser.id).single()
  return data?.coach_id || currentUser.id
}

async function saveEditTemplate(id) {
  const errorEl = document.getElementById('et-error')
  const name = document.getElementById('et-name').value.trim()
  if (!name) { errorEl.textContent = 'Name is required'; return }
  const { templateId: targetId } = await _resolveEditableTemplateId(id)
  const coachId = await _resolveTemplateOwnerCoachId()
  log.info('saveEditTemplate', 'updating template', { id: targetId })
  const { data, error } = await db.from('workout_templates').update({
    name,
    description: document.getElementById('et-desc').value.trim() || null
  }).eq('id', targetId).eq('coach_id', coachId).select()
  if (error) { log.error('saveEditTemplate', 'update failed', error); errorEl.textContent = error.message; return }
  if (!data?.length) { log.error('saveEditTemplate', 'no rows updated — permission denied?', { id: targetId }); errorEl.textContent = 'Save failed — template not found or permission denied.'; return }
  log.ok('saveEditTemplate', 'template updated', { id: targetId })
  closeModal('edit-template-modal')
  openTemplate(targetId, window._templateCtx)
}

async function deleteTemplate(id) {
  if (!confirm('Delete this template? This cannot be undone.')) return
  const coachId = await _resolveTemplateOwnerCoachId()
  log.info('deleteTemplate', 'deleting template', { id })
  const { data, error } = await db.from('workout_templates').delete().eq('id', id).eq('coach_id', coachId).select()
  if (error) { log.error('deleteTemplate', 'delete failed', error); return }
  if (!data?.length) { log.error('deleteTemplate', 'no rows deleted — permission denied or already gone', { id }); return }
  log.ok('deleteTemplate', 'template deleted', { id })
  closeModal('edit-template-modal')

  // Jake, 2026-07-13: "deleting a workout template from the templates page falls back to the workouts
  // page." Correct, and it's a SOLO bug — which is why it looks like a non-bug for a coach, whose
  // Workouts page IS the templates page. Solo has a SEPARATE `library` page for the builder, while
  // `workouts` is its read-only session accordion. So a hardcoded navigate('workouts') ejected a solo
  // user clean out of the Library after every delete. It also ignored the back-context entirely, so
  // deleting a template opened from a program dumped you on Workouts instead of back in the program.
  // Return exactly where _templateGoBack would — do NOT re-implement the routing, or the two drift.
  // In particular `backTo:'client'` is a SENTINEL, not a page: navigate('client') hits the default
  // "Page not found". _templateGoBack translates it via openClientProgramsTab(); passing it to
  // navigate() (as the first cut of this fix did) is a regression the pre-push review caught.
  window._templateGoBack()
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
            <div class="list-row" onclick="openTemplate('${r.workout_templates?.id||r.workout_template_id}',{backTo:'client',backLabel:'${escapeAttr((clientData?.full_name||'Client'))}',clientId:'${clientId}',clientName:'${escapeAttr((clientData?.full_name||'Client'))}',clientProgramId:'${cpIds[0]||''}'})">
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
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted)">Recent sessions</div>
        <div style="display:flex;align-items:center;gap:6px">
          <svg id="pt-session-history-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;color:var(--text-muted);transition:transform .2s"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      </button>
      <div id="pt-session-history" style="display:none">
        <div class="list">
          ${logs.slice(0, 5).map(l => {
            const dateStr = new Date(l.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
            return `
              <div class="list-row" onclick="openWorkoutLog('${l.id}','${clientId}')">
                <div style="width:40px;height:40px;border-radius:10px;background:rgba(99,102,241,.12);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">💪</div>
                <div class="row-info">
                  <div class="row-name">${dateStr}</div>
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
  // .not('coach_id','is',null) + maybeSingle(): a MASTER account holds TWO clients rows (a coached one
  // and a solo one, coach_id NULL). A bare .single() on user_id throws PGRST116 on two rows, leaving
  // coachId undefined and the template dropdown silently empty. Solo/coach fall through to their own
  // uid, which IS the coach_id for their data.
  const coachId = currentProfile?.role === 'client'
    ? (await db.from('clients').select('coach_id').eq('user_id', currentUser.id).not('coach_id', 'is', null).maybeSingle()).data?.coach_id || currentUser.id
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

  // Same leak class fixed 2026-07-08/2026-07-10 in renderWorkoutTemplates/renderClientWorkoutsPage:
  // without these filters, client-owned clones, program-phase slot templates, and periodization
  // week clones (e.g. "Bench Press — W2") all leak into this freeform "Load from template" list.
  const { data: templates } = await db.from('workout_templates').select('*, workout_template_exercises(*)').eq('coach_id', coachId).is('client_id', null).is('program_id', null).is('generated_from_phase_id', null).eq('is_personal', currentProfile?.role === 'solo').order('name').limit(2000)
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
          ${(templates||[]).map(t=>`<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('')}
        </select>
      </div>
      <p class="modal-error" id="rs-error"></p>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="document.getElementById('runner-setup').remove()">Cancel</button>
        <button class="btn-primary" onclick="launchRunner('${clientId}')">▶ Start</button>
      </div>
    </div>
  `
  mountModal(overlay)
}

