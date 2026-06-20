// ─── CONFIG ───────────────────────────────────────────────────────────────────
const _initialHash = window.location.hash
const SUPABASE_URL = 'https://avilxuiacmtgeoxxhfhc.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF2aWx4dWlhY210Z2VveHhoZmhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NjExNzcsImV4cCI6MjA5NzQzNzE3N30.SpVc5ZX_yf6gMrCJLxY9CxDki7PhBj2vbENha7tWBrc'
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY)

// ─── STATE ────────────────────────────────────────────────────────────────────
let currentUser    = null
let currentProfile = null
let currentPage    = 'dashboard'

// ─── SHELL HELPERS ────────────────────────────────────────────────────────────
function showAuth() {
  document.getElementById('auth-screen').style.display = 'flex'
  document.getElementById('app-shell').style.display   = 'none'
}

async function showApp() {
  document.getElementById('auth-screen').style.display = 'none'
  document.getElementById('app-shell').style.display   = 'flex'
  await loadUserInfo()
  navigate('dashboard')
}

async function loadUserInfo() {
  const { data } = await db
    .from('profiles')
    .select('full_name')
    .eq('id', currentUser.id)
    .single()

  currentProfile = data
  const name    = data?.full_name || currentUser.email
  const initial = name.charAt(0).toUpperCase()
  document.getElementById('user-name').textContent   = name.split(' ')[0]
  document.getElementById('user-avatar').textContent = initial
}

// ─── AUTH FORMS ───────────────────────────────────────────────────────────────
document.getElementById('show-signup').addEventListener('click', e => {
  e.preventDefault()
  document.getElementById('login-form').style.display  = 'none'
  document.getElementById('signup-form').style.display = 'block'
})

document.getElementById('show-login').addEventListener('click', e => {
  e.preventDefault()
  document.getElementById('signup-form').style.display = 'none'
  document.getElementById('login-form').style.display  = 'block'
})

document.getElementById('login-form').addEventListener('submit', async e => {
  e.preventDefault()
  const btn     = document.getElementById('login-submit')
  const errorEl = document.getElementById('login-error')
  btn.disabled     = true
  btn.textContent  = 'Signing in…'
  errorEl.textContent = ''

  const { error } = await db.auth.signInWithPassword({
    email:    document.getElementById('login-email').value,
    password: document.getElementById('login-password').value
  })

  if (error) {
    errorEl.textContent = error.message
    btn.disabled    = false
    btn.textContent = 'Sign in'
  }
})

document.getElementById('signup-form').addEventListener('submit', async e => {
  e.preventDefault()
  const btn     = document.getElementById('signup-submit')
  const errorEl = document.getElementById('signup-error')
  btn.disabled    = true
  btn.textContent = 'Creating account…'
  errorEl.textContent  = ''
  errorEl.style.color  = ''

  const { data, error } = await db.auth.signUp({
    email:    document.getElementById('signup-email').value,
    password: document.getElementById('signup-password').value,
    options:  { data: { full_name: document.getElementById('signup-name').value.trim() } }
  })

  if (error) {
    errorEl.textContent = error.message || 'Something went wrong. Please try again.'
    btn.disabled    = false
    btn.textContent = 'Create account'
  } else if (data.session) {
    errorEl.style.color = 'var(--success)'
    errorEl.textContent = 'Account created! Signing you in…'
  } else {
    errorEl.style.color = 'var(--warning)'
    errorEl.textContent = 'Check your email to confirm your account.'
    btn.disabled    = false
    btn.textContent = 'Create account'
  }
})

document.getElementById('sign-out-btn').addEventListener('click', async () => {
  await db.auth.signOut()
})

// ─── NAVIGATION ───────────────────────────────────────────────────────────────
function navigate(page) {
  currentPage = page

  document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page)
  })

  const container = document.getElementById('main-content')

  switch (page) {
    case 'dashboard': renderDashboard(container); break
    case 'clients':   renderClients(container);   break
    case 'workouts':  renderWorkouts(container);  break
    default: container.innerHTML = '<div class="loading-state">Page not found</div>'
  }
}

document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(el => {
  el.addEventListener('click', e => {
    e.preventDefault()
    navigate(el.dataset.page)
  })
})

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
async function renderDashboard(el) {
  el.innerHTML = '<div class="loading-state">Loading…</div>'

  const [
    { count: clientCount },
    { count: goalCount },
    { count: workoutCount }
  ] = await Promise.all([
    db.from('clients').select('*', { count: 'exact', head: true }),
    db.from('goals').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    db.from('workout_logs').select('*', { count: 'exact', head: true })
  ])

  const firstName = currentProfile?.full_name?.split(' ')[0] || 'Coach'
  const today     = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

  el.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Welcome back, ${firstName} 👋</h1>
        <p class="page-subtitle">${today}</p>
      </div>
    </div>

    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-value">${clientCount ?? 0}</div>
        <div class="stat-label">Total clients</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${goalCount ?? 0}</div>
        <div class="stat-label">Active goals</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${workoutCount ?? 0}</div>
        <div class="stat-label">Sessions logged</div>
      </div>
    </div>

    <div class="section">
      <div class="section-header">
        <h2 class="section-title">Quick actions</h2>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn-primary" onclick="navigate('clients')">+ Add client</button>
        <button class="btn-secondary" onclick="navigate('workouts')">Build a workout</button>
      </div>
    </div>
  `
}

// ─── CLIENTS LIST ─────────────────────────────────────────────────────────────
async function renderClients(el) {
  el.innerHTML = '<div class="loading-state">Loading…</div>'

  const { data: clients, error } = await db
    .from('clients')
    .select('*')
    .order('full_name')

  if (error) { el.innerHTML = `<div class="loading-state">${error.message}</div>`; return }

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
      ` : clients.map(c => `
        <div class="list-row" onclick="openClient('${c.id}')">
          <div class="avatar">${c.full_name.charAt(0).toUpperCase()}</div>
          <div class="row-info">
            <div class="row-name">${c.full_name}</div>
            <div class="row-meta">${c.email || 'No email added'}</div>
          </div>
          <div class="row-right">
            <span class="badge badge-${c.status}">${c.status}</span>
            <svg style="width:15px;height:15px;color:#d1d5db" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
        </div>
      `).join('')}
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

  const { error } = await db.from('clients').insert({
    coach_id:      currentUser.id,
    full_name:     name,
    email:         document.getElementById('nc-email').value.trim()  || null,
    phone:         document.getElementById('nc-phone').value.trim()  || null,
    date_of_birth: document.getElementById('nc-dob').value           || null,
    height_cm:     document.getElementById('nc-height').value        || null,
    notes:         document.getElementById('nc-notes').value.trim()  || null
  })

  if (error) { errorEl.textContent = error.message; return }

  closeModal('add-client-modal')
  renderClients(document.getElementById('main-content'))
}

// ─── CLIENT DETAIL ────────────────────────────────────────────────────────────
async function openClient(id) {
  const el = document.getElementById('main-content')
  el.innerHTML = '<div class="loading-state">Loading…</div>'

  const { data: client, error } = await db
    .from('clients')
    .select('*')
    .eq('id', id)
    .single()

  if (error) { el.innerHTML = `<div class="loading-state">${error.message}</div>`; return }

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
    </div>

    <div id="tab-content">
      ${clientOverviewTab(client)}
    </div>
  `
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
  }
}

function clientOverviewTab(client) {
  const dob = client.date_of_birth
    ? new Date(client.date_of_birth).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—'
  const age = client.date_of_birth
    ? Math.floor((Date.now() - new Date(client.date_of_birth)) / 31557600000)
    : null

  return `
    <div class="card">
      <div class="card-body">
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
  const { data: client } = await db.from('clients').select('*').eq('id', id).single()
  el.innerHTML = clientOverviewTab(client)
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

  const { error } = await db.from('clients').update({ email, updated_at: new Date().toISOString() }).eq('id', clientId)
  if (error) { errorEl.textContent = error.message; return }

  closeModal('update-email-modal')
  openClient(clientId)
}

// ─── EDIT CLIENT MODAL ────────────────────────────────────────────────────────
async function showEditClientModal(id) {
  const { data: c } = await db.from('clients').select('*').eq('id', id).single()
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

  const { error } = await db.from('clients').update({
    full_name:     name,
    email:         document.getElementById('ec-email').value.trim()  || null,
    phone:         document.getElementById('ec-phone').value.trim()  || null,
    date_of_birth: document.getElementById('ec-dob').value           || null,
    height_cm:     document.getElementById('ec-height').value        || null,
    status:        document.getElementById('ec-status').value,
    notes:         document.getElementById('ec-notes').value.trim()  || null,
    updated_at:    new Date().toISOString()
  }).eq('id', id)

  if (error) { errorEl.textContent = error.message; return }

  closeModal('edit-client-modal')
  openClient(id)
}

// ─── CLIENT GOALS ─────────────────────────────────────────────────────────────
async function renderClientGoals(clientId, el) {
  el.innerHTML = '<div class="loading-state">Loading…</div>'

  const { data: goals, error } = await db
    .from('goals')
    .select('*, goal_milestones(*)')
    .eq('client_id', clientId)
    .order('priority')
    .order('created_at')

  if (error) { el.innerHTML = `<div class="loading-state">${error.message}</div>`; return }

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

  if (error) { errorEl.textContent = error.message; return }

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

  const { error } = await db.from('goal_milestones').insert({
    goal_id:      goalId,
    title,
    description:  document.getElementById('am-desc').value.trim()  || null,
    target_value: document.getElementById('am-value').value         || null,
    target_date:  document.getElementById('am-date').value          || null
  })

  if (error) { errorEl.textContent = error.message; return }
  closeModal('add-milestone-modal')
  openGoal(goalId, clientId)
}

async function toggleMilestone(milestoneId, goalId, clientId) {
  const { data: m } = await db.from('goal_milestones').select('completed_at').eq('id', milestoneId).single()
  await db.from('goal_milestones').update({
    completed_at: m.completed_at ? null : new Date().toISOString()
  }).eq('id', milestoneId)
  openGoal(goalId, clientId)
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

  const { error } = await db.from('goal_check_ins').insert({
    goal_id:       goalId,
    created_by:    currentUser.id,
    date:          document.getElementById('ci-date').value,
    current_value: value || null,
    notes:         document.getElementById('ci-notes').value.trim() || null
  })

  if (error) { errorEl.textContent = error.message; return }

  // Update goal's current_value if a value was provided
  if (value) {
    await db.from('goals').update({ current_value: parseFloat(value), updated_at: new Date().toISOString() }).eq('id', goalId)
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

  const { error } = await db.from('goals').update({
    title,
    description:   document.getElementById('eg-desc').value.trim()    || null,
    status:        document.getElementById('eg-status').value,
    target_date:   document.getElementById('eg-date').value            || null,
    current_value: document.getElementById('eg-current').value         || null,
    target_value:  document.getElementById('eg-target').value          || null,
    updated_at:    new Date().toISOString()
  }).eq('id', goalId)

  if (error) { errorEl.textContent = error.message; return }
  closeModal('edit-goal-modal')
  openGoal(goalId, clientId)
}

async function deleteGoal(goalId, clientId) {
  if (!confirm('Delete this goal and all its milestones and check-ins? This cannot be undone.')) return
  await db.from('goals').delete().eq('id', goalId)
  closeModal('edit-goal-modal')
  const content = document.getElementById('tab-content')
  renderClientGoals(clientId, content)
}

// ─── WORKOUT HELPERS ─────────────────────────────────────────────────────────
function parseDuration(str) {
  if (!str) return null
  const parts = str.split(':')
  if (parts.length === 2) return parseInt(parts[0]) * 60 + parseInt(parts[1])
  return parseInt(str) * 60
}
function fmtDuration(secs) {
  if (!secs) return '—'
  const m = Math.floor(secs / 60), s = secs % 60
  return s ? `${m}:${String(s).padStart(2,'0')}` : `${m}:00`
}
function fmtRest(raw) {
  const digits = String(raw || '').replace(/\D/g, '').slice(-4)
  if (!digits) return ''
  if (digits.length <= 2) return '0:' + digits.padStart(2, '0')
  return digits.slice(0, -2).replace(/^0+/, '') + ':' + digits.slice(-2)
}
function fmtSet(s, type) {
  if (type === 'cardio') {
    const parts = [s.duration_seconds ? fmtDuration(s.duration_seconds) : null, s.distance_m ? (s.distance_m/1000).toFixed(2)+' km' : null]
    return parts.filter(Boolean).join(' · ') || '—'
  }
  const parts = [s.reps_achieved ? s.reps_achieved+' reps' : null, s.weight_kg ? s.weight_kg+'kg' : null, s.effort_value ? 'RPE '+s.effort_value : null]
  return parts.filter(Boolean).join(' · ') || '—'
}

// ─── WORKOUTS PAGE ────────────────────────────────────────────────────────────
async function renderWorkouts(el) {
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

function switchWorkoutTab(tab) {
  document.getElementById('wt-tab-templates').classList.toggle('active', tab === 'templates')
  document.getElementById('wt-tab-exercises').classList.toggle('active', tab === 'exercises')
  const el = document.getElementById('workout-tab-content')
  if (tab === 'templates') renderWorkoutTemplates(el)
  else renderExerciseLibrary(el)
}

async function renderWorkoutTemplates(el) {
  el.innerHTML = '<div class="loading-state">Loading…</div>'
  const { data: templates, error } = await db
    .from('workout_templates')
    .select('*, workout_template_exercises(id)')
    .order('name')

  if (error) { el.innerHTML = `<div class="loading-state">${error.message}</div>`; return }

  el.innerHTML = templates.length === 0 ? `
    <div class="empty-state">
      <div class="empty-icon">📋</div>
      <div class="empty-title">No templates yet</div>
      <div class="empty-text">Create a workout template to quickly build sessions for your clients</div>
      <button class="btn-primary" onclick="showCreateTemplateModal()">+ Create template</button>
    </div>
  ` : `<div class="list">${templates.map(t => `
    <div class="list-row" onclick="openTemplate('${t.id}')">
      <div style="width:40px;height:40px;border-radius:10px;background:rgba(99,102,241,.12);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">💪</div>
      <div class="row-info">
        <div class="row-name">${t.name}</div>
        <div class="row-meta">${t.description || (t.workout_template_exercises.length + ' exercises')}</div>
      </div>
      <div class="row-right">
        <span style="font-size:12px;color:var(--text-muted)">${t.workout_template_exercises.length} ex</span>
        <svg style="width:15px;height:15px;color:#d1d5db" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
    </div>
  `).join('')}</div>`
}

async function renderExerciseLibrary(el) {
  el.innerHTML = '<div class="loading-state">Loading…</div>'
  const { data: exercises, error } = await db.from('exercises').select('*').order('name')

  if (error) { el.innerHTML = `<div class="loading-state">${error.message}</div>`; return }

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

  const { error } = await db.from('exercises').insert({
    coach_id:      currentUser.id,
    name,
    muscle_group:  document.getElementById('ae-muscle').value   || null,
    category:      document.getElementById('ae-category').value || null,
    default_sets:  document.getElementById('ae-sets').value     || null,
    default_reps:  document.getElementById('ae-reps').value     || null,
    notes:         document.getElementById('ae-notes').value.trim() || null
  })

  if (error) { errorEl.textContent = error.message; return }
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

  const { error } = await db.from('exercises').update({
    name,
    muscle_group:  document.getElementById('ee-muscle').value    || null,
    category:      document.getElementById('ee-category').value  || null,
    default_sets:  document.getElementById('ee-sets').value      || null,
    default_reps:  document.getElementById('ee-reps').value      || null,
    notes:         document.getElementById('ee-notes').value.trim() || null
  }).eq('id', id)

  if (error) { errorEl.textContent = error.message; return }
  closeModal('edit-exercise-modal')
  renderExerciseLibrary(document.getElementById('workout-tab-content'))
}

async function deleteExercise(id) {
  if (!confirm('Delete this exercise? It will be removed from any templates that use it.')) return
  await db.from('exercises').delete().eq('id', id)
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

  const { data, error } = await db.from('workout_templates').insert({
    coach_id:    currentUser.id,
    name,
    description: document.getElementById('ct-desc').value.trim() || null
  }).select().single()

  if (error) { errorEl.textContent = error.message; return }
  closeModal('create-template-modal')
  openTemplate(data.id)
}

async function openTemplate(id) {
  const el = document.getElementById('main-content')
  el.innerHTML = '<div class="loading-state">Loading…</div>'

  const { data: t, error } = await db
    .from('workout_templates')
    .select('*, workout_template_exercises(*)')
    .eq('id', id)
    .single()

  if (error) { el.innerHTML = `<div class="loading-state">${error.message}</div>`; return }

  const exercises = (t.workout_template_exercises || []).sort((a, b) => a.order_index - b.order_index)

  el.innerHTML = `
    <a class="back-btn" href="#" onclick="navigate('workouts');return false">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
      Templates
    </a>

    <div class="page-header">
      <div>
        <h1 class="page-title">${t.name}</h1>
        ${t.description ? `<p class="page-subtitle">${t.description}</p>` : ''}
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn-secondary" onclick="showEditTemplateModal('${id}')">Edit</button>
        <button class="btn-primary" onclick="showAddExerciseToTemplateModal('${id}')">+ Add exercise</button>
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
                </div>
                ${ex.sets_json?.length ? (() => {
                  const rows = ex.sets_json.map((s, si) => {
                    const parts = isCardio
                      ? [s.duration || null, s.distance ? s.distance+' km' : null]
                      : [s.reps || null, s.weight ? s.weight+'kg' : null, s.rest ? s.rest+'s rest' : null, s.rpe ? 'RPE '+s.rpe : null]
                    const summary = parts.filter(Boolean).join(' · ')
                    return summary ? `<div style="font-size:11.5px;color:var(--text-muted)"><span style="font-weight:600;color:var(--text-muted)">Set ${si+1}:</span> ${summary}</div>` : null
                  }).filter(Boolean)
                  return rows.length ? `<div style="display:flex;flex-direction:column;gap:1px;margin-top:4px">${rows.join('')}</div>` : `<div style="font-size:12px;color:var(--text-muted);margin-top:2px">${meta}</div>`
                })() : `<div style="font-size:12px;color:var(--text-muted);margin-top:2px">${meta}</div>`}
                ${ex.notes ? `<div style="font-size:11.5px;color:var(--accent);margin-top:3px;font-style:italic">${ex.notes}</div>` : ''}
              </div>
              <button class="btn-secondary" style="font-size:12px;padding:4px 10px;flex-shrink:0" onclick="showEditTemplateExerciseModal('${ex.id}','${id}')">Edit</button>
            </div>
          </div>
        </div>`
      }).join('')}</div>`}
    </div>
  `
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
function parseRest(str) {
  if (!str) return 0
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
        <span style="font-size:12px;font-weight:700;color:#374151">Set ${i+1}</span>
        <div style="display:flex;gap:4px">
          ${!isCardio ? `
            ${tog('AMRAP', s.amrap, `toggleTsSet(${i},'amrap','${containerId}')`)}
            ${tog('⟺ Uni', s.unilateral, `toggleTsSet(${i},'unilateral','${containerId}')`)}
            ${tog('⏱ Timed', s.timed, `toggleTsSet(${i},'timed','${containerId}')`)}
          ` : ''}
          <button type="button" onclick="flushTemplateSets('${containerId}');window._templateSets.splice(${i},1);renderTemplateSets('${containerId}',document.getElementById('${tid}')?.value||'strength')" style="width:26px;height:26px;border-radius:6px;border:1px solid #d1d5db;background:transparent;color:#9ca3af;cursor:pointer;font-size:15px;line-height:1">×</button>
        </div>
      </div>
      ${isCardio ? `
        ${row('Duration', mini(`ts-duration-${i}`,'type="text" placeholder="20:00"'+(s.duration?` value="${s.duration}"`:'')))}
        ${row('Distance (km)', mini(`ts-distance-${i}`,'type="number" step="0.01" placeholder="—"'+(s.distance?` value="${s.distance}"`:'')))}
        ${row('Rest', mini(`ts-restmin-${i}`,'type="text" placeholder="2:00"'+(s.restMin?` value="${s.restMin}"`:'')) + dash + mini(`ts-restmax-${i}`,'type="text" placeholder="—"'+(s.restMax?` value="${s.restMax}"`:'')))}
        ${row('RPE', mini(`ts-emin-${i}`,'type="number" step="0.5" min="1" max="10" placeholder="—"'+(s.effortMin?` value="${s.effortMin}"`:'')))}
      ` : `
        ${row('Reps', mini(`ts-rmin-${i}`,'type="number" placeholder="0"'+(s.repsMin?` value="${s.repsMin}"`:'')) + dash + mini(`ts-rmax-${i}`,'type="number" placeholder="0"'+(s.repsMax?` value="${s.repsMax}"`:'')))}
        ${row('Weight', mini(`ts-weight-${i}`,'type="text" placeholder="Optional"'+(s.weight?` value="${s.weight}"`:'')))}
        ${row('Intensity (%1RM)', mini(`ts-imin-${i}`,'type="number" placeholder="Min"'+(s.intensityMin?` value="${s.intensityMin}"`:'')) + dash + mini(`ts-imax-${i}`,'type="number" placeholder="Max"'+(s.intensityMax?` value="${s.intensityMax}"`:'')))}
        ${row('Rest between sets', mini(`ts-restmin-${i}`,'type="text" placeholder="2:00" onblur="this.value=this.value?fmtRest(parseRest(this.value)):this.value"'+(s.restMin?` value="${s.restMin}"`:'')) + dash + mini(`ts-restmax-${i}`,'type="text" placeholder="—" onblur="this.value=this.value?fmtRest(parseRest(this.value)):this.value"'+(s.restMax?` value="${s.restMax}"`:'')))}
        ${row(etbtn('RPE','rpe')+etbtn('RIR','rir'), mini(`ts-emin-${i}`,'type="number" step="0.5" min="1" max="10" placeholder="Min"'+(s.effortMin?` value="${s.effortMin}"`:'')) + dash + mini(`ts-emax-${i}`,'type="number" step="0.5" min="1" max="10" placeholder="Max"'+(s.effortMax?` value="${s.effortMax}"`:'')))}
        ${row('Tempo', mini(`ts-tempo-${i}`,'type="text" placeholder="e.g. 3011"'+(s.tempo?` value="${s.tempo}"`:'')))}
        ${row('Countdown (s)', mini(`ts-cd-${i}`,'type="number" placeholder="Optional"'+(s.countdown?` value="${s.countdown}"`:'')))}
      `}
    </div>`
  }).join('') + `<button type="button" onclick="flushTemplateSets('${containerId}');window._templateSets.push({effortType:'rpe'});renderTemplateSets('${containerId}',document.getElementById('${tid}')?.value||'strength')" style="margin-top:6px;font-size:13px;color:var(--accent);background:none;border:none;cursor:pointer;font-weight:600">+ Add set</button>`
}

function showAddExerciseToTemplateModal(templateId) {
  db.from('exercises').select('*').order('name').then(({ data: exercises }) => {
    window._templateSets = [{ effortType: 'rpe' }]
    const overlay = document.createElement('div')
    overlay.className = 'modal-overlay'
    overlay.id = 'add-to-template-modal'
    overlay.innerHTML = `
      <div class="modal" style="max-width:560px;max-height:90vh;overflow-y:auto">
        <div class="modal-header">
          <h2 class="modal-title">Add exercise</h2>
          <button class="modal-close" onclick="closeModal('add-to-template-modal')">✕</button>
        </div>
        <div class="field-row">
          <div class="field" style="flex:2">
            <label class="field-label">Pick from library</label>
            <select class="field-input" id="att-exercise">
              <option value="">— or type a custom name below —</option>
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
        <p class="modal-error" id="att-error"></p>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="closeModal('add-to-template-modal')">Cancel</button>
          <button class="btn-primary" onclick="saveExerciseToTemplate('${templateId}')">Add exercise</button>
        </div>
      </div>
    `
    document.body.appendChild(overlay)
    renderTemplateSets('att-sets-container', 'strength')
    document.getElementById('att-name').focus()

    document.getElementById('att-exercise').addEventListener('change', function() {
      const opt = this.options[this.selectedIndex]
      if (opt.value) document.getElementById('att-name').value = opt.dataset.name || ''
    })
  })
}

async function saveExerciseToTemplate(templateId) {
  flushTemplateSets('att-sets-container')
  const exerciseId = document.getElementById('att-exercise').value
  const name = document.getElementById('att-name').value.trim()
  const errorEl = document.getElementById('att-error')
  if (!name) { errorEl.textContent = 'Exercise name is required'; return }

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
    sets:          cleanSets.length || null,
    sets_json:     cleanSets.length ? cleanSets : null,
    notes:         document.getElementById('att-notes').value.trim() || null
  })

  if (error) { errorEl.textContent = error.message; return }
  closeModal('add-to-template-modal')
  openTemplate(templateId)
}

async function showEditTemplateExerciseModal(templateExId, templateId) {
  const { data: ex } = await db.from('workout_template_exercises').select('*').eq('id', templateExId).single()
  window._templateSets = ex.sets_json?.length ? ex.sets_json.map(s => ({...s})) : (ex.sets ? Array.from({length: ex.sets}, () => ({})) : [{}])

  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.id = 'edit-tex-modal'
  overlay.innerHTML = `
    <div class="modal" style="max-width:560px;max-height:90vh;overflow-y:auto">
      <div class="modal-header">
        <h2 class="modal-title">Edit: ${ex.exercise_name}</h2>
        <button class="modal-close" onclick="closeModal('edit-tex-modal')">✕</button>
      </div>
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

  const { error } = await db.from('workout_template_exercises').update({
    exercise_name: name,
    exercise_type: document.getElementById('ett-type').value,
    sets:          sets.length || null,
    sets_json:     sets.length ? sets : null,
    notes:         document.getElementById('etex-notes').value.trim() || null
  }).eq('id', texId)
  if (error) { errorEl.textContent = error.message; return }
  closeModal('edit-tex-modal')
  openTemplate(templateId)
}

async function deleteTemplateExercise(texId, templateId) {
  await db.from('workout_template_exercises').delete().eq('id', texId)
  closeModal('edit-tex-modal')
  openTemplate(templateId)
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
  const { error } = await db.from('workout_templates').update({
    name,
    description: document.getElementById('et-desc').value.trim() || null
  }).eq('id', id)
  if (error) { errorEl.textContent = error.message; return }
  closeModal('edit-template-modal')
  openTemplate(id)
}

async function deleteTemplate(id) {
  if (!confirm('Delete this template? This cannot be undone.')) return
  await db.from('workout_templates').delete().eq('id', id)
  closeModal('edit-template-modal')
  navigate('workouts')
}

// ─── CLIENT WORKOUTS TAB ──────────────────────────────────────────────────────
async function renderClientWorkouts(clientId, el) {
  el.innerHTML = '<div class="loading-state">Loading…</div>'

  const { data: logs, error } = await db
    .from('workout_logs')
    .select('*, workout_log_exercises(id)')
    .eq('client_id', clientId)
    .order('date', { ascending: false })

  if (error) { el.innerHTML = `<div class="loading-state">${error.message}</div>`; return }

  el.innerHTML = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:16px">
      <button class="btn-primary" onclick="showLogSessionModal('${clientId}')">+ Log session</button>
    </div>
    <div class="list">
      ${logs.length === 0 ? `
        <div class="empty-state">
          <div class="empty-icon">💪</div>
          <div class="empty-title">No sessions logged yet</div>
          <div class="empty-text">Log a workout to start tracking this client's training</div>
          <button class="btn-primary" onclick="showLogSessionModal('${clientId}')">+ Log first session</button>
        </div>
      ` : logs.map(l => {
        const dateStr = new Date(l.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
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
  `
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
        set.repsMax = g(`ls-rmax-${bi}-${si}`)
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
  return (Math.round(parseFloat(oneRM) * parseFloat(pct) / 100 * 2) / 2).toFixed(1)
}

function renderLogExercises() {
  const container = document.getElementById('ls-exercises')
  if (!container) return

  const hdr = (txt) => `<span style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);text-align:center">${txt}</span>`
  const si_style = `class="field-input" style="padding:4px 5px;font-size:12px;text-align:center;min-width:0"`

  container.innerHTML = window._logBlocks.map((block, bi) => {
    const isCardio = block.type === 'cardio'
    const isRIR = block.effortMode === 'RIR'
    const orm = parseFloat(block.oneRM) || 0

    // strength: Set | RepsMin | RepsMax | Weight | PctMin | PctMax | Effort | Rest | ×
    const GRID = isCardio
      ? '28px 1fr 1fr 22px'
      : '28px 42px 42px 58px 42px 42px 52px 54px 22px'

    const colHeaders = isCardio ? `
      ${hdr('')}
      ${hdr('Duration')}
      ${hdr('Distance (km)')}
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
          <button onclick="window._logBlocks[${bi}].effortMode='RPE';renderLogExercises()" style="flex:1;padding:2px 0;font-size:9px;font-weight:600;border:none;cursor:pointer;background:${!isRIR?'var(--accent)':'transparent'};color:${!isRIR?'#fff':'var(--text-muted)'}">RPE</button>
          <button onclick="window._logBlocks[${bi}].effortMode='RIR';renderLogExercises()" style="flex:1;padding:2px 0;font-size:9px;font-weight:600;border:none;cursor:pointer;background:${isRIR?'var(--accent)':'transparent'};color:${isRIR?'#fff':'var(--text-muted)'}">RIR</button>
        </div>
      </div>
      ${hdr('Rest')}
      <span></span>
    `

    const setsHtml = block.sets.map((s, si) => {
      const wFromPct = orm
        ? `<div style="font-size:9px;color:var(--accent);text-align:center;margin-top:1px">${_calcWeightFromPct(orm, s.pctMin) || ''}${s.pctMax && s.pctMax !== s.pctMin ? '–' + _calcWeightFromPct(orm, s.pctMax) : ''}${orm && (s.pctMin || s.pctMax) ? 'kg' : ''}</div>`
        : ''
      return `
        <div style="display:grid;grid-template-columns:${GRID};gap:3px;align-items:center;margin-bottom:3px">
          <span style="font-size:11px;font-weight:600;color:var(--text-muted);text-align:center">${si + 1}</span>
          ${isCardio ? `
            <input id="ls-dur-${bi}-${si}" ${si_style} type="text" placeholder="0:00" value="${s.duration || ''}" oninput="this.value=fmtRest(this.value)">
            <input id="ls-dist-${bi}-${si}" ${si_style} type="number" step="0.01" placeholder="km" value="${s.distance || ''}">
          ` : `
            <input id="ls-rmin-${bi}-${si}" ${si_style} type="number" placeholder="min" value="${s.repsMin || ''}">
            <input id="ls-rmax-${bi}-${si}" ${si_style} type="number" placeholder="max" value="${s.repsMax || ''}">
            <div>
              <input id="ls-weight-${bi}-${si}" ${si_style} type="number" step="0.5" placeholder="kg" value="${orm && (s.pctMin||s.pctMax) ? (_calcWeightFromPct(orm,s.pctMin)||s.weight||'') : (s.weight||'')}">
            </div>
            <input id="ls-pmin-${bi}-${si}" ${si_style} type="number" placeholder="%" value="${s.pctMin || ''}" oninput="flushLogState();renderLogExercises()">
            <div>
              <input id="ls-pmax-${bi}-${si}" ${si_style} type="number" placeholder="%" value="${s.pctMax || ''}" oninput="flushLogState();renderLogExercises()">
              ${wFromPct}
            </div>
            <input id="ls-effort-${bi}-${si}" ${si_style} type="number" step="0.5" min="0" max="10" placeholder="${isRIR?'0–5':'1–10'}" value="${s.effort || ''}">
            <input id="ls-rest-${bi}-${si}" ${si_style} type="text" placeholder="0:00" value="${s.rest || ''}" oninput="this.value=fmtRest(this.value)">
          `}
          <button onclick="flushLogState();window._logBlocks[${bi}].sets.splice(${si},1);renderLogExercises()" style="width:22px;height:22px;border-radius:5px;border:1px solid var(--border);background:transparent;color:var(--text-muted);cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;padding:0">×</button>
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
          <input id="ls-orm-${bi}" class="field-input" style="width:72px;padding:4px 8px;font-size:12px;text-align:center" type="number" step="0.5" placeholder="e.g. 100" value="${block.oneRM || ''}" oninput="block.oneRM=this.value;renderLogExercises()">
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
  const { data: templates } = await db
    .from('workout_templates')
    .select('*, workout_template_exercises(*)')
    .order('name')

  window._logBlocks = []

  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.id = 'log-session-modal'
  overlay.innerHTML = `
    <div class="modal" style="max-width:580px;max-height:90vh;overflow-y:auto">
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
          ${(templates || []).map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
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
  document.body.appendChild(overlay)
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

  const { data: log, error } = await db.from('workout_logs').insert({
    coach_id:    currentUser.id,
    client_id:   clientId,
    template_id: document.getElementById('ls-template').value || null,
    name,
    date:        document.getElementById('ls-date').value,
    notes:       document.getElementById('ls-notes').value.trim() || null
  }).select().single()

  if (error) { errorEl.textContent = error.message; return }

  for (let bi = 0; bi < blocks.length; bi++) {
    const block = blocks[bi]
    const { data: logEx, error: exErr } = await db.from('workout_log_exercises').insert({
      log_id:        log.id,
      exercise_name: block.name.trim(),
      exercise_type: block.type,
      order_index:   bi
    }).select().single()

    if (exErr) { errorEl.textContent = exErr.message; return }

    const setsToInsert = block.sets.map((s, si) => {
      const row = {
        workout_log_exercise_id: logEx.id,
        set_number: si + 1,
        set_type: 'working'
      }
      if (block.type === 'cardio') {
        if (s.duration) row.duration_seconds = parseDuration(s.duration)
        if (s.distance) row.distance_m = Math.round(parseFloat(s.distance) * 1000)
      } else {
        const rMin = parseInt(s.repsMin), rMax = parseInt(s.repsMax)
        if (!isNaN(rMin)) row.reps_achieved = rMin
        if (s.weight) row.weight_kg = parseFloat(s.weight)
        if (s.effort) {
          row.effort_type = block.effortMode === 'RIR' ? 'rir' : 'rpe'
          row.effort_value = parseFloat(s.effort)
        }
        if (s.rest) row.notes = (row.notes || '') + `rest:${s.rest}`
      }
      return row
    }).filter(s => Object.keys(s).length > 3)

    if (setsToInsert.length) {
      const { error: setsErr } = await db.from('workout_log_sets').insert(setsToInsert)
      if (setsErr) { errorEl.textContent = setsErr.message; return }
    }
  }

  closeModal('log-session-modal')
  window._logBlocks = []
  const tabContent = document.getElementById('tab-content')
  if (tabContent) renderClientWorkouts(clientId, tabContent)
}

async function openWorkoutLog(logId, clientId) {
  const el = document.getElementById('tab-content')
  el.innerHTML = '<div class="loading-state">Loading…</div>'

  const { data: log } = await db
    .from('workout_logs')
    .select('*, workout_log_exercises(*, workout_log_sets(*))')
    .eq('id', logId)
    .single()

  const exercises = (log.workout_log_exercises || []).sort((a, b) => a.order_index - b.order_index)
  const dateStr = new Date(log.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  el.innerHTML = `
    <a class="back-btn" href="#" onclick="backToClientWorkouts('${clientId}');return false">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
      All sessions
    </a>

    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:24px;flex-wrap:wrap">
      <div>
        <h2 style="font-size:20px;font-weight:700;margin-bottom:4px">${log.name}</h2>
        <p style="color:var(--text-muted)">${dateStr}</p>
      </div>
      <button class="btn-danger" style="font-size:13px;padding:6px 12px" onclick="deleteWorkoutLog('${logId}','${clientId}')">Delete</button>
    </div>

    ${exercises.length === 0 ? `<div class="empty-state"><div class="empty-text">No exercises recorded</div></div>` :
      exercises.map((ex, i) => {
        const sets = (ex.workout_log_sets || []).sort((a, b) => a.set_number - b.set_number)
        const isCardio = ex.exercise_type === 'cardio'
        return `
          <div class="card" style="margin-bottom:12px">
            <div class="card-body">
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
                <div style="width:26px;height:26px;border-radius:50%;background:rgba(99,102,241,.12);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--accent)">${i+1}</div>
                <span style="font-weight:600;font-size:15px">${ex.exercise_name}</span>
                ${isCardio ? `<span style="font-size:11px;font-weight:600;padding:1px 7px;border-radius:4px;background:rgba(6,182,212,.12);color:#06b6d4">Cardio</span>` : ''}
              </div>
              ${sets.length === 0 ? `<div style="color:var(--text-muted);font-size:13px">No sets recorded</div>` : `
                <table style="width:100%;border-collapse:collapse">
                  <thead>
                    <tr style="border-bottom:1px solid var(--border)">
                      <th style="text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);padding:0 12px 8px 0">Set</th>
                      ${isCardio
                        ? `<th style="text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);padding:0 12px 8px 0">Duration</th><th style="text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);padding:0 0 8px">Distance</th>`
                        : `<th style="text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);padding:0 12px 8px 0">Reps</th><th style="text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);padding:0 12px 8px 0">Weight</th><th style="text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);padding:0 0 8px">RPE</th>`
                      }
                    </tr>
                  </thead>
                  <tbody>
                    ${sets.map(s => `
                      <tr style="border-bottom:1px solid var(--border)">
                        <td style="padding:8px 12px 8px 0;font-size:13px;color:var(--text-muted);font-weight:600">Set ${s.set_number}</td>
                        ${isCardio
                          ? `<td style="padding:8px 12px 8px 0;font-size:13px">${s.duration_seconds ? fmtDuration(s.duration_seconds) : '—'}</td><td style="padding:8px 0;font-size:13px">${s.distance_m ? (s.distance_m/1000).toFixed(2)+' km' : '—'}</td>`
                          : `<td style="padding:8px 12px 8px 0;font-size:13px">${s.reps_achieved || '—'}</td><td style="padding:8px 12px 8px 0;font-size:13px">${s.weight_kg ? s.weight_kg+' kg' : '—'}</td><td style="padding:8px 0;font-size:13px">${s.effort_value != null ? 'RPE '+s.effort_value : '—'}</td>`
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
    ${log.notes ? `<div class="card"><div class="card-body"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:6px">Notes</div><div style="font-size:13.5px;color:var(--text-muted)">${log.notes}</div></div></div>` : ''}
  `
}

function backToClientWorkouts(clientId) {
  renderClientWorkouts(clientId, document.getElementById('tab-content'))
}

async function deleteWorkoutLog(logId, clientId) {
  if (!confirm('Delete this session? This cannot be undone.')) return
  await db.from('workout_logs').delete().eq('id', logId)
  renderClientWorkouts(clientId, document.getElementById('tab-content'))
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

async function renderClientPerformance(clientId, el) {
  el.innerHTML = '<div style="padding:24px;color:var(--text-muted);text-align:center">Loading…</div>'

  const { data: logs, error } = await db
    .from('performance_logs')
    .select('*')
    .eq('client_id', clientId)
    .order('date', { ascending: false })

  if (error) { el.innerHTML = `<div class="empty-state"><div class="empty-title">Error loading performance data</div></div>`; return }

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
        <button onclick="savePerformanceLog('${clientId}')" class="btn-primary" style="width:100%">Save record</button>
      </div>

      <!-- Records by category -->
      ${PERF_CATEGORIES.map(cat => {
        const catLogs = byCategory[cat.id]
        if (catLogs.length === 0) return ''
        const colour = PERF_COLOURS[cat.id]

        // Group by name to find PBs
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
          <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden">
            <table style="width:100%;border-collapse:collapse">
              <thead>
                <tr style="background:var(--surface2)">
                  <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em">Exercise / Name</th>
                  <th style="padding:10px 14px;text-align:right;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em">Best</th>
                  <th style="padding:10px 14px;text-align:right;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em">Date</th>
                  <th style="padding:10px 14px;text-align:right;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em">Records</th>
                  <th style="padding:10px 14px;width:40px"></th>
                </tr>
              </thead>
              <tbody>
                ${Object.entries(byName).map(([name, records], i) => {
                  const best = records[0]
                  return `
                  <tr style="border-top:${i > 0 ? '1px solid var(--border)' : 'none'}">
                    <td style="padding:10px 14px;font-size:13px;font-weight:600;color:var(--text)">${name}</td>
                    <td style="padding:10px 14px;text-align:right;font-size:14px;font-weight:700;color:${colour}">${best.value} ${best.unit}</td>
                    <td style="padding:10px 14px;text-align:right;font-size:12px;color:var(--text-muted)">${best.date}</td>
                    <td style="padding:10px 14px;text-align:right;font-size:12px;color:var(--text-muted)">${records.length}</td>
                    <td style="padding:10px 14px;text-align:right">
                      <button onclick="deletePerfLog('${best.id}','${clientId}')" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:15px;padding:2px 6px;border-radius:4px" title="Delete latest">×</button>
                    </td>
                  </tr>`
                }).join('')}
              </tbody>
            </table>
          </div>
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

  if (!category || !date || !name || !value || !unit) return alert('Please fill in all required fields.')

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

  if (error) { alert('Error saving: ' + error.message); return }
  renderClientPerformance(clientId, document.getElementById('tab-content'))
}

async function deletePerfLog(id, clientId) {
  if (!confirm('Delete this record?')) return
  await db.from('performance_logs').delete().eq('id', id)
  renderClientPerformance(clientId, document.getElementById('tab-content'))
}

// ─── WEIGHT TRACKING ──────────────────────────────────────────────────────────

async function renderClientWeight(clientId, el) {
  el.innerHTML = '<div style="padding:24px;color:var(--text-muted);text-align:center">Loading…</div>'

  const { data: logs, error } = await db
    .from('weight_logs')
    .select('*')
    .eq('client_id', clientId)
    .order('date', { ascending: false })

  if (error) { el.innerHTML = `<div class="empty-state"><div class="empty-title">Error loading weight data</div></div>`; return }

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
        <canvas id="weight-chart" height="100"></canvas>
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
    const hasBf = chronological.some(l => l.body_fat_pct != null)
    const datasets = [
      {
        label: 'Weight (kg)',
        data: chronological.map(l => parseFloat(l.weight_kg)),
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99,102,241,0.08)',
        fill: true,
        tension: 0.3,
        pointRadius: 4,
        pointHoverRadius: 6,
        yAxisID: 'y'
      }
    ]
    if (hasBf) datasets.push({
      label: 'Body fat %',
      data: chronological.map(l => l.body_fat_pct != null ? parseFloat(l.body_fat_pct) : null),
      borderColor: '#f59e0b',
      backgroundColor: 'transparent',
      fill: false,
      tension: 0.3,
      pointRadius: 4,
      pointHoverRadius: 6,
      spanGaps: true,
      yAxisID: 'y2'
    })

    new Chart(document.getElementById('weight-chart'), {
      type: 'line',
      data: { labels: chronological.map(l => l.date), datasets },
      options: {
        responsive: true,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: hasBf, labels: { font: { size: 12 }, color: '#6b7280' } },
          tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + ctx.parsed.y } }
        },
        scales: {
          x: { ticks: { color: '#9ca3af', font: { size: 11 } }, grid: { color: 'rgba(0,0,0,0.05)' } },
          y: {
            position: 'left',
            ticks: { color: '#6366f1', font: { size: 11 }, callback: v => v + ' kg' },
            grid: { color: 'rgba(0,0,0,0.05)' }
          },
          ...(hasBf ? { y2: {
            position: 'right',
            ticks: { color: '#f59e0b', font: { size: 11 }, callback: v => v + '%' },
            grid: { drawOnChartArea: false }
          }} : {})
        }
      }
    })
  }
}

async function sendClientInvite(clientId, email) {
  if (!confirm(`Send invite email to ${email}?`)) return

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
    alert('Failed to send invite: ' + (json.error || 'Unknown error'))
    btn.disabled = false
    btn.textContent = '✉ Send invite'
    return
  }

  await db.from('clients').update({ invited_at: new Date().toISOString() }).eq('id', clientId)

  alert(`Invite sent to ${email}`)
  openClient(clientId)
}

async function saveWeightLog(clientId) {
  const date   = document.getElementById('wl-date')?.value
  const weight = document.getElementById('wl-weight')?.value
  const bf     = document.getElementById('wl-bf')?.value
  const notes  = document.getElementById('wl-notes')?.value?.trim()

  if (!date || !weight) return alert('Date and weight are required.')

  const { error } = await db.from('weight_logs').insert({
    client_id:    clientId,
    date,
    weight_kg:    parseFloat(weight),
    body_fat_pct: bf ? parseFloat(bf) : null,
    notes:        notes || null
  })

  if (error) { alert('Error saving: ' + error.message); return }
  renderClientWeight(clientId, document.getElementById('tab-content'))
}

async function deleteWeightLog(id, clientId) {
  if (!confirm('Delete this entry?')) return
  await db.from('weight_logs').delete().eq('id', id)
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
  const { error } = await db.auth.updateUser({
    password,
    data: { full_name: name }
  })

  if (error) {
    errorEl.textContent = error.message
    btn.disabled = false
    btn.textContent = 'Activate account'
    return
  }

  // Clear the hash so the invite token isn't reused
  history.replaceState(null, '', window.location.pathname)
  showApp()
})

// ─── BOOT ─────────────────────────────────────────────────────────────────────

// Handle invite links immediately — don't wait for auth event
if (_initialHash.includes('type=invite')) {
  try { showInviteForm() } catch(e) { console.error('showInviteForm failed:', e) }
}

db.auth.onAuthStateChange((event, session) => {
  currentUser = session?.user ?? null

  if (event === 'PASSWORD_RECOVERY') return

  // If this is an invite flow, stay on invite form until user submits
  if (_initialHash.includes('type=invite') && event !== 'USER_UPDATED') return

  if (currentUser) {
    showApp()
  } else {
    showAuth()
  }
})
