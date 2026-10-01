// Verifies scripts/add-assign-program-rpc-2026-09-27.sql on a real Postgres engine (PGlite) loaded with the live schema, the
// live policies of every table the function touches (live-schema.mjs + live-schema-programs.mjs), and the triggers that change
// rows. Runs the script TWICE (idempotency), then checks: what an assign and a restart produce, column for column against the
// JS it replaces; who is refused (another coach, a client, no identity, anon); and the reason it exists — a failure part-way
// through a RESTART leaves the client's current plan exactly as it was.
// Set MUTATE=m1..mN to apply one of the deliberate breakages in assign-program.mutations.mjs — run-mutations.mjs requires each
// to make this FAIL.
//
//   node scripts/sql-verify/assign-program.verify.mjs        # exit 0 = every check passed
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { installLiveSchema } from './live-schema.mjs'
import { installProgramLifecycleSchema } from './live-schema-programs.mjs'
import { startHarness, applyMutation } from './harness.mjs'
import { MUTATIONS } from './assign-program.mutations.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
let SCRIPT = fs.readFileSync(path.join(here, '..', 'add-assign-program-rpc-2026-09-27.sql'), 'utf8').replace(/\r\n/g, '\n')
if (process.env.MUTATE) {
  const m = MUTATIONS[process.env.MUTATE]
  if (!m) { console.log('unknown mutation', process.env.MUTATE); process.exit(2) }
  SCRIPT = applyMutation(SCRIPT, m.pairs)
  console.log('MUTATION', process.env.MUTATE, 'applied:', m.why)
}

const { db, ok, rowsOf, as, done } = await startHarness()
console.log('engine:', (await rowsOf('select version()'))[0].version.slice(0, 40))
await installLiveSchema(db)
await installProgramLifecycleSchema(db)

// ── a scenario ────────────────────────────────────────────────────────────────────────────────────────────────
const A = 'a0000000-0000-4000-8000-000000000001', B = 'b0000000-0000-4000-8000-000000000002'   // two coaches
const UC = 'c0000000-0000-4000-8000-0000000000c1', US = 'c0000000-0000-4000-8000-0000000000c2' // a client, a solo user
const CL = '10000000-0000-4000-8000-000000000001', SO = '10000000-0000-4000-8000-000000000002'
const OTH = '10000000-0000-4000-8000-000000000005', MAS = '10000000-0000-4000-8000-000000000006'
const PA = '20000000-0000-4000-8000-0000000000a1', PB = '20000000-0000-4000-8000-0000000000b1'
const PS = '20000000-0000-4000-8000-0000000000c1', PE = '20000000-0000-4000-8000-0000000000e1'
const PX = '20000000-0000-4000-8000-0000000000f1', PY = '20000000-0000-4000-8000-0000000000f2'
const PH1 = '30000000-0000-4000-8000-000000000001', PH2 = '30000000-0000-4000-8000-000000000002'
const PHS = '30000000-0000-4000-8000-000000000003', PHB = '30000000-0000-4000-8000-000000000004'
const PHX = '30000000-0000-4000-8000-000000000005', PHY = '30000000-0000-4000-8000-000000000006'
const TA1 = '40000000-0000-4000-8000-000000000001', TA2 = '40000000-0000-4000-8000-000000000002'
const TS = '40000000-0000-4000-8000-000000000003', TB = '40000000-0000-4000-8000-000000000004'
const TX = '40000000-0000-4000-8000-000000000005'
const FAM = '50000000-0000-4000-8000-000000000001'

// A real RPE top set and the backoff that targets a percentage of TODAY'S top set — not a toy value. This is what a
// coach's workout looks like since the RPE work, and assignment must carry every one of these fields to the client's
// copy: the runner reads sets_json[0].isTopSet and intensityBasis, and a copy that dropped them would hand the client a
// workout whose backoff sets silently target a stored 1RM they may not have. (assign_program copies e.sets_json
// verbatim; this pins that.)
const TOPSET_SETS = [
  { repsMin: '3', effortType: 'rpe', effortMin: '8', isTopSet: true, intensityBasis: 'stored' },
  { repsMin: '8', intensityMin: '70', intensityBasis: 'topSet', isTopSet: false }
]
const TOPSET_JSON = JSON.stringify(TOPSET_SETS)
// jsonb stores keys in its own order, so compare with keys sorted, never as raw strings.
const canon = v => JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a < b ? -1 : 1)) : x)

await db.exec(`
  insert into public.clients (id, coach_id, user_id, full_name) values
    ('${CL}', '${A}', '${UC}', 'Client of coach A'), ('${SO}', null, '${US}', 'Solo user'),
    ('${OTH}', '${B}', null, 'Client of coach B'), ('${MAS}', '${A}', '${A}', 'Coach A as their own client');
  insert into public.programs (id, coach_id, name) values
    ('${PA}', '${A}', 'Strength A'), ('${PB}', '${B}', 'Coach B programme'), ('${PS}', '${US}', 'Solo programme'),
    ('${PE}', '${A}', 'Empty programme'), ('${PX}', '${A}', 'Programme X'), ('${PY}', '${A}', 'Programme Y');
  insert into public.program_phases (id, program_id, name, duration_weeks, order_index) values
    ('${PH1}', '${PA}', 'Base', 2, 0), ('${PH2}', '${PA}', 'Peak', 0, 1), ('${PHS}', '${PS}', 'Solo phase', 3, 0),
    ('${PHB}', '${PB}', 'B phase', 4, 0), ('${PHX}', '${PX}', 'X phase', 1, 0), ('${PHY}', '${PY}', 'Y phase', 1, 0);
  insert into public.workout_templates (id, coach_id, name, description, is_personal, family_id) values
    ('${TA1}', '${A}', 'Upper', 'Push day', false, '${FAM}'), ('${TA2}', '${A}', 'Lower', '', true, null),
    ('${TS}', '${US}', 'Solo session', null, false, null), ('${TB}', '${B}', 'B session', null, false, null),
    ('${TX}', '${A}', 'X session', null, false, null);
  insert into public.workout_template_exercises (template_id, exercise_name, exercise_type, metric_type, order_index, sets, sets_json, notes, superset_group, reps, one_rm_kg) values
    ('${TA1}', 'Bench', 'strength', 'weight_reps', 0, 3, '${TOPSET_JSON}', 'pause at the bottom', 'A', 5, 100),
    ('${TA1}', 'Plank', 'strength', 'timed_hold', 1, 0, null, '', '', null, null),
    ('${TA2}', 'Squat', 'strength', 'weight_reps', 0, 5, null, null, null, null, null),
    ('${TS}', 'Row', 'cardio', 'cardio', 0, 1, null, null, null, null, null),
    ('${TX}', 'Deadlift', 'strength', 'weight_reps', 0, 3, null, null, null, null, null);
  insert into public.program_phase_workouts (id, phase_id, template_id, day_label, week_number, session_order) values
    ('60000000-0000-4000-8000-000000000001', '${PH1}', '${TA1}', 'Mon', 1, 1),
    ('60000000-0000-4000-8000-000000000002', '${PH1}', '${TA2}', 'Wed', 2, 1),
    ('60000000-0000-4000-8000-000000000003', '${PH1}', null,     'Fri', 1, 2),
    ('60000000-0000-4000-8000-000000000004', '${PH2}', '${TA1}', 'Mon', 1, 1),
    ('60000000-0000-4000-8000-000000000005', '${PHS}', '${TS}',  'Mon', 1, 1),
    ('60000000-0000-4000-8000-000000000006', '${PHB}', '${TB}',  'Mon', 1, 1),
    ('60000000-0000-4000-8000-000000000007', '${PHX}', '${TX}',  'Mon', 1, 1),
    ('60000000-0000-4000-8000-000000000008', '${PHY}', '${TB}',  'Mon', 1, 1);
`)
const call = (client, program, start, restart) =>
  `select public.assign_program('${client}', '${program}', ${start ? `'${start}'` : 'null'}, ${restart ? 'true' : 'false'}) as r`
const count = async (sql) => Number((await rowsOf(sql))[0].n)
const snapshot = async () => ({
  cp: await count('select count(*) as n from public.client_programs'),
  cpw: await count('select count(*) as n from public.client_program_workouts'),
  tmpl: await count('select count(*) as n from public.workout_templates'),
  wte: await count('select count(*) as n from public.workout_template_exercises'),
  blocks: await count('select count(*) as n from public.client_program_blocks'),
})
const same = (x, y) => JSON.stringify(x) === JSON.stringify(y)

// ── 1. run the migration — twice, to prove it is idempotent ────────────────────────────────────────────────────────
try { await db.exec(SCRIPT); await db.exec(SCRIPT); ok(true, 'the script runs twice without error (idempotent)') }
catch (e) { ok(false, 'the script runs twice without error (idempotent)', String(e.message)); done() }
const readBack = await rowsOf(SCRIPT.slice(SCRIPT.indexOf('-- READ-BACK')))
const fn = readBack.find(x => x.kind === 'function')
ok(fn && /security_definer=false/.test(fn.detail) && /search_path=public, pg_temp/.test(fn.detail),
  'read-back: runs with the CALLER\'s rights (not security definer), fixed search_path', fn)
ok(readBack.find(x => x.kind === 'execute' && x.name === 'authenticated')?.detail === 'true', 'read-back: authenticated may execute it')
ok(readBack.find(x => x.kind === 'execute' && x.name === 'anon')?.detail === 'false', 'read-back: anon may NOT execute it')
const fks = readBack.filter(x => x.kind === 'fk-into-workout_templates')
ok(fks.length >= 4 && fks.every(x => /CASCADE|SET NULL/.test(x.detail)),
  'read-back: lists every foreign key into workout_templates with its delete rule (locally all cascade / set null)', fks)

// ── 2. a coach assigns a programme to their client ─────────────────────────────────────────────────────────────
let r = await as('authenticated', A, call(CL, PA, '2026-10-01', false))
const res1 = r.rows?.[0]?.r
ok(!r.error && res1?.sessions === 3 && res1?.phases === 2 && res1?.restarted === false,
  'assign: 3 sessions copied (the empty slot skipped, the repeated workout copied once per slot), 2 phases, not a restart', r)
const cp1 = res1?.client_program_id
const cp1Row = (await rowsOf(`select client_id, program_id, start_date::text as sd, status from public.client_programs where id = '${cp1}'`))[0]
ok(cp1Row?.client_id === CL && cp1Row?.program_id === PA && cp1Row?.sd === '2026-10-01' && cp1Row?.status === 'active', 'assign: the assignment row is right', cp1Row)
const cpws = await rowsOf(`select cpw.week_number, pw.day_label, t.client_id, t.coach_id, t.program_id, t.name, t.description, t.is_personal, t.family_id, t.id as tid
  from public.client_program_workouts cpw join public.program_phase_workouts pw on pw.id = cpw.program_phase_workout_id
  join public.workout_templates t on t.id = cpw.workout_template_id where cpw.client_program_id = '${cp1}' order by pw.id`)
ok(cpws.length === 3 && cpws.every(c => c.client_id === CL && c.coach_id === A && c.program_id === null),
  'assign: every copy belongs to the client, is owned by the coach, and is not tied to the programme (program_id null)', cpws)
ok(same(cpws.map(c => c.week_number), [1, 2, 1]), 'assign: each session keeps its week number', cpws.map(c => c.week_number))
ok(cpws[0].family_id === FAM, 'assign: a copy inherits the source workout\'s family (so propagation can find it)', cpws[0])
ok(cpws[1].family_id !== null && cpws[1].description === null && cpws[1].is_personal === true,
  'assign: an empty description becomes null, is_personal is carried, and a source with no family still gets one', cpws[1])
ok(new Set(cpws.map(c => c.tid)).size === 3 && !cpws.some(c => [TA1, TA2].includes(c.tid)), 'assign: three distinct NEW workouts, never the masters themselves')
const ex = await rowsOf(`select exercise_name, metric_type, sets, sets_json, notes, superset_group, reps, one_rm_kg, order_index from public.workout_template_exercises
  where template_id = '${cpws[0].tid}' order by order_index`)
ok(ex.length === 2 && ex[0].exercise_name === 'Bench' && ex[0].sets === 3 && ex[0].notes === 'pause at the bottom' && ex[0].superset_group === 'A'
  && canon(ex[0].sets_json) === canon(TOPSET_SETS) && ex[1].metric_type === 'timed_hold',
  'assign: exercises are copied with their sets, targets, notes, superset and metric type', ex)
ok(ex[1].sets === null && ex[1].notes === null && ex[1].superset_group === null, 'assign: 0 sets and empty notes/superset become null, as the JS did', ex[1])
ok(ex[0].reps === null && ex[0].one_rm_kg === null, 'assign: legacy reps / one_rm_kg are NOT copied, as the JS did not', ex[0])

// ── 3. a second assign without restart is refused and changes nothing ───────────────────────────────────────────
let before = await snapshot()
r = await as('authenticated', A, call(CL, PA, '2026-11-01', false))
ok(!!r.error && /already assigned/.test(r.error), 'a second assign of the same programme is refused unless it is a restart', r)
ok(same(before, await snapshot()), '...and nothing was written')

// ── 4. restart: archive, remove, sweep (sparing a logged copy and a master), re-copy ───────────────────────────
const loggedClone = cpws[0].tid
await db.exec(`insert into public.workout_logs (coach_id, client_id, template_id, name) values ('${A}', '${CL}', '${loggedClone}', 'Upper')`)
// an assignment row pointing at a MASTER must never get the master deleted by the sweep
await db.exec(`insert into public.client_program_workouts (client_program_id, program_phase_workout_id, workout_template_id, week_number)
  values ('${cp1}', '60000000-0000-4000-8000-000000000003', '${TA2}', 1)`)
r = await as('authenticated', A, call(CL, PA, '2026-11-01', true))
const res2 = r.rows?.[0]?.r
ok(!r.error && res2?.restarted === true && res2?.sessions === 3, 'restart: succeeds and re-copies every session', r)
ok(await count(`select count(*) as n from public.client_programs where id = '${cp1}'`) === 0, 'restart: the old assignment is gone')
ok(await count(`select count(*) as n from public.client_programs where client_id = '${CL}' and program_id = '${PA}'`) === 1, 'restart: exactly one assignment remains (the new one)')
const block = (await rowsOf(`select program_id, program_name, start_date::text as sd, planned_weeks, ended_reason, source_client_program_id, ended_at = current_date as today from public.client_program_blocks`))
ok(block.length === 1 && block[0].program_id === PA && block[0].program_name === 'Strength A' && block[0].sd === '2026-10-01'
  && block[0].planned_weeks === 3 && block[0].ended_reason === 'restarted' && block[0].source_client_program_id === cp1 && block[0].today,
  'restart: the old block is archived first (name, old start date, planned weeks 2 + a zero-week phase counted as 1, reason, source)', block)
ok(await count(`select count(*) as n from public.workout_templates where id = '${loggedClone}'`) === 1, 'restart: a copy someone trained from is kept (history keeps its link)')
ok(await count(`select count(*) as n from public.workout_templates where id in ('${cpws[1].tid}', '${cpws[2].tid}')`) === 0, 'restart: the old copies nobody trained from are removed')
ok(await count(`select count(*) as n from public.workout_templates where id in ('${TA1}', '${TA2}')`) === 2, 'restart: the masters are never removed, even when an assignment pointed at one')

// ── 5. THE POINT: a failure part-way through a restart leaves the current plan exactly as it was ───────────────
r = await as('authenticated', A, call(CL, PX, '2026-10-01', false))
const cpX = r.rows?.[0]?.r?.client_program_id
ok(!r.error && r.rows[0].r.sessions === 1, 'setup: programme X assigned (1 session)', r)
await db.exec(`update public.program_phase_workouts set template_id = '${TB}' where id = '60000000-0000-4000-8000-000000000007'`)  // now unreadable to A
before = await snapshot()
r = await as('authenticated', A, call(CL, PX, '2026-12-01', true))
ok(!!r.error && /could not be read/.test(r.error), 'a restart whose copy step fails is refused', r)
ok(same(before, await snapshot()), '...and NOTHING changed: no archive row, no deletion, no new assignment, no stray copies', { before, after: await snapshot() })
ok(await count(`select count(*) as n from public.client_programs where id = '${cpX}'`) === 1
  && await count(`select count(*) as n from public.client_program_workouts where client_program_id = '${cpX}'`) === 1,
  '...so the client still has the plan they had, with its session')
before = await snapshot()
r = await as('authenticated', A, call(CL, PY, null, false))
ok(!!r.error && /could not be read/.test(r.error) && same(before, await snapshot()), 'a fresh assign whose copy step fails leaves no assignment and no copies behind', r)

// ── 6. who is refused ──────────────────────────────────────────────────────────────────────────────────────────
before = await snapshot()
r = await as('authenticated', B, call(CL, PB, null, false))
ok(!!r.error && /client is not yours/.test(r.error), 'another coach cannot assign to my client (even their own programme)', r)
r = await as('authenticated', A, call(CL, PB, null, false))
ok(!!r.error && /programme is not yours/.test(r.error), 'a coach cannot assign another coach\'s programme', r)
r = await as('authenticated', A, call(OTH, PA, null, false))
ok(!!r.error && /client is not yours/.test(r.error), 'a coach cannot assign to another coach\'s client', r)
r = await as('authenticated', UC, call(CL, PA, null, true))
ok(!!r.error && /programme is not yours/.test(r.error), 'a client cannot (re)assign a programme to themselves', r)
// A client-role user passes the clients check through its user_id branch (it mirrors _verifyClientAccess), and CAN own a
// programme (the programs ALL policy lets anyone insert coach_id = themselves). Row-level security must still refuse the
// assignment itself, and the transaction must leave nothing behind — no archive row in particular (review, 2026-09-27).
await db.exec(`insert into public.programs (id, coach_id, name) values ('20000000-0000-4000-8000-0000000000d1', '${UC}', 'Client-owned programme')`)
for (const restart of [false, true]) {
  r = await as('authenticated', UC, call(CL, '20000000-0000-4000-8000-0000000000d1', null, restart))
  ok(!!r.error && /row-level security/.test(r.error), `a client assigning a programme they own to their own row is refused by RLS (restart=${restart})`, r)
}
ok(same(before, await snapshot()), '...and none of the refusals above wrote anything')
// The "old assignment already gone" branch (two tabs restarting at once) cannot be raced here, so reach the same code
// path directly: an assignment the caller can SEE but not DELETE. It must fail with 40001, not the misleading 42501, and
// its archive row must roll back with it.
await db.exec(`insert into public.client_programs (client_id, program_id) values ('${CL}', '20000000-0000-4000-8000-0000000000d1')`)
before = await snapshot()
r = await as('authenticated', UC, call(CL, '20000000-0000-4000-8000-0000000000d1', null, true))
ok(!!r.error && /changed by something else/.test(r.error), 'a restart that cannot remove the old assignment fails as "changed elsewhere" (40001), not "permission denied"', r)
ok(same(before, await snapshot()), '...and its archive row rolled back with it')
await db.exec(`delete from public.client_programs where program_id = '20000000-0000-4000-8000-0000000000d1'`)
before = await snapshot()
r = await as('authenticated', '', call(CL, PA, null, false))
ok(!!r.error && /not signed in/.test(r.error), 'no identity is refused', r)
r = await as('anon', '', call(CL, PA, null, false))
ok(!!r.error && /permission denied/.test(r.error), 'anon cannot even call it', r)
ok(same(before, await snapshot()), '...and none of those refusals wrote anything')

// ── 7. what must still work ────────────────────────────────────────────────────────────────────────────────────
r = await as('authenticated', US, call(SO, PS, '2026-10-01', false))
const resS = r.rows?.[0]?.r
ok(!r.error && resS?.sessions === 1, 'a solo user can add their own programme to their own plan', r)
ok(await count(`select count(*) as n from public.workout_templates where client_id = '${SO}' and coach_id = '${US}'`) === 1, '...and the copy is theirs')
r = await as('authenticated', US, call(SO, PS, '2026-11-01', true))
ok(!r.error && r.rows[0].r.restarted === true && await count(`select count(*) as n from public.client_program_blocks where client_id = '${SO}'`) === 1,
  'a solo user can restart their own programme (the only restart route solo has)', r)
r = await as('authenticated', A, call(MAS, PA, null, false))
ok(!r.error && r.rows[0].r.sessions === 3, 'the owner can assign to their own master client record', r)
r = await as('authenticated', A, call(CL, PE, null, false))
ok(!r.error && r.rows[0].r.phases === 0 && r.rows[0].r.sessions === 0, 'an empty programme assigns with phases = 0 (the app warns "nothing to do yet")', r)

// ── 8. the documented rollback works ───────────────────────────────────────────────────────────────────────────
const drop = SCRIPT.match(/drop function public\.assign_program\([^)]*\);/)
let rollbackOk = !!drop
if (drop) { try { await db.exec(drop[0]) } catch (e) { rollbackOk = false; console.log('  rollback error:', String(e.message)) } }
ok(rollbackOk && await count(`select count(*) as n from pg_proc where proname = 'assign_program'`) === 0, 'the documented rollback runs as written and removes the function')

done()
