// ─── CONFIG ───────────────────────────────────────────────────────────────────
const _initialHash = window.location.hash

// ─── LOGGER ───────────────────────────────────────────────────────────────────
// Structured console logging + user-visible error toasts.
// Open DevTools → Console to trace any failure instantly.
const log = {
  info:  (tag, msg, data) => console.log(`[${tag}]`, msg, data ?? ''),
  warn:  (tag, msg, data) => console.warn(`[${tag}]`, msg, data ?? ''),
  error: (tag, msg, data) => { console.error(`[${tag}] ❌`, msg, data ?? ''); showToast(`${tag}: ${msg}`, 'error') },
  ok:    (tag, msg, data) => console.log(`[${tag}] ✓`, msg, data ?? ''),
}

// ─── TOAST NOTIFICATIONS ──────────────────────────────────────────────────────
// Surface DB errors and key events to the user — not just the console.
function showToast(msg, type = 'error', duration = 4000) {
  const existing = document.getElementById('app-toast')
  if (existing) existing.remove()
  const colours = { error: '#ef4444', success: '#10b981', info: 'var(--accent)', warn: '#f59e0b' }
  const el = document.createElement('div')
  el.id = 'app-toast'
  el.textContent = msg
  el.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:9999;
    background:${colours[type]||colours.info};color:#fff;padding:10px 20px;border-radius:10px;
    font-size:13px;font-weight:600;box-shadow:0 4px 16px rgba(0,0,0,.18);
    max-width:90vw;text-align:center;pointer-events:none;
    animation:toastIn .2s ease`
  document.body.appendChild(el)
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300) }, duration)
}

// Supabase query wrapper — auto-logs all errors; warns on PGRST116 (no row found)
// Pass showUserError:false to suppress toast for expected "no row" scenarios.
async function dbq(label, query, { showUserError = true } = {}) {
  const t0 = performance.now()
  const { data, error } = await query
  const ms = Math.round(performance.now() - t0)
  if (error) {
    if (error.code === 'PGRST116') log.warn(label, 'no row found', { code: error.code, ms })
    else {
      console.error(`[${label}] ❌ ${error.code ?? 'ERR'}: ${error.message}`, error)
      if (showUserError) showToast(`Save failed — ${error.message}`, 'error')
    }
  } else {
    log.info(label, `query OK (${ms}ms)`)
  }
  return { data, error }
}

// Clears a setInterval/setTimeout ID and returns null so the caller can zero the variable in one line:
//   _runner._restInterval = clearTimer(_runner._restInterval)
// Never use clearInterval() directly — the ID stays truthy and breaks if-guards.
const clearTimer = id => { clearInterval(id); return null }

const SUPABASE_URL = 'https://avilxuiacmtgeoxxhfhc.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF2aWx4dWlhY210Z2VveHhoZmhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NjExNzcsImV4cCI6MjA5NzQzNzE3N30.SpVc5ZX_yf6gMrCJLxY9CxDki7PhBj2vbENha7tWBrc'
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY)

// ─── STATE ────────────────────────────────────────────────────────────────────
let currentUser    = null
let currentProfile = null
let currentPage    = 'dashboard'
window._branding      = { businessName: null, logoPath: null, logoUrl: null }
window._brandingFile  = null
window._soloClientId  = null  // personal account client record (coach_id = null)
window._masterClientId = null  // coached client record (coach_id = coach's uid)

// ─── SHELL HELPERS ────────────────────────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return ''
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')
}

function showAuth() {
  document.getElementById('auth-screen').style.display = 'flex'
  document.getElementById('app-shell').style.display   = 'none'
}

async function showApp() {
  document.getElementById('auth-screen').style.display = 'none'
  document.getElementById('app-shell').style.display   = 'flex'
  await loadUserInfo()
  applyRoleUI()
  const role = currentProfile?.role
  const defaultPage = role === 'client' ? 'client-dashboard' : role === 'solo' ? 'solo-dashboard' : 'dashboard'
  const clientPages = ['client-dashboard', 'workouts', 'calendar', 'progress', 'settings']
  const soloPages   = ['solo-dashboard', 'workouts', 'programs', 'calendar', 'progress', 'settings']
  const coachPages  = ['dashboard', 'clients', 'workouts', 'calendar', 'programs', 'settings']
  const validPages  = role === 'client' ? clientPages : role === 'solo' ? soloPages : coachPages

  // Read page from hash (e.g. #dashboard → 'dashboard')
  const hashPage = window.location.hash.replace(/^#/, '').split('/')[0]
  if (hashPage && validPages.includes(hashPage)) { navigate(hashPage, 'replace'); return }

  // Fall back to localStorage then role default
  const stored = localStorage.getItem('_activePage')
  navigate(stored && validPages.includes(stored) ? stored : defaultPage, 'replace')
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

  // If profile has no role (invited client whose profile row may have been created without role),
  // check the clients table to determine correct role
  if (!currentProfile?.role || currentProfile.role === null) {
    const { data: clientRec } = await db.from('clients').select('id').eq('user_id', currentUser.id).single()
    if (clientRec) {
      currentProfile = { ...(currentProfile || {}), role: 'client' }
      // Also patch the profiles row so this only happens once
      await dbq('loadUserInfo:profilePatch', db.from('profiles').upsert({ id: currentUser.id, role: 'client', full_name: data?.full_name || currentUser.email }, { onConflict: 'id' }))
      log.info('loadUserInfo', 'client role inferred from clients table and patched')
    }
  }

  const name    = currentProfile?.full_name || currentUser.email
  const initial = name.charAt(0).toUpperCase()
  document.getElementById('user-name').textContent   = name.split(' ')[0]
  document.getElementById('user-avatar').textContent = initial

  // Check if this account also has client records (master account detection)
  if (currentProfile?.role === 'coach') {
    const [{ data: coachedRec }, { data: soloRec }] = await Promise.all([
      db.from('clients').select('id').eq('user_id', currentUser.id).not('coach_id', 'is', null).maybeSingle(),
      db.from('clients').select('id').eq('user_id', currentUser.id).is('coach_id', null).maybeSingle(),
    ])
    if (coachedRec) { window._masterAccount = true; window._masterClientId = coachedRec.id }
    if (soloRec)    { window._masterAccount = true; window._soloClientId   = soloRec.id }
    if (window._masterAccount) {
      const storedView = localStorage.getItem('_activeView')
      const validStoredViews = ['coach', ...(window._masterClientId ? ['client'] : []), ...(window._soloClientId ? ['solo'] : [])]
      const activeView = validStoredViews.includes(storedView) ? storedView : 'coach'
      if (activeView === 'client') currentProfile = { ...currentProfile, role: 'client' }
      if (activeView === 'solo')   currentProfile = { ...currentProfile, role: 'solo' }
      document.getElementById('view-switcher').style.display = 'block'
      updateViewSwitcherButtons(activeView)
    }
  }
  await _loadBranding()
}

async function _loadBranding() {
  window._branding = { businessName: null, logoPath: null, logoUrl: null }
  // RLS handles filtering: coaches see own row, clients see their coach's row
  const { data } = await db.from('coach_branding').select('business_name, logo_path').maybeSingle()
  if (!data) return
  window._branding.businessName = data.business_name || null
  window._branding.logoPath     = data.logo_path || null
  if (data.logo_path) {
    const { data: urlData } = await db.storage.from('logos').createSignedUrl(data.logo_path, 604800)
    window._branding.logoUrl = urlData?.signedUrl || null
  }
  _applyBrandingToSidebar()
}

function _applyBrandingToSidebar() {
  const brand = document.querySelector('.sidebar-brand')
  if (!brand) return
  const b = window._branding || {}
  if (b.logoUrl) {
    brand.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:flex-start;gap:6px;padding:4px 0">
        <img src="${b.logoUrl}" alt="${escapeHtml(b.businessName) || 'Logo'}" style="height:52px;width:auto;max-width:160px;object-fit:contain;border-radius:6px">
        <span style="font-size:9px;color:var(--text-muted);font-weight:600;letter-spacing:.06em;text-transform:uppercase">powered by CoachApp</span>
      </div>`
  } else if (b.businessName) {
    brand.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:4px 0">
        <span style="font-size:16px;font-weight:700;color:var(--text);line-height:1.2">${escapeHtml(b.businessName)}</span>
        <span style="font-size:9px;color:var(--text-muted);font-weight:600;letter-spacing:.06em;text-transform:uppercase">powered by CoachApp</span>
      </div>`
  }
  // else: default "C CoachApp" design unchanged
}

const _NAV_ICONS = {
  dashboard:          `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
  'client-dashboard': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
  'solo-dashboard':   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
  clients:          `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  workouts:         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>`,
  calendar:         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  programs:         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
  settings:         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  progress:         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
}

const _NAV_ITEMS = {
  coach:  [
    { page: 'dashboard',  label: 'Dashboard' },
    { page: 'clients',    label: 'Clients'   },
    { page: 'workouts',   label: 'Workouts'  },
    { page: 'calendar',   label: 'Calendar'  },
    { page: 'programs',   label: 'Programs'  },
    { page: 'settings',   label: 'Settings'  },
  ],
  client: [
    { page: 'client-dashboard', label: 'Dashboard' },
    { page: 'workouts',         label: 'Workouts'  },
    { page: 'calendar',         label: 'Calendar'  },
    { page: 'progress',         label: 'Progress'  },
    { page: 'settings',         label: 'Settings'  },
  ],
  solo: [
    { page: 'solo-dashboard', label: 'Dashboard' },
    { page: 'workouts',       label: 'Workouts'  },
    { page: 'programs',       label: 'Programs'  },
    { page: 'calendar',       label: 'Calendar'  },
    { page: 'progress',       label: 'Progress'  },
    { page: 'settings',       label: 'Settings'  },
  ],
}

function renderNav(role) {
  const items = _NAV_ITEMS[role] || _NAV_ITEMS.coach
  const sidebarNav = document.querySelector('.sidebar-nav')
  const bottomNav  = document.querySelector('.bottom-nav')
  if (sidebarNav) {
    sidebarNav.innerHTML = items.map(({ page, label }) => `
      <a href="#" class="nav-item${currentPage === page ? ' active' : ''}" data-page="${page}">
        ${_NAV_ICONS[page] || ''}${label}
      </a>`).join('')
  }
  if (bottomNav) {
    bottomNav.innerHTML = items.map(({ page, label }) => `
      <a href="#" class="bottom-nav-item${currentPage === page ? ' active' : ''}" data-page="${page}">
        ${_NAV_ICONS[page] || ''}<span>${label}</span>
      </a>`).join('')
  }
}

function applyRoleUI() {
  const role = currentProfile?.role
  renderNav(role === 'client' ? 'client' : role === 'solo' ? 'solo' : 'coach')
}

function updateViewSwitcherButtons(activeView) {
  const active   = 'background:var(--accent);color:#fff'
  const inactive = 'background:transparent;color:var(--text-muted)'
  const sBase    = ';border:none;cursor:pointer;font-weight:700;transition:all .15s;flex:1;padding:5px 8px;border-radius:6px;font-size:12px'
  const mBase    = ';border:none;cursor:pointer;font-weight:700;transition:all .15s;padding:5px 16px;border-radius:16px;font-size:12px'

  const sc = document.getElementById('vs-coach')
  const sk = document.getElementById('vs-client')
  const sp = document.getElementById('vs-personal')
  const mc = document.getElementById('mvs-coach')
  const mk = document.getElementById('mvs-client')
  const mp = document.getElementById('mvs-personal')

  if (sc) sc.style.cssText = (activeView==='coach'  ? active : inactive) + sBase
  if (sk) { sk.style.cssText = (activeView==='client' ? active : inactive) + sBase; sk.style.display = window._masterClientId ? 'block' : 'none' }
  if (sp) { sp.style.cssText = (activeView==='solo'   ? active : inactive) + sBase; sp.style.display = window._soloClientId   ? 'block' : 'none' }
  if (mc) mc.style.cssText = (activeView==='coach'  ? active : inactive) + mBase
  if (mk) { mk.style.cssText = (activeView==='client' ? active : inactive) + mBase; mk.style.display = window._masterClientId ? 'block' : 'none' }
  if (mp) { mp.style.cssText = (activeView==='solo'   ? active : inactive) + mBase; mp.style.display = window._soloClientId   ? 'block' : 'none' }
}

function switchView(view) {
  if (!window._masterAccount) return
  currentProfile = { ...currentProfile, role: view }
  localStorage.setItem('_activeView', view)
  updateViewSwitcherButtons(view)
  applyRoleUI()
  if (view === 'client') navigate('client-dashboard')
  else if (view === 'solo') navigate('solo-dashboard')
  else navigate('dashboard')
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
  log.info('login', 'attempting sign in')
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
    log.ok('login', 'sign in successful')
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

  if (!document.getElementById('signup-consent')?.checked) {
    errorEl.textContent = 'Please accept the privacy policy to continue.'
    btn.disabled = false; btn.textContent = 'Create account'; return
  }

  const email = document.getElementById('signup-email').value
  log.info('signup', 'attempting sign up')
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
    log.ok('signup', 'account created and session active')
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
function navigate(page, _historyOp = 'push') {
  document.querySelectorAll('.modal-overlay').forEach(m => m.remove())
  if (currentPage && currentPage !== page) window._prevPage = currentPage
  currentPage = page
  localStorage.setItem('_activePage', page)
  if (_historyOp === 'push')    history.pushState({ page }, '', '#' + page)
  else if (_historyOp === 'replace') history.replaceState({ page }, '', '#' + page)

  document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page)
  })

  const container = document.getElementById('main-content')

  const _catch = (page, fn) => fn(container).catch(err => {
    log.error('navigate', `render failed for ${page}`, err)
    container.innerHTML = `<div class="loading-state">Something went wrong. <a href="#" onclick="navigate('${page}');return false" style="color:var(--accent)">Retry</a></div>`
  })
  switch (page) {
    case 'dashboard':        _catch('dashboard',        renderDashboard);        break
    case 'client-dashboard': _catch('client-dashboard', renderClientDashboard);  break
    case 'solo-dashboard':   _catch('solo-dashboard',   renderSoloDashboard);    break
    case 'programs':         _catch('programs',         renderPrograms);         break
    case 'clients':          _catch('clients',          renderClients);          break
    case 'workouts':         _catch('workouts',         renderWorkouts);         break
    case 'calendar':         _catch('calendar',         renderCalendar);         break
    case 'settings':         _catch('settings',         renderSettings);         break
    case 'progress':         _catch('progress',         renderProgress);         break
    default: container.innerHTML = '<div class="loading-state">Page not found</div>'
  }
}

// Returns the client_id for the current view context
// Solo view → personal record. Client view → coached record.
async function _getCurrentClientId() {
  if (currentProfile?.role === 'solo') return window._soloClientId || null
  const { data } = await db.from('clients').select('id').eq('user_id', currentUser.id).not('coach_id', 'is', null).maybeSingle()
  return data?.id || null
}

// Browser back/forward — re-render without pushing another history entry
window.addEventListener('popstate', e => {
  if (e.state?.page) navigate(e.state.page, 'none')
})

// Single delegated listener on each nav container — survives any re-render, never stacks
;['sidebar-nav', 'bottom-nav'].forEach(id => {
  const nav = document.querySelector(`.${id === 'sidebar-nav' ? 'sidebar' : 'bottom-nav'}`)
  if (nav) nav.addEventListener('click', e => {
    const item = e.target.closest('.nav-item, .bottom-nav-item')
    if (item?.dataset.page) { e.preventDefault(); navigate(item.dataset.page) }
  })
})

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
async function renderDashboard(el) {
  log.info('renderDashboard', 'fetching dashboard data')
  el.innerHTML = '<div class="loading-state">Loading…</div>'

  const sevenDaysAgo   = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000).toISOString()
  const fourteenDaysOn = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const todayStr       = new Date().toISOString().split('T')[0]

  // Fetch coach's client IDs first so all queries are correctly scoped
  const { data: coachClients } = await db.from('clients').select('id, full_name, status').eq('coach_id', currentUser.id).order('full_name')
  const coachClientIds = (coachClients || []).map(c => c.id)

  const [
    { count: clientCount },
    { count: goalCount },
    { data: recentWeights },
    { data: recentWorkouts },
    { data: upcomingGoals }
  ] = await Promise.all([
    db.from('clients').select('*', { count: 'exact', head: true }).eq('coach_id', currentUser.id),
    db.from('goals').select('*', { count: 'exact', head: true }).eq('status', 'active').in('client_id', coachClientIds),
    coachClientIds.length ? db.from('weight_logs').select('client_id, created_at, weight_kg').in('client_id', coachClientIds).gte('created_at', sevenDaysAgo).order('created_at', { ascending: false }).limit(30) : { data: [] },
    coachClientIds.length ? db.from('workout_logs').select('client_id, date, created_at').in('client_id', coachClientIds).gte('date', todayStr.slice(0,7) + '-01').order('date', { ascending: false }).limit(100) : { data: [] },
    db.from('goals').select('id, title, target_date, client_id, clients(full_name)').eq('status', 'active').not('target_date', 'is', null).gte('target_date', todayStr).lte('target_date', fourteenDaysOn).order('target_date').limit(5)
  ])

  const activeClients = (coachClients || []).filter(c => c.status === 'active')

  const clientMap = {}
  ;(activeClients || []).forEach(c => { clientMap[c.id] = c.full_name })

  // Activity feed — merge weight + workout logs, sort newest first
  const feed = [
    ...(recentWeights  || []).map(w => ({ type: 'weight',  client_id: w.client_id, logged_at: w.created_at, detail: `${w.weight_kg} kg` })),
    ...(recentWorkouts || []).map(w => ({ type: 'session', client_id: w.client_id, logged_at: w.created_at || w.date, detail: 'Session logged' }))
  ].sort((a, b) => new Date(b.logged_at) - new Date(a.logged_at)).slice(0, 8)

  // Clients with no activity in last 7 days
  const activeSet = new Set([
    ...(recentWeights  || []).map(w => w.client_id),
    ...(recentWorkouts || []).map(w => w.client_id)
  ])
  const quietClients = (activeClients || []).filter(c => !activeSet.has(c.id))

  // Compliance — session count per active client this week
  const weekAgoStr = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const sessionCounts = {}
  ;(recentWorkouts || []).filter(w => w.date >= weekAgoStr).forEach(w => {
    sessionCounts[w.client_id] = (sessionCounts[w.client_id] || 0) + 1
  })
  const complianceRows = (activeClients || [])
    .map(c => ({ ...c, sessions: sessionCounts[c.id] || 0 }))
    .sort((a, b) => a.sessions - b.sessions) // fewest first

  const sessionsThisWeekTotal = (recentWorkouts || []).filter(w => w.date >= weekAgoStr).length

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
    <style>
      .pt-grid{display:grid;grid-template-columns:3fr 2fr;gap:16px}
      @media(max-width:640px){.pt-grid{grid-template-columns:1fr}}
    </style>

    <div class="page-header">
      <div>
        <h1 class="page-title">Welcome back, ${firstName}</h1>
        <p class="page-subtitle">${window._branding?.businessName ? escapeHtml(window._branding.businessName) + ' · ' : ''}${today}</p>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn-primary" onclick="showAddClientModal()">+ Add client</button>
        <button class="btn-secondary" onclick="navigate('workouts')">Build a workout</button>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:16px">
      ${[
        [clientCount ?? 0, 'Total clients'],
        [sessionsThisWeekTotal, 'Sessions this week'],
        [goalCount ?? 0, 'Active goals'],
      ].map(([val, label]) => `
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px 16px">
          <div style="font-size:26px;font-weight:700;color:var(--text)">${val}</div>
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-top:3px">${label}</div>
        </div>`).join('')}
    </div>

    <div class="pt-grid">

      <!-- Left: recent activity -->
      <div class="dashboard-card">
        <div class="card-header">
          <h2 class="card-title">Recent activity</h2>
          <span style="font-size:12px;color:var(--text-muted)">Last 7 days</span>
        </div>
        ${feed.length === 0 ? `
          <p style="color:var(--text-muted);font-size:13px">No activity in the last 7 days.</p>
        ` : feed.map(f => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
            <div style="display:flex;align-items:center;gap:10px">
              <div style="width:32px;height:32px;border-radius:8px;background:var(--bg-accent);display:flex;align-items:center;justify-content:center;flex-shrink:0">
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-accent)" stroke-width="2" style="width:15px;height:15px"><path d="${f.type === 'weight' ? 'M3 6h18M3 12h18M3 18h18' : 'M6 5h12M6 12h12M6 19h12'}"/></svg>
              </div>
              <div>
                <div style="font-size:13px;font-weight:600;cursor:pointer" onclick="openClient('${f.client_id}')">${clientMap[f.client_id] || 'Unknown'}</div>
                <div style="font-size:11.5px;color:var(--text-muted)">${f.type === 'weight' ? f.detail : 'Session logged'}</div>
              </div>
            </div>
            <div style="font-size:11.5px;color:var(--text-muted);white-space:nowrap">${timeAgo(f.logged_at)}</div>
          </div>
        `).join('')}
      </div>

      <!-- Right: compliance + goals -->
      <div style="display:flex;flex-direction:column;gap:16px">

        <div class="dashboard-card">
          <div class="card-header">
            <div>
              <h2 class="card-title">This week's sessions</h2>
              ${complianceRows.length > 0 ? (() => {
                const atRisk = complianceRows.filter(c => c.sessions === 0).length
                const onTrack = complianceRows.filter(c => c.sessions >= 2).length
                const parts = []
                if (atRisk > 0) parts.push(`<span style="color:#ef4444;font-weight:600">${atRisk} at risk</span>`)
                if (onTrack > 0) parts.push(`<span style="color:#22c55e;font-weight:600">${onTrack} on track</span>`)
                return parts.length ? `<p style="font-size:12px;color:var(--text-muted);margin-top:2px">${parts.join(' · ')}</p>` : ''
              })() : ''}
            </div>
            <div style="display:flex;gap:4px" id="compliance-filter-btns">
              ${['All','At risk','Active'].map((f,i) => `<button onclick="filterCompliance('${f}')" id="cf-${f.replace(' ','-')}" style="padding:3px 9px;border-radius:12px;border:1px solid var(--border);background:${i===0?'var(--accent)':'transparent'};color:${i===0?'#fff':'var(--text-muted)'};font-size:11px;font-weight:600;cursor:pointer">${f}</button>`).join('')}
            </div>
          </div>
          <div id="compliance-rows">
            ${complianceRows.length === 0 ? `<p style="color:var(--text-muted);font-size:13px">No active clients.</p>` :
              complianceRows.map(c => {
                const dot = c.sessions === 0 ? '#ef4444' : c.sessions === 1 ? '#f59e0b' : '#22c55e'
                const label = c.sessions === 0 ? 'No sessions' : `${c.sessions} session${c.sessions !== 1 ? 's' : ''}`
                const zone = c.sessions === 0 ? 'at-risk' : 'active'
                return `
                <div class="compliance-row" data-zone="${zone}" style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--border)">
                  <div style="display:flex;align-items:center;gap:8px">
                    <div style="width:7px;height:7px;border-radius:50%;background:${dot};flex-shrink:0"></div>
                    <div style="font-size:13px;font-weight:500;cursor:pointer" onclick="openClient('${c.id}')">${c.full_name}</div>
                  </div>
                  <span style="font-size:11.5px;font-weight:600;color:${dot}">${label}</span>
                </div>`
              }).join('')}
          </div>
        </div>

        <div class="dashboard-card">
          <div class="card-header">
            <h2 class="card-title">Goals due soon</h2>
            <span style="font-size:12px;color:var(--text-muted)">Next 14 days</span>
          </div>
          ${!upcomingGoals?.length ? `
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
  `
}

function filterCompliance(filter) {
  document.querySelectorAll('[id^="cf-"]').forEach(b => {
    const active = b.id === `cf-${filter.replace(' ', '-')}`
    b.style.background = active ? 'var(--accent)' : 'transparent'
    b.style.color = active ? '#fff' : 'var(--text-muted)'
  })
  document.querySelectorAll('.compliance-row').forEach(row => {
    const show = filter === 'All' || row.dataset.zone === filter.toLowerCase().replace(' ', '-')
    row.style.display = show ? '' : 'none'
  })
}

// ─── CLIENT DASHBOARD ─────────────────────────────────────────────────────────
// ─── SUDO (impersonation) ─────────────────────────────────────────────────────
function sudoAsClient(clientId, clientName) {
  window._sudoClientId   = clientId
  window._sudoClientName = clientName
  window._sudoFromRole   = currentProfile?.role || 'coach'
  currentProfile = { ...currentProfile, role: 'client' }
  navigate('client-dashboard')
}
function exitSudo() {
  currentProfile = { ...currentProfile, role: window._sudoFromRole || 'coach' }
  delete window._sudoClientId
  delete window._sudoClientName
  delete window._sudoFromRole
  navigate('dashboard')
}

async function renderClientDashboard(el) {
  log.info('renderClientDashboard', 'fetching data', { userId: currentUser.id })
  el.innerHTML = '<div class="loading-state">Loading…</div>'

  const todayStr = new Date().toISOString().split('T')[0]
  const isSudo = !!window._sudoClientId

  let clientId, firstName

  if (isSudo) {
    clientId  = window._sudoClientId
    firstName = (window._sudoClientName || 'Client').split(' ')[0]
  } else {
    // Find coached client record (coach_id is not null = has a PT)
    const { data: clientRow, error: clientErr } = await db
      .from('clients')
      .select('id, full_name, coach_id')
      .eq('user_id', currentUser.id)
      .not('coach_id', 'is', null)
      .maybeSingle()

    if (clientErr || !clientRow) {
      log.error('renderClientDashboard', 'client record not found', clientErr)
      el.innerHTML = '<div class="loading-state">Unable to load your profile. Please contact your coach.</div>'
      return
    }

    clientId  = clientRow.id
  }

  const [
    { data: goals },
    { data: events },
    { data: weights },
    { data: perfLogs },
    { data: assignedPrograms },
    { data: recentSessions },
    { data: checkIns },
  ] = await Promise.all([
    db.from('goals').select('id, title, target_date, status, start_value, current_value, target_value, goal_milestones(id, title, completed_at, order)').eq('client_id', clientId).eq('status', 'active').order('target_date'),
    db.from('events').select('id, title, date, type, notes').eq('client_id', clientId).gte('date', todayStr).order('date').limit(4),
    db.from('weight_logs').select('date, weight_kg').eq('client_id', clientId).order('date', { ascending: false }).limit(5),
    db.from('performance_logs').select('name, category, value, unit, date').eq('client_id', clientId).order('date', { ascending: false }),
    db.from('client_programs').select('start_date, programs(name, description, program_phases(id, name, duration_weeks, order_index, program_phase_workouts(id, day_of_week, session_order, notes, workout_templates(id, name))))').eq('client_id', clientId).order('created_at', { ascending: false }).limit(1),
    db.from('workout_logs').select('id, name, date, workout_log_exercises(id)').eq('client_id', clientId).order('date', { ascending: false }).limit(5),
    db.from('client_check_ins').select('*').eq('client_id', clientId).order('created_at', { ascending: false }).limit(1),
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

  if (!isSudo) firstName = currentProfile?.full_name?.split(' ')[0] || 'there'

  // This week stats
  const weekAgoStr2 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const sessionsThisWeek = (recentSessions || []).filter(s => s.date >= weekAgoStr2).length
  const lastCheckIn = checkIns?.[0] || null
  const daysSinceCheckIn = lastCheckIn ? Math.floor((Date.now() - new Date(lastCheckIn.created_at)) / 86400000) : null
  const checkInDue = daysSinceCheckIn === null || daysSinceCheckIn >= 7

  // Hero card: find current phase from assigned program
  let cHeroTitle = 'No program assigned', cHeroMeta = 'Ask your PT to assign a training program.', cHeroBtnLabel = 'Log a session', cHeroAction = `startWorkoutRunner('${clientId}')`
  if (assignedPrograms?.[0]) {
    const prog = assignedPrograms[0].programs
    const startDate = new Date(assignedPrograms[0].start_date + 'T00:00:00')
    const weeksSinceStart = Math.max(0, Math.floor((Date.now() - startDate) / (7 * 24 * 60 * 60 * 1000)))
    const phases = (prog.program_phases || []).sort((a, b) => a.order_index - b.order_index)
    let cumWeeks = 0, currentPhase = phases[phases.length - 1] || null
    for (const p of phases) { cumWeeks += p.duration_weeks; if (weeksSinceStart < cumWeeks) { currentPhase = p; break } }
    cHeroTitle = prog.name || 'Your program'
    cHeroMeta = currentPhase ? currentPhase.name + ' · Week ' + (weeksSinceStart + 1) : (prog.description || '')
    cHeroBtnLabel = 'View workouts'
    cHeroAction = `navigate('workouts')`
  }

  el.innerHTML = `
    <style>
      .client-grid{display:grid;grid-template-columns:3fr 2fr;gap:16px}
      @media(max-width:640px){.client-grid{grid-template-columns:1fr}}
    </style>

    ${isSudo ? `
    <div style="background:#f59e0b;color:#fff;border-radius:10px;padding:10px 16px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:12px">
      <span style="font-size:13px;font-weight:700">👁 Viewing as ${escapeHtml(window._sudoClientName || 'Client')}</span>
      <button onclick="exitSudo()" style="background:rgba(0,0,0,.18);border:none;color:#fff;font-size:12px;font-weight:700;padding:5px 12px;border-radius:6px;cursor:pointer">Exit ✕</button>
    </div>` : ''}

    ${window._branding?.logoUrl || window._branding?.businessName ? `
    <div style="display:flex;align-items:center;gap:12px;padding:14px 16px;background:var(--surface);border:1px solid var(--border);border-radius:12px;margin-bottom:16px">
      ${window._branding.logoUrl ? `<img src="${window._branding.logoUrl}" alt="${escapeHtml(window._branding.businessName) || ''}" style="height:44px;width:auto;max-width:120px;object-fit:contain;border-radius:6px">` : ''}
      <div>
        ${window._branding.businessName ? `<div style="font-size:14px;font-weight:700;color:var(--text)">${escapeHtml(window._branding.businessName)}</div>` : ''}
        <div style="font-size:12px;color:var(--text-muted)">Coached by your PT</div>
      </div>
    </div>` : ''}

    <div class="page-header" style="margin-bottom:16px">
      <div>
        <h1 class="page-title">Hi, ${firstName}</h1>
        <p style="font-size:13px;color:var(--text-muted);margin-top:2px">${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      </div>
    </div>

    <!-- Hero card -->
    <div style="background:var(--accent);border-radius:12px;padding:18px 20px;margin-bottom:16px;color:#fff">
      <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;opacity:.75;margin-bottom:5px">Up next</div>
      <div style="font-size:19px;font-weight:700;margin-bottom:3px">${cHeroTitle}</div>
      <div style="font-size:13px;opacity:.8;margin-bottom:14px">${cHeroMeta}</div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <button onclick="${cHeroAction}" style="padding:8px 20px;border-radius:8px;background:rgba(255,255,255,.18);color:#fff;border:1.5px solid rgba(255,255,255,.35);font-size:13px;font-weight:700;cursor:pointer">${cHeroBtnLabel} →</button>
        ${checkInDue ? `<button onclick="document.getElementById('checkin-card').scrollIntoView({behavior:'smooth'})" style="padding:8px 16px;border-radius:8px;background:rgba(245,158,11,.25);color:#fff;border:1.5px solid rgba(245,158,11,.5);font-size:13px;font-weight:600;cursor:pointer">Check-in due</button>` : ''}
      </div>
    </div>

    <div class="client-grid">

      <!-- Left: goals + recent sessions -->
      <div style="display:flex;flex-direction:column;gap:16px">

        <div class="dashboard-card">
          <div class="card-header"><h2 class="card-title">Goals</h2></div>
          ${!goals?.length ? `<p style="color:var(--text-muted);font-size:13px">No active goals yet.</p>` : goals.map(goal => {
            const milestones = (goal.goal_milestones || []).sort((a, b) => a.order - b.order)
            const done = milestones.filter(m => m.completed_at).length
            const pct = (() => {
              const sv = parseFloat(goal.start_value), cv = parseFloat(goal.current_value), tv = parseFloat(goal.target_value)
              if (!isNaN(sv) && !isNaN(cv) && !isNaN(tv) && sv !== tv) return Math.min(100, Math.max(0, Math.round(((cv - sv) / (tv - sv)) * 100)))
              if (!isNaN(cv) && !isNaN(tv) && tv !== 0) return Math.min(100, Math.max(0, Math.round((cv / tv) * 100)))
              return milestones.length ? Math.round((done / milestones.length) * 100) : 0
            })()
            const daysLeft = goal.target_date ? daysUntil(goal.target_date) : null
            return `
            <div style="margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--border)">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
                <div style="font-size:14px;font-weight:600">${goal.title}</div>
                ${daysLeft ? `<span style="font-size:11px;color:var(--text-muted);white-space:nowrap;margin-left:8px">${daysLeft}</span>` : ''}
              </div>
              ${goal.target_value != null ? `
              <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                <span>Current: <strong style="color:var(--text)">${goal.current_value ?? '—'}</strong> → Target: <strong style="color:var(--accent)">${goal.target_value}</strong></span>
                <button onclick="showGoalProgressForm('${goal.id}',${goal.current_value ?? ''})" style="font-size:11px;color:var(--accent);background:none;border:none;cursor:pointer;font-weight:600;padding:0">Update</button>
              </div>
              <div id="gpf-${goal.id}" style="display:none;margin-bottom:6px">
                <div style="display:flex;gap:6px;align-items:center">
                  <input type="number" id="gpf-val-${goal.id}" class="field-input" style="width:100px;padding:4px 8px;font-size:13px" step="0.1" placeholder="New value">
                  <button class="btn-primary" style="font-size:12px;padding:4px 12px" onclick="saveGoalProgress('${goal.id}')">Save</button>
                  <button class="btn-secondary" style="font-size:12px;padding:4px 10px" onclick="document.getElementById('gpf-${goal.id}').style.display='none'">Cancel</button>
                </div>
                <p id="gpf-err-${goal.id}" style="color:var(--danger);font-size:11px;margin:4px 0 0"></p>
              </div>` : ''}
              <div style="height:4px;background:var(--surface-2);border-radius:4px;overflow:hidden;margin-bottom:6px">
                <div style="height:100%;width:${pct}%;background:var(--accent);border-radius:4px"></div>
              </div>
              ${milestones.length ? `
              <div style="display:flex;flex-wrap:wrap;gap:5px">
                ${milestones.map(m => `
                  <button onclick="toggleClientMilestone('${m.id}')" style="display:inline-flex;align-items:center;gap:4px;font-size:11px;padding:3px 8px;border-radius:20px;border:none;cursor:pointer;background:${m.completed_at ? 'var(--accent)' : 'var(--surface-2)'};color:${m.completed_at ? '#fff' : 'var(--text-muted)'}">
                    ${m.completed_at ? '✓' : '○'} ${m.title}
                  </button>`).join('')}
              </div>` : ''}
            </div>`
          }).join('')}
        </div>

        <div class="dashboard-card">
          <div class="card-header">
            <h2 class="card-title">Recent sessions</h2>
            <button class="btn-secondary" style="font-size:12px;padding:4px 10px" onclick="startWorkoutRunner('${clientId}')">▶ Start</button>
          </div>
          ${!recentSessions?.length ? `<p style="color:var(--text-muted);font-size:13px">No sessions logged yet.</p>` : `
          <div class="list">
            ${recentSessions.map(s => {
              const dateStr = new Date(s.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
              const exCount = s.workout_log_exercises?.length || 0
              return `
              <div class="list-row" style="cursor:pointer" onclick="openWorkoutLog('${s.id}','${clientId}')">
                <div style="width:36px;height:36px;border-radius:9px;background:var(--bg-accent);display:flex;align-items:center;justify-content:center;flex-shrink:0">
                  <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-accent)" stroke-width="2" style="width:15px;height:15px"><path d="M6 5h12M6 12h12M6 19h12"/></svg>
                </div>
                <div class="row-info">
                  <div class="row-name">${s.name}</div>
                  <div class="row-meta">${dateStr} · ${exCount} exercise${exCount !== 1 ? 's' : ''}</div>
                </div>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;color:var(--text-muted);flex-shrink:0"><polyline points="9 18 15 12 9 6"/></svg>
              </div>`
            }).join('')}
          </div>`}
        </div>

      </div>

      <!-- Right: weight + events + PBs + check-in -->
      <div style="display:flex;flex-direction:column;gap:16px">

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

        <div class="dashboard-card">
          <div class="card-header"><h2 class="card-title">Upcoming</h2></div>
          ${!events?.length ? `<p style="color:var(--text-muted);font-size:13px">No upcoming events.</p>` : events.map(ev => {
            const s = eventStyle(ev.type)
            return `
            <div style="display:flex;align-items:flex-start;gap:10px;padding:7px 0;border-bottom:1px solid var(--border)">
              <div style="width:3px;min-width:3px;height:34px;border-radius:2px;background:${s.colour};margin-top:2px"></div>
              <div>
                <div style="font-size:13px;font-weight:500">${ev.title}</div>
                <div style="font-size:11.5px;color:var(--text-muted);margin-top:1px">${s.label} · ${formatDate(ev.date)} · ${daysUntil(ev.date)}</div>
              </div>
            </div>`
          }).join('')}
        </div>

        <div class="dashboard-card">
          <div class="card-header">
            <h2 class="card-title">Personal bests</h2>
            <button class="btn-secondary" style="font-size:12px;padding:4px 10px" onclick="showClientPBForm('${clientId}')">+ Log PB</button>
          </div>
          ${!pbs.length ? `<p style="color:var(--text-muted);font-size:13px">No records yet.</p>` : pbs.slice(0,4).map(pb => `
            <div style="display:flex;justify-content:space-between;align-items:baseline;padding:6px 0;border-bottom:1px solid var(--border)">
              <span style="font-size:13px;color:var(--text-muted)">${pb.name}</span>
              <span style="font-size:14px;font-weight:700">${pb.value} <span style="font-size:11px;font-weight:400;color:var(--text-muted)">${pb.unit}</span></span>
            </div>`).join('')}
          ${pbs.length > 4 ? `<p style="font-size:12px;color:var(--text-muted);margin-top:8px">+${pbs.length - 4} more</p>` : ''}
          <div id="client-pb-form" style="display:none;margin-top:14px;padding-top:14px;border-top:1px solid var(--border)">
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
              <button class="btn" style="font-size:13px;padding:6px 14px" onclick="document.getElementById('client-pb-form').style.display='none'">Cancel</button>
            </div>
          </div>
        </div>

        <div class="dashboard-card" id="checkin-card">
          <div class="card-header">
            <h2 class="card-title">Weekly check-in</h2>
            ${lastCheckIn ? `<span style="font-size:12px;color:var(--text-muted)">${daysSinceCheckIn === 0 ? 'Submitted today' : daysSinceCheckIn + 'd ago'}</span>` : ''}
          </div>
          ${!checkInDue && lastCheckIn ? `
            <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:10px">
              ${[['Sleep',lastCheckIn.sleep],['Energy',lastCheckIn.energy],['Stress',lastCheckIn.stress],['Soreness',lastCheckIn.soreness]].map(([label,val])=>`
              <div style="text-align:center;background:var(--surface-2);border-radius:8px;padding:8px">
                <div style="font-size:18px;font-weight:700;color:var(--accent)">${val}/5</div>
                <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${label}</div>
              </div>`).join('')}
            </div>
            ${lastCheckIn.notes ? `<p style="font-size:13px;color:var(--text-muted);margin:0 0 10px">${lastCheckIn.notes}</p>` : ''}
            <button onclick="document.getElementById('checkin-form').style.display='block'" class="btn-secondary" style="font-size:13px">Submit new check-in</button>
          ` : `<p style="font-size:13px;color:var(--text-muted);margin:0 0 10px">${checkInDue ? 'Your weekly check-in is due. Let your coach know how you\'re feeling.' : 'No check-ins yet.'}</p>`}
          <div id="checkin-form" style="${checkInDue ? '' : 'display:none;margin-top:12px;padding-top:12px;border-top:1px solid var(--border)'}">
            <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:10px">
              ${[['sleep','Sleep (1–5)'],['energy','Energy (1–5)'],['stress','Stress (1–5)'],['soreness','Soreness (1–5)']].map(([id,label])=>`
              <div>
                <label class="field-label">${label}</label>
                <input type="range" id="ci-${id}" min="1" max="5" step="1" value="${lastCheckIn?.[id]||3}" class="field-input" style="padding:6px 0">
                <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-muted);margin-top:2px"><span>Low</span><span>High</span></div>
              </div>`).join('')}
            </div>
            <div class="field">
              <label class="field-label">Notes for your coach <span style="font-weight:400;color:var(--text-muted)">(optional)</span></label>
              <textarea id="ci-notes" class="field-input" rows="2" placeholder="How's training feeling? Any injuries or concerns?">${lastCheckIn?.notes||''}</textarea>
            </div>
            <p id="ci-error" style="color:var(--danger);font-size:12px;margin:4px 0"></p>
            <button onclick="saveClientCheckIn('${clientId}')" class="btn-primary" style="margin-top:8px">Submit check-in</button>
          </div>
        </div>

      </div>
    </div>`

  log.ok('renderClientDashboard', 'rendered', { clientId, goals: goals?.length, events: events?.length, pbs: pbs.length })
}


// ─── SOLO / PERSONAL DASHBOARD ────────────────────────────────────────────────
async function renderSoloDashboard(el) {
  log.info('renderSoloDashboard', 'loading personal dashboard')
  el.innerHTML = '<div class="loading-state">Loading…</div>'

  const clientId = window._soloClientId
  if (!clientId) { el.innerHTML = '<div class="loading-state">Personal account not set up yet.</div>'; return }

  const todayStr   = new Date().toISOString().split('T')[0]
  const weekAgoStr = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const [
    { data: goals },
    { data: events },
    { data: weights },
    { data: perfLogs },
    { data: assignedPrograms },
    { data: recentSessions },
  ] = await Promise.all([
    db.from('goals').select('id, title, target_date, status, start_value, current_value, target_value, goal_milestones(id, title, completed_at, order)').eq('client_id', clientId).eq('status', 'active').order('target_date'),
    db.from('events').select('id, title, date, type, notes').eq('client_id', clientId).gte('date', todayStr).order('date').limit(4),
    db.from('weight_logs').select('date, weight_kg').eq('client_id', clientId).order('date', { ascending: false }).limit(5),
    db.from('performance_logs').select('name, category, value, unit, date').eq('client_id', clientId).order('date', { ascending: false }),
    db.from('client_programs').select('start_date, programs(name, description, program_phases(id, name, duration_weeks, order_index, program_phase_workouts(id, day_of_week, session_order, notes, workout_templates(id, name))))').eq('client_id', clientId).order('created_at', { ascending: false }).limit(1),
    db.from('workout_logs').select('id, name, date, workout_log_exercises(id)').eq('client_id', clientId).order('date', { ascending: false }).limit(5),
  ])

  const latestWeight = weights?.[0] ?? null
  const prevWeight   = weights?.[1] ?? null
  let weightTrend = '→'
  if (latestWeight && prevWeight) {
    if (latestWeight.weight_kg < prevWeight.weight_kg) weightTrend = '↓'
    else if (latestWeight.weight_kg > prevWeight.weight_kg) weightTrend = '↑'
  }
  const trendColour = weightTrend === '↓' ? '#22c55e' : weightTrend === '↑' ? '#ef4444' : 'var(--text-muted)'

  const pbMap = {}
  ;(perfLogs || []).forEach(p => {
    if (!pbMap[p.name]) { pbMap[p.name] = p; return }
    const better = p.category === 'cardio' ? p.value < pbMap[p.name].value : p.value > pbMap[p.name].value
    if (better) pbMap[p.name] = p
  })
  const pbs = Object.values(pbMap)

  const sessionsThisWeek = (recentSessions || []).filter(s => s.date >= weekAgoStr).length

  function formatDate(dateStr) {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  }
  function daysUntil(dateStr) {
    const d = Math.round((new Date(dateStr) - new Date(todayStr)) / 86400000)
    if (d === 0) return 'Today'; if (d === 1) return 'Tomorrow'; return `In ${d} days`
  }
  function eventColour(type) {
    return { session:'#6366f1', review:'#f59e0b', competition:'#ef4444', holiday:'#22c55e', gym:'#3b82f6' }[type] || 'var(--text-muted)'
  }

  const firstName = currentProfile?.full_name?.split(' ')[0] || 'there'

  // Hero card: find current phase
  let heroTitle = 'No program assigned', heroMeta = 'Head to Workouts to start a freeform session or assign a program.', heroBtnLabel = 'Go to workouts', heroAction = "navigate('workouts')"
  if (assignedPrograms?.[0]) {
    const prog = assignedPrograms[0].programs
    const startDate = new Date(assignedPrograms[0].start_date + 'T00:00:00')
    const weeksSinceStart = Math.max(0, Math.floor((Date.now() - startDate) / (7 * 24 * 60 * 60 * 1000)))
    const phases = (prog.program_phases || []).sort((a, b) => a.order_index - b.order_index)
    let cumWeeks = 0, currentPhase = phases[phases.length - 1] || null
    for (const p of phases) { cumWeeks += p.duration_weeks; if (weeksSinceStart < cumWeeks) { currentPhase = p; break } }
    heroTitle = prog.name || 'Your program'
    heroMeta = currentPhase ? currentPhase.name + (/week/i.test(currentPhase.name) ? '' : ' · Week ' + (weeksSinceStart + 1)) : (prog.description || '')
    heroBtnLabel = 'Start a session'
    heroAction = `navigate('workouts')`
  }

  el.innerHTML = `
    <style>
      .solo-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:16px}
      .solo-grid{display:grid;grid-template-columns:3fr 2fr;gap:16px}
      @media(max-width:640px){.solo-stats{display:none}.solo-grid{grid-template-columns:1fr}}
    </style>

    <div class="page-header" style="margin-bottom:16px">
      <div>
        <h1 class="page-title">My Training</h1>
        <p style="font-size:13px;color:var(--text-muted);margin-top:2px">${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      </div>
    </div>

    <div style="background:var(--accent);border-radius:12px;padding:18px 20px;margin-bottom:16px;color:#fff">
      <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;opacity:.75;margin-bottom:5px">Up next</div>
      <div style="font-size:19px;font-weight:700;margin-bottom:3px">${heroTitle}</div>
      <div style="font-size:13px;opacity:.8;margin-bottom:14px">${heroMeta}</div>
      <button onclick="${heroAction}" style="padding:8px 20px;border-radius:8px;background:rgba(255,255,255,.18);color:#fff;border:1.5px solid rgba(255,255,255,.35);font-size:13px;font-weight:700;cursor:pointer">${heroBtnLabel} →</button>
    </div>

    <div class="solo-stats">
      ${[['Sessions',sessionsThisWeek,'This week'],['Weight',latestWeight?latestWeight.weight_kg+' kg':'—','Current'],['Goals',goals?.length||0,'Active'],['Bests',pbs.length,'On record']].map(([label,val,sub])=>`
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px 14px">
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:4px">${label}</div>
          <div style="font-size:22px;font-weight:700;color:var(--text)">${val}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${sub}</div>
        </div>`).join('')}
    </div>

    <div class="solo-grid">

      <div style="display:flex;flex-direction:column;gap:16px">

        <div class="dashboard-card">
          <div class="card-header"><h2 class="card-title">Recent sessions</h2></div>
          ${!recentSessions?.length ? `<p style="color:var(--text-muted);font-size:13px">No sessions logged yet.</p>` : `
          <div class="list">
            ${recentSessions.map(s => {
              const exCount = s.workout_log_exercises?.length || 0
              return `
              <div class="list-row" style="cursor:pointer" onclick="openWorkoutLog('${s.id}','${clientId}')">
                <div style="width:36px;height:36px;border-radius:9px;background:var(--bg-accent);display:flex;align-items:center;justify-content:center;flex-shrink:0">
                  <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-accent)" stroke-width="2" style="width:15px;height:15px"><path d="M6 5h12M6 12h12M6 19h12"/></svg>
                </div>
                <div class="row-info">
                  <div class="row-name">${s.name}</div>
                  <div class="row-meta">${formatDate(s.date)} · ${exCount} exercise${exCount!==1?'s':''}</div>
                </div>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;color:var(--text-muted);flex-shrink:0"><polyline points="9 18 15 12 9 6"/></svg>
              </div>`
            }).join('')}
          </div>`}
        </div>

        <div class="dashboard-card">
          <div class="card-header"><h2 class="card-title">Goals</h2></div>
          ${!goals?.length ? `<p style="color:var(--text-muted);font-size:13px">No active goals.</p>` : goals.map(goal => {
            const milestones = (goal.goal_milestones || []).sort((a,b) => a.order - b.order)
            const pct = (() => {
              const sv=parseFloat(goal.start_value), cv=parseFloat(goal.current_value), tv=parseFloat(goal.target_value)
              if (!isNaN(sv)&&!isNaN(cv)&&!isNaN(tv)&&sv!==tv) return Math.min(100,Math.max(0,Math.round(((cv-sv)/(tv-sv))*100)))
              if (!isNaN(cv)&&!isNaN(tv)&&tv!==0) return Math.min(100,Math.max(0,Math.round((cv/tv)*100)))
              return milestones.length ? Math.round((milestones.filter(m=>m.completed_at).length/milestones.length)*100) : 0
            })()
            const daysLeft = goal.target_date ? daysUntil(goal.target_date) : null
            return `
            <div style="margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--border)">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:5px">
                <div style="font-size:14px;font-weight:600">${goal.title}</div>
                ${daysLeft ? `<span style="font-size:11px;color:var(--text-muted);white-space:nowrap;margin-left:8px">${daysLeft}</span>` : ''}
              </div>
              ${goal.target_value != null ? `<div style="font-size:12px;color:var(--text-muted);margin-bottom:5px">Current: <strong style="color:var(--text)">${goal.current_value ?? '—'}</strong> → Target: <strong style="color:var(--accent)">${goal.target_value}</strong></div>` : ''}
              <div style="height:4px;background:var(--surface-2);border-radius:4px;overflow:hidden;margin-bottom:6px">
                <div style="height:100%;width:${pct}%;background:var(--accent);border-radius:4px"></div>
              </div>
              ${milestones.length ? `
              <div style="display:flex;flex-wrap:wrap;gap:5px">
                ${milestones.map(m => `<button onclick="toggleClientMilestone('${m.id}')" style="display:inline-flex;align-items:center;gap:4px;font-size:11px;padding:3px 8px;border-radius:20px;border:none;cursor:pointer;background:${m.completed_at?'var(--accent)':'var(--surface-2)'};color:${m.completed_at?'#fff':'var(--text-muted)'}">
                  ${m.completed_at?'✓':'○'} ${m.title}</button>`).join('')}
              </div>` : ''}
            </div>`
          }).join('')}
        </div>

      </div>

      <div style="display:flex;flex-direction:column;gap:16px">

        <div class="dashboard-card">
          <div class="card-header">
            <h2 class="card-title">Weight</h2>
            <button class="btn-secondary" style="font-size:12px;padding:4px 10px" onclick="showClientWeightForm('${clientId}')">+ Log</button>
          </div>
          ${latestWeight ? `
            <div style="display:flex;align-items:baseline;gap:6px;margin-bottom:3px">
              <span style="font-size:30px;font-weight:700">${latestWeight.weight_kg}</span>
              <span style="font-size:15px;color:var(--text-muted)">kg</span>
              <span style="font-size:18px;color:${trendColour};margin-left:2px">${weightTrend}</span>
            </div>
            <p style="font-size:12px;color:var(--text-muted)">Logged ${formatDate(latestWeight.date)}</p>
            ${prevWeight ? `<p style="font-size:12px;color:var(--text-muted);margin-top:2px">Previous: ${prevWeight.weight_kg} kg</p>` : ''}
          ` : `<p style="color:var(--text-muted);font-size:13px">No weight logged yet.</p>`}
          <div id="client-weight-form" style="display:none;margin-top:14px;padding-top:14px;border-top:1px solid var(--border)">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
              <div><label class="form-label">Date</label><input type="date" id="cwf-date" class="form-input" value="${todayStr}"></div>
              <div><label class="form-label">Weight (kg)</label><input type="number" id="cwf-weight" class="form-input" placeholder="e.g. 89.5" step="0.1" min="20" max="300"></div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
              <div><label class="form-label">Body fat % <span style="color:var(--text-muted)">(opt)</span></label><input type="number" id="cwf-bf" class="form-input" placeholder="e.g. 19.5" step="0.1"></div>
              <div><label class="form-label">Notes <span style="color:var(--text-muted)">(opt)</span></label><input type="text" id="cwf-notes" class="form-input" placeholder="Any notes…"></div>
            </div>
            <p id="cwf-error" style="color:#ef4444;font-size:12px;margin:0 0 6px"></p>
            <div style="display:flex;gap:8px">
              <button class="btn btn-primary" style="font-size:13px;padding:6px 14px" onclick="saveClientWeight('${clientId}')">Save</button>
              <button class="btn" style="font-size:13px;padding:6px 14px" onclick="document.getElementById('client-weight-form').style.display='none'">Cancel</button>
            </div>
          </div>
        </div>

        <div class="dashboard-card">
          <div class="card-header">
            <h2 class="card-title">Personal bests</h2>
            <button class="btn-secondary" style="font-size:12px;padding:4px 10px" onclick="showClientPBForm('${clientId}')">+ Log PB</button>
          </div>
          ${!pbs.length ? `<p style="color:var(--text-muted);font-size:13px">No records yet.</p>` : pbs.slice(0,4).map(pb => `
            <div style="display:flex;justify-content:space-between;align-items:baseline;padding:6px 0;border-bottom:1px solid var(--border)">
              <span style="font-size:13px;color:var(--text-muted)">${pb.name}</span>
              <span style="font-size:14px;font-weight:700">${pb.value} <span style="font-size:11px;font-weight:400;color:var(--text-muted)">${pb.unit}</span></span>
            </div>`).join('')}
          ${pbs.length > 4 ? `<p style="font-size:12px;color:var(--text-muted);margin-top:8px">+${pbs.length - 4} more in Progress → Personal Bests</p>` : ''}
          <div id="client-pb-form" style="display:none;margin-top:14px;padding-top:14px;border-top:1px solid var(--border)">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
              <div><label class="form-label">Exercise</label><input type="text" id="cpb-name" class="form-input" placeholder="e.g. Deadlift"></div>
              <div><label class="form-label">Category</label><select id="cpb-category" class="form-input"><option value="strength">Strength</option><option value="cardio">Cardio</option><option value="body_metric">Body metric</option><option value="benchmark">Benchmark</option></select></div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px">
              <div><label class="form-label">Value</label><input type="number" id="cpb-value" class="form-input" step="0.1"></div>
              <div><label class="form-label">Unit</label><input type="text" id="cpb-unit" class="form-input" placeholder="kg / min / reps"></div>
              <div><label class="form-label">Date</label><input type="date" id="cpb-date" class="form-input" value="${todayStr}"></div>
            </div>
            <p id="cpb-error" style="color:#ef4444;font-size:12px;margin:0 0 6px"></p>
            <div style="display:flex;gap:8px">
              <button class="btn btn-primary" style="font-size:13px;padding:6px 14px" onclick="saveClientPB('${clientId}')">Save</button>
              <button class="btn" style="font-size:13px;padding:6px 14px" onclick="document.getElementById('client-pb-form').style.display='none'">Cancel</button>
            </div>
          </div>
        </div>

        ${events?.length ? `
        <div class="dashboard-card">
          <div class="card-header"><h2 class="card-title">Upcoming</h2></div>
          ${events.map(ev => `
            <div style="display:flex;align-items:flex-start;gap:10px;padding:7px 0;border-bottom:1px solid var(--border)">
              <div style="width:3px;min-width:3px;height:34px;border-radius:2px;background:${eventColour(ev.type)};margin-top:2px"></div>
              <div>
                <div style="font-size:13px;font-weight:500">${ev.title}</div>
                <div style="font-size:11.5px;color:var(--text-muted);margin-top:1px">${formatDate(ev.date)} · ${daysUntil(ev.date)}</div>
              </div>
            </div>`).join('')}
        </div>` : ''}

      </div>
    </div>
  `

  log.ok('renderSoloDashboard', 'rendered', { clientId, goals: goals?.length, pbs: pbs.length, sessions: recentSessions?.length })
}

// ─── CLIENT PROFILE: PROGRAMS TAB ─────────────────────────────────────────────
async function renderClientPrograms(clientId, el) {
  el.innerHTML = '<div class="loading-state">Loading…</div>'

  const [{ data: assignments, error }, { data: clientData }] = await Promise.all([
    db.from('client_programs')
      .select('id, start_date, programs(id, name, program_phases(id, name, order_index, duration_weeks, program_phase_workouts(id, day_of_week, session_order)))')
      .eq('client_id', clientId),
    db.from('clients').select('full_name').eq('id', clientId).single()
  ])

  if (error) {
    el.innerHTML = `<div class="card"><div class="card-body" style="padding:20px">
      <p style="color:var(--danger);font-size:13px">${error.message}</p>
    </div></div>`
    return
  }

  if (!assignments?.length) {
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h2 class="section-title">Assigned programs</h2>
        <button class="btn-primary" onclick="showAssignProgramModal('${clientId}')">+ Assign program</button>
      </div>
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <div class="empty-title">No programs assigned</div>
        <div class="empty-text">Assign a program from your library to give this client a structured training plan.</div>
        <button class="btn-primary" onclick="showAssignProgramModal('${clientId}')">+ Assign program</button>
      </div>`
    return
  }

  const cpIds = assignments.map(a => a.id)
  const { data: cpwRows } = await db.from('client_program_workouts')
    .select('client_program_id, program_phase_workout_id, workout_template_id, workout_templates(id, name, workout_template_exercises(exercise_name, order_index, sets_json))')
    .in('client_program_id', cpIds)

  const cpwMap = {}
  ;(cpwRows || []).forEach(r => { cpwMap[r.program_phase_workout_id] = { templateId: r.workout_template_id, name: r.workout_templates?.name, exercises: r.workout_templates?.workout_template_exercises || [] } })

  const clientName = (clientData?.full_name || 'Client').replace(/'/g, "\\'")

  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h2 class="section-title">Assigned programs</h2>
      <button class="btn-primary" onclick="showAssignProgramModal('${clientId}')">+ Assign program</button>
    </div>
    ${assignments.map(a => {
      const p = a.programs
      const phases = [...(p?.program_phases || [])].sort((x, y) => x.order_index - y.order_index)
      const startLabel = a.start_date ? new Date(a.start_date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No start date'
      return `
        <div class="card" style="margin-bottom:16px">
          <div class="card-body">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">
              <div>
                <div style="font-size:16px;font-weight:700">${p?.name || 'Unknown program'}</div>
                <div style="font-size:12px;color:var(--text-muted);margin-top:2px">Started ${startLabel}</div>
              </div>
              <div style="display:flex;gap:6px;flex-shrink:0">
                <button class="btn-secondary" style="font-size:12px;padding:4px 10px" onclick="showEditStartDateModal('${clientId}','${a.id}','${a.start_date||''}')">Edit date</button>
                <button class="btn-secondary" style="font-size:12px;padding:4px 10px;color:var(--danger);border-color:var(--danger)" onclick="unassignProgram('${clientId}','${a.id}')">Remove</button>
              </div>
            </div>
            ${phases.map((phase, pi) => {
              const allSessions = [...(phase.program_phase_workouts || [])].sort((x, y) => x.day_of_week - y.day_of_week || x.session_order - y.session_order)
              const dayMap = {}
              allSessions.forEach(pw => {
                if (!dayMap[pw.day_of_week]) dayMap[pw.day_of_week] = []
                dayMap[pw.day_of_week].push(pw)
              })
              const days = Object.keys(dayMap).map(Number).sort((a,b) => a - b)
              const panelId = `phase-panel-${a.id}-${pi}`
              return `
                <div style="margin-bottom:6px;border:1px solid var(--border);border-radius:10px;overflow:hidden">
                  <button onclick="toggleClientPhase('${panelId}')" style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:var(--surface-2);border:none;cursor:pointer;text-align:left">
                    <div>
                      <span style="font-size:13px;font-weight:700;color:var(--text)">${phase.name}</span>
                      <span style="font-size:11px;color:var(--text-muted);margin-left:8px">${phase.duration_weeks}w · ${days.length} day${days.length !== 1 ? 's' : ''} · ${allSessions.length} session${allSessions.length !== 1 ? 's' : ''}</span>
                    </div>
                    <svg id="${panelId}-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;color:var(--text-muted);transition:transform .2s;transform:rotate(0deg)"><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                  <div id="${panelId}" style="display:none">
                    ${days.map(day => {
                      const daySessions = dayMap[day]
                      const multi = daySessions.length > 1
                      const dayPanelId = `${panelId}-d${day}`
                      const sessionSummary = daySessions.map(pw => (cpwMap[pw.id]?.name || 'Session').replace(/ — W\d+/, '')).join(', ')
                      return `
                        <div style="border-top:1px solid var(--border)">
                          <button onclick="toggleClientPhase('${dayPanelId}')" style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:none;border:none;cursor:pointer;text-align:left">
                            <div>
                              <span style="font-size:12px;font-weight:700;color:var(--accent)">DAY ${day}</span>
                              <span style="font-size:13px;font-weight:500;color:var(--text);margin-left:8px">${sessionSummary}</span>
                            </div>
                            <svg id="${dayPanelId}-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;flex-shrink:0;color:var(--text-muted);transition:transform .2s;transform:rotate(0deg)"><polyline points="6 9 12 15 18 9"/></svg>
                          </button>
                          <div id="${dayPanelId}" style="display:none;padding:0 14px 12px">
                            ${daySessions.map((pw, si) => {
                              const cpw = cpwMap[pw.id]
                              const sessionName = (cpw?.name || 'Session').replace(/ — W\d+/, '')
                              const templateId = cpw?.templateId
                              const exs = [...(cpw?.exercises || [])].sort((a,b) => a.order_index - b.order_index)
                              return `
                                <div style="margin-bottom:${si < daySessions.length - 1 ? '10px' : '0'};padding-bottom:${si < daySessions.length - 1 ? '10px' : '0'};border-bottom:${si < daySessions.length - 1 ? '1px solid var(--border)' : 'none'}">
                                  ${multi ? `<div style="font-size:10px;font-weight:700;color:var(--accent);letter-spacing:.06em;margin-bottom:4px">SESSION ${si+1}/${daySessions.length}</div>` : ''}
                                  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:${exs.length ? '8px' : '0'}">
                                    <span style="font-size:13px;font-weight:600">${sessionName}</span>
                                    ${templateId ? `<button class="btn-secondary" style="font-size:12px;padding:3px 8px;flex-shrink:0" onclick="openTemplate('${templateId}',{backTo:'client',backLabel:'${clientName}',clientId:'${clientId}',clientName:'${clientName}',clientProgramId:'${a.id}'})">Edit</button>` : `<span style="font-size:12px;color:var(--text-muted)">Not set up</span>`}
                                  </div>
                                  ${exs.length ? `
                                  <div style="padding:6px 8px;background:var(--surface-2);border-radius:6px">
                                    ${exs.map(ex => `
                                      <div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--border)">
                                        <span style="font-size:12px">${ex.exercise_name}</span>
                                        <span style="font-size:11px;color:var(--text-muted)">${ex.sets_json?.length || 0} set${(ex.sets_json?.length || 0) !== 1 ? 's' : ''}</span>
                                      </div>`).join('')}
                                  </div>` : ''}
                                </div>`
                            }).join('')}
                          </div>
                        </div>`
                    }).join('')}
                  </div>
                </div>`
            }).join('')}
          </div>
        </div>`
    }).join('')}
  `
}

function toggleClientPhase(panelId) {
  const panel = document.getElementById(panelId)
  const chevron = document.getElementById(panelId + '-chevron')
  if (!panel) return
  const isOpen = panel.style.display !== 'none'
  panel.style.display = isOpen ? 'none' : 'block'
  if (chevron) chevron.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)'
}

function showAssignProgramModal(clientId) {
  const existing = document.getElementById('assign-program-modal')
  if (existing) existing.remove()

  // Solo view: auto-assign to personal account — no client picker needed
  const targetClientId = (currentProfile?.role === 'solo' && window._soloClientId) ? window._soloClientId : clientId

  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.id = 'assign-program-modal'
  const todayStr = new Date().toISOString().split('T')[0]

  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2 class="modal-title">${currentProfile?.role === 'solo' ? 'Add to my plan' : 'Assign program'}</h2>
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
        <button class="btn-primary" onclick="saveAssignProgram('${targetClientId}')">Assign</button>
      </div>
    </div>
  `
  document.body.appendChild(overlay)

  db.from('programs').select('id, name').eq('coach_id', currentUser.id).order('name').then(({ data }) => {
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

  const { data: cp, error } = await db.from('client_programs').insert({
    client_id: clientId,
    program_id: programId,
    start_date: startDate || null
  }).select('id').single()

  if (error) { log.error('saveAssignProgram', 'insert failed', error); errorEl.textContent = error.message; return }
  closeModal('assign-program-modal')
  _cloneProgramForClient(cp.id, programId, clientId)
  renderClientPrograms(clientId, document.getElementById('tab-content'))
}

async function _cloneProgramForClient(clientProgramId, programId, clientId) {
  const { data: phases, error: phErr } = await db
    .from('program_phases')
    .select('id, program_phase_workouts(id, template_id, workout_templates(id, name, description, workout_template_exercises(*)))')
    .eq('program_id', programId)
    .order('order_index')

  if (phErr || !phases?.length) { log.error('_cloneProgramForClient', 'phase fetch failed', phErr); return }

  const cpwInserts = []

  for (const phase of phases) {
    for (const pw of (phase.program_phase_workouts || [])) {
      const tmpl = pw.workout_templates
      if (!tmpl) continue

      const { data: newTmpl, error: tErr } = await db
        .from('workout_templates')
        .insert({ coach_id: currentUser.id, client_id: clientId, program_id: null, name: tmpl.name, description: tmpl.description || null })
        .select('id').single()

      if (tErr || !newTmpl) { log.error('_cloneProgramForClient', 'template clone failed', tErr); continue }

      const exs = (tmpl.workout_template_exercises || []).map(ex => ({
        template_id: newTmpl.id,
        exercise_id: ex.exercise_id || null,
        exercise_name: ex.exercise_name,
        exercise_type: ex.exercise_type,
        order_index: ex.order_index,
        sets: ex.sets || null,
        sets_json: ex.sets_json || null,
        notes: ex.notes || null,
        superset_group: ex.superset_group || null
      }))
      if (exs.length) await db.from('workout_template_exercises').insert(exs)

      cpwInserts.push({ client_program_id: clientProgramId, program_phase_workout_id: pw.id, workout_template_id: newTmpl.id })
    }
  }

  if (cpwInserts.length) {
    const { error } = await db.from('client_program_workouts').insert(cpwInserts)
    if (error) log.error('_cloneProgramForClient', 'cpw insert failed', error)
  }

  log.ok('_cloneProgramForClient', `cloned ${cpwInserts.length} workouts`, { clientId, programId })
}

async function unassignProgram(clientId, assignmentId) {
  if (!confirm('Remove this program from the client?')) return
  const { error } = await db.from('client_programs').delete().eq('id', assignmentId)
  if (error) { log.error('unassignProgram', 'delete failed', error); return }
  renderClientPrograms(clientId, document.getElementById('tab-content'))
}

function showEditStartDateModal(clientId, assignmentId, currentDate) {
  const existing = document.getElementById('esd-modal')
  if (existing) existing.remove()

  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.id = 'esd-modal'
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2 class="modal-title">Edit start date</h2>
        <button class="modal-close" onclick="document.getElementById('esd-modal').remove()">✕</button>
      </div>
      <div class="modal-body">
        <div class="field">
          <label class="field-label">Program start date</label>
          <input class="field-input" type="date" id="esd-date" value="${currentDate}">
        </div>
        <p style="font-size:12px;color:var(--text-muted);margin-top:8px">Changing the start date shifts all scheduled workouts on the client's calendar.</p>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="document.getElementById('esd-modal').remove()">Cancel</button>
        <button class="btn-primary" onclick="saveEditStartDate('${clientId}','${assignmentId}')">Save</button>
      </div>
    </div>`
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
  document.body.appendChild(overlay)
}

async function saveEditStartDate(clientId, assignmentId) {
  const newDate = document.getElementById('esd-date')?.value
  if (!newDate) return
  const { error } = await db.from('client_programs').update({ start_date: newDate }).eq('id', assignmentId)
  if (error) { log.error('saveEditStartDate', 'update failed', error); return }
  document.getElementById('esd-modal')?.remove()
  renderClientPrograms(clientId, document.getElementById('tab-content'))
}

async function showAssignProgramToClientModal(programId) {
  const existing = document.getElementById('apc-modal')
  if (existing) existing.remove()

  const isSolo = currentProfile?.role === 'solo'
  const todayStr = new Date().toISOString().split('T')[0]
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.id = 'apc-modal'

  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2 class="modal-title">${isSolo ? 'Add to my plan' : 'Assign to client'}</h2>
        <button class="modal-close" onclick="document.getElementById('apc-modal').remove()">✕</button>
      </div>
      ${isSolo ? '' : `
      <div class="field">
        <label class="field-label">Client <span style="color:var(--danger)">*</span></label>
        <select class="field-input" id="apc-client"><option value="">Loading…</option></select>
      </div>`}
      <div class="field">
        <label class="field-label">Start date</label>
        <input class="field-input" type="date" id="apc-start" value="${todayStr}">
      </div>
      <p class="modal-error" id="apc-error"></p>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="document.getElementById('apc-modal').remove()">Cancel</button>
        <button class="btn-primary" onclick="saveAssignProgramToClient('${programId}','${isSolo ? window._soloClientId : ''}')">Assign</button>
      </div>
    </div>`

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
  document.body.appendChild(overlay)

  if (!isSolo) {
    const { data: clients } = await db.from('clients').select('id, full_name').eq('coach_id', currentUser.id).order('full_name')
    const sel = document.getElementById('apc-client')
    if (sel) sel.innerHTML = '<option value="">Select client…</option>' + (clients || []).map(c => `<option value="${c.id}">${c.full_name}</option>`).join('')
  }
}

async function saveAssignProgramToClient(programId, soloClientId) {
  const errEl = document.getElementById('apc-error')
  const clientId = soloClientId || document.getElementById('apc-client')?.value
  const startDate = document.getElementById('apc-start').value || null
  if (!clientId) { errEl.textContent = 'Please select a client'; return }
  const { data: cp, error } = await db.from('client_programs').insert({ client_id: clientId, program_id: programId, start_date: startDate || null }).select('id').single()
  if (error) { errEl.textContent = error.message; return }
  document.getElementById('apc-modal')?.remove()
  _cloneProgramForClient(cp.id, programId, clientId)
  if (soloClientId) showToast('Program added to your plan', 'success')
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
        <div class="empty-text">${currentProfile?.role === 'solo' ? 'Create a program to plan your own training.' : 'Create a program to organise training phases for your clients.'}</div>
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
      <div class="modal">
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

}

async function openProgram(programId) {
  const el = document.getElementById('main-content')
  log.info('openProgram', 'loading', { programId })
  el.innerHTML = '<div class="loading-state">Loading…</div>'

  const [{ data: program, error }, { data: templates }] = await Promise.all([
    db.from('programs').select('id, name, description, created_at, program_phases(id, name, duration_weeks, order_index)').eq('id', programId).single(),
    db.from('workout_templates').select('id, name').eq('coach_id', currentUser.id).order('name'),
  ])

  if (error) { log.error('openProgram', 'fetch failed', error); el.innerHTML = `<div class="loading-state">${error.message}</div>`; return }

  const phases = (program.program_phases || []).sort((a, b) => a.order_index - b.order_index)
  const totalWeeks = phases.reduce((sum, p) => sum + p.duration_weeks, 0)
  window._programTemplates = templates || []
  window._openProgramId = programId

  el.innerHTML = `
    <div style="margin-bottom:20px">
      <a href="#" onclick="navigate('programs');return false" style="font-size:13px;color:var(--accent);display:inline-flex;align-items:center;gap:4px;margin-bottom:12px">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><polyline points="15 18 9 12 15 6"/></svg>
        All programs
      </a>
      <h1 class="page-title" style="margin-bottom:4px">${program.name}</h1>
      ${program.description ? `<p style="color:var(--text-muted);font-size:14px">${program.description}</p>` : ''}
      <p style="font-size:12px;color:var(--text-muted);margin-top:4px">${phases.length} phase${phases.length !== 1 ? 's' : ''} · ${totalWeeks} week${totalWeeks !== 1 ? 's' : ''} total</p>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn btn-secondary" onclick="showEditProgramModal('${program.id}','${program.name.replace(/'/g,"\\'")}','${(program.description||'').replace(/'/g,"\\'")}')">Edit</button>
        <button class="btn btn-primary" onclick="showAssignProgramToClientModal('${program.id}')">${currentProfile?.role === 'solo' ? 'Add to my plan' : 'Assign to client'}</button>
        <button class="btn btn-danger" onclick="deleteProgram('${program.id}')">Delete</button>
      </div>
    </div>

    <!-- Phases -->
    <div style="margin-bottom:16px;display:flex;justify-content:space-between;align-items:center">
      <h2 style="font-size:15px;font-weight:600">Phases</h2>
      <button class="btn btn-primary" onclick="showAddPhaseForm('${program.id}')">+ Add phase</button>
    </div>

    <div id="phases-list">
      ${!phases.length ? `<p style="color:var(--text-muted);font-size:13px">No phases yet. Add the first phase to get started.</p>` :
        phases.map((ph, i) => `
          <div class="card" style="margin-bottom:12px">
            <div class="card-body">
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
                <div style="width:32px;height:32px;border-radius:50%;background:var(--accent);color:#fff;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${i + 1}</div>
                <div style="flex:1">
                  <div style="font-weight:600;font-size:15px">${ph.name}</div>
                  <div style="font-size:12px;color:var(--text-muted)">${ph.duration_weeks} week${ph.duration_weeks !== 1 ? 's' : ''}</div>
                </div>
                <button class="btn-secondary" style="font-size:12px;padding:4px 10px" onclick="showEditPhaseForm('${program.id}','${ph.id}','${ph.name.replace(/'/g,"\\'")}',${ph.duration_weeks},${ph.order_index})">Edit</button>
                <button class="btn-danger" style="font-size:12px;padding:4px 10px" onclick="deletePhase('${program.id}','${ph.id}')">Remove</button>
              </div>
              <div id="phase-workouts-${ph.id}"><div style="color:var(--text-muted);font-size:12px">Loading workouts…</div></div>
              <button onclick="showAddPhaseWorkout('${ph.id}','${program.id}')" class="btn-secondary" style="margin-top:10px;font-size:12px;padding:4px 12px">+ Assign workout</button>
            </div>
          </div>`).join('')}
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

    <!-- Add phase workout modal -->
    <div id="phase-workout-modal" class="modal-overlay" style="display:none">
      <div class="modal" style="max-width:420px">
        <div class="modal-header">
          <h2 class="modal-title">Assign workout to phase</h2>
          <button class="modal-close" onclick="document.getElementById('phase-workout-modal').style.display='none'">✕</button>
        </div>
        <input type="hidden" id="pwm-phase-id">
        <div style="display:grid;grid-template-columns:1fr auto;gap:10px" class="field">
          <div>
            <label class="field-label">Day of week</label>
            <select class="field-input" id="pwm-day">
              <option value="1">Monday</option>
              <option value="2">Tuesday</option>
              <option value="3">Wednesday</option>
              <option value="4">Thursday</option>
              <option value="5">Friday</option>
              <option value="6">Saturday</option>
              <option value="7">Sunday</option>
            </select>
          </div>
          <div>
            <label class="field-label">Session</label>
            <select class="field-input" id="pwm-session-order">
              <option value="1">AM</option>
              <option value="2">PM</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label class="field-label">Workout template</label>
          <select class="field-input" id="pwm-template">
            ${(window._programTemplates||[]).map(t=>`<option value="${t.id}">${t.name}</option>`).join('')}
          </select>
          <button type="button" onclick="createWorkoutFromPhaseModal()" style="background:none;border:none;color:var(--primary);font-size:13px;cursor:pointer;padding:4px 0;margin-top:4px">+ Create new workout</button>
        </div>
        <div class="field">
          <label class="field-label">Notes <span style="font-weight:400;color:var(--text-muted)">(optional)</span></label>
          <input class="field-input" id="pwm-notes" placeholder="e.g. Higher intensity week">
        </div>
        <p id="pwm-error" class="modal-error"></p>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="document.getElementById('phase-workout-modal').style.display='none'">Cancel</button>
          <button class="btn-primary" onclick="savePhaseWorkout()">Assign</button>
        </div>
      </div>
    </div>

    <!-- Edit program modal -->
    <div id="program-modal" class="modal-overlay" style="display:none" onclick="if(event.target===this)closeProgramModal()">
      <div class="modal">
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

  loadAllPhaseWorkouts(phases)
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
  if (error) { log.error('deleteProgram', 'failed', error); return }
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
  if (error) { log.error('deletePhase', 'failed', error); return }
  log.ok('deletePhase', 'deleted', { phaseId })
  openProgram(programId)
}

async function loadAllPhaseWorkouts(phases) {
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
  for (const ph of phases) {
    const el = document.getElementById(`phase-workouts-${ph.id}`)
    if (!el) continue
    const { data: pws } = await db.from('program_phase_workouts').select('*, workout_templates(name)').eq('phase_id', ph.id).order('day_of_week').order('session_order')
    if (!pws?.length) { el.innerHTML = '<div style="font-size:12px;color:var(--text-muted)">No workouts assigned yet.</div>'; continue }
    const byDay = {}
    pws.forEach(pw => { byDay[pw.day_of_week] = byDay[pw.day_of_week] || []; byDay[pw.day_of_week].push(pw) })
    el.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:6px">
      ${Object.entries(byDay).sort(([a],[b])=>a-b).map(([day, wks]) => `
        <div style="background:var(--surface-2);border-radius:8px;padding:8px 12px;min-width:120px">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px">${days[day-1]}</div>
          ${wks.map((w, wi) => `
            <div style="display:flex;align-items:center;gap:6px;margin-top:4px">
              ${wks.length > 1 ? `<span style="font-size:9px;font-weight:700;color:var(--accent);min-width:18px">${w.session_order===2?'PM':'AM'}</span>` : ''}
              <span style="font-size:12px;font-weight:600">${w.workout_templates?.name || 'Unknown'}</span>
              <button onclick="openTemplate('${w.template_id}',{backLabel:'Back to program',backFn:()=>openProgram('${window._openProgramId}'),programId:'${window._openProgramId}'})" style="font-size:11px;color:var(--accent);background:none;border:none;cursor:pointer;padding:0 2px">Edit</button>
              <button onclick="removePhaseWorkout('${w.id}','${ph.id}')" style="font-size:11px;color:var(--text-muted);background:none;border:none;cursor:pointer;padding:0">✕</button>
            </div>`).join('')}
        </div>`).join('')}
    </div>`
  }
}

function showAddPhaseWorkout(phaseId, programId) {
  const modal = document.getElementById('phase-workout-modal')
  if (!modal) return
  window._phaseWorkoutContext = null
  window._currentProgramId = programId || null
  document.getElementById('pwm-phase-id').value = phaseId
  const sel = document.getElementById('pwm-template')
  sel.innerHTML = (window._programTemplates||[]).map(t=>`<option value="${t.id}">${t.name}</option>`).join('')
  modal.style.display = 'flex'
}

function createWorkoutFromPhaseModal() {
  const phaseId   = document.getElementById('pwm-phase-id').value
  const dayOfWeek = document.getElementById('pwm-day').value
  window._phaseWorkoutContext = { phaseId, dayOfWeek, programId: window._currentProgramId || null }
  document.getElementById('phase-workout-modal').style.display = 'none'
  showCreateTemplateModal()
}

async function savePhaseWorkout() {
  const phaseId      = document.getElementById('pwm-phase-id').value
  const dayOfWeek    = parseInt(document.getElementById('pwm-day').value)
  const templateId   = document.getElementById('pwm-template').value
  const notes        = document.getElementById('pwm-notes')?.value.trim() || null
  const sessionOrder = parseInt(document.getElementById('pwm-session-order')?.value || '1')
  const errEl        = document.getElementById('pwm-error')
  if (!templateId) { errEl.textContent = 'Pick a template'; return }
  const dayLabels = ['','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']

  // Validation: prevent duplicate session_order on same day
  const { data: existing } = await db.from('program_phase_workouts').select('id, session_order, workout_templates(name)').eq('phase_id', phaseId).eq('day_of_week', dayOfWeek).eq('session_order', sessionOrder)
  if (existing?.length) {
    const clash = existing[0].workout_templates?.name || 'another workout'
    showToast(`${sessionOrder === 1 ? 'AM' : 'PM'} slot already taken by "${clash}" — choose a different slot or day`, 'error')
    return
  }

  const { error } = await db.from('program_phase_workouts').insert({ phase_id: phaseId, day_of_week: dayOfWeek, day_label: dayLabels[dayOfWeek] || 'Day', template_id: templateId, notes, session_order: sessionOrder })
  if (error) { log.error('savePhaseWorkout', 'insert failed', error); errEl.textContent = error.message; return }
  document.getElementById('phase-workout-modal').style.display = 'none'
  if (window._openProgramId) openProgram(window._openProgramId)
}

async function removePhaseWorkout(pwId, phaseId) {
  const { error } = await dbq('removePhaseWorkout', db.from('program_phase_workouts').delete().eq('id', pwId))
  if (error) return
  if (window._openProgramId) openProgram(window._openProgramId)
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

  log.info('saveClientPB', 'inserting', { clientId: row.client_id, date: row.date })
  const { error } = await db.from('performance_logs').insert(row)
  if (error) { log.error('saveClientPB', 'insert failed', error); errorEl.textContent = error.message; return }

  log.ok('saveClientPB', 'PB logged', { clientId: row.client_id, date: row.date })
  renderClientDashboard(document.getElementById('main-content'))
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
  // Refresh the client dashboard to show the new entry
  renderClientDashboard(document.getElementById('main-content'))
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
      <button class="tab-btn" onclick="switchTab(this,'tab-photos','${id}')">Photos</button>
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
    case 'tab-photos':       content.innerHTML = ''; renderClientPhotos(clientId, content);       break
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
    db.from('clients').select('*').eq('id', id).single(),
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
  const { error } = await db.from('clients').update({ email, updated_at: new Date().toISOString() }).eq('id', clientId)
  if (error) { log.error('saveUpdateEmail', 'update failed', error); errorEl.textContent = error.message; return }
  log.ok('saveUpdateEmail', 'email updated', { clientId })

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
  const localDate = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
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
      db.from('events').select('*').gte('date', from).lte('date', to).order('date'),
      clientsId
        ? db.from('client_programs').select('id, start_date, programs(program_phases(duration_weeks, program_phase_workouts(id, day_of_week, session_order, workout_templates(id, name, workout_template_exercises(exercise_name, exercise_type, order_index, sets_json)))))').eq('client_id', clientsId).order('created_at', { ascending: false }).limit(1)
        : Promise.resolve({ data: [] })
    ])
    events = evRes.data

    // Step 3: client_program_workouts scoped to this assignment
    const _cpwMap = {}
    const cp0 = cpRes.data?.[0]
    if (cp0?.id) {
      const cpwRes = await db.from('client_program_workouts').select('program_phase_workout_id, workout_template_id').eq('client_program_id', cp0.id)
      ;(cpwRes.data || []).forEach(r => { _cpwMap[r.program_phase_workout_id] = r.workout_template_id })
    }
    window._calClientTemplateMap = _cpwMap

    // Map phase workouts to actual calendar dates
    if (cp0?.start_date) {
      const programStart = new Date(cp0.start_date + 'T00:00:00')
      // Normalise to Monday of that week
      const dayOfWeekJS = programStart.getDay() // 0=Sun
      const daysFromMon = (dayOfWeekJS + 6) % 7
      const weekStart = new Date(programStart)
      weekStart.setDate(programStart.getDate() - daysFromMon)

      const phases = cp0.programs?.program_phases || []
      let weekOffset = 0
      phases.forEach(phase => {
        for (let w = 0; w < (phase.duration_weeks || 1); w++) {
          ;(phase.program_phase_workouts || []).forEach(pw => {
            const offset = ((weekOffset + w) * 7) + (pw.day_of_week - 1)
            const d = new Date(weekStart)
            d.setDate(weekStart.getDate() + offset)
            const ds = localDate(d)
            if (!programWorkoutsByDate[ds]) programWorkoutsByDate[ds] = []
            programWorkoutsByDate[ds].push({ ...pw, _clientTemplateId: _cpwMap[pw.id] || null })
          })
        }
        weekOffset += (phase.duration_weeks || 1)
      })
      // Sort each day by session_order
      Object.values(programWorkoutsByDate).forEach(arr => arr.sort((a,b)=>(a.session_order||1)-(b.session_order||1)))
      window._calProgramWorkouts = programWorkoutsByDate
    }
  } else {
    const [evRes, clRes] = await Promise.all([
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
            if (!d) return `<div style="padding:4px;min-height:52px"></div>`
            const dateStr = `${calendarYear}-${String(calendarMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
            const dayEvents = byDate[dateStr] || []
            const dayWorkouts = programWorkoutsByDate[dateStr] || []
            const isToday = dateStr === todayStr
            const hasWorkouts = dayWorkouts.length > 0
            return `
              <div onclick="showDayEvents('${dateStr}')" style="
                padding:4px;border-radius:8px;cursor:pointer;min-height:52px;
                background:${isToday ? 'var(--accent)' : hasWorkouts ? 'var(--surface-2)' : 'transparent'};
                border:1px solid ${isToday ? 'transparent' : hasWorkouts ? 'var(--border)' : 'transparent'};
                transition:background 0.15s
              " onmouseover="this.style.background='${isToday ? 'var(--accent)' : 'var(--surface-2)'}'"
                 onmouseout="this.style.background='${isToday ? 'var(--accent)' : hasWorkouts ? 'var(--surface-2)' : 'transparent'}'">
                <div style="font-size:11px;font-weight:${isToday?'700':'500'};color:${isToday?'#fff':'var(--text)'}">
                  ${d}
                </div>
                ${hasWorkouts ? dayWorkouts.map(pw => `
                  <div style="margin-top:2px">
                    ${dayWorkouts.length > 1 ? `<div style="font-size:7px;font-weight:700;color:${isToday?'rgba(255,255,255,.7)':'var(--accent)'};letter-spacing:.04em;line-height:1">${pw.session_order===2?'PM':'AM'}</div>` : ''}
                    <div style="font-size:8px;font-weight:600;color:${isToday?'#fff':'var(--text)'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.2">${(pw.workout_templates?.name||'').replace(/ —.*/, '')}</div>
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
  if (currentProfile?.role === 'client' || currentProfile?.role === 'solo') showClientDayDetail(dateStr)
  else showAddEventModal(dateStr)
}

function showClientDayDetail(dateStr) {
  const existing = document.getElementById('client-day-modal')
  if (existing) existing.remove()

  const workouts = (window._calProgramWorkouts || {})[dateStr] || []
  const clientId = window._calClientId || ''
  const dateLabel = new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

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
          const exs = (pw.workout_templates?.workout_template_exercises || []).sort((a,b) => a.order_index - b.order_index)
          const multi = workouts.length > 1
          return `
          <div style="padding:14px 0;border-bottom:1px solid var(--border)">
            ${multi ? `<div style="font-size:10px;font-weight:700;color:var(--accent);letter-spacing:.06em;margin-bottom:4px">SESSION ${si+1}/${workouts.length}</div>` : ''}
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:${exs.length ? '8px' : '10px'}">
              <span style="font-size:15px;font-weight:600">${(pw.workout_templates?.name || 'Workout').replace(/ — W\d+/, '')}</span>
            </div>
            ${exs.length ? `
            <div style="margin-bottom:10px;padding:6px 8px;background:var(--surface-2);border-radius:8px">
              ${exs.map(ex => `
                <div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--border)">
                  <span style="font-size:12px">${ex.exercise_name}</span>
                  <span style="font-size:11px;color:var(--text-muted)">${ex.sets_json?.length || 0} set${(ex.sets_json?.length || 0) !== 1 ? 's' : ''}</span>
                </div>`).join('')}
            </div>` : ''}
            <button onclick="startWorkoutRunner('${clientId}','${pw._clientTemplateId||pw.workout_templates?.id}');document.getElementById('client-day-modal').remove()" class="btn-primary" style="width:100%">▶ Start workout</button>
          </div>`}).join('') : `
          <div style="text-align:center;padding:24px 0">
            <div style="font-size:32px;margin-bottom:8px">🛋️</div>
            <div style="font-size:15px;font-weight:600;margin-bottom:4px">Rest day</div>
            <div style="font-size:13px;color:var(--text-muted)">No sessions scheduled</div>
          </div>`}
      </div>
    </div>`

  document.body.appendChild(overlay)
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
  if (error) { log.error('toggleClientMilestone', 'update failed', error); return }
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
function fmtSet(s, type) {
  if (type === 'cardio') {
    const parts = [s.duration_seconds ? fmtDuration(s.duration_seconds) : null, s.distance_m ? (s.distance_m/1000).toFixed(2)+' km' : null]
    return parts.filter(Boolean).join(' · ') || '—'
  }
  const parts = [s.reps_achieved ? s.reps_achieved+' reps' : null, s.weight_kg ? s.weight_kg+'kg' : null, s.effort_value ? 'RPE '+s.effort_value : null]
  return parts.filter(Boolean).join(' · ') || '—'
}

// ─── SESSION DETAIL SLIDE-IN ──────────────────────────────────────────────────
async function openSessionDetail(templateId, name) {
  const existing = document.getElementById('session-detail-panel')
  if (existing) existing.remove()

  const { data: exercises } = await db
    .from('workout_template_exercises')
    .select('exercise_name, exercise_type, order_index, sets_json, notes')
    .eq('template_id', templateId)
    .order('order_index')

  const panel = document.createElement('div')
  panel.id = 'session-detail-panel'
  panel.style.cssText = 'position:fixed;inset:0;z-index:1000'

  const exHtml = !exercises?.length
    ? '<div class="empty-state"><div class="empty-title">No exercises added yet</div></div>'
    : exercises.map((ex, i) => {
        const sets = ex.sets_json || []
        const isLast = i === exercises.length - 1
        const setsHtml = sets.map((s, si) => {
          let label = `Set ${si + 1}`
          if (s.amrap) label = 'AMRAP'

          let detail = ''
          if (s.timed) {
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

  panel.innerHTML = `
    <div onclick="closeSessionDetail()" style="position:absolute;inset:0;background:rgba(0,0,0,.45)"></div>
    <div id="session-detail-drawer" style="position:absolute;top:0;right:0;bottom:0;width:min(420px,100vw);background:var(--surface);overflow-y:auto;display:flex;flex-direction:column;transform:translateX(100%);transition:transform .3s cubic-bezier(.32,.72,0,1)">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:20px 16px 14px;border-bottom:1px solid var(--border);flex-shrink:0">
        <h2 style="font-size:17px;font-weight:700;margin:0">${escapeHtml(name)}</h2>
        <button onclick="closeSessionDetail()" style="border:none;background:none;cursor:pointer;padding:4px 8px;color:var(--text-muted);font-size:22px;line-height:1">✕</button>
      </div>
      <div style="padding:16px;flex:1">${exHtml}</div>
    </div>`

  document.body.appendChild(panel)
  setTimeout(() => {
    const d = document.getElementById('session-detail-drawer')
    if (d) d.style.transform = 'translateX(0)'
  }, 16)
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

function toggleClientTemplate(id) {
  const panel = document.getElementById(`tmpl-detail-${id}`)
  const chevron = document.getElementById(`chevron-${id}`)
  if (!panel) return
  const open = panel.style.display === 'none'
  panel.style.display = open ? 'block' : 'none'
  if (chevron) chevron.style.transform = open ? 'rotate(90deg)' : ''
}

async function renderClientWorkoutsPage(el) {
  const { data: clientRecord } = await db.from('clients').select('id, coach_id').eq('user_id', currentUser.id).single()
  if (!clientRecord) { el.innerHTML = '<div class="empty-state"><div class="empty-title">No client profile found</div></div>'; return }
  const clientId = clientRecord.id

  const [{ data: templates }, { data: logs }, { data: oneRMRows }, { data: cpAssignments }] = await Promise.all([
    db.from('workout_templates').select('id, name, description, workout_template_exercises(id, exercise_name, exercise_type, order_index, sets_json, notes)').eq('coach_id', clientRecord.coach_id || currentUser.id).is('client_id', null).is('program_id', null).order('name'),
    db.from('workout_logs').select('id, name, date').eq('client_id', clientId).order('date', { ascending: false }).limit(20),
    db.from('client_1rms').select('exercise_name, one_rm_kg, recorded_at').eq('client_id', clientId).order('recorded_at', { ascending: false }),
    db.from('client_programs').select('id, programs(id, name, program_phases(id, name, order_index, duration_weeks, program_phase_workouts(id, day_of_week, session_order)))').eq('client_id', clientId).order('created_at', { ascending: false }).limit(1)
  ])
  const oneRMMap = {}
  ;(oneRMRows || []).forEach(r => { const k = r.exercise_name.trim().toLowerCase(); if (!oneRMMap[k]) oneRMMap[k] = parseFloat(r.one_rm_kg) })

  let cpwMap = {}
  const activeAssignment = cpAssignments?.[0]
  if (activeAssignment) {
    const { data: cpwRows } = await db.from('client_program_workouts')
      .select('program_phase_workout_id, workout_template_id, workout_templates(id, name, description, workout_template_exercises(id, exercise_name, exercise_type, order_index, sets_json, notes))')
      .eq('client_program_id', activeAssignment.id)
    ;(cpwRows || []).forEach(r => { cpwMap[r.program_phase_workout_id] = { templateId: r.workout_template_id, name: r.workout_templates?.name, desc: r.workout_templates?.description, exercises: r.workout_templates?.workout_template_exercises || [] } })
  }
  const hasProgram = activeAssignment && Object.keys(cpwMap).length > 0

  el.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Workouts</h1>
    </div>

    ${hasProgram ? (() => {
      const prog = activeAssignment.programs
      const phases = [...(prog?.program_phases || [])].sort((a, b) => a.order_index - b.order_index)
      return `<div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:10px">${prog?.name || 'My Program'}</div>
        <div style="margin-bottom:28px">
          ${phases.map((phase, pi) => {
            const allSessions = [...(phase.program_phase_workouts || [])].sort((a, b) => a.day_of_week - b.day_of_week || a.session_order - b.session_order)
            const dayMap = {}
            allSessions.forEach(pw => { if (!dayMap[pw.day_of_week]) dayMap[pw.day_of_week] = []; dayMap[pw.day_of_week].push(pw) })
            const days = Object.keys(dayMap).map(Number).sort((a,b) => a - b)
            const panelId = `cl-phase-${activeAssignment.id}-${pi}`
            return `<div style="margin-bottom:6px;border:1px solid var(--border);border-radius:10px;overflow:hidden">
              <button onclick="toggleClientPhase('${panelId}')" style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:var(--surface-2);border:none;cursor:pointer;text-align:left">
                <div>
                  <span style="font-size:13px;font-weight:700;color:var(--text)">${phase.name}</span>
                  <span style="font-size:11px;color:var(--text-muted);margin-left:8px">${phase.duration_weeks}w · ${days.length} day${days.length !== 1 ? 's' : ''} · ${allSessions.length} session${allSessions.length !== 1 ? 's' : ''}</span>
                </div>
                <svg id="${panelId}-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;color:var(--text-muted);transition:transform .2s;flex-shrink:0"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              <div id="${panelId}" style="display:none">
                ${days.map(day => {
                  const daySessions = dayMap[day]
                  const multi = daySessions.length > 1
                  const dayPanelId = `${panelId}-d${day}`
                  const sessionSummary = daySessions.map(pw => (cpwMap[pw.id]?.name || 'Session').replace(/ — W\d+/, '')).join(', ')
                  return `<div style="border-top:1px solid var(--border)">
                    <button onclick="toggleClientPhase('${dayPanelId}')" style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:none;border:none;cursor:pointer;text-align:left">
                      <div>
                        <span style="font-size:12px;font-weight:700;color:var(--accent)">DAY ${day}</span>
                        <span style="font-size:13px;font-weight:500;color:var(--text);margin-left:8px">${sessionSummary}</span>
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
                          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:${exs.length ? '8px' : '0'}">
                            ${templateId ? `<span style="font-size:13px;font-weight:600;cursor:pointer;text-decoration:underline;text-decoration-color:var(--border)" onclick="openSessionDetail('${templateId}','${name.replace(/'/g,"\\'")}')">` : `<span style="font-size:13px;font-weight:600">`}${name}</span>
                            ${templateId ? `<button class="btn-primary" style="font-size:12px;padding:3px 10px;flex-shrink:0" onclick="startWorkoutRunner('${clientId}','${templateId}')">▶ Start</button>` : `<span style="font-size:12px;color:var(--text-muted)">Not set up</span>`}
                          </div>
                          ${exs.length ? `
                          <div style="padding:6px 8px;background:var(--surface-2);border-radius:6px">
                            ${exs.map(ex => `
                              <div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--border)">
                                <span style="font-size:12px">${ex.exercise_name}</span>
                                <span style="font-size:11px;color:var(--text-muted)">${ex.sets_json?.length || 0} set${(ex.sets_json?.length || 0) !== 1 ? 's' : ''}</span>
                              </div>`).join('')}
                          </div>` : ''}
                        </div>`
                      }).join('')}
                    </div>
                  </div>`
                }).join('')}
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
              <div class="row-info" style="flex:1;min-width:0;cursor:pointer" onclick="openSessionDetail('${t.id}','${t.name.replace(/'/g,"\\'")}')">
                <div class="row-name">${t.name}</div>
                <div class="row-meta">${exs.length} exercise${exs.length!==1?'s':''} · tap to preview</div>
              </div>
              <button class="btn-primary" style="font-size:13px;padding:6px 14px;flex-shrink:0" onclick="startWorkoutRunner('${clientId}','${t.id}')">▶ Start</button>
            </div>
          </div>`
        }).join('')}</div>`}
      `
    })()}

    ${oneRMRows?.length ? `
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:10px">Your 1RMs</div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:28px">
      ${(() => {
        const byEx = {}
        ;(oneRMRows || []).forEach(r => { if (!byEx[r.exercise_name]) byEx[r.exercise_name] = []; byEx[r.exercise_name].push(r) })
        return Object.entries(byEx).map(([name, entries]) => {
          const latest = entries[0]
          const history = entries.slice(1).map(e => parseFloat(e.one_rm_kg).toFixed(1)+' kg').join(' → ')
          return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--surface);border:1px solid var(--border);border-radius:10px">
            <div>
              <div style="font-size:13px;font-weight:600">${name}</div>
              ${history ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px">${history} → current</div>` : ''}
            </div>
            <span style="font-size:20px;font-weight:800;color:var(--accent)">${parseFloat(latest.one_rm_kg).toFixed(1)} kg</span>
          </div>`
        }).join('')
      })()}
    </div>` : ''}
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted)">Session history</div>
      ${(logs?.length || 0) > 0 ? `<span style="font-size:12px;color:var(--text-muted)">${logs.length} logged</span>` : ''}
    </div>
    ${!(logs?.length) ? `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <div class="empty-title">No sessions yet</div>
        <div class="empty-text">Complete a workout to see your history here.</div>
      </div>` : `
      <div class="list" id="client-session-list">
        ${logs.map(l => `
          <div class="list-row" style="cursor:pointer" onclick="openWorkoutLog('${l.id}','${clientId}')">
            <div style="width:36px;height:36px;border-radius:8px;background:var(--surface-2);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:16px">✓</div>
            <div class="row-info">
              <div class="row-name">${l.name || 'Workout'}</div>
              <div class="row-meta">${new Date(l.date + 'T00:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})}</div>
            </div>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;color:var(--text-muted);flex-shrink:0"><polyline points="9 18 15 12 9 6"/></svg>
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
  const [{ data: templates, error }, { data: programs }] = await Promise.all([
    db.from('workout_templates').select('*, workout_template_exercises(id)').eq('coach_id', currentUser.id).is('client_id', null).order('name'),
    db.from('programs').select('id, name').eq('coach_id', currentUser.id).order('name')
  ])

  if (error) { log.error('renderWorkoutTemplates', 'fetch failed', error); el.innerHTML = `<div class="loading-state">${error.message}</div>`; return }
  log.ok('renderWorkoutTemplates', `loaded ${templates.length} templates`)

  if (!templates.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">No templates yet</div><div class="empty-text">${currentProfile?.role === 'solo' ? 'Create a workout template to build your own sessions.' : 'Create a workout template to quickly build sessions for your clients.'}</div><button class="btn-primary" onclick="showCreateTemplateModal()">+ Create template</button></div>`
    return
  }

  const standalone = templates.filter(t => !t.program_id)

  if (!standalone.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">No standalone templates</div><div class="empty-text">All your templates are linked to programs. Manage them via Programs → phase view, or create a standalone template below.</div><button class="btn-primary" onclick="showCreateTemplateModal()">+ Create template</button></div>`
    return
  }
  const adHoc = standalone
  const byProgram = {}

  const templateRow = t => `
    <div class="list-row" onclick="openTemplate('${t.id}')">
      <div style="width:40px;height:40px;border-radius:10px;background:rgba(99,102,241,.12);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">💪</div>
      <div class="row-info">
        <div class="row-name">${t.name}</div>
        <div class="row-meta">${t.description || (t.workout_template_exercises.length + ' exercise' + (t.workout_template_exercises.length !== 1 ? 's' : ''))}</div>
      </div>
      <div class="row-right">
        <span style="font-size:12px;color:var(--text-muted)">${t.workout_template_exercises.length} ex</span>
        <svg style="width:15px;height:15px;color:#d1d5db" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
    </div>`

  const sectionHeader = label => `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin:20px 0 8px">${label}</div>`

  let html = ''
  Object.entries(byProgram).forEach(([progId, tmplts]) => {
    html += sectionHeader(programMap[progId])
    html += `<div class="list">${tmplts.map(templateRow).join('')}</div>`
  })
  if (adHoc.length) {
    if (Object.keys(byProgram).length) html += sectionHeader('Ad-hoc sessions')
    html += `<div class="list">${adHoc.map(templateRow).join('')}</div>`
  }

  el.innerHTML = html
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
  const ctx = window._phaseWorkoutContext
  const { data, error } = await db.from('workout_templates').insert({
    coach_id:    currentUser.id,
    name,
    description: document.getElementById('ct-desc').value.trim() || null,
    program_id:  ctx?.programId || null
  }).select().single()

  if (error) { log.error('saveNewTemplate', 'insert failed', error); errorEl.textContent = error.message; return }
  log.ok('saveNewTemplate', 'template created', { id: data.id, name })
  closeModal('create-template-modal')

  if (window._phaseWorkoutContext) {
    window._phaseWorkoutContext = null
    openTemplate(data.id)
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
        <h1 class="page-title">${t.name}</h1>
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
                  <span style="font-weight:600;font-size:14px">${ex.exercise_name}</span>
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
                        ? [s.distance ? s.distance+' km' : null, paceStr||paceKmStr, strokeStr, restStr, hrStr, restHrStr]
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
  } else if (ctx.clientId) {
    openClientProgramsTab(ctx.clientId)
  } else {
    navigate(ctx.backTo || 'workouts')
  }
}

async function openClientProgramsTab(clientId) {
  await openClient(clientId)
  const btn = document.querySelector('[onclick*="tab-programs"]')
  if (btn) btn.click()
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
    s.distance     = document.getElementById(`ts-distance-${i}`)?.value ?? s.distance
    s.pace500Min    = document.getElementById(`ts-p500min-${i}`)?.value   ?? s.pace500Min
    s.pace500Max    = document.getElementById(`ts-p500max-${i}`)?.value   ?? s.pace500Max
    s.hrZoneMin     = document.getElementById(`ts-hrzmin-${i}`)?.value    ?? s.hrZoneMin
    s.hrZoneMax     = document.getElementById(`ts-hrzmax-${i}`)?.value    ?? s.hrZoneMax
    s.paceKmMin     = document.getElementById(`ts-pkmmin-${i}`)?.value    ?? s.paceKmMin
    s.paceKmMax     = document.getElementById(`ts-pkmmax-${i}`)?.value    ?? s.paceKmMax
    s.restHrMax     = document.getElementById(`ts-resthr-${i}`)?.value    ?? s.restHrMax
    s.strokeRateMin = document.getElementById(`ts-srmin-${i}`)?.value     ?? s.strokeRateMin
    s.strokeRateMax = document.getElementById(`ts-srmax-${i}`)?.value     ?? s.strokeRateMax
    s.assistWeight  = document.getElementById(`ts-assist-${i}`)?.value    ?? s.assistWeight
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
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:12px;font-weight:700;color:#374151">Set ${i+1}</span>
          ${i > 0 ? `<button type="button" onclick="copyPrevTemplateSet(${i},'${containerId}','${tid}')" style="font-size:11px;font-weight:700;padding:3px 9px;border-radius:6px;border:none;background:var(--accent);color:#fff;cursor:pointer">Copy set ${i} ↑</button>` : ''}
        </div>
        <div style="display:flex;gap:4px">
          ${!isCardio ? `
            ${tog('AMRAP', s.amrap, `toggleTsSet(${i},'amrap','${containerId}')`)}
            ${tog('⟺ Uni', s.unilateral, `toggleTsSet(${i},'unilateral','${containerId}')`)}
            ${tog('⏱ Timed', s.timed, `toggleTsSet(${i},'timed','${containerId}')`)}
            ${tog('BW', s.bodyweight, `toggleTsSet(${i},'bodyweight','${containerId}')`)}
            ${tog('Assist', s.assisted, `toggleTsSet(${i},'assisted','${containerId}')`)}
          ` : ''}
          <button type="button" onclick="flushTemplateSets('${containerId}');window._templateSets.splice(${i},1);renderTemplateSets('${containerId}',document.getElementById('${tid}')?.value||'strength')" style="width:26px;height:26px;border-radius:6px;border:1px solid #d1d5db;background:transparent;color:#9ca3af;cursor:pointer;font-size:15px;line-height:1">×</button>
        </div>
      </div>
      ${isCardio ? `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f3f4f6">
          <span style="font-size:13px;font-weight:600;color:#374151">Target</span>
          <div style="display:flex;gap:4px">
            ${tog('Duration', !s.isDistanceBased, `toggleTsSet(${i},'isDistanceBased','${containerId}')`)}
            ${tog('Distance', s.isDistanceBased, `toggleTsSet(${i},'isDistanceBased','${containerId}')`)}
          </div>
        </div>
        ${!s.isDistanceBased ? row('Duration', mini(`ts-duration-${i}`,'type="text" placeholder="0:00" oninput="this.value=fmtRestInput(this.value)" value="'+(s.duration||'0:00')+'"')) : ''}
        ${s.isDistanceBased ? row('Distance (km)', mini(`ts-distance-${i}`, `type="number" step="0.01" placeholder="—"${s.distance ? ` value="${s.distance}"` : ''}`)) : ''}
        ${row('Pace / 500m', mini(`ts-p500min-${i}`, `type="text" placeholder="0:00" oninput="tsPace500Input(${i},'${containerId}')" value="${s.pace500Min||'0:00'}"`) + dash + mini(`ts-p500max-${i}`, `type="text" placeholder="0:00" oninput="tsPace500Input(${i},'${containerId}')" value="${s.pace500Max||'0:00'}"`))}

        ${row('Pace / 1000m', `<span id="ts-p1000-${i}" style="font-size:13px;font-weight:600;color:var(--accent);min-width:100px;text-align:right">${calcPace1000(s.pace500Min, s.pace500Max)}</span>`)}
        ${row('Rest', mini(`ts-restmin-${i}`,'type="text" placeholder="0:00" oninput="this.value=fmtRestInput(this.value)" value="'+(s.restMin||'0:00')+'"') + dash + mini(`ts-restmax-${i}`,'type="text" placeholder="0:00" oninput="this.value=fmtRestInput(this.value)" value="'+(s.restMax||'0:00')+'"'))}
        ${row('HR Zone (BPM)', mini(`ts-hrzmin-${i}`,'type="number" placeholder="—"'+(s.hrZoneMin?` value="${s.hrZoneMin}"`:'')) + dash + mini(`ts-hrzmax-${i}`,'type="number" placeholder="—"'+(s.hrZoneMax?` value="${s.hrZoneMax}"`:'')))}
        ${row('Pace / km', mini(`ts-pkmmin-${i}`, `type="text" placeholder="0:00" oninput="this.value=fmtRestInput(this.value)" value="${s.paceKmMin||'0:00'}"`) + dash + mini(`ts-pkmmax-${i}`, `type="text" placeholder="0:00" oninput="this.value=fmtRestInput(this.value)" value="${s.paceKmMax||'0:00'}"`))}
        ${row('Rest HR max (BPM)', mini(`ts-resthr-${i}`, 'type="number" placeholder="e.g. 150"'+(s.restHrMax ? ` value="${s.restHrMax}"` : '')))}
        ${row('Stroke rate (spm)', mini(`ts-srmin-${i}`, 'type="number" placeholder="—"'+(s.strokeRateMin?` value="${s.strokeRateMin}"`:'')) + dash + mini(`ts-srmax-${i}`, 'type="number" placeholder="—"'+(s.strokeRateMax?` value="${s.strokeRateMax}"`:'')))}
      ` : `
        ${s.timed
          ? row('Duration (mm:ss)', mini(`ts-duration-${i}`, `type="text" placeholder="0:00" oninput="this.value=fmtRestInput(this.value)" value="${s.duration||'0:00'}"`))
          : row('Reps', mini(`ts-rmin-${i}`,'type="number" placeholder="0"'+(s.repsMin?` value="${s.repsMin}"`:'')) + dash + mini(`ts-rmax-${i}`,'type="number" placeholder="0"'+(s.repsMax?` value="${s.repsMax}"`:'')))}
        ${s.bodyweight ? '' : row('Weight (kg)', mini(`ts-weight-${i}`,'type="text" placeholder="Optional"'+(s.weight?` value="${s.weight}"`:'')))}
        ${s.assisted ? row('Assist weight (kg)', mini(`ts-assist-${i}`,'type="number" placeholder="e.g. 20"'+(s.assistWeight?` value="${s.assistWeight}"`:''))): ''}
        ${row('Intensity (%1RM)', mini(`ts-imin-${i}`,'type="number" placeholder="Min"'+(s.intensityMin?` value="${s.intensityMin}"`:'')) + dash + mini(`ts-imax-${i}`,'type="number" placeholder="Max"'+(s.intensityMax?` value="${s.intensityMax}"`:'')))}
        ${row('Rest between sets', mini(`ts-restmin-${i}`,'type="text" placeholder="0:00" oninput="this.value=fmtRestInput(this.value)" value="'+(s.restMin||'0:00')+'"') + dash + mini(`ts-restmax-${i}`,'type="text" placeholder="0:00" oninput="this.value=fmtRestInput(this.value)" value="'+(s.restMax||'0:00')+'"'))}
        ${row(etbtn('RPE','rpe')+etbtn('RIR','rir'), mini(`ts-emin-${i}`,'type="number" step="0.5" min="1" max="10" placeholder="Min"'+(s.effortMin?` value="${s.effortMin}"`:'')) + dash + mini(`ts-emax-${i}`,'type="number" step="0.5" min="1" max="10" placeholder="Max"'+(s.effortMax?` value="${s.effortMax}"`:'')))}
        ${row('Tempo', mini(`ts-tempo-${i}`,'type="text" placeholder="e.g. 3011"'+(s.tempo?` value="${s.tempo}"`:'')))}
        ${row('Countdown (s)', mini(`ts-cd-${i}`,'type="number" placeholder="Optional"'+(s.countdown?` value="${s.countdown}"`:'')))}
      `}
    </div>`
  }).join('') + `
  <button type="button" onclick="flushTemplateSets('${containerId}');window._templateSets.push({effortType:'rpe'});renderTemplateSets('${containerId}',document.getElementById('${tid}')?.value||'strength')" style="margin-top:6px;font-size:13px;color:var(--accent);background:none;border:none;cursor:pointer;font-weight:600">+ Add set</button>`
}

function copyPrevTemplateSet(i, containerId, tid) {
  flushTemplateSets(containerId)
  const sets = window._templateSets || []
  if (i < 1 || i >= sets.length) return
  const prev = { ...sets[i - 1] }
  sets[i] = prev
  renderTemplateSets(containerId, document.getElementById(tid)?.value || 'strength')
}

function showAddExerciseToTemplateModal(templateId) {
  const _addOrmClientId = currentProfile?.role === 'solo' ? window._soloClientId : null
  Promise.all([
    db.from('exercises').select('*').order('name'),
    _addOrmClientId
      ? db.from('client_1rms').select('exercise_name').eq('client_id', _addOrmClientId).order('exercise_name')
      : db.from('client_1rms').select('exercise_name').order('exercise_name')
  ]).then(([{ data: exercises }, { data: ormRows }]) => {
    window._templateSets = [{ effortType: 'rpe' }]
    // Deduplicate 1RM exercise names across all clients (RLS scopes to coach's clients)
    const ormNames = [...new Set((ormRows || []).map(r => r.exercise_name))].sort()
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
              ${ormNames.length ? `<optgroup label="── 1RM lifts ──">${ormNames.map(n => `<option value="" data-name="${n}" data-is-orm="1">${n}</option>`).join('')}</optgroup>` : ''}
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
        <div class="field">
          <label class="field-label">Superset group <span style="font-weight:400;color:var(--text-muted)">(optional — enter same letter, e.g. A, to link exercises)</span></label>
          <input class="field-input" id="att-superset" placeholder="e.g. A" maxlength="3" style="width:80px">
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
      if (opt.value || opt.dataset.name) {
        document.getElementById('att-name').value = opt.dataset.name || ''
        // If it's a 1RM lift, switch type to strength and scroll intensity fields into view
        if (opt.dataset.isOrm) {
          document.getElementById('att-type').value = 'strength'
          flushTemplateSets('att-sets-container')
          renderTemplateSets('att-sets-container', 'strength')
          setTimeout(() => document.querySelector('[id^="ts-imin-"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100)
        }
      }
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
    bodyweight: !!s.bodyweight, assisted: !!s.assisted, assistWeight: s.assistWeight||null,
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
    sets:           cleanSets.length || null,
    sets_json:      cleanSets.length ? cleanSets : null,
    notes:          document.getElementById('att-notes').value.trim() || null,
    superset_group: document.getElementById('att-superset')?.value.trim().toUpperCase() || null
  })

  if (error) { log.error('saveExerciseToTemplate', 'insert failed', error); errorEl.textContent = error.message; return }
  log.ok('saveExerciseToTemplate', 'exercise added to template', { templateId, name })
  closeModal('add-to-template-modal')
  _checkClientPlanPropagation(templateId)
}

async function showEditTemplateExerciseModal(templateExId, templateId) {
  const ctx = window._templateCtx
  const ormClientId = ctx.clientId || (currentProfile?.role === 'solo' ? window._soloClientId : null)
  const [{ data: ex }, { data: ormRows }, { data: libraryExercises }] = await Promise.all([
    db.from('workout_template_exercises').select('*').eq('id', templateExId).single(),
    ormClientId
      ? db.from('client_1rms').select('exercise_name').eq('client_id', ormClientId).order('exercise_name')
      : Promise.resolve({ data: [] }),
    db.from('exercises').select('id, name, muscle_group').order('name')
  ])
  window._templateSets = ex.sets_json?.length ? ex.sets_json.map(s => ({...s})) : (ex.sets ? Array.from({length: ex.sets}, () => ({})) : [{}])

  const ormNames = [...new Set((ormRows || []).map(r => r.exercise_name))].sort()
  const libExercises = libraryExercises || []
  const ormDropdown = `
    <div class="field-row" style="margin-bottom:8px">
      <div class="field" style="flex:2">
        <label class="field-label">Pick from library</label>
        <select class="field-input" id="etex-lib-pick" onchange="if(this.value){document.getElementById('etex-name').value=this.value}">
          <option value="">— or type a custom name below —</option>
          ${ormNames.length ? `<optgroup label="── Client 1RM lifts ──">${ormNames.map(n => `<option value="${n}" ${n === ex.exercise_name ? 'selected' : ''}>${n}</option>`).join('')}</optgroup>` : ''}
          ${libExercises.map(e => `<option value="${e.name}" ${e.name === ex.exercise_name ? 'selected' : ''}>${e.name}${e.muscle_group ? ' · '+e.muscle_group : ''}</option>`).join('')}
        </select>
      </div>
    </div>`

  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.id = 'edit-tex-modal'
  overlay.innerHTML = `
    <div class="modal" style="max-width:560px;max-height:90vh;overflow-y:auto">
      <div class="modal-header">
        <h2 class="modal-title">Edit: ${ex.exercise_name}</h2>
        <button class="modal-close" onclick="closeModal('edit-tex-modal')">✕</button>
      </div>
      ${ormDropdown}
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
      <div class="field">
        <label class="field-label">Superset group <span style="font-weight:400;color:var(--text-muted)">(optional — same letter links exercises, e.g. A)</span></label>
        <input class="field-input" id="etex-superset" value="${ex.superset_group || ''}" placeholder="e.g. A" maxlength="3" style="width:80px">
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
    sets:           sets.length || null,
    sets_json:      sets.length ? sets : null,
    notes:          document.getElementById('etex-notes').value.trim() || null,
    superset_group: document.getElementById('etex-superset')?.value.trim().toUpperCase() || null
  }).eq('id', texId)
  if (error) { log.error('saveEditTemplateExercise', 'update failed', error); errorEl.textContent = error.message; return }
  log.ok('saveEditTemplateExercise', 'template exercise updated', { texId })
  closeModal('edit-tex-modal')
  _checkClientPlanPropagation(templateId)
}

async function deleteTemplateExercise(texId, templateId) {
  log.info('deleteTemplateExercise', 'removing exercise from template', { texId, templateId })
  const { error } = await db.from('workout_template_exercises').delete().eq('id', texId)
  if (error) { log.error('deleteTemplateExercise', 'delete failed', error); return }
  log.ok('deleteTemplateExercise', 'exercise removed', { texId })
  closeModal('edit-tex-modal')
  openTemplate(templateId)
}

async function _checkClientPlanPropagation(templateId) {
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
        <p style="font-size:14px;line-height:1.6;margin:0 0 20px">There ${count === 1 ? 'is' : 'are'} <strong>${count}</strong> other session${count === 1 ? '' : 's'} named "<strong>${name}</strong>" in ${label}.</p>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="closeModal('propagate-modal');openTemplate('${templateId}',window._templateCtx)">Just this session</button>
          <button class="btn-primary" onclick="_applyToAllSessions('${templateId}')">Update all "${name}"</button>
        </div>
      </div>
    `
    document.body.appendChild(overlay)
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
    if (!matching.length) {
      // Template may be shared across multiple weeks — edits already apply to all
      const sharedCount = pws.filter(r => r.template_id === templateId).length
      if (sharedCount > 1) {
        const toast = document.createElement('div')
        toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:10px 18px;font-size:13px;font-weight:600;color:var(--text);z-index:9999;pointer-events:none;text-align:center;box-shadow:0 4px 12px rgba(0,0,0,.15)'
        toast.textContent = `✓ Changes apply to all ${sharedCount} "${tmpl.name}" sessions — they share this template`
        document.body.appendChild(toast)
        setTimeout(() => toast.remove(), 3500)
      }
      return openTemplate(templateId, ctx)
    }
    window._propagateTargets = matching.map(r => r.template_id)
    _showPropagateModal(tmpl.name, matching.length, 'this program')
    return
  }

  openTemplate(templateId, ctx)
}

async function _applyToAllSessions(sourceTemplateId) {
  closeModal('propagate-modal')
  const targetIds = window._propagateTargets || []
  if (!targetIds.length) { openTemplate(sourceTemplateId, window._templateCtx); return }

  const { data: sourceExs } = await db.from('workout_template_exercises')
    .select('*').eq('template_id', sourceTemplateId).order('order_index')

  for (const targetId of targetIds) {
    await db.from('workout_template_exercises').delete().eq('template_id', targetId)
    if (sourceExs?.length) {
      const copies = sourceExs.map(ex => ({
        template_id: targetId,
        exercise_id: ex.exercise_id || null,
        exercise_name: ex.exercise_name,
        exercise_type: ex.exercise_type,
        order_index: ex.order_index,
        sets: ex.sets || null,
        sets_json: ex.sets_json || null,
        notes: ex.notes || null,
        superset_group: ex.superset_group || null
      }))
      await db.from('workout_template_exercises').insert(copies)
    }
  }

  // If propagating from master program, also sync client plan copies
  // (client_program_workouts links back to program_phase_workouts via program_phase_workout_id)
  if (window._templateCtx?.programId) {
    const allMasterIds = [sourceTemplateId, ...targetIds]
    const { data: ppws } = await db.from('program_phase_workouts')
      .select('id').in('template_id', allMasterIds)
    if (ppws?.length) {
      const { data: cpws } = await db.from('client_program_workouts')
        .select('workout_template_id').in('program_phase_workout_id', ppws.map(r => r.id))
      const clientTmplIds = (cpws || []).map(r => r.workout_template_id).filter(Boolean)
      for (const clientTmplId of clientTmplIds) {
        await db.from('workout_template_exercises').delete().eq('template_id', clientTmplId)
        if (sourceExs?.length) {
          const copies = sourceExs.map(ex => ({
            template_id: clientTmplId,
            exercise_id: ex.exercise_id || null,
            exercise_name: ex.exercise_name,
            exercise_type: ex.exercise_type,
            order_index: ex.order_index,
            sets: ex.sets || null,
            sets_json: ex.sets_json || null,
            notes: ex.notes || null,
            superset_group: ex.superset_group || null
          }))
          await db.from('workout_template_exercises').insert(copies)
        }
      }
      log.ok('_applyToAllSessions', `synced ${clientTmplIds.length} client plan copies`)
    }
  }

  log.ok('_applyToAllSessions', `propagated to ${targetIds.length} sessions`)
  openTemplate(sourceTemplateId, window._templateCtx)
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
  const { data, error } = await db.from('workout_templates').update({
    name,
    description: document.getElementById('et-desc').value.trim() || null
  }).eq('id', id).eq('coach_id', currentUser.id).select()
  if (error) { log.error('saveEditTemplate', 'update failed', error); errorEl.textContent = error.message; return }
  if (!data?.length) { log.error('saveEditTemplate', 'no rows updated — permission denied?', { id }); errorEl.textContent = 'Save failed — template not found or permission denied.'; return }
  log.ok('saveEditTemplate', 'template updated', { id })
  closeModal('edit-template-modal')
  openTemplate(id)
}

async function deleteTemplate(id) {
  if (!confirm('Delete this template? This cannot be undone.')) return
  log.info('deleteTemplate', 'deleting template', { id })
  const { data, error } = await db.from('workout_templates').delete().eq('id', id).eq('coach_id', currentUser.id).select()
  if (error) { log.error('deleteTemplate', 'delete failed', error); return }
  if (!data?.length) { log.error('deleteTemplate', 'no rows deleted — permission denied or already gone', { id }); return }
  log.ok('deleteTemplate', 'template deleted', { id })
  closeModal('edit-template-modal')
  navigate('workouts')
}

// ─── CLIENT WORKOUTS TAB ──────────────────────────────────────────────────────
async function renderClientWorkouts(clientId, el) {
  log.info('renderClientWorkouts', 'fetching', { clientId })
  el.innerHTML = '<div class="loading-state">Loading…</div>'

  const [{ data: logs, error }, { data: clientProgs }, { data: clientData }] = await Promise.all([
    db.from('workout_logs').select('*, workout_log_exercises(id)').eq('client_id', clientId).order('date', { ascending: false }),
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
            <div class="list-row" onclick="openTemplate('${r.workout_templates?.id||r.workout_template_id}',{backTo:'client',backLabel:'${(clientData?.full_name||'Client').replace(/'/g,"\\'")}',clientId:'${clientId}',clientName:'${(clientData?.full_name||'Client').replace(/'/g,"\\'")}',clientProgramId:'${cpIds[0]||''}'})">
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
    ${logs?.length ? `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:10px">Session history</div>` : ''}
    <div class="list">
      ${!logs?.length ? `
        <div class="empty-state">
          <div class="empty-icon">💪</div>
          <div class="empty-title">No sessions logged yet</div>
          <div class="empty-text">Log a workout to start tracking this client's training</div>
          <button class="btn-primary" onclick="showLogSessionModal('${clientId}')">+ Log first session</button>
        </div>
      ` : logs.map(l => {
        const dateStr = new Date(l.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
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
  const coachId = currentProfile?.role === 'client'
    ? (await db.from('clients').select('coach_id').eq('user_id', currentUser.id).single()).data?.coach_id
    : currentUser.id
  const { data: templates } = await db.from('workout_templates').select('*, workout_template_exercises(*)').eq('coach_id', coachId).order('name')
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

async function launchRunner(clientId) {
  const name     = document.getElementById('rs-name')?.value.trim() || window._fakeRsName || 'Workout'
  const tmplId   = document.getElementById('rs-template')?.value || window._fakeRsTemplate || ''
  window._fakeRsName = null; window._fakeRsTemplate = null
  const template = window._runnerTemplates?.find(t => t.id === tmplId)

  // Fetch stored 1RMs for this client — used to compute kg targets from %1RM sets
  const { data: oneRMRows } = await db.from('client_1rms').select('exercise_name, one_rm_kg').eq('client_id', clientId)
  const oneRMMap = Object.fromEntries((oneRMRows || []).map(r => [r.exercise_name.trim().toLowerCase(), parseFloat(r.one_rm_kg)]))

  let exercises = []
  if (template) {
    exercises = (template.workout_template_exercises || [])
      .sort((a, b) => a.order_index - b.order_index)
      .map(ex => {
        const repsStr = String(ex.reps || '')
        const restSecs = ex.rest_seconds || parseRest(ex.sets_json?.[0]?.restMin || '') || 90
        const s0 = ex.sets_json?.[0] || {}
        const oneRM = oneRMMap[ex.exercise_name.trim().toLowerCase()] || null
        return { name: ex.exercise_name, type: ex.exercise_type || 'strength', targetSets: ex.sets_json?.length || 3, targetReps: repsStr, targetWeight: ex.weight_kg || '', restSecs, loggedSets: [], bodyweight: !!s0.bodyweight, assisted: !!s0.assisted, supersetGroup: ex.superset_group || null, sets_json: ex.sets_json || [], notes: ex.notes || null, oneRM }
      })
  }
  if (!exercises.length) exercises = [{ name: '', type: 'strength', targetSets: 0, targetReps: '', targetWeight: '', loggedSets: [] }]

  document.getElementById('runner-setup')?.remove()

  _runner = { clientId, name, date: new Date().toISOString().split('T')[0], exercises, exIdx: 0, startTime: Date.now(), _timerInterval: null, templateDesc: template?.description || null }
  renderRunner()
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

async function fetchRunnerLastSession(exName) {
  if (!_runner || !exName) return
  _runner.lastSession = _runner.lastSession || {}
  if (_runner.lastSession[exName] !== undefined) { renderRunnerLastSession(exName); return }
  _runner.lastSession[exName] = null

  const { data: logs } = await db.from('workout_logs')
    .select('id, date').eq('client_id', _runner.clientId)
    .order('date', { ascending: false }).limit(20)
  if (!logs?.length) { _runner.lastSession[exName] = null; return }

  const { data: exRows } = await db.from('workout_log_exercises')
    .select('log_id, workout_log_sets(set_number, weight_kg, reps_achieved)')
    .eq('exercise_name', exName).in('log_id', logs.map(l => l.id))
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
  const el = document.getElementById('wr-last-session')
  if (!el) return
  const data = _runner?.lastSession?.[exName]
  if (!data?.sets?.length) { el.innerHTML = ''; return }
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

function renderRunner() {
  const ex      = _runner.exercises[_runner.exIdx]
  const setNum  = ex.loggedSets.length + 1
  const isLast  = _runner.exIdx === _runner.exercises.length - 1
  const nextEx  = _runner.exercises[_runner.exIdx + 1]
  const lastSet = ex.loggedSets[ex.loggedSets.length - 1]

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
            <div style="font-size:22px;font-weight:800;color:var(--text);line-height:1.2;word-break:break-word">${ex.name||'Exercise name'}</div>
            ${(ex.targetReps||ex.targetWeight) ? `<div style="font-size:13px;font-weight:600;color:var(--text);margin-top:4px">${[ex.targetReps?ex.targetReps+' reps':null,ex.targetWeight?'@ '+ex.targetWeight+'kg':null].filter(Boolean).join(' · ')}</div>` : ''}
            ${nextEx ? `<div style="font-size:11px;color:var(--text-muted);margin-top:4px">Next: <span style="font-weight:600">${nextEx.name}</span></div>` : ''}
          </div>
          <button onclick="confirmEndRunner()" style="padding:7px 16px;border:none;border-radius:8px;background:#ef4444;font-size:13px;font-weight:700;cursor:pointer;color:#fff;flex-shrink:0">End</button>
        </div>
        ${_runner.exercises.length > 1 ? `<div style="display:flex;gap:3px;margin-top:10px">${_runner.exercises.map((e,i)=>`<div onclick="runnerJumpTo(${i})" title="${e.name||'Exercise '+(i+1)}" style="flex:1;height:8px;border-radius:4px;background:${i<_runner.exIdx?'rgba(99,102,241,0.45)':i===_runner.exIdx?'var(--accent)':'var(--border)'};cursor:pointer"></div>`).join('')}</div>` : ''}
        ${_runner.templateDesc ? `<div style="margin-top:8px;padding:6px 10px;background:var(--surface-2);border-radius:8px;font-size:11.5px;color:var(--text-muted);line-height:1.5">${_runner.templateDesc}</div>` : ''}
      </div>

      <!-- Scrollable area: logged sets + PT note + client notes -->
      <div style="flex:1;overflow-y:auto;padding:12px 16px">
        <!-- Logged sets -->
        ${!ex.loggedSets.length
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

      <!-- Last session strip — persistent reference -->
      ${ex.type !== 'cardio' ? `<div id="wr-last-session" style="border-top:1px solid var(--border);padding:6px 12px;background:var(--bg);min-height:28px"></div>` : ''}

      <!-- Set counter — above stats bar -->
      ${ex.targetSets ? `<div style="padding:6px 14px;border-top:1px solid var(--border);background:var(--bg);display:flex;align-items:center;gap:8px">
        <span style="font-size:13px;font-weight:700;color:var(--accent)">Set ${setNum} of ${ex.targetSets}</span>
        <div style="display:flex;gap:4px">${Array.from({length:ex.targetSets},(_,i)=>`<div style="width:20px;height:6px;border-radius:3px;background:${i<ex.loggedSets.length?'var(--accent)':i===ex.loggedSets.length?'rgba(99,102,241,0.4)':'var(--border)'}"></div>`).join('')}</div>
      </div>` : ''}


      <!-- Set input -->
      <div style="padding:10px 12px 12px;background:var(--surface)">
        ${_runner._restInterval ? `
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
          const cols = []
          if (tgt.timed) {
            const secs = tgt.duration ? (parseRest(tgt.duration)||0) : (tgt.repsMin ? parseInt(tgt.repsMin) : null)
            const durDisplay = secs != null ? (Math.floor(secs/60)+':'+String(secs%60).padStart(2,'0')) : null
            if (durDisplay) cols.push({ val: durDisplay, label: 'DURATION', accent: true })
          }
          const repsStr = !tgt.timed && tgt.repsMin ? (tgt.repsMin+(tgt.repsMax&&tgt.repsMax!==tgt.repsMin?'–'+tgt.repsMax:'')) : null
          if (repsStr) cols.push({ val: repsStr, label: 'REPS', accent: true })
          if (tgt.weight) cols.push({ val: tgt.weight+' kg', label: 'TARGET', accent: true })
          if (tgt.intensityMin) {
            if (ex.oneRM) {
              const kgLo = _calcWeightFromPct(ex.oneRM, tgt.intensityMin)
              const kgHi = tgt.intensityMax && tgt.intensityMax !== tgt.intensityMin ? _calcWeightFromPct(ex.oneRM, tgt.intensityMax) : null
              cols.push({ val: kgLo + (kgHi ? '–'+kgHi : '') + ' kg', label: '1RM TARGET', accent: true })
            } else {
              cols.push({ val: tgt.intensityMin+(tgt.intensityMax&&tgt.intensityMax!==tgt.intensityMin?'–'+tgt.intensityMax:'')+'%', label: '1RM' })
            }
          }
          if (tgt.effortMin) cols.push({ val: (tgt.effortType==='rir'?'RIR ':'RPE ')+tgt.effortMin+(tgt.effortMax&&tgt.effortMax!==tgt.effortMin?'–'+tgt.effortMax:''), label: tgt.effortType==='rir'?'RIR':'RPE' })
          if (tgt.restMin && tgt.restMin !== '0:00') cols.push({ val: tgt.restMin+(tgt.restMax&&tgt.restMax!==tgt.restMin?'–'+tgt.restMax:''), label: 'REST' })
          if (tgt.tempo) cols.push({ val: tgt.tempo, label: 'TEMPO' })
          const targetBar = cols.length ? `<div style="display:flex;border-top:1px solid var(--border);border-bottom:1px solid var(--border);margin-bottom:10px">${cols.map((c, i) =>
            `<div style="flex:1;text-align:center;padding:8px 4px${i < cols.length-1 ? ';border-right:1px solid var(--border)' : ''}">
              <div style="font-size:18px;font-weight:800;color:${c.accent ? 'var(--accent)' : 'var(--text)'};line-height:1.1">${c.val}</div>
              <div style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-top:2px">${c.label}</div>
            </div>`
          ).join('')}</div>` : ''
          const isDistance = /carry|broad jump|sled|sandbag.*lunge|step.*carry/i.test(ex.name)
          const distTarget = ex.notes?.match(/(\d+)[–\-](\d+)\s*m/)?.[0] || tgt.distance || ''
          const weightPlaceholder = tgt.weight || '—'
          const repsPlaceholder = repsStr ? repsStr.replace('–', '-') : '—'
          return `
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
          ${ex.loggedSets.length > 0 && ex.loggedSets.length >= ex.targetSets ? `<button onclick="addExtraStrengthSet()" style="width:100%;margin-top:6px;padding:7px;border:1px dashed var(--border);border-radius:8px;background:transparent;font-size:12px;font-weight:600;cursor:pointer;color:var(--text-muted)">+ Add extra set</button>` : ''}`
        })()}`}
      </div>
    </div>
  `
  if (ex.type !== 'cardio') setTimeout(() => fetchRunnerLastSession(ex.name), 0)
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
      setData = { distance: dist, paceAchieved: paceEl?.value?.trim() || null }
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
      setData = { duration: dur, distanceAchieved: distEl?.value?.trim() || null, paceAchieved: paceEl?.value?.trim() || null }
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
      // More exercises — rest then advance
      _runner._afterRest = () => { _runner.exIdx = nextExIdx; renderRunner() }
      renderRunner()
      startRestTimer(ex.restSecs || 90)
      return
    } else {
      // All done — go straight to finish
      showRunnerFinish()
      return
    }
  }
  renderRunner()
  const restSecs = ex.restSecs || 90
  if (ex.type === 'cardio') {
    const nextTgt = ex.sets_json?.[ex.loggedSets.length] || ex.sets_json?.[0] || {}
    if (!nextTgt.isDistanceBased) {
      _runner._afterRest = () => startIntervalTimer(parseRest(nextTgt.duration) || 300)
    }
  }
  startRestTimer(restSecs)
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
  // Prime speechSynthesis on first user gesture so iOS allows mid-timer calls.
  if (!window.speechSynthesis) return
  try { window.speechSynthesis.cancel() } catch(e) {}
}

function speakCue(text) {
  if (!window.speechSynthesis) return
  try {
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    utt.rate = 1.1
    utt.volume = 1
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
    if (_runner._setTimerRemaining <= 3) playBeep(880, 0.15, 0.75)
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
    <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:8px">${ex.name} — Set ${setNum}</div>
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
  document.body.appendChild(overlay)
}

function startCardioTimer() {
  _unlockAudio() // user gesture — unlock AudioContext for iOS
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
      renderRunner()
      const restSecs = ex.restSecs || 90
      const hitTarget = ex.targetSets > 0 && ex.loggedSets.length >= ex.targetSets
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
      return
    }
    if (_runner._intervalRemaining <= 5) playBeep(880, 0.15, 0.75)
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
    <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:8px">${ex.name} — Set ${setNum}</div>
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
  document.body.appendChild(overlay)
}

function startRestTimer(secs) {
  _runner._restInterval = clearTimer(_runner._restInterval)
  _runner.restRemaining = secs
  _runner.restTotal     = secs
  renderRestTimer()
  _runner._restInterval = setInterval(() => {
    _runner.restRemaining--
    if (_runner.restRemaining <= 0) {
      _runner._restInterval = clearTimer(_runner._restInterval)
      _runner.restRemaining = null
      playBeep(1046, 0.5, 0.95) // higher, longer beep on finish
      document.getElementById('rest-timer-overlay')?.remove()
      const cb = _runner._afterRest
      if (cb) { _runner._afterRest = null; cb() }
    } else {
      _unlockAudio()
      if (_runner.restRemaining === 10) speakCue('10 seconds')
      if (_runner.restRemaining <= 3) playBeep(880, 0.15, 0.75)
      const el = document.getElementById('rt-countdown')
      if (el) {
        const r = _runner.restRemaining
        el.textContent = r < 60 ? r+'s' : fmtRestCountdown(r)
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
  document.body.appendChild(overlay)
}


function editRunnerSet(exIdx, setIdx) {
  const s = _runner.exercises[exIdx].loggedSets[setIdx]
  if (!s) return
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
        <button onclick="saveEditRunnerSet(${exIdx},${setIdx})" style="flex:2;padding:13px;border:none;border-radius:10px;background:var(--accent);color:#fff;font-size:14px;font-weight:700;cursor:pointer">Save</button>
      </div>
    </div>`
  document.body.appendChild(overlay)
}

function saveEditRunnerSet(exIdx, setIdx) {
  const weight = document.getElementById('wr-edit-weight')?.value.trim()
  const reps   = document.getElementById('wr-edit-reps')?.value.trim()
  if (!reps) return
  _runner.exercises[exIdx].loggedSets[setIdx] = { ..._runner.exercises[exIdx].loggedSets[setIdx], weight, reps }
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
  skipRestTimer()
  if (_runner.exIdx > 0) {
    _runner.exIdx--
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
  _runner._timerInterval = clearTimer(_runner._timerInterval)
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

  const { data: clientRecord } = await dbq('saveRunnerSession:clientLookup', db.from('clients').select('coach_id').eq('id', clientId).single())
  const coachId = clientRecord?.coach_id || currentUser.id

  const { data: sessionLog, error } = await db.from('workout_logs').insert({
    coach_id: coachId, client_id: clientId, name, date, notes
  }).select().single()
  if (error) {
    log.error('saveRunnerSession', 'workout_logs insert failed', error)
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save workout' }
    return
  }

  let setsHadError = false
  for (let bi = 0; bi < exercises.length; bi++) {
    const ex = exercises[bi]
    const { data: logEx, error: exErr } = await db.from('workout_log_exercises').insert({
      log_id: sessionLog.id, exercise_name: ex.name, exercise_type: ex.type, order_index: bi,
      client_notes: ex.clientNotes || null
    }).select().single()
    if (exErr) { log.error('saveRunnerSession', `exercise ${bi+1} insert failed`, exErr); return }

    const sets = ex.loggedSets.map((s, si) => {
      const row = { workout_log_exercise_id: logEx.id, set_number: si+1 }
      if (ex.type === 'cardio') {
        if (s.duration) row.duration_seconds = parseDuration(s.duration)
        if (s.distance) row.distance_m = Math.round(parseFloat(s.distance)*1000)
      } else {
        if (s.reps) row.reps_achieved = parseInt(s.reps)
        if (s.weight && s.weight !== 'BW') row.weight_kg = parseFloat(s.weight)
        if (s.rpe) { row.effort_type = 'rpe'; row.effort_value = parseFloat(s.rpe) }
      }
      return row
    }).filter(s => Object.keys(s).length > 2)

    if (sets.length) {
      const { error: setsErr } = await db.from('workout_log_sets').insert(sets)
      if (setsErr) { log.error('saveRunnerSession', `sets insert failed for exercise ${bi+1}`, setsErr); setsHadError = true }
    }
  }
  if (setsHadError) {
    showToast('Session saved — but some set data failed to save. Check the session log.', 'warn', 6000)
    log.warn('saveRunnerSession', 'session saved with set errors', { name })
  } else {
    log.ok('saveRunnerSession', 'session saved', { name, exercises: exercises.length })
    showToast('Workout saved!', 'success', 2500)
  }

  discardRunner()
  if (currentProfile?.role === 'client') navigate('workouts')
  else openClient(clientId)
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
            <input id="ls-dur-${bi}-${si}" ${si_style} type="text" placeholder="0:00" value="${s.duration || '0:00'}" oninput="this.value=fmtRestInput(this.value)">
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
  const { data: clientRecord } = await dbq('saveWorkoutSession:clientLookup', db.from('clients').select('coach_id').eq('id', clientId).single())
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
    log.info('saveWorkoutSession', `saving exercise ${bi + 1}/${blocks.length}`, { sets: block.sets.length })
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
        set_number: si + 1
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
    }).filter(s => Object.keys(s).length > 2)

    if (setsToInsert.length) {
      const { error: setsErr } = await db.from('workout_log_sets').insert(setsToInsert)
      if (setsErr) { log.error('saveWorkoutSession', `sets insert failed for exercise ${bi + 1}`, setsErr); errorEl.textContent = setsErr.message; return }
      log.ok('saveWorkoutSession', `sets saved for exercise ${bi + 1}`, { count: setsToInsert.length })
    }
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
        <h2 style="font-size:20px;font-weight:700;margin-bottom:4px">${session.name}</h2>
        <p style="color:var(--text-muted)">${dateStr}</p>
      </div>
      <button class="btn-danger" style="font-size:13px;padding:6px 12px" onclick="deleteWorkoutLog('${logId}','${clientId}')">Delete</button>
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
                <span style="font-weight:600;font-size:15px">${ex.exercise_name}</span>
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
        <textarea id="wl-coach-notes" class="field-input" rows="3" placeholder="Add coaching feedback, cues, or observations…" style="resize:vertical">${session.notes||''}</textarea>
        <button onclick="saveCoachNotes('${logId}')" class="btn-primary" style="margin-top:8px;font-size:13px;padding:7px 16px">Save notes</button>
        <span id="wl-notes-saved" style="display:none;margin-left:10px;font-size:12px;color:#10b981;font-weight:600">Saved ✓</span>
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
  const notes = document.getElementById('wl-coach-notes')?.value.trim() || null
  const { error } = await db.from('workout_logs').update({ notes }).eq('id', logId)
  if (error) { log.error('saveCoachNotes', 'update failed', error); return }
  const saved = document.getElementById('wl-notes-saved')
  if (saved) { saved.style.display = 'inline'; setTimeout(() => saved.style.display = 'none', 2000) }
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
      <div class="empty-state">
        <div class="empty-icon">🏋️</div>
        <div class="empty-title">No 1RMs recorded yet</div>
        <div class="empty-text">Add a 1RM to unlock automatic weight targets in the workout runner.</div>
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
      <div class="field">
        <label class="field-label">1RM (kg)</label>
        <input class="field-input" id="1rm-weight" type="number" step="0.5" inputmode="decimal" placeholder="e.g. 120">
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
  const exercise = document.getElementById('1rm-exercise')?.value.trim()
  const weight   = parseFloat(document.getElementById('1rm-weight')?.value)
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
