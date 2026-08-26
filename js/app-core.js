// ─── CONFIG ───────────────────────────────────────────────────────────────────
const _initialHash = window.location.hash

// The version of privacy-policy.html a user consented to, stamped alongside `consented_at` on the
// profiles row. Consent is only meaningful against a SPECIFIC text: without this, a later edit to the
// policy would silently re-interpret an old consent as covering wording the person never saw.
// MUST match the "Last updated:" date in privacy-policy.html — bump both together, and expect to
// re-take consent when it changes.
// ENFORCED since 2026-08-25 by checks.sh rule 9e (scripts/check-policy-version.mjs): a push where
// these two disagree is BLOCKED. Until then this paragraph was the only thing holding the invariant,
// and its failure mode is silent — _needsConsent() re-prompts only on a version mismatch, so a
// policy edit without a bump leaves everyone consented to a text they never saw, with no symptom.
const PRIVACY_POLICY_VERSION = '2026-06-29'
const PRIVACY_POLICY_URL = 'privacy-policy.html'

// The owner's account — the single definition. Until 2026-08-25 this literal was pasted at THREE
// call sites (app-dashboard sudoAsClient, app-clients "View as" button, app-progress solo-invite
// card), which is the fix-the-class shape: three siblings doing one job, free to drift apart, and
// three copies of a personal email in the source of a public GitHub Pages site.
//
// This is a UI-AFFORDANCE gate, NOT a security boundary. RLS decides what any account can actually
// read or write; this only decides which buttons render. Same category as `is_personal` — never put
// it anywhere a real boundary is required.
//
// It is deliberately NOT the same predicate as `window._masterAccount`, which means only "this user
// holds both a coached and a solo clients row". Collapsing the two would hand impersonation to any
// dual-row user, so the near-miss is worth naming: they look interchangeable and are not.
const OWNER_EMAIL = 'jakendwest@gmail.com'
function _isOwnerAccount () { return currentUser?.email === OWNER_EMAIL }

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

// ─── UNIT PREFERENCES ─────────────────────────────────────────────────────────
// Account-wide, per-metric-type (2026-07-24). Storage everywhere else stays canonical (kg, cm,
// metres) — these only drive display/entry conversion. Populated from profiles in loadUserInfo();
// default to metric until that fetch resolves, matching the DB column defaults.
window._unitPrefs = { weight: 'kg', jumpHeight: 'cm', cardioDistance: 'km' }

const _WEIGHT_KG_TO_LB = 2.2046226218
const _JUMP_CM_TO_IN   = 0.3937007874

// A programme's week grid starts on the MONDAY of its start week, not on start_date itself — a block
// beginning on a Wednesday still places its Day-1 session on that week's Monday. Hoisted here 2026-08-15
// so the calendar (which has done this since it was written) and the per-programme progress window
// cannot disagree about where a block begins. Two private copies of one date rule is the shape that has
// bitten this codebase five times.
// Takes a 'YYYY-MM-DD' string; returns a Date at local midnight. The 'T00:00:00' suffix is load-bearing:
// `new Date('2026-04-01')` parses as UTC and lands on the previous day west of Greenwich.
// Local-calendar YYYY-MM-DD. NEVER use toISOString() for a calendar date: it converts to UTC, so a
// local-midnight Date in any UTC+ zone (Europe/London under BST — i.e. most of the year here) reports
// the PREVIOUS day. That silently turned _mondayOfWeek's Monday back into a Sunday. This formatter
// was already inlined in renderCalendar, which is why the calendar never had the bug; it lives here
// now so the progress window derives dates by the identical rule.
function _ymdLocal(d) {
  if (!d || isNaN(d.getTime?.())) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ─── The PB entry form (2026-08-17) ──────────────────────────────────────────
// ONE definition. It was hand-copied into three places — renderProgressPBs, and both the coach and
// solo dashboard cards — and they had already drifted: the SOLO copy never rendered #cpb-notes, but
// saveClientPB read `document.getElementById('cpb-notes').value` unconditionally, so saving a PB
// from your own dashboard threw before the insert and showed nothing. The page Jake wanted deleted
// was, because of that, the only working PB capture path on his own account.
//
// The unit is a SELECT driven by the category, not a free-text box. PERF_CATEGORIES has carried the
// correct per-category unit lists all along (app-runner.js) and this form simply ignored them, with
// a `kg / min / reps` placeholder instead. On Jake's own 30 entries that produced `Kg` (capital K,
// which matches nothing in _PERF_UNIT_BASE and falls through unconverted) and a Skierg row whose
// unit is `5km` — a distance in the unit field, with the value holding seconds.
//
// STRENGTH IS DELIBERATELY ABSENT from the category list. Barbell lifts belong on the Personal Bests
// (1RM) tab, which superseded this form for strength: 4 exercises here, last used 25 June, against
// 12 exercises there from 1 July onward. Historical strength rows are still DISPLAYED — nothing is
// deleted — they just cannot be added here any more, so the two stop diverging.
const _PB_FORM_CATEGORIES = ['cardio', 'benchmark', 'body_metric']

function _pbUnitOptions(categoryId) {
  const cat = (typeof PERF_CATEGORIES !== 'undefined' ? PERF_CATEGORIES : []).find(c => c.id === categoryId)
  return (cat?.units || []).map(u => `<option value="${escapeHtml(u)}">${escapeHtml(u)}</option>`).join('')
}

// Repopulates the unit list when the category changes, so the two can never disagree.
function _pbSyncUnits() {
  const cat = document.getElementById('cpb-category')?.value
  const unitEl = document.getElementById('cpb-unit')
  if (!cat || !unitEl) return
  unitEl.innerHTML = _pbUnitOptions(cat)
  const ph = (typeof PERF_CATEGORIES !== 'undefined' ? PERF_CATEGORIES : []).find(c => c.id === cat)?.placeholder
  const nameEl = document.getElementById('cpb-name')
  if (nameEl && ph) nameEl.placeholder = ph
}

function _pbFormHtml(clientId, { todayStr } = {}) {
  const cats = (typeof PERF_CATEGORIES !== 'undefined' ? PERF_CATEGORIES : [])
    .filter(c => _PB_FORM_CATEGORIES.includes(c.id))
  const first = cats[0]
  const today = todayStr || _ymdLocal(new Date())
  return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
      <div><label class="form-label">Exercise</label><input type="text" id="cpb-name" class="form-input" placeholder="${escapeHtml(first?.placeholder || 'e.g. 5k Run')}"></div>
      <div><label class="form-label">Category</label><select id="cpb-category" class="form-input" onchange="_pbSyncUnits()">
        ${cats.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.label)}</option>`).join('')}
      </select></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px">
      <div><label class="form-label">Value</label><input type="number" id="cpb-value" class="form-input" step="0.01"></div>
      <div><label class="form-label">Unit</label><select id="cpb-unit" class="form-input">${_pbUnitOptions(first?.id)}</select></div>
      <div><label class="form-label">Date</label><input type="date" id="cpb-date" class="form-input" value="${escapeHtml(today)}"></div>
    </div>
    <div style="margin-bottom:8px"><label class="form-label">Notes <span style="color:var(--text-muted)">(optional)</span></label><input type="text" id="cpb-notes" class="form-input" placeholder="Any notes…"></div>
    <p style="font-size:var(--text-sm, 11px);color:var(--text-muted);margin:0 0 6px">Logging a lift? Records go on the <strong>Personal Bests</strong> tab.</p>
    <p id="cpb-error" style="color:var(--danger, #ef4444);font-size:var(--text-md, 12px);margin:0 0 6px"></p>
    <div style="display:flex;gap:8px">
      <button class="btn btn-primary" style="font-size:var(--text-base, 13px);padding:6px 14px" onclick="saveClientPB('${escapeAttr(clientId)}')">Save</button>
      <button class="btn-secondary" style="font-size:var(--text-base, 13px);padding:6px 14px" onclick="document.getElementById('client-pb-form').style.display='none'">Cancel</button>
    </div>`
}

function _mondayOfWeek(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr + 'T00:00:00')
  if (isNaN(d.getTime())) return null
  const daysFromMon = (d.getDay() + 6) % 7   // getDay(): 0 = Sunday
  d.setDate(d.getDate() - daysFromMon)
  return d
}

// Strips a trailing .0 the same way fmtDistanceM already does, so a converted "100.0" reads "100".
function _stripTrailingZero(v) { return String(v).replace(/\.0$/, '') }

// Bare number (no unit suffix) in the user's preferred unit, for populating an input's value/
// placeholder. In the NATIVE unit (kg) this normalizes via parseFloat exactly the way most existing
// display sites already did (`parseFloat(x.weight_kg) || 0`) — a clean number, no forced decimal
// rounding — so nobody who hasn't touched the Settings toggle sees a meaningful difference. Only the
// converted (lb) case rounds to 1 decimal, since there's no prior behaviour to preserve there.
function weightToPref(kg) {
  if (kg == null || kg === '') return ''
  const v = parseFloat(kg)
  if (isNaN(v)) return ''
  if (window._unitPrefs.weight !== 'lb') return v
  return _stripTrailingZero((v * _WEIGHT_KG_TO_LB).toFixed(1))
}
// User's-unit value -> canonical kg, for reading a typed input back before save. Null (not '') on
// blank/invalid input, matching how every save path already treats a missing weight.
function weightFromPref(val) {
  if (val == null || val === '') return null
  const v = parseFloat(val)
  if (isNaN(v)) return null
  return window._unitPrefs.weight === 'lb' ? v / _WEIGHT_KG_TO_LB : v
}

// ── The display value is a LOSSY proxy for the stored one. Never save it back blind. ──────────────
//
// Reproduced 2026-08-26 (bug 2026-07-09). A 1RM stored as exactly 200 kg renders in lb as
// `200 * 2.20462 = 440.924` -> toFixed(1) -> "440.9". Read that back with weightFromPref and you get
// **199.99 kg**, not 200. Every save that re-reads an untouched prefilled field therefore rewrites the
// row slightly wrong, and the next render rounds it again — so the screen keeps showing "200" while
// the database drifts. That is why reading the code twice never found it: the corruption is invisible
// from the UI, and it is bounded (~0.023 kg) so it never looks like a bug, it looks like data.
//
// weightFromInput is the ONE place that knows the difference between "the user typed a new number"
// and "the user left the number we rendered". Given `data-shown` (exactly what was painted into the
// box) and `data-kg` (the canonical value it was painted FROM), an unedited field returns the stored
// kg VERBATIM and cannot drift. Anything genuinely retyped converts normally.
//
// ONE helper, five call sites, deliberately: this codebase's most-repeated failure is a guard landing
// in the function where the bug was found while its siblings keep the defect. A site that renders a
// weight WITHOUT both data attributes silently falls back to the old lossy path — so if you add a
// sixth prefilled weight input, stamp them.
function weightFromInput(el) {
  if (!el) return null
  const raw = (el.value == null ? '' : String(el.value)).trim()
  if (raw === '') return null
  const shown = el.dataset ? el.dataset.shown : undefined
  const kg = el.dataset ? el.dataset.kg : undefined
  // Compared NUMERICALLY so "200" and "200.0" are the same untouched field, matching how
  // saveOneRMGrid already compares its own data-orig.
  if (shown !== undefined && shown !== '' && kg !== undefined && kg !== '') {
    const shownNum = parseFloat(shown)
    const rawNum = parseFloat(raw)
    const kgNum = parseFloat(kg)
    if (!isNaN(shownNum) && !isNaN(rawNum) && !isNaN(kgNum) && rawNum === shownNum) return kgNum
  }
  return weightFromPref(raw)
}

// Emits the value + the two data attributes weightFromInput needs, from a canonical kg.
// `shownOverride` is for the one site that paints something other than raw weightToPref output
// (the 1RM grid re-rounds to 1dp) — what is PAINTED must be what is stamped, or the equality test
// compares the wrong two things.
function weightInputAttrs(kg, shownOverride = null) {
  if (kg == null || kg === '') return 'value=""'
  const shown = shownOverride != null ? shownOverride : weightToPref(kg)
  if (shown === '') return 'value=""'
  return `value="${shown}" data-shown="${shown}" data-kg="${kg}"`
}
// Full display string with unit suffix, for read-only contexts. `spaced` matches each call site's
// existing convention (some sites render "100kg", others "100 kg") — not standardized here, only the
// unit itself becomes preference-aware. `decimals` forces a fixed precision (e.g. "100.0") for sites
// that always showed one before the toggle existed (1RM cards, weight-change deltas) — without it,
// weightToPref's kg-native passthrough shows a clean number with no padding, which is correct for
// most sites but would silently drop a decimal these specific ones always displayed.
function fmtWeight(kg, { spaced = false, decimals = null } = {}) {
  if (kg == null || kg === '') return ''
  let v = weightToPref(kg)
  if (v === '') return ''
  if (decimals != null) v = parseFloat(v).toFixed(decimals)
  return `${v}${spaced ? ' ' : ''}${window._unitPrefs.weight}`
}

function jumpHeightToPref(cm) {
  if (cm == null || cm === '') return ''
  const v = parseFloat(cm)
  if (isNaN(v)) return ''
  if (window._unitPrefs.jumpHeight !== 'in') return v
  return _stripTrailingZero((v * _JUMP_CM_TO_IN).toFixed(1))
}
function jumpHeightFromPref(val) {
  if (val == null || val === '') return null
  const v = parseFloat(val)
  if (isNaN(v)) return null
  return window._unitPrefs.jumpHeight === 'in' ? v / _JUMP_CM_TO_IN : v
}
function fmtJumpHeight(cm, { spaced = false } = {}) {
  if (cm == null || cm === '') return ''
  const v = jumpHeightToPref(cm)
  if (v === '') return ''
  return `${v}${spaced ? ' ' : ''}${window._unitPrefs.jumpHeight}`
}

// Shared DB-write core for the units preference (2026-08-08) — extracted so the Settings page's own
// units card and the new quick-prefs popover (below) both write through one place instead of
// duplicating the update/overwrite logic. Returns the Supabase error (or null) so each caller can
// show its own inline success/failure message in whatever shape it already uses.
async function _saveUnitPrefs(weight, jumpHeight, cardioDistance) {
  const { error } = await db.from('profiles').update({
    weight_unit: weight, jump_height_unit: jumpHeight, cardio_distance_unit: cardioDistance
  }).eq('id', currentUser.id)
  // No page reload needed — every render function reads window._unitPrefs fresh on each render.
  if (!error) window._unitPrefs = { weight, jumpHeight, cardioDistance }
  return error
}

// ─── QUICK PREFERENCES — icon + popover (2026-08-08) ───────────────────────────
// Jake, live: the units toggle (above) and the cardio-capture toggles (app-runner.js) both need to be
// reachable "on the fly" from the builder and the runner, not just buried in Settings — via a small
// icon that opens a compact panel, not permanent inline pills. One shared component, dropped into
// any page header with a single call to _quickPrefsIconHtml(). Reuses the app's existing
// .modal-overlay/.modal pattern (mountModal, standard z-index:200) rather than a new anchored-popover
// mechanism — this app has no anchored-popover precedent, and a small centered modal gives the same
// "tap icon, get a compact panel" feel with zero new CSS.
function _quickPrefsIconHtml() {
  return `<button onclick="_openQuickPrefsPopover()" title="Preferences" style="width:36px;height:36px;border-radius:var(--radius-sm, 8px);border:1px solid var(--border);background:var(--surface);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:var(--text-xl, 16px)">⚙</button>`
}

function _openQuickPrefsPopover() {
  // Cardio-capture toggles live in app-runner.js (_loadCardioCaptureToggles) — this popover is the
  // second of two entry points into that SAME localStorage-backed state (the runner's own
  // exercise-finish capture card is the other), so a change from either place is visible in both.
  const capture = typeof _loadCardioCaptureToggles === 'function' ? _loadCardioCaptureToggles() : null
  const chip = (label, key) => `<button type="button" onclick="_toggleQuickPrefsCapture('${key}')" style="padding:7px 12px;font-size:12.5px;font-weight:700;border-radius:20px;cursor:pointer;border:1px solid ${capture[key]?'var(--accent)':'var(--border)'};background:${capture[key]?'var(--accent)':'var(--surface-2)'};color:${capture[key]?'#fff':'var(--text-muted)'}">${label}</button>`

  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.id = 'quick-prefs-modal'
  // The runner is a fullscreen z-index:300 layer — opened from there this needs to sit above it,
  // same convention _showExerciseSetsModal already uses from the runner's swap/add flow.
  if (document.getElementById('workout-runner')) overlay.style.zIndex = '1000'
  overlay.innerHTML = `
    <div class="modal" style="max-width:360px">
      <div class="modal-header">
        <h2 class="modal-title">Preferences</h2>
        <button class="modal-close" onclick="closeModal('quick-prefs-modal')">✕</button>
      </div>
      <div class="field">
        <label class="field-label">Weight</label>
        <select class="field-input" id="qp-unit-weight">
          <option value="kg"${window._unitPrefs.weight==='kg'?' selected':''}>Kilograms (kg)</option>
          <option value="lb"${window._unitPrefs.weight==='lb'?' selected':''}>Pounds (lb)</option>
        </select>
      </div>
      <div class="field">
        <label class="field-label">Jump height</label>
        <select class="field-input" id="qp-unit-jump">
          <option value="cm"${window._unitPrefs.jumpHeight==='cm'?' selected':''}>Centimetres (cm)</option>
          <option value="in"${window._unitPrefs.jumpHeight==='in'?' selected':''}>Inches (in)</option>
        </select>
      </div>
      <div class="field">
        <label class="field-label">Cardio distance</label>
        <select class="field-input" id="qp-unit-distance">
          <option value="km"${window._unitPrefs.cardioDistance==='km'?' selected':''}>Kilometres (km)</option>
          <option value="mi"${window._unitPrefs.cardioDistance==='mi'?' selected':''}>Miles (mi)</option>
        </select>
      </div>
      ${capture ? `
      <div class="field">
        <label class="field-label">Log during cardio/interval workouts</label>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${chip('HR', 'hr')}${chip('Watts', 'watts')}${chip('Pace', 'pace')}${chip('Stroke rate', 'strokeRate')}
        </div>
      </div>` : ''}
      <p class="modal-error" id="qp-msg" style="color:var(--text-muted)"></p>
      <button class="btn-primary" style="width:100%" onclick="_saveQuickPrefs()">Done</button>
    </div>`
  mountModal(overlay)
}

// The capture chips act immediately (localStorage, no save step, matches the runner card's own
// behaviour) — only re-renders the popover to reflect the new toggle state.
function _toggleQuickPrefsCapture(key) {
  const t = _loadCardioCaptureToggles()
  t[key] = !t[key]
  _saveCardioCaptureToggles(t)
  _openQuickPrefsPopover()
}

async function _saveQuickPrefs() {
  const weight = document.getElementById('qp-unit-weight')?.value
  const jumpHeight = document.getElementById('qp-unit-jump')?.value
  const cardioDistance = document.getElementById('qp-unit-distance')?.value
  const msg = document.getElementById('qp-msg')
  const error = await _saveUnitPrefs(weight, jumpHeight, cardioDistance)
  if (error) {
    log.error('_saveQuickPrefs', 'update failed', error)
    if (msg) msg.textContent = 'Save failed — try again.'
    return
  }
  closeModal('quick-prefs-modal')
}

// ─── SHELL HELPERS ────────────────────────────────────────────────────────────
// The empty-state for a phase with no sessions — the fix for the 2026-07-13 CRITICAL live crash
// ("a phase with zero sessions kills the coach's entire client Programs tab"). weekNums.length === 0
// is a normal state for a phase not yet filled in, and the pre-fix code went straight to
// weekMap[weekNums[0]] → renderDays(undefined) → throw, which killed the WHOLE innerHTML assignment,
// so every other phase vanished too.
//
// Shared because the guard exists at TWO render sites that are otherwise different shapes and cannot
// be collapsed further: app-programs.js renderClientPrograms (coach → client profile → Programs) and
// app-workouts.js renderClientWorkoutsPage (the client/solo Workouts page, which renders week TABS).
// They were byte-identical copy-pasted literals until 2026-08-22, so they could drift silently.
//
// BOTH sites are tested, one spec each — verified by neutering each guard in turn:
//   app-programs.js:140  → tests/regression-2026-07-13.spec.js  ("a phase with zero sessions…")
//   app-workouts.js:747  → tests/client-workout.spec.js         ("a phase with no sessions assigned yet…")
// An earlier version of this comment claimed only the first was covered. That was wrong: I neutered
// the app-workouts guard and ran the app-PROGRAMS spec, which of course still passed. Running the
// right spec against it fails with the original crash, `Cannot read properties of undefined (reading
// 'forEach')`. Testing the wrong path and concluding from it is a mistake worth naming here, because
// it is the same one that nearly got a live test reported as decorative the same day.
const NO_SESSIONS_EMPTY_STATE =
  '<div style="padding:10px 14px;font-size:12px;color:var(--text-muted)">No sessions added to this phase yet</div>'

function escapeHtml(str) {
  if (!str) return ''
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')
}

// For a user-controlled string interpolated into a JS string literal INSIDE an HTML attribute,
// e.g. onclick="openSessionDetail('${escapeAttr(name)}')".
//
// Order matters and is not interchangeable. The browser HTML-decodes an attribute value BEFORE the
// JS parser sees it, so we must JS-escape first and HTML-escape second — then the decode step hands
// the JS parser exactly the escaping we intended:
//   O'Brien  -> JS-escape -> O\'Brien -> HTML-escape -> O\&#39;Brien -> (decode) -> O\'Brien -> 'O'Brien' ✓
// Escaping in the other order, or with escapeHtml alone, decodes &#39; back to a bare quote and
// terminates the JS string. A bare .replace(/'/g,"\\'") — the pattern this replaces — left `"` live,
// which closes the HTML attribute itself and allows an injected event handler.
function escapeAttr(str) {
  if (!str) return ''
  // Newlines too: a raw newline inside a JS string literal in an inline handler is a SyntaxError and
  // breaks the handler. (No injection risk — the quotes and angle brackets are already neutralised —
  // but a textarea-sourced value like a program description can contain them.)
  return escapeHtml(String(str)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r'))
}

// Mount a modal/overlay, REPLACING any existing node with the same id.
//
// Several modals build their overlay, `await` a fetch, and only then append — a genuine race window,
// not merely a fast double-tap. Two overlays sharing element ids is silently corrupting: the user sees
// and types into the SECOND (painted on top), while getElementById resolves to the buried FIRST, so
// the save reads stale values and reports success. The visible modal's own ✕ can't close it either,
// because closeModal also only ever finds the first. That is exactly what froze the exercise picker
// on 2026-07-04 and what makes a double-tapped Edit dialog save the un-edited values.
//
// Guarding at function entry does NOT fix the await version — both callers pass the check before
// either appends. It has to happen at mount.
function mountModal(node) {
  if (node.id) document.getElementById(node.id)?.remove()
  document.body.appendChild(node)
}

function showAuth() {
  // Drop the consent gate if it is still mounted. It is position:fixed, so a session that dies while
  // it is up (token-refresh failure, sign-out in another tab) would leave it painted over the login
  // form, and "Agree and continue" would then throw on a null currentUser.
  document.getElementById('consent-gate-modal')?.remove()
  document.getElementById('auth-screen').style.display = 'flex'
  document.getElementById('app-shell').style.display   = 'none'
}

// ─── UK GDPR CONSENT GATE (read-side, 2026-08-24) ─────────────────────────────
// The write-side checkbox on #invite-form covers ONE of three routes to an active account. The
// pre-push review proved the other two are ungated: #new-password-form (the recovery link — the
// app's own documented fallback for an expired invite, and how the real 2026-08-09 beta tester was
// recovered) and coach accounts, which are provisioned directly and never see an invite form.
// Every account that existed before 2026-08-24 also has no consent and no way to give one.
//
// A read-side gate closes all of that in ONE place: it does not care how you got here, only whether
// consent is on record. It also covers re-consent after a policy edit, which PRIVACY_POLICY_VERSION
// described but nothing implemented.
//
// ⚠️ THE FETCH IS SEPARATE FROM loadUserInfo's ON PURPOSE, and it FAILS OPEN.
// If these columns were added to loadUserInfo's select and the migration had not been run, that
// select would ERROR -> currentProfile null -> showApp's fail-closed branch -> the app is dead for
// EVERY user including the owner. A gate whose failure mode is total lockout is far worse than the
// gap it closes. So: unreadable consent state means "do not prompt", never "block". Once the
// migration lands the gate simply starts working.
async function _loadConsentState () {
  // try/catch is not decoration. The whole gate rests on "unreadable means do not prompt", and
  // postgrest-js only *happens* to resolve rather than throw (it catches internally unless
  // .throwOnError() is set). Inheriting that property from a library version is not the same as
  // guaranteeing it: one upgrade, or one non-postgrest throw, and showApp() would reject mid-boot —
  // shell visible, no nav, no modal, no in-app escape. Make the promise structural.
  try {
    const { data, error } = await db
      .from('profiles')
      .select('consented_at, consent_policy_version')
      .eq('id', currentUser.id)
      .maybeSingle()
    if (error) {
      // 42703 = column does not exist (migration not run). Anything else = transient. Both "unknown".
      log.warn('consent', 'consent state unreadable — not prompting', { code: error.code })
      return null
    }
    return data
  } catch (e) {
    log.warn('consent', 'consent lookup threw — not prompting', { name: e?.name })
    return null
  }
}

// null row (unknown) never blocks. A stored version that is not the CURRENT one re-prompts, which is
// what makes a policy edit re-take consent rather than silently inheriting the old agreement.
function _needsConsent (row) {
  if (!row) return false
  if (!row.consented_at) return true
  return row.consent_policy_version !== PRIVACY_POLICY_VERSION
}

function showConsentGate (isReconsent) {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.id = 'consent-gate-modal'
  // Deliberately NOT dismissable by clicking the backdrop, and no ✕ — the only ways out are giving
  // consent or signing out. Above everything, including the runner's z-index:300 layer.
  overlay.style.zIndex = '1000'
  overlay.innerHTML = `
    <div class="modal" style="max-width:460px;width:92%">
      <div class="modal-header">
        <h2 class="modal-title">${isReconsent ? 'Our privacy policy has changed' : 'Before you continue'}</h2>
      </div>
      <div style="padding:16px 20px 20px">
        <p style="font-size:var(--text-base, 13px);color:var(--text-muted);margin:0 0 14px;line-height:1.6">
          ${isReconsent
            ? 'We\'ve updated our privacy policy since you last agreed. Please read it and confirm you\'re happy to continue.'
            : 'CoachApp stores health and training data about you. Before you carry on, please read our privacy policy and confirm you agree.'}
        </p>
        <label style="display:flex;gap:10px;align-items:flex-start;cursor:pointer;font-size:var(--text-lg, 14px);line-height:1.5;margin-bottom:16px">
          <input type="checkbox" id="consent-gate-box" style="margin-top:3px;flex:none;width:16px;height:16px;accent-color:var(--accent, #6366f1);cursor:pointer"
                 onchange="document.getElementById('consent-gate-accept').disabled = !this.checked">
          <span>I have read and agree to the <a href="${PRIVACY_POLICY_URL}" target="_blank" rel="noopener" style="color:var(--accent, #6366f1);font-weight:600">Privacy Policy</a>.</span>
        </label>
        <p id="consent-gate-error" style="font-size:var(--text-base, 13px);color:var(--danger, #ef4444);margin:0 0 12px;min-height:18px"></p>
        <div style="display:flex;gap:10px">
          <button id="consent-gate-accept" class="btn-primary" disabled onclick="acceptConsent()" style="flex:1">Agree and continue</button>
          <button class="btn-secondary" onclick="signOutFromConsentGate()" style="flex:none">Sign out</button>
        </div>
      </div>
    </div>`
  mountModal(overlay)
}

async function signOutFromConsentGate () {
  document.getElementById('consent-gate-modal')?.remove()
  await db.auth.signOut()
  showAuth()
}

// Writes the consent and VERIFIES it landed. Unlike the invite-form path — where the password is
// already set, so refusing would strand a legitimate user with no route back — the user here is
// simply signed in and can retry or sign out. So this one does NOT proceed on a failed write: an
// unverified consent is the whole thing we are trying to stop recording as if it were real.
async function acceptConsent () {
  const btn = document.getElementById('consent-gate-accept')
  const errEl = document.getElementById('consent-gate-error')
  if (!document.getElementById('consent-gate-box')?.checked) return
  btn.disabled = true
  btn.textContent = 'Saving…'
  errEl.textContent = ''

  let data
  try {
    ;({ data } = await dbq('acceptConsent', db.from('profiles').update({
      consented_at: new Date().toISOString(),
      consent_policy_version: PRIVACY_POLICY_VERSION
    }).eq('id', currentUser.id).select('id'), { showUserError: false }))
  } catch (e) {
    // Without this the button sticks on "Saving…" with an EMPTY error line — the user is told
    // nothing at all. Same restore the invite form already does on its error path.
    log.warn('acceptConsent', 'consent write threw', { name: e?.name })
    errEl.textContent = 'We couldn\'t save that. Please try again, or sign out and contact support.'
    btn.disabled = false
    btn.textContent = 'Agree and continue'
    return
  }

  // A policy-refused UPDATE returns { data: [], error: null } — no error, zero rows. Asserting on
  // the row is the only way to tell "saved" from "silently refused".
  if (!data?.length) {
    log.error('acceptConsent', 'consent did not save', { userId: currentUser.id })
    errEl.textContent = 'We couldn\'t save that. Please try again, or sign out and contact support.'
    btn.disabled = false
    btn.textContent = 'Agree and continue'
    return
  }

  log.ok('acceptConsent', 'consent recorded', { version: PRIVACY_POLICY_VERSION })
  document.getElementById('consent-gate-modal')?.remove()
  showApp()
}

async function showApp() {
  document.getElementById('auth-screen').style.display = 'none'
  document.getElementById('app-shell').style.display   = 'flex'
  await loadUserInfo()
  // A failed profiles fetch (network blip, transient RLS/schema hiccup) leaves currentProfile null.
  // Every role check below (`role === 'client' ? ... : role === 'solo' ? ... : coach-default`) treats
  // an unrecognised role as 'coach' — so falling through here would silently hand a solo_only or
  // client account the full coach nav/dashboard shell, exactly the outcome solo_only exists to
  // prevent, on nothing more than a transient error. Fail closed instead of fail open. Found by
  // multi-agent review, 2026-07-24.
  if (!currentProfile) {
    document.getElementById('main-content').innerHTML = '<div class="loading-state">Couldn\'t load your account. <a href="#" onclick="showApp();return false" style="color:var(--accent)">Retry</a></div>'
    return
  }

  // UK GDPR consent gate. Deliberately placed AFTER the fail-closed profile check (so a broken boot
  // is still a broken boot, not a consent prompt) and BEFORE applyRoleUI/navigate (so no page renders
  // until consent is on record). Role-agnostic on purpose: coach, client and solo all pass here, and
  // this is the only route that catches accounts which never saw an invite form.
  const _consent = await _loadConsentState()
  if (_needsConsent(_consent)) {
    log.info('consent', 'consent required before app use', { reconsent: !!_consent?.consented_at })
    showConsentGate(!!_consent?.consented_at)
    return
  }

  applyRoleUI()
  const role = currentProfile?.role
  const defaultPage = role === 'client' ? 'client-dashboard' : role === 'solo' ? 'solo-dashboard' : 'dashboard'
  const clientPages = ['client-dashboard', 'workouts', 'calendar', 'progress', 'settings']
  const soloPages   = ['solo-dashboard', 'workouts', 'library', 'programs', 'calendar', 'progress', 'settings']
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
    .select('full_name, role, starter_seeded, solo_only, weight_unit, jump_height_unit, cardio_distance_unit')
    .eq('id', currentUser.id)
    .single()

  if (error) log.error('loadUserInfo', 'profile fetch failed', error)
  currentProfile = data
  window._unitPrefs = {
    weight: data?.weight_unit || 'kg',
    jumpHeight: data?.jump_height_unit || 'cm',
    cardioDistance: data?.cardio_distance_unit || 'km',
  }

  // If profile has no role (invited client whose profile row may have been created without role),
  // check the clients table to determine correct role. Gated on `!error`: a FAILED fetch (network
  // blip, a stale column in this select during a migration window, any transient error) also leaves
  // currentProfile.role falsy, and this block WRITES role:'client' back to the row the moment it finds
  // any clients record for this user_id — including a coach's own self-referential solo row. A real
  // coach account was silently downgraded to 'client' this way on 2026-07-24 (a select referencing a
  // column added moments earlier by a live migration failed mid-session; the self-repair "healed" a
  // perfectly fine coach into a client because it couldn't tell a genuinely-null role from a failed
  // fetch). Only ever infer/patch a role from an actually-successful, genuinely-null read.
  if (!error && (!currentProfile?.role || currentProfile.role === null)) {
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
  // The `|| (role === 'coach' && solo_only)` half is deliberate defense against migration/deploy
  // ordering: scripts/migrate-solo-role-2026-08-01.sql must be run by hand to flip role to 'solo',
  // and this app auto-deploys on push — so if the code deploys before someone runs the SQL, the one
  // real solo_only account is still sitting at role='coach', solo_only=true. This branch ensures BOTH
  // the role display AND the lockout are correct regardless of migration timing: without the OR
  // clause AND the reassignment just inside it, that account would either fall through to the
  // master-account branch below (reopening the "no escape hatch to coach" lockdown a previous session
  // closed, and permanently mis-seeding starter content with is_personal:false), or — with only the
  // OR clause and no reassignment — get stuck rendering the full coach dashboard shell with no path to
  // its solo view at all (role stays 'coach' downstream, _masterAccount correctly never gets set so
  // switchView is a no-op). Both pre- and post-migration shapes now hit this SAME branch AND end up
  // with the same in-memory role.
  if (currentProfile?.role === 'solo' || (currentProfile?.role === 'coach' && currentProfile?.solo_only)) {
    // role='solo' is now a genuine, permanently-stored value for a MIGRATED account (2026-08-01).
    // For the transitional (not-yet-migrated) shape above, currentProfile.role is still 'coach' at
    // this point — reassign it so applyRoleUI/renderNav, defaultPage/validPages (below), and every
    // other role === 'solo' check downstream treats this account identically to a migrated one.
    if (currentProfile?.role !== 'solo') currentProfile = { ...currentProfile, role: 'solo' }
    // The one thing this account still needs looked up is its own self-referential clients row, for
    // window._soloClientId (used throughout the other 8 modules).
    const { data: soloRec, error: soloErr } = await db.from('clients').select('id').eq('user_id', currentUser.id).is('coach_id', null).maybeSingle()
    if (soloErr) log.error('loadUserInfo', 'solo clients lookup failed', soloErr)
    if (soloRec) window._soloClientId = soloRec.id
  } else if (currentProfile?.role === 'coach') {
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

  // Brand-new coach OR native solo account: seed the starter library/workout/program once, before
  // anything renders, so the dashboard isn't a blank slate on first login. Idempotent (see
  // _seedStarterContent). Checked against the RAW fetched `data.role`, not `currentProfile.role` —
  // the block above may already have reassigned currentProfile.role to 'client'/'solo' (master
  // account view-switch), but the underlying account is still genuinely a never-seeded coach either
  // way. Jake and every existing account carry starter_seeded=true from the migration, so this never
  // fires for them; a brand-new coach (master account or not) has no client rows yet the first time
  // this runs, so it seeds correctly regardless of which branch above reassigned the display role. A
  // genuinely native role='solo' account (its own real, stored role — not a master-account
  // view-switch reassignment) also needs seeding on its first login, hence 'coach' OR 'solo' here.
  if ((data?.role === 'coach' || data?.role === 'solo') && data?.starter_seeded === false) {
    const main = document.getElementById('main-content')
    if (main) main.innerHTML = '<div class="loading-state">Setting up your account…</div>'
    await _seedStarterContent()
  }
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
        <span style="font-size:var(--text-2xs, 9px);color:var(--text-muted);font-weight:600;letter-spacing:.06em;text-transform:uppercase">powered by CoachApp</span>
      </div>`
  } else if (b.businessName) {
    brand.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:4px 0">
        <span style="font-size:var(--text-xl, 16px);font-weight:700;color:var(--text);line-height:1.2">${escapeHtml(b.businessName)}</span>
        <span style="font-size:var(--text-2xs, 9px);color:var(--text-muted);font-weight:600;letter-spacing:.06em;text-transform:uppercase">powered by CoachApp</span>
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
  library:          `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>`,
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
    { page: 'library',       label: 'Library'    },
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
  // Needs its own guard even though navigate() has one: switchView calls applyRoleUI() FIRST, which
  // paints the nav behind the modal before navigate() ever refuses. The overlay is z-index:1000 so
  // the "View as" buttons are not clickable, but nothing traps focus — they are reachable by Tab.
  // This is the owner's own account shape, which is precisely the account the gate most needs to hold.
  if (document.getElementById('consent-gate-modal')) return
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
// Public self-signup removed 2026-07-24 (Jake): accounts are provisioned only by Jake creating the
// auth user directly and handing over credentials — the login screen must not offer any path to
// create one. This closes the CLIENT-SIDE path; Supabase Auth's "Allow new users to sign up" must
// also be turned off in the dashboard, since db.auth.signUp() is callable directly (devtools/API)
// regardless of whether this UI exists.

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
  // The consent gate is a GATE, not a dialog — it is the one overlay this must not clear.
  // Guarded HERE rather than in each caller because every route into the app funnels through
  // navigate(): popstate (browser Back), switchView, the nav click handlers, and showApp itself.
  // Found by the pre-push review 2026-08-24: the gate mounts and showApp returns WITHOUT pushing a
  // history entry, so the entries from before a reload survive — press Back and popstate called
  // navigate(), which removed the gate and painted the full app for an unconsented user. Re-consent
  // after a policy edit made that near-certain rather than exotic, since by construction it hits
  // people who are already using the app and already have history.
  if (document.getElementById('consent-gate-modal')) return
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
    case 'programs':
      // Defense-in-depth only: RLS already returns 0 rows for a client here, so nothing leaks --
      // but the builder chrome itself (e.g. "+ New program") still rendered for a client with no
      // server-side reason to ever reach this page. Found by the multi-agent review, 2026-07-18.
      if (currentProfile?.role === 'client') { container.innerHTML = '<div class="loading-state">Page not found</div>'; break }
      _catch('programs',         renderPrograms);         break
    case 'clients':          _catch('clients',          renderClients);          break
    case 'workouts':         _catch('workouts',         renderWorkouts);         break
    case 'library':          _catch('library',          renderWorkoutLibrary);   break
    case 'calendar':         _catch('calendar',         renderCalendar);         break
    case 'settings':         _catch('settings',         renderSettings);         break
    case 'progress':         _catch('progress',         renderProgress);         break
    default: container.innerHTML = '<div class="loading-state">Page not found</div>'
  }
}

// Repaints whichever self-view dashboard the user is ACTUALLY on.
//
// Four separate post-write callbacks used to hardcode `renderClientDashboard(...)` — but the
// controls that trigger them are rendered on BOTH self-view dashboards. A solo user hitting one
// landed in renderClientDashboard, whose coached-record lookup finds nothing for a `coach_id IS
// NULL` row, so the whole page became "Unable to load your profile. Please contact your coach."
// Reproduced live 2026-08-11 by tapping a goal milestone in Personal view.
//
// Two of the four (saveClientPB / saveClientWeight, app-clients.js) already branched correctly, so
// this had drifted rather than never been known — exactly the shape the standing rule is about:
// put the branch in ONE shared helper so the copies cannot disagree again.
//
// NOT for coach-facing surfaces. A coach acting on a client renders that client's tab, not a
// dashboard — those callers check for their own container first and only fall through to here.
function _renderOwnDashboard() {
  const main = document.getElementById('main-content')
  if (!main) return
  if (currentProfile?.role === 'solo') renderSoloDashboard(main)
  else renderClientDashboard(main)
}

// Returns the client_id for the current view context
// Solo view → personal record. Client view → coached record.
// ONE ownership check for every write keyed on a caller-supplied clientId — client_1rms,
// performance_logs, weight_logs and the clients row itself. TWELVE such writes took clientId as a
// bare parameter and never re-verified it, across app-progress.js, app-runner.js, app-clients.js and
// app-programs.js (2026-08-12 audit).
// Lives in app-core because four modules need it; a per-module copy is how the next new write
// function quietly reintroduces the gap — and app-clients.js proved that on 2026-08-22, when its own
// strict-self copy broke "View as" while this helper handled it correctly.
//
// THIS COMMENT NO LONGER STATES A COUNT, DELIBERATELY. It said TEN (naming only app-progress and
// app-runner), then TWELVE, and an independent sweep then found FOURTEEN call sites plus a fifteenth
// member that was still unguarded (saveNewGoal). Three wrong numbers in two days, each one written
// with more confidence than the last. The count was never the useful part — a stale number reads as a
// closed class and stops the next person looking.
//
// THE RULE, which does not go stale: any function taking a clientId (or any client-scoped row id) as a
// parameter and then writing to client_1rms, performance_logs, weight_logs, client_check_ins, goals or
// clients must call this helper FIRST — and the write must then be keyed on the SAME id the helper
// verified. On 2026-08-22 four sites verified `clientId` and then wrote `.eq('id', someOtherId)`, which
// made the guard decorative: pass your own clientId, target someone else's row. Verifying one fact and
// writing on another is worse than no guard, because it reads as anchored.
//
// If you extend this, grep it yourself. Do not trust a number in a comment — including this one's
// absence of one.
//
// Deliberately modelled on saveRunnerSession (app-runner.js:2345), NOT on _effectiveCoachIdForClient
// (app-workouts.js:1913). The difference is the whole point:
//   - saveRunnerSession REFUSES when the client row is not visible. Its comment records why —
//     "Confirmed exploitable via a live cross-tenant probe, 2026-07-30": the unverified version let a
//     coach's save attribute a workout log to someone else's client.
//   - _effectiveCoachIdForClient ends `|| currentUser.id`, so an RLS-denied read silently becomes
//     "it's mine". That is its own open bug (2026-08-17-effectivecoachidforclient-swallows-an-rls-denial)
//     and must not be the model for a security check.
//
// Two legitimate shapes, because the caller may be either side of the relationship:
//   - coach_id === me  → a client I coach
//   - user_id  === me  → my OWN record, whether I am a client or a solo user (solo's coach_id is NULL
//                        by design, so a coach_id-only test would exclude solo — four bugs of that
//                        exact shape have shipped here)
// Anything else, including an unreadable row, fails CLOSED.
async function _verifyClientAccess(fnName, clientId) {
  if (!clientId) { log.error(fnName, 'ownership check failed — no clientId'); return false }
  const { data } = await db.from('clients').select('id, coach_id, user_id').eq('id', clientId).maybeSingle()
  if (!data) { log.error(fnName, 'ownership check failed — client not visible', { clientId }); return false }
  if (data.coach_id === currentUser.id || data.user_id === currentUser.id) return true
  log.error(fnName, 'ownership check failed — client is neither mine nor me', { clientId })
  return false
}

async function _getCurrentClientId() {
  if (currentProfile?.role === 'solo') return window._soloClientId || null
  const { data } = await db.from('clients').select('id').eq('user_id', currentUser.id).not('coach_id', 'is', null).maybeSingle()
  return data?.id || null
}

// Browser back/forward — re-render without pushing another history entry
window.addEventListener('popstate', e => {
  // navigate() already refuses while the consent gate is up, but refusing alone would let Back walk
  // the user OFF the page entirely (the browser has already popped the entry by the time we run).
  // Re-anchor so Back is inert rather than an exit: they consent, or they use Sign out.
  if (document.getElementById('consent-gate-modal')) {
    history.pushState(e.state, '', window.location.href)
    return
  }
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
