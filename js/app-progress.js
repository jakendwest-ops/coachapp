async function renderClientPhotos(clientId, el) {
  el.innerHTML = '<div class="loading-state">Loading…</div>'
  const prefix = `${clientId}/`
  const { data: files, error } = await db.storage.from('progress-photos').list(prefix, { sortBy: { column: 'created_at', order: 'desc' } })

  const isCoach = currentProfile?.role === 'coach'

  const uploadHtml = `
    <div class="card" style="margin-bottom:16px">
      <div class="card-body">
        <div style="font-size:13px;font-weight:600;margin-bottom:10px">Upload progress photo</div>
        <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap">
          <div>
            <label class="field-label">Date</label>
            <input type="date" id="pp-date" class="field-input" value="${new Date().toISOString().split('T')[0]}" style="width:160px">
          </div>
          <div>
            <label class="field-label">Photo</label>
            <input type="file" id="pp-file" class="field-input" accept="image/*" style="width:auto">
          </div>
          <button onclick="uploadProgressPhoto('${clientId}')" class="btn-primary" style="font-size:13px;padding:8px 16px">Upload</button>
        </div>
        <p id="pp-error" style="color:var(--danger);font-size:12px;margin:6px 0 0"></p>
      </div>
    </div>`

  const validFiles = files?.filter(f => f.name !== '.emptyFolderPlaceholder') || []
  if (error || !validFiles.length) {
    el.innerHTML = uploadHtml + `<div class="empty-state"><div class="empty-text">No progress photos yet.</div></div>`
    return
  }

  const paths = validFiles.map(f => prefix + f.name)
  const { data: signedUrlData } = await db.storage.from('progress-photos').createSignedUrls(paths, 3600)
  const urlMap = {}
  ;(signedUrlData || []).forEach(item => { if (item.signedUrl) urlMap[item.path] = item.signedUrl })

  const photoHtml = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px">
    ${validFiles.map(f => {
      const signedUrl = urlMap[prefix + f.name] || ''
      const datePart  = f.name.split('_')[0]
      return `
        <div style="border-radius:10px;overflow:hidden;background:var(--surface-2);position:relative">
          <img src="${signedUrl}" style="width:100%;aspect-ratio:3/4;object-fit:cover;display:block" loading="lazy">
          <div style="padding:6px 8px;display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:11px;color:var(--text-muted)">${datePart}</span>
            ${isCoach ? `<button onclick="deleteProgressPhoto('${clientId}','${f.name}')" style="font-size:11px;color:var(--danger);background:none;border:none;cursor:pointer">✕</button>` : ''}
          </div>
        </div>`
    }).join('')}
  </div>`

  el.innerHTML = uploadHtml + photoHtml
}

async function uploadProgressPhoto(clientId) {
  const fileInput = document.getElementById('pp-file')
  const dateVal   = document.getElementById('pp-date')?.value
  const errEl     = document.getElementById('pp-error')
  if (!fileInput?.files?.[0]) { errEl.textContent = 'Please select a photo'; return }
  const file = fileInput.files[0]
  const ext  = file.name.split('.').pop()
  const path = `${clientId}/${dateVal}_${Date.now()}.${ext}`
  const { error } = await db.storage.from('progress-photos').upload(path, file, { upsert: false })
  if (error) { errEl.textContent = error.message; return }
  renderClientPhotos(clientId, document.getElementById('tab-content'))
}

async function deleteProgressPhoto(clientId, fileName) {
  if (!confirm('Delete this photo?')) return
  await db.storage.from('progress-photos').remove([`${clientId}/${fileName}`])
  renderClientPhotos(clientId, document.getElementById('tab-content'))
}

// ─── 1RMs ────────────────────────────────────────────────────────────────────

const BIG_5_EXERCISES = ['Back Squat', 'Deadlift', 'Bench Press', 'Overhead Press', 'Barbell Row']

async function saveBig5OneRMs(clientId) {
  const errEl = document.getElementById('big5-error')
  const today = new Date().toISOString().split('T')[0]
  const rows = BIG_5_EXERCISES
    .map(name => ({ name, weight: parseFloat(document.getElementById(`big5-${name.replace(/\s+/g,'-')}`)?.value) }))
    .filter(r => r.weight && r.weight > 0)
    .map(r => ({ client_id: clientId, exercise_name: r.name, one_rm_kg: r.weight, recorded_at: today }))
  if (!rows.length) { errEl.textContent = 'Enter at least one value'; return }
  const { error } = await dbq('saveBig5OneRMs', db.from('client_1rms').insert(rows))
  if (error) { errEl.textContent = 'Save failed — try again'; return }
  const perfEl = document.getElementById('perf-1rms-content')
  if (perfEl) renderClient1RMs(clientId, perfEl)
  else renderClient1RMs(clientId, document.getElementById('tab-content'))
}

async function renderClient1RMs(clientId, el) {
  el.innerHTML = '<div class="loading-state">Loading 1RMs…</div>'
  const [{ data: rows }, { data: exercises }] = await Promise.all([
    db.from('client_1rms').select('*').eq('client_id', clientId).order('recorded_at', { ascending: false }),
    db.from('exercises').select('name').eq('coach_id', currentUser.id).order('name')
  ])
  const exNames = (exercises || []).map(e => e.name)

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
              <div style="font-size:15px;font-weight:700">${exName}</div>
              <div style="font-size:12px;color:var(--text-muted);margin-top:2px">Recorded ${new Date(latest.recorded_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</div>
            </div>
            <div style="display:flex;align-items:center;gap:10px">
              <span style="font-size:22px;font-weight:800;color:var(--accent)">${parseFloat(latest.one_rm_kg).toFixed(1)} kg</span>
              <button onclick="showAdd1RMModal('${clientId}','${exName.replace(/'/g,"\\'")}')" style="padding:5px 10px;border:1px solid var(--border);border-radius:7px;background:transparent;font-size:12px;font-weight:600;cursor:pointer;color:var(--text-muted)">+ Update</button>
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
    <datalist id="ex-names-list">${exNames.map(n=>`<option value="${n}">`).join('')}</datalist>
  `
}

function showAdd1RMModal(clientId, prefillExercise = '') {
  const existing = document.getElementById('modal-1rm')
  if (existing) existing.remove()
  const overlay = document.createElement('div')
  overlay.id = 'modal-1rm'
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-header">
        <h2 class="modal-title">${prefillExercise ? 'Update 1RM' : 'Add 1RM'}</h2>
        <button class="modal-close" onclick="document.getElementById('modal-1rm').remove()">✕</button>
      </div>
      <div class="field">
        <label class="field-label">Exercise</label>
        <input class="field-input" id="1rm-exercise" list="ex-names-list" placeholder="e.g. Back Squat" autocomplete="off" value="${prefillExercise}">
      </div>
      <div style="display:flex;gap:6px;margin-bottom:14px">
        <button id="orm-mode-direct" onclick="_setAdd1RMMode('direct')" class="btn-primary" style="flex:1;font-size:12px;padding:8px">I know my 1RM</button>
        <button id="orm-mode-epley" onclick="_setAdd1RMMode('epley')" class="btn-secondary" style="flex:1;font-size:12px;padding:8px">Estimate from a set</button>
      </div>
      <div id="orm-direct-fields">
        <div class="field">
          <label class="field-label">1RM (kg)</label>
          <input class="field-input" id="1rm-weight" type="number" step="0.5" inputmode="decimal" placeholder="e.g. 120">
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
        <input class="field-input" id="1rm-date" type="date" value="${new Date().toISOString().split('T')[0]}">
      </div>
      <p class="modal-error" id="1rm-error"></p>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="document.getElementById('modal-1rm').remove()">Cancel</button>
        <button class="btn-primary" onclick="save1RM('${clientId}')">Save</button>
      </div>
    </div>
  `
  document.body.appendChild(overlay)
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

function showEdit1RMModal(id, clientId, exerciseName, weight, date) {
  const existing = document.getElementById('modal-1rm')
  if (existing) existing.remove()
  const overlay = document.createElement('div')
  overlay.id = 'modal-1rm'
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-header">
        <h2 class="modal-title">Edit 1RM</h2>
        <button class="modal-close" onclick="document.getElementById('modal-1rm').remove()">✕</button>
      </div>
      <div class="field">
        <label class="field-label">Exercise</label>
        <input class="field-input" id="1rm-exercise" list="ex-names-list" value="${exerciseName}" autocomplete="off">
      </div>
      <div class="field">
        <label class="field-label">1RM (kg)</label>
        <input class="field-input" id="1rm-weight" type="number" step="0.5" inputmode="decimal" value="${weight}">
      </div>
      <div class="field">
        <label class="field-label">Date recorded</label>
        <input class="field-input" id="1rm-date" type="date" value="${date}">
      </div>
      <p class="modal-error" id="1rm-error"></p>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="document.getElementById('modal-1rm').remove()">Cancel</button>
        <button class="btn-primary" onclick="save1RM('${clientId}','${id}')">Save</button>
      </div>
    </div>
  `
  document.body.appendChild(overlay)
}

async function save1RM(clientId, existingId = null) {
  const exercise   = document.getElementById('1rm-exercise')?.value.trim()
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
  if (!exercise) { errEl.textContent = 'Exercise name is required'; return }
  if (!weight || weight <= 0) { errEl.textContent = 'Enter a valid weight'; return }
  const row = { client_id: clientId, exercise_name: exercise, one_rm_kg: weight, recorded_at: date }
  let error
  if (existingId) {
    ;({ error } = await dbq('save1RM:update', db.from('client_1rms').update(row).eq('id', existingId)))
  } else {
    ;({ error } = await dbq('save1RM:insert', db.from('client_1rms').insert(row)))
  }
  if (error) { errEl.textContent = 'Save failed — try again'; return }
  document.getElementById('modal-1rm').remove()
  const perfEl = document.getElementById('perf-1rms-content')
  if (perfEl) renderClient1RMs(clientId, perfEl)
  else renderClient1RMs(clientId, document.getElementById('tab-content'))
}

async function delete1RM(id, clientId) {
  if (!confirm('Delete this 1RM?')) return
  await dbq('delete1RM', db.from('client_1rms').delete().eq('id', id))
  renderClient1RMs(clientId, document.getElementById('tab-content'))
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

  const { data: logs, error } = await db
    .from('weight_logs')
    .select('*')
    .eq('client_id', clientId)
    .order('date', { ascending: false })

  if (error) { log.error('renderClientWeight', 'fetch failed', error); el.innerHTML = `<div class="empty-state"><div class="empty-title">Error loading weight data</div></div>`; return }
  log.ok('renderClientWeight', `loaded ${logs.length} entries`)

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
            y: { position: 'left', ticks: { color: '#6366f1', font: { size: 11 }, callback: v => v + ' kg' }, grid: { color: 'rgba(0,0,0,0.05)' } },
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

  const tabs = ['Body Weight', 'Cardio', 'Personal Bests', 'Performance']
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
  if (activeTab === 'Cardio')         await renderProgressCardio(document.getElementById('progress-tab-content'))
  if (activeTab === 'Personal Bests') await renderProgressPBs(document.getElementById('progress-tab-content'))
  if (activeTab === 'Performance')    await renderPerformance(document.getElementById('progress-tab-content'))
}

async function renderPerformance(el) {
  const clientId = await _getCurrentClientId()
  if (!clientId) { el.innerHTML = '<div class="empty-state"><p>No data yet.</p></div>'; return }

  const subTab = window._perfTab || '1RMs'

  el.innerHTML = `
    <div style="display:flex;gap:6px;margin-bottom:16px">
      ${['1RMs', 'Progressions'].map(t => `
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
  if (subTab === '1RMs') {
    subEl.innerHTML = `
      <div style="font-size:13px;color:var(--text-muted);background:var(--surface-2);border-radius:10px;padding:12px 14px;margin-bottom:16px;line-height:1.5">
        Enter your 1 rep maxes here. Once added, the workout runner and programs automatically calculate target weights for any % 1RM sets.
      </div>
      <div id="perf-1rms-content"></div>
    `
    await renderClient1RMs(clientId, document.getElementById('perf-1rms-content'))
  } else {
    await renderProgressStrength(subEl)
  }
}

async function renderProgressWeight(el) {
  el.innerHTML = '<div class="loading-state">Loading weight data…</div>'
  const clientId = await _getCurrentClientId()
  if (!clientId) { el.innerHTML = '<div class="empty-state"><p>No data yet.</p></div>'; return }
  const { data: logs } = await db.from('weight_logs').select('date, weight_kg, body_fat_pct')
    .eq('client_id', clientId).order('date', { ascending: true })
  const addWeightBtn = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px"><span style="font-size:13px;font-weight:600;color:var(--text)">Body weight log</span><button class="btn-secondary" style="font-size:12px;padding:4px 10px" onclick="showClientWeightForm('${clientId}')">+ Log weight</button></div>`
  if (!logs?.length) { el.innerHTML = addWeightBtn + '<div class="empty-state"><p>No weight logs yet. Tap + Log weight to add your first entry.</p></div>'; return }
  const latest = logs[logs.length - 1]
  const first  = logs[0]
  const change = (latest.weight_kg - first.weight_kg).toFixed(1)
  const sign   = change > 0 ? '+' : ''
  el.innerHTML = `
    ${addWeightBtn}
    <div style="display:flex;gap:12px;margin-bottom:16px">
      ${[['Current', latest.weight_kg + ' kg'], ['Starting', first.weight_kg + ' kg'], ['Change', sign + change + ' kg']].map(([l,v])=>`
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
  `
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
  const muted  = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim()
  new Chart(document.getElementById('pw-chart').getContext('2d'), {
    type: 'line',
    data: { labels: logs.map(l => new Date(l.date).toLocaleDateString('en-GB',{day:'numeric',month:'short'})),
            datasets: [{ data: logs.map(l => l.weight_kg), borderColor: accent, borderWidth: 2,
              pointBackgroundColor: accent, pointRadius: 3, fill: false, tension: 0.3 }] },
    options: { responsive: true, maintainAspectRatio: false, animation: { duration: 300 },
      plugins: { legend: { display: false } },
      scales: { x: { grid: { display: false }, ticks: { color: muted, font: { size: 9 }, maxRotation: 0 } },
                y: { grid: { color: 'rgba(150,150,150,0.08)' }, ticks: { color: muted, font: { size: 9 }, callback: v => v + 'kg' } } } }
  })
}

async function renderProgressStrength(el) {
  el.innerHTML = '<div class="loading-state">Loading exercise data…</div>'
  const clientId = await _getCurrentClientId()
  if (!clientId) { el.innerHTML = '<div class="empty-state"><p>No data yet.</p></div>'; return }
  const client = { id: clientId }
  const { data: exRows } = await db.from('workout_log_exercises')
    .select('exercise_name, workout_logs!inner(date, client_id), workout_log_sets(weight_kg, reps_achieved)')
    .eq('workout_logs.client_id', client.id).eq('exercise_type', 'strength').order('exercise_name')
  if (!exRows?.length) { el.innerHTML = '<div class="empty-state"><p>No strength sessions logged yet.</p></div>'; return }
  const byExercise = {}
  for (const row of exRows) {
    const name = row.exercise_name; if (!name) continue
    if (!byExercise[name]) byExercise[name] = []
    const maxW = Math.max(...(row.workout_log_sets||[]).map(s => parseFloat(s.weight_kg)||0).filter(w=>w>0))
    if (maxW > 0) byExercise[name].push({ date: row.workout_logs.date, weight: maxW })
  }
  const exercises = Object.entries(byExercise).filter(([,pts]) => pts.length > 0)
    .map(([name, pts]) => ({ name, pts: pts.sort((a,b)=>new Date(a.date)-new Date(b.date)) }))
  if (!exercises.length) { el.innerHTML = '<div class="empty-state"><p>No strength data yet.</p></div>'; return }
  el.innerHTML = exercises.map((ex, i) => `
    <div style="margin-bottom:20px;padding:14px;border-radius:12px;background:var(--surface);border:1px solid var(--border)">
      <div style="font-size:14px;font-weight:700;margin-bottom:8px">${ex.name}</div>
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">
        Best: ${Math.max(...ex.pts.map(p=>p.weight))} kg · ${ex.pts.length} session${ex.pts.length===1?'':'s'}
      </div>
      <div style="position:relative;height:80px"><canvas id="ps-chart-${i}" style="width:100%;height:100%"></canvas></div>
    </div>`).join('')
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
  const muted  = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim()
  exercises.forEach((ex, i) => {
    const canvas = document.getElementById(`ps-chart-${i}`)
    if (!canvas || ex.pts.length < 2) return
    new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { labels: ex.pts.map(p => new Date(p.date).toLocaleDateString('en-GB',{day:'numeric',month:'short'})),
              datasets: [{ data: ex.pts.map(p=>p.weight), borderColor: accent, borderWidth: 2,
                pointBackgroundColor: accent, pointRadius: 3, fill: false, tension: 0.3 }] },
      options: { responsive: true, maintainAspectRatio: false, animation: { duration: 200 },
        plugins: { legend: { display: false } },
        scales: { x: { grid: { display: false }, ticks: { color: muted, font: { size: 8 }, maxRotation: 0 } },
                  y: { grid: { color: 'rgba(150,150,150,0.08)' }, ticks: { color: muted, font: { size: 8 }, callback: v => v+'kg' } } } }
    })
  })
}

async function renderProgressCardio(el) {
  el.innerHTML = '<div class="loading-state">Loading cardio data…</div>'
  const clientId = await _getCurrentClientId()
  if (!clientId) { el.innerHTML = '<div class="empty-state"><p>No data yet.</p></div>'; return }
  const client = { id: clientId }
  const { data: exRows } = await db.from('workout_log_exercises')
    .select('exercise_name, workout_logs!inner(date, client_id), workout_log_sets(distance_m, duration_seconds)')
    .eq('workout_logs.client_id', client.id).eq('exercise_type', 'cardio').order('exercise_name')
  if (!exRows?.length) { el.innerHTML = '<div class="empty-state"><p>Cardio progress populates automatically from your logged workout sessions. Complete a session with cardio sets and it will appear here.</p></div>'; return }
  const byExercise = {}
  for (const row of exRows) {
    const name = row.exercise_name; if (!name) continue
    if (!byExercise[name]) byExercise[name] = []
    const totalDist = (row.workout_log_sets||[]).reduce((s,set)=>s+(parseFloat(set.distance_m)||0),0)
    const totalSecs = (row.workout_log_sets||[]).reduce((s,set)=>s+(parseInt(set.duration_seconds)||0),0)
    if (totalDist > 0 || totalSecs > 0)
      byExercise[name].push({ date: row.workout_logs.date, dist: totalDist/1000, secs: totalSecs })
  }
  const exercises = Object.entries(byExercise).filter(([,pts])=>pts.length>0)
    .map(([name, pts]) => ({ name, pts: pts.sort((a,b)=>new Date(a.date)-new Date(b.date)) }))
  if (!exercises.length) { el.innerHTML = '<div class="empty-state"><p>No cardio data yet.</p></div>'; return }
  el.innerHTML = exercises.map((ex, i) => {
    const usesDist = ex.pts.some(p => p.dist > 0)
    const best = usesDist ? Math.max(...ex.pts.map(p=>p.dist)).toFixed(1)+' km' : fmtRestCountdown(Math.max(...ex.pts.map(p=>p.secs)))
    return `
    <div style="margin-bottom:20px;padding:14px;border-radius:12px;background:var(--surface);border:1px solid var(--border)">
      <div style="font-size:14px;font-weight:700;margin-bottom:4px">${ex.name}</div>
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">Best: ${best} · ${ex.pts.length} session${ex.pts.length===1?'':'s'}</div>
      <div style="position:relative;height:80px"><canvas id="pc-chart-${i}" style="width:100%;height:100%"></canvas></div>
    </div>`}).join('')
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
  const muted  = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim()
  exercises.forEach((ex, i) => {
    const canvas = document.getElementById(`pc-chart-${i}`)
    if (!canvas || ex.pts.length < 2) return
    const usesDist = ex.pts.some(p => p.dist > 0)
    new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { labels: ex.pts.map(p => new Date(p.date).toLocaleDateString('en-GB',{day:'numeric',month:'short'})),
              datasets: [{ data: ex.pts.map(p => usesDist ? p.dist : p.secs/60), borderColor: accent, borderWidth: 2,
                pointBackgroundColor: accent, pointRadius: 3, fill: false, tension: 0.3 }] },
      options: { responsive: true, maintainAspectRatio: false, animation: { duration: 200 },
        plugins: { legend: { display: false } },
        scales: { x: { grid: { display: false }, ticks: { color: muted, font: { size: 8 }, maxRotation: 0 } },
                  y: { grid: { color: 'rgba(150,150,150,0.08)' }, ticks: { color: muted, font: { size: 8 },
                    callback: v => usesDist ? v+'km' : v+'min' } } } }
    })
  })
}

async function renderProgressPBs(el) {
  el.innerHTML = '<div class="loading-state">Loading personal bests…</div>'
  const clientId = await _getCurrentClientId()
  const addPBBtn = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px"><span style="font-size:13px;font-weight:600;color:var(--text)">Personal bests</span><button class="btn-secondary" style="font-size:12px;padding:4px 10px" onclick="showClientPBForm('${clientId}')">+ Log PB</button></div>`
  const { data: logs } = await db.from('performance_logs')
    .select('*, performance_exercises(name, category, unit)')
    .eq('client_id', clientId).order('date', { ascending: false })
  if (!logs?.length) { el.innerHTML = addPBBtn + '<div class="empty-state"><p>No personal bests logged yet. Tap + Log PB to add your first record.</p></div>'; return }
  const byExercise = {}
  for (const l of logs) {
    const name = l.performance_exercises?.name || 'Unknown'
    if (!byExercise[name]) byExercise[name] = { best: l, all: [], unit: l.performance_exercises?.unit || '', category: l.performance_exercises?.category || '' }
    byExercise[name].all.push(l)
  }
  el.innerHTML = addPBBtn + Object.entries(byExercise).map(([name, { best, all, unit, category }]) => `
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
    <div class="modal-box" style="max-width:400px">
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
  document.body.appendChild(overlay)
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
