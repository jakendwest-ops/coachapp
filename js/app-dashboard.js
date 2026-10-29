// ─── Fetch-failure visibility ─────────────────────────────────────────────────────────────────────
// Until 2026-08-12 not ONE of this file's 19 `db.from()` calls destructured `error`. Every dashboard
// fetches 6-8 things at once via Promise.all, and a failed fetch rendered as an EMPTY section — so
// "no upcoming sessions" and "couldn't load your sessions" were indistinguishable, on the first screen
// of every login, on a phone in a gym with patchy signal.
//
// Silence is the worst possible answer here specifically because the user's correct reaction to the two
// cases is OPPOSITE: an empty account should be ignored, a failed fetch should be retried. Showing
// nothing tells them to ignore it, every time.
//
// Found by the 2026-08-12 full-codebase architecture audit.
function _failedFetches (map) {
  return Object.entries(map).filter(([, err]) => err).map(([label]) => label)
}

// `page` is the router's own page id, so Retry re-enters through navigate() rather than
// re-implementing role selection here — the master account's view-switching already makes "which
// dashboard am I" a question with a non-obvious answer, and duplicating it is how it drifts.
function _fetchFailureBanner (failed, page) {
  if (!failed.length) return ''
  log.error('dashboard', 'fetch(es) failed', { page, failed })
  return `
    <div style="background:rgba(239,68,68,.1);border:1px solid #ef4444;border-radius:var(--radius, 10px);padding:10px 14px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
      <span style="font-size:var(--text-base, 13px);color:var(--text)">Couldn't load: ${escapeHtml(failed.join(', '))}. What you see below may be incomplete.</span>
      <button onclick="navigate('${page}','replace')" style="background:none;border:1px solid #ef4444;color:var(--danger-text);padding:5px 14px;border-radius:var(--radius-sm, 8px);font-size:var(--text-base, 13px);font-weight:600;cursor:pointer">Retry</button>
    </div>`
}

// ─── Shared dashboard helpers ───────────────────────────────────────────────────────────────────────────────────────────────
// Dates, the calendar timeline and goal progress, used by all three dashboards.

function _dashFormatDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

function _dashDaysUntil(dateStr, todayStr) {
  const d = Math.round((new Date(dateStr + 'T00:00:00') - new Date(todayStr + 'T00:00:00')) / 86400000)
  if (d === 0) return 'Today'
  if (d === 1) return 'Tomorrow'
  if (d < 0) return `${Math.abs(d)} day${Math.abs(d) === 1 ? '' : 's'} ago`
  return `In ${d} days`
}

// Uses the shared EVENT_COLOURS (app-clients.js) rather than the private copy this file used to
// carry. That copy had drifted to a different blue for `gym` and held a raw hex with a TODO — two
// definitions of one fact, and the hex was costing style-literal budget.
function _dashEventColour(type) {
  return (typeof EVENT_COLOURS !== 'undefined' && EVENT_COLOURS[type]?.dot) || 'var(--text-muted)'
}

// A planned session's name for display. A periodised week's copy of "Upper Body" is stored as "Upper Body — W2"; the Workouts card and the
// calendar already hide the suffix, and the dashboard now does too, so the three name the same workout (found by review, 2026-10-04: the Today
// card read "Upper Body — W2" while Up next read "Upper Body").
function _dashSessionName(pw) {
  return (pw.workout_templates?.name || 'Session').replace(/ — W\d+/, '')
}

// Merge calendar events and programmed sessions into ONE date-ordered timeline. No function in the
// app did this: renderCalendar keeps the two in separate maps and merges them only visually inside a
// grid cell, which is why showClientDayDetail still says "Rest day" on a date that has an event.
function _soloUpcoming(events, progByDate, todayStr) {
  const out = []
  ;(events || []).forEach(ev => out.push({
    date: ev.date, kind: 'event', title: ev.title || 'Event', colour: _dashEventColour(ev.type)
  }))
  Object.keys(progByDate || {}).forEach(ds => {
    if (ds < todayStr) return
    ;(progByDate[ds] || []).forEach(pw => out.push({
      date: ds, kind: 'session', title: _dashSessionName(pw),
      colour: 'var(--accent)', templateId: pw._clientTemplateId || null
    }))
  })
  // localeCompare on YYYY-MM-DD is a correct chronological sort and needs no Date parsing.
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

// Percent-complete for a goal. Lifted out of the old Goals card's inline IIFE so the tile and any
// future surface share ONE definition — the card and this tile disagreeing about progress would be
// two fields carrying one fact.
//
// Three strategies in priority order, unchanged from the card: a start→target range, then a bare
// current/target ratio, then completed milestones. Note `sv !== tv` and `tv !== 0` are guards against
// dividing by zero, not style — a goal whose start equals its target would otherwise render NaN%.
function _goalPct(goal) {
  const milestones = (goal.goal_milestones || [])
  const sv = parseFloat(goal.start_value), cv = parseFloat(goal.current_value), tv = parseFloat(goal.target_value)
  if (!isNaN(sv) && !isNaN(cv) && !isNaN(tv) && sv !== tv) return Math.min(100, Math.max(0, Math.round(((cv - sv) / (tv - sv)) * 100)))
  if (!isNaN(cv) && !isNaN(tv) && tv !== 0) return Math.min(100, Math.max(0, Math.round((cv / tv) * 100)))
  return milestones.length ? Math.round((milestones.filter(m => m.completed_at).length / milestones.length) * 100) : 0
}

// ─── Dashboard model: the pure logic behind the week strip, the streak and the program tile (2026-10-03) ─────────────────
// Jake, 2026-10-03: "The whole dashboard needs a rework for mobile view, as nothing really flows or stands out as a dashboard or
// makes it feel like this is landing page and hub of your account." One landing page for all three roles: a Today card, the week
// as a strip, a streak and a program tile, then body weight, calendar and goals. Everything in this section is a plain function of
// data - no DOM, no database - so tests-node/dashboard-model.test.mjs can pin the rules. The markup builders are further down.

// Monday of the week containing `ymd` (a local YYYY-MM-DD), as YYYY-MM-DD; null for anything unparseable.
function _dashMonday(ymd) {
  const d = _mondayOfWeek(ymd)   // app-core: a local-midnight Date, or null
  return d ? _ymdLocal(d) : null
}

function _dashAddDays(ymd, n) {
  const d = new Date(ymd + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return _ymdLocal(d)
}

// Planned days BEFORE the assignment's start date are not planned sessions (a plan that starts on a Wednesday cannot ask for its Monday). Filtered once, where the
// plan is loaded, so the week strip, its "x of y" counts, the hero and Up next agree with the streak; unfiltered, a Wednesday start showed its own Monday as a red
// miss (found by the 2026-10-12 review). YYYY-MM-DD strings compare as dates; no start date leaves the map as it is.
function _dashPlannedFrom(progByDate, startDate) {
  const from = startDate ? String(startDate).slice(0, 10) : null
  if (!from) return progByDate || {}
  const out = {}
  for (const ds of Object.keys(progByDate || {})) if (ds >= from) out[ds] = progByDate[ds]
  return out
}

// The streak tile's two readings (reworked 2026-10-13). Jake: "'strek' needs a rework, as this is not really recording anything meaningful or accurate" - a tile that
// said "62 sessions in a row" counted every session and so measured nothing he could act on. Scoped with him:
//   - WHILE A PLAN GOVERNS THIS WEEK the tile is plan adherence: "9 of 10 planned sessions done so far", a bar, "Week 3 of 8 · this week 2 of 4". It starts at 0 and
//     restarts with each new plan.
//   - WITH NO PLAN it is a weekly target the person sets (default 3, 1 to 14): "4 weeks in a row at 3 a week · this week 1 of 3".
// Counting is by WEEK (Monday to Sunday), not by day: a planned session counts as done when a session is logged in the same week, up to the number planned that
// week. Extras add nothing, so the figure can never pass 100%. "Out of" is the sessions DUE so far - every planned session on or before today - so Wednesday's
// Friday session is not a miss and not in the denominator yet.
// Both readings are plain functions of data (no DOM, no database); tests-node/dashboard-model.test.mjs pins them.

const _DASH_TARGET_DEFAULT = 3, _DASH_TARGET_MIN = 1, _DASH_TARGET_MAX = 14

// A weekly target as stored (profiles.weekly_session_target: null until the person sets one, and absent altogether until the column exists) as the number the tile uses.
// Anything that is not a whole number from 1 to 14 is the default - the tile must never divide by zero or print "NaN a week".
function _dashWeeklyTarget(v) {
  const n = typeof v === 'boolean' ? NaN : Number(v)    // Number(true) is 1: a flag is not a target
  return Number.isInteger(n) && n >= _DASH_TARGET_MIN && n <= _DASH_TARGET_MAX ? n : _DASH_TARGET_DEFAULT
}

// Sessions logged per Monday-to-Sunday week: { 'YYYY-MM-DD' (the Monday): count }. `fromYmd` drops earlier dates (a plan cannot be done before it begins).
function _dashLoggedByWeek(logDates, fromYmd = null) {
  const out = {}
  for (const raw of logDates || []) {
    const ds = String(raw).slice(0, 10)   // a date, whether it arrives as 'YYYY-MM-DD' or with a time on it
    if (fromYmd && ds < fromYmd) continue
    const wk = _dashMonday(ds)
    if (wk) out[wk] = (out[wk] || 0) + 1
  }
  return out
}

// Whole weeks from one Monday to a later one (rounded: a daylight-saving change makes a local-midnight week 167 or 169 hours).
const _dashWeeksBetween = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 604800000)

// How many weeks back the streak looks. Also how much history the dashboard reads: a year of sessions is a couple of hundred rows.
const _DASH_STREAK_WEEKS = 52

// Plan adherence, or null when no plan governs THIS week (none assigned, it has not started, it has ended, or it has no sessions in it - nothing to be done).
//   progByDate  _programWorkoutsByDate's map ({ 'YYYY-MM-DD': [session, ...] }); planStart  the assignment's start_date; totalWeeks  the program's length.
// A plan runs from the Monday of its start week to the Monday of its last week (the later of totalWeeks and the last week with a session in it).
// Only sessions dated on or after planStart are planned, and only logs dated on or after it can be done: the plan had not begun.
// The sum starts no earlier than the lookback (a year): the dashboard does not read older sessions, and a "due" that reached further back than "done" could would read low.
// Returns { mode: 'plan', done, due, pct, week, totalWeeks, weekDone, weekPlanned }: done and due are the whole-plan figures so far; week/totalWeeks place this week
// in the plan; weekDone/weekPlanned are THIS week's (weekDone capped at weekPlanned, weekPlanned 0 for a planned rest week).
function _dashPlanAdherence(progByDate, logDates, todayStr, planStart, totalWeeks = 0) {
  const from = planStart ? String(planStart).slice(0, 10) : null
  const thisWeek = _dashMonday(todayStr), startWk = from ? _dashMonday(from) : null
  if (!thisWeek || !startWk) return null
  const planned = {}, due = {}
  let lastWk = null
  for (const ds of Object.keys(progByDate || {})) {
    if (ds < from) continue
    const n = (progByDate[ds] || []).length, wk = n ? _dashMonday(ds) : null
    if (!wk) continue
    planned[wk] = (planned[wk] || 0) + n
    if (ds <= todayStr) due[wk] = (due[wk] || 0) + n
    if (lastWk === null || wk > lastWk) lastWk = wk
  }
  if (lastWk === null) return null
  const byLength = Number(totalWeeks) > 0 ? _dashAddDays(startWk, 7 * (Number(totalWeeks) - 1)) : null
  const endWk = byLength && byLength > lastWk ? byLength : lastWk
  if (thisWeek < startWk || thisWeek > endWk) return null
  const logged = _dashLoggedByWeek(logDates, from)
  const floor = _dashAddDays(thisWeek, -7 * _DASH_STREAK_WEEKS)
  let done = 0, dueTotal = 0
  for (let wk = startWk > floor ? startWk : floor; wk <= thisWeek; wk = _dashAddDays(wk, 7)) {
    const d = due[wk] || 0
    dueTotal += d
    done += Math.min(logged[wk] || 0, d)
  }
  const weekPlanned = planned[thisWeek] || 0
  return {
    mode: 'plan', done, due: dueTotal, pct: dueTotal ? Math.round(done / dueTotal * 100) : 0,
    week: _dashWeeksBetween(startWk, thisWeek) + 1, totalWeeks: _dashWeeksBetween(startWk, endWk) + 1,
    weekDone: Math.min(logged[thisWeek] || 0, weekPlanned), weekPlanned,
  }
}

// The weekly-target streak: how many weeks in a row had at least `target` sessions. THIS week counts once it has them and never breaks the run before it does (a
// Wednesday is not a missed week); a finished week with fewer sessions ends the run, and nothing before it counts.
// Returns { mode: 'target', weeks, capped, target, weekDone }: capped means it never broke inside the lookback, so the true figure may be higher ("N+");
// weekDone is this week's sessions so far, capped at the target.
function _dashTargetStreak(logDates, todayStr, target, maxWeeks = _DASH_STREAK_WEEKS) {
  const t = _dashWeeklyTarget(target), thisWeek = _dashMonday(todayStr)
  if (!thisWeek) return { mode: 'target', weeks: 0, capped: false, target: t, weekDone: 0 }
  const logged = _dashLoggedByWeek(logDates), now = logged[thisWeek] || 0
  let weeks = now >= t ? 1 : 0, broken = false
  for (let i = 1; i <= maxWeeks; i++) {
    if ((logged[_dashAddDays(thisWeek, -7 * i)] || 0) < t) { broken = true; break }
    weeks++
  }
  return { mode: 'target', weeks, capped: !broken, target: t, weekDone: Math.min(now, t) }
}

// What the tile shows: plan adherence while a plan governs this week, otherwise the weekly-target streak.
function _dashStreakModel(progByDate, logDates, todayStr, { planStart = null, totalWeeks = 0, target = null, maxWeeks = _DASH_STREAK_WEEKS } = {}) {
  return _dashPlanAdherence(progByDate, logDates, todayStr, planStart, totalWeeks) || _dashTargetStreak(logDates, todayStr, target, maxWeeks)
}

const _DASH_DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// The seven days of the week containing todayStr, Monday first. `logs` are logged sessions ({ date, ... }); progByDate as above.
//   kind  done   something was logged that day
//         plan   today, a session is planned and nothing is logged yet
//         later  a planned session still to come
//         miss   a planned session on a day that has gone, with nothing logged
//         rest   nothing planned, nothing logged
function _dashWeekDays(todayStr, progByDate, logs) {
  const monday = _dashMonday(todayStr)
  const byDate = {}
  for (const l of logs || []) (byDate[l.date] ||= []).push(l)
  return _DASH_DAY_LABELS.map((label, i) => {
    const ds = _dashAddDays(monday, i)
    const planned = (progByDate || {})[ds] || [], done = byDate[ds] || []
    const today = ds === todayStr
    const kind = done.length ? 'done' : planned.length ? (today ? 'plan' : ds < todayStr ? 'miss' : 'later') : 'rest'
    return { ds, label, num: +ds.slice(8), today, kind, planned, done }
  })
}

// "2 of 3 sessions done". planned never reads lower than done: "4 of 3" would look like a mistake, and extra sessions are fine.
function _dashWeekCounts(days) {
  const done = days.reduce((n, d) => n + d.done.length, 0)
  const planned = days.reduce((n, d) => n + d.planned.length, 0)
  return { done, planned: Math.max(planned, done) }
}

// Whole program weeks since the program began, counted the way the CALENDAR places sessions: _programWorkoutsByDate anchors week 1 to the
// MONDAY of the start date's week, so a week runs Monday to Sunday. Until 2026-10-04 the tile and the Workouts card counted seven-day blocks
// from the start date instead; the two agree when a program starts on a Monday and disagreed for a few days of every week when it started
// mid-week (start Thursday, and on the Tuesday after the tile still said week 1 while the calendar - and so the Today card - was in week 2).
// 0 for no start date, an unreadable one, or a start in the future.
function _programWeeksElapsed(startDate, todayStr) {
  const a = startDate ? _mondayOfWeek(startDate) : null, b = _mondayOfWeek(todayStr)
  if (!a || !b) return 0
  return Math.max(0, Math.round(Math.round((b - a) / 86400000) / 7))
}

// The phase a program that began on `startDate` is in on `todayStr`: each phase's weeks added up in order, counted by _programWeeksElapsed. Before
// the start that is the first phase and after the end the last - what the dashboard tile has always said. The program page asks THIS function
// too (2026-10-04) for a plan that is running, so the two cannot disagree; it declines to name a phase before the start or after the end,
// where the tile has to say something. null when there are no phases.
function _programPhaseAt(phases, startDate, todayStr) {
  const ordered = [...(phases || [])].sort((a, b) => a.order_index - b.order_index)
  const since = _programWeeksElapsed(startDate, todayStr)
  let cum = 0, current = ordered[ordered.length - 1] || null
  for (const p of ordered) { cum += p.duration_weeks || 0; if (since < cum) { current = p; break } }
  return current
}

// The session to do next, for the Workouts page's Up next card: a session planned TODAY that is not logged yet, otherwise the first planned
// session after today. The dashboard's own reading of a day (it is done once anything is logged on it), so this card and the Today card
// name the same workout. Earlier sessions never count - the week strip shows an unlogged one as missed. Returns { ds, sessions } (the whole
// day, in session order), or null when nothing is left. logs are logged sessions ({ date }); progByDate is _programWorkoutsByDate's map.
function _dashNextSession(progByDate, logs, todayStr) {
  const map = progByDate || {}
  const today = map[todayStr] || []
  if (today.length && !(logs || []).some(l => l.date === todayStr)) return { ds: todayStr, sessions: today }
  const later = Object.keys(map).filter(ds => ds > todayStr && (map[ds] || []).length).sort()[0]
  return later ? { ds: later, sessions: map[later] } : null
}

// The program tile: which week of the whole program, which phase it is in, how far through. null without a program.
// start_date is nullable (the assign form does not require it): unset means "just started" - week 1 - not NaN, which used to fall
// through to the LAST phase (see _buildWorkoutsHero). Weeks are Monday to Sunday, as on the calendar (_programWeeksElapsed).
function _dashProgramInfo(cp0, todayStr) {
  if (!cp0?.programs) return null
  const prog = cp0.programs
  const phases = [...(prog.program_phases || [])].sort((a, b) => a.order_index - b.order_index)
  const total = phases.reduce((n, p) => n + (p.duration_weeks || 0), 0)
  const sinceStart = _programWeeksElapsed(cp0.start_date, todayStr)
  const current = _programPhaseAt(phases, cp0.start_date, todayStr)
  const week = total ? Math.min(sinceStart + 1, total) : sinceStart + 1
  return { name: prog.name || 'Your training plan', phase: current ? current.name : '', week, totalWeeks: total, pct: total ? Math.round(week / total * 100) : 0 }
}

// The last day of a program that has run `weeks` weeks from `startYmd`, counted the way the calendar places its sessions: week 1 is the
// Monday-to-Sunday week the start date falls in, so the program ends on the SUNDAY of its last week - not `weeks` x 7 days from the start
// date itself. The coach's "Programs ending" tile used the second reading, so for a Thursday start it named a date 3 days after the client's
// calendar went empty (found by review, 2026-10-04). null when the start date or the length is unusable.
function _dashProgramEnd(startYmd, weeks) {
  const monday = startYmd ? _dashMonday(startYmd) : null
  return monday && Number(weeks) > 0 ? _dashAddDays(monday, Number(weeks) * 7 - 1) : null
}

// ─── Dashboard views: markup builders (pure strings) ───────────────────────────────────────────────────────────────────────
// Solo, client and coach share the skeleton - greeting, a Today card, the week, two number tiles, then cards - so the builders
// below are shared. Every piece of user text goes through escapeHtml; ids inside inline handlers through escapeAttr.
// The styles are the .dash-* classes in css/main.css (tokens only).

const _DASH_ICONS = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>',
  flame: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2c.6 3-1.8 4.6-1.8 7 0 1.3.9 2.2 1.9 2.2 1.1 0 2-.9 2-2.2 0-.7-.3-1.4-.7-2 2.6 1.4 4.6 4.1 4.6 7.4A7 7 0 0 1 5 16.4c0-2.8 1.6-4.6 3-6C9.4 9 10 8 10 6.4 10 4.4 11 3 12 2z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  build: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11"/></svg>',
}

const _dashPlural = (n, one, many) => `${n} ${n === 1 ? one : many}`
// Buttons. The handler is spelled out in each builder and never passed in as a string: scripts/check-handler-targets.mjs can only verify
// an inline handler whose NAME is in the source, so a computed one would silently stop working the day its target was renamed.
const _dashBack = () => '<button type="button" class="dash-btn dash-btn-ghost" onclick="_dashPickDay(null)">Back to today</button>'
const _dashToProgram = (cls, label) => `<button type="button" class="dash-btn ${cls} dash-nav" onclick="navigate('workouts')">${label}</button>`
const _dashStart = (cid, tid) => `<button type="button" class="dash-btn dash-btn-primary" onclick="startWorkoutRunner('${cid}','${tid}')">▶ Start workout</button>`
const _dashLogWorkout = cid => `<button type="button" class="dash-btn dash-btn-primary" onclick="startWorkoutRunner('${cid}')">Log a workout</button>`
const _dashViewSession = (id, cid) => `<button type="button" class="dash-btn dash-btn-primary" onclick="openWorkoutLog('${id}','${cid}')">View session</button>`
const _dashSeeClients = () => '<button type="button" class="dash-btn dash-btn-primary" onclick="navigate(\'clients\')">See clients</button>'
const _dashAddClient = () => '<button type="button" class="dash-btn dash-btn-primary" onclick="showAddClientModal()">+ Add client</button>'
const _dashAttention = n => `<button type="button" class="dash-btn dash-btn-ghost" onclick="document.getElementById('dash-attn')?.scrollIntoView({behavior:'smooth'})">${n} need attention</button>`

// Where the weight and goals cards go - functions, for the same reason. Goals live on the Goals page for a solo user and on
// Progress > Goals for a coached client (the client has no goals route).
function _dashOpenWeight() { window._progressTab = 'Body Weight'; navigate('progress') }
function _dashOpenGoals(isClient) { if (isClient) window._progressTab = 'Goals'; navigate(isClient ? 'progress' : 'goals') }
// "Squat + Threshold": the sessions planned on a day.
const _dashPlanNames = day => day.planned.map(_dashSessionName).join(' + ')

// The Today card for one day of the week - today, or the day the person tapped on the strip. It is the only saturated block on
// the page, so it is what the eye lands on; on a rest day, a finished day or any other day it goes calm.
// ctx: { role, clientId, todayStr, days, hasProgram, program, next }  where next is { date, title } for the next planned
// session after today, or null. No durations or exercise counts for a planned session: the app does not store them.
function _dashHeroHtml(day, ctx) {
  const cid = escapeAttr(ctx.clientId)
  const when = _dashFormatDate(day.ds)
  const back = day.today ? '' : _dashBack()
  let calm = true, eyebrow, title, meta, actions = ''

  if (day.kind === 'done') {
    const first = day.done[0], n = first.workout_log_exercises?.length || 0, more = day.done.length - 1
    eyebrow = `${day.today ? 'Today' : when} · Done`
    title = escapeHtml(first.name)
    meta = `${_dashPlural(n, 'exercise', 'exercises')} logged${more ? ` · +${_dashPlural(more, 'more session', 'more sessions')}` : ''}`
    actions = _dashViewSession(escapeAttr(first.id), cid) + back
  } else if (day.kind === 'plan') {
    calm = false
    eyebrow = (ctx.role === 'client' ? 'Up next' : 'Today') + (ctx.program ? ' · ' + escapeHtml(ctx.program.name) : '')
    title = escapeHtml(_dashPlanNames(day))
    const before = ctx.days.filter(d => d.ds < day.ds).reduce((n, d) => n + d.planned.length, 0)
    const total = ctx.days.reduce((n, d) => n + d.planned.length, 0)
    meta = day.planned.length > 1 ? `${day.planned.length} sessions today` : `Session ${before + 1} of ${total} this week`
    // Start needs the CLIENT'S CLONE template id (client_program_workouts.workout_template_id), never the master phase-slot id -
    // every other caller resolves it the same way. Without one, Workouts is where this session can be started.
    const tid = day.planned[0]._clientTemplateId
    actions = (tid ? _dashStart(cid, escapeAttr(tid)) : _dashToProgram('dash-btn-primary', 'Open Workouts')) + _dashToProgram('dash-btn-ghost', 'View training plan')
  } else if (day.kind === 'miss') {
    eyebrow = `${when} · Missed`
    title = escapeHtml(_dashPlanNames(day))
    meta = 'Planned, not logged.'
    actions = back
  } else if (day.kind === 'later') {
    eyebrow = when
    title = escapeHtml(_dashPlanNames(day))
    meta = _dashDaysUntil(day.ds, ctx.todayStr)
    actions = _dashToProgram('dash-btn-primary', 'View training plan') + back
  } else {   // rest: nothing planned, nothing logged. The wording differs so the same phrase is never said twice.
    eyebrow = day.today ? 'Today' : when
    if (day.today) {
      title = ctx.hasProgram ? 'Rest day' : 'Nothing planned'
      meta = ctx.next ? `Next up: ${escapeHtml(ctx.next.title)}, ${_dashFormatDate(ctx.next.date)}` : 'Start a freeform session whenever you like.'
      actions = _dashLogWorkout(cid) + (ctx.next ? _dashToProgram('dash-btn-ghost', 'View training plan') : '')
    } else if (day.ds < ctx.todayStr) {
      title = ctx.hasProgram ? 'Rest day' : 'No session'
      meta = ctx.hasProgram ? 'Nothing was planned.' : 'Nothing logged.'
      actions = back
    } else {
      title = ctx.hasProgram ? 'Rest day' : 'Nothing planned'
      meta = ctx.hasProgram ? 'Recovery is part of the plan.' : 'Nothing planned yet.'
      actions = back
    }
  }
  return `<section class="dash-hero${calm ? ' dash-hero-calm' : ''}" id="dash-hero" data-kind="${day.kind}">` +
    `<div class="dash-hero-eyebrow">${eyebrow}</div><div class="dash-hero-title">${title}</div><div class="dash-hero-meta">${meta}</div>` +
    `<div class="dash-hero-actions">${actions}</div></section>`
}

// The week as seven tappable days. `sel` is the date the person tapped (null = today); the pressed day is the one the Today card is
// showing, so the strip and the card never disagree.
function _dashWeekHtml(days, counts, sel) {
  const words = { done: 'done', plan: 'planned for today', later: 'planned', miss: 'missed', rest: 'rest day' }
  const glyph = { done: _DASH_ICONS.check, plan: '▶', later: '', miss: '×', rest: '–' }
  const shown = sel || days.find(d => d.today)?.ds
  const sub = counts.planned ? `<b>${counts.done} of ${counts.planned}</b> ${counts.planned === 1 ? 'session' : 'sessions'} done` : 'Nothing planned this week'
  return `<section class="dash-card" id="dash-week"><div class="dash-card-head"><h2 class="dash-card-title">This week</h2><span class="dash-card-sub">${sub}</span></div>` +
    `<div class="dash-days" role="group" aria-label="This week">${days.map(d =>
      `<button type="button" class="dash-day${d.today ? ' dash-day-today' : ''}" data-day="${d.ds}" aria-pressed="${d.ds === shown}" aria-label="${d.label} ${d.num}: ${words[d.kind]}" onclick="_dashPickDay('${d.ds}')">` +
      `<span class="dash-dn">${d.label}</span><span class="dash-dc dash-dc-${d.kind}">${glyph[d.kind]}</span><span class="dash-dd">${d.num}</span></button>`).join('')}</div>` +
    '<div class="dash-legend">Green done · purple planned · red missed · grey rest. Tap a day to see it.</div></section>'
}

// The streak tile (reworked 2026-10-13; the model is _dashStreakModel). While a plan governs this week it reads as plan adherence - "9 of 10 planned so far", a bar,
// the week of the plan and this week's count; with no plan it is the weekly target - "4 weeks in a row", "at 3 a week · this week 1 of 3" - and a tap opens Settings,
// where the target is set. Every figure is a number the model made, so nothing here needs escaping.
// `link` false (the owner's "View as" page) draws the target tile without the tap: Settings there would be the OWNER's own, not the client's.
function _dashStreakTileHtml(m, link = true) {
  const flame = `<span class="dash-flame">${_DASH_ICONS.flame}</span>`
  if (m.mode === 'plan') {
    const big = m.due ? `${m.done} <small>of ${m.due} planned so far</small>` : '0 <small>sessions due yet</small>'
    const week = m.weekPlanned ? `this week ${m.weekDone} of ${m.weekPlanned}` : 'a rest week'
    return `<section class="dash-card" id="dash-streak" data-mode="plan"><div class="dash-ico">${flame}Sessions done</div>` +
      `<div class="dash-big">${big}</div><div class="dash-sub">Week ${m.week} of ${m.totalWeeks} · ${week}</div>` +
      `<div class="dash-meter"><i style="width:${m.pct}%"></i></div></section>`
  }
  const w = m.weeks
  return `<section class="dash-card${link ? ' dash-tap' : ''}" id="dash-streak" data-mode="target"${link ? ` onclick="navigate('settings')"` : ''}><div class="dash-ico">${flame}Streak</div>` +
    `<div class="dash-big">${w}${m.capped && w ? '+' : ''} <small>${w === 1 && !m.capped ? 'week' : 'weeks'} in a row</small></div>` +
    `<div class="dash-sub">${w ? 'at' : 'Aim for'} ${m.target} a week · this week ${m.weekDone} of ${m.target}</div>` +
    `<div class="dash-meter"><i style="width:${Math.round(m.weekDone / m.target * 100)}%"></i></div></section>`
}

// Streak and program: two quiet number tiles.
function _dashTilesHtml(streak, program, isSolo, streakLink = true) {
  const streakTile = _dashStreakTileHtml(streak, streakLink)
  const programTile = program
    ? `<section class="dash-card dash-tap" id="dash-program" onclick="navigate('workouts')"><div class="dash-ico">Training plan</div>` +
      `<div class="dash-big">Wk ${program.week}${program.totalWeeks ? ` <small>of ${program.totalWeeks}</small>` : ''}</div>` +
      `<div class="dash-sub">${escapeHtml(program.phase ? program.phase + ' · ' : '')}${escapeHtml(program.name)}</div>` +
      `<div class="dash-meter"><i style="width:${program.pct}%"></i></div></section>`
    : `<section class="dash-card dash-tap" id="dash-program" onclick="navigate('${isSolo ? 'programs' : 'workouts'}')"><div class="dash-ico">Training plan</div>` +
      `<div class="dash-big">None</div><div class="dash-sub">${isSolo ? 'Build one in Training plans' : 'Ask your PT to assign one'}</div></section>`
  return `<div class="dash-two">${streakTile}${programTile}</div>`
}

// Body weight: the latest figure, how it moved since the weigh-in before, and the trend. Keeps the canvas id the sparkline is drawn into.
function _dashWeightHtml(weights) {
  const latest = weights?.[0] ?? null, prev = weights?.[1] ?? null
  if (!latest) {
    return `<section class="dash-card dash-tap" id="dash-weight" onclick="_dashOpenWeight()"><div class="dash-card-head"><h2 class="dash-card-title">Body weight</h2></div>` +
      '<p class="dash-empty">No weigh-ins yet. Tap to log one.</p></section>'
  }
  // ABSOLUTE change in the user's preferred unit, as the Weight page showed it. No value judgement on direction: the app does not
  // know whether this person is cutting or bulking. The diff is taken in KG and handed to fmtWeight, which owns unit conversion;
  // decimals:1 is load-bearing (82.8 - 82.4 printed as "0.3999999999999915 kg" without it).
  let delta = '<b>First entry</b>'
  if (prev) {
    const diffKg = latest.weight_kg - prev.weight_kg, flat = Math.abs(diffKg) < 0.05
    delta = `<b>${flat ? '→ no change' : (diffKg < 0 ? '↓ ' : '↑ ') + fmtWeight(Math.abs(diffKg), { spaced: true, decimals: 1 })}</b> since ${_dashFormatDate(prev.date)}`
  }
  return `<section class="dash-card dash-tap" id="dash-weight" onclick="_dashOpenWeight()"><div class="dash-card-head"><h2 class="dash-card-title">Body weight</h2>` +
    `<span class="dash-card-sub">${weights.length > 1 ? `Last ${weights.length} weigh-ins` : _dashFormatDate(latest.date)}</span></div>` +
    `<div class="dash-wv"><b>${weightToPref(latest.weight_kg)}</b><span>${window._unitPrefs.weight}</span></div><div class="dash-delta">${delta}</div>` +
    '<div class="solo-spark"><canvas id="solo-weight-spark"></canvas></div>' +
    `<button type="button" class="dash-link" onclick="event.stopPropagation();_dashOpenWeight()">Log or view weight</button></section>`
}

// What is coming up: calendar events and programmed sessions on one date-ordered timeline (_soloUpcoming).
function _dashCalendarHtml(upcoming, todayStr) {
  const rows = (upcoming || []).slice(0, 4)
  return `<section class="dash-card dash-tap" id="dash-calendar" onclick="navigate('calendar')"><div class="dash-card-head"><h2 class="dash-card-title">My calendar</h2></div>` +
    (rows.length
      ? rows.map(u => `<div class="dash-row"><span class="dash-pip" style="background:${u.colour}"></span><span class="dash-row-main"><b>${escapeHtml(u.title)}</b><i>${_dashFormatDate(u.date)}</i></span><em class="dash-pill">${_dashDaysUntil(u.date, todayStr)}</em></div>`).join('')
      : '<p class="dash-empty">Nothing scheduled. Tap to open your calendar.</p>') +
    `<button type="button" class="dash-link" onclick="event.stopPropagation();navigate('calendar')">See calendar</button></section>`
}

// Goals: how many are active and the two due soonest, each with its progress. Tapping opens the full goals UI for this role.
function _dashGoalsHtml(goals, todayStr, isClient) {
  const list = goals || []
  const head = `<div class="dash-card-head"><h2 class="dash-card-title">Goals</h2>${list.length ? `<span class="dash-card-sub"><b>${list.length}</b> active</span>` : ''}</div>`
  if (!list.length) return `<section class="dash-card dash-tap" id="dash-goals" onclick="_dashOpenGoals(${isClient})">${head}<p class="dash-empty">No active goals. Tap to set one.</p></section>`
  // Soonest deadline first; a goal with no date sorts last rather than being dropped.
  const sorted = [...list].sort((a, b) => (a.target_date || '9999').localeCompare(b.target_date || '9999'))
  return `<section class="dash-card dash-tap" id="dash-goals" onclick="_dashOpenGoals(${isClient})">${head}` +
    sorted.slice(0, 2).map(g => `<div class="dash-goal"><div class="dash-goal-head"><b>${escapeHtml(g.title)}</b><span>${g.target_date ? _dashDaysUntil(g.target_date, todayStr) : _goalPct(g) + '%'}</span></div>` +
      `<div class="dash-meter"><i style="width:${_goalPct(g)}%"></i></div></div>`).join('') +
    (list.length > 2 ? `<p class="dash-sub">+${list.length - 2} more</p>` : '') +
    `<button type="button" class="dash-link" onclick="event.stopPropagation();_dashOpenGoals(${isClient})">See all goals</button></section>`
}

// Tapping a day on the week strip swaps the Today card (and the pressed day) in place; no re-read. State lives on the page root, so a
// slow render that finishes late cannot leave a stale selection behind. null / today / the same day again = back to today.
function _dashPickDay(ds) {
  const root = document.getElementById('dash-root'), st = root && root._dash
  if (!st) return
  st.sel = !ds || ds === st.todayStr || ds === st.sel ? null : ds
  const swap = (id, html) => { const el = document.getElementById(id); if (el) el.outerHTML = html }
  swap('dash-hero', st.hero(st.sel))
  swap('dash-week', st.week(st.sel))
  // The strip was rebuilt, so put the keyboard focus back on the day the card is now showing.
  document.querySelector(`#dash-week [data-day="${st.sel || st.todayStr}"]`)?.focus()   // a day button (own pages) or a bar (coach)
}

// ─── COACH DASHBOARD ────────────────────────────────────────────────────────────────────────────────────────────────────────
// The same skeleton as the other two, read for a coach (Jake: "Coach version: Yes, go with it"): Today is the sessions clients have
// logged today, the week is sessions logged per day across all clients, and the two tiles are who trained this week and which
// programs end soon. LOGGED-ONLY on purpose: the database knows what each client DID, not what was planned for today, so there is
// no "2 of 5 done" - that needs a new database view (SQL for Jake to run) and is a follow-up if he wants it.

const _dashInitials = name => (name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()

function _dashTimeAgo(iso) {
  const diff = Date.now() - new Date(iso)
  const h = Math.floor(diff / 3600000), d = Math.floor(diff / 86400000)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h ago`
  if (d === 1) return 'yesterday'
  return `${d}d ago`
}

async function renderDashboard(el) {
  log.info('renderDashboard', 'fetching dashboard data')
  el.innerHTML = '<div class="loading-state">Loading…</div>'

  // LOCAL dates throughout: a coach's "today" is their own day. (The view's sessions_7d is UTC-dated; it is only used for the
  // rolling "trained in the last 7 days" count, which is what it always counted.)
  const todayStr = _ymdLocal(new Date())
  const weekAgoStr = _dashAddDays(todayStr, -7)
  const in14Str = _dashAddDays(todayStr, 14)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // Fetch coach's client IDs first so all queries are correctly scoped
  const { data: coachClients, error: coachClientsErr } = await db.from('clients').select('id, full_name, status').eq('coach_id', currentUser.id).order('full_name')
  const ids = (coachClients || []).map(c => c.id)

  const fourteenDaysAgo = new Date(Date.now() - 14 * 864e5).toISOString()
  const [weightsR, logsR, goalsR, summariesR, checkInsR] = await Promise.all([
    ids.length ? db.from('weight_logs').select('client_id, created_at, weight_kg').in('client_id', ids).gte('created_at', sevenDaysAgo).order('created_at', { ascending: false }).limit(30) : { data: [] },
    // Every session in the last week across all clients, PAGED (the API caps a response at 200 rows): the Today card, the week
    // bars and the day you tap all read from this one list. `date` is the calendar day it was logged for.
    ids.length ? _fetchAllRows(() => db.from('workout_logs').select('id, client_id, name, date, created_at, workout_log_exercises(id)', { count: 'exact' }).in('client_id', ids).gte('date', weekAgoStr).order('date', { ascending: false }).order('id', { ascending: false })) : { data: [] },
    // Joined to the coach's OWN clients (clients!inner + the coach_id filter): without a client filter the read rested on RLS alone, and the master account's
    // own personal goals (a client row it owns as a user, coach_id NULL) came back in the COACH dashboard's list too. Not `.in('client_id', ids)` like its two
    // siblings: that list is the first 200 clients (the API's row cap), so a coach past 200 would silently lose goals; the join has no cap, no long URL, and does not
    // depend on the clients read above succeeding. (The 2026-10-04 review rejected the `ids` form for exactly the cap.)
    db.from('goals').select('id, title, target_date, client_id, clients!inner(full_name)').eq('clients.coach_id', currentUser.id).eq('status', 'active').not('target_date', 'is', null).gte('target_date', todayStr).lte('target_date', in14Str).order('target_date').limit(5),
    // One row per client, computed in the database (scripts/add-coach-client-summary-2026-09-20.sql). PAGED: the API caps every
    // response at 200 rows and that applies to a view too, so a bare read would silently drop the 201st client.
    _fetchAllRows(() => db.from('coach_client_summary').select('client_id, full_name, status, sessions_7d, last_session_date, last_weigh_in_date, program_name, program_start, program_weeks, next_program_start', { count: 'exact' }).order('full_name').order('client_id')),
    // "Check-ins to review" (2026-10-29): unreviewed, the last 14 days, the coach's OWN clients - joined like the goals read above, for the same
    // two reasons (the master account's personal record has coach_id NULL and must not appear; no 200-client cap). No back-fill: an old check-in
    // nobody reviewed simply ages out of the window rather than being marked reviewed.
    // 50, counted: 25 clients checking in weekly is up to 50 in the window, and a cut list must say so ("+N more"), never drop rows silently.
    db.from('client_check_ins').select('id, client_id, created_at, sleep, energy, stress, soreness, notes, clients!inner(full_name)', { count: 'exact' }).eq('clients.coach_id', currentUser.id).is('reviewed_at', null).gte('created_at', fourteenDaysAgo).order('created_at', { ascending: false }).limit(50),
  ])

  const failed = _failedFetches({
    'your clients': coachClientsErr,
    'recent weigh-ins': weightsR.error,
    'recent sessions': logsR.error,
    'upcoming goals': goalsR.error,
    'session summaries': summariesR.error,
    'check-ins to review': checkInsR.error,
  })
  // When the summaries could not be read the numbers they feed are UNAVAILABLE, not zero - shown as "—", never as "0 trained".
  const summariesUnavailable = !!summariesR.error
  const summary = Object.fromEntries((summariesR.data || []).map(r => [r.client_id, r]))
  // The roster behind every count is the SUMMARY: it is paged, so it is complete. The clients read above is cut at the API's 200
  // rows, so it only scopes the logs / weigh-ins queries and stands in when the summary could not be read.
  const roster = summariesUnavailable
    ? (coachClients || [])
    : (summariesR.data || []).map(r => ({ id: r.client_id, full_name: r.full_name, status: r.status }))
  const active = roster.filter(c => c.status === 'active')
  const nameOf = Object.fromEntries(roster.map(c => [c.id, c.full_name]))
  // A log with no exercises is an abandoned start, not a session (D3, 2026-09-07).
  const logs = (logsR.data || []).filter(l => (l.workout_log_exercises?.length || 0) > 0)
  const logsByDate = {}
  logs.forEach(l => (logsByDate[l.date] ||= []).push(l))

  const monday = _dashMonday(todayStr)
  const weekDates = Array.from({ length: 7 }, (_, i) => _dashAddDays(monday, i))
  const dayCounts = weekDates.map(ds => (logsByDate[ds] || []).length)

  // Who has not trained in the last 7 days (the old "At risk"), most overdue first; someone who has never trained leads.
  const needAttention = summariesUnavailable ? [] : active
    .filter(c => (Number(summary[c.id]?.sessions_7d) || 0) === 0)
    .sort((a, b) => (summary[a.id]?.last_session_date || '').localeCompare(summary[b.id]?.last_session_date || ''))
  const trained = summariesUnavailable ? null : active.length - needAttention.length

  // Programs whose last day falls in the next 14 days. The end is the Sunday of the program's last week (_dashProgramEnd), where the calendar runs out.
  // The view's plan is the CURRENT one by date (2026-10-29); a client whose next block is already booked (next_program_start) is handled, so not listed.
  const ending = summariesUnavailable ? [] : active.map(c => {
    const s = summary[c.id]
    if (!s?.program_start || !(Number(s.program_weeks) > 0) || s.next_program_start) return null
    const endDs = _dashProgramEnd(s.program_start, s.program_weeks)
    return endDs && endDs >= todayStr && endDs <= in14Str ? { id: c.id, name: c.full_name, program: s.program_name, endDs } : null
  }).filter(Boolean).sort((a, b) => a.endDs.localeCompare(b.endDs))

  // The newest weigh-in per client, newest first (the read is already newest-first).
  const seen = new Set()
  const latestWeights = (weightsR.data || []).filter(w => (seen.has(w.client_id) ? false : seen.add(w.client_id))).slice(0, 3)
  const weighedThisWeek = summariesUnavailable ? null : active.filter(c => (summary[c.id]?.last_weigh_in_date || '') >= weekAgoStr && summary[c.id]?.last_weigh_in_date).length

  const lastTrained = c => (summary[c.id]?.last_session_date ? `Last trained ${_dashFormatDate(summary[c.id].last_session_date)}` : 'No sessions yet')
  // The time it was logged; empty (never "Invalid Date") when the timestamp is missing or unreadable.
  const doneAt = l => { const t = new Date(l.created_at); return l.created_at && !isNaN(t) ? t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '' }
  const attnBtn = needAttention.length ? _dashAttention(needAttention.length) : ''

  // The Today card for one day: the sessions clients logged that day. Saturated only for today with something logged.
  const heroFor = sel => {
    const ds = sel || todayStr, isToday = ds === todayStr, dayLogs = logsByDate[ds] || []
    const back = isToday ? '' : _dashBack()
    const label = isToday ? 'Today' : _dashFormatDate(ds)
    if (!roster.length) {
      return `<section class="dash-hero dash-hero-calm" id="dash-hero" data-kind="empty"><div class="dash-hero-eyebrow">Your clients</div><div class="dash-hero-title">No clients yet</div>` +
        `<div class="dash-hero-meta">Add your first client to see their sessions here.</div><div class="dash-hero-actions">${_dashAddClient()}</div></section>`
    }
    if (!dayLogs.length) {
      const meta = isToday ? (needAttention.length ? `${_dashPlural(needAttention.length, 'client has', 'clients have')} not trained in 7 days.` : 'Early yet.') : 'Across all clients.'
      return `<section class="dash-hero dash-hero-calm" id="dash-hero" data-kind="none"><div class="dash-hero-eyebrow">${label} · Your clients</div>` +
        `<div class="dash-hero-title">${isToday ? 'Nothing logged yet' : 'No sessions logged'}</div><div class="dash-hero-meta">${meta}</div>` +
        `<div class="dash-hero-actions">${_dashSeeClients()}${isToday ? attnBtn : back}</div></section>`
    }
    const rows = dayLogs.slice(0, 3).map(l =>
      `<button type="button" class="dash-hrow" onclick="openClient('${escapeAttr(l.client_id)}')"><span class="dash-av">${escapeHtml(_dashInitials(nameOf[l.client_id]))}</span>` +
      `<span class="dash-hrow-main"><b>${escapeHtml(nameOf[l.client_id] || 'Unknown')}</b><i>${escapeHtml(l.name)}</i></span><span class="dash-hrow-st">${escapeHtml(doneAt(l))}</span></button>`).join('')
    const more = dayLogs.length > 3 ? `<div class="dash-hero-meta">+${dayLogs.length - 3} more</div>` : ''
    return `<section class="dash-hero${isToday ? '' : ' dash-hero-calm'}" id="dash-hero" data-kind="logged"><div class="dash-hero-eyebrow">${label} · Your clients</div>` +
      `<div class="dash-hero-title">${_dashPlural(dayLogs.length, 'session', 'sessions')} logged</div><div class="dash-hrows">${rows}</div>${more}` +
      `<div class="dash-hero-actions">${_dashSeeClients()}${isToday ? attnBtn : back}</div></section>`
  }

  // The week: sessions logged each day across all clients. Tap a bar to see that day.
  const weekFor = sel => {
    const shown = sel || todayStr, total = dayCounts.reduce((a, b) => a + b, 0), max = Math.max(1, ...dayCounts)
    return `<section class="dash-card" id="dash-week"><div class="dash-card-head"><h2 class="dash-card-title">This week</h2><span class="dash-card-sub"><b>${total}</b> ${total === 1 ? 'session' : 'sessions'} logged</span></div>` +
      `<div class="dash-bars" role="group" aria-label="Sessions logged each day">${weekDates.map((ds, i) =>
        `<button type="button" class="dash-bar-col${ds === todayStr ? ' dash-bar-today' : ''}" data-day="${ds}" aria-pressed="${ds === shown}" aria-label="${_DASH_DAY_LABELS[i]}: ${_dashPlural(dayCounts[i], 'session', 'sessions')} logged" onclick="_dashPickDay('${ds}')">` +
        `<span class="dash-bar-track"><i style="height:${Math.round(dayCounts[i] / max * 100)}%"></i></span><span class="dash-bn">${dayCounts[i] || '–'}</span><span class="dash-dn">${_DASH_DAY_LABELS[i]}</span></button>`).join('')}</div></section>`
  }

  const tiles = `<div class="dash-two">` +
    `<section class="dash-card dash-tap" id="dash-trained" onclick="navigate('clients')"><div class="dash-ico">Trained this week</div><div class="dash-big">${trained ?? '—'} <small>of ${active.length}</small></div><div class="dash-sub">clients logged a session in the last 7 days</div></section>` +
    `<section class="dash-card" id="dash-ending"><div class="dash-ico">Training plans ending</div><div class="dash-big">${summariesUnavailable ? '—' : ending.length} <small>soon</small></div><div class="dash-sub">in the next 14 days</div></section></div>`

  const attention = needAttention.length
    ? `<section class="dash-card" id="dash-attn"><div class="dash-card-head"><h2 class="dash-card-title">Needs attention</h2><span class="dash-card-sub">No session in 7 days</span></div>` +
      needAttention.slice(0, 5).map(c => `<button type="button" class="dash-row dash-row-btn" onclick="openClient('${escapeAttr(c.id)}')"><span class="dash-pip dash-pip-danger"></span><span class="dash-row-main"><b>${escapeHtml(c.full_name)}</b><i>${lastTrained(c)}</i></span></button>`).join('') +
      (needAttention.length > 5 ? `<p class="dash-sub">+${needAttention.length - 5} more</p>` : '') +
      `<button type="button" class="dash-link" onclick="navigate('clients')">See all clients</button></section>`
    : ''

  const weighIns = `<section class="dash-card" id="dash-weighins"><div class="dash-card-head"><h2 class="dash-card-title">Weigh-ins</h2>` +
    `<span class="dash-card-sub">${weighedThisWeek === null ? '' : `<b>${weighedThisWeek} of ${active.length}</b> this week`}</span></div>` +
    (latestWeights.length
      ? latestWeights.map(w => `<div class="dash-grow"><b>${escapeHtml(nameOf[w.client_id] || 'Unknown')}</b><span>${fmtWeight(w.weight_kg, { spaced: true })} · ${_dashTimeAgo(w.created_at)}</span></div>`).join('')
      : '<p class="dash-empty">No weigh-ins in the last 7 days.</p>') + '</section>'

  const coming = `<section class="dash-card" id="dash-coming"><div class="dash-card-head"><h2 class="dash-card-title">Coming up</h2><span class="dash-card-sub">Next 14 days</span></div>` +
    (ending.length
      ? ending.slice(0, 4).map(e => `<button type="button" class="dash-row dash-row-btn" onclick="openClient('${escapeAttr(e.id)}')"><span class="dash-pip"></span><span class="dash-row-main"><b>${escapeHtml(e.name)} · training plan ends</b><i>${escapeHtml(e.program || 'Training plan')}</i></span><em class="dash-pill">${_dashDaysUntil(e.endDs, todayStr)}</em></button>`).join('')
      : '<p class="dash-empty">No training plans ending in the next 14 days.</p>') +
    `<button type="button" class="dash-link" onclick="navigate('calendar')">See calendar</button></section>`

  const goalsDue = `<section class="dash-card" id="dash-goals"><div class="dash-card-head"><h2 class="dash-card-title">Goals due soon</h2><span class="dash-card-sub">Next 14 days</span></div>` +
    (goalsR.data?.length
      ? goalsR.data.map(g => `<div class="dash-grow"><b>${escapeHtml(g.title)}</b><span>${escapeHtml(g.clients?.full_name || '')} · ${_dashDaysUntil(g.target_date, todayStr)}</span></div>`).join('')
      : '<p class="dash-empty">No goals due in the next 14 days.</p>') + '</section>'

  const firstName = currentProfile?.full_name?.split(' ')[0] || 'Coach'
  const biz = window._branding?.businessName
  el.innerHTML = `
    <div class="dash" id="dash-root" data-dash="coach">
      ${_fetchFailureBanner(failed, 'dashboard')}
      <header class="dash-head">
        <div>
          <div class="dash-eyebrow">${biz ? escapeHtml(biz) : 'Your clients'}</div>
          <h1 class="dash-greet">Welcome back, ${escapeHtml(firstName)}</h1>
          <div class="dash-date">${_dashLongDate()}</div>
        </div>
        <div class="dash-icons">
          <button type="button" class="dash-icon" aria-label="Add client" onclick="showAddClientModal()">${_DASH_ICONS.plus}</button>
          <button type="button" class="dash-icon" aria-label="Build a workout" onclick="navigate('workouts')">${_DASH_ICONS.build}</button>
        </div>
      </header>
      ${roster.length || checkInsR.error ? _dashCheckInsHtml(checkInsR.data || [], { unavailable: !!checkInsR.error, total: checkInsR.count }) : ''}
      ${heroFor(null)}
      ${weekFor(null)}
      ${tiles}
      ${attention}
      ${weighIns}
      ${coming}
      ${goalsDue}
    </div>`
  const root = el.querySelector('#dash-root')
  if (root) root._dash = { todayStr, sel: null, hero: heroFor, week: weekFor }
  log.ok('renderDashboard', 'rendered', { clients: roster.length, sessionsThisWeek: logs.length, needAttention: needAttention.length })
}

// "Check-ins to review" on the coach Home (2026-10-29): unreviewed check-ins of the last 14 days, flagged ones first (any red score -
// _checkInFlagged), then newest first. Each row: the client (opens their profile), the date, the four scores in their tone colours, the start of
// the note, and Seen ✓ / Reply (markCheckInSeen / showCheckInReplyModal, app-clients.js). Pure: rows in, markup out. `unavailable` = the read
// failed, which says so rather than "Nothing to review". `total` = how many there are in all (the read's exact count); when the read was cut
// short the card says "+N more" - newest first, so it is the oldest that wait.
function _dashCheckInsHtml(rows, { unavailable = false, total = null } = {}) {
  const shown = (rows || []).length, more = Number.isInteger(total) && total > shown ? total - shown : 0
  const head = `<div class="dash-card-head"><h2 class="dash-card-title">Check-ins to review</h2><span class="dash-card-sub">${shown ? `<b data-checkins-count>${shown + more}</b> · ` : ''}Last 14 days</span></div>`
  if (unavailable) return `<section class="dash-card" id="dash-checkins">${head}<p class="dash-empty">Could not load check-ins.</p></section>`
  const list = [...(rows || [])].sort((a, b) => (Number(_checkInFlagged(b)) - Number(_checkInFlagged(a))) || _cmpText(b.created_at, a.created_at))
  if (!list.length) return `<section class="dash-card" id="dash-checkins">${head}<p class="dash-empty">Nothing to review.</p></section>`
  const note = s => { const t = [...String(s || '').trim()]; return t.length > 80 ? t.slice(0, 79).join('') + '…' : t.join('') }   // by character, so an emoji is never cut in half
  return `<section class="dash-card" id="dash-checkins">${head}${list.map(r => {
    const flagged = _checkInFlagged(r)
    const day = r.created_at ? _dashFormatDate(_ymdLocal(new Date(r.created_at))) : ''
    const cid = escapeAttr(r.client_id), id = escapeAttr(r.id)
    return `<div class="dash-ci" data-checkin-id="${id}">
        <button type="button" class="dash-ci-who" onclick="openClient('${cid}')"><b>${escapeHtml(r.clients?.full_name || 'Client')}</b><i>${escapeHtml(day)}</i>${flagged ? '<em class="dash-ci-flag" data-flagged>Flagged</em>' : ''}</button>
        <div class="dash-ci-scores">${CHECKIN_METRICS.map(m => `<span style="color:${_checkInColour(m.key, r[m.key])}">${m.abbr} ${r[m.key] ?? '–'}</span>`).join('')}</div>
        ${r.notes ? `<p class="dash-ci-note">${escapeHtml(note(r.notes))}</p>` : ''}
        <div class="dash-ci-actions">
          <button type="button" class="dash-btn dash-btn-ghost dash-ci-btn" data-checkin-seen onclick="markCheckInSeen('${id}','${cid}',this)">Seen ✓</button>
          <button type="button" class="dash-btn dash-btn-ghost dash-ci-btn" data-checkin-reply onclick="showCheckInReplyModal('${id}','${cid}')">Reply</button>
        </div>
      </div>`
  }).join('')}${more ? `<p class="dash-empty" data-checkins-more>+${more} more - the oldest are not shown. Review these to see them.</p>` : ''}</section>`
}

// After Seen / Reply on the coach Home: the reviewed row leaves the card IN PLACE and the count drops - no full repaint (review, 2026-10-29).
// Returns false when the row is not on screen (the action came from a client's Overview), so the caller updates that view instead.
function _dashCheckInReviewed(checkInId) {
  const card = document.getElementById('dash-checkins')
  const item = card ? [...card.querySelectorAll('[data-checkin-id]')].find(el => el.getAttribute('data-checkin-id') === String(checkInId)) : null
  if (!card || !item) return false
  item.remove()
  const count = card.querySelector('[data-checkins-count]')
  const left = Math.max(0, (Number(count?.textContent) || 1) - 1)
  if (count) count.textContent = String(left)
  if (!card.querySelector('[data-checkin-id]') && !card.querySelector('[data-checkins-more]')) card.insertAdjacentHTML('beforeend', '<p class="dash-empty">Nothing to review.</p>')
  return true
}

// ─── CLIENT DASHBOARD ─────────────────────────────────────────────────────────
// ─── SUDO (impersonation) ─────────────────────────────────────────────────────
function sudoAsClient(clientId, clientName) {
  if (!_isOwnerAccount()) return
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

// ─── The own-account dashboard: solo ("My Training") and client ─────────────────────────────────────────────────────────────
// ONE page for both. Until 2026-10-03 they were two renders that had drifted: the client's program read lacked `id` and
// `week_number` (so every week of a periodised phase collapsed onto week 1 and its Start button could not resolve the clone),
// the solo page had tiles the client page lacked, and the client page carried inline forms the solo page did not.

// One local-date long form for the greeting line ("Saturday 3 October").
function _dashLongDate() {
  return new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
}

// Everything the page reads, in one place. Returns the data plus `failed`: { label: error } for every read that errored, so a
// failed read shows as a notice and never passes for "nothing logged".
async function _dashLoadOwn(clientId, todayStr, { checkIn = false } = {}) {
  const lookbackStart = _dashAddDays(_dashMonday(todayStr), -7 * _DASH_STREAK_WEEKS)
  const [goalsR, eventsR, weightsR, programsR, logsR, checkInR] = await Promise.all([
    db.from('goals').select('id, title, target_date, status, start_value, current_value, target_value, goal_milestones(id, title, completed_at, order)').eq('client_id', clientId).eq('status', 'active').order('target_date'),
    db.from('events').select('id, title, date, type, notes').eq('client_id', clientId).gte('date', todayStr).order('date').limit(4),
    // 14, not 5: the card draws a trend and weigh-ins are not daily, so 5 rows can span a fortnight and leave the window empty.
    db.from('weight_logs').select('date, weight_kg').eq('client_id', clientId).order('date', { ascending: false }).limit(14),
    // `id` and `week_number` are load-bearing. Without week_number every week of a periodised phase collapses onto week 1's
    // sessions; without id the clone lookup below cannot run. ALL of the client's assignments, not the newest one: _currentAssignment
    // picks the current plan by date, and a block booked to follow it is drawn too (2026-10-29).
    db.from('client_programs').select('id, start_date, created_at, programs(name, description, program_phases(id, name, duration_weeks, order_index, program_phase_workouts(id, day_of_week, session_order, week_number, notes, workout_templates(id, name))))').eq('client_id', clientId).order('created_at', { ascending: false }),
    // A year of sessions, paged (_fetchAllRows, app-core.js): the API caps a response at 200 rows and says nothing when it
    // truncates. The week strip, the streak and "done" all read from this one list.
    _fetchAllRows(() => db.from('workout_logs').select('id, name, date, workout_log_exercises(id)', { count: 'exact' }).eq('client_id', clientId).gte('date', lookbackStart).order('date', { ascending: false }).order('id', { ascending: false })),
    // Two: the last check-in and the one before it, for the "vs last week" arrows (2026-10-29).
    checkIn ? db.from('client_check_ins').select('*').eq('client_id', clientId).order('created_at', { ascending: false }).limit(2) : Promise.resolve({ data: [], error: null }),
  ])

  // Second round-trip, only when a programme exists. Deliberately NOT a nested embed on the query above: PostgREST silently NULLs a
  // level the reader cannot see, and a silently empty clone map would render a Start button that launches the wrong template.
  const { current: cp0, next: cpNext } = _currentAssignment(programsR.data, todayStr)
  const drawn = [cp0, cpNext].filter(Boolean)
  const cpwMap = {}
  let cpwErr = null
  if (drawn.length) {
    const r = await db.from('client_program_workouts').select('program_phase_workout_id, workout_template_id').in('client_program_id', drawn.map(cp => cp.id))
    cpwErr = r.error
    ;(r.data || []).forEach(row => { cpwMap[row.program_phase_workout_id] = { templateId: row.workout_template_id } })
  }
  // fromStart: each plan's days before its own start date are not planned sessions (_dashPlannedFrom's rule, per plan).
  const progByDate = _programWorkoutsByDateAll(drawn, cpwMap, { fromStart: true })
  // The CURRENT plan's dates alone, for the adherence tile: _dashPlanAdherence runs a plan to the last week that has a session, so the next
  // block's weeks would read as this plan's ("Week 2 of 4" for a two-week plan; a finished plan at 0%) - review, 2026-10-29.
  const currentByDate = _programWorkoutsByDateAll([cp0].filter(Boolean), cpwMap, { fromStart: true })
  // The runner/save path can leave a 0-exercise workout_log (an abandoned start): those are not sessions (D3, 2026-09-07).
  const logs = (logsR.data || []).filter(l => (l.workout_log_exercises?.length || 0) > 0)

  return {
    goals: goalsR.data, events: eventsR.data, weights: weightsR.data, cp0, progByDate, currentByDate, logs,
    upcoming: _soloUpcoming(eventsR.data, progByDate, todayStr),
    lastCheckIn: checkInR.data?.[0] || null,
    prevCheckIn: checkInR.data?.[1] || null,
    failed: {
      'your goals': goalsR.error, 'upcoming events': eventsR.error, 'weight history': weightsR.error,
      'your training plan': programsR.error || cpwErr, 'recent sessions': logsR.error, 'check-ins': checkInR.error,
    },
  }
}

// The weekly check-in: a banner at the top when it is due, and the form itself at the bottom of the client page. Same ids and
// handlers as before (saveClientCheckIn reads the ci-* fields).
function _dashCheckInBanner() {
  return `<div class="dash-banner"><span>Your weekly check-in is due.</span><button type="button" onclick="document.getElementById('checkin-card').scrollIntoView({behavior:'smooth'})">Do it now</button></div>`
}

// The client's weekly check-in card (reworked 2026-10-29, docs/bugs/2026-10-29-client-check-ins-get-no-response.md). The form was four range
// sliders pre-filled with last week's answers, so submitting without touching them sent last week's numbers as this week's. Now each question is
// five tap buttons with NOTHING chosen, the two ends say what 1 and 5 mean (CHECKIN_METRICS lo / hi), and Submit stays disabled until all four
// are answered. The chosen values live in hidden #ci-<metric> inputs - the ids saveClientCheckIn reads and specs set. Under the last check-in:
// arrows against the one before it, and the coach's side of the loop ("Seen by your coach", their reply).
// opts: readFailed - the check-in read failed (the page's banner names it), so this must not say "Your first check-in" to someone who has
// some; sudo - the owner's "view as client", where only the client can submit (the INSERT policy refuses anyone else), so no Submit is offered.
function _dashCheckInHtml(lastCheckIn, clientId, prevCheckIn = null, { readFailed = false, sudo = false } = {}) {
  const daysSince = lastCheckIn ? Math.floor((Date.now() - new Date(lastCheckIn.created_at)) / 86400000) : null
  const due = daysSince === null || daysSince >= 7
  // Both values must be real numbers: Number(null) is 0, which would draw "down from 3" beside a missing score (review, 2026-10-29).
  const arrow = (key) => {
    const ra = lastCheckIn?.[key], rb = prevCheckIn?.[key]
    if (ra == null || rb == null || ra === '' || rb === '') return ''
    const a = Number(ra), b = Number(rb)
    if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) return ''
    return `<span class="ci-arrow" aria-label="${a > b ? 'up' : 'down'} from ${b} last time">${a > b ? '↑' : '↓'}</span>`
  }
  // The newest reply the client has: on the last check-in, or - when they checked in again before the coach answered - on the one before.
  // Without this a reply to the earlier check-in was never shown anywhere on the client's side (review, 2026-10-29).
  const replyOnPrev = !lastCheckIn?.coach_reply && prevCheckIn?.coach_reply
  return `
    <div class="dashboard-card dash-checkin" id="checkin-card">
      <div class="card-header">
        <h2 class="card-title">Weekly check-in</h2>
        ${lastCheckIn ? `<span class="ci-when">${daysSince === 0 ? 'Submitted today' : daysSince + 'd ago'}</span>` : ''}
      </div>
      ${lastCheckIn ? `
        <div class="ci-last">
          ${CHECKIN_METRICS.map(m => `
          <div class="ci-last-tile">
            <div class="ci-last-val" style="color:${_checkInColour(m.key, lastCheckIn[m.key])}">${lastCheckIn[m.key] ?? '–'}/5${arrow(m.key)}</div>
            <div class="ci-last-label">${m.label}</div>
          </div>`).join('')}
        </div>
        ${lastCheckIn.notes ? `<p class="ci-last-note">${escapeHtml(lastCheckIn.notes)}</p>` : ''}
        ${lastCheckIn.reviewed_at ? '<p class="ci-seen">Seen by your coach ✓</p>' : ''}
        ${lastCheckIn.coach_reply ? `<p class="ci-reply"><b>Your coach:</b> ${escapeHtml(lastCheckIn.coach_reply)}</p>` : ''}
        ${replyOnPrev ? `<p class="ci-reply"><b>Your coach, on your previous check-in:</b> ${escapeHtml(prevCheckIn.coach_reply)}</p>` : ''}
        ${due || sudo ? '' : `<button onclick="document.getElementById('checkin-form').style.display='block'" class="btn-secondary ci-new">Submit new check-in</button>`}
      ` : ''}
      ${due ? `<p class="ci-due">${lastCheckIn ? 'Your weekly check-in is due.' : readFailed ? '' : 'Your first check-in.'} Let your coach know how you're feeling.</p>` : ''}
      <div id="checkin-form" class="ci-form" style="${due ? '' : 'display:none'}">
        ${CHECKIN_METRICS.map(m => `
        <div class="ci-q" role="group" aria-label="${m.label}">
          <div class="ci-q-label">${m.label}</div>
          <div class="ci-taps">${[1, 2, 3, 4, 5].map(n => `<button type="button" class="ci-tap" data-ci-metric="${m.key}" data-ci-value="${n}" aria-pressed="false" onclick="_ciPick('${m.key}',${n})">${n}</button>`).join('')}</div>
          <div class="ci-ends"><span>${m.lo}</span><span>${m.hi}</span></div>
          <input type="hidden" id="ci-${m.key}" value="">
        </div>`).join('')}
        <div class="field">
          <label class="field-label" for="ci-notes">Notes for your coach <span class="ci-optional">(optional)</span></label>
          <textarea id="ci-notes" class="field-input" rows="2" placeholder="How's training feeling? Any injuries or concerns?"></textarea>
        </div>
        <p id="ci-error" class="ci-error"></p>
        ${sudo ? '<p class="ci-due">Viewing as your client: only they can submit a check-in.</p>'
          : `<button id="ci-submit" onclick="saveClientCheckIn('${escapeAttr(clientId)}')" class="btn-primary ci-submit" disabled>Submit check-in</button>`}
      </div>
    </div>`
}

// One tap on the check-in form: records the answer in the hidden input, marks that one button pressed, and enables Submit once all four are in.
function _ciPick(key, n) {
  const input = /** @type {HTMLInputElement|null} */ (document.getElementById('ci-' + key))
  if (!input) return
  input.value = String(n)
  document.querySelectorAll(`[data-ci-metric="${key}"]`).forEach(b => b.setAttribute('aria-pressed', String(b.getAttribute('data-ci-value') === String(n))))
  const submit = /** @type {HTMLButtonElement|null} */ (document.getElementById('ci-submit'))
  if (submit) submit.disabled = CHECKIN_METRICS.some(m => !(/** @type {HTMLInputElement|null} */ (document.getElementById('ci-' + m.key)))?.value)
}

async function _dashRenderOwn(el, role) {
  const isClient = role === 'client'
  const page = isClient ? 'client-dashboard' : 'solo-dashboard'
  if (isClient) log.info('renderClientDashboard', 'fetching data', { userId: currentUser.id })
  else log.info('renderSoloDashboard', 'loading personal dashboard')
  el.innerHTML = '<div class="loading-state">Loading…</div>'

  let clientId, firstName
  const isSudo = isClient && !!window._sudoClientId
  if (!isClient) {
    clientId = window._soloClientId
    if (!clientId) { el.innerHTML = '<div class="loading-state">Personal account not set up yet.</div>'; return }
    firstName = currentProfile?.full_name?.split(' ')[0] || 'there'
  } else if (isSudo) {
    clientId = window._sudoClientId
    firstName = (window._sudoClientName || 'Client').split(' ')[0]
  } else {
    // The coached client record (coach_id is not null = has a PT). A master account also owns a personal record, so the
    // discriminator is what keeps this from throwing on two rows.
    const { data: clientRow, error: clientErr } = await db.from('clients').select('id, full_name, coach_id').eq('user_id', currentUser.id).not('coach_id', 'is', null).maybeSingle()
    if (clientErr || !clientRow) {
      log.error('renderClientDashboard', 'client record not found', clientErr)
      el.innerHTML = '<div class="loading-state">Unable to load your profile. Please contact your coach.</div>'
      return
    }
    clientId = clientRow.id
    firstName = currentProfile?.full_name?.split(' ')[0] || 'there'
  }

  // LOCAL date, not toISOString(): the programmed-day map is keyed by _ymdLocal, so a UTC "today" would disagree with it by one day
  // for anyone west of UTC, and for a UK user during BST between midnight and 01:00 - when an early riser opens this page.
  const todayStr = _ymdLocal(new Date())
  const d = await _dashLoadOwn(clientId, todayStr, { checkIn: isClient })

  const days = _dashWeekDays(todayStr, d.progByDate, d.logs)
  const counts = _dashWeekCounts(days)
  const program = _dashProgramInfo(d.cp0, todayStr)
  // The sudo view (an owner looking at a client's page) has no way to read that client's own weekly target, so it shows the default rather than the owner's.
  const streak = _dashStreakModel(d.currentByDate, d.logs.map(l => l.date), todayStr, { planStart: d.cp0?.start_date || null, totalWeeks: program?.totalWeeks || 0, target: isSudo ? null : window._weeklyTarget })
  const next = d.upcoming.find(u => u.kind === 'session' && u.date > todayStr) || null
  const ctx = { role, clientId, todayStr, days, hasProgram: !!d.cp0, program, next }
  const byDs = Object.fromEntries(days.map(x => [x.ds, x]))
  const heroFor = sel => _dashHeroHtml(byDs[sel || todayStr], ctx)
  const weekFor = sel => _dashWeekHtml(days, counts, sel)

  const biz = window._branding?.businessName
  const eyebrow = isClient ? (biz ? 'Coached by ' + escapeHtml(biz) : 'Coached by your PT') : 'My training'
  const logo = isClient && window._branding?.logoUrl ? `<img class="dash-logo" src="${escapeHtml(window._branding.logoUrl)}" alt="${escapeHtml(biz || '')}">` : ''
  const lastCheckIn = d.lastCheckIn
  const checkInDue = isClient && (!lastCheckIn || Math.floor((Date.now() - new Date(lastCheckIn.created_at)) / 86400000) >= 7)

  // BEFORE innerHTML. This function replaces the whole subtree, detaching any canvas; _renderMetricChart's own guards resolve
  // against the NEW element and so miss the old instance, which then lives on with its listeners and animation loop running
  // (bugs/2026-08-17-renderclientweight-leaks-a-chart-on-every-save). The dashboard repaints on every write.
  _destroyManagedCharts()

  el.innerHTML = `
    <div class="dash${isSudo ? ' dash-sudo' : ''}" id="dash-root" data-dash="${role}">
      ${_fetchFailureBanner(_failedFetches(d.failed), page)}
      ${isSudo ? `<div class="dash-banner dash-banner-sudo"><span>👁 Viewing as ${escapeHtml(window._sudoClientName || 'Client')}</span><button type="button" onclick="exitSudo()">Exit ✕</button></div>` : ''}
      <header class="dash-head">
        <div>
          <div class="dash-eyebrow">${eyebrow}</div>
          <h1 class="dash-greet">Hi, ${escapeHtml(firstName)}</h1>
          <div class="dash-date">${_dashLongDate()}</div>
        </div>
        ${logo}
      </header>
      ${checkInDue ? _dashCheckInBanner() : ''}
      ${heroFor(null)}
      ${weekFor(null)}
      ${_dashTilesHtml(streak, program, !isClient, !isSudo)}
      ${_dashWeightHtml(d.weights)}
      ${_dashCalendarHtml(d.upcoming, todayStr)}
      ${_dashGoalsHtml(d.goals, todayStr, isClient)}
      ${isClient ? _dashCheckInHtml(lastCheckIn, clientId, d.prevCheckIn, { readFailed: !!d.failed['check-ins'], sudo: isSudo }) : ''}
    </div>`
  const root = el.querySelector('#dash-root')
  if (root) root._dash = { todayStr, sel: null, hero: heroFor, week: weekFor }

  // After innerHTML, so the canvas exists. Oldest-first for a left-to-right time axis, and the 7-day rolling average via the
  // existing helper rather than a second implementation.
  if (d.weights?.length) {
    const series = [...d.weights].reverse()
    const vals = series.map(w => weightToPref(w.weight_kg))
    _renderMetricChart('solo-weight-spark', {
      labels: series.map(w => _dashFormatDate(w.date)),
      series: [
        { label: 'Weight', data: vals, colour: _METRIC_COLORS.topWeight, fill: true },
        { label: '7-day avg', data: _rollingAvg(vals, 7), colour: _METRIC_COLORS.topWeight, dashed: true, pointRadius: 0 }
      ],
      legend: false,
      height: 70,
      tooltipUnit: window._unitPrefs.weight
    })
  }
  log.ok(isClient ? 'renderClientDashboard' : 'renderSoloDashboard', 'rendered', { clientId, goals: d.goals?.length, sessions: d.logs.length, upcoming: d.upcoming.length, streak: streak.mode })
}

async function renderClientDashboard(el) { return _dashRenderOwn(el, 'client') }
async function renderSoloDashboard(el) { return _dashRenderOwn(el, 'solo') }

// ─── CLIENT PROFILE: PROGRAMS TAB ─────────────────────────────────────────────
