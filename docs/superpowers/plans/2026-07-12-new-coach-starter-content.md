# New-Coach Starter Content — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, recommended for this repo) or superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A brand-new coach's first login seeds a usable app — ~40 curated exercises, one sample workout, one short sample program — instead of an empty slate they can't build in.

**Architecture:** App-side seed on first login, gated by a new `profiles.starter_seeded` boolean flag (idempotent). Content is a plain JS list in a new module. The seed runs inside the existing `loadUserInfo()` bootstrap, before the first page render, only for a `coach` whose flag is false. All rows are the coach's own (`coach_id = currentUser.id`, `is_personal = false`), created through normal RLS-scoped inserts.

**Tech Stack:** Vanilla JS (global functions, no modules/bundler), Supabase JS client (`db`), Playwright E2E (tests run against the real Supabase project). Cache-busting via per-module `?v=N` in `index.html`.

## Global Constraints

- No build step / no ES modules — new code is global `function`s and `const`s loaded via a `<script>` tag in `index.html`. Match the existing files' style.
- Every new/changed JS module needs its own `?v=N` bump in `index.html` in the same commit (GitHub Pages caches aggressively).
- Playwright is the only test runner. Tests use the real Supabase DB and MUST own and clean up their fixtures (prefix `[E2E]`), leaving no stranded rows. `loginAsPT2` logs in the second-coach account (`coachapp.e2e.pt2@gmail.com`), which by design owns nothing — the RLS audit depends on that staying true, so any test using PT2 must fully restore it.
- Exercises table columns: `coach_id, is_personal, name, muscle_group, category, default_sets, default_reps, notes` (no type column). `muscle_group` ∈ {Chest, Back, Shoulders, Arms, Core, Legs, Glutes, Cardio, Full Body}. `category` ∈ {Compound, Isolation, Cardio, Bodyweight, Stretching}. `workout_template_exercises.exercise_type` ∈ {strength, cardio}.
- Full content list is in the approved spec: `docs/superpowers/specs/2026-07-12-new-coach-starter-content-design.md`.
- Pre-push gates (before the final push, not per-task): full Playwright suite green (reconcile passed+skipped+failed+flaky against declared total), `feature-audit`, then `multi-agent-review`. Jake owns the push to live.

---

### Task 1: Schema migration + verify new-signup role

**Files:**
- Create: `scripts/add-starter-seeded-2026-07-12.sql` (record of the migration; Jake runs it in the Supabase SQL editor — the app cannot run DDL).

**Interfaces:**
- Produces: a `profiles.starter_seeded boolean not null default false` column; all *existing* profiles set to `true`.

- [ ] **Step 1: Write the migration SQL**

Create `scripts/add-starter-seeded-2026-07-12.sql`:

```sql
-- New-coach starter content: one-time-per-account seed flag.
alter table profiles add column if not exists starter_seeded boolean not null default false;

-- Existing accounts have already onboarded (incl. Jake) — never retro-seed them.
update profiles set starter_seeded = true where starter_seeded = false;
```

- [ ] **Step 2: Jake runs it in Supabase**

Paste both statements into the Supabase SQL editor and run. Expected: `ALTER TABLE` succeeds; the `UPDATE` reports the number of existing profile rows.

- [ ] **Step 3: Verify a fresh signup's role (blocks the seed guard)**

The seed guard is `currentProfile.role === 'coach'`. Confirm a brand-new self-signup actually gets `role = 'coach'` (not null), by inspecting the `handle_new_user` trigger definition:

```sql
select pg_get_functiondef(oid) from pg_proc where proname = 'handle_new_user';
```

Expected: the function inserts into `profiles` with `role = 'coach'` (or a default that resolves to coach for self-signups). **If it sets role to null or omits it**, add to the migration: `alter table profiles alter column role set default 'coach';` and update the trigger to set `role = 'coach'` — otherwise a new coach never satisfies the seed guard. Record the finding in the SQL file as a comment.

- [ ] **Step 4: Commit the SQL record**

```bash
git add scripts/add-starter-seeded-2026-07-12.sql
git commit -m "Migration: profiles.starter_seeded flag for new-coach seeding"
```

---

### Task 2: Starter-content module + seed function (TDD via PT2)

**Files:**
- Create: `js/starter-content.js` — `STARTER_EXERCISES`, `STARTER_TEMPLATE`, `STARTER_PROGRAM`, `_seedStarterContent()`, `_markSeeded()`.
- Modify: `index.html` — add `<script src="js/starter-content.js?v=1"></script>` (place it after `app-core.js`, before `app-workouts.js`, so `db`/`currentUser`/`log` globals exist when it loads — actually it only defines functions/consts, so order among the app-*.js scripts doesn't matter; put it right after `app-core.js`).
- Create: `tests/onboarding.spec.js` — the seeding test.

**Interfaces:**
- Consumes: globals `db`, `currentUser`, `currentProfile`, `log` (from app-core.js).
- Produces: `async function _seedStarterContent()` — seeds the current coach's starter content if `currentProfile.role === 'coach' && !currentProfile.starter_seeded`; idempotent. `async function _markSeeded()` — sets `profiles.starter_seeded = true` for `currentUser.id` and patches the in-memory `currentProfile`.

- [ ] **Step 1: Write the failing test**

Create `tests/onboarding.spec.js`:

```javascript
const { test, expect } = require('./fixtures')
const { loginAsPT2 } = require('./helpers')

// PT2 owns nothing by design (the RLS audit depends on that). This test borrows it as a
// "brand-new coach" fixture: force its flag false, run the seed, assert the full starter set
// appears, prove idempotency, then delete everything and restore PT2 to owning nothing.
test.describe('New-coach starter content', () => {
  test('first-login seed creates the library, sample workout, and sample program, once', async ({ page }) => {
    await loginAsPT2(page)

    // Arrange: pretend PT2 has never been seeded and owns nothing.
    await page.evaluate(async () => {
      await db.from('profiles').update({ starter_seeded: false }).eq('id', currentUser.id)
      currentProfile.starter_seeded = false
    })

    // Act
    const first = await page.evaluate(async () => { await _seedStarterContent(); return true })
    expect(first).toBe(true)

    // Assert: content exists and the flag flipped.
    const state = await page.evaluate(async () => {
      const ex = await db.from('exercises').select('id, name').eq('coach_id', currentUser.id)
      const tmpl = await db.from('workout_templates').select('id, name').eq('coach_id', currentUser.id).is('program_id', null).is('client_id', null)
      const wte = tmpl.data?.length ? await db.from('workout_template_exercises').select('exercise_name, exercise_id').eq('template_id', tmpl.data[0].id) : { data: [] }
      const prog = await db.from('programs').select('id, name').eq('coach_id', currentUser.id)
      const phases = prog.data?.length ? await db.from('program_phases').select('id').eq('program_id', prog.data[0].id) : { data: [] }
      const ppw = phases.data?.length ? await db.from('program_phase_workouts').select('id, day_of_week, template_id').eq('phase_id', phases.data[0].id) : { data: [] }
      const prof = await db.from('profiles').select('starter_seeded').eq('id', currentUser.id).single()
      return {
        exerciseCount: ex.data?.length || 0,
        templateName: tmpl.data?.[0]?.name || null,
        templateExerciseCount: wte.data?.length || 0,
        templateExercisesLinked: (wte.data || []).every(r => r.exercise_id != null),
        programName: prog.data?.[0]?.name || null,
        phaseWorkoutDays: (ppw.data || []).map(r => r.day_of_week).sort(),
        seededFlag: prof.data?.starter_seeded,
      }
    })

    expect(state.exerciseCount).toBe(40)
    expect(state.templateName).toBe('Example — Full Body A')
    expect(state.templateExerciseCount).toBe(6)
    expect(state.templateExercisesLinked).toBe(true) // every template exercise resolved to a library exercise id
    expect(state.programName).toBe('Example — 4-Week Foundation')
    expect(state.phaseWorkoutDays).toEqual([1, 4]) // Mon + Thu
    expect(state.seededFlag).toBe(true)

    // Idempotency: running again seeds nothing new.
    const second = await page.evaluate(async () => {
      await _seedStarterContent()
      const ex = await db.from('exercises').select('id').eq('coach_id', currentUser.id)
      const prog = await db.from('programs').select('id').eq('coach_id', currentUser.id)
      return { exerciseCount: ex.data?.length || 0, programCount: prog.data?.length || 0 }
    })
    expect(second.exerciseCount).toBe(40) // not 80
    expect(second.programCount).toBe(1)   // not 2

    // Cleanup: restore PT2 to owning nothing (children first), flag back to true.
    await page.evaluate(async () => {
      const prog = await db.from('programs').select('id').eq('coach_id', currentUser.id)
      for (const p of prog.data || []) {
        const ph = await db.from('program_phases').select('id').eq('program_id', p.id)
        for (const phase of ph.data || []) await db.from('program_phase_workouts').delete().eq('phase_id', phase.id)
        await db.from('program_phases').delete().eq('program_id', p.id)
      }
      await db.from('programs').delete().eq('coach_id', currentUser.id)
      const tmpl = await db.from('workout_templates').select('id').eq('coach_id', currentUser.id)
      for (const t of tmpl.data || []) await db.from('workout_template_exercises').delete().eq('template_id', t.id)
      await db.from('workout_templates').delete().eq('coach_id', currentUser.id)
      await db.from('exercises').delete().eq('coach_id', currentUser.id)
      await db.from('profiles').update({ starter_seeded: true }).eq('id', currentUser.id)
    })
    const leftover = await page.evaluate(async () => {
      const ex = await db.from('exercises').select('id').eq('coach_id', currentUser.id)
      return ex.data?.length || 0
    })
    expect(leftover).toBe(0) // PT2 owns nothing again — RLS audit premise preserved
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test onboarding.spec.js --reporter=line`
Expected: FAIL — `_seedStarterContent is not defined` (the module doesn't exist yet).

- [ ] **Step 3: Create the content module**

Create `js/starter-content.js`:

```javascript
// New-coach starter content — seeded once on a coach's first login (see _seedStarterContent).
// Editing this list ships via the normal deploy + cache-bust; no DB migration needed.
const STARTER_EXERCISES = [
  { name: 'Barbell Bench Press', muscle_group: 'Chest', category: 'Compound' },
  { name: 'Incline Dumbbell Press', muscle_group: 'Chest', category: 'Compound' },
  { name: 'Push-Up', muscle_group: 'Chest', category: 'Bodyweight' },
  { name: 'Dumbbell Chest Fly', muscle_group: 'Chest', category: 'Isolation' },
  { name: 'Deadlift', muscle_group: 'Back', category: 'Compound' },
  { name: 'Bent-Over Barbell Row', muscle_group: 'Back', category: 'Compound' },
  { name: 'Lat Pulldown', muscle_group: 'Back', category: 'Compound' },
  { name: 'Pull-Up', muscle_group: 'Back', category: 'Bodyweight' },
  { name: 'Seated Cable Row', muscle_group: 'Back', category: 'Compound' },
  { name: 'Face Pull', muscle_group: 'Back', category: 'Isolation' },
  { name: 'Overhead Press', muscle_group: 'Shoulders', category: 'Compound' },
  { name: 'Dumbbell Lateral Raise', muscle_group: 'Shoulders', category: 'Isolation' },
  { name: 'Rear Delt Fly', muscle_group: 'Shoulders', category: 'Isolation' },
  { name: 'Arnold Press', muscle_group: 'Shoulders', category: 'Compound' },
  { name: 'Barbell Curl', muscle_group: 'Arms', category: 'Isolation' },
  { name: 'Dumbbell Hammer Curl', muscle_group: 'Arms', category: 'Isolation' },
  { name: 'Tricep Pushdown', muscle_group: 'Arms', category: 'Isolation' },
  { name: 'Overhead Tricep Extension', muscle_group: 'Arms', category: 'Isolation' },
  { name: 'Dip', muscle_group: 'Arms', category: 'Bodyweight' },
  { name: 'Back Squat', muscle_group: 'Legs', category: 'Compound' },
  { name: 'Front Squat', muscle_group: 'Legs', category: 'Compound' },
  { name: 'Romanian Deadlift', muscle_group: 'Legs', category: 'Compound' },
  { name: 'Leg Press', muscle_group: 'Legs', category: 'Compound' },
  { name: 'Walking Lunge', muscle_group: 'Legs', category: 'Compound' },
  { name: 'Leg Extension', muscle_group: 'Legs', category: 'Isolation' },
  { name: 'Leg Curl', muscle_group: 'Legs', category: 'Isolation' },
  { name: 'Standing Calf Raise', muscle_group: 'Legs', category: 'Isolation' },
  { name: 'Hip Thrust', muscle_group: 'Glutes', category: 'Compound' },
  { name: 'Glute Bridge', muscle_group: 'Glutes', category: 'Bodyweight' },
  { name: 'Bulgarian Split Squat', muscle_group: 'Glutes', category: 'Compound' },
  { name: 'Plank', muscle_group: 'Core', category: 'Bodyweight' },
  { name: 'Hanging Leg Raise', muscle_group: 'Core', category: 'Bodyweight' },
  { name: 'Cable Crunch', muscle_group: 'Core', category: 'Isolation' },
  { name: 'Russian Twist', muscle_group: 'Core', category: 'Bodyweight' },
  { name: 'Treadmill Run', muscle_group: 'Cardio', category: 'Cardio' },
  { name: 'Rowing Machine', muscle_group: 'Cardio', category: 'Cardio' },
  { name: 'Assault Bike', muscle_group: 'Cardio', category: 'Cardio' },
  { name: 'Jump Rope', muscle_group: 'Cardio', category: 'Cardio' },
  { name: 'Kettlebell Swing', muscle_group: 'Full Body', category: 'Compound' },
  { name: 'Burpee', muscle_group: 'Full Body', category: 'Bodyweight' },
]

// One set object repeated `sets` times, matching how the builder writes sets_json.
const _set = (o) => o
const STARTER_TEMPLATE = {
  name: 'Example — Full Body A',
  description: 'A sample full-body workout — edit or delete it.',
  exercises: [
    { exercise_name: 'Back Squat', exercise_type: 'strength', order_index: 0, sets: 3, set: { repsMin: '8', repsMax: '10', restMin: '2:00', effortType: 'rpe', effortMin: '7' } },
    { exercise_name: 'Barbell Bench Press', exercise_type: 'strength', order_index: 1, sets: 3, set: { repsMin: '8', repsMax: '10', restMin: '2:00', effortType: 'rpe', effortMin: '7' } },
    { exercise_name: 'Bent-Over Barbell Row', exercise_type: 'strength', order_index: 2, sets: 3, set: { repsMin: '8', repsMax: '10', restMin: '90' } },
    { exercise_name: 'Overhead Press', exercise_type: 'strength', order_index: 3, sets: 3, set: { repsMin: '8', repsMax: '12', restMin: '90' } },
    { exercise_name: 'Romanian Deadlift', exercise_type: 'strength', order_index: 4, sets: 3, set: { repsMin: '10', repsMax: '12', restMin: '90' } },
    { exercise_name: 'Plank', exercise_type: 'strength', order_index: 5, sets: 3, set: { timed: true, duration: '0:40', restMin: '60' } },
  ],
}
const STARTER_PROGRAM = {
  name: 'Example — 4-Week Foundation',
  description: 'A sample 2×/week full-body program — edit or delete it.',
  phaseName: 'Foundation',
  durationWeeks: 4,
  days: [
    { day_of_week: 1, day_label: 'Monday' },
    { day_of_week: 4, day_label: 'Thursday' },
  ],
}

async function _markSeeded() {
  await db.from('profiles').update({ starter_seeded: true }).eq('id', currentUser.id)
  if (currentProfile) currentProfile.starter_seeded = true
}

// Seeds the current coach's starter content, once. Idempotent: gated by the starter_seeded flag,
// with a secondary "already has exercises" guard so a partial-failure retry can't duplicate.
async function _seedStarterContent() {
  if (currentProfile?.role !== 'coach' || currentProfile?.starter_seeded) return
  const { count } = await db.from('exercises').select('id', { head: true, count: 'exact' }).eq('coach_id', currentUser.id)
  if (count && count > 0) { await _markSeeded(); return } // content already present — just mark and stop

  // 1. exercises
  const { data: exRows, error: exErr } = await db.from('exercises').insert(
    STARTER_EXERCISES.map(e => ({ coach_id: currentUser.id, is_personal: false, name: e.name, muscle_group: e.muscle_group, category: e.category }))
  ).select('id, name')
  if (exErr) { log.error('_seedStarterContent', 'exercise seed failed', exErr); return }
  const exIdByName = Object.fromEntries((exRows || []).map(r => [r.name, r.id]))

  // 2. sample workout + its exercises (linked to the new library exercises by name)
  const { data: tmpl, error: tErr } = await db.from('workout_templates').insert({
    coach_id: currentUser.id, program_id: null, client_id: null, is_personal: false,
    name: STARTER_TEMPLATE.name, description: STARTER_TEMPLATE.description,
  }).select('id').single()
  if (tErr || !tmpl) { log.error('_seedStarterContent', 'template seed failed', tErr); return }
  const { error: wteErr } = await db.from('workout_template_exercises').insert(STARTER_TEMPLATE.exercises.map(x => ({
    template_id: tmpl.id, exercise_id: exIdByName[x.exercise_name] || null, exercise_name: x.exercise_name,
    exercise_type: x.exercise_type, order_index: x.order_index, sets: x.sets,
    sets_json: Array.from({ length: x.sets }, () => x.set),
  })))
  if (wteErr) { log.error('_seedStarterContent', 'template exercises seed failed', wteErr); return }

  // 3. sample program → phase → phase-workouts (pointing at the sample workout)
  const { data: prog, error: pErr } = await db.from('programs').insert({
    coach_id: currentUser.id, name: STARTER_PROGRAM.name, description: STARTER_PROGRAM.description,
  }).select('id').single()
  if (pErr || !prog) { log.error('_seedStarterContent', 'program seed failed', pErr); return }
  const { data: phase, error: phErr } = await db.from('program_phases').insert({
    program_id: prog.id, name: STARTER_PROGRAM.phaseName, duration_weeks: STARTER_PROGRAM.durationWeeks, order_index: 0,
  }).select('id').single()
  if (phErr || !phase) { log.error('_seedStarterContent', 'phase seed failed', phErr); return }
  const { error: ppwErr } = await db.from('program_phase_workouts').insert(STARTER_PROGRAM.days.map(d => ({
    phase_id: phase.id, day_of_week: d.day_of_week, day_label: d.day_label, session_order: 1, week_number: 1, template_id: tmpl.id,
  })))
  if (ppwErr) { log.error('_seedStarterContent', 'phase workouts seed failed', ppwErr); return }

  // 4. flip the flag — only after a fully successful seed
  await _markSeeded()
  log.ok('_seedStarterContent', 'starter content seeded', { exercises: exRows.length })
}
```

- [ ] **Step 4: Add the script tag**

In `index.html`, immediately after the `app-core.js` script line, add:

```html
  <script src="js/starter-content.js?v=1"></script>
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx playwright test onboarding.spec.js --reporter=line`
Expected: PASS — 40 exercises, sample template with 6 linked exercises, program on days [1,4], flag true, idempotent re-run, PT2 restored to 0.

- [ ] **Step 6: Commit**

```bash
git add js/starter-content.js tests/onboarding.spec.js index.html
git commit -m "Add new-coach starter content module + seed function (tested via PT2)"
```

---

### Task 3: Wire the seed into first-login bootstrap

**Files:**
- Modify: `js/app-core.js` — `loadUserInfo()` (~line 100-147): add `starter_seeded` to the profile select; call the seed for a coach whose flag is false, before the first render.

**Interfaces:**
- Consumes: `_seedStarterContent()` (Task 2), `currentProfile`, `currentUser`.
- Produces: a seeded account on first login, with a "Setting up your account…" state during the seed.

- [ ] **Step 1: Add `starter_seeded` to the profile select (column allowlist)**

In `js/app-core.js`, change the `loadUserInfo` select from:

```javascript
    .select('full_name, role')
```
to:
```javascript
    .select('full_name, role, starter_seeded')
```

Rationale: a `select` that omits `starter_seeded` returns `undefined` for it — the seed guard `!currentProfile.starter_seeded` would then be true on *every* login and re-attempt the seed each time (the secondary "already has exercises" guard would stop duplication, but it's a wasted query storm and masks intent). Select it explicitly.

- [ ] **Step 2: Call the seed before the first render**

In `js/app-core.js`, at the end of `loadUserInfo()` (just before `await _loadBranding()`), add:

```javascript
  // Brand-new coach: seed the starter library/workout/program once, before anything renders, so the
  // dashboard isn't a blank slate on first login. Idempotent (see _seedStarterContent). role is
  // re-checked here because a master account's currentProfile.role may have been switched to
  // 'client'/'solo' above — starter seeding is only for a genuine coach account that has never seeded.
  if (currentProfile?.role === 'coach' && currentProfile?.starter_seeded === false) {
    const main = document.getElementById('main-content')
    if (main) main.innerHTML = '<div class="loading-state">Setting up your account…</div>'
    await _seedStarterContent()
  }
```

Note: a master account (Jake) has `starter_seeded = true` from the migration, so this never fires for him even when his `role` is temporarily `'coach'`. A brand-new coach has no client rows, so the master-detection block above is a no-op and `currentProfile.role` stays `'coach'`.

- [ ] **Step 3: Manually verify wiring against a fresh account (no automated test at this layer)**

`loadUserInfo` runs inside the real auth bootstrap, which Playwright can't easily half-mock without a fresh signup. Verify by reasoning + one live check Jake runs after deploy (a real new signup lands on a populated dashboard). Record as UNVERIFIED-until-live in the LOG. The seed *function* itself is covered by Task 2's test; this step only wires it in.

- [ ] **Step 4: Commit**

```bash
git add js/app-core.js
git commit -m "Seed starter content on a new coach's first login (loadUserInfo)"
```

---

### Task 4: Cache-bust, feature-audit, review, and ship

**Files:**
- Modify: `index.html` — bump `app-core.js` `?v=N` (Task 3 changed it). `starter-content.js` ships at `?v=1` (Task 2).

- [ ] **Step 1: Bump the cache version for the changed module**

In `index.html`, increment `app-core.js?v=N` to the next number. Confirm `starter-content.js?v=1` is present.

- [ ] **Step 2: Run the full Playwright suite and reconcile**

Run: `npm test` (capture to a file — never `tail` it). Confirm `passed + skipped + failed + flaky == declared total`, 0 failed, and that `onboarding.spec.js` actually ran.

- [ ] **Step 3: feature-audit**

Run the `feature-audit` skill: walk the new-coach path as a coach (empty → seeded → can open the sample workout, run it, open the sample program, and delete an example). Confirm the examples are clearly labelled and deletable, and the seed does not clutter the calendar (program not auto-assigned).

- [ ] **Step 4: multi-agent-review (diff mode)**

Run the `multi-agent-review` skill on the diff. Key risks to steer the agents at: (a) the seed running for the wrong role or more than once; (b) the profile `select` column allowlist; (c) any RLS scoping on the inserts; (d) the PT2 test fully restoring PT2 to owning nothing. Fix blocking findings, re-run the suite.

- [ ] **Step 5: Commit the cache bump and hand off to Jake for push**

```bash
git add index.html
git commit -m "Cache-bust for new-coach starter content"
```

Jake runs the push to live (after the migration in Task 1 is applied). Then a live smoke test: a genuine new signup lands on a populated dashboard.

---

## Self-Review

- **Spec coverage:** schema flag (Task 1) ✓ · content list + sample workout + program (Task 2) ✓ · seed function with idempotency + secondary guard (Task 2) ✓ · first-login wiring + loading state + column allowlist (Task 3) ✓ · not auto-assigned (Task 2 builds no client_program; Task 4 audit verifies) ✓ · coach-only (guard in Task 2 & 3) ✓ · PT2 test incl. idempotency + full restore (Task 2) ✓ · cache-bust + review gates (Task 4) ✓.
- **Open dependency flagged, not hidden:** Task 1 Step 3 verifies `handle_new_user` gives a new signup `role = 'coach'`; if not, the guard never fires — the plan says how to fix it there.
- **Type consistency:** `_seedStarterContent()` / `_markSeeded()` names match across Tasks 2 and 3. `STARTER_TEMPLATE.exercises[].set` (singular) is expanded to `sets_json` array in the seed; `sets` (count) is a separate integer field — consistent between the module and the insert.
- **No placeholders:** all SQL, JS, and test code is complete and literal.
