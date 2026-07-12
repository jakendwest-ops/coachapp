# New-coach starter content — design spec

**Date:** 2026-07-12 · **Status:** approved design, pending spec review · **Beta:** 31 July 2026

## Problem

A brand-new coach signs up to a **completely empty app**. `db.auth.signUp` creates the auth user and the `handle_new_user` trigger creates only the `profiles` row — **0 exercises, 0 templates, 0 programs**. You cannot build a workout without exercises, so the first session is typing every exercise in by hand. Jake has never hit this (his account has 200+ exercises from months of use); the app is excellent once populated and close to unusable before. Highest beta risk currently open.

## Goal

A brand-new coach's **first login** lands them in a usable app: a real exercise library, one sample workout, and one short sample program — so they can build immediately, or just edit the examples.

## Decisions (locked with Jake, 2026-07-12)

| # | Decision | Choice |
|---|---|---|
| 1 | Scope of starter content | Exercises **+** a sample workout **+** a sample program (a full worked example) |
| 2 | Content source | A **curated set drafted by Claude, approved by Jake** (this doc); not cloned from Jake's real library |
| 3 | Delivery | **Automatic on first login**; examples labelled "Example — …", fully editable/deletable |
| 4 | Mechanism | **App-side seed on first login, gated by a `profiles.starter_seeded` flag** (idempotent); content lives as a JS list |
| A | Auto-assign the sample program? | **No** — it sits in the Programs list as an example; the calendar/dashboard stay clean |
| B | Which roles get seeded? | **`coach` only** (coach-facing library content) |
| C | Testing fixture | The existing **PT2** account (owns nothing by design) |

## Schema change (one migration, run by Jake)

```sql
alter table profiles add column if not exists starter_seeded boolean not null default false;
-- Existing accounts have already onboarded — never retro-seed them (this includes Jake):
update profiles set starter_seeded = true where starter_seeded = false;
```

After this runs, only genuinely new signups carry `starter_seeded = false` and qualify for seeding.

## Content (curated draft — Jake to review/edit)

All rows are the coach's own: `coach_id = currentUser.id`, `is_personal = false`.

### Exercises — 40, using the app's existing `muscle_group` / `category` values

The `exercises` library table has columns `coach_id, is_personal, name, muscle_group, category, default_sets, default_reps, notes` — **no type column**. The `type` column in the table below is informational only: it's the `exercise_type` applied when the exercise is placed in a workout (`workout_template_exercises.exercise_type`), used to route cardio vs. strength in the runner. The seed inserts only `name` / `muscle_group` / `category` per exercise row (`default_sets`/`default_reps`/`notes` left null).

| # | name | muscle_group | category | type |
|---|---|---|---|---|
| 1 | Barbell Bench Press | Chest | Compound | strength |
| 2 | Incline Dumbbell Press | Chest | Compound | strength |
| 3 | Push-Up | Chest | Bodyweight | strength |
| 4 | Dumbbell Chest Fly | Chest | Isolation | strength |
| 5 | Deadlift | Back | Compound | strength |
| 6 | Bent-Over Barbell Row | Back | Compound | strength |
| 7 | Lat Pulldown | Back | Compound | strength |
| 8 | Pull-Up | Back | Bodyweight | strength |
| 9 | Seated Cable Row | Back | Compound | strength |
| 10 | Face Pull | Back | Isolation | strength |
| 11 | Overhead Press | Shoulders | Compound | strength |
| 12 | Dumbbell Lateral Raise | Shoulders | Isolation | strength |
| 13 | Rear Delt Fly | Shoulders | Isolation | strength |
| 14 | Arnold Press | Shoulders | Compound | strength |
| 15 | Barbell Curl | Arms | Isolation | strength |
| 16 | Dumbbell Hammer Curl | Arms | Isolation | strength |
| 17 | Tricep Pushdown | Arms | Isolation | strength |
| 18 | Overhead Tricep Extension | Arms | Isolation | strength |
| 19 | Dip | Arms | Bodyweight | strength |
| 20 | Back Squat | Legs | Compound | strength |
| 21 | Front Squat | Legs | Compound | strength |
| 22 | Romanian Deadlift | Legs | Compound | strength |
| 23 | Leg Press | Legs | Compound | strength |
| 24 | Walking Lunge | Legs | Compound | strength |
| 25 | Leg Extension | Legs | Isolation | strength |
| 26 | Leg Curl | Legs | Isolation | strength |
| 27 | Standing Calf Raise | Legs | Isolation | strength |
| 28 | Hip Thrust | Glutes | Compound | strength |
| 29 | Glute Bridge | Glutes | Bodyweight | strength |
| 30 | Bulgarian Split Squat | Glutes | Compound | strength |
| 31 | Plank | Core | Bodyweight | strength |
| 32 | Hanging Leg Raise | Core | Bodyweight | strength |
| 33 | Cable Crunch | Core | Isolation | strength |
| 34 | Russian Twist | Core | Bodyweight | strength |
| 35 | Treadmill Run | Cardio | Cardio | cardio |
| 36 | Rowing Machine | Cardio | Cardio | cardio |
| 37 | Assault Bike | Cardio | Cardio | cardio |
| 38 | Jump Rope | Cardio | Cardio | cardio |
| 39 | Kettlebell Swing | Full Body | Compound | strength |
| 40 | Burpee | Full Body | Bodyweight | strength |

### Sample workout — "Example — Full Body A"

`workout_templates`: `{ coach_id, program_id: null, client_id: null, is_personal: false, name: 'Example — Full Body A', description: 'A sample full-body workout — edit or delete it.' }`

`workout_template_exercises` (linked to the seeded exercises by `exercise_name`, so `exercise_id` resolves):

| order | exercise_name | type | sets | sets_json (per set) |
|---|---|---|---|---|
| 0 | Back Squat | strength | 3 | `{repsMin:'8', repsMax:'10', restMin:'2:00', effortType:'rpe', effortMin:'7'}` |
| 1 | Barbell Bench Press | strength | 3 | `{repsMin:'8', repsMax:'10', restMin:'2:00', effortType:'rpe', effortMin:'7'}` |
| 2 | Bent-Over Barbell Row | strength | 3 | `{repsMin:'8', repsMax:'10', restMin:'90'}` |
| 3 | Overhead Press | strength | 3 | `{repsMin:'8', repsMax:'12', restMin:'90'}` |
| 4 | Romanian Deadlift | strength | 3 | `{repsMin:'10', repsMax:'12', restMin:'90'}` |
| 5 | Plank | strength | 3 | `{timed:true, duration:'0:40', restMin:'60'}` |

(Each row's `sets_json` is an array of `sets` identical set objects, matching how the builder writes them.)

### Sample program — "Example — 4-Week Foundation"

- `programs`: `{ coach_id, name: 'Example — 4-Week Foundation', description: 'A sample 2×/week full-body program — edit or delete it.' }`
- `program_phases`: one phase `{ name: 'Foundation', duration_weeks: 4, order_index: 0 }`
- `program_phase_workouts`: the sample workout on two days (a realistic beginner 2×/week full-body split):
  - `{ day_of_week: 1, day_label: 'Monday', session_order: 1, week_number: 1, template_id: <Example — Full Body A> }`
  - `{ day_of_week: 4, day_label: 'Thursday', session_order: 1, week_number: 1, template_id: <Example — Full Body A> }`

Not auto-assigned to the coach's own calendar (decision A).

## Seeding function — `_seedStarterContent()` (app-side)

Lives alongside the content list (new module `js/starter-content.js`, or a section of `app-core.js`). Pseudocode:

```
async function _seedStarterContent() {
  // guard: only a coach who has never been seeded
  if (currentProfile?.role !== 'coach' || currentProfile?.starter_seeded) return
  // secondary belt-and-braces guard against a re-run after a partial failure:
  const { count } = await db.from('exercises').select('id', { head:true, count:'exact' }).eq('coach_id', currentUser.id)
  if (count > 0) { await _markSeeded(); return }

  // 1. exercises
  const { data: exRows } = await db.from('exercises').insert(
    STARTER_EXERCISES.map(e => ({ coach_id: currentUser.id, is_personal:false, name:e.name, muscle_group:e.muscle_group, category:e.category }))
  ).select('id, name')
  const exIdByName = Object.fromEntries((exRows||[]).map(r => [r.name, r.id]))

  // 2. sample template + its exercises
  const { data: tmpl } = await db.from('workout_templates').insert({ coach_id:currentUser.id, program_id:null, client_id:null, is_personal:false, name:STARTER_TEMPLATE.name, description:STARTER_TEMPLATE.description }).select('id').single()
  await db.from('workout_template_exercises').insert(STARTER_TEMPLATE.exercises.map(x => ({
    template_id: tmpl.id, exercise_id: exIdByName[x.exercise_name] || null, exercise_name:x.exercise_name,
    exercise_type:x.exercise_type, order_index:x.order_index, sets:x.sets, sets_json:x.sets_json
  })))

  // 3. sample program → phase → phase-workouts
  const { data: prog } = await db.from('programs').insert({ coach_id:currentUser.id, name:STARTER_PROGRAM.name, description:STARTER_PROGRAM.description }).select('id').single()
  const { data: phase } = await db.from('program_phases').insert({ program_id:prog.id, name:'Foundation', duration_weeks:4, order_index:0 }).select('id').single()
  await db.from('program_phase_workouts').insert(STARTER_PROGRAM.days.map(d => ({
    phase_id:phase.id, day_of_week:d.day_of_week, day_label:d.day_label, session_order:1, week_number:1, template_id: tmpl.id
  })))

  // 4. flip the flag (only after success)
  await _markSeeded()
}
async function _markSeeded() {
  await db.from('profiles').update({ starter_seeded:true }).eq('id', currentUser.id)
  if (currentProfile) currentProfile.starter_seeded = true
}
```

## Wiring — where it's called

In the post-login bootstrap where `currentProfile` is loaded (app-core), for a coach with `starter_seeded === false`:
- show a brief **"Setting up your account…"** state,
- `await _seedStarterContent()`,
- then proceed to the first dashboard render (so the content is present on the first paint).

`profiles` selects in the bootstrap must include `starter_seeded` (column allowlist — a `select('id, role, …')` that omits it will read `undefined` and try to seed every login; include it explicitly).

## Idempotency & edge cases

- **Primary guard:** the `starter_seeded` flag, flipped only after a successful seed.
- **Partial-failure guard:** the secondary "coach already has exercises" check prevents a duplicate seed if a first attempt inserted some rows then failed — on the retry it sees existing content, marks seeded, and stops.
- **Existing accounts:** migration sets their flag `true`, so no retro-seed.
- **Client / solo roles:** not seeded (decision B). A coach who also uses personal/solo view still gets coach-facing library content, which is correct.
- **Deletes are respected:** a coach who clears the starter content is not re-seeded (flag stays true).

## Testing (Playwright, via PT2)

PT2 (`coachapp.e2e.pt2@gmail.com`) owns nothing by design. Test:
1. As PT2: set `starter_seeded = false` and confirm PT2 has 0 exercises/templates/programs.
2. Run `_seedStarterContent()`.
3. Assert: 40 exercises exist, the sample template exists with 6 linked exercises (each `exercise_id` resolved), the sample program exists with one phase and two phase-workouts pointing at the template, and `starter_seeded` is now true.
4. Re-run `_seedStarterContent()` → asserts **no duplication** (idempotent).
5. Cleanup: delete all seeded content and reset PT2's flag to a clean state (PT2 must return to owning nothing, so the RLS audit's "coach who owns nothing" premise still holds).

## Non-goals

- No auto-assignment of the sample program.
- No per-coach customisation of the starter set (one canonical list for everyone).
- No starter content for client/solo roles.
- Not authored in SQL — the content is a maintainable JS list shipped via the normal deploy + cache-bust.

## Files touched

- `profiles` — new `starter_seeded` column (migration).
- `js/starter-content.js` (new) — `STARTER_EXERCISES` / `STARTER_TEMPLATE` / `STARTER_PROGRAM` + `_seedStarterContent()`; add its `<script>` to `index.html` with a `?v=` tag.
- `js/app-core.js` — call the seed in the post-login bootstrap; include `starter_seeded` in the profile select.
- `index.html` — new script tag (+ cache-bust the modules touched).
- `tests/programs.spec.js` (or a new `tests/onboarding.spec.js`) — the PT2 seeding test.
