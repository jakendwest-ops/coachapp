/**
 * Seed script — creates isolated E2E test accounts and dummy data.
 * Run once: node scripts/seed-test-data.js
 * Safe to re-run — skips creation if accounts already exist.
 */

const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = 'https://avilxuiacmtgeoxxhfhc.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF2aWx4dWlhY210Z2VveHhoZmhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NjExNzcsImV4cCI6MjA5NzQzNzE3N30.SpVc5ZX_yf6gMrCJLxY9CxDki7PhBj2vbENha7tWBrc'

const PT_EMAIL       = 'coachapp.e2e.pt@gmail.com'
const PT_PASSWORD    = 'E2eTestPass123!'
const CLIENT_EMAIL   = 'coachapp.e2e.client@gmail.com'
const CLIENT_PASSWORD = 'E2eTestPass123!'

// A SECOND, entirely unrelated coach. Added 2026-07-12 for the RLS audit harness.
// Until this existed there was no way to test cross-COACH isolation at all — every RLS test the
// project had ever written used a single coach, so "coach B cannot read coach A's data" (the
// boundary that actually matters once beta puts strangers in the same database) was never once
// exercised. This account owns NO data of its own here on purpose: the harness creates and destroys
// its own fixtures at runtime rather than depending on shared seed rows (feedback_test_fixture_isolation).
const PT2_EMAIL      = 'coachapp.e2e.pt2@gmail.com'
const PT2_PASSWORD   = 'E2eTestPass123!'

async function signUpOrSignIn(db, email, password, fullName) {
  const { data: signUpData, error: signUpErr } = await db.auth.signUp({
    email, password,
    options: { data: { full_name: fullName } }
  })
  if (!signUpErr && signUpData.user) {
    console.log(`  Created: ${email}`)
    return signUpData
  }
  // Already exists — sign in instead
  const { data: signInData, error: signInErr } = await db.auth.signInWithPassword({ email, password })
  if (signInErr) throw new Error(`Sign-in failed for ${email}: ${signInErr.message}`)
  console.log(`  Exists, signed in: ${email}`)
  return signInData
}

async function run() {
  const db = createClient(SUPABASE_URL, SUPABASE_KEY)

  // ── 1. Create PT account ────────────────────────────────────────────────────
  console.log('\n[1] PT account')
  const ptAuth = await signUpOrSignIn(db, PT_EMAIL, PT_PASSWORD, 'Test Coach')
  const ptId = ptAuth.user.id

  // Sign in as PT and set role
  await db.auth.signInWithPassword({ email: PT_EMAIL, password: PT_PASSWORD })
  await db.from('profiles').update({ full_name: 'Test Coach', role: 'coach' }).eq('id', ptId)
  console.log(`  PT user id: ${ptId}`)

  // ── 2. Exercise library ─────────────────────────────────────────────────────
  console.log('\n[2] Exercise library')
  const exercises = [
    { name: 'Bench Press',    category: 'chest',     equipment: 'barbell', muscle_groups: ['chest', 'triceps'] },
    { name: 'Squat',          category: 'legs',      equipment: 'barbell', muscle_groups: ['quads', 'glutes'] },
    { name: 'Deadlift',       category: 'back',      equipment: 'barbell', muscle_groups: ['hamstrings', 'back'] },
    { name: 'Pull-up',        category: 'back',      equipment: 'bodyweight', muscle_groups: ['lats', 'biceps'] },
    { name: 'Overhead Press', category: 'shoulders', equipment: 'barbell', muscle_groups: ['shoulders', 'triceps'] },
    { name: 'Row 500m',       category: 'cardio',    equipment: 'rower',   muscle_groups: ['back', 'legs'], exercise_type: 'cardio' },
  ]
  const { data: existingEx } = await db.from('exercises').select('name').eq('coach_id', ptId)
  const existingNames = new Set((existingEx || []).map(e => e.name))
  const toInsert = exercises.filter(e => !existingNames.has(e.name)).map(e => ({ ...e, coach_id: ptId }))
  if (toInsert.length) await db.from('exercises').insert(toInsert)
  console.log(`  ${toInsert.length} exercises added (${existingNames.size} already existed)`)

  // ── 3. Workout template ─────────────────────────────────────────────────────
  console.log('\n[3] Workout template')
  let templateId
  const { data: existingT } = await db.from('workout_templates').select('id').eq('coach_id', ptId).eq('name', 'Push Day A').maybeSingle()
  if (existingT) {
    templateId = existingT.id
    console.log('  Template exists')
  } else {
    const { data: t, error: tErr } = await db.from('workout_templates').insert({
      coach_id: ptId, name: 'Push Day A', description: 'Chest / shoulders / triceps'
    }).select('id').single()
    if (tErr || !t) throw new Error('Template insert failed: ' + (tErr?.message || 'no row'))
    templateId = t.id
    console.log('  Template created')
  }

  // Populate exercises whenever the template has none — NOT just when the template is newly created.
  // This block previously sat inside the `else` above AND was broken three ways: it omitted the
  // required exercise_name/exercise_type, it double-encoded sets_json as a STRING (the column is
  // jsonb, and the app reads sets_json as an array), and it never checked the insert's error — so it
  // failed silently while printing "Template exercises added". Net effect: the seed could never
  // actually build this template, and an emptied Push Day A was unrepairable by re-seeding.
  const { count: exCount } = await db.from('workout_template_exercises')
    .select('id', { count: 'exact', head: true }).eq('template_id', templateId)

  if ((exCount || 0) > 0) {
    console.log(`  Template exercises exist (${exCount})`)
  } else {
    const { data: exRows } = await db.from('exercises').select('id, name').eq('coach_id', ptId)
    const exMap = Object.fromEntries((exRows || []).map(e => [e.name, e.id]))

    // Order matters for the runner tests. _isPlainStrengthExercise (app-runner.js) routes an
    // exercise to the one-set WIZARD (which owns the LOG button) when it is cardio, has any
    // timed/unilateral set, or its name matches /carry|sled|.../ — otherwise to the strength TABLE
    // (a ✓ checkbox, no LOG button). runner.spec.js needs BOTH: the first exercise must be a wizard
    // one (it clicks LOG straight away), and at least one plain-strength one must exist for the
    // table tests to jump to.
    const templateExercises = [
      {
        // Exercise 0 must render the WIZARD (it owns the LOG button — runner.spec.js clicks it
        // immediately). An empty sets_json is what routes it there: _isPlainStrengthExercise bails
        // on `!ex.sets_json?.length`, so the exercise falls to the one-set wizard.
        // Do NOT reach for a carry/sled/lunge NAME to force the wizard instead — logRunnerSet()
        // regex-matches those same names as DISTANCE-based and then demands a distance input, so a
        // weight/reps LOG silently no-ops and the rest timer never starts.
        template_id: templateId, exercise_id: exMap['Bench Press'] || null,
        exercise_name: 'Bench Press', exercise_type: 'strength', order_index: 0,
        sets_json: [],
      },
      {
        // Exercise 1 is plain strength WITH sets, so it renders the strength TABLE — the table tests
        // scan _runner.exercises for the first _isPlainStrengthExercise and jump to it.
        template_id: templateId, exercise_id: exMap['Overhead Press'] || null,
        exercise_name: 'Overhead Press', exercise_type: 'strength', order_index: 1,
        sets_json: [
          { repsMin: '10', repsMax: '10', weight: '50', restMin: '90' },
          { repsMin: '10', repsMax: '10', weight: '50', restMin: '90' },
          { repsMin: '10', repsMax: '10', weight: '50', restMin: '90' },
        ],
      },
    ]
    const { error: teErr } = await db.from('workout_template_exercises').insert(templateExercises)
    if (teErr) throw new Error('Template exercises insert failed: ' + teErr.message)
    console.log(`  Template exercises added (${templateExercises.length})`)
  }

  // ── 4. Client account ───────────────────────────────────────────────────────
  console.log('\n[4] Client account')
  const clientAuth = await signUpOrSignIn(db, CLIENT_EMAIL, CLIENT_PASSWORD, 'Test Client')
  const clientUserId = clientAuth.user.id
  await db.auth.signInWithPassword({ email: CLIENT_EMAIL, password: CLIENT_PASSWORD })
  await db.from('profiles').update({ full_name: 'Test Client', role: 'client' }).eq('id', clientUserId)
  console.log(`  Client user id: ${clientUserId}`)

  // ── 5. Client record (as PT) ────────────────────────────────────────────────
  console.log('\n[5] Client record')
  await db.auth.signInWithPassword({ email: PT_EMAIL, password: PT_PASSWORD })
  let clientId
  const { data: existingC } = await db.from('clients').select('id').eq('coach_id', ptId).eq('email', CLIENT_EMAIL).single()
  if (existingC) {
    clientId = existingC.id
    // Make sure user_id is linked
    await db.from('clients').update({ user_id: clientUserId }).eq('id', clientId)
    console.log('  Client record exists, user_id linked')
  } else {
    const { data: c } = await db.from('clients').insert({
      coach_id: ptId, user_id: clientUserId,
      full_name: 'Test Client', email: CLIENT_EMAIL,
      status: 'active', phone: '+44 7700 000001'
    }).select('id').single()
    clientId = c.id
    console.log(`  Client record created: ${clientId}`)
  }

  // ── 6. Goals ────────────────────────────────────────────────────────────────
  console.log('\n[6] Goals')
  const { data: existingGoals } = await db.from('goals').select('id').eq('client_id', clientId).limit(1)
  if (!existingGoals?.length) {
    const twoMonths = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const { data: goal } = await db.from('goals').insert({
      client_id: clientId, created_by: ptId,
      title: 'Lose 5kg', status: 'active',
      start_value: 90, current_value: 88, target_value: 85,
      metric_label: 'Weight', metric_unit: 'kg',
      target_date: twoMonths
    }).select('id').single()
    await db.from('goal_milestones').insert([
      { goal_id: goal.id, title: 'Hit 89kg', order: 1 },
      { goal_id: goal.id, title: 'Hit 87kg', order: 2 },
      { goal_id: goal.id, title: 'Hit 85kg', order: 3 },
    ])
    console.log('  Goal + 3 milestones created')
  } else {
    console.log('  Goals exist, skipping')
  }

  // ── 7. Weight logs ──────────────────────────────────────────────────────────
  console.log('\n[7] Weight logs')
  const { data: existingW } = await db.from('weight_logs').select('id').eq('client_id', clientId).limit(1)
  if (!existingW?.length) {
    const weightEntries = []
    for (let i = 12; i >= 0; i--) {
      const d = new Date(Date.now() - i * 7 * 24 * 60 * 60 * 1000)
      weightEntries.push({
        client_id: clientId,
        date: d.toISOString().split('T')[0],
        weight_kg: parseFloat((90 - (12 - i) * 0.38 + (Math.random() * 0.6 - 0.3)).toFixed(1)),
        body_fat_pct: parseFloat((22 - (12 - i) * 0.15).toFixed(1))
      })
    }
    await db.from('weight_logs').insert(weightEntries)
    console.log(`  ${weightEntries.length} weight entries inserted`)
  } else {
    console.log('  Weight logs exist, skipping')
  }

  // ── 8. Workout sessions ─────────────────────────────────────────────────────
  console.log('\n[8] Workout sessions')
  const { data: existingLogs } = await db.from('workout_logs').select('id').eq('client_id', clientId).limit(1)
  if (!existingLogs?.length) {
    for (let i = 4; i >= 0; i--) {
      const sessionDate = new Date(Date.now() - i * 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      const { data: log, error: logErr } = await db.from('workout_logs').insert({
        coach_id: ptId, client_id: clientId,
        name: 'Push Day A', date: sessionDate
      }).select('id').single()
      if (logErr) throw new Error(`workout_logs insert: ${logErr.message}`)

      const { data: logEx, error: exErr } = await db.from('workout_log_exercises').insert({
        workout_log_id: log.id, exercise_name: 'Bench Press', order_index: 0
      }).select('id').single()
      if (exErr) throw new Error(`workout_log_exercises insert: ${exErr.message}`)

      const sets = [
        { exercise_id: logEx.id, reps_achieved: 8, weight_kg: 80 + i, effort_value: 7 },
        { exercise_id: logEx.id, reps_achieved: 8, weight_kg: 80 + i, effort_value: 8 },
        { exercise_id: logEx.id, reps_achieved: 7, weight_kg: 80 + i, effort_value: 9 },
      ]
      const { error: setsErr } = await db.from('workout_log_sets').insert(sets)
      if (setsErr) throw new Error(`workout_log_sets insert: ${setsErr.message}`)
    }
    console.log('  5 sessions + sets inserted')
  } else {
    console.log('  Sessions exist, skipping')
  }

  // ── 9. Weekly check-ins ─────────────────────────────────────────────────────
  console.log('\n[9] Check-ins')
  const { data: existingCI } = await db.from('client_check_ins').select('id').eq('client_id', clientId).limit(1)
  if (!existingCI?.length) {
    const checkIns = []
    for (let i = 3; i >= 0; i--) {
      checkIns.push({
        client_id: clientId,
        sleep: Math.floor(Math.random() * 2) + 3,
        energy: Math.floor(Math.random() * 2) + 3,
        stress: Math.floor(Math.random() * 2) + 2,
        soreness: Math.floor(Math.random() * 2) + 2,
        notes: i === 0 ? 'Feeling good this week, sleep improving' : null
      })
    }
    // These are inserted while signed in as the PT, but client_check_ins is CLIENT-scoped by design
    // (only the client submits their own check-in — saveClientCheckIn is called solely from the
    // client's own dashboard). So this insert is REFUSED by RLS. It has been failing silently on
    // every run since the error was never checked, while still printing "N check-ins inserted".
    // Same swallowed-error bug as the template-exercises insert fixed 2026-07-11 — surfaced by the
    // RLS audit, 2026-07-12. Report it honestly rather than lying about success.
    const { error: ciErr } = await db.from('client_check_ins').insert(checkIns)
    if (ciErr) console.log(`  ⚠️  check-ins NOT inserted — RLS refuses the coach (this is correct: only the client may submit their own). ${ciErr.message}`)
    else console.log(`  ${checkIns.length} check-ins inserted`)
  } else {
    console.log('  Check-ins exist, skipping')
  }

  // ── 10. SECOND COACH (RLS audit) ────────────────────────────────────────────
  // A completely unrelated coach, in the same database. This is the tenant boundary that actually
  // matters at beta — strangers sharing one Postgres — and until 2026-07-12 it had never been
  // tested, because no second coach account existed. Deliberately seeded with NO data: the RLS
  // harness creates and destroys its own fixtures so it never depends on shared rows.
  console.log('\n[10] Second coach (for the RLS audit — cross-tenant isolation)')
  const pt2Auth = await signUpOrSignIn(db, PT2_EMAIL, PT2_PASSWORD, 'Test Coach Two')
  const pt2Id = pt2Auth.user.id
  await db.auth.signInWithPassword({ email: PT2_EMAIL, password: PT2_PASSWORD })
  const { error: p2Err } = await db.from('profiles').update({ full_name: 'Test Coach Two', role: 'coach' }).eq('id', pt2Id)
  if (p2Err) throw new Error('PT2 profile update failed: ' + p2Err.message)
  console.log(`  PT2 user id: ${pt2Id}`)

  // ── Done ────────────────────────────────────────────────────────────────────
  console.log('\n✓ Seed complete. Add these to .env:\n')
  console.log(`PT_EMAIL=${PT_EMAIL}`)
  console.log(`PT_PASSWORD=${PT_PASSWORD}`)
  console.log(`CLIENT_EMAIL=${CLIENT_EMAIL}`)
  console.log(`CLIENT_PASSWORD=${CLIENT_PASSWORD}`)
  console.log(`PT2_EMAIL=${PT2_EMAIL}`)
  console.log(`PT2_PASSWORD=${PT2_PASSWORD}`)
  console.log()
  process.exit(0)
}

run().catch(err => { console.error('\nSeed failed:', err.message); process.exit(1) })
