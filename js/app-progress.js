// ─── Progress photos — REMOVED 2026-07-12 (Jake: "remove the progress photos feature for now") ───
// The Photos tab (button + switch case in app-clients.js) and renderClientPhotos /
// uploadProgressPhoto / deleteProgressPhoto lived here. Removed the CODE only, not the DATA: the
// `progress-photos` Supabase bucket and its contents are untouched, so this is restorable — pull the
// functions back from git history (last present at app-progress v9) and re-add the tab.
//
// The bucket is verified PRIVATE (tests/storage-privacy.spec.js: an anonymous fetch of an uploaded
// photo returns HTTP 400, not the image) and its RLS is intact, so nothing is exposed by leaving it.
// One real pre-existing photo remains in it (folder 97bb871a…, a dev-era upload not tied to any
// current client) — flagged to Jake for a delete/keep decision. With no UI to delete photos, any
// future stored photo would need manual removal, so do NOT re-enable uploads without also restoring
// deleteProgressPhoto (a GDPR erasure path).

// ─── 1RMs ────────────────────────────────────────────────────────────────────

const BIG_5_EXERCISES = ['Back Squat', 'Deadlift', 'Bench Press', 'Overhead Press', 'Barbell Row']


// Refresh whichever container is actually showing the 1RMs list — the client/solo 1RMs tab
// (pb-1rms-section) or the PT-facing client-profile 1RMs tab (tab-content). Was three byte-identical
// copies of these three lines in saveBig5OneRMs, save1RM and delete1RM; a fourth was about to be
// added for the grid save, so it is hoisted instead.
function _refresh1RMs(clientId) {
  const el = document.getElementById('pb-1rms-section') || document.getElementById('tab-content')
  // Null-guarded because this runs AFTER the write has already succeeded. Without it, a caller on a
  // surface that hosts neither container throws on el.innerHTML and the exception surfaces as a
  // failed save — when the data is safely in Postgres and only the redraw had nowhere to go.
  if (!el) return Promise.resolve()
  return renderClient1RMs(clientId, el)
}

// Writes only the rows the user actually CHANGED. client_1rms is append-only — the newest row per
// exercise wins, and "+ Update" has always inserted rather than updated — so saving every row every
// time would stamp a fresh entry against today for lifts that were never touched, burying the real
// history under a wall of duplicate values.
async function saveOneRMGrid(clientId) {
  // Missed by the 2026-08-21 sweep that guarded its two neighbours in this very render function
  // (save1RM at the onclick three lines below renderClient1RMs' delete1RM). Found by pre-push
  // review 2026-08-22: the class has TWELVE members, not the ten the app-core comment claimed.
  if (!(await _verifyClientAccess('saveOneRMGrid', clientId))) {
    const e = document.getElementById('orm-grid-error'); if (e) e.textContent = 'Save failed — permission denied.'
    return
  }
  // The try/finally that used to live here existed ONLY to release _saveOneRMGridPending.
  // guardReentry (js/app-core.js) owns that now, in one place, so the wrapper is gone.
  const errEl = document.getElementById('orm-grid-error')
  if (errEl) errEl.textContent = ''
  const today = new Date().toISOString().split('T')[0]

  const changed = []
  const invalid = []
  ;(window._oneRMGridRows || []).forEach((d, i) => {
    const inp = document.getElementById(`orm-${i}`)
    if (!inp) return
    const val = (inp.value || '').trim()
    if (!val) return   // left blank — not an edit
    // Per-row date, read BEFORE the equality guard below. Replaces the backdating that used to live
    // behind the row's ⋯ (removed 2026-08-15). A cleared or malformed value is a real edit that
    // cannot be stored, so it is rejected by name rather than silently stamped with today — the same
    // treatment an unusable weight gets. (A browser with native date support only ever yields '' or
    // a valid yyyy-mm-dd; the regex is the guard for one that degrades to a text field.)
    const dateVal = (document.getElementById(`orm-date-${i}`)?.value || '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateVal)) { invalid.push(`${d.name} (date)`); return }
    const recordedAt = dateVal

    // Compared NUMERICALLY, with both sides already in the display unit, so "100.0" and "100" are
    // the same edit rather than a duplicate append. Comparing the CONVERTED kg would be wrong: a
    // kg→lb→kg round trip drifts in the last decimal and would read as a change on every save.
    //
    // `recordedAt === today` is the second half of the test, and it is load-bearing. Without it a
    // DATE-ONLY change was skipped here and the user got "Nothing changed — edit a value first"
    // while looking at the date control they had just changed. Worse, it silently removed the very
    // capability the ⋯ was deleted in favour of: the old modal inserted unconditionally, so
    // "I hit 100kg again on the 20th" recorded fine. client_1rms is append-only precisely so a
    // repeat at the same weight on a new date is a real entry. Caught by pre-push review.
    const origNum = parseFloat(inp.dataset.orig || '')
    const valNum = parseFloat(val)
    if (!isNaN(origNum) && valNum === origNum && recordedAt === today) return

    // weightFromInput, not weightFromPref: an untouched (or identically retyped) field returns the
    // stored kg verbatim instead of the lb round-trip of what was painted. See app-core.js.
    // This is the path that drifted 200 -> 199.99 on a DATE-ONLY edit, because the equality guard
    // above only skips when the date is also unchanged.
    const kg = weightFromInput(inp)
    // A typed 0, a negative, or text is a REAL edit that cannot be stored. Surfacing it beats
    // dropping it: silently skipping meant either "Nothing changed" (false — they did change it)
    // or, in a mixed save, the other rows saving while this one re-rendered showing its old value,
    // looking for all the world like it had saved too.
    if (kg == null || !(kg > 0)) { invalid.push(d.name); return }
    changed.push({ name: d.name, exerciseId: d.exerciseId, kg, recordedAt })
  })

  if (invalid.length) {
    if (errEl) errEl.textContent = `Enter a weight above 0 for ${invalid.join(', ')}`
    return
  }
  if (!changed.length) {
    if (errEl) errEl.textContent = 'Nothing changed — edit a value first'
    return
  }

  const coachId = await _effectiveCoachIdForClient(clientId)
  // REFUSE rather than guess. This is the one caller with a WRITE blast radius: coachId is handed to
  // _resolveExerciseIdForSave, which INSERTs into `exercises`. Under the old `|| currentUser.id`
  // fallback, a client row we were denied read access to resolved to "me" — so a foreign client's lift
  // name could become a permanent row in the current user's own exercise library.
  if (!coachId) {
    if (errEl) errEl.textContent = 'Could not verify this client — please refresh and try again.'
    return
  }
  const rows = await Promise.all(changed.map(async r => ({
    client_id: clientId,
    // Auto-create a library exercise ONLY for the Big 5 quick-start names — the contract
    // _resolveExerciseIdForSave documents for itself ("kept only for the Big 5 quick-start 1RM
    // form, which has no free text entry at all", app-workouts.js:1834). The grid now lists every
    // exercise_name in this client's 1RM history, so an ungated call would silently insert a
    // permanent `exercises` row named after any legacy or imported string the moment its value was
    // edited — from a screen that shows no exercise picker. exercise_id is nullable; skipping is safe.
    exercise_id: r.exerciseId || (BIG_5_EXERCISES.includes(r.name) ? await _resolveExerciseIdForSave(r.name, coachId) : null),
    exercise_name: r.name, one_rm_kg: r.kg, recorded_at: r.recordedAt || today
  })))
  const { error } = await dbq('saveOneRMGrid', db.from('client_1rms').insert(rows))
  if (error) { if (errEl) errEl.textContent = 'Save failed — try again'; return }
  showToast(`${rows.length} 1RM${rows.length === 1 ? '' : 's'} saved`, 'success')
  await _refresh1RMs(clientId)
}
guardReentry('saveOneRMGrid')  // double-press duplicates; see tests/reentry-guard-2026-08-28.spec.js

// The two affordances that used to live behind the row's ⋯ (removed 2026-08-15 on Jake's challenge:
// "I can update the maxes on the landing page, so please can you explain the need to click the 3
// dots"). He was right that it was redundant for the common case — it existed only because it was the
// ONLY route to the two things inline editing could not do: a per-row DATE (the grid otherwise always
// stamps today) and ESTIMATE FROM A SET (Epley). Both now sit in the row, collapsed until used, so the
// default row is no busier than before and nothing needs a second screen.
//
// This note lives OUTSIDE the template literal deliberately. An HTML comment inside one still ships to
// the DOM, and it is the exact shape that produced a stored XSS on 2026-08-14 when an interpolation
// sat inside `<!-- -->` — a template literal does not know it is in a comment. Keep prose in `//`.
function _toggleOneRMEstimate(i) {
  const box = document.getElementById(`orm-est-${i}`)
  if (!box) return
  const open = box.style.display !== 'none'
  box.style.display = open ? 'none' : 'flex'
  if (!open) document.getElementById(`orm-estw-${i}`)?.focus()
}

// Writes the estimate straight into the row's own value input, so there is exactly ONE number the
// Save-all path reads — the estimate is an input aid, never a second source of truth.
function _applyOneRMEstimate(i) {
  const out = document.getElementById(`orm-estout-${i}`)
  const target = document.getElementById(`orm-${i}`)
  if (!out || !target) return
  // weightFromPref converts the typed display unit to canonical kg; _estimate1RM (app-workouts.js:97,
  // shared with the programme-assignment quick entry) returns kg and refuses implausible rep counts.
  const w = weightFromPref(document.getElementById(`orm-estw-${i}`)?.value)
  const r = parseInt(document.getElementById(`orm-estr-${i}`)?.value)
  const estKg = _estimate1RM(w, r)
  if (estKg == null) {
    out.textContent = (w && r > _ESTIMATE_1RM_MAX_REPS) ? `max ${_ESTIMATE_1RM_MAX_REPS} reps` : ''
    return
  }
  // Back to the display unit for the row input, matching how every other value in this grid is held.
  // parseFloat BEFORE toFixed — weightToPref returns a STRING in lb (app-core.js:78) and calling a
  // number method on it is the crash that took down this whole page on 2026-08-14.
  const disp = parseFloat(weightToPref(estKg))
  if (isNaN(disp)) { out.textContent = ''; return }
  target.value = String(parseFloat(disp.toFixed(1)))
  out.textContent = `≈ ${fmtWeight(estKg, { spaced: true, decimals: 1 })}`
}

// ONE state, not two. This used to render a clean "Quick-start your 1RMs — The Big 5" grid when the
// client had no rows, and a completely different card-per-exercise layout the moment they had one.
// Jake compared his own account (populated) against a client's (empty) on 2026-08-14 and read it as a
// PT-vs-Personal difference: "The 1RM grid on the PT > Client side is better UI and layout than the
// grid used for personal." It was never two implementations — one function, two states, and he could
// never see the grid again on his own account. He chose "grid always" (2026-08-14), so the card
// layout is gone and the grid now carries real values inline.
async function renderClient1RMs(clientId, el) {
  el.innerHTML = '<div class="loading-state">Loading 1RMs…</div>'
  const { data: rows, error } = await db.from('client_1rms').select('*').eq('client_id', clientId).order('recorded_at', { ascending: false })
  if (error) {
    el.innerHTML = `<div class="empty-state"><div class="empty-title">Couldn't load your 1RMs</div><div class="empty-text">Check your connection and try again.</div></div>`
    return
  }

  // Group by exercise name, newest first within each group
  const byEx = {}
  ;(rows || []).forEach(r => { if (!byEx[r.exercise_name]) byEx[r.exercise_name] = []; byEx[r.exercise_name].push(r) })

  // Recorded lifts first, then any Big 5 still missing. That keeps the quick-start prompt working for
  // a brand-new account AND keeps nudging an established one about a main lift it has never recorded,
  // without either being a separate screen the other can never reach.
  const gridRows = [
    ...Object.keys(byEx).map(name => ({ name, entries: byEx[name] })),
    ...BIG_5_EXERCISES.filter(n => !byEx[n]).map(name => ({ name, entries: [] }))
  ]
  // Indexed ids, not name-derived ones: an exercise name is free text and can carry spaces, quotes or
  // markup, none of which belong in a DOM id. The parallel array is what saveOneRMGrid reads.
  window._oneRMGridRows = gridRows.map(r => ({ name: r.name, exerciseId: r.entries[0]?.exercise_id || null }))

  const unit = window._unitPrefs.weight
  const fmtDate = d => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  // Each row's date input defaults to TODAY, not to the row's existing recorded_at: the common action
  // is "I hit a new max today", and client_1rms is append-only so a save always creates a new dated
  // entry rather than editing the old one. Backdating is the exception, which is why it is a control
  // rather than a default. ISO, because that is what a native <input type="date"> requires.
  const today = new Date().toISOString().split('T')[0]

  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
      <h3 style="margin:0;font-size:var(--text-xl, 16px);font-weight:700">1 Rep Maxes</h3>
      <button class="btn-primary" style="font-size:var(--text-base, 13px);padding:8px 14px" onclick="showAdd1RMModal('${clientId}')">+ Add lift</button>
    </div>
    <div style="font-size:var(--text-md, 12px);color:var(--text-muted);margin-bottom:14px">Edit any value and press Save all. Each save keeps your previous number as history.</div>
    <div style="border:1px solid var(--border);border-radius:var(--radius-md, 12px);padding:4px 16px 16px;background:var(--surface)">
      ${gridRows.map((r, i) => {
        const latest = r.entries[0]
        const history = r.entries.slice(1)
        // Rendered to the display unit here and compared numerically on save, so a kg↔lb round trip
        // can't register as a phantom edit. decimals:1 matches what the old card layout showed.
        //
        // parseFloat BEFORE .toFixed, never after: weightToPref returns a NUMBER in kg but a STRING
        // in lb (it exits through _stripTrailingZero, app-core.js:78). Written the other way round
        // this threw "toFixed is not a function" for every lb user with a recorded 1RM, killing the
        // whole Progress page — and no test caught it because the entire suite runs at the kg
        // default. fmtWeight (app-core.js:110) is the correctly-ordered precedent.
        const dispNum = latest ? parseFloat(weightToPref(parseFloat(latest.one_rm_kg))) : NaN
        const orig = isNaN(dispNum) ? '' : String(parseFloat(dispNum.toFixed(1)))
        return `
        <div style="display:flex;align-items:center;gap:10px;padding:11px 0;border-bottom:${i < gridRows.length - 1 ? '1px solid var(--border)' : 'none'}">
          <div style="flex:1;min-width:0">
            <div style="font-size:var(--text-base, 13px);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(r.name)}</div>
            <div style="font-size:var(--text-sm, 11px);color:var(--text-muted);margin-top:1px">${latest ? 'Recorded ' + fmtDate(latest.recorded_at) : 'Not recorded yet'}</div>
          </div>
          <!-- 16px: an inline font-size beats the global input rule, and below 16px iOS Safari
               re-triggers auto-zoom-on-focus. Same reasoning as every other inline input here. -->
          <input class="field-input" id="orm-${i}" type="number" step="0.5" inputmode="decimal"
                 ${weightInputAttrs(latest ? latest.one_rm_kg : null, orig)} data-orig="${escapeHtml(orig)}" placeholder="—"
                 style="width:82px;text-align:center;font-size:var(--text-xl, 16px);flex-shrink:0">
          <span style="font-size:var(--text-sm, 11px);color:var(--text-muted);width:20px;flex-shrink:0">${escapeHtml(unit)}</span>
          ${latest ? `<button onclick="delete1RM('${latest.id}','${clientId}')" title="Delete" style="width:26px;height:26px;flex-shrink:0;border:1px solid var(--border);border-radius:6px;background:transparent;font-size:var(--text-lg, 14px);line-height:1;cursor:pointer;color:var(--text-muted)">×</button>` : `<span style="width:26px;flex-shrink:0"></span>`}
        </div>
        <div style="display:flex;align-items:center;gap:8px;padding:0 0 9px 0;margin-top:-4px;font-size:var(--text-sm, 11px);flex-wrap:wrap">
          <span style="color:var(--text-muted)">Dated</span>
          <input class="field-input" id="orm-date-${i}" type="date" value="${escapeHtml(today)}"
                 style="width:140px;padding:3px 6px;font-size:var(--text-xl, 16px)">
          <button type="button" onclick="_toggleOneRMEstimate(${i})"
                  style="padding:3px 9px;border:1px solid var(--border);border-radius:6px;background:transparent;font-size:var(--text-sm, 11px);font-weight:600;cursor:pointer;color:var(--text-muted)">Estimate from a set</button>
        </div>
        <div id="orm-est-${i}" style="display:none;align-items:center;gap:6px;padding:0 0 10px 0;margin-top:-4px;font-size:var(--text-sm, 11px);flex-wrap:wrap">
          <input class="field-input" id="orm-estw-${i}" type="number" step="0.5" inputmode="decimal" placeholder="${escapeHtml(unit)}"
                 oninput="_applyOneRMEstimate(${i})" style="width:74px;text-align:center;font-size:var(--text-xl, 16px);padding:3px 6px">
          <span style="color:var(--text-muted)">×</span>
          <input class="field-input" id="orm-estr-${i}" type="number" inputmode="numeric" placeholder="reps"
                 oninput="_applyOneRMEstimate(${i})" style="width:64px;text-align:center;font-size:var(--text-xl, 16px);padding:3px 6px">
          <span id="orm-estout-${i}" style="color:var(--text-muted);font-weight:600"></span>
        </div>
        ${history.length ? `
        <div style="display:flex;flex-wrap:wrap;gap:6px;padding:0 0 9px 0;margin-top:-2px">
          <span style="font-size:var(--text-xs, 10px);font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted)">Was</span>
          ${history.map(h => `<span style="font-size:var(--text-sm, 11px);color:var(--text-muted)">${fmtWeight(parseFloat(h.one_rm_kg), { spaced: true, decimals: 1 })} <span style="font-size:var(--text-xs, 10px)">${fmtDate(h.recorded_at)}</span></span>`).join('<span style="color:var(--border)">·</span>')}
        </div>` : ''}`
      }).join('')}
      <p class="modal-error" id="orm-grid-error" style="margin-top:12px"></p>
      <button class="btn-primary" style="width:100%;margin-top:6px" onclick="saveOneRMGrid('${clientId}')">Save all</button>
    </div>
  `
}

function showAdd1RMModal(clientId, prefillExercise = '', prefillExerciseId = null) {
  if (prefillExercise) {
    _showOneRMDetailModal(clientId, { id: prefillExerciseId || null, name: prefillExercise })
  } else {
    _effectiveCoachIdForClient(clientId).then(coachId => {
      // null means the client row was not readable. Opening the picker with it showed the CURRENT
      // USER's own exercise library under the old fallback — the wrong library to pick a client's 1RM
      // from, and indistinguishable from the right one on screen.
      if (!coachId) { showToast('Could not verify this client — please refresh and try again.', 'error'); return }
      _openExercisePicker(coachId, picked => _showOneRMDetailModal(clientId, picked))
    })
  }
}

// Weight/date/Epley entry screen — shown once an exercise has been picked (or was already
// known, e.g. the "+ Update" button on an existing 1RM row).
function _showOneRMDetailModal(clientId, picked, opts = {}) {
  const { existingId = null, weight = '', date = new Date().toISOString().split('T')[0] } = opts
  const existing = document.getElementById('modal-1rm')
  if (existing) existing.remove()
  window._oneRMDetailPicked = picked
  const overlay = document.createElement('div')
  overlay.id = 'modal-1rm'
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2 class="modal-title">${existingId ? 'Edit 1RM' : 'Add 1RM'}</h2>
        <button class="modal-close" onclick="document.getElementById('modal-1rm').remove()">✕</button>
      </div>
      <div class="field">
        <label class="field-label">Exercise</label>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius-sm, 8px);background:var(--surface-2)">
          <span style="font-size:var(--legacy-text-15, 15px);font-weight:700">${escapeHtml(picked.name)}</span>
          <button type="button" class="btn-secondary" style="font-size:var(--text-md, 12px);padding:5px 12px;flex-shrink:0" onclick="_reopenExercisePickerFor1RM('${clientId}'${existingId ? `,'${existingId}'` : ',null'})">Change</button>
        </div>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:14px">
        <button id="orm-mode-direct" onclick="_setAdd1RMMode('direct')" class="btn-primary" style="flex:1;font-size:var(--text-md, 12px);padding:8px">I know my 1RM</button>
        <button id="orm-mode-epley" onclick="_setAdd1RMMode('epley')" class="btn-secondary" style="flex:1;font-size:var(--text-md, 12px);padding:8px">Estimate from a set</button>
      </div>
      <div id="orm-direct-fields">
        <div class="field">
          <label class="field-label">1RM (${window._unitPrefs.weight})</label>
          <input class="field-input" id="1rm-weight" type="number" step="0.5" inputmode="decimal" placeholder="e.g. 120" value="${weight}">
        </div>
      </div>
      <div id="orm-epley-fields" style="display:none">
        <div class="field">
          <label class="field-label">Weight (${window._unitPrefs.weight})</label>
          <input class="field-input" id="orm-est-weight" type="number" step="0.5" inputmode="decimal" oninput="_updateAdd1RMEpleyPreview()">
        </div>
        <div class="field">
          <label class="field-label">Reps</label>
          <input class="field-input" id="orm-est-reps" type="number" inputmode="numeric" oninput="_updateAdd1RMEpleyPreview()">
        </div>
        <div id="orm-epley-result" style="display:none;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:var(--radius-sm, 8px);padding:10px;text-align:center;margin-bottom:14px">
          <div style="font-size:var(--text-sm, 11px);color:#15803d">Estimated 1RM (Epley)</div>
          <div id="orm-epley-value" style="font-size:var(--text-3xl, 20px);font-weight:800;color:#15803d"></div>
        </div>
      </div>
      <div class="field">
        <label class="field-label">Date recorded</label>
        <input class="field-input" id="1rm-date" type="date" value="${date}">
      </div>
      <p class="modal-error" id="1rm-error"></p>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="document.getElementById('modal-1rm').remove()">Cancel</button>
        <button class="btn-primary" onclick="save1RM('${clientId}'${existingId ? `,'${existingId}'` : ''})">Save</button>
      </div>
    </div>
  `
  mountModal(overlay)
}

// "Change" link on the 1RM detail screen — reopens the picker without losing weight/date entry.
function _reopenExercisePickerFor1RM(clientId, existingId) {
  const weight = document.getElementById('1rm-weight')?.value || ''
  const date = document.getElementById('1rm-date')?.value || new Date().toISOString().split('T')[0]
  document.getElementById('modal-1rm')?.remove()
  _effectiveCoachIdForClient(clientId).then(coachId => {
    // Same as showAdd1RMModal — null is "we could not establish whose library this is".
    if (!coachId) { showToast('Could not verify this client — please refresh and try again.', 'error'); return }
    _openExercisePicker(coachId, picked => _showOneRMDetailModal(clientId, picked, { existingId, weight, date }))
  })
}

function _setAdd1RMMode(mode) {
  document.getElementById('orm-direct-fields').style.display = mode === 'direct' ? 'block' : 'none'
  document.getElementById('orm-epley-fields').style.display = mode === 'epley' ? 'block' : 'none'
  document.getElementById('orm-mode-direct').className = mode === 'direct' ? 'btn-primary' : 'btn-secondary'
  document.getElementById('orm-mode-epley').className = mode === 'epley' ? 'btn-primary' : 'btn-secondary'
}

function _updateAdd1RMEpleyPreview() {
  const w = weightFromPref(document.getElementById('orm-est-weight')?.value)
  const r = parseInt(document.getElementById('orm-est-reps')?.value)
  const resultEl = document.getElementById('orm-epley-result')
  const valueEl = document.getElementById('orm-epley-value')
  const est = _estimate1RM(w, r)
  if (est) {
    valueEl.textContent = fmtWeight(est, { spaced: true, decimals: 1 })
    resultEl.style.display = 'block'
  } else if (w && r > _ESTIMATE_1RM_MAX_REPS) {
    valueEl.textContent = `too many reps (max ${_ESTIMATE_1RM_MAX_REPS})`
    resultEl.style.display = 'block'
  } else {
    resultEl.style.display = 'none'
  }
}

async function save1RM(clientId, existingId = null) {
  if (!(await _verifyClientAccess('save1RM', clientId))) { const e = document.getElementById('1rm-error'); if (e) e.textContent = 'Save failed — permission denied.'; return }
  const picked     = window._oneRMDetailPicked
  const epleyMode  = document.getElementById('orm-epley-fields') && document.getElementById('orm-epley-fields').style.display === 'block'
  let weight
  if (epleyMode) {
    const w = weightFromPref(document.getElementById('orm-est-weight')?.value)
    const r = parseInt(document.getElementById('orm-est-reps')?.value)
    weight = _estimate1RM(w, r)
  } else {
    weight = weightFromPref(document.getElementById('1rm-weight')?.value)
  }
  const date     = document.getElementById('1rm-date')?.value
  const errEl    = document.getElementById('1rm-error')
  if (!picked?.name) { errEl.textContent = 'Exercise name is required'; return }
  if (!weight || weight <= 0) { errEl.textContent = 'Enter a valid weight'; return }
  const row = { client_id: clientId, exercise_id: picked.id || null, exercise_name: picked.name, one_rm_kg: weight, recorded_at: date }
  let error
  if (existingId) {
    // .eq('client_id', clientId) as well as the row id: the guard above verifies clientId, so the
    // write MUST be keyed on the same fact it verified. Without it the guard is decorative here —
    // pass your own clientId, target someone else's row id. Found by pre-push review 2026-08-22.
    ;({ error } = await dbq('save1RM:update', db.from('client_1rms').update(row).eq('id', existingId).eq('client_id', clientId)))
  } else {
    ;({ error } = await dbq('save1RM:insert', db.from('client_1rms').insert(row)))
  }
  if (error) { errEl.textContent = 'Save failed — try again'; return }
  document.getElementById('modal-1rm').remove()
  _refresh1RMs(clientId)
}

async function delete1RM(id, clientId) {
  if (!confirm('Delete this 1RM?')) return
  if (!(await _verifyClientAccess('delete1RM', clientId))) return
  // Rowcount check, matching its two siblings deletePerfLog and deleteWeightLog. Without it a refused
  // delete simply re-rendered with the row still sitting there, which reads as "the button is broken".
  // .eq('client_id', clientId) as well as the row id: the guard above verifies clientId, so the
  // write MUST be keyed on the same fact it verified. Without it the guard is decorative here —
  // pass your own clientId, target someone else's row id. Found by pre-push review 2026-08-22.
  const { data: removed, error } = await dbq('delete1RM', db.from('client_1rms').delete().eq('id', id).eq('client_id', clientId).select('id'))
  if (error) return
  if (!removed?.length) {
    log.error('delete1RM', 'delete removed no rows — permission denied or already gone', { id })
    showToast('That 1RM could not be deleted', 'error')
    return
  }
  _refresh1RMs(clientId)
}

// ONE definition of "best" for a performance_logs record, shared by renderClientPerformance and
// renderProgressPBs. Both queries order by `date desc`, and both previously took the FIRST row —
// i.e. the most recently logged entry — and rendered it beside a gold "PB" badge. So a lighter/slower
// entry logged more recently displayed as the personal best. "Best" is category-dependent: for TIME
// units (min/sec — cardio splits, benchmark clock times) a LOWER value is better; for everything else
// (kg/lbs, cm/in, km/mi, reps) a HIGHER value is better. The unit is a reliable signal because
// PERF_CATEGORIES (app-runner.js) never mixes a time unit with a non-time one within one category.
const _PERF_TIME_UNITS = new Set(['min', 'sec'])

// PERF_CATEGORIES (app-runner.js) lets the SAME exercise name be logged in either unit of a pair
// (kg/lbs, cm/in, min/sec, km/mi) — the unit is a free per-entry dropdown choice, not fixed per
// exercise. _bestPerfLog compares raw `value`s, so two records must be converted to a common base
// unit before comparing or a heavier/faster entry in the "other" unit loses purely on number size
// (100kg vs 200lbs — 200 > 100 but 200lbs is the lighter lift). Multi-agent review, 2026-07-24.
const _PERF_UNIT_BASE = {
  kg: v => v, lbs: v => v * 0.45359237,
  cm: v => v, in: v => v * 2.54,
  sec: v => v, min: v => v * 60,
  km: v => v, mi: v => v * 1.609344,
  reps: v => v,
}
function _perfBaseValue(unit, value) {
  const fn = _PERF_UNIT_BASE[unit]
  return fn ? fn(value) : value
}
function _bestPerfLog(records) {
  if (!records || !records.length) return null
  const lowerIsBetter = _PERF_TIME_UNITS.has(records[0].unit)
  return records.reduce((best, r) => {
    const rv = _perfBaseValue(r.unit, parseFloat(r.value))
    const bv = _perfBaseValue(best.unit, parseFloat(best.value))
    if (!(rv > 0)) return best
    if (!(bv > 0)) return r
    return (lowerIsBetter ? rv < bv : rv > bv) ? r : best
  }, records[0])
}

async function renderClientPerformance(clientId, el) {
  log.info('renderClientPerformance', 'fetching performance logs', { clientId })
  el.innerHTML = '<div style="padding:24px;color:var(--text-muted);text-align:center">Loading…</div>'

  const { data: logs, error } = await db
    .from('performance_logs')
    .select('*')
    .eq('client_id', clientId)
    .order('date', { ascending: false })

  if (error) { log.error('renderClientPerformance', 'fetch failed', error); el.innerHTML = `<div class="empty-state"><div class="empty-title">Error loading performance data</div></div>`; return }
  log.ok('renderClientPerformance', `loaded ${logs.length} records`)

  // Group by category
  const byCategory = {}
  PERF_CATEGORIES.forEach(c => { byCategory[c.id] = logs.filter(l => l.category === c.id) })

  el.innerHTML = `
    <div style="padding:20px 0">

      <!-- Log entry form -->
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md, 12px);padding:18px;margin-bottom:24px">
        <div style="font-size:var(--text-base, 13px);font-weight:700;color:var(--text);margin-bottom:14px">Log a PB / performance record</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
          <div>
            <label style="font-size:var(--text-sm, 11px);color:var(--text-muted);font-weight:600;display:block;margin-bottom:4px">Category</label>
            <select id="pl-category" class="field-input" onchange="updatePerfUnits()">
              ${PERF_CATEGORIES.map(c => `<option value="${c.id}">${c.label}</option>`).join('')}
            </select>
          </div>
          <div>
            <label style="font-size:var(--text-sm, 11px);color:var(--text-muted);font-weight:600;display:block;margin-bottom:4px">Date</label>
            <input id="pl-date" type="date" class="field-input" value="${new Date().toISOString().split('T')[0]}">
          </div>
        </div>
        <div style="margin-bottom:10px">
          <label style="font-size:var(--text-sm, 11px);color:var(--text-muted);font-weight:600;display:block;margin-bottom:4px">Name</label>
          <input id="pl-name" type="text" class="field-input" placeholder="${PERF_CATEGORIES[0].placeholder}">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
          <div>
            <label style="font-size:var(--text-sm, 11px);color:var(--text-muted);font-weight:600;display:block;margin-bottom:4px">Value</label>
            <input id="pl-value" type="number" step="0.01" class="field-input" placeholder="e.g. 120">
          </div>
          <div>
            <label style="font-size:var(--text-sm, 11px);color:var(--text-muted);font-weight:600;display:block;margin-bottom:4px">Unit</label>
            <select id="pl-unit" class="field-input">
              ${PERF_CATEGORIES[0].units.map(u => `<option value="${u}"${u === _preferredPerfUnit(PERF_CATEGORIES[0].units) ? ' selected' : ''}>${u}</option>`).join('')}
            </select>
          </div>
        </div>
        <div style="margin-bottom:12px">
          <label style="font-size:var(--text-sm, 11px);color:var(--text-muted);font-weight:600;display:block;margin-bottom:4px">Notes <span style="font-weight:400">(optional)</span></label>
          <input id="pl-notes" type="text" class="field-input" placeholder="e.g. Competition day, fresh, with belt">
        </div>
        <p id="perf-error" style="color:var(--danger, #ef4444);font-size:var(--text-md, 12px);margin:4px 0 0"></p>
        <button onclick="savePerformanceLog('${clientId}')" class="btn-primary" style="width:100%">Save record</button>
      </div>

      <!-- Records by category -->
      ${PERF_CATEGORIES.map(cat => {
        const catLogs = byCategory[cat.id]
        if (catLogs.length === 0) return ''
        const colour = PERF_COLOURS[cat.id]

        // Group by exercise name, sorted newest first within each
        const byName = {}
        catLogs.forEach(l => {
          if (!byName[l.name]) byName[l.name] = []
          byName[l.name].push(l)
        })

        return `
        <div style="margin-bottom:24px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
            <span style="width:10px;height:10px;border-radius:50%;background:${colour};display:inline-block"></span>
            <span style="font-size:var(--text-base, 13px);font-weight:700;color:var(--text)">${cat.label}</span>
            <span style="font-size:var(--text-sm, 11px);color:var(--text-muted)">${catLogs.length} record${catLogs.length !== 1 ? 's' : ''}</span>
          </div>

          ${Object.entries(byName).map(([name, records]) => {
            const best = _bestPerfLog(records)
            const slug = name.replace(/[^a-z0-9]/gi,'_') + '_' + cat.id
            const chartData = [...records].reverse() // oldest→newest for chart
            return `
            <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md, 12px);margin-bottom:10px;overflow:hidden">

              <!-- Summary row — click to expand -->
              <div onclick="togglePerfHistory('${slug}')"
                style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;cursor:pointer">
                <div style="display:flex;align-items:center;gap:10px">
                  <div>
                    <div style="font-size:var(--text-base, 13px);font-weight:600">${escapeHtml(name)}</div>
                    <div style="font-size:var(--legacy-text-11-5, 11.5px);color:var(--text-muted);margin-top:1px">${records.length} entr${records.length !== 1 ? 'ies' : 'y'}</div>
                  </div>
                </div>
                <div style="display:flex;align-items:center;gap:10px">
                  <span style="font-size:15px;font-weight:700;color:${colour}">${escapeHtml(String(best.value))} ${escapeHtml(best.unit || '')}</span>
                  <span style="font-size:var(--text-xs, 10px);font-weight:700;background:gold;color:#78350f;padding:2px 7px;border-radius:var(--radius-xs, 4px)">PB</span>
                  <span id="perf-chevron-${slug}" style="color:var(--text-muted);font-size:var(--text-md, 12px);transition:transform 0.2s">▼</span>
                </div>
              </div>

              <!-- Expandable history + chart -->
              <div id="perf-history-${slug}" style="display:none;border-top:1px solid var(--border)">

                <!-- Chart -->
                ${records.length > 1 ? `
                <div style="padding:16px;border-bottom:1px solid var(--border)">
                  <canvas id="perf-chart-${slug}" height="80"></canvas>
                </div>` : ''}

                <!-- History table -->
                <table style="width:100%;border-collapse:collapse">
                  <thead>
                    <tr style="background:var(--surface-2)">
                      <th style="padding:8px 14px;text-align:left;font-size:var(--text-sm, 11px);color:var(--text-muted);font-weight:600">Date</th>
                      <th style="padding:8px 14px;text-align:right;font-size:var(--text-sm, 11px);color:var(--text-muted);font-weight:600">Value</th>
                      <th style="padding:8px 14px;text-align:left;font-size:var(--text-sm, 11px);color:var(--text-muted);font-weight:600">Notes</th>
                      <th style="padding:8px 14px;width:36px"></th>
                    </tr>
                  </thead>
                  <tbody>
                    ${records.map((r, i) => {
                      // Badge the row that IS the best, not the row that happens to be newest —
                      // same fix as `best` above, same reason (les-048 class: same bug, three sites).
                      const isBest = r.id === best.id
                      return `
                    <tr style="border-top:${i > 0 ? '1px solid var(--border)' : 'none'}">
                      <td style="padding:9px 14px;font-size:var(--legacy-text-12-5, 12.5px);color:var(--text-muted)">${r.date}</td>
                      <td style="padding:9px 14px;text-align:right;font-size:13px;font-weight:${isBest ? '700' : '500'};color:${isBest ? colour : 'var(--text)'}">
                        ${escapeHtml(String(r.value))} ${escapeHtml(r.unit || '')}
                        ${isBest ? `<span style="font-size:var(--text-2xs, 9px);font-weight:700;background:gold;color:#78350f;padding:1px 5px;border-radius:var(--legacy-radius-3, 3px);margin-left:4px">PB</span>` : ''}
                      </td>
                      <td style="padding:9px 14px;font-size:var(--text-md, 12px);color:var(--text-muted)">${escapeHtml(r.notes || '—')}</td>
                      <td style="padding:9px 14px;text-align:right">
                        <button onclick="deletePerfLog('${r.id}','${clientId}')"
                          style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:var(--text-lg, 14px);padding:2px 5px">×</button>
                      </td>
                    </tr>`
                    }).join('')}
                  </tbody>
                </table>

              </div>
            </div>

            `
          }).join('')}
        </div>`
      }).join('')}

      ${logs.length === 0 ? `
        <div class="empty-state">
          <div class="empty-icon">🏆</div>
          <div class="empty-title">No performance records yet</div>
          <div class="empty-text">Log the first PB above to start tracking</div>
        </div>` : ''}
    </div>
  `

  // Store chart data after HTML is rendered (script tags in innerHTML don't execute)
  // _destroyManagedCharts FIRST. This function re-runs on every savePerformanceLog and every
  // deletePerfLog, and the old code reset `window.__perfCharts = {}` WITHOUT destroying the instances
  // it was dropping — orphaning every expanded chart, with its listeners and animation loop, on each
  // save. Same class as the pw-chart leak fixed on 2026-08-12; this sibling was missed then.
  _destroyManagedCharts()
  window.__perfChartData = {}
  PERF_CATEGORIES.forEach(cat => {
    const catLogs = byCategory[cat.id]
    const colour  = PERF_COLOURS[cat.id]
    const byName  = {}
    catLogs.forEach(l => {
      if (!byName[l.name]) byName[l.name] = []
      byName[l.name].push(l)
    })
    Object.entries(byName).forEach(([name, records]) => {
      const slug      = name.replace(/[^a-z0-9]/gi,'_') + '_' + cat.id
      const chartData = [...records].reverse()
      window.__perfChartData[slug] = {
        labels: chartData.map(r => r.date),
        values: chartData.map(r => r.value),
        colour
      }
    })
  })
}

function togglePerfHistory(slug) {
  const panel   = document.getElementById(`perf-history-${slug}`)
  const chevron = document.getElementById(`perf-chevron-${slug}`)
  if (!panel) return
  const isOpen = panel.style.display !== 'none'
  panel.style.display = isOpen ? 'none' : 'block'
  if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)'

  // Draw chart on first open
  if (!isOpen) {
    const d = window.__perfChartData?.[slug]
    const canvas = document.getElementById(`perf-chart-${slug}`)
    if (!d || !canvas || d.values.length < 2) return
    // The helper destroys any existing chart on this canvas and tracks the new one, so the per-slug
    // `window.__perfCharts` registry is gone — one teardown path instead of three.
    _renderMetricChart(`perf-chart-${slug}`, {
      labels: d.labels,
      series: [{ data: d.values, colour: d.colour, fill: true }],
      legend: false,
    })
  }
}

// This form lets a coach log a PB in whatever free-text unit they type (unlike the canonical-storage
// metric types elsewhere) — so there's nothing to convert here, only a sensible default to pick. Tries
// jump height pref first since body_metric's example (Vertical/Broad Jump) is the one category where
// cm/in and kg/lbs both appear, then cardio distance, then weight; falls back to the category's own
// first unit (old behaviour) if nothing in its list matches any preference.
function _preferredPerfUnit(units) {
  const w = window._unitPrefs.weight === 'lb' ? 'lbs' : 'kg'
  return units.find(u => u === window._unitPrefs.jumpHeight) || units.find(u => u === window._unitPrefs.cardioDistance) || units.find(u => u === w) || units[0]
}

function updatePerfUnits() {
  const cat = document.getElementById('pl-category')?.value
  const unitSel = document.getElementById('pl-unit')
  const nameSel = document.getElementById('pl-name')
  const catDef = PERF_CATEGORIES.find(c => c.id === cat)
  if (!catDef || !unitSel) return
  const preferred = _preferredPerfUnit(catDef.units)
  unitSel.innerHTML = catDef.units.map(u => `<option value="${u}"${u === preferred ? ' selected' : ''}>${u}</option>`).join('')
  if (nameSel) nameSel.placeholder = catDef.placeholder
}

async function savePerformanceLog(clientId) {
  if (!(await _verifyClientAccess('savePerformanceLog', clientId))) return
  const category = document.getElementById('pl-category')?.value
  const date     = document.getElementById('pl-date')?.value
  const name     = document.getElementById('pl-name')?.value?.trim()
  const value    = document.getElementById('pl-value')?.value
  const unit     = document.getElementById('pl-unit')?.value
  const notes    = document.getElementById('pl-notes')?.value?.trim()

  if (!category || !date || !name || !value || !unit) { showToast('Please fill in all required fields.', 'warn', 3000); return }

  log.info('savePerformanceLog', 'inserting performance record', { clientId, category })
  const { data: { user } } = await db.auth.getUser()

  const { error } = await db.from('performance_logs').insert({
    client_id: clientId,
    logged_by: user.id,
    date,
    category,
    name,
    value: parseFloat(value),
    unit,
    notes: notes || null
  })

  if (error) { log.error('savePerformanceLog', 'insert failed', error); document.getElementById('perf-error') && (document.getElementById('perf-error').textContent = error.message); return }
  log.ok('savePerformanceLog', 'record saved', { clientId, category })
  renderClientPerformance(clientId, document.getElementById('tab-content'))
}

async function deletePerfLog(id, clientId) {
  if (!confirm('Delete this record?')) return
  if (!(await _verifyClientAccess('deletePerfLog', clientId))) return
  log.info('deletePerfLog', 'deleting performance record', { id })
  // .select() + rowcount, not just an error check: a policy-blocked delete returns
  // { data: [], error: null }, so an error-only guard treats "refused" as "succeeded", re-renders,
  // and the row is still sitting there with no explanation. Same shape as deleteTemplate's guard.
  // Anchored on client_id too — the guard above verified clientId, so the write must be keyed on
  // that same fact. Pre-push review 2026-08-22.
  const { data: deleted, error } = await db.from('performance_logs').delete().eq('id', id).eq('client_id', clientId).select()
  if (error) {
    log.error('deletePerfLog', 'delete failed', error)
    showToast('Could not delete that record — try again', 'error')
    return
  }
  if (!deleted?.length) {
    log.error('deletePerfLog', 'delete removed no rows — permission denied or already gone', { id })
    showToast('That record could not be deleted', 'error')
    return
  }
  log.ok('deletePerfLog', 'record deleted', { id })
  renderClientPerformance(clientId, document.getElementById('tab-content'))
}

// ─── WEIGHT TRACKING ──────────────────────────────────────────────────────────

async function renderClientWeight(clientId, el) {
  log.info('renderClientWeight', 'fetching weight logs', { clientId })
  el.innerHTML = '<div style="padding:24px;color:var(--text-muted);text-align:center">Loading…</div>'

  const [{ data: logs, error }, { data: clientRow }] = await Promise.all([
    db.from('weight_logs').select('*').eq('client_id', clientId).order('date', { ascending: false }),
    db.from('clients').select('starting_weight_kg, goal_weight_kg').eq('id', clientId).single()
  ])

  if (error) { log.error('renderClientWeight', 'fetch failed', error); el.innerHTML = `<div class="empty-state"><div class="empty-title">Error loading weight data</div></div>`; return }
  log.ok('renderClientWeight', `loaded ${logs.length} entries`)

  const startingWeightKg = clientRow?.starting_weight_kg != null ? parseFloat(clientRow.starting_weight_kg) : null
  const goalWeightKg     = clientRow?.goal_weight_kg != null ? parseFloat(clientRow.goal_weight_kg) : null

  const fmt = kg => fmtWeight(kg, { spaced: true, decimals: 1 })
  const latest = logs[0]
  const oldest = logs[logs.length - 1]
  const change = logs.length >= 2 ? (parseFloat(latest.weight_kg) - parseFloat(oldest.weight_kg)).toFixed(1) : null
  // Destroy BEFORE the innerHTML replace below. Closes
  // bugs/2026-08-17-renderclientweight-leaks-a-chart-on-every-save: this function replaces the whole
  // subtree, detaching #weight-chart, then calls _renderMetricChart at the bottom. Both of that
  // helper's own guards miss on a rebuild — Chart.getChart(el) resolves the NEW canvas (undefined)
  // and the _activeCharts filter compares against the new element — so the old entry survives, a
  // live Chart bound to a detached canvas with its listeners and animation loop still running.
  // saveWeightLog re-enters this function on every save, so it grew by one per save.
  //
  // Its twin renderProgressWeight has always destroyed, as does every other chart entry point; this
  // one was missed. Fixed here rather than later because the solo dashboard added a THIRD chart
  // entry point in the same change, and shipping that beside a known-broken second is
  // fix-the-instance-not-the-class.
  _destroyManagedCharts()

  const changeColour = change === null ? 'var(--text-muted)' : change > 0 ? '#ef4444' : change < 0 ? '#22c55e' : 'var(--text-muted)'

  el.innerHTML = `
    <div style="padding:20px 0">

      <!-- Log entry form -->
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md, 12px);padding:18px;margin-bottom:20px">
        <div style="font-size:var(--text-base, 13px);font-weight:700;color:var(--text);margin-bottom:14px">Log weight</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:10px">
          <div>
            <label style="font-size:var(--text-sm, 11px);color:var(--text-muted);font-weight:600;display:block;margin-bottom:4px">Date</label>
            <input id="wl-date" type="date" class="field-input" value="${new Date().toISOString().split('T')[0]}">
          </div>
          <div>
            <label style="font-size:var(--text-sm, 11px);color:var(--text-muted);font-weight:600;display:block;margin-bottom:4px">Weight (${window._unitPrefs.weight})</label>
            <input id="wl-weight" type="number" step="0.1" class="field-input" placeholder="e.g. 82.5">
          </div>
          <div>
            <label style="font-size:var(--text-sm, 11px);color:var(--text-muted);font-weight:600;display:block;margin-bottom:4px">Body fat % <span style="font-weight:400">(optional)</span></label>
            <input id="wl-bf" type="number" step="0.1" class="field-input" placeholder="e.g. 18.5">
          </div>
        </div>
        <div style="margin-bottom:12px">
          <label style="font-size:var(--text-sm, 11px);color:var(--text-muted);font-weight:600;display:block;margin-bottom:4px">Notes <span style="font-weight:400">(optional)</span></label>
          <input id="wl-notes" type="text" class="field-input" placeholder="e.g. morning, fasted">
        </div>
        <p id="wl-error" style="color:var(--danger, #ef4444);font-size:var(--text-md, 12px);margin:4px 0 0"></p>
        <button onclick="saveWeightLog('${clientId}')" class="btn-primary" style="width:100%">Save entry</button>
      </div>

      <!-- Weight goals — sets the chart's Y-axis range below -->
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md, 12px);padding:18px;margin-bottom:20px">
        <div style="font-size:var(--text-base, 13px);font-weight:700;color:var(--text);margin-bottom:4px">Weight goals</div>
        <div style="font-size:var(--legacy-text-11-5, 11.5px);color:var(--text-muted);margin-bottom:14px">Used to set the chart's range below</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
          <div>
            <label style="font-size:var(--text-sm, 11px);color:var(--text-muted);font-weight:600;display:block;margin-bottom:4px">Starting weight (${window._unitPrefs.weight})</label>
            <input id="wg-starting" type="number" step="0.1" class="field-input" placeholder="e.g. 90" ${weightInputAttrs(startingWeightKg)}>
          </div>
          <div>
            <label style="font-size:var(--text-sm, 11px);color:var(--text-muted);font-weight:600;display:block;margin-bottom:4px">Goal weight (${window._unitPrefs.weight})</label>
            <input id="wg-goal" type="number" step="0.1" class="field-input" placeholder="e.g. 82" ${weightInputAttrs(goalWeightKg)}>
          </div>
        </div>
        <p id="wg-error" style="color:var(--danger, #ef4444);font-size:var(--text-md, 12px);margin:4px 0 0"></p>
        <button onclick="saveWeightGoals('${clientId}')" class="btn-secondary" style="width:100%">Save goals</button>
      </div>

      <!-- Stats row -->
      ${logs.length > 0 ? `
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px">
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius, 10px);padding:14px;text-align:center">
          <div style="font-size:var(--text-sm, 11px);color:var(--text-muted);font-weight:600;margin-bottom:4px">CURRENT</div>
          <div style="font-size:var(--text-3xl, 20px);font-weight:700;color:var(--text)">${fmt(latest.weight_kg)}</div>
          <div style="font-size:var(--text-sm, 11px);color:var(--text-muted)">${latest.date}</div>
        </div>
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius, 10px);padding:14px;text-align:center">
          <div style="font-size:var(--text-sm, 11px);color:var(--text-muted);font-weight:600;margin-bottom:4px">CHANGE</div>
          <div style="font-size:20px;font-weight:700;color:${changeColour}">${change !== null ? (change > 0 ? '+' : '') + fmtWeight(change, { spaced: true, decimals: 1 }) : '—'}</div>
          <div style="font-size:var(--text-sm, 11px);color:var(--text-muted)">${logs.length >= 2 ? oldest.date + ' → now' : 'Need 2+ entries'}</div>
        </div>
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius, 10px);padding:14px;text-align:center">
          <div style="font-size:var(--text-sm, 11px);color:var(--text-muted);font-weight:600;margin-bottom:4px">ENTRIES</div>
          <div style="font-size:var(--text-3xl, 20px);font-weight:700;color:var(--text)">${logs.length}</div>
          <div style="font-size:var(--text-sm, 11px);color:var(--text-muted)">logged</div>
        </div>
      </div>

      <!-- Chart -->
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md, 12px);padding:18px;margin-bottom:20px">
        <div style="display:flex;gap:6px;margin-bottom:14px">
          ${['1M','3M','6M','All'].map(r => `<button onclick="weightChartRange('${r}')" id="wcr-${r}" style="padding:4px 12px;border-radius:20px;border:1px solid var(--border);background:${r==='3M'?'var(--accent)':'transparent'};color:${r==='3M'?'#fff':'var(--text-muted)'};font-size:12px;font-weight:600;cursor:pointer">${r}</button>`).join('')}
        </div>
        <canvas id="weight-chart" height="120"></canvas>
      </div>` : ''}

      <!-- Log table -->
      ${logs.length === 0 ? `
        <div class="empty-state">
          <div class="empty-icon">⚖️</div>
          <div class="empty-title">No weight entries yet</div>
          <div class="empty-text">Log the first entry above to start tracking</div>
        </div>` : `
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md, 12px);overflow:hidden">
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:var(--surface-2)">
              <th style="padding:10px 14px;text-align:left;font-size:var(--text-sm, 11px);font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em">Date</th>
              <th style="padding:10px 14px;text-align:right;font-size:var(--text-sm, 11px);font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em">Weight</th>
              <th style="padding:10px 14px;text-align:right;font-size:var(--text-sm, 11px);font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em">Body fat</th>
              <th style="padding:10px 14px;text-align:left;font-size:var(--text-sm, 11px);font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em">Notes</th>
              <th style="padding:10px 14px;width:40px"></th>
            </tr>
          </thead>
          <tbody>
            ${logs.map((l, i) => `
            <tr style="border-top:1px solid var(--border)${i === 0 ? ';background:rgba(99,102,241,0.03)' : ''}">
              <td style="padding:10px 14px;font-size:13px;color:var(--text);font-weight:${i === 0 ? '600' : '400'}">${l.date}</td>
              <td style="padding:10px 14px;font-size:13px;color:var(--text);font-weight:${i === 0 ? '700' : '500'};text-align:right">${fmt(l.weight_kg)}</td>
              <td style="padding:10px 14px;font-size:var(--text-base, 13px);color:var(--text-muted);text-align:right">${l.body_fat_pct != null ? l.body_fat_pct + '%' : '—'}</td>
              <td style="padding:10px 14px;font-size:var(--text-base, 13px);color:var(--text-muted)">${escapeHtml(l.notes || '—')}</td>
              <td style="padding:10px 14px;text-align:right">
                <button onclick="deleteWeightLog('${l.id}','${clientId}')" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:var(--legacy-text-15, 15px);padding:2px 6px;border-radius:var(--radius-xs, 4px)" title="Delete">×</button>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`}
    </div>
  `

  if (logs.length >= 2) {
    const chronological = [...logs].reverse()

    const fmtLabel = dateStr => {
      const d = new Date(dateStr + 'T00:00:00')
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    }

    window._weightAllLogs = chronological

    const buildChart = (range) => {
      const now = new Date()
      const cutoff = range === 'All' ? null : new Date(now.getFullYear(), now.getMonth() - parseInt(range), now.getDate())
      const filtered = cutoff ? chronological.filter(l => new Date(l.date + 'T00:00:00') >= cutoff) : chronological
      if (filtered.length < 2) return

      // Converted to the display unit BEFORE the rolling average / anchors math — averaging is
      // linear, so avg-of-converted equals converted-avg, and keeps the whole chart in one unit.
      const weights = filtered.map(l => weightToPref(parseFloat(l.weight_kg)))
      const hasBf = filtered.some(l => l.body_fat_pct != null)
      const avg = _rollingAvg(weights)

      // This chart WAS the reference for the house style; it now goes through the shared helper like
      // every other one, so "one style everywhere" is structural rather than a convention that drifts.
      // Colours come from _METRIC_COLORS rather than hardcoded hexes — the helper reads the rest of its
      // palette from CSS variables so the chart works on both themes.
      const series = [
        { label: `Weight (${window._unitPrefs.weight})`, data: weights, colour: _METRIC_COLORS.topWeight, fill: true },
        { label: '7-day avg', data: avg, colour: _METRIC_COLORS.topWeight, dashed: true, pointRadius: 0 },
      ]
      if (hasBf) series.push({
        label: 'Body fat %',
        data: filtered.map(l => l.body_fat_pct != null ? parseFloat(l.body_fat_pct) : null),
        colour: _METRIC_COLORS.intensity, axis: 'y2', spanGaps: true,
      })

      // Y-axis range blends whichever of goal/starting weight are set with the actual logged data —
      // previously this only activated when BOTH fields were set, so entering just one (the common
      // case) silently had zero visible effect. Math.min/max (not "goal is always below starting") so
      // a weight-gain goal doesn't invert the axis.
      const dispGoal = goalWeightKg != null ? weightToPref(goalWeightKg) : null
      const dispStarting = startingWeightKg != null ? weightToPref(startingWeightKg) : null
      const anchors = [dispGoal, dispStarting, ...weights].filter(v => v != null)
      const yRange = (dispGoal != null || dispStarting != null)
        ? { min: Math.floor(Math.min(...anchors) * 2) / 2, max: Math.ceil((Math.max(...anchors) + 1) * 2) / 2 }
        : {}

      _renderMetricChart('weight-chart', {
        labels: filtered.map(l => fmtLabel(l.date)),
        series,
        yRange,
        legend: true,
        stepSize: window._unitPrefs.weight === 'lb' ? 1 : 0.5,
        // `_tickNum` rounds before the unit is appended. The old callback printed the raw value, which
        // is what produced "20.800000000000004%" on the body-fat axis in Jake's screenshot.
        yFormat: v => `${_tickNum(v)} ${window._unitPrefs.weight}`,
      })
    }

    window.weightChartRange = (range) => {
      document.querySelectorAll('[id^="wcr-"]').forEach(b => {
        const active = b.id === `wcr-${range}`
        b.style.background = active ? 'var(--accent)' : 'transparent'
        b.style.color = active ? '#fff' : 'var(--text-muted)'
      })
      buildChart(range)
    }

    buildChart('3M')
  }
}

async function sendClientInvite(clientId, email) {
  if (!confirm(`Send invite email to ${email}?`)) return

  log.info('sendClientInvite', 'sending invite', { clientId })
  const btn = event.target
  btn.disabled = true
  btn.textContent = 'Sending…'

  const { data: { session } } = await db.auth.getSession()

  const res = await fetch(`https://avilxuiacmtgeoxxhfhc.supabase.co/functions/v1/invite-client`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`
    },
    body: JSON.stringify({ email, clientId })
  })

  const json = await res.json()

  if (!res.ok) {
    log.error('sendClientInvite', 'edge function returned error', { status: res.status, error: json.error })
    btn.disabled = false
    btn.textContent = '✗ ' + (json.error || 'Failed to send')
    btn.style.color = 'var(--danger)'
    setTimeout(() => { btn.textContent = '✉ Send invite'; btn.style.color = '' }, 3000)
    return
  }

  log.ok('sendClientInvite', 'invite sent via edge function', { userId: json.userId })
  // Direct coach_id anchor rather than _verifyClientAccess: this is a coach-only path that runs
  // AFTER the invite Edge Function has already authorised the action, so the check is belt-and-
  // braces on a cosmetic stamp. One clause costs nothing; leaving the only unanchored write in
  // the family behind would just invite the next reader to copy it.
  const { error: stampErr } = await db.from('clients').update({ invited_at: new Date().toISOString() }).eq('id', clientId).eq('coach_id', currentUser.id)
  if (stampErr) log.error('sendClientInvite', 'failed to stamp invited_at', stampErr)

  btn.textContent = '✓ Invite sent'
  btn.style.color = 'var(--success, #16a34a)'
  setTimeout(() => openClient(clientId), 1200)
}

async function saveWeightLog(clientId) {
  if (!(await _verifyClientAccess('saveWeightLog', clientId))) { const e = document.getElementById('wl-error'); if (e) e.textContent = 'Save failed — permission denied.'; return }
  const date   = document.getElementById('wl-date')?.value
  const weight = document.getElementById('wl-weight')?.value
  const bf     = document.getElementById('wl-bf')?.value
  const notes  = document.getElementById('wl-notes')?.value?.trim()

  if (!date || !weight) {
    const errEl = document.getElementById('wl-error')
    if (errEl) errEl.textContent = 'Date and weight are required.'
    return
  }

  log.info('saveWeightLog', 'inserting weight entry', { clientId, date })
  const { error } = await db.from('weight_logs').insert({
    client_id:    clientId,
    date,
    weight_kg:    weightFromPref(weight),
    body_fat_pct: bf ? parseFloat(bf) : null,
    notes:        notes || null
  })

  if (error) { log.error('saveWeightLog', 'insert failed', error); document.getElementById('wl-error') && (document.getElementById('wl-error').textContent = error.message); return }
  log.ok('saveWeightLog', 'weight entry saved', { clientId, date })
  showToast('Weight logged ✓', 'success', 2000)
  renderClientWeight(clientId, document.getElementById('tab-content'))
}

async function saveWeightGoals(clientId) {
  if (!(await _verifyClientAccess('saveWeightGoals', clientId))) { const e = document.getElementById('wg-error'); if (e) e.textContent = 'Save failed — permission denied.'; return }
  const startingRaw = document.getElementById('wg-starting')?.value
  const goalRaw      = document.getElementById('wg-goal')?.value
  const errEl = document.getElementById('wg-error')

  log.info('saveWeightGoals', 'updating weight goals', { clientId })
  const { error } = await db.from('clients').update({
    starting_weight_kg: weightFromInput(document.getElementById('wg-starting')),
    goal_weight_kg:      weightFromInput(document.getElementById('wg-goal'))
  }).eq('id', clientId)

  if (error) { log.error('saveWeightGoals', 'update failed', error); if (errEl) errEl.textContent = error.message; return }
  log.ok('saveWeightGoals', 'weight goals saved', { clientId })
  showToast('Weight goals saved ✓', 'success', 2000)
  // Refresh whichever view is actually showing this form — the client/solo "My Progress" page
  // (progress-tab-content) or the PT's client-profile Weight tab (tab-content).
  const progressEl = document.getElementById('progress-tab-content')
  if (progressEl) renderProgressWeight(progressEl)
  else renderClientWeight(clientId, document.getElementById('tab-content'))
}

async function deleteWeightLog(id, clientId) {
  if (!confirm('Delete this entry?')) return
  if (!(await _verifyClientAccess('deleteWeightLog', clientId))) return
  log.info('deleteWeightLog', 'deleting weight entry', { id })
  // Anchored on client_id too — the guard above verified clientId, so the write must be keyed on
  // that same fact. Pre-push review 2026-08-22.
  const { data: deleted, error } = await db.from('weight_logs').delete().eq('id', id).eq('client_id', clientId).select()
  if (error) {
    log.error('deleteWeightLog', 'delete failed', error)
    showToast('Could not delete that entry — try again', 'error')
    return
  }
  if (!deleted?.length) {
    log.error('deleteWeightLog', 'delete removed no rows — permission denied or already gone', { id })
    showToast('That entry could not be deleted', 'error')
    return
  }
  log.ok('deleteWeightLog', 'entry deleted', { id })
  renderClientWeight(clientId, document.getElementById('tab-content'))
}

// ─── INVITE ACCEPTANCE ────────────────────────────────────────────────────────

// One switcher for every auth-screen form. Previously showInviteForm hid #login-form by name and
// showed its own — fine with two forms, but with four that shape means each new form has to remember
// to hide the other three, and the one that forgets shows two stacked forms.
const _AUTH_FORMS = ['login-form', 'invite-form', 'reset-request-form', 'new-password-form']
function _showAuthForm(id) {
  document.getElementById('auth-screen').style.display = 'flex'
  document.getElementById('app-shell').style.display   = 'none'
  _AUTH_FORMS.forEach(f => {
    const el = document.getElementById(f)
    if (el) el.style.display = f === id ? 'block' : 'none'
  })
}

function showInviteForm()       { _showAuthForm('invite-form') }
function showResetRequestForm() { _showAuthForm('reset-request-form') }
function showNewPasswordForm()  { _showAuthForm('new-password-form') }
function showLoginForm()        { _showAuthForm('login-form') }

document.getElementById('invite-form').addEventListener('submit', async e => {
  e.preventDefault()
  const btn     = document.getElementById('invite-submit')
  const errorEl = document.getElementById('invite-error')
  const name    = document.getElementById('invite-name').value.trim()
  const password = document.getElementById('invite-password').value
  const consent  = document.getElementById('invite-consent')

  // UK GDPR consent gate (2026-08-24). The `required` attribute alone is not enough: it is trivially
  // removed in devtools, and this app handles special-category health data — so activation is refused
  // here too, in JS, not only by the browser.
  //
  // ⚠️ THIS IS NOT THE ONLY PATH TO AN ACTIVE ACCOUNT. An earlier version of this comment claimed it
  // was; the pre-push review proved that false. Three routes reach an activated account and only this
  // one is gated:
  //   1. #invite-form (here)          — invited clients and solo users. GATED.
  //   2. #new-password-form (:~1215)  — the recovery link. NOT gated. This is the app's own documented
  //      fallback for an expired invite, and it is how the real 2026-08-09 beta tester was recovered.
  //   3. coach accounts               — provisioned by Jake directly (app-core.js:662), straight to
  //      #login-form. Never sees this form, so a coach can never consent through the app.
  // Nothing reads `consented_at` back, so nothing prompts those users either.
  //
  // The durable fix is a READ-side gate — prompt whenever profiles.consented_at is null (or its
  // version is older than PRIVACY_POLICY_VERSION) — which covers all three routes and the re-consent
  // case in one place. Tracked as its own piece of work; this handler covers new invitees only.
  if (!consent?.checked) {
    errorEl.textContent = 'Please read and agree to the Privacy Policy to activate your account.'
    consent?.focus()
    return
  }

  btn.disabled = true
  btn.textContent = 'Activating…'
  errorEl.textContent = ''

  // A THROW past here (rather than a returned `error`) used to leave the button dead on "Activating…"
  // for good: this is an async listener, so the rejection went nowhere and nothing restored the
  // button. The commit added a second await, widening that window, which the pre-push review flagged.
  // Restores and tells the user to reload — the invite hash is still in the URL and supabase-js
  // re-processes it, so a reload genuinely recovers.
  //
  // A HANG is NOT fixed by this — supabase-js sets no fetch timeout, so an await that never settles
  // never reaches a catch. That is pre-existing and shared with every other await in this file; it
  // needs a timeout, not a try/catch, and is not in scope for this commit.
  try {
  // Supabase JS v2 auto-processes the invite hash on init and establishes the session.
  // No manual setSession needed — call updateUser directly.
  log.info('inviteForm', 'submitting invite acceptance')
  const { data: updated, error } = await db.auth.updateUser({
    password,
    data: { full_name: name }
  })

  if (error) {
    log.error('inviteForm', 'updateUser failed', error)
    errorEl.textContent = error.message
    btn.disabled = false
    btn.textContent = 'Activate account'
    return
  }

  // Record the consent, and check that it landed. An ACTIVATED account with no consent row is
  // precisely the compliance gap this whole change exists to close, so this must never be a
  // fire-and-forget write — PostgREST returns { data: [], error: null } for a policy-refused write,
  // so assert on the returned row rather than only on `error`.
  const uid = updated?.user?.id
  if (uid) {
    const { data: consentRow } = await dbq('inviteForm:consent', db.from('profiles').upsert({
      id: uid,
      full_name: name,
      consented_at: new Date().toISOString(),
      consent_policy_version: PRIVACY_POLICY_VERSION
    }, { onConflict: 'id' }).select('id'))
    if (!consentRow?.length) log.error('inviteForm', 'consent was NOT recorded for an activated account', { uid })
    else log.ok('inviteForm', 'consent recorded', { version: PRIVACY_POLICY_VERSION })
  } else {
    log.error('inviteForm', 'no user id returned — consent could not be recorded')
  }
  // Deliberately NOT refusing here, and not signing the user out. By this point updateUser has already
  // set the password and established the session, so refusing would strand a legitimate user with no
  // route back in — the exact shape that broke "View as" (feedback-guard-risk-is-refusing-the-
  // legitimate-user). The review disagreed with itself on this; the account being already-activated is
  // what settles it. The operator-visible signal is the migration's own report query:
  //   select id, full_name, consented_at from public.profiles where consented_at is null;

  log.ok('inviteForm', 'account activated successfully')
  // Clear the hash so the invite token isn't reused
  history.replaceState(null, '', window.location.pathname)
  showApp()
  } catch (err) {
    log.error('inviteForm', 'activation threw', err)
    errorEl.textContent = 'Something went wrong. Please reload the page and try again.'
    btn.disabled = false
    btn.textContent = 'Activate account'
  }
})

// ─── PASSWORD RESET (2026-08-18) ──────────────────────────────────────────────
// Added after a real beta user (invited 2026-08-09) let his invite link expire and had NO route back
// into the app: there was no reset flow at all, and the invite Edge Function is deliberately
// idempotent, so re-inviting an existing address silently sends nothing. Recovering him took manual
// SQL to delete the dead auth row. That is not an onboarding process.

document.getElementById('forgot-link')?.addEventListener('click', e => {
  e.preventDefault()
  // Carry whatever they already typed, so they don't retype it.
  const typed = document.getElementById('login-email')?.value?.trim()
  if (typed) document.getElementById('reset-email').value = typed
  document.getElementById('reset-error').textContent = ''
  document.getElementById('reset-sent').style.display = 'none'
  showResetRequestForm()
})

document.getElementById('reset-back-link')?.addEventListener('click', e => {
  e.preventDefault()
  showLoginForm()
})

document.getElementById('reset-request-form')?.addEventListener('submit', async e => {
  e.preventDefault()
  const btn     = document.getElementById('reset-submit')
  const errorEl = document.getElementById('reset-error')
  const sentEl  = document.getElementById('reset-sent')
  const email   = document.getElementById('reset-email').value.trim()
  if (!email) { errorEl.textContent = 'Enter your email address.'; return }

  btn.disabled = true
  btn.textContent = 'Sending…'
  errorEl.textContent = ''
  log.info('resetRequest', 'sending reset link')

  // redirectTo MUST be the deployed app: supabase appends the recovery hash to it, and the boot code
  // below is what turns that hash into the set-password form.
  const { error } = await db.auth.resetPasswordForEmail(email, {
    redirectTo: 'https://jakendwest-ops.github.io/coachapp/',
  })

  btn.disabled = false
  btn.textContent = 'Send reset link'

  if (error) {
    log.error('resetRequest', 'reset email failed', error)
    errorEl.textContent = error.message
    return
  }
  // Deliberately does NOT say whether the address exists — that would let anyone enumerate which
  // emails have accounts. Supabase returns success either way; the copy matches that.
  log.ok('resetRequest', 'reset email requested')
  sentEl.textContent = 'If that email has an account, a reset link is on its way. It expires — use it today.'
  sentEl.style.display = 'block'
})

document.getElementById('new-password-form')?.addEventListener('submit', async e => {
  e.preventDefault()
  const btn      = document.getElementById('np-submit')
  const errorEl  = document.getElementById('np-error')
  const password = document.getElementById('np-password').value
  const confirm  = document.getElementById('np-confirm').value
  errorEl.textContent = ''

  if (password !== confirm) { errorEl.textContent = 'Those two passwords do not match.'; return }
  if (password.length < 6)  { errorEl.textContent = 'Password must be at least 6 characters.'; return }

  btn.disabled = true
  btn.textContent = 'Saving…'
  log.info('newPassword', 'setting password from recovery link')

  // supabase-js has already exchanged the recovery hash for a session, exactly as it does for an
  // invite — so this is a plain updateUser, not a token exchange.
  const { error } = await db.auth.updateUser({ password })

  if (error) {
    log.error('newPassword', 'updateUser failed', error)
    // The commonest cause by far is an expired or already-used link, and the raw message
    // ("Auth session missing!") does not tell anyone that.
    errorEl.textContent = /session|token|expired|missing/i.test(error.message || '')
      ? 'That reset link has expired or was already used. Request a new one from the sign-in page.'
      : error.message
    btn.disabled = false
    btn.textContent = 'Set password'
    return
  }

  log.ok('newPassword', 'password set from recovery link')
  // Clear the hash so the recovery token cannot be reused from history.
  history.replaceState(null, '', window.location.pathname)
  showApp()
})

// ─── BOOT ─────────────────────────────────────────────────────────────────────

// Handle invite AND recovery links immediately — don't wait for auth event.
// _initialHash is captured at the top of app-core.js, BEFORE the supabase client is constructed,
// because supabase-js consumes and clears the hash while establishing the session.
if (_initialHash.includes('type=invite')) {
  try { showInviteForm() } catch(e) { log.error('boot', 'showInviteForm failed', e) }
} else if (_initialHash.includes('type=recovery')) {
  try { showNewPasswordForm() } catch(e) { log.error('boot', 'showNewPasswordForm failed', e) }
}

let _appLoaded = false
db.auth.onAuthStateChange((event, session) => {
  log.info('auth', `state change: ${event}`, { userId: session?.user?.id ?? null })
  currentUser = session?.user ?? null

  // A recovery link ESTABLISHES A SESSION, so without these two guards `currentUser` is set and the
  // app boots straight past the password form into the dashboard — the user never gets to set one.
  // This used to be a bare `return`, which is why a dashboard-sent recovery link did nothing at all:
  // the event was swallowed and no form was ever shown.
  if (event === 'PASSWORD_RECOVERY') { showNewPasswordForm(); return }
  if (_initialHash.includes('type=recovery') && event !== 'USER_UPDATED') { showNewPasswordForm(); return }
  if (_initialHash.includes('type=invite') && event !== 'USER_UPDATED') return

  if (currentUser) {
    // Only bootstrap once — SIGNED_IN fires on every token refresh, not just genuine logins
    if (!_appLoaded) {
      _appLoaded = true
      showApp()
    }
  } else {
    _appLoaded = false
    // Master-account/solo state is session-scoped, not per-account — loadUserInfo only ever SETS
    // these true/populates them, never resets them, so on a shared/gym device the NEXT account to
    // sign in on the same tab (no page reload — the primary sidebar sign-out button doesn't reload)
    // would inherit the PREVIOUS account's _masterAccount=true and a visible view-switcher.
    // switchView()'s own guard (`if (!window._masterAccount) return`) is the only thing standing
    // between a solo_only account and the full coach dashboard — a stale true here defeats it
    // entirely, not just cosmetically. Found by multi-agent review, 2026-07-24.
    window._masterAccount = false
    window._masterClientId = null
    window._soloClientId = null
    const switcher = document.getElementById('view-switcher')
    if (switcher) switcher.style.display = 'none'
    showAuth()
  }
})

// ─── SETTINGS ─────────────────────────────────────────────────────────────────

async function renderProgress(el) {
  // Destroy any charts left over from whichever Performance sub-view was active before this
  // top-level tab switch -- the per-render destroy calls inside _renderPerfExerciseList/
  // renderProgressPerSession only guard re-renders WITHIN the same sub-view (a keystroke, a range
  // change); they never ran when the container itself was torn down by switching to a different
  // top-level Progress tab, leaking every chart instance bound to the canvases this innerHTML
  // rebuild is about to detach. Found by the 2026-07-23 full-file review.
  _destroyManagedCharts()
  el.innerHTML = '<div class="loading-state">Loading…</div>'

  // 2026-07-08 restructure: "Cardio" folded into Personal Bests (alongside 1RMs) instead of its
  // own top-level tab — see renderProgressPBs.
  //
  // 2026-08-14: 1RMs pulled back OUT to its own tab, partially reversing the 1RMs half of that
  // restructure (Cardio stays folded in). Jake compared Personal against the coach's client-profile
  // view, where 1RMs is a full-width tab of its own, and rated the coach side better. On Personal it
  // was appended BELOW renderProgressPBs' own header and PB cards, so it read as a footer rather
  // than a section. Flagged as a reversal because 2026-07-08 moved it the other way deliberately.
  //
  // 2026-08-17: Jake — "'Personal Bests' page is redundant now that the 1RM page has the data I need.
  // Please delete the current 'personal best' page, and rename the 1RM page to 'personal bests'."
  // His data says the first half is right and the second is not safe as stated. The old page's
  // STRENGTH section is genuinely superseded — 4 exercises, unused since 25 June, against the 1RM
  // tab's 12 from 1 July onward. But that page is also the ONLY home cardio bests have had since the
  // 2026-07-08 fold-in, and deleting it would take 6 months of 5K times, a Skierg PB and 11 entries
  // with notes down with it. So the 1RM tab takes the Personal Bests name, and the old page keeps
  // everything it holds under a name that describes what it is now.
  const tabs = ['Body Weight', 'Personal Bests', 'Benchmarks', 'Performance']
  // '1RMs' no longer exists as a tab, so a stored value would fall through to the default and drop
  // the user on Body Weight. NOTE: _progressTab is a plain global with no localStorage behind it, so
  // it resets on every reload and this cannot currently fire in production — it is here so the
  // rename stays correct if tab state is ever persisted, and because within a single session the
  // old code path could still hold '1RMs'. Do not read it as evidence that tabs are remembered.
  if (window._progressTab === '1RMs') window._progressTab = 'Personal Bests'
  const activeTab = window._progressTab || 'Body Weight'

  el.innerHTML = `
    <div class="page-header"><h1 class="page-title">My Progress</h1></div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px">
      ${tabs.map(t => `
        <button onclick="window._progressTab='${t}';renderProgress(document.getElementById('main-content'))"
          style="padding:8px 16px;border:none;border-radius:20px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;
                 background:${t===activeTab?'var(--accent)':'var(--surface-2)'};
                 color:${t===activeTab?'#fff':'var(--text-muted)'}">
          ${t}
        </button>`).join('')}
    </div>
    <div id="progress-tab-content"><div class="loading-state">Coming soon</div></div>
  `

  if (activeTab === 'Body Weight')    await renderProgressWeight(document.getElementById('progress-tab-content'))
  if (activeTab === 'Benchmarks')     await renderProgressPBs(document.getElementById('progress-tab-content'))
  if (activeTab === 'Performance')    await renderPerformance(document.getElementById('progress-tab-content'))
  if (activeTab === 'Personal Bests') {
    const clientId = await _getCurrentClientId()
    const host = document.getElementById('progress-tab-content')
    if (!clientId) { host.innerHTML = '<div class="empty-state"><div class="empty-title">No client profile found</div></div>'; return }
    // Keeps the id every 1RM writer already refreshes through (_refresh1RMs looks for it first), so
    // saving or deleting from this tab re-renders in place rather than falling through to the coach's
    // #tab-content and silently painting into the wrong container.
    host.innerHTML = '<div id="pb-1rms-section"></div>'
    await renderClient1RMs(clientId, document.getElementById('pb-1rms-section'))
  }
}

async function renderPerformance(el) {
  // Same reasoning as renderProgress's own destroy call: switching between THIS view's own two
  // sub-tabs ('Per exercise' <-> 'Per session') re-enters renderPerformance directly, tearing
  // down #progress-tab-content without ever going through renderProgress -- guard here too so
  // neither direction leaks whichever chart array the sub-tab being left behind was using.
  _destroyManagedCharts()
  const clientId = await _getCurrentClientId()
  if (!clientId) { el.innerHTML = '<div class="empty-state"><p>No data yet.</p></div>'; return }

  // 2026-07-08 restructure: was ['1RMs', 'Progressions'] — 1RMs moved into Personal Bests
  // (renderProgressPBs), and "Progressions" (endless flat list) split into a searchable
  // per-exercise view and a new per-session comparison view.
  // Per exercise is the progression tool and now the default; "Per session" is the diary.
  //
  // RENAMED BACK to "Per session" on 2026-08-15 (Jake). The migration below had to be REVERSED, not
  // extended: it previously mapped a stored 'Per session' ONTO 'Recent sessions', so renaming the tab
  // without touching this line would have redirected the new tab to the old one on every render — a
  // tab that silently refuses to open. The label IS the stored state (window._perfTab), which is what
  // makes a rename a state migration rather than a cosmetic change.
  let subTab = window._perfTab || 'Per exercise'
  if (['1RMs', 'Progressions', 'Recent sessions'].includes(subTab)) window._perfTab = subTab = subTab === 'Recent sessions' ? 'Per session' : 'Per exercise'

  el.innerHTML = `
    <div style="display:flex;gap:6px;margin-bottom:16px">
      ${['Per exercise', 'Per session', 'Per program'].map(t => `
        <button onclick="window._perfTab='${t}';renderPerformance(document.getElementById('progress-tab-content'))"
          style="padding:6px 16px;border:none;border-radius:16px;font-size:13px;font-weight:600;cursor:pointer;
                 background:${t===subTab?'var(--accent)':'var(--surface-2)'};
                 color:${t===subTab?'#fff':'var(--text-muted)'}">
          ${t}
        </button>`).join('')}
    </div>
    <div id="perf-sub-content"></div>
  `

  const subEl = document.getElementById('perf-sub-content')
  if (subTab === 'Per session') {
    await renderProgressPerSession(clientId, subEl)
  } else if (subTab === 'Per program') {
    await renderProgressPerProgram(clientId, subEl)
  } else {
    await renderProgressStrength(subEl)
  }
}

// "Per session" tab (Performance, 2026-07-08 — net new, replaces the old flat endless-list
// "Progressions" view for this half). Lists completed sessions most-recent-first; expanding a
// session compares each of its exercises against that exercise's own previous occurrence (not
// just "the previous session", which may not have included it at all); expanding an exercise
// further shows the same progression-over-time chart the "Per exercise" tab already builds.
// Token-guarded (same pattern as _oneRMRefreshToken, app-programs.js): if the master account
// switches Client/Personal view while this fetch is still in flight, the slower request's
// now-stale result is discarded instead of overwriting the newer view's cache with the wrong
// client's data.
// ── B3 diary helpers (unit-tested) ──────────────────────────────────────────────────────────────
// Compact per-set line, our format: "105×10, 110×8" (weight×reps), "L 20×10, R 18×10" (unilateral),
// hold times, jump heights/distances.
function _setDetailsLine(sets) {
  const num = v => parseFloat(v) || 0
  return (sets || []).map(x => {
    // `!= null`, not `||`. weightToPref returns the NUMBER 0 in kg (falsy → "BW") but the STRING "0"
    // in lb (truthy → "0×10"), so the same bodyweight set read differently depending on the unit
    // preference. Matches the != null discipline this function already uses two lines down.
    if (x.side) return `${x.side[0].toUpperCase()} ${x.weight_kg != null ? weightToPref(x.weight_kg) : 'BW'}×${x.reps_achieved || 0}`
    // != null, not truthy — a real 0cm/0m jump attempt must still show, same falsy-zero shape as
    // the runner's weight guard (Jake, 2026-07-29/30).
    if (x.height_cm != null) return fmtJumpHeight(x.height_cm)
    if (x.duration_seconds && x.weight_kg == null) return fmtRestCountdown(parseInt(x.duration_seconds))
    if (x.weight_kg != null && x.reps_achieved != null) return `${weightToPref(x.weight_kg)}×${x.reps_achieved}`
    if (x.reps_achieved != null) return `${x.reps_achieved} rep`
    if (x.distance_m != null) return fmtDistanceM(x.distance_m)
    return ''
  }).filter(Boolean).join(', ')
}

// Same per-set rendering as _setDetailsLine, but CONSECUTIVE IDENTICAL sets collapse: "95×8, 95×8,
// 95×8" becomes "3 × 95×8". Added 2026-08-15 for the Per-exercise session list, where the uncollapsed
// form is unreadable for a typical 5×5.
//
// Deliberately NOT _fmtSetsCollapsed from app-workouts.js, despite the identical idea. That one
// consumes PRESCRIBED sets_json (repsMin/repsMax/weight/tempo) and returns '—' for every field of a
// LOGGED set — feed it workout_log_sets and the whole line comes back null. Only the grouping
// algorithm is borrowed; the per-set rendering has to be the achieved-set one.
//
// Consecutive, not global: "95×8, 95×8, 100×5, 95×8" must stay in the order it was lifted, so it reads
// "2 × 95×8 · 100×5 · 95×8" rather than silently reordering a ramp into "3 × 95×8".
function _collapsedSetLine(sets) {
  const groups = []
  ;(sets || []).forEach(x => {
    const detail = _setDetailsLine([x])
    if (!detail) return
    const last = groups[groups.length - 1]
    if (last && last.detail === detail) last.n++
    else groups.push({ detail, n: 1 })
  })
  if (!groups.length) return ''
  return groups.map(g => (g.n > 1 ? `${g.n} × ${g.detail}` : g.detail)).join(' · ')
}

// Warmup and cooldown are recorded (Jake, 2026-07-25) but are not training volume. Every aggregate
// must filter through this, or recording a warmup silently inflates every session's set count.
// NULL phase = an ordinary set: all strength, all steady-state cardio, and every row logged before
// the phase column existed.
function _countableSets(sets) {
  return (sets || []).filter(s => !s.phase || s.phase === 'work')
}

// One exercise-occurrence's metrics for the diary: a `main` value (top weight / cardio distance-or-time)
// and a `sec` value (volume / cardio time), each with a raw number + display + delta-number formatter,
// plus the set-details line and strength totals used for the per-workout summary.
function _diaryExMetrics(ex) {
  const sets = _countableSets(ex.workout_log_sets)
  const num = v => parseFloat(v) || 0
  const mt = ex.metric_type || (ex.exercise_type === 'cardio' ? 'cardio' : 'weight_reps')
  const setLine = _setDetailsLine(sets)
  if (mt === 'cardio' || mt === 'interval') { // interval is cardio-family — see _TREND_METRICS.interval
    const dist = sets.reduce((s, x) => s + num(x.distance_m), 0)
    const dur  = sets.reduce((s, x) => s + (parseInt(x.duration_seconds) || 0), 0)
    const useDist = dist > 0
    return { mt, isCardio: true, setLine, sets: sets.length, reps: 0, volume: 0,
      main: { raw: useDist ? dist : dur, fmt: useDist ? fmtDistanceM(dist) : fmtRestCountdown(dur),
              fmtNum: useDist ? (v => fmtDistanceM(v)) : (v => fmtRestCountdown(v)) },
      sec:  useDist && dur > 0 ? { label: 'Time', raw: dur, fmt: fmtRestCountdown(dur), fmtNum: v => fmtRestCountdown(v) } : null }
  }
  const reps   = sets.reduce((s, x) => s + (parseInt(x.reps_achieved) || 0), 0)
  const volume = sets.reduce((s, x) => s + num(x.weight_kg) * (parseInt(x.reps_achieved) || 0), 0)
  const top    = Math.max(0, ...sets.map(x => num(x.weight_kg)))
  // `raw` stays canonical kg (consumers like _diaryDelta compute a diff against a PREVIOUS raw kg
  // value, then format the result — the same "convert only at display time" pattern used throughout).
  return { mt, isCardio: false, setLine, sets: sets.length, reps, volume,
    main: { raw: top, fmt: fmtWeight(top, { spaced: true }), fmtNum: v => fmtWeight(v) },
    sec:  { label: 'Volume', raw: volume,
            fmt: Math.round(weightToPref(volume)).toLocaleString() + ' ' + window._unitPrefs.weight,
            fmtNum: v => Math.round(weightToPref(v)).toLocaleString() + window._unitPrefs.weight } }
}

// "▲ +X (+Y%)" / "▼ −X (−Y%)" delta vs previous occurrence — green up / red down, our wording.
function _diaryDelta(cur, prev, fmtNum) {
  if (prev == null) return ''
  const d = cur - prev
  if (Math.abs(d) < 0.005) return `<span style="color:var(--text-muted)">—</span>`
  const up = d > 0, pct = prev !== 0 ? Math.round(Math.abs(d) / prev * 100) : null
  return `<span style="color:${up ? '#16a34a' : '#ef4444'};font-weight:700">${up ? '▲' : '▼'} ${up ? '+' : '−'}${fmtNum(Math.abs(d))}${pct != null ? ` (${up ? '+' : '−'}${pct}%)` : ''}</span>`
}

let _perfSessionToken = 0
async function renderProgressPerSession(clientId, el) {
  el.innerHTML = '<div class="loading-state">Loading sessions…</div>'
  const myToken = ++_perfSessionToken
  // Any chart expanded on the previous render is about to be detached — destroy it first so it doesn't leak.
  _destroyManagedCharts()
  const { data: sessions } = await db.from('workout_logs')
    .select('id, name, date, workout_log_exercises(exercise_name, exercise_type, metric_type, workout_log_sets(weight_kg, reps_achieved, distance_m, duration_seconds, height_cm, side, avg_hr, avg_watts, phase))')
    .eq('client_id', clientId).order('date', { ascending: false }).limit(10)
  if (myToken !== _perfSessionToken) return
  if (!sessions?.length) { el.innerHTML = '<div class="empty-state"><p>No sessions logged yet. Your recent workouts will show here.</p></div>'; return }

  // Chronological per-exercise history so any occurrence can find its own immediately-prior one.
  const history = {}
  ;[...sessions].reverse().forEach(s => {
    ;(s.workout_log_exercises || []).forEach(ex => {
      if (!ex.exercise_name) return
      ;(history[ex.exercise_name] ||= []).push({ date: s.date, m: _diaryExMetrics(ex) })
    })
  })
  window._perfSessionData = { sessions, history }

  el.innerHTML = sessions.map((s, i) => {
    const exs = (s.workout_log_exercises || []).filter(e => e.exercise_name)
    const totals = exs.reduce((t, ex) => { const m = _diaryExMetrics(ex); t.sets += m.sets; t.reps += m.reps; t.vol += m.volume; return t }, { sets: 0, reps: 0, vol: 0 })
    const tiles = [['Sets', totals.sets, 'sets'], ['Reps', totals.reps, 'reps'], ['Volume', Math.round(weightToPref(totals.vol)).toLocaleString() + window._unitPrefs.weight, 'vol'], ['Exercises', exs.length, 'exercises']]
    // A session can genuinely have exercises but no logged sets (e.g. a custom/blank workout, or one
    // ended early) -- the 4 tiles above would then read "0 · 0 · 0kg · N", which reads as broken data
    // rather than an accurate empty state. Show a plain note instead of the tile row in that case.
    const noSetsLogged = totals.sets === 0
    return `
    <div style="border:1px solid var(--border);border-radius:var(--radius-md, 12px);margin-bottom:10px;overflow:hidden">
      <button onclick="_togglePerfSession(${i})" style="width:100%;padding:12px 14px;background:var(--surface-2);border:none;cursor:pointer;text-align:left">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <span style="font-size:var(--text-base, 13px);font-weight:700">${escapeHtml(s.name || 'Session')}</span>
          <span style="font-size:var(--text-md, 12px);color:var(--text-muted)">${new Date(s.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
        </div>
        ${noSetsLogged
          ? `<div style="font-size:var(--text-md, 12px);color:var(--text-muted)">No sets logged</div>`
          : `<div style="display:flex;gap:6px">
          ${tiles.map(([l, v, key]) => `<div style="flex:1;text-align:center;background:var(--surface);border-radius:var(--radius-sm, 8px);padding:6px 4px">
            <div style="font-size:13px;font-weight:800;color:${_METRIC_COLORS[key] || 'var(--accent)'}">${v}</div>
            <div style="font-size:var(--text-2xs, 9px);font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted)">${l}</div></div>`).join('')}
        </div>`}
      </button>
      <div id="perf-sess-${i}" style="display:none;padding:6px 14px 12px"></div>
    </div>`
  }).join('')
}

function _togglePerfSession(i) {
  const panel = document.getElementById(`perf-sess-${i}`)
  if (!panel) return
  const open = panel.style.display === 'none'
  panel.style.display = open ? 'block' : 'none'
  if (open && !panel.dataset.rendered) {
    panel.dataset.rendered = '1'
    _renderPerfSessionDetail(i)
  }
}

function _renderPerfSessionDetail(i) {
  const { sessions, history } = window._perfSessionData || {}
  const s = sessions?.[i]
  const panel = document.getElementById(`perf-sess-${i}`)
  if (!s || !panel) return
  panel.innerHTML = (s.workout_log_exercises || []).filter(ex => ex.exercise_name).map((ex, ei) => {
    const m = _diaryExMetrics(ex)
    const hist = history[ex.exercise_name] || []
    const idx = hist.findIndex(h => h.date === s.date)
    const prev = idx > 0 ? hist[idx - 1].m : null
    const mainDelta = prev ? _diaryDelta(m.main.raw, prev.main.raw, m.main.fmtNum) : (idx <= 0 ? '<span style="font-size:10px;color:var(--text-muted)">first time</span>' : '')
    const secDelta  = (m.sec && prev && prev.sec) ? _diaryDelta(m.sec.raw, prev.sec.raw, m.sec.fmtNum) : ''
    return `
      <div style="padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer" onclick="_expandPerfSessionExercise(${i},${ei})">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
          <span style="font-size:var(--text-base, 13px);font-weight:600">${escapeHtml(ex.exercise_name)}</span>
          <span style="font-size:var(--text-base, 13px);font-weight:700;white-space:nowrap">${m.main.fmt} ${mainDelta}</span>
        </div>
        ${m.setLine ? `<div style="font-size:var(--text-sm, 11px);color:var(--text-muted);margin-top:2px">${m.setLine}</div>` : ''}
        ${m.sec ? `<div style="font-size:var(--text-sm, 11px);color:var(--text-muted);margin-top:2px">${m.sec.label} ${m.sec.fmt} ${secDelta}</div>` : ''}
        <div id="perf-sess-${i}-ex-${ei}-chart" style="display:none;position:relative;height:80px;margin-top:8px"></div>
      </div>`
  }).join('')
}

function _expandPerfSessionExercise(i, ei) {
  const container = document.getElementById(`perf-sess-${i}-ex-${ei}-chart`)
  if (!container) return
  const isOpen = container.style.display !== 'none'
  if (isOpen) { container.style.display = 'none'; return }
  container.style.display = 'block'
  if (container.dataset.rendered) return
  container.dataset.rendered = '1'
  const { sessions, history } = window._perfSessionData || {}
  const ex = sessions?.[i]?.workout_log_exercises?.[ei]
  const hist = ex ? (history[ex.exercise_name] || []) : []
  if (hist.length < 2) { container.innerHTML = '<p style="font-size:11px;color:var(--text-muted);margin:0">Not enough history yet for a graph.</p>'; return }
  container.innerHTML = '<canvas></canvas>'
  const canvas = container.querySelector('canvas')
  _renderMetricChart(canvas, {
    labels: hist.map(h => new Date(h.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })),
    series: [{ data: hist.map(h => h.m.main.raw), colour: _METRIC_COLORS.topWeight, fill: true }],
    height: true,
    legend: false,
  })
}

async function renderProgressWeight(el) {
  // Same reason as renderProgressPBs: entered DIRECTLY from saveClientWeight (js/app-clients.js:80),
  // so its own teardown never ran and every "+ Log weight" orphaned pw-chart and resting-hr-chart.
  // Pre-existing (the old `Chart.getChart('pw-chart')` also resolved the id only AFTER innerHTML had
  // replaced the canvas), but fixed here rather than carried forward into the shared path.
  _destroyManagedCharts()
  el.innerHTML = '<div class="loading-state">Loading weight data…</div>'
  const clientId = await _getCurrentClientId()
  if (!clientId) { el.innerHTML = '<div class="empty-state"><p>No data yet.</p></div>'; return }
  const [{ data: logs }, { data: clientRow }] = await Promise.all([
    db.from('weight_logs').select('date, weight_kg, body_fat_pct, resting_hr').eq('client_id', clientId).order('date', { ascending: true }),
    db.from('clients').select('starting_weight_kg, goal_weight_kg').eq('id', clientId).single()
  ])
  const startingWeightKg = clientRow?.starting_weight_kg != null ? parseFloat(clientRow.starting_weight_kg) : null
  const goalWeightKg     = clientRow?.goal_weight_kg != null ? parseFloat(clientRow.goal_weight_kg) : null
  // 2026-07-08 BUG FIX: the button below called showClientWeightForm(), which only toggles a DOM
  // node (#client-weight-form) that existed on the Dashboard pages — never on this Progress page
  // it's actually clicked from. Silent no-op, same bug shape as the "Log PB" fix earlier this
  // session. Adding the form here (same markup as app-dashboard.js) makes the button real.
  const addWeightBtn = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px"><span style="font-size:var(--text-base, 13px);font-weight:600;color:var(--text)">Body weight log</span><button class="btn-secondary" style="font-size:var(--text-md, 12px);padding:4px 10px" onclick="showClientWeightForm('${clientId}')">+ Log weight</button></div>
    <div id="client-weight-form" style="display:none;margin-bottom:16px;padding:14px;border-radius:var(--radius-md, 12px);background:var(--surface);border:1px solid var(--border)">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
        <div><label class="form-label">Date</label><input type="date" id="cwf-date" class="form-input" value="${new Date().toISOString().split('T')[0]}"></div>
        <div><label class="form-label">Weight (${window._unitPrefs.weight})</label><input type="number" id="cwf-weight" class="form-input" placeholder="e.g. 89.5" step="0.1" min="20" max="300"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
        <div><label class="form-label">Body fat % <span style="color:var(--text-muted)">(optional)</span></label><input type="number" id="cwf-bf" class="form-input" placeholder="e.g. 19.5" step="0.1" min="1" max="60"></div>
        <div><label class="form-label">Resting HR (bpm) <span style="color:var(--text-muted)">(optional)</span></label><input type="number" inputmode="numeric" id="cwf-resting-hr" class="form-input" placeholder="e.g. 58" step="1" min="20" max="250"></div>
      </div>
      <div style="margin-bottom:8px">
        <div><label class="form-label">Notes <span style="color:var(--text-muted)">(optional)</span></label><input type="text" id="cwf-notes" class="form-input" placeholder="Any notes…"></div>
      </div>
      <p id="cwf-error" style="color:var(--danger, #ef4444);font-size:var(--text-md, 12px);margin:0 0 6px"></p>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" style="font-size:var(--text-base, 13px);padding:6px 14px" onclick="saveClientWeight('${clientId}')">Save</button>
        <button class="btn-secondary" style="font-size:var(--text-base, 13px);padding:6px 14px" onclick="document.getElementById('client-weight-form').style.display='none'">Cancel</button>
      </div>
    </div>`
  const goalsCard = `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md, 12px);padding:18px;margin-bottom:16px">
      <div style="font-size:var(--text-base, 13px);font-weight:700;color:var(--text);margin-bottom:4px">Weight goals</div>
      <div style="font-size:var(--legacy-text-11-5, 11.5px);color:var(--text-muted);margin-bottom:14px">Used to set the chart's range below</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
        <div>
          <label style="font-size:var(--text-sm, 11px);color:var(--text-muted);font-weight:600;display:block;margin-bottom:4px">Starting weight (${window._unitPrefs.weight})</label>
          <input id="wg-starting" type="number" step="0.1" class="field-input" placeholder="e.g. 90" ${weightInputAttrs(startingWeightKg)}>
        </div>
        <div>
          <label style="font-size:var(--text-sm, 11px);color:var(--text-muted);font-weight:600;display:block;margin-bottom:4px">Goal weight (${window._unitPrefs.weight})</label>
          <input id="wg-goal" type="number" step="0.1" class="field-input" placeholder="e.g. 82" ${weightInputAttrs(goalWeightKg)}>
        </div>
      </div>
      <p id="wg-error" style="color:var(--danger, #ef4444);font-size:var(--text-md, 12px);margin:4px 0 0"></p>
      <button onclick="saveWeightGoals('${clientId}')" class="btn-secondary" style="width:100%">Save goals</button>
    </div>`
  if (!logs?.length) { el.innerHTML = addWeightBtn + goalsCard + '<div class="empty-state"><p>No weight logs yet. Tap + Log weight to add your first entry.</p></div>'; return }
  const latest = logs[logs.length - 1]
  const first  = logs[0]
  // "Starting" prefers the user's own starting_weight_kg goal field over the earliest logged
  // entry — the goal field is meant to represent where they actually started (which may predate
  // their first in-app log), so entering it should visibly move this tile, not just the chart axis.
  const effectiveStarting = startingWeightKg ?? first.weight_kg
  const change = (latest.weight_kg - effectiveStarting).toFixed(1)
  const sign   = change > 0 ? '+' : ''
  el.innerHTML = `
    ${addWeightBtn}
    ${goalsCard}
    <div style="display:flex;gap:12px;margin-bottom:16px">
      ${[['Starting', fmtWeight(effectiveStarting, { spaced: true })], ['Current', fmtWeight(latest.weight_kg, { spaced: true })], ['Change', sign + fmtWeight(change, { spaced: true, decimals: 1 })]].map(([l,v])=>`
        <div style="flex:1;padding:12px;border-radius:var(--radius-md, 12px);background:var(--surface);text-align:center">
          <div style="font-size:var(--text-2xl, 18px);font-weight:800;color:var(--accent)">${v}</div>
          <div style="font-size:var(--text-xs, 10px);font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-top:2px">${l}</div>
        </div>`).join('')}
    </div>
    <div style="position:relative;height:200px;margin-bottom:16px"><canvas id="pw-chart" style="width:100%;height:100%"></canvas></div>
    <div style="border-radius:var(--radius-md, 12px);overflow:hidden;border:1px solid var(--border)">
      ${logs.slice().reverse().slice(0,10).map(l=>`
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid var(--border)">
          <span style="font-size:var(--text-base, 13px);color:var(--text-muted)">${new Date(l.date).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</span>
          <span style="font-size:var(--text-lg, 14px);font-weight:700">${fmtWeight(l.weight_kg, { spaced: true })}${l.body_fat_pct ? ' · '+l.body_fat_pct+'% BF' : ''}</span>
        </div>`).join('')}
    </div>
    ${(() => { const hr = logs.filter(l => l.resting_hr != null); if (hr.length < 2) return ''
      return `<div style="margin-top:20px;margin-bottom:8px;font-size:var(--text-base, 13px);font-weight:600;color:var(--text)">Resting heart rate</div>
        <div style="position:relative;height:160px"><canvas id="resting-hr-chart" style="width:100%;height:100%"></canvas></div>` })()}
  `
  // Y-axis range blends whichever of goal/starting weight are set with the actual logged data —
  // previously this only activated when BOTH fields were set, so entering just one (the common
  // case) silently had zero visible effect. Math.min/max (not "goal is always below starting") so
  // a weight-gain goal doesn't invert the axis.
  // Convert to the display unit BEFORE the min/max math, so the plotted points and the axis bounds
  // stay in the same unit as each other (converting only the axis label would mismatch them).
  const weightUnit = window._unitPrefs.weight
  const dispWeights = logs.map(l => weightToPref(l.weight_kg))
  const dispGoal = goalWeightKg != null ? weightToPref(goalWeightKg) : null
  const dispStarting = startingWeightKg != null ? weightToPref(startingWeightKg) : null
  const anchors = [dispGoal, dispStarting, ...dispWeights].filter(v => v != null)
  const yRange = (dispGoal != null || dispStarting != null)
    ? { min: Math.floor(Math.min(...anchors) * 2) / 2, max: Math.ceil((Math.max(...anchors) + 1) * 2) / 2 }
    : {}
  // Chart.js keeps a per-canvas registry; creating a second chart on the same canvas without
  // destroying the first leaks the old instance along with its listeners and animation loop, and the
  // two then fight over the same context. The weight-chart site above already guards this exact way
  // (`Chart.getChart(id)` + destroy) — this pair was simply missed. Re-rendering My Progress is a
  // normal thing to do repeatedly (switch tab, change units, log a weight), so the leak compounds.
  // Jake, 2026-08-14: "the entire UI for weight/performance/programs/1RM is better on ALEX TURNER
  // profile than it is on my personal account." This chart is the specific comparison he made. It had
  // ONE flat line; the coach's had three datasets, a smoothing average and a body-fat axis — all from
  // data this page was ALREADY loading and simply not plotting. Same helper, same style, both surfaces.
  const dispBf = logs.map(l => (l.body_fat_pct != null ? parseFloat(l.body_fat_pct) : null))
  const pwSeries = [
    { label: `Weight (${weightUnit})`, data: dispWeights, colour: _METRIC_COLORS.topWeight, fill: true },
    { label: '7-day avg', data: _rollingAvg(dispWeights), colour: _METRIC_COLORS.topWeight, dashed: true, pointRadius: 0 },
  ]
  if (dispBf.some(v => v != null)) pwSeries.push({
    label: 'Body fat %', data: dispBf, colour: _METRIC_COLORS.intensity, axis: 'y2', spanGaps: true,
  })
  _renderMetricChart('pw-chart', {
    labels: logs.map(l => new Date(l.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })),
    series: pwSeries,
    yRange,
    height: true,   // the canvas sits in a fixed-height box, so aspect ratio must not drive it
    stepSize: weightUnit === 'lb' ? 1 : 0.5,
    yFormat: v => `${_tickNum(v)} ${weightUnit}`,
  })

  const hrLogs = logs.filter(l => l.resting_hr != null)
  if (hrLogs.length >= 2 && document.getElementById('resting-hr-chart')) {
    _renderMetricChart('resting-hr-chart', {
      labels: hrLogs.map(l => new Date(l.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })),
      series: [{ label: 'Resting HR', data: hrLogs.map(l => l.resting_hr), colour: _METRIC_COLORS.avgHr, fill: true }],
      height: true,
      legend: false,
      yFormat: v => `${_tickNum(v)} bpm`,
    })
  }
}

// ── ③ metric_type-aware progress trends ─────────────────────────────────────────────────────────
// Pure helpers (unit-tested). A logged exercise's metric_type is denormalized onto
// workout_log_exercises (①); exercise_id is nullable, so series group by exercise_name, never a join.
const _TREND_RANGES = { '1M': 30, '3M': 90, '6M': 180, '1Y': 365, 'All': Infinity }


// One point per session, with only the keys relevant to the metric_type populated.
function _metricPointsFor(ex) {
  const points = (ex.sessions || []).map(sess => {
    const sets = _countableSets(sess.sets)
    const num = (v) => parseFloat(v) || 0
    // `sets` carried onto the point (2026-08-15). Jake: "The plot points only show the weight that was
    // used ... none of the tabs show how many sets or reps i did with this weight." The raw sets were
    // already fetched and already in scope here — they were simply dropped when this callback returned
    // only its scalar aggregates. Costs no extra query.
    // Sorted by set_number: the embed has no inherent order (see the select in _buildExerciseSeries).
    // Safe to add — the chip filter downstream reads named metric keys only, and _aggregateSeries
    // reads exactly one key, so a new key collides with nothing.
    const p = { date: sess.date, sets: [...sets].sort((a, b) => (a.set_number || 0) - (b.set_number || 0)) }
    switch (ex.metricType) {
      case 'cardio':
      case 'interval': {
        p.totalDistance = sets.reduce((s, x) => s + num(x.distance_m), 0)          // metres
        p.totalDuration = sets.reduce((s, x) => s + (parseInt(x.duration_seconds) || 0), 0)
        p.pace = p.totalDistance > 0 ? p.totalDuration / (p.totalDistance / 1000) : 0 // sec/km
        const hrs = sets.map(x => parseInt(x.avg_hr)).filter(Boolean)
        p.avgHr = hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : 0
        const watts = sets.map(x => parseInt(x.avg_watts)).filter(Boolean)
        p.avgWatts = watts.length ? Math.round(watts.reduce((a, b) => a + b, 0) / watts.length) : 0
        break
      }
      case 'unilateral': {
        const side = (sd) => sets.filter(x => x.side === sd)
        p.leftTop  = Math.max(0, ...side('left').map(x => num(x.weight_kg)))
        p.rightTop = Math.max(0, ...side('right').map(x => num(x.weight_kg)))
        p.topWeight = Math.max(p.leftTop, p.rightTop)
        // Same reason as the weight_reps branch: a bodyweight set leaves weight_kg NULL, so a pistol
        // squat or single-leg calf raise had every metric at 0 and charted a flat line. Fixing the
        // one branch and not its sibling is how this codebase has shipped the same bug twice before.
        p.reps = sets.reduce((s, x) => s + (parseInt(x.reps_achieved) || 0), 0)
        break
      }
      case 'timed_hold':
        p.maxDuration = Math.max(0, ...sets.map(x => parseInt(x.duration_seconds) || 0))
        break
      case 'jump_height':
        p.bestHeight = Math.max(0, ...sets.map(x => num(x.height_cm)))
        break
      case 'jump_distance':
        p.bestDistance = Math.max(0, ...sets.map(x => num(x.distance_m)))
        break
      default: { // weight_reps (and any unknown → treat as weight_reps)
        p.topWeight = Math.max(0, ...sets.map(x => num(x.weight_kg)))
        p.e1rm      = Math.max(0, ...sets.map(x => _estimate1RM(x.weight_kg, x.reps_achieved) || 0))
        p.volume    = sets.reduce((s, x) => s + num(x.weight_kg) * (parseInt(x.reps_achieved) || 0), 0)
        const totalReps = sets.reduce((s, x) => s + (parseInt(x.reps_achieved) || 0), 0)
        p.intensity = totalReps > 0 ? p.volume / totalReps : 0 // weighted avg weight per rep
        // Reps as a metric in its own right (2026-08-16). A bodyweight set never writes weight_kg
        // (app-runner.js:2419), and num() maps that NULL to 0 rather than "missing" — so topWeight,
        // e1rm, volume AND intensity are all 0 for every pull-up or dip session ever logged. Reps is
        // the only number those lifts actually produce, and it was computed here already for
        // intensity and then thrown away.
        p.reps = totalReps
      }
    }
    return p
  })
  return { name: ex.name, metricType: ex.metricType, points }
}

// ISO-week key for weekly buckets; YYYY-MM for monthly.
function _bucketKey(dateStr, mode) {
  const d = new Date(dateStr)
  if (mode === 'month') return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
  const onejan = new Date(d.getFullYear(), 0, 1)
  const week = Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7)
  return d.getFullYear() + '-W' + String(week).padStart(2, '0')
}

// Raw points → [{label, value}] for one metricKey, bucketed for readability on long windows.
// mode: 'max' for "best" metrics (top weight, e1RM, jump, hold), 'mean' for rate metrics (pace, HR).
function _aggregateSeries(points, metricKey, mode) {
  const vals = points.map(p => ({ date: p.date, v: p[metricKey] })).filter(p => p.v != null && !isNaN(p.v))
  if (!vals.length) return []
  const bucket = vals.length > 120 ? 'month' : vals.length > 40 ? 'week' : null
  const fmt = (dateStr) => new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  if (!bucket) return vals.map(p => ({ label: fmt(p.date), value: p.v }))
  const groups = {}
  vals.forEach(p => { (groups[_bucketKey(p.date, bucket)] ||= []).push(p) })
  return Object.entries(groups).sort(([a], [b]) => a < b ? -1 : 1).map(([, arr]) => {
    const value = mode === 'mean'
      ? arr.reduce((s, p) => s + p.v, 0) / arr.length
      : Math.max(...arr.map(p => p.v))
    return { label: fmt(arr[arr.length - 1].date), value: Math.round(value * 10) / 10 }
  })
}

// "Per exercise" tab (Performance) — metric_type-aware trend cards (③). Fetches once into
// window._trendCache so the search box, range selector and metric chips all re-render locally
// without re-hitting the DB (same fetch-once/filter-locally reasoning as the exercise picker).
// Token-guarded (like _oneRMRefreshToken): a mid-fetch Client/Personal switch can't paint the
// wrong client's data. metric_type drives which chips/chart each card shows.
let _perfExerciseToken = 0
// ─── Per program (2026-08-15) ────────────────────────────────────────────────
// Jake: "there will be scenarios where I want to see my exercise progress over the duration of a
// program length." All-time stays in Per exercise; this scopes the same data to one block's window.
//
// 🔴 A WINDOW, NOT A JOIN — and the UI must never imply otherwise. workout_logs carries no programme
// reference (saveRunnerSession writes coach_id, client_id, name, date, notes and nothing else), so a
// block IS a date range. Two different programmes can be assigned at once, so windows can overlap and
// one session can legitimately fall in both. Every label therefore says "sessions logged between X
// and Y", never "sessions from this programme".
let _perfProgramToken = 0

// Open blocks come from client_programs; closed ones from client_program_blocks, which is written at
// the moment an assignment is destroyed (see _archiveAssignmentBlock). Assignments with no start_date
// are excluded — they have no window at all.
async function _loadProgramBlocks(clientId) {
  const [live, archived] = await Promise.all([
    db.from('client_programs')
      .select('id, program_id, start_date, created_at, programs(name, program_phases(duration_weeks))')
      .eq('client_id', clientId),
    db.from('client_program_blocks')
      .select('id, program_id, program_name, start_date, assigned_at, ended_at, planned_weeks')
      .eq('client_id', clientId),
  ])
  if (live.error || archived.error) {
    log.error('_loadProgramBlocks', 'block fetch failed', live.error || archived.error)
    return null   // null, not [] — [] is truthy-empty and would render "no blocks" on a failed fetch
  }
  const today = _ymdLocal(new Date())   // NOT toISOString: between 00:00–01:00 BST that returns yesterday
  const blocks = [
    ...(live.data || []).map(cp => {
      const phases = cp.programs?.program_phases || []
      return {
        key: `live:${cp.id}`,
        progKey: cp.program_id || cp.programs?.name || 'Programme',
        name: cp.programs?.name || 'Programme',
        startRaw: cp.start_date || (cp.created_at || '').split('T')[0],
        end: today,
        weeks: phases.length ? phases.reduce((s, p) => s + (p.duration_weeks || 1), 0) : null,
        open: true,
      }
    }),
    ...(archived.data || []).map(b => ({
      key: `past:${b.id}`,
      progKey: b.program_id || b.program_name || 'Programme',
      name: b.program_name || 'Programme',
      startRaw: b.start_date || (b.assigned_at || '').split('T')[0],
      end: b.ended_at,
      weeks: b.planned_weeks,
      open: false,
    })),
  ].filter(b => b.startRaw)
  // Monday of the start week, via the shared helper the calendar uses — see _mondayOfWeek.
  blocks.forEach(b => {
    const mon = _mondayOfWeek(b.startRaw)
    b.start = _ymdLocal(mon) || b.startRaw   // _ymdLocal, NOT toISOString — see its comment in app-core
  })
  return _clampBlockChain(blocks.sort((a, b) => (b.start || '').localeCompare(a.start || '')))
}

// A block ends where the SAME programme's next run begins.
//
// `ended_at` is the day RESTART WAS PRESSED (app-programs.js:287), which is not the day the block's
// training finished and bears no fixed relation to the next block's start — that one is snapped back
// to its own Monday. The two can therefore overlap by up to six days, or leave a gap. Neither an
// inclusive nor an exclusive end fixes that; the end has to be derived from the next run:
//
//   restart Wed 1 Jul, next start_date Mon 6 Jul  -> windows GAP, losing 1 Jul from both blocks
//   restart Wed 1 Jul, next start_date 1 Jul      -> snaps to Mon 29 Jun, so 29+30 Jun fall in
//                                                    BOTH, and show as week 5 of a 4-week block
//
// Clamping is scoped to the same programme on purpose. Two DIFFERENT programmes can be assigned at
// once and their windows legitimately overlap — see the header note — so clamping across programmes
// would silently discard real sessions. A restart chain cannot overlap itself.
//
// Top-level and named so the spec can drive the REAL rule over synthetic blocks: client_program_blocks
// is append-only, so a test cannot create and then clean up a genuine restart chain.
function _clampBlockChain(blocks) {
  const dayBefore = (ymd) => {
    const d = new Date(ymd + 'T12:00:00')
    d.setDate(d.getDate() - 1)
    return _ymdLocal(d)
  }
  blocks.forEach(b => {
    const nextStart = blocks
      .filter(o => o !== b && o.progKey === b.progKey && o.start > b.start)
      .reduce((min, o) => (min === null || o.start < min ? o.start : min), null)
    if (nextStart && b.end >= nextStart) b.end = dayBefore(nextStart)
  })
  return blocks
}

// These three are top-level and named so the spec can call the REAL code. Written inline first, they
// could only be tested by re-typing the expression in the test — which stays green when the source
// breaks. The window rule especially: a block IS a date range, so this comparison is the feature.
// Plainly INCLUSIVE at both ends. It was briefly half-open for closed blocks, which fixed only the
// case where the restart landed on the next run's Monday and LOST a session entirely when it didn't.
// The overlap is a property of the window, so it is resolved once in _loadProgramBlocks — see the
// clamp there — leaving this a dumb, honest filter over a range that is already correct.
const _ptsInBlock = (pts, block) => (pts || [])
  .filter(p => p.date >= block.start && p.date <= block.end)
// Anchored at NOON, not midnight. Millisecond division over midnights is wrong across a DST change:
// local midnight to local midnight over a spring-forward week is 7 days MINUS an hour, which floors to
// week 0 and shifts every later week down by one — merging two real training weeks into one plotted
// point, and giving a block that crosses the change a different week axis from one that doesn't. That
// shared axis is the entire reason two blocks can sit on this chart. Noon puts 12h of slack either side.
const _blockWeekIndex = (block, dateStr) => {
  const days = Math.round((new Date(dateStr + 'T12:00:00') - new Date(block.start + 'T12:00:00')) / 86400000)
  return Math.floor(days / 7) + 1
}
// Kept exactly as _aggregateSeries keeps values (`!= null && !isNaN`), NOT `> 0`. A 0 is a real
// reading here — a bodyweight set logs topWeight 0 — and a truthy filter would make the summary
// disagree with the line drawn directly above it.
const _usableMetricValue = v => v != null && !isNaN(v)

// Which metrics are worth offering for these points. ONE definition, used by both the Per exercise
// cards and the Per program comparison — they had drifted into two hand-copies, and a comment on the
// second claimed it was reusing the first.
//
// `> 0` rather than _usableMetricValue on purpose: here a 0 means "this metric cannot describe this
// exercise" (a bodyweight lift has no weight), which is exactly what should hide the chip. Inside a
// chosen metric, 0 is still a real reading — see _usableMetricValue.
const _metricsWithData = (metrics, pts) => (metrics || []).filter(([key]) => (pts || []).some(p => (p[key] || 0) > 0))

// Direction badge for a block summary. Named and top-level so the spec can call the REAL decision —
// written inline, the only way to test it was to re-type it in the test, which stays green when the
// source breaks (it did, twice).
//
// `flat` is its own case on purpose. `last >= first` painted a green ▲ 0% whenever the two ends
// matched — including the all-bodyweight case where every metric is 0, asserting progress on a lift
// the chart could not measure at all. `lowerIsBetter` is pace: 4:30/km beats 5:00/km.
function _deltaBadge(first, last, lowerIsBetter) {
  const flat = last === first
  const better = lowerIsBetter ? last < first : last > first
  // A percentage against a zero baseline is meaningless — "0 reps → 45 reps ▲ 0%" reads as no
  // progress when it is the opposite. Reachable whenever the first in-window session logged nothing
  // for this metric (a bench set saved with no reps, a bodyweight week before a loaded one).
  return {
    delta: first ? Math.round(((last - first) / first) * 100) : null,
    arrow: flat ? '–' : (last > first ? '▲' : '▼'),
    colour: flat ? 'var(--text-muted)' : (better ? '#059669' : '#dc2626'),
    green: !flat && better,
  }
}

// Option markup lives in named functions so the spec can assert on the REAL string. Written inline,
// the only way to test it was to re-type the markup in the test — which stays green when the source
// breaks, and did.
//
// escapeHtml, NOT escapeAttr. escapeAttr is for a JS string literal inside a handler
// (onclick="fn('${escapeAttr(x)}')"); it backslash-escapes quotes, and in a plain value="" the
// browser KEEPS the backslash — so this.value stops matching the name it came from and the lookup
// silently misses. Same class as commit 9d0003b.
const _exerciseOptionsHtml = (names, selected) => (names || [])
  .map(n => `<option value="${escapeHtml(n)}"${n === selected ? ' selected' : ''}>${escapeHtml(n)}</option>`).join('')
const _blockOptionHtml = (b, selected) =>
  `<option value="${escapeHtml(b.key)}"${b.key === selected ? ' selected' : ''}>${escapeHtml(b.name)} · ${escapeHtml(_fmtBlockRange(b))}${b.open ? ' (current)' : ''}</option>`

const _fmtBlockRange = b => {
  const d = s => new Date(s + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
  return `${d(b.start)} – ${b.open ? 'now' : d(b.end)}`
}

async function renderProgressPerProgram(clientId, el) {
  el.innerHTML = '<div class="loading-state">Loading programmes…</div>'
  // Own token, mirroring _perfExerciseToken — a master account switching Client/Personal mid-fetch
  // must not paint the wrong person's blocks.
  const myToken = ++_perfProgramToken
  const [blocks, exercises] = await Promise.all([_loadProgramBlocks(clientId), _buildExerciseSeries(clientId)])
  if (myToken !== _perfProgramToken) return

  if (blocks === null) {
    el.innerHTML = '<div class="empty-state"><div class="empty-title">Couldn\'t load your programmes</div><div class="empty-text">Check your connection and try again.</div></div>'
    return
  }
  if (!blocks.length) {
    el.innerHTML = '<div class="empty-state"><p>No programme with a start date yet — assign one and set its start date to compare blocks.</p></div>'
    return
  }
  // Deliberately NOT window._trendCache. That global is owned by renderProgressStrength behind a
  // DIFFERENT token (_perfExerciseToken), so neither render can cancel the other: a master account
  // that opens Per program in Client view, switches to Personal, then types in the Per-exercise
  // search box would see the COACHED CLIENT's exercises under "Personal". Same auth.uid(), so RLS
  // never sees it — it is a UI leak between two people. A private cache removes the collision.
  window._blockExCache = exercises
  // Honest about the day-one state: history only accrues from a restart, so a brand-new setup has one
  // block and nothing to compare. Saying so beats an empty second dropdown the user has to interpret.
  const singleBlockNote = blocks.length < 2
    ? `<div style="font-size:var(--text-sm, 11px);color:var(--text-muted);font-style:italic;margin-bottom:12px">Only one block so far. Restarting or changing a programme files the current one away, and it becomes available here to compare against.</div>`
    : ''

  window._blockState = window._blockState || {}
  const st = window._blockState
  if (!blocks.some(b => b.key === st.a)) st.a = blocks[0].key
  // `''` is what the "Compare with…" option sets when the user deliberately turns comparison OFF.
  // No block key equals '', so a bare `.some()` check would undo that choice on every re-render.
  if (st.b !== '' && !blocks.some(b => b.key === st.b)) st.b = blocks[1]?.key || ''
  const names = [...new Set(exercises.map(e => e.name))].sort((x, y) => x.localeCompare(y))
  if (!names.includes(st.ex)) st.ex = names[0] || ''

  const opt = (b, sel) => _blockOptionHtml(b, sel)
  el.innerHTML = `
    ${singleBlockNote}
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px">
      <select class="field-input" id="blk-ex" onchange="_setBlockState('ex', this.value)" style="font-size:var(--text-xl, 16px)">
        ${_exerciseOptionsHtml(names, st.ex)}
      </select>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <select class="field-input" id="blk-a" onchange="_setBlockState('a', this.value)" style="flex:1;min-width:150px;font-size:var(--text-xl, 16px)">
          ${blocks.map(b => opt(b, st.a)).join('')}
        </select>
        <select class="field-input" id="blk-b" onchange="_setBlockState('b', this.value)" style="flex:1;min-width:150px;font-size:var(--text-xl, 16px)">
          <option value="">Compare with…</option>
          ${blocks.map(b => opt(b, st.b)).join('')}
        </select>
      </div>
    </div>
    <div id="blk-result"></div>`
  window._blockCache = blocks
  _renderBlockComparison()
}

function _setBlockState(key, value) {
  window._blockState = window._blockState || {}
  window._blockState[key] = value
  _renderBlockComparison()
}

function _renderBlockComparison() {
  const host = document.getElementById('blk-result')
  if (!host) return
  _destroyManagedCharts()
  const st = window._blockState || {}
  const blocks = window._blockCache || []
  const ex = (window._blockExCache || []).find(e => e.name === st.ex)
  if (!ex) { host.innerHTML = '<div class="empty-state"><p>No sessions logged yet.</p></div>'; return }

  const allMetrics = _TREND_METRICS[ex.metricType] || _TREND_METRICS.weight_reps
  const allPts = _metricPointsFor(ex).points

  // A block's points are simply the sessions inside its window — see the header note: this is a date
  // filter, not an attribution. Windows are resolved BEFORE the metric is chosen, because the choice
  // depends on which metrics actually have data inside these two blocks.
  const windowFor = key => {
    const b = blocks.find(x => x.key === key)
    return b ? { b, pts: _ptsInBlock(allPts, b) } : null
  }
  const wA = windowFor(st.a)
  const wB = st.b ? windowFor(st.b) : null

  // Show a metric only if it has a non-zero reading in one of the two blocks. Previously this took
  // metrics[0] unconditionally, which for a bodyweight pull-up meant Top weight — flat zero for every
  // session, reported as a green ▲ 0%. Falls back to the full list so an exercise with genuinely no
  // data still renders its empty state rather than crashing.
  const inWindows = [...(wA?.pts || []), ...(wB?.pts || [])]
  const metrics = _metricsWithData(allMetrics, inWindows)
  const usableMetrics = metrics.length ? metrics : allMetrics
  const stored = st.metric && usableMetrics.some(m => m[0] === st.metric) ? st.metric : usableMetrics[0][0]
  const active = usableMetrics.find(m => m[0] === stored)

  const withAgg = w => w && { ...w, agg: _aggregateSeries(w.pts, active[0], active[2]) }
  const A = withAgg(wA)
  const B = withAgg(wB)

  const usable = _usableMetricValue
  const lowerIsBetter = !!active[4]   // pace only: 4:30/km beats 5:00/km

  const summary = s => {
    if (!s) return ''
    const vals = s.pts.map(p => p[active[0]]).filter(usable)
    if (!vals.length) return `<div style="font-size:var(--text-md, 12px);color:var(--text-muted);padding:3px 0">${escapeHtml(s.b.name)} · <em>no sessions logged in this window</em></div>`
    const first = vals[0], last = vals[vals.length - 1]   // sessions are sorted by date in _buildExerciseSeries
    const { delta, arrow, colour } = _deltaBadge(first, last, lowerIsBetter)
    return `<div style="display:flex;justify-content:space-between;gap:10px;padding:4px 0;font-size:var(--text-md, 12px)">
      <span style="color:var(--text-muted);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(s.b.name)} · ${escapeHtml(_fmtBlockRange(s.b))}</span>
      <span style="flex-shrink:0"><strong>${escapeHtml(active[3](first))} → ${escapeHtml(active[3](last))}</strong>
        <span style="color:${colour};font-weight:700"> ${arrow}${delta == null ? '' : ` ${Math.abs(delta)}%`}</span>
        <span style="color:var(--text-muted)"> · ${s.pts.length} session${s.pts.length === 1 ? '' : 's'}</span></span>
    </div>`
  }

  // Metric chips, matching the Per exercise cards. Without them this tab was locked to whichever
  // metric it picked, so the two blocks could never be compared on Volume or Est 1RM at all.
  const chips = usableMetrics.length < 2 ? '' : `
      <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:9px">
        ${usableMetrics.map(([key, label]) => `<button onclick="_setBlockState('metric','${escapeAttr(key)}')"
          style="padding:3px 9px;border-radius:999px;font-size:11px;font-weight:600;cursor:pointer;border:1px solid ${key === active[0] ? (_METRIC_COLORS[key] || 'var(--accent)') : 'var(--border)'};background:${key === active[0] ? (_METRIC_COLORS[key] || 'var(--accent)') : 'transparent'};color:${key === active[0] ? '#fff' : 'var(--text-muted)'}">${escapeHtml(label)}</button>`).join('')}
      </div>`

  const chartable = (A?.agg.length >= 2) || (B?.agg.length >= 2)
  host.innerHTML = `
    <div style="padding:14px;border-radius:var(--radius-md, 12px);background:var(--surface);border:1px solid var(--border)">
      <div style="font-size:var(--text-lg, 14px);font-weight:700;margin-bottom:2px">${escapeHtml(ex.name)}</div>
      <div style="font-size:var(--text-sm, 11px);color:var(--text-muted);margin-bottom:10px">${escapeHtml(active[1])} · sessions logged between each block's dates</div>
      ${chips}
      ${chartable ? `<div style="position:relative;height:120px"><canvas id="blk-chart"></canvas></div>`
                  : `<div style="font-size:var(--text-sm, 11px);color:var(--text-muted);font-style:italic;padding:2px 0 8px">Not enough sessions in these windows to plot a line yet.</div>`}
      <div style="margin-top:10px;border-top:1px solid var(--border);padding-top:8px">
        ${summary(A)}${summary(B)}
      </div>
    </div>`

  if (!chartable) return
  // Plotted against WEEK NUMBER within each block, not calendar date — that is what makes two blocks
  // months apart comparable on one axis.
  const weekIdx = (s, p) => _blockWeekIndex(s.b, p.date)
  const maxWk = Math.max(1, ...[A, B].filter(Boolean).flatMap(s => s.pts.map(p => weekIdx(s, p))))
  const labels = Array.from({ length: maxWk }, (_, i) => `wk ${i + 1}`)
  const seriesFor = (s, colour) => {
    if (!s) return null
    // Several sessions can land in one week, so they must be rolled up — using the METRIC'S OWN mode
    // (active[2]), not a hardcoded max. 'mean' metrics (intensity, pace, avg HR, watts) are averages
    // by definition; taking their max would silently plot a different statistic from the one named
    // in the label directly above the chart.
    const byWk = {}
    s.pts.forEach(p => { const v = p[active[0]]; if (usable(v)) (byWk[weekIdx(s, p)] ||= []).push(v) })
    const roll = arr => active[2] === 'mean' ? arr.reduce((a, b) => a + b, 0) / arr.length : Math.max(...arr)
    return { label: s.b.name, data: labels.map((_, i) => byWk[i + 1] ? Math.round(roll(byWk[i + 1]) * 10) / 10 : null), colour, spanGaps: true }
  }
  // Block colours are deliberately NOT from _METRIC_COLORS: that palette is keyed by METRIC, and both
  // lines here are the same metric. Reusing e.g. bestHeight's green to mean "block B" would read as a
  // metric change to anyone who knows the palette.
  const series = [seriesFor(A, '#6366f1'), B ? seriesFor(B, '#94a3b8') : null].filter(Boolean)
  if (B) series[1].dashed = true   // the comparison block is the reference line
  _renderMetricChart('blk-chart', {
    labels, series, height: true, legend: series.length > 1,
    yFormat: v => active[3](_tickNum(v)),
  })
}

async function renderProgressStrength(el) {
  el.innerHTML = '<div class="loading-state">Loading exercise data…</div>'
  const myToken = ++_perfExerciseToken
  const clientId = await _getCurrentClientId()
  if (!clientId) { el.innerHTML = '<div class="empty-state"><p>No data yet.</p></div>'; return }
  const exercises = await _buildExerciseSeries(clientId)
  if (myToken !== _perfExerciseToken) return
  if (!exercises.length) { el.innerHTML = '<div class="empty-state"><p>No sessions logged yet.</p></div>'; return }
  window._trendCache = exercises
  window._trendState = window._trendState || { range: 'All', metricByEx: {} }
  el.innerHTML = `
    <input class="field-input" id="perf-ex-search" placeholder="Search exercises…" style="margin-bottom:12px" autocomplete="off" oninput="_renderPerfExerciseList(this.value)">
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px" id="trend-range-row">
      ${Object.keys(_TREND_RANGES).map(r => `
        <button onclick="_setTrendRange('${r}')" data-range="${r}"
          style="padding:5px 12px;border:none;border-radius:14px;font-size:12px;font-weight:600;cursor:pointer;
                 background:${r===window._trendState.range?'var(--accent)':'var(--surface-2)'};
                 color:${r===window._trendState.range?'#fff':'var(--text-muted)'}">${r}</button>`).join('')}
    </div>
    <div id="perf-ex-list"></div>`
  _renderPerfExerciseList('')
}

async function _buildExerciseSeries(clientId) {
  const { data: exRows } = await db.from('workout_log_exercises')
    // `set_number` added 2026-08-15. A nested column list is an ALLOWLIST, and without it PostgREST
    // returns the sets in NO guaranteed order — fine while only aggregates were computed, wrong now
    // that each session renders its sets in sequence under the chart.
    .select('exercise_name, metric_type, workout_logs!inner(date, client_id), workout_log_sets(set_number, weight_kg, reps_achieved, distance_m, duration_seconds, avg_hr, max_hr, height_cm, side, avg_watts, phase)')
    .eq('workout_logs.client_id', clientId).order('exercise_name')
  const byName = {}
  for (const row of (exRows || [])) {
    const name = row.exercise_name; if (!name) continue
    ;(byName[name] ||= { name, metricType: row.metric_type || 'weight_reps', sessions: [] })
      .sessions.push({ date: row.workout_logs.date, sets: row.workout_log_sets || [] })
  }
  return Object.values(byName)
    .map(ex => { ex.sessions.sort((a, b) => new Date(a.date) - new Date(b.date)); return ex })
    .sort((a, b) => a.name.localeCompare(b.name))
}

function _setTrendRange(r) { window._trendState.range = r; renderProgressStrength(document.getElementById('perf-sub-content')) }
function _setTrendMetric(exName, key) { window._trendState.metricByEx[exName] = key; _renderPerfExerciseList(document.getElementById('perf-ex-search')?.value || '') }

// Per-type chip config: [metricKey, label, aggMode, formatter, lowerBetter?]. Chips with all-zero
// data are dropped. lowerBetter=true (pace) makes the headline "best" a min, not a max.
const _TREND_METRICS = {
  // Order matters: consumers take the FIRST metric that has data, so 'reps' sits last and is reached
  // only when every weight-derived metric is zero — i.e. a bodyweight-only exercise.
  weight_reps: [['topWeight','Top weight','max',v=>fmtWeight(v)], ['e1rm','Est 1RM','max',v=>fmtWeight(Math.round(v))], ['volume','Volume','max',v=>fmtWeight(Math.round(v))], ['intensity','Intensity','mean',v=>`${Math.round(weightToPref(v)*10)/10} ${window._unitPrefs.weight}/rep`], ['reps','Total reps','max',v=>`${Math.round(v)} reps`]],
  cardio: [
    ['totalDistance','Distance','max', v => fmtDistanceM(v)],
    ['totalDuration','Duration','max', v => fmtRestCountdown(v)],
    ['pace','Pace','mean', v => fmtRestCountdown(v)+'/km', true],
    ['avgHr','Avg HR','mean', v => Math.round(v)+' bpm'],
    ['avgWatts','Watts','mean', v => Math.round(v)+' W'],
  ],
  unilateral:    [['topWeight','Top weight','max', v => fmtWeight(v)], ['reps','Total reps','max', v => `${Math.round(v)} reps`]], // chart draws L/R as two lines
  timed_hold:    [['maxDuration','Hold time','max', v => fmtRestCountdown(v)]],
  jump_height:   [['bestHeight','Height','max', v => fmtJumpHeight(v, { spaced: true })]],
  jump_distance: [['bestDistance','Distance','max', v => v.toFixed(2)+' m']],
}
// An interval IS a cardio-family exercise for charting purposes (distance/duration/pace/HR/watts) —
// _metricPointsFor's 'interval' case computes the exact same fields as 'cardio' (aggregated over work
// rounds only, via _countableSets). Aliasing the reference here, instead of a hand-copied parallel
// array, is what keeps the two from drifting apart the way this codebase's duplicated logic has before.
_TREND_METRICS.interval = _TREND_METRICS.cardio
const _TREND_BADGE = { weight_reps:'Strength', cardio:'Cardio', interval:'Cardio', unilateral:'Unilateral', timed_hold:'Timed', jump_height:'Jump', jump_distance:'Jump' }

// B6 — our own metric colour palette (NOT SetGraph's assignment). Mid-tone hexes that read on both
// light + dark themes. Used for the active chip, the trend chart line, and the diary summary tiles so
// each metric is recognisable at a glance.
const _METRIC_COLORS = {
  topWeight:'#6366f1', e1rm:'#8b5cf6', volume:'#0ea5e9', intensity:'#f59e0b',
  totalDistance:'#06b6d4', totalDuration:'#14b8a6', pace:'#0ea5e9', avgHr:'#ef4444', avgWatts:'#f97316',
  maxDuration:'#14b8a6', bestHeight:'#22c55e', bestDistance:'#22c55e',
  sets:'#f59e0b', reps:'#22c55e', vol:'#0ea5e9', exercises:'#8b5cf6' // diary summary tiles
}

// ─── THE house chart (2026-08-14) ───────────────────────────────────────────
// Jake, from live use: "The grid style and data/plot points within this weight section is the style
// that I would like within the performance section … Please include this graph type for all sections
// that require a graph."
//
// Before this there were SEVEN `new Chart(` calls in this file and ZERO shared config — `tension:0.3`
// and `legend:{display:false}` were copy-pasted five times each, across THREE different teardown
// idioms. "One style" enforced by convention drifts back apart; enforced by one function it cannot.
//
// The coach weight chart was the reference (dual axis, rolling average, range pills, index tooltip),
// with two corrections applied here rather than propagated:
//   • It printed raw tick values, so a body-fat axis rendered "20.800000000000004%" — visible in
//     Jake's own screenshot. Rounded centrally so it cannot spread to the other six.
//   • It hardcoded #6366f1 / #6b7280 / rgba(0,0,0,0.05) — light-theme only — while the solo charts
//     correctly read CSS variables. Adopting its structure verbatim would have pushed light-only
//     colours across the whole app. Structure from the coach chart, theming from the solo ones.
let _activeCharts = []

// ONE teardown path, replacing `Chart.getChart(id)?.destroy()`, a `window.__perfCharts` object and two
// module-level arrays. Called when a container is about to be torn down — a detached canvas whose Chart
// was never destroyed keeps its listeners and animation loop alive.
function _destroyManagedCharts() {
  _activeCharts.forEach(c => { try { c.destroy() } catch (e) { /* already gone */ } })
  _activeCharts = []
}

// Ticks are rounded, not printed raw. Chart.js picks fractional tick values and binary floating point
// then renders "20.800000000000004". One decimal is finer than any axis here needs.
const _tickNum = v => Math.round(Number(v) * 10) / 10

// Trailing-window mean, nulls skipped. Was defined inside renderClientWeight only, which is part of why
// the Personal weight chart never had the smoothing line Jake preferred on the coach one.
// Callers convert to the display unit BEFORE averaging — averaging is linear, so avg-of-converted
// equals converted-avg, and it keeps the whole chart in one unit.
// 🔴 Number() on every element is LOAD-BEARING, not defensive. Callers pass the output of
// `weightToPref`, which returns a NUMBER in kg but a STRING in lb (it exits via _stripTrailingZero).
// `reduce((a, b) => a + b, 0)` then CONCATENATES: "0" + "197.3" + "196.4" → NaN for every window past
// the first. In lb the whole averaged series became NaN, `spanGaps` is false and pointRadius is 0, so
// nothing drew at all — while the legend still advertised "7-day avg". Silent, and it removed the one
// feature this change existed to give the Personal chart, for exactly the users being compared.
// This is the SECOND time in two days this exact number-vs-string shape has bitten
// (see the 1RM grid crash, 2026-08-14). Coerce at the boundary; never trust a *ToPref return to be
// arithmetic-safe. Filtering non-finite values also drops '' and NaN rather than poisoning the mean.
const _rollingAvg = (arr, window = 7) => arr.map((_, i) => {
  const slice = arr.slice(Math.max(0, i - window + 1), i + 1)
    .map(v => (v == null ? null : Number(v)))
    .filter(v => v != null && Number.isFinite(v))
  return slice.length ? parseFloat((slice.reduce((a, b) => a + b, 0) / slice.length).toFixed(2)) : null
})

function _chartTheme() {
  const css = getComputedStyle(document.documentElement)
  const pick = (name, fallback) => (css.getPropertyValue(name) || '').trim() || fallback
  return {
    muted: pick('--text-muted', '#9ca3af'),
    accent: pick('--accent', '#6366f1'),
    // Neutral grey at low alpha reads on both themes; the coach chart's rgba(0,0,0,.05) vanished on dark.
    grid: 'rgba(150,150,150,0.14)',
  }
}

// series: [{ label, data, colour, dashed, fill, axis:'y'|'y2', spanGaps, pointRadius }]
// `target` is a canvas id OR the canvas element itself — the per-session and per-exercise trend charts
// render into anonymous canvases inside a freshly-built container, and giving them synthetic ids just to
// satisfy this signature would be ceremony.
function _renderMetricChart(target, { labels, series, yFormat, y2Format, yRange, legend, height, tooltipUnit, stepSize } = {}) {
  const el = typeof target === 'string' ? document.getElementById(target) : target
  if (!el || !Array.isArray(series) || !series.length) return null
  // Resolve by CANVAS, so an instance created by any path — including one this registry lost track of
  // — is still destroyed. This is what the old `window.__perfCharts = {}` reset failed to do.
  Chart.getChart(el)?.destroy()
  _activeCharts = _activeCharts.filter(c => c.canvas !== el)

  const t = _chartTheme()
  const hasRight = series.some(s => s.axis === 'y2')
  const showLegend = legend != null ? legend : series.filter(s => s.label).length > 1
  const fmtY = yFormat || (v => String(_tickNum(v)))
  const fmtY2 = y2Format || (v => _tickNum(v) + '%')

  const chart = new Chart(el.getContext('2d'), {
    type: 'line',
    data: {
      labels: labels || [],
      datasets: series.map(s => {
        const colour = s.colour || t.accent
        return {
          label: s.label || '',
          data: s.data,
          borderColor: colour,
          // Alpha suffix on a hex, matching the palette's existing convention.
          backgroundColor: s.fill ? (colour.length === 7 ? colour + '18' : colour) : 'transparent',
          borderWidth: 2,
          borderDash: s.dashed ? [4, 3] : undefined,
          fill: !!s.fill,
          tension: 0.3,
          pointRadius: s.pointRadius != null ? s.pointRadius : 3,
          pointHoverRadius: 5,
          pointBackgroundColor: colour,
          spanGaps: !!s.spanGaps,
          yAxisID: s.axis === 'y2' ? 'y2' : 'y',
        }
      }),
    },
    options: {
      responsive: true,
      maintainAspectRatio: height ? false : true,
      animation: { duration: 250 },
      // Crosshair-style shared tooltip — the single biggest readability win from the coach chart.
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: showLegend, labels: { font: { size: 11 }, color: t.muted, boxWidth: 20, usePointStyle: true } },
        tooltip: {
          callbacks: {
            label: ctx => {
              const v = ctx.parsed.y
              if (v == null) return null
              const body = ctx.dataset.yAxisID === 'y2' ? fmtY2(v) : fmtY(v)
              return (ctx.dataset.label ? ctx.dataset.label + ': ' : '') + body + (tooltipUnit && ctx.dataset.yAxisID !== 'y2' ? ` ${tooltipUnit}` : '')
            },
          },
        },
      },
      scales: {
        x: { ticks: { color: t.muted, font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 }, grid: { display: false } },
        // On a DUAL-axis chart each axis is tinted to match its own series, so the reader can tell
        // which scale belongs to which line. The coach weight chart did this (indigo left / amber
        // right) and the first cut of this helper flattened both to muted — which is unreadable
        // precisely on the chart that just gained a second axis. Single-axis charts stay muted:
        // there is nothing to disambiguate, and a coloured axis there is just noise.
        // stepSize is opt-in. Both weight charts set it (0.5 kg / 1 lb) because without it a tight
        // auto-range over two close readings makes Chart.js pick sub-0.1 steps, and _tickNum's 1-dp
        // rounding then collapses adjacent ticks into duplicate labels — "88.2, 88.3, 88.3".
        y: { position: 'left', ...(yRange || {}), ticks: { color: hasRight ? (series.find(s => s.axis !== 'y2')?.colour || t.muted) : t.muted, font: { size: 11 }, callback: fmtY, ...(stepSize ? { stepSize } : {}) }, grid: { color: t.grid } },
        ...(hasRight ? { y2: { position: 'right', ticks: { color: series.find(s => s.axis === 'y2')?.colour || t.muted, font: { size: 11 }, callback: fmtY2 }, grid: { drawOnChartArea: false } } } : {}),
      },
    },
  })
  _activeCharts.push(chart)
  return chart
}

// Personal records per exercise — ALL-TIME (not range-filtered; a PR is a lifetime best, Hevy-style).
// Returns [[label, value], …] appropriate to the metric_type. Non-weight types get their records in
// ③ Tasks 2–3; weight_reps/unilateral compute weight/reps records now.
function _exerciseRecords(ex) {
  const mt = ex.metricType
  if (mt === 'cardio' || mt === 'interval') { // interval is cardio-family — see _TREND_METRICS.interval
    const pts = _metricPointsFor(ex).points
    const dist = Math.max(0, ...pts.map(p => p.totalDistance || 0))
    const dur  = Math.max(0, ...pts.map(p => p.totalDuration || 0))
    const paces = pts.map(p => p.pace).filter(v => v > 0)       // lower = faster
    const hrs   = pts.map(p => p.avgHr).filter(v => v > 0)
    const rows = []
    if (dist > 0)      rows.push(['Best distance', fmtDistanceM(dist)])
    if (dur > 0)       rows.push(['Longest time', fmtRestCountdown(dur)])
    if (paces.length)  rows.push(['Best pace', fmtRestCountdown(Math.min(...paces)) + '/km'])
    if (hrs.length)    rows.push(['Avg HR', Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) + ' bpm'])
    return rows
  }
  if (mt === 'unilateral') {
    const pts = _metricPointsFor(ex).points
    const bestL = Math.max(0, ...pts.map(p => p.leftTop || 0))
    const bestR = Math.max(0, ...pts.map(p => p.rightTop || 0))
    const rows = []
    if (bestL > 0) rows.push(['Best left', fmtWeight(bestL, { spaced: true })])
    if (bestR > 0) rows.push(['Best right', fmtWeight(bestR, { spaced: true })])
    if (bestL > 0 && bestR > 0) rows.push(['L/R balance', Math.round(Math.min(bestL, bestR) / Math.max(bestL, bestR) * 100) + '%'])
    return rows
  }
  const flat = _countableSets((ex.sessions || []).flatMap(s => s.sets || []))
  if (mt === 'timed_hold') {
    const best = Math.max(0, ...flat.map(x => parseInt(x.duration_seconds) || 0))
    return best > 0 ? [['Best hold', fmtRestCountdown(best)]] : []
  }
  if (mt === 'jump_height') {
    const best = Math.max(0, ...flat.map(x => parseFloat(x.height_cm) || 0))
    return best > 0 ? [['Best height', fmtJumpHeight(best, { spaced: true })]] : []
  }
  if (mt === 'jump_distance') {
    const best = Math.max(0, ...flat.map(x => parseFloat(x.distance_m) || 0))
    return best > 0 ? [['Best distance', best.toFixed(2) + ' m']] : []
  }
  const num = v => parseFloat(v) || 0
  const allSets = _countableSets((ex.sessions || []).flatMap(s => s.sets || []))
  const heaviest = Math.max(0, ...allSets.map(s => num(s.weight_kg)))
  const best1rm  = Math.max(0, ...allSets.map(s => _estimate1RM(s.weight_kg, s.reps_achieved) || 0))
  let bestSet = null // the single set with the highest weight×reps
  for (const s of allSets) {
    const w = num(s.weight_kg), r = parseInt(s.reps_achieved) || 0
    if (w > 0 && r > 0 && (!bestSet || w * r > bestSet.vol)) bestSet = { w, r, vol: w * r }
  }
  let bestSessVol = 0
  for (const sess of (ex.sessions || [])) {
    const vol = _countableSets(sess.sets).reduce((t, s) => t + num(s.weight_kg) * (parseInt(s.reps_achieved) || 0), 0)
    if (vol > bestSessVol) bestSessVol = vol
  }
  const rows = []
  if (heaviest > 0)    rows.push(['Heaviest weight', fmtWeight(heaviest, { spaced: true })])
  if (best1rm > 0)     rows.push(['Best est. 1RM', fmtWeight(Math.round(best1rm), { spaced: true })])
  if (bestSet)         rows.push(['Best set', `${weightToPref(bestSet.w)} ${window._unitPrefs.weight} × ${bestSet.r}`])
  if (bestSessVol > 0) rows.push(['Best session vol', Math.round(weightToPref(bestSessVol)).toLocaleString() + ' ' + window._unitPrefs.weight])
  return rows
}

// The per-session breakdown under each trend chart. Jake, 2026-08-15: "Bench press shows 95kg on 6th
// July, however none of the tabs show how many sets or reps i did with this weight."
//
// Chronological, matching the chart left-to-right, so a plotted point can be read off against the work
// that produced it — which is the whole request. Capped at the most recent 10: the range pills already
// bound this, but "All" on a staple lift is otherwise an unreadable wall.
//
// escapeHtml is not decoration: _collapsedSetLine concatenates raw DB values (side, reps, converted
// weights) exactly as _fmtSetDetail does, and that formatter's own header calls out this sink shape.
function _sessionSetsBlockHtml(pts) {
  const withSets = (pts || []).filter(p => (p.sets || []).length)
  if (!withSets.length) return ''
  const MAX = 10
  const shown = withSets.slice(-MAX)
  const hidden = withSets.length - shown.length
  return `<div style="margin-top:10px;border-top:1px solid var(--border);padding-top:8px">
    <div style="font-size:var(--text-xs, 10px);font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:6px">Per session</div>
    ${hidden ? `<div style="font-size:var(--text-xs, 10px);color:var(--text-muted);font-style:italic;margin-bottom:4px">${hidden} earlier session${hidden === 1 ? '' : 's'} not shown</div>` : ''}
    ${shown.map(p => `<div style="display:flex;justify-content:space-between;gap:10px;padding:3px 0;font-size:var(--text-md, 12px)">
      <span style="color:var(--text-muted);flex-shrink:0">${new Date(p.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
      <span style="text-align:right;font-weight:600">${escapeHtml(_collapsedSetLine(p.sets))}</span></div>`).join('')}
  </div>`
}

function _recordsBlockHtml(rows) {
  if (!rows.length) return ''
  return `<div style="margin-top:12px;border-top:1px solid var(--border);padding-top:10px">
    <div style="font-size:var(--text-xs, 10px);font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:6px">Personal records</div>
    ${rows.map(([label, val]) => `<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:var(--text-md, 12px)">
      <span style="color:var(--text-muted)">${label}</span><span style="font-weight:700">${escapeHtml(String(val))}</span></div>`).join('')}
  </div>`
}

function _trendCardEmpty(ex) {
  return `<div style="margin-bottom:20px;padding:14px;border-radius:var(--radius-md, 12px);background:var(--surface);border:1px solid var(--border)">
    <div style="font-size:var(--text-lg, 14px);font-weight:700;margin-bottom:4px">${escapeHtml(ex.name)}</div>
    <div style="font-size:var(--text-sm, 11px);color:var(--text-muted)">No sessions in this range.</div>
    ${_recordsBlockHtml(_exerciseRecords(ex))}</div>`
}

// Destroys the previous render's Chart.js instances before rebuilding — fires on every keystroke,
// range change and metric-chip tap, so without this each would leak a full set of chart instances
// bound to canvases the innerHTML rebuild below just detached.
function _renderPerfExerciseList(query) {
  const listEl = document.getElementById('perf-ex-list'); if (!listEl) return
  _destroyManagedCharts()
  const q = (query || '').trim().toLowerCase()
  const cutoffDays = _TREND_RANGES[window._trendState.range]
  const cutoff = cutoffDays === Infinity ? 0 : Date.now() - cutoffDays * 86400000
  const list = (window._trendCache || []).filter(ex => !q || ex.name.toLowerCase().includes(q))
  if (!list.length) { listEl.innerHTML = '<div class="empty-state"><p>No matching exercises.</p></div>'; return }

  // Pass 1 — compute what each card shows (range-filtered points, visible metric chips, active chip).
  const rendered = list.map((ex, i) => {
    const pts = _metricPointsFor(ex).points.filter(p => new Date(p.date).getTime() >= cutoff)
    const metrics = _metricsWithData(_TREND_METRICS[ex.metricType] || _TREND_METRICS.weight_reps, pts)
    if (!metrics.length) return { ex, i, empty: true }
    const stored = window._trendState.metricByEx[ex.name]
    const activeKey = stored && metrics.some(m => m[0] === stored) ? stored : metrics[0][0]
    const active = metrics.find(m => m[0] === activeKey)
    // Whether a LINE can be drawn is decided HERE, in pass 1, not in pass 3. Pass 2 emitted the 90px
    // canvas container unconditionally and pass 3 bailed on `< 2 points` — so a one-session exercise
    // rendered an empty white box with no explanation (Jake's "Barbell Deadlift · 1 session"
    // screenshot). _trendCardEmpty only ever covered the ZERO-session case.
    const chartable = ex.metricType === 'unilateral'
      ? Math.max(_aggregateSeries(pts, 'leftTop', 'max').length, _aggregateSeries(pts, 'rightTop', 'max').length) >= 2
      : _aggregateSeries(pts, activeKey, active[2]).length >= 2
    return { ex, i, pts, metrics, activeKey, active, chartable }
  })

  // Pass 2 — build the HTML (canvases must exist before Chart.js can bind to them).
  listEl.innerHTML = rendered.map(r => {
    if (r.empty) return _trendCardEmpty(r.ex)
    const vals = r.pts.map(p => p[r.activeKey]).filter(v => v > 0)
    const best = vals.length ? (r.active[4] ? Math.min(...vals) : Math.max(...vals)) : 0
    return `
      <div style="margin-bottom:20px;padding:14px;border-radius:var(--radius-md, 12px);background:var(--surface);border:1px solid var(--border)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <span style="font-size:var(--text-lg, 14px);font-weight:700">${escapeHtml(r.ex.name)}</span>
          <span style="font-size:var(--text-xs, 10px);font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted)">${_TREND_BADGE[r.ex.metricType]||'Strength'}</span>
        </div>
        <div style="font-size:var(--text-sm, 11px);color:var(--text-muted);margin-bottom:8px">Best ${r.active[1].toLowerCase()}: ${r.active[3](best)} · ${r.pts.length} session${r.pts.length===1?'':'s'}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
          ${r.metrics.map(([key,label]) => `<button onclick="_setTrendMetric('${escapeAttr(r.ex.name)}','${key}')"
            style="padding:4px 10px;border:none;border-radius:12px;font-size:11px;font-weight:600;cursor:pointer;
                   background:${key===r.activeKey?(_METRIC_COLORS[key]||'var(--accent)'):'var(--surface-2)'};color:${key===r.activeKey?'#fff':'var(--text-muted)'}">${label}</button>`).join('')}
        </div>
        ${r.chartable
          ? `<div style="position:relative;height:90px"><canvas id="ps-chart-${r.i}"></canvas></div>`
          : `<div style="font-size:var(--text-sm, 11px);color:var(--text-muted);font-style:italic;padding:2px 0 6px">One session so far — the graph appears from the second.</div>`}
        ${_sessionSetsBlockHtml(r.pts)}
        ${_recordsBlockHtml(_exerciseRecords(r.ex))}
      </div>`
  }).join('')

  // Pass 3 — draw the charts.
  rendered.forEach(r => {
    // !chartable means pass 2 deliberately rendered no canvas — the session list below carries the
    // detail instead. Skipping here keeps the two passes' decision in ONE place (pass 1's r.chartable)
    // rather than duplicating the >=2 rule in both, which is how they drifted apart originally.
    if (r.empty || !r.chartable) return
    const canvas = document.getElementById(`ps-chart-${r.i}`); if (!canvas) return
    // Unilateral: two lines (left + right) so a strength imbalance is visible.
    if (r.ex.metricType === 'unilateral') {
      const left  = _aggregateSeries(r.pts, 'leftTop', 'max')
      const right = _aggregateSeries(r.pts, 'rightTop', 'max')
      if (Math.max(left.length, right.length) < 2) return
      // MERGED ON THE DATE LABEL, not zipped positionally. _aggregateSeries drops its own null rows,
      // so left and right can have different lengths AND different date sets — a session where only
      // one side was logged shifts every later point of that series by one. Taking labels from the
      // longer array and pairing by index then prints two readings from DIFFERENT sessions under one
      // date. That mis-pairing predates this change but was invisible: the old config had no tooltip.
      // The shared helper adds an index-mode tooltip, which would have started stating it confidently
      // — on the one chart whose entire purpose is comparing the two numbers. Found by pre-push review.
      const byLabel = new Map()
      left.forEach(a => byLabel.set(a.label, { l: a.value, r: null }))
      right.forEach(a => { const e = byLabel.get(a.label); if (e) e.r = a.value; else byLabel.set(a.label, { l: null, r: a.value }) })
      // Chronological order comes from _aggregateSeries; re-establish it across the union.
      const order = [...left.map(a => a.label), ...right.map(a => a.label)]
      const labels = [...new Set(order)].sort((x, y) => order.indexOf(x) - order.indexOf(y))
      // Right stays DASHED and in a second colour — the whole point of this chart is spotting an
      // imbalance at a glance, so the two sides must not read as one thickened line.
      _renderMetricChart(canvas, {
        labels,
        series: [
          { label: 'Left',  data: labels.map(k => byLabel.get(k).l), colour: _METRIC_COLORS.topWeight, spanGaps: true },
          { label: 'Right', data: labels.map(k => byLabel.get(k).r), colour: _METRIC_COLORS.bestHeight, dashed: true, spanGaps: true },
        ],
        height: true,
        legend: true,
        yFormat: v => fmtWeight(_tickNum(v)),
      })
      return
    }
    const agg = _aggregateSeries(r.pts, r.activeKey, r.active[2])
    if (agg.length < 2) return
    // The metric's OWN formatter is preserved and _tickNum is deliberately NOT applied here — a pace
    // axis must render "1:45", and rounding either its input or its output would corrupt that. Each
    // formatter in _TREND_METRICS already produces display-ready text.
    _renderMetricChart(canvas, {
      labels: agg.map(a => a.label),
      series: [{ data: agg.map(a => a.value), colour: _METRIC_COLORS[r.activeKey] || undefined, fill: true }],
      height: true,
      legend: false,
      // _tickNum on the INPUT, not the output: each _TREND_METRICS formatter returns display-ready
      // text ("1:45/km", "87.3kg"), so wrapping the output would corrupt it — but fmtWeight in kg is
      // a bare parseFloat with no rounding, so without this a tick of 87.30000000000001 still rendered
      // raw. Rounding to 1dp is safe for every formatter here, including the seconds-based pace ones.
      yFormat: v => r.active[3](_tickNum(v)),
    })
  })
}

// renderProgressCardio removed 2026-07-19 (B5): cardio now has a proper metric_type trend card in
// the Per-exercise view; the standalone "Cardio bests" section it fed is gone from Personal Bests.

// 2026-07-08 restructure: Personal Bests now also hosts the 1RMs and Cardio bests sections that
// used to be their own separate places (a standalone Cardio tab, a Performance > 1RMs sub-tab) —
// one combined "bests" surface instead of 3. Each section keeps its own existing render function,
// just mounted into a sub-container here instead of being reached independently.
async function renderProgressPBs(el) {
  // MUST destroy before the innerHTML below. This function is entered DIRECTLY from saveClientPB
  // (js/app-clients.js:31), bypassing renderProgress — so its own teardown never ran. Replacing
  // innerHTML detaches the old `pb-chart-N` canvases, and _renderMetricChart's guards then both miss:
  // `Chart.getChart(el)` resolves the NEW canvas (undefined), and the registry filter compares against
  // that new element, so the old entry is kept. Result: every "+ Log PB" leaves N live Chart instances
  // bound to detached canvases, with their listeners and animation loops, and _activeCharts grows
  // without bound. Exactly the leak class this whole change set exists to remove — introduced at the
  // one chart site that did not exist before it. Caught by pre-push review.
  _destroyManagedCharts()
  el.innerHTML = '<div class="loading-state">Loading personal bests…</div>'
  const clientId = await _getCurrentClientId()
  const addPBBtn = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px"><span style="font-size:var(--text-base, 13px);font-weight:600;color:var(--text)">Cardio &amp; benchmarks</span><button class="btn-secondary" style="font-size:var(--text-md, 12px);padding:4px 10px" onclick="showClientPBForm('${clientId}')">+ Log record</button></div>
    <div id="client-pb-form" style="display:none;margin-bottom:16px;padding:14px;border-radius:var(--radius-md, 12px);background:var(--surface);border:1px solid var(--border)">
      ${_pbFormHtml(clientId)}
    </div>`
  // `name`, `category` and `unit` are PLAIN COLUMNS on performance_logs — that is exactly what
  // saveClientPB() writes (app-clients.js). This query used to embed `performance_exercises(...)`,
  // a table that does not exist and has no relationship to performance_logs, so PostgREST rejected
  // the whole query. The error was discarded (`const { data: logs } =` with no error check), `logs`
  // came back undefined, and the page fell through to the "No personal bests logged yet" empty
  // state — meaning EVERY personal best a client logged was saved correctly and then never shown to
  // anyone. Found by the RLS audit on 2026-07-12 (it enumerates the tables the app references, and
  // performance_exercises did not exist), proved red/green with a real logged PB.
  const { data: logs, error: pbErr } = await db.from('performance_logs')
    .select('*')
    .eq('client_id', clientId).order('date', { ascending: false })
  if (pbErr) log.error('renderProgressPBs', 'personal bests fetch failed', pbErr)

  let pbListHtml
  let pbChartPlan = []
  // Strength rows are read-only history now (the form no longer offers the category). They stay
  // VISIBLE deliberately — 22 of Jake's 30 entries are strength and 11 carry notes, and hiding them
  // would be deleting the page by another route. Only new entries are redirected.
  const hasHistoricalStrength = (logs || []).some(l => l.category === 'strength')
  if (!logs?.length) {
    pbListHtml = '<div class="empty-state"><p>No records logged yet. Tap + Log record for a 5k time, a benchmark workout or a body metric.<br><span style="font-size:12px;color:var(--text-muted)">Barbell lifts live on the Personal Bests tab.</span></p></div>'
  } else {
    const byExercise = {}
    for (const l of logs) {
      const name = l.name || 'Unknown'
      if (!byExercise[name]) byExercise[name] = { all: [], category: l.category || '' }
      byExercise[name].all.push(l)
    }
    // See _bestPerfLog — "best" is the true max/min-by-unit, not the most recently logged row. The
    // displayed unit MUST come from `best` itself, never a group-level unit captured from a
    // different (e.g. newest) record — PERF_CATEGORIES lets the same exercise be logged in either
    // unit of a pair (kg/lbs, cm/in...), so a cached group unit can silently mismatch which record
    // `best` actually resolved to. Multi-agent review, 2026-07-24.
    Object.values(byExercise).forEach(ex => { ex.best = _bestPerfLog(ex.all) })
    // Personal Bests had NO chart at all — the single biggest gap against Jake's "include this graph
    // type for all sections that require a graph" (2026-08-14). The coach's Performance tab has had a
    // per-exercise chart since 2026-07-08; this is the same thing, through the same helper.
    //
    // Series is filtered to the BEST record's UNIT. PERF_CATEGORIES lets one exercise be logged in
    // either unit of a pair (kg/lbs, cm/in), and plotting both on one axis would draw a cliff between
    // 100kg and 220lbs that looks like a collapse in performance. Same reasoning as the _bestPerfLog
    // comment above, applied to the plot rather than the headline number.
    pbChartPlan = Object.entries(byExercise).map(([name, { best, all }], i) => {
      const sameUnit = all.filter(l => (l.unit || '') === (best.unit || '') && l.value != null)
      if (sameUnit.length < 2) return null
      const chrono = [...sameUnit].sort((a, b) => new Date(a.date) - new Date(b.date))
      return {
        canvasId: `pb-chart-${i}`,
        unit: best.unit || '',
        labels: chrono.map(l => new Date(l.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })),
        values: chrono.map(l => parseFloat(l.value)),
      }
    }).filter(Boolean)
    const chartByIndex = new Set(pbChartPlan.map(c => c.canvasId))

    pbListHtml = Object.entries(byExercise).map(([name, { best, all, category }], i) => `
      <div style="margin-bottom:12px;padding:14px;border-radius:var(--radius-md, 12px);background:var(--surface);border:1px solid var(--border)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <div style="font-size:var(--text-lg, 14px);font-weight:700">${escapeHtml(name)}</div>
            <div style="font-size:var(--text-xs, 10px);font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-top:2px">${escapeHtml(category || '')}${category === 'strength' ? ' · historical' : ''}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:var(--text-3xl, 20px);font-weight:800;color:var(--accent)">${escapeHtml(String(best.value))} <span style="font-size:var(--text-md, 12px)">${escapeHtml(best.unit || '')}</span></div>
            <div style="font-size:var(--text-sm, 11px);color:var(--text-muted)">${new Date(best.date).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</div>
          </div>
        </div>
        ${all.length > 1 ? `<div style="margin-top:8px;font-size:var(--text-sm, 11px);color:var(--text-muted)">${all.length} entries</div>` : ''}
        ${chartByIndex.has(`pb-chart-${i}`) ? `<div style="position:relative;height:90px;margin-top:10px"><canvas id="pb-chart-${i}"></canvas></div>` : ''}
      </div>`).join('')
  }

  // 1RMs moved OUT of here to its own top-level Progress tab on 2026-08-14 (see renderProgress).
  // It had been appended below this page's own header and PB cards since the 2026-07-08 restructure,
  // which read as a footer rather than a section — the coach's client profile gives 1RMs a full-width
  // tab, and Jake rated that side better. Nothing else mounted into #pb-1rms-section; every 1RM
  // writer reaches it through _refresh1RMs, which now finds it on the new tab instead.
  el.innerHTML = `
    ${addPBBtn}
    ${hasHistoricalStrength ? `<div style="font-size:var(--text-sm, 11px);color:var(--text-muted);font-style:italic;margin-bottom:10px;padding:8px 10px;border-radius:var(--radius-sm, 8px);background:var(--surface-2)">Your older lift records are kept here. New lifts go on the <strong>Personal Bests</strong> tab.</div>` : ''}
    ${pbListHtml}
  `

  // Drawn AFTER innerHTML — the canvases do not exist until the string is mounted.
  pbChartPlan.forEach(c => {
    _renderMetricChart(c.canvasId, {
      labels: c.labels,
      series: [{ data: c.values, colour: _METRIC_COLORS.e1rm, fill: true }],
      height: true,
      legend: false,
      yFormat: v => `${_tickNum(v)}${c.unit ? ' ' + c.unit : ''}`,
    })
  })
}

async function renderSettings(el) {
  el.innerHTML = '<div class="loading-state">Loading…</div>'

  const isCoach = currentProfile?.role === 'coach'

  const [{ data: profile }, { data: branding }] = await Promise.all([
    db.from('profiles').select('full_name, role, created_at').eq('id', currentUser.id).single(),
    isCoach ? db.from('coach_branding').select('business_name, logo_path').eq('coach_id', currentUser.id).maybeSingle() : Promise.resolve({ data: null })
  ])

  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—'

  // Generate signed URL for current logo preview (short-lived, display only)
  let currentLogoUrl = null
  if (branding?.logo_path) {
    const { data: urlData } = await db.storage.from('logos').createSignedUrl(branding.logo_path, 3600)
    currentLogoUrl = urlData?.signedUrl || null
  }

  // Owner-only — same literal-email gate every other admin-only affordance in this app uses
  // (js/app-dashboard.js's sudoAsClient, js/app-clients.js's "View as" button). Onboards a brand-new
  // STANDALONE solo/personal account (2026-08-09) — never a coach_id-linked client, unlike Send invite
  // on a client's own profile. See supabase/functions/invite-solo-user/index.ts; the real authorization
  // check lives there server-side, this is a UI convenience only.
  const soloInviteCard = _isOwnerAccount() ? `
      <!-- Invite a personal user -->
      <div class="card">
        <div class="card-header" style="padding:16px 20px 0">
          <h2 class="section-title">Invite a personal user</h2>
        </div>
        <div class="card-body" style="padding:16px 20px 20px;display:flex;flex-direction:column;gap:14px">
          <p style="font-size:var(--text-base, 13px);color:var(--text-muted);margin:0">Creates a brand-new, standalone solo account — never linked to you as a client. They get a real invite email and set their own name/password.</p>
          <div class="field">
            <label class="field-label">Name</label>
            <input class="field-input" type="text" id="solo-invite-name" placeholder="Their name">
          </div>
          <div class="field">
            <label class="field-label">Email</label>
            <input class="field-input" type="email" id="solo-invite-email" placeholder="their@email.com">
          </div>
          <div>
            <button class="btn-primary" style="font-size:var(--text-lg, 14px)" onclick="inviteSoloUser()">Send invite</button>
            <span id="solo-invite-msg" style="font-size:var(--text-base, 13px);margin-left:12px;color:var(--text-muted)"></span>
          </div>
        </div>
      </div>` : ''

  const brandingCard = isCoach ? `
      <!-- Branding -->
      <div class="card">
        <div class="card-header" style="padding:16px 20px 0">
          <h2 class="section-title">Branding</h2>
        </div>
        <div class="card-body" style="padding:16px 20px 20px;display:flex;flex-direction:column;gap:16px">
          <div class="field">
            <label class="field-label">Business name</label>
            <input class="field-input" type="text" id="branding-business-name" value="${escapeHtml(branding?.business_name)}" placeholder="e.g. West Performance">
          </div>
          <div class="field">
            <label class="field-label">Logo</label>
            ${currentLogoUrl ? `
            <div style="margin-bottom:10px">
              <img id="branding-logo-preview" src="${currentLogoUrl}" alt="Logo" style="height:64px;width:auto;max-width:200px;object-fit:contain;border-radius:var(--radius-sm, 8px);border:1px solid var(--border);padding:8px;background:var(--surface-2)">
            </div>
            <button onclick="removeBrandingLogo()" style="background:none;border:1px solid #ef4444;color:var(--danger, #ef4444);padding:5px 12px;border-radius:var(--legacy-radius-7, 7px);font-size:var(--text-md, 12px);font-weight:600;cursor:pointer;margin-bottom:10px">Remove logo</button>
            ` : `
            <div id="branding-logo-preview" style="height:64px;width:180px;border:2px dashed var(--border);border-radius:var(--radius-sm, 8px);display:flex;align-items:center;justify-content:center;margin-bottom:10px">
              <span style="font-size:var(--text-md, 12px);color:var(--text-muted)">No logo uploaded</span>
            </div>
            `}
            <label style="display:inline-block;cursor:pointer;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-sm, 8px);padding:7px 14px;font-size:var(--text-base, 13px);font-weight:600;color:var(--text)">
              ${currentLogoUrl ? 'Replace logo' : 'Upload logo'}
              <input type="file" id="branding-logo-file" accept="image/jpeg,image/png,image/webp,image/svg+xml" style="display:none" onchange="previewBrandingLogo(this)">
            </label>
            <span style="font-size:var(--text-sm, 11px);color:var(--text-muted);margin-left:8px">JPG, PNG, WebP, SVG</span>
          </div>
          <div>
            <button class="btn-primary" style="font-size:var(--text-lg, 14px)" onclick="saveBrandingSettings()">Save branding</button>
            <span id="branding-msg" style="font-size:var(--text-base, 13px);margin-left:12px;color:var(--text-muted)"></span>
          </div>
        </div>
      </div>` : ''

  el.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Settings</h1>
        <p class="page-subtitle">Manage your account</p>
      </div>
    </div>

    <div style="max-width:560px;display:flex;flex-direction:column;gap:16px">

      <!-- Profile -->
      <div class="card">
        <div class="card-header" style="padding:16px 20px 0">
          <h2 class="section-title">Profile</h2>
        </div>
        <div class="card-body" style="padding:16px 20px 20px;display:flex;flex-direction:column;gap:14px">
          <div class="field">
            <label class="field-label">Full name</label>
            <input class="field-input" type="text" id="settings-name" value="${escapeHtml(profile?.full_name || '')}" placeholder="Your name">
          </div>
          <div class="field">
            <label class="field-label">Email</label>
            <input class="field-input" type="email" value="${escapeHtml(currentUser.email || '')}" disabled style="opacity:.6;cursor:default">
          </div>
          <div>
            <button class="btn-primary" style="font-size:var(--text-lg, 14px)" onclick="saveSettingsProfile()">Save changes</button>
            <span id="settings-profile-msg" style="font-size:var(--text-base, 13px);margin-left:12px;color:var(--text-muted)"></span>
          </div>
        </div>
      </div>

      ${soloInviteCard}

      ${brandingCard}

      <!-- Units -->
      <div class="card">
        <div class="card-header" style="padding:16px 20px 0">
          <h2 class="section-title">Units</h2>
        </div>
        <div class="card-body" style="padding:16px 20px 20px;display:flex;flex-direction:column;gap:14px">
          <div class="field">
            <label class="field-label">Weight</label>
            <select class="field-input" id="settings-unit-weight">
              <option value="kg"${window._unitPrefs.weight==='kg'?' selected':''}>Kilograms (kg)</option>
              <option value="lb"${window._unitPrefs.weight==='lb'?' selected':''}>Pounds (lb)</option>
            </select>
          </div>
          <div class="field">
            <label class="field-label">Jump height</label>
            <select class="field-input" id="settings-unit-jump">
              <option value="cm"${window._unitPrefs.jumpHeight==='cm'?' selected':''}>Centimetres (cm)</option>
              <option value="in"${window._unitPrefs.jumpHeight==='in'?' selected':''}>Inches (in)</option>
            </select>
          </div>
          <div class="field">
            <label class="field-label">Cardio distance</label>
            <select class="field-input" id="settings-unit-distance">
              <option value="km"${window._unitPrefs.cardioDistance==='km'?' selected':''}>Kilometres (km)</option>
              <option value="mi"${window._unitPrefs.cardioDistance==='mi'?' selected':''}>Miles (mi)</option>
            </select>
          </div>
          <div>
            <button class="btn-primary" style="font-size:var(--text-lg, 14px)" onclick="saveSettingsUnits()">Save units</button>
            <span id="settings-units-msg" style="font-size:var(--text-base, 13px);margin-left:12px;color:var(--text-muted)"></span>
          </div>
        </div>
      </div>

      <!-- Password -->
      <div class="card">
        <div class="card-header" style="padding:16px 20px 0">
          <h2 class="section-title">Change password</h2>
        </div>
        <div class="card-body" style="padding:16px 20px 20px;display:flex;flex-direction:column;gap:14px">
          <div class="field">
            <label class="field-label">New password</label>
            <input class="field-input" type="password" id="settings-pw" placeholder="Min. 6 characters" minlength="6">
          </div>
          <div class="field">
            <label class="field-label">Confirm password</label>
            <input class="field-input" type="password" id="settings-pw2" placeholder="Repeat password">
          </div>
          <div>
            <button class="btn-primary" style="font-size:var(--text-lg, 14px)" onclick="saveSettingsPassword()">Update password</button>
            <span id="settings-pw-msg" style="font-size:var(--text-base, 13px);margin-left:12px;color:var(--text-muted)"></span>
          </div>
        </div>
      </div>

      <!-- Account info -->
      <div class="card">
        <div class="card-header" style="padding:16px 20px 0">
          <h2 class="section-title">Account</h2>
        </div>
        <div class="card-body" style="padding:12px 20px 16px">
          <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border)">
            <span style="font-size:var(--text-base, 13px);color:var(--text-muted)">Role</span>
            <span style="font-size:var(--text-base, 13px);font-weight:600;text-transform:capitalize">${profile?.role || '—'}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:7px 0">
            <span style="font-size:var(--text-base, 13px);color:var(--text-muted)">Member since</span>
            <span style="font-size:var(--text-base, 13px);font-weight:600">${memberSince}</span>
          </div>
        </div>
      </div>

      <!-- Sign out -->
      <div class="card">
        <div class="card-body" style="padding:16px 20px">
          <button id="settings-sign-out-btn" onclick="db.auth.signOut().then(()=>location.reload())" style="background:none;border:1px solid #ef4444;color:var(--danger, #ef4444);padding:8px 18px;border-radius:var(--radius-sm, 8px);font-size:var(--text-lg, 14px);font-weight:600;cursor:pointer">Sign out</button>
        </div>
      </div>

      <!-- Data & privacy -->
      <div class="card">
        <div class="card-header" style="padding:16px 20px 0">
          <h2 class="section-title">Data &amp; privacy</h2>
        </div>
        <div class="card-body" style="padding:12px 20px 20px;display:flex;flex-direction:column;gap:10px">
          <p style="font-size:var(--text-base, 13px);color:var(--text-muted);margin:0 0 4px">Your data is stored in the EU under UK GDPR. You can download a copy or permanently delete your account at any time.</p>
          <button onclick="downloadMyData()" style="background:none;border:1px solid var(--border);color:var(--text);padding:8px 18px;border-radius:var(--radius-sm, 8px);font-size:var(--text-lg, 14px);font-weight:600;cursor:pointer;text-align:left">Download my data</button>
          <button onclick="deleteAccount()" style="background:none;border:1px solid #ef4444;color:var(--danger, #ef4444);padding:8px 18px;border-radius:var(--radius-sm, 8px);font-size:var(--text-lg, 14px);font-weight:600;cursor:pointer;text-align:left">Delete account</button>
          <a href="${PRIVACY_POLICY_URL}" target="_blank" rel="noopener" id="settings-privacy-link" style="font-size:var(--text-base, 13px);color:var(--accent, #6366f1);font-weight:600;text-decoration:none">Read the Privacy Policy →</a>
          <span id="settings-data-msg" style="font-size:var(--text-base, 13px);color:var(--text-muted)"></span>
        </div>
      </div>

    </div>
  `
}

async function saveSettingsProfile() {
  const name = document.getElementById('settings-name')?.value.trim()
  const msg  = document.getElementById('settings-profile-msg')
  if (!name) { if (msg) msg.textContent = 'Name cannot be empty.'; return }

  const { error } = await db.from('profiles').update({ full_name: name }).eq('id', currentUser.id)
  if (error) {
    log.error('saveSettingsProfile', 'update failed', error)
    if (msg) msg.textContent = 'Save failed. Try again.'
    return
  }
  if (currentProfile) currentProfile.full_name = name
  document.getElementById('user-name').textContent = name
  if (msg) { msg.style.color = '#22c55e'; msg.textContent = 'Saved ✓'; setTimeout(() => { if (msg) msg.textContent = '' }, 3000) }
}

// Onboards a brand-new, standalone solo account via the invite-solo-user Edge Function — mirrors
// sendClientInvite's shape as closely as this call's differences allow (no clientId, no follow-up
// invited_at stamp, no navigate-away — there's no client profile to jump to for a solo invite).
// The real authorization check is server-side in the Edge Function; the Settings-card gate that only
// renders this for the owner account (_isOwnerAccount) is a UI convenience, not the security boundary.
// Module-level so it survives across separate inviteSoloUser() calls — without this, sending a second
// invite while the first one's 3s success/error revert is still pending lets the stale timeout stomp
// the second invite's in-progress "Sending…" label back to "Send invite" (found by multi-agent-review;
// not a double-submit, the disabled flag is untouched, but a misleading mid-flight visual state).
let _soloInviteRevertTimer = null

async function inviteSoloUser() {
  const nameEl  = document.getElementById('solo-invite-name')
  const emailEl = document.getElementById('solo-invite-email')
  const msg     = document.getElementById('solo-invite-msg')
  const name    = nameEl?.value.trim()
  const email   = emailEl?.value.trim()
  if (!name || !email) { if (msg) msg.textContent = 'Name and email are both required.'; return }
  if (!confirm(`Send a personal-account invite to ${email}?`)) return
  if (msg) msg.textContent = ''

  log.info('inviteSoloUser', 'sending solo invite')
  const btn = event.target
  clearTimeout(_soloInviteRevertTimer)
  btn.disabled = true
  btn.textContent = 'Sending…'

  const { data: { session } } = await db.auth.getSession()

  const res = await fetch(`https://avilxuiacmtgeoxxhfhc.supabase.co/functions/v1/invite-solo-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`
    },
    body: JSON.stringify({ email, name })
  })

  const json = await res.json()

  if (!res.ok) {
    log.error('inviteSoloUser', 'edge function returned error', { status: res.status, error: json.error })
    btn.disabled = false
    btn.textContent = '✗ ' + (json.error || 'Failed to send')
    btn.style.color = 'var(--danger)'
    _soloInviteRevertTimer = setTimeout(() => { btn.textContent = 'Send invite'; btn.style.color = '' }, 3000)
    return
  }

  log.ok('inviteSoloUser', 'solo invite sent via edge function', { userId: json.userId })
  if (nameEl) nameEl.value = ''
  if (emailEl) emailEl.value = ''
  btn.textContent = '✓ Invite sent'
  btn.style.color = 'var(--success, #16a34a)'
  btn.disabled = false
  _soloInviteRevertTimer = setTimeout(() => { btn.textContent = 'Send invite'; btn.style.color = '' }, 3000)
}

async function saveSettingsUnits() {
  const weight     = document.getElementById('settings-unit-weight')?.value
  const jumpHeight = document.getElementById('settings-unit-jump')?.value
  const cardioDistance = document.getElementById('settings-unit-distance')?.value
  const msg = document.getElementById('settings-units-msg')

  // DB-write core shared with the quick-prefs popover (app-core.js, 2026-08-08) — this function is
  // now just "read these 3 selects, call the shared helper, show my own inline message".
  const error = await _saveUnitPrefs(weight, jumpHeight, cardioDistance)
  if (error) {
    log.error('saveSettingsUnits', 'update failed', error)
    if (msg) { msg.style.color = '#ef4444'; msg.textContent = 'Save failed. Try again.' }
    return
  }
  if (msg) { msg.style.color = '#22c55e'; msg.textContent = 'Saved ✓'; setTimeout(() => { if (msg) msg.textContent = '' }, 3000) }
}

async function saveSettingsPassword() {
  const pw  = document.getElementById('settings-pw')?.value
  const pw2 = document.getElementById('settings-pw2')?.value
  const msg = document.getElementById('settings-pw-msg')
  if (!pw || pw.length < 6) { if (msg) msg.textContent = 'Min. 6 characters.'; return }
  if (pw !== pw2) { if (msg) msg.textContent = 'Passwords do not match.'; return }

  const { error } = await db.auth.updateUser({ password: pw })
  if (error) {
    log.error('saveSettingsPassword', 'update failed', error)
    if (msg) msg.textContent = 'Update failed. Try again.'
    return
  }
  if (msg) { msg.style.color = '#22c55e'; msg.textContent = 'Password updated ✓'; setTimeout(() => { if (msg) { msg.textContent = ''; document.getElementById('settings-pw').value = ''; document.getElementById('settings-pw2').value = '' } }, 3000) }
}

function previewBrandingLogo(input) {
  const file = input.files?.[0]
  if (!file) return
  window._brandingFile = file
  const url = URL.createObjectURL(file)
  const existing = document.getElementById('branding-logo-preview')
  if (existing?.tagName === 'IMG') {
    existing.src = url
  } else if (existing) {
    const img = document.createElement('img')
    img.id = 'branding-logo-preview'
    img.src = url
    img.alt = 'Logo'
    img.style.cssText = 'height:64px;width:auto;max-width:200px;object-fit:contain;border-radius:8px;border:1px solid var(--border);padding:8px;background:var(--surface-2);margin-bottom:10px'
    existing.replaceWith(img)
  }
}

async function saveBrandingSettings() {
  const msg = document.getElementById('branding-msg')
  const businessName = document.getElementById('branding-business-name')?.value.trim() || null
  let logoPath = window._branding?.logoPath || null

  if (window._brandingFile) {
    const mime = window._brandingFile.type
    const ext  = mime === 'image/svg+xml' ? 'svg' : mime.split('/')[1] || 'jpg'
    const path = `${currentUser.id}/logo.${ext}`
    const { error: uploadErr } = await db.storage.from('logos').upload(path, window._brandingFile, { upsert: true, contentType: mime })
    if (uploadErr) {
      if (msg) { msg.style.color = '#ef4444'; msg.textContent = 'Logo upload failed.' }
      log.error('saveBrandingSettings', 'upload failed', uploadErr)
      return
    }
    logoPath = path
    window._brandingFile = null
  }

  const { error } = await db.from('coach_branding').upsert(
    { coach_id: currentUser.id, business_name: businessName, logo_path: logoPath, updated_at: new Date().toISOString() },
    { onConflict: 'coach_id' }
  )
  if (error) {
    if (msg) { msg.style.color = '#ef4444'; msg.textContent = 'Save failed.' }
    log.error('saveBrandingSettings', 'upsert failed', error)
    return
  }

  await _loadBranding()
  if (msg) { msg.style.color = '#22c55e'; msg.textContent = 'Saved ✓'; setTimeout(() => { if (msg) msg.textContent = '' }, 3000) }
}

async function removeBrandingLogo() {
  const path = window._branding?.logoPath
  if (!path) return
  const { error: delErr } = await db.storage.from('logos').remove([path])
  if (delErr) { log.error('removeBrandingLogo', 'delete failed', delErr); return }
  const { error: updateErr } = await db.from('coach_branding').update({ logo_path: null, updated_at: new Date().toISOString() }).eq('coach_id', currentUser.id)
  if (updateErr) { log.error('removeBrandingLogo', 'db update failed', updateErr); return }
  window._branding.logoPath = null
  window._branding.logoUrl  = null
  _applyBrandingToSidebar()
  renderSettings(document.getElementById('main-content'))
}

// Builds the GDPR export bundle. Extracted from downloadMyData so it can be asserted directly in a
// test — the download itself is a Blob + anchor click, which proves nothing about the contents.
async function _buildMyDataBundle() {
  {
    let bundle = { exportedAt: new Date().toISOString(), profile: null }

    // consented_at / consent_policy_version added 2026-08-24: WHEN a person consented and to WHICH
    // version of the policy is their personal data and is squarely Art. 15 material, so it belongs in
    // the subject-access bundle. This select is an explicit ALLOWLIST — a new column does not appear
    // here on its own, which is the documented feedback-embed-select-column-allowlist class. It was
    // missed on the first pass of this very commit and caught by the pre-push review.
    const { data: profile } = await db.from('profiles').select('full_name, role, created_at, consented_at, consent_policy_version').eq('id', currentUser.id).single()
    bundle.profile = profile

    // GDPR Art. 15/20 covers every piece of personal data held on this person - which VIEW they happen
    // to be in when they tap the button is irrelevant to the obligation. This used to be an if/else:
    // a coach got coaching assets ONLY, so a coach who also trains here (i.e. holds a clients row -
    // Jake's own account) could never export their own weights, workouts, PBs, goals or 1RMs by any
    // route. Both halves now run independently. Found by the 2026-07-23 full-file review.
    // No role gate: ownership is `coach_id = my uid` whether the user is in PT or Personal view, and a
    // plain client simply owns none of these (three empty arrays). Gating on role made the export's
    // CONTENTS depend on a UI toggle, which is the same class of bug as the if/else this replaced.
    {
      const [{ data: clients }, { data: templates }, { data: programs }] = await Promise.all([
        db.from('clients').select('full_name, email, created_at').eq('coach_id', currentUser.id),
        db.from('workout_templates').select('name, created_at').eq('coach_id', currentUser.id),
        db.from('programs').select('name, created_at').eq('coach_id', currentUser.id),
      ])
      bundle.clients = clients; bundle.workoutTemplates = templates; bundle.programs = programs
    }
    {
      // No .single(): clients.user_id is UNIQUE today so this is one row, but an export should not be
      // brittle about a row count. .single() throws on anything but exactly one, and the old code
      // DISCARDED that error - so any surprise silently produced an export containing no health data
      // while still reporting success.
      const { data: myClientRows, error: cErr } = await db.from('clients').select('id').eq('user_id', currentUser.id)
      if (cErr) throw cErr
      const cids = (myClientRows || []).map(r => r.id)
      if (cids.length) {
        const [{ data: weights }, { data: workouts }, { data: perf }, { data: goals }, { data: events }, { data: oneRMs }, { data: checkIns }] = await Promise.all([
          db.from('weight_logs').select('date, weight_kg, body_fat_pct, resting_hr, notes').in('client_id', cids).order('date'),
          db.from('workout_logs').select('name, date, notes, workout_log_exercises(exercise_name, exercise_type, metric_type, order_index, client_notes, workout_log_sets(set_number, side, weight_kg, reps_achieved, duration_seconds, distance_m, height_cm, effort_type, effort_value, avg_hr, max_hr, avg_watts, phase))').in('client_id', cids).order('date'),
          db.from('performance_logs').select('name, category, value, unit, date').in('client_id', cids).order('date'),
          db.from('goals').select('title, target_date, status').in('client_id', cids),
          db.from('events').select('title, date, type').in('client_id', cids).order('date'),
          db.from('client_1rms').select('exercise_name, one_rm_kg, recorded_at').in('client_id', cids).order('recorded_at'),
          db.from('client_check_ins').select('*').in('client_id', cids).order('created_at'),
        ])
        bundle.weightLogs = weights; bundle.workoutLogs = workouts
        bundle.performanceLogs = perf; bundle.goals = goals; bundle.events = events
        bundle.oneRepMaxes = oneRMs; bundle.checkIns = checkIns
      }
    }
    return bundle
  }
}

async function downloadMyData() {
  const msg = document.getElementById('settings-data-msg')
  if (msg) msg.textContent = 'Preparing download…'

  try {
    const bundle = await _buildMyDataBundle()
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `coachapp-data-${new Date().toISOString().split('T')[0]}.json`
    a.click(); URL.revokeObjectURL(url)
    if (msg) { msg.textContent = 'Download started.'; setTimeout(() => { if (msg) msg.textContent = '' }, 3000) }
  } catch (err) {
    log.error('downloadMyData', 'export failed', err)
    if (msg) { msg.style.color = '#ef4444'; msg.textContent = 'Export failed. Please try again.' }
  }
}

function deleteAccount() {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.style.cssText = 'align-items:flex-start;padding-top:60px'
  overlay.innerHTML = `
    <div class="modal" style="max-width:400px">
      <h2 style="font-size:var(--text-2xl, 18px);font-weight:700;margin:0 0 8px;color:var(--danger)">Delete account</h2>
      <p style="font-size:var(--text-lg, 14px);color:var(--text-muted);margin:0 0 16px;line-height:1.5">This will permanently delete your account and all your data. This cannot be undone.</p>
      <p style="font-size:var(--text-lg, 14px);color:var(--text);margin:0 0 8px;font-weight:600">Type <strong>DELETE</strong> to confirm:</p>
      <input id="delete-confirm-input" type="text" class="field-input" placeholder="DELETE" autocomplete="off" style="margin-bottom:16px;font-size:var(--text-xl, 16px)">
      <p id="delete-confirm-error" style="font-size:var(--text-base, 13px);color:var(--danger);margin:0 0 12px;display:none">You must type DELETE exactly to proceed.</p>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        <button id="delete-confirm-btn" class="btn-primary" style="background:var(--danger)" onclick="deleteAccountConfirmed(this.closest('.modal-overlay'))">Delete my account</button>
      </div>
    </div>`
  mountModal(overlay)
  setTimeout(() => document.getElementById('delete-confirm-input')?.focus(), 50)
}

async function deleteAccountConfirmed(overlay) {
  const input = document.getElementById('delete-confirm-input')
  const errEl = document.getElementById('delete-confirm-error')
  if (input?.value !== 'DELETE') {
    if (errEl) errEl.style.display = 'block'
    input?.focus()
    return
  }

  const btn = document.getElementById('delete-confirm-btn')
  if (btn) { btn.disabled = true; btn.textContent = 'Deleting…' }

  const { error } = await db.rpc('delete_current_user')
  if (error) {
    log.error('deleteAccount', 'deletion failed', error)
    if (btn) { btn.disabled = false; btn.textContent = 'Delete my account' }
    if (errEl) { errEl.style.display = 'block'; errEl.textContent = 'Deletion failed. Please contact support.' }
    return
  }
  overlay?.remove()
  await db.auth.signOut()
  location.reload()
}
