# ③ Progress Display Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the "My Progress" per-exercise view into `metric_type`-aware trend cards (with a date-range selector, smart aggregation, and per-metric toggles), add a resting-HR trend to the Body tab and avg-HR to cardio, and demote the per-session list to a lightweight "Recent sessions" diary — so all the data the capture layer (①–②d) now stores is finally visible over weeks/months/years.

**Architecture:** A shared, pure data layer (`_buildExerciseSeries` + pure metric/aggregation helpers) reads `workout_log_exercises` (now carrying `metric_type`) with all typed set columns, groups by exercise, and produces per-session metric points. A single `_renderTrendCard(ex, opts)` renders one card whose toggle chips and chart switch on `metric_type`. All charting stays on Chart.js with the existing destroy-before-rebuild + token-guard patterns. This targets the **client/solo self-view only**; the coach-facing render is ④.

**Tech Stack:** Vanilla ES6 (no build step), Supabase (`supabase-js` v2), Chart.js (already loaded), Playwright E2E.

## Global Constraints

- **No build step.** Edits land in `js/app-progress.js`; bump `app-progress.js?v=12` → `v=13` in `index.html` in the SAME commit as the first code change, then keep bumping per commit only if it changes again (one bump is enough per push, but bump on the first change so preview reflects it during the build).
- **Extend the existing flat CoachApp card style — do NOT invent a new visual language.** Reuse the current per-exercise card shell (`padding:14px;border-radius:12px;background:var(--surface);border:1px solid var(--border)`, `--accent` line charts, `--text-muted` labels). Jake rejected an earlier mockup as "looks like PTHub" — match siblings exactly (`renderProgressWeight`, the current `_renderPerfExerciseList`).
- **Chart.js only** — no new dependency. Every `new Chart(...)` must be tracked in a module array and `.destroy()`'d before the next render (the existing `_perfExerciseCharts` leak-guard pattern), because search/toggle/range re-renders fire repeatedly.
- **Token-guard every async fetch** that a view-switch could interleave (the existing `_perfExerciseToken` pattern) — the master account switching Client/Personal mid-fetch must not paint the wrong client's data.
- **Scope = client/solo self-view.** ③ rebuilds what `renderPerformance` / `renderProgressWeight` show to the logged-in client/solo user. The coach's client-profile view is **④ coach parity**, a later sub-project. Do not touch `renderClientPerformance`/`renderClientWeight` here.
- **`metric_type` is on `workout_log_exercises`** (denormalized by ①); a logged row's `exercise_id` is nullable, so group/series by `exercise_name`, never by a join back to `exercises`. Legacy rows default `weight_reps`/`cardio` (backfilled) — handle a missing/unknown metric_type by falling back to `weight_reps`.
- **Empty/zero states everywhere** (les-032): an exercise with no usable points, a metric with all-null values (e.g. HR never entered), a single data point (chart needs ≥2 — show the headline stat + "Log another session to see a trend"). Never crash a `.length`/`Math.max(...[])` on empty.
- **No PII/health values in `log.*`.**

## Design decisions (resolved from the spec; the Task-1 checkpoint confirms the visual direction with Jake)

- **Default range = `All`** (beta data is sparse; showing everything is the safest default). Selector: `1M · 3M · 6M · 1Y · All`.
- **Aggregation** (keep long charts readable): if the visible window holds > 40 points → bucket **weekly** (one point per ISO week, taking the metric's best/representative value); if > 120 points → bucket **monthly**. Otherwise raw per-session points. Aggregation takes `max` for "best" metrics (top weight, e1RM, jump, hold) and `mean` for rate metrics (pace, avg HR); volume/distance take the per-bucket `max` session (not sum) so the trend reads as "best session that week," consistent with the other cards.
- **Default metric per type** (the chip shown selected first): weight_reps → **Top weight** (matches today), with **Est 1RM** (Epley) and **Volume** chips; cardio → **Distance** (fallback **Duration** when distance is 0), with **Pace** and **Avg HR** chips (a chip is hidden if that metric has zero data across the range); unilateral → **Top weight** with dual L/R lines always; timed_hold → **Duration**; jump_height → **Height**; jump_distance → **Distance**.
- **Est 1RM = Epley:** `weight * (1 + reps/30)`, taken as the max over a session's sets; only shown for weight_reps/unilateral where reps exist.
- **Per-session becomes a diary:** collapsed by default, last 10, and **"Per exercise" becomes the default Performance sub-tab** (the progression tool leads; the diary follows).

---

### Task 1: Data layer + metric_type-aware trend card (weight_reps) + range selector — THE VISIBLE SLICE

**Files:**
- Modify: `js/app-progress.js` — replace `renderProgressStrength` (:1207) + `_renderPerfExerciseList` (:1240) with the metric_type-aware version; add pure helpers `_epley1RM`, `_bucketKey`, `_aggregateSeries`, `_metricPointsFor`, `_buildExerciseSeries`, `_renderTrendCard`
- Modify: `index.html` — `app-progress.js?v=12` → `v=13`
- Test: `tests/progress-trend.spec.js` (new)

**Interfaces:**
- Produces:
  - `_epley1RM(weightKg, reps) → number` (0 if either missing)
  - `_metricPointsFor(exercise) → { name, metricType, points: [{date, topWeight, e1rm, volume, leftTop, rightTop, maxDuration, bestHeight, bestDistance, totalDistance, totalDuration, pace, avgHr}], best }` — only the keys relevant to the type are populated; others undefined
  - `_aggregateSeries(points, metricKey, mode) → [{label, value}]` where `mode ∈ {'max','mean'}`, bucketed per the aggregation rule for the active range
  - `_buildExerciseSeries(clientId) → [exercise]` (all types, alphabetical), cached in `window._trendCache`
  - `_renderTrendCard(ex, metricKey, range) → html string` and `window._trendState = { range, metricByEx: {} }`
- Consumes: nothing from later tasks.

- [ ] **Step 1: Write the failing pure-helper tests**

```js
// tests/progress-trend.spec.js
const { test, expect } = require('@playwright/test')
const { loginAsPT } = require('./helpers')

test.describe('Sub-project 3 — progress trend helpers', () => {
  test('Epley 1RM and volume/topWeight points compute per session', async ({ page }) => {
    await loginAsPT(page)
    await page.waitForTimeout(500)
    const r = await page.evaluate(() => {
      const e1 = _epley1RM(100, 5)          // 100 * (1 + 5/30) = 116.67
      const ex = { exercise_name: 'Bench', metric_type: 'weight_reps', workout_logs: { date: '2026-07-01' },
        workout_log_sets: [ { weight_kg: 100, reps_achieved: 5 }, { weight_kg: 90, reps_achieved: 10 } ] }
      const p = _metricPointsFor({ name: 'Bench', metricType: 'weight_reps',
        sessions: [{ date: '2026-07-01', sets: ex.workout_log_sets }] }).points[0]
      return { e1, topWeight: p.topWeight, volume: p.volume, e1rm: Math.round(p.e1rm) }
    })
    expect(Math.round(r.e1)).toBe(117)
    expect(r.topWeight).toBe(100)
    expect(r.volume).toBe(100*5 + 90*10) // 1400
    expect(r.e1rm).toBe(117) // best set's Epley (100x5 → 116.7 > 90x10 → 120?) — see Step 3 note
  })

  test('aggregation buckets weekly when a window exceeds 40 points', async ({ page }) => {
    await loginAsPT(page)
    const n = await page.evaluate(() => {
      const pts = Array.from({length: 60}, (_, i) => ({ date: `2026-0${1+Math.floor(i/30)}-` + String((i%28)+1).padStart(2,'0'), topWeight: 100 + i }))
      return _aggregateSeries(pts, 'topWeight', 'max').length
    })
    expect(n).toBeLessThan(60)   // collapsed into weekly buckets
    expect(n).toBeGreaterThan(0)
  })
})
```

> **Step 3 note (resolve before writing):** e1RM per session is the **max Epley across that session's sets** — `90x10 → 90*(1+10/30)=120` actually exceeds `100x5 → 116.7`, so the expected `e1rm` for this fixture is **120**, not 117. Fix the assertion to `expect(r.e1rm).toBe(120)` when writing the test (kept here to force the author to compute it, not guess).

- [ ] **Step 2: Run to verify it fails**

Run: `npx playwright test tests/progress-trend.spec.js --reporter=list`
Expected: FAIL — `_epley1RM`/`_metricPointsFor`/`_aggregateSeries` undefined.

- [ ] **Step 3: Implement the pure helpers**

Add near the top of the Performance section in `js/app-progress.js`:

```javascript
// ── ③ metric_type-aware progress trends ─────────────────────────────────────────────────────────
// Pure helpers (unit-tested). A logged exercise's metric_type is denormalized onto
// workout_log_exercises (①); exercise_id is nullable, so series group by exercise_name.
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
        p.totalDistance = sets.reduce((s, x) => s + num(x.distance_m), 0)        // metres
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
function _aggregateSeries(points, metricKey, mode /* 'max' | 'mean' */) {
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
```

- [ ] **Step 4: Run the helper tests to verify they pass**

Run: `npx playwright test tests/progress-trend.spec.js --reporter=list`
Expected: PASS (with the Step-3-note `e1rm` fix applied).

- [ ] **Step 5: Rebuild the fetch + card render (weight_reps fully wired)**

Replace `renderProgressStrength` and `_renderPerfExerciseList` with a metric_type-aware version. Key changes vs. today:
- Fetch **all** logged exercises for the client (drop the `.eq('exercise_type','strength')` filter), selecting `metric_type` + every typed set column: `.select('exercise_name, metric_type, workout_logs!inner(date, client_id), workout_log_sets(weight_kg, reps_achieved, distance_m, duration_seconds, avg_hr, max_hr, height_cm, side)').eq('workout_logs.client_id', clientId)`.
- Group by `exercise_name` into `{ name, metricType, sessions: [{date, sets}] }` (metricType from the row; fallback `'weight_reps'`), sort sessions ascending; cache `window._trendCache` + `window._trendState = { range: 'All', metricByEx: {} }`.
- Render the search box (unchanged) + a **range selector** row (`1M · 3M · 6M · 1Y · All` pills, calling `_setTrendRange(r)`), then one `_renderTrendCard` per exercise.
- `_renderTrendCard(ex, metricKey, range)`: filter points to the range window; build the chart series via `_aggregateSeries`; render header (name + type badge + headline best) + **metric toggle chips** (only the type's relevant metrics; a chip hidden if that metric is all-zero) + an 80–100px canvas. Chips call `_setTrendMetric(exName, metricKey)`. For weight_reps: chips = Top weight / Est 1RM / Volume; badge text "Strength". Use the exact card/chart styling from the current `_renderPerfExerciseList`.
- Keep the leak-guard (`_perfExerciseCharts`) and token-guard (`_perfExerciseToken`).

Full weight_reps card + chart code (the pattern Tasks 2–3 extend):

```javascript
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

// Per-type chip config: [metricKey, label, aggMode, unit-formatter]. Chips with all-zero data are dropped.
const _TREND_METRICS = {
  weight_reps: [['topWeight','Top weight','max',v=>v+'kg'], ['e1rm','Est 1RM','max',v=>Math.round(v)+'kg'], ['volume','Volume','max',v=>Math.round(v)+'kg']],
  // cardio / unilateral / timed_hold / jump_* added in Tasks 2–3
}

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
  const cards = []
  list.forEach((ex, i) => {
    const series = _metricPointsFor(ex)
    const pts = series.points.filter(p => new Date(p.date).getTime() >= cutoff)
    const metrics = (_TREND_METRICS[ex.metricType] || _TREND_METRICS.weight_reps)
      .filter(([key]) => pts.some(p => (p[key] || 0) > 0))
    if (!metrics.length) { cards.push(_trendCardEmpty(ex, muted)); return }
    const activeKey = window._trendState.metricByEx[ex.name] && metrics.some(m => m[0] === window._trendState.metricByEx[ex.name])
      ? window._trendState.metricByEx[ex.name] : metrics[0][0]
    const active = metrics.find(m => m[0] === activeKey)
    const best = Math.max(...pts.map(p => p[activeKey] || 0))
    cards.push(`
      <div style="margin-bottom:20px;padding:14px;border-radius:12px;background:var(--surface);border:1px solid var(--border)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <span style="font-size:14px;font-weight:700">${escapeHtml(ex.name)}</span>
          <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted)">${_TREND_BADGE[ex.metricType]||'Strength'}</span>
        </div>
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">Best ${active[1].toLowerCase()}: ${active[3](best)} · ${pts.length} session${pts.length===1?'':'s'}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
          ${metrics.map(([key,label]) => `<button onclick="_setTrendMetric('${ex.name.replace(/'/g,"\\'")}','${key}')"
            style="padding:4px 10px;border:none;border-radius:12px;font-size:11px;font-weight:600;cursor:pointer;
                   background:${key===activeKey?'var(--accent)':'var(--surface-2)'};color:${key===activeKey?'#fff':'var(--text-muted)'}">${label}</button>`).join('')}
        </div>
        <div style="position:relative;height:90px"><canvas id="ps-chart-${i}"></canvas></div>
      </div>`)
    // chart drawn after innerHTML below
    listEl.dataset.pending = (listEl.dataset.pending || '') // no-op marker
  })
  listEl.innerHTML = cards.join('')
  // Draw charts now that canvases exist.
  list.forEach((ex, i) => {
    const canvas = document.getElementById(`ps-chart-${i}`); if (!canvas) return
    const series = _metricPointsFor(ex)
    const pts = series.points.filter(p => new Date(p.date).getTime() >= cutoff)
    const metrics = (_TREND_METRICS[ex.metricType] || _TREND_METRICS.weight_reps).filter(([key]) => pts.some(p => (p[key]||0) > 0))
    if (!metrics.length) return
    const activeKey = window._trendState.metricByEx[ex.name] && metrics.some(m => m[0]===window._trendState.metricByEx[ex.name])
      ? window._trendState.metricByEx[ex.name] : metrics[0][0]
    const active = metrics.find(m => m[0] === activeKey)
    const agg = _aggregateSeries(pts, activeKey, active[2])
    if (agg.length < 2) return
    _perfExerciseCharts.push(new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { labels: agg.map(a => a.label), datasets: [{ data: agg.map(a => a.value), borderColor: accent, borderWidth: 2, pointBackgroundColor: accent, pointRadius: 3, fill: false, tension: 0.3 }] },
      options: { responsive: true, maintainAspectRatio: false, animation: { duration: 200 },
        plugins: { legend: { display: false } },
        scales: { x: { grid: { display: false }, ticks: { color: muted, font: { size: 8 }, maxRotation: 0 } },
                  y: { grid: { color: 'rgba(150,150,150,0.08)' }, ticks: { color: muted, font: { size: 8 }, callback: v => active[3](v) } } } }
    }))
  })
}

const _TREND_BADGE = { weight_reps:'Strength', cardio:'Cardio', unilateral:'Unilateral', timed_hold:'Timed', jump_height:'Jump', jump_distance:'Jump' }
function _trendCardEmpty(ex, muted) {
  return `<div style="margin-bottom:20px;padding:14px;border-radius:12px;background:var(--surface);border:1px solid var(--border)">
    <div style="font-size:14px;font-weight:700;margin-bottom:4px">${escapeHtml(ex.name)}</div>
    <div style="font-size:11px;color:${muted}">Log another session to see a trend.</div></div>`
}
```

- [ ] **Step 6: Add a render smoke test** (append to `tests/progress-trend.spec.js`): as solo, drive `window._perfTab='Per exercise'; renderPerformance(...)`, assert the range row (`#trend-range-row`) renders and at least one `.field-input#perf-ex-search` exists; click a range pill and assert no console error. (Use the `window._progressTab='Performance'` + `renderProgress` entry, then `_perfTab`.)

- [ ] **Step 7: Bump cache-bust** `app-progress.js?v=12` → `v=13` in `index.html`.

- [ ] **Step 8: Run the trend tests + a screenshot at 390px**

Run: `npx playwright test tests/progress-trend.spec.js --reporter=list` → PASS. Then a throwaway 390px screenshot of the Per-exercise view with real solo data.

- [ ] **Step 9: 🚩 CHECKPOINT WITH JAKE — show the screenshot.** This is the first visible slice and the visual contract for every later card. Confirm the direction ("is this CoachApp, not PTHub?") BEFORE building Tasks 2–5 on top of it. Adjust the card shell here if he wants changes.

- [ ] **Step 10: Commit**

```bash
git add js/app-progress.js index.html tests/progress-trend.spec.js
git commit -m "sub-project 3: metric_type-aware trend cards + range selector (weight_reps)"
```

---

### Task 2: Cardio trend card (Distance / Duration / Pace / Avg HR)

**Files:** Modify `js/app-progress.js` (`_TREND_METRICS.cardio`, chart y-formatters); Test: append to `tests/progress-trend.spec.js`.

**Interfaces:** Consumes `_metricPointsFor` cardio keys (`totalDistance`, `totalDuration`, `pace`, `avgHr`) from Task 1. Produces the cardio chip set.

- [ ] **Step 1: Failing test** — `_metricPointsFor` on a cardio session with `distance_m:5000, duration_seconds:1200, avg_hr:150` yields `totalDistance:5000, pace:240 (sec/km), avgHr:150`; assert.
- [ ] **Step 2:** run → fail (cardio not in `_TREND_METRICS`, so the card falls back to weight_reps chips today).
- [ ] **Step 3: Implement** — add to `_TREND_METRICS`:
```javascript
  cardio: [
    ['totalDistance','Distance','max', v => (v/1000).toFixed(1)+'km'],
    ['totalDuration','Duration','max', v => fmtRestCountdown(v)],
    ['pace','Pace','mean', v => fmtRestCountdown(v)+'/km'],
    ['avgHr','Avg HR','mean', v => Math.round(v)+' bpm'],
  ],
```
(Chips with all-zero data auto-hide via the Task-1 filter, so a cardio exercise with no HR logged simply won't show the Avg HR chip.)
- [ ] **Step 4:** run → pass. **Step 5:** commit `"sub-project 3: cardio trend card (distance/duration/pace/avg-HR)"`.

---

### Task 3: Unilateral (dual L/R), timed_hold, jump_height, jump_distance cards

**Files:** Modify `js/app-progress.js`; Test: append.

**Interfaces:** Consumes the type-specific keys from `_metricPointsFor`. Unilateral needs a **two-dataset** chart (L and R lines) — a small branch in the chart builder keyed on `ex.metricType === 'unilateral'`.

- [ ] **Step 1: Failing tests** — (a) unilateral `_metricPointsFor` with two `side:'left'`/`side:'right'` rows yields `leftTop`/`rightTop`; (b) jump_height yields `bestHeight`; (c) timed_hold yields `maxDuration`.
- [ ] **Step 2:** run → fail.
- [ ] **Step 3: Implement** — add to `_TREND_METRICS`:
```javascript
  timed_hold:    [['maxDuration','Duration','max', v => fmtRestCountdown(v)]],
  jump_height:   [['bestHeight','Height','max', v => v+' cm']],
  jump_distance: [['bestDistance','Distance','max', v => v.toFixed(2)+' m']],
  unilateral:    [['topWeight','Top weight','max', v => v+'kg']],
```
For unilateral, in the chart builder add a branch: build TWO aggregated series (`_aggregateSeries(pts,'leftTop','max')` and `'rightTop'`) and render two datasets (L = accent, R = muted/2nd colour) with a small legend, so the imbalance is visible. Guard: if a side is entirely zero, draw one line.
- [ ] **Step 4:** run → pass. **Step 5:** mobile-check one unilateral card at 390px (dual lines + legend fit). **Step 6:** commit `"sub-project 3: unilateral dual-line + timed/jump trend cards"`.

---

### Task 4: Resting-HR trend on the Body tab

**Files:** Modify `js/app-progress.js` (`renderProgressWeight`, :1097 — add a second fetch of `resting_hr` and a second chart); Test: append.

**Interfaces:** Consumes `weight_logs.resting_hr` (②d). Produces a resting-HR line chart below the bodyweight chart, shown only when ≥2 non-null resting-HR entries exist.

- [ ] **Step 1: Failing test** — as solo, log two weight entries with resting HR via `saveClientWeight`, render the Body tab, assert a `#resting-hr-chart` canvas exists; clean up the two rows (own-fixture, les-041).
- [ ] **Step 2:** run → fail.
- [ ] **Step 3: Implement** — extend `renderProgressWeight`'s `weight_logs` select to include `resting_hr`; after the bodyweight chart, if `logs.filter(l => l.resting_hr != null).length >= 2`, render a titled "Resting heart rate" card + `#resting-hr-chart` (same line-chart pattern, y-axis `v => v+' bpm'`, points = the non-null resting_hr entries in date order). Track the chart instance so re-render doesn't leak.
- [ ] **Step 4:** run → pass. **Step 5:** commit `"sub-project 3: resting-HR trend on the Body tab"`.

---

### Task 5: Demote per-session to a "Recent sessions" diary + default to Per exercise

**Files:** Modify `js/app-progress.js` (`renderPerformance` :940 default sub-tab; `renderProgressPerSession` :981 diary framing); Test: append.

- [ ] **Step 1: Failing test** — assert `renderPerformance` with no `window._perfTab` renders the **Per exercise** view by default (search box present), and that Per session, when opened, shows a collapsed list capped at 10.
- [ ] **Step 2:** run → fail (today's default is 'Per session', limit 20).
- [ ] **Step 3: Implement** — change `renderPerformance`'s `subTab` default to `'Per exercise'`; relabel the `'Per session'` pill "Recent sessions"; in `renderProgressPerSession` change `.limit(20)` → `.limit(10)` and the empty/heading copy to read as a diary (keep the existing expand-to-compare behaviour — it's still useful, just no longer the lead). Keep all existing token/chart guards.
- [ ] **Step 3b (Jake's explicit ask 2026-07-19): remove the Cardio section from Personal Bests.** Now that cardio has its own metric_type trend card (Task 2), the standalone "Cardio bests" block in `renderProgressPBs` is redundant. Delete the header + `#pb-cardio-section` div (`app-progress.js` ~:1392-1393) and the `await renderProgressCardio(...)` mount (~:1396). Then delete the now-dead `renderProgressCardio` function (:1274-1322) — grep confirms its only caller is that mount (feedback_removing_container_drops_affordances: it hosts only read-only bests charts, no add/edit/delete affordance, and the underlying cardio data still shows in the Per-exercise cardio card). Leave `renderProgressPBs`' 1RMs section untouched.
- [ ] **Step 4:** run → pass (add/adjust a smoke test asserting Personal Bests no longer renders `#pb-cardio-section`). **Step 5:** commit `"sub-project 3: demote per-session to Recent sessions diary; Per exercise default; remove redundant Cardio-bests section"`.

---

### Task 6: Full suite + blast-radius + feature-audit

**Files:** none.

- [ ] **Step 1:** Full Playwright suite, single invocation (les-045), reconciled counts (les-038). Expect prior total + the new trend tests, 0 failed.
- [ ] **Step 2: Blast-radius sweep:** `renderProgress` is shared by client + solo (coach uses a different path — ④). Walk both. Confirm: an exercise with 1 session (chart needs ≥2) shows the headline, not a crash; a metric with all-null data hides its chip; the search box still filters; switching range/metric doesn't leak charts (`_perfExerciseCharts` destroyed). Confirm `renderProgressCardio` (still mounted under Personal Bests) is unaffected or, if now redundant with the cardio trend card, note it for cleanup (do not delete without Jake).
- [ ] **Step 3: feature-audit** through the PT + gym-user lenses; proof (screenshots per metric type at 390px, test output). Score acceptance criteria.
- [ ] **Step 4:** Report to Jake. ③ done on the branch. Remaining before push: **④ coach parity** → multi-agent-review → merge/push.

---

## Self-Review

**Spec coverage (③ bullets):**
- per-exercise metric_type-aware trend cards + range selector + aggregation → Task 1 (foundation + weight_reps), extended by Tasks 2–3. ✅
- Est 1RM (Epley) + Volume + set-by-set → e1rm/volume in Task 1 (set-by-set detail is the existing per-session expand, retained in Task 5). ✅
- unilateral dual L/R lines → Task 3. ✅
- cardio distance/duration/pace/avg-HR toggle → Task 2. ✅
- jump/timed single trend line → Task 3. ✅
- resting-HR on the Body tab → Task 4. ✅
- demote per-session to a diary, per-exercise becomes default → Task 5. ✅
- Chart.js only → all tasks. ✅

**Deferred (correctly):** ④ coach parity (render the same component in the coach's client-profile) — its own sub-project. The finish-screen volume under-count for unilateral/timed noted in the roadmap is a **capture/display of the runner finish screen**, not this Progress rebuild — track separately; it does not block ③.

**Placeholder scan:** Task 1 carries full code; Tasks 2–5 are concrete deltas (exact `_TREND_METRICS` entries, exact query/limit changes) against Task 1's fully-specified pattern — not "similar to Task N" hand-waves. The one deliberate think-step (e1RM fixture value) is flagged in-line to force computation.

**Type consistency:** `_metricPointsFor` populates `topWeight/e1rm/volume` (weight_reps), `totalDistance/totalDuration/pace/avgHr` (cardio), `leftTop/rightTop/topWeight` (unilateral), `maxDuration` (timed_hold), `bestHeight` (jump_height), `bestDistance` (jump_distance) — and `_TREND_METRICS` keys match those exactly across Tasks 1–3. Range keys (`_TREND_RANGES`) and state (`window._trendState`) are consistent throughout.

---

## Post-③

③ makes the whole capture layer visible. The last sub-project is **④ coach parity**: factor the trend view to `(clientId, role)` and render it in the coach's client-profile too (read-only), aligning/replacing `renderClientPerformance`/`renderClientWeight`. Then: multi-agent-review → cache-bust confirm → **merge `progress-overhaul` → push** (the first time any of this goes live).
