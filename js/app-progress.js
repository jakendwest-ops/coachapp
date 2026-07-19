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

let _saveBig5Pending = false

async function saveBig5OneRMs(clientId) {
  // Guards against a double-tap: _resolveExerciseIdForSave does a non-atomic select-then-insert,
  // so two concurrent calls for the same exercise name can both miss the not-yet-inserted row
  // and create duplicate library entries.
  if (_saveBig5Pending) return
  _saveBig5Pending = true
  const errEl = document.getElementById('big5-error')
  const today = new Date().toISOString().split('T')[0]
  const named = BIG_5_EXERCISES
    .map(name => ({ name, weight: parseFloat(document.getElementById(`big5-${name.replace(/\s+/g,'-')}`)?.value) }))
    .filter(r => r.weight && r.weight > 0)
  if (!named.length) { errEl.textContent = 'Enter at least one value'; _saveBig5Pending = false; return }
  const coachId = await _effectiveCoachIdForClient(clientId)
  const rows = await Promise.all(named.map(async r => ({
    client_id: clientId, exercise_id: await _resolveExerciseIdForSave(r.name, coachId),
    exercise_name: r.name, one_rm_kg: r.weight, recorded_at: today
  })))
  const { error } = await dbq('saveBig5OneRMs', db.from('client_1rms').insert(rows))
  _saveBig5Pending = false
  if (error) { errEl.textContent = 'Save failed — try again'; return }
  // Refresh whichever container is actually showing the 1RMs list — the client/solo Personal
  // Bests page (pb-1rms-section, since the 2026-07-08 restructure moved 1RMs there from a
  // dedicated Performance sub-tab) or the PT-facing client-profile 1RMs tab (tab-content).
  const pbEl = document.getElementById('pb-1rms-section')
  if (pbEl) renderClient1RMs(clientId, pbEl)
  else renderClient1RMs(clientId, document.getElementById('tab-content'))
}

async function renderClient1RMs(clientId, el) {
  el.innerHTML = '<div class="loading-state">Loading 1RMs…</div>'
  const { data: rows } = await db.from('client_1rms').select('*').eq('client_id', clientId).order('recorded_at', { ascending: false })

  // Group by exercise name, newest first within each group
  const byEx = {}
  ;(rows || []).forEach(r => { if (!byEx[r.exercise_name]) byEx[r.exercise_name] = []; byEx[r.exercise_name].push(r) })

  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h3 style="margin:0;font-size:16px;font-weight:700">1 Rep Maxes</h3>
      <button class="btn-primary" style="font-size:13px;padding:8px 14px" onclick="showAdd1RMModal('${clientId}')">+ Add 1RM</button>
    </div>
    ${!Object.keys(byEx).length ? `
      <div style="border:1px solid var(--border);border-radius:12px;padding:18px;background:var(--surface)">
        <div style="font-size:14px;font-weight:700;margin-bottom:2px">Quick-start your 1RMs</div>
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:14px">The Big 5 — fill in what you know, leave the rest blank</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${BIG_5_EXERCISES.map(name => `
            <div style="display:flex;align-items:center;gap:8px">
              <span style="flex:1;font-size:13px;font-weight:600">${name}</span>
              <input class="field-input" id="big5-${name.replace(/\s+/g,'-')}" type="number" step="0.5" inputmode="decimal" placeholder="kg" style="width:80px">
            </div>`).join('')}
        </div>
        <p class="modal-error" id="big5-error" style="margin-top:10px"></p>
        <button class="btn-primary" style="width:100%;margin-top:8px" onclick="saveBig5OneRMs('${clientId}')">Save all</button>
        <div style="text-align:center;margin-top:8px"><button onclick="showAdd1RMModal('${clientId}')" style="background:none;border:none;font-size:12px;color:var(--text-muted);text-decoration:underline;cursor:pointer">+ Add a different exercise</button></div>
      </div>` : Object.entries(byEx).map(([exName, entries]) => {
        const latest = entries[0]
        const history = entries.slice(1)
        return `
        <div style="border:1px solid var(--border);border-radius:12px;margin-bottom:12px;overflow:hidden;background:var(--surface)">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px">
            <div>
              <div style="font-size:15px;font-weight:700">${escapeHtml(exName)}</div>
              <div style="font-size:12px;color:var(--text-muted);margin-top:2px">Recorded ${new Date(latest.recorded_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</div>
            </div>
            <div style="display:flex;align-items:center;gap:10px">
              <span style="font-size:22px;font-weight:800;color:var(--accent)">${parseFloat(latest.one_rm_kg).toFixed(1)} kg</span>
              <button onclick="showAdd1RMModal('${clientId}','${escapeAttr(exName)}'${latest.exercise_id ? `,'${latest.exercise_id}'` : ''})" style="padding:5px 10px;border:1px solid var(--border);border-radius:7px;background:transparent;font-size:12px;font-weight:600;cursor:pointer;color:var(--text-muted)">+ Update</button>
              <button onclick="delete1RM('${latest.id}','${clientId}')" style="padding:5px 10px;border:1px solid #ef4444;border-radius:7px;background:transparent;font-size:12px;font-weight:600;cursor:pointer;color:#ef4444">Delete</button>
            </div>
          </div>
          ${history.length ? `
          <div style="border-top:1px solid var(--border);padding:10px 16px;background:var(--surface-2)">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:6px">History</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px">
              ${history.map(h => `<span style="font-size:12px;color:var(--text-muted)">${parseFloat(h.one_rm_kg).toFixed(1)} kg <span style="font-size:10px">${new Date(h.recorded_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</span></span>`).join('<span style="color:var(--border)">·</span>')}
            </div>
          </div>` : ''}
        </div>`
      }).join('')}
  `
}

function showAdd1RMModal(clientId, prefillExercise = '', prefillExerciseId = null) {
  if (prefillExercise) {
    _showOneRMDetailModal(clientId, { id: prefillExerciseId || null, name: prefillExercise })
  } else {
    _effectiveCoachIdForClient(clientId).then(coachId => {
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
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface-2)">
          <span style="font-size:15px;font-weight:700">${escapeHtml(picked.name)}</span>
          <button type="button" class="btn-secondary" style="font-size:12px;padding:5px 12px;flex-shrink:0" onclick="_reopenExercisePickerFor1RM('${clientId}'${existingId ? `,'${existingId}'` : ',null'})">Change</button>
        </div>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:14px">
        <button id="orm-mode-direct" onclick="_setAdd1RMMode('direct')" class="btn-primary" style="flex:1;font-size:12px;padding:8px">I know my 1RM</button>
        <button id="orm-mode-epley" onclick="_setAdd1RMMode('epley')" class="btn-secondary" style="flex:1;font-size:12px;padding:8px">Estimate from a set</button>
      </div>
      <div id="orm-direct-fields">
        <div class="field">
          <label class="field-label">1RM (kg)</label>
          <input class="field-input" id="1rm-weight" type="number" step="0.5" inputmode="decimal" placeholder="e.g. 120" value="${weight}">
        </div>
      </div>
      <div id="orm-epley-fields" style="display:none">
        <div class="field">
          <label class="field-label">Weight (kg)</label>
          <input class="field-input" id="orm-est-weight" type="number" step="0.5" inputmode="decimal" oninput="_updateAdd1RMEpleyPreview()">
        </div>
        <div class="field">
          <label class="field-label">Reps</label>
          <input class="field-input" id="orm-est-reps" type="number" inputmode="numeric" oninput="_updateAdd1RMEpleyPreview()">
        </div>
        <div id="orm-epley-result" style="display:none;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px;text-align:center;margin-bottom:14px">
          <div style="font-size:11px;color:#15803d">Estimated 1RM (Epley)</div>
          <div id="orm-epley-value" style="font-size:20px;font-weight:800;color:#15803d"></div>
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
  const w = parseFloat(document.getElementById('orm-est-weight')?.value)
  const r = parseInt(document.getElementById('orm-est-reps')?.value)
  const resultEl = document.getElementById('orm-epley-result')
  const valueEl = document.getElementById('orm-epley-value')
  if (w && r) {
    const est = w * (1 + r / 30)
    valueEl.textContent = est.toFixed(1) + ' kg'
    resultEl.style.display = 'block'
  } else {
    resultEl.style.display = 'none'
  }
}

function showEdit1RMModal(id, clientId, exerciseName, exerciseId, weight, date) {
  _showOneRMDetailModal(clientId, { id: exerciseId || null, name: exerciseName }, { existingId: id, weight, date })
}

async function save1RM(clientId, existingId = null) {
  const picked     = window._oneRMDetailPicked
  const epleyMode  = document.getElementById('orm-epley-fields') && document.getElementById('orm-epley-fields').style.display === 'block'
  let weight
  if (epleyMode) {
    const w = parseFloat(document.getElementById('orm-est-weight')?.value)
    const r = parseInt(document.getElementById('orm-est-reps')?.value)
    weight = (w && r) ? w * (1 + r / 30) : null
  } else {
    weight = parseFloat(document.getElementById('1rm-weight')?.value)
  }
  const date     = document.getElementById('1rm-date')?.value
  const errEl    = document.getElementById('1rm-error')
  if (!picked?.name) { errEl.textContent = 'Exercise name is required'; return }
  if (!weight || weight <= 0) { errEl.textContent = 'Enter a valid weight'; return }
  const row = { client_id: clientId, exercise_id: picked.id || null, exercise_name: picked.name, one_rm_kg: weight, recorded_at: date }
  let error
  if (existingId) {
    ;({ error } = await dbq('save1RM:update', db.from('client_1rms').update(row).eq('id', existingId)))
  } else {
    ;({ error } = await dbq('save1RM:insert', db.from('client_1rms').insert(row)))
  }
  if (error) { errEl.textContent = 'Save failed — try again'; return }
  document.getElementById('modal-1rm').remove()
  // Refresh whichever container is actually showing the 1RMs list — the client/solo Personal
  // Bests page (pb-1rms-section, since the 2026-07-08 restructure moved 1RMs there from a
  // dedicated Performance sub-tab) or the PT-facing client-profile 1RMs tab (tab-content).
  const pbEl = document.getElementById('pb-1rms-section')
  if (pbEl) renderClient1RMs(clientId, pbEl)
  else renderClient1RMs(clientId, document.getElementById('tab-content'))
}

async function delete1RM(id, clientId) {
  if (!confirm('Delete this 1RM?')) return
  await dbq('delete1RM', db.from('client_1rms').delete().eq('id', id))
  // Refresh whichever container is actually showing the 1RMs list — the client/solo Personal
  // Bests page (pb-1rms-section, since the 2026-07-08 restructure moved 1RMs there from a
  // dedicated Performance sub-tab) or the PT-facing client-profile 1RMs tab (tab-content).
  const pbEl = document.getElementById('pb-1rms-section')
  if (pbEl) renderClient1RMs(clientId, pbEl)
  else renderClient1RMs(clientId, document.getElementById('tab-content'))
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
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:18px;margin-bottom:24px">
        <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:14px">Log a PB / performance record</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
          <div>
            <label style="font-size:11px;color:var(--text-muted);font-weight:600;display:block;margin-bottom:4px">Category</label>
            <select id="pl-category" class="field-input" onchange="updatePerfUnits()">
              ${PERF_CATEGORIES.map(c => `<option value="${c.id}">${c.label}</option>`).join('')}
            </select>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text-muted);font-weight:600;display:block;margin-bottom:4px">Date</label>
            <input id="pl-date" type="date" class="field-input" value="${new Date().toISOString().split('T')[0]}">
          </div>
        </div>
        <div style="margin-bottom:10px">
          <label style="font-size:11px;color:var(--text-muted);font-weight:600;display:block;margin-bottom:4px">Name</label>
          <input id="pl-name" type="text" class="field-input" placeholder="${PERF_CATEGORIES[0].placeholder}">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
          <div>
            <label style="font-size:11px;color:var(--text-muted);font-weight:600;display:block;margin-bottom:4px">Value</label>
            <input id="pl-value" type="number" step="0.01" class="field-input" placeholder="e.g. 120">
          </div>
          <div>
            <label style="font-size:11px;color:var(--text-muted);font-weight:600;display:block;margin-bottom:4px">Unit</label>
            <select id="pl-unit" class="field-input">
              ${PERF_CATEGORIES[0].units.map(u => `<option value="${u}">${u}</option>`).join('')}
            </select>
          </div>
        </div>
        <div style="margin-bottom:12px">
          <label style="font-size:11px;color:var(--text-muted);font-weight:600;display:block;margin-bottom:4px">Notes <span style="font-weight:400">(optional)</span></label>
          <input id="pl-notes" type="text" class="field-input" placeholder="e.g. Competition day, fresh, with belt">
        </div>
        <p id="perf-error" style="color:#ef4444;font-size:12px;margin:4px 0 0"></p>
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
            <span style="font-size:13px;font-weight:700;color:var(--text)">${cat.label}</span>
            <span style="font-size:11px;color:var(--text-muted)">${catLogs.length} record${catLogs.length !== 1 ? 's' : ''}</span>
          </div>

          ${Object.entries(byName).map(([name, records]) => {
            const best = records[0]
            const slug = name.replace(/[^a-z0-9]/gi,'_') + '_' + cat.id
            const chartData = [...records].reverse() // oldest→newest for chart
            return `
            <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;margin-bottom:10px;overflow:hidden">

              <!-- Summary row — click to expand -->
              <div onclick="togglePerfHistory('${slug}')"
                style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;cursor:pointer">
                <div style="display:flex;align-items:center;gap:10px">
                  <div>
                    <div style="font-size:13px;font-weight:600">${name}</div>
                    <div style="font-size:11.5px;color:var(--text-muted);margin-top:1px">${records.length} entr${records.length !== 1 ? 'ies' : 'y'}</div>
                  </div>
                </div>
                <div style="display:flex;align-items:center;gap:10px">
                  <span style="font-size:15px;font-weight:700;color:${colour}">${best.value} ${best.unit}</span>
                  <span style="font-size:10px;font-weight:700;background:gold;color:#78350f;padding:2px 7px;border-radius:4px">PB</span>
                  <span id="perf-chevron-${slug}" style="color:var(--text-muted);font-size:12px;transition:transform 0.2s">▼</span>
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
                      <th style="padding:8px 14px;text-align:left;font-size:11px;color:var(--text-muted);font-weight:600">Date</th>
                      <th style="padding:8px 14px;text-align:right;font-size:11px;color:var(--text-muted);font-weight:600">Value</th>
                      <th style="padding:8px 14px;text-align:left;font-size:11px;color:var(--text-muted);font-weight:600">Notes</th>
                      <th style="padding:8px 14px;width:36px"></th>
                    </tr>
                  </thead>
                  <tbody>
                    ${records.map((r, i) => `
                    <tr style="border-top:${i > 0 ? '1px solid var(--border)' : 'none'}">
                      <td style="padding:9px 14px;font-size:12.5px;color:var(--text-muted)">${r.date}</td>
                      <td style="padding:9px 14px;text-align:right;font-size:13px;font-weight:${i === 0 ? '700' : '500'};color:${i === 0 ? colour : 'var(--text)'}">
                        ${r.value} ${r.unit}
                        ${i === 0 ? `<span style="font-size:9px;font-weight:700;background:gold;color:#78350f;padding:1px 5px;border-radius:3px;margin-left:4px">PB</span>` : ''}
                      </td>
                      <td style="padding:9px 14px;font-size:12px;color:var(--text-muted)">${r.notes || '—'}</td>
                      <td style="padding:9px 14px;text-align:right">
                        <button onclick="deletePerfLog('${r.id}','${clientId}')"
                          style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:14px;padding:2px 5px">×</button>
                      </td>
                    </tr>`).join('')}
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
  window.__perfCharts    = {}
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
    if (window.__perfCharts[slug]) window.__perfCharts[slug].destroy()
    window.__perfCharts[slug] = new Chart(canvas, {
      type: 'line',
      data: {
        labels: d.labels,
        datasets: [{
          data: d.values,
          borderColor: d.colour,
          backgroundColor: d.colour + '22',
          borderWidth: 2,
          pointRadius: 3,
          tension: 0.3,
          fill: true
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { font: { size: 10 } }, grid: { display: false } },
          y: { ticks: { font: { size: 10 } } }
        }
      }
    })
  }
}

function updatePerfUnits() {
  const cat = document.getElementById('pl-category')?.value
  const unitSel = document.getElementById('pl-unit')
  const nameSel = document.getElementById('pl-name')
  const catDef = PERF_CATEGORIES.find(c => c.id === cat)
  if (!catDef || !unitSel) return
  unitSel.innerHTML = catDef.units.map(u => `<option value="${u}">${u}</option>`).join('')
  if (nameSel) nameSel.placeholder = catDef.placeholder
}

async function savePerformanceLog(clientId) {
  const category = document.getElementById('pl-category')?.value
  const date     = document.getElementById('pl-date')?.value
  const name     = document.getElementById('pl-name')?.value?.trim()
  const value    = document.getElementById('pl-value')?.value
  const unit     = document.getElementById('pl-unit')?.value
  const notes    = document.getElementById('pl-notes')?.value?.trim()

  if (!category || !date || !name || !value || !unit) { showToast('Please fill in all required fields.', 'warn', 3000); return }

  log.info('savePerformanceLog', 'inserting performance record', { clientId, category, name, value, unit })
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
  log.ok('savePerformanceLog', 'record saved', { clientId, name, value, unit })
  renderClientPerformance(clientId, document.getElementById('tab-content'))
}

async function deletePerfLog(id, clientId) {
  if (!confirm('Delete this record?')) return
  log.info('deletePerfLog', 'deleting performance record', { id })
  const { error } = await db.from('performance_logs').delete().eq('id', id)
  if (error) { log.error('deletePerfLog', 'delete failed', error); return }
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

  const fmt = kg => `${parseFloat(kg).toFixed(1)} kg`
  const latest = logs[0]
  const oldest = logs[logs.length - 1]
  const change = logs.length >= 2 ? (parseFloat(latest.weight_kg) - parseFloat(oldest.weight_kg)).toFixed(1) : null
  const changeColour = change === null ? 'var(--text-muted)' : change > 0 ? '#ef4444' : change < 0 ? '#22c55e' : 'var(--text-muted)'

  el.innerHTML = `
    <div style="padding:20px 0">

      <!-- Log entry form -->
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:18px;margin-bottom:20px">
        <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:14px">Log weight</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:10px">
          <div>
            <label style="font-size:11px;color:var(--text-muted);font-weight:600;display:block;margin-bottom:4px">Date</label>
            <input id="wl-date" type="date" class="field-input" value="${new Date().toISOString().split('T')[0]}">
          </div>
          <div>
            <label style="font-size:11px;color:var(--text-muted);font-weight:600;display:block;margin-bottom:4px">Weight (kg)</label>
            <input id="wl-weight" type="number" step="0.1" class="field-input" placeholder="e.g. 82.5">
          </div>
          <div>
            <label style="font-size:11px;color:var(--text-muted);font-weight:600;display:block;margin-bottom:4px">Body fat % <span style="font-weight:400">(optional)</span></label>
            <input id="wl-bf" type="number" step="0.1" class="field-input" placeholder="e.g. 18.5">
          </div>
        </div>
        <div style="margin-bottom:12px">
          <label style="font-size:11px;color:var(--text-muted);font-weight:600;display:block;margin-bottom:4px">Notes <span style="font-weight:400">(optional)</span></label>
          <input id="wl-notes" type="text" class="field-input" placeholder="e.g. morning, fasted">
        </div>
        <p id="wl-error" style="color:#ef4444;font-size:12px;margin:4px 0 0"></p>
        <button onclick="saveWeightLog('${clientId}')" class="btn-primary" style="width:100%">Save entry</button>
      </div>

      <!-- Weight goals — sets the chart's Y-axis range below -->
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:18px;margin-bottom:20px">
        <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:4px">Weight goals</div>
        <div style="font-size:11.5px;color:var(--text-muted);margin-bottom:14px">Used to set the chart's range below</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
          <div>
            <label style="font-size:11px;color:var(--text-muted);font-weight:600;display:block;margin-bottom:4px">Starting weight (kg)</label>
            <input id="wg-starting" type="number" step="0.1" class="field-input" placeholder="e.g. 90" value="${startingWeightKg ?? ''}">
          </div>
          <div>
            <label style="font-size:11px;color:var(--text-muted);font-weight:600;display:block;margin-bottom:4px">Goal weight (kg)</label>
            <input id="wg-goal" type="number" step="0.1" class="field-input" placeholder="e.g. 82" value="${goalWeightKg ?? ''}">
          </div>
        </div>
        <p id="wg-error" style="color:#ef4444;font-size:12px;margin:4px 0 0"></p>
        <button onclick="saveWeightGoals('${clientId}')" class="btn-secondary" style="width:100%">Save goals</button>
      </div>

      <!-- Stats row -->
      ${logs.length > 0 ? `
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px">
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px;text-align:center">
          <div style="font-size:11px;color:var(--text-muted);font-weight:600;margin-bottom:4px">CURRENT</div>
          <div style="font-size:20px;font-weight:700;color:var(--text)">${fmt(latest.weight_kg)}</div>
          <div style="font-size:11px;color:var(--text-muted)">${latest.date}</div>
        </div>
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px;text-align:center">
          <div style="font-size:11px;color:var(--text-muted);font-weight:600;margin-bottom:4px">CHANGE</div>
          <div style="font-size:20px;font-weight:700;color:${changeColour}">${change !== null ? (change > 0 ? '+' : '') + change + ' kg' : '—'}</div>
          <div style="font-size:11px;color:var(--text-muted)">${logs.length >= 2 ? oldest.date + ' → now' : 'Need 2+ entries'}</div>
        </div>
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px;text-align:center">
          <div style="font-size:11px;color:var(--text-muted);font-weight:600;margin-bottom:4px">ENTRIES</div>
          <div style="font-size:20px;font-weight:700;color:var(--text)">${logs.length}</div>
          <div style="font-size:11px;color:var(--text-muted)">logged</div>
        </div>
      </div>

      <!-- Chart -->
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:18px;margin-bottom:20px">
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
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden">
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:var(--surface2)">
              <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em">Date</th>
              <th style="padding:10px 14px;text-align:right;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em">Weight</th>
              <th style="padding:10px 14px;text-align:right;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em">Body fat</th>
              <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em">Notes</th>
              <th style="padding:10px 14px;width:40px"></th>
            </tr>
          </thead>
          <tbody>
            ${logs.map((l, i) => `
            <tr style="border-top:1px solid var(--border)${i === 0 ? ';background:rgba(99,102,241,0.03)' : ''}">
              <td style="padding:10px 14px;font-size:13px;color:var(--text);font-weight:${i === 0 ? '600' : '400'}">${l.date}</td>
              <td style="padding:10px 14px;font-size:13px;color:var(--text);font-weight:${i === 0 ? '700' : '500'};text-align:right">${fmt(l.weight_kg)}</td>
              <td style="padding:10px 14px;font-size:13px;color:var(--text-muted);text-align:right">${l.body_fat_pct != null ? l.body_fat_pct + '%' : '—'}</td>
              <td style="padding:10px 14px;font-size:13px;color:var(--text-muted)">${l.notes || '—'}</td>
              <td style="padding:10px 14px;text-align:right">
                <button onclick="deleteWeightLog('${l.id}','${clientId}')" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:15px;padding:2px 6px;border-radius:4px" title="Delete">×</button>
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

    const rollingAvg = (arr, window = 7) => arr.map((_, i) => {
      const slice = arr.slice(Math.max(0, i - window + 1), i + 1).filter(v => v != null)
      return slice.length ? parseFloat((slice.reduce((a, b) => a + b, 0) / slice.length).toFixed(2)) : null
    })

    window._weightAllLogs = chronological

    const buildChart = (range) => {
      const now = new Date()
      const cutoff = range === 'All' ? null : new Date(now.getFullYear(), now.getMonth() - parseInt(range), now.getDate())
      const filtered = cutoff ? chronological.filter(l => new Date(l.date + 'T00:00:00') >= cutoff) : chronological
      if (filtered.length < 2) return

      const weights = filtered.map(l => parseFloat(l.weight_kg))
      const hasBf = filtered.some(l => l.body_fat_pct != null)
      const avg = rollingAvg(weights)

      const datasets = [
        {
          label: 'Weight (kg)',
          data: weights,
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99,102,241,0.07)',
          fill: true, tension: 0.3, pointRadius: 3, pointHoverRadius: 5, yAxisID: 'y'
        },
        {
          label: '7-day avg',
          data: avg,
          borderColor: '#6366f1',
          borderWidth: 2,
          borderDash: [4, 3],
          backgroundColor: 'transparent',
          fill: false, tension: 0.3, pointRadius: 0, pointHoverRadius: 4, yAxisID: 'y'
        }
      ]
      if (hasBf) datasets.push({
        label: 'Body fat %',
        data: filtered.map(l => l.body_fat_pct != null ? parseFloat(l.body_fat_pct) : null),
        borderColor: '#f59e0b', backgroundColor: 'transparent',
        fill: false, tension: 0.3, pointRadius: 3, pointHoverRadius: 5, spanGaps: true, yAxisID: 'y2'
      })

      const existing = Chart.getChart('weight-chart')
      if (existing) existing.destroy()

      // Y-axis range blends whichever of goal/starting weight are set with the actual logged data —
      // previously this only activated when BOTH fields were set, so entering just one (the common
      // case) silently had zero visible effect. Math.min/max (not "goal is always below starting") so
      // a weight-gain goal doesn't invert the axis.
      const anchors = [goalWeightKg, startingWeightKg, ...weights].filter(v => v != null)
      const yRange = (goalWeightKg != null || startingWeightKg != null)
        ? { min: Math.floor(Math.min(...anchors) * 2) / 2, max: Math.ceil((Math.max(...anchors) + 1) * 2) / 2 }
        : {}

      new Chart(document.getElementById('weight-chart'), {
        type: 'line',
        data: { labels: filtered.map(l => fmtLabel(l.date)), datasets },
        options: {
          responsive: true,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: true, labels: { font: { size: 11 }, color: '#6b7280', boxWidth: 20 } },
            tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + ctx.parsed.y + (ctx.dataset.yAxisID === 'y2' ? '%' : ' kg') } }
          },
          scales: {
            x: { ticks: { color: '#9ca3af', font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 }, grid: { display: false } },
            y: { position: 'left', ...yRange, ticks: { color: '#6366f1', font: { size: 11 }, stepSize: 0.5, callback: v => v + ' kg' }, grid: { color: 'rgba(0,0,0,0.05)' } },
            ...(hasBf ? { y2: { position: 'right', ticks: { color: '#f59e0b', font: { size: 11 }, callback: v => v + '%' }, grid: { drawOnChartArea: false } } } : {})
          }
        }
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
  const { error: stampErr } = await db.from('clients').update({ invited_at: new Date().toISOString() }).eq('id', clientId)
  if (stampErr) log.error('sendClientInvite', 'failed to stamp invited_at', stampErr)

  btn.textContent = '✓ Invite sent'
  btn.style.color = 'var(--success, #16a34a)'
  setTimeout(() => openClient(clientId), 1200)
}

async function saveWeightLog(clientId) {
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
    weight_kg:    parseFloat(weight),
    body_fat_pct: bf ? parseFloat(bf) : null,
    notes:        notes || null
  })

  if (error) { log.error('saveWeightLog', 'insert failed', error); document.getElementById('wl-error') && (document.getElementById('wl-error').textContent = error.message); return }
  log.ok('saveWeightLog', 'weight entry saved', { clientId, date })
  showToast('Weight logged ✓', 'success', 2000)
  renderClientWeight(clientId, document.getElementById('tab-content'))
}

async function saveWeightGoals(clientId) {
  const startingRaw = document.getElementById('wg-starting')?.value
  const goalRaw      = document.getElementById('wg-goal')?.value
  const errEl = document.getElementById('wg-error')

  log.info('saveWeightGoals', 'updating weight goals', { clientId })
  const { error } = await db.from('clients').update({
    starting_weight_kg: startingRaw ? parseFloat(startingRaw) : null,
    goal_weight_kg:      goalRaw ? parseFloat(goalRaw) : null
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
  log.info('deleteWeightLog', 'deleting weight entry', { id })
  const { error } = await db.from('weight_logs').delete().eq('id', id)
  if (error) { log.error('deleteWeightLog', 'delete failed', error); return }
  log.ok('deleteWeightLog', 'entry deleted', { id })
  renderClientWeight(clientId, document.getElementById('tab-content'))
}

// ─── INVITE ACCEPTANCE ────────────────────────────────────────────────────────

function showInviteForm() {
  document.getElementById('auth-screen').style.display = 'flex'
  document.getElementById('app-shell').style.display   = 'none'
  document.getElementById('login-form').style.display  = 'none'
  document.getElementById('signup-form').style.display = 'none'
  document.getElementById('invite-form').style.display = 'block'
}

document.getElementById('invite-form').addEventListener('submit', async e => {
  e.preventDefault()
  const btn     = document.getElementById('invite-submit')
  const errorEl = document.getElementById('invite-error')
  const name    = document.getElementById('invite-name').value.trim()
  const password = document.getElementById('invite-password').value

  btn.disabled = true
  btn.textContent = 'Activating…'
  errorEl.textContent = ''

  // Supabase JS v2 auto-processes the invite hash on init and establishes the session.
  // No manual setSession needed — call updateUser directly.
  log.info('inviteForm', 'submitting invite acceptance')
  const { error } = await db.auth.updateUser({
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

  log.ok('inviteForm', 'account activated successfully')
  // Clear the hash so the invite token isn't reused
  history.replaceState(null, '', window.location.pathname)
  showApp()
})

// ─── BOOT ─────────────────────────────────────────────────────────────────────

// Handle invite links immediately — don't wait for auth event
if (_initialHash.includes('type=invite')) {
  try { showInviteForm() } catch(e) { log.error('boot', 'showInviteForm failed', e) }
}

let _appLoaded = false
db.auth.onAuthStateChange((event, session) => {
  log.info('auth', `state change: ${event}`, { userId: session?.user?.id ?? null })
  currentUser = session?.user ?? null

  if (event === 'PASSWORD_RECOVERY') return
  if (_initialHash.includes('type=invite') && event !== 'USER_UPDATED') return

  if (currentUser) {
    // Only bootstrap once — SIGNED_IN fires on every token refresh, not just genuine logins
    if (!_appLoaded) {
      _appLoaded = true
      showApp()
    }
  } else {
    _appLoaded = false
    showAuth()
  }
})

// ─── SETTINGS ─────────────────────────────────────────────────────────────────

async function renderProgress(el) {
  el.innerHTML = '<div class="loading-state">Loading…</div>'

  // 2026-07-08 restructure: "Cardio" folded into Personal Bests (alongside 1RMs) instead of its
  // own top-level tab — see renderProgressPBs.
  const tabs = ['Body Weight', 'Personal Bests', 'Performance']
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
  if (activeTab === 'Personal Bests') await renderProgressPBs(document.getElementById('progress-tab-content'))
  if (activeTab === 'Performance')    await renderPerformance(document.getElementById('progress-tab-content'))
}

async function renderPerformance(el) {
  const clientId = await _getCurrentClientId()
  if (!clientId) { el.innerHTML = '<div class="empty-state"><p>No data yet.</p></div>'; return }

  // 2026-07-08 restructure: was ['1RMs', 'Progressions'] — 1RMs moved into Personal Bests
  // (renderProgressPBs), and "Progressions" (endless flat list) split into a searchable
  // per-exercise view and a new per-session comparison view.
  // Per exercise is the progression tool and now the default; "Recent sessions" is the diary.
  // Migrate any stored legacy tab value to the current pair.
  let subTab = window._perfTab || 'Per exercise'
  if (['1RMs', 'Progressions', 'Per session'].includes(subTab)) window._perfTab = subTab = subTab === 'Per session' ? 'Recent sessions' : 'Per exercise'

  el.innerHTML = `
    <div style="display:flex;gap:6px;margin-bottom:16px">
      ${['Per exercise', 'Recent sessions'].map(t => `
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
  if (subTab === 'Recent sessions') {
    await renderProgressPerSession(clientId, subEl)
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
    if (x.side) return `${x.side[0].toUpperCase()} ${num(x.weight_kg) || 'BW'}×${x.reps_achieved || 0}`
    if (x.height_cm) return `${num(x.height_cm)} cm`
    if (x.duration_seconds && x.weight_kg == null) return fmtRestCountdown(parseInt(x.duration_seconds))
    if (x.weight_kg != null && x.reps_achieved != null) return `${num(x.weight_kg)}×${x.reps_achieved}`
    if (x.reps_achieved != null) return `${x.reps_achieved} rep`
    if (x.distance_m) return `${num(x.distance_m)} m`
    return ''
  }).filter(Boolean).join(', ')
}

// One exercise-occurrence's metrics for the diary: a `main` value (top weight / cardio distance-or-time)
// and a `sec` value (volume / cardio time), each with a raw number + display + delta-number formatter,
// plus the set-details line and strength totals used for the per-workout summary.
function _diaryExMetrics(ex) {
  const sets = ex.workout_log_sets || []
  const num = v => parseFloat(v) || 0
  const mt = ex.metric_type || (ex.exercise_type === 'cardio' ? 'cardio' : 'weight_reps')
  const setLine = _setDetailsLine(sets)
  if (mt === 'cardio') {
    const dist = sets.reduce((s, x) => s + num(x.distance_m), 0)
    const dur  = sets.reduce((s, x) => s + (parseInt(x.duration_seconds) || 0), 0)
    const useDist = dist > 0
    return { mt, isCardio: true, setLine, sets: sets.length, reps: 0, volume: 0,
      main: { raw: useDist ? dist : dur, fmt: useDist ? (dist / 1000).toFixed(1) + ' km' : fmtRestCountdown(dur),
              fmtNum: useDist ? (v => (v / 1000).toFixed(1) + 'km') : (v => fmtRestCountdown(v)) },
      sec:  useDist && dur > 0 ? { label: 'Time', raw: dur, fmt: fmtRestCountdown(dur), fmtNum: v => fmtRestCountdown(v) } : null }
  }
  const reps   = sets.reduce((s, x) => s + (parseInt(x.reps_achieved) || 0), 0)
  const volume = sets.reduce((s, x) => s + num(x.weight_kg) * (parseInt(x.reps_achieved) || 0), 0)
  const top    = Math.max(0, ...sets.map(x => num(x.weight_kg)))
  return { mt, isCardio: false, setLine, sets: sets.length, reps, volume,
    main: { raw: top, fmt: top + ' kg', fmtNum: v => v + 'kg' },
    sec:  { label: 'Volume', raw: volume, fmt: Math.round(volume).toLocaleString() + ' kg', fmtNum: v => Math.round(v).toLocaleString() + 'kg' } }
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
  _perfSessionCharts.forEach(c => c.destroy())
  _perfSessionCharts = []
  const { data: sessions } = await db.from('workout_logs')
    .select('id, name, date, workout_log_exercises(exercise_name, exercise_type, metric_type, workout_log_sets(weight_kg, reps_achieved, distance_m, duration_seconds, height_cm, side, avg_hr))')
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
    const tiles = [['Sets', totals.sets], ['Reps', totals.reps], ['Volume', Math.round(totals.vol).toLocaleString() + 'kg'], ['Exercises', exs.length]]
    return `
    <div style="border:1px solid var(--border);border-radius:12px;margin-bottom:10px;overflow:hidden">
      <button onclick="_togglePerfSession(${i})" style="width:100%;padding:12px 14px;background:var(--surface-2);border:none;cursor:pointer;text-align:left">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <span style="font-size:13px;font-weight:700">${escapeHtml(s.name || 'Session')}</span>
          <span style="font-size:12px;color:var(--text-muted)">${new Date(s.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
        </div>
        <div style="display:flex;gap:6px">
          ${tiles.map(([l, v]) => `<div style="flex:1;text-align:center;background:var(--surface);border-radius:8px;padding:6px 4px">
            <div style="font-size:13px;font-weight:800;color:var(--accent)">${v}</div>
            <div style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted)">${l}</div></div>`).join('')}
        </div>
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
          <span style="font-size:13px;font-weight:600">${escapeHtml(ex.exercise_name)}</span>
          <span style="font-size:13px;font-weight:700;white-space:nowrap">${m.main.fmt} ${mainDelta}</span>
        </div>
        ${m.setLine ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px">${m.setLine}</div>` : ''}
        ${m.sec ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px">${m.sec.label} ${m.sec.fmt} ${secDelta}</div>` : ''}
        <div id="perf-sess-${i}-ex-${ei}-chart" style="display:none;position:relative;height:80px;margin-top:8px"></div>
      </div>`
  }).join('')
}

let _perfSessionCharts = []
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
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
  const muted  = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim()
  _perfSessionCharts.push(new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels: hist.map(h => new Date(h.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })),
            datasets: [{ data: hist.map(h => h.m.main.raw), borderColor: accent, borderWidth: 2, pointBackgroundColor: accent, pointRadius: 3, fill: false, tension: 0.3 }] },
    options: { responsive: true, maintainAspectRatio: false, animation: { duration: 200 },
      plugins: { legend: { display: false } },
      scales: { x: { grid: { display: false }, ticks: { color: muted, font: { size: 8 }, maxRotation: 0 } },
                y: { grid: { color: 'rgba(150,150,150,0.08)' }, ticks: { color: muted, font: { size: 8 } } } } }
  }))
}

async function renderProgressWeight(el) {
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
  const addWeightBtn = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px"><span style="font-size:13px;font-weight:600;color:var(--text)">Body weight log</span><button class="btn-secondary" style="font-size:12px;padding:4px 10px" onclick="showClientWeightForm('${clientId}')">+ Log weight</button></div>
    <div id="client-weight-form" style="display:none;margin-bottom:16px;padding:14px;border-radius:12px;background:var(--surface);border:1px solid var(--border)">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
        <div><label class="form-label">Date</label><input type="date" id="cwf-date" class="form-input" value="${new Date().toISOString().split('T')[0]}"></div>
        <div><label class="form-label">Weight (kg)</label><input type="number" id="cwf-weight" class="form-input" placeholder="e.g. 89.5" step="0.1" min="20" max="300"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
        <div><label class="form-label">Body fat % <span style="color:var(--text-muted)">(optional)</span></label><input type="number" id="cwf-bf" class="form-input" placeholder="e.g. 19.5" step="0.1" min="1" max="60"></div>
        <div><label class="form-label">Resting HR (bpm) <span style="color:var(--text-muted)">(optional)</span></label><input type="number" inputmode="numeric" id="cwf-resting-hr" class="form-input" placeholder="e.g. 58" step="1" min="20" max="250"></div>
      </div>
      <div style="margin-bottom:8px">
        <div><label class="form-label">Notes <span style="color:var(--text-muted)">(optional)</span></label><input type="text" id="cwf-notes" class="form-input" placeholder="Any notes…"></div>
      </div>
      <p id="cwf-error" style="color:#ef4444;font-size:12px;margin:0 0 6px"></p>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" style="font-size:13px;padding:6px 14px" onclick="saveClientWeight('${clientId}')">Save</button>
        <button class="btn-secondary" style="font-size:13px;padding:6px 14px" onclick="document.getElementById('client-weight-form').style.display='none'">Cancel</button>
      </div>
    </div>`
  const goalsCard = `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:18px;margin-bottom:16px">
      <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:4px">Weight goals</div>
      <div style="font-size:11.5px;color:var(--text-muted);margin-bottom:14px">Used to set the chart's range below</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
        <div>
          <label style="font-size:11px;color:var(--text-muted);font-weight:600;display:block;margin-bottom:4px">Starting weight (kg)</label>
          <input id="wg-starting" type="number" step="0.1" class="field-input" placeholder="e.g. 90" value="${startingWeightKg ?? ''}">
        </div>
        <div>
          <label style="font-size:11px;color:var(--text-muted);font-weight:600;display:block;margin-bottom:4px">Goal weight (kg)</label>
          <input id="wg-goal" type="number" step="0.1" class="field-input" placeholder="e.g. 82" value="${goalWeightKg ?? ''}">
        </div>
      </div>
      <p id="wg-error" style="color:#ef4444;font-size:12px;margin:4px 0 0"></p>
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
      ${[['Starting', effectiveStarting + ' kg'], ['Current', latest.weight_kg + ' kg'], ['Change', sign + change + ' kg']].map(([l,v])=>`
        <div style="flex:1;padding:12px;border-radius:12px;background:var(--surface);text-align:center">
          <div style="font-size:18px;font-weight:800;color:var(--accent)">${v}</div>
          <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-top:2px">${l}</div>
        </div>`).join('')}
    </div>
    <div style="position:relative;height:200px;margin-bottom:16px"><canvas id="pw-chart" style="width:100%;height:100%"></canvas></div>
    <div style="border-radius:12px;overflow:hidden;border:1px solid var(--border)">
      ${logs.slice().reverse().slice(0,10).map(l=>`
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid var(--border)">
          <span style="font-size:13px;color:var(--text-muted)">${new Date(l.date).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</span>
          <span style="font-size:14px;font-weight:700">${l.weight_kg} kg${l.body_fat_pct ? ' · '+l.body_fat_pct+'% BF' : ''}</span>
        </div>`).join('')}
    </div>
    ${(() => { const hr = logs.filter(l => l.resting_hr != null); if (hr.length < 2) return ''
      return `<div style="margin-top:20px;margin-bottom:8px;font-size:13px;font-weight:600;color:var(--text)">Resting heart rate</div>
        <div style="position:relative;height:160px"><canvas id="resting-hr-chart" style="width:100%;height:100%"></canvas></div>` })()}
  `
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
  const muted  = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim()
  // Y-axis range blends whichever of goal/starting weight are set with the actual logged data —
  // previously this only activated when BOTH fields were set, so entering just one (the common
  // case) silently had zero visible effect. Math.min/max (not "goal is always below starting") so
  // a weight-gain goal doesn't invert the axis.
  const loggedWeights = logs.map(l => l.weight_kg)
  const anchors = [goalWeightKg, startingWeightKg, ...loggedWeights].filter(v => v != null)
  const yRange = (goalWeightKg != null || startingWeightKg != null)
    ? { min: Math.floor(Math.min(...anchors) * 2) / 2, max: Math.ceil((Math.max(...anchors) + 1) * 2) / 2 }
    : {}
  new Chart(document.getElementById('pw-chart').getContext('2d'), {
    type: 'line',
    data: { labels: logs.map(l => new Date(l.date).toLocaleDateString('en-GB',{day:'numeric',month:'short'})),
            datasets: [{ data: logs.map(l => l.weight_kg), borderColor: accent, borderWidth: 2,
              pointBackgroundColor: accent, pointRadius: 3, fill: false, tension: 0.3 }] },
    options: { responsive: true, maintainAspectRatio: false, animation: { duration: 300 },
      plugins: { legend: { display: false } },
      scales: { x: { grid: { display: false }, ticks: { color: muted, font: { size: 9 }, maxRotation: 0 } },
                y: { ...yRange, grid: { color: 'rgba(150,150,150,0.08)' }, ticks: { color: muted, font: { size: 9 }, stepSize: 0.5, callback: v => v + 'kg' } } } }
  })
  const hrLogs = logs.filter(l => l.resting_hr != null)
  if (hrLogs.length >= 2 && document.getElementById('resting-hr-chart')) {
    new Chart(document.getElementById('resting-hr-chart').getContext('2d'), {
      type: 'line',
      data: { labels: hrLogs.map(l => new Date(l.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })),
              datasets: [{ data: hrLogs.map(l => l.resting_hr), borderColor: accent, borderWidth: 2, pointBackgroundColor: accent, pointRadius: 3, fill: false, tension: 0.3 }] },
      options: { responsive: true, maintainAspectRatio: false, animation: { duration: 300 },
        plugins: { legend: { display: false } },
        scales: { x: { grid: { display: false }, ticks: { color: muted, font: { size: 9 }, maxRotation: 0 } },
                  y: { grid: { color: 'rgba(150,150,150,0.08)' }, ticks: { color: muted, font: { size: 9 }, callback: v => v + ' bpm' } } } }
    })
  }
}

// ── ③ metric_type-aware progress trends ─────────────────────────────────────────────────────────
// Pure helpers (unit-tested). A logged exercise's metric_type is denormalized onto
// workout_log_exercises (①); exercise_id is nullable, so series group by exercise_name, never a join.
const _TREND_RANGES = { '1M': 30, '3M': 90, '6M': 180, '1Y': 365, 'All': Infinity }

function _epley1RM(weightKg, reps) {
  const w = parseFloat(weightKg) || 0, r = parseInt(reps) || 0
  return w > 0 && r > 0 ? w * (1 + r / 30) : 0
}

// One point per session, with only the keys relevant to the metric_type populated.
function _metricPointsFor(ex) {
  const points = (ex.sessions || []).map(sess => {
    const sets = sess.sets || []
    const num = (v) => parseFloat(v) || 0
    const p = { date: sess.date }
    switch (ex.metricType) {
      case 'cardio': {
        p.totalDistance = sets.reduce((s, x) => s + num(x.distance_m), 0)          // metres
        p.totalDuration = sets.reduce((s, x) => s + (parseInt(x.duration_seconds) || 0), 0)
        p.pace = p.totalDistance > 0 ? p.totalDuration / (p.totalDistance / 1000) : 0 // sec/km
        const hrs = sets.map(x => parseInt(x.avg_hr)).filter(Boolean)
        p.avgHr = hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : 0
        break
      }
      case 'unilateral': {
        const side = (sd) => sets.filter(x => x.side === sd)
        p.leftTop  = Math.max(0, ...side('left').map(x => num(x.weight_kg)))
        p.rightTop = Math.max(0, ...side('right').map(x => num(x.weight_kg)))
        p.topWeight = Math.max(p.leftTop, p.rightTop)
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
        p.e1rm      = Math.max(0, ...sets.map(x => _epley1RM(x.weight_kg, x.reps_achieved)))
        p.volume    = sets.reduce((s, x) => s + num(x.weight_kg) * (parseInt(x.reps_achieved) || 0), 0)
        const totalReps = sets.reduce((s, x) => s + (parseInt(x.reps_achieved) || 0), 0)
        p.intensity = totalReps > 0 ? p.volume / totalReps : 0 // weighted avg weight per rep
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
    .select('exercise_name, metric_type, workout_logs!inner(date, client_id), workout_log_sets(weight_kg, reps_achieved, distance_m, duration_seconds, avg_hr, max_hr, height_cm, side)')
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
  weight_reps: [['topWeight','Top weight','max',v=>v+'kg'], ['e1rm','Est 1RM','max',v=>Math.round(v)+'kg'], ['volume','Volume','max',v=>Math.round(v)+'kg'], ['intensity','Intensity','mean',v=>Math.round(v*10)/10+' kg/rep']],
  cardio: [
    ['totalDistance','Distance','max', v => (v/1000).toFixed(1)+'km'],
    ['totalDuration','Duration','max', v => fmtRestCountdown(v)],
    ['pace','Pace','mean', v => fmtRestCountdown(v)+'/km', true],
    ['avgHr','Avg HR','mean', v => Math.round(v)+' bpm'],
  ],
  unilateral:    [['topWeight','Top weight','max', v => v+'kg']], // chart draws L/R as two lines
  timed_hold:    [['maxDuration','Hold time','max', v => fmtRestCountdown(v)]],
  jump_height:   [['bestHeight','Height','max', v => v+' cm']],
  jump_distance: [['bestDistance','Distance','max', v => v.toFixed(2)+' m']],
}
const _TREND_BADGE = { weight_reps:'Strength', cardio:'Cardio', unilateral:'Unilateral', timed_hold:'Timed', jump_height:'Jump', jump_distance:'Jump' }

// Personal records per exercise — ALL-TIME (not range-filtered; a PR is a lifetime best, Hevy-style).
// Returns [[label, value], …] appropriate to the metric_type. Non-weight types get their records in
// ③ Tasks 2–3; weight_reps/unilateral compute weight/reps records now.
function _exerciseRecords(ex) {
  const mt = ex.metricType
  if (mt === 'cardio') {
    const pts = _metricPointsFor(ex).points
    const dist = Math.max(0, ...pts.map(p => p.totalDistance || 0))
    const dur  = Math.max(0, ...pts.map(p => p.totalDuration || 0))
    const paces = pts.map(p => p.pace).filter(v => v > 0)       // lower = faster
    const hrs   = pts.map(p => p.avgHr).filter(v => v > 0)
    const rows = []
    if (dist > 0)      rows.push(['Best distance', (dist / 1000).toFixed(1) + ' km'])
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
    if (bestL > 0) rows.push(['Best left', bestL + ' kg'])
    if (bestR > 0) rows.push(['Best right', bestR + ' kg'])
    if (bestL > 0 && bestR > 0) rows.push(['L/R balance', Math.round(Math.min(bestL, bestR) / Math.max(bestL, bestR) * 100) + '%'])
    return rows
  }
  const flat = (ex.sessions || []).flatMap(s => s.sets || [])
  if (mt === 'timed_hold') {
    const best = Math.max(0, ...flat.map(x => parseInt(x.duration_seconds) || 0))
    return best > 0 ? [['Best hold', fmtRestCountdown(best)]] : []
  }
  if (mt === 'jump_height') {
    const best = Math.max(0, ...flat.map(x => parseFloat(x.height_cm) || 0))
    return best > 0 ? [['Best height', best + ' cm']] : []
  }
  if (mt === 'jump_distance') {
    const best = Math.max(0, ...flat.map(x => parseFloat(x.distance_m) || 0))
    return best > 0 ? [['Best distance', best.toFixed(2) + ' m']] : []
  }
  const num = v => parseFloat(v) || 0
  const allSets = (ex.sessions || []).flatMap(s => s.sets || [])
  const heaviest = Math.max(0, ...allSets.map(s => num(s.weight_kg)))
  const best1rm  = Math.max(0, ...allSets.map(s => _epley1RM(s.weight_kg, s.reps_achieved)))
  let bestSet = null // the single set with the highest weight×reps
  for (const s of allSets) {
    const w = num(s.weight_kg), r = parseInt(s.reps_achieved) || 0
    if (w > 0 && r > 0 && (!bestSet || w * r > bestSet.vol)) bestSet = { w, r, vol: w * r }
  }
  let bestSessVol = 0
  for (const sess of (ex.sessions || [])) {
    const vol = (sess.sets || []).reduce((t, s) => t + num(s.weight_kg) * (parseInt(s.reps_achieved) || 0), 0)
    if (vol > bestSessVol) bestSessVol = vol
  }
  const rows = []
  if (heaviest > 0)    rows.push(['Heaviest weight', heaviest + ' kg'])
  if (best1rm > 0)     rows.push(['Best est. 1RM', Math.round(best1rm) + ' kg'])
  if (bestSet)         rows.push(['Best set', `${bestSet.w} kg × ${bestSet.r}`])
  if (bestSessVol > 0) rows.push(['Best session vol', Math.round(bestSessVol).toLocaleString() + ' kg'])
  return rows
}

function _recordsBlockHtml(rows) {
  if (!rows.length) return ''
  return `<div style="margin-top:12px;border-top:1px solid var(--border);padding-top:10px">
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:6px">Personal records</div>
    ${rows.map(([label, val]) => `<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:12px">
      <span style="color:var(--text-muted)">${label}</span><span style="font-weight:700">${escapeHtml(String(val))}</span></div>`).join('')}
  </div>`
}

function _trendCardEmpty(ex) {
  return `<div style="margin-bottom:20px;padding:14px;border-radius:12px;background:var(--surface);border:1px solid var(--border)">
    <div style="font-size:14px;font-weight:700;margin-bottom:4px">${escapeHtml(ex.name)}</div>
    <div style="font-size:11px;color:var(--text-muted)">No sessions in this range.</div>
    ${_recordsBlockHtml(_exerciseRecords(ex))}</div>`
}

// Destroys the previous render's Chart.js instances before rebuilding — fires on every keystroke,
// range change and metric-chip tap, so without this each would leak a full set of chart instances
// bound to canvases the innerHTML rebuild below just detached.
let _perfExerciseCharts = []
function _renderPerfExerciseList(query) {
  const listEl = document.getElementById('perf-ex-list'); if (!listEl) return
  _perfExerciseCharts.forEach(c => c.destroy()); _perfExerciseCharts = []
  const q = (query || '').trim().toLowerCase()
  const cutoffDays = _TREND_RANGES[window._trendState.range]
  const cutoff = cutoffDays === Infinity ? 0 : Date.now() - cutoffDays * 86400000
  const list = (window._trendCache || []).filter(ex => !q || ex.name.toLowerCase().includes(q))
  if (!list.length) { listEl.innerHTML = '<div class="empty-state"><p>No matching exercises.</p></div>'; return }
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
  const muted  = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim()

  // Pass 1 — compute what each card shows (range-filtered points, visible metric chips, active chip).
  const rendered = list.map((ex, i) => {
    const pts = _metricPointsFor(ex).points.filter(p => new Date(p.date).getTime() >= cutoff)
    const metrics = (_TREND_METRICS[ex.metricType] || _TREND_METRICS.weight_reps)
      .filter(([key]) => pts.some(p => (p[key] || 0) > 0))
    if (!metrics.length) return { ex, i, empty: true }
    const stored = window._trendState.metricByEx[ex.name]
    const activeKey = stored && metrics.some(m => m[0] === stored) ? stored : metrics[0][0]
    return { ex, i, pts, metrics, activeKey, active: metrics.find(m => m[0] === activeKey) }
  })

  // Pass 2 — build the HTML (canvases must exist before Chart.js can bind to them).
  listEl.innerHTML = rendered.map(r => {
    if (r.empty) return _trendCardEmpty(r.ex)
    const vals = r.pts.map(p => p[r.activeKey]).filter(v => v > 0)
    const best = vals.length ? (r.active[4] ? Math.min(...vals) : Math.max(...vals)) : 0
    return `
      <div style="margin-bottom:20px;padding:14px;border-radius:12px;background:var(--surface);border:1px solid var(--border)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <span style="font-size:14px;font-weight:700">${escapeHtml(r.ex.name)}</span>
          <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted)">${_TREND_BADGE[r.ex.metricType]||'Strength'}</span>
        </div>
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">Best ${r.active[1].toLowerCase()}: ${r.active[3](best)} · ${r.pts.length} session${r.pts.length===1?'':'s'}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
          ${r.metrics.map(([key,label]) => `<button onclick="_setTrendMetric('${r.ex.name.replace(/'/g,"\\'")}','${key}')"
            style="padding:4px 10px;border:none;border-radius:12px;font-size:11px;font-weight:600;cursor:pointer;
                   background:${key===r.activeKey?'var(--accent)':'var(--surface-2)'};color:${key===r.activeKey?'#fff':'var(--text-muted)'}">${label}</button>`).join('')}
        </div>
        <div style="position:relative;height:90px"><canvas id="ps-chart-${r.i}"></canvas></div>
        ${_recordsBlockHtml(_exerciseRecords(r.ex))}
      </div>`
  }).join('')

  // Pass 3 — draw the charts.
  rendered.forEach(r => {
    if (r.empty) return
    const canvas = document.getElementById(`ps-chart-${r.i}`); if (!canvas) return
    // Unilateral: two lines (left + right) so a strength imbalance is visible.
    if (r.ex.metricType === 'unilateral') {
      const left  = _aggregateSeries(r.pts, 'leftTop', 'max')
      const right = _aggregateSeries(r.pts, 'rightTop', 'max')
      if (Math.max(left.length, right.length) < 2) return
      const labels = (left.length >= right.length ? left : right).map(a => a.label)
      _perfExerciseCharts.push(new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: { labels, datasets: [
          { label: 'Left',  data: left.map(a => a.value),  borderColor: accent, borderWidth: 2, pointBackgroundColor: accent, pointRadius: 3, fill: false, tension: 0.3 },
          { label: 'Right', data: right.map(a => a.value), borderColor: muted,  borderWidth: 2, pointBackgroundColor: muted,  pointRadius: 3, fill: false, tension: 0.3, borderDash: [4, 3] }
        ] },
        options: { responsive: true, maintainAspectRatio: false, animation: { duration: 200 },
          plugins: { legend: { display: true, labels: { color: muted, font: { size: 9 }, boxWidth: 10 } } },
          scales: { x: { grid: { display: false }, ticks: { color: muted, font: { size: 8 }, maxRotation: 0 } },
                    y: { grid: { color: 'rgba(150,150,150,0.08)' }, ticks: { color: muted, font: { size: 8 }, callback: v => v + 'kg' } } } }
      }))
      return
    }
    const agg = _aggregateSeries(r.pts, r.activeKey, r.active[2])
    if (agg.length < 2) return
    _perfExerciseCharts.push(new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { labels: agg.map(a => a.label), datasets: [{ data: agg.map(a => a.value), borderColor: accent, borderWidth: 2,
              pointBackgroundColor: accent, pointRadius: 3, fill: false, tension: 0.3 }] },
      options: { responsive: true, maintainAspectRatio: false, animation: { duration: 200 },
        plugins: { legend: { display: false } },
        scales: { x: { grid: { display: false }, ticks: { color: muted, font: { size: 8 }, maxRotation: 0 } },
                  y: { grid: { color: 'rgba(150,150,150,0.08)' }, ticks: { color: muted, font: { size: 8 }, callback: v => r.active[3](v) } } } }
    }))
  })
}

// renderProgressCardio removed 2026-07-19 (B5): cardio now has a proper metric_type trend card in
// the Per-exercise view; the standalone "Cardio bests" section it fed is gone from Personal Bests.

// 2026-07-08 restructure: Personal Bests now also hosts the 1RMs and Cardio bests sections that
// used to be their own separate places (a standalone Cardio tab, a Performance > 1RMs sub-tab) —
// one combined "bests" surface instead of 3. Each section keeps its own existing render function,
// just mounted into a sub-container here instead of being reached independently.
async function renderProgressPBs(el) {
  el.innerHTML = '<div class="loading-state">Loading personal bests…</div>'
  const clientId = await _getCurrentClientId()
  const addPBBtn = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px"><span style="font-size:13px;font-weight:600;color:var(--text)">Personal bests</span><button class="btn-secondary" style="font-size:12px;padding:4px 10px" onclick="showClientPBForm('${clientId}')">+ Log PB</button></div>
    <div id="client-pb-form" style="display:none;margin-bottom:16px;padding:14px;border-radius:12px;background:var(--surface);border:1px solid var(--border)">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
        <div><label class="form-label">Exercise name</label><input type="text" id="cpb-name" class="form-input" placeholder="e.g. Deadlift"></div>
        <div><label class="form-label">Category</label><select id="cpb-category" class="form-input"><option value="strength">Strength</option><option value="cardio">Cardio</option><option value="body_metric">Body metric</option><option value="benchmark">Benchmark</option></select></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px">
        <div><label class="form-label">Value</label><input type="number" id="cpb-value" class="form-input" step="0.1"></div>
        <div><label class="form-label">Unit</label><input type="text" id="cpb-unit" class="form-input" placeholder="kg / min / reps"></div>
        <div><label class="form-label">Date</label><input type="date" id="cpb-date" class="form-input" value="${new Date().toISOString().split('T')[0]}"></div>
      </div>
      <div style="margin-bottom:8px"><label class="form-label">Notes <span style="color:var(--text-muted)">(optional)</span></label><input type="text" id="cpb-notes" class="form-input" placeholder="Any notes…"></div>
      <p id="cpb-error" style="color:#ef4444;font-size:12px;margin:0 0 6px"></p>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" style="font-size:13px;padding:6px 14px" onclick="saveClientPB('${clientId}')">Save</button>
        <button class="btn-secondary" style="font-size:13px;padding:6px 14px" onclick="document.getElementById('client-pb-form').style.display='none'">Cancel</button>
      </div>
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
  if (!logs?.length) {
    pbListHtml = '<div class="empty-state"><p>No personal bests logged yet. Tap + Log PB to add your first record.</p></div>'
  } else {
    const byExercise = {}
    for (const l of logs) {
      const name = l.name || 'Unknown'
      if (!byExercise[name]) byExercise[name] = { best: l, all: [], unit: l.unit || '', category: l.category || '' }
      byExercise[name].all.push(l)
    }
    pbListHtml = Object.entries(byExercise).map(([name, { best, all, unit, category }]) => `
      <div style="margin-bottom:12px;padding:14px;border-radius:12px;background:var(--surface);border:1px solid var(--border)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <div style="font-size:14px;font-weight:700">${name}</div>
            <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-top:2px">${category}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:20px;font-weight:800;color:var(--accent)">${best.value} <span style="font-size:12px">${unit}</span></div>
            <div style="font-size:11px;color:var(--text-muted)">${new Date(best.date).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</div>
          </div>
        </div>
        ${all.length > 1 ? `<div style="margin-top:8px;font-size:11px;color:var(--text-muted)">${all.length} entries</div>` : ''}
      </div>`).join('')
  }

  el.innerHTML = `
    ${addPBBtn}
    ${pbListHtml}
    <div id="pb-1rms-section" style="margin-top:28px"></div>
  `
  await renderClient1RMs(clientId, document.getElementById('pb-1rms-section'))
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
              <img id="branding-logo-preview" src="${currentLogoUrl}" alt="Logo" style="height:64px;width:auto;max-width:200px;object-fit:contain;border-radius:8px;border:1px solid var(--border);padding:8px;background:var(--surface-2)">
            </div>
            <button onclick="removeBrandingLogo()" style="background:none;border:1px solid #ef4444;color:#ef4444;padding:5px 12px;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;margin-bottom:10px">Remove logo</button>
            ` : `
            <div id="branding-logo-preview" style="height:64px;width:180px;border:2px dashed var(--border);border-radius:8px;display:flex;align-items:center;justify-content:center;margin-bottom:10px">
              <span style="font-size:12px;color:var(--text-muted)">No logo uploaded</span>
            </div>
            `}
            <label style="display:inline-block;cursor:pointer;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:7px 14px;font-size:13px;font-weight:600;color:var(--text)">
              ${currentLogoUrl ? 'Replace logo' : 'Upload logo'}
              <input type="file" id="branding-logo-file" accept="image/jpeg,image/png,image/webp,image/svg+xml" style="display:none" onchange="previewBrandingLogo(this)">
            </label>
            <span style="font-size:11px;color:var(--text-muted);margin-left:8px">JPG, PNG, WebP, SVG</span>
          </div>
          <div>
            <button class="btn-primary" style="font-size:14px" onclick="saveBrandingSettings()">Save branding</button>
            <span id="branding-msg" style="font-size:13px;margin-left:12px;color:var(--text-muted)"></span>
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
            <input class="field-input" type="text" id="settings-name" value="${profile?.full_name || ''}" placeholder="Your name">
          </div>
          <div class="field">
            <label class="field-label">Email</label>
            <input class="field-input" type="email" value="${currentUser.email || ''}" disabled style="opacity:.6;cursor:default">
          </div>
          <div>
            <button class="btn-primary" style="font-size:14px" onclick="saveSettingsProfile()">Save changes</button>
            <span id="settings-profile-msg" style="font-size:13px;margin-left:12px;color:var(--text-muted)"></span>
          </div>
        </div>
      </div>

      ${brandingCard}

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
            <button class="btn-primary" style="font-size:14px" onclick="saveSettingsPassword()">Update password</button>
            <span id="settings-pw-msg" style="font-size:13px;margin-left:12px;color:var(--text-muted)"></span>
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
            <span style="font-size:13px;color:var(--text-muted)">Role</span>
            <span style="font-size:13px;font-weight:600;text-transform:capitalize">${profile?.role || '—'}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:7px 0">
            <span style="font-size:13px;color:var(--text-muted)">Member since</span>
            <span style="font-size:13px;font-weight:600">${memberSince}</span>
          </div>
        </div>
      </div>

      <!-- Sign out -->
      <div class="card">
        <div class="card-body" style="padding:16px 20px">
          <button onclick="db.auth.signOut().then(()=>location.reload())" style="background:none;border:1px solid #ef4444;color:#ef4444;padding:8px 18px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer">Sign out</button>
        </div>
      </div>

      <!-- Data & privacy -->
      <div class="card">
        <div class="card-header" style="padding:16px 20px 0">
          <h2 class="section-title">Data &amp; privacy</h2>
        </div>
        <div class="card-body" style="padding:12px 20px 20px;display:flex;flex-direction:column;gap:10px">
          <p style="font-size:13px;color:var(--text-muted);margin:0 0 4px">Your data is stored in the EU under UK GDPR. You can download a copy or permanently delete your account at any time.</p>
          <button onclick="downloadMyData()" style="background:none;border:1px solid var(--border);color:var(--text);padding:8px 18px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;text-align:left">Download my data</button>
          <button onclick="deleteAccount()" style="background:none;border:1px solid #ef4444;color:#ef4444;padding:8px 18px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;text-align:left">Delete account</button>
          <span id="settings-data-msg" style="font-size:13px;color:var(--text-muted)"></span>
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

async function downloadMyData() {
  const msg = document.getElementById('settings-data-msg')
  if (msg) msg.textContent = 'Preparing download…'

  try {
    const role = currentProfile?.role
    let bundle = { exportedAt: new Date().toISOString(), profile: null }

    const { data: profile } = await db.from('profiles').select('full_name, role, created_at').eq('id', currentUser.id).single()
    bundle.profile = profile

    if (role === 'coach') {
      const [{ data: clients }, { data: templates }, { data: programs }] = await Promise.all([
        db.from('clients').select('full_name, email, created_at').eq('coach_id', currentUser.id),
        db.from('workout_templates').select('name, created_at').eq('coach_id', currentUser.id),
        db.from('programs').select('name, created_at').eq('coach_id', currentUser.id),
      ])
      bundle.clients = clients; bundle.workoutTemplates = templates; bundle.programs = programs
    } else {
      const { data: clientRow } = await db.from('clients').select('id').eq('user_id', currentUser.id).single()
      if (clientRow) {
        const cid = clientRow.id
        const [{ data: weights }, { data: workouts }, { data: perf }, { data: goals }, { data: events }, { data: oneRMs }] = await Promise.all([
          db.from('weight_logs').select('date, weight_kg, body_fat_pct').eq('client_id', cid).order('date'),
          db.from('workout_logs').select('name, date').eq('client_id', cid).order('date'),
          db.from('performance_logs').select('name, category, value, unit, date').eq('client_id', cid).order('date'),
          db.from('goals').select('title, target_date, status').eq('client_id', cid),
          db.from('events').select('title, date, type').eq('client_id', cid).order('date'),
          db.from('client_1rms').select('exercise_name, one_rm_kg, recorded_at').eq('client_id', cid).order('recorded_at'),
        ])
        bundle.weightLogs = weights; bundle.workoutLogs = workouts
        bundle.performanceLogs = perf; bundle.goals = goals; bundle.events = events
        bundle.oneRepMaxes = oneRMs
      }
    }

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
      <h2 style="font-size:18px;font-weight:700;margin:0 0 8px;color:var(--danger)">Delete account</h2>
      <p style="font-size:14px;color:var(--text-muted);margin:0 0 16px;line-height:1.5">This will permanently delete your account and all your data. This cannot be undone.</p>
      <p style="font-size:14px;color:var(--text);margin:0 0 8px;font-weight:600">Type <strong>DELETE</strong> to confirm:</p>
      <input id="delete-confirm-input" type="text" class="field-input" placeholder="DELETE" autocomplete="off" style="margin-bottom:16px;font-size:15px">
      <p id="delete-confirm-error" style="font-size:13px;color:var(--danger);margin:0 0 12px;display:none">You must type DELETE exactly to proceed.</p>
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
