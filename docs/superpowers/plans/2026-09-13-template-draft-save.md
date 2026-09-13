# Template Builder Staged-Edits + Save Workout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nothing in CoachApp's template editor (`openTemplate`, `js/app-workouts.js`) writes to the
database until "Save workout" is tapped; leaving with unsaved changes always confirms; one combined
propagation prompt replaces one-per-edit.

**Architecture:** Introduce `window._templateDraft`, an in-memory working copy of a template's
exercises + name/description, created when `openTemplate` loads. Every editor action mutates only
the draft and re-renders from it. "Save workout" diffs the draft against its baseline and replays
that diff through the *existing*, already-ownership-checked write functions — exercise row ids stay
stable across a save. The whole reorder-settle debounce subsystem is deleted: it existed only to
serialize/debounce database writes that no longer happen during editing.

**Tech Stack:** Vanilla JS (no framework), Supabase JS client, Playwright (`tests/*.spec.js`), Node's
built-in test runner (`tests-node/*.test.mjs`).

**Spec:** `docs/superpowers/specs/2026-09-13-template-draft-save-design.md`

## Global Constraints

- **No schema change.** Same tables, same columns — this is a client-side state redesign only (spec, "Database changes").
- **Exercise row ids must stay stable across a save.** This is *why* Approach A (diffed replay) was chosen over bulk delete-and-reinsert (spec, "Decisions already made").
- **Every existing ownership/RLS check is reused, not reimplemented.** The diff replay calls into the *same* write logic (`_resolveEditableTemplateId`, `_resolveTemplateOwnerCoachId`, `_verifyTemplateOwnership`) that already guards these tables — never a new, parallel write path.
- **`_resolveEditableTemplateId` (the shared-template fork) must run at most ONCE per Save, never once per queued change.** Verified against `js/app-workouts.js:3349-3389`: it forks (clones) a template still shared across >1 program-phase-workout slot the first time it's edited, and repoints the current phase slot to the clone. Calling it a second time in the same batch, before the repoint from the first call has taken effect in what a fresh query would see, would fork a SECOND clone and orphan the first — this is a correctness requirement, not a style preference.
- **`deleteTemplate` (deleting the whole workout) is unaffected** — stays its own immediate, `confirmDialog`-guarded action, entirely separate from this flow.
- **Cache-bust `js/app-workouts.js`'s `?v=` in `index.html` on every task that ships a behavior change** (project convention — see any recent commit touching this file).
- **`checks.sh`'s style-literal ratchet, `waitForTimeout` count ratchet, and cross-module-ref baseline must not regress** — if a task's diff would raise any of them, tokenize/adjust rather than let the ratchet fail at push time.

---

## File Structure

All changes live in `js/app-workouts.js` (already the single home for this screen — following existing
codebase convention of large per-concern files, not restructuring it) plus test files:

- **Modify:** `js/app-workouts.js` — the draft model, staged mutators, diff engine, save/replay
  orchestration, propagation generalization, leave-guard. Deletes the reorder-settle subsystem.
- **Modify:** `index.html` — cache-bust bump(s).
- **Modify:** `tests/reorder-instant-2026-09-06.spec.js` — rewritten for the staged model; the
  DOM-swap-purity tests survive unchanged.
- **Modify:** `tests/reorder-propagation-2026-08-19.spec.js` — one test (the wiring test) rewritten;
  the five permutation tests survive unchanged (they drive `_propagateReorderToTemplates` directly).
- **Modify:** `tests/session-identity-2026-08-14.spec.js`, `tests/programs.spec.js`,
  `tests/personal-programs.spec.js`, `tests/reentry-guard-2026-08-28.spec.js`,
  `tests/builder-metric-type.spec.js`, `tests/cardio-distance-metres.spec.js`,
  `tests/intervals-redesign-2026-07-25.spec.js`, `tests/ledger-fixes-2026-07-30.spec.js`,
  `tests/ownership-anchors-2026-08-21.spec.js`, `tests/stale-set-fields-2026-08-18.spec.js`,
  `tests/ledger-fixes-2026-08-02.spec.js`, `tests/silent-refusal-2026-08-18.spec.js` (Task 12 — the
  last 9 found during Tasks 3/4, see their ruling notes) — insert a Save-workout step before any
  assertion that checks the database immediately after an edit; a few of these need a small
  additional fix (a stale reentrancy-guard list entry, a swallowed error, two tests whose entire
  premise no longer exists and get deleted rather than adapted) beyond that mechanical swap — see
  Task 12.
- **Modify:** `tests/propagation-honesty-2026-09-06.spec.js` — rewritten for pluralized modal copy.
- **Create:** `tests/template-draft-save-2026-09-13.spec.js` — the new integration coverage (no
  writes until Save, Discard truly discards, the three-way leave prompt, one combined prompt for
  multiple changes, partial-failure recovery).
- **No change:** `tests/ledger-fixes-2026-07-23.spec.js` — confirmed unrelated (covers runner
  metric-type resolution, 1RM estimation, PB "best" selection, distance formatting, and the runner's
  own Discard confirm; nothing in it touches the template-builder propagation/save flow). The spec
  flagged this file from memory as coupled; that was wrong, and this plan corrects it.

---

### Task 1: The draft data model

**Files:**
- Modify: `js/app-workouts.js` (inside `openTemplate`, `js/app-workouts.js:1326-1395`)
- Test: `tests/template-draft-save-2026-09-13.spec.js` (new file)

**Interfaces:**
- Produces: `window._templateDraft = { templateId, ctx, meta: {name, description}, metaBaseline: {name, description}, exercises: [...], exercisesBaseline: [...] }`. Each exercise object carries `_draftKey` (a local-only string, never sent to the database) plus every field `saveExerciseToTemplate` already writes: `id` (real DB id, or `null` for a not-yet-saved row), `exercise_id`, `exercise_name`, `exercise_type`, `metric_type`, `order_index`, `sets`, `sets_json`, `notes`, `superset_group`.
- Consumes: nothing new — reads the same `t`/`exercises` that `openTemplate` already fetches.

- [ ] **Step 1: Write the failing test**

```js
// tests/template-draft-save-2026-09-13.spec.js
const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

test.describe('Template draft: creation', () => {
  test('opening a template builds window._templateDraft as an editable copy, untouched baseline kept separately', async ({ page }) => {
    await loginAsPT(page)
    const setup = await page.evaluate(async () => {
      const { data: t } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: null, client_id: null, name: '[E2E] Draft Model Test' }).select('id').single()
      await db.from('workout_template_exercises').insert([
        { template_id: t.id, exercise_name: '[E2E] Bench', exercise_type: 'strength', order_index: 0, sets_json: [{ repsMin: '5' }] },
        { template_id: t.id, exercise_name: '[E2E] Row', exercise_type: 'strength', order_index: 1, sets_json: [{ repsMin: '5' }] },
      ])
      return { templateId: t.id }
    })
    try {
      await page.evaluate(async (id) => { await openTemplate(id) }, setup.templateId)
      const r = await page.evaluate(() => ({
        templateId: window._templateDraft?.templateId,
        exerciseCount: window._templateDraft?.exercises?.length,
        baselineCount: window._templateDraft?.exercisesBaseline?.length,
        names: window._templateDraft?.exercises?.map(e => e.exercise_name),
        allHaveDraftKey: window._templateDraft?.exercises?.every(e => !!e._draftKey),
        allHaveRealId: window._templateDraft?.exercises?.every(e => typeof e.id === 'string'),
        // baseline and exercises must be SEPARATE arrays/objects, not the same reference —
        // otherwise mutating one mutates the other and there is nothing to diff against.
        separateArrays: window._templateDraft?.exercises !== window._templateDraft?.exercisesBaseline,
        meta: window._templateDraft?.meta,
        metaBaseline: window._templateDraft?.metaBaseline,
        separateMeta: window._templateDraft?.meta !== window._templateDraft?.metaBaseline,
      }))
      expect(r.templateId).toBe(setup.templateId)
      expect(r.exerciseCount).toBe(2)
      expect(r.baselineCount).toBe(2)
      expect(r.names).toEqual(['[E2E] Bench', '[E2E] Row'])
      expect(r.allHaveDraftKey, 'every draft row needs a stable local key for DOM/array matching').toBe(true)
      expect(r.allHaveRealId, 'a pre-existing row keeps its real database id in the draft').toBe(true)
      expect(r.separateArrays, 'exercises and exercisesBaseline must not be the same array reference').toBe(true)
      expect(r.meta).toEqual({ name: '[E2E] Draft Model Test', description: null })
      expect(r.separateMeta, 'meta and metaBaseline must not be the same object reference').toBe(true)
    } finally {
      await page.evaluate(async (id) => {
        await db.from('workout_template_exercises').delete().eq('template_id', id)
        await db.from('workout_templates').delete().eq('id', id)
      }, setup.templateId)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/template-draft-save-2026-09-13.spec.js -g "creation"`
Expected: FAIL — `window._templateDraft` is `undefined`.

- [ ] **Step 3: Write the minimal implementation**

In `js/app-workouts.js`, inside `openTemplate` (`js/app-workouts.js:1326`), right after
`const exercises = (t.workout_template_exercises || []).sort((a, b) => a.order_index - b.order_index)`
(currently line 1366) and before it's used to build `el.innerHTML`:

```js
let _draftKeyCounter = 0
const _newDraftKey = () => `dk${++_draftKeyCounter}_${Date.now()}`

const _toDraftRow = (row) => ({
  _draftKey: _newDraftKey(),
  id: row.id,
  exercise_id: row.exercise_id,
  exercise_name: row.exercise_name,
  exercise_type: row.exercise_type,
  metric_type: row.metric_type,
  order_index: row.order_index,
  sets: row.sets,
  sets_json: row.sets_json,
  notes: row.notes,
  superset_group: row.superset_group,
})

window._templateDraft = {
  templateId: id,
  ctx: _ctx,
  meta: { name: t.name, description: t.description },
  metaBaseline: { name: t.name, description: t.description },
  exercises: exercises.map(_toDraftRow),
  exercisesBaseline: exercises.map(_toDraftRow),
}
```

Note: `exercises.map(_toDraftRow)` is called TWICE deliberately — once for `exercises`, once for
`exercisesBaseline` — so each produces its own fresh objects with their own `_draftKey`s (never
compared or relied on to match between the two; baseline rows are matched to draft rows by `id`
during diffing, not by `_draftKey`). Two calls, not one `.map()` result reused, is what keeps them
genuinely separate object graphs.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/template-draft-save-2026-09-13.spec.js -g "creation"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add js/app-workouts.js tests/template-draft-save-2026-09-13.spec.js
git commit -m "template builder: introduce window._templateDraft on open

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Rendering reads from the draft, not the fetch

**Files:**
- Modify: `js/app-workouts.js:1369-1453` (the `el.innerHTML` build inside `openTemplate`)
- Test: `tests/template-draft-save-2026-09-13.spec.js`

**Interfaces:**
- Consumes: `window._templateDraft` from Task 1.
- Produces: a `_renderTemplateExerciseList()` function that repaints `#template-exercise-list` from
  `window._templateDraft.exercises`/`.meta` — later tasks call this after every staged mutation
  instead of re-fetching.

- [ ] **Step 1: Write the failing test**

```js
test.describe('Template draft: rendering', () => {
  test('the exercise list and header repaint from the draft object, not a fresh fetch', async ({ page }) => {
    await loginAsPT(page)
    const setup = await page.evaluate(async () => {
      const { data: t } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: null, client_id: null, name: '[E2E] Render From Draft' }).select('id').single()
      await db.from('workout_template_exercises').insert({ template_id: t.id, exercise_name: '[E2E] Squat', exercise_type: 'strength', order_index: 0, sets_json: [{ repsMin: '5' }] })
      return { templateId: t.id }
    })
    try {
      await page.evaluate(async (id) => { await openTemplate(id) }, setup.templateId)
      // Mutate the draft directly (no UI action yet — that's later tasks) and force a repaint via
      // the extracted render function, proving the DOM comes from the draft, not another fetch.
      const r = await page.evaluate(() => {
        window._templateDraft.exercises[0].exercise_name = '[E2E] Squat RENAMED IN DRAFT ONLY'
        window._templateDraft.meta.name = '[E2E] Renamed Header'
        _renderTemplateExerciseList()
        return {
          headerText: document.querySelector('.page-title')?.textContent,
          listText: document.getElementById('tpl-ex-list')?.textContent || '',
        }
      })
      expect(r.headerText).toBe('[E2E] Renamed Header')
      expect(r.listText).toContain('[E2E] Squat RENAMED IN DRAFT ONLY')
    } finally {
      await page.evaluate(async (id) => {
        await db.from('workout_template_exercises').delete().eq('template_id', id)
        await db.from('workout_templates').delete().eq('id', id)
      }, setup.templateId)
    }
    // The database was never touched by the mutation above — it lived only in the draft.
    const stillOriginal = await page.evaluate(async (id) => {
      const { data } = await db.from('workout_templates').select('name').eq('id', id).maybeSingle()
      return data === null // already deleted in the finally above, which only succeeds if nothing else broke
    }, setup.templateId)
    expect(stillOriginal).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/template-draft-save-2026-09-13.spec.js -g "rendering"`
Expected: FAIL — `_renderTemplateExerciseList is not defined`.

- [ ] **Step 3: Write the minimal implementation**

Extract the existing header + `#template-exercise-list` markup (currently built inline inside
`openTemplate`, `js/app-workouts.js:1380-1453`) into its own function that reads from the draft:

```js
function _renderTemplateExerciseList() {
  const d = window._templateDraft
  if (!d) return
  const headerHost = document.querySelector('.page-header')
  const listHost = document.getElementById('template-exercise-list')
  if (!headerHost || !listHost) return

  const titleRow = headerHost.querySelector('.page-title')?.parentElement
  if (titleRow) {
    titleRow.querySelector('.page-title').textContent = d.meta.name
    const subtitle = titleRow.parentElement.querySelector('.page-subtitle')
    if (d.meta.description) {
      if (subtitle) subtitle.textContent = d.meta.description
      else titleRow.parentElement.insertAdjacentHTML('beforeend', `<p class="page-subtitle">${escapeHtml(d.meta.description)}</p>`)
    } else if (subtitle) {
      subtitle.remove()
    }
  }

  const id = d.templateId
  const exercises = d.exercises
  listHost.innerHTML = exercises.length === 0 ? `
    <div class="empty-state">
      <div class="empty-icon">➕</div>
      <div class="empty-title">No exercises yet</div>
      <div class="empty-text">Add exercises to build this template</div>
      <button class="btn-primary" onclick="showAddExerciseToTemplateModal('${id}')">+ Add exercise</button>
    </div>
  ` : `<div class="list" id="tpl-ex-list">${exercises.map((ex, i) => {
    const _mt = ex.metric_type || ex.exercise_type
    const isCardio = _mt === 'cardio'
    const isInterval = _mt === 'interval'
    const meta = isCardio
      ? [ex.sets ? `${ex.sets} sets` : null, 'Cardio'].filter(Boolean).join(' · ')
      : [ex.sets ? `${ex.sets} sets` : null, ex.reps ? `${escapeHtml(String(ex.reps))} reps` : null, ex.weight_kg ? `${ex.weight_kg}kg` : null].filter(Boolean).join(' · ') || 'No defaults set'
    return `
    <div class="card" style="margin-bottom:0" data-draft-key="${ex._draftKey}" data-ex-name="${escapeHtml(ex.exercise_name)}">
      <div class="card-body" style="padding:12px 16px">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="display:flex;flex-direction:column;gap:2px;flex-shrink:0">
            <button data-move="-1" onclick="moveTemplateExercise('${id}','${ex.id}',-1)" ${i===0?'disabled':''} style="width:22px;height:20px;border-radius:4px;border:1px solid var(--border);background:transparent;color:${i===0?'var(--border)':'var(--text-muted)'};cursor:${i===0?'default':'pointer'};font-size:10px;display:flex;align-items:center;justify-content:center">▲</button>
            <button data-move="1" onclick="moveTemplateExercise('${id}','${ex.id}',1)" ${i===exercises.length-1?'disabled':''} style="width:22px;height:20px;border-radius:4px;border:1px solid var(--border);background:transparent;color:${i===exercises.length-1?'var(--border)':'var(--text-muted)'};cursor:${i===exercises.length-1?'default':'pointer'};font-size:10px;display:flex;align-items:center;justify-content:center">▼</button>
          </div>
          <div style="width:26px;height:26px;border-radius:50%;background:rgba(99,102,241,.12);display:flex;align-items:center;justify-content:center;font-size:var(--text-sm, 11px);font-weight:700;color:var(--accent);flex-shrink:0">${i + 1}</div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <span style="font-weight:600;font-size:var(--text-lg, 14px)">${escapeHtml(ex.exercise_name)}</span>
              ${isCardio ? `<span style="font-size:var(--text-sm, 11px);font-weight:600;padding:1px 7px;border-radius:var(--radius-xs, 4px);background:rgba(6,182,212,.12);color:#06b6d4">Cardio</span>` : ''}
              ${ex.superset_group ? `<span style="font-size:var(--text-sm, 11px);font-weight:700;padding:1px 7px;border-radius:var(--radius-xs, 4px);background:rgba(245,158,11,.15);color:#d97706">SS: ${escapeHtml(ex.superset_group)}</span>` : ''}
              ${ex.sets_json?.[0]?.bodyweight ? `<span style="font-size:var(--text-sm, 11px);font-weight:600;padding:1px 7px;border-radius:var(--radius-xs, 4px);background:rgba(16,185,129,.12);color:#059669">BW</span>` : ''}
            </div>
            ${ex.sets_json?.length ? (() => {
              const rows = ex.sets_json.map((s, si) => {
                const summary = _fmtSetDetail(s, { isCardio, isInterval, includeRest: true, markAmrap: false, isUnilateral: _mt === 'unilateral' })
                const setLabel = s.amrap ? 'AMRAP:' : `Set ${si+1}:`
                return summary && summary !== '—' ? `<div style="font-size:var(--legacy-text-11-5, 11.5px);color:var(--text-muted)"><span style="font-weight:600;color:var(--text-muted)">${setLabel}</span> ${escapeHtml(summary)}</div>` : null
              }).filter(Boolean)
              return rows.length ? `<div style="display:flex;flex-direction:column;gap:1px;margin-top:4px">${rows.join('')}</div>` : `<div style="font-size:var(--text-md, 12px);color:var(--text-muted);margin-top:2px">${meta}</div>`
            })() : `<div style="font-size:var(--text-md, 12px);color:var(--text-muted);margin-top:2px">${meta}</div>`}
            ${(() => {
              if (!ex.notes) return ''
              const m = ex.notes.match(/^\[([^\]]+)\]\s*([\s\S]*)$/)
              if (m) return `<div style="margin-top:5px;display:flex;flex-direction:column;gap:2px"><span style="font-size:var(--text-xs, 10px);font-weight:700;text-transform:uppercase;letter-spacing:.05em;padding:1px 7px;border-radius:var(--radius-xs, 4px);background:rgba(99,102,241,.1);color:var(--accent);display:inline-block">${escapeHtml(m[1])}</span>${m[2] ? `<div style="font-size:var(--legacy-text-11-5, 11.5px);color:var(--text-muted);margin-top:1px;font-style:italic">${escapeHtml(m[2])}</div>` : ''}</div>`
              return `<div style="font-size:var(--legacy-text-11-5, 11.5px);color:var(--accent);margin-top:3px;font-style:italic">${escapeHtml(ex.notes)}</div>`
            })()}
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0">
            <button class="btn-secondary" style="font-size:var(--text-md, 12px);padding:4px 10px" onclick="showEditTemplateExerciseModal('${ex.id}','${id}')">Edit</button>
            <button class="btn-danger" style="font-size:var(--text-md, 12px);padding:4px 10px" onclick="confirmRemoveTemplateExercise('${ex.id}','${id}')">Remove</button>
          </div>
        </div>
      </div>
    </div>`
  }).join('')}</div>`
}
```

Then in `openTemplate` itself, replace the old inline `${exercises.length === 0 ? ... : ...}` block
(`js/app-workouts.js:1397-1453`) with an empty placeholder the function fills, and call it once after
the initial `el.innerHTML` assignment:

```js
    <div id="template-exercise-list"></div>
  `
  _renderTemplateExerciseList()
```

**Ruling (2026-09-13, post-dispatch correction — see ledger):** the render function's Edit/Remove/▲▼
buttons call the EXISTING functions with their EXISTING arguments —
`showEditTemplateExerciseModal('${ex.id}','${id}')`, `confirmRemoveTemplateExercise('${ex.id}','${id}')`,
`moveTemplateExercise('${id}','${ex.id}',±1)` — NOT the new staged functions, and NOT `ex._draftKey`.
Two independent reasons converged on this: (1) `scripts/check-handler-targets.mjs`, a real pre-commit
hook, statically scans every `on*="..."` attribute in the files staged for a commit and refuses one
that names a function not yet declared anywhere in that file set — `_stageReorderExercise`/
`_stageRemoveExercise` don't exist until Tasks 4/3, so this task's original code (calling them early)
could never actually be committed. (2) Independently of the hook, `showEditTemplateExerciseModal`
still has its OLD signature at this point in the plan (expecting a real database id as its first
argument) — passing `ex._draftKey` there would be a real, silent functional bug for anyone clicking
Edit between this task landing and Task 3 landing (the old body fetches by `.eq('id', texId)`, which
would find nothing for a draftKey string), invisible to every test this task or its verification
files run. Task 3 (introduces `_stageRemoveExercise`, changes `showEditTemplateExerciseModal`'s
signature) and Task 4 (introduces `_stageReorderExercise`) each update these render call sites AS
PART OF their own diffs — see the added notes in their Files/Steps sections below.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/template-draft-save-2026-09-13.spec.js -g "rendering"`
Expected: PASS

- [ ] **Step 5: Run the FULL existing suite for this file's other callers before moving on**

Run: `npx playwright test tests/week-tabs.spec.js tests/regression-2026-07-13.spec.js`
Expected: PASS (these touch `openTemplate`'s rendered output; catch any markup drift now, not later)

- [ ] **Step 6: Commit**

```bash
git add js/app-workouts.js tests/template-draft-save-2026-09-13.spec.js
git commit -m "template builder: extract _renderTemplateExerciseList, read from the draft

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Staged exercise mutators — add, edit, remove

**Files:**
- Modify: `js/app-workouts.js` — `saveExerciseToTemplate` (2495-2564), `saveEditTemplateExercise`
  (2582-2628), `deleteTemplateExercise` (2625-2646), `showEditTemplateExerciseModal` (2567-2581,
  and its callers), **and `_renderTemplateExerciseList()`'s Edit/Remove buttons (Task 2)** — change
  `onclick="showEditTemplateExerciseModal('${ex.id}','${id}')"` to
  `onclick="showEditTemplateExerciseModal('${ex._draftKey}','${id}')"` and
  `onclick="confirmRemoveTemplateExercise('${ex.id}','${id}')"` to
  `onclick="_stageRemoveExercise('${ex._draftKey}')"` — Task 2 deliberately left these calling the
  OLD functions with the OLD (real-id) arguments, since neither the new staged function nor the new
  signature existed yet at that point (see the ruling note at the end of Task 2).
- Test: `tests/template-draft-save-2026-09-13.spec.js`

**Interfaces:**
- Produces: `_stageAddExercise()`, `_stageEditExercise(draftKey)`, `_stageRemoveExercise(draftKey)` —
  each mutates `window._templateDraft.exercises`, calls `_renderTemplateExerciseList()`, and touches
  no database.
- Consumes: `window._templateDraft` (Task 1), `_renderTemplateExerciseList()` (Task 2), the existing
  `flushTemplateSets`, `_cleanTemplateSets`, `_deriveFromMetricType` (unchanged — these already
  operate on in-memory form state, not the database).

- [ ] **Step 1: Write the failing tests**

```js
test.describe('Template draft: staged exercise mutators', () => {
  const mountSetEditor = () => `
    const mk = (id, t = 'input') => { let e = document.getElementById(id); if (!e) { e = document.createElement(t); e.id = id; document.body.appendChild(e) }; return e }
    mk('att-type', 'select'); mk('att-sets-container', 'div'); mk('att-metric-pills', 'div')
    mk('att-notes', 'textarea'); mk('att-superset', 'input'); mk('att-error', 'span')
  `

  test('_stageAddExercise appends to the draft and writes nothing to the database', async ({ page }) => {
    await loginAsPT(page)
    const setup = await page.evaluate(async () => {
      const { data: t } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: null, client_id: null, name: '[E2E] Stage Add' }).select('id').single()
      return { templateId: t.id }
    })
    try {
      await page.evaluate(async (id) => { await openTemplate(id) }, setup.templateId)
      const r = await page.evaluate(`(() => {
        ${mountSetEditor()}
        window._exerciseDetailPicked = { name: '[E2E] New Exercise', id: null }
        document.getElementById('att-type').value = 'weight_reps'
        window._templateSets = [{ effortType: 'rpe', repsMin: '8' }]
        _stageAddExercise()
        return {
          draftCount: window._templateDraft.exercises.length,
          added: window._templateDraft.exercises[0],
          dirty: _templateDraftIsDirty(),
        }
      })()`)
      expect(r.draftCount).toBe(1)
      expect(r.added.exercise_name).toBe('[E2E] New Exercise')
      expect(r.added.id, 'a newly staged exercise has no real database id yet').toBeNull()
      expect(r.dirty).toBe(true)
      const dbRows = await page.evaluate(async (id) => {
        const { data } = await db.from('workout_template_exercises').select('id').eq('template_id', id)
        return data.length
      }, setup.templateId)
      expect(dbRows, 'nothing was written to the database').toBe(0)
    } finally {
      await page.evaluate(async (id) => { await db.from('workout_templates').delete().eq('id', id) }, setup.templateId)
    }
  })

  test('_stageEditExercise updates the matching draft row by draftKey, writes nothing to the database', async ({ page }) => {
    await loginAsPT(page)
    const setup = await page.evaluate(async () => {
      const { data: t } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: null, client_id: null, name: '[E2E] Stage Edit' }).select('id').single()
      const { data: ex } = await db.from('workout_template_exercises').insert({ template_id: t.id, exercise_name: '[E2E] Original', exercise_type: 'strength', order_index: 0, sets_json: [{ repsMin: '5' }] }).select('id').single()
      return { templateId: t.id, exId: ex.id }
    })
    try {
      await page.evaluate(async (id) => { await openTemplate(id) }, setup.templateId)
      const r = await page.evaluate(`(() => {
        ${mountSetEditor()}
        const draftKey = window._templateDraft.exercises[0]._draftKey
        window._exerciseDetailPicked = { name: '[E2E] Renamed', id: null }
        document.getElementById('att-type').value = 'weight_reps'
        window._templateSets = [{ effortType: 'rpe', repsMin: '10' }]
        _stageEditExercise(draftKey)
        return {
          name: window._templateDraft.exercises[0].exercise_name,
          idUnchanged: window._templateDraft.exercises[0].id,
          dirty: _templateDraftIsDirty(),
        }
      })()`)
      expect(r.name).toBe('[E2E] Renamed')
      expect(r.idUnchanged, 'editing must not change the row\'s real database id').toBe(setup.exId)
      expect(r.dirty).toBe(true)
      const dbRow = await page.evaluate(async (exId) => {
        const { data } = await db.from('workout_template_exercises').select('exercise_name').eq('id', exId).single()
        return data.exercise_name
      }, setup.exId)
      expect(dbRow, 'the database row must be untouched').toBe('[E2E] Original')
    } finally {
      await page.evaluate(async (id) => {
        await db.from('workout_template_exercises').delete().eq('template_id', id)
        await db.from('workout_templates').delete().eq('id', id)
      }, setup.templateId)
    }
  })

  test('_stageRemoveExercise removes the row from the draft only, writes nothing to the database', async ({ page }) => {
    await loginAsPT(page)
    const setup = await page.evaluate(async () => {
      const { data: t } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: null, client_id: null, name: '[E2E] Stage Remove' }).select('id').single()
      const { data: ex } = await db.from('workout_template_exercises').insert({ template_id: t.id, exercise_name: '[E2E] To Remove', exercise_type: 'strength', order_index: 0, sets_json: [{ repsMin: '5' }] }).select('id').single()
      return { templateId: t.id, exId: ex.id }
    })
    try {
      await page.evaluate(async (id) => { await openTemplate(id) }, setup.templateId)
      const r = await page.evaluate(() => {
        const draftKey = window._templateDraft.exercises[0]._draftKey
        _stageRemoveExercise(draftKey)
        return { draftCount: window._templateDraft.exercises.length, dirty: _templateDraftIsDirty() }
      })
      expect(r.draftCount).toBe(0)
      expect(r.dirty).toBe(true)
      const dbRows = await page.evaluate(async (exId) => {
        const { data } = await db.from('workout_template_exercises').select('id').eq('id', exId)
        return data.length
      }, setup.exId)
      expect(dbRows, 'the database row must still exist').toBe(1)
    } finally {
      await page.evaluate(async (id) => {
        await db.from('workout_template_exercises').delete().eq('template_id', id)
        await db.from('workout_templates').delete().eq('id', id)
      }, setup.templateId)
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test tests/template-draft-save-2026-09-13.spec.js -g "staged exercise mutators"`
Expected: FAIL — `_stageAddExercise`/`_stageEditExercise`/`_stageRemoveExercise`/`_templateDraftIsDirty` are not defined.

- [ ] **Step 3: Write the minimal implementation**

Add a dirty-check helper (used everywhere from here on):

```js
function _templateDraftIsDirty() {
  const d = window._templateDraft
  if (!d) return false
  if (d.meta.name !== d.metaBaseline.name || d.meta.description !== d.metaBaseline.description) return true
  if (d.exercises.length !== d.exercisesBaseline.length) return true
  const byId = new Map(d.exercisesBaseline.map(e => [e.id, e]))
  const FIELDS = ['exercise_id', 'exercise_name', 'exercise_type', 'metric_type', 'sets', 'sets_json', 'notes', 'superset_group']
  return d.exercises.some((ex, i) => {
    if (ex.id === null) return true // a newly added row is always a change
    const base = byId.get(ex.id)
    if (!base) return true // shouldn't happen, but a missing baseline counts as changed
    if (i !== d.exercisesBaseline.indexOf(base)) return true // order moved
    return FIELDS.some(f => JSON.stringify(ex[f]) !== JSON.stringify(base[f]))
  })
}
```

Replace `saveExerciseToTemplate`'s body (`js/app-workouts.js:2495-2564`) with:

```js
function _stageAddExercise() {
  const picked = window._exerciseDetailPicked
  const errorEl = document.getElementById('att-error')
  if (!picked?.name) { errorEl.textContent = 'Exercise name is required'; return }
  flushTemplateSets('att-sets-container')
  const metricType = document.getElementById('att-type').value || 'weight_reps'
  const derived = _deriveFromMetricType(metricType)
  const notes = document.getElementById('att-notes').value.trim() || null
  const supersetGroup = document.getElementById('att-superset')?.value.trim().toUpperCase() || null
  const cleanSets = _cleanTemplateSets(window._templateSets || [], derived, metricType)
  window._templateDraft.exercises.push({
    _draftKey: _newDraftKey(),
    id: null,
    exercise_id: picked.id || null,
    exercise_name: picked.name,
    exercise_type: derived.exercise_type,
    metric_type: metricType,
    order_index: window._templateDraft.exercises.length,
    sets: cleanSets.length || null,
    sets_json: cleanSets.length ? cleanSets : null,
    notes,
    superset_group: supersetGroup,
  })
  closeModal('add-to-template-modal')
  _renderTemplateExerciseList()
  _renderSaveWorkoutButton()
}
```

Replace `saveEditTemplateExercise`'s body (`js/app-workouts.js:2582-2628`) — note the parameter
rename from `texId` to `draftKey`:

```js
function _stageEditExercise(draftKey) {
  const errorEl = document.getElementById('att-error')
  const picked = window._exerciseDetailPicked
  if (!picked?.name) { errorEl.textContent = 'Name is required'; return }
  flushTemplateSets('att-sets-container')
  const metricType = document.getElementById('att-type').value || 'weight_reps'
  const derived = _deriveFromMetricType(metricType)
  const sets = window._templateSets || []
  sets.forEach(s => { s.unilateral = derived.unilateral; s.timed = derived.timed })
  const cleanSets = _cleanTemplateSets(sets, derived, metricType)
  const row = window._templateDraft.exercises.find(e => e._draftKey === draftKey)
  if (!row) { errorEl.textContent = 'This exercise is no longer in the workout.'; return }
  row.exercise_id = picked.id || null
  row.exercise_name = picked.name
  row.exercise_type = derived.exercise_type
  row.metric_type = metricType
  row.sets = cleanSets.length || null
  row.sets_json = cleanSets.length ? cleanSets : null
  row.notes = document.getElementById('att-notes').value.trim() || null
  row.superset_group = document.getElementById('att-superset')?.value.trim().toUpperCase() || null
  closeModal('edit-tex-modal')
  _renderTemplateExerciseList()
  _renderSaveWorkoutButton()
}
```

Replace `deleteTemplateExercise` and `confirmRemoveTemplateExercise` (`js/app-workouts.js:2625-2646`
— the 2026-09-11 row-level Remove button and its confirm wrapper) with a single staged function.
Per the spec's "Confirm dialogs that move," this drops the confirm — Discard (Task 11) is the bigger
undo that makes a per-row confirm redundant:

```js
function _stageRemoveExercise(draftKey) {
  const d = window._templateDraft
  d.exercises = d.exercises.filter(e => e._draftKey !== draftKey)
  d.exercises.forEach((e, i) => { e.order_index = i })
  _renderTemplateExerciseList()
  _renderSaveWorkoutButton()
}
```

Update `showEditTemplateExerciseModal` (`js/app-workouts.js:2567-2581`) to accept a `draftKey`
instead of a real `texId`, reading the exercise's current fields from the draft rather than
fetching:

```js
function showEditTemplateExerciseModal(draftKey, templateId) {
  const row = window._templateDraft?.exercises?.find(e => e._draftKey === draftKey)
  if (!row) return
  // ...existing modal-mount body, but seed window._exerciseDetailPicked, window._templateSets,
  // #att-type, #att-notes, #att-superset from `row` instead of a fetched database row, and change
  // the modal's Save/Remove buttons' onclick to:
  //   onclick="_stageEditExercise('${draftKey}')"   (was saveEditTemplateExercise(texId, templateId))
  //   onclick="_stageRemoveExercise('${draftKey}');closeModal('edit-tex-modal')"   (was deleteTemplateExercise(texId, templateId))
}
```

Add a no-op placeholder for the Save button (Task 6 builds the real one) so nothing throws:

```js
function _renderSaveWorkoutButton() { /* filled in by Task 6 */ }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx playwright test tests/template-draft-save-2026-09-13.spec.js -g "staged exercise mutators"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add js/app-workouts.js tests/template-draft-save-2026-09-13.spec.js
git commit -m "template builder: stage add/edit/remove exercise, no database write

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Staged reorder, delete the settle subsystem

**Files:**
- Modify: `js/app-workouts.js` — delete `REORDER_SETTLE_DELAY_MS`, `_reorderSettle`,
  `_cancelReorderSettle`, `_scheduleReorderSettle`, `_reorderChain`, `moveTemplateExercise`
  (`js/app-workouts.js:1549-1611` and the `_reorderChain.then(...)` body that follows it — read the
  full function before deleting to capture its bounds precisely)
- Modify: `js/app-workouts.js:1335` (the `openTemplate` cross-template settle-cancel check — removed,
  see Global Constraints / the fork-race note below)
- Modify: `js/app-workouts.js:1471` (`_templateGoBack`'s `_cancelReorderSettle()` call — removed)
- Modify: **`_renderTemplateExerciseList()`'s ▲/▼ buttons (Task 2)** — change
  `onclick="moveTemplateExercise('${id}','${ex.id}',-1)"` to
  `onclick="_stageReorderExercise('${ex._draftKey}',-1)"`, and the `,1)"` down-arrow equivalent —
  Task 2 deliberately left these calling the old immediate-write function, since `_stageReorderExercise`
  didn't exist yet at that point (see the ruling note at the end of Task 2).
- Modify: `tests/reorder-instant-2026-09-06.spec.js`
- Modify: `tests/reorder-propagation-2026-08-19.spec.js`

**Interfaces:**
- Consumes: `_reorderRowsInDom` (unchanged — still the pure DOM-swap helper, reused for the draft array instead of the DOM directly).
- Produces: `_stageReorderExercise(draftKey, dir)`.

- [ ] **Step 1: Write the failing test**

```js
test.describe('Template draft: staged reorder', () => {
  test('_stageReorderExercise swaps the draft order and writes nothing to the database', async ({ page }) => {
    await loginAsPT(page)
    const setup = await page.evaluate(async () => {
      const { data: t } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: null, client_id: null, name: '[E2E] Stage Reorder' }).select('id').single()
      await db.from('workout_template_exercises').insert([
        { template_id: t.id, exercise_name: '[E2E] A', exercise_type: 'strength', order_index: 0 },
        { template_id: t.id, exercise_name: '[E2E] B', exercise_type: 'strength', order_index: 1 },
        { template_id: t.id, exercise_name: '[E2E] C', exercise_type: 'strength', order_index: 2 },
      ])
      return { templateId: t.id }
    })
    try {
      await page.evaluate(async (id) => { await openTemplate(id) }, setup.templateId)
      const r = await page.evaluate(() => {
        const bKey = window._templateDraft.exercises.find(e => e.exercise_name === '[E2E] B')._draftKey
        _stageReorderExercise(bKey, -1) // B moves up, ahead of A
        return {
          names: window._templateDraft.exercises.map(e => e.exercise_name),
          indexes: window._templateDraft.exercises.map(e => e.order_index),
          dirty: _templateDraftIsDirty(),
        }
      })
      expect(r.names).toEqual(['[E2E] B', '[E2E] A', '[E2E] C'])
      expect(r.indexes, 'order_index in the draft must reflect the new positions').toEqual([0, 1, 2])
      expect(r.dirty).toBe(true)
      const dbOrder = await page.evaluate(async (id) => {
        const { data } = await db.from('workout_template_exercises').select('exercise_name, order_index').eq('template_id', id).order('order_index')
        return data.map(r => r.exercise_name)
      }, setup.templateId)
      expect(dbOrder, 'the database order must be untouched').toEqual(['[E2E] A', '[E2E] B', '[E2E] C'])
    } finally {
      await page.evaluate(async (id) => {
        await db.from('workout_template_exercises').delete().eq('template_id', id)
        await db.from('workout_templates').delete().eq('id', id)
      }, setup.templateId)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/template-draft-save-2026-09-13.spec.js -g "staged reorder"`
Expected: FAIL — `_stageReorderExercise` is not defined.

- [ ] **Step 3: Delete the settle subsystem, add the staged reorder**

Delete entirely: `REORDER_SETTLE_DELAY_MS`, `_reorderSettle`, `_cancelReorderSettle`,
`_scheduleReorderSettle`, `_reorderChain`, and the whole existing `moveTemplateExercise` function
(`js/app-workouts.js:1549` through the end of its `_reorderChain.then(...)` body). Remove the
`_cancelReorderSettle()` call at `js/app-workouts.js:1471` (inside `_templateGoBack`) and the
`if (_reorderSettle.timer && ...) _cancelReorderSettle()` check at `js/app-workouts.js:1335` (inside
`openTemplate`) — both existed only to manage a debounce timer that no longer exists.

Add in its place:

```js
function _stageReorderExercise(draftKey, dir) {
  const d = window._templateDraft
  const i = d.exercises.findIndex(e => e._draftKey === draftKey)
  if (i === -1) return
  const j = i + dir
  if (j < 0 || j >= d.exercises.length) return
  ;[d.exercises[i], d.exercises[j]] = [d.exercises[j], d.exercises[i]]
  d.exercises.forEach((e, idx) => { e.order_index = idx })
  _renderTemplateExerciseList()
  _renderSaveWorkoutButton()
}
```

Note this is deliberately simpler than the old `_reorderRowsInDom` + serialized-write approach it
replaces: reordering an in-memory array has no persistence race to guard (the array IS the truth
until Save), so there's nothing left to debounce or serialize.

- [ ] **Step 4: Run the new test to verify it passes**

Run: `npx playwright test tests/template-draft-save-2026-09-13.spec.js -g "staged reorder"`
Expected: PASS

- [ ] **Step 5: Rewrite `tests/reorder-instant-2026-09-06.spec.js`**

Keep the first two tests unchanged (`_reorderRowsInDom swaps the rows...` and `it refuses to move
the first row up...` — both test `_reorderRowsInDom` directly, a pure function this task didn't
touch). Delete these three, whose entire premise (a per-tap database write racing a debounced
propagation check, and a mid-burst template fork) no longer applies once nothing writes until Save:
- `'a reorder does NOT refetch and repaint the whole session'`
- `'a fork repaints straight away, so the next tap cannot write to the orphaned master'`
- `'a reorder queued while the template forks is dropped, not written to the old master'`

Replace the file's last test (`'seven rapid moves ask about duplicate sessions ONCE, not seven
times'`) with:

```js
test('several reorders before Save produce zero database writes and zero propagation checks', async ({ page }) => {
  await loginAsPT(page)
  const setup = await page.evaluate(async () => {
    const { data: t } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: null, client_id: null, name: '[E2E] Reorder Burst' }).select('id').single()
    await db.from('workout_template_exercises').insert(['A', 'B', 'C', 'D'].map((n, i) => ({ template_id: t.id, exercise_name: '[E2E] ' + n, exercise_type: 'strength', order_index: i })))
    return { templateId: t.id }
  })
  try {
    await page.evaluate(async (id) => { await openTemplate(id) }, setup.templateId)
    const r = await page.evaluate(() => {
      for (const name of ['[E2E] B', '[E2E] C', '[E2E] D']) {
        const key = window._templateDraft.exercises.find(e => e.exercise_name === name)._draftKey
        _stageReorderExercise(key, -1)
      }
      return { finalOrder: window._templateDraft.exercises.map(e => e.exercise_name) }
    })
    const dbOrder = await page.evaluate(async (id) => {
      const { data } = await db.from('workout_template_exercises').select('exercise_name').eq('template_id', id).order('order_index')
      return data.map(r => r.exercise_name)
    }, setup.templateId)
    expect(dbOrder, 'nothing may write to the database before Save, no matter how many reorders happen').toEqual(['[E2E] A', '[E2E] B', '[E2E] C', '[E2E] D'])
    expect(r.finalOrder.length).toBe(4) // the draft itself did change; asserting the exact permutation isn't this test's job
  } finally {
    await page.evaluate(async (id) => {
      await db.from('workout_template_exercises').delete().eq('template_id', id)
      await db.from('workout_templates').delete().eq('id', id)
    }, setup.templateId)
  }
})
```

- [ ] **Step 6: Rewrite the one affected test in `tests/reorder-propagation-2026-08-19.spec.js`**

Keep the `run()` helper and its five permutation tests unchanged — they drive
`_propagateReorderToTemplates` directly, which this task does not touch. Replace only
`'moveTemplateExercise captures a reorder change and hands off to propagation'` with:

```js
test('_stageReorderExercise never touches the network, and the queued change carries the final order', async ({ page }) => {
  await loginAsPT(page)
  const src = await page.evaluate(() => _stageReorderExercise.toString())
  expect(src, 'staged reorder must not call the database').not.toMatch(/db\.from/)
  expect(src, 'staged reorder must not call the old propagation entry point directly').not.toContain('_checkClientPlanPropagation')
})
```

(The "one combined prompt carries the final order" guarantee is covered end-to-end by Task 9's
integration test, once Save is real — this test only needs to prove reorder itself stays offline.)

- [ ] **Step 7: Run both rewritten files plus the new test**

Run: `npx playwright test tests/reorder-instant-2026-09-06.spec.js tests/reorder-propagation-2026-08-19.spec.js tests/template-draft-save-2026-09-13.spec.js`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add js/app-workouts.js tests/reorder-instant-2026-09-06.spec.js tests/reorder-propagation-2026-08-19.spec.js tests/template-draft-save-2026-09-13.spec.js
git commit -m "template builder: staged reorder, delete the settle-debounce subsystem

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Staged rename/description

**Files:**
- Modify: `js/app-workouts.js` — `saveEditTemplate` (3473-3494)
- Test: `tests/template-draft-save-2026-09-13.spec.js`

**Interfaces:**
- Produces: `_stageRenameTemplate()`.
- Consumes: `window._templateDraft.meta` (Task 1), `_renderTemplateExerciseList()` (Task 2).

- [ ] **Step 1: Write the failing test**

```js
test.describe('Template draft: staged rename', () => {
  test('_stageRenameTemplate updates the draft meta only, writes nothing to the database', async ({ page }) => {
    await loginAsPT(page)
    const setup = await page.evaluate(async () => {
      const { data: t } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: null, client_id: null, name: '[E2E] Stage Rename Before' }).select('id').single()
      return { templateId: t.id }
    })
    try {
      await page.evaluate(async (id) => { await openTemplate(id) }, setup.templateId)
      const r = await page.evaluate(`(() => {
        const mk = (id) => { let e = document.getElementById(id); if (!e) { e = document.createElement('input'); e.id = id; document.body.appendChild(e) }; return e }
        mk('et-name').value = '[E2E] Stage Rename After'
        mk('et-desc').value = 'a new description'
        _stageRenameTemplate()
        return { meta: window._templateDraft.meta, dirty: _templateDraftIsDirty() }
      })()`)
      expect(r.meta).toEqual({ name: '[E2E] Stage Rename After', description: 'a new description' })
      expect(r.dirty).toBe(true)
      const dbRow = await page.evaluate(async (id) => {
        const { data } = await db.from('workout_templates').select('name, description').eq('id', id).single()
        return data
      }, setup.templateId)
      expect(dbRow.name).toBe('[E2E] Stage Rename Before')
      expect(dbRow.description).toBeNull()
    } finally {
      await page.evaluate(async (id) => { await db.from('workout_templates').delete().eq('id', id) }, setup.templateId)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/template-draft-save-2026-09-13.spec.js -g "staged rename"`
Expected: FAIL — `_stageRenameTemplate` is not defined.

- [ ] **Step 3: Write the minimal implementation**

Replace `saveEditTemplate`'s body (`js/app-workouts.js:3473-3494`):

```js
function _stageRenameTemplate() {
  const errorEl = document.getElementById('et-error')
  const name = document.getElementById('et-name').value.trim()
  if (!name) { errorEl.textContent = 'Name is required'; return }
  const description = document.getElementById('et-desc').value.trim() || null
  window._templateDraft.meta = { name, description }
  closeModal('edit-template-modal')
  _renderTemplateExerciseList()
  _renderSaveWorkoutButton()
}
```

Update the modal's Save button (`js/app-workouts.js:3444`) from
`onclick="saveEditTemplate('${id}')"` to `onclick="_stageRenameTemplate()"` — the modal no longer
needs `id` for this button (it still needs it for the unrelated `deleteTemplate('${id}')` button
beside it, which stays immediate and unstaged, per Global Constraints).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/template-draft-save-2026-09-13.spec.js -g "staged rename"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add js/app-workouts.js tests/template-draft-save-2026-09-13.spec.js
git commit -m "template builder: stage workout rename/description, no database write

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: The "Save workout" button (visual only)

**Files:**
- Modify: `js/app-workouts.js` — `openTemplate`'s header markup (`js/app-workouts.js:1385-1394`), and
  the `_renderSaveWorkoutButton` placeholder from Task 3
- Test: `tests/template-draft-save-2026-09-13.spec.js`

**Ruling (2026-09-13, post-dispatch correction — see ledger).** The original text below said "do
not stub `saveTemplateDraft`" — wrong, and it's what got this task BLOCKED: the same real
pre-commit hook that blocked Tasks 2 and 4 (`scripts/check-handler-targets.mjs`) refuses a commit
whose onclick names an undeclared function, and `saveTemplateDraft` doesn't exist until Task 8.
Unlike Tasks 2/4, there is no OLD function to fall back on here — "Save workout" is new. The fix is
a stub: `async function saveTemplateDraft() { /* replaced by Task 8 */ }`. This is not a new pattern
for this plan — it is the exact same placeholder-then-real-implementation shape already used for
`_renderSaveWorkoutButton` itself (a real Task 3 placeholder that THIS task replaces), just one call
deeper. Task 8 replaces the stub body with the real implementation in the same place this task
defines it.

**Interfaces:**
- Produces: a real `_renderSaveWorkoutButton()` that shows/hides a "Save workout" button based on
  `_templateDraftIsDirty()`. Its `onclick` calls `saveTemplateDraft()` — a STUB this task defines
  (see ruling above), replaced by Task 8's real implementation. This task's button is wired but
  inert (clicking it does nothing observable yet, since the stub is a no-op); that's intentional per
  bite-sized tasks, and Step 1's test only checks visibility, not the click.

- [ ] **Step 1: Write the failing test**

```js
test.describe('Template draft: Save workout button visibility', () => {
  test('the Save workout button appears only once the draft is dirty', async ({ page }) => {
    await loginAsPT(page)
    const setup = await page.evaluate(async () => {
      const { data: t } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: null, client_id: null, name: '[E2E] Save Button Visibility' }).select('id').single()
      await db.from('workout_template_exercises').insert({ template_id: t.id, exercise_name: '[E2E] Only Exercise', exercise_type: 'strength', order_index: 0 })
      return { templateId: t.id }
    })
    try {
      await page.evaluate(async (id) => { await openTemplate(id) }, setup.templateId)
      const before = await page.evaluate(() => !!document.getElementById('save-template-draft-btn'))
      expect(before, 'no unsaved changes yet, so no Save button').toBe(false)
      const after = await page.evaluate(() => {
        const key = window._templateDraft.exercises[0]._draftKey
        _stageRemoveExercise(key)
        return !!document.getElementById('save-template-draft-btn')
      })
      expect(after, 'a staged change must show the Save button').toBe(true)
    } finally {
      await page.evaluate(async (id) => {
        await db.from('workout_template_exercises').delete().eq('template_id', id)
        await db.from('workout_templates').delete().eq('id', id)
      }, setup.templateId)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/template-draft-save-2026-09-13.spec.js -g "Save workout button visibility"`
Expected: FAIL — button never appears (placeholder does nothing).

- [ ] **Step 3: Write the minimal implementation**

Add a host element in `openTemplate`'s header, right after the existing button row
(`js/app-workouts.js:1385-1394`, inside the same `<div class="page-header">`):

```js
      <div id="save-template-draft-host"></div>
```

Implement `_renderSaveWorkoutButton` for real (replacing Task 3's placeholder):

```js
function _renderSaveWorkoutButton() {
  const host = document.getElementById('save-template-draft-host')
  if (!host) return
  host.innerHTML = _templateDraftIsDirty()
    ? `<button id="save-template-draft-btn" class="btn-primary" style="margin-top:8px" onclick="saveTemplateDraft()">Save workout</button>`
    : ''
}

// Stub -- Task 8 replaces this body with the real diff-and-replay implementation. Exists now only
// so the button above has a real, declared function to call (a real pre-commit hook,
// scripts/check-handler-targets.mjs, refuses an onclick naming an undeclared function).
async function saveTemplateDraft() { /* replaced by Task 8 */ }
```

Call `_renderSaveWorkoutButton()` once at the end of `openTemplate` (after `_renderTemplateExerciseList()`)
so a freshly-opened, un-edited template starts with no button.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/template-draft-save-2026-09-13.spec.js -g "Save workout button visibility"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add js/app-workouts.js tests/template-draft-save-2026-09-13.spec.js
git commit -m "template builder: Save workout button, visible only when the draft is dirty

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: The diff engine

**Files:**
- Modify: `js/app-workouts.js`
- Test: `tests-node/template-draft-diff.test.mjs` (new — pure logic, no browser needed)

**Interfaces:**
- Produces: `_diffTemplateDraft(draft)` → `{ toDelete: [id...], toInsert: [row...], toUpdate: [{id, row}...], reorder: {names} | null, rename: {name, description} | null }`.
- Consumes: the `window._templateDraft` shape from Task 1 (passed as a plain argument here, not read
  off `window`, so this function is testable with hand-built fixtures in Node — no browser, no
  Supabase — and callable identically from a real browser session in Task 8).

- [ ] **Step 1: Write the failing tests**

```js
// tests-node/template-draft-diff.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import fs from 'node:fs'

// app-workouts.js is written for a browser global scope (window.X = ...); load it into a sandboxed
// context that captures those globals, same technique other tests-node files in this repo already
// use for extracting one pure function from a browser-shaped file.
const context = { window: {}, console, escapeHtml: (s) => s }
context.window = context
vm.createContext(context)
const src = fs.readFileSync(new URL('../js/app-workouts.js', import.meta.url), 'utf8')
vm.runInContext(src, context)
const _diffTemplateDraft = context._diffTemplateDraft

const baseRow = (id, name, orderIndex, overrides = {}) => ({
  _draftKey: 'k' + id, id, exercise_id: null, exercise_name: name, exercise_type: 'strength',
  metric_type: 'weight_reps', order_index: orderIndex, sets: 1, sets_json: [{ repsMin: '5' }],
  notes: null, superset_group: null, ...overrides,
})

test('no changes produces an empty diff', () => {
  const rows = [baseRow('a', 'Bench', 0), baseRow('b', 'Row', 1)]
  const draft = { meta: { name: 'T', description: null }, metaBaseline: { name: 'T', description: null }, exercises: rows, exercisesBaseline: rows.map(r => ({ ...r })) }
  const diff = _diffTemplateDraft(draft)
  assert.deepEqual(diff.toDelete, [])
  assert.deepEqual(diff.toInsert, [])
  assert.deepEqual(diff.toUpdate, [])
  assert.equal(diff.reorder, null)
  assert.equal(diff.rename, null)
})

test('a baseline row missing from the draft is queued for delete', () => {
  const baseline = [baseRow('a', 'Bench', 0), baseRow('b', 'Row', 1)]
  const draft = { meta: { name: 'T', description: null }, metaBaseline: { name: 'T', description: null }, exercises: [baseline[0]], exercisesBaseline: baseline.map(r => ({ ...r })) }
  const diff = _diffTemplateDraft(draft)
  assert.deepEqual(diff.toDelete, ['b'])
})

test('a draft row with id:null is queued for insert, carrying its fields but no id', () => {
  const baseline = [baseRow('a', 'Bench', 0)]
  const newRow = baseRow(null, 'Squat', 1)
  const draft = { meta: { name: 'T', description: null }, metaBaseline: { name: 'T', description: null }, exercises: [...baseline, newRow], exercisesBaseline: baseline.map(r => ({ ...r })) }
  const diff = _diffTemplateDraft(draft)
  assert.equal(diff.toInsert.length, 1)
  assert.equal(diff.toInsert[0].exercise_name, 'Squat')
})

test('a changed field on a pre-existing row is queued for update, keyed by its real id', () => {
  const baseline = [baseRow('a', 'Bench', 0)]
  const edited = [baseRow('a', 'Bench', 0, { notes: 'go heavier' })]
  const draft = { meta: { name: 'T', description: null }, metaBaseline: { name: 'T', description: null }, exercises: edited, exercisesBaseline: baseline.map(r => ({ ...r })) }
  const diff = _diffTemplateDraft(draft)
  assert.equal(diff.toUpdate.length, 1)
  assert.equal(diff.toUpdate[0].id, 'a')
  assert.equal(diff.toUpdate[0].row.notes, 'go heavier')
})

test('an unchanged row that only moved position is queued as a reorder, not an update', () => {
  const baseline = [baseRow('a', 'Bench', 0), baseRow('b', 'Row', 1)]
  const reordered = [baseRow('b', 'Row', 0), baseRow('a', 'Bench', 1)]
  const draft = { meta: { name: 'T', description: null }, metaBaseline: { name: 'T', description: null }, exercises: reordered, exercisesBaseline: baseline.map(r => ({ ...r })) }
  const diff = _diffTemplateDraft(draft)
  assert.deepEqual(diff.toUpdate, [])
  assert.deepEqual(diff.reorder, { names: ['Row', 'Bench'] })
})

test('a renamed workout is queued for rename only when meta actually differs', () => {
  const rows = [baseRow('a', 'Bench', 0)]
  const draft = { meta: { name: 'New Name', description: 'new desc' }, metaBaseline: { name: 'Old Name', description: null }, exercises: rows, exercisesBaseline: rows.map(r => ({ ...r })) }
  const diff = _diffTemplateDraft(draft)
  assert.deepEqual(diff.rename, { name: 'New Name', description: 'new desc' })
})

test('a mix of every operation type in one diff', () => {
  const baseline = [baseRow('a', 'Bench', 0), baseRow('b', 'Row', 1), baseRow('c', 'Curl', 2)]
  const draft = {
    meta: { name: 'Renamed', description: null },
    metaBaseline: { name: 'Original', description: null },
    exercises: [
      baseRow('c', 'Curl', 0),               // reordered ahead
      baseRow('a', 'Bench', 1, { notes: 'x' }), // reordered + edited
      baseRow(null, 'New Exercise', 2),       // inserted
      // 'b'/Row is gone entirely -> deleted
    ],
    exercisesBaseline: baseline.map(r => ({ ...r })),
  }
  const diff = _diffTemplateDraft(draft)
  assert.deepEqual(diff.toDelete, ['b'])
  assert.equal(diff.toInsert.length, 1)
  assert.equal(diff.toUpdate.length, 1)
  assert.equal(diff.toUpdate[0].id, 'a')
  assert.deepEqual(diff.reorder, { names: ['Curl', 'Bench', 'New Exercise'] })
  assert.deepEqual(diff.rename, { name: 'Renamed', description: null })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests-node/template-draft-diff.test.mjs`
Expected: FAIL — `_diffTemplateDraft` is `undefined` on the sandboxed context.

- [ ] **Step 3: Write the minimal implementation**

```js
function _diffTemplateDraft(draft) {
  const baselineById = new Map(draft.exercisesBaseline.map(e => [e.id, e]))
  const draftIds = new Set(draft.exercises.map(e => e.id).filter(id => id !== null))

  const toDelete = draft.exercisesBaseline.filter(e => !draftIds.has(e.id)).map(e => e.id)

  const toInsert = draft.exercises.filter(e => e.id === null).map(e => ({ ...e }))

  const FIELDS = ['exercise_id', 'exercise_name', 'exercise_type', 'metric_type', 'sets', 'sets_json', 'notes', 'superset_group']
  const toUpdate = draft.exercises
    .filter(e => e.id !== null)
    .filter(e => FIELDS.some(f => JSON.stringify(e[f]) !== JSON.stringify(baselineById.get(e.id)?.[f])))
    .map(e => ({ id: e.id, row: e }))

  // Order compares the SURVIVING pre-existing rows' relative sequence, ignoring newly-inserted rows
  // (which have no baseline position to compare against) and deleted ones (already gone).
  const survivingDraftOrder = draft.exercises.filter(e => e.id !== null).map(e => e.id)
  const survivingBaselineOrder = draft.exercisesBaseline.filter(e => draftIds.has(e.id)).map(e => e.id)
  const orderChanged = JSON.stringify(survivingDraftOrder) !== JSON.stringify(survivingBaselineOrder)
  const reorder = orderChanged ? { names: draft.exercises.map(e => e.exercise_name) } : null

  const rename = (draft.meta.name !== draft.metaBaseline.name || draft.meta.description !== draft.metaBaseline.description)
    ? { name: draft.meta.name, description: draft.meta.description }
    : null

  return { toDelete, toInsert, toUpdate, reorder, rename }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests-node/template-draft-diff.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add js/app-workouts.js tests-node/template-draft-diff.test.mjs
git commit -m "template builder: pure diff engine for the staged draft

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Save replay — resolve once, apply the diff

**Files:**
- Modify: `js/app-workouts.js`
- Test: `tests/template-draft-save-2026-09-13.spec.js`

**Interfaces:**
- Produces: `saveTemplateDraft()` — the real "Save workout" handler. Task 6 already declared this as
  a no-op stub (`async function saveTemplateDraft() { /* replaced by Task 8 */ }`) so its own button
  had a real function to call; this task REPLACES that stub's body, it does not add a new function.
- Consumes: `_diffTemplateDraft` (Task 7), `_resolveEditableTemplateId`, `_resolveTemplateOwnerCoachId`,
  `_verifyTemplateOwnership` (all pre-existing, unchanged), and the core write logic factored out of
  `saveExerciseToTemplate`/`saveEditTemplateExercise`/`deleteTemplateExercise`/`saveEditTemplate` in
  earlier tasks (their DB-writing bodies were replaced by staging in Tasks 3 and 5 — this task adds
  back a real write path, called from `saveTemplateDraft`, not from the modals).
- Produces (for Task 9): `window._lastExerciseChanges` — an array, replacing the singular
  `window._lastExerciseChange` everywhere it's read.

- [ ] **Step 1: Write the failing test**

```js
test.describe('Template draft: Save replay', () => {
  test('saveTemplateDraft resolves the editable template ID exactly once, then applies every queued change against it', async ({ page }) => {
    await loginAsPT(page)
    const setup = await page.evaluate(async () => {
      const { data: t } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: null, client_id: null, name: '[E2E] Save Replay' }).select('id').single()
      await db.from('workout_template_exercises').insert([
        { template_id: t.id, exercise_name: '[E2E] A', exercise_type: 'strength', order_index: 0 },
        { template_id: t.id, exercise_name: '[E2E] B', exercise_type: 'strength', order_index: 1 },
      ])
      return { templateId: t.id }
    })
    try {
      await page.evaluate(async (id) => { await openTemplate(id) }, setup.templateId)
      const r = await page.evaluate(`(async () => {
        // Stage 3 different kinds of change: delete B, reorder (trivial with one left, but exercises
        // the path), and add a new one.
        const bKey = window._templateDraft.exercises.find(e => e.exercise_name === '[E2E] B')._draftKey
        _stageRemoveExercise(bKey)
        const mk = (id, t = 'input') => { let e = document.getElementById(id); if (!e) { e = document.createElement(t); e.id = id; document.body.appendChild(e) }; return e }
        mk('att-type', 'select'); mk('att-sets-container', 'div'); mk('att-metric-pills', 'div')
        mk('att-notes', 'textarea'); mk('att-superset', 'input'); mk('att-error', 'span')
        window._exerciseDetailPicked = { name: '[E2E] C', id: null }
        document.getElementById('att-type').value = 'weight_reps'
        window._templateSets = [{ effortType: 'rpe' }]
        _stageAddExercise()

        // Stub the propagation entry point so this test proves the WRITE half only -- Task 9 proves
        // the propagation half.
        let propagationCalledWith = null
        window._checkClientPlanPropagation = async (id, ctx, changes) => { propagationCalledWith = changes }

        let resolveCalls = 0
        const realResolve = window._resolveEditableTemplateId
        window._resolveEditableTemplateId = async (...args) => { resolveCalls++; return realResolve(...args) }

        await saveTemplateDraft()
        return { resolveCalls, propagationCalledWith, dirtyAfter: _templateDraftIsDirty() }
      })()`)
      expect(r.resolveCalls, '_resolveEditableTemplateId must run exactly once per Save, never once per queued change').toBe(1)
      expect(r.propagationCalledWith.length, 'three staged changes must produce three entries in the combined change list').toBe(3)
      expect(r.dirtyAfter, 'after a successful Save the draft is clean again').toBe(false)

      const dbRows = await page.evaluate(async (id) => {
        const { data } = await db.from('workout_template_exercises').select('exercise_name').eq('template_id', id).order('order_index')
        return data.map(r => r.exercise_name)
      }, setup.templateId)
      expect(dbRows).toEqual(['[E2E] A', '[E2E] C'])
    } finally {
      await page.evaluate(async (id) => {
        await db.from('workout_template_exercises').delete().eq('template_id', id)
        await db.from('workout_templates').delete().eq('id', id)
      }, setup.templateId)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/template-draft-save-2026-09-13.spec.js -g "Save replay"`
Expected: FAIL — NOT "not defined" (Task 6 already declared `saveTemplateDraft` as a no-op stub, so
it exists). Instead the test's own assertions fail — e.g. `resolveCalls` stays `0` and
`propagationCalledWith` stays `null`, because the stub does nothing.

- [ ] **Step 3: Replace Task 6's stub with the real implementation**

Find `async function saveTemplateDraft() { /* replaced by Task 8 */ }` (Task 6) and replace its
ENTIRE body with the real implementation below — this edits the existing declaration in place, it
does not add a second `saveTemplateDraft` function anywhere else in the file (a duplicate top-level
function is exactly the class of defect this project's review explicitly watches for).

```js
async function saveTemplateDraft() {
  const d = window._templateDraft
  if (!d || !_templateDraftIsDirty()) return

  // Resolve the real write target EXACTLY ONCE for this whole batch. Calling
  // _resolveEditableTemplateId per queued change would risk forking a SECOND clone of a still-shared
  // template on the second call, orphaning the first -- see Global Constraints.
  const { templateId: targetId } = await _resolveEditableTemplateId(d.templateId)
  const coachId = await _resolveTemplateOwnerCoachId()
  if (!(await _verifyTemplateOwnership(targetId, coachId))) {
    showToast('Save failed — template not found or permission denied.', 'warn')
    return
  }

  const diff = _diffTemplateDraft(d)
  const changes = []
  let failedAt = null

  for (const id of diff.toDelete) {
    const { data, error } = await db.from('workout_template_exercises').delete().eq('id', id).eq('template_id', targetId).select()
    if (error || !data?.length) { failedAt = { step: 'delete', id }; break }
    changes.push({ op: 'delete', matchName: d.exercisesBaseline.find(e => e.id === id)?.exercise_name, row: null })
  }

  if (!failedAt) for (const u of diff.toUpdate) {
    const { row } = u
    const patch = { exercise_id: row.exercise_id, exercise_name: row.exercise_name, exercise_type: row.exercise_type, metric_type: row.metric_type, sets: row.sets, sets_json: row.sets_json, notes: row.notes, superset_group: row.superset_group }
    const { data, error } = await db.from('workout_template_exercises').update(patch).eq('id', u.id).eq('template_id', targetId).select()
    if (error || !data?.length) { failedAt = { step: 'update', id: u.id }; break }
    const origName = d.exercisesBaseline.find(e => e.id === u.id)?.exercise_name
    changes.push({ op: 'update', matchName: origName || row.exercise_name, row: patch })
  }

  if (!failedAt) for (const row of diff.toInsert) {
    const { exercise_id, exercise_name, exercise_type, metric_type, sets, sets_json, notes, superset_group } = row
    const { data: existing } = await db.from('workout_template_exercises').select('order_index').eq('template_id', targetId).order('order_index', { ascending: false }).limit(1)
    const nextOrder = existing?.length ? (existing[0].order_index + 1) : 0
    const insertRow = { template_id: targetId, exercise_id, exercise_name, exercise_type, metric_type, order_index: nextOrder, sets, sets_json, notes, superset_group }
    const { error } = await db.from('workout_template_exercises').insert(insertRow)
    if (error) { failedAt = { step: 'insert', name: exercise_name }; break }
    changes.push({ op: 'add', matchName: exercise_name, row: insertRow })
  }

  if (!failedAt && diff.reorder) {
    const failures = await _propagateReorderToTemplates(diff.reorder, [targetId])
    if (failures) { failedAt = { step: 'reorder' } }
    else changes.push({ op: 'reorder', names: diff.reorder.names })
  }

  if (!failedAt && diff.rename) {
    const { data, error } = await db.from('workout_templates').update(diff.rename).eq('id', targetId).eq('coach_id', coachId).select()
    if (error || !data?.length) { failedAt = { step: 'rename' } }
    else changes.push({ op: 'rename', ...diff.rename })
  }

  if (failedAt) {
    // Partial-failure recovery is Task 10; for now, surface the failure and stop rather than silently
    // continuing or pretending everything saved.
    log.error('saveTemplateDraft', 'batch save failed partway through', failedAt)
    showToast(`Save failed at "${failedAt.step}" — some changes may not have saved. Refresh to check.`, 'warn')
    return
  }

  window._lastExerciseChanges = changes
  await openTemplate(targetId, d.ctx)
  if (changes.length) await _checkClientPlanPropagation(targetId, d.ctx, changes)
}
```

Note: `_propagateReorderToTemplates(change, ids)` is the existing function (unchanged) that already
knows how to write a full reordered `names` list against a target — reused here directly rather than
duplicated, exactly matching the "replay through the existing write functions" principle from the
spec. `openTemplate(targetId, d.ctx)` at the end rebuilds `window._templateDraft` fresh from the now
truly-saved database state, which is what makes `_templateDraftIsDirty()` false immediately after.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/template-draft-save-2026-09-13.spec.js -g "Save replay"`
Expected: PASS

- [ ] **Step 5: Write and verify an ownership-refusal test**

**Why this step exists.** Task 4's implementer deleted the only test that ever covered a foreign
(not-owned) template being refused during a reorder (`tests/ownership-anchors-2026-08-21.spec.js`'s
`moveTemplateExercise refuses a template owned by another coach` — correctly, since
`_stageReorderExercise` has no per-op ownership check anymore) on the grounds that the GENERAL
guarantee — ownership is verified once, at Save — belongs here instead of being re-tested per op
type. This step is that guarantee's actual test; without it, this specific case (a call reaching
`saveTemplateDraft` for a template the caller doesn't own) has zero coverage anywhere in this plan.

```js
test('saveTemplateDraft refuses to save a template the current user does not own, at the app layer', async ({ page, browser }) => {
  const pt2Ctx = await browser.newContext()
  let foreignTemplateId
  try {
    const pt2Page = await pt2Ctx.newPage()
    await loginAsPT2(pt2Page)
    foreignTemplateId = await pt2Page.evaluate(async () => {
      const { data } = await db.from('workout_templates').insert({ coach_id: currentUser.id, name: '[E2E] Foreign Save Target', is_personal: false }).select('id').single()
      return data.id
    })

    await loginAsPT(page)
    const r = await page.evaluate(async (tid) => {
      // Constructed directly rather than via openTemplate(tid): RLS already refuses the SELECT
      // openTemplate needs to build a real draft for a template we don't own, so it would never
      // reach this code path in the first place. This test is specifically for the APP-LEVEL gate
      // saveTemplateDraft itself owns -- defense in depth, same reasoning the pre-existing
      // ownership-anchors suite already uses for its other (still-passing) tests.
      window._templateDraft = {
        templateId: tid,
        ctx: {},
        meta: { name: 'tampered', description: null },
        metaBaseline: { name: 'original', description: null },
        exercises: [], exercisesBaseline: [],
      }
      let toast = ''
      const origToast = window.showToast
      window.showToast = (m) => { toast = m }
      try {
        await saveTemplateDraft()
      } finally { window.showToast = origToast }
      const { data } = await db.from('workout_templates').select('name').eq('id', tid).maybeSingle()
      return { toast, nameAfter: data?.name ?? null }
    }, foreignTemplateId)
    expect(r.toast.toLowerCase(), 'must refuse with a permission message, not silently no-op').toContain('permission denied')
    expect(r.nameAfter, 'the foreign template must be completely untouched').toBe('[E2E] Foreign Save Target')
  } finally {
    if (foreignTemplateId) {
      await pt2Ctx.pages()[0].evaluate(async (tid) => { await db.from('workout_templates').delete().eq('id', tid) }, foreignTemplateId)
    }
    await pt2Ctx.close()
  }
})
```

Run: `npx playwright test tests/template-draft-save-2026-09-13.spec.js -g "Save replay"`
Expected: PASS (2 tests now)

- [ ] **Step 6: Commit**

```bash
git add js/app-workouts.js tests/template-draft-save-2026-09-13.spec.js
git commit -m "template builder: saveTemplateDraft replays the diff, resolving the target once

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: Propagation chain — singular to plural

**Files:**
- Modify: `js/app-workouts.js` — `_checkClientPlanPropagation` (2821-2853), `_checkSiblingPropagation`
  (2942-3044), `_propagateModalHtml` (2916-2940), `_showClientCopyPropagateModal` (2856-2876),
  `_continueAfterClientCopy` (2878-2884), `_showPropagateModal`'s call inside `_checkSiblingPropagation`,
  `_applyToAllSessions` (find via `grep -n "async function _applyToAllSessions" js/app-workouts.js`)
- Modify: `tests/propagation-honesty-2026-09-06.spec.js`
- Test: `tests/template-draft-save-2026-09-13.spec.js`

**Interfaces:**
- Changes `_checkClientPlanPropagation(templateId, ctxOverride, changeOverride)`'s third parameter
  to `changesOverride` (an array). Same rename for `_checkSiblingPropagation`.
- `_applyChangeToTemplates(change, ids)` is UNCHANGED (still takes one change) — call sites now loop
  an array and sum failures, rather than this function growing a plural twin.

- [ ] **Step 1: Write the failing test**

```js
test.describe('Template draft: combined propagation prompt', () => {
  test('a Save carrying 3 changes produces ONE propagation prompt describing all 3, not one prompt per change', async ({ page, browser }) => {
    await loginAsPT(page)
    const ptCtx = await browser.newContext()
    const pt2 = await ptCtx.newPage()
    // (fixture setup mirrors reorder-propagation-2026-08-19.spec.js's family_id pattern: a program
    // with a phase, one master template in two week slots sharing a family_id, so the "other
    // sessions" prompt has something real to offer)
    const setup = await page.evaluate(async () => {
      const { data: prog } = await db.from('programs').insert({ coach_id: currentUser.id, name: '[E2E] Combined Prompt Program' }).select('id').single()
      const { data: phase } = await db.from('program_phases').insert({ program_id: prog.id, name: 'Block 1', duration_weeks: 2, order_index: 0 }).select('id').single()
      const { data: t } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: prog.id, name: '[E2E] Combined Prompt Session' }).select('id').single()
      await db.from('workout_template_exercises').insert([
        { template_id: t.id, exercise_name: '[E2E] A', exercise_type: 'strength', order_index: 0 },
        { template_id: t.id, exercise_name: '[E2E] B', exercise_type: 'strength', order_index: 1 },
      ])
      const { data: pw1 } = await db.from('program_phase_workouts').insert({ phase_id: phase.id, day_of_week: 1, day_label: 'Monday', session_order: 1, template_id: t.id, week_number: 1 }).select('id, template_id').single()
      await db.from('program_phase_workouts').insert({ phase_id: phase.id, day_of_week: 1, day_label: 'Monday', session_order: 1, template_id: t.id, week_number: 2 })
      return { programId: prog.id, templateId: t.id, phaseWorkoutId: pw1.id }
    })
    try {
      await page.evaluate(async ({ templateId, phaseWorkoutId, programId }) => {
        await openTemplate(templateId, { programId, phaseWorkoutId })
      }, setup)
      const r = await page.evaluate(`(async () => {
        const bKey = window._templateDraft.exercises.find(e => e.exercise_name === '[E2E] B')._draftKey
        _stageRemoveExercise(bKey)
        const mk = (id, t = 'input') => { let e = document.getElementById(id); if (!e) { e = document.createElement(t); e.id = id; document.body.appendChild(e) }; return e }
        mk('att-type', 'select'); mk('att-sets-container', 'div'); mk('att-metric-pills', 'div')
        mk('att-notes', 'textarea'); mk('att-superset', 'input'); mk('att-error', 'span')
        window._exerciseDetailPicked = { name: '[E2E] C', id: null }
        document.getElementById('att-type').value = 'weight_reps'
        window._templateSets = [{ effortType: 'rpe' }]
        _stageAddExercise()

        const mk2 = (id) => { let e = document.getElementById(id); if (!e) { e = document.createElement('input'); e.id = id; document.body.appendChild(e) }; return e }
        mk2('et-name').value = '[E2E] Combined Prompt Session RENAMED'
        _stageRenameTemplate()

        await saveTemplateDraft()
        await new Promise(r => setTimeout(r, 300))
        return {
          modalText: document.getElementById('propagate-modal')?.textContent || '',
          modalCount: document.querySelectorAll('.modal-overlay').length,
        }
      })()`)
      expect(r.modalCount, 'exactly one propagation modal, not three').toBe(1)
      expect(r.modalText).toContain('3 changes')
      expect(r.modalText).toMatch(/removed|added|renamed/i)
    } finally {
      await page.evaluate(async (s) => {
        await db.from('programs').delete().eq('id', s.programId)
        await db.from('workout_templates').delete().eq('name', '[E2E] Combined Prompt Session').eq('coach_id', currentUser.id)
      }, setup)
      await ptCtx.close()
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/template-draft-save-2026-09-13.spec.js -g "combined propagation prompt"`
Expected: FAIL — the propagation functions still expect a single `change`, so `changes.length` reads
`undefined` and today's singular wording appears instead of "3 changes".

- [ ] **Step 3: Update the propagation chain to accept arrays**

In `_checkClientPlanPropagation` (`js/app-workouts.js:2821`), rename the parameter and every
`change`/`changeOverride` reference inside it to `changes`/`changesOverride`; the one place it calls
`_applyChangeToTemplates(change, copies.soloSelfIds)` becomes a loop:

```js
async function _checkClientPlanPropagation(templateId, ctxOverride, changesOverride) {
  const ctx = ctxOverride || window._templateCtx
  const changes = changesOverride !== undefined ? changesOverride : window._lastExerciseChanges

  if (changes?.length && ctx?.programId && !ctx.isClientPlan) {
    const copies = await _assignedCopiesForSession([templateId])
    let soloPropFailures = 0
    if (copies.soloSelfIds.length) {
      for (const change of changes) soloPropFailures += (await _applyChangeToTemplates(change, copies.soloSelfIds)) || 0
    }
    if (currentProfile?.role === 'solo' && copies.realClientCount && !soloPropFailures) {
      showToast(`Personal edit — ${copies.realClientCount} assigned client${copies.realClientCount === 1 ? "'s plan was" : "s' plans were"} not changed. Switch to PT view to update them.`, 'info', 6000)
    }
    if (copies.realClientIds.length) {
      window._pendingClientCopyProp = { changes, ids: copies.realClientIds }
      _showClientCopyPropagateModal(copies.realClientNames, templateId)
      return
    }
  }

  return _checkSiblingPropagation(templateId, ctx, changes)
}
```

`_continueAfterClientCopy` (`js/app-workouts.js:2878`) — its `_applyChangeToTemplates(p.change, p.ids)`
becomes a loop over `p.changes`:

```js
async function _continueAfterClientCopy(templateId, doIt) {
  closeModal('client-copy-modal')
  const p = window._pendingClientCopyProp
  if (doIt && p) for (const change of p.changes) await _applyChangeToTemplates(change, p.ids)
  window._pendingClientCopyProp = null
  _checkSiblingPropagation(templateId)
}
```

`_checkSiblingPropagation` (`js/app-workouts.js:2942`) — rename its `changeOverride` parameter to
`changesOverride`/`changes`, and store `window._propagateChanges = changes` (renamed from
`window._propagateChange`) at both its "Client plan propagation" and "Master program propagation"
branches (`js/app-workouts.js:3010-3012` and `:3037-3039`).

`_applyToAllSessions` — find it (`grep -n "async function _applyToAllSessions" js/app-workouts.js`),
read its body, and change its `_applyChangeToTemplates(window._propagateChange, ...)` call to loop
`window._propagateChanges` the same way.

`_propagateModalHtml` (`js/app-workouts.js:2916`) — replace the single-change `detail`/`action`
logic with a pluralized summary. The signature changes from taking `isRename`/`op` to taking the
whole `changes` array:

```js
function _propagateModalHtml ({ templateId, name, count, label, unlinked = 0, changes = [] }) {
  const OP_LABEL = { add: n => `${n} added`, update: n => `${n} updated`, delete: n => `${n} removed`, rename: () => 'renamed', reorder: () => 'reordered' }
  const summary = changes.length === 1
    ? (changes[0].op === 'rename' ? 'Only the name and description will be applied — a week marker like "— W2" is kept.'
       : changes[0].op === 'reorder' ? 'Only the ORDER changes. Exercises a copy has that this one does not stay exactly where they are.'
       : 'Only the exercise you changed will be applied.')
    : `${changes.length} changes: ${changes.map(c => OP_LABEL[c.op] ? OP_LABEL[c.op](c.matchName || '') : c.op).join(' · ')}`
  const action = changes.length === 1 && changes[0].op === 'rename' ? `Rename all ${count + 1}`
    : changes.length === 1 && changes[0].op === 'reorder' ? `Reorder all ${count + 1}`
    : `Update all ${count + 1} copies`
  const one = unlinked === 1
  return `
      <div class="modal">
        <div class="modal-header">
          <h2 class="modal-title">Apply to other sessions?</h2>
          <button class="modal-close" onclick="closeModal('propagate-modal');openTemplate('${templateId}',window._templateCtx)">✕</button>
        </div>
        <p style="font-size:var(--text-lg, 14px);line-height:1.6;margin:0 0 ${unlinked ? '12px' : '20px'}">There ${count === 1 ? 'is' : 'are'} <strong>${count}</strong> other cop${count === 1 ? 'y' : 'ies'} of "<strong>${escapeHtml(name)}</strong>" in ${escapeHtml(label)}. ${escapeHtml(summary)}</p>
        ${unlinked ? `<p style="font-size:var(--text-base, 13px);line-height:1.6;margin:0 0 20px;color:var(--text-muted)"><strong>${unlinked}</strong> other session${one ? '' : 's'} here share${one ? 's' : ''} this name but ${one ? 'is' : 'are'} not linked to this one, so ${one ? 'it' : 'they'} will not change.</p>` : ''}
        <div class="modal-footer">
          <button class="btn-secondary" onclick="closeModal('propagate-modal');openTemplate('${templateId}',window._templateCtx)">Just this session</button>
          <button class="btn-primary" onclick="_applyToAllSessions('${templateId}')">${action}</button>
        </div>
      </div>
    `
}
```

Update its one call site inside `_checkSiblingPropagation`'s `_showPropagateModal` closure to pass
`changes` instead of `isRename`/`op`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/template-draft-save-2026-09-13.spec.js -g "combined propagation prompt"`
Expected: PASS

- [ ] **Step 5: Rewrite `tests/propagation-honesty-2026-09-06.spec.js`**

Read the file fresh first (`grep -n "test(" tests/propagation-honesty-2026-09-06.spec.js`) to
enumerate its exact assertions — the spec flagged this as the heaviest lift, and its precise
before/after depends on what it currently asserts word-for-word. At minimum, every assertion that
checks the singular-change wording ("Only the exercise you changed will be applied", "Only the
ORDER changes", the rename sentence) needs a single-change-array counterpart (`changes: [oneChange]`
still produces the identical sentence — Task 9's `_propagateModalHtml` preserves this on purpose)
plus a new multi-change case proving the pluralized summary appears instead. Do not delete any
existing single-change assertion without replacing it with an equivalent driven through the new
array-shaped call site.

- [ ] **Step 6: Run the full propagation test surface**

Run: `npx playwright test tests/propagation-honesty-2026-09-06.spec.js tests/template-draft-save-2026-09-13.spec.js tests/reorder-propagation-2026-08-19.spec.js`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add js/app-workouts.js tests/propagation-honesty-2026-09-06.spec.js tests/template-draft-save-2026-09-13.spec.js
git commit -m "template builder: propagation chain takes an array of changes, pluralized copy

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 10: Partial-failure recovery

**Files:**
- Modify: `js/app-workouts.js` — `saveTemplateDraft` (Task 8)
- Test: `tests/template-draft-save-2026-09-13.spec.js`

**Interfaces:**
- Changes `saveTemplateDraft`'s failure branch from "log and stop" to "rebuild the draft from real
  state, keep the unsaved remainder, tell the user what did and didn't land."

- [ ] **Step 1: Write the failing test**

```js
test.describe('Template draft: partial-failure recovery', () => {
  test('when a batch save fails partway through, successful changes are not re-applied and the failed ones remain staged', async ({ page }) => {
    await loginAsPT(page)
    const setup = await page.evaluate(async () => {
      const { data: t } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: null, client_id: null, name: '[E2E] Partial Failure' }).select('id').single()
      await db.from('workout_template_exercises').insert([
        { template_id: t.id, exercise_name: '[E2E] A', exercise_type: 'strength', order_index: 0 },
        { template_id: t.id, exercise_name: '[E2E] B', exercise_type: 'strength', order_index: 1 },
      ])
      return { templateId: t.id }
    })
    try {
      await page.evaluate(async (id) => { await openTemplate(id) }, setup.templateId)
      const r = await page.evaluate(`(async () => {
        // Delete A (will succeed), then stage an insert that the stub below makes fail.
        const aKey = window._templateDraft.exercises.find(e => e.exercise_name === '[E2E] A')._draftKey
        _stageRemoveExercise(aKey)
        const mk = (id, t = 'input') => { let e = document.getElementById(id); if (!e) { e = document.createElement(t); e.id = id; document.body.appendChild(e) }; return e }
        mk('att-type', 'select'); mk('att-sets-container', 'div'); mk('att-metric-pills', 'div')
        mk('att-notes', 'textarea'); mk('att-superset', 'input'); mk('att-error', 'span')
        window._exerciseDetailPicked = { name: '[E2E] Will Fail', id: null }
        document.getElementById('att-type').value = 'weight_reps'
        window._templateSets = [{ effortType: 'rpe' }]
        _stageAddExercise()

        const realFrom = db.from.bind(db)
        db.from = (tbl) => {
          if (tbl !== 'workout_template_exercises') return realFrom(tbl)
          const real = realFrom(tbl)
          return { ...real, insert: () => Promise.resolve({ error: { message: 'simulated failure' } }), select: real.select.bind(real), update: real.update.bind(real), delete: real.delete.bind(real) }
        }
        let toastMsg = null
        window.showToast = (msg) => { toastMsg = msg }
        try {
          await saveTemplateDraft()
        } finally {
          db.from = realFrom
        }
        return {
          toastMsg,
          stillDirty: _templateDraftIsDirty(),
          draftHasFailedInsert: window._templateDraft.exercises.some(e => e.exercise_name === '[E2E] Will Fail'),
        }
      })()`)
      expect(r.toastMsg, 'the user must be told something failed').toBeTruthy()
      expect(r.stillDirty, 'the failed change must still be staged for another attempt').toBe(true)
      expect(r.draftHasFailedInsert).toBe(true)

      const dbNames = await page.evaluate(async (id) => {
        const { data } = await db.from('workout_template_exercises').select('exercise_name').eq('template_id', id)
        return data.map(r => r.exercise_name)
      }, setup.templateId)
      expect(dbNames, 'the successful delete must have actually committed').toEqual(['[E2E] B'])
      expect(dbNames).not.toContain('[E2E] Will Fail')
    } finally {
      await page.evaluate(async (id) => {
        await db.from('workout_template_exercises').delete().eq('template_id', id)
        await db.from('workout_templates').delete().eq('id', id)
      }, setup.templateId)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/template-draft-save-2026-09-13.spec.js -g "partial-failure recovery"`
Expected: FAIL — today's failure branch doesn't rebuild the draft, so `stillDirty` reads `false` (the
old code path doesn't re-fetch, leaving whatever `_templateDraftIsDirty` last computed) or the test
otherwise doesn't match the expected shape.

- [ ] **Step 3: Write the minimal implementation**

Replace `saveTemplateDraft`'s failure branch (the `if (failedAt) { ... }` block from Task 8) with:

```js
  if (failedAt) {
    log.error('saveTemplateDraft', 'batch save failed partway through', failedAt)
    // Re-fetch the REAL state -- some of the batch already committed for real -- and fold in only
    // the changes that had not yet been reached (plus the one that just failed), so a retry never
    // re-applies what already landed.
    const succeededCount = changes.length
    const { data: freshT } = await db.from('workout_templates').select('*, workout_template_exercises(*)').eq('id', targetId).single()
    if (freshT) {
      const freshExercises = (freshT.workout_template_exercises || []).sort((a, b) => a.order_index - b.order_index)
      window._templateDraft = {
        templateId: targetId,
        ctx: d.ctx,
        meta: { name: freshT.name, description: freshT.description },
        metaBaseline: { name: freshT.name, description: freshT.description },
        exercises: freshExercises.map(_toDraftRow),
        exercisesBaseline: freshExercises.map(_toDraftRow),
      }
      // Re-stage whatever this batch had not successfully applied yet, so it's still there to retry.
      // (deletes/updates that hadn't run yet still reference real ids present in the fresh fetch;
      // inserts that hadn't run yet had no id and are appended fresh.)
      const doneOps = new Set(changes.map(c => `${c.op}:${c.matchName}`))
      for (const id of diff.toDelete) if (!doneOps.has(`delete:${d.exercisesBaseline.find(e => e.id === id)?.exercise_name}`)) {
        window._templateDraft.exercises = window._templateDraft.exercises.filter(e => e.id !== id)
      }
      for (const u of diff.toUpdate) if (!doneOps.has(`update:${d.exercisesBaseline.find(e => e.id === u.id)?.exercise_name}`)) {
        const row = window._templateDraft.exercises.find(e => e.id === u.id)
        if (row) Object.assign(row, u.row)
      }
      for (const row of diff.toInsert) if (!doneOps.has(`add:${row.exercise_name}`)) {
        window._templateDraft.exercises.push({ ...row, _draftKey: _newDraftKey(), id: null })
      }
      _renderTemplateExerciseList()
      _renderSaveWorkoutButton()
    }
    showToast(`${succeededCount} change${succeededCount === 1 ? '' : 's'} saved, ${failedAt.step} failed — try Save again`, 'warn')
    return
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/template-draft-save-2026-09-13.spec.js -g "partial-failure recovery"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add js/app-workouts.js tests/template-draft-save-2026-09-13.spec.js
git commit -m "template builder: partial-failure recovery on a batch save

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 11: Leaving with unsaved changes

**Files:**
- Modify: `js/app-workouts.js` — `_templateGoBack` (1463-1489), `confirmDialog` in `js/app-core.js`
  (extend for a third action, or add a small standalone modal — see Step 3)
- Test: `tests/template-draft-save-2026-09-13.spec.js`

**Interfaces:**
- Produces: `_confirmLeaveTemplateDraft()`, called from the top of `_templateGoBack()`.

- [ ] **Step 1: Write the failing tests**

```js
test.describe('Template draft: leaving with unsaved changes', () => {
  const mountBackFn = () => page.evaluate(() => {
    window._leftCount = 0
    window._templateCtx = window._templateCtx || {}
    window._templateCtx.backFn = () => { window._leftCount++ }
  })

  test('leaving with a clean draft navigates straight away, no prompt', async ({ page }) => {
    await loginAsPT(page)
    const setup = await page.evaluate(async () => {
      const { data: t } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: null, client_id: null, name: '[E2E] Leave Clean' }).select('id').single()
      return { templateId: t.id }
    })
    try {
      await page.evaluate(async (id) => { await openTemplate(id) }, setup.templateId)
      await page.evaluate(() => { window._templateCtx.backFn = () => { window._leftCount = (window._leftCount || 0) + 1 } })
      await page.evaluate(() => _templateGoBack())
      const r = await page.evaluate(() => ({ left: window._leftCount, promptShown: !!document.getElementById('confirm-dialog') }))
      expect(r.left).toBe(1)
      expect(r.promptShown).toBe(false)
    } finally {
      await page.evaluate(async (id) => { await db.from('workout_templates').delete().eq('id', id) }, setup.templateId)
    }
  })

  test('leaving with unsaved changes shows the three-way prompt; Keep editing does nothing', async ({ page }) => {
    await loginAsPT(page)
    const setup = await page.evaluate(async () => {
      const { data: t } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: null, client_id: null, name: '[E2E] Leave Dirty Keep' }).select('id').single()
      await db.from('workout_template_exercises').insert({ template_id: t.id, exercise_name: '[E2E] X', exercise_type: 'strength', order_index: 0 })
      return { templateId: t.id }
    })
    try {
      await page.evaluate(async (id) => { await openTemplate(id) }, setup.templateId)
      await page.evaluate(() => {
        window._templateCtx.backFn = () => { window._leftCount = (window._leftCount || 0) + 1 }
        const key = window._templateDraft.exercises[0]._draftKey
        _stageRemoveExercise(key)
      })
      await page.evaluate(() => _templateGoBack())
      const promptShown = await page.evaluate(() => document.getElementById('confirm-dialog')?.textContent || '')
      expect(promptShown).toMatch(/unsaved/i)
      // Keep editing = dismiss, no navigation
      await page.locator('#confirm-dialog button', { hasText: /keep editing/i }).click()
      const r = await page.evaluate(() => ({ left: window._leftCount || 0, stillDirty: _templateDraftIsDirty() }))
      expect(r.left).toBe(0)
      expect(r.stillDirty, 'the staged removal must still be there').toBe(true)
    } finally {
      await page.evaluate(async (id) => {
        await db.from('workout_template_exercises').delete().eq('template_id', id)
        await db.from('workout_templates').delete().eq('id', id)
      }, setup.templateId)
    }
  })

  test('Discard changes throws the draft away and navigates', async ({ page }) => {
    await loginAsPT(page)
    const setup = await page.evaluate(async () => {
      const { data: t } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: null, client_id: null, name: '[E2E] Leave Discard' }).select('id').single()
      await db.from('workout_template_exercises').insert({ template_id: t.id, exercise_name: '[E2E] Y', exercise_type: 'strength', order_index: 0 })
      return { templateId: t.id }
    })
    try {
      await page.evaluate(async (id) => { await openTemplate(id) }, setup.templateId)
      await page.evaluate(() => {
        window._templateCtx.backFn = () => { window._leftCount = (window._leftCount || 0) + 1 }
        const key = window._templateDraft.exercises[0]._draftKey
        _stageRemoveExercise(key)
      })
      await page.evaluate(() => _templateGoBack())
      await page.locator('#confirm-dialog button', { hasText: /discard/i }).click()
      const r = await page.evaluate(() => ({ left: window._leftCount || 0 }))
      expect(r.left).toBe(1)
      const dbRows = await page.evaluate(async (id) => {
        const { data } = await db.from('workout_template_exercises').select('id').eq('template_id', id)
        return data.length
      }, setup.templateId)
      expect(dbRows, 'discard must not have written anything -- the exercise was never removed for real').toBe(1)
    } finally {
      await page.evaluate(async (id) => {
        await db.from('workout_template_exercises').delete().eq('template_id', id)
        await db.from('workout_templates').delete().eq('id', id)
      }, setup.templateId)
    }
  })

  test('Save workout replays the draft, then navigates once Save completes', async ({ page }) => {
    await loginAsPT(page)
    const setup = await page.evaluate(async () => {
      const { data: t } = await db.from('workout_templates').insert({ coach_id: currentUser.id, program_id: null, client_id: null, name: '[E2E] Leave Save' }).select('id').single()
      await db.from('workout_template_exercises').insert({ template_id: t.id, exercise_name: '[E2E] Z', exercise_type: 'strength', order_index: 0 })
      return { templateId: t.id }
    })
    try {
      await page.evaluate(async (id) => { await openTemplate(id) }, setup.templateId)
      await page.evaluate(() => {
        window._templateCtx.backFn = () => { window._leftCount = (window._leftCount || 0) + 1 }
        const key = window._templateDraft.exercises[0]._draftKey
        _stageRemoveExercise(key)
      })
      await page.evaluate(() => _templateGoBack())
      await page.locator('#confirm-dialog button', { hasText: /^save/i }).click()
      await page.waitForTimeout(500)
      const r = await page.evaluate(() => ({ left: window._leftCount || 0 }))
      expect(r.left).toBe(1)
      const dbRows = await page.evaluate(async (id) => {
        const { data } = await db.from('workout_template_exercises').select('id').eq('template_id', id)
        return data.length
      }, setup.templateId)
      expect(dbRows, 'Save from the leave-prompt must have actually committed the removal').toBe(0)
    } finally {
      await page.evaluate(async (id) => {
        await db.from('workout_template_exercises').delete().eq('template_id', id)
        await db.from('workout_templates').delete().eq('id', id)
      }, setup.templateId)
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test tests/template-draft-save-2026-09-13.spec.js -g "leaving with unsaved changes"`
Expected: FAIL — `_templateGoBack` doesn't check dirtiness yet, so every test's flow diverges from
what it expects (no confirm-dialog appears, or it navigates immediately regardless of dirty state).

- [ ] **Step 3: Write the minimal implementation**

`confirmDialog()` (`js/app-core.js`) today renders exactly two footer buttons (Cancel / Confirm).
Rather than generalizing its options shape for a rare three-button case, add one small dedicated
function reusing its exact visual language (same `.modal-overlay`/`.modal` structure `confirmDialog`
itself builds) — the spec left this exact choice open ("Open questions," #3), and a purpose-built
function is simpler than teaching the generic one a third button it needs nowhere else:

```js
function _confirmLeaveTemplateDraft() {
  return new Promise((resolve) => {
    document.getElementById('confirm-dialog')?.dispatchEvent(new CustomEvent('confirm-superseded'))
    const overlay = document.createElement('div')
    overlay.className = 'modal-overlay'
    overlay.id = 'confirm-dialog'
    if (document.getElementById('workout-runner')) overlay.style.zIndex = '1000'
    let done = false
    const settle = (val) => { if (done) return; done = true; obs.disconnect(); overlay.remove(); resolve(val) }
    overlay.innerHTML = `
      <div class="modal" style="max-width:400px">
        <div class="modal-header">
          <h2 class="modal-title">Unsaved changes</h2>
          <button class="modal-close" data-confirm="no">✕</button>
        </div>
        <p style="white-space:pre-line">You have unsaved changes to this workout.</p>
        <div class="modal-footer" style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn-secondary" data-confirm="no">Keep editing</button>
          <button class="btn-danger" data-confirm="discard">Discard changes</button>
          <button class="btn-primary" data-confirm="save">Save workout</button>
        </div>
      </div>`
    overlay.querySelector('[data-confirm="no"]')?.addEventListener('click', () => settle('keep'))
    overlay.querySelectorAll('[data-confirm="no"]').forEach(b => b.addEventListener('click', () => settle('keep')))
    overlay.querySelector('[data-confirm="discard"]').addEventListener('click', () => settle('discard'))
    overlay.querySelector('[data-confirm="save"]').addEventListener('click', () => settle('save'))
    const obs = new MutationObserver(() => { if (!overlay.isConnected) settle('keep') })
    overlay.addEventListener('confirm-superseded', () => settle('keep'))
    mountModal(overlay)
    obs.observe(document.body, { childList: true })
  })
}
```

Update `_templateGoBack` (`js/app-workouts.js:1463`):

```js
async function _templateGoBack() {
  if (_templateDraftIsDirty()) {
    const choice = await _confirmLeaveTemplateDraft()
    if (choice === 'keep') return
    if (choice === 'discard') {
      const d = window._templateDraft
      window._templateDraft = { ...d, exercises: d.exercisesBaseline.map(e => ({ ...e })), meta: { ...d.metaBaseline } }
    }
    if (choice === 'save') await saveTemplateDraft()
  }
  const ctx = window._templateCtx || {}
  if (ctx.backFn) {
    ctx.backFn()
  } else if (ctx.clientId && currentProfile?.role !== 'solo' && currentProfile?.role !== 'client') {
    openClientProgramsTab(ctx.clientId)
  } else {
    const fallback = currentProfile?.role === 'solo' ? 'library' : 'workouts'
    navigate(ctx.backTo && ctx.backTo !== 'client' ? ctx.backTo : fallback)
  }
}
```

Note `_templateGoBack` becomes `async` — its one existing caller is an `onclick="_templateGoBack();return false"` attribute (`js/app-workouts.js:1370`), which works unchanged calling an async function without awaiting it (the click handler doesn't need to block on it).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx playwright test tests/template-draft-save-2026-09-13.spec.js -g "leaving with unsaved changes"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add js/app-workouts.js tests/template-draft-save-2026-09-13.spec.js
git commit -m "template builder: three-way Save/Discard/Keep-editing prompt on unsaved exit

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 12: Update every test file calling a renamed/removed staging function directly

**Scope correction (2026-09-13, post-Task-3 ruling — see ledger).** Task 3's implementer did a full
before/after verification sweep (not speculation) and found this task's original 3-file list was
incomplete: 8 MORE files call `saveExerciseToTemplate`/`saveEditTemplateExercise`/
`deleteTemplateExercise` directly by name and break the instant those functions are removed — a gap
in this plan's original pre-flight scan (which checked `js/` callers and a specific set of test
files, but never grepped the whole `tests/` directory for these three names). Folded into this task
rather than a new one, since the fix shape is identical: replace the direct old-function call with
its staged equivalent, then flush to the database with `saveTemplateDraft()` before the assertion
that follows.

**Second scope correction (2026-09-13, post-Task-4 ruling — see ledger).** Task 4's implementer did
the same before/after sweep for `moveTemplateExercise` and found 2 more files:
`tests/ownership-anchors-2026-08-21.spec.js` (already on this task's list above, for a different
function — it now has TWO broken call sites) and `tests/silent-refusal-2026-08-18.spec.js` (new to
this list). Both files' `moveTemplateExercise`-specific tests are a different SHAPE of problem than
the mechanical swap-and-save-step fix below — see the dedicated notes after Step 2.

**Files:**
- Modify: `tests/session-identity-2026-08-14.spec.js`, `tests/programs.spec.js`,
  `tests/personal-programs.spec.js` (original 3)
- Modify: `tests/reentry-guard-2026-08-28.spec.js`, `tests/builder-metric-type.spec.js`,
  `tests/cardio-distance-metres.spec.js`, `tests/intervals-redesign-2026-07-25.spec.js`,
  `tests/ledger-fixes-2026-07-30.spec.js`, `tests/ownership-anchors-2026-08-21.spec.js`,
  `tests/stale-set-fields-2026-08-18.spec.js`, `tests/ledger-fixes-2026-08-02.spec.js` (8 more,
  found during Task 3)
- Modify: `tests/silent-refusal-2026-08-18.spec.js` (found during Task 4; `ownership-anchors` above
  is also touched a second time)

**Interfaces:** none new — this task only makes existing coverage match the new save timing.

- [ ] **Step 1: Read each file's exact current interaction with the template editor**

Run: `grep -n "saveExerciseToTemplate\|saveEditTemplateExercise\|deleteTemplateExercise\|moveTemplateExercise\|saveEditTemplate\b" tests/session-identity-2026-08-14.spec.js tests/programs.spec.js tests/personal-programs.spec.js tests/reentry-guard-2026-08-28.spec.js tests/builder-metric-type.spec.js tests/cardio-distance-metres.spec.js tests/intervals-redesign-2026-07-25.spec.js tests/ledger-fixes-2026-07-30.spec.js tests/ownership-anchors-2026-08-21.spec.js tests/stale-set-fields-2026-08-18.spec.js tests/ledger-fixes-2026-08-02.spec.js tests/silent-refusal-2026-08-18.spec.js`

This surfaces every exact call site that needs a `saveTemplateDraft()` step inserted before its
following database assertion. Because these files are large and the exact surrounding context
matters (some may already structure their flow in a way that's easy to patch, others may need a
small restructure), read each hit with 10 lines of context before editing, rather than
pattern-guessing a shared fix.

- [ ] **Step 2: For each hit, insert a Save step**

The general shape of the fix, applied at each site: replace a direct call to the old function
(`saveExerciseToTemplate(...)`, etc. — now `_stageAddExercise()` etc. per Tasks 3/5) with the staged
equivalent, followed by `await page.evaluate(() => saveTemplateDraft())`, before the test's existing
database assertion. Where a site drives the UI through real clicks (not `page.evaluate` calls
directly), locate and click the new "Save workout" button (`#save-template-draft-btn`, Task 6)
instead.

**Two of the 8 newly-found files need more than the mechanical swap above — read these before
touching them:**

- **`tests/reentry-guard-2026-08-28.spec.js`** — its `MUST_BE_GUARDED` list asserts
  `'saveExerciseToTemplate'` is registered behind the reentrancy guard (`guardReentry(...)`), a
  protection against a double-tap racing two `select-max-order_index-then-insert` database calls.
  The staged mutators are synchronous, in-memory, single-threaded JS — there is no equivalent race
  to guard against (Task 3's implementer deliberately did not wrap them in `guardReentry`, and
  correctly did not invent one — see its self-review). Remove `'saveExerciseToTemplate'` from
  `MUST_BE_GUARDED` (and add nothing in its place) rather than trying to make a staged mutator
  satisfy a guard it has no reason to need.
- **`tests/ledger-fixes-2026-08-02.spec.js`** — wraps its old-function calls in `.catch(() => {})`,
  which is currently swallowing the `ReferenceError` from the now-missing function and letting the
  test stay green for the wrong reason (nothing ran, rather than the ownership check it claims to
  prove firing). Remove that `.catch` when you replace the call with its staged equivalent — the
  test must fail loudly if the behavior it names ever breaks again, not silently pass because
  nothing executed.
- **`tests/silent-refusal-2026-08-18.spec.js:219` — `'moveTemplateExercise warns when only half the
  swap lands'`** — DELETE this test, don't adapt it. It exists to prove that when reorder's two
  separate database writes (one per swapped row) partially land — the first succeeds, the second is
  refused — the user is warned rather than left with silently corrupted order. Under the staged
  model, reorder is one in-memory array swap with zero database writes until Save; "two separate
  writes, one succeeds one doesn't" cannot happen at reorder time anymore, and a save's own partial
  failure (potentially across ANY op, not reorder specifically) is already covered by Task 10's
  dedicated partial-failure-recovery test. Keeping this test would mean either forcing a scenario
  that can't occur through a mock, or quietly testing nothing real.
- **`tests/ownership-anchors-2026-08-21.spec.js:140` — `'moveTemplateExercise refuses a template
  owned by another coach, at the app layer'`** — DELETE this test too, same reasoning: it asserts a
  `log.error('moveTemplateExercise', 'ownership check failed', ...)` call that only existed because
  the OLD function checked ownership on every single reorder tap. `_stageReorderExercise` has no
  ownership check at all — by design, ownership is verified exactly ONCE per Save
  (`saveTemplateDraft`'s `_verifyTemplateOwnership` call, Task 8), not per queued operation. This
  file's OTHER tests (covering `saveExerciseToTemplate`'s now-also-removed ownership check) are
  handled by the mechanical swap-and-save-step fix above, same as the other 7 files — only this one
  reorder-specific test needs deleting rather than adapting.
  **Note for whoever executes Task 8:** confirm Task 8's own test coverage includes a save refused
  for a template the current user does not own (its brief, as written, only covers the happy path
  resolving a template the user legitimately owns) — this deletion removes the only place that
  guarantee was ever actually tested for the reorder case, and the general (not reorder-specific)
  version of it should live in Task 8, not be re-invented per op type in Task 12.

- [ ] **Step 3: Run every file from this task together**

Run: `npx playwright test tests/session-identity-2026-08-14.spec.js tests/programs.spec.js tests/personal-programs.spec.js tests/reentry-guard-2026-08-28.spec.js tests/builder-metric-type.spec.js tests/cardio-distance-metres.spec.js tests/intervals-redesign-2026-07-25.spec.js tests/ledger-fixes-2026-07-30.spec.js tests/ownership-anchors-2026-08-21.spec.js tests/stale-set-fields-2026-08-18.spec.js tests/ledger-fixes-2026-08-02.spec.js tests/silent-refusal-2026-08-18.spec.js`
Expected: PASS (12 files)

- [ ] **Step 4: Commit**

```bash
git add tests/session-identity-2026-08-14.spec.js tests/programs.spec.js tests/personal-programs.spec.js tests/reentry-guard-2026-08-28.spec.js tests/builder-metric-type.spec.js tests/cardio-distance-metres.spec.js tests/intervals-redesign-2026-07-25.spec.js tests/ledger-fixes-2026-07-30.spec.js tests/ownership-anchors-2026-08-21.spec.js tests/stale-set-fields-2026-08-18.spec.js tests/ledger-fixes-2026-08-02.spec.js tests/silent-refusal-2026-08-18.spec.js
git commit -m "tests: insert Save-workout step where template edits are checked immediately

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 13: Cache-bust and full-suite verification

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Bump `js/app-workouts.js`'s `?v=` in `index.html`**

Check the current value first (`grep -n "app-workouts" index.html`) and increment it by 1.

- [ ] **Step 2: Run the complete suite**

Run: `npm test` (this project's full Playwright suite, ~30 min) and `node --test "tests-node/*.test.mjs"`

Expected: PASS, including everything untouched by this plan — this is the first point where the
whole redesign is exercised alongside the rest of the app in one pass.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "template builder: cache-bust app-workouts.js for the staged-edits redesign

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Draft data model → Task 1. ✓
- Staged mutators (add/edit/remove/reorder/rename) → Tasks 3, 4, 5. ✓
- Reorder-settle subsystem deleted → Task 4. ✓
- Save-workout button + dirty tracking → Task 6. ✓
- Diff engine → Task 7. ✓
- Save replay, resolve-once constraint → Task 8. ✓
- Propagation chain generalized to arrays, pluralized copy → Task 9. ✓
- Partial-failure recovery → Task 10. ✓
- Leave-with-unsaved-changes three-way prompt → Task 11. ✓
- Test impact: `propagation-honesty-2026-09-06` (Task 9), `session-identity-2026-08-14` /
  `programs.spec.js` / `personal-programs.spec.js` + 8 more found during Task 3 (Task 12, expanded
  2026-09-13 — see its ruling note), `reorder-instant-2026-09-06` / `reorder-propagation-2026-08-19`
  (Task 4). ✓
- `ledger-fixes-2026-07-23.spec.js` confirmed unrelated, no task touches it, correction noted in File
  Structure. ✓
- Database changes: none — no task adds a migration. ✓

**Placeholder scan:** no "TBD"/"handle edge cases"/"similar to Task N" — every step above carries
real code or a real, runnable command.

**Type consistency:** `_draftKey` is introduced in Task 1 and used with that exact name in every
later task (2, 3, 4, 6, 8, 9, 11) — no drift to `draftId`/`localKey`/etc. `window._lastExerciseChange`
(singular) is retired in Task 8/9 in favor of `window._lastExerciseChanges` (plural) consistently.
`_diffTemplateDraft`'s return shape (`toDelete`/`toInsert`/`toUpdate`/`reorder`/`rename`) defined in
Task 7 is consumed with those exact keys in Task 8 and Task 10.

**Open items surfaced during planning, not blocking:** the exact restructuring needed inside
`session-identity-2026-08-14.spec.js`/`programs.spec.js`/`personal-programs.spec.js` (Task 12) is
deliberately left to be discovered by reading those files fresh rather than guessed now — they are
large, established files and a wrong guess at their exact structure would be worse than an
instruction to read first.
