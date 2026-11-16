// Verifies scripts/add-event-workout-link-2026-11-16.sql on PGlite loaded with the live policies of clients, workout_templates and events. It
// first shows the column does not exist yet, runs the script TWICE (idempotency), then checks who may link a workout to a day, who is refused
// (by the GUARD - its message is matched, so row-level security is not what is being measured), the cascade, and the documented rollback.
// Set MUTATE=m1..mN to apply one of the deliberate breakages in event-workout-link.mutations.mjs; run-mutations.mjs requires each to FAIL.
//
//   node scripts/sql-verify/event-workout-link.verify.mjs     # exit 0 = every check passed
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { installLiveSchema } from './live-schema.mjs'
import { installProgramLifecycleSchema } from './live-schema-programs.mjs'
import { installEventsSchema } from './live-schema-events.mjs'
import { startHarness, applyMutation } from './harness.mjs'
import { MUTATIONS } from './event-workout-link.mutations.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
let SCRIPT = fs.readFileSync(path.join(here, '..', 'add-event-workout-link-2026-11-16.sql'), 'utf8').replace(/\r\n/g, '\n')
if (process.env.MUTATE) {
  const m = MUTATIONS[process.env.MUTATE]
  if (!m) { console.log('unknown mutation', process.env.MUTATE); process.exit(2) }
  SCRIPT = applyMutation(SCRIPT, m.pairs)
  console.log('MUTATION', process.env.MUTATE, 'applied:', m.why)
}

const { db, ok, rowsOf, as, done } = await startHarness()
await installLiveSchema(db)
await installProgramLifecycleSchema(db)
await installEventsSchema(db)

// A = a coach who also trains in Personal view (the master account); B = another coach; US = a solo user; UC = A's coached client.
const A = 'a0000000-0000-4000-8000-000000000001', B = 'b0000000-0000-4000-8000-000000000002'
const US = 'c0000000-0000-4000-8000-0000000000c2', UC = 'c0000000-0000-4000-8000-0000000000c1'
const SOA = '10000000-0000-4000-8000-000000000003', SO = '10000000-0000-4000-8000-000000000004', CL = '10000000-0000-4000-8000-000000000001', SOB = '10000000-0000-4000-8000-000000000006'
const T_A = '30000000-0000-4000-8000-000000000001', T_B = '30000000-0000-4000-8000-000000000002', T_ACL = '30000000-0000-4000-8000-000000000003'
const T_US = '30000000-0000-4000-8000-000000000004', T_A2 = '30000000-0000-4000-8000-000000000005', T_UC = '30000000-0000-4000-8000-000000000006'
const T_PLAN = '30000000-0000-4000-8000-000000000007', T_COACH = '30000000-0000-4000-8000-000000000008', PRG = '50000000-0000-4000-8000-000000000001'
const PH = '60000000-0000-4000-8000-000000000001', T_GEN = '30000000-0000-4000-8000-000000000009'
await db.exec(`
  insert into public.clients (id, coach_id, user_id, full_name, status) values
    ('${SOA}', null, '${A}', 'Coach A, personal record', 'active'),
    ('${SOB}', null, '${B}', 'Coach B, personal record', 'active'),
    ('${SO}',  null, '${US}', 'Solo user', 'active'),
    ('${CL}',  '${A}', '${UC}', 'Client of coach A', 'active');
  insert into public.programs (id, coach_id, name, is_personal) values ('${PRG}', '${A}', 'A plan', true);
  insert into public.workout_templates (id, coach_id, client_id, name, is_personal, program_id) values
    ('${T_A}', '${A}', null, 'A library workout', true, null), ('${T_A2}', '${A}', null, 'A second library workout', true, null),
    ('${T_B}', '${B}', null, 'B library workout', true, null), ('${T_ACL}', '${A}', '${CL}', 'A copy made for the client', true, null),
    ('${T_US}', '${US}', null, 'solo library workout', true, null), ('${T_PLAN}', '${A}', null, 'a session of the plan', true, '${PRG}'),
    ('${T_COACH}', '${A}', null, 'a coach-view library workout', false, null);
  insert into public.program_phases (id, program_id, name) values ('${PH}', '${PRG}', 'Block 1');
  insert into public.workout_templates (id, coach_id, client_id, name, is_personal, generated_from_phase_id) values ('${T_GEN}', '${A}', null, 'a generated phase workout', true, '${PH}');
`)
const ev = (client, by, tid, title, pt = false) => `insert into public.events (client_id, created_by, title, type, is_pt_assigned, template_id) values (${client ? `'${client}'` : 'null'}, '${by}', '${title}', 'session', ${pt}, ${tid ? `'${tid}'` : 'null'})`
const has = async (title) => Number((await rowsOf(`select count(*)::int n from public.events where title = '${title}'`))[0].n) > 0
const guarded = (r) => !!r.error && /You can only schedule your own workouts on your own calendar/.test(r.error)

// ── 1. CONTROL: before the script there is no template_id column ─────────────────────────────────────────────
let r = await as('authenticated', A, ev(SOA, A, T_A, 'before'))
ok(!!r.error && /template_id/.test(r.error), 'CONTROL (before the script): events has no template_id column', r)

// ── 2. run twice ──────────────────────────────────────────────────────────────────────────────────────────────
try { await db.exec(SCRIPT); await db.exec(SCRIPT); ok(true, 'the script runs twice without error (idempotent)') }
catch (e) { ok(false, 'the script runs twice without error (idempotent)', String(e.message)); await new Promise(res => setTimeout(res, 500)); done() }

const readBack = await rowsOf(SCRIPT.slice(SCRIPT.indexOf('-- READ-BACK')))
const kind = (k) => readBack.filter(x => x.kind === k)
ok(kind('column').length === 1 && /uuid \| nullable=YES/.test(kind('column')[0].detail), 'read-back: events.template_id, uuid, nullable', kind('column'))
ok(kind('fkey').length === 1 && /on delete cascade/.test(kind('fkey')[0].detail), 'read-back: the link to workout_templates is ON DELETE CASCADE', kind('fkey'))
ok(kind('index').length === 1 && /WHERE \(template_id IS NOT NULL\)/.test(kind('index')[0].detail), 'read-back: a partial index on template_id', kind('index'))
ok(kind('function').length === 1 && /security_definer=false/.test(kind('function')[0].detail) && /search_path=public, pg_temp/.test(kind('function')[0].detail), 'read-back: the guard has invoker rights and a fixed search_path', kind('function'))
ok(kind('trigger').length === 1 && /BEFORE INSERT OR UPDATE OF template_id, client_id, created_by ON public\.events FOR EACH ROW/.test(kind('trigger')[0].detail), 'read-back: one BEFORE INSERT OR UPDATE OF template_id, client_id, created_by row trigger', kind('trigger'))
ok((await rowsOf(`select has_function_privilege('anon', 'public.guard_event_template()', 'execute') as x`))[0].x === false, 'the guard function is not executable by anon')

// ── 3. what the feature needs keeps working ─────────────────────────────────────────────────────────────────────
r = await as('authenticated', A, ev(SOA, A, T_A, 'master schedules own'))
ok(!r.error && await has('master schedules own'), 'the master account schedules its own library workout on its own personal record', r)
r = await as('authenticated', US, ev(SO, US, T_US, 'solo schedules own'))
ok(!r.error && await has('solo schedules own'), 'a solo user schedules their own library workout on their own record', r)
r = await as('authenticated', A, ev(SOA, A, null, 'plain event'))
ok(!r.error && await has('plain event'), 'an ordinary event (no workout) is unaffected', r)
r = await as('authenticated', A, ev(CL, A, null, 'coach event for client', true))
ok(!r.error && await has('coach event for client'), 'a coach still adds an ordinary event for their client', r)
r = await as('authenticated', A, `update public.events set title = 'renamed' where title = 'master schedules own'`)
ok(!r.error && await has('renamed'), 'editing a scheduled workout\'s other fields is not a new link', r)
r = await as('authenticated', A, `update public.events set template_id = '${T_A2}' where title = 'renamed'`)
ok(!r.error && Number((await rowsOf(`select count(*)::int n from public.events where template_id = '${T_A2}'`))[0].n) === 1, 'swapping to another of your own workouts is allowed', r)
r = await as('authenticated', A, `delete from public.events where title = 'renamed' returning id`)
ok(!r.error && r.rows.length === 1, 'the owner can remove a scheduled workout from the day (the existing delete policy)', r)

// ── 4. what is refused, by the guard ────────────────────────────────────────────────────────────────────────────
r = await as('authenticated', A, ev(SOA, A, T_B, 'other coach workout'))
ok(guarded(r) && !await has('other coach workout'), 'a user cannot schedule ANOTHER user\'s workout on their own day', r)
r = await as('authenticated', A, ev(SOA, A, T_ACL, 'client copy'))
ok(guarded(r) && !await has('client copy'), 'nor a copy made for one of their clients (a client\'s workout is not a library workout)', r)
r = await as('authenticated', A, ev(CL, A, T_A, 'onto client', true))
ok(guarded(r) && !await has('onto client'), 'a coach cannot schedule a workout on a CLIENT\'s record (out of scope for this version)', r)
r = await as('authenticated', UC, ev(CL, UC, T_A, 'client links coach workout'))
ok(guarded(r) && !await has('client links coach workout'), 'a coached client cannot link their coach\'s library workout (they can read it, but do not own it)', r)
r = await as('authenticated', US, ev(SO, US, T_A, 'solo links coach A'))
ok(guarded(r) && !await has('solo links coach A'), 'a solo user cannot link someone else\'s workout', r)
r = await as('authenticated', UC, `insert into public.workout_templates (id, coach_id, client_id, name, is_personal) values ('${T_UC}', '${UC}', null, 'a workout the client made', true)`)
ok(!r.error, '(setup: a coached client owns a workout of their own)', r)
r = await as('authenticated', UC, ev(CL, UC, T_UC, 'client schedules own on coached record'))
ok(guarded(r) && !await has('client schedules own on coached record'), 'a coached client cannot schedule even their OWN workout on their coached record (Personal records only)', r)
r = await as('authenticated', A, ev(SOA, A, T_PLAN, 'plan session'))
ok(guarded(r) && !await has('plan session'), 'a session of your own PLAN is not a library workout (it already has its day)', r)
r = await as('authenticated', A, ev(SOA, A, T_GEN, 'generated workout'))
ok(guarded(r) && !await has('generated workout'), 'nor a workout generated for a plan phase', r)
r = await as('authenticated', A, ev(SOA, A, T_COACH, 'coach-view workout'))
ok(guarded(r) && !await has('coach-view workout'), 'nor a coach-view workout (is_personal false): Personal view schedules its own library only', r)
r = await as('authenticated', A, ev(SOA, B, T_A, 'filed under B'))
ok(guarded(r) && !await has('filed under B'), 'a scheduled day cannot be filed under someone else (created_by must be the caller)', r)
let seeded = true
try { await db.exec(ev(SOA, A, T_A, 'seeded')) } catch (e) { seeded = false; console.log('  seed error:', String(e.message)) }
ok(seeded, '(setup: the SQL editor seeds a scheduled day)')
r = await as('authenticated', A, `update public.events set template_id = '${T_B}' where title = 'seeded'`)
ok(guarded(r) && Number((await rowsOf(`select count(*)::int n from public.events where title = 'seeded' and template_id = '${T_A}'`))[0].n) === 1, 'an UPDATE cannot re-point a scheduled day at another user\'s workout', r)
r = await as('authenticated', A, `update public.events set client_id = '${CL}' where title = 'seeded'`)
ok(!!r.error && Number((await rowsOf(`select count(*)::int n from public.events where title = 'seeded' and client_id = '${SOA}'`))[0].n) === 1, 'nor move a scheduled workout onto a client\'s record', r)
r = await as('authenticated', A, `update public.events set created_by = '${B}' where title = 'seeded'`)
ok(guarded(r) && Number((await rowsOf(`select count(*)::int n from public.events where title = 'seeded' and created_by = '${A}'`))[0].n) === 1, 'nor hand a scheduled day to someone else (UPDATE of created_by)', r)

// ── 4b. with read visibility widened, the guard's own conditions are what refuse ────────────────────────────────
await db.exec(`create policy "test only: see all templates" on public.workout_templates for select to authenticated using (true);
               create policy "test only: see all clients" on public.clients for select to authenticated using (true);`)
r = await as('authenticated', A, ev(SOA, A, T_B, 'wide other workout'))
ok(guarded(r) && !await has('wide other workout'), 'VISIBILITY WIDENED: another user\'s workout is still refused (the ownership test, not the read policy)', r)
r = await as('authenticated', A, ev(SOB, A, T_A, 'wide other record'))
ok(guarded(r) && !await has('wide other record'), 'VISIBILITY WIDENED: your workout on ANOTHER user\'s personal record is refused', r)
r = await as('authenticated', A, ev(SOA, A, T_A, 'wide own'))
ok(!r.error && await has('wide own'), 'VISIBILITY WIDENED: your own workout on your own record still works', r)
await db.exec(`drop policy "test only: see all templates" on public.workout_templates; drop policy "test only: see all clients" on public.clients;`)

// ── 5. the SQL editor is not refused; the cascade removes the scheduled days ─────────────────────────────────────
let adminOk = true
try { await db.exec(ev(SO, US, T_B, 'admin link')) } catch (e) { adminOk = false; console.log('  admin error:', String(e.message)) }
ok(adminOk && await has('admin link'), 'the SQL editor (postgres) can still write any link')
await db.exec(`delete from public.workout_templates where id = '${T_A}'`)
ok(!await has('seeded') && !await has('master schedules own') && !await has('wide own'), 'deleting a workout removes the days it was scheduled on (ON DELETE CASCADE)')
ok(await has('plain event'), '...and leaves ordinary events alone')

// ── 6. the documented rollback runs and removes the guard ────────────────────────────────────────────────────────
const headerRollback = SCRIPT.slice(SCRIPT.indexOf('-- ROLLBACK'), SCRIPT.indexOf('-- Safe to run twice'))
const stmts = headerRollback.match(/(?:drop (?:trigger|function) |alter table )[^;]+;/g) || []
ok(stmts.length === 3, 'the script documents a three-statement rollback', stmts)
let rollbackOk = stmts.length === 3
if (rollbackOk) { try { await db.exec(stmts.join('\n')) } catch (e) { rollbackOk = false; console.log('  rollback error:', String(e.message)) } }
ok(rollbackOk && (await rowsOf(`select count(*)::int n from information_schema.columns where table_name = 'events' and column_name = 'template_id'`))[0].n === 0, 'the documented rollback runs and the column is gone')

done()
