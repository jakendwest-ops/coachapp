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
  if (currentUser?.email !== 'jakendwest@gmail.com') return
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
