# ②d Manual HR Inputs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture manual heart-rate data — per-cardio-set average/max HR in the runner, and a resting-HR body metric on the bodyweight-log form — so sub-project ③ has real HR data to chart.

**Architecture:** The ① data model already added `avg_hr`/`max_hr` (smallint) to `workout_log_sets`, and `saveRunnerSession`'s row-builder already persists `s.avgHr`/`s.maxHr` (app-runner.js:1708-1711, 1745 — verified). So the cardio piece is purely two input fields in the runner's cardio wizard that populate `setData.avgHr`/`setData.maxHr`. Resting HR is a NEW body metric: one additive column on `weight_logs` plus an optional input on the shared bodyweight form (all three render sites use the same `cwf-*` ids and one `saveClientWeight`). No new tables, no RLS changes, no wizard-vs-table restructuring.

**Tech Stack:** Vanilla ES6 (no build step, no framework), Supabase (`supabase-js` v2), Chart.js (③ only), Playwright E2E.

## Global Constraints

- **No build step.** Static site; edits land directly in `js/*.js`. Bump the changed module's `?v=N` in `index.html` in the SAME commit.
- **No PII / health data in `log.*` calls** — HR is special-category health data. Log ids/counts only, NEVER the HR value. (Pre-push hook enforces common patterns.)
- **SQL is additive, idempotent, reversible** — `add column if not exists`. Run through the **sql-safety** skill before handing to Jake. Jake runs all migrations live in the Supabase SQL editor (paste inline, never a file path).
- **The solo trap:** solo's `clients` row has `coach_id = NULL`. No query in this plan filters `clients` by `coach_id`; `weight_logs`/`workout_log_sets` are scoped by `client_id`, which is correct for solo. Do not add a `coach_id` anchor to any query here.
- **`resting_hr` home = the bodyweight form** (Jake's call 2026-07-19, overriding the spec's "check-in" — the check-in form exists only on the client dashboard, so solo could never reach it; the bodyweight form is on both My Progress Body tabs and is where ③ charts it).
- **Cardio stays on the wizard** (②c retired the wizard only for strength metric_types). Do not move cardio into the fast table in this sub-project.
- **`saveWorkoutSession` (the coach "Log session" modal, ~app-runner.js:2127) is OUT of scope** — ②d targets the in-gym runner (`saveRunnerSession`) and the body form. Manual-entry HR in that modal is a later follow-up.

---

### Task 1: Migration — `weight_logs.resting_hr`

**Files:**
- Create: `scripts/add-resting-hr-2026-07-19.sql`

**Interfaces:**
- Produces: a nullable `resting_hr smallint` column on `weight_logs`, readable/writable by the same roles that already read/write `weight_logs` (client own row, solo own row, coach viewing their client). No policy change needed — a new column inherits the table's existing RLS.

- [ ] **Step 1: Run the sql-safety skill** against the migration below (additive column on an existing RLS-enabled table; confirm no new INSERT-before-RLS, no `qual='true'`, no `auth.users` reference, and that `weight_logs` is already in `downloadMyData()` + `delete_current_user()` — it is, as an existing table).

- [ ] **Step 2: Write the migration file**

```sql
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- Progress overhaul — sub-project ②d MANUAL HR. Resting-HR body metric on weight_logs.
-- Design: docs/superpowers/specs/2026-07-18-progress-tracking-overhaul-design.md
-- Plan:   docs/superpowers/plans/2026-07-19-progress-manual-hr-inputs.md
-- Run in the Supabase SQL editor. Additive, idempotent, reversible. No user-visible change alone.
-- Resting HR lives here (not client_check_ins) so solo/client both log it from My Progress → Body,
-- which is exactly where ③ charts it. avg_hr/max_hr already exist on workout_log_sets (sub-project ①).
-- ════════════════════════════════════════════════════════════════════════════════════════════════

alter table weight_logs add column if not exists resting_hr smallint;

-- Sanity range guard (resting HR in a plausible human band; null always allowed).
do $$ begin
  alter table weight_logs drop constraint if exists weight_logs_resting_hr_chk;
end $$;
alter table weight_logs add constraint weight_logs_resting_hr_chk
  check (resting_hr is null or (resting_hr between 20 and 250));

-- No RLS change: weight_logs already has client-own / solo-own / coach-of-client policies,
-- and a new column is covered by the existing row policies. Verified behaviourally in Task 3's test.
```

- [ ] **Step 3: Hand the SQL to Jake inline** to run in Supabase. He confirms: column present on `weight_logs`, an existing weight row reads back with `resting_hr = null`, and inserting a row with `resting_hr = 58` as the solo user succeeds. This is the gate for Task 3's round-trip test (the column must exist live).

- [ ] **Step 4: Commit**

```bash
git add scripts/add-resting-hr-2026-07-19.sql docs/superpowers/plans/2026-07-19-progress-manual-hr-inputs.md
git commit -m "sub-project 2d: migration — resting_hr on weight_logs + plan"
```

---

### Task 2: Cardio avg/max HR capture in the runner

**Files:**
- Modify: `js/app-runner.js` — cardio input UI (~727, after the duration/distance inputs, before the buttons at ~729); `logRunnerSet` cardio branch (`setData` built at :851 distance-based and :865 duration-based)
- Modify: `index.html` — bump `app-runner.js?v=25` → `v=26`
- Test: `tests/progress-hr.spec.js` (new)

**Interfaces:**
- Consumes: the save row-builder's `applyHr(row)` (app-runner.js:1708-1711, called at :1745) which reads `s.avgHr`/`s.maxHr` off each loggedSet and writes `avg_hr`/`max_hr` — already present, do not modify.
- Produces: cardio loggedSets now carry optional `avgHr` / `maxHr` string fields; they round-trip to `workout_log_sets.avg_hr` / `.max_hr`.

- [ ] **Step 1: Write the failing Playwright round-trip test**

```js
// tests/progress-hr.spec.js
const { test, expect } = require('@playwright/test')
const { loginAsPT } = require('./helpers')

// Logs one cardio set with avg/max HR through the real runner as solo, then asserts the HR
// round-trips to workout_log_sets. Guards the exact "silently dropped set field" bug class ②d fixes.
test('cardio set logs avg/max HR to workout_log_sets', async ({ page }) => {
  await loginAsPT(page)
  await page.click('text=Personal') // switch to solo view

  // Drive the runner to a cardio exercise, fill Duration + Avg HR + Max HR, tap LOG, finish + save.
  // (Uses the suite's existing solo-runner setup helper pattern — see runner.spec.js for the
  //  self-provisioned cardio session; reuse it, do not borrow shared fixtures.)
  // ...provision a solo cardio workout, start the runner, reach the cardio exercise...
  await page.fill('#wr-cardio-dur', '20:00')
  await page.fill('#wr-cardio-avg-hr', '142')
  await page.fill('#wr-cardio-max-hr', '168')
  await page.click('text=LOG')
  await page.click('text=Finish 🏁')
  await page.click('text=Save workout')
  await expect(page.locator('text=Workout saved')).toBeVisible({ timeout: 10000 })

  // Assert via a direct Supabase read (the suite's db handle) that the newest cardio set row
  // for this exercise has avg_hr = 142 and max_hr = 168.
  const set = await page.evaluate(async () => {
    const { data } = await window.db
      .from('workout_log_sets')
      .select('avg_hr, max_hr')
      .not('avg_hr', 'is', null)
      .order('id', { ascending: false })
      .limit(1)
    return data?.[0]
  })
  expect(set.avg_hr).toBe(142)
  expect(set.max_hr).toBe(168)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test tests/progress-hr.spec.js -g "cardio set logs avg/max HR" --reporter=list`
Expected: FAIL — `#wr-cardio-avg-hr` does not exist yet, so `page.fill` times out (or the read returns no HR row).

- [ ] **Step 3: Add the HR inputs to the cardio input UI**

In `js/app-runner.js`, inside the cardio input block, immediately AFTER the closing of the distance/duration input `<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:10px"> … </div>` (the block ending at ~line 727) and BEFORE the `<!-- Buttons -->` comment (~line 728), insert:

```javascript
          <!-- Optional heart rate (sub-project ②d) — shown for both distance- and duration-based cardio -->
          <div style="display:flex;gap:8px;margin-bottom:10px">
            <div style="flex:1">
              <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:4px">Avg HR (bpm) — optional</div>
              <input id="wr-cardio-avg-hr" type="number" inputmode="numeric" step="1" min="20" max="250" placeholder="${tgt.hrZoneMin||''}" value="${lastCardio?.avgHr||''}"
                style="width:100%;padding:10px 12px;font-size:16px;font-weight:700;border:2px solid var(--border);border-radius:10px;text-align:center;background:var(--bg);color:var(--text)">
            </div>
            <div style="flex:1">
              <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:4px">Max HR (bpm) — optional</div>
              <input id="wr-cardio-max-hr" type="number" inputmode="numeric" step="1" min="20" max="250" placeholder="" value="${lastCardio?.maxHr||''}"
                style="width:100%;padding:10px 12px;font-size:16px;font-weight:700;border:2px solid var(--border);border-radius:10px;text-align:center;background:var(--bg);color:var(--text)">
            </div>
          </div>
```

(`tgt` and `lastCardio` are already in scope in this IIFE — `tgt` at ~:690, `lastCardio` at ~:691.)

- [ ] **Step 4: Read the HR inputs into `setData` in `logRunnerSet`**

In `js/app-runner.js` `logRunnerSet`, the cardio branch (`if (ex.type === 'cardio')`, :845), read the two fields once and merge into whichever `setData` is built. Immediately after `const ex = _runner.exercises[_runner.exIdx]` inside the cardio branch is awkward; instead, after both `setData = {…}` assignments are set (i.e. replace the two `setData = { … }` lines and add HR to each). Concretely:

Change the distance-based assignment (:851) from:
```javascript
      setData = { distance: dist, paceAchieved: paceEl?.value?.trim() || null }
```
to:
```javascript
      setData = { distance: dist, paceAchieved: paceEl?.value?.trim() || null,
                  avgHr: document.getElementById('wr-cardio-avg-hr')?.value?.trim() || null,
                  maxHr: document.getElementById('wr-cardio-max-hr')?.value?.trim() || null }
```

Change the duration-based assignment (:865) from:
```javascript
      setData = { duration: dur, distanceAchieved: distEl?.value?.trim() || null, paceAchieved: paceEl?.value?.trim() || null }
```
to:
```javascript
      setData = { duration: dur, distanceAchieved: distEl?.value?.trim() || null, paceAchieved: paceEl?.value?.trim() || null,
                  avgHr: document.getElementById('wr-cardio-avg-hr')?.value?.trim() || null,
                  maxHr: document.getElementById('wr-cardio-max-hr')?.value?.trim() || null }
```

(The save row-builder already maps `s.avgHr → avg_hr`, `s.maxHr → max_hr` at :1708-1711 and calls `applyHr(row)` at :1745. `parseInt` there handles the string. No save-side change.)

- [ ] **Step 5: Bump the cache-bust**

In `index.html`, change `app-runner.js?v=25` to `app-runner.js?v=26`.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx playwright test tests/progress-hr.spec.js -g "cardio set logs avg/max HR" --reporter=list`
Expected: PASS — `avg_hr = 142`, `max_hr = 168`.

- [ ] **Step 7: mobile-check the cardio HR row**

Run the `mobile-check` skill at 390×844 on the runner cardio input. Confirm the two HR inputs sit side-by-side without overflow and the LOG button is still reachable. Look at the screenshot.

- [ ] **Step 8: Commit**

```bash
git add js/app-runner.js index.html tests/progress-hr.spec.js
git commit -m "sub-project 2d: capture per-cardio-set avg/max HR in the runner"
```

---

### Task 3: Resting HR capture on the bodyweight form

**Files:**
- Modify: `js/app-progress.js` — the Body-tab weight form (`renderProgressWeight`, the `cwf-*` block at ~1112-1118)
- Modify: `js/app-dashboard.js` — both quick-log weight cards (client :477-491, solo :772-778) — same field, for whichever surface the user logs from
- Modify: `js/app-clients.js` — `saveClientWeight` (:55-71) reads the new input and includes it in the insert when present
- Modify: `index.html` — bump `app-progress.js`, `app-dashboard.js`, `app-clients.js`
- Test: `tests/progress-hr.spec.js` (add a second test)

**Interfaces:**
- Consumes: Task 1's `weight_logs.resting_hr` column (must be live in Supabase).
- Produces: an optional `cwf-resting-hr` numeric input on every bodyweight form; `saveClientWeight` writes `resting_hr` to `weight_logs` when a value is entered.

- [ ] **Step 1: Write the failing round-trip test**

```js
// append to tests/progress-hr.spec.js
test('bodyweight log with resting HR round-trips to weight_logs', async ({ page }) => {
  await loginAsPT(page)
  await page.click('text=Personal') // solo
  await page.click('text=Progress')
  await page.click('text=Body')          // Body Weight tab
  await page.click('text=+ Log weight')  // reveal the form
  const stamp = String(Date.now())
  await page.fill('#cwf-weight', '82.5')
  await page.fill('#cwf-resting-hr', '58')
  await page.click('text=Save weight, Log weight')  // the form's submit button
  await expect(page.locator('text=Weight logged')).toBeVisible({ timeout: 10000 })

  const row = await page.evaluate(async () => {
    const { data } = await window.db
      .from('weight_logs')
      .select('weight_kg, resting_hr')
      .not('resting_hr', 'is', null)
      .order('id', { ascending: false })
      .limit(1)
    return data?.[0]
  })
  expect(row.resting_hr).toBe(58)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test tests/progress-hr.spec.js -g "resting HR round-trips" --reporter=list`
Expected: FAIL — `#cwf-resting-hr` does not exist.

- [ ] **Step 3: Add the resting-HR input to the Body-tab form**

In `js/app-progress.js`, in the `renderProgressWeight` form, immediately AFTER the Body-fat `<div>` (the one containing `id="cwf-bf"`, ~line 1118), insert a sibling grid cell:

```javascript
        <div><label class="form-label">Resting HR (bpm) <span style="color:var(--text-muted)">(optional)</span></label><input type="number" id="cwf-resting-hr" class="form-input" placeholder="e.g. 58" step="1" min="20" max="250"></div>
```

- [ ] **Step 4: Add the same input to both dashboard quick-log weight cards**

In `js/app-dashboard.js`, after the `cwf-bf` input in the client card (~:491) and the solo card (~:778), insert the same `cwf-resting-hr` cell (identical snippet as Step 3, adjusting only the surrounding markup style to match each card's existing inputs — both already use `class="form-input"`).

- [ ] **Step 5: Read resting HR in `saveClientWeight`**

In `js/app-clients.js` `saveClientWeight` (:55), after the `const notes = …` line (:59) add:

```javascript
  const restingHr = document.getElementById('cwf-resting-hr')?.value
```

Then, in the row-assembly block (:65-67), after `if (notes) row.notes = notes`, add:

```javascript
  if (restingHr) row.resting_hr = parseInt(restingHr)
```

(No `log.*` line carries the value — the existing `log.info`/`log.ok` at :69/:73 log only `client_id` and `date`. Do not add `resting_hr` to them; it is health data.)

- [ ] **Step 6: Bump cache-busts**

In `index.html`: bump `app-progress.js`, `app-dashboard.js`, and `app-clients.js` each by 1.

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx playwright test tests/progress-hr.spec.js -g "resting HR round-trips" --reporter=list`
Expected: PASS — `resting_hr = 58`.

- [ ] **Step 8: mobile-check the Body-tab form**

Run `mobile-check` at 390×844 on My Progress → Body → + Log weight. Confirm the resting-HR field wraps cleanly in the form grid. Look at the screenshot.

- [ ] **Step 9: Commit**

```bash
git add js/app-progress.js js/app-dashboard.js js/app-clients.js index.html tests/progress-hr.spec.js
git commit -m "sub-project 2d: capture resting HR on the bodyweight form (weight_logs)"
```

---

### Task 4: Full-suite green + blast-radius sweep

**Files:** none (verification only)

- [ ] **Step 1: Run the full Playwright suite**

Run: `npx playwright test --reporter=list` (single invocation only — never concurrent against :3001, per les-045). Capture full output to a file; assert `passed + failed + flaky + skipped == declared total` (les-038 — never read a truncated tail). Expected: the branch's 156/2/0 plus the 2 new tests → 158 passed / 2 skipped / 0 failed.

- [ ] **Step 2: Blast-radius sweep (active reasoning, per CLAUDE.md):**
  - `saveClientWeight` has three callers (client dashboard, solo dashboard, Progress Body tab) — `cwf-resting-hr` is read with `?.` so a form lacking it is safe (null). Confirm all three still save weight with the field absent AND present.
  - `logRunnerSet` cardio branch — confirm a cardio set logged with NO HR still saves (empty inputs → `null`, `applyHr` skips falsy). Confirm strength/unilateral/timed/jump sets are untouched (HR inputs are inside the cardio-only block).
  - `weight_logs` reads elsewhere (charts, stats, `downloadMyData`) — a new nullable column changes none of them.
  - Zero/empty case: logging weight with resting HR left blank must not write `resting_hr: NaN` (guard is `if (restingHr)` — empty string is falsy, safe).

- [ ] **Step 3: feature-audit** — run the `feature-audit` skill through a gym user's eyes (can a solo user log HR mid-cardio and a resting HR on the Body tab, and is nothing else disturbed?). Proof, not claims.

---

## Self-Review

**Spec coverage (② capture, HR bullets):**
- "per-cardio-set avg/max HR" → Task 2. ✅
- "resting HR on the check-in/Body flow (logged as a body metric, not tied to a workout)" → Tasks 1 + 3, homed on the Body/weight form per Jake's 2026-07-19 decision. ✅
- "missed-check-to-test: log one set … assert it round-trips to workout_log_sets" → Task 2 test (cardio HR) + Task 3 test (resting HR). ✅

**Not in ②d (correctly deferred):** jump-height / hold-duration / AMRAP-reps inputs (those are ②c's adaptive-table columns, already built); `saveWorkoutSession` manual-modal HR (out of scope, noted). The display of HR is ③.

**Type consistency:** loggedSet HR fields are `avgHr`/`maxHr` (camelCase strings) throughout Task 2, matching the existing `applyHr` reader (`s.avgHr`/`s.maxHr`, :1709-1710). Weight row uses `resting_hr` (snake_case column) in `saveClientWeight`, matching `weight_logs.resting_hr`. DOM ids: `wr-cardio-avg-hr`, `wr-cardio-max-hr`, `cwf-resting-hr` — consistent between render and read steps.

**Placeholder scan:** none — every code step shows the exact snippet and insertion point.

---

## Post-②d

②d completes the **capture** layer. Next is **③ display rebuild** (its own plan): metric_type-aware per-exercise trend cards, range selector + aggregation, resting-HR trend on the Body tab (reads `weight_logs.resting_hr`), cardio avg-HR trend (reads `workout_log_sets.avg_hr`), per-session demoted to a diary. Then ④ coach parity → multi-agent-review → merge/push the branch (nothing is live until then).
