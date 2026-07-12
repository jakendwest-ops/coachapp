function showClientPBForm(clientId) {
  const form = document.getElementById('client-pb-form')
  if (!form) return
  form.style.display = form.style.display === 'none' ? 'block' : 'none'
}

async function saveClientPB(clientId) {
  const name     = document.getElementById('cpb-name').value.trim()
  const category = document.getElementById('cpb-category').value
  const value    = parseFloat(document.getElementById('cpb-value').value)
  const unit     = document.getElementById('cpb-unit').value.trim()
  const date     = document.getElementById('cpb-date').value
  const notes    = document.getElementById('cpb-notes').value.trim()
  const errorEl  = document.getElementById('cpb-error')

  if (!name || isNaN(value) || !unit || !date) { errorEl.textContent = 'Name, value, unit and date are required.'; return }
  errorEl.textContent = ''

  const row = { client_id: clientId, logged_by: currentUser.id, category, name, value, unit, date }
  if (notes) row.notes = notes

  log.info('saveClientPB', 'inserting', { clientId: row.client_id, date: row.date })
  const { error } = await db.from('performance_logs').insert(row)
  if (error) { log.error('saveClientPB', 'insert failed', error); errorEl.textContent = error.message; return }

  log.ok('saveClientPB', 'PB logged', { clientId: row.client_id, date: row.date })
  showToast('PB logged ✓', 'success', 2000)
  // Refresh whichever view is actually showing this form — the client/solo My Progress
  // page (progress-tab-content) or the correct Dashboard (client vs solo).
  const progressEl = document.getElementById('progress-tab-content')
  if (progressEl) renderProgressPBs(progressEl)
  else if (currentProfile?.role === 'solo') renderSoloDashboard(document.getElementById('main-content'))
  else renderClientDashboard(document.getElementById('main-content'))
}

function showClientWeightForm(clientId) {
  const form = document.getElementById('client-weight-form')
  if (!form) return
  form.style.display = form.style.display === 'none' ? 'block' : 'none'
}

async function saveClientCheckIn(clientId) {
  const sleep    = parseInt(document.getElementById('ci-sleep')?.value)
  const energy   = parseInt(document.getElementById('ci-energy')?.value)
  const stress   = parseInt(document.getElementById('ci-stress')?.value)
  const soreness = parseInt(document.getElementById('ci-soreness')?.value)
  const notes    = document.getElementById('ci-notes')?.value.trim() || null
  const errEl    = document.getElementById('ci-error')
  if ([sleep,energy,stress,soreness].some(isNaN)) { if(errEl) errEl.textContent = 'Please fill in all ratings'; return }
  const { error } = await db.from('client_check_ins').insert({ client_id: clientId, sleep, energy, stress, soreness, notes })
  if (error) { log.error('saveClientCheckIn', 'insert failed', error); if(errEl) errEl.textContent = error.message; return }
  renderClientDashboard(document.getElementById('main-content'))
}

async function saveClientWeight(clientId) {
  const date   = document.getElementById('cwf-date').value
  const weight = parseFloat(document.getElementById('cwf-weight').value)
  const bf     = document.getElementById('cwf-bf').value
  const notes  = document.getElementById('cwf-notes').value.trim()
  const errorEl = document.getElementById('cwf-error')

  if (!date || isNaN(weight)) { errorEl.textContent = 'Date and weight are required.'; return }
  errorEl.textContent = ''

  const row = { client_id: clientId, date, weight_kg: weight }
  if (bf)    row.body_fat_pct = parseFloat(bf)
  if (notes) row.notes = notes

  log.info('saveClientWeight', 'inserting', { clientId: row.client_id, date: row.date })
  const { error } = await db.from('weight_logs').insert(row)
  if (error) { log.error('saveClientWeight', 'insert failed', error); errorEl.textContent = error.message; return }

  log.ok('saveClientWeight', 'weight logged', { clientId: row.client_id, date: row.date })
  showToast('Weight logged ✓', 'success', 2000)
  // Refresh whichever view is actually showing this form — the client/solo My Progress page
  // (progress-tab-content) or the correct Dashboard (client vs solo) — same fix shape as
  // saveClientPB earlier this session, which had the identical wrong-dashboard bug.
  const progressEl = document.getElementById('progress-tab-content')
  if (progressEl) renderProgressWeight(progressEl)
  else if (currentProfile?.role === 'solo') renderSoloDashboard(document.getElementById('main-content'))
  else renderClientDashboard(document.getElementById('main-content'))
}

// ─── CLIENTS LIST ─────────────────────────────────────────────────────────────
async function renderClients(el) {
  log.info('renderClients', 'fetching client list')
  el.innerHTML = '<div class="loading-state">Loading…</div>'

  const [{ data: clients, error }, { data: recentLogs }] = await Promise.all([
    db.from('clients').select('*').eq('coach_id', currentUser.id).order('full_name'),
    db.from('workout_logs').select('client_id, date').eq('coach_id', currentUser.id).order('date', { ascending: false }).limit(200)
  ])

  if (error) { log.error('renderClients', 'fetch failed', error); el.innerHTML = `<div class="loading-state">${error.message}</div>`; return }
  log.ok('renderClients', `loaded ${clients.length} clients`)

  // Last session date per client
  const lastSession = {}
  ;(recentLogs || []).forEach(l => { if (!lastSession[l.client_id]) lastSession[l.client_id] = l.date })

  function lastSessionLabel(clientId) {
    const d = lastSession[clientId]
    if (!d) return { text: 'No sessions', colour: 'var(--text-muted)' }
    const days = Math.floor((Date.now() - new Date(d + 'T00:00:00')) / 86400000)
    if (days === 0) return { text: 'Today', colour: '#22c55e' }
    if (days === 1) return { text: 'Yesterday', colour: '#22c55e' }
    if (days <= 7)  return { text: `${days}d ago`, colour: '#f59e0b' }
    return { text: `${days}d ago`, colour: '#ef4444' }
  }

  el.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Clients</h1>
      <button class="btn-primary" onclick="showAddClientModal()">+ Add client</button>
    </div>
    <div class="list" id="client-list">
      ${clients.length === 0 ? `
        <div class="empty-state">
          <div class="empty-icon">👥</div>
          <div class="empty-title">No clients yet</div>
          <div class="empty-text">Add your first client to start tracking their goals and workouts</div>
          <button class="btn-primary" onclick="showAddClientModal()">+ Add your first client</button>
        </div>
      ` : clients.map(c => {
        const { text: lastText, colour: lastColour } = lastSessionLabel(c.id)
        return `
        <div class="list-row" onclick="openClient('${c.id}')">
          <div class="avatar">${c.full_name.charAt(0).toUpperCase()}</div>
          <div class="row-info">
            <div class="row-name">${c.full_name}</div>
            <div class="row-meta">${c.email || 'No email'}</div>
          </div>
          <div class="row-right" style="flex-direction:column;align-items:flex-end;gap:4px">
            <span class="badge badge-${c.status}">${c.status}</span>
            <span style="font-size:11px;font-weight:600;color:${lastColour}">${lastText}</span>
          </div>
          ${currentUser.email === 'jakendwest@gmail.com' ? `<button onclick="event.stopPropagation();sudoAsClient('${c.id}','${escapeHtml(c.full_name)}')" style="font-size:11px;font-weight:700;padding:4px 8px;border-radius:6px;border:1px solid #f59e0b;background:transparent;color:#f59e0b;cursor:pointer;white-space:nowrap">View as</button>` : ''}
          <svg style="width:15px;height:15px;color:#d1d5db;flex-shrink:0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </div>`
      }).join('')}
    </div>
  `
}

// ─── ADD CLIENT MODAL ─────────────────────────────────────────────────────────
function showAddClientModal() {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.id = 'add-client-modal'
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2 class="modal-title">Add client</h2>
        <button class="modal-close" onclick="closeModal('add-client-modal')">✕</button>
      </div>

      <div class="field">
        <label class="field-label">Full name <span style="color:var(--danger)">*</span></label>
        <input class="field-input" id="nc-name" placeholder="Jane Smith" required>
      </div>
      <div class="field-row">
        <div class="field">
          <label class="field-label">Email</label>
          <input class="field-input" id="nc-email" type="email" placeholder="jane@example.com">
        </div>
        <div class="field">
          <label class="field-label">Phone</label>
          <input class="field-input" id="nc-phone" type="tel" placeholder="+44 7700 000000">
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label class="field-label">Date of birth</label>
          <input class="field-input" id="nc-dob" type="date">
        </div>
        <div class="field">
          <label class="field-label">Height (cm)</label>
          <input class="field-input" id="nc-height" type="number" placeholder="175">
        </div>
      </div>
      <div class="field">
        <label class="field-label">Notes</label>
        <textarea class="field-input" id="nc-notes" rows="2" placeholder="Any initial notes…" style="resize:vertical"></textarea>
      </div>

      <p class="modal-error" id="nc-error"></p>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeModal('add-client-modal')">Cancel</button>
        <button class="btn-primary" onclick="saveNewClient()">Add client</button>
      </div>
    </div>
  `
  document.body.appendChild(overlay)
  document.getElementById('nc-name').focus()
}

async function saveNewClient() {
  const name    = document.getElementById('nc-name').value.trim()
  const errorEl = document.getElementById('nc-error')
  if (!name) { errorEl.textContent = 'Name is required'; return }

  log.info('saveNewClient', 'inserting client')
  const { error } = await db.from('clients').insert({
    coach_id:      currentUser.id,
    full_name:     name,
    email:         document.getElementById('nc-email').value.trim()  || null,
    phone:         document.getElementById('nc-phone').value.trim()  || null,
    date_of_birth: document.getElementById('nc-dob').value           || null,
    height_cm:     document.getElementById('nc-height').value        || null,
    notes:         document.getElementById('nc-notes').value.trim()  || null
  })

  if (error) { log.error('saveNewClient', 'insert failed', error); errorEl.textContent = error.message; return }
  log.ok('saveNewClient', 'client created')

  closeModal('add-client-modal')
  renderClients(document.getElementById('main-content'))
}

// ─── CLIENT DETAIL ────────────────────────────────────────────────────────────
async function openClient(id) {
  log.info('openClient', 'loading client profile', { clientId: id })
  const el = document.getElementById('main-content')
  el.innerHTML = '<div class="loading-state">Loading…</div>'

  const { data: client, error } = await db
    .from('clients')
    .select('*')
    .eq('id', id)
    .eq('coach_id', currentUser.id)
    .single()

  if (error) { log.error('openClient', 'fetch failed', error); el.innerHTML = `<div class="loading-state">${error.message}</div>`; return }
  log.ok('openClient', 'loaded')

  el.innerHTML = `
    <a class="back-btn" href="#" onclick="navigate('clients');return false">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
      All clients
    </a>

    <div class="page-header">
      <div style="display:flex;align-items:center;gap:14px">
        <div class="avatar" style="width:48px;height:48px;font-size:18px">${client.full_name.charAt(0).toUpperCase()}</div>
        <div>
          <h1 class="page-title" style="margin-bottom:2px">${client.full_name}</h1>
          <p class="page-subtitle">${client.email || ''}</p>
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        ${!client.invited_at ? `
        <button class="btn-secondary" onclick="sendClientInvite('${client.id}','${client.email}')"
          style="background:rgba(99,102,241,0.08);color:var(--accent);border-color:var(--accent)">
          ✉ Send invite
        </button>` : `
        <button class="btn-secondary" onclick="sendClientInvite('${client.id}','${client.email}')">
          ✉ Resend invite
        </button>`}
        <button class="btn-secondary" onclick="showUpdateEmailModal('${client.id}','${client.email || ''}')">Update email</button>
        <button class="btn-secondary" onclick="showEditClientModal('${client.id}')">Update details</button>
      </div>
    </div>

    <div class="tabs">
      <button class="tab-btn active" onclick="switchTab(this,'tab-overview','${id}')">Overview</button>
      <button class="tab-btn" onclick="switchTab(this,'tab-goals','${id}')">Goals</button>
      <button class="tab-btn" onclick="switchTab(this,'tab-workouts','${id}')">Workouts</button>
      <button class="tab-btn" onclick="switchTab(this,'tab-weight','${id}')">Weight</button>
      <button class="tab-btn" onclick="switchTab(this,'tab-performance','${id}')">Performance</button>
      <button class="tab-btn" onclick="switchTab(this,'tab-programs','${id}')">Programs</button>
      <button class="tab-btn" onclick="switchTab(this,'tab-1rms','${id}')">1RMs</button>
    </div>

    <div id="tab-content"></div>
  `
  renderClientOverview(id, document.getElementById('tab-content'))
}

function switchTab(btn, tab, clientId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'))
  btn.classList.add('active')
  const content = document.getElementById('tab-content')

  switch (tab) {
    case 'tab-overview': content.innerHTML = ''; renderClientOverview(clientId, content); break
    case 'tab-goals':    content.innerHTML = ''; renderClientGoals(clientId, content);    break
    case 'tab-workouts': content.innerHTML = ''; renderClientWorkouts(clientId, content); break
    case 'tab-weight':       content.innerHTML = ''; renderClientWeight(clientId, content);       break
    case 'tab-performance':  content.innerHTML = ''; renderClientPerformance(clientId, content);  break
    case 'tab-programs':     content.innerHTML = ''; renderClientPrograms(clientId, content);     break
    case 'tab-1rms':         content.innerHTML = ''; renderClient1RMs(clientId, content);         break
  }
}

function clientOverviewTab(client, programName = null) {
  const dob = client.date_of_birth
    ? new Date(client.date_of_birth).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—'
  const age = client.date_of_birth
    ? Math.floor((Date.now() - new Date(client.date_of_birth)) / 31557600000)
    : null

  return `
    <div class="card">
      <div class="card-body">
        ${programName ? `<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid var(--border)"><span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted)">Active program</span><span style="font-size:14px;font-weight:600;color:var(--accent)">${programName}</span></div>` : ''}
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:20px">
          ${infoItem('Status', `<span class="badge badge-${client.status}">${client.status}</span>`)}
          ${infoItem('Email', client.email || '—')}
          ${infoItem('Phone', client.phone || '—')}
          ${infoItem('Date of birth', age ? `${dob} (age ${age})` : dob)}
          ${infoItem('Height', client.height_cm ? `${client.height_cm} cm` : '—')}
        </div>
        ${client.notes ? `<div class="divider"></div><p style="color:var(--text-muted);font-size:13.5px;line-height:1.6">${client.notes}</p>` : ''}
      </div>
    </div>
  `
}

async function renderClientOverview(id, el) {
  const [{ data: client }, { data: checkIns }, { data: progAssign }] = await Promise.all([
    db.from('clients').select('*').eq('id', id).eq('coach_id', currentUser.id).single(),
    db.from('client_check_ins').select('*').eq('client_id', id).order('created_at', { ascending: false }).limit(4),
    db.from('client_programs').select('id, programs(name)').eq('client_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle()
  ])
  const latestCI = checkIns?.[0]

  function ciColour(val) {
    return val <= 2 ? '#ef4444' : val >= 4 ? '#22c55e' : 'var(--accent)'
  }

  function ciTrend(metric) {
    const vals = (checkIns || []).map(c => c[metric]).filter(v => v != null).reverse()
    if (vals.length < 2) return ''
    const bars = vals.map(v => `<div style="width:6px;border-radius:3px 3px 0 0;height:${(v/5)*28}px;background:${ciColour(v)};align-self:flex-end"></div>`).join('')
    return `<div style="display:flex;gap:2px;align-items:flex-end;height:28px;margin-top:4px">${bars}</div>`
  }

  const ciHtml = latestCI ? `
    <div class="card" style="margin-top:16px">
      <div class="card-body">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <div style="font-size:13px;font-weight:700">Latest check-in</div>
          <div style="font-size:11px;color:var(--text-muted)">${new Date(latestCI.created_at).toLocaleDateString('en-GB', { day:'numeric',month:'short' })}</div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:8px">
          ${[['Sleep','sleep'],['Energy','energy'],['Stress','stress'],['Soreness','soreness']].map(([label,key])=>`
          <div style="text-align:center;background:var(--surface-2);border-radius:8px;padding:8px">
            <div style="font-size:20px;font-weight:800;color:${ciColour(latestCI[key])}">${latestCI[key]}/5</div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:2px">${label}</div>
            ${ciTrend(key)}
          </div>`).join('')}
        </div>
        ${latestCI.notes ? `<p style="font-size:13px;color:var(--text-muted);margin:0;font-style:italic">"${latestCI.notes}"</p>` : ''}
        ${(checkIns?.length || 0) > 1 ? `
        <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border)">
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:8px">Previous check-ins</div>
          ${checkIns.slice(1).map(ci => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--border)">
            <span style="font-size:12px;color:var(--text-muted)">${new Date(ci.created_at).toLocaleDateString('en-GB', { day:'numeric',month:'short' })}</span>
            <div style="display:flex;gap:8px">
              ${[['S',ci.sleep],['E',ci.energy],['St',ci.stress],['So',ci.soreness]].map(([abbr,val])=>`
              <span style="font-size:12px;font-weight:600;color:${ciColour(val)}">${abbr}:${val}</span>`).join('')}
            </div>
          </div>`).join('')}
        </div>` : ''}
      </div>
    </div>` : ''
  el.innerHTML = clientOverviewTab(client, progAssign?.programs?.name || null) + ciHtml
}

function infoItem(label, value) {
  return `
    <div>
      <div style="font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin-bottom:4px">${label}</div>
      <div style="font-size:14px;font-weight:500">${value}</div>
    </div>
  `
}

// ─── UPDATE EMAIL MODAL ───────────────────────────────────────────────────────
function showUpdateEmailModal(clientId, currentEmail) {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.id = 'update-email-modal'
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2 class="modal-title">Update email</h2>
        <button class="modal-close" onclick="closeModal('update-email-modal')">✕</button>
      </div>
      <div class="field">
        <label class="field-label">Email address</label>
        <input class="field-input" id="ue-email" type="email" value="${currentEmail}" placeholder="client@example.com">
      </div>
      <p class="modal-error" id="ue-error"></p>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeModal('update-email-modal')">Cancel</button>
        <button class="btn-primary" onclick="saveUpdateEmail('${clientId}')">Save</button>
      </div>
    </div>
  `
  document.body.appendChild(overlay)
}

async function saveUpdateEmail(clientId) {
  const email   = document.getElementById('ue-email').value.trim()
  const errorEl = document.getElementById('ue-error')
  if (!email) { errorEl.textContent = 'Email is required'; return }

  log.info('saveUpdateEmail', 'updating client email', { clientId })
  const { error } = await db.from('clients').update({ email, updated_at: new Date().toISOString() }).eq('id', clientId).eq('coach_id', currentUser.id)
  if (error) { log.error('saveUpdateEmail', 'update failed', error); errorEl.textContent = error.message; return }
  log.ok('saveUpdateEmail', 'email updated', { clientId })

  closeModal('update-email-modal')
  openClient(clientId)
}

// ─── EDIT CLIENT MODAL ────────────────────────────────────────────────────────
async function showEditClientModal(id) {
  const { data: c } = await db.from('clients').select('*').eq('id', id).eq('coach_id', currentUser.id).single()
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.id = 'edit-client-modal'
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2 class="modal-title">Edit profile</h2>
        <button class="modal-close" onclick="closeModal('edit-client-modal')">✕</button>
      </div>
      <div class="field">
        <label class="field-label">Full name <span style="color:var(--danger)">*</span></label>
        <input class="field-input" id="ec-name" value="${c.full_name}">
      </div>
      <div class="field-row">
        <div class="field">
          <label class="field-label">Email</label>
          <input class="field-input" id="ec-email" type="email" value="${c.email || ''}">
        </div>
        <div class="field">
          <label class="field-label">Phone</label>
          <input class="field-input" id="ec-phone" value="${c.phone || ''}">
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label class="field-label">Date of birth</label>
          <input class="field-input" id="ec-dob" type="date" value="${c.date_of_birth || ''}">
        </div>
        <div class="field">
          <label class="field-label">Height (cm)</label>
          <input class="field-input" id="ec-height" type="number" value="${c.height_cm || ''}">
        </div>
      </div>
      <div class="field">
        <label class="field-label">Status</label>
        <select class="field-input" id="ec-status">
          <option value="active"   ${c.status==='active'   ?'selected':''}>Active</option>
          <option value="inactive" ${c.status==='inactive' ?'selected':''}>Inactive</option>
          <option value="archived" ${c.status==='archived' ?'selected':''}>Archived</option>
        </select>
      </div>
      <div class="field">
        <label class="field-label">Notes</label>
        <textarea class="field-input" id="ec-notes" rows="2" style="resize:vertical">${c.notes || ''}</textarea>
      </div>
      <p class="modal-error" id="ec-error"></p>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeModal('edit-client-modal')">Cancel</button>
        <button class="btn-primary" onclick="saveEditClient('${id}')">Save changes</button>
      </div>
    </div>
  `
  document.body.appendChild(overlay)
}

async function saveEditClient(id) {
  const name    = document.getElementById('ec-name').value.trim()
  const errorEl = document.getElementById('ec-error')
  if (!name) { errorEl.textContent = 'Name is required'; return }

  log.info('saveEditClient', 'updating client details', { clientId: id })
  const { error } = await db.from('clients').update({
    full_name:     name,
    email:         document.getElementById('ec-email').value.trim()  || null,
    phone:         document.getElementById('ec-phone').value.trim()  || null,
    date_of_birth: document.getElementById('ec-dob').value           || null,
    height_cm:     document.getElementById('ec-height').value        || null,
    status:        document.getElementById('ec-status').value,
    notes:         document.getElementById('ec-notes').value.trim()  || null,
    updated_at:    new Date().toISOString()
  }).eq('id', id).eq('coach_id', currentUser.id)

  if (error) { log.error('saveEditClient', 'update failed', error); errorEl.textContent = error.message; return }
  log.ok('saveEditClient', 'client updated', { clientId: id })

  closeModal('edit-client-modal')
  openClient(id)
}

// ─── CALENDAR ─────────────────────────────────────────────────────────────────
const EVENT_COLOURS = {
  session:     { bg: 'rgba(99,102,241,0.12)', text: 'var(--accent)',  dot: '#6366f1' },
  review:      { bg: 'rgba(251,191,36,0.12)', text: '#f59e0b',        dot: '#f59e0b' },
  competition: { bg: 'rgba(239,68,68,0.12)',  text: '#ef4444',        dot: '#ef4444' },
  holiday:     { bg: 'rgba(34,197,94,0.12)',  text: '#22c55e',        dot: '#22c55e' },
  gym:         { bg: 'rgba(168,85,247,0.12)', text: '#a855f7',        dot: '#a855f7' },
  other:       { bg: 'rgba(156,163,175,0.12)',text: 'var(--text-muted)', dot: '#9ca3af' }
}

let calendarYear, calendarMonth

