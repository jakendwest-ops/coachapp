// ─── CONFIG ───────────────────────────────────────────────────────────────────
const _initialHash = window.location.hash

// ─── LOGGER ───────────────────────────────────────────────────────────────────
// Structured console logging. All DB operations log [tag] before/after.
// Open DevTools → Console to trace any failure instantly.
const log = {
  info:  (tag, msg, data) => console.log(`[${tag}]`, msg, data ?? ''),
  warn:  (tag, msg, data) => console.warn(`[${tag}]`, msg, data ?? ''),
  error: (tag, msg, data) => console.error(`[${tag}] ❌`, msg, data ?? ''),
  ok:    (tag, msg, data) => console.log(`[${tag}] ✓`, msg, data ?? ''),
}
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
  applyRoleUI()
  navigate(currentProfile?.role === 'client' ? 'client-dashboard' : 'dashboard')
}

async function loadUserInfo() {
  log.info('loadUserInfo', 'fetching profile', { userId: currentUser.id })
  const { data, error } = await db
    .from('profiles')
    .select('full_name, role')
    .eq('id', currentUser.id)
    .single()

  if (error) log.error('loadUserInfo', 'profile fetch failed', error)
  currentProfile = data
  const name    = data?.full_name || currentUser.email
  const initial = name.charAt(0).toUpperCase()
  document.getElementById('user-name').textContent   = name.split(' ')[0]
  document.getElementById('user-avatar').textContent = initial

  // Check if this account also has a client record (master account detection)
  if (data?.role === 'coach') {
    const { data: clientRec } = await db.from('clients').select('id').eq('user_id', currentUser.id).single()
    if (clientRec) {
      window._masterAccount = true
      document.getElementById('view-switcher').style.display = 'block'
      const mvs = document.getElementById('mobile-view-switcher')
      if (mvs) mvs.style.display = 'flex'
      updateViewSwitcherButtons('coach')
    }
  }
}

function applyRoleUI() {
  const isClient = currentProfile?.role === 'client'
  document.querySelectorAll('[data-page="clients"], [data-page="programs"]').forEach(el => {
    el.style.display = isClient ? 'none' : ''
  })
  // Workouts is visible to both — clients get their own view of it
}

function updateViewSwitcherButtons(activeView) {
  const active   = 'background:var(--accent);color:#fff'
  const inactive = 'background:transparent;color:var(--text-muted)'
  const base     = ';border:none;cursor:pointer;font-weight:700;transition:all .15s'

  // Sidebar buttons
  const sc = document.getElementById('vs-coach'), sk = document.getElementById('vs-client')
  if (sc) { sc.style.cssText  = (activeView==='coach'  ? active : inactive) + base + ';flex:1;padding:5px 8px;border-radius:6px;font-size:12px' }
  if (sk) { sk.style.cssText  = (activeView==='client' ? active : inactive) + base + ';flex:1;padding:5px 8px;border-radius:6px;font-size:12px' }

  // Mobile pill buttons
  const mc = document.getElementById('mvs-coach'), mk = document.getElementById('mvs-client')
  if (mc) { mc.style.cssText = (activeView==='coach'  ? active : inactive) + base + ';padding:5px 16px;border-radius:16px;font-size:12px' }
  if (mk) { mk.style.cssText = (activeView==='client' ? active : inactive) + base + ';padding:5px 16px;border-radius:16px;font-size:12px' }
}

function switchView(view) {
  if (!window._masterAccount) return
  currentProfile = { ...currentProfile, role: view }
  updateViewSwitcherButtons(view)
  applyRoleUI()
  navigate(view === 'client' ? 'client-dashboard' : 'dashboard')
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

  const email = document.getElementById('login-email').value
  log.info('login', 'attempting sign in', { email })
  const { error } = await db.auth.signInWithPassword({
    email,
    password: document.getElementById('login-password').value
  })

  if (error) {
    log.error('login', 'sign in failed', error)
    errorEl.textContent = error.message
    btn.disabled    = false
    btn.textContent = 'Sign in'
  } else {
    log.ok('login', 'sign in successful', { email })
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

  const email = document.getElementById('signup-email').value
  log.info('signup', 'attempting sign up', { email })
  const { data, error } = await db.auth.signUp({
    email,
    password: document.getElementById('signup-password').value,
    options:  { data: { full_name: document.getElementById('signup-name').value.trim() } }
  })

  if (error) {
    log.error('signup', 'sign up failed', error)
    errorEl.textContent = error.message || 'Something went wrong. Please try again.'
    btn.disabled    = false
    btn.textContent = 'Create account'
  } else if (data.session) {
    log.ok('signup', 'account created and session active', { email })
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
    case 'dashboard':        renderDashboard(container);       break
    case 'client-dashboard': renderClientDashboard(container); break
    case 'programs':         renderPrograms(container);        break
    case 'clients':          renderClients(container);         break
    case 'workouts':         renderWorkouts(container);        break
    case 'calendar':         renderCalendar(container);        break
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
  log.info('renderDashboard', 'fetching dashboard data')
  el.innerHTML = '<div class="loading-state">Loading…</div>'

  const sevenDaysAgo   = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000).toISOString()
  const fourteenDaysOn = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const todayStr       = new Date().toISOString().split('T')[0]

  const [
    { count: clientCount },
    { count: goalCount },
    { count: workoutCount },
    { data: recentWeights },
    { data: recentWorkouts },
    { data: activeClients },
    { data: upcomingGoals }
  ] = await Promise.all([
    db.from('clients').select('*', { count: 'exact', head: true }),
    db.from('goals').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    db.from('workout_logs').select('*', { count: 'exact', head: true }),
    db.from('weight_logs').select('client_id, logged_at, weight_kg').gte('logged_at', sevenDaysAgo).order('logged_at', { ascending: false }).limit(30),
    db.from('workout_logs').select('client_id, logged_at').gte('logged_at', sevenDaysAgo).order('logged_at', { ascending: false }).limit(30),
    db.from('clients').select('id, full_name, status').eq('status', 'active').order('full_name'),
    db.from('goals').select('id, title, target_date, client_id, clients(full_name)').eq('status', 'active').not('target_date', 'is', null).gte('target_date', todayStr).lte('target_date', fourteenDaysOn).order('target_date').limit(5)
  ])

  const clientMap = {}
  ;(activeClients || []).forEach(c => { clientMap[c.id] = c.full_name })

  // Activity feed — merge weight + workout logs, sort newest first
  const feed = [
    ...(recentWeights  || []).map(w => ({ type: 'weight',  client_id: w.client_id, logged_at: w.logged_at, detail: `${w.weight_kg} kg` })),
    ...(recentWorkouts || []).map(w => ({ type: 'session', client_id: w.client_id, logged_at: w.logged_at, detail: 'Session logged' }))
  ].sort((a, b) => new Date(b.logged_at) - new Date(a.logged_at)).slice(0, 8)

  // Clients with no activity in last 7 days
  const activeSet = new Set([
    ...(recentWeights  || []).map(w => w.client_id),
    ...(recentWorkouts || []).map(w => w.client_id)
  ])
  const quietClients = (activeClients || []).filter(c => !activeSet.has(c.id))

  // Compliance — session count per active client this week
  const sessionCounts = {}
  ;(recentWorkouts || []).forEach(w => {
    sessionCounts[w.client_id] = (sessionCounts[w.client_id] || 0) + 1
  })
  const complianceRows = (activeClients || [])
    .map(c => ({ ...c, sessions: sessionCounts[c.id] || 0 }))
    .sort((a, b) => a.sessions - b.sessions) // fewest first

  const firstName = currentProfile?.full_name?.split(' ')[0] || 'Coach'
  const today     = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

  function timeAgo(iso) {
    const diff = Date.now() - new Date(iso)
    const h = Math.floor(diff / 3600000)
    const d = Math.floor(diff / 86400000)
    if (h < 1)  return 'just now'
    if (h < 24) return `${h}h ago`
    if (d === 1) return 'yesterday'
    return `${d}d ago`
  }

  function daysUntil(dateStr) {
    const diff = new Date(dateStr) - new Date(todayStr)
    const d = Math.round(diff / 86400000)
    if (d === 0) return 'today'
    if (d === 1) return 'tomorrow'
    return `in ${d} days`
  }

  el.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Welcome back, ${firstName} 👋</h1>
        <p class="page-subtitle">${today}</p>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn-primary" onclick="showAddClientModal()">+ Add client</button>
        <button class="btn-secondary" onclick="navigate('workouts')">Build a workout</button>
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

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:8px">

      <!-- Recent activity -->
      <div class="card">
        <div class="card-header" style="padding:16px 20px 0">
          <h2 class="section-title">Recent activity</h2>
          <p style="font-size:12px;color:var(--text-muted);margin-top:2px">Last 7 days</p>
        </div>
        <div class="card-body" style="padding:12px 20px 16px">
          ${feed.length === 0 ? `
            <p style="color:var(--text-muted);font-size:13px">No activity logged in the last 7 days.</p>
          ` : feed.map(f => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
              <div style="display:flex;align-items:center;gap:10px">
                <div style="width:30px;height:30px;border-radius:50%;background:var(--surface-2);display:flex;align-items:center;justify-content:center;font-size:13px">
                  ${f.type === 'weight' ? '⚖' : '💪'}
                </div>
                <div>
                  <div style="font-size:13px;font-weight:600;cursor:pointer" onclick="openClientByName('${(clientMap[f.client_id] || '').replace(/'/g,"\\'")}')">
                    ${clientMap[f.client_id] || 'Unknown'}
                  </div>
                  <div style="font-size:11.5px;color:var(--text-muted)">${f.type === 'weight' ? f.detail : 'Session logged'}</div>
                </div>
              </div>
              <div style="font-size:11.5px;color:var(--text-muted);white-space:nowrap">${timeAgo(f.logged_at)}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:16px">

        <!-- Compliance -->
        <div class="card">
          <div class="card-header" style="padding:16px 20px 0">
            <h2 class="section-title">This week's sessions</h2>
            <p style="font-size:12px;color:var(--text-muted);margin-top:2px">Active clients — sessions logged last 7 days</p>
          </div>
          <div class="card-body" style="padding:12px 20px 16px">
            ${complianceRows.length === 0 ? `
              <p style="color:var(--text-muted);font-size:13px">No active clients.</p>
            ` : (() => {
              const visible = complianceRows.slice(0, 6)
              const remaining = complianceRows.length - visible.length
              return visible.map(c => {
                const dot = c.sessions === 0 ? '#ef4444' : c.sessions === 1 ? '#f59e0b' : '#22c55e'
                const label = c.sessions === 0 ? 'No sessions' : `${c.sessions} session${c.sessions !== 1 ? 's' : ''}`
                return `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--border)">
                  <div style="display:flex;align-items:center;gap:8px">
                    <div style="width:8px;height:8px;border-radius:50%;background:${dot};flex-shrink:0"></div>
                    <div style="font-size:13px;font-weight:500;cursor:pointer" onclick="openClient('${c.id}')">${c.full_name}</div>
                  </div>
                  <span style="font-size:11.5px;font-weight:600;color:${dot}">${label}</span>
                </div>`
              }).join('') + (remaining > 0 ? `
                <div style="padding-top:10px;text-align:center">
                  <a href="#" onclick="navigate('clients');return false" style="font-size:12px;color:var(--accent);font-weight:500">+ ${remaining} more clients →</a>
                </div>` : '')
            })()}
          </div>
        </div>

        <!-- Goals due soon -->
        <div class="card">
          <div class="card-header" style="padding:16px 20px 0">
            <h2 class="section-title">Goals due soon</h2>
            <p style="font-size:12px;color:var(--text-muted);margin-top:2px">Next 14 days</p>
          </div>
          <div class="card-body" style="padding:12px 20px 16px">
            ${!upcomingGoals || upcomingGoals.length === 0 ? `
              <p style="color:var(--text-muted);font-size:13px">No goals due in the next 14 days.</p>
            ` : upcomingGoals.map(g => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--border)">
                <div>
                  <div style="font-size:13px;font-weight:500">${g.title}</div>
                  <div style="font-size:11.5px;color:var(--text-muted)">${g.clients?.full_name || ''}</div>
                </div>
                <div style="font-size:11.5px;font-weight:600;color:var(--accent);white-space:nowrap">${daysUntil(g.target_date)}</div>
              </div>
            `).join('')}
          </div>
        </div>

      </div>
    </div>
  `
}

async function openClientByName(name) {
  const { data } = await db.from('clients').select('id').eq('full_name', name).single()
  if (data) openClient(data.id)
}

// ─── CLIENT DASHBOARD ─────────────────────────────────────────────────────────
async function renderClientDashboard(el) {
  log.info('renderClientDashboard', 'fetching data', { userId: currentUser.id })
  el.innerHTML = '<div class="loading-state">Loading…</div>'

  const todayStr = new Date().toISOString().split('T')[0]

  // Find this client's record via user_id
  const { data: clientRow, error: clientErr } = await db
    .from('clients')
    .select('id, full_name, coach_id')
    .eq('user_id', currentUser.id)
    .single()

  if (clientErr || !clientRow) {
    log.error('renderClientDashboard', 'client record not found', clientErr)
    el.innerHTML = '<div class="loading-state">Unable to load your profile. Please contact your coach.</div>'
    return
  }

  const clientId = clientRow.id

  const [
    { data: goals },
    { data: events },
    { data: weights },
    { data: perfLogs },
    { data: assignedPrograms },
    { data: recentSessions },
  ] = await Promise.all([
    db.from('goals').select('id, title, target_date, status, current_value, target_value, goal_milestones(id, title, completed_at, order)').eq('client_id', clientId).eq('status', 'active').order('target_date'),
    db.from('events').select('id, title, date, type, notes').eq('client_id', clientId).gte('date', todayStr).order('date').limit(4),
    db.from('weight_logs').select('date, weight_kg').eq('client_id', clientId).order('date', { ascending: false }).limit(5),
    db.from('performance_logs').select('name, category, value, unit, date').eq('client_id', clientId).order('date', { ascending: false }),
    db.from('client_programs').select('start_date, programs(name, description, program_phases(id, name, duration_weeks, order_index))').eq('client_id', clientId).limit(1),
    db.from('workout_logs').select('id, name, date, workout_log_exercises(id)').eq('client_id', clientId).order('date', { ascending: false }).limit(5),
  ])

  // Latest weight + trend
  const latestWeight = weights?.[0] ?? null
  const prevWeight   = weights?.[1] ?? null
  let weightTrend = '→'
  if (latestWeight && prevWeight) {
    if (latestWeight.weight_kg < prevWeight.weight_kg) weightTrend = '↓'
    else if (latestWeight.weight_kg > prevWeight.weight_kg) weightTrend = '↑'
  }
  const trendColour = weightTrend === '↓' ? '#22c55e' : weightTrend === '↑' ? '#ef4444' : 'var(--text-muted)'

  // PBs — best value per exercise (max for strength/benchmark, min for cardio time)
  const pbMap = {}
  ;(perfLogs || []).forEach(p => {
    const key = p.name
    if (!pbMap[key]) { pbMap[key] = p; return }
    const better = p.category === 'cardio'
      ? p.value < pbMap[key].value
      : p.value > pbMap[key].value
    if (better) pbMap[key] = p
  })
  const pbs = Object.values(pbMap)

  // Event type label + colour
  function eventStyle(type) {
    const map = {
      session:     { label: 'PT Session',   colour: '#6366f1' },
      review:      { label: 'Review',       colour: '#f59e0b' },
      competition: { label: 'Competition',  colour: '#ef4444' },
      holiday:     { label: 'Holiday',      colour: '#22c55e' },
      gym:         { label: 'Gym',          colour: '#3b82f6' },
      other:       { label: 'Event',        colour: 'var(--text-muted)' },
    }
    return map[type] || map.other
  }

  function formatDate(dateStr) {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  }

  function daysUntil(dateStr) {
    const diff = new Date(dateStr) - new Date(todayStr)
    const d = Math.round(diff / 86400000)
    if (d === 0) return 'Today'
    if (d === 1) return 'Tomorrow'
    return `In ${d} days`
  }

  const firstName = currentProfile?.full_name?.split(' ')[0] || 'there'

  el.innerHTML = `
    <div class="dashboard-header">
      <div>
        <h1 class="dashboard-greeting">Hi, ${firstName} 👋</h1>
        <p style="color:var(--text-muted);font-size:14px;margin:2px 0 0">${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      </div>
    </div>

    <div class="dashboard-grid">

      <!-- Goals -->
      <div class="dashboard-card" style="grid-column: span 2">
        <div class="card-header"><h2 class="card-title">Your Goals</h2></div>
        ${!goals?.length ? `<p style="color:var(--text-muted);font-size:13px">No active goals yet.</p>` : goals.map(goal => {
          const milestones = (goal.goal_milestones || []).sort((a, b) => a.order - b.order)
          const done = milestones.filter(m => m.completed_at).length
          const pct  = goal.target_value && goal.current_value
            ? Math.min(100, Math.round(((goal.current_value - (goal.current_value > goal.target_value ? goal.target_value : goal.current_value)) / Math.abs(goal.target_value - goal.current_value || 1)) * 100))
            : milestones.length ? Math.round((done / milestones.length) * 100) : 0
          const daysLeft = goal.target_date ? daysUntil(goal.target_date) : null
          return `
          <div style="margin-bottom:18px;padding-bottom:18px;border-bottom:1px solid var(--border)">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
              <div style="font-size:14px;font-weight:600">${goal.title}</div>
              ${daysLeft ? `<span style="font-size:11px;color:var(--text-muted);white-space:nowrap;margin-left:8px">${daysLeft}</span>` : ''}
            </div>
            ${goal.target_value != null ? `
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
              <span>Current: <strong style="color:var(--text)">${goal.current_value ?? '—'}</strong> → Target: <strong style="color:var(--accent)">${goal.target_value}</strong></span>
              <button onclick="showGoalProgressForm('${goal.id}',${goal.current_value ?? ''})" style="font-size:11px;color:var(--accent);background:none;border:none;cursor:pointer;font-weight:600;padding:0">Update</button>
            </div>
            <div id="gpf-${goal.id}" style="display:none;margin-bottom:8px">
              <div style="display:flex;gap:6px;align-items:center">
                <input type="number" id="gpf-val-${goal.id}" class="field-input" style="width:100px;padding:4px 8px;font-size:13px" step="0.1" placeholder="New value">
                <button class="btn-primary" style="font-size:12px;padding:4px 12px" onclick="saveGoalProgress('${goal.id}')">Save</button>
                <button class="btn-secondary" style="font-size:12px;padding:4px 10px" onclick="document.getElementById('gpf-${goal.id}').style.display='none'">Cancel</button>
              </div>
              <p id="gpf-err-${goal.id}" style="color:var(--danger);font-size:11px;margin:4px 0 0"></p>
            </div>` : ''}
            ${milestones.length ? `
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">
              ${milestones.map(m => `
                <button onclick="toggleClientMilestone('${m.id}')" style="display:inline-flex;align-items:center;gap:4px;font-size:11.5px;padding:3px 8px;border-radius:20px;border:none;cursor:pointer;background:${m.completed_at ? 'var(--accent)' : 'var(--surface-2)'};color:${m.completed_at ? '#fff' : 'var(--text-muted)'}">
                  ${m.completed_at ? '✓' : '○'} ${m.title}
                </button>`).join('')}
            </div>` : ''}
          </div>`
        }).join('')}
      </div>

      <!-- Weight -->
      <div class="dashboard-card">
        <div class="card-header">
          <h2 class="card-title">Weight</h2>
          <button class="btn-secondary" style="font-size:12px;padding:4px 10px" onclick="showClientWeightForm('${clientId}')">+ Log</button>
        </div>
        ${latestWeight ? `
          <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:4px">
            <span style="font-size:32px;font-weight:700">${latestWeight.weight_kg}</span>
            <span style="font-size:16px;color:var(--text-muted)">kg</span>
            <span style="font-size:22px;color:${trendColour};margin-left:4px">${weightTrend}</span>
          </div>
          <p style="font-size:12px;color:var(--text-muted)">Logged ${formatDate(latestWeight.date)}</p>
          ${prevWeight ? `<p style="font-size:12px;color:var(--text-muted);margin-top:2px">Previous: ${prevWeight.weight_kg} kg</p>` : ''}
        ` : `<p style="color:var(--text-muted);font-size:13px">No weight logged yet.</p>`}
        <div id="client-weight-form" style="display:none;margin-top:14px;padding-top:14px;border-top:1px solid var(--border)">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
            <div>
              <label class="form-label">Date</label>
              <input type="date" id="cwf-date" class="form-input" value="${new Date().toISOString().split('T')[0]}">
            </div>
            <div>
              <label class="form-label">Weight (kg)</label>
              <input type="number" id="cwf-weight" class="form-input" placeholder="e.g. 89.5" step="0.1" min="20" max="300">
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
            <div>
              <label class="form-label">Body fat % <span style="color:var(--text-muted)">(optional)</span></label>
              <input type="number" id="cwf-bf" class="form-input" placeholder="e.g. 19.5" step="0.1" min="1" max="60">
            </div>
            <div>
              <label class="form-label">Notes <span style="color:var(--text-muted)">(optional)</span></label>
              <input type="text" id="cwf-notes" class="form-input" placeholder="Any notes…">
            </div>
          </div>
          <p id="cwf-error" style="color:#ef4444;font-size:12px;margin:0 0 6px"></p>
          <div style="display:flex;gap:8px">
            <button class="btn btn-primary" style="font-size:13px;padding:6px 14px" onclick="saveClientWeight('${clientId}')">Save</button>
            <button class="btn" style="font-size:13px;padding:6px 14px" onclick="document.getElementById('client-weight-form').style.display='none'">Cancel</button>
          </div>
        </div>
      </div>

      <!-- Upcoming -->
      <div class="dashboard-card">
        <div class="card-header"><h2 class="card-title">Upcoming</h2></div>
        ${!events?.length ? `<p style="color:var(--text-muted);font-size:13px">No upcoming events.</p>` : events.map(ev => {
          const s = eventStyle(ev.type)
          return `
          <div style="display:flex;align-items:flex-start;gap:10px;padding:7px 0;border-bottom:1px solid var(--border)">
            <div style="width:3px;min-width:3px;height:36px;border-radius:2px;background:${s.colour};margin-top:2px"></div>
            <div>
              <div style="font-size:13px;font-weight:500">${ev.title}</div>
              <div style="font-size:11.5px;color:var(--text-muted);margin-top:1px">${s.label} · ${formatDate(ev.date)} · ${daysUntil(ev.date)}</div>
            </div>
          </div>`
        }).join('')}
      </div>

      <!-- Personal Bests -->
      <div class="dashboard-card" style="grid-column: span 2">
        <div class="card-header">
          <h2 class="card-title">Personal Bests</h2>
          <button class="btn-secondary" style="font-size:12px;padding:4px 10px" onclick="showClientPBForm('${clientId}')">+ Log PB</button>
        </div>
        ${!pbs.length ? `<p style="color:var(--text-muted);font-size:13px">No records yet.</p>` : `
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px">
          ${pbs.map(pb => `
            <div style="background:var(--surface-2);border-radius:8px;padding:12px">
              <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">${pb.category}</div>
              <div style="font-size:13px;font-weight:600;margin-bottom:2px">${pb.name}</div>
              <div style="font-size:20px;font-weight:700;color:var(--accent)">${pb.value} <span style="font-size:12px;font-weight:400;color:var(--text-muted)">${pb.unit}</span></div>
            </div>`).join('')}
        </div>`}
        <div id="client-pb-form" style="display:none;margin-top:14px;padding-top:14px;border-top:1px solid var(--border)">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
            <div>
              <label class="form-label">Exercise name</label>
              <input type="text" id="cpb-name" class="form-input" placeholder="e.g. Deadlift">
            </div>
            <div>
              <label class="form-label">Category</label>
              <select id="cpb-category" class="form-input">
                <option value="strength">Strength</option>
                <option value="cardio">Cardio</option>
                <option value="body_metric">Body metric</option>
                <option value="benchmark">Benchmark</option>
              </select>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px">
            <div>
              <label class="form-label">Value</label>
              <input type="number" id="cpb-value" class="form-input" placeholder="e.g. 100" step="0.1">
            </div>
            <div>
              <label class="form-label">Unit</label>
              <input type="text" id="cpb-unit" class="form-input" placeholder="kg / min / reps">
            </div>
            <div>
              <label class="form-label">Date</label>
              <input type="date" id="cpb-date" class="form-input" value="${new Date().toISOString().split('T')[0]}">
            </div>
          </div>
          <div style="margin-bottom:8px">
            <label class="form-label">Notes <span style="color:var(--text-muted)">(optional)</span></label>
            <input type="text" id="cpb-notes" class="form-input" placeholder="Any notes…">
          </div>
          <p id="cpb-error" style="color:#ef4444;font-size:12px;margin:0 0 6px"></p>
          <div style="display:flex;gap:8px">
            <button class="btn btn-primary" style="font-size:13px;padding:6px 14px" onclick="saveClientPB('${clientId}')">Save</button>
            <button class="btn" style="font-size:13px;padding:6px 14px" onclick="document.getElementById('client-pb-form').style.display='none'">Cancel</button>
          </div>
        </div>
      </div>

      <!-- Recent Sessions -->
      <div class="dashboard-card" style="grid-column: span 2">
        <div class="card-header">
          <h2 class="card-title">Recent Sessions</h2>
          <button class="btn-secondary" style="font-size:12px;padding:4px 10px" onclick="startWorkoutRunner('${clientId}')">▶ Start</button>
        </div>
        ${!recentSessions?.length ? `<p style="color:var(--text-muted);font-size:13px">No sessions logged yet. Log your first session to start tracking your training.</p>` : `
        <div class="list">
          ${recentSessions.map(s => {
            const dateStr = new Date(s.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
            const exCount = s.workout_log_exercises?.length || 0
            return `
            <div class="list-row" style="cursor:default">
              <div style="width:40px;height:40px;border-radius:10px;background:rgba(99,102,241,.12);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">💪</div>
              <div class="row-info">
                <div class="row-name">${s.name}</div>
                <div class="row-meta">${dateStr} · ${exCount} exercise${exCount !== 1 ? 's' : ''}</div>
              </div>
            </div>`
          }).join('')}
        </div>`}
      </div>

      <!-- Active Program -->
      ${(() => {
        const ap = assignedPrograms?.[0]
        if (!ap || !ap.programs) return ''
        const prog = ap.programs
        const phases = (prog.program_phases || []).sort((a, b) => a.order_index - b.order_index)
        const startDate = ap.start_date ? new Date(ap.start_date + 'T00:00:00') : null
        const totalWeeks = phases.reduce((s, ph) => s + ph.duration_weeks, 0)
        let currentPhaseLabel = '—'
        if (startDate) {
          const weeksSinceStart = Math.floor((Date.now() - startDate) / 604800000)
          let cumulative = 0
          for (const ph of phases) {
            cumulative += ph.duration_weeks
            if (weeksSinceStart < cumulative) { currentPhaseLabel = ph.name; break }
          }
        }
        return `
        <div class="dashboard-card" style="grid-column: span 2">
          <div class="card-header">
            <h2 class="card-title">Training Program</h2>
          </div>
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
            <div style="width:44px;height:44px;border-radius:10px;background:rgba(99,102,241,.12);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">📋</div>
            <div>
              <div style="font-weight:600;font-size:15px">${prog.name}</div>
              ${prog.description ? `<div style="font-size:12px;color:var(--text-muted);margin-top:2px">${prog.description}</div>` : ''}
            </div>
          </div>
          <div style="display:flex;gap:20px;font-size:13px">
            <div><span style="color:var(--text-muted)">Phases:</span> ${phases.length}</div>
            <div><span style="color:var(--text-muted)">Duration:</span> ${totalWeeks} weeks</div>
            <div><span style="color:var(--text-muted)">Current phase:</span> ${currentPhaseLabel}</div>
          </div>
          ${phases.length ? `
          <div style="margin-top:12px;display:flex;gap:4px">
            ${phases.map((ph, i) => {
              const weeksBefore = phases.slice(0, i).reduce((s, p) => s + p.duration_weeks, 0)
              const weeksAfter  = weeksBefore + ph.duration_weeks
              const weeksSinceStart = startDate ? Math.floor((Date.now() - startDate) / 604800000) : -1
              const active = weeksSinceStart >= weeksBefore && weeksSinceStart < weeksAfter
              const done   = weeksSinceStart >= weeksAfter
              return `<div style="flex:${ph.duration_weeks};height:6px;border-radius:3px;background:${done ? 'var(--accent)' : active ? 'var(--accent)' : 'var(--surface-2)'};opacity:${active ? 1 : done ? 0.5 : 1}" title="${ph.name}: ${ph.duration_weeks}w"></div>`
            }).join('')}
          </div>` : ''}
        </div>`
      })()}

    </div>`

  log.ok('renderClientDashboard', 'rendered', { clientId, goals: goals?.length, events: events?.length, pbs: pbs.length })
}

// ─── CLIENT PROFILE: PROGRAMS TAB ─────────────────────────────────────────────
async function renderClientPrograms(clientId, el) {
  el.innerHTML = '<div class="loading-state">Loading…</div>'
  const { data: assignments, error } = await db
    .from('client_programs')
    .select('*, programs(id, name, description, program_phases(id))')
    .eq('client_id', clientId)

  if (error) {
    el.innerHTML = `<div class="card"><div class="card-body" style="padding:20px">
      <p style="color:var(--danger);font-size:13px">${error.message}</p>
      <p style="color:var(--text-muted);font-size:12px;margin-top:8px">Run the client_programs SQL in Supabase first.</p>
    </div></div>`
    return
  }

  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h2 class="section-title">Assigned programs</h2>
      <button class="btn-primary" onclick="showAssignProgramModal('${clientId}')">+ Assign program</button>
    </div>
    ${!assignments?.length ? `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <div class="empty-title">No programs assigned</div>
        <div class="empty-text">Assign a program from your library to give this client a structured training plan.</div>
        <button class="btn-primary" onclick="showAssignProgramModal('${clientId}')">+ Assign program</button>
      </div>
    ` : `
      <div class="list">
        ${assignments.map(a => {
          const p = a.programs
          const phaseCount = p?.program_phases?.length || 0
          const startLabel = a.start_date ? new Date(a.start_date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No start date'
          return `
            <div class="list-row" style="cursor:default">
              <div style="width:40px;height:40px;border-radius:10px;background:rgba(99,102,241,.12);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">📋</div>
              <div class="row-info">
                <div class="row-name">${p?.name || 'Unknown program'}</div>
                <div class="row-meta">${phaseCount} phase${phaseCount !== 1 ? 's' : ''} · Started ${startLabel}</div>
              </div>
              <div class="row-right">
                <button class="btn-secondary" style="font-size:12px;padding:4px 10px;color:var(--danger);border-color:var(--danger)" onclick="unassignProgram('${clientId}','${a.id}')">Remove</button>
              </div>
            </div>`
        }).join('')}
      </div>
    `}
  `
}

function showAssignProgramModal(clientId) {
  const existing = document.getElementById('assign-program-modal')
  if (existing) existing.remove()

  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.id = 'assign-program-modal'
  const todayStr = new Date().toISOString().split('T')[0]

  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2 class="modal-title">Assign program</h2>
        <button class="modal-close" onclick="closeModal('assign-program-modal')">✕</button>
      </div>
      <div class="field">
        <label class="field-label">Program <span style="color:var(--danger)">*</span></label>
        <select class="field-input" id="ap-program">
          <option value="">Select a program…</option>
        </select>
      </div>
      <div class="field">
        <label class="field-label">Start date</label>
        <input class="field-input" id="ap-start" type="date" value="${todayStr}">
      </div>
      <p class="modal-error" id="ap-error"></p>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeModal('assign-program-modal')">Cancel</button>
        <button class="btn-primary" onclick="saveAssignProgram('${clientId}')">Assign</button>
      </div>
    </div>
  `
  document.body.appendChild(overlay)

  db.from('programs').select('id, name').order('name').then(({ data }) => {
    const sel = document.getElementById('ap-program')
    if (!sel) return
    ;(data || []).forEach(p => {
      const opt = document.createElement('option')
      opt.value = p.id
      opt.textContent = p.name
      sel.appendChild(opt)
    })
  })
}

async function saveAssignProgram(clientId) {
  const programId = document.getElementById('ap-program').value
  const startDate = document.getElementById('ap-start').value || null
  const errorEl   = document.getElementById('ap-error')

  if (!programId) { errorEl.textContent = 'Please select a program'; return }

  const { error } = await db.from('client_programs').insert({
    client_id: clientId,
    program_id: programId,
    start_date: startDate || null
  })

  if (error) { log.error('saveAssignProgram', 'insert failed', error); errorEl.textContent = error.message; return }
  closeModal('assign-program-modal')
  renderClientPrograms(clientId, document.getElementById('tab-content'))
}

async function unassignProgram(clientId, assignmentId) {
  if (!confirm('Remove this program from the client?')) return
  const { error } = await db.from('client_programs').delete().eq('id', assignmentId)
  if (error) { log.error('unassignProgram', 'delete failed', error); return }
  renderClientPrograms(clientId, document.getElementById('tab-content'))
}

// ─── PROGRAMS ─────────────────────────────────────────────────────────────────
async function renderPrograms(el) {
  log.info('renderPrograms', 'fetching programs')
  el.innerHTML = '<div class="loading-state">Loading…</div>'

  const { data: programs, error } = await db
    .from('programs')
    .select('id, name, description, created_at, program_phases(id)')
    .eq('coach_id', currentUser.id)
    .order('created_at', { ascending: false })

  if (error) { log.error('renderPrograms', 'fetch failed', error); el.innerHTML = `<div class="loading-state">${error.message}</div>`; return }

  log.ok('renderPrograms', 'loaded', { count: programs?.length })

  el.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Programs</h1>
      <button class="btn btn-primary" onclick="showCreateProgramModal()">+ New program</button>
    </div>

    ${!programs?.length ? `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <div class="empty-title">No programs yet</div>
        <div class="empty-text">Create a program to organise training phases for your clients.</div>
        <button class="btn-primary" onclick="showCreateProgramModal()">+ Create program</button>
      </div>
    ` : `
      <div class="list">
        ${programs.map(p => `
          <div class="list-row" onclick="openProgram('${p.id}')">
            <div style="width:40px;height:40px;border-radius:10px;background:rgba(99,102,241,.12);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">📋</div>
            <div class="row-info">
              <div class="row-name">${p.name}</div>
              <div class="row-meta">${p.description || `${p.program_phases?.length || 0} phase${p.program_phases?.length !== 1 ? 's' : ''}`}</div>
            </div>
            <div class="row-right">
              <span style="font-size:12px;color:var(--text-muted)">${p.program_phases?.length || 0} phase${p.program_phases?.length !== 1 ? 's' : ''}</span>
              <svg style="width:15px;height:15px;color:#d1d5db" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
            </div>
          </div>`).join('')}
      </div>
    `}

    <!-- Create/Edit program modal -->
    <div id="program-modal" class="modal-overlay" style="display:none" onclick="if(event.target===this)closeProgramModal()">
      <div class="modal-box">
        <div class="modal-header">
          <h2 class="modal-title" id="program-modal-title">New program</h2>
          <button class="btn-icon" onclick="closeProgramModal()">✕</button>
        </div>
        <div style="margin-bottom:14px">
          <label class="form-label">Program name <span style="color:#ef4444">*</span></label>
          <input type="text" id="pm-name" class="form-input" placeholder="e.g. 12-Week Strength Block">
        </div>
        <div style="margin-bottom:14px">
          <label class="form-label">Description <span style="color:var(--text-muted)">(optional)</span></label>
          <textarea id="pm-desc" class="form-input" rows="3" placeholder="What is this program for?" style="resize:vertical"></textarea>
        </div>
        <p id="pm-error" style="color:#ef4444;font-size:12px;margin:0 0 10px"></p>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn btn-secondary" onclick="closeProgramModal()">Cancel</button>
          <button class="btn btn-primary" id="pm-save-btn" onclick="saveProgram()">Create program</button>
        </div>
      </div>
    </div>`

  // Re-attach nav listeners lost on re-render
  document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(el => {
    el.addEventListener('click', e => { e.preventDefault(); navigate(el.dataset.page) })
  })
}

async function openProgram(programId) {
  const el = document.getElementById('main-content')
  log.info('openProgram', 'loading', { programId })
  el.innerHTML = '<div class="loading-state">Loading…</div>'

  const { data: program, error } = await db
    .from('programs')
    .select('id, name, description, created_at, program_phases(id, name, duration_weeks, order_index)')
    .eq('id', programId)
    .single()

  if (error) { log.error('openProgram', 'fetch failed', error); el.innerHTML = `<div class="loading-state">${error.message}</div>`; return }

  const phases = (program.program_phases || []).sort((a, b) => a.order_index - b.order_index)
  const totalWeeks = phases.reduce((sum, p) => sum + p.duration_weeks, 0)

  el.innerHTML = `
    <div style="margin-bottom:20px">
      <a href="#" onclick="navigate('programs');return false" style="font-size:13px;color:var(--accent);display:inline-flex;align-items:center;gap:4px;margin-bottom:12px">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><polyline points="15 18 9 12 15 6"/></svg>
        All programs
      </a>
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <h1 class="page-title" style="margin-bottom:4px">${program.name}</h1>
          ${program.description ? `<p style="color:var(--text-muted);font-size:14px">${program.description}</p>` : ''}
          <p style="font-size:12px;color:var(--text-muted);margin-top:4px">${phases.length} phase${phases.length !== 1 ? 's' : ''} · ${totalWeeks} week${totalWeeks !== 1 ? 's' : ''} total</p>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-secondary" onclick="showEditProgramModal('${program.id}','${program.name.replace(/'/g,"\\'")}','${(program.description||'').replace(/'/g,"\\'")}')">Edit</button>
          <button class="btn btn-danger" onclick="deleteProgram('${program.id}')">Delete</button>
        </div>
      </div>
    </div>

    <!-- Phases -->
    <div style="margin-bottom:16px;display:flex;justify-content:space-between;align-items:center">
      <h2 style="font-size:15px;font-weight:600">Phases</h2>
      <button class="btn btn-primary" onclick="showAddPhaseForm('${program.id}')">+ Add phase</button>
    </div>

    <div id="phases-list">
      ${!phases.length ? `<p style="color:var(--text-muted);font-size:13px">No phases yet. Add the first phase to get started.</p>` :
        `<div class="list">${phases.map((ph, i) => `
          <div class="list-row" id="phase-${ph.id}" style="cursor:default">
            <div style="width:32px;height:32px;border-radius:50%;background:var(--accent);color:#fff;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${i + 1}</div>
            <div class="row-info">
              <div class="row-name">${ph.name}</div>
              <div class="row-meta">${ph.duration_weeks} week${ph.duration_weeks !== 1 ? 's' : ''}</div>
            </div>
            <div class="row-right">
              <button class="btn-icon" title="Edit" onclick="showEditPhaseForm('${program.id}','${ph.id}','${ph.name.replace(/'/g,"\\'")}',${ph.duration_weeks},${ph.order_index})">✎</button>
              <button class="btn-icon" title="Delete" onclick="deletePhase('${program.id}','${ph.id}')">✕</button>
            </div>
          </div>`).join('')}</div>`}
    </div>

    <!-- Add/edit phase form -->
    <div id="phase-form" style="display:none;background:var(--surface-2);border-radius:10px;padding:16px;margin-top:12px">
      <h3 style="font-size:14px;font-weight:600;margin-bottom:12px" id="phase-form-title">Add phase</h3>
      <input type="hidden" id="pf-phase-id">
      <input type="hidden" id="pf-order-index">
      <div style="display:grid;grid-template-columns:1fr auto;gap:10px;margin-bottom:10px">
        <div>
          <label class="form-label">Phase name <span style="color:#ef4444">*</span></label>
          <input type="text" id="pf-name" class="form-input" placeholder="e.g. Base Building">
        </div>
        <div>
          <label class="form-label">Duration (weeks)</label>
          <input type="number" id="pf-weeks" class="form-input" placeholder="4" min="1" max="52" style="width:90px">
        </div>
      </div>
      <p id="pf-error" style="color:#ef4444;font-size:12px;margin:0 0 8px"></p>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" style="font-size:13px;padding:6px 14px" id="pf-save-btn" onclick="savePhase('${program.id}')">Add phase</button>
        <button class="btn" style="font-size:13px;padding:6px 14px" onclick="document.getElementById('phase-form').style.display='none'">Cancel</button>
      </div>
    </div>

    <!-- Edit program modal -->
    <div id="program-modal" class="modal-overlay" style="display:none" onclick="if(event.target===this)closeProgramModal()">
      <div class="modal-box">
        <div class="modal-header">
          <h2 class="modal-title" id="program-modal-title">Edit program</h2>
          <button class="btn-icon" onclick="closeProgramModal()">✕</button>
        </div>
        <div style="margin-bottom:14px">
          <label class="form-label">Program name <span style="color:#ef4444">*</span></label>
          <input type="text" id="pm-name" class="form-input">
        </div>
        <div style="margin-bottom:14px">
          <label class="form-label">Description <span style="color:var(--text-muted)">(optional)</span></label>
          <textarea id="pm-desc" class="form-input" rows="3" style="resize:vertical"></textarea>
        </div>
        <p id="pm-error" style="color:#ef4444;font-size:12px;margin:0 0 10px"></p>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn btn-secondary" onclick="closeProgramModal()">Cancel</button>
          <button class="btn btn-primary" id="pm-save-btn" onclick="saveProgram('${program.id}')">Save changes</button>
        </div>
      </div>
    </div>`
}

let _editingProgramId = null

function showCreateProgramModal() {
  _editingProgramId = null
  document.getElementById('program-modal-title').textContent = 'New program'
  document.getElementById('pm-name').value = ''
  document.getElementById('pm-desc').value = ''
  document.getElementById('pm-error').textContent = ''
  document.getElementById('pm-save-btn').textContent = 'Create program'
  document.getElementById('program-modal').style.display = 'flex'
}

function showEditProgramModal(id, name, description) {
  _editingProgramId = id
  document.getElementById('program-modal-title').textContent = 'Edit program'
  document.getElementById('pm-name').value = name
  document.getElementById('pm-desc').value = description
  document.getElementById('pm-error').textContent = ''
  document.getElementById('pm-save-btn').textContent = 'Save changes'
  document.getElementById('program-modal').style.display = 'flex'
}

function closeProgramModal() {
  document.getElementById('program-modal').style.display = 'none'
}

async function saveProgram(programId) {
  const name = document.getElementById('pm-name').value.trim()
  const desc = document.getElementById('pm-desc').value.trim()
  const errorEl = document.getElementById('pm-error')
  if (!name) { errorEl.textContent = 'Program name is required.'; return }
  errorEl.textContent = ''

  const id = programId || _editingProgramId

  if (id) {
    log.info('saveProgram', 'updating', { id })
    const { error } = await db.from('programs').update({ name, description: desc || null }).eq('id', id)
    if (error) { log.error('saveProgram', 'update failed', error); errorEl.textContent = error.message; return }
    log.ok('saveProgram', 'updated', { id })
    closeProgramModal()
    openProgram(id)
  } else {
    log.info('saveProgram', 'creating')
    const { data, error } = await db.from('programs').insert({ coach_id: currentUser.id, name, description: desc || null }).select().single()
    if (error) { log.error('saveProgram', 'create failed', error); errorEl.textContent = error.message; return }
    log.ok('saveProgram', 'created', { id: data.id })
    closeProgramModal()
    openProgram(data.id)
  }
}

async function deleteProgram(programId) {
  if (!confirm('Delete this program and all its phases?')) return
  log.info('deleteProgram', 'deleting', { programId })
  const { error } = await db.from('programs').delete().eq('id', programId)
  if (error) { log.error('deleteProgram', 'failed', error); alert(error.message); return }
  log.ok('deleteProgram', 'deleted', { programId })
  navigate('programs')
}

function showAddPhaseForm(programId) {
  document.getElementById('phase-form-title').textContent = 'Add phase'
  document.getElementById('pf-phase-id').value = ''
  document.getElementById('pf-order-index').value = ''
  document.getElementById('pf-name').value = ''
  document.getElementById('pf-weeks').value = ''
  document.getElementById('pf-error').textContent = ''
  document.getElementById('pf-save-btn').textContent = 'Add phase'
  document.getElementById('phase-form').style.display = 'block'
  document.getElementById('pf-name').focus()
}

function showEditPhaseForm(programId, phaseId, name, weeks, orderIndex) {
  document.getElementById('phase-form-title').textContent = 'Edit phase'
  document.getElementById('pf-phase-id').value = phaseId
  document.getElementById('pf-order-index').value = orderIndex
  document.getElementById('pf-name').value = name
  document.getElementById('pf-weeks').value = weeks
  document.getElementById('pf-error').textContent = ''
  document.getElementById('pf-save-btn').textContent = 'Save phase'
  document.getElementById('phase-form').style.display = 'block'
  document.getElementById('pf-name').focus()
}

async function savePhase(programId) {
  const name     = document.getElementById('pf-name').value.trim()
  const weeks    = parseInt(document.getElementById('pf-weeks').value)
  const phaseId  = document.getElementById('pf-phase-id').value
  const errorEl  = document.getElementById('pf-error')

  if (!name || isNaN(weeks) || weeks < 1) { errorEl.textContent = 'Name and duration are required.'; return }
  errorEl.textContent = ''

  if (phaseId) {
    log.info('savePhase', 'updating', { phaseId })
    const { error } = await db.from('program_phases').update({ name, duration_weeks: weeks }).eq('id', phaseId)
    if (error) { log.error('savePhase', 'update failed', error); errorEl.textContent = error.message; return }
    log.ok('savePhase', 'updated', { phaseId })
  } else {
    // Get current max order_index to append at end
    const { data: existing } = await db.from('program_phases').select('order_index').eq('program_id', programId).order('order_index', { ascending: false }).limit(1)
    const nextIndex = (existing?.[0]?.order_index ?? -1) + 1
    log.info('savePhase', 'creating', { programId, nextIndex })
    const { error } = await db.from('program_phases').insert({ program_id: programId, name, duration_weeks: weeks, order_index: nextIndex })
    if (error) { log.error('savePhase', 'create failed', error); errorEl.textContent = error.message; return }
    log.ok('savePhase', 'created')
  }

  document.getElementById('phase-form').style.display = 'none'
  openProgram(programId)
}

async function deletePhase(programId, phaseId) {
  if (!confirm('Remove this phase?')) return
  log.info('deletePhase', 'deleting', { phaseId })
  const { error } = await db.from('program_phases').delete().eq('id', phaseId)
  if (error) { log.error('deletePhase', 'failed', error); alert(error.message); return }
  log.ok('deletePhase', 'deleted', { phaseId })
  openProgram(programId)
}

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

  log.info('saveClientPB', 'inserting', row)
  const { error } = await db.from('performance_logs').insert(row)
  if (error) { log.error('saveClientPB', 'insert failed', error); errorEl.textContent = error.message; return }

  log.ok('saveClientPB', 'PB logged', row)
  renderClientDashboard(document.getElementById('main-content'))
}

function showClientWeightForm(clientId) {
  const form = document.getElementById('client-weight-form')
  if (!form) return
  form.style.display = form.style.display === 'none' ? 'block' : 'none'
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

  log.info('saveClientWeight', 'inserting', row)
  const { error } = await db.from('weight_logs').insert(row)
  if (error) { log.error('saveClientWeight', 'insert failed', error); errorEl.textContent = error.message; return }

  log.ok('saveClientWeight', 'weight logged', row)
  // Refresh the client dashboard to show the new entry
  renderClientDashboard(document.getElementById('main-content'))
}

// ─── CLIENTS LIST ─────────────────────────────────────────────────────────────
async function renderClients(el) {
  log.info('renderClients', 'fetching client list')
  el.innerHTML = '<div class="loading-state">Loading…</div>'

  const { data: clients, error } = await db
    .from('clients')
    .select('*')
    .order('full_name')

  if (error) { log.error('renderClients', 'fetch failed', error); el.innerHTML = `<div class="loading-state">${error.message}</div>`; return }
  log.ok('renderClients', `loaded ${clients.length} clients`)

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

  log.info('saveNewClient', 'inserting client', { name })
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
  log.ok('saveNewClient', 'client created', { name })

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
    .single()

  if (error) { log.error('openClient', 'fetch failed', error); el.innerHTML = `<div class="loading-state">${error.message}</div>`; return }
  log.ok('openClient', 'loaded', { name: client.full_name })

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
    case 'tab-programs':     content.innerHTML = ''; renderClientPrograms(clientId, content);     break
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

  log.info('saveUpdateEmail', 'updating client email', { clientId, email })
  const { error } = await db.from('clients').update({ email, updated_at: new Date().toISOString() }).eq('id', clientId)
  if (error) { log.error('saveUpdateEmail', 'update failed', error); errorEl.textContent = error.message; return }
  log.ok('saveUpdateEmail', 'email updated', { clientId, email })

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

  log.info('saveEditClient', 'updating client details', { clientId: id, name })
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

async function renderCalendar(el) {
  const now = new Date()
  calendarYear  = calendarYear  ?? now.getFullYear()
  calendarMonth = calendarMonth ?? now.getMonth()
  el.innerHTML = '<div class="loading-state">Loading…</div>'

  // Fetch events for this month + overflow days
  const firstDay = new Date(calendarYear, calendarMonth, 1)
  const lastDay  = new Date(calendarYear, calendarMonth + 1, 0)
  const from = firstDay.toISOString().split('T')[0]
  const to   = lastDay.toISOString().split('T')[0]

  const isClient = currentProfile?.role === 'client'
  let events, clientMap = {}

  if (isClient) {
    const { data } = await db.from('events').select('*').gte('date', from).lte('date', to).order('date')
    events = data
  } else {
    const [evRes, clRes] = await Promise.all([
      db.from('events').select('*').gte('date', from).lte('date', to).order('date'),
      db.from('clients').select('id, full_name').order('full_name')
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
  const todayStr  = now.toISOString().split('T')[0]

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
            if (!d) return `<div style="aspect-ratio:1;padding:4px"></div>`
            const dateStr = `${calendarYear}-${String(calendarMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
            const dayEvents = byDate[dateStr] || []
            const isToday = dateStr === todayStr
            return `
              <div onclick="showDayEvents('${dateStr}')" style="
                aspect-ratio:1;padding:4px;border-radius:8px;cursor:pointer;
                background:${isToday ? 'var(--accent)' : 'transparent'};
                border:${isToday ? 'none' : '1px solid transparent'};
                transition:background 0.15s
              " onmouseover="this.style.background=this.style.background||'var(--surface-2)'"
                 onmouseout="this.style.background='${isToday ? 'var(--accent)' : 'transparent'}'">
                <div style="font-size:12px;font-weight:${isToday?'700':'500'};color:${isToday?'#fff':'var(--text)'}">
                  ${d}
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:2px;justify-content:center;margin-top:2px">
                  ${dayEvents.slice(0,3).map(e =>
                    `<div style="width:5px;height:5px;border-radius:50%;background:${EVENT_COLOURS[e.type]?.dot || '#9ca3af'}"></div>`
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
  if (currentProfile?.role === 'client') showClientAddEventModal(dateStr)
  else showAddEventModal(dateStr)
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
  db.from('clients').select('id, full_name').order('full_name').then(({ data }) => {
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
  if (error) { log.error('toggleClientMilestone', 'update failed', error); alert(error.message); return }
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
  if (currentProfile?.role === 'client') { await renderClientWorkoutsPage(el); return }
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

async function renderClientWorkoutsPage(el) {
  const { data: clientRecord } = await db.from('clients').select('id').eq('user_id', currentUser.id).single()
  if (!clientRecord) { el.innerHTML = '<div class="empty-state"><div class="empty-title">No client profile found</div></div>'; return }
  const clientId = clientRecord.id

  const [{ data: templates }, { data: logs }] = await Promise.all([
    db.from('workout_templates').select('id, name, description, workout_template_exercises(id)').order('name'),
    db.from('workout_logs').select('id, name, date').eq('client_id', clientId).order('date', { ascending: false }).limit(10)
  ])

  el.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Workouts</h1>
    </div>

    <div class="section-header" style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:10px">Start a workout</div>
    ${!(templates?.length) ? `
      <div class="empty-state">
        <div class="empty-icon">💪</div>
        <div class="empty-title">No workouts yet</div>
        <div class="empty-text">Your coach hasn't added any workout templates yet.</div>
      </div>` : `
      <div class="list" style="margin-bottom:28px">
        ${templates.map(t => `
          <div class="list-row" style="cursor:default">
            <div style="width:36px;height:36px;border-radius:8px;background:var(--accent);display:flex;align-items:center;justify-content:center;flex-shrink:0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>
            </div>
            <div class="row-info">
              <div class="row-name">${t.name}</div>
              <div class="row-meta">${t.workout_template_exercises?.length || 0} exercises${t.description ? ' · ' + t.description : ''}</div>
            </div>
            <div class="row-right">
              <button class="btn-primary" style="font-size:13px;padding:6px 14px" onclick="startWorkoutRunner('${clientId}','${t.id}')">▶ Start</button>
            </div>
          </div>`).join('')}
      </div>`}

    <div class="section-header" style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:10px">Recent sessions</div>
    ${!(logs?.length) ? `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <div class="empty-title">No sessions yet</div>
        <div class="empty-text">Complete a workout to see your history here.</div>
      </div>` : `
      <div class="list">
        ${logs.map(l => `
          <div class="list-row" style="cursor:default">
            <div style="width:36px;height:36px;border-radius:8px;background:var(--surface-2);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:16px">✓</div>
            <div class="row-info">
              <div class="row-name">${l.name || 'Workout'}</div>
              <div class="row-meta">${new Date(l.date).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})}</div>
            </div>
          </div>`).join('')}
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
  const { data: templates, error } = await db
    .from('workout_templates')
    .select('*, workout_template_exercises(id)')
    .order('name')

  if (error) { log.error('renderWorkoutTemplates', 'fetch failed', error); el.innerHTML = `<div class="loading-state">${error.message}</div>`; return }
  log.ok('renderWorkoutTemplates', `loaded ${templates.length} templates`)

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

  if (error) { log.error('renderExerciseLibrary', 'fetch failed', error); el.innerHTML = `<div class="loading-state">${error.message}</div>`; return }

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

  log.info('saveNewExercise', 'inserting exercise', { name })
  const { error } = await db.from('exercises').insert({
    coach_id:      currentUser.id,
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
  if (!confirm('Delete this exercise? It will be removed from any templates that use it.')) return
  log.info('deleteExercise', 'deleting exercise', { id })
  const { error } = await db.from('exercises').delete().eq('id', id)
  if (error) { log.error('deleteExercise', 'delete failed', error); return }
  log.ok('deleteExercise', 'exercise deleted', { id })
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

  log.info('saveNewTemplate', 'creating template', { name })
  const { data, error } = await db.from('workout_templates').insert({
    coach_id:    currentUser.id,
    name,
    description: document.getElementById('ct-desc').value.trim() || null
  }).select().single()

  if (error) { log.error('saveNewTemplate', 'insert failed', error); errorEl.textContent = error.message; return }
  log.ok('saveNewTemplate', 'template created', { id: data.id, name })
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

  if (error) { log.error('openTemplate', 'fetch failed', error); el.innerHTML = `<div class="loading-state">${error.message}</div>`; return }

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
  log.info('saveExerciseToTemplate', 'adding exercise to template', { templateId, name })

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

  if (error) { log.error('saveExerciseToTemplate', 'insert failed', error); errorEl.textContent = error.message; return }
  log.ok('saveExerciseToTemplate', 'exercise added to template', { templateId, name })
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

  log.info('saveEditTemplateExercise', 'updating template exercise', { texId, name })
  const { error } = await db.from('workout_template_exercises').update({
    exercise_name: name,
    exercise_type: document.getElementById('ett-type').value,
    sets:          sets.length || null,
    sets_json:     sets.length ? sets : null,
    notes:         document.getElementById('etex-notes').value.trim() || null
  }).eq('id', texId)
  if (error) { log.error('saveEditTemplateExercise', 'update failed', error); errorEl.textContent = error.message; return }
  log.ok('saveEditTemplateExercise', 'template exercise updated', { texId })
  closeModal('edit-tex-modal')
  openTemplate(templateId)
}

async function deleteTemplateExercise(texId, templateId) {
  log.info('deleteTemplateExercise', 'removing exercise from template', { texId, templateId })
  const { error } = await db.from('workout_template_exercises').delete().eq('id', texId)
  if (error) { log.error('deleteTemplateExercise', 'delete failed', error); return }
  log.ok('deleteTemplateExercise', 'exercise removed', { texId })
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
  log.info('saveEditTemplate', 'updating template', { id, name })
  const { error } = await db.from('workout_templates').update({
    name,
    description: document.getElementById('et-desc').value.trim() || null
  }).eq('id', id)
  if (error) { log.error('saveEditTemplate', 'update failed', error); errorEl.textContent = error.message; return }
  log.ok('saveEditTemplate', 'template updated', { id })
  closeModal('edit-template-modal')
  openTemplate(id)
}

async function deleteTemplate(id) {
  if (!confirm('Delete this template? This cannot be undone.')) return
  log.info('deleteTemplate', 'deleting template', { id })
  const { error } = await db.from('workout_templates').delete().eq('id', id)
  if (error) { log.error('deleteTemplate', 'delete failed', error); return }
  log.ok('deleteTemplate', 'template deleted', { id })
  closeModal('edit-template-modal')
  navigate('workouts')
}

// ─── CLIENT WORKOUTS TAB ──────────────────────────────────────────────────────
async function renderClientWorkouts(clientId, el) {
  log.info('renderClientWorkouts', 'fetching workout logs', { clientId })
  el.innerHTML = '<div class="loading-state">Loading…</div>'

  const { data: logs, error } = await db
    .from('workout_logs')
    .select('*, workout_log_exercises(id)')
    .eq('client_id', clientId)
    .order('date', { ascending: false })

  if (error) { log.error('renderClientWorkouts', 'fetch failed', error); el.innerHTML = `<div class="loading-state">${error.message}</div>`; return }
  log.ok('renderClientWorkouts', `loaded ${logs.length} sessions`)

  el.innerHTML = `
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-bottom:16px">
      <button class="btn-secondary" style="font-size:13px" onclick="showLogSessionModal('${clientId}')">Log past session</button>
      <button class="btn-primary" onclick="startWorkoutRunner('${clientId}')">▶ Start workout</button>
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

// ─── WORKOUT RUNNER ───────────────────────────────────────────────────────────
let _runner = null

async function startWorkoutRunner(clientId, templateId) {
  const { data: templates } = await db.from('workout_templates').select('*, workout_template_exercises(*)').order('name')
  window._runnerTemplates = templates || []

  // If a specific template was chosen, skip the setup modal and go straight in
  if (templateId) {
    const tmpl = templates?.find(t => t.id === templateId)
    const name = tmpl?.name || new Date().toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'}) + ' workout'
    _fakeRsTemplate = templateId
    _fakeRsName = name
    launchRunner(clientId)
    return
  }

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
          ${(templates||[]).map(t=>`<option value="${t.id}">${t.name}</option>`).join('')}
        </select>
      </div>
      <p class="modal-error" id="rs-error"></p>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="document.getElementById('runner-setup').remove()">Cancel</button>
        <button class="btn-primary" onclick="launchRunner('${clientId}')">▶ Start</button>
      </div>
    </div>
  `
  document.body.appendChild(overlay)
}

function launchRunner(clientId) {
  const name     = document.getElementById('rs-name')?.value.trim() || window._fakeRsName || 'Workout'
  const tmplId   = document.getElementById('rs-template')?.value || window._fakeRsTemplate || ''
  window._fakeRsName = null; window._fakeRsTemplate = null
  const template = window._runnerTemplates?.find(t => t.id === tmplId)

  let exercises = []
  if (template) {
    exercises = (template.workout_template_exercises || [])
      .sort((a, b) => a.order_index - b.order_index)
      .map(ex => {
        const repsStr = String(ex.reps || '')
        const restSecs = ex.rest_seconds || parseRest(ex.sets_json?.restMin || '') || 90
        return { name: ex.exercise_name, type: ex.exercise_type || 'strength', targetSets: ex.sets || 3, targetReps: repsStr, targetWeight: ex.weight_kg || '', restSecs, loggedSets: [] }
      })
  }
  if (!exercises.length) exercises = [{ name: '', type: 'strength', targetSets: 0, targetReps: '', targetWeight: '', loggedSets: [] }]

  document.getElementById('runner-setup')?.remove()

  _runner = { clientId, name, date: new Date().toISOString().split('T')[0], exercises, exIdx: 0, startTime: Date.now(), _timerInterval: null, weightInput: '', repsInput: '', activeField: 'weight' }
  renderRunner()
  _runner._timerInterval = setInterval(() => {
    const el = document.getElementById('wr-timer')
    if (el) el.textContent = fmtRunnerTime(_runner.startTime)
  }, 1000)
}

function fmtRunnerTime(startTime) {
  const s = Math.floor((Date.now() - startTime) / 1000)
  return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`
}

function renderRunner() {
  const ex      = _runner.exercises[_runner.exIdx]
  const setNum  = ex.loggedSets.length + 1
  const isLast  = _runner.exIdx === _runner.exercises.length - 1
  const nextEx  = _runner.exercises[_runner.exIdx + 1]
  const lastSet = ex.loggedSets[ex.loggedSets.length - 1]

  const totalSets   = _runner.exercises.reduce((s,e) => s + e.loggedSets.length, 0)
  const totalReps   = _runner.exercises.reduce((s,e) => s + e.loggedSets.reduce((r,set) => r+(parseInt(set.reps)||0), 0), 0)
  const totalVol    = _runner.exercises.reduce((s,e) => s + e.loggedSets.reduce((v,set) => v+((parseFloat(set.weight)||0)*(parseInt(set.reps)||0)), 0), 0)

  // Pre-fill inputs on first render of each set (keep user edits otherwise)
  if (_runner.weightInput === '' ) _runner.weightInput = String(lastSet?.weight ?? ex.targetWeight ?? '')
  if (_runner.repsInput   === '' ) _runner.repsInput   = String(lastSet?.reps   ?? (ex.targetReps?.split('-')[0] ?? ''))

  let el = document.getElementById('workout-runner')
  if (!el) { el = document.createElement('div'); el.id = 'workout-runner'; document.body.appendChild(el) }

  el.innerHTML = `
    <div style="position:fixed;inset:0;background:var(--bg);z-index:300;display:flex;flex-direction:column;overflow:hidden">

      <!-- Header -->
      <div style="padding:16px 16px 12px;border-bottom:1px solid var(--border)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
          <div style="flex:1;min-width:0">
            <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:4px">
              Exercise ${_runner.exIdx+1} of ${_runner.exercises.length}
            </div>
            <input id="wr-exname" value="${ex.name}" placeholder="Exercise name" style="font-size:20px;font-weight:700;border:none;background:transparent;color:var(--text);width:100%;padding:0;outline:none" oninput="_runner.exercises[${_runner.exIdx}].name=this.value">
            ${ex.targetReps||ex.targetWeight ? `<div style="font-size:12px;color:var(--text-muted);margin-top:3px">${ex.targetSets?ex.targetSets+' sets·':''} ${ex.targetReps?ex.targetReps+' reps':''} ${ex.targetWeight?'@ '+ex.targetWeight+'kg':''}</div>` : ''}
          </div>
          <button onclick="confirmEndRunner()" style="padding:6px 14px;border:1px solid var(--border);border-radius:8px;background:transparent;font-size:13px;font-weight:600;cursor:pointer;color:var(--text-muted);flex-shrink:0">End</button>
        </div>
      </div>

      <!-- Stats bar -->
      <div style="display:flex;border-bottom:1px solid var(--border)">
        ${[['Volume', totalVol>0?Math.round(totalVol)+' kg':'— kg'],['Sets',totalSets||'—'],['Reps',totalReps||'—'],['Time','<span id="wr-timer">'+fmtRunnerTime(_runner.startTime)+'</span>']].map(([l,v])=>`
          <div style="flex:1;text-align:center;padding:8px 2px;border-right:1px solid var(--border)">
            <div style="font-size:15px;font-weight:700;color:var(--accent)">${v}</div>
            <div style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted)">${l}</div>
          </div>`).join('')}
      </div>

      <!-- Logged sets list -->
      <div style="flex:1;overflow-y:auto;padding:12px 16px">
        ${!ex.loggedSets.length ? `<p style="color:var(--text-muted);font-size:13px;margin:0">No sets logged yet.</p>` :
          ex.loggedSets.map((s,i) => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--border)">
              <span style="font-size:13px;color:var(--text-muted);font-weight:600;width:50px">Set ${i+1}</span>
              <span style="font-size:15px;font-weight:700">${s.weight?s.weight+' kg':'—'}</span>
              <span style="font-size:15px;font-weight:700">${s.reps||'—'} reps</span>
              ${s.rpe ? `<span style="font-size:12px;color:var(--text-muted)">RPE ${s.rpe}</span>` : '<span></span>'}
            </div>`).join('')}
        ${nextEx ? `
          <div style="margin-top:16px;padding:10px 12px;border-radius:10px;background:var(--surface-2)">
            <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:2px">Next up</div>
            <div style="font-size:14px;font-weight:600">${nextEx.name || 'Unnamed exercise'}</div>
          </div>` : ''}
      </div>

      <!-- Set input + custom keypad -->
      <div style="padding:10px 12px 6px;border-top:2px solid var(--border);background:var(--surface)">
        <!-- Field displays -->
        <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:6px;align-items:center;margin-bottom:8px">
          <div id="wr-weight-box" onclick="wrSetField('weight')" style="text-align:center;padding:8px 4px;border-radius:10px;border:2px solid ${_runner.activeField==='weight'?'var(--accent)':'var(--border)'};cursor:pointer;background:var(--bg)">
            <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:2px">Kilograms</div>
            <div id="wr-weight-display" style="font-size:30px;font-weight:700;color:var(--text);line-height:1">${_runner.weightInput||'—'}</div>
          </div>
          <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-align:center">Set<br>${setNum}</div>
          <div id="wr-reps-box" onclick="wrSetField('reps')" style="text-align:center;padding:8px 4px;border-radius:10px;border:2px solid ${_runner.activeField==='reps'?'var(--accent)':'var(--border)'};cursor:pointer;background:var(--bg)">
            <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:2px">Reps</div>
            <div id="wr-reps-display" style="font-size:30px;font-weight:700;color:var(--text);line-height:1">${_runner.repsInput||'—'}</div>
          </div>
        </div>
        <!-- Keypad -->
        <div style="display:grid;grid-template-columns:repeat(3,1fr) 80px;grid-template-rows:repeat(4,48px);gap:4px">
          ${['7','8','9','4','5','6','1','2','3','.','0','⌫'].map((k,i) => `
            <button onclick="wrKp('${k}')" style="border:1px solid var(--border);border-radius:8px;background:var(--surface-2);font-size:20px;font-weight:600;cursor:pointer;color:var(--text);${k==='⌫'?'font-size:16px':''}">${k}</button>
          `).join('')}
          <button onclick="skipToNextExercise()" style="grid-column:4;grid-row:1/3;border:1px solid var(--border);border-radius:8px;background:transparent;font-size:11px;font-weight:700;cursor:pointer;color:var(--text-muted);line-height:1.3">${isLast?'Finish 🏁':'Next<br>→'}</button>
          <button onclick="logRunnerSet()" style="grid-column:4;grid-row:3/5;border:none;border-radius:8px;background:var(--accent);color:#fff;font-size:18px;font-weight:800;cursor:pointer">LOG</button>
          <button onclick="wrSwitchField()" style="border:1px solid var(--border);border-radius:8px;background:var(--surface-2);font-size:11px;font-weight:700;cursor:pointer;color:var(--text-muted)">Switch</button>
        </div>
      </div>
    </div>
  `
}

function logRunnerSet() {
  const weight = _runner.weightInput.trim()
  const reps   = _runner.repsInput.trim()
  if (!reps) return
  _runner.exercises[_runner.exIdx].loggedSets.push({ weight, reps })
  _runner.repsInput   = ''
  _runner.activeField = 'reps'
  renderRunner()
  // Start rest timer
  const restSecs = _runner.exercises[_runner.exIdx].restSecs || 90
  startRestTimer(restSecs)
}

function startRestTimer(secs) {
  clearInterval(_runner._restInterval)
  _runner.restRemaining = secs
  _runner.restTotal     = secs
  renderRestTimer()
  _runner._restInterval = setInterval(() => {
    _runner.restRemaining--
    if (_runner.restRemaining <= 0) {
      clearInterval(_runner._restInterval)
      _runner.restRemaining = null
      if (navigator.vibrate) navigator.vibrate([200, 100, 200])
      document.getElementById('rest-timer-overlay')?.remove()
    } else {
      const el = document.getElementById('rt-countdown')
      if (el) {
        el.textContent = fmtRestCountdown(_runner.restRemaining)
        // Pulse red in last 10 seconds
        el.style.color = _runner.restRemaining <= 10 ? '#ef4444' : 'var(--accent)'
      }
      const ring = document.getElementById('rt-ring')
      if (ring) {
        const pct = _runner.restRemaining / _runner.restTotal
        const circ = 2 * Math.PI * 54
        ring.style.strokeDashoffset = circ * (1 - pct)
      }
    }
  }, 1000)
}

function fmtRestCountdown(secs) {
  return `${Math.floor(secs/60)}:${String(secs%60).padStart(2,'0')}`
}

function skipRestTimer() {
  clearInterval(_runner._restInterval)
  _runner.restRemaining = null
  document.getElementById('rest-timer-overlay')?.remove()
}

function renderRestTimer() {
  document.getElementById('rest-timer-overlay')?.remove()
  const secs = _runner.restRemaining
  const total = _runner.restTotal
  const circ = 2 * Math.PI * 54
  const pct  = secs / total

  const overlay = document.createElement('div')
  overlay.id = 'rest-timer-overlay'
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:400;display:flex;align-items:flex-end;justify-content:center'
  overlay.innerHTML = `
    <div style="width:100%;max-width:480px;background:var(--surface);border-radius:24px 24px 0 0;padding:32px 24px 40px;text-align:center">
      <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:20px">Rest</div>
      <div style="position:relative;display:inline-block;margin-bottom:20px">
        <svg width="120" height="120" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="54" fill="none" stroke="var(--border)" stroke-width="6"/>
          <circle id="rt-ring" cx="60" cy="60" r="54" fill="none" stroke="var(--accent)" stroke-width="6"
            stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - pct)}"
            stroke-linecap="round" transform="rotate(-90 60 60)"
            style="transition:stroke-dashoffset .9s linear"/>
        </svg>
        <div id="rt-countdown" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:36px;font-weight:800;color:var(--accent)">${fmtRestCountdown(secs)}</div>
      </div>
      <div style="color:var(--text-muted);font-size:13px;margin-bottom:24px">Next: Set ${(_runner.exercises[_runner.exIdx].loggedSets.length) + 1}</div>
      <button onclick="skipRestTimer()" style="width:100%;padding:14px;border:none;border-radius:12px;background:var(--surface-2);font-size:15px;font-weight:700;cursor:pointer;color:var(--text)">Skip rest →</button>
    </div>
  `
  document.body.appendChild(overlay)
}

function wrKp(key) {
  const f = _runner.activeField
  let v = _runner[f + 'Input'] || ''
  if (key === '⌫') {
    v = v.slice(0, -1)
  } else if (key === '.') {
    if (f === 'reps') return
    if (!v.includes('.')) v += (v === '' ? '0.' : '.')
  } else {
    v = (v === '0' ? key : v + key)
  }
  _runner[f + 'Input'] = v
  const el = document.getElementById('wr-' + f + '-display')
  if (el) el.textContent = v || '—'
}

function wrSetField(field) {
  _runner.activeField = field
  const wb = document.getElementById('wr-weight-box')
  const rb = document.getElementById('wr-reps-box')
  if (wb) wb.style.borderColor = field === 'weight' ? 'var(--accent)' : 'var(--border)'
  if (rb) rb.style.borderColor = field === 'reps'   ? 'var(--accent)' : 'var(--border)'
}

function wrSwitchField() {
  wrSetField(_runner.activeField === 'weight' ? 'reps' : 'weight')
}

function skipToNextExercise() {
  if (_runner.exIdx < _runner.exercises.length - 1) {
    _runner.exIdx++
    renderRunner()
  } else {
    showRunnerFinish()
  }
}

function showRunnerFinish() {
  clearInterval(_runner._timerInterval)
  const el = document.getElementById('workout-runner')
  if (!el) return
  const totalSets = _runner.exercises.reduce((s,e) => s + e.loggedSets.length, 0)
  const duration  = fmtRunnerTime(_runner.startTime)

  el.innerHTML = `
    <div style="position:fixed;inset:0;background:var(--bg);z-index:300;display:flex;flex-direction:column;overflow:hidden">
      <div style="padding:20px 16px;border-bottom:1px solid var(--border)">
        <h2 style="font-size:22px;font-weight:700;margin-bottom:4px">Workout complete 💪</h2>
        <p style="color:var(--text-muted);font-size:13px">${totalSets} sets · ${duration}</p>
      </div>
      <div style="flex:1;overflow-y:auto;padding:16px">
        ${_runner.exercises.filter(e=>e.loggedSets.length).map(e=>`
          <div style="margin-bottom:16px">
            <div style="font-weight:600;font-size:15px;margin-bottom:6px">${e.name}</div>
            ${e.loggedSets.map((s,i)=>`
              <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px">
                <span style="color:var(--text-muted)">Set ${i+1}</span>
                <span style="font-weight:600">${s.weight?s.weight+' kg · ':''}${s.reps} reps</span>
              </div>`).join('')}
          </div>`).join('')}
        <div class="field" style="margin-top:8px">
          <label class="field-label">Session name</label>
          <input class="field-input" id="rf-name" value="${_runner.name}">
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

function confirmEndRunner() {
  if (_runner.exercises.some(e=>e.loggedSets.length)) showRunnerFinish()
  else discardRunner()
}

function discardRunner() {
  clearInterval(_runner?._timerInterval)
  document.getElementById('workout-runner')?.remove()
  _runner = null
}

async function saveRunnerSession() {
  const name  = document.getElementById('rf-name')?.value.trim() || _runner.name
  const notes = document.getElementById('rf-notes')?.value.trim() || null
  const exercises = _runner.exercises.filter(e => e.name && e.loggedSets.length)
  if (!exercises.length) { discardRunner(); return }

  const { data: clientRecord } = await db.from('clients').select('coach_id').eq('id', _runner.clientId).single()
  const coachId = clientRecord?.coach_id || currentUser.id

  const { data: sessionLog, error } = await db.from('workout_logs').insert({
    coach_id: coachId, client_id: _runner.clientId, name, date: _runner.date, notes
  }).select().single()
  if (error) { alert('Save failed: ' + error.message); return }

  for (let bi = 0; bi < exercises.length; bi++) {
    const ex = exercises[bi]
    const { data: logEx, error: exErr } = await db.from('workout_log_exercises').insert({
      log_id: sessionLog.id, exercise_name: ex.name, exercise_type: ex.type, order_index: bi
    }).select().single()
    if (exErr) { alert('Save failed: ' + exErr.message); return }

    const sets = ex.loggedSets.map((s, si) => {
      const row = { workout_log_exercise_id: logEx.id, set_number: si+1, set_type: 'working' }
      if (ex.type === 'cardio') {
        if (s.duration) row.duration_seconds = parseDuration(s.duration)
        if (s.reps) row.distance_m = Math.round(parseFloat(s.reps)*1000)
      } else {
        if (s.reps) row.reps_achieved = parseInt(s.reps)
        if (s.weight) row.weight_kg = parseFloat(s.weight)
        if (s.rpe) { row.effort_type = 'rpe'; row.effort_value = parseFloat(s.rpe) }
      }
      return row
    }).filter(s => Object.keys(s).length > 3)

    if (sets.length) await db.from('workout_log_sets').insert(sets)
  }

  const savedClientId = _runner.clientId
  discardRunner()
  const tabContent = document.getElementById('tab-content')
  if (tabContent) renderClientWorkouts(savedClientId, tabContent)
  else renderClientDashboard(document.getElementById('main-content'))
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
  return (Math.round(parseFloat(oneRM) * parseFloat(pct) / 100 * 2) / 2).toFixed(1)
}

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
      ${hdr('RPE')}
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
      const delBtn = `<button onclick="flushLogState();window._logBlocks[${bi}].sets.splice(${si},1);renderLogExercises()" style="width:${isMobile?'28px':'22px'};height:${isMobile?'36px':'22px'};border-radius:5px;border:1px solid var(--border);background:transparent;color:var(--text-muted);cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;padding:0">×</button>`
      return `
        <div style="display:grid;grid-template-columns:${GRID};gap:${isMobile?'5px':'3px'};align-items:center;margin-bottom:${isMobile?'6px':'3px'}">
          <span style="font-size:11px;font-weight:600;color:var(--text-muted);text-align:center">${si + 1}</span>
          ${isCardio ? `
            <input id="ls-dur-${bi}-${si}" ${si_style} type="text" placeholder="0:00" value="${s.duration || ''}" oninput="this.value=fmtRest(this.value)">
            <input id="ls-dist-${bi}-${si}" ${si_style} type="number" step="0.01" placeholder="km" value="${s.distance || ''}">
          ` : isMobile ? `
            <input id="ls-rmin-${bi}-${si}" ${si_style} inputmode="numeric" placeholder="reps" value="${s.repsMin || ''}">
            <input id="ls-weight-${bi}-${si}" ${si_style} inputmode="decimal" step="0.5" placeholder="kg" value="${s.weight || ''}">
            <input id="ls-effort-${bi}-${si}" ${si_style} inputmode="decimal" step="0.5" min="0" max="10" placeholder="RPE" value="${s.effort || ''}">
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

  // Derive coach_id from the client record — works for both coach and client self-logging
  const { data: clientRecord } = await db.from('clients').select('coach_id').eq('id', clientId).single()
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

  for (let bi = 0; bi < blocks.length; bi++) {
    const block = blocks[bi]
    log.info('saveWorkoutSession', `saving exercise ${bi + 1}/${blocks.length}`, { name: block.name, sets: block.sets.length })
    const { data: logEx, error: exErr } = await db.from('workout_log_exercises').insert({
      log_id:        sessionLog.id,
      exercise_name: block.name.trim(),
      exercise_type: block.type,
      order_index:   bi
    }).select().single()

    if (exErr) { log.error('saveWorkoutSession', `exercise ${bi + 1} insert failed`, exErr); errorEl.textContent = exErr.message; return }

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
      if (setsErr) { log.error('saveWorkoutSession', `sets insert failed for exercise ${bi + 1}`, setsErr); errorEl.textContent = setsErr.message; return }
      log.ok('saveWorkoutSession', `sets saved for exercise ${bi + 1}`, { count: setsToInsert.length })
    }
  }

  log.ok('saveWorkoutSession', 'session fully saved', { clientId, name })
  closeModal('log-session-modal')
  window._logBlocks = []
  const tabContent = document.getElementById('tab-content')
  if (tabContent) renderClientWorkouts(clientId, tabContent)
  else renderClientDashboard(document.getElementById('main-content'))
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
  log.info('deleteWorkoutLog', 'deleting session', { logId })
  const { error } = await db.from('workout_logs').delete().eq('id', logId)
  if (error) { log.error('deleteWorkoutLog', 'delete failed', error); return }
  log.ok('deleteWorkoutLog', 'session deleted', { logId })
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

  if (!category || !date || !name || !value || !unit) return alert('Please fill in all required fields.')

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

  log.info('sendClientInvite', 'sending invite', { clientId, email })
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
    alert('Failed to send invite: ' + (json.error || 'Unknown error'))
    btn.disabled = false
    btn.textContent = '✉ Send invite'
    return
  }

  log.ok('sendClientInvite', 'invite sent via edge function', { email, userId: json.userId })
  const { error: stampErr } = await db.from('clients').update({ invited_at: new Date().toISOString() }).eq('id', clientId)
  if (stampErr) log.error('sendClientInvite', 'failed to stamp invited_at', stampErr)

  alert(`Invite sent to ${email}`)
  openClient(clientId)
}

async function saveWeightLog(clientId) {
  const date   = document.getElementById('wl-date')?.value
  const weight = document.getElementById('wl-weight')?.value
  const bf     = document.getElementById('wl-bf')?.value
  const notes  = document.getElementById('wl-notes')?.value?.trim()

  if (!date || !weight) return alert('Date and weight are required.')

  log.info('saveWeightLog', 'inserting weight entry', { clientId, date, weight_kg: weight })
  const { error } = await db.from('weight_logs').insert({
    client_id:    clientId,
    date,
    weight_kg:    parseFloat(weight),
    body_fat_pct: bf ? parseFloat(bf) : null,
    notes:        notes || null
  })

  if (error) { log.error('saveWeightLog', 'insert failed', error); document.getElementById('wl-error') && (document.getElementById('wl-error').textContent = error.message); return }
  log.ok('saveWeightLog', 'weight entry saved', { clientId, date, weight_kg: weight })
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
  log.info('inviteForm', 'submitting invite acceptance', { name })
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

db.auth.onAuthStateChange((event, session) => {
  log.info('auth', `state change: ${event}`, { userId: session?.user?.id ?? null })
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
