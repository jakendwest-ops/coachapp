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
  // Runner drafts hold PII (client name, exercise names, weights/reps) and are only cleared on
  // explicit discard/save or a same-day staleness check the next time that exact client's runner
  // is opened -- on a shared/gym device, signing out one account and into another otherwise
  // leaves a prior client's in-progress workout sitting in localStorage indefinitely, readable
  // via devtools. Found by multi-agent review 2026-07-10.
  Object.keys(localStorage).filter(k => k.startsWith('_runnerDraft_')).forEach(k => localStorage.removeItem(k))
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
