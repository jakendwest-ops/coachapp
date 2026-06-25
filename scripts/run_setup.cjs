const { createClient } = require('@supabase/supabase-js')

const db = createClient(
  'https://avilxuiacmtgeoxxhfhc.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || '',
  { auth: { persistSession: false } }
)

async function run() {
  // Get Jake's coach ID
  const { data: profile } = await db.from('profiles').select('id').eq('email', 'jakendwest@gmail.com').single()
  // Fallback: try auth.users via admin
  let coachId = profile?.id
  if (!coachId) {
    const { data: users } = await db.auth.admin.listUsers()
    const jake = users?.users?.find(u => u.email === 'jakendwest@gmail.com')
    coachId = jake?.id
  }
  if (!coachId) throw new Error('Could not find Jake user ID')
  console.log('Coach ID:', coachId)

  // ── Upper A ──────────────────────────────────────────────
  const { data: tplUpperA } = await db.from('workout_templates').insert({
    coach_id: coachId,
    name: 'Upper A — Horizontal Push & Pull',
    description: 'Horizontal push/pull strength session. 50 min.'
  }).select('id').single()
  console.log('Upper A:', tplUpperA.id)

  await db.from('workout_template_exercises').insert([
    { template_id: tplUpperA.id, exercise_name: 'Bench Press', exercise_type: 'strength', order_index: 1, sets: 4,
      sets_json: [1,2,3,4].map(() => ({ repsMin: 6, repsMax: 6, intensityMin: 70, intensityMax: 85, restMin: '3:00', restMax: '3:00' })),
      notes: '70–85% 1RM. Control the descent.' },
    { template_id: tplUpperA.id, exercise_name: 'Barbell / Dumbbell Row', exercise_type: 'strength', order_index: 2, sets: 4,
      sets_json: [1,2,3,4].map(() => ({ repsMin: 8, repsMax: 8, restMin: '2:00', restMax: '2:30' })),
      notes: 'Heavy. Chest-supported preferred.' },
    { template_id: tplUpperA.id, exercise_name: 'Weighted Pull-Up', exercise_type: 'strength', order_index: 3, sets: 4,
      sets_json: [1,2,3,4].map(() => ({ repsMin: 5, repsMax: 8, restMin: '2:00', restMax: '2:30' })),
      notes: null },
    { template_id: tplUpperA.id, exercise_name: 'Overhead Press', exercise_type: 'strength', order_index: 4, sets: 3,
      sets_json: [1,2,3].map(() => ({ repsMin: 8, repsMax: 10, restMin: '1:30', restMax: '2:00' })),
      notes: null },
    { template_id: tplUpperA.id, exercise_name: "Farmer's Carry (30–50m)", exercise_type: 'strength', order_index: 5, sets: 3,
      sets_json: [1,2,3].map(() => ({ repsMin: 1, repsMax: 1, restMin: '1:30', restMax: '2:00' })),
      notes: '30–50m per set. Grip and upper back focus.' }
  ])

  // ── Lower A ──────────────────────────────────────────────
  const { data: tplLowerA } = await db.from('workout_templates').insert({
    coach_id: coachId,
    name: 'Lower A — Squat & Posterior Chain',
    description: 'Squat-focused lower session. 50 min.'
  }).select('id').single()
  console.log('Lower A:', tplLowerA.id)

  await db.from('workout_template_exercises').insert([
    { template_id: tplLowerA.id, exercise_name: 'Back Squat', exercise_type: 'strength', order_index: 1, sets: 4,
      sets_json: [1,2,3,4].map(() => ({ repsMin: 5, repsMax: 5, intensityMin: 70, intensityMax: 85, restMin: '3:00', restMax: '3:00' })),
      notes: '70–85% 1RM. Depth to parallel.' },
    { template_id: tplLowerA.id, exercise_name: 'Romanian Deadlift', exercise_type: 'strength', order_index: 2, sets: 3,
      sets_json: [1,2,3].map(() => ({ repsMin: 10, repsMax: 12, restMin: '2:00', restMax: '2:00' })),
      notes: null },
    { template_id: tplLowerA.id, exercise_name: 'Bulgarian Split Squat', exercise_type: 'strength', order_index: 3, sets: 3,
      sets_json: [1,2,3].map(() => ({ repsMin: 8, repsMax: 8, restMin: '1:30', restMax: '2:00' })),
      notes: '8 reps each leg.' },
    { template_id: tplLowerA.id, exercise_name: 'Leg Curl / Nordic', exercise_type: 'strength', order_index: 4, sets: 3,
      sets_json: [1,2,3].map(() => ({ repsMin: 10, repsMax: 10, restMin: '1:30', restMax: '1:30' })),
      notes: null },
    { template_id: tplLowerA.id, exercise_name: 'Calf Raise', exercise_type: 'strength', order_index: 5, sets: 3,
      sets_json: [1,2,3].map(() => ({ repsMin: 20, repsMax: 20, restMin: '1:00', restMax: '1:00' })),
      notes: null }
  ])

  // ── Upper B ──────────────────────────────────────────────
  const { data: tplUpperB } = await db.from('workout_templates').insert({
    coach_id: coachId,
    name: 'Upper B — Vertical Push, Pull & Stations',
    description: 'Vertical push/pull + Hyrox stations. 50 min.'
  }).select('id').single()
  console.log('Upper B:', tplUpperB.id)

  await db.from('workout_template_exercises').insert([
    { template_id: tplUpperB.id, exercise_name: 'Push Press', exercise_type: 'strength', order_index: 1, sets: 4,
      sets_json: [1,2,3,4].map(() => ({ repsMin: 6, repsMax: 8, restMin: '2:00', restMax: '2:30' })),
      notes: null },
    { template_id: tplUpperB.id, exercise_name: 'Weighted Pull-Up / Lat Pulldown', exercise_type: 'strength', order_index: 2, sets: 4,
      sets_json: [1,2,3,4].map(() => ({ repsMin: 6, repsMax: 8, restMin: '2:00', restMax: '2:00' })),
      notes: null },
    { template_id: tplUpperB.id, exercise_name: 'Wall Ball Endurance Sets', exercise_type: 'strength', order_index: 3, sets: 5,
      sets_json: [1,2,3,4,5].map(() => ({ repsMin: 20, repsMax: 50, restMin: '1:30', restMax: '2:00' })),
      notes: '10 kg. Sets get longer each phase — peak is 100 unbroken in weeks 9–11.' },
    { template_id: tplUpperB.id, exercise_name: 'Burpee Broad Jump', exercise_type: 'strength', order_index: 4, sets: 3,
      sets_json: [1,2,3].map(() => ({ repsMin: 1, repsMax: 1, restMin: '2:00', restMax: '2:00' })),
      notes: '20–40m per set.' },
    { template_id: tplUpperB.id, exercise_name: 'Tricep Dip / Pushdown', exercise_type: 'strength', order_index: 5, sets: 3,
      sets_json: [1,2,3].map(() => ({ repsMin: 12, repsMax: 12, restMin: '1:00', restMax: '1:30' })),
      notes: null }
  ])

  // ── Lower B ──────────────────────────────────────────────
  const { data: tplLowerB } = await db.from('workout_templates').insert({
    coach_id: coachId,
    name: 'Lower B — Deadlift Pattern & Unilateral',
    description: 'Deadlift-focused lower session. Complements Lower A squat focus. 50 min.'
  }).select('id').single()
  console.log('Lower B:', tplLowerB.id)

  await db.from('workout_template_exercises').insert([
    { template_id: tplLowerB.id, exercise_name: 'Conventional Deadlift', exercise_type: 'strength', order_index: 1, sets: 4,
      sets_json: [1,2,3,4].map(() => ({ repsMin: 3, repsMax: 5, intensityMin: 75, intensityMax: 90, restMin: '3:00', restMax: '4:00' })),
      notes: '75–90% 1RM. Brace hard, drive floor away.' },
    { template_id: tplLowerB.id, exercise_name: 'Single-Leg Romanian Deadlift', exercise_type: 'strength', order_index: 2, sets: 3,
      sets_json: [1,2,3].map(() => ({ repsMin: 10, repsMax: 10, restMin: '1:30', restMax: '2:00' })),
      notes: '10 reps each leg.' },
    { template_id: tplLowerB.id, exercise_name: 'Step-Up (Weighted)', exercise_type: 'strength', order_index: 3, sets: 3,
      sets_json: [1,2,3].map(() => ({ repsMin: 10, repsMax: 12, restMin: '1:30', restMax: '2:00' })),
      notes: '10–12 reps each leg.' },
    { template_id: tplLowerB.id, exercise_name: 'Glute Bridge / Hip Thrust', exercise_type: 'strength', order_index: 4, sets: 3,
      sets_json: [1,2,3].map(() => ({ repsMin: 12, repsMax: 12, restMin: '1:00', restMax: '1:30' })),
      notes: null },
    { template_id: tplLowerB.id, exercise_name: 'Sandbag Good Morning', exercise_type: 'strength', order_index: 5, sets: 3,
      sets_json: [1,2,3].map(() => ({ repsMin: 12, repsMax: 12, restMin: '1:00', restMax: '1:30' })),
      notes: 'Lower back endurance. Key for sandbag lunge station in Hyrox.' }
  ])

  // ── Look up existing cardio templates ─────────────────────
  const { data: allTemplates } = await db.from('workout_templates').select('id, name').eq('coach_id', coachId)
  const find = name => allTemplates.find(t => t.name === name)?.id

  const tplRowThreshold    = find('Row Threshold')
  const tplRunAerobic      = find('Run Aerobic')
  const tplSkiErgAerobic   = find('SkiErg Aerobic')
  const tplRunThreshold    = find('Run Threshold')
  const tplRowAerobic      = find('Row Aerobic')
  const tplSkiErgThreshold = find('SkiErg Threshold')

  console.log('Cardio templates found:', { tplRowThreshold, tplRunAerobic, tplSkiErgAerobic, tplRunThreshold, tplRowAerobic, tplSkiErgThreshold })

  // ── Program ───────────────────────────────────────────────
  const { data: program } = await db.from('programs').insert({
    coach_id: coachId,
    name: 'Hyrox Experiment',
    description: 'Hyrox-specific training plan. Strength + endurance. Sub-1:30 target. Two-a-day sessions on Mon / Wed / Fri / Sat.'
  }).select('id').single()
  console.log('Program:', program.id)

  const { data: phase } = await db.from('program_phases').insert({
    program_id: program.id,
    name: 'Phase 1 — Base Building',
    duration_weeks: 1,
    order_index: 1
  }).select('id').single()
  console.log('Phase:', phase.id)

  // ── Assign workouts — AM inserted before PM per day ───────
  // MON AM then PM
  await db.from('program_phase_workouts').insert({ phase_id: phase.id, day_of_week: 1, day_label: 'Monday', template_id: tplUpperA.id, notes: 'Strength before cardio. Upper pull pairs well with rowing — lats and upper back are pre-activated. Keep 2–3 min rest on main lifts.' })
  await db.from('program_phase_workouts').insert({ phase_id: phase.id, day_of_week: 1, day_label: 'Monday', template_id: tplRowThreshold, notes: 'Pace: 2:04–2:09/500m. HR 163–176 bpm. Warm-up 8 min easy, cool-down 5 min easy.' })

  // TUE single
  await db.from('program_phase_workouts').insert({ phase_id: phase.id, day_of_week: 2, day_label: 'Tuesday', template_id: tplRunAerobic, notes: "Full recovery from Monday's upper session. Keep genuinely easy — if HR drifts above 155, slow down." })

  // WED AM then PM
  await db.from('program_phase_workouts').insert({ phase_id: phase.id, day_of_week: 3, day_label: 'Wednesday', template_id: tplLowerA.id, notes: 'Squat-focused lower day. SkiErg after squats reinforces the hip hinge under fatigue.' })
  await db.from('program_phase_workouts').insert({ phase_id: phase.id, day_of_week: 3, day_label: 'Wednesday', template_id: tplSkiErgAerobic, notes: 'Pace: 2:40–2:55/500m. HR 134–154 bpm. Stroke rate 18–22 spm. 25–30 min. Keep aerobic pace genuinely easy.' })

  // THU single
  await db.from('program_phase_workouts').insert({ phase_id: phase.id, day_of_week: 4, day_label: 'Thursday', template_id: tplRunThreshold, notes: "No strength today — arrive completely fresh. This is the single most important session in the plan." })

  // FRI AM then PM
  await db.from('program_phase_workouts').insert({ phase_id: phase.id, day_of_week: 5, day_label: 'Friday', template_id: tplUpperB.id, notes: 'Hyrox upper-body stations live here. Wall ball sets get longer each phase — peak is 100 unbroken in weeks 9–11.' })
  await db.from('program_phase_workouts').insert({ phase_id: phase.id, day_of_week: 5, day_label: 'Friday', template_id: tplRowAerobic, notes: 'Pace: 2:35–2:50/500m. HR 134–154 bpm. 25–40 min. Easy — legs are rested.' })

  // SAT AM then PM
  await db.from('program_phase_workouts').insert({ phase_id: phase.id, day_of_week: 6, day_label: 'Saturday', template_id: tplLowerB.id, notes: 'Deadlift-focused lower day — complements Wednesday squat focus. Sandbag good mornings build lower back endurance for the sandbag lunge station.' })
  await db.from('program_phase_workouts').insert({ phase_id: phase.id, day_of_week: 6, day_label: 'Saturday', template_id: tplSkiErgThreshold, notes: 'SkiErg threshold after lower body. HR 163–176 bpm. Focus on hip drive in later reps.' })

  // SUN — rest, no assignment

  console.log('✅ Hyrox Experiment setup complete!')
}

run().catch(e => { console.error('❌ Error:', e.message); process.exit(1) })
