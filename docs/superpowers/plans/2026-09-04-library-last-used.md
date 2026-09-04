# Library "Last used" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Personal Library page order sessions by when they were last used, show that on each row, and let you filter by name — so the handful you actually work with float to the top of 77.

**Architecture:** `renderWorkoutTemplates` gains a second query for last-trained dates, merges it with the new `workout_templates.updated_at`, sorts by whichever is newer, and renders a "Last used" line. A search input filters the already-loaded rows client-side. Separately, `saveRunnerSession` starts recording `template_id` so trained dates accrue from now on.

**Tech Stack:** Vanilla ES6 browser JS, no build step, no framework. Supabase (`supabase-js` v2). Playwright for browser tests, `node --test` for pure functions.

**Spec:** `docs/superpowers/specs/2026-09-04-library-last-used-design.md`

## Global Constraints

- **Vanilla JS only.** No TypeScript, no framework, no build step. Files in `js/` load as classic scripts in the order `index.html` declares.
- **Do not edit `index.html` version numbers by hand.** The pre-commit hook bumps `?v=` for staged `js/`/`css/` files automatically and stages `index.html` itself.
- **Three roles: coach, client, solo.** A `.eq('coach_id', …)` filter silently excludes solo, whose `coach_id` is NULL.
- **No PII in `log.*` calls** — ids and dates only. Never names, emails, weights or health values.
- **Every `.delete()` in `tests/` must call `.select()` and assert the rowcount** (checks.sh rule 9k). An RLS-refused delete resolves as `{ data: [], error: null }`.
- **checks.sh rule 9i is a count ratchet** (`scripts/count-baseline.json`). Adding an occurrence of `empty-state`, `Loading…`, `toLocaleDateString(`, `role === 'solo'`, or a `typeof … !== 'undefined'` shield **will block the push**. Task 4 hits this deliberately — read its Step 6.
- **Migration is already applied to production.** `workout_templates.updated_at` exists, is backfilled, and is maintained by triggers. Do not re-run `scripts/add-template-updated-at-2026-09-04.sql`.
- **Run `npm test` before pushing** anything that touches a `js/` module; the pre-push gate is only 57 of 617 tests.

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `js/app-runner.js` | The in-gym runner. Owns `_runner` state and both save paths. | Modify — carry `templateId` through state, draft and insert |
| `js/app-workouts.js` | The Library page. Owns `renderWorkoutTemplates`. | Modify — query, sort, row, search |
| `tests-node/pure.test.mjs` | Pure-function unit tests, no browser. | Modify — add `_relativeAge` cases |
| `tests/runner-template-id-2026-09-04.spec.js` | Proves the runner records its template. | Create |
| `tests/library-last-used-2026-09-04.spec.js` | Proves ordering, the row line, and search. | Create |

---

### Task 1: The runner records which template was trained

Without this, "last used" can never reflect training — only the manual "log a past session" form records `template_id` today, so every session trained in the actual runner leaves no link back to its template.

**Files:**
- Modify: `js/app-runner.js` — `_runner` construction (~line 63), draft restore (~line 203), draft save (~line 118), `saveRunnerSession` insert (~line 2437)
- Test: `tests/runner-template-id-2026-09-04.spec.js` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `workout_logs.template_id` is populated by the runner. Task 2 reads it.

- [ ] **Step 1: Write the failing test**

Create `tests/runner-template-id-2026-09-04.spec.js`:

```js
// A session trained in the RUNNER must record which template it came from.
//
// Before this, only saveWorkoutSession (the manual "log a past session" form) set template_id.
// saveRunnerSession — the path actually used in a gym — inserted coach_id, client_id, name, date and
// notes, and nothing else. So the Library page could never know when a session was last trained.
//
// Historical logs cannot be backfilled: the link was never recorded and cannot be derived.

const { test, expect } = require('@playwright/test')
const { loginAsPT } = require('./helpers')

test.describe('The runner records template_id (2026-09-04)', () => {
  test('a session saved from the runner carries the template it was launched from', async ({ page }) => {
    await loginAsPT(page)

    const r = await page.evaluate(async () => {
      const tag = `[E2E] runner tmpl ${Date.now()}`
      const out = { built: false, templateIdOnLog: null, cleanup: {} }

      const { data: client } = await db.from('clients')
        .insert({ coach_id: currentUser.id, full_name: tag }).select('id').single()
      const { data: tmpl } = await db.from('workout_templates')
        .insert({ coach_id: currentUser.id, client_id: null, program_id: null, name: tag })
        .select('id').single()
      if (!client?.id || !tmpl?.id) return out
      out.built = true

      try {
        // Drive the real state the runner saves from, rather than the whole UI: this test is about
        // the insert carrying the id, not about how the runner is launched.
        _runner = {
          clientId: client.id, name: tag, date: new Date().toISOString().split('T')[0],
          exercises: [], exIdx: 0, startTime: Date.now(), _timerInterval: null,
          templateDesc: null, templateId: tmpl.id
        }
        await saveRunnerSession()

        const { data: logs } = await db.from('workout_logs')
          .select('id, template_id').eq('client_id', client.id).eq('name', tag)
        out.templateIdOnLog = logs?.[0]?.template_id ?? null

        if (logs?.length) {
          const { data: gone } = await db.from('workout_logs')
            .delete().in('id', logs.map(l => l.id)).select('id')
          out.cleanup.logs = (gone || []).length
        }
      } finally {
        const { data: tGone } = await db.from('workout_templates')
          .delete().eq('id', tmpl.id).eq('coach_id', currentUser.id).select('id')
        const { data: cGone } = await db.from('clients')
          .delete().eq('id', client.id).eq('coach_id', currentUser.id).select('id')
        out.cleanup.template = (tGone || []).length
        out.cleanup.client = (cGone || []).length
      }
      return out
    })

    expect(r.built, 'the fixture must exist or this test asserts nothing').toBe(true)
    expect(r.templateIdOnLog, 'the runner log must carry the template it was launched from').not.toBeNull()
    expect(r.cleanup.template, 'the fixture template must be deleted, and the delete seen').toBe(1)
    expect(r.cleanup.client, 'the fixture client must be deleted, and the delete seen').toBe(1)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx playwright test tests/runner-template-id-2026-09-04.spec.js --retries=0 --reporter=line`

Expected: FAIL — `the runner log must carry the template it was launched from / Received: null`.

If it fails for any other reason, stop and read the error; a fixture that did not build means the assertion below is meaningless.

- [ ] **Step 3: Carry the id in runner state**

In `js/app-runner.js`, in `_startFreshRunner`, the `_runner = { … }` assignment currently ends `templateDesc: template?.description || null }`. Add the id beside it:

```js
  _runner = { clientId, name, date: new Date().toISOString().split('T')[0], exercises, exIdx: 0, startTime: Date.now(), _timerInterval: null, templateDesc: template?.description || null, templateId: template?.id || null }
```

- [ ] **Step 4: Persist it in the draft, and restore it**

In `_saveRunnerDraft`, beside `templateDesc: _runner.templateDesc || null,` add:

```js
      templateId: _runner.templateId || null,
```

In the resume path (`_runner = { … }` built from `draft`), beside `templateDesc: draft.templateDesc || null` add:

```js
    templateId: draft.templateId || null
```

Without both, resuming a session loses the link and the save records nothing — the exact half-fix this codebase keeps shipping.

- [ ] **Step 5: Record it on the insert**

In `saveRunnerSession`, change the insert from:

```js
  const { data: sessionLog, error } = await db.from('workout_logs').insert({
    coach_id: coachId, client_id: clientId, name, date, notes
  }).select().single()
```

to:

```js
  const { data: sessionLog, error } = await db.from('workout_logs').insert({
    // template_id is what lets the Library page say when a session was last TRAINED. Its sibling
    // saveWorkoutSession has always recorded it; this path never did, so until 2026-09-04 a session
    // trained in the actual runner left no link back to the template it came from.
    coach_id: coachId, client_id: clientId, template_id: _runner?.templateId || null, name, date, notes
  }).select().single()
```

- [ ] **Step 6: Run the test and watch it pass**

Run: `npx playwright test tests/runner-template-id-2026-09-04.spec.js --retries=0 --reporter=line`

Expected: PASS.

- [ ] **Step 7: Prove the runner still saves at all**

Run: `npx playwright test tests/runner.spec.js --retries=0 --reporter=line`

Expected: all pass. This is the in-gym path — a regression here is worse than the feature is worth.

- [ ] **Step 8: Commit**

```bash
git add js/app-runner.js tests/runner-template-id-2026-09-04.spec.js
git commit -m "fix(runner): record template_id on a session saved from the runner

Only saveWorkoutSession — the manual 'log a past session' form — recorded which template a session
came from. saveRunnerSession, the path actually used in a gym, inserted coach_id, client_id, name,
date and notes and nothing else.

So the Library page could never know when a session was last TRAINED, and 'last used' would have been
edit-dates only. Historical logs cannot be backfilled: the link was never recorded and cannot be
derived, so trained-dates start empty and fill forward.

Carried through all three places or it would be a half-fix: runner state, the draft that survives a
reload, and the insert. Missing the draft would silently lose the link on any resumed session."
```

---

### Task 2: Fetch last-trained dates and sort by "last used"

**Files:**
- Modify: `js/app-workouts.js` — `renderWorkoutTemplates` (~line 833)
- Test: `tests/library-last-used-2026-09-04.spec.js` (create)

**Interfaces:**
- Consumes: `workout_logs.template_id` (Task 1); `workout_templates.updated_at` (migration, already applied).
- Produces: inside `renderWorkoutTemplates`, each template object carries `_lastUsed` (a `Date`, or null if neither date exists). Task 3 renders from it.

- [ ] **Step 1: Write the failing test**

Create `tests/library-last-used-2026-09-04.spec.js`:

```js
// The Library list orders by when a session was last used, not alphabetically.
//
// "Last used" is the more recent of edited (workout_templates.updated_at, maintained by trigger) and
// trained (the newest workout_logs row pointing at it). One concept, one sort key.

const { test, expect } = require('@playwright/test')
const { loginAsPT } = require('./helpers')

test.describe('Library orders by last used (2026-09-04)', () => {
  test('a recently edited template sorts above an older one, regardless of name', async ({ page }) => {
    await loginAsPT(page)

    const r = await page.evaluate(async () => {
      const stamp = Date.now()
      // Names chosen so ALPHABETICAL order is the OPPOSITE of the expected order. Without this the
      // test would pass on the old alphabetical sort and prove nothing.
      const older = `[E2E] aaa older ${stamp}`
      const newer = `[E2E] zzz newer ${stamp}`
      const out = { built: false, order: [], cleanup: {} }

      const mk = async (name, updatedAt) => {
        const { data } = await db.from('workout_templates')
          .insert({ coach_id: currentUser.id, client_id: null, program_id: null,
                    name, is_personal: currentProfile?.role === 'solo' })
          .select('id').single()
        if (data?.id) await db.from('workout_templates').update({ updated_at: updatedAt }).eq('id', data.id)
        return data?.id || null
      }
      const oldId = await mk(older, '2020-01-01T00:00:00Z')
      const newId = await mk(newer, new Date().toISOString())
      if (!oldId || !newId) return out
      out.built = true

      try {
        const host = document.createElement('div')
        document.body.appendChild(host)
        await renderWorkoutTemplates(host)
        out.order = [...host.querySelectorAll('.row-name')]
          .map(e => e.textContent)
          .filter(n => n.includes(String(stamp)))
        host.remove()
      } finally {
        const { data: gone } = await db.from('workout_templates')
          .delete().in('id', [oldId, newId]).eq('coach_id', currentUser.id).select('id')
        out.cleanup.templates = (gone || []).length
      }
      return out
    })

    expect(r.built, 'both fixtures must exist or this test asserts nothing').toBe(true)
    expect(r.order.length, 'both fixtures must appear in the list').toBe(2)
    // The load-bearing assertion. Alphabetically "aaa older" comes first; by last-used it must not.
    expect(r.order[0], 'the recently edited template must sort first').toContain('zzz newer')
    expect(r.cleanup.templates, 'both fixtures must be deleted, and the delete seen').toBe(2)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx playwright test tests/library-last-used-2026-09-04.spec.js --retries=0 --reporter=line`

Expected: FAIL — `the recently edited template must sort first / Received: "[E2E] aaa older …"`, because the list is still alphabetical.

- [ ] **Step 3: Select `updated_at` and fetch trained dates**

In `renderWorkoutTemplates`, replace the single query with two run in parallel. The template query gains `updated_at`; the second finds the newest log per template.

Replace:

```js
  const { data: templates, error } = await db.from('workout_templates').select('*, workout_template_exercises(id)').eq('coach_id', currentUser.id).is('client_id', null).is('program_id', null).is('generated_from_phase_id', null).eq('is_personal', currentProfile?.role === 'solo').order('name').limit(100)
```

with:

```js
  // TWO queries, not one per template. The Library page already carries an open "feels slow"
  // complaint, so the trained dates are fetched as ONE bounded batch and reduced in memory — never a
  // lookup per row. .limit(500) bounds the cost; older logs cannot change which sessions are recent.
  const [{ data: templates, error }, { data: recentLogs }] = await Promise.all([
    db.from('workout_templates').select('*, workout_template_exercises(id), updated_at').eq('coach_id', currentUser.id).is('client_id', null).is('program_id', null).is('generated_from_phase_id', null).eq('is_personal', currentProfile?.role === 'solo').order('name').limit(100),
    db.from('workout_logs').select('template_id, date').eq('coach_id', currentUser.id).not('template_id', 'is', null).order('date', { ascending: false }).limit(500)
  ])
```

- [ ] **Step 4: Merge and sort**

Immediately after the `if (!templates.length) { … }` empty-state block, insert:

```js
  // Newest log per template. recentLogs is already newest-first, so the FIRST time a template_id is
  // seen is its most recent training — no comparison needed.
  const trainedAt = new Map()
  for (const l of recentLogs || []) {
    if (l.template_id && !trainedAt.has(l.template_id)) trainedAt.set(l.template_id, l.date)
  }

  for (const t of templates) {
    // 'T00:00:00' is NOT optional. workout_logs.date is a DATE, and `new Date('2026-09-04')` parses
    // as UTC midnight — which lands on the previous day for anyone west of UTC, and for a UK user
    // during BST. This app has shipped that exact bug twice (app-core.js:194 documents it).
    const trainedStr = trainedAt.get(t.id)
    const trained = trainedStr ? new Date(trainedStr + 'T00:00:00') : null
    const edited = t.updated_at ? new Date(t.updated_at) : null
    t._lastUsed = (trained && (!edited || trained > edited)) ? trained : edited
  }

  // Most recently used first. A template with neither date sorts last rather than throwing — the
  // migration backfilled updated_at, so this should not occur, but a row inserted by a path that
  // bypasses the trigger would otherwise break the whole sort.
  templates.sort((a, b) => (b._lastUsed?.getTime() || 0) - (a._lastUsed?.getTime() || 0))
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `npx playwright test tests/library-last-used-2026-09-04.spec.js --retries=0 --reporter=line`

Expected: PASS.

- [ ] **Step 6: Prove the page still works for everyone else**

Run: `npx playwright test tests/solo-account.spec.js tests/client-workout.spec.js --retries=0 --reporter=line`

Expected: all pass. `renderWorkoutTemplates` is shared with the coach view; this task must not change what it shows, only the order.

- [ ] **Step 7: Commit**

```bash
git add js/app-workouts.js tests/library-last-used-2026-09-04.spec.js
git commit -m "feat(library): order sessions by when they were last used

The list was alphabetical across ~77 standalone templates, so the handful actually in use were
scattered through the ones built months ago.

'Last used' is the more recent of edited (updated_at, maintained by the triggers added in
scripts/add-template-updated-at-2026-09-04.sql) and trained (newest workout_logs row pointing at it).

TWO queries, never one per row: the trained dates come back as one bounded batch and are reduced in
memory. This page already carries an open 'feels slow' complaint and must not gain a per-row lookup.

The log date is parsed with 'T00:00:00'. workout_logs.date is a DATE and new Date('2026-09-04') is UTC
midnight, which lands a day early for a UK user in BST — a bug this codebase has shipped twice.

The test's fixture names are chosen so alphabetical order is the OPPOSITE of the expected order;
without that it would pass on the old sort and prove nothing."
```

---

### Task 3: Show "Last used …" on each row

**Files:**
- Modify: `js/app-workouts.js` — the `templateRow` template literal inside `renderWorkoutTemplates`
- Modify: `tests-node/pure.test.mjs` — cases for the new helper
- Test: `tests/library-last-used-2026-09-04.spec.js` (extend)

**Interfaces:**
- Consumes: `t._lastUsed` (Task 2).
- Produces: `_relativeAge(date)` — a top-level function in `js/app-workouts.js` taking a `Date` or null and returning a string such as `'today'`, `'2 days ago'`, `'3 weeks ago'`, or `'—'` for null.

- [ ] **Step 1: Write the failing unit tests**

In `tests-node/pure.test.mjs`, add inside the existing top-level `describe` list:

```js
describe('_relativeAge — the Library "last used" line', () => {
  const days = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000)

  test('reads as plain English at each scale', () => {
    const f = get('_relativeAge')
    assert.equal(f(days(0)), 'today')
    assert.equal(f(days(1)), 'yesterday')
    assert.equal(f(days(3)), '3 days ago')
    assert.equal(f(days(14)), '2 weeks ago')
    assert.equal(f(days(70)), '2 months ago')
  })

  test('returns a dash rather than "NaN days ago" for a missing date', () => {
    // A template with no date should not print junk into the row. This is the falsy-zero class's
    // cousin: the value is absent, not zero, and must be handled explicitly.
    const f = get('_relativeAge')
    assert.equal(f(null), '—')
    assert.equal(f(undefined), '—')
    assert.equal(f(new Date('not a date')), '—')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm run test:unit --silent > /tmp/unit.txt 2>&1; echo $?; grep -E "^. (pass|fail)" /tmp/unit.txt`

Do NOT pipe the runner directly — a piped command's exit code is the last command's, not the runner's. Redirect and read.

Expected: FAIL — `get: no top-level binding named _relativeAge`.

- [ ] **Step 3: Write the helper**

In `js/app-workouts.js`, immediately above `async function renderWorkoutTemplates(el) {`, add:

```js
// Relative age for the Library's "Last used" line. Deliberately coarse — the question the row answers
// is "recently, or ages ago", never "exactly when".
//
// Returns '—' for a missing or unparseable date rather than "NaN days ago". A template should never
// have neither date after the 2026-09-04 backfill, but printing junk into a row is worse than a dash.
function _relativeAge(d) {
  if (!d || isNaN(d.getTime())) return '—'
  const days = Math.floor((Date.now() - d.getTime()) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 14) return `${days} days ago`
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`
  return `${Math.floor(days / 30)} months ago`
}
```

- [ ] **Step 4: Run the unit tests and watch them pass**

Run: `npm run test:unit --silent > /tmp/unit.txt 2>&1; echo $?; grep -E "^. (pass|fail)" /tmp/unit.txt`

Expected: exit 0, `fail 0`.

- [ ] **Step 5: Put it in the row**

In `templateRow`, replace the `row-meta` line:

```js
        <div class="row-meta">${t.description ? escapeHtml(t.description) : (t.workout_template_exercises.length + ' exercise' + (t.workout_template_exercises.length !== 1 ? 's' : ''))}</div>
```

with:

```js
        <div class="row-meta">Last used ${_relativeAge(t._lastUsed)}</div>
```

The exercise count is NOT lost — the right-hand `${t.workout_template_exercises.length} ex` already showed it, and the old subtitle was repeating it. The description is displaced deliberately (see the spec).

- [ ] **Step 6: Add the browser assertion**

In `tests/library-last-used-2026-09-04.spec.js`, add a second test inside the existing `describe`:

```js
  test('each row states when it was last used', async ({ page }) => {
    await loginAsPT(page)

    const r = await page.evaluate(async () => {
      const tag = `[E2E] row line ${Date.now()}`
      const out = { built: false, meta: null, cleanup: 0 }
      const { data: t } = await db.from('workout_templates')
        .insert({ coach_id: currentUser.id, client_id: null, program_id: null,
                  name: tag, is_personal: currentProfile?.role === 'solo' })
        .select('id').single()
      if (!t?.id) return out
      out.built = true
      try {
        const host = document.createElement('div')
        document.body.appendChild(host)
        await renderWorkoutTemplates(host)
        const row = [...host.querySelectorAll('.list-row')]
          .find(r2 => r2.querySelector('.row-name')?.textContent === tag)
        out.meta = row?.querySelector('.row-meta')?.textContent || null
        host.remove()
      } finally {
        const { data: gone } = await db.from('workout_templates')
          .delete().eq('id', t.id).eq('coach_id', currentUser.id).select('id')
        out.cleanup = (gone || []).length
      }
      return out
    })

    expect(r.built, 'the fixture must exist or this test asserts nothing').toBe(true)
    expect(r.meta, 'the row must state when it was last used').toContain('Last used')
    // Just created, so its updated_at is now — anything else means the merge in Task 2 is wrong.
    expect(r.meta).toContain('today')
    expect(r.cleanup, 'the fixture must be deleted, and the delete seen').toBe(1)
  })
```

- [ ] **Step 7: Run both browser tests**

Run: `npx playwright test tests/library-last-used-2026-09-04.spec.js --retries=0 --reporter=line`

Expected: 2 passed.

- [ ] **Step 8: Commit**

```bash
git add js/app-workouts.js tests-node/pure.test.mjs tests/library-last-used-2026-09-04.spec.js
git commit -m "feat(library): each row states when the session was last used

The subtitle said the description if one was set, otherwise 'N exercises' — while the right-hand side
already said 'N ex'. For a session with no description the row said the same thing twice and nothing
else, which is why finding one meant scrolling until you recognised it.

_relativeAge is deliberately coarse: the row answers 'recently, or ages ago', never 'exactly when'. It
returns a dash for a missing date rather than 'NaN days ago' — a template should not have neither date
after the backfill, but printing junk is worse than a dash. Unit-tested in tests-node, which runs in
milliseconds rather than booting a browser.

The description is displaced deliberately; the row cannot carry both without becoming three lines."
```

---

### Task 4: Search box

**Files:**
- Modify: `js/app-workouts.js` — `renderWorkoutLibrary` (~line 540) and `renderWorkoutTemplates`
- Modify: `scripts/count-baseline.json` — see Step 6, this is mandatory and will otherwise block the push
- Test: `tests/library-last-used-2026-09-04.spec.js` (extend)

**Interfaces:**
- Consumes: the rendered list from Task 3.
- Produces: `filterTemplates(term)` — a top-level function in `js/app-workouts.js` that shows or hides already-rendered `.list-row` nodes. Called from the input's `oninput`.

- [ ] **Step 1: Write the failing test**

Add a third test to `tests/library-last-used-2026-09-04.spec.js`:

```js
  test('search filters the list as you type, and clearing restores it', async ({ page }) => {
    await loginAsPT(page)

    const r = await page.evaluate(async () => {
      const stamp = Date.now()
      const keep = `[E2E] findme ${stamp}`
      const hide = `[E2E] other ${stamp}`
      const out = { built: false, before: 0, filtered: 0, restored: 0, cleanup: 0 }

      const mk = async (name) => (await db.from('workout_templates')
        .insert({ coach_id: currentUser.id, client_id: null, program_id: null,
                  name, is_personal: currentProfile?.role === 'solo' })
        .select('id').single()).data?.id || null
      const a = await mk(keep)
      const b = await mk(hide)
      if (!a || !b) return out
      out.built = true

      try {
        const host = document.createElement('div')
        host.id = 'workout-tab-content'
        document.body.appendChild(host)
        await renderWorkoutTemplates(host)
        const visible = () => [...host.querySelectorAll('.list-row')]
          .filter(r2 => r2.style.display !== 'none').length

        out.before = visible()
        filterTemplates('findme')
        out.filtered = visible()
        filterTemplates('')
        out.restored = visible()
        host.remove()
      } finally {
        const { data: gone } = await db.from('workout_templates')
          .delete().in('id', [a, b]).eq('coach_id', currentUser.id).select('id')
        out.cleanup = (gone || []).length
      }
      return out
    })

    expect(r.built, 'both fixtures must exist or this test asserts nothing').toBe(true)
    expect(r.before, 'both fixtures must be listed before filtering').toBeGreaterThanOrEqual(2)
    expect(r.filtered, 'only the matching row may remain visible').toBe(1)
    expect(r.restored, 'clearing the box must restore every row').toBe(r.before)
    expect(r.cleanup, 'both fixtures must be deleted, and the delete seen').toBe(2)
  })
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx playwright test tests/library-last-used-2026-09-04.spec.js --retries=0 --reporter=line -g "search filters"`

Expected: FAIL — `filterTemplates is not defined`.

- [ ] **Step 3: Add the input**

In `renderWorkoutLibrary`, after the closing `</div>` of the `tabs` block and before `<div id="workout-tab-content"></div>`, add:

```js
      <input id="wt-search" class="form-input" type="search" placeholder="Search sessions"
             oninput="filterTemplates(this.value)" style="margin-bottom:12px">
```

- [ ] **Step 4: Write the filter**

In `js/app-workouts.js`, immediately below `_relativeAge`, add:

```js
// Filters the ALREADY-RENDERED rows. No query, no re-render: every row is in the DOM, so this is a
// show/hide pass and stays instant as you type. Re-fetching per keystroke would put the page's open
// "feels slow" complaint straight back.
function filterTemplates(term) {
  const q = (term || '').trim().toLowerCase()
  const host = document.getElementById('workout-tab-content')
  if (!host) return
  let shown = 0
  for (const row of host.querySelectorAll('.list-row')) {
    const name = row.querySelector('.row-name')?.textContent?.toLowerCase() || ''
    const hit = !q || name.includes(q)
    row.style.display = hit ? '' : 'none'
    if (hit) shown++
  }
  const none = document.getElementById('wt-no-matches')
  if (none) none.style.display = shown ? 'none' : ''
}
```

- [ ] **Step 5: Add the no-matches line**

In `renderWorkoutTemplates`, change the final render from:

```js
  el.innerHTML = `<div class="list">${templates.map(templateRow).join('')}</div>`
```

to:

```js
  // A plain hidden line, NOT an .empty-state block: searching to no result is a transient state, and
  // the class carries a large icon and a call-to-action button that would be wrong here. It also
  // keeps checks.sh rule 9i's empty-state count flat — see this task's Step 6.
  el.innerHTML = `<div class="list">${templates.map(templateRow).join('')}</div>
    <div id="wt-no-matches" style="display:none;padding:24px;text-align:center;color:var(--text-muted)">No sessions match that search.</div>`
```

- [ ] **Step 6: Confirm the ratchet is still flat**

Run: `node scripts/check-count-ratchet.mjs`

Expected: `No ratcheted pattern has grown.`

If it reports `empty-state markup` rising, you used the `.empty-state` class in Step 5. Either revert to the plain `<div>` above, or — only if the class is genuinely right — raise the baseline in `scripts/count-baseline.json` **and say why in the commit message**. A baseline nudged up quietly is how a ratchet becomes decoration.

- [ ] **Step 7: Run the whole file**

Run: `npx playwright test tests/library-last-used-2026-09-04.spec.js --retries=0 --reporter=line`

Expected: 3 passed.

- [ ] **Step 8: Commit**

```bash
git add js/app-workouts.js tests/library-last-used-2026-09-04.spec.js
git commit -m "feat(library): search box filters sessions as you type

Filters the ALREADY-RENDERED rows — no query, no re-render. Every row is in the DOM, so this is a
show/hide pass and stays instant. Re-fetching per keystroke would put this page's open 'feels slow'
complaint straight back.

Name only for now: matching exercise names would need the query to fetch them, which it does not.

The no-matches line is a plain hidden div rather than an .empty-state block. That class carries a
large icon and a call-to-action button, which are wrong for a transient search state — and it keeps
checks.sh rule 9i's empty-state count flat."
```

---

### Task 5: Verify the whole thing, then push

**Files:** none — this task is verification only.

- [ ] **Step 1: Run the full suite**

Run: `npm test > /tmp/suite.txt 2>&1; echo "EXIT=$?"; tail -5 /tmp/suite.txt`

Expected: 0 failed. Note any flaky results — `solo-account.spec.js:48` and `progress-trend.spec.js` have a known history (see the flakiness ledger row); a flake there is not necessarily this work.

If artefacts are produced by a failure, **copy `test-results/` somewhere else before running anything again** — Playwright wipes it at the start of the next run, and that has already destroyed evidence once.

- [ ] **Step 2: Run the full gate**

Run: `CI=true sh scripts/checks.sh > /tmp/gate.txt 2>&1; echo "EXIT=$?"; tail -3 /tmp/gate.txt`

Expected: `All checks passed.`

- [ ] **Step 3: Look at it**

Log in on the Personal view, open Library, and confirm by eye: the order is not alphabetical, each row reads "Last used …", and typing in the box filters. A green suite does not tell you the page looks right.

- [ ] **Step 4: Review before pushing**

This work touches no ownership or RLS code, so the review runs before the PUSH rather than before the commit. Use the `multi-agent-review` skill in diff mode.

- [ ] **Step 5: Push**

```bash
git push origin master
```

The pre-push hook runs the 57-test gate. After it lands, check the Actions tab — CI runs the same gate on a clean machine, and a red run means it did not deploy.
