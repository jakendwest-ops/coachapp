const { createClient } = require('@supabase/supabase-js')

const db = createClient(
  'https://avilxuiacmtgeoxxhfhc.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || '',
  { auth: { persistSession: false } }
)

const COACH_ID = 'c930ce7f-3ffd-4b1e-9d7b-2bcb226f4954'

async function run() {
  // 1. Find duplicate templates (same name, same coach, created today)
  const { data: tpls } = await db.from('workout_templates')
    .select('id, name, created_at')
    .eq('coach_id', COACH_ID)
    .order('name').order('created_at')

  // Group by name
  const byName = {}
  tpls.forEach(t => { byName[t.name] = byName[t.name] || []; byName[t.name].push(t) })

  let deletedCount = 0
  for (const [name, rows] of Object.entries(byName)) {
    if (rows.length > 1) {
      // Keep the first (oldest), delete the rest
      const toDelete = rows.slice(1).map(r => r.id)
      console.log(`Duplicate "${name}": keeping ${rows[0].id}, deleting ${toDelete.join(', ')}`)
      for (const id of toDelete) {
        // Delete exercises first (FK constraint)
        await db.from('workout_template_exercises').delete().eq('template_id', id)
        // Remove from phase_workouts
        await db.from('program_phase_workouts').delete().eq('template_id', id)
        const { error } = await db.from('workout_templates').delete().eq('id', id)
        if (error) console.error('Delete error:', error.message)
        else deletedCount++
      }
    }
  }
  console.log(`Deleted ${deletedCount} duplicate templates`)

  // 2. Also delete the duplicate program (Hyrox Experiment if there are 2)
  const { data: programs } = await db.from('programs')
    .select('id, name, created_at')
    .eq('coach_id', COACH_ID)
    .eq('name', 'Hyrox Experiment')
    .order('created_at')

  if (programs.length > 1) {
    const toDelete = programs.slice(1)
    for (const p of toDelete) {
      console.log('Deleting duplicate program:', p.id)
      // Get phases
      const { data: phases } = await db.from('program_phases').select('id').eq('program_id', p.id)
      for (const ph of phases || []) {
        await db.from('program_phase_workouts').delete().eq('phase_id', ph.id)
        await db.from('program_phases').delete().eq('id', ph.id)
      }
      // Remove client_programs
      await db.from('client_programs').delete().eq('program_id', p.id)
      await db.from('programs').delete().eq('id', p.id)
    }
    console.log('Duplicate programs cleaned')
  }

  // 3. Fix session_order on all phase_workouts — order by id within each day
  const { data: pws } = await db.from('program_phase_workouts')
    .select('id, day_of_week, phase_id, workout_templates(name)')
    .order('day_of_week').order('id')

  // Group by phase+day
  const byPhaseDay = {}
  pws.forEach(pw => {
    const key = `${pw.phase_id}_${pw.day_of_week}`
    byPhaseDay[key] = byPhaseDay[key] || []
    byPhaseDay[key].push(pw)
  })

  for (const rows of Object.values(byPhaseDay)) {
    for (let i = 0; i < rows.length; i++) {
      const order = i + 1
      const { error } = await db.from('program_phase_workouts').update({ session_order: order }).eq('id', rows[i].id)
      if (error) console.error('Update error:', error.message)
      else console.log(`Day ${rows[i].day_of_week} session_order=${order}: ${rows[i].workout_templates?.name}`)
    }
  }

  console.log('✅ Done')
}

run().catch(e => { console.error('❌', e.message); process.exit(1) })
