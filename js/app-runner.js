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
  // Interval exercises store ONE sets_json entry describing the whole block, so the generic
  // `targetSets: ex.sets_json?.length || 3` above always comes out as 1 (or 3, on a legacy fallback)
  // for them — expand now so targetSets reflects the real work-round count everywhere it's read
  // (round labels, badges, hitTarget checks), not the raw row count.
  exercises.forEach(ex => { if (_isIntervalExercise(ex)) _initIntervalPhases(ex) })
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
  // height_cm/distance_m added alongside weight_kg/reps_achieved (2026-07-29) — jump sets never
  // write weight_kg, so they were invisibly excluded from "last session" everywhere below.
  let exRows = exerciseId
    ? (await db.from('workout_log_exercises').select('log_id, workout_log_sets(set_number, weight_kg, reps_achieved, height_cm, distance_m)').eq('exercise_id', exerciseId).in('log_id', logIds)).data
    : null
  if (!exRows?.length) {
    exRows = (await db.from('workout_log_exercises').select('log_id, workout_log_sets(set_number, weight_kg, reps_achieved, height_cm, distance_m)').eq('exercise_name', exName).in('log_id', logIds)).data
  }
  if (!exRows?.length) { _runner.lastSession[exName] = null; return }

  // Pick the occurrence from the most recent log (logs is already date-desc ordered)
  const best = exRows.sort((a, b) =>
    logs.findIndex(l => l.id === a.log_id) - logs.findIndex(l => l.id === b.log_id)
  )[0]
  const date = logs.find(l => l.id === best.log_id)?.date
  // A jump set can be logged with height_cm/distance_m set and reps_achieved (contacts) still
  // null (contacts aren't required to log a jump) — must count as real data too. A truthy check
  // on any of these four also excludes a real 0 (0cm/0m/0kg/0 reps) — same falsy-zero shape as the
  // save-side guards, found via the blast-radius sweep for that fix, 2026-07-30. This is very
  // likely the actual mechanism behind "Depth Jump last-session history doesn't show": a jump set
  // logged with height_cm:0 and no reps was invisible here even after it saved correctly.
  const sets = (best.workout_log_sets || [])
    .filter(s => _hasNumVal(s.weight_kg) || _hasNumVal(s.reps_achieved) || _hasNumVal(s.height_cm) || _hasNumVal(s.distance_m))
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
              ${s.weight_kg ? fmtWeight(Math.round(s.weight_kg * 10) / 10) : ''}${s.weight_kg && s.reps_achieved ? ' × ' : ''}${s.reps_achieved ? s.reps_achieved : ''}
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
  // Delegates to the shared resolver (app-workouts.js) so the runner and the builder agree on what a
  // legacy exercise's type is. Was: `if (ex.metricType) return ex.metricType` — which, because
  // launchRunner sets `metricType: ex.metric_type || 'weight_reps'` (always truthy), made the
  // legacy-flag fallback below dead code, so legacy unilateral/timed exercises logged as weight×reps.
  return _resolveMetricType(ex.metricType, ex.type, ex.sets_json?.[0])
}

function _isPlainStrengthExercise(ex) {
  if (!ex) return false
  return _METRIC_TABLE_TYPES.has(_exMetricType(ex))
}

// ── Workstream C — live "vs last session" totals for the current exercise ────────────────────────
// SetGraph-informed (our flat style + wording). weight_reps only: _runner.lastSession stores just
// weight/reps, and current loggedSets are {weight,reps} for this type. Returns null when not
// applicable (no previous session, nothing logged this session yet, or a non-weight_reps type).
function _runnerVsLast(ex) {
  if (!ex || _exMetricType(ex) !== 'weight_reps') return null
  const prev = _runner?.lastSession?.[ex.name]?.sets
  if (!prev?.length) return null // needs a previous session to compare against; shows from the moment you reach the exercise
  const cur = ex.loggedSets || []
  const num = v => parseFloat(v) || 0
  const cv = { sets: cur.length, reps: cur.reduce((s, x) => s + (parseInt(x.reps) || 0), 0),
    vol: cur.reduce((s, x) => s + num(x.weight) * (parseInt(x.reps) || 0), 0), top: Math.max(0, ...cur.map(x => num(x.weight))) }
  const pv = { sets: prev.length, reps: prev.reduce((s, x) => s + (parseInt(x.reps_achieved) || 0), 0),
    vol: prev.reduce((s, x) => s + num(x.weight_kg) * (parseInt(x.reps_achieved) || 0), 0), top: Math.max(0, ...prev.map(x => num(x.weight_kg))) }
  return { cur: cv, prev: pv, logged: cur.length > 0, date: _runner.lastSession[ex.name].date }
}

function _renderRunnerVsLast(ex) {
  const d = _runnerVsLast(ex)
  if (!d) return ''
  const dateStr = new Date(d.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  // `cur`/`prev`/`diff`/`pct` are computed in canonical kg throughout — only the DISPLAYED numbers
  // convert to the user's preference; percentage change is unit-invariant so it never needs converting.
  const chip = (label, cur, prev, isWeight) => {
    const unit = isWeight ? window._unitPrefs.weight : ''
    // Round to 1 decimal FIRST (matches this chip's original always-rounded kg display), then convert
    // — weightToPref passes a kg value through unchanged, so the kg case still shows exactly the same
    // number it always did; only the lb case adds a second (harmless) round on the converted value.
    const disp = v => isWeight ? weightToPref(Math.round(v * 10) / 10) : Math.round(v * 10) / 10
    let bottom
    if (!d.logged) {
      // Before your first set this session: show last session's number as the target to beat.
      bottom = `<span style="color:var(--text-muted)">last ${disp(prev)}${unit}</span>`
    } else {
      const diff = cur - prev, flat = Math.abs(diff) < 0.005, up = diff > 0
      const pct = prev ? Math.round(Math.abs(diff) / prev * 100) : null
      const col = flat ? 'var(--text-muted)' : (up ? '#16a34a' : '#ef4444')
      bottom = flat ? `<span style="color:var(--text-muted)">—</span>`
        : `<span style="color:${col}">${up ? '▲' : '▼'} ${up ? '+' : '−'}${disp(Math.abs(diff))}${unit}${pct != null ? ` (${pct}%)` : ''}</span>`
    }
    return `<div style="flex:1;min-width:0;text-align:center">
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted)">${label}</div>
      <div style="font-size:13px;font-weight:800">${disp(cur)}${unit}</div>
      <div style="font-size:9px;font-weight:700;white-space:nowrap">${bottom}</div></div>`
  }
  const heading = d.logged ? `vs last session · ${dateStr}` : `last session · ${dateStr} · beat it`
  return `
    <div style="margin-bottom:12px;padding:10px 12px;border-radius:10px;background:var(--surface-2)">
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:6px">${heading}</div>
      <div style="display:flex;gap:6px">
        ${chip('Volume', d.cur.vol, d.prev.vol, true)}
        ${chip('Top', d.cur.top, d.prev.top, true)}
        ${chip('Reps', d.cur.reps, d.prev.reps, false)}
        ${chip('Sets', d.cur.sets, d.prev.sets, false)}
      </div>
    </div>`
}

function _prevSetsByIndex(ex) {
  const sets = _runner?.lastSession?.[ex.name]?.sets
  const map = {}
  if (sets) sets.forEach(s => { map[s.set_number - 1] = s })
  return map
}

// A numeric value is "present" whenever it isn't null/undefined/''. A real 0 (a bodyweight-only
// load, or a 0cm/0m jump attempt) must count as present — `!w`/`w &&` treat 0 as missing, which
// silently blocked entry and then silently dropped the value on save. Found for weight (Jake,
// 2026-07-29); the identical shape existed for jump height_cm/distance_m too, reported the same day
// once the weight fix shipped and Jake tried 0 on a Depth Jump instead.
const _hasNumVal = w => w != null && w !== ''

// Blank row shape for a fresh table set, per metric_type. Shared by _ensureTableRows (initial fill)
// and addTableRow (appended set) so the shape literal isn't duplicated in two places.
function _blankTableRow(ex) {
  const mt = _exMetricType(ex)
  if (mt === 'unilateral') return { leftWeight: ex.bodyweight ? 'BW' : '', leftReps: '', rightWeight: ex.bodyweight ? 'BW' : '', rightReps: '', done: false }
  if (mt === 'timed_hold') return { duration: '', weight: ex.bodyweight ? 'BW' : '', done: false }
  if (mt === 'jump_height') return { height_cm: '', reps: '', done: false }
  if (mt === 'jump_distance') return { distance_m: '', reps: '', done: false }
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
    if (mt === 'timed_hold') return { duration: r.duration || null, weight: _hasNumVal(r.weight) ? r.weight : null }
    if (mt === 'jump_height') return { height_cm: _hasNumVal(r.height_cm) ? r.height_cm : null, reps: r.reps || null }
    if (mt === 'jump_distance') return { distance_m: _hasNumVal(r.distance_m) ? r.distance_m : null, reps: r.reps || null }
    return { weight: _hasNumVal(r.weight) ? r.weight : null, reps: r.reps }
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
      if (!_hasNumVal(row.height_cm)) { showToast('Enter a height first', 'warn'); return }
    } else if (mt === 'jump_distance') {
      if (!_hasNumVal(row.distance_m)) { showToast('Enter a distance first', 'warn'); return }
    } else {
      if (!row.reps) { showToast('Enter reps first', 'warn'); return }
      if (!ex.bodyweight && !_hasNumVal(row.weight)) { showToast('Enter weight first', 'warn'); return }
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
    const secs = _hasTimeTarget(tgt.duration) ? (parseRest(tgt.duration)||0) : (tgt.repsMin ? parseInt(tgt.repsMin) : null)
    const durDisplay = secs != null ? (Math.floor(secs/60)+':'+String(secs%60).padStart(2,'0')) : null
    if (durDisplay) cols.push({ val: durDisplay, label: 'DURATION', accent: true })
  }
  // Jump targets (2026-07-22). Until now there was no jump branch at all, so jump_height/jump_distance
  // rendered a target bar with nothing to aim at — capture and charting worked, but the coach could
  // not prescribe. Label REPS as JUMPS here: for a jump, a "rep" is a contact.
  const mt = _exMetricType(ex)
  if (mt === 'jump_height' && tgt.targetHeightCm) cols.push({ val: fmtJumpHeight(tgt.targetHeightCm, { spaced: true }), label: 'TARGET', accent: true })
  if (mt === 'jump_distance' && tgt.targetDistanceM) cols.push({ val: escapeHtml(tgt.targetDistanceM+' m'), label: 'TARGET', accent: true })
  // Jumps prescribe a contact-count RANGE, same as reps for every other set type (2026-08-02 —
  // the builder now offers a second box for jump reps too, so this no longer needs a single-value
  // special case).
  const repsStr = !tgt.timed && tgt.repsMin ? (tgt.repsMin+(tgt.repsMax&&tgt.repsMax!==tgt.repsMin?'–'+tgt.repsMax:'')) : null
  // sets_json is an unvalidated JSONB blob (coach-authored, no schema enforcement) — every raw field
  // below is escaped at the point it enters `cols`, same discipline as the pre-existing `tempo` escape,
  // rather than trusted because the builder's own inputs happen to be numeric today. Found by the
  // 2026-07-30 weekly full-file review: this whole function escaped tempo only, leaving reps/%1RM/
  // effort/rest raw into _renderTargetBarHtml's innerHTML sink.
  if (repsStr) cols.push({ val: escapeHtml(repsStr), label: mt === 'jump_height' || mt === 'jump_distance' ? 'JUMPS' : 'REPS', accent: true })
  // A stale `weight` survives a metric_type switch (flushTemplateSets preserves un-rendered
  // fields), so a jump set can still carry one — don't render two columns both labelled TARGET.
  const isJumpMt = mt === 'jump_height' || mt === 'jump_distance'
  if (tgt.weight && !isJumpMt) cols.push({ val: fmtWeight(tgt.weight, { spaced: true }), label: 'TARGET', accent: true })
  let needsOneRM = false
  // %1RM only means something on a type that HAS a weight to derive — weight_reps and unilateral.
  // A jump has no weight input at all and a timed hold's cell never consumes the derived kg, so on
  // those the banner promises a target it structurally cannot deliver. Same stale-field class the
  // `tgt.weight` guard above already handles.
  const takesLoad = mt === 'weight_reps' || mt === 'unilateral'
  if (tgt.intensityMin && takesLoad) {
    // Always the PERCENTAGE — the derived kg lives in the KG field's ghost text (see wPlaceholder in
    // renderStrengthTable), so showing it here too spent a whole column repeating one number.
    const pct = tgt.intensityMin + (tgt.intensityMax && tgt.intensityMax !== tgt.intensityMin ? '–' + tgt.intensityMax : '')
    if (!ex.oneRM) needsOneRM = true   // banner still offers to set it; without a 1RM there is no kg to ghost
    cols.push({ val: escapeHtml(pct) + '%', label: '1RM TARGET', accent: true })
  }
  // Value carries the NUMBER only — the column's own label already says RPE or RIR, so prefixing
  // the value with it just says the same word twice ("RPE / RPE 8–9"). Jake, 2026-07-11.
  if (tgt.effortMin) cols.push({ val: escapeHtml(tgt.effortMin+(tgt.effortMax&&tgt.effortMax!==tgt.effortMin?'–'+tgt.effortMax:'')), label: tgt.effortType==='rir'?'RIR':'RPE' })
  if (tgt.restMin && tgt.restMin !== '0:00') cols.push({ val: escapeHtml(tgt.restMin+(tgt.restMax&&tgt.restMax!==tgt.restMin?'–'+tgt.restMax:'')), label: 'REST' })
  if (tgt.tempo && takesLoad) cols.push({ val: escapeHtml(tgt.tempo), label: 'TEMPO' })
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
  // Gated on _restForExIdx, not just restRemaining != null — a rest can now be running for a
  // DIFFERENT exercise (2026-07-29 redesign) and must not paint this exercise's inline bar.
  if (_runner.restRemaining != null && _runner._restForExIdx === _runner.exIdx) {
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
  // EVERY table metric type has a prescription worth showing, not just the rep-based ones. This gate
  // read `weight_reps || unilateral` with the comment "%1RM/rep targets only apply to these" — true
  // when written, stale since 2026-07-22 when jumps gained target height/distance + jumps-per-set and
  // timed holds already had duration/load. The effect was that the jump branch added to
  // _buildTargetCols that same day was DEAD CODE: the columns were computed and never rendered, so a
  // jump exercise showed no target, no rest and no RPE (Jake: "missing the wizard entirely").
  // _renderTargetBarHtml returns '' for an empty column list, so widening this cannot produce an
  // empty bar for a type with nothing prescribed.
  const showTargets = _METRIC_TABLE_TYPES.has(mt)
  // `tableRows` always holds CANONICAL kg/cm — same as loggedSets and the eventual DB write. `unit`
  // ('weight'|'jumpHeight') is the only thing that makes a cell preference-aware: the DISPLAYED value
  // is converted for show (weightToPref/jumpHeightToPref), and the typed value is converted back to
  // canonical (weightFromPref/jumpHeightFromPref) before it's written into tableRows — so every
  // consumer downstream of tableRows (volume calc, loggedSets, the save path) keeps working in kg/cm
  // exactly as before, untouched by this feature.
  const inCell = (i, row, field, { mode = 'decimal', step = '', ph = '—', fmt = false, unit = null } = {}) => {
    const toDisplay = v => unit === 'weight' ? weightToPref(v) : unit === 'jumpHeight' ? jumpHeightToPref(v) : v
    const parseFn = unit === 'weight' ? 'weightFromPref' : unit === 'jumpHeight' ? 'jumpHeightFromPref' : null
    const bind = fmt
      ? `this.value=fmtRestInput(this.value);_runner.exercises[${_runner.exIdx}].tableRows[${i}].${field}=this.value`
      : parseFn
        ? `_runner.exercises[${_runner.exIdx}].tableRows[${i}].${field}=${parseFn}(this.value)`
        : `_runner.exercises[${_runner.exIdx}].tableRows[${i}].${field}=this.value`
    return `<input type="${fmt ? 'text' : 'number'}" inputmode="${mode}" ${step ? `step="${step}"` : ''} value="${escapeHtml(String(toDisplay(row[field]) ?? ''))}" placeholder="${escapeHtml(String(ph ?? ''))}"
      oninput="${bind}"
      style="flex:1;min-width:0;padding:8px 4px;font-size:16px;font-weight:700;text-align:center;border:1.5px solid ${row.done ? 'var(--border)' : 'var(--accent)'};border-radius:8px;background:var(--bg);color:var(--text);box-sizing:border-box;-moz-appearance:textfield">`
  }
  const inDone = (i, row) => `<button onclick="toggleTableSet(${i})" aria-label="${row.done?'Mark set incomplete':'Mark set complete'}" style="width:44px;height:44px;flex-shrink:0;border-radius:8px;border:${row.done?'none':'2px solid #9ca3af'};font-size:18px;font-weight:800;cursor:pointer;background:${row.done?'var(--success)':'#fff'};color:${row.done?'#fff':'transparent'}">✓</button>`
  // Deliberately SMALLER than the 44x44 complete-set tick above: the destructive action must not be the
  // easier target mid-set. Jake asked twice (2026-07-13, 2026-07-23). aria-label carries the full meaning
  // for screen readers, so the shrunk visual label costs nothing there.
  // margin-left stays >=8px — a separate Jake request from 2026-07-05 (deliberate spacing so the delete
  // is not mis-tapped) with its own regression test. Smaller AND spaced; the two are not in conflict.
  const inDel = (i) => ex.tableRows.length > 1 ? `<button onclick="deleteTableRow(${i})" aria-label="Delete set ${i+1}" style="width:32px;height:32px;flex-shrink:0;margin-left:8px;border:none;border-radius:6px;cursor:pointer;background:var(--danger-light);color:var(--danger);font-size:15px;font-weight:700;line-height:1;display:flex;align-items:center;justify-content:center">&times;</button>` : ''
  const inSetNum = (i, isCurrent) => `<span style="width:22px;flex-shrink:0;font-size:13px;font-weight:700;color:${isCurrent?'var(--accent)':'var(--text-muted)'};text-align:center">${i+1}</span>`

  const rows = ex.tableRows.map((row, i) => {
    const prev = prevMap[i]
    // The %1RM-derived load, computed once for every metric_type. The target bar shows the PERCENTAGE
    // (2026-07-23) so this ghost is the only place the actual kg appears — it must therefore reach
    // unilateral too, not just weight_reps. A bodyweight set renders 'BW' and has no input to ghost,
    // which is correct: there is no load to prescribe.
    const rowTgt0 = ex.sets_json?.[i]
    // The %1RM rounding (nearest 2.5kg, a barbell-plate constraint) stays in kg regardless of
    // preference — only the DISPLAYED number converts, same as every other weight ghost value.
    const oneRMPh = (rowTgt0?.intensityMin && ex.oneRM)
      ? weightToPref(_calcWeightFromPct(ex.oneRM, rowTgt0.intensityMin)) + (rowTgt0.intensityMax && rowTgt0.intensityMax !== rowTgt0.intensityMin ? '–' + weightToPref(_calcWeightFromPct(ex.oneRM, rowTgt0.intensityMax)) : '')
      : ''
    // The row for the set you're currently on is highlighted so it's visually obvious which set the
    // target bar above applies to (Jake: "highlighted, not entered as text underneath — ugly UI").
    const isCurrent = i === curIdx
    const cardOpen = `<div style="padding:7px 6px;margin:0 -6px;border-radius:8px;border-bottom:1px solid var(--border);${isCurrent ? 'background:rgba(99,102,241,.08)' : ''}">`

    if (mt === 'unilateral') {
      // Two sub-rows per set (L then R) — keeps the table to two data columns on a 390px phone rather
      // than cramming four. One ✓ logs the whole set; _syncLoggedSetsFromTable emits both sides.
      const side = (label, wField, rField) => `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
        <span style="width:14px;flex-shrink:0;font-size:11px;font-weight:800;color:var(--text-muted);text-align:center">${label}</span>
        ${ex.bodyweight ? `<div style="flex:1;text-align:center;font-size:13px;font-weight:700;color:var(--text)">BW</div>` : inCell(i, row, wField, { mode:'decimal', step:'0.5', ph: oneRMPh || window._unitPrefs.weight, unit:'weight' })}
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
        ${ex.bodyweight ? `<div style="flex:1;text-align:center;font-size:15px;font-weight:700;color:var(--text)">BW</div>` : inCell(i, row, 'weight', { mode:'decimal', step:'0.5', ph:window._unitPrefs.weight, unit:'weight' })}
        ${inDone(i, row)}${inDel(i)}
      </div></div>`
    }

    if (mt === 'jump_height' || mt === 'jump_distance') {
      const f = mt === 'jump_height' ? 'height_cm' : 'distance_m'
      // Ghost the PRESCRIBED target (builder: target height / target distance, 2026-07-22) rather than
      // a bare unit, matching how the weight column ghosts its %1RM target. Jump DISTANCE stays
      // metric-only; jump HEIGHT respects the preference.
      const tgtVal = mt === 'jump_height' ? rowTgt0?.targetHeightCm : rowTgt0?.targetDistanceM
      // Target takes priority when prescribed; last session is the fallback, same order the
      // weight_reps branch below already uses for its own ghost text (2026-07-29).
      const ph = mt === 'jump_height'
        ? (tgtVal != null ? jumpHeightToPref(tgtVal) : prev?.height_cm != null ? jumpHeightToPref(prev.height_cm) : window._unitPrefs.jumpHeight)
        : (tgtVal || (prev?.distance_m != null ? String(prev.distance_m) : 'm'))
      // A jump's "rep" is a CONTACT. The builder prescribes a count per set; without this cell the
      // athlete could not record how many they actually did, so contact volume was unrecordable and
      // never reached the charts. Regression from the jump-targets work earlier the same day.
      const jPh = rowTgt0?.repsMin ? String(rowTgt0.repsMin) : (prev?.reps_achieved != null ? String(prev.reps_achieved) : 'jumps')
      return `${cardOpen}<div style="display:flex;align-items:center;gap:6px">
        ${inSetNum(i, isCurrent)}
        ${inCell(i, row, f, { mode:'decimal', step:'0.01', ph, unit: mt === 'jump_height' ? 'jumpHeight' : null })}
        ${inCell(i, row, 'reps', { mode:'numeric', ph: jPh })}
        ${inDone(i, row)}${inDel(i)}
      </div></div>`
    }

    // weight_reps (default) — behaviour unchanged incl. ghost placeholders (les 2026-07-11: no pre-fill).
    const wPlaceholder = oneRMPh || (prev?.weight_kg != null ? weightToPref(prev.weight_kg) : '') || '—'
    const rPlaceholder = (prev?.reps_achieved != null ? String(prev.reps_achieved) : '') || '—'
    return `${cardOpen}<div style="display:flex;align-items:center;gap:6px">
        ${inSetNum(i, isCurrent)}
        ${ex.bodyweight
          ? `<div style="flex:1;text-align:center;font-size:15px;font-weight:700;color:var(--text)">BW</div>`
          : inCell(i, row, 'weight', { mode:'decimal', step:'0.5', ph:wPlaceholder, unit:'weight' })}
        ${inCell(i, row, 'reps', { mode:'numeric', ph:rPlaceholder })}
        ${inDone(i, row)}${inDel(i)}
      </div></div>`
  }).join('')

  const th = (label, w) => `<span style="${w ? `width:${w}` : 'flex:1'};text-align:center;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted)">${label}</span>`
  let header
  const weightLabel = window._unitPrefs.weight === 'lb' ? 'Lb' : 'Kg'
  const jumpHeightLabel = window._unitPrefs.jumpHeight === 'in' ? 'Height (in)' : 'Height (cm)'
  if (mt === 'unilateral') {
    header = `<div style="display:flex;gap:6px;padding:0 6px 6px">${th('Set','22px')}${th(`L / R · ${weightLabel.toLowerCase()} × reps`)}<span style="width:44px"></span></div>`
  } else if (mt === 'timed_hold') {
    header = `<div style="display:flex;gap:6px;padding:0 6px 6px">${th('Set','22px')}${th('Time')}${th(ex.bodyweight ? 'BW' : weightLabel)}<span style="width:44px"></span></div>`
  } else if (mt === 'jump_height') {
    header = `<div style="display:flex;gap:6px;padding:0 6px 6px">${th('Set','22px')}${th(jumpHeightLabel)}${th('Jumps')}<span style="width:44px"></span></div>`
  } else if (mt === 'jump_distance') {
    header = `<div style="display:flex;gap:6px;padding:0 6px 6px">${th('Set','22px')}${th('Distance (m)')}${th('Jumps')}<span style="width:44px"></span></div>`
  } else {
    header = `<div style="display:flex;gap:6px;padding:0 6px 6px">${th('Set','22px')}${th(weightLabel)}${th('Reps')}<span style="width:44px"></span></div>`
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
            ${(ex.targetReps||ex.targetWeight) ? `<div style="font-size:13px;font-weight:600;color:var(--text);margin-top:4px">${[ex.targetReps?escapeHtml(ex.targetReps)+' reps':null,ex.targetWeight?'@ '+fmtWeight(ex.targetWeight):null].filter(Boolean).join(' · ')}</div>` : ''}
            ${nextEx ? `<div style="font-size:11px;color:var(--text-muted);margin-top:4px">Next: <span style="font-weight:600">${escapeHtml(nextEx.name)}</span></div>` : ''}
          </div>
          <div style="display:flex;gap:8px;flex-shrink:0">
            ${_quickPrefsIconHtml()}
            <button onclick="confirmEndRunner()" style="padding:7px 16px;border:none;border-radius:8px;background:#ef4444;font-size:13px;font-weight:700;cursor:pointer;color:#fff;flex-shrink:0">End</button>
          </div>
        </div>
        ${_runner.exercises.length > 1 ? `<div style="display:flex;gap:3px;margin-top:10px">${_runner.exercises.map((e,i)=>`<div onclick="runnerJumpTo(${i})" title="${e.name||'Exercise '+(i+1)}" style="flex:1;height:8px;border-radius:4px;background:${i<_runner.exIdx?'rgba(99,102,241,0.45)':i===_runner.exIdx?'var(--accent)':'var(--border)'};cursor:pointer"></div>`).join('')}</div>` : ''}
        ${_runner.restRemaining != null && _runner._restForExIdx != null && _runner._restForExIdx !== _runner.exIdx ? `
        <div onclick="runnerJumpTo(${_runner._restForExIdx})" style="display:flex;align-items:center;gap:8px;margin-top:8px;min-height:44px;padding:10px;border-radius:8px;background:var(--surface-2);border:1px solid var(--accent);cursor:pointer;box-sizing:border-box">
          <span id="wr-rest-chip-countdown" style="font-size:13px;font-weight:800;color:var(--accent);font-variant-numeric:tabular-nums;flex-shrink:0">${_runner._restPendingFire ? 'Done' : fmtRestCountdown(_runner.restRemaining)}</span>
          <span style="font-size:12px;font-weight:600;color:var(--text-muted);flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_runner._restPendingFire ? 'Rest done — tap to continue' : 'Resting ' + escapeHtml(_runner.exercises[_runner._restForExIdx]?.name || '') + ' — tap to return'}</span>
        </div>` : ''}
        <div style="display:flex;gap:14px;margin-top:8px">
          <button id="wr-swap-btn" onclick="showExercisePicker('swap')" style="border:none;background:none;padding:0;cursor:pointer;font-size:11px;font-weight:600;color:var(--text-muted)">⇄ Swap exercise</button>
          <button id="wr-add-btn" onclick="showExercisePicker('add')" style="border:none;background:none;padding:0;cursor:pointer;font-size:11px;font-weight:600;color:var(--text-muted)">+ Add exercise</button>
        </div>
        ${_runner.templateDesc ? `<div style="margin-top:8px;padding:6px 10px;background:var(--surface-2);border-radius:8px;font-size:11.5px;color:var(--text-muted);line-height:1.5">${escapeHtml(_runner.templateDesc)}</div>` : ''}
      </div>

      <!-- Scrollable area: logged sets + PT note + client notes -->
      <div style="flex:1;overflow-y:auto;padding:12px 16px">
        ${_renderRunnerVsLast(ex)}
        <!-- Logged sets -->
        ${isTable ? renderStrengthTable(ex) : !ex.loggedSets.length
          ? `<p style="color:var(--text-muted);font-size:13px;margin:0 0 8px">No sets logged yet.</p>`
          : `<div style="margin-bottom:8px">${ex.loggedSets.map((s,i) => `
            <div style="display:flex;align-items:center;padding:10px 0;border-bottom:1px solid var(--border);gap:10px">
              <span style="font-size:13px;color:var(--text-muted);font-weight:600;width:48px;flex-shrink:0">Set ${i+1}</span>
              <span style="flex:1;display:flex;gap:10px;align-items:center">
                ${ex.type === 'cardio'
                  ? `<span style="font-size:15px;font-weight:700">${s.duration ? s.duration : (_cardioDistanceM(s) > 0 ? fmtDistanceM(_cardioDistanceM(s)) : '—')}</span>`
                  : s.distance_m
                    ? `<span style="font-size:15px;font-weight:700">${s.weight?fmtWeight(s.weight, { spaced: true }):'—'}</span><span style="font-size:15px;font-weight:700">${s.distance_m} m</span>`
                    : s.duration
                    ? `<span style="font-size:15px;font-weight:700">⏱ ${s.duration}</span>${s.weight?`<span style="font-size:14px;font-weight:600;color:var(--text-muted)">${fmtWeight(s.weight, { spaced: true })}</span>`:''}`
                    : s.leftReps != null
                    ? `<span style="font-size:13px;font-weight:700">L: ${s.leftReps||'—'}${s.leftWeight?' @ '+fmtWeight(s.leftWeight):''}</span><span style="font-size:13px;font-weight:700">R: ${s.rightReps||'—'}${s.rightWeight?' @ '+fmtWeight(s.rightWeight):''}</span>`
                    : `<span style="font-size:15px;font-weight:700">${s.weight&&s.weight!=='BW'?fmtWeight(s.weight, { spaced: true }):s.weight==='BW'?'BW':'—'}</span><span style="font-size:15px;font-weight:700">${s.reps||'—'} reps</span>`}
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
          // escapeHtml both — the sibling render of this exact regex on this exact column
          // (app-workouts.js's session-detail preview) already escapes all 3 branches; this one
          // didn't. Found by the 2026-07-30 full-file review.
          return `<div style="margin:8px 0 4px;padding:10px 12px;border-radius:8px;background:rgba(99,102,241,.07);border-left:3px solid var(--accent)">
            <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--accent)">${escapeHtml(label)}</span>
            <div style="font-size:13px;color:var(--text);margin-top:3px;line-height:1.5">${escapeHtml(noteText)}</div>
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
        ` : _runner._restInterval && _runner._restForExIdx === _runner.exIdx ? `
          <div style="padding:14px;text-align:center;border-radius:10px;background:var(--surface-2)">
            <div style="font-size:13px;font-weight:600;color:var(--text-muted)">Resting — inputs available after rest</div>
          </div>
        ` : ex.type === 'cardio' ? (() => {
          const tgt = ex.sets_json?.[ex.loggedSets.length] || ex.sets_json?.[0] || {}
          const lastCardio = ex.loggedSets[ex.loggedSets.length - 1]
          const distBased = tgt.isDistanceBased
          // Intervals store per-round work/rest as workSecs/restSecs (seconds) on the ONE block
          // object -- the interval editor's own fields (ts-worksecs-0/ts-restsecs-0) are the only
          // thing that ever writes them. `duration`/`restMin` are the ordinary-cardio fields; they
          // are NOT rendered by the interval editor, so flushTemplateSets's "missing input leaves the
          // value alone" rule (its own comment) means they silently keep whatever they were BEFORE
          // this exercise's work/rest was last edited via the interval editor -- a stale value baked
          // into the same object as the current one, with nothing to ever clear it. This pre-Start
          // screen is shared with ordinary cardio (both derive exercise_type:'cardio'), so it read
          // those legacy fields unconditionally and showed the stale prescription. Reported live,
          // 2026-08-08 (Skierg: preview correctly read workSecs=20:00, runner showed duration=10:00).
          const isInterval = _isIntervalExercise(ex)
          const effDuration = isInterval ? fmtRestCountdown(tgt.workSecs || 0) : tgt.duration
          const effRestMin  = isInterval ? fmtRestCountdown(tgt.restSecs || 0) : tgt.restMin
          return `
          <!-- Cardio targets -->
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">
            ${distBased && _cardioDistanceM(tgt) ? `<span style="font-size:12px;padding:3px 8px;border-radius:20px;background:var(--surface-2);color:var(--text-muted);font-weight:600">Target: ${fmtDistanceM(_cardioDistanceM(tgt))}</span>` : ''}
            ${!distBased && effDuration && effDuration !== '0:00' ? `<span style="font-size:12px;padding:3px 8px;border-radius:20px;background:var(--surface-2);color:var(--text-muted);font-weight:600">Target: ${escapeHtml(normalizeDuration(effDuration))}</span>` : ''}
            ${_hasTimeTarget(tgt.pace500Min) ? `<span style="font-size:12px;padding:3px 8px;border-radius:20px;background:var(--accent);color:#fff;font-weight:600">${escapeHtml(String(tgt.pace500Min))}${tgt.pace500Max && tgt.pace500Max!==tgt.pace500Min?'–'+escapeHtml(String(tgt.pace500Max)):''} /500m</span>` : ''}
            ${_hasTimeTarget(tgt.paceKmMin) ? `<span style="font-size:12px;padding:3px 8px;border-radius:20px;background:var(--accent);color:#fff;font-weight:600">${escapeHtml(String(tgt.paceKmMin))}${tgt.paceKmMax && tgt.paceKmMax!==tgt.paceKmMin?'–'+escapeHtml(String(tgt.paceKmMax)):''} /km</span>` : ''}
            ${tgt.wattsMin ? `<span style="font-size:12px;padding:3px 8px;border-radius:20px;background:var(--accent);color:#fff;font-weight:600">${escapeHtml(String(tgt.wattsMin))}${tgt.wattsMax && tgt.wattsMax!==tgt.wattsMin?'–'+escapeHtml(String(tgt.wattsMax)):''} W</span>` : ''}
            ${tgt.hrZoneMin ? `<span style="font-size:12px;padding:3px 8px;border-radius:20px;background:var(--surface-2);color:var(--text-muted);font-weight:600">HR: ${escapeHtml(String(tgt.hrZoneMin))}${tgt.hrZoneMax?'–'+escapeHtml(String(tgt.hrZoneMax)):''} bpm</span>` : ''}
            ${effRestMin && effRestMin !== '0:00' ? `<span style="font-size:12px;padding:3px 8px;border-radius:20px;background:var(--surface-2);color:var(--text-muted);font-weight:600">Rest: ${typeof effRestMin === 'number' ? fmtDuration(effRestMin) : escapeHtml(effRestMin)}</span>` : ''}
            ${tgt.strokeRateMin ? `<span style="font-size:12px;padding:3px 8px;border-radius:20px;background:var(--surface-2);color:var(--text-muted);font-weight:600">${escapeHtml(String(tgt.strokeRateMin))}${tgt.strokeRateMax?'–'+escapeHtml(String(tgt.strokeRateMax)):''} spm</span>` : ''}
            ${tgt.restHrMax ? `<span style="font-size:12px;padding:3px 8px;border-radius:20px;background:var(--surface-2);color:var(--text-muted);font-weight:600">Rest HR &lt;${escapeHtml(String(tgt.restHrMax))}</span>` : ''}
          </div>
          <!-- Set label -->
          <div style="text-align:center;font-size:13px;font-weight:700;color:var(--text-muted);margin-bottom:8px">Set ${setNum}</div>
          <!-- Cardio input -->
          <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:10px">
            ${distBased ? `
              <div>
                <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:4px">Distance achieved (m)</div>
                <input id="wr-cardio-dist" type="number" step="1" inputmode="numeric" placeholder="${_cardioDistanceM(tgt)||'0'}" value="${_cardioDistanceM(lastCardio)||_cardioDistanceM(tgt)||''}"
                  style="width:100%;padding:12px;font-size:24px;font-weight:700;border:2px solid var(--accent);border-radius:10px;text-align:center;background:var(--bg);color:var(--text)">
              </div>` : `
              <div>
                <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:4px">Duration (MM:SS)</div>
                <input id="wr-cardio-dur" type="text" inputmode="numeric" placeholder="${escapeHtml(normalizeDuration(effDuration))||'0:00'}" value="${escapeHtml(normalizeDuration(lastCardio?.duration||effDuration||''))}"
                  oninput="this.value=fmtRestInput(this.value)"
                  style="width:100%;padding:12px;font-size:24px;font-weight:700;border:2px solid var(--accent);border-radius:10px;text-align:center;background:var(--bg);color:var(--text)">
              </div>`}
          </div>
          <!-- HR/watts/pace/stroke rate are captured once, on the exercise-finish card
               (renderCardioCaptureCard) — not here (2026-08-08). -->
          <!-- Buttons -->
          <div style="display:flex;gap:8px;margin-bottom:6px">
            ${ex.loggedSets.length > 0 ? `<button onclick="skipToNextExercise()" style="flex:0 0 auto;padding:0 14px;height:52px;border:1px solid var(--border);border-radius:10px;background:transparent;font-size:12px;font-weight:700;cursor:pointer;color:var(--text-muted)">${isLast?'Finish 🏁':'Skip →'}</button>` : ''}
            ${(!distBased || _isIntervalExercise(ex)) ? `<button onclick="event.stopPropagation();startCardioTimer()" style="flex:1;height:52px;border:none;border-radius:10px;background:var(--surface-2);color:var(--text);font-size:14px;font-weight:700;cursor:pointer">▶ Start timer</button>` : ''}
            ${(!_isIntervalExercise(ex) || _isSteadyEffortBlock(ex)) ? `<button onclick="event.stopPropagation();logRunnerSet()" style="flex:1;height:52px;border:none;border-radius:10px;background:var(--accent);color:#fff;font-size:18px;font-weight:800;cursor:pointer">LOG</button>` : ''}
          </div>
          ${(!_isIntervalExercise(ex) || _isSteadyEffortBlock(ex)) ? `<button onclick="event.stopPropagation();addExtraCardioSet()" style="width:100%;padding:8px;border:1px dashed var(--border);border-radius:10px;background:transparent;font-size:12px;font-weight:600;cursor:pointer;color:var(--text-muted)">+ Add extra set</button>` : ''}`
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
          // escapeHtml here, not at each of the 2 render sites below — sets_json/notes are
          // coach-authored JSONB with no schema enforcement, same class the 2026-07-30 full-file
          // review found unescaped throughout this render path (_buildTargetCols, cardio chips).
          const distTarget = escapeHtml(ex.notes?.match(/(\d+)[–\-](\d+)\s*m/)?.[0] || tgt.distance || '')
          const weightPlaceholder = tgt.weight ? weightToPref(tgt.weight) : '—'
          // Same prescribed-rep string _buildTargetCols builds for its REPS column, but this one is
          // the input's ghost text, so it stays local rather than being read off the shared helper.
          const repsStr = !tgt.timed && tgt.repsMin ? (tgt.repsMin + (tgt.repsMax && tgt.repsMax !== tgt.repsMin ? '–' + tgt.repsMax : '')) : null
          const repsPlaceholder = repsStr ? escapeHtml(repsStr.replace('–', '-')) : '—'
          // 2026-08-02: this whole wizard branch predates the metric_type system and dispatched on
          // legacy per-set flags (tgt.unilateral/tgt.timed) + a name regex, never on metric_type — so
          // jump_height/jump_distance had NO branch here at all. In normal operation a jump exercise
          // always renders via renderStrengthTable instead (_isPlainStrengthExercise), so this gap was
          // unreachable through the ordinary launch/swap/add paths, but a jump exercise that DOES land
          // here for any reason fell into the plain weight/reps branch below with nowhere to enter a
          // height at all — matching Jake's live report of a Box Jump height going unrecorded.
          const mt = _exMetricType(ex)
          const isJump = mt === 'jump_height' || mt === 'jump_distance'
          const jumpMeasurePlaceholder = mt === 'jump_height'
            ? (tgt.targetHeightCm != null ? String(jumpHeightToPref(tgt.targetHeightCm)) : '—')
            : (tgt.targetDistanceM != null ? String(tgt.targetDistanceM) : '—')
          return `
          ${oneRMBanner}
          ${targetBar}
          ${isJump ? `
          <!-- Jump height/distance input -->
          <div style="display:flex;align-items:stretch;gap:6px">
            <div style="display:flex;flex-direction:column;justify-content:center;align-items:center;min-width:36px">
              <div style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted)">Set</div>
              <div style="font-size:22px;font-weight:800;color:var(--text);line-height:1">${setNum}</div>
            </div>
            <div style="flex:1;display:flex;flex-direction:column">
              <div style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:2px;text-align:center">${mt === 'jump_height' ? `Height (${window._unitPrefs.jumpHeight})` : 'Distance (m)'}</div>
              <input id="wr-jump-measure-input" type="number" inputmode="decimal" step="${mt === 'jump_height' ? '1' : '0.01'}" placeholder="${escapeHtml(jumpMeasurePlaceholder)}"
                style="flex:1;width:100%;font-size:22px;font-weight:700;text-align:center;border:2px solid var(--accent);border-radius:10px;padding:6px 4px;background:var(--bg);color:var(--text);box-sizing:border-box;-moz-appearance:textfield">
            </div>
            <div style="flex:1;display:flex;flex-direction:column">
              <div style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:2px;text-align:center">Jumps</div>
              <input id="wr-jump-reps-input" type="number" inputmode="numeric" placeholder="${repsPlaceholder}"
                style="flex:1;width:100%;font-size:22px;font-weight:700;text-align:center;border:2px solid var(--border);border-radius:10px;padding:6px 4px;background:var(--bg);color:var(--text);box-sizing:border-box;-moz-appearance:textfield">
            </div>
            <div style="display:flex;flex-direction:column;gap:4px;min-width:64px">
              <button onclick="logRunnerSet()" style="flex:1;border:none;border-radius:10px;background:var(--accent);color:#fff;font-size:15px;font-weight:800;cursor:pointer">LOG</button>
              ${ex.loggedSets.length > 0 ? `<button onclick="skipToNextExercise()" style="flex:0 0 auto;padding:4px 6px;border:1px solid var(--border);border-radius:8px;background:transparent;font-size:10px;font-weight:700;cursor:pointer;color:var(--text-muted)">${isLast?'Finish':'Next →'}</button>` : ''}
            </div>
          </div>` : tgt.unilateral && !isDistance ? `
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
              <div style="display:flex;justify-content:space-between;font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);padding:0 2px"><span>${window._unitPrefs.weight}</span><span>reps</span></div>
            </div>
            <div style="flex:1;display:flex;flex-direction:column;gap:4px">
              <div style="font-size:10px;font-weight:700;text-transform:uppercase;text-align:center;color:var(--accent)">Right</div>
              <input id="wr-right-weight" type="number" inputmode="decimal" step="0.5" placeholder="${weightPlaceholder}"
                style="width:100%;font-size:17px;font-weight:700;text-align:center;border:2px solid var(--accent);border-radius:8px;padding:5px 4px;background:var(--bg);color:var(--text);box-sizing:border-box;-moz-appearance:textfield">
              <input id="wr-right-reps" type="number" inputmode="numeric" placeholder="${repsPlaceholder}"
                style="width:100%;font-size:17px;font-weight:700;text-align:center;border:2px solid var(--border);border-radius:8px;padding:5px 4px;background:var(--bg);color:var(--text);box-sizing:border-box;-moz-appearance:textfield">
              <div style="display:flex;justify-content:space-between;font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);padding:0 2px"><span>${window._unitPrefs.weight}</span><span>reps</span></div>
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
                  <div style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:2px;text-align:center">${ex.assisted?`Assist (${window._unitPrefs.weight})`:(window._unitPrefs.weight==='lb'?'Pounds':'Kilograms')}</div>
                  <input id="wr-weight-input" type="number" inputmode="decimal" step="0.5" placeholder="${weightPlaceholder}"
                    style="flex:1;width:100%;font-size:22px;font-weight:700;text-align:center;border:2px solid var(--accent);border-radius:10px;padding:6px 4px;background:var(--bg);color:var(--text);box-sizing:border-box;-moz-appearance:textfield">
                 </div>`}
            <!-- Duration (timed) or Reps / Distance -->
            ${tgt.timed
              ? (_runner._setTimerDone
                  ? `<div style="flex:1;display:flex;flex-direction:column">
                      <div style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:2px;text-align:center">Duration</div>
                      <input id="wr-duration-input" type="text" inputmode="numeric" placeholder="${escapeHtml(String(tgt.duration||'0:00'))}" oninput="this.value=fmtRestInput(this.value)"
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
  // A rest belonging to a DIFFERENT exercise (2026-07-29 redesign) must not block THIS exercise's
  // own LOG — only a rest/count-in for the exercise currently on screen should.
  if ((_runner._restInterval && _runner._restForExIdx === _runner.exIdx) || _runner._countInInterval) return // block LOG during rest or the get-ready count-in
  // Every "required field missing" branch below toasts rather than silently no-opping — same reasoning
  // as toggleTableSet's identical guard: a bare `return` on an empty field reads as a broken LOG button.
  const ex = _runner.exercises[_runner.exIdx]
  let setData
  if (ex.type === 'cardio') {
    const tgt = ex.sets_json?.[ex.loggedSets.length] || ex.sets_json?.[0] || {}
    if (tgt.isDistanceBased) {
      const dist = document.getElementById('wr-cardio-dist')?.value?.trim()
      if (!dist) { showToast('Enter a distance first', 'warn'); return }
      // METRES, matching the input above. Persisted straight to distance_m with no conversion —
      // the old km input needed a x1000 at the save site, which is what made the units ambiguous.
      // HR/watts/pace/stroke rate are captured once, on the exercise-finish card
      // (renderCardioCaptureCard) — not per round here (2026-08-08).
      setData = { distanceM: dist }
    } else {
      // If interval timer is running, compute elapsed time; otherwise read the manual input field
      let dur
      if (_runner._intervalRunning && _runner._intervalSecs != null && _runner._intervalRemaining != null) {
        const elapsedSecs = _runner._intervalSecs - _runner._intervalRemaining
        dur = elapsedSecs > 0 ? fmtRestCountdown(elapsedSecs) : tgt.duration || null
      } else {
        dur = document.getElementById('wr-cardio-dur')?.value?.trim()
      }
      if (!dur || dur === '0:00') { showToast('Enter a duration first', 'warn'); return }
      // Overlay inputs take priority over runner-form inputs (interval overlay is still mounted here)
      const distEl = document.getElementById('wr-cardio-dist-opt')
      setData = { duration: dur, distanceM: distEl?.value?.trim() || null }
    }
    // stop any running interval timer
    stopIntervalTimer()
  } else {
    const tgt = ex.sets_json?.[ex.loggedSets.length] || ex.sets_json?.[0] || {}
    const isDistance = /carry|broad jump|sled|sandbag.*lunge|step.*carry/i.test(ex.name)
    const weight = ex.bodyweight ? 'BW' : (weightFromPref(document.getElementById('wr-weight-input')?.value?.trim()) ?? '')
    const mt = _exMetricType(ex)
    if (mt === 'jump_height' || mt === 'jump_distance') {
      const measure = document.getElementById('wr-jump-measure-input')?.value?.trim()
      if (!_hasNumVal(measure)) { showToast(mt === 'jump_height' ? 'Enter a height first' : 'Enter a distance first', 'warn'); return }
      const jreps = document.getElementById('wr-jump-reps-input')?.value?.trim() || ''
      setData = mt === 'jump_height'
        ? { height_cm: jumpHeightFromPref(measure), reps: jreps }
        : { distance_m: measure, reps: jreps }
    } else if (tgt.timed) {
      const dur = document.getElementById('wr-duration-input')?.value?.trim()
      if (!dur || dur === '0:00') { showToast('Enter a duration first', 'warn'); return }
      setData = { weight: weight || null, duration: dur }
      _runner._setTimerDone = false
    } else if (tgt.unilateral && !isDistance) {
      const leftWeight = weightFromPref(document.getElementById('wr-left-weight')?.value?.trim()) ?? ''
      const leftReps   = document.getElementById('wr-left-reps')?.value?.trim()   || ''
      const rightWeight = weightFromPref(document.getElementById('wr-right-weight')?.value?.trim()) ?? ''
      const rightReps   = document.getElementById('wr-right-reps')?.value?.trim()   || ''
      if (!leftReps && !rightReps) { showToast('Enter reps first', 'warn'); return }
      setData = { leftWeight: leftWeight || null, leftReps: leftReps || null, rightWeight: rightWeight || null, rightReps: rightReps || null }
    } else if (isDistance) {
      const dist = document.getElementById('wr-dist-input')?.value?.trim() || ''
      if (!dist) { showToast('Enter a distance first', 'warn'); return }
      setData = { weight, distance_m: dist }
    } else {
      const reps = document.getElementById('wr-reps-input')?.value?.trim() || ''
      if (!reps) { showToast('Enter reps first', 'warn'); return }
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
    const proceed = () => {
      const nextExIdx = _runner.exercises.findIndex((e, i) => i > _runner.exIdx && e.name)
      if (nextExIdx !== -1) {
        // More exercises — rest then advance. Start the rest timer (which sets
        // _restInterval) before re-rendering, so the page shows the "resting"
        // placeholder instead of a phantom next-set input for a set that doesn't exist.
        _runner._afterRest = () => { _runner.exIdx = nextExIdx; renderRunner() }
        startRestTimer(ex.restSecs || 90)
        renderRunner()
      } else {
        // All done — go straight to finish
        showRunnerFinish()
      }
    }
    // Cardio's only "exercise finished" moment that isn't already the interval phase-walk (see
    // _finishIntervalExercise) — ask for HR/watts/pace/stroke rate once, here, before moving on.
    if (ex.type === 'cardio') { renderCardioCaptureCard(ex, proceed); return }
    proceed()
    return
  }
  const restSecs = ex.restSecs || 90
  if (ex.type === 'cardio') {
    const nextTgt = ex.sets_json?.[ex.loggedSets.length] || ex.sets_json?.[0] || {}
    // Interval-shaped blocks (incl. a steady-effort block someone extended via +Add extra set) keep
    // their work duration in workSecs, not duration — same distinction the pre-Start card's
    // effDuration already makes (2026-08-08 stale-duration fix). Reading .duration unconditionally
    // here would silently fall back to a hardcoded 300s for any interval-shaped next round.
    const nextDur = _isIntervalExercise(ex) ? fmtRestCountdown(nextTgt.workSecs || 0) : nextTgt.duration
    if (!nextTgt.isDistanceBased) {
      _runner._afterRest = () => startIntervalTimer(parseRest(nextDur) || 300)
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
  // Interval exercises fork here into the phase walk instead of the legacy single-round count-in ->
  // startIntervalTimer chain. `if (!ex.phases)` covers an exercise that reached the runner without
  // going through launchRunner's mapping (e.g. swapped/added mid-session via _confirmRunnerExerciseFromModal,
  // which doesn't call _initIntervalPhases). Steady-state cardio below is completely unchanged.
  if (_isIntervalExercise(ex)) {
    if (!ex.phases) _initIntervalPhases(ex)
    _startPhaseAt(0)
    return
  }
  const tgt = ex.sets_json?.[ex.loggedSets.length] || ex.sets_json?.[0] || {}
  const durEl = document.getElementById('wr-cardio-dur')
  const secs = (durEl?.value?.trim() ? parseRest(durEl.value.trim()) : 0) || parseRest(tgt.duration) || 300
  startRunnerCountIn(secs)
}

// Get-ready lead-in before the FIRST work interval of a round only — every round after that already
// gets a spoken count-in for free (startRestTimer speaks the last 5 seconds of rest, which doubles as
// the count-in for the next round). This is purely a lead-in: at 0 it hands off to the existing
// startIntervalTimer(workSecs), which already owns the whole work→rest→work loop.
function startRunnerCountIn(workSecs) {
  stopRunnerCountIn()
  _runner._countInRemaining = 5
  renderRunnerCountIn()
  _runner._countInInterval = setInterval(() => {
    _runner._countInRemaining--
    if (_runner._countInRemaining <= 0) {
      _runner._countInInterval = clearTimer(_runner._countInInterval)
      document.getElementById('wr-countin-overlay')?.remove()
      playBeep(1318, 0.2, 0.9) // short, higher blip — audibly distinct from the 1046Hz/0.5s interval-end beep
      startIntervalTimer(workSecs)
      return
    }
    speakCue(String(_runner._countInRemaining))
    const el = document.getElementById('wr-countin-countdown')
    if (el) el.textContent = _runner._countInRemaining
  }, 1000)
}

function stopRunnerCountIn() {
  _runner._countInInterval = clearTimer(_runner._countInInterval)
  _runner._countInRemaining = null
  document.getElementById('wr-countin-overlay')?.remove()
}

function renderRunnerCountIn() {
  document.getElementById('wr-countin-overlay')?.remove()
  const ex = _runner.exercises[_runner.exIdx]
  const setNum = ex.loggedSets.length + 1
  const roundLabel = ex.targetSets > 1 ? `Round ${setNum} of ${ex.targetSets}` : `Set ${setNum}`

  const overlay = document.createElement('div')
  overlay.id = 'wr-countin-overlay'
  overlay.style.cssText = 'position:fixed;inset:0;background:var(--bg);z-index:350;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px'
  overlay.innerHTML = `
    <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:8px">${escapeHtml(ex.name)} — ${roundLabel}</div>
    <div id="wr-countin-countdown" style="font-size:64px;font-weight:800;color:var(--accent);margin-bottom:16px">${_runner._countInRemaining}</div>
    <div style="font-size:13px;color:var(--text-muted)">GET READY</div>
  `
  mountModal(overlay)
}

// Interval exercises walk a pre-expanded phase list rather than chaining one-shot callbacks. The old
// approach (work -> rest -> _afterRest) is a single-slot callback with no queue; across 8 phase types
// and 2 nesting levels it becomes the shape that has produced stray-timer bugs here before.
function _isIntervalExercise(ex) {
  return !!ex && _exMetricType(ex) === 'interval'
}

// A "steady effort" is an interval block with nothing to repeat — one round, one cycle (the same
// degenerate case plain Cardio used to cover before the 2026-08-09 merge). Manual/no-timer logging
// stays available for these; a genuine multi-round/multi-cycle interval still requires the live timer.
// Delegates to _isSteadyIntervalBlock (app-workouts.js) — the SAME check drives the builder's own
// "Steady effort" chip, so a block only ever shows that label where BOTH surfaces agree it's true
// (multi-agent-review, 2026-08-09: a hand-typed sets:1/cycles:1 with leftover nonzero warmup/rest/
// recovery/cooldown used to read "Steady" here while _expandIntervalBlock still built a multi-phase
// sequence for it — checking the same lead-in/trailing fields closes that gap).
function _isSteadyEffortBlock(ex) {
  return _isIntervalExercise(ex) && _isSteadyIntervalBlock(ex?.sets_json?.[0])
}

function _initIntervalPhases(ex) {
  ex.phases = _expandIntervalBlock(ex.sets_json?.[0] || {})
  ex.targetSets = ex.phases.filter(p => p.phase === 'work').length
  _runner._phaseIdx = 0
  return ex.phases
}

// Starts the phase at `idx`. Timed phases auto-advance; a distance work round (secs === null) waits
// for the athlete's Done tap, since there is no sensor to end it.
// Returns true when another phase was actually started (i.e. it already rendered whatever the new
// phase needs — the rest overlay, the interval overlay, or nothing yet because a timer owns the next
// render) and false when the walk ended (_finishIntervalExercise already rendered the next exercise
// OR the finish screen). Callers use this to decide whether a trailing renderRunner() is safe — see
// startIntervalPhaseTimer's zero-tick and _doneIntervalPhase, both of which used to renderRunner()
// unconditionally and, on the LAST phase of the LAST exercise, repainted the runner straight back over
// showRunnerFinish()'s screen (same "renderRunner destroys the finish screen" bug class documented on
// showRunnerFinish itself).
function _startPhaseAt(idx) {
  const ex = _runner.exercises[_runner.exIdx]
  const phases = ex.phases || []
  _runner._phaseIdx = idx
  if (idx >= phases.length) { _finishIntervalExercise(); return false }
  const p = phases[idx]
  if (p.phase === 'rest' || p.phase === 'recovery') {
    // Rest and recovery reuse the existing rest bar and are never logged.
    _runner._afterRest = () => _advancePhase()
    startRestTimer(p.secs)
    return true
  }
  if (p.secs == null) { renderIntervalTimer(); return true }   // distance round — Done tap advances
  startIntervalPhaseTimer(p.secs)
  return true
}

function _advancePhase() {
  return _startPhaseAt((_runner._phaseIdx || 0) + 1)
}

// The phase list is exhausted — the block behaves like any other exercise's set-target being hit.
// No extra rest is started here: the phase list already ended on a timed rest/recovery/cooldown, so
// adding another would double up. Mirrors the "hitTarget" branch below (next exercise, else finish).
function _finishIntervalExercise() {
  stopIntervalTimer()
  const ex = _runner.exercises[_runner.exIdx]
  const proceed = () => {
    const nextExIdx = _runner.exercises.findIndex((e, i) => i > _runner.exIdx && e.name)
    if (nextExIdx !== -1) { _runner.exIdx = nextExIdx; renderRunner() }
    else showRunnerFinish()
  }
  // Ask for HR/watts/pace/stroke rate once, here — the interval phase-walk's own "exercise finished"
  // moment, and the one point in the whole exercise the fullscreen timer overlay is guaranteed gone.
  if (ex.loggedSets.length) renderCardioCaptureCard(ex, proceed)
  else proceed()
}

// Records one phase as a logged set. Rest and recovery never reach here — they are timed only
// (Jake's call: rest 2026-07-23, recovery 2026-07-25, both being rests between efforts). The phase
// value is what lets the Progress page exclude warmup/cooldown from set counts and volume.
function _logIntervalPhase(p) {
  const ex = _runner.exercises[_runner.exIdx]
  const g = id => document.getElementById(id)?.value?.trim() || null
  // avgHr/maxHr/avgWatts deliberately NOT read here (2026-08-08) — renderCardioCaptureCard is now the
  // sole writer of those fields, once at exercise-finish; reading them per-phase here as well would be
  // a second writer racing the first, and the DOM nodes this used to read no longer exist.
  ex.loggedSets.push({
    phase: p.phase,
    duration: p.secs != null ? fmtRestCountdown(p.secs) : null,
    distanceM: p.distanceM != null ? String(p.distanceM) : g('wr-cardio-dist-opt')
  })
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
      // HR/watts/pace/stroke rate are captured once, on the exercise-finish card
      // (renderCardioCaptureCard) — not per round here (2026-08-08).
      const setData = { duration: tgt.duration || fmtRestCountdown(secs), distanceM: distEl?.value?.trim() || null }
      ex.loggedSets.push(setData)
      const restSecs = ex.restSecs || 90
      const hitTarget = ex.targetSets > 0 && ex.loggedSets.length >= ex.targetSets
      // startRestTimer runs before renderRunner in every branch below so the
      // page shows the "resting" placeholder instead of a stale/phantom set input.
      if (hitTarget) {
        const proceed = () => {
          const nextExIdx = _runner.exercises.findIndex((e, i) => i > _runner.exIdx && e.name)
          if (nextExIdx !== -1) {
            _runner._afterRest = () => { _runner.exIdx = nextExIdx; renderRunner() }
            startRestTimer(restSecs)
          } else {
            startRestTimer(restSecs)
            _runner._afterRest = () => showRunnerFinish()
          }
          renderRunner()
        }
        // Same "ask once, at exercise-finish" capture point as logRunnerSet's hitTarget branch.
        renderCardioCaptureCard(ex, proceed)
        return
      } else {
        const nextTgt2 = ex.sets_json?.[ex.loggedSets.length] || ex.sets_json?.[0] || {}
        // Same shape distinction as logRunnerSet's nextDur (2026-08-09) — an interval-shaped block
        // keeps its work duration in workSecs, not duration. Found by multi-agent-review as a sibling
        // occurrence of the same bug that fix already closed one call-depth up.
        const nextDur2 = _isIntervalExercise(ex) ? fmtRestCountdown(nextTgt2.workSecs || 0) : nextTgt2.duration
        if (!nextTgt2.isDistanceBased) {
          _runner._afterRest = () => startIntervalTimer(parseRest(nextDur2) || 300)
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

// Interval-exercise counterpart to startIntervalTimer, for a single timed PHASE (work/warmup/cooldown)
// rather than a whole work->rest->work round trip. Shares the same _runner._interval* state and
// stopIntervalTimer/renderIntervalTimer as the legacy timer, so every existing teardown path
// (stopIntervalTimer itself, discardRunner, showRunnerFinish, runnerGoBack, skipToNextExercise) already
// clears it correctly without any changes there. Do not repurpose startIntervalTimer for this — steady-
// state cardio still owns it and is out of scope for the interval redesign.
function startIntervalPhaseTimer(secs) {
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
      const p = (_runner.exercises[_runner.exIdx].phases || [])[_runner._phaseIdx] || {}
      if (p.phase === 'work' || p.phase === 'warmup' || p.phase === 'cooldown') _logIntervalPhase(p)
      // _advancePhase() already rendered whatever the walk needed (next phase's overlay, the next
      // exercise, or showRunnerFinish()) — see _startPhaseAt's comment. renderRunner() here ONLY when
      // it did NOT (there is no such branch today, but this must not silently regress): on the last
      // phase of the last exercise, unconditionally calling renderRunner() after _advancePhase() used
      // to repaint the runner straight back over showRunnerFinish()'s screen.
      if (_advancePhase()) renderRunner()
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

// Upper-cased labels for the overlay's phase-name line. 'countdown' technically also flows through
// here (it takes the same timed branch as warmup/work/cooldown in _startPhaseAt) even though the
// brief only names the other five — falls back to a bare uppercase of the phase key otherwise.
const _PHASE_NAME_LABELS = { countdown: 'COUNTDOWN', warmup: 'WARM-UP', work: 'WORK', rest: 'REST', recovery: 'RECOVERY', cooldown: 'COOL-DOWN' }

function renderIntervalTimer() {
  document.getElementById('wr-interval-overlay')?.remove()
  const secs = _runner._intervalRemaining
  const total = _runner._intervalSecs
  const circ = 2 * Math.PI * 54
  const ex = _runner.exercises[_runner.exIdx]
  const isInterval = _isIntervalExercise(ex)
  const p = isInterval ? ((ex.phases || [])[_runner._phaseIdx] || {}) : null
  // A distance work round has no timer (secs === null) — _startPhaseAt's null-secs branch renders
  // straight to this overlay WITHOUT ever setting _intervalRemaining/_intervalSecs, since there is
  // nothing to count down. Dividing undefined by undefined here produced "NaN:NaN" in the ring's
  // countdown — the first thing an athlete sees when a distance round starts. Branch on it explicitly:
  // the ring shows no progress (an empty track — not a full circle, which would misleadingly read as
  // "complete") and the countdown number becomes the target distance instead.
  const isDistanceRound = isInterval && p.phase === 'work' && p.secs == null
  const pct = isDistanceRound ? 0 : (secs / total)
  const countdownDisplay = isDistanceRound ? escapeHtml(fmtDistanceM(p.distanceM)) : fmtRestCountdown(secs)

  // Non-interval (steady-state) cardio keeps its original top line and phase caption untouched —
  // out of scope for the whole interval redesign.
  let topLabel, phaseNameLabel, remainingLine = ''
  let doneLabel = 'Done early — LOG'
  let doneOnclick = 'logRunnerSet()'
  if (isInterval) {
    phaseNameLabel = _PHASE_NAME_LABELS[p.phase] || String(p.phase || '').toUpperCase()
    const block = ex.sets_json?.[0] || {}
    const setsPerCycle = Math.max(1, parseInt(block.sets, 10) || 0)
    const cyclesTotal  = Math.max(1, parseInt(block.cycles, 10) || 0)
    let posLabel = ''
    if (p.set != null) {
      posLabel = `Set ${p.set} of ${setsPerCycle}`
      if (cyclesTotal > 1) posLabel += ` · Cycle ${p.cycle} of ${cyclesTotal}`
    } else if (p.cycle != null && cyclesTotal > 1) {
      posLabel = `Cycle ${p.cycle} of ${cyclesTotal}`
    }
    topLabel = posLabel ? `${escapeHtml(ex.name)} — ${escapeHtml(posLabel)}` : escapeHtml(ex.name)
    const { total: remSecs, hasUnknown } = _intervalTotalSecs((ex.phases || []).slice(_runner._phaseIdx))
    remainingLine = `${hasUnknown ? '+' : ''}${fmtRestCountdown(remSecs)} remaining`
    // The Done control must log the phase and advance the walk itself — logRunnerSet() is the legacy
    // cardio path and never touches the phase list. This matters most for a distance work round, where
    // there is no timer to reach zero and this tap is the athlete's ONLY way to end the round.
    doneOnclick = '_doneIntervalPhase()'
    if (isDistanceRound) doneLabel = `Done — ${fmtDistanceM(p.distanceM)}`
  } else {
    const setNum = ex.loggedSets.length + 1
    const roundLabel = ex.targetSets > 1 ? `Round ${setNum} of ${ex.targetSets}` : `Set ${setNum}`
    topLabel = `${escapeHtml(ex.name)} — ${roundLabel}`
    phaseNameLabel = 'INTERVAL IN PROGRESS'
  }

  const overlay = document.createElement('div')
  overlay.id = 'wr-interval-overlay'
  overlay.style.cssText = 'position:fixed;inset:0;background:var(--bg);z-index:350;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px'
  overlay.innerHTML = `
    <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:8px">${topLabel}</div>
    <div style="position:relative;display:inline-block;margin-bottom:24px">
      <svg width="140" height="140" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="54" fill="none" stroke="var(--border)" stroke-width="6"/>
        <circle id="wr-interval-ring" cx="60" cy="60" r="54" fill="none" stroke="var(--accent)" stroke-width="6"
          stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - pct)}"
          stroke-linecap="round" transform="rotate(-90 60 60)"
          style="transition:stroke-dashoffset .9s linear"/>
      </svg>
      <div id="wr-interval-countdown" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:40px;font-weight:800;color:var(--accent)">${countdownDisplay}</div>
    </div>
    <div style="font-size:13px;color:var(--text-muted);margin-bottom:${isInterval ? '4px' : '24px'}">${phaseNameLabel}</div>
    ${isInterval ? `<div style="font-size:12px;color:var(--text-muted);margin-bottom:24px">${remainingLine}</div>` : ''}
    <div style="width:100%;max-width:340px;display:flex;flex-direction:column;gap:10px;margin-bottom:24px">
      <div>
        <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:4px">Distance covered (m) — optional</div>
        <input id="wr-cardio-dist-opt" type="number" step="1" inputmode="numeric" placeholder="e.g. 1240"
          style="width:100%;padding:10px 12px;font-size:18px;font-weight:700;border:2px solid var(--border);border-radius:10px;text-align:center;background:var(--surface);color:var(--text)">
      </div>
    </div>
    <button onclick="event.stopPropagation();${doneOnclick}" style="width:100%;max-width:340px;padding:16px;border:none;border-radius:12px;background:var(--accent);color:#fff;font-size:16px;font-weight:800;cursor:pointer">${escapeHtml(doneLabel)}</button>
  `
  mountModal(overlay)
}

// Rewires the overlay's Done control for an interval exercise (see renderIntervalTimer above): unlike
// logRunnerSet(), this actually logs the CURRENT PHASE and advances the walk. Deliberately mirrors the
// zero-tick branch in startIntervalPhaseTimer — SAME phase-type guard (only work/warmup/cooldown ever
// get logged) — not just the same stop->log->advance shape. A block's "Initial countdown"
// (countdownSecs) expands to a timed phase too, so it renders this same overlay with this same Done
// button; without the guard, an impatient tap during the get-ready countdown pushed a phantom
// {phase:'countdown'} row into loggedSets — a permanent 5-second "set" in the athlete's saved history
// that also shifted every real set's set_number up by one (array position). No beep here, unlike the
// zero-tick: that beep alerts an athlete who ISN'T looking at the screen that time is up; a manual tap
// means they are already looking at and touching it, so it's redundant — and would be actively
// confusing on the countdown-skip case, which beeps for something that was just deliberately NOT logged.
function _doneIntervalPhase() {
  _unlockAudio()
  _unlockSpeech()
  if ((_runner._restInterval && _runner._restForExIdx === _runner.exIdx) || _runner._countInInterval) return // same guard logRunnerSet uses
  const ex = _runner.exercises[_runner.exIdx]
  const p = (ex.phases || [])[_runner._phaseIdx]
  if (!p) return
  stopIntervalTimer()
  if (p.phase === 'work' || p.phase === 'warmup' || p.phase === 'cooldown') _logIntervalPhase(p)
  // Same guard as startIntervalPhaseTimer's zero-tick (this function deliberately mirrors it, per the
  // comment above): only renderRunner() when _advancePhase() didn't already render for itself, so a
  // manual "Done" tap on the LAST phase of the LAST exercise doesn't repaint over showRunnerFinish().
  if (_advancePhase()) renderRunner()
}

function startRestTimer(secs) {
  _runner._restInterval = clearTimer(_runner._restInterval)
  _runner.restRemaining = secs
  _runner.restTotal     = secs
  // Which exercise this rest belongs to — kept stable even if the athlete navigates elsewhere to
  // look ahead, so a returning tap (or the chip) knows where to reattach. `_restPendingFire` marks
  // a rest that reached zero while the athlete was looking at a DIFFERENT exercise: the beep/voice
  // cues still fire on schedule, but any queued _afterRest is deliberately held until they actually
  // return to the owning exercise — firing it immediately would run against whatever exercise is
  // currently on screen (the exact corruption runnerJumpTo/runnerGoBack already guard against
  // elsewhere). Jake, 2026-07-29: "the timer stops" when glancing at another exercise — fixed by
  // decoupling "is a rest running" from "is it the one on screen", not by making rests un-stoppable.
  _runner._restForExIdx  = _runner.exIdx
  _runner._restPendingFire = false
  // Table-mode rest renders inline inside renderStrengthTable (via the caller's imminent
  // renderRunner() call right after this), so the non-blocking table stays visible/editable
  // underneath — it never gets the floating page-top overlay that wizard mode still uses.
  const tableMode = _isPlainStrengthExercise(_runner.exercises[_runner.exIdx])
  if (!tableMode) renderRestTimer()
  _runner._restInterval = setInterval(() => {
    _runner.restRemaining--
    if (_runner.restRemaining <= 0) {
      _runner._restInterval = clearTimer(_runner._restInterval)
      playBeep(1046, 0.5, 0.95) // higher, longer beep on finish — fires regardless of which exercise is on screen
      if (_runner.exIdx === _runner._restForExIdx) {
        // Common case, and the ONLY case before this fix: the athlete is still looking at the
        // resting exercise. Behaviour unchanged from before this change.
        _runner.restRemaining = null
        _runner._restForExIdx = null
        document.getElementById('rest-timer-overlay')?.remove()
        const cb = _runner._afterRest
        if (cb) { _runner._afterRest = null; cb() }
        else renderRunner() // clears the inline rest bar (table mode) / stale "Resting…" state
      } else {
        // Elapsed while the athlete was viewing a different exercise. Leave _afterRest queued and
        // restForExIdx pointing at the owning exercise — runnerJumpTo consumes it the moment they
        // return. restRemaining stays 0 (not null) so the chip can render a "done" state.
        _runner.restRemaining = 0
        _runner._restPendingFire = true
        document.getElementById('rest-timer-overlay')?.remove()
        renderRunner() // updates the chip on whichever exercise is currently on screen
      }
    } else {
      _unlockAudio()
      if (_runner.restRemaining === 10) speakCue('10 seconds')
      if (_runner.restRemaining <= 5) speakCue(String(_runner.restRemaining))
      const onScreen = _runner.exIdx === _runner._restForExIdx
      const el = onScreen ? document.getElementById('rt-countdown') : null
      if (el) {
        const r = _runner.restRemaining
        const inTableMode = _isPlainStrengthExercise(_runner.exercises[_runner.exIdx])
        el.textContent = inTableMode ? fmtRestCountdown(r) : (r < 60 ? r+'s' : fmtRestCountdown(r))
        el.style.color = r <= 3 ? '#ef4444' : 'var(--accent)'
      }
      const ring = onScreen ? document.getElementById('rt-ring') : null
      if (ring) {
        const pct = _runner.restRemaining / _runner.restTotal
        const circ = 2 * Math.PI * 18
        ring.style.strokeDashoffset = circ * (1 - pct)
      }
      const chipEl = document.getElementById('wr-rest-chip-countdown')
      if (chipEl) chipEl.textContent = fmtRestCountdown(_runner.restRemaining)
    }
  }, 1000)
}

function fmtRestCountdown(secs) {
  return `${Math.floor(secs/60)}:${String(secs%60).padStart(2,'0')}`
}

function skipRestTimer() {
  // Defense in depth: this is only ever meant to be reachable from the inline table bar / floating
  // overlay for the exercise the rest actually belongs to, both correctly gated on
  // _restForExIdx === exIdx elsewhere — but if some future path ever leaves a stale overlay/button
  // mounted for a rest that no longer belongs to the exercise on screen (the exact class of bug the
  // add/swap-mid-rest gap had, found by multi-agent review 2026-07-29), this must not fire the wrong
  // exercise's _afterRest. Just clear the stray DOM node and stop.
  if (_runner._restForExIdx != null && _runner._restForExIdx !== _runner.exIdx) {
    document.getElementById('rest-timer-overlay')?.remove()
    return
  }
  _runner._restInterval = clearTimer(_runner._restInterval)
  _runner.restRemaining = null
  _runner._restForExIdx = null
  _runner._restPendingFire = false
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
  const nextSetNum = curEx.loggedSets.length + 1
  const nextRoundLabel = curEx.targetSets > 1 ? `Round ${nextSetNum} of ${curEx.targetSets}` : `Set ${nextSetNum}`
  const nextLabel = hitTarget && nextEx ? 'Next: ' + nextEx.name : hitTarget && !nextEx ? 'Finish 🏁' : 'Next: ' + nextRoundLabel

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

// ─── Cardio/interval exercise-finish capture card (2026-08-08) ────────────────────────────────
// Replaces the old always-rendered-but-unreachable-during-a-timer HR/watts/pace inputs on the
// pre-Start cardio card. Capture happens ONCE, here, at the moment a cardio or interval exercise
// finishes — the one point in the whole exercise the fullscreen timer overlay
// (wr-interval-overlay, z-index:350) is guaranteed gone, sidestepping the occlusion bug
// structurally rather than patching z-index/DOM nesting. Which metrics get asked for is a
// per-device toggle (localStorage, not a DB/Settings preference — Jake's explicit call), shared
// with the quick-prefs popover (app-core.js) so changing it from either place is visible in the
// other immediately.

function _loadCardioCaptureToggles() {
  try {
    const raw = localStorage.getItem('_cardioCaptureToggles')
    return { hr: true, watts: true, pace: false, strokeRate: false, ...(raw ? JSON.parse(raw) : {}) }
  } catch (e) { return { hr: true, watts: true, pace: false, strokeRate: false } }
}
function _saveCardioCaptureToggles(t) {
  try { localStorage.setItem('_cardioCaptureToggles', JSON.stringify(t)) } catch (e) {}
}

// onContinue is stashed on _runner so the toggle handler (which only knows the exercise index,
// not the caller's own closure) can re-invoke this exact render after a chip flips, without losing
// track of what "done" means for this particular call site (next exercise vs rest vs finish).
function renderCardioCaptureCard(ex, onContinue, prefill = {}) {
  _runner._captureOnContinue = onContinue
  const t = _loadCardioCaptureToggles()
  // Same prescribed-target lookup the pre-Start card used — carries the hrZoneMin/wattsMin hint
  // through so the placeholder regression Agent C flagged (values shown while typing) doesn't reappear.
  const tgt = ex.sets_json?.[ex.loggedSets.length] || ex.sets_json?.[0] || {}
  const chip = (label, key) => `<button type="button" onclick="_toggleCardioCaptureMetric('${key}')" style="padding:8px 14px;font-size:13px;font-weight:700;border-radius:20px;cursor:pointer;border:1px solid ${t[key]?'var(--accent)':'var(--border)'};background:${t[key]?'var(--accent)':'var(--surface-2)'};color:${t[key]?'#fff':'var(--text-muted)'}">${label}</button>`
  const field = (label, id, val, opts, wrapStyle) => `
    <div style="${wrapStyle || 'margin-bottom:10px'}">
      <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:4px">${label}</div>
      <input id="${id}" value="${escapeAttr(val || '')}" ${opts}
        style="width:100%;padding:12px;font-size:20px;font-weight:700;border:2px solid var(--border);border-radius:10px;text-align:center;background:var(--bg);color:var(--text)">
    </div>`

  let el = document.getElementById('workout-runner')
  if (!el) { el = document.createElement('div'); el.id = 'workout-runner'; document.body.appendChild(el) }
  el.innerHTML = `
    <div style="position:fixed;inset:0;background:var(--bg);z-index:300;display:flex;flex-direction:column;overflow:hidden">
      <div style="padding:20px 20px 12px;border-bottom:1px solid var(--border)">
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:4px">${escapeHtml(ex.name)} — done</div>
        <div style="font-size:19px;font-weight:800;color:var(--text)">Log what you saw on the machine</div>
      </div>
      <div style="flex:1;overflow-y:auto;padding:16px 20px">
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px">
          ${chip('HR', 'hr')}${chip('Watts', 'watts')}${chip('Pace', 'pace')}${chip('Stroke rate', 'strokeRate')}
        </div>
        ${t.hr ? `<div style="display:flex;gap:8px;margin-bottom:10px">${field('Avg HR (bpm)', 'wr-capture-avg-hr', prefill.avgHr, `type="number" inputmode="numeric" step="1" min="20" max="250" placeholder="${escapeAttr(String(tgt.hrZoneMin||''))}"`, 'flex:1')}${field('Max HR (bpm)', 'wr-capture-max-hr', prefill.maxHr, `type="number" inputmode="numeric" step="1" min="20" max="250" placeholder="${escapeAttr(String(tgt.hrZoneMax||''))}"`, 'flex:1')}</div>` : ''}
        ${t.watts ? field('Avg watts', 'wr-capture-watts', prefill.watts, `type="number" inputmode="numeric" step="1" min="0" max="2000" placeholder="${escapeAttr(String(tgt.wattsMin||''))}"`) : ''}
        ${t.pace ? field('Pace /500m', 'wr-capture-pace', prefill.pace, 'type="text" inputmode="numeric" placeholder="e.g. 2:07" oninput="this.value=fmtRestInput(this.value)"') : ''}
        ${t.strokeRate ? field('Stroke rate (spm)', 'wr-capture-stroke-rate', prefill.strokeRate, 'type="number" inputmode="numeric" step="1" min="0" max="100"') : ''}
        ${!t.hr && !t.watts && !t.pace && !t.strokeRate ? `<p style="color:var(--text-muted);font-size:13px;text-align:center;padding:24px 0">Nothing toggled on — tap a chip above, or just continue.</p>` : ''}
      </div>
      <div style="padding:16px 20px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:10px">
        <button onclick="_applyCardioCapture(_runner.exercises[_runner.exIdx]);_runner._captureOnContinue()" style="width:100%;padding:16px;border:none;border-radius:12px;background:var(--accent);color:#fff;font-size:16px;font-weight:800;cursor:pointer">Continue</button>
        <button onclick="_runner._captureOnContinue()" style="width:100%;padding:8px;border:none;background:none;font-size:13px;font-weight:600;cursor:pointer;color:var(--text-muted)">Skip — don't log numbers this time</button>
      </div>
    </div>
  `
}

// Toggling mid-card must not blow away whatever's already typed into the OTHER active fields — a
// naive re-render on toggle would (les-048 class: "both surfaces still render a plausible string,
// just missing a field, so nothing throws"). Snapshot before re-rendering, pass back as prefill.
function _toggleCardioCaptureMetric(key) {
  const snapshot = {
    avgHr: document.getElementById('wr-capture-avg-hr')?.value || '',
    maxHr: document.getElementById('wr-capture-max-hr')?.value || '',
    watts: document.getElementById('wr-capture-watts')?.value || '',
    pace:  document.getElementById('wr-capture-pace')?.value || '',
    strokeRate: document.getElementById('wr-capture-stroke-rate')?.value || ''
  }
  const t = _loadCardioCaptureToggles()
  t[key] = !t[key]
  _saveCardioCaptureToggles(t)
  renderCardioCaptureCard(_runner.exercises[_runner.exIdx], _runner._captureOnContinue, snapshot)
}

// Attaches captured values to the MOST RECENT logged round only, not every round of a multi-round
// cardio exercise — one glance at the console, taken once, shouldn't be stamped across earlier
// rounds as if it were measured then too. Only reads inputs for toggled-on metrics; an inactive
// metric's field doesn't exist in the DOM, so there's nothing stale to accidentally pick up.
function _applyCardioCapture(ex) {
  const last = ex.loggedSets[ex.loggedSets.length - 1]
  if (!last) return
  const g = id => document.getElementById(id)?.value?.trim() || null
  const t = _loadCardioCaptureToggles()
  if (t.hr)    { last.avgHr = g('wr-capture-avg-hr'); last.maxHr = g('wr-capture-max-hr') }
  if (t.watts) { last.avgWatts = g('wr-capture-watts') }
  if (t.pace)  { last.pace = g('wr-capture-pace') }
  if (t.strokeRate) { last.strokeRate = g('wr-capture-stroke-rate') }
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
          <label style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase">${window._unitPrefs.weight}</label>
          <input id="wr-edit-weight" class="field-input" style="width:100%;margin-top:4px;font-size:22px;font-weight:700;text-align:center" value="${s.weight === 'BW' ? 'BW' : (_hasNumVal(s.weight) ? weightToPref(s.weight) : '')}" placeholder="—">
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
  const weight = weightFromPref(document.getElementById('wr-edit-weight')?.value.trim()) ?? ''
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
  stopRunnerCountIn()
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
  stopRunnerCountIn()
  stopIntervalTimer()
  stopStrengthSetTimer()

  const restActive = _runner.restRemaining != null

  if (restActive && i === _runner._restForExIdx) {
    // Landing on (or staying on) the exercise the active/pending rest belongs to.
    if (_runner._restPendingFire) {
      // It already reached zero while the athlete was elsewhere — consume the deferred fire now,
      // at the moment of return, the same way an on-screen zero-tick would have (startRestTimer).
      _runner.restRemaining = null
      _runner._restForExIdx = null
      _runner._restPendingFire = false
      const cb = _runner._afterRest
      _runner.exIdx = i
      if (cb) { _runner._afterRest = null; cb() } else renderRunner()
      return
    }
    // Still counting down — nothing to tear down. Table mode's inline bar reappears on its own via
    // renderRunner() (renderStrengthTable rebuilds it fresh, gated on _restForExIdx === exIdx). Wizard
    // mode's floating overlay is a SEPARATE DOM node outside #workout-runner's innerHTML tree though —
    // it was explicitly removed on the way out (below), so renderRunner() alone won't bring it back;
    // it must be recreated explicitly here or "navigate back restores the full countdown" silently
    // wouldn't hold for any cardio/interval exercise.
    _runner.exIdx = i
    renderRunner()
    if (!_isPlainStrengthExercise(_runner.exercises[i])) renderRestTimer()
    return
  }

  if (restActive) {
    // Navigating to a DIFFERENT exercise while a rest is running elsewhere. Redesigned 2026-07-29
    // (Jake: "the timer stops" when glancing ahead) — the countdown (and its beep/voice cues) keeps
    // running; only the big page-top overlay DOM node is dropped, since the persistent chip
    // (rendered by renderRunner, gated on _restForExIdx !== exIdx) takes over visually. Deliberately
    // NOT touching _restInterval/_afterRest/_restForExIdx — nulling _afterRest here (as this
    // function used to, unconditionally) is exactly what the redesign removes: it's what let a
    // queued callback fire against the wrong exercise before; now it simply stays queued for
    // whichever exercise it belongs to until they return to it.
    document.getElementById('rest-timer-overlay')?.remove()
    _runner.exIdx = i
    renderRunner()
    return
  }

  // No rest active — unchanged from before this fix.
  _runner._afterRest = null
  _runner.exIdx = i
  renderRunner()
}

function runnerGoBack() {
  if (_runner && _runner.exIdx > 0) runnerJumpTo(_runner.exIdx - 1)
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
  const notes = document.getElementById('att-notes').value.trim() || null
  const supersetGroup = document.getElementById('att-superset')?.value.trim().toUpperCase() || null
  const sets = window._templateSets || []
  // Shared with saveExerciseToTemplate — one allowlist, so these two cannot drift again (les-037).
  // `derived` reproduces exactly what this function used to inline: unilateral === metricType is
  // 'unilateral', timed === metricType is 'timed_hold'. Same helper the builder uses. `type` (ex.type,
  // the legacy column the runner's cardio-vs-strength render branch and startCardioTimer both gate on)
  // now comes from the same derivation, not a separate inline `metricType === 'cardio' ? ... : 'strength'`
  // — that old ternary didn't know about 'interval', so a mid-session swap/add to Intervals silently
  // typed the exercise 'strength' and could never reach the cardio branch or the phase-walk Start
  // trigger. Found 2026-07-26 while wiring that trigger; same les-036/037 drift shape.
  const derived = _deriveFromMetricType(metricType)
  const type = derived.exercise_type
  const cleanSets = _cleanTemplateSets(sets, derived)
  const oneRM = await _lookupClientOneRM(name, exerciseId)
  closeModal('add-to-template-modal')

  const restSecs = parseRest(cleanSets[0]?.restMin || '') || 90

  if (mode === 'swap') {
    // Swapping the exercise a rest currently belongs to changes its identity/shape from under that
    // rest (name, type, deleted phases/tableRows below) — any queued _afterRest referencing the old
    // ex.phases would now break, and "resting" no longer means anything for whatever this slot holds
    // next. Abandon it silently (no callback fired) rather than let a stale overlay/chip linger for a
    // rest that no longer describes anything real. A rest belonging to a DIFFERENT exercise is
    // untouched — swapping doesn't affect it. Neither "⇄ Swap exercise" nor "+ Add exercise" is
    // gated off during a rest, so this bypasses runnerJumpTo entirely; found by multi-agent review,
    // 2026-07-29.
    if (_runner.restRemaining != null && _runner._restForExIdx === _runner.exIdx) {
      _runner._restInterval = clearTimer(_runner._restInterval)
      _runner.restRemaining = null
      _runner._restForExIdx = null
      _runner._restPendingFire = false
      _runner._afterRest = null
      document.getElementById('rest-timer-overlay')?.remove()
    }
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
    delete ex.phases
    ex.oneRM = oneRM
    // targetSets above is cleanSets.length, always 1 for an interval block — _initIntervalPhases
    // overwrites it with the real work-round count, matching how the initial session-load path
    // (line ~52) already handles this. Without it the idle card reads "Set 1 of 1" for an N-round
    // block until Start self-heals it via startCardioTimer's own !ex.phases guard.
    if (_isIntervalExercise(ex)) _initIntervalPhases(ex)
    if (type !== 'cardio') fetchRunnerLastSession(name, exerciseId)
    renderRunner()
  } else {
    const ex = {
      name, exerciseId, type, metricType, targetSets: cleanSets.length || 3, targetReps: '', targetWeight: '',
      restSecs, loggedSets: [], bodyweight: !!cleanSets[0]?.bodyweight, assisted: !!cleanSets[0]?.assisted,
      supersetGroup, sets_json: cleanSets, notes, oneRM
    }
    if (_isIntervalExercise(ex)) _initIntervalPhases(ex)
    _runner.exercises.push(ex)
    _runner.exIdx = _runner.exercises.length - 1
    // A new exercise always lands on a brand-new last index, which can never be the one an active
    // rest belongs to — this is always the "navigated away" case runnerJumpTo already handles for
    // real navigation. Same treatment here: leave the rest running (untouched _restInterval/
    // _afterRest/_restForExIdx, the new chip picks it up), just drop the stale floating overlay so it
    // doesn't linger frozen over the newly-added exercise. "+ Add exercise" isn't gated off during a
    // rest, so this bypasses runnerJumpTo entirely; found by multi-agent review, 2026-07-29.
    if (_runner.restRemaining != null) document.getElementById('rest-timer-overlay')?.remove()
    fetchRunnerLastSession(name, exerciseId)
    renderRunner()
  }
}

function addExtraCardioSet() {
  const ex = _runner.exercises[_runner.exIdx]
  if (_isIntervalExercise(ex)) {
    // Interval blocks describe the whole exercise as ONE entry (work × sets), not independent rows per
    // round like plain cardio — pushing a duplicate array entry (the plain-cardio path below) would
    // leave ex.phases (built once from sets_json[0] alone) unaware of the extra round, so a live timer
    // used for it would silently end one round early (multi-agent-review, 2026-08-09: _finishIntervalExercise
    // only consults phases, never targetSets/sets_json.length). Extend the block itself instead, then
    // re-derive phases + targetSets together from it so the manual-LOG and Start-timer paths agree.
    const b = ex.sets_json?.[0]
    if (b) { b.sets = (b.sets || 1) + 1; _initIntervalPhases(ex) }
  } else {
    ex.targetSets = (ex.targetSets || 0) + 1
    if (ex.sets_json?.length) ex.sets_json.push({ ...ex.sets_json[ex.sets_json.length - 1] })
  }
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
  _runner._restForExIdx = null
  _runner._restPendingFire = false
  stopRunnerCountIn()
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

  const duration  = fmtRunnerTime(startTime)
  const doneExs   = _loggedExercises()   // same definition the save uses — they must not diverge
  const totalSets = doneExs.reduce((s,e) => s + e.loggedSets.length, 0)
  const totalReps = doneExs.reduce((s,e) => s + e.loggedSets.reduce((sr,set) => sr + (parseInt(set.reps,10)||0), 0), 0)
  const totalVol  = doneExs.reduce((s,e) => s + e.loggedSets.reduce((sv,set) => {
    const w = parseFloat(set.weight), r = parseInt(set.reps,10)
    return sv + (isNaN(w)||isNaN(r) ? 0 : w * r)
  }, 0), 0)
  // METRES (2026-07-22) — via the shared reader so a legacy km draft still totals correctly.
  const totalDist = doneExs.filter(e=>e.type==='cardio').reduce((s,e) => s + e.loggedSets.reduce((sd,set) => sd + _cardioDistanceM(set), 0), 0)

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
              <div style="font-size:17px;font-weight:800;color:var(--accent)">${window._unitPrefs.weight==='lb' ? Math.round(weightToPref(totalVol)).toLocaleString()+'lb' : (totalVol>=1000?(totalVol/1000).toFixed(1)+'t':totalVol.toLocaleString()+'kg')}</div>
              <div style="font-size:10px;color:var(--text-muted);margin-top:2px;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Volume</div>
            </div>` : ''}
            ${totalDist > 0 ? `<div style="background:var(--surface-2);border-radius:10px;padding:10px 8px;text-align:center">
              <div style="font-size:17px;font-weight:800;color:var(--accent)">${fmtDistanceM(totalDist)}</div>
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
            const exDist = isCardio ? e.loggedSets.reduce((s,set)=>s+_cardioDistanceM(set),0) : 0
            return `
            <div style="margin-bottom:14px;background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden">
              <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--border)">
                <span style="font-weight:600;font-size:14px">${escapeHtml(e.name)}</span>
                <div style="display:flex;align-items:center;gap:6px">
                  ${isPR ? `<span style="font-size:10px;font-weight:700;color:#f59e0b;background:rgba(245,158,11,.12);padding:2px 7px;border-radius:10px">🏆 PR</span>` : ''}
                  <span style="font-size:12px;color:var(--text-muted)">${e.loggedSets.length} set${e.loggedSets.length>1?'s':''} ${!isCardio&&exVol>0?'· '+Math.round(weightToPref(exVol)).toLocaleString()+window._unitPrefs.weight:''} ${isCardio&&exDist>0?'· '+fmtDistanceM(exDist):''}</span>
                </div>
              </div>
              ${e.loggedSets.map((s,i) => {
                const w = parseFloat(s.weight), r = parseInt(s.reps,10)
                const isSetPR = !isCardio && w > 0 && w === bestWeight && isPR
                return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 14px;border-bottom:1px solid var(--border);font-size:13px${isSetPR?' background:rgba(245,158,11,.06)':''}">
                  <span style="color:var(--text-muted)">Set ${i+1}</span>
                  <span style="font-weight:600${isSetPR?';color:#d97706':''}">
                    ${isCardio
                      // _cardioDistanceM(s) > 0, not a bare call: it returns a literal 0 (never
                      // null) for "distance not entered", by design — every OTHER caller sums/
                      // compares it as a number. fmtDistanceM itself was fixed 2026-07-30 to render
                      // a real 0 as "0 m" (needed for jump_distance) — so a bare call here would
                      // wrongly print "0 m" on every duration-only cardio set (the common case).
                      ? [s.duration, _cardioDistanceM(s) > 0 ? fmtDistanceM(_cardioDistanceM(s)) : null].filter(Boolean).join(' · ')
                      : [s.weight&&s.weight!=='BW'?fmtWeight(s.weight, { spaced: true }):s.weight==='BW'?'BW':'', s.reps?s.reps+' reps':''].filter(Boolean).join(' × ')
                    }
                    ${isSetPR ? ' 🏆' : ''}
                  </span>
                </div>`
              }).join('')}
            </div>`
          }).join('')}

          <div class="field" style="margin-top:4px">
            <label class="field-label">Session name</label>
            <input class="field-input" id="rf-name" value="${escapeAttr(runnerName || '')}">
          </div>
          <div class="field">
            <label class="field-label">Notes</label>
            <textarea class="field-input" id="rf-notes" rows="2" placeholder="How did it go?"></textarea>
          </div>
        </div>

        <div style="padding:12px 16px 24px;border-top:1px solid var(--border);display:flex;gap:8px">
          <button onclick="confirmDiscardRunner()" style="flex:0 0 auto;padding:0 16px;height:48px;border:1px solid var(--border);border-radius:10px;background:transparent;font-size:13px;font-weight:600;cursor:pointer;color:var(--danger)">Discard</button>
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
  // Tapping End with nothing logged has nothing to lose — discardRunner() runs bare here by design,
  // same as it does after a successful save (below). The confirm belongs on the ONE call site where a
  // tap can actually destroy real unsaved work: the Discard button beside Save. See
  // confirmDiscardRunner. (An earlier version of this fix put the confirm inside discardRunner()
  // itself, which meant it also fired here — on an empty session with nothing to lose — and again
  // after a successful save, telling the user their just-saved workout was about to be lost. Neither
  // is true. Fix the call site, not the shared teardown.)
  if (_runner.exercises.some(e=>e.loggedSets.length)) showRunnerFinish()
  else discardRunner()
}

// The ONLY confirming entry point to discardRunner() — the Discard button on the finish screen,
// which sits directly beside Save. That is the one tap that can destroy real unsaved work with a
// single accidental press; every other caller (confirmEndRunner's empty-session branch, and the
// post-save teardown in saveRunnerSession) has nothing left to lose and must stay silent.
function confirmDiscardRunner() {
  if (!confirm('Discard this workout? Everything logged will be lost — this cannot be undone.')) return
  discardRunner()
}

function discardRunner() {
  clearInterval(_runner?._timerInterval)
  clearInterval(_runner?._countInInterval)
  clearInterval(_runner?._intervalInterval)
  clearInterval(_runner?._restInterval)
  _stopRunnerDraftSafetyNet()
  _clearRunnerDraft(_runner?.clientId)
  document.getElementById('workout-runner')?.remove()
  document.getElementById('wr-countin-overlay')?.remove()
  document.getElementById('wr-interval-overlay')?.remove()
  document.getElementById('rest-timer-overlay')?.remove()
  _runner = null
}

// The single definition of "an exercise worth saving" — used by BOTH the finish screen and
// saveRunnerSession. They were previously two separate filters over the same collection: the finish
// screen required only `loggedSets.length` while the save also required `e.name`. A Custom/blank
// workout seeds a nameless exercise and the fast table renders no name input, so a session could be
// counted and itemised on the finish screen and then silently discarded on save. Names are backfilled
// here rather than the row being dropped — losing logged work is never the right answer to a missing
// label. NOTE the finish screen has no route back to the runner, so the fallback is visible but NOT
// correctable in-session; renaming has to happen from the saved log.
function _loggedExercises() {
  if (!_runner) return []
  const out = _runner.exercises.filter(e => e.loggedSets.length)
  out.forEach((e, i) => { if (!e.name || !String(e.name).trim()) e.name = `Exercise ${i + 1}` })
  return out
}

async function saveRunnerSession() {
  if (!_runner) return
  // Capture all _runner fields into locals before any await — discardRunner() can null _runner mid-save
  const name      = document.getElementById('rf-name')?.value.trim() || _runner.name
  const notes     = document.getElementById('rf-notes')?.value.trim() || null
  const clientId  = _runner.clientId
  const date      = _runner.date
  const exercises = _loggedExercises()
  if (!exercises.length) { showToast('No sets logged — nothing to save.', 'warn', 3000); return }

  const saveBtn = document.querySelector('#workout-runner button[onclick="saveRunnerSession()"]')
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…' }

  // showUserError: false — this shows its own error message below, tailored to what actually failed
  // (a real network blip vs. a clientId that doesn't resolve to a client this account can see at all).
  // MUST fail loud, not fall back to currentUser.id: a solo/coach's own record legitimately comes back
  // with coach_id:null (a real row, not a lookup failure) and correctly falls through to currentUser.id
  // a line below — but a clientId RLS denies (0 rows) used to silently do the exact same fallback,
  // which would have inserted a workout_logs row for someone else's client, attributed to whoever is
  // currently logged in. Confirmed exploitable via a live cross-tenant probe, 2026-07-30.
  const { data: clientRecord, error: clientErr } = await dbq('saveRunnerSession:clientLookup', db.from('clients').select('coach_id').eq('id', clientId).single(), { showUserError: false })
  if (!clientRecord) {
    log.error('saveRunnerSession', 'client ownership could not be verified — refusing to save', clientErr)
    showToast('Could not verify this client — please refresh and try again.', 'error')
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save workout' }
    return
  }
  const coachId = clientRecord.coach_id || currentUser.id

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
      // HR/watts/pace/stroke rate are common to any set shape (populated once, at exercise-finish,
      // by renderCardioCaptureCard — 2026-08-08); apply uniformly. s.pace/s.strokeRate stay raw
      // strings on the in-memory logged set (matching how duration/distanceM are stored raw and
      // converted only here at save) — parseRest() does the mm:ss->seconds conversion for pace,
      // matching the existing prescribed sets_json.pace500Min/Max semantic (seconds per 500m).
      const applyCardioMetrics = (row) => {
        if (s.avgHr) row.avg_hr = parseInt(s.avgHr)
        if (s.maxHr) row.max_hr = parseInt(s.maxHr)
        if (s.avgWatts) { const w = parseInt(s.avgWatts); if (!isNaN(w) && w > 0) row.avg_watts = Math.min(w, 2000) }
        // Bounded BOTH ends, matching the DB's CHECK constraint exactly (30-1800) — Math.min alone
        // (the pattern avgWatts/strokeRate use below) isn't enough here because their columns have no
        // lower-bound CHECK, so an under-range value just looks oddly low; pace_500m_secs DOES have
        // one, and a single fat-fingered short entry (e.g. "0:15") would otherwise violate the CHECK
        // and fail the whole batched workout_log_sets insert for every exercise in the session, not
        // just this one field. Out-of-range silently drops the value instead (same "best-effort,
        // optional" spirit as every other field here) rather than crashing the save. Found by review.
        if (s.pace) { const p = parseRest(s.pace); if (p >= 30 && p <= 1800) row.pace_500m_secs = p }
        if (s.strokeRate) { const sr = parseInt(s.strokeRate); if (!isNaN(sr) && sr > 0) row.stroke_rate_spm = Math.min(sr, 100) }
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
          if (sd.weight !== 'BW' && _hasNumVal(sd.weight)) row.weight_kg = parseFloat(sd.weight)
          applyCardioMetrics(row)
          if (Object.keys(row).length > 3) allSets.push(row)
        }
        return
      }

      const row = { workout_log_exercise_id: logExId, set_number: setNumber }
      if (ex.type === 'cardio') {
        if (s.duration) row.duration_seconds = parseDuration(s.duration)
        // Metres in, metres out (2026-07-22). `s.distance` is the legacy km key — still read so a draft
        // or an in-flight session started before this change still saves the right number.
        if (s.distanceM)     row.distance_m = Math.round(parseFloat(s.distanceM))
        else if (s.distance) row.distance_m = Math.round(parseFloat(s.distance) * 1000)
        // Interval phase (warmup/work/cooldown only — _logIntervalPhase's own guard is the sole
        // producer of this key; rest/recovery/countdown never reach it). Ordinary strength sets and
        // steady-state cardio sets never carry `phase`, so the column stays null for them — matching
        // the CHECK constraint (phase is null or in ('warmup','work','cooldown')).
        if (s.phase) row.phase = s.phase
      } else {
        // Timed hold: duration (+ optional load). Distance-strength / jump_distance: distance_m in METRES
        // (not km). Jump height: height_cm (populated by ②c). Plus the plain weight/reps/rpe case.
        if (s.duration)   row.duration_seconds = parseDuration(s.duration)
        if (_hasNumVal(s.distance_m)) row.distance_m = Math.round(parseFloat(s.distance_m)) // already metres
        if (_hasNumVal(s.height_cm))  row.height_cm = parseFloat(s.height_cm)
        if (s.reps)       row.reps_achieved = parseInt(s.reps)
        if (s.weight !== 'BW' && _hasNumVal(s.weight)) row.weight_kg = parseFloat(s.weight)
        if (s.rpe) { row.effort_type = 'rpe'; row.effort_value = parseFloat(s.rpe) }
      }
      applyCardioMetrics(row)
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
  log.ok('saveRunnerSession', 'session saved', { logId: sessionLog.id, exercises: exercises.length })
  showToast('Workout saved!', 'success', 2500)

  const candidates = exercises
    .filter(ex => ex.type !== 'cardio')
    .map(ex => {
      let best = null
      ex.loggedSets.forEach(s => {
        const w = parseFloat(s.weight)
        const r = parseInt(s.reps)
        if (!w || !r || r < 1 || r > 10) return
        const est = _estimate1RM(w, r)
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
            <div style="font-size:13px;font-weight:700;color:var(--accent)">${escapeHtml(c.name)} — ${fmtWeight(c.weight)} × ${c.reps} reps</div>
            <div style="font-size:12px;color:var(--text-muted);margin:4px 0 10px">That puts your estimated 1RM at ≈ ${fmtWeight(c.estimate, { spaced: true, decimals: 1 })}</div>
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
    if (orm) block.oneRM = weightFromPref(orm.value) ?? ''
    block.sets.forEach((set, si) => {
      const g = (id) => document.getElementById(id)?.value ?? ''
      if (block.type === 'cardio') {
        set.duration = g(`ls-dur-${bi}-${si}`)
        set.distanceM = distanceFromPref(g(`ls-dist-${bi}-${si}`)) ?? ''   // METRES (2026-07-22) — see _cardioDistanceM
      } else {
        set.repsMin = g(`ls-rmin-${bi}-${si}`)
        set.repsMax = g(`ls-rmax-${bi}-${si}`) || set.repsMin
        set.weight  = weightFromPref(g(`ls-weight-${bi}-${si}`)) ?? ''
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
        <button id="rorm-mode-direct" onclick="_setRunnerOneRMMode('direct')" class="btn-primary" style="flex:1;font-size:12px;padding:8px">I know it (${window._unitPrefs.weight})</button>
        <button id="rorm-mode-epley" onclick="_setRunnerOneRMMode('epley')" class="btn-secondary" style="flex:1;font-size:12px;padding:8px">Estimate from a set</button>
      </div>
      <div id="rorm-direct-fields">
        <div class="field">
          <label class="field-label">1RM (${window._unitPrefs.weight})</label>
          <input class="field-input" id="rorm-weight" type="number" step="0.5" inputmode="decimal" placeholder="e.g. 120">
        </div>
      </div>
      <div id="rorm-epley-fields" style="display:none">
        <div class="field">
          <label class="field-label">Weight lifted (${window._unitPrefs.weight})</label>
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
  const w = weightFromPref(document.getElementById('rorm-est-weight')?.value)
  const r = parseInt(document.getElementById('rorm-est-reps')?.value)
  const preview = document.getElementById('rorm-epley-preview')
  const est = _estimate1RM(w, r)
  preview.textContent = est ? `≈ Epley estimate: ${fmtWeight(est, { spaced: true, decimals: 1 })}`
    : (w && r > _ESTIMATE_1RM_MAX_REPS ? `Too many reps for a reliable estimate (max ${_ESTIMATE_1RM_MAX_REPS})` : '')
}

async function saveRunnerOneRM(exIdx) {
  const ex = _runner.exercises[exIdx]
  const errEl = document.getElementById('rorm-error')
  const mode = document.getElementById('rorm-epley-fields').style.display === 'block' ? 'epley' : 'direct'
  let oneRM
  if (mode === 'direct') {
    oneRM = weightFromPref(document.getElementById('rorm-weight')?.value)
  } else {
    const w = weightFromPref(document.getElementById('rorm-est-weight')?.value)
    const r = parseInt(document.getElementById('rorm-est-reps')?.value)
    oneRM = _estimate1RM(w, r)
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
      ${hdr(`Distance (${window._unitPrefs.cardioDistance === 'mi' ? 'mi' : 'm'})`)}
      <span></span>
    ` : isMobile ? `
      ${hdr('#')}
      ${hdr('Reps')}
      ${hdr(`Weight (${window._unitPrefs.weight})`)}
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
      ${hdr(`Weight (${window._unitPrefs.weight})`)}
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
        ? `<div style="font-size:9px;color:var(--accent);text-align:center;margin-top:1px">${_calcWeightFromPct(orm, s.pctMin) ? weightToPref(_calcWeightFromPct(orm, s.pctMin)) : ''}${s.pctMax && s.pctMax !== s.pctMin && _calcWeightFromPct(orm, s.pctMax) ? '–' + weightToPref(_calcWeightFromPct(orm, s.pctMax)) : ''}${orm && (s.pctMin || s.pctMax) ? window._unitPrefs.weight : ''}</div>`
        : ''
      const delBtn = `<button onclick="flushLogState();window._logBlocks[${bi}].sets.splice(${si},1);renderLogExercises()" style="width:${isMobile?'28px':'22px'};height:${isMobile?'36px':'22px'};border-radius:5px;border:1px solid var(--border);background:transparent;color:var(--text-muted);cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;padding:0">×</button>`
      return `
        <div style="display:grid;grid-template-columns:${GRID};gap:${isMobile?'5px':'3px'};align-items:center;margin-bottom:${isMobile?'6px':'3px'}">
          <span style="font-size:11px;font-weight:600;color:var(--text-muted);text-align:center">${si + 1}</span>
          ${isCardio ? `
            <input id="ls-dur-${bi}-${si}" ${si_style} type="text" placeholder="0:00" value="${escapeAttr(String(s.duration || '0:00'))}" oninput="this.value=fmtRestInput(this.value)">
            <input id="ls-dist-${bi}-${si}" ${si_style} type="number" step="${window._unitPrefs.cardioDistance === 'mi' ? '0.01' : '1'}" inputmode="decimal" placeholder="${window._unitPrefs.cardioDistance === 'mi' ? 'mi' : 'm'}" value="${_cardioDistanceM(s) ? distanceToPref(_cardioDistanceM(s)) : ''}">
          ` : isMobile ? `
            <input id="ls-rmin-${bi}-${si}" ${si_style} inputmode="numeric" placeholder="reps" value="${escapeAttr(String(s.repsMin || ''))}">
            <input id="ls-weight-${bi}-${si}" ${si_style} inputmode="decimal" step="0.5" placeholder="${window._unitPrefs.weight}" value="${_hasNumVal(s.weight) ? weightToPref(s.weight) : ''}">
            <input id="ls-effort-${bi}-${si}" ${si_style} inputmode="decimal" step="0.5" min="0" max="10" placeholder="${isRIR?'0–5':'1–10'}" value="${escapeAttr(String(s.effort || ''))}">
          ` : `
            <input id="ls-rmin-${bi}-${si}" ${si_style} type="number" placeholder="min" value="${escapeAttr(String(s.repsMin || ''))}">
            <input id="ls-rmax-${bi}-${si}" ${si_style} type="number" placeholder="max" value="${escapeAttr(String(s.repsMax || ''))}">
            <div>
              <input id="ls-weight-${bi}-${si}" ${si_style} type="number" step="0.5" placeholder="${window._unitPrefs.weight}" value="${weightToPref(orm && (s.pctMin||s.pctMax) ? (_calcWeightFromPct(orm,s.pctMin)||(_hasNumVal(s.weight)?s.weight:'')) : (_hasNumVal(s.weight)?s.weight:''))}">
            </div>
            <input id="ls-pmin-${bi}-${si}" ${si_style} type="number" placeholder="%" value="${escapeAttr(String(s.pctMin || ''))}" oninput="flushLogState()" onchange="renderLogExercises()">
            <div>
              <input id="ls-pmax-${bi}-${si}" ${si_style} type="number" placeholder="%" value="${escapeAttr(String(s.pctMax || ''))}" oninput="flushLogState()" onchange="renderLogExercises()">
              ${wFromPct}
            </div>
            <input id="ls-effort-${bi}-${si}" ${si_style} type="number" step="0.5" min="0" max="10" placeholder="${isRIR?'0–5':'1–10'}" value="${escapeAttr(String(s.effort || ''))}">
            <input id="ls-rest-${bi}-${si}" ${si_style} type="text" placeholder="0:00" value="${escapeAttr(String(s.rest || '0:00'))}" oninput="this.value=fmtRestInput(this.value)">
          `}
          ${delBtn}
        </div>
      `
    }).join('')

    return `
      <div style="border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:8px;padding:9px 12px;background:rgba(99,102,241,.06);border-bottom:1px solid var(--border)">
          <div style="width:22px;height:22px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;flex-shrink:0">${String.fromCharCode(65+bi)}</div>
          <input id="ls-exname-${bi}" class="field-input" style="padding:5px 8px;font-size:16px;font-weight:500;flex:1;background:transparent;border-color:transparent" placeholder="Exercise name" value="${escapeAttr(String(block.name || ''))}" oninput="window._logBlocks[${bi}].name=this.value">
          <select id="ls-extype-${bi}" class="field-input" style="padding:5px 8px;font-size:16px;width:100px;flex-shrink:0" onchange="flushLogState();window._logBlocks[${bi}].type=this.value;renderLogExercises()">
            <option value="strength" ${!isCardio?'selected':''}>Strength</option>
            <option value="cardio" ${isCardio?'selected':''}>Cardio</option>
          </select>
          <button onclick="flushLogState();window._logBlocks.splice(${bi},1);renderLogExercises()" style="font-size:16px;color:var(--text-muted);background:none;border:none;cursor:pointer;padding:0 2px;flex-shrink:0">×</button>
        </div>
        ${!isCardio ? `
        <div style="display:flex;align-items:center;gap:8px;padding:7px 12px;border-bottom:1px solid var(--border);background:rgba(0,0,0,.02)">
          <span style="font-size:11px;font-weight:500;color:var(--text-muted);white-space:nowrap">1 Rep Max</span>
          <input id="ls-orm-${bi}" class="field-input" style="width:72px;padding:4px 8px;font-size:16px;text-align:center" type="number" step="0.5" placeholder="e.g. 100" value="${block.oneRM ? weightToPref(block.oneRM) : ''}" oninput="window._logBlocks[${bi}].oneRM=this.value" onchange="flushLogState();renderLogExercises()">
          <span style="font-size:11px;color:var(--text-muted)">${window._unitPrefs.weight}</span>
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
      // An interval block also has exercise_type:'cardio' (the legacy-column derivation this whole
      // feature relies on), but its sets_json[0] has no duration/distanceM keys — mapping it through
      // the plain cardio branch below silently produced one blank row with the right name and zero
      // prescription, no error. This modal has no interval-block editor (its type <select> only
      // offers Strength/Cardio), so rather than inventing one here, seed the row with the block's
      // total time as a sane starting point for retroactive logging — the coach can still edit it.
      const isInterval = ex.metric_type === 'interval'
      let sets = []
      if (isInterval && ex.sets_json?.length) {
        const { total, hasUnknown } = _intervalTotalSecs(_expandIntervalBlock(ex.sets_json[0] || {}))
        sets = [{ duration: fmtRestCountdown(total) + (hasUnknown ? '+' : ''), distanceM: '' }]
      } else if (ex.sets_json?.length) {
        sets = ex.sets_json.map(s => {
          if (isCardio) return { duration: s.duration || '', distanceM: _cardioDistanceM(s) || '' }
          const repsStr = String(s.reps || '')
          const [rMin, rMax] = repsStr.includes('-') ? repsStr.split('-') : [repsStr, '']
          return { repsMin: rMin, repsMax: rMax, weight: s.weight || '', pctMin: '', pctMax: '', effort: s.rpe || '', rest: s.rest ? fmtDuration(s.rest) : '' }
        })
      } else {
        const count = ex.sets || 3
        const repsStr = String(ex.reps || '')
        const [rMin, rMax] = repsStr.includes('-') ? repsStr.split('-') : [repsStr, '']
        for (let i = 0; i < count; i++) {
          if (isCardio) sets.push({ duration: '', distanceM: '' })
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
  // MUST fail loud, not fall back to currentUser.id — see saveRunnerSession's identical fix, same
  // confirmed cross-tenant-write risk, 2026-07-30.
  const { data: clientRecord, error: clientErr } = await dbq('saveWorkoutSession:clientLookup', db.from('clients').select('coach_id').eq('id', clientId).single(), { showUserError: false })
  if (!clientRecord) {
    log.error('saveWorkoutSession', 'client ownership could not be verified — refusing to save', clientErr)
    errorEl.textContent = 'Could not verify this client — please refresh and try again.'
    return
  }
  const coachId = clientRecord.coach_id || currentUser.id

  log.info('saveWorkoutSession', 'saving session', { clientId, exerciseCount: blocks.length })
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
        // Metres in, metres out — same shape as saveRunnerSession. `distance` (km) stays readable so a
        // half-filled modal from before this change still saves the right number.
        if (s.distanceM)     row.distance_m = Math.round(parseFloat(s.distanceM))
        else if (s.distance) row.distance_m = Math.round(parseFloat(s.distance) * 1000)
      } else {
        const rMin = parseInt(s.repsMin)
        if (!isNaN(rMin)) row.reps_achieved = rMin
        // Same falsy-zero shape as saveRunnerSession's weight guard (Jake, 2026-07-29) — this
        // sibling function was missed the first time since Jake's report came from the live runner,
        // not this manual Log Session modal, but a typed 0kg here was silently dropped the same way.
        if (_hasNumVal(s.weight)) row.weight_kg = parseFloat(s.weight)
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

  log.ok('saveWorkoutSession', 'session fully saved', { clientId, logId: sessionLog.id })
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
        <div style="font-size:17px;font-weight:700">${totalVol > 0 ? Math.round(weightToPref(totalVol)).toLocaleString()+' '+window._unitPrefs.weight : '—'}</div>
        <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-top:2px">Volume</div>
        ${volDelta !== null && totalVol > 0 ? `<div style="font-size:11px;font-weight:600;margin-top:3px;color:${volDelta >= 0 ? '#10b981' : '#ef4444'}">${volDelta >= 0 ? '+' : ''}${Math.round(weightToPref(volDelta)).toLocaleString()} ${window._unitPrefs.weight}</div>` : ''}
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
        const mt = _resolveMetricType(ex.metric_type, ex.exercise_type, sets[0])
        const isJumpHeight = mt === 'jump_height'
        const isJumpDistance = mt === 'jump_distance'
        const hasRpe   = !isCardio && !isJumpHeight && !isJumpDistance && sets.some(s => s.effort_value != null)
        const prevSets = prevExMap[ex.exercise_name] || []
        const prevVol  = prevSets.reduce((sum, s) => sum + ((parseFloat(s.weight_kg)||0) * (parseInt(s.reps_achieved)||0)), 0)
        const prevSummary = prevSets.length
          ? (isCardio
              ? `${prevSets.length} set${prevSets.length > 1 ? 's' : ''}`
              : prevVol > 0 ? `${Math.round(weightToPref(prevVol)).toLocaleString()} ${window._unitPrefs.weight} volume` : `${prevSets.length} set${prevSets.length > 1 ? 's' : ''}`)
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
              ${ex.client_notes ? `<div style="font-size:12px;color:var(--text);background:rgba(99,102,241,.06);border-radius:8px;padding:8px 10px;margin-bottom:10px"><span style="font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;font-size:10px">Client note</span><div style="margin-top:2px;white-space:pre-wrap">${escapeHtml(ex.client_notes)}</div></div>` : ''}
              ${sets.length === 0 ? `<div style="color:var(--text-muted);font-size:13px">No sets recorded</div>` : `
                <table style="width:100%;border-collapse:collapse">
                  <thead>
                    <tr style="border-bottom:1px solid var(--border)">
                      <th style="${thStyle}">Set</th>
                      ${isCardio
                        ? `<th style="${thStyle}">Duration</th><th style="${thStyle}">Distance</th>`
                        : isJumpHeight
                        ? `<th style="${thStyle}">Height (${window._unitPrefs.jumpHeight === 'in' ? 'in' : 'cm'})</th><th style="${thStyle}">Jumps</th>`
                        : isJumpDistance
                        ? `<th style="${thStyle}">Distance (m)</th><th style="${thStyle}">Jumps</th>`
                        : `<th style="${thStyle}">Reps</th><th style="${thStyle}">Weight</th>${hasRpe ? `<th style="${thStyle}">RPE</th>` : ''}`
                      }
                    </tr>
                  </thead>
                  <tbody>
                    ${sets.map(s => `
                      <tr style="border-bottom:1px solid var(--border)">
                        <td style="padding:8px 12px 8px 0;font-size:13px;color:var(--text-muted);font-weight:600">Set ${s.set_number}</td>
                        ${isCardio
                          ? `<td style="padding:8px 12px 8px 0;font-size:13px">${s.duration_seconds ? fmtDuration(s.duration_seconds) : '—'}</td><td style="padding:8px 0;font-size:13px">${_hasNumVal(s.distance_m) ? fmtDistanceM(s.distance_m) : '—'}</td>`
                          : isJumpHeight
                          ? `<td style="padding:8px 12px 8px 0;font-size:13px">${_hasNumVal(s.height_cm) ? fmtJumpHeight(s.height_cm, { spaced: true }) : '—'}</td><td style="padding:8px 0;font-size:13px">${s.reps_achieved || '—'}</td>`
                          : isJumpDistance
                          ? `<td style="padding:8px 12px 8px 0;font-size:13px">${_hasNumVal(s.distance_m) ? fmtDistanceM(s.distance_m) : '—'}</td><td style="padding:8px 0;font-size:13px">${s.reps_achieved || '—'}</td>`
                          : `<td style="padding:8px 12px 8px 0;font-size:13px">${s.reps_achieved || '—'}</td><td style="padding:8px 12px 8px 0;font-size:13px">${_hasNumVal(s.weight_kg) ? fmtWeight(s.weight_kg, { spaced: true }) : '—'}</td>${hasRpe ? `<td style="padding:8px 0;font-size:13px">${s.effort_value != null ? 'RPE '+s.effort_value : '—'}</td>` : ''}`
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

