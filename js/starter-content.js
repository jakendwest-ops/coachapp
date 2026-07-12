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

const STARTER_TEMPLATE = {
  name: 'Example — Full Body A',
  description: 'A sample full-body workout — edit or delete it.',
  // `sets` is the count; `set` is the per-set object, repeated `sets` times into sets_json,
  // matching how the workout builder writes them.
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
