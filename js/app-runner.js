async function launchRunner(clientId) {
  // Resume-check happens here, not in startWorkoutRunner -- this is the one true choke point
  // both the fast templateId path (startWorkoutRunner) and the setup modal's own Start button
  // funnel through before _runner gets overwritten, so checking here catches both in one hook.
  const draft = _loadRunnerDraft(clientId)
  if (draft) {
    document.getElementById('runner-setup')?.remove()
    _showRunnerResumeModal(clientId, draft)
    return
  }
  await _startFreshRunner(clientId)
}

async function _startFreshRunner(clientId) {
  // Unlock audio/speech here too — this function can be reached directly from the
  // runner setup modal's Start button, bypassing startWorkoutRunner entirely.
  _unlockAudio()
  _unlockSpeech()
  const name     = document.getElementById('rs-name')?.value.trim() || window._fakeRsName || 'Workout'
  const tmplId   = document.getElementById('rs-template')?.value || window._fakeRsTemplate || ''
  window._fakeRsName = null; window._fakeRsTemplate = null
  const template = window._runnerTemplates?.find(t => t.id === tmplId)

  // Fetch stored 1RMs for this client — used to compute kg targets from %1RM sets.
  // Keyed by both exercise_id (preferred — survives a name being retyped/renamed) and
  // trimmed-lowercase name (fallback for rows that predate the exercise_id link).
  const { data: oneRMRows } = await db.from('client_1rms').select('exercise_id, exercise_name, one_rm_kg').eq('client_id', clientId)
  const oneRMByName = Object.fromEntries((oneRMRows || []).map(r => [r.exercise_name.trim().toLowerCase(), parseFloat(r.one_rm_kg)]))
  const oneRMById   = Object.fromEntries((oneRMRows || []).filter(r => r.exercise_id).map(r => [r.exercise_id, parseFloat(r.one_rm_kg)]))

  let exercises = []
  if (template) {
    exercises = (template.workout_template_exercises || [])
      .sort((a, b) => a.order_index - b.order_index)
      .map(ex => {
        const repsStr = String(ex.reps || '')
        const restSecs = ex.rest_seconds || parseRest(ex.sets_json?.[0]?.restMin || '') || 90
        const s0 = ex.sets_json?.[0] || {}
        const oneRM = (ex.exercise_id && oneRMById[ex.exercise_id] != null) ? oneRMById[ex.exercise_id] : (oneRMByName[ex.exercise_name.trim().toLowerCase()] || null)
        return { name: ex.exercise_name, exerciseId: ex.exercise_id || null, type: ex.exercise_type || 'strength', metricType: ex.metric_type || 'weight_reps', targetSets: ex.sets_json?.length || 3, targetReps: repsStr, targetWeight: ex.weight_kg || '', restSecs, loggedSets: [], bodyweight: !!s0.bodyweight, assisted: !!s0.assisted, supersetGroup: ex.superset_group || null, sets_json: ex.sets_json || [], notes: ex.notes || null, oneRM }
      })
  }
  if (!exercises.length) exercises = [{ name: '', type: 'strength', targetSets: 0, targetReps: '', targetWeight: '', loggedSets: [] }]

  document.getElementById('runner-setup')?.remove()

  _runner = { clientId, name, date: new Date().toISOString().split('T')[0], exercises, exIdx: 0, startTime: Date.now(), _timerInterval: null, templateDesc: template?.description || null }
  renderRunner()
  _startRunnerTimerTick()
  _startRunnerDraftSafetyNet()
}

function _startRunnerTimerTick() {
  _runner._timerInterval = setInterval(() => {
    if (!_runner) return
    const t = fmtRunnerTime(_runner.startTime)
    const el = document.getElementById('wr-timer')
    if (el) el.textContent = t
    const el2 = document.getElementById('rt-session-timer')
    if (el2) el2.textContent = t
  }, 1000)
}

function fmtRunnerTime(startTime) {
  const s = Math.floor((Date.now() - startTime) / 1000)
  return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`
}

// ─── Session-state persistence (localStorage draft) ──────────────────────
// The live runner has no DB persistence until "Save workout" is tapped -- a crash, forced
// reload, or killed tab loses every set logged so far. This is a deliberately simple
// localStorage-only draft (a DB-backed cross-device version is out of scope for this pass) --
// checkpointed on every renderRunner() call plus a 10s safety-net tick (covers state changes
// that don't trigger a full re-render, e.g. typing into a strength-table input before tapping
// its ✓). Keyed per client so a PT logging for multiple clients can't cross-contaminate drafts.

let _runnerDraftSafetyNetInterval = null

function _runnerDraftKey(clientId) {
  return `_runnerDraft_${clientId}`
}

function _saveRunnerDraft() {
  if (!_runner) return
  try {
    const draft = {
      clientId: _runner.clientId,
      name: _runner.name,
      date: _runner.date,
      startTime: _runner.startTime,
      exIdx: _runner.exIdx,
      templateDesc: _runner.templateDesc || null,
      exercises: _runner.exercises,
      savedAt: Date.now()
    }
    localStorage.setItem(_runnerDraftKey(_runner.clientId), JSON.stringify(draft))
  } catch (e) {
    // A draft is a nice-to-have -- never let a persistence failure (quota, private browsing,
    // an unexpected serialization issue) break the actual live runner.
    log.error('_saveRunnerDraft', 'failed to persist draft', e)
  }
}

function _loadRunnerDraft(clientId) {
  try {
    const raw = localStorage.getItem(_runnerDraftKey(clientId))
    if (!raw) return null
    const draft = JSON.parse(raw)
    // Same-day staleness cutoff -- a draft from a previous calendar day is presumed abandoned
    // and never offered for resume.
    if (new Date(draft.savedAt).toDateString() !== new Date().toDateString()) {
      localStorage.removeItem(_runnerDraftKey(clientId))
      return null
    }
    // Must have at least one logged set (wizard) or completed table row to be worth resuming --
    // an empty draft (e.g. the runner was opened then immediately backed out of) offers nothing
    // over just starting fresh.
    const hasProgress = (draft.exercises || []).some(ex => ex.loggedSets?.length || ex.tableRows?.some(r => r.done))
    if (!hasProgress) { localStorage.removeItem(_runnerDraftKey(clientId)); return null }
    return draft
  } catch (e) {
    log.error('_loadRunnerDraft', 'failed to parse draft', e)
    localStorage.removeItem(_runnerDraftKey(clientId))
    return null
  }
}

function _clearRunnerDraft(clientId) {
  if (clientId) localStorage.removeItem(_runnerDraftKey(clientId))
}

function _startRunnerDraftSafetyNet() {
  _runnerDraftSafetyNetInterval = clearTimer(_runnerDraftSafetyNetInterval)
  _runnerDraftSafetyNetInterval = setInterval(() => { if (_runner) _saveRunnerDraft() }, 10000)
}

function _stopRunnerDraftSafetyNet() {
  _runnerDraftSafetyNetInterval = clearTimer(_runnerDraftSafetyNetInterval)
}

function _showRunnerResumeModal(clientId, draft) {
  const loggedCount = (draft.exercises || []).reduce((n, ex) =>
    n + (ex.loggedSets?.length || 0) + (ex.tableRows?.filter(r => r.done).length || 0), 0)
  const overlay = document.createElement('div')
  overlay.id = 'runner-resume-modal'
  overlay.className = 'modal-overlay'
  overlay.style.zIndex = '1001' // nothing else is open at this point, but matches the picker's defensive stacking pattern
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2 class="modal-title">Resume in-progress workout?</h2>
      </div>
      <p style="font-size:14px;line-height:1.6;margin:0 0 20px">You have an unsaved workout from earlier today (${escapeHtml(draft.name || 'Workout')}${loggedCount ? `, ${loggedCount} set${loggedCount === 1 ? '' : 's'} logged` : ''}). Resume where you left off, or discard it and start fresh?</p>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="_discardRunnerDraftAndStartFresh('${clientId}')">Discard &amp; start fresh</button>
        <button class="btn-primary" onclick="_resumeRunnerFromDraft('${clientId}')">Resume</button>
      </div>
    </div>
  `
  mountModal(overlay)
}

async function _resumeRunnerFromDraft(clientId) {
  // The "Resume" tap is itself a valid user gesture -- unlock here too, same as
  // _startFreshRunner does, or a resumed session's rest-timer beeps/voice cues can silently
  // never fire on iOS Safari / strict-autoplay Chrome. Found by multi-agent review 2026-07-10.
  _unlockAudio()
  _unlockSpeech()
  document.getElementById('runner-resume-modal')?.remove()
  const draft = _loadRunnerDraft(clientId)
  if (!draft) { await _startFreshRunner(clientId); return } // vanished between modal open and tap
  _runner = {
    clientId: draft.clientId, name: draft.name, date: draft.date, exercises: draft.exercises,
    exIdx: draft.exIdx || 0, startTime: draft.startTime, _timerInterval: null,
    templateDesc: draft.templateDesc || null
  }
  renderRunner()
  _startRunnerTimerTick()
  _startRunnerDraftSafetyNet()
}

async function _discardRunnerDraftAndStartFresh(clientId) {
  document.getElementById('runner-resume-modal')?.remove()
  _clearRunnerDraft(clientId)
  await _startFreshRunner(clientId)
}

async function fetchRunnerLastSession(exName, exerciseId) {
  if (!_runner || !exName) return
  _runner.lastSession = _runner.lastSession || {}
  if (_runner.lastSession[exName] !== undefined) { renderRunnerLastSession(exName); return }
  _runner.lastSession[exName] = null

  const { data: logs } = await db.from('workout_logs')
    .select('id, date').eq('client_id', _runner.clientId)
    .order('date', { ascending: false }).limit(20)
  if (!logs?.length) { _runner.lastSession[exName] = null; return }

  const logIds = logs.map(l => l.id)
  // Prefer matching by exercise_id (survives the name being retyped/renamed since); fall back
  // to the exact-name match for rows logged before this exercise had a library link.
  let exRows = exerciseId
    ? (await db.from('workout_log_exercises').select('log_id, workout_log_sets(set_number, weight_kg, reps_achieved)').eq('exercise_id', exerciseId).in('log_id', logIds)).data
    : null
  if (!exRows?.length) {
    exRows = (await db.from('workout_log_exercises').select('log_id, workout_log_sets(set_number, weight_kg, reps_achieved)').eq('exercise_name', exName).in('log_id', logIds)).data
  }
  if (!exRows?.length) { _runner.lastSession[exName] = null; return }

  // Pick the occurrence from the most recent log (logs is already date-desc ordered)
  const best = exRows.sort((a, b) =>
    logs.findIndex(l => l.id === a.log_id) - logs.findIndex(l => l.id === b.log_id)
  )[0]
  const date = logs.find(l => l.id === best.log_id)?.date
  const sets = (best.workout_log_sets || [])
    .filter(s => s.weight_kg || s.reps_achieved)
    .sort((a, b) => a.set_number - b.set_number)

  _runner.lastSession[exName] = sets.length ? { date, sets } : null
  renderRunnerLastSession(exName)
}

function renderRunnerLastSession(exName) {
  const data = _runner?.lastSession?.[exName]
  const el = document.getElementById('wr-last-session')
  if (el) {
    if (!data?.sets?.length) {
      el.innerHTML = ''
    } else {
      const dateStr = new Date(data.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      el.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--accent);white-space:nowrap">↑ Beat · ${dateStr}</span>
          ${data.sets.map(s => `
            <span style="font-size:11px;font-weight:600;color:var(--text);white-space:nowrap">
              <span style="color:var(--text-muted)">S${s.set_number}</span>
              ${s.weight_kg ? s.weight_kg + 'kg' : ''}${s.weight_kg && s.reps_achieved ? ' × ' : ''}${s.reps_achieved ? s.reps_achieved : ''}
            </span>`).join('')}
        </div>
      `
    }
  }
  // Strength table view: previous-session data can arrive AFTER the table has already painted
  // (async fetch). It is now shown only as ghost text in the KG/REPS inputs, so this just needs to
  // repaint once the data lands — it must NOT write the values into tableRows, which would be
  // auto-filling them again through the back door (the exact behaviour removed 2026-07-11).
  // Guarded on _prevTablePaintKey so a repaint can't re-trigger itself into a render loop.
  const ex = _runner?.exercises?.[_runner.exIdx]
  if (ex?.name === exName && ex.tableRows && data?.sets?.length) {
    const key = exName + ':' + data.sets.length
    if (_runner._prevTablePaintKey !== key) {
      _runner._prevTablePaintKey = key
      renderRunner()
    }
  }
}

// --- Strength table (Hevy-style) — plain strength sets only.
// Cardio / timed / unilateral / %1RM exercises stay on the wizard in renderRunner() below.

// Plate calculator removed 2026-07-11 (Jake: "Remove plate calculator"). It shipped 2026-07-10 as a
// PLATES/SIDE column in the strength table's target bar plus a live hint under the wizard's weight
// input; in real use it was noise rather than help. Deliberately deleted outright rather than
// hidden behind a flag — nothing else referenced _calcPlateBreakdown/_updatePlateBreakdown.

// The metric_types the fast logging table handles. Cardio stays on the wizard.
const _METRIC_TABLE_TYPES = new Set(['weight_reps','unilateral','timed_hold','jump_height','jump_distance'])

// Resolve an exercise's metric_type with a safe fallback for older drafts/rows that predate ②a/②b:
// derive from the legacy type/flags so nothing silently drops onto the wrong path.
function _exMetricType(ex) {
  if (ex.metricType) return ex.metricType
  if (ex.type === 'cardio') return 'cardio'
  const s0 = ex.sets_json?.[0] || {}
  if (s0.unilateral) return 'unilateral'
  if (s0.timed) return 'timed_hold'
  return 'weight_reps'
}

function _isPlainStrengthExercise(ex) {
  if (!ex) return false
  return _METRIC_TABLE_TYPES.has(_exMetricType(ex))
}

function _prevSetsByIndex(ex) {
  const sets = _runner?.lastSession?.[ex.name]?.sets
  const map = {}
  if (sets) sets.forEach(s => { map[s.set_number - 1] = s })
  return map
}

// Blank row shape for a fresh table set, per metric_type. Shared by _ensureTableRows (initial fill)
// and addTableRow (appended set) so the shape literal isn't duplicated in two places.
function _blankTableRow(ex) {
  const mt = _exMetricType(ex)
  if (mt === 'unilateral') return { leftWeight: ex.bodyweight ? 'BW' : '', leftReps: '', rightWeight: ex.bodyweight ? 'BW' : '', rightReps: '', done: false }
  if (mt === 'timed_hold') return { duration: '', weight: ex.bodyweight ? 'BW' : '', done: false }
  if (mt === 'jump_height') return { height_cm: '', done: false }
  if (mt === 'jump_distance') return { distance_m: '', done: false }
  return { weight: ex.bodyweight ? 'BW' : '', reps: '', done: false }
}

function _ensureTableRows(ex) {
  if (ex.tableRows) return
  const n = ex.targetSets || ex.sets_json?.length || 3
  // Rows start EMPTY. Last session's numbers used to be pre-filled here (the Hevy-style "1-tap
  // repeat"), but a pre-filled value is indistinguishable from one you actually entered — you can
  // tick a set off without ever confirming the weight was right. They are now shown as grey ghost
  // text in the inputs instead (renderStrengthTable), so the reference is still there but nothing
  // is logged until you type it. Jake, 2026-07-11.
  ex.tableRows = Array.from({ length: n }, () => _blankTableRow(ex))
}

function _syncLoggedSetsFromTable(ex) {
  const mt = _exMetricType(ex)
  ex.loggedSets = ex.tableRows.filter(r => r.done).map(r => {
    if (mt === 'unilateral') return { leftWeight: r.leftWeight || null, leftReps: r.leftReps || null, rightWeight: r.rightWeight || null, rightReps: r.rightReps || null }
    if (mt === 'timed_hold') return { duration: r.duration || null, weight: r.weight || null }
    if (mt === 'jump_height') return { height_cm: r.height_cm || null }
    if (mt === 'jump_distance') return { distance_m: r.distance_m || null }
    return { weight: r.weight || null, reps: r.reps }
  })
}

function toggleTableSet(rowIdx) {
  const ex = _runner.exercises[_runner.exIdx]
  const row = ex.tableRows?.[rowIdx]
  if (!row) return
  if (!row.done) {
    // Require the fields the metric_type actually logs — same minimum as the wizard's LOG
    // validation. Now that rows no longer pre-fill from last session (2026-07-11), an untouched row
    // is empty — so this guard is hit routinely rather than never, and a silent no-op would read as
    // a broken button to someone mid-set. Dropping the pre-fill also made a weightless/valueless
    // ticked set the easy path rather than an impossible one, and it degrades silently:
    // _syncLoggedSetsFromTable turns '' into null, saveRunnerSession then omits the value, and the
    // set is invisible to PB detection and shows '—' as next session's ghost text. Grey ghost text
    // reads like a value, so this is easy to do by accident.
    const mt = _exMetricType(ex)
    if (mt === 'unilateral') {
      if (!row.leftReps && !row.rightReps) { showToast('Enter reps first', 'warn'); return }
    } else if (mt === 'timed_hold') {
      if (!row.duration || row.duration === '0:00') { showToast('Enter a duration first', 'warn'); return }
    } else if (mt === 'jump_height') {
      if (!row.height_cm) { showToast('Enter a height first', 'warn'); return }
    } else if (mt === 'jump_distance') {
      if (!row.distance_m) { showToast('Enter a distance first', 'warn'); return }
    } else {
      if (!row.reps) { showToast('Enter reps first', 'warn'); return }
      if (!ex.bodyweight && !row.weight) { showToast('Enter weight first', 'warn'); return }
    }
    _unlockAudio()
    _unlockSpeech()
    row.done = true
    _syncLoggedSetsFromTable(ex)
    startRestTimer(ex.restSecs || 90)
    renderRunner()
  } else {
    row.done = false
    _syncLoggedSetsFromTable(ex)
    renderRunner()
  }
}

function addTableRow() {
  const ex = _runner.exercises[_runner.exIdx]
  _ensureTableRows(ex)
  // Empty for the same reason _ensureTableRows is: an appended set must not arrive pre-filled with
  // last session's numbers, or you can tick it off having never confirmed them. renderStrengthTable
  // computes ghost text per row index, so the reference still shows for appended rows too.
  ex.tableRows.push(_blankTableRow(ex))
  ex.targetSets = ex.tableRows.length
  renderRunner()
}

function deleteTableRow(rowIdx) {
  const ex = _runner.exercises[_runner.exIdx]
  if (!ex.tableRows || ex.tableRows.length <= 1) return // always leave at least one row
  ex.tableRows.splice(rowIdx, 1)
  ex.targetSets = ex.tableRows.length
  _syncLoggedSetsFromTable(ex)
  renderRunner()
}

// Running rep total for the exercise currently being logged, and the equivalent total
// from the last time this exercise was logged — lets the client see live whether they've
// beaten last session's total reps, updating with every set registered.
function _currentRepsTotal(ex) {
  if (ex.tableRows) return ex.tableRows.filter(r => r.done).reduce((s, r) => s + (parseInt(r.reps, 10) || 0), 0)
  return ex.loggedSets.reduce((s, st) => {
    if (st.leftReps != null || st.rightReps != null) return s + (parseInt(st.leftReps, 10) || 0) + (parseInt(st.rightReps, 10) || 0)
    return s + (parseInt(st.reps, 10) || 0)
  }, 0)
}

function _previousRepsTotal(ex) {
  const sets = _runner?.lastSession?.[ex.name]?.sets
  if (!sets) return null
  return sets.reduce((s, st) => s + (parseInt(st.reps_achieved, 10) || 0), 0)
}

function _renderRepsTallyHtml(ex) {
  const curTotal = _currentRepsTotal(ex)
  const prevTotal = _previousRepsTotal(ex)
  if (!curTotal && prevTotal == null) return ''
  const beat = prevTotal != null && curTotal > prevTotal
  return `<div style="margin-top:8px;padding:8px 10px;border-radius:8px;background:var(--surface-2);display:flex;justify-content:space-between;align-items:center">
    <span style="font-size:11px;font-weight:600;color:var(--text-muted)">This exercise</span>
    <span style="font-size:13px;font-weight:800;color:${beat ? 'var(--accent)' : 'var(--text)'}">${curTotal} reps${prevTotal != null ? ` <span style="font-size:11px;font-weight:600;color:var(--text-muted)">· last time ${prevTotal}</span>` : ''}</span>
  </div>`
}

// Shared with the wizard's per-set target chips (see the strength IIFE further down) —
// kept as a standalone pair here so the table can show the same prescription info
// (rep range/RPE-RIR/tempo/rest/%1RM) that the table previously dropped.
function _buildTargetCols(tgt, ex) {
  const cols = []
  if (tgt.timed) {
    const secs = tgt.duration ? (parseRest(tgt.duration)||0) : (tgt.repsMin ? parseInt(tgt.repsMin) : null)
    const durDisplay = secs != null ? (Math.floor(secs/60)+':'+String(secs%60).padStart(2,'0')) : null
    if (durDisplay) cols.push({ val: durDisplay, label: 'DURATION', accent: true })
  }
  const repsStr = !tgt.timed && tgt.repsMin ? (tgt.repsMin+(tgt.repsMax&&tgt.repsMax!==tgt.repsMin?'–'+tgt.repsMax:'')) : null
  if (repsStr) cols.push({ val: repsStr, label: 'REPS', accent: true })
  if (tgt.weight) cols.push({ val: tgt.weight+' kg', label: 'TARGET', accent: true })
  let needsOneRM = false
  if (tgt.intensityMin) {
    if (ex.oneRM) {
      const kgLo = _calcWeightFromPct(ex.oneRM, tgt.intensityMin)
      const kgHi = tgt.intensityMax && tgt.intensityMax !== tgt.intensityMin ? _calcWeightFromPct(ex.oneRM, tgt.intensityMax) : null
      cols.push({ val: kgLo + (kgHi ? '–'+kgHi : '') + ' kg', label: '1RM TARGET', accent: true })
    } else {
      needsOneRM = true
      cols.push({ val: tgt.intensityMin+(tgt.intensityMax&&tgt.intensityMax!==tgt.intensityMin?'–'+tgt.intensityMax:'')+'%', label: '1RM' })
    }
  }
  // Value carries the NUMBER only — the column's own label already says RPE or RIR, so prefixing
  // the value with it just says the same word twice ("RPE / RPE 8–9"). Jake, 2026-07-11.
  if (tgt.effortMin) cols.push({ val: tgt.effortMin+(tgt.effortMax&&tgt.effortMax!==tgt.effortMin?'–'+tgt.effortMax:''), label: tgt.effortType==='rir'?'RIR':'RPE' })
  if (tgt.restMin && tgt.restMin !== '0:00') cols.push({ val: tgt.restMin+(tgt.restMax&&tgt.restMax!==tgt.restMin?'–'+tgt.restMax:''), label: 'REST' })
  if (tgt.tempo) cols.push({ val: tgt.tempo, label: 'TEMPO' })
  return { cols, needsOneRM }
}

function _renderTargetBarHtml(cols) {
  if (!cols.length) return ''
  return `<div style="display:flex;border-top:1px solid var(--border);border-bottom:1px solid var(--border);margin-bottom:10px">${cols.map((c, i) =>
    `<div style="flex:1;text-align:center;padding:8px 4px${i < cols.length-1 ? ';border-right:1px solid var(--border)' : ''}">
      <div style="font-size:18px;font-weight:800;color:${c.accent ? 'var(--accent)' : 'var(--text)'};line-height:1.1">${c.val}</div>
      <div style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-top:2px">${c.label}</div>
    </div>`
  ).join('')}</div>`
}

function renderStrengthTable(ex) {
  _ensureTableRows(ex)
  const prevMap = _prevSetsByIndex(ex)
  // Current working set's target — tracks progress (loggedSets.length), same formula the
  // wizard uses, instead of always reading set 1's prescription regardless of which set is next.
  const curIdx = ex.loggedSets.length
  const tgt = ex.sets_json?.[curIdx] ?? ex.sets_json?.[ex.sets_json.length - 1] ?? {}
  const { cols, needsOneRM } = _buildTargetCols(tgt, ex)
  const targetBar = _renderTargetBarHtml(cols)
  const oneRMBanner = needsOneRM ? `
    <div id="wr-onerm-banner" onclick="showRunnerOneRMSheet(${_runner.exIdx})" style="background:rgba(245,158,11,.1);border:1.5px solid #f59e0b;border-radius:10px;padding:12px;text-align:center;cursor:pointer;margin-bottom:10px">
      <div style="font-size:13px;font-weight:700;color:#b45309">⚠ Set your 1RM to see target weight</div>
      <div style="font-size:11px;color:#b45309;margin-top:2px">Tap to add</div>
    </div>` : ''

  let restBar = ''
  if (_runner.restRemaining != null) {
    const hitTarget = ex.targetSets > 0 && ex.loggedSets.length >= ex.targetSets
    const nextEx = _runner.exercises.find((e,i) => i > _runner.exIdx && e.name)
    const nextLabel = hitTarget && nextEx ? 'Next: ' + nextEx.name : hitTarget && !nextEx ? 'Finish 🏁' : 'Next: Set ' + (ex.loggedSets.length + 1)
    restBar = `
    <div id="rest-timer-overlay" style="display:flex;align-items:center;gap:12px;padding:10px 12px;margin-bottom:10px;border-radius:10px;background:var(--surface-2);border:1.5px solid var(--accent)">
      <div id="rt-countdown" style="font-size:24px;font-weight:800;color:var(--accent);font-variant-numeric:tabular-nums;min-width:56px;text-align:center">${fmtRestCountdown(_runner.restRemaining)}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted)">Rest</div>
        <div style="font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${nextLabel}</div>
      </div>
      <button onclick="skipRestTimer()" style="padding:8px 12px;border:none;border-radius:8px;background:var(--surface);font-size:13px;font-weight:700;cursor:pointer;color:var(--text);flex-shrink:0">Skip →</button>
    </div>`
  }

  // ②c: the fast table adapts its columns to the exercise's metric_type. weight_reps is unchanged
  // (regression-safe); unilateral/timed_hold/jump_height/jump_distance render their own inputs. Cardio
  // never reaches here (it stays on the wizard, gated by _isPlainStrengthExercise).
  const mt = _exMetricType(ex)
  const showTargets = mt === 'weight_reps' || mt === 'unilateral' // %1RM/rep targets only apply to these
  const inCell = (i, row, field, { mode = 'decimal', step = '', ph = '—', fmt = false } = {}) => {
    const bind = fmt
      ? `this.value=fmtRestInput(this.value);_runner.exercises[${_runner.exIdx}].tableRows[${i}].${field}=this.value`
      : `_runner.exercises[${_runner.exIdx}].tableRows[${i}].${field}=this.value`
    return `<input type="${fmt ? 'text' : 'number'}" inputmode="${mode}" ${step ? `step="${step}"` : ''} value="${row[field] || ''}" placeholder="${ph}"
      oninput="${bind}"
      style="flex:1;min-width:0;padding:8px 4px;font-size:16px;font-weight:700;text-align:center;border:1.5px solid ${row.done ? 'var(--border)' : 'var(--accent)'};border-radius:8px;background:var(--bg);color:var(--text);box-sizing:border-box;-moz-appearance:textfield">`
  }
  const inDone = (i, row) => `<button onclick="toggleTableSet(${i})" aria-label="${row.done?'Mark set incomplete':'Mark set complete'}" style="width:44px;height:44px;flex-shrink:0;border-radius:8px;border:${row.done?'none':'2px solid #9ca3af'};font-size:18px;font-weight:800;cursor:pointer;background:${row.done?'var(--success)':'#fff'};color:${row.done?'#fff':'transparent'}">✓</button>`
  const inDel = (i) => ex.tableRows.length > 1 ? `<button onclick="deleteTableRow(${i})" aria-label="Delete set ${i+1}" style="height:44px;flex-shrink:0;padding:0 8px;margin-left:8px;border:none;border-radius:6px;cursor:pointer;background:var(--danger-light);color:var(--danger);font-size:11px;font-weight:700">Delete</button>` : ''
  const inSetNum = (i, isCurrent) => `<span style="width:22px;flex-shrink:0;font-size:13px;font-weight:700;color:${isCurrent?'var(--accent)':'var(--text-muted)'};text-align:center">${i+1}</span>`

  const rows = ex.tableRows.map((row, i) => {
    const prev = prevMap[i]
    // The row for the set you're currently on is highlighted so it's visually obvious which set the
    // target bar above applies to (Jake: "highlighted, not entered as text underneath — ugly UI").
    const isCurrent = i === curIdx
    const cardOpen = `<div style="padding:7px 6px;margin:0 -6px;border-radius:8px;border-bottom:1px solid var(--border);${isCurrent ? 'background:rgba(99,102,241,.08)' : ''}">`

    if (mt === 'unilateral') {
      // Two sub-rows per set (L then R) — keeps the table to two data columns on a 390px phone rather
      // than cramming four. One ✓ logs the whole set; _syncLoggedSetsFromTable emits both sides.
      const side = (label, wField, rField) => `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
        <span style="width:14px;flex-shrink:0;font-size:11px;font-weight:800;color:var(--text-muted);text-align:center">${label}</span>
        ${ex.bodyweight ? `<div style="flex:1;text-align:center;font-size:13px;font-weight:700;color:var(--text)">BW</div>` : inCell(i, row, wField, { mode:'decimal', step:'0.5', ph:'kg' })}
        ${inCell(i, row, rField, { mode:'numeric', ph:'reps' })}
      </div>`
      return `${cardOpen}<div style="display:flex;align-items:flex-start;gap:6px">
        ${inSetNum(i, isCurrent)}
        <div style="flex:1;min-width:0">${side('L','leftWeight','leftReps')}${side('R','rightWeight','rightReps')}</div>
        ${inDone(i, row)}${inDel(i)}
      </div></div>`
    }

    if (mt === 'timed_hold') {
      return `${cardOpen}<div style="display:flex;align-items:center;gap:6px">
        ${inSetNum(i, isCurrent)}
        ${inCell(i, row, 'duration', { mode:'numeric', ph:'0:00', fmt:true })}
        ${ex.bodyweight ? `<div style="flex:1;text-align:center;font-size:15px;font-weight:700;color:var(--text)">BW</div>` : inCell(i, row, 'weight', { mode:'decimal', step:'0.5', ph:'kg' })}
        ${inDone(i, row)}${inDel(i)}
      </div></div>`
    }

    if (mt === 'jump_height' || mt === 'jump_distance') {
      const f = mt === 'jump_height' ? 'height_cm' : 'distance_m'
      const ph = mt === 'jump_height' ? 'cm' : 'm'
      return `${cardOpen}<div style="display:flex;align-items:center;gap:6px">
        ${inSetNum(i, isCurrent)}
        ${inCell(i, row, f, { mode:'decimal', step:'0.01', ph })}
        ${inDone(i, row)}${inDel(i)}
      </div></div>`
    }

    // weight_reps (default) — behaviour unchanged incl. ghost placeholders (les 2026-07-11: no pre-fill).
    const rowTgt = ex.sets_json?.[i]
    const oneRMPlaceholder = (rowTgt?.intensityMin && ex.oneRM)
      ? _calcWeightFromPct(ex.oneRM, rowTgt.intensityMin) + (rowTgt.intensityMax && rowTgt.intensityMax !== rowTgt.intensityMin ? '–' + _calcWeightFromPct(ex.oneRM, rowTgt.intensityMax) : '')
      : ''
    const wPlaceholder = (prev?.weight_kg != null ? String(prev.weight_kg) : oneRMPlaceholder) || '—'
    const rPlaceholder = (prev?.reps_achieved != null ? String(prev.reps_achieved) : '') || '—'
    return `${cardOpen}<div style="display:flex;align-items:center;gap:6px">
        ${inSetNum(i, isCurrent)}
        ${ex.bodyweight
          ? `<div style="flex:1;text-align:center;font-size:15px;font-weight:700;color:var(--text)">BW</div>`
          : inCell(i, row, 'weight', { mode:'decimal', step:'0.5', ph:wPlaceholder })}
        ${inCell(i, row, 'reps', { mode:'numeric', ph:rPlaceholder })}
        ${inDone(i, row)}${inDel(i)}
      </div></div>`
  }).join('')

  const th = (label, w) => `<span style="${w ? `width:${w}` : 'flex:1'};text-align:center;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted)">${label}</span>`
  let header
  if (mt === 'unilateral') {
    header = `<div style="display:flex;gap:6px;padding:0 6px 6px">${th('Set','22px')}${th('L / R · kg × reps')}<span style="width:44px"></span></div>`
  } else if (mt === 'timed_hold') {
    header = `<div style="display:flex;gap:6px;padding:0 6px 6px">${th('Set','22px')}${th('Time')}${th(ex.bodyweight ? 'BW' : 'Kg')}<span style="width:44px"></span></div>`
  } else if (mt === 'jump_height') {
    header = `<div style="display:flex;gap:6px;padding:0 6px 6px">${th('Set','22px')}${th('Height (cm)')}<span style="width:44px"></span></div>`
  } else if (mt === 'jump_distance') {
    header = `<div style="display:flex;gap:6px;padding:0 6px 6px">${th('Set','22px')}${th('Distance (m)')}<span style="width:44px"></span></div>`
  } else {
    header = `<div style="display:flex;gap:6px;padding:0 6px 6px">${th('Set','22px')}${th('Kg')}${th('Reps')}<span style="width:44px"></span></div>`
  }
  // Reps tally only makes sense for rep-based types.
  const tally = (mt === 'weight_reps' || mt === 'unilateral') ? _renderRepsTallyHtml(ex) : ''

  return `
    ${showTargets ? targetBar : ''}
    ${showTargets ? oneRMBanner : ''}
    ${restBar}
    ${header}
    ${rows}
    <button onclick="addTableRow()" style="width:100%;margin-top:8px;padding:8px;border:1px dashed var(--border);border-radius:8px;background:transparent;font-size:12px;font-weight:600;cursor:pointer;color:var(--text-muted)">+ Add set</button>
    ${tally}
  `
}

function renderRunner() {
  _saveRunnerDraft()
  const ex      = _runner.exercises[_runner.exIdx]
  const setNum  = Math.min(ex.loggedSets.length + 1, ex.targetSets || Infinity)
  const isLast  = _runner.exIdx === _runner.exercises.length - 1
  const nextEx  = _runner.exercises[_runner.exIdx + 1]
  const lastSet = ex.loggedSets[ex.loggedSets.length - 1]
  const isTable = _isPlainStrengthExercise(ex)

  let el = document.getElementById('workout-runner')
  if (!el) { el = document.createElement('div'); el.id = 'workout-runner'; document.body.appendChild(el) }

  el.innerHTML = `
    <div style="position:fixed;inset:0;background:var(--bg);z-index:300;display:flex;flex-direction:column;overflow:hidden">

      <!-- Header -->
      <div style="padding:14px 16px 10px;border-bottom:1px solid var(--border)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
          ${_runner.exIdx > 0 ? `<button onclick="runnerGoBack()" style="padding:7px 12px;border:1px solid var(--border);border-radius:8px;background:transparent;font-size:13px;font-weight:700;cursor:pointer;color:var(--text-muted);flex-shrink:0">← Back</button>` : ''}
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
              <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted)">Exercise ${_runner.exIdx+1} of ${_runner.exercises.length}</span>
              <span style="font-size:11px;font-weight:600;color:var(--text-muted)">· <span id="wr-timer">${fmtRunnerTime(_runner.startTime)}</span></span>
            </div>
            <div style="font-size:22px;font-weight:800;color:var(--text);line-height:1.2;word-break:break-word">${escapeHtml(ex.name)||'Exercise name'}</div>
            ${(ex.targetReps||ex.targetWeight) ? `<div style="font-size:13px;font-weight:600;color:var(--text);margin-top:4px">${[ex.targetReps?ex.targetReps+' reps':null,ex.targetWeight?'@ '+ex.targetWeight+'kg':null].filter(Boolean).join(' · ')}</div>` : ''}
            ${nextEx ? `<div style="font-size:11px;color:var(--text-muted);margin-top:4px">Next: <span style="font-weight:600">${escapeHtml(nextEx.name)}</span></div>` : ''}
          </div>
          <button onclick="confirmEndRunner()" style="padding:7px 16px;border:none;border-radius:8px;background:#ef4444;font-size:13px;font-weight:700;cursor:pointer;color:#fff;flex-shrink:0">End</button>
        </div>
        ${_runner.exercises.length > 1 ? `<div style="display:flex;gap:3px;margin-top:10px">${_runner.exercises.map((e,i)=>`<div onclick="runnerJumpTo(${i})" title="${e.name||'Exercise '+(i+1)}" style="flex:1;height:8px;border-radius:4px;background:${i<_runner.exIdx?'rgba(99,102,241,0.45)':i===_runner.exIdx?'var(--accent)':'var(--border)'};cursor:pointer"></div>`).join('')}</div>` : ''}
        <div style="display:flex;gap:14px;margin-top:8px">
          <button id="wr-swap-btn" onclick="showExercisePicker('swap')" style="border:none;background:none;padding:0;cursor:pointer;font-size:11px;font-weight:600;color:var(--text-muted)">⇄ Swap exercise</button>
          <button id="wr-add-btn" onclick="showExercisePicker('add')" style="border:none;background:none;padding:0;cursor:pointer;font-size:11px;font-weight:600;color:var(--text-muted)">+ Add exercise</button>
        </div>
        ${_runner.templateDesc ? `<div style="margin-top:8px;padding:6px 10px;background:var(--surface-2);border-radius:8px;font-size:11.5px;color:var(--text-muted);line-height:1.5">${escapeHtml(_runner.templateDesc)}</div>` : ''}
      </div>

      <!-- Scrollable area: logged sets + PT note + client notes -->
      <div style="flex:1;overflow-y:auto;padding:12px 16px">
        <!-- Logged sets -->
        ${isTable ? renderStrengthTable(ex) : !ex.loggedSets.length
          ? `<p style="color:var(--text-muted);font-size:13px;margin:0 0 8px">No sets logged yet.</p>`
          : `<div style="margin-bottom:8px">${ex.loggedSets.map((s,i) => `
            <div style="display:flex;align-items:center;padding:10px 0;border-bottom:1px solid var(--border);gap:10px">
              <span style="font-size:13px;color:var(--text-muted);font-weight:600;width:48px;flex-shrink:0">Set ${i+1}</span>
              <span style="flex:1;display:flex;gap:10px;align-items:center">
                ${ex.type === 'cardio'
                  ? `<span style="font-size:15px;font-weight:700">${s.duration ? s.duration : s.distance ? s.distance+' km' : '—'}</span>`
                  : s.distance_m
                    ? `<span style="font-size:15px;font-weight:700">${s.weight?s.weight+' kg':'—'}</span><span style="font-size:15px;font-weight:700">${s.distance_m} m</span>`
                    : s.duration
                    ? `<span style="font-size:15px;font-weight:700">⏱ ${s.duration}</span>${s.weight?`<span style="font-size:14px;font-weight:600;color:var(--text-muted)">${s.weight} kg</span>`:''}`
                    : s.leftReps != null
                    ? `<span style="font-size:13px;font-weight:700">L: ${s.leftReps||'—'}${s.leftWeight?' @ '+s.leftWeight+'kg':''}</span><span style="font-size:13px;font-weight:700">R: ${s.rightReps||'—'}${s.rightWeight?' @ '+s.rightWeight+'kg':''}</span>`
                    : `<span style="font-size:15px;font-weight:700">${s.weight?s.weight+' kg':'—'}</span><span style="font-size:15px;font-weight:700">${s.reps||'—'} reps</span>`}
              </span>
              <button onclick="editRunnerSet(${_runner.exIdx},${i})" style="flex-shrink:0;padding:5px 10px;border:1px solid var(--border);border-radius:6px;background:transparent;font-size:11px;font-weight:700;cursor:pointer;color:var(--accent)">✎ Edit</button>
            </div>`).join('')}</div>`}

        <!-- PT note (always shown if exists, label prefix stripped) -->
        ${(() => {
          if (!ex.notes) return ''
          const noteMatch = ex.notes.match(/^\[([^\]]+)\]\s*([\s\S]*)$/)
          const label = noteMatch ? noteMatch[1] : 'Coach note'
          const noteText = noteMatch ? noteMatch[2] : ex.notes
          if (!noteText.trim()) return ''
          return `<div style="margin:8px 0 4px;padding:10px 12px;border-radius:8px;background:rgba(99,102,241,.07);border-left:3px solid var(--accent)">
            <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--accent)">${label}</span>
            <div style="font-size:13px;color:var(--text);margin-top:3px;line-height:1.5">${noteText}</div>
          </div>`
        })()}

        <!-- Client notes -->
        <div style="margin-top:14px">
          <label style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted)">Your notes</label>
          <textarea id="wr-client-notes" placeholder="e.g. wide grip felt comfortable…" rows="2"
            oninput="_runner.exercises[${_runner.exIdx}].clientNotes=this.value"
            style="width:100%;margin-top:6px;padding:10px 12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;font-size:13px;color:var(--text);resize:none;box-sizing:border-box;font-family:inherit;line-height:1.5">${ex.clientNotes||''}</textarea>
        </div>
      </div>

      <!-- Last session strip — persistent reference (table view shows this per-row instead) -->
      ${!isTable && ex.type !== 'cardio' ? `<div id="wr-last-session" style="border-top:1px solid var(--border);padding:6px 12px;background:var(--bg);min-height:28px"></div>` : ''}

      <!-- Set counter — above stats bar (table view shows this per-row instead) -->
      ${!isTable && ex.targetSets ? `<div style="padding:6px 14px;border-top:1px solid var(--border);background:var(--bg);display:flex;align-items:center;gap:8px">
        <span style="font-size:13px;font-weight:700;color:var(--accent)">Set ${setNum} of ${ex.targetSets}</span>
        <div style="display:flex;gap:4px">${Array.from({length:ex.targetSets},(_,i)=>`<div style="width:20px;height:6px;border-radius:3px;background:${i<ex.loggedSets.length?'var(--accent)':i===ex.loggedSets.length?'rgba(99,102,241,0.4)':'var(--border)'}"></div>`).join('')}</div>
      </div>` : ''}


      <!-- Set input -->
      <div style="padding:10px 12px 12px;background:var(--surface)">
        ${isTable ? `
          ${ex.loggedSets.length > 0
            ? `<button onclick="skipToNextExercise()" style="width:100%;height:52px;border:none;border-radius:10px;background:var(--accent);color:#fff;font-size:16px;font-weight:800;cursor:pointer">${isLast?'Finish 🏁':'Next exercise →'}</button>`
            : `<div style="text-align:center;padding:14px;font-size:12px;color:var(--text-muted)">Check off a set to continue</div>`}
        ` : _runner._restInterval ? `
          <div style="padding:14px;text-align:center;border-radius:10px;background:var(--surface-2)">
            <div style="font-size:13px;font-weight:600;color:var(--text-muted)">Resting — inputs available after rest</div>
          </div>
        ` : ex.type === 'cardio' ? (() => {
          const tgt = ex.sets_json?.[ex.loggedSets.length] || ex.sets_json?.[0] || {}
          const lastCardio = ex.loggedSets[ex.loggedSets.length - 1]
          const distBased = tgt.isDistanceBased
          return `
          <!-- Cardio targets -->
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">
            ${distBased && tgt.distance ? `<span style="font-size:12px;padding:3px 8px;border-radius:20px;background:var(--surface-2);color:var(--text-muted);font-weight:600">Target: ${tgt.distance} km</span>` : ''}
            ${!distBased && tgt.duration ? `<span style="font-size:12px;padding:3px 8px;border-radius:20px;background:var(--surface-2);color:var(--text-muted);font-weight:600">Target: ${normalizeDuration(tgt.duration)}</span>` : ''}
            ${tgt.pace500Min ? `<span style="font-size:12px;padding:3px 8px;border-radius:20px;background:var(--accent);color:#fff;font-weight:600">${tgt.pace500Min}${tgt.pace500Max && tgt.pace500Max!==tgt.pace500Min?'–'+tgt.pace500Max:''} /500m</span>` : ''}
            ${tgt.paceKmMin ? `<span style="font-size:12px;padding:3px 8px;border-radius:20px;background:var(--accent);color:#fff;font-weight:600">${tgt.paceKmMin}${tgt.paceKmMax && tgt.paceKmMax!==tgt.paceKmMin?'–'+tgt.paceKmMax:''} /km</span>` : ''}
            ${tgt.hrZoneMin ? `<span style="font-size:12px;padding:3px 8px;border-radius:20px;background:var(--surface-2);color:var(--text-muted);font-weight:600">HR: ${tgt.hrZoneMin}${tgt.hrZoneMax?'–'+tgt.hrZoneMax:''} bpm</span>` : ''}
            ${tgt.restMin && tgt.restMin !== '0:00' ? `<span style="font-size:12px;padding:3px 8px;border-radius:20px;background:var(--surface-2);color:var(--text-muted);font-weight:600">Rest: ${typeof tgt.restMin === 'number' ? fmtDuration(tgt.restMin) : tgt.restMin}</span>` : ''}
            ${tgt.strokeRateMin ? `<span style="font-size:12px;padding:3px 8px;border-radius:20px;background:var(--surface-2);color:var(--text-muted);font-weight:600">${tgt.strokeRateMin}${tgt.strokeRateMax?'–'+tgt.strokeRateMax:''} spm</span>` : ''}
            ${tgt.restHrMax ? `<span style="font-size:12px;padding:3px 8px;border-radius:20px;background:var(--surface-2);color:var(--text-muted);font-weight:600">Rest HR &lt;${tgt.restHrMax}</span>` : ''}
          </div>
          <!-- Set label -->
          <div style="text-align:center;font-size:13px;font-weight:700;color:var(--text-muted);margin-bottom:8px">Set ${setNum}</div>
          <!-- Cardio input -->
          <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:10px">
            ${distBased ? `
              <div>
                <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:4px">Distance achieved (km)</div>
                <input id="wr-cardio-dist" type="number" step="0.01" inputmode="decimal" placeholder="${tgt.distance||'0'}" value="${lastCardio?.distance||tgt.distance||''}"
                  style="width:100%;padding:12px;font-size:24px;font-weight:700;border:2px solid var(--accent);border-radius:10px;text-align:center;background:var(--bg);color:var(--text)">
              </div>
              <div>
                <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:4px">Pace /500m achieved — optional</div>
                <input id="wr-cardio-pace" type="text" inputmode="numeric" placeholder="e.g. 2:32" value="${lastCardio?.paceAchieved||''}"
                  oninput="this.value=fmtRestInput(this.value)"
                  style="width:100%;padding:10px 12px;font-size:18px;font-weight:700;border:2px solid var(--border);border-radius:10px;text-align:center;background:var(--bg);color:var(--text)">
              </div>` : `
              <div>
                <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:4px">Duration (MM:SS)</div>
                <input id="wr-cardio-dur" type="text" inputmode="numeric" placeholder="${normalizeDuration(tgt.duration)||'0:00'}" value="${normalizeDuration(lastCardio?.duration||tgt.duration||'')}"
                  oninput="this.value=fmtRestInput(this.value)"
                  style="width:100%;padding:12px;font-size:24px;font-weight:700;border:2px solid var(--accent);border-radius:10px;text-align:center;background:var(--bg);color:var(--text)">
              </div>`}
          </div>
          <!-- Optional heart rate (sub-project ②d) — shown for both distance- and duration-based cardio -->
          <div style="display:flex;gap:8px;margin-bottom:10px">
            <div style="flex:1">
              <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:4px">Avg HR (bpm) — optional</div>
              <input id="wr-cardio-avg-hr" type="number" inputmode="numeric" step="1" min="20" max="250" placeholder="${tgt.hrZoneMin||''}" value="${lastCardio?.avgHr||''}"
                style="width:100%;padding:10px 12px;font-size:16px;font-weight:700;border:2px solid var(--border);border-radius:10px;text-align:center;background:var(--bg);color:var(--text)">
            </div>
            <div style="flex:1">
              <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:4px">Max HR (bpm) — optional</div>
              <input id="wr-cardio-max-hr" type="number" inputmode="numeric" step="1" min="20" max="250" placeholder="" value="${lastCardio?.maxHr||''}"
                style="width:100%;padding:10px 12px;font-size:16px;font-weight:700;border:2px solid var(--border);border-radius:10px;text-align:center;background:var(--bg);color:var(--text)">
            </div>
          </div>
          <!-- Buttons -->
          <div style="display:flex;gap:8px;margin-bottom:6px">
            ${ex.loggedSets.length > 0 ? `<button onclick="skipToNextExercise()" style="flex:0 0 auto;padding:0 14px;height:52px;border:1px solid var(--border);border-radius:10px;background:transparent;font-size:12px;font-weight:700;cursor:pointer;color:var(--text-muted)">${isLast?'Finish 🏁':'Skip →'}</button>` : ''}
            ${!distBased ? `<button onclick="event.stopPropagation();startCardioTimer()" style="flex:1;height:52px;border:none;border-radius:10px;background:var(--surface-2);color:var(--text);font-size:14px;font-weight:700;cursor:pointer">▶ Start timer</button>` : ''}
            <button onclick="event.stopPropagation();logRunnerSet()" style="flex:1;height:52px;border:none;border-radius:10px;background:var(--accent);color:#fff;font-size:18px;font-weight:800;cursor:pointer">LOG</button>
          </div>
          <button onclick="event.stopPropagation();addExtraCardioSet()" style="width:100%;padding:8px;border:1px dashed var(--border);border-radius:10px;background:transparent;font-size:12px;font-weight:600;cursor:pointer;color:var(--text-muted)">+ Add extra set</button>`
        })() : `
        <!-- Strength input -->
        ${(() => {
          const tgt = ex.sets_json?.[ex.loggedSets.length] || ex.sets_json?.[0] || {}
          // Was a verbatim copy of _buildTargetCols + _renderTargetBarHtml. The copy is why the
          // "don't print RPE twice" fix (2026-07-11) only landed in the table and left the wizard
          // still rendering "RPE 8–9" under a column already labelled RPE — the wizard was never
          // actually sharing the helper the helper's own comment claimed it shared. Now it does.
          const { cols, needsOneRM } = _buildTargetCols(tgt, ex)
          const targetBar = _renderTargetBarHtml(cols)
          const oneRMBanner = needsOneRM ? `
          <div id="wr-onerm-banner" onclick="showRunnerOneRMSheet(${_runner.exIdx})" style="background:rgba(245,158,11,.1);border:1.5px solid #f59e0b;border-radius:10px;padding:12px;text-align:center;cursor:pointer;margin-bottom:10px">
            <div style="font-size:13px;font-weight:700;color:#b45309">⚠ Set your 1RM to see target weight</div>
            <div style="font-size:11px;color:#b45309;margin-top:2px">Tap to add</div>
          </div>` : ''
          const isDistance = /carry|broad jump|sled|sandbag.*lunge|step.*carry/i.test(ex.name)
          const distTarget = ex.notes?.match(/(\d+)[–\-](\d+)\s*m/)?.[0] || tgt.distance || ''
          const weightPlaceholder = tgt.weight || '—'
          // Same prescribed-rep string _buildTargetCols builds for its REPS column, but this one is
          // the input's ghost text, so it stays local rather than being read off the shared helper.
          const repsStr = !tgt.timed && tgt.repsMin ? (tgt.repsMin + (tgt.repsMax && tgt.repsMax !== tgt.repsMin ? '–' + tgt.repsMax : '')) : null
          const repsPlaceholder = repsStr ? repsStr.replace('–', '-') : '—'
          return `
          ${oneRMBanner}
          ${targetBar}
          ${tgt.unilateral && !isDistance ? `
          <!-- Unilateral L/R input -->
          <div style="display:flex;gap:6px;margin-bottom:6px">
            <div style="display:flex;flex-direction:column;justify-content:center;align-items:center;min-width:36px">
              <div style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted)">Set</div>
              <div style="font-size:22px;font-weight:800;color:var(--text);line-height:1">${setNum}</div>
            </div>
            <div style="flex:1;display:flex;flex-direction:column;gap:4px">
              <div style="font-size:10px;font-weight:700;text-transform:uppercase;text-align:center;color:var(--accent)">Left</div>
              <input id="wr-left-weight" type="number" inputmode="decimal" step="0.5" placeholder="${weightPlaceholder}"
                style="width:100%;font-size:17px;font-weight:700;text-align:center;border:2px solid var(--accent);border-radius:8px;padding:5px 4px;background:var(--bg);color:var(--text);box-sizing:border-box;-moz-appearance:textfield">
              <input id="wr-left-reps" type="number" inputmode="numeric" placeholder="${repsPlaceholder}"
                style="width:100%;font-size:17px;font-weight:700;text-align:center;border:2px solid var(--border);border-radius:8px;padding:5px 4px;background:var(--bg);color:var(--text);box-sizing:border-box;-moz-appearance:textfield">
              <div style="display:flex;justify-content:space-between;font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);padding:0 2px"><span>kg</span><span>reps</span></div>
            </div>
            <div style="flex:1;display:flex;flex-direction:column;gap:4px">
              <div style="font-size:10px;font-weight:700;text-transform:uppercase;text-align:center;color:var(--accent)">Right</div>
              <input id="wr-right-weight" type="number" inputmode="decimal" step="0.5" placeholder="${weightPlaceholder}"
                style="width:100%;font-size:17px;font-weight:700;text-align:center;border:2px solid var(--accent);border-radius:8px;padding:5px 4px;background:var(--bg);color:var(--text);box-sizing:border-box;-moz-appearance:textfield">
              <input id="wr-right-reps" type="number" inputmode="numeric" placeholder="${repsPlaceholder}"
                style="width:100%;font-size:17px;font-weight:700;text-align:center;border:2px solid var(--border);border-radius:8px;padding:5px 4px;background:var(--bg);color:var(--text);box-sizing:border-box;-moz-appearance:textfield">
              <div style="display:flex;justify-content:space-between;font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);padding:0 2px"><span>kg</span><span>reps</span></div>
            </div>
            <div style="display:flex;flex-direction:column;gap:4px;min-width:64px">
              <button onclick="logRunnerSet()" style="flex:1;border:none;border-radius:10px;background:var(--accent);color:#fff;font-size:15px;font-weight:800;cursor:pointer">LOG</button>
              ${ex.loggedSets.length > 0 ? `<button onclick="skipToNextExercise()" style="flex:0 0 auto;padding:4px 6px;border:1px solid var(--border);border-radius:8px;background:transparent;font-size:10px;font-weight:700;cursor:pointer;color:var(--text-muted)">${isLast?'Finish':'Next →'}</button>` : ''}
            </div>
          </div>` : `
          <div style="display:flex;align-items:stretch;gap:6px">
            <!-- Set number -->
            <div style="display:flex;flex-direction:column;justify-content:center;align-items:center;min-width:36px">
              <div style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted)">Set</div>
              <div style="font-size:22px;font-weight:800;color:var(--text);line-height:1">${setNum}</div>
            </div>
            <!-- Weight input (always shown, optional for timed) -->
            ${ex.bodyweight
              ? `<div style="flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;border:2px solid var(--border);border-radius:10px;padding:6px 4px;background:var(--bg)">
                  <div style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted)">Weight</div>
                  <div style="font-size:20px;font-weight:700;color:var(--text)">BW</div>
                 </div>`
              : `<div style="flex:1;display:flex;flex-direction:column">
                  <div style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:2px;text-align:center">${ex.assisted?'Assist (kg)':'Kilograms'}</div>
                  <input id="wr-weight-input" type="number" inputmode="decimal" step="0.5" placeholder="${weightPlaceholder}"
                    style="flex:1;width:100%;font-size:22px;font-weight:700;text-align:center;border:2px solid var(--accent);border-radius:10px;padding:6px 4px;background:var(--bg);color:var(--text);box-sizing:border-box;-moz-appearance:textfield">
                 </div>`}
            <!-- Duration (timed) or Reps / Distance -->
            ${tgt.timed
              ? (_runner._setTimerDone
                  ? `<div style="flex:1;display:flex;flex-direction:column">
                      <div style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:2px;text-align:center">Duration</div>
                      <input id="wr-duration-input" type="text" inputmode="numeric" placeholder="${tgt.duration||'0:00'}" oninput="this.value=fmtRestInput(this.value)"
                        style="flex:1;width:100%;font-size:22px;font-weight:700;text-align:center;border:2px solid var(--border);border-radius:10px;padding:6px 4px;background:var(--bg);color:var(--text);box-sizing:border-box">
                     </div>`
                  : '')
              : `<div style="flex:1;display:flex;flex-direction:column">
                  <div style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:2px;text-align:center">${isDistance ? 'Metres' : 'Reps'}</div>
                  ${isDistance
                    ? `<input id="wr-dist-input" type="number" inputmode="decimal" step="1" placeholder="${distTarget||'m'}"
                        style="flex:1;width:100%;font-size:22px;font-weight:700;text-align:center;border:2px solid var(--border);border-radius:10px;padding:6px 4px;background:var(--bg);color:var(--text);box-sizing:border-box;-moz-appearance:textfield">`
                    : `<input id="wr-reps-input" type="number" inputmode="numeric" placeholder="${repsPlaceholder}"
                        style="flex:1;width:100%;font-size:22px;font-weight:700;text-align:center;border:2px solid var(--border);border-radius:10px;padding:6px 4px;background:var(--bg);color:var(--text);box-sizing:border-box;-moz-appearance:textfield">`}
                 </div>`}
            <!-- LOG / Start / Skip -->
            <div style="display:flex;flex-direction:column;gap:4px;min-width:64px">
              ${tgt.timed && !_runner._setTimerDone
                ? `<button onclick="event.stopPropagation();startStrengthSetTimer()" style="flex:1;border:none;border-radius:10px;background:var(--accent);color:#fff;font-size:13px;font-weight:800;cursor:pointer">▶ Start</button>`
                : `<button onclick="logRunnerSet()" style="flex:1;border:none;border-radius:10px;background:var(--accent);color:#fff;font-size:15px;font-weight:800;cursor:pointer">LOG</button>`}
              ${ex.loggedSets.length > 0 ? `<button onclick="skipToNextExercise()" style="flex:0 0 auto;padding:4px 6px;border:1px solid var(--border);border-radius:8px;background:transparent;font-size:10px;font-weight:700;cursor:pointer;color:var(--text-muted)">${isLast?'Finish':'Next →'}</button>` : ''}
            </div>
          </div>`}
          ${ex.loggedSets.length > 0 && ex.loggedSets.length >= ex.targetSets ? `<button onclick="addExtraStrengthSet()" style="width:100%;margin-top:6px;padding:7px;border:1px dashed var(--border);border-radius:8px;background:transparent;font-size:12px;font-weight:600;cursor:pointer;color:var(--text-muted)">+ Add extra set</button>` : ''}
          ${!tgt.timed && !isDistance ? _renderRepsTallyHtml(ex) : ''}`
        })()}`}
      </div>
    </div>
  `
  if (ex.type !== 'cardio') setTimeout(() => fetchRunnerLastSession(ex.name, ex.exerciseId), 0)
}

function logRunnerSet() {
  _unlockAudio() // user gesture — unlock AudioContext for iOS
  _unlockSpeech() // prime speechSynthesis for iOS mid-timer calls
  if (_runner._restInterval) return // block LOG during rest
  const ex = _runner.exercises[_runner.exIdx]
  let setData
  if (ex.type === 'cardio') {
    const tgt = ex.sets_json?.[ex.loggedSets.length] || ex.sets_json?.[0] || {}
    if (tgt.isDistanceBased) {
      const dist = document.getElementById('wr-cardio-dist')?.value?.trim()
      if (!dist) return
      const paceEl = document.getElementById('wr-cardio-pace')
      setData = { distance: dist, paceAchieved: paceEl?.value?.trim() || null,
                  avgHr: document.getElementById('wr-cardio-avg-hr')?.value?.trim() || null,
                  maxHr: document.getElementById('wr-cardio-max-hr')?.value?.trim() || null }
    } else {
      // If interval timer is running, compute elapsed time; otherwise read the manual input field
      let dur
      if (_runner._intervalRunning && _runner._intervalSecs != null && _runner._intervalRemaining != null) {
        const elapsedSecs = _runner._intervalSecs - _runner._intervalRemaining
        dur = elapsedSecs > 0 ? fmtRestCountdown(elapsedSecs) : tgt.duration || null
      } else {
        dur = document.getElementById('wr-cardio-dur')?.value?.trim()
      }
      if (!dur || dur === '0:00') return
      // Overlay inputs take priority over runner-form inputs (interval overlay is still mounted here)
      const distEl = document.getElementById('wr-cardio-dist-opt')
      const paceEl = document.getElementById('wr-cardio-pace')
      setData = { duration: dur, distanceAchieved: distEl?.value?.trim() || null, paceAchieved: paceEl?.value?.trim() || null,
                  avgHr: document.getElementById('wr-cardio-avg-hr')?.value?.trim() || null,
                  maxHr: document.getElementById('wr-cardio-max-hr')?.value?.trim() || null }
    }
    // stop any running interval timer
    stopIntervalTimer()
  } else {
    const tgt = ex.sets_json?.[ex.loggedSets.length] || ex.sets_json?.[0] || {}
    const isDistance = /carry|broad jump|sled|sandbag.*lunge|step.*carry/i.test(ex.name)
    const weight = ex.bodyweight ? 'BW' : (document.getElementById('wr-weight-input')?.value?.trim() || '')
    if (tgt.timed) {
      const dur = document.getElementById('wr-duration-input')?.value?.trim()
      if (!dur || dur === '0:00') return
      setData = { weight: weight || null, duration: dur }
      _runner._setTimerDone = false
    } else if (tgt.unilateral && !isDistance) {
      const leftWeight = document.getElementById('wr-left-weight')?.value?.trim() || ''
      const leftReps   = document.getElementById('wr-left-reps')?.value?.trim()   || ''
      const rightWeight = document.getElementById('wr-right-weight')?.value?.trim() || ''
      const rightReps   = document.getElementById('wr-right-reps')?.value?.trim()   || ''
      if (!leftReps && !rightReps) return
      setData = { leftWeight: leftWeight || null, leftReps: leftReps || null, rightWeight: rightWeight || null, rightReps: rightReps || null }
    } else if (isDistance) {
      const dist = document.getElementById('wr-dist-input')?.value?.trim() || ''
      if (!dist) return
      setData = { weight, distance_m: dist }
    } else {
      const reps = document.getElementById('wr-reps-input')?.value?.trim() || ''
      if (!reps) return
      setData = { weight, reps }
      if (ex.assisted) setData.assistWeight = weight
    }
  }
  ex.loggedSets.push(setData)
  // Superset: if next exercise shares a superset group, switch to it instead of resting
  if (ex.supersetGroup) {
    const nextIdx = _runner.exercises.findIndex((e, i) => i !== _runner.exIdx && e.supersetGroup === ex.supersetGroup)
    if (nextIdx !== -1) {
      _runner.exIdx = nextIdx
      renderRunner()
      return
    }
  }
  // If all target sets for this exercise are done, advance or finish
  const hitTarget = ex.targetSets > 0 && ex.loggedSets.length >= ex.targetSets
  if (hitTarget) {
    const nextExIdx = _runner.exercises.findIndex((e, i) => i > _runner.exIdx && e.name)
    if (nextExIdx !== -1) {
      // More exercises — rest then advance. Start the rest timer (which sets
      // _restInterval) before re-rendering, so the page shows the "resting"
      // placeholder instead of a phantom next-set input for a set that doesn't exist.
      _runner._afterRest = () => { _runner.exIdx = nextExIdx; renderRunner() }
      startRestTimer(ex.restSecs || 90)
      renderRunner()
      return
    } else {
      // All done — go straight to finish
      showRunnerFinish()
      return
    }
  }
  const restSecs = ex.restSecs || 90
  if (ex.type === 'cardio') {
    const nextTgt = ex.sets_json?.[ex.loggedSets.length] || ex.sets_json?.[0] || {}
    if (!nextTgt.isDistanceBased) {
      _runner._afterRest = () => startIntervalTimer(parseRest(nextTgt.duration) || 300)
    }
  }
  startRestTimer(restSecs)
  renderRunner()
}

let _audioCtx = null

function _unlockAudio() {
  // Must be called from a user gesture (tap). Once resumed, iOS keeps the
  // context unlocked so timer-fired playBeep calls work for the session.
  try {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    if (_audioCtx.state === 'suspended') _audioCtx.resume()
  } catch(e) {}
}

function _unlockSpeech() {
  // Prime speechSynthesis on first user gesture so iOS/Chrome allow mid-timer calls —
  // an actual speak() tied to the gesture is required, cancel() alone doesn't register it.
  if (!window.speechSynthesis) return
  try {
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(' ')
    utt.volume = 0
    window.speechSynthesis.speak(utt)
  } catch(e) {}
}

function _pickFemaleVoice() {
  const voices = window.speechSynthesis?.getVoices() || []
  return voices.find(v => /hazel|susan|zira|female|samantha|victoria|karen/i.test(v.name)) || null
}

function speakCue(text) {
  if (!window.speechSynthesis) return
  try {
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    utt.rate = 1.1
    utt.volume = 1
    const voice = _pickFemaleVoice()
    if (voice) utt.voice = voice
    window.speechSynthesis.speak(utt)
  } catch(e) {}
}

function playBeep(freq = 880, duration = 0.15, volume = 0.8) {
  try {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    const _fire = () => {
      try {
        const ctx = _audioCtx
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.type = 'sine'
        osc.frequency.value = freq
        gain.gain.setValueAtTime(volume, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
        osc.start(ctx.currentTime)
        osc.stop(ctx.currentTime + duration)
      } catch(e) {}
    }
    if (_audioCtx.state !== 'running') {
      _audioCtx.resume().then(_fire).catch(() => {})
    } else {
      _fire()
    }
  } catch(e) {}
}

function startStrengthSetTimer() {
  _unlockAudio()
  _unlockSpeech()
  const ex = _runner.exercises[_runner.exIdx]
  const tgt = ex.sets_json?.[ex.loggedSets.length] || ex.sets_json?.[0] || {}
  const secs = tgt.duration ? (parseRest(tgt.duration) || 0) : 0
  if (!secs) return
  stopStrengthSetTimer()
  _runner._setTimerSecs = secs
  _runner._setTimerRemaining = secs
  _runner._setTimerActive = true
  _runner._setTimerDone = false
  renderStrengthSetTimer()
  _runner._setTimerInterval = setInterval(() => {
    _runner._setTimerRemaining--
    if (_runner._setTimerRemaining <= 0) {
      _runner._setTimerInterval = clearTimer(_runner._setTimerInterval)
      _runner._setTimerActive = false
      _runner._setTimerDone = true
      document.getElementById('wr-set-timer-overlay')?.remove()
      playBeep(1046, 0.5, 0.95)
      renderRunner()
      // pre-fill duration after render
      const dur = normalizeDuration(tgt.duration)
      const durInput = document.getElementById('wr-duration-input')
      if (durInput && dur) durInput.value = dur
      return
    }
    if (_runner._setTimerRemaining === 10) speakCue('10 seconds')
    if (_runner._setTimerRemaining <= 3) speakCue(String(_runner._setTimerRemaining))
    const el = document.getElementById('wr-set-countdown')
    if (el) {
      el.textContent = fmtRestCountdown(_runner._setTimerRemaining)
      el.style.color = _runner._setTimerRemaining <= 3 ? '#ef4444' : 'var(--accent)'
    }
    const ring = document.getElementById('wr-set-ring')
    if (ring) {
      const circ = 2 * Math.PI * 54
      ring.style.strokeDashoffset = circ * (1 - _runner._setTimerRemaining / _runner._setTimerSecs)
    }
  }, 1000)
}

function stopStrengthSetTimer() {
  _runner._setTimerInterval = clearTimer(_runner._setTimerInterval)
  _runner._setTimerActive = false
  _runner._setTimerDone = false
  document.getElementById('wr-set-timer-overlay')?.remove()
}

function renderStrengthSetTimer() {
  document.getElementById('wr-set-timer-overlay')?.remove()
  const secs = _runner._setTimerRemaining
  const total = _runner._setTimerSecs
  const circ = 2 * Math.PI * 54
  const pct = secs / total
  const ex = _runner.exercises[_runner.exIdx]
  const setNum = ex.loggedSets.length + 1
  const overlay = document.createElement('div')
  overlay.id = 'wr-set-timer-overlay'
  overlay.style.cssText = 'position:fixed;inset:0;background:var(--bg);z-index:350;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px'
  overlay.innerHTML = `
    <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:8px">${escapeHtml(ex.name)} — Set ${setNum}</div>
    <div style="position:relative;display:inline-block;margin-bottom:24px">
      <svg width="140" height="140" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="54" fill="none" stroke="var(--border)" stroke-width="6"/>
        <circle id="wr-set-ring" cx="60" cy="60" r="54" fill="none" stroke="var(--accent)" stroke-width="6"
          stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - pct)}"
          stroke-linecap="round" transform="rotate(-90 60 60)"
          style="transition:stroke-dashoffset .9s linear"/>
      </svg>
      <div id="wr-set-countdown" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:40px;font-weight:800;color:var(--accent)">${fmtRestCountdown(secs)}</div>
    </div>
    <div style="font-size:13px;color:var(--text-muted)">SET IN PROGRESS</div>
  `
  mountModal(overlay)
}

function startCardioTimer() {
  _unlockAudio() // user gesture — unlock AudioContext for iOS
  _unlockSpeech() // prime speechSynthesis for the interval timer's spoken countdown
  const ex = _runner.exercises[_runner.exIdx]
  const tgt = ex.sets_json?.[ex.loggedSets.length] || ex.sets_json?.[0] || {}
  const durEl = document.getElementById('wr-cardio-dur')
  const secs = (durEl?.value?.trim() ? parseRest(durEl.value.trim()) : 0) || parseRest(tgt.duration) || 300
  startIntervalTimer(secs)
}

function startIntervalTimer(secs) {
  stopIntervalTimer()
  _runner._intervalSecs = secs
  _runner._intervalRemaining = secs
  _runner._intervalRunning = true
  renderIntervalTimer()
  _runner._intervalInterval = setInterval(() => {
    _runner._intervalRemaining--
    if (_runner._intervalRemaining <= 0) {
      stopIntervalTimer()
      playBeep(1046, 0.5, 0.95)
      // auto-log with the target duration
      const ex = _runner.exercises[_runner.exIdx]
      const tgt = ex.sets_json?.[ex.loggedSets.length] || ex.sets_json?.[0] || {}
      const distEl = document.getElementById('wr-cardio-dist-opt')
      const paceEl = document.getElementById('wr-cardio-pace')
      const setData = { duration: tgt.duration || fmtRestCountdown(secs), distanceAchieved: distEl?.value?.trim() || null, paceAchieved: paceEl?.value?.trim() || null }
      ex.loggedSets.push(setData)
      const restSecs = ex.restSecs || 90
      const hitTarget = ex.targetSets > 0 && ex.loggedSets.length >= ex.targetSets
      // startRestTimer runs before renderRunner in every branch below so the
      // page shows the "resting" placeholder instead of a stale/phantom set input.
      if (hitTarget) {
        const nextExIdx = _runner.exercises.findIndex((e, i) => i > _runner.exIdx && e.name)
        if (nextExIdx !== -1) {
          _runner._afterRest = () => { _runner.exIdx = nextExIdx; renderRunner() }
          startRestTimer(restSecs)
        } else {
          startRestTimer(restSecs)
          _runner._afterRest = () => showRunnerFinish()
        }
      } else {
        const nextTgt2 = ex.sets_json?.[ex.loggedSets.length] || ex.sets_json?.[0] || {}
        if (!nextTgt2.isDistanceBased) {
          _runner._afterRest = () => startIntervalTimer(parseRest(nextTgt2.duration) || 300)
        }
        startRestTimer(restSecs)
      }
      renderRunner()
      return
    }
    if (_runner._intervalRemaining <= 5) speakCue(String(_runner._intervalRemaining))
    const el = document.getElementById('wr-interval-countdown')
    if (el) {
      el.textContent = fmtRestCountdown(_runner._intervalRemaining)
      el.style.color = _runner._intervalRemaining <= 5 ? '#ef4444' : 'var(--accent)'
    }
    const ring = document.getElementById('wr-interval-ring')
    if (ring) {
      const circ = 2 * Math.PI * 54
      const pct = _runner._intervalRemaining / _runner._intervalSecs
      ring.style.strokeDashoffset = circ * (1 - pct)
    }
  }, 1000)
}

function stopIntervalTimer() {
  _runner._intervalInterval = clearTimer(_runner._intervalInterval)
  _runner._intervalRunning = false
  _runner._intervalRemaining = null
  document.getElementById('wr-interval-overlay')?.remove()
}

function renderIntervalTimer() {
  document.getElementById('wr-interval-overlay')?.remove()
  const secs = _runner._intervalRemaining
  const total = _runner._intervalSecs
  const circ = 2 * Math.PI * 54
  const pct = secs / total
  const ex = _runner.exercises[_runner.exIdx]
  const setNum = ex.loggedSets.length + 1

  const overlay = document.createElement('div')
  overlay.id = 'wr-interval-overlay'
  overlay.style.cssText = 'position:fixed;inset:0;background:var(--bg);z-index:350;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px'
  overlay.innerHTML = `
    <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:8px">${escapeHtml(ex.name)} — Set ${setNum}</div>
    <div style="position:relative;display:inline-block;margin-bottom:24px">
      <svg width="140" height="140" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="54" fill="none" stroke="var(--border)" stroke-width="6"/>
        <circle id="wr-interval-ring" cx="60" cy="60" r="54" fill="none" stroke="var(--accent)" stroke-width="6"
          stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - pct)}"
          stroke-linecap="round" transform="rotate(-90 60 60)"
          style="transition:stroke-dashoffset .9s linear"/>
      </svg>
      <div id="wr-interval-countdown" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:40px;font-weight:800;color:var(--accent)">${fmtRestCountdown(secs)}</div>
    </div>
    <div style="font-size:13px;color:var(--text-muted);margin-bottom:24px">INTERVAL IN PROGRESS</div>
    <div style="width:100%;max-width:340px;display:flex;flex-direction:column;gap:10px;margin-bottom:24px">
      <div>
        <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:4px">Distance covered (km) — optional</div>
        <input id="wr-cardio-dist-opt" type="number" step="0.01" inputmode="decimal" placeholder="e.g. 1.24"
          style="width:100%;padding:10px 12px;font-size:18px;font-weight:700;border:2px solid var(--border);border-radius:10px;text-align:center;background:var(--surface);color:var(--text)">
      </div>
      <div>
        <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:4px">Pace /500m achieved — optional</div>
        <input id="wr-cardio-pace" type="text" inputmode="numeric" placeholder="e.g. 2:07"
          oninput="this.value=fmtRestInput(this.value)"
          style="width:100%;padding:10px 12px;font-size:18px;font-weight:700;border:2px solid var(--border);border-radius:10px;text-align:center;background:var(--surface);color:var(--text)">
      </div>
    </div>
    <button onclick="event.stopPropagation();logRunnerSet()" style="width:100%;max-width:340px;padding:16px;border:none;border-radius:12px;background:var(--accent);color:#fff;font-size:16px;font-weight:800;cursor:pointer">Done early — LOG</button>
  `
  mountModal(overlay)
}

function startRestTimer(secs) {
  _runner._restInterval = clearTimer(_runner._restInterval)
  _runner.restRemaining = secs
  _runner.restTotal     = secs
  // Table-mode rest renders inline inside renderStrengthTable (via the caller's imminent
  // renderRunner() call right after this), so the non-blocking table stays visible/editable
  // underneath — it never gets the floating page-top overlay that wizard mode still uses.
  const tableMode = _isPlainStrengthExercise(_runner.exercises[_runner.exIdx])
  if (!tableMode) renderRestTimer()
  _runner._restInterval = setInterval(() => {
    _runner.restRemaining--
    if (_runner.restRemaining <= 0) {
      _runner._restInterval = clearTimer(_runner._restInterval)
      _runner.restRemaining = null
      playBeep(1046, 0.5, 0.95) // higher, longer beep on finish
      document.getElementById('rest-timer-overlay')?.remove()
      const cb = _runner._afterRest
      if (cb) { _runner._afterRest = null; cb() }
      else renderRunner() // clears the inline rest bar (table mode) / stale "Resting…" state
    } else {
      _unlockAudio()
      if (_runner.restRemaining === 10) speakCue('10 seconds')
      if (_runner.restRemaining <= 5) speakCue(String(_runner.restRemaining))
      const el = document.getElementById('rt-countdown')
      if (el) {
        const r = _runner.restRemaining
        const inTableMode = _isPlainStrengthExercise(_runner.exercises[_runner.exIdx])
        el.textContent = inTableMode ? fmtRestCountdown(r) : (r < 60 ? r+'s' : fmtRestCountdown(r))
        el.style.color = r <= 3 ? '#ef4444' : 'var(--accent)'
      }
      const ring = document.getElementById('rt-ring')
      if (ring) {
        const pct = _runner.restRemaining / _runner.restTotal
        const circ = 2 * Math.PI * 18
        ring.style.strokeDashoffset = circ * (1 - pct)
      }
    }
  }, 1000)
}

function fmtRestCountdown(secs) {
  return `${Math.floor(secs/60)}:${String(secs%60).padStart(2,'0')}`
}

function skipRestTimer() {
  _runner._restInterval = clearTimer(_runner._restInterval)
  _runner.restRemaining = null
  document.getElementById('rest-timer-overlay')?.remove()
  const cb = _runner._afterRest
  if (cb) { _runner._afterRest = null; cb() }
  else if (_runner) renderRunner()
}

function renderRestTimer() {
  document.getElementById('rest-timer-overlay')?.remove()
  const secs  = _runner.restRemaining
  const total = _runner.restTotal
  const circ  = 2 * Math.PI * 18
  const pct   = secs / total
  const curEx    = _runner.exercises[_runner.exIdx]
  const hitTarget = curEx.targetSets > 0 && curEx.loggedSets.length >= curEx.targetSets
  const nextEx   = _runner.exercises.find((e,i) => i > _runner.exIdx && e.name)
  const nextLabel = hitTarget && nextEx ? 'Next: ' + nextEx.name : hitTarget && !nextEx ? 'Finish 🏁' : 'Next: Set ' + (curEx.loggedSets.length + 1)

  const overlay = document.createElement('div')
  overlay.id = 'rest-timer-overlay'
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:400;background:var(--surface);border-bottom:2px solid var(--accent);display:flex;align-items:center;gap:12px;padding:10px 16px;max-width:480px;margin:0 auto;box-shadow:0 2px 12px rgba(0,0,0,.15)'
  overlay.innerHTML = `
    <div style="position:relative;width:44px;height:44px;flex-shrink:0">
      <svg width="44" height="44" viewBox="0 0 44 44">
        <circle cx="22" cy="22" r="18" fill="none" stroke="var(--border)" stroke-width="3"/>
        <circle id="rt-ring" cx="22" cy="22" r="18" fill="none" stroke="var(--accent)" stroke-width="3"
          stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - pct)}"
          stroke-linecap="round" transform="rotate(-90 22 22)"
          style="transition:stroke-dashoffset .9s linear"/>
      </svg>
      <div id="rt-countdown" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;color:var(--accent)">${secs < 60 ? secs+'s' : fmtRestCountdown(secs)}</div>
    </div>
    <div style="flex:1;min-width:0">
      <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted)">Rest</div>
      <div style="font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${nextLabel}</div>
    </div>
    <div style="text-align:right;flex-shrink:0;margin-right:4px">
      <div style="font-size:10px;color:var(--text-muted)">Session</div>
      <div id="rt-session-timer" style="font-size:13px;font-weight:700">${fmtRunnerTime(_runner.startTime)}</div>
    </div>
    <button onclick="skipRestTimer()" style="padding:8px 12px;border:none;border-radius:8px;background:var(--surface-2);font-size:13px;font-weight:700;cursor:pointer;color:var(--text);flex-shrink:0">Skip →</button>
  `
  mountModal(overlay)
}


function editRunnerSet(exIdx, setIdx) {
  const s = _runner.exercises[exIdx].loggedSets[setIdx]
  if (!s) return
  // Re-entrancy guard. Without it a double-tap on ✎ appended TWO overlays sharing the same input ids.
  // The user sees and types into the second (painted on top); saveEditRunnerSet then calls
  // getElementById, which resolves to the FIRST, buried one — still holding the original pre-filled
  // values. The set "saved" completely unchanged, with no error, and a dead full-screen sheet was left
  // over the runner. showRunnerOneRMSheet already does exactly this; it just never got copied here.
  document.getElementById('wr-edit-overlay')?.remove()
  const overlay = document.createElement('div')
  overlay.id = 'wr-edit-overlay'
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:500;display:flex;align-items:flex-end;justify-content:center'
  overlay.innerHTML = `
    <div style="width:100%;max-width:480px;background:var(--surface);border-radius:24px 24px 0 0;padding:24px 20px 36px">
      <div style="font-size:15px;font-weight:700;margin-bottom:16px">Edit Set ${setIdx+1}</div>
      <div style="display:flex;gap:10px;margin-bottom:16px">
        <div style="flex:1">
          <label style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase">kg</label>
          <input id="wr-edit-weight" class="field-input" style="width:100%;margin-top:4px;font-size:22px;font-weight:700;text-align:center" value="${s.weight||''}" placeholder="—">
        </div>
        <div style="flex:1">
          <label style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase">Reps</label>
          <input id="wr-edit-reps" class="field-input" style="width:100%;margin-top:4px;font-size:22px;font-weight:700;text-align:center" value="${s.reps||''}" placeholder="—" type="number">
        </div>
      </div>
      <div style="display:flex;gap:8px">
        <button onclick="document.getElementById('wr-edit-overlay').remove()" style="flex:1;padding:13px;border:1px solid var(--border);border-radius:10px;background:transparent;font-size:14px;font-weight:600;cursor:pointer">Cancel</button>
        <button onclick="deleteRunnerSet(${exIdx},${setIdx})" style="flex:1;padding:13px;border:1px solid #ef4444;border-radius:10px;background:transparent;color:#ef4444;font-size:14px;font-weight:600;cursor:pointer">Delete</button>
        <button onclick="saveEditRunnerSet(${exIdx},${setIdx})" style="flex:2;padding:13px;border:none;border-radius:10px;background:var(--accent);color:#fff;font-size:14px;font-weight:700;cursor:pointer">Save</button>
      </div>
    </div>`
  mountModal(overlay)
}

function saveEditRunnerSet(exIdx, setIdx) {
  const weight = document.getElementById('wr-edit-weight')?.value.trim()
  const reps   = document.getElementById('wr-edit-reps')?.value.trim()
  if (!reps) return
  _runner.exercises[exIdx].loggedSets[setIdx] = { ..._runner.exercises[exIdx].loggedSets[setIdx], weight, reps }
  document.getElementById('wr-edit-overlay')?.remove()
  renderRunner()
}

function deleteRunnerSet(exIdx, setIdx) {
  _runner.exercises[exIdx].loggedSets.splice(setIdx, 1)
  document.getElementById('wr-edit-overlay')?.remove()
  renderRunner()
}

function skipToNextExercise() {
  stopIntervalTimer()
  if (_runner.exIdx < _runner.exercises.length - 1) {
    _runner.exIdx++
    renderRunner()
  } else {
    showRunnerFinish()
  }
}

function runnerJumpTo(i) {
  if (!_runner || i < 0 || i >= _runner.exercises.length) return
  stopIntervalTimer()
  stopStrengthSetTimer()
  skipRestTimer()
  _runner.exIdx = i
  renderRunner()
}

function runnerGoBack() {
  stopIntervalTimer()
  stopStrengthSetTimer()
  // skipRestTimer() FIRES the pending _afterRest callback, and after logging a set that callback is
  // `() => { _runner.exIdx = nextExIdx; renderRunner() }` — i.e. it advances FORWARD. So tapping
  // "← Back" during a rest went forward one, then back one, landing you on the screen you were
  // already on (and double-rendering). The button simply looked broken. Null the callback first.
  _runner._afterRest = null
  skipRestTimer()
  if (_runner.exIdx > 0) {
    _runner.exIdx--
    renderRunner()
  }
}

// Swap/add exercise are both session-only — neither writes to workout_templates.
// They change what gets logged for today; the coach's template is untouched.
// Opens the exact same modal used when building a workout (showAddExerciseToTemplateModal
// in app-workouts.js) — full library picker + 1RM group + set-target builder — rather than
// a cut-down picker, per Jake's 2026-07-03 instruction that both buttons must open that modal.
function showExercisePicker(mode) {
  showAddExerciseToTemplateModal(null, { mode })
}

// Looks up the client's most recent 1RM for an exercise — prefers exercise_id (survives a
// name being retyped/renamed since), falls back to a case-insensitive name match for rows
// that predate the exercise_id link. Used so a swapped/added exercise immediately gets its
// %1RM target weight calculated, instead of requiring the client to re-enter it via the
// "set your 1RM" banner.
async function _lookupClientOneRM(name, exerciseId) {
  if (exerciseId) {
    const { data } = await db.from('client_1rms').select('one_rm_kg')
      .eq('client_id', _runner.clientId).eq('exercise_id', exerciseId)
      .order('recorded_at', { ascending: false }).limit(1).maybeSingle()
    if (data?.one_rm_kg) return parseFloat(data.one_rm_kg)
  }
  const { data } = await db.from('client_1rms').select('one_rm_kg')
    .eq('client_id', _runner.clientId).ilike('exercise_name', name)
    .order('recorded_at', { ascending: false }).limit(1).maybeSingle()
  return data?.one_rm_kg ? parseFloat(data.one_rm_kg) : null
}

// Confirm handler for the shared modal when opened from the runner (mode: 'add'|'swap').
// Reads the same fields/set-target builder the workout builder reads, but pushes the result
// into _runner.exercises in-memory instead of inserting a workout_template_exercises row —
// keeps swap/add session-only per the existing decision, while giving the same full set-target
// expressiveness (reps/%1RM/RPE/rest/tempo/AMRAP/Uni/Timed/BW/Assist) the builder has.
async function _confirmRunnerExerciseFromModal(mode) {
  flushTemplateSets('att-sets-container')
  const picked = window._exerciseDetailPicked
  const errorEl = document.getElementById('att-error')
  if (!picked?.name) { errorEl.textContent = 'Exercise name is required'; return }
  const name = picked.name
  const exerciseId = picked.id || null
  const metricType = document.getElementById('att-type').value || 'weight_reps'
  const type = metricType === 'cardio' ? 'cardio' : 'strength'
  const notes = document.getElementById('att-notes').value.trim() || null
  const supersetGroup = document.getElementById('att-superset')?.value.trim().toUpperCase() || null
  const sets = window._templateSets || []
  const cleanSets = sets.map(s => ({
    amrap: !!s.amrap, unilateral: metricType === 'unilateral', timed: metricType === 'timed_hold',
    bodyweight: !!s.bodyweight, assisted: !!s.assisted, assistWeight: s.assistWeight||null,
    repsMin: s.repsMin||null, repsMax: s.repsMax||null, weight: s.weight||null,
    intensityMin: s.intensityMin||null, intensityMax: s.intensityMax||null,
    restMin: s.restMin||null, restMax: s.restMax||null,
    effortType: s.effortType||'rpe', effortMin: s.effortMin||null, effortMax: s.effortMax||null,
    tempo: s.tempo||null, countdown: s.countdown||null,
    duration: s.duration||null, distance: s.distance||null
  }))
  const oneRM = await _lookupClientOneRM(name, exerciseId)
  closeModal('add-to-template-modal')

  const restSecs = parseRest(cleanSets[0]?.restMin || '') || 90

  if (mode === 'swap') {
    const ex = _runner.exercises[_runner.exIdx]
    ex.name = name
    ex.exerciseId = exerciseId
    ex.type = type
    ex.metricType = metricType
    ex.sets_json = cleanSets
    ex.targetSets = cleanSets.length || ex.targetSets
    ex.restSecs = restSecs
    ex.bodyweight = !!cleanSets[0]?.bodyweight
    ex.assisted = !!cleanSets[0]?.assisted
    ex.notes = notes
    ex.supersetGroup = supersetGroup
    ex.loggedSets = []
    delete ex.tableRows
    ex.oneRM = oneRM
    if (type !== 'cardio') fetchRunnerLastSession(name, exerciseId)
    renderRunner()
  } else {
    _runner.exercises.push({
      name, exerciseId, type, metricType, targetSets: cleanSets.length || 3, targetReps: '', targetWeight: '',
      restSecs, loggedSets: [], bodyweight: !!cleanSets[0]?.bodyweight, assisted: !!cleanSets[0]?.assisted,
      supersetGroup, sets_json: cleanSets, notes, oneRM
    })
    _runner.exIdx = _runner.exercises.length - 1
    fetchRunnerLastSession(name, exerciseId)
    renderRunner()
  }
}

function addExtraCardioSet() {
  const ex = _runner.exercises[_runner.exIdx]
  ex.targetSets = (ex.targetSets || 0) + 1
  if (ex.sets_json?.length) ex.sets_json.push({ ...ex.sets_json[ex.sets_json.length - 1] })
  renderRunner()
}

function addExtraStrengthSet() {
  const ex = _runner.exercises[_runner.exIdx]
  ex.targetSets = (ex.targetSets || 0) + 1
  renderRunner()
}

async function showRunnerFinish() {
  // FULL teardown. This used to clear only _timerInterval, leaving the rest timer, the timed-set
  // timer, the cardio-interval timer and the draft safety-net all still ticking. The common path:
  // tick your last set (fires a 90s rest) -> tap "Finish" -> ~88s later the rest tick reaches 0, and
  // because _afterRest is null it calls renderRunner(), which innerHTML-replaces the "Workout
  // complete" screen with the exercise runner — throwing away the session name and notes the user was
  // in the middle of typing. In wizard mode it's worse: _afterRest bounces them into the NEXT exercise.
  //
  // Note this must NOT call skipRestTimer() — that FIRES the pending _afterRest callback. Null the
  // callback first, then clear. (Same trap as runnerGoBack.)
  _runner._afterRest = null
  _runner._timerInterval = clearTimer(_runner._timerInterval)
  _runner._restInterval  = clearTimer(_runner._restInterval)
  stopIntervalTimer()
  stopStrengthSetTimer()
  _stopRunnerDraftSafetyNet()
  // Remove the floating rest overlay too — clearing its interval stops the countdown but leaves the
  // DOM node painted (z-400) OVER the finish screen (z-300), and its "Skip →" button re-renders the
  // runner, destroying the finish screen mid-typing. discardRunner already does this; this didn't.
  document.getElementById('rest-timer-overlay')?.remove()

  const el = document.getElementById('workout-runner')
  if (!el) return

  // Snapshot runner state before any await
  const clientId   = _runner.clientId
  const runnerName = _runner.name
  const startTime  = _runner.startTime
  const exercises  = _runner.exercises

  const duration  = fmtRunnerTime(startTime)
  const doneExs   = exercises.filter(e => e.loggedSets.length)
  const totalSets = doneExs.reduce((s,e) => s + e.loggedSets.length, 0)
  const totalReps = doneExs.reduce((s,e) => s + e.loggedSets.reduce((sr,set) => sr + (parseInt(set.reps,10)||0), 0), 0)
  const totalVol  = doneExs.reduce((s,e) => s + e.loggedSets.reduce((sv,set) => {
    const w = parseFloat(set.weight), r = parseInt(set.reps,10)
    return sv + (isNaN(w)||isNaN(r) ? 0 : w * r)
  }, 0), 0)
  const totalDist = doneExs.filter(e=>e.type==='cardio').reduce((s,e) => s + e.loggedSets.reduce((sd,set) => sd + (parseFloat(set.distance)||0), 0), 0)

  // Show screen immediately while PR query runs
  const renderScreen = (prevBests = {}) => {
    const prCount = doneExs.filter(e => e.type !== 'cardio').filter(e => {
      const best = Math.max(...e.loggedSets.map(s => parseFloat(s.weight)||0))
      return best > 0 && best > (prevBests[e.name] || 0)
    }).length

    el.innerHTML = `
      <div style="position:fixed;inset:0;background:var(--bg);z-index:300;display:flex;flex-direction:column;overflow:hidden">
        <div style="padding:20px 16px 16px;border-bottom:1px solid var(--border)">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
            <h2 style="font-size:20px;font-weight:700;margin:0">Workout complete</h2>
            ${prCount > 0 ? `<span style="background:linear-gradient(135deg,#f59e0b,#f97316);color:#fff;font-size:11px;font-weight:700;padding:3px 8px;border-radius:20px">🏆 ${prCount} PR${prCount>1?'s':''}</span>` : ''}
          </div>
          <div style="display:grid;grid-template-columns:repeat(${totalVol>0&&totalDist>0?4:3},1fr);gap:8px">
            <div style="background:var(--surface-2);border-radius:10px;padding:10px 8px;text-align:center">
              <div style="font-size:17px;font-weight:800">${duration}</div>
              <div style="font-size:10px;color:var(--text-muted);margin-top:2px;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Time</div>
            </div>
            <div style="background:var(--surface-2);border-radius:10px;padding:10px 8px;text-align:center">
              <div style="font-size:17px;font-weight:800">${totalSets}</div>
              <div style="font-size:10px;color:var(--text-muted);margin-top:2px;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Sets</div>
            </div>
            ${totalReps > 0 ? `<div style="background:var(--surface-2);border-radius:10px;padding:10px 8px;text-align:center">
              <div style="font-size:17px;font-weight:800">${totalReps.toLocaleString()}</div>
              <div style="font-size:10px;color:var(--text-muted);margin-top:2px;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Reps</div>
            </div>` : ''}
            ${totalVol > 0 ? `<div style="background:var(--surface-2);border-radius:10px;padding:10px 8px;text-align:center">
              <div style="font-size:17px;font-weight:800;color:var(--accent)">${totalVol>=1000?(totalVol/1000).toFixed(1)+'t':totalVol.toLocaleString()+'kg'}</div>
              <div style="font-size:10px;color:var(--text-muted);margin-top:2px;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Volume</div>
            </div>` : ''}
            ${totalDist > 0 ? `<div style="background:var(--surface-2);border-radius:10px;padding:10px 8px;text-align:center">
              <div style="font-size:17px;font-weight:800;color:var(--accent)">${totalDist.toFixed(1)} km</div>
              <div style="font-size:10px;color:var(--text-muted);margin-top:2px;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Distance</div>
            </div>` : ''}
          </div>
        </div>

        <div style="flex:1;overflow-y:auto;padding:16px">
          ${doneExs.map(e => {
            const isCardio = e.type === 'cardio'
            const bestWeight = isCardio ? 0 : Math.max(...e.loggedSets.map(s => parseFloat(s.weight)||0))
            const isPR = !isCardio && bestWeight > 0 && bestWeight > (prevBests[e.name] || 0)
            const exVol = isCardio ? 0 : e.loggedSets.reduce((s,set) => {
              const w = parseFloat(set.weight), r = parseInt(set.reps,10)
              return s + (isNaN(w)||isNaN(r) ? 0 : w*r)
            }, 0)
            const exDist = isCardio ? e.loggedSets.reduce((s,set)=>s+(parseFloat(set.distance)||0),0) : 0
            return `
            <div style="margin-bottom:14px;background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden">
              <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--border)">
                <span style="font-weight:600;font-size:14px">${e.name}</span>
                <div style="display:flex;align-items:center;gap:6px">
                  ${isPR ? `<span style="font-size:10px;font-weight:700;color:#f59e0b;background:rgba(245,158,11,.12);padding:2px 7px;border-radius:10px">🏆 PR</span>` : ''}
                  <span style="font-size:12px;color:var(--text-muted)">${e.loggedSets.length} set${e.loggedSets.length>1?'s':''} ${!isCardio&&exVol>0?'· '+exVol.toLocaleString()+'kg':''} ${isCardio&&exDist>0?'· '+exDist.toFixed(1)+'km':''}</span>
                </div>
              </div>
              ${e.loggedSets.map((s,i) => {
                const w = parseFloat(s.weight), r = parseInt(s.reps,10)
                const isSetPR = !isCardio && w > 0 && w === bestWeight && isPR
                return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 14px;border-bottom:1px solid var(--border);font-size:13px${isSetPR?' background:rgba(245,158,11,.06)':''}">
                  <span style="color:var(--text-muted)">Set ${i+1}</span>
                  <span style="font-weight:600${isSetPR?';color:#d97706':''}">
                    ${isCardio
                      ? [s.duration, s.distance ? s.distance+' km' : ''].filter(Boolean).join(' · ')
                      : [s.weight&&s.weight!=='BW'?s.weight+' kg':s.weight==='BW'?'BW':'', s.reps?s.reps+' reps':''].filter(Boolean).join(' × ')
                    }
                    ${isSetPR ? ' 🏆' : ''}
                  </span>
                </div>`
              }).join('')}
            </div>`
          }).join('')}

          <div class="field" style="margin-top:4px">
            <label class="field-label">Session name</label>
            <input class="field-input" id="rf-name" value="${runnerName}">
          </div>
          <div class="field">
            <label class="field-label">Notes</label>
            <textarea class="field-input" id="rf-notes" rows="2" placeholder="How did it go?"></textarea>
          </div>
        </div>

        <div style="padding:12px 16px 24px;border-top:1px solid var(--border);display:flex;gap:8px">
          <button onclick="discardRunner()" style="flex:0 0 auto;padding:0 16px;height:48px;border:1px solid var(--border);border-radius:10px;background:transparent;font-size:13px;font-weight:600;cursor:pointer;color:var(--danger)">Discard</button>
          <button onclick="saveRunnerSession()" style="flex:1;height:48px;border:none;border-radius:10px;background:var(--accent);color:#fff;font-size:16px;font-weight:700;cursor:pointer">Save workout</button>
        </div>
      </div>
    `
  }

  // Render immediately with no PR data, then re-render once PRs are fetched
  renderScreen()

  const strengthNames = doneExs.filter(e=>e.type!=='cardio').map(e=>e.name)
  if (strengthNames.length && clientId) {
    const { data: prevExs } = await dbq('showRunnerFinish:prevExercises',
      db.from('workout_log_exercises')
        .select('id, exercise_name, workout_logs!inner(client_id)')
        .eq('workout_logs.client_id', clientId)
        .in('exercise_name', strengthNames),
      { showUserError: false }
    )
    if (prevExs?.length) {
      const { data: prevSets } = await dbq('showRunnerFinish:prevSets',
        db.from('workout_log_sets')
          .select('workout_log_exercise_id, weight_kg')
          .in('workout_log_exercise_id', prevExs.map(e=>e.id))
          .not('weight_kg', 'is', null),
        { showUserError: false }
      )
      const exMap = Object.fromEntries(prevExs.map(e=>[e.id, e.exercise_name]))
      const prevBests = {}
      prevSets?.forEach(s => {
        const name = exMap[s.workout_log_exercise_id]
        if (name) prevBests[name] = Math.max(prevBests[name]||0, s.weight_kg)
      })
      if (document.getElementById('workout-runner')) renderScreen(prevBests)
    }
  }
}

function confirmEndRunner() {
  if (_runner.exercises.some(e=>e.loggedSets.length)) showRunnerFinish()
  else discardRunner()
}

function discardRunner() {
  clearInterval(_runner?._timerInterval)
  clearInterval(_runner?._intervalInterval)
  clearInterval(_runner?._restInterval)
  _stopRunnerDraftSafetyNet()
  _clearRunnerDraft(_runner?.clientId)
  document.getElementById('workout-runner')?.remove()
  document.getElementById('wr-interval-overlay')?.remove()
  document.getElementById('rest-timer-overlay')?.remove()
  _runner = null
}

async function saveRunnerSession() {
  if (!_runner) return
  // Capture all _runner fields into locals before any await — discardRunner() can null _runner mid-save
  const name      = document.getElementById('rf-name')?.value.trim() || _runner.name
  const notes     = document.getElementById('rf-notes')?.value.trim() || null
  const clientId  = _runner.clientId
  const date      = _runner.date
  const exercises = _runner.exercises.filter(e => e.name && e.loggedSets.length)
  if (!exercises.length) { showToast('No sets logged — nothing to save.', 'warn', 3000); return }

  const saveBtn = document.querySelector('#workout-runner button[onclick="saveRunnerSession()"]')
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…' }

  // showUserError: false — a failure here already has a safe fallback (currentUser.id) and the
  // save continues normally, so surfacing a "Save failed" toast here would be a false positive.
  const { data: clientRecord } = await dbq('saveRunnerSession:clientLookup', db.from('clients').select('coach_id').eq('id', clientId).single(), { showUserError: false })
  const coachId = clientRecord?.coach_id || currentUser.id

  const { data: sessionLog, error } = await db.from('workout_logs').insert({
    coach_id: coachId, client_id: clientId, name, date, notes
  }).select().single()
  if (error) {
    log.error('saveRunnerSession', 'workout_logs insert failed', error)
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save workout' }
    return
  }

  // Batched: one insert for all exercise rows, then one insert for all set rows across every
  // exercise — replaces the old one-exercise-at-a-time loop (N sequential round trips) that was
  // the main cause of "save feels slow" on multi-exercise sessions.
  const exerciseRows = exercises.map((ex, bi) => ({
    log_id: sessionLog.id, exercise_id: ex.exerciseId || null, exercise_name: ex.name, exercise_type: ex.type,
    metric_type: ex.metricType || 'weight_reps', order_index: bi,
    client_notes: ex.clientNotes || null
  }))
  const { data: insertedExercises, error: exErr } = await db.from('workout_log_exercises').insert(exerciseRows).select()
  if (exErr) {
    log.error('saveRunnerSession', 'exercises batch insert failed', exErr)
    await db.from('workout_logs').delete().eq('id', sessionLog.id)
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save workout' }
    showToast(`Save failed — ${exErr.message}. Please try again.`, 'error')
    return
  }
  // Correlate by order_index, not response array position — a multi-row insert's response order
  // isn't a documented PostgREST guarantee, and getting this wrong would silently attach sets to
  // the wrong exercise.
  const exerciseIdByOrderIndex = Object.fromEntries(insertedExercises.map(r => [r.order_index, r.id]))
  const insertedExerciseIds = insertedExercises.map(r => r.id)

  const allSets = []
  exercises.forEach((ex, bi) => {
    const logExId = exerciseIdByOrderIndex[bi]
    ex.loggedSets.forEach((s, si) => {
      const setNumber = si + 1
      // Heart rate is common to any set shape (populated by sub-project ②d); apply it uniformly.
      const applyHr = (row) => {
        if (s.avgHr) row.avg_hr = parseInt(s.avgHr)
        if (s.maxHr) row.max_hr = parseInt(s.maxHr)
      }

      // Unilateral: the wizard captures both sides in ONE loggedSet. Persist as two rows sharing the
      // set_number, tagged by `side` — the L/R model progress imbalance charts read. Drop a side with
      // no reps. (base has 3 keys once `side` is added, so >3 means the row carries real data.)
      const isUnilateral = s.leftReps != null || s.rightReps != null || s.leftWeight != null || s.rightWeight != null
      if (isUnilateral) {
        for (const sd of [
          { side: 'left',  reps: s.leftReps,  weight: s.leftWeight },
          { side: 'right', reps: s.rightReps, weight: s.rightWeight }
        ]) {
          const row = { workout_log_exercise_id: logExId, set_number: setNumber, side: sd.side }
          if (sd.reps) row.reps_achieved = parseInt(sd.reps)
          if (sd.weight && sd.weight !== 'BW') row.weight_kg = parseFloat(sd.weight)
          applyHr(row)
          if (Object.keys(row).length > 3) allSets.push(row)
        }
        return
      }

      const row = { workout_log_exercise_id: logExId, set_number: setNumber }
      if (ex.type === 'cardio') {
        if (s.duration) row.duration_seconds = parseDuration(s.duration)
        if (s.distance) row.distance_m = Math.round(parseFloat(s.distance) * 1000) // cardio distance is km
      } else {
        // Timed hold: duration (+ optional load). Distance-strength / jump_distance: distance_m in METRES
        // (not km). Jump height: height_cm (populated by ②c). Plus the plain weight/reps/rpe case.
        if (s.duration)   row.duration_seconds = parseDuration(s.duration)
        if (s.distance_m) row.distance_m = Math.round(parseFloat(s.distance_m)) // already metres
        if (s.height_cm)  row.height_cm = parseFloat(s.height_cm)
        if (s.reps)       row.reps_achieved = parseInt(s.reps)
        if (s.weight && s.weight !== 'BW') row.weight_kg = parseFloat(s.weight)
        if (s.rpe) { row.effort_type = 'rpe'; row.effort_value = parseFloat(s.rpe) }
      }
      applyHr(row)
      if (Object.keys(row).length > 2) allSets.push(row)
    })
  })

  if (allSets.length) {
    const { error: setsErr } = await db.from('workout_log_sets').insert(allSets)
    if (setsErr) {
      log.error('saveRunnerSession', 'sets batch insert failed', setsErr)
      // Sets are one batched insert now, so a failure here means none of the session's sets
      // saved (not just one exercise's, as in the old per-exercise loop) -- roll back the
      // exercises + log too rather than leave a log with zero real data behind a misleading
      // "partially saved" toast.
      await db.from('workout_log_exercises').delete().in('id', insertedExerciseIds)
      await db.from('workout_logs').delete().eq('id', sessionLog.id)
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save workout' }
      showToast(`Save failed — ${setsErr.message}. Please try again.`, 'error')
      return
    }
  }
  log.ok('saveRunnerSession', 'session saved', { name, exercises: exercises.length })
  showToast('Workout saved!', 'success', 2500)

  const candidates = exercises
    .filter(ex => ex.type !== 'cardio')
    .map(ex => {
      let best = null
      ex.loggedSets.forEach(s => {
        const w = parseFloat(s.weight)
        const r = parseInt(s.reps)
        if (!w || !r || r < 1 || r > 10) return
        const est = _epley1RM(w, r)
        if (est && (!best || est > best.estimate)) best = { estimate: est, weight: w, reps: r }
      })
      if (!best) return null
      const currentOneRM = ex.oneRM ? parseFloat(ex.oneRM) : 0
      if (best.estimate <= currentOneRM) return null
      return { name: ex.name, ...best }
    })
    .filter(Boolean)

  discardRunner()
  if (candidates.length) showPostSessionOneRMModal(clientId, candidates)
  else _afterRunnerSave(clientId)
}

function _afterRunnerSave(clientId) {
  if (currentProfile?.role === 'client' || currentProfile?.role === 'solo') navigate('workouts')
  else openClient(clientId)
}

function showPostSessionOneRMModal(clientId, candidates) {
  const overlay = document.createElement('div')
  overlay.id = 'modal-post-session-1rm'
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2 class="modal-title">New 1RM estimates from today</h2>
        <button class="modal-close" onclick="document.getElementById('modal-post-session-1rm').remove();_afterRunnerSave('${clientId}')">✕</button>
      </div>
      <div id="psorm-rows">
        ${candidates.map((c, i) => `
          <div id="psorm-row-${i}" style="background:rgba(99,102,241,.07);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:10px">
            <div style="font-size:13px;font-weight:700;color:var(--accent)">${escapeHtml(c.name)} — ${c.weight}kg × ${c.reps} reps</div>
            <div style="font-size:12px;color:var(--text-muted);margin:4px 0 10px">That puts your estimated 1RM at ≈ ${c.estimate.toFixed(1)} kg</div>
            <div style="display:flex;gap:6px">
              <button class="btn-primary" style="flex:1;font-size:12px;padding:8px" onclick="_savePostSessionOneRM(${i},'${clientId}','${escapeAttr(c.name)}',${c.estimate})">Save as my 1RM</button>
              <button class="btn-secondary" style="flex:1;font-size:12px;padding:8px" onclick="document.getElementById('psorm-row-${i}').remove()">Skip</button>
            </div>
          </div>`).join('')}
      </div>
      <div class="modal-footer">
        <button class="btn-primary" style="width:100%" onclick="document.getElementById('modal-post-session-1rm').remove();_afterRunnerSave('${clientId}')">Done</button>
      </div>
    </div>
  `
  mountModal(overlay)
}

async function _savePostSessionOneRM(i, clientId, exerciseName, estimate) {
  const { error } = await dbq('savePostSessionOneRM', db.from('client_1rms').insert({
    client_id: clientId, exercise_name: exerciseName, one_rm_kg: estimate, recorded_at: new Date().toISOString().split('T')[0]
  }), { showUserError: false })
  if (error) { showToast(`Couldn't save 1RM for ${exerciseName} — try again`, 'error'); return }
  document.getElementById(`psorm-row-${i}`)?.remove()
  showToast(`1RM saved for ${exerciseName}`, 'success', 2000)
}

// ─── LOG SESSION ──────────────────────────────────────────────────────────────
// _logBlocks: [{name, type, defaultSets, defaultReps, defaultWeight, sets:[{reps,weight,duration,distance,effort}]}]
window._logBlocks = []

function flushLogState() {
  window._logBlocks.forEach((block, bi) => {
    const orm = document.getElementById(`ls-orm-${bi}`)
    if (orm) block.oneRM = orm.value
    block.sets.forEach((set, si) => {
      const g = (id) => document.getElementById(id)?.value ?? ''
      if (block.type === 'cardio') {
        set.duration = g(`ls-dur-${bi}-${si}`)
        set.distance = g(`ls-dist-${bi}-${si}`)
      } else {
        set.repsMin = g(`ls-rmin-${bi}-${si}`)
        set.repsMax = g(`ls-rmax-${bi}-${si}`) || set.repsMin
        set.weight  = g(`ls-weight-${bi}-${si}`)
        set.pctMin  = g(`ls-pmin-${bi}-${si}`)
        set.pctMax  = g(`ls-pmax-${bi}-${si}`)
        set.effort  = g(`ls-effort-${bi}-${si}`)
        set.rest    = g(`ls-rest-${bi}-${si}`)
      }
    })
  })
}

function _calcWeightFromPct(oneRM, pct) {
  if (!oneRM || !pct) return ''
  // Rounded DOWN (not to nearest) to the nearest 2.5kg -- an exact %1RM figure like 71.25kg
  // isn't loadable on a real bar, and rounding up would ask for more than the prescribed %.
  const rounded = Math.floor(parseFloat(oneRM) * parseFloat(pct) / 100 / 2.5) * 2.5
  return rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1)
}

// Epley formula — estimates 1RM from a sub-max weight x reps performance
function _epley1RM(weight, reps) {
  if (!weight || !reps) return null
  return weight * (1 + reps / 30)
}

function showRunnerOneRMSheet(exIdx) {
  const ex = _runner.exercises[exIdx]
  const existing = document.getElementById('modal-runner-1rm')
  if (existing) existing.remove()
  const overlay = document.createElement('div')
  overlay.id = 'modal-runner-1rm'
  overlay.className = 'modal-overlay'
  // Opens while the runner (z-index:300) is still up — needs to sit above it, same fix as showExercisePicker.
  overlay.style.zIndex = '1000'
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2 class="modal-title">${escapeHtml(ex.name)} — set your 1RM</h2>
        <button class="modal-close" onclick="document.getElementById('modal-runner-1rm').remove()">✕</button>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:14px">
        <button id="rorm-mode-direct" onclick="_setRunnerOneRMMode('direct')" class="btn-primary" style="flex:1;font-size:12px;padding:8px">I know it (kg)</button>
        <button id="rorm-mode-epley" onclick="_setRunnerOneRMMode('epley')" class="btn-secondary" style="flex:1;font-size:12px;padding:8px">Estimate from a set</button>
      </div>
      <div id="rorm-direct-fields">
        <div class="field">
          <label class="field-label">1RM (kg)</label>
          <input class="field-input" id="rorm-weight" type="number" step="0.5" inputmode="decimal" placeholder="e.g. 120">
        </div>
      </div>
      <div id="rorm-epley-fields" style="display:none">
        <div class="field">
          <label class="field-label">Weight lifted (kg)</label>
          <input class="field-input" id="rorm-est-weight" type="number" step="0.5" inputmode="decimal" oninput="_updateRunnerEpleyPreview()">
        </div>
        <div class="field">
          <label class="field-label">Reps</label>
          <input class="field-input" id="rorm-est-reps" type="number" inputmode="numeric" oninput="_updateRunnerEpleyPreview()">
        </div>
        <p id="rorm-epley-preview" style="font-size:12px;color:var(--text-muted)"></p>
      </div>
      <p class="modal-error" id="rorm-error"></p>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="document.getElementById('modal-runner-1rm').remove()">Cancel</button>
        <button class="btn-primary" onclick="saveRunnerOneRM(${exIdx})">Save & recalculate</button>
      </div>
    </div>
  `
  mountModal(overlay)
}

function _setRunnerOneRMMode(mode) {
  document.getElementById('rorm-direct-fields').style.display = mode === 'direct' ? 'block' : 'none'
  document.getElementById('rorm-epley-fields').style.display = mode === 'epley' ? 'block' : 'none'
  document.getElementById('rorm-mode-direct').className = mode === 'direct' ? 'btn-primary' : 'btn-secondary'
  document.getElementById('rorm-mode-epley').className = mode === 'epley' ? 'btn-primary' : 'btn-secondary'
}

function _updateRunnerEpleyPreview() {
  const w = parseFloat(document.getElementById('rorm-est-weight')?.value)
  const r = parseInt(document.getElementById('rorm-est-reps')?.value)
  const preview = document.getElementById('rorm-epley-preview')
  const est = _epley1RM(w, r)
  preview.textContent = est ? `≈ Epley estimate: ${est.toFixed(1)} kg` : ''
}

async function saveRunnerOneRM(exIdx) {
  const ex = _runner.exercises[exIdx]
  const errEl = document.getElementById('rorm-error')
  const mode = document.getElementById('rorm-epley-fields').style.display === 'block' ? 'epley' : 'direct'
  let oneRM
  if (mode === 'direct') {
    oneRM = parseFloat(document.getElementById('rorm-weight')?.value)
  } else {
    const w = parseFloat(document.getElementById('rorm-est-weight')?.value)
    const r = parseInt(document.getElementById('rorm-est-reps')?.value)
    oneRM = _epley1RM(w, r)
  }
  if (!oneRM || oneRM <= 0) { errEl.textContent = 'Enter a valid value'; return }

  const { error } = await dbq('saveRunnerOneRM', db.from('client_1rms').insert({
    client_id: _runner.clientId, exercise_name: ex.name, one_rm_kg: oneRM, recorded_at: new Date().toISOString().split('T')[0]
  }))
  if (error) { errEl.textContent = 'Save failed — try again'; return }

  ex.oneRM = oneRM
  document.getElementById('modal-runner-1rm').remove()
  renderRunner()
}

// Two bugs lived in this function's inline handlers, both fixed 2026-07-13:
//
// 1. `oninput="block.oneRM=this.value;renderLogExercises()"` — `block` is a .map() parameter, and an
//    inline handler resolves against element -> document -> window, never the enclosing closure. So it
//    threw a ReferenceError on EVERY keystroke and the renderLogExercises() after it never ran. That is
//    why the "% 1RM will auto-fill weight" hint only appeared once you happened to touch some other
//    field (which re-rendered via flushLogState and picked the value up the back way). Now addresses
//    window._logBlocks[bi] directly.
//
// 2. Re-rendering on `oninput` rebuilds container.innerHTML and therefore DESTROYS the focused input —
//    so a two-digit %1RM could never be typed (focus vanished after the first digit). The re-render is
//    now on `onchange` (blur/Enter), which is when the derived weight preview actually needs refreshing.
function renderLogExercises() {
  const container = document.getElementById('ls-exercises')
  if (!container) return

  const isMobile = window.innerWidth < 520
  const hdr = (txt) => `<span style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);text-align:center">${txt}</span>`
  const si_style = `class="field-input" style="padding:${isMobile?'8px 6px':'4px 5px'};font-size:${isMobile?'16px':'12px'};text-align:center;min-width:0"`

  container.innerHTML = window._logBlocks.map((block, bi) => {
    const isCardio = block.type === 'cardio'
    const isRIR = block.effortMode === 'RIR'
    const orm = parseFloat(block.oneRM) || 0

    // Mobile: Set | Reps | Weight | RPE | ×
    // Desktop: Set | RepsMin | RepsMax | Weight | PctMin | PctMax | Effort | Rest | ×
    const GRID = isCardio
      ? (isMobile ? '24px 1fr 1fr 28px' : '28px 1fr 1fr 22px')
      : (isMobile ? '24px 1fr 1fr 56px 28px' : '28px 42px 42px 58px 42px 42px 52px 54px 22px')

    const colHeaders = isCardio ? `
      ${hdr('')}
      ${hdr('Duration')}
      ${hdr('Distance (km)')}
      <span></span>
    ` : isMobile ? `
      ${hdr('#')}
      ${hdr('Reps')}
      ${hdr('Weight (kg)')}
      ${hdr(isRIR ? 'RIR' : 'RPE')}
      <span></span>
    ` : `
      ${hdr('')}
      <div style="grid-column:span 2;display:flex;flex-direction:column;align-items:center;gap:1px">
        ${hdr('Reps')}
        <div style="display:flex;gap:3px;width:100%">
          ${hdr('min')}${hdr('max')}
        </div>
      </div>
      ${hdr('Weight (kg)')}
      <div style="grid-column:span 2;display:flex;flex-direction:column;align-items:center;gap:1px">
        ${hdr('% 1RM')}
        <div style="display:flex;gap:3px;width:100%">
          ${hdr('min')}${hdr('max')}
        </div>
      </div>
      <div style="text-align:center">
        <div style="display:flex;border-radius:5px;border:1px solid var(--border);overflow:hidden">
          <button onclick="flushLogState();window._logBlocks[${bi}].effortMode='RPE';renderLogExercises()" style="flex:1;padding:2px 0;font-size:9px;font-weight:600;border:none;cursor:pointer;background:${!isRIR?'var(--accent)':'transparent'};color:${!isRIR?'#fff':'var(--text-muted)'}">RPE</button>
          <button onclick="flushLogState();window._logBlocks[${bi}].effortMode='RIR';renderLogExercises()" style="flex:1;padding:2px 0;font-size:9px;font-weight:600;border:none;cursor:pointer;background:${isRIR?'var(--accent)':'transparent'};color:${isRIR?'#fff':'var(--text-muted)'}">RIR</button>
        </div>
      </div>
      ${hdr('Rest')}
      <span></span>
    `

    const setsHtml = block.sets.map((s, si) => {
      const wFromPct = orm
        ? `<div style="font-size:9px;color:var(--accent);text-align:center;margin-top:1px">${_calcWeightFromPct(orm, s.pctMin) || ''}${s.pctMax && s.pctMax !== s.pctMin ? '–' + _calcWeightFromPct(orm, s.pctMax) : ''}${orm && (s.pctMin || s.pctMax) ? 'kg' : ''}</div>`
        : ''
      const delBtn = `<button onclick="flushLogState();window._logBlocks[${bi}].sets.splice(${si},1);renderLogExercises()" style="width:${isMobile?'28px':'22px'};height:${isMobile?'36px':'22px'};border-radius:5px;border:1px solid var(--border);background:transparent;color:var(--text-muted);cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;padding:0">×</button>`
      return `
        <div style="display:grid;grid-template-columns:${GRID};gap:${isMobile?'5px':'3px'};align-items:center;margin-bottom:${isMobile?'6px':'3px'}">
          <span style="font-size:11px;font-weight:600;color:var(--text-muted);text-align:center">${si + 1}</span>
          ${isCardio ? `
            <input id="ls-dur-${bi}-${si}" ${si_style} type="text" placeholder="0:00" value="${s.duration || '0:00'}" oninput="this.value=fmtRestInput(this.value)">
            <input id="ls-dist-${bi}-${si}" ${si_style} type="number" step="0.01" placeholder="km" value="${s.distance || ''}">
          ` : isMobile ? `
            <input id="ls-rmin-${bi}-${si}" ${si_style} inputmode="numeric" placeholder="reps" value="${s.repsMin || ''}">
            <input id="ls-weight-${bi}-${si}" ${si_style} inputmode="decimal" step="0.5" placeholder="kg" value="${s.weight || ''}">
            <input id="ls-effort-${bi}-${si}" ${si_style} inputmode="decimal" step="0.5" min="0" max="10" placeholder="${isRIR?'0–5':'1–10'}" value="${s.effort || ''}">
          ` : `
            <input id="ls-rmin-${bi}-${si}" ${si_style} type="number" placeholder="min" value="${s.repsMin || ''}">
            <input id="ls-rmax-${bi}-${si}" ${si_style} type="number" placeholder="max" value="${s.repsMax || ''}">
            <div>
              <input id="ls-weight-${bi}-${si}" ${si_style} type="number" step="0.5" placeholder="kg" value="${orm && (s.pctMin||s.pctMax) ? (_calcWeightFromPct(orm,s.pctMin)||s.weight||'') : (s.weight||'')}">
            </div>
            <input id="ls-pmin-${bi}-${si}" ${si_style} type="number" placeholder="%" value="${s.pctMin || ''}" oninput="flushLogState()" onchange="renderLogExercises()">
            <div>
              <input id="ls-pmax-${bi}-${si}" ${si_style} type="number" placeholder="%" value="${s.pctMax || ''}" oninput="flushLogState()" onchange="renderLogExercises()">
              ${wFromPct}
            </div>
            <input id="ls-effort-${bi}-${si}" ${si_style} type="number" step="0.5" min="0" max="10" placeholder="${isRIR?'0–5':'1–10'}" value="${s.effort || ''}">
            <input id="ls-rest-${bi}-${si}" ${si_style} type="text" placeholder="0:00" value="${s.rest || '0:00'}" oninput="this.value=fmtRestInput(this.value)">
          `}
          ${delBtn}
        </div>
      `
    }).join('')

    return `
      <div style="border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:8px;padding:9px 12px;background:rgba(99,102,241,.06);border-bottom:1px solid var(--border)">
          <div style="width:22px;height:22px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;flex-shrink:0">${String.fromCharCode(65+bi)}</div>
          <input id="ls-exname-${bi}" class="field-input" style="padding:5px 8px;font-size:13px;font-weight:500;flex:1;background:transparent;border-color:transparent" placeholder="Exercise name" value="${block.name}" oninput="window._logBlocks[${bi}].name=this.value">
          <select id="ls-extype-${bi}" class="field-input" style="padding:5px 8px;font-size:12px;width:100px;flex-shrink:0" onchange="flushLogState();window._logBlocks[${bi}].type=this.value;renderLogExercises()">
            <option value="strength" ${!isCardio?'selected':''}>Strength</option>
            <option value="cardio" ${isCardio?'selected':''}>Cardio</option>
          </select>
          <button onclick="flushLogState();window._logBlocks.splice(${bi},1);renderLogExercises()" style="font-size:16px;color:var(--text-muted);background:none;border:none;cursor:pointer;padding:0 2px;flex-shrink:0">×</button>
        </div>
        ${!isCardio ? `
        <div style="display:flex;align-items:center;gap:8px;padding:7px 12px;border-bottom:1px solid var(--border);background:rgba(0,0,0,.02)">
          <span style="font-size:11px;font-weight:500;color:var(--text-muted);white-space:nowrap">1 Rep Max</span>
          <input id="ls-orm-${bi}" class="field-input" style="width:72px;padding:4px 8px;font-size:12px;text-align:center" type="number" step="0.5" placeholder="e.g. 100" value="${block.oneRM || ''}" oninput="window._logBlocks[${bi}].oneRM=this.value" onchange="flushLogState();renderLogExercises()">
          <span style="font-size:11px;color:var(--text-muted)">kg</span>
          <span style="font-size:11px;color:var(--text-muted);margin-left:2px">${orm ? '— % 1RM will auto-fill weight' : '— enter to enable % 1RM'}</span>
        </div>
        ` : ''}
        <div style="padding:8px 12px 2px">
          <div style="display:grid;grid-template-columns:${GRID};gap:3px;margin-bottom:5px;align-items:end">
            ${colHeaders}
          </div>
          ${setsHtml}
          <button onclick="flushLogState();window._logBlocks[${bi}].sets.push({});renderLogExercises()" style="margin-top:5px;font-size:12px;color:var(--accent);background:none;border:none;cursor:pointer;padding:0;font-weight:600">+ Add set</button>
        </div>
      </div>
    `
  }).join('')
}

async function showLogSessionModal(clientId) {
  // showUserError: false — same false-positive-toast fix as saveRunnerSession: a failure here
  // already has a safe fallback (currentUser.id) and the modal still opens normally.
  const { data: clientRecord } = await dbq('showLogSessionModal:clientLookup', db.from('clients').select('coach_id').eq('id', clientId).single(), { showUserError: false })
  const coachId = clientRecord?.coach_id || currentUser.id
  // This was the ONLY workout_templates fetch missing these two filters — every sibling carries both.
  // Without them, logging a past session for a REAL client offered the coach's own PERSONAL templates
  // and every periodization week-clone ("Bench Press — W2") in the dropdown.
  const { data: templates } = await db
    .from('workout_templates')
    .select('*, workout_template_exercises(*)')
    .eq('coach_id', coachId)
    .is('client_id', null)
    .is('program_id', null)
    .is('generated_from_phase_id', null)
    .eq('is_personal', currentProfile?.role === 'solo')
    .order('name')

  window._logBlocks = []

  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.id = 'log-session-modal'
  overlay.innerHTML = `
    <div class="modal modal-fullscreen-mobile" style="max-width:580px;max-height:90vh;overflow-y:auto">
      <div class="modal-header">
        <h2 class="modal-title">Log session</h2>
        <button class="modal-close" onclick="closeModal('log-session-modal')">✕</button>
      </div>
      <div class="field-row">
        <div class="field">
          <label class="field-label">Session name <span style="color:var(--danger)">*</span></label>
          <input class="field-input" id="ls-name" placeholder="e.g. Upper Body A">
        </div>
        <div class="field">
          <label class="field-label">Date</label>
          <input class="field-input" id="ls-date" type="date" value="${new Date().toISOString().split('T')[0]}">
        </div>
      </div>
      <div class="field">
        <label class="field-label">Load from template</label>
        <select class="field-input" id="ls-template" onchange="loadTemplateIntoLog(this.value)">
          <option value="">— No template / custom —</option>
          ${(templates || []).map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('')}
        </select>
      </div>

      <div id="ls-exercises" style="margin-top:4px"></div>

      <button onclick="flushLogState();window._logBlocks.push({name:'',type:'strength',sets:[{}]});renderLogExercises();setTimeout(()=>{const blocks=document.querySelectorAll('#ls-exercises > div');const last=blocks[blocks.length-1];if(last){const inp=last.querySelector('input');if(inp)inp.focus()}},50)" style="margin:4px 0 12px;font-size:13px;color:var(--accent);background:none;border:none;cursor:pointer;padding:0;font-weight:600;display:block">+ Add exercise</button>

      <div class="field">
        <label class="field-label">Session notes</label>
        <textarea class="field-input" id="ls-notes" rows="2" style="resize:vertical" placeholder="How did the session go?"></textarea>
      </div>
      <p class="modal-error" id="ls-error"></p>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeModal('log-session-modal')">Cancel</button>
        <button class="btn-primary" onclick="saveWorkoutSession('${clientId}')">Save session</button>
      </div>
    </div>
  `
  mountModal(overlay)
  window._logTemplates = templates || []
}

function loadTemplateIntoLog(templateId) {
  const t = (window._logTemplates || []).find(t => t.id === templateId)
  window._logBlocks = []
  if (t) {
    document.getElementById('ls-name').value = t.name
    const sorted = (t.workout_template_exercises || []).sort((a, b) => a.order_index - b.order_index)
    sorted.forEach(ex => {
      const isCardio = ex.exercise_type === 'cardio'
      let sets = []
      if (ex.sets_json?.length) {
        sets = ex.sets_json.map(s => {
          if (isCardio) return { duration: s.duration || '', distance: s.distance || '' }
          const repsStr = String(s.reps || '')
          const [rMin, rMax] = repsStr.includes('-') ? repsStr.split('-') : [repsStr, '']
          return { repsMin: rMin, repsMax: rMax, weight: s.weight || '', pctMin: '', pctMax: '', effort: s.rpe || '', rest: s.rest ? fmtDuration(s.rest) : '' }
        })
      } else {
        const count = ex.sets || 3
        const repsStr = String(ex.reps || '')
        const [rMin, rMax] = repsStr.includes('-') ? repsStr.split('-') : [repsStr, '']
        for (let i = 0; i < count; i++) {
          if (isCardio) sets.push({ duration: '', distance: '' })
          else sets.push({ repsMin: rMin, repsMax: rMax, weight: ex.weight_kg || '', pctMin: '', pctMax: '', effort: '', rest: '' })
        }
      }
      window._logBlocks.push({ name: ex.exercise_name, type: ex.exercise_type || 'strength', effortMode: 'RPE', oneRM: '', sets })
    })
  }
  renderLogExercises()
}

async function saveWorkoutSession(clientId) {
  flushLogState()
  const name = document.getElementById('ls-name').value.trim()
  const errorEl = document.getElementById('ls-error')
  if (!name) { errorEl.textContent = 'Session name is required'; return }

  const blocks = window._logBlocks.filter(b => b.name.trim())
  if (blocks.length === 0) { errorEl.textContent = 'Add at least one exercise'; return }

  // Derive coach_id from the client record — works for both coach and client self-logging.
  // showUserError: false — same false-positive-toast fix as saveRunnerSession: a failure here
  // already has a safe fallback (currentUser.id) and the save continues normally.
  const { data: clientRecord } = await dbq('saveWorkoutSession:clientLookup', db.from('clients').select('coach_id').eq('id', clientId).single(), { showUserError: false })
  const coachId = clientRecord?.coach_id || currentUser.id

  log.info('saveWorkoutSession', 'saving session', { clientId, name, exerciseCount: blocks.length })
  const { data: sessionLog, error } = await db.from('workout_logs').insert({
    coach_id:    coachId,
    client_id:   clientId,
    template_id: document.getElementById('ls-template').value || null,
    name,
    date:        document.getElementById('ls-date').value,
    notes:       document.getElementById('ls-notes').value.trim() || null
  }).select().single()

  if (error) { log.error('saveWorkoutSession', 'workout_logs insert failed', error); errorEl.textContent = error.message; return }
  log.ok('saveWorkoutSession', 'workout log created', { logId: sessionLog.id })

  // Resolve exercise names to library ids in parallel, not one lookup-per-block -- dedupe by
  // trimmed/lowercased name first so two blocks sharing a name (e.g. two "Bench Press" blocks)
  // don't race the same resolve-or-create check and risk creating a duplicate library entry.
  const uniqueNames = [...new Set(blocks.map(b => b.name.trim().toLowerCase()))]
  const resolvedIds = await Promise.all(uniqueNames.map(n => _resolveExerciseIdForSave(n, coachId)))
  const idByName = Object.fromEntries(uniqueNames.map((n, i) => [n, resolvedIds[i]]))

  const exerciseRows = blocks.map((block, bi) => ({
    log_id:        sessionLog.id,
    exercise_id:   idByName[block.name.trim().toLowerCase()],
    exercise_name: block.name.trim(),
    exercise_type: block.type,
    order_index:   bi
  }))
  const { data: insertedExercises, error: exErr } = await db.from('workout_log_exercises').insert(exerciseRows).select()
  if (exErr) {
    log.error('saveWorkoutSession', 'exercises batch insert failed', exErr)
    await db.from('workout_logs').delete().eq('id', sessionLog.id)
    errorEl.textContent = exErr.message
    return
  }
  // Correlate by order_index, not response array position -- see saveRunnerSession for why.
  const exerciseIdByOrderIndex = Object.fromEntries(insertedExercises.map(r => [r.order_index, r.id]))
  const insertedExerciseIds = insertedExercises.map(r => r.id)

  const allSets = []
  blocks.forEach((block, bi) => {
    const logExId = exerciseIdByOrderIndex[bi]
    block.sets.forEach((s, si) => {
      const row = { workout_log_exercise_id: logExId, set_number: si + 1 }
      if (block.type === 'cardio') {
        if (s.duration) row.duration_seconds = parseDuration(s.duration)
        if (s.distance) row.distance_m = Math.round(parseFloat(s.distance) * 1000)
      } else {
        const rMin = parseInt(s.repsMin)
        if (!isNaN(rMin)) row.reps_achieved = rMin
        if (s.weight) row.weight_kg = parseFloat(s.weight)
        if (s.effort) {
          row.effort_type = block.effortMode === 'RIR' ? 'rir' : 'rpe'
          row.effort_value = parseFloat(s.effort)
        }
        if (s.rest) row.notes = (row.notes || '') + `rest:${s.rest}`
      }
      if (Object.keys(row).length > 2) allSets.push(row)
    })
  })

  if (allSets.length) {
    const { error: setsErr } = await db.from('workout_log_sets').insert(allSets)
    if (setsErr) {
      log.error('saveWorkoutSession', 'sets batch insert failed', setsErr)
      // Batched sets means an all-or-nothing failure now -- roll back the exercises + log too,
      // matching saveRunnerSession, instead of leaving a log with zero real set data behind.
      await db.from('workout_log_exercises').delete().in('id', insertedExerciseIds)
      await db.from('workout_logs').delete().eq('id', sessionLog.id)
      errorEl.textContent = setsErr.message
      return
    }
    log.ok('saveWorkoutSession', 'sets saved', { count: allSets.length })
  }

  log.ok('saveWorkoutSession', 'session fully saved', { clientId, name })
  showToast('Session saved ✓', 'success', 2000)
  closeModal('log-session-modal')
  window._logBlocks = []
  const tabContent = document.getElementById('tab-content')
  if (tabContent) renderClientWorkouts(clientId, tabContent)
  else renderClientDashboard(document.getElementById('main-content'))
}

async function openWorkoutLog(logId, clientId) {
  // This screen is reachable by a CLIENT from their own session history (app-workouts.js), and it had
  // no role check at all: it rendered the coach's Delete button and an editable "Coach notes" box to
  // the very person the notes are written about. A client could overwrite their coach's feedback, or
  // delete the session. Solo is its own coach, so solo keeps the coach controls.
  const _isCoachView = currentProfile?.role !== 'client'
  const el = document.getElementById('tab-content') || document.getElementById('main-content')
  el.innerHTML = '<div class="loading-state">Loading…</div>'

  // Fetch log + exercises. workout_log_sets lacks an FK to workout_log_exercises in the schema,
  // so we fetch sets separately and merge rather than using nested PostgREST join.
  const { data: logRow, error: logErr } = await db
    .from('workout_logs')
    .select('*, workout_log_exercises(*)')
    .eq('id', logId)
    .single()
  if (logErr) { log.error('openWorkoutLog', 'fetch failed', logErr); el.innerHTML = `<div class="empty-state"><div class="empty-text">Error loading session: ${logErr.message}</div></div>`; return }

  const exIds = (logRow?.workout_log_exercises || []).map(e => e.id)
  const { data: allSets, error: setsErr } = exIds.length
    ? await db.from('workout_log_sets').select('*').in('workout_log_exercise_id', exIds).order('set_number')
    : { data: [], error: null }
  if (setsErr) log.error('openWorkoutLog', 'sets fetch failed', setsErr)

  // Merge sets back onto exercises — rename to `session` to avoid shadowing the log utility
  const session = { ...logRow, workout_log_exercises: (logRow?.workout_log_exercises || []).map(ex => ({ ...ex, workout_log_sets: (allSets || []).filter(s => s.workout_log_exercise_id === ex.id) })) }

  const exercises = (session.workout_log_exercises || []).sort((a, b) => a.order_index - b.order_index)
  const dateStr = new Date(session.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  // Fetch previous session with same name for comparison
  let prevSession = null
  const { data: prevLog } = await db.from('workout_logs')
    .select('id, date, workout_log_exercises(*)')
    .eq('client_id', clientId).eq('name', session.name)
    .lt('date', session.date).order('date', { ascending: false }).limit(1).single()
  if (prevLog) {
    const prevExIds = (prevLog.workout_log_exercises || []).map(e => e.id)
    const { data: prevSets } = prevExIds.length
      ? await db.from('workout_log_sets').select('*').in('workout_log_exercise_id', prevExIds)
      : { data: [] }
    prevSession = { ...prevLog, workout_log_exercises: (prevLog.workout_log_exercises || []).map(ex => ({ ...ex, workout_log_sets: (prevSets || []).filter(s => s.workout_log_exercise_id === ex.id) })) }
  }

  // Compute summary stats
  const allSetsFlat = exercises.flatMap(ex => ex.workout_log_sets || [])
  const totalSets   = allSetsFlat.length
  const totalVol    = allSetsFlat.reduce((sum, s) => sum + ((parseFloat(s.weight_kg)||0) * (parseInt(s.reps_achieved)||0)), 0)
  const prevSetsFlat = prevSession ? (prevSession.workout_log_exercises || []).flatMap(ex => ex.workout_log_sets || []) : []
  const prevVol      = prevSetsFlat.reduce((sum, s) => sum + ((parseFloat(s.weight_kg)||0) * (parseInt(s.reps_achieved)||0)), 0)
  const volDelta     = prevSession ? totalVol - prevVol : null

  // Build a map of exercise name → prev sets for per-exercise comparison
  const prevExMap = {}
  if (prevSession) {
    for (const ex of (prevSession.workout_log_exercises || [])) {
      prevExMap[ex.exercise_name] = ex.workout_log_sets || []
    }
  }

  const thStyle = `text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);padding:0 12px 8px 0`

  el.innerHTML = `
    <a class="back-btn" href="#" onclick="backToClientWorkouts('${clientId}');return false">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
      All sessions
    </a>

    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:16px;flex-wrap:wrap">
      <div>
        <h2 style="font-size:20px;font-weight:700;margin-bottom:4px">${escapeHtml(session.name)}</h2>
        <p style="color:var(--text-muted)">${dateStr}</p>
      </div>
      ${_isCoachView ? `<button class="btn-danger" style="font-size:13px;padding:6px 12px" onclick="deleteWorkoutLog('${logId}','${clientId}')">Delete</button>` : ''}
    </div>

    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:20px">
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:10px 12px;text-align:center">
        <div style="font-size:17px;font-weight:700">${totalVol > 0 ? Math.round(totalVol).toLocaleString()+' kg' : '—'}</div>
        <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-top:2px">Volume</div>
        ${volDelta !== null && totalVol > 0 ? `<div style="font-size:11px;font-weight:600;margin-top:3px;color:${volDelta >= 0 ? '#10b981' : '#ef4444'}">${volDelta >= 0 ? '+' : ''}${Math.round(volDelta).toLocaleString()} kg</div>` : ''}
      </div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:10px 12px;text-align:center">
        <div style="font-size:17px;font-weight:700">${totalSets}</div>
        <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-top:2px">Sets</div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:10px 12px;text-align:center">
        <div style="font-size:17px;font-weight:700">${exercises.length}</div>
        <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-top:2px">Exercises</div>
      </div>
    </div>

    ${exercises.length === 0 ? `<div class="empty-state"><div class="empty-text">No exercises recorded</div></div>` :
      exercises.map((ex, i) => {
        const sets = (ex.workout_log_sets || []).sort((a, b) => a.set_number - b.set_number)
        const isCardio = ex.exercise_type === 'cardio'
        const hasRpe   = !isCardio && sets.some(s => s.effort_value != null)
        const prevSets = prevExMap[ex.exercise_name] || []
        const prevVol  = prevSets.reduce((sum, s) => sum + ((parseFloat(s.weight_kg)||0) * (parseInt(s.reps_achieved)||0)), 0)
        const prevSummary = prevSets.length
          ? (isCardio
              ? `${prevSets.length} set${prevSets.length > 1 ? 's' : ''}`
              : prevVol > 0 ? `${Math.round(prevVol).toLocaleString()} kg volume` : `${prevSets.length} set${prevSets.length > 1 ? 's' : ''}`)
          : null
        return `
          <div class="card" style="margin-bottom:12px">
            <div class="card-body">
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
                <div style="width:26px;height:26px;border-radius:50%;background:rgba(99,102,241,.12);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--accent);flex-shrink:0">${i+1}</div>
                <span style="font-weight:600;font-size:15px">${escapeHtml(ex.exercise_name)}</span>
                ${isCardio ? `<span style="font-size:11px;font-weight:600;padding:1px 7px;border-radius:4px;background:rgba(6,182,212,.12);color:#06b6d4">Cardio</span>` : ''}
              </div>
              ${prevSummary ? `<div style="font-size:11px;color:var(--text-muted);margin-left:36px;margin-bottom:10px">Last time: ${prevSummary}</div>` : `<div style="margin-bottom:10px"></div>`}
              ${sets.length === 0 ? `<div style="color:var(--text-muted);font-size:13px">No sets recorded</div>` : `
                <table style="width:100%;border-collapse:collapse">
                  <thead>
                    <tr style="border-bottom:1px solid var(--border)">
                      <th style="${thStyle}">Set</th>
                      ${isCardio
                        ? `<th style="${thStyle}">Duration</th><th style="${thStyle}">Distance</th>`
                        : `<th style="${thStyle}">Reps</th><th style="${thStyle}">Weight</th>${hasRpe ? `<th style="${thStyle}">RPE</th>` : ''}`
                      }
                    </tr>
                  </thead>
                  <tbody>
                    ${sets.map(s => `
                      <tr style="border-bottom:1px solid var(--border)">
                        <td style="padding:8px 12px 8px 0;font-size:13px;color:var(--text-muted);font-weight:600">Set ${s.set_number}</td>
                        ${isCardio
                          ? `<td style="padding:8px 12px 8px 0;font-size:13px">${s.duration_seconds ? fmtDuration(s.duration_seconds) : '—'}</td><td style="padding:8px 0;font-size:13px">${s.distance_m ? (s.distance_m/1000).toFixed(2)+' km' : '—'}</td>`
                          : `<td style="padding:8px 12px 8px 0;font-size:13px">${s.reps_achieved || '—'}</td><td style="padding:8px 12px 8px 0;font-size:13px">${s.weight_kg ? s.weight_kg+' kg' : '—'}</td>${hasRpe ? `<td style="padding:8px 0;font-size:13px">${s.effort_value != null ? 'RPE '+s.effort_value : '—'}</td>` : ''}`
                        }
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              `}
            </div>
          </div>
        `
      }).join('')
    }
    <div class="card" style="margin-top:8px">
      <div class="card-body">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:8px">Coach notes</div>
        ${_isCoachView
          ? `<textarea id="wl-coach-notes" class="field-input" rows="3" placeholder="Add coaching feedback, cues, or observations…" style="resize:vertical">${escapeHtml(session.notes)}</textarea>
             <button onclick="saveCoachNotes('${logId}')" class="btn-primary" style="margin-top:8px;font-size:13px;padding:7px 16px">Save notes</button>
             <span id="wl-notes-saved" style="display:none;margin-left:10px;font-size:12px;color:#10b981;font-weight:600">Saved ✓</span>`
          : session.notes
            ? `<div style="white-space:pre-wrap;font-size:14px;line-height:1.5">${escapeHtml(session.notes)}</div>`
            : `<div style="font-size:13px;color:var(--text-muted)">No notes from your coach yet.</div>`}
      </div>
    </div>
  `
}

function backToClientWorkouts(clientId) {
  if (document.getElementById('tab-content')) {
    renderClientWorkouts(clientId, document.getElementById('tab-content'))
  } else {
    navigate('workouts')
  }
}

async function saveCoachNotes(logId) {
  // Defence in depth. The UI no longer renders this control for a client, but the function is on
  // window and callable from DevTools, and the query anchored on `id` alone — leaning entirely on RLS,
  // which very plausibly permits a client to write their own workout_logs row. Coach notes are the
  // coach's, not the client's.
  if (currentProfile?.role === 'client') { log.warn('saveCoachNotes', 'blocked: coach notes are not client-writable'); return }
  const notes = document.getElementById('wl-coach-notes')?.value.trim() || null
  const { error } = await db.from('workout_logs').update({ notes }).eq('id', logId).eq('coach_id', currentUser.id)
  if (error) { log.error('saveCoachNotes', 'update failed', error); return }
  const saved = document.getElementById('wl-notes-saved')
  if (saved) { saved.style.display = 'inline'; setTimeout(() => saved.style.display = 'none', 2000) }
}

async function deleteWorkoutLog(logId, clientId) {
  // Same reasoning as saveCoachNotes: the button is no longer rendered for a client, but the function
  // is callable from the console and the delete anchored on `id` alone.
  if (currentProfile?.role === 'client') { log.warn('deleteWorkoutLog', 'blocked: clients cannot delete sessions'); return }
  if (!confirm('Delete this session? This cannot be undone.')) return
  log.info('deleteWorkoutLog', 'deleting session', { logId })
  const { error } = await db.from('workout_logs').delete().eq('id', logId).eq('coach_id', currentUser.id)
  if (error) { log.error('deleteWorkoutLog', 'delete failed', error); return }
  log.ok('deleteWorkoutLog', 'session deleted', { logId })
  backToClientWorkouts(clientId)
}

// ─── UTILS ────────────────────────────────────────────────────────────────────
function closeModal(id) {
  document.getElementById(id)?.remove()
}

// ─── PERFORMANCE TRACKING ─────────────────────────────────────────────────────

const PERF_CATEGORIES = [
  { id: 'strength',    label: 'Strength',     units: ['kg', 'lbs'],              placeholder: 'e.g. Squat 1RM, Bench Press' },
  { id: 'cardio',      label: 'Cardio',       units: ['min', 'sec', 'km', 'mi'], placeholder: 'e.g. 5k Run, 400m Sprint' },
  { id: 'body_metric', label: 'Body Metric',  units: ['cm', 'in', 'kg', 'lbs'],  placeholder: 'e.g. Vertical Jump, Broad Jump' },
  { id: 'benchmark',   label: 'Benchmark',    units: ['min', 'sec', 'reps'],     placeholder: 'e.g. Fran, Cindy, Murph' },
]

const PERF_COLOURS = {
  strength:    '#6366f1',
  cardio:      '#06b6d4',
  body_metric: '#f59e0b',
  benchmark:   '#22c55e',
}

