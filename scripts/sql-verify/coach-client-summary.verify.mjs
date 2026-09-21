// Verifies scripts/add-coach-client-summary-2026-09-20.sql on a real Postgres engine (PGlite) loaded with the live
// schema (live-schema.mjs): it runs the script TWICE (idempotency), then checks the numbers for a set of scenarios,
// the read-back the script ends with, and who can and cannot read or write the view. Set MUTATE=m1..m9 to apply one of
// the deliberate breakages in coach-client-summary.mutations.mjs — run-mutations.mjs requires each to make this FAIL.
//
//   node scripts/sql-verify/coach-client-summary.verify.mjs          # exit 0 = every check passed
//   node scripts/sql-verify/run-mutations.mjs                        # exit 0 = every breakage was caught
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { installLiveSchema } from './live-schema.mjs'
import { startHarness, applyMutation } from './harness.mjs'
import { MUTATIONS } from './coach-client-summary.mutations.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
let SCRIPT = fs.readFileSync(path.join(here, '..', 'add-coach-client-summary-2026-09-20.sql'), 'utf8').replace(/\r\n/g, '\n')
if (process.env.MUTATE) {
  const m = MUTATIONS[process.env.MUTATE]
  if (!m) { console.log('unknown mutation', process.env.MUTATE); process.exit(2) }
  SCRIPT = applyMutation(SCRIPT, m.pairs)
  console.log('MUTATION', process.env.MUTATE, 'applied:', m.why)
}

const { db, ok, rowsOf, as, done } = await startHarness()
console.log('engine:', (await rowsOf('select version()'))[0].version.slice(0, 40))
await installLiveSchema(db)

// ── a scenario ────────────────────────────────────────────────────────────────────────────────────────────
const A = 'a0000000-0000-4000-8000-000000000001', B = 'b0000000-0000-4000-8000-000000000002', U1 = 'c0000000-0000-4000-8000-0000000000c1'
const C1 = '10000000-0000-4000-8000-000000000001', C2 = '10000000-0000-4000-8000-000000000002', C3 = '10000000-0000-4000-8000-000000000003',
      C4 = '10000000-0000-4000-8000-000000000004', C5 = '10000000-0000-4000-8000-000000000005', SOLO = '10000000-0000-4000-8000-000000000006',
      C6 = '10000000-0000-4000-8000-000000000007', C7 = '10000000-0000-4000-8000-000000000008', C8 = '10000000-0000-4000-8000-000000000009'
const T = "(now() at time zone 'utc')::date"
await db.exec(`
  insert into public.clients (id, coach_id, user_id, full_name, status, invited_at) values
    ('${C1}', '${A}', '${U1}', 'Client One', 'active', now() - interval '3 days'),
    ('${C2}', '${A}', null, 'Client Two', 'inactive', null),
    ('${C3}', '${A}', null, 'Client Three (no data at all)', 'active', null),
    ('${C5}', '${A}', null, 'Client Five (busy)', 'active', null),
    ('${C6}', '${A}', null, 'Client Six (null-dated assignment)', 'active', null),
    ('${C7}', '${A}', null, 'Client Seven (window edges)', 'active', null),
    ('${C8}', '${A}', null, 'Client Eight (future-dated log)', 'active', null),
    ('${C4}', '${B}', null, 'Other Coach Client', 'active', null),
    ('${SOLO}', null, '${A}', 'Coach A personal record', 'active', null);
  -- client one: sessions yesterday, 3, 10 and 40 days ago
  insert into public.workout_logs (coach_id, client_id, name, date) values
    ('${A}', '${C1}', 's1', ${T} - 1), ('${A}', '${C1}', 's2', ${T} - 3), ('${A}', '${C1}', 's3', ${T} - 10), ('${A}', '${C1}', 's4', ${T} - 40);
  -- client two: one old session, and a stray log yesterday whose coach_id is ANOTHER coach (RLS hides it from coach A)
  insert into public.workout_logs (coach_id, client_id, name, date) values ('${A}', '${C2}', 'old', ${T} - 40), ('${B}', '${C2}', 'stray', ${T} - 1);
  -- client five: TWO sessions a day for the last 31 days (62 rows) — enough to make a capped read wrong
  insert into public.workout_logs (coach_id, client_id, name, date)
    select '${A}', '${C5}', 'busy', ${T} - d from generate_series(0, 30) d, generate_series(1, 2) k;
  -- another coach's client
  insert into public.workout_logs (coach_id, client_id, name, date) values ('${B}', '${C4}', 'b1', ${T} - 1);
  -- client seven: logs exactly ON and just OUTSIDE each window edge
  insert into public.workout_logs (coach_id, client_id, name, date) values
    ('${A}', '${C7}', 'e7', ${T} - 7), ('${A}', '${C7}', 'e8', ${T} - 8), ('${A}', '${C7}', 'e28', ${T} - 28), ('${A}', '${C7}', 'e29', ${T} - 29);
  -- client eight: a real session 20 days ago, and a mistyped log dated 400 days in the FUTURE
  insert into public.workout_logs (coach_id, client_id, name, date) values ('${A}', '${C8}', 'real', ${T} - 20), ('${A}', '${C8}', 'typo', ${T} + 400);
  insert into public.weight_logs (client_id, date, weight_kg) values ('${C1}', ${T} - 5, 70.0), ('${C1}', ${T} - 2, 69.5), ('${C1}', ${T} - 100, 72.0);
  insert into public.client_check_ins (client_id, sleep, energy, stress, soreness, created_at) values
    ('${C1}', 3, 3, 3, 3, now() - interval '14 days'), ('${C1}', 5, 4, 2, 1, now() - interval '1 day');
  insert into public.programs (id, coach_id, name) values
    ('20000000-0000-4000-8000-000000000001', '${A}', 'Old block'), ('20000000-0000-4000-8000-000000000002', '${A}', 'Hypertrophy'), ('20000000-0000-4000-8000-000000000003', '${A}', 'Empty programme'),
    ('20000000-0000-4000-8000-000000000004', '${A}', 'Null-dated block'), ('20000000-0000-4000-8000-000000000005', '${A}', 'Dated block');
  insert into public.program_phases (program_id, name, duration_weeks) values
    ('20000000-0000-4000-8000-000000000001', 'p', 6), ('20000000-0000-4000-8000-000000000002', 'a', 4), ('20000000-0000-4000-8000-000000000002', 'b', 4), ('20000000-0000-4000-8000-000000000002', 'c', 4),
    ('20000000-0000-4000-8000-000000000004', 'x', 3), ('20000000-0000-4000-8000-000000000005', 'y', 5);
  -- client one: an old assignment, then a NEWER one (which must win); client two: an assignment with NO created_at and no phases
  insert into public.client_programs (client_id, program_id, start_date, created_at) values
    ('${C1}', '20000000-0000-4000-8000-000000000001', ${T} - 90, now() - interval '30 days'),
    ('${C1}', '20000000-0000-4000-8000-000000000002', ${T} - 14, now()),
    ('${C2}', '20000000-0000-4000-8000-000000000003', ${T} - 7, null),
    ('${C6}', '20000000-0000-4000-8000-000000000004', ${T} - 30, null),
    ('${C6}', '20000000-0000-4000-8000-000000000005', ${T} - 10, now());
`)

// ── run the migration — twice, to prove it is idempotent ───────────────────────────────────────────────────
await db.exec(SCRIPT)
console.log('\nmigration ran once without error')
const run2 = await db.exec(SCRIPT)
ok(true, 'migration ran a second time without error (idempotent)')
const readback = run2[run2.length - 1].rows
ok(Array.isArray(readback) && readback.length > 0, 'the read-back SELECT returns rows', readback.length)
const by = (k) => readback.filter(r => r.check_name === k)
ok(by('view options').length === 1 && by('view options')[0].result === 'security_invoker=true', 'read-back: view options = security_invoker=true', by('view options'))
ok(by('view column').length === 19, 'read-back: 19 view columns', by('view column').length)
const priv = Object.fromEntries(by('privilege').map(r => r.result.split(' = ')).map(([k, v]) => [k, v]))
ok(by('privilege').length === 8, 'read-back: 8 privilege rows', by('privilege').length)
ok(priv['anon SELECT'] === 'false' && priv['anon INSERT'] === 'false' && priv['anon UPDATE'] === 'false' && priv['anon DELETE'] === 'false', 'read-back: anon has NO privilege on the view', priv)
ok(priv['authenticated SELECT'] === 'true' && priv['authenticated INSERT'] === 'false' && priv['authenticated UPDATE'] === 'false' && priv['authenticated DELETE'] === 'false', 'read-back: authenticated has SELECT only', priv)
const defs = by('index').map(r => r.result)
ok(defs.length === 5, 'read-back: the 5 new indexes exist', defs)
for (const want of ['workout_logs_client_date_idx ON public.workout_logs USING btree (client_id, date DESC)', 'weight_logs_client_date_idx ON public.weight_logs USING btree (client_id, date DESC)',
                    'client_check_ins_client_created_idx ON public.client_check_ins USING btree (client_id, created_at DESC)', 'clients_coach_id_idx ON public.clients USING btree (coach_id)',
                    'program_phases_program_id_idx ON public.program_phases USING btree (program_id)']) {
  ok(defs.some(d => d.endsWith(want)), `read-back: index definition is exactly "${want.split(' ON ')[0]} ... ${want.split('USING btree ')[1]}"`, defs)
}
ok(by('schema create').length === 1 && by('schema create')[0].result === 'anon=false authenticated=false', 'read-back: nobody but the owner can CREATE in public', by('schema create'))

// A DIRTY-STATE RE-RUN: someone re-grants the view to anon and to everyone, then the script is run again.
await db.exec('grant all on public.coach_client_summary to anon, public')
const dirty = (await rowsOf(`select has_table_privilege('anon', 'public.coach_client_summary', 'SELECT') as s`))[0].s
await db.exec(SCRIPT)
const clean = (await rowsOf(`select has_table_privilege('anon', 'public.coach_client_summary', 'SELECT') as s, has_table_privilege('anon', 'public.coach_client_summary', 'INSERT') as i`))[0]
ok(dirty === true && clean.s === false && clean.i === false, 're-running the script over a re-granted view takes the anon privileges away again', { dirty, clean })

// ── behaviour, as each kind of caller ─────────────────────────────────────────────────────────────────────
const asAll = (role, sub) => as(role, sub, 'select * from public.coach_client_summary order by full_name')
const ago = async (n) => (await rowsOf(`select (${T} - ${n})::text as d`))[0].d
const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10))

console.log('\nas coach A:')
const a = await asAll('authenticated', A)
ok(!a.error, 'query works', a.error)
const rowFor = (rows, id) => rows.find(r => r.client_id === id)
ok(a.rows.length === 7, 'exactly coach A\'s 7 coached clients (not the solo record, not coach B\'s client)', a.rows.map(r => r.full_name))
const r1 = rowFor(a.rows, C1)
ok(iso(r1?.last_session_date) === await ago(1), 'client one: last session = yesterday', r1?.last_session_date)
ok(Number(r1?.sessions_7d) === 2 && Number(r1?.sessions_28d) === 3, 'client one: 2 sessions in 7 days, 3 in 28 (the 40-day-old one is outside)', [r1?.sessions_7d, r1?.sessions_28d])
ok(iso(r1?.last_weigh_in_date) === await ago(2), 'client one: last weigh-in = 2 days ago (not the older ones)', r1?.last_weigh_in_date)
ok([r1?.check_in_sleep, r1?.check_in_energy, r1?.check_in_stress, r1?.check_in_soreness].join() === '5,4,2,1', 'client one: the NEWEST check-in scores, not the older 3,3,3,3', [r1?.check_in_sleep, r1?.check_in_energy, r1?.check_in_stress, r1?.check_in_soreness])
ok(r1?.program_name === 'Hypertrophy' && Number(r1?.program_weeks) === 12 && iso(r1?.program_start) === await ago(14), 'client one: the NEWER assignment wins, 4+4+4 = 12 weeks, its start date', [r1?.program_name, r1?.program_weeks, r1?.program_start])
ok(r1?.invited_at !== null && r1?.user_id === U1, 'client one: invited_at and user_id carried through', [r1?.invited_at, r1?.user_id])
const r2 = rowFor(a.rows, C2)
ok(iso(r2?.last_session_date) === await ago(40), 'client two: last session = 40 days ago — the stray log written under ANOTHER coach is not counted (the view honours RLS as the caller)', r2?.last_session_date)
ok(Number(r2?.sessions_7d) === 0 && Number(r2?.sessions_28d) === 0, 'client two: nothing in 7 or 28 days', [r2?.sessions_7d, r2?.sessions_28d])
ok(r2?.program_name === 'Empty programme' && r2?.program_weeks === null, 'client two: an assignment with a NULL created_at is still found, and a programme with NO phases is NULL weeks (unknown), not 0', [r2?.program_name, r2?.program_weeks])
ok(r2?.status === 'inactive', 'client two: status passes through', r2?.status)
const r3 = rowFor(a.rows, C3)
ok(r3 && r3.last_session_date === null && Number(r3.sessions_7d) === 0 && Number(r3.sessions_28d) === 0 && r3.last_weigh_in_date === null && r3.last_check_in_at === null && r3.program_id === null && r3.program_weeks === null,
   'client three: a client with NO data at all is still listed, with NULL dates, zero counts and no programme', r3)
const r5 = rowFor(a.rows, C5)
ok(Number(r5?.sessions_7d) === 16 && Number(r5?.sessions_28d) === 58, 'client five (62 logs): 16 sessions in the 8-day window and 58 in the 29-day window, counted in the database, not from a capped slice', [r5?.sessions_7d, r5?.sessions_28d])
const r6 = rowFor(a.rows, C6)
ok(r6?.program_name === 'Null-dated block' && Number(r6?.program_weeks) === 3, 'client six: with a NULL-created_at and a dated assignment, the NULL one wins — as every screen orders created_at DESC (coach and client see the same programme)', [r6?.program_name, r6?.program_weeks])
const r7 = rowFor(a.rows, C7)
ok(Number(r7?.sessions_7d) === 1, 'client seven: a log exactly 7 days ago is IN the 7-day window, 8 days ago is OUT', r7?.sessions_7d)
ok(Number(r7?.sessions_28d) === 3, 'client seven: 28 days ago is IN the 28-day window, 29 days ago is OUT (7, 8 and 28 days ago = 3)', r7?.sessions_28d)
ok(iso(r7?.last_session_date) === await ago(7), 'client seven: last session = 7 days ago', r7?.last_session_date)
const r8 = rowFor(a.rows, C8)
ok(iso(r8?.last_session_date) === await ago(20), 'client eight: a log dated 400 days in the FUTURE does not become the last session — the real one 20 days ago does', r8?.last_session_date)
ok(Number(r8?.sessions_28d) === 1, 'client eight: and the future log is not counted', r8?.sessions_28d)

console.log('\nother callers:')
const b = await asAll('authenticated', B)
ok(b.rows?.length === 1 && b.rows[0].client_id === C4 && iso(b.rows[0].last_session_date) === await ago(1), 'coach B sees only their own client', b.rows?.map(r => r.full_name) ?? b.error)
const cl = await asAll('authenticated', U1)
ok(!cl.error && cl.rows.length === 0, 'a CLIENT (who can read their own clients row) gets ZERO rows', cl.rows?.length ?? cl.error)
const solo = await as('authenticated', A, `select count(*)::int as n from public.clients where user_id = '${A}' and coach_id is null`)
ok(solo.rows?.[0]?.n === 1, 'control: coach A can read their own solo record from clients directly', solo)
const nosub = await asAll('authenticated', '')
ok(!nosub.error && nosub.rows.length === 0, 'an authenticated caller with no subject gets ZERO rows', nosub.rows?.length ?? nosub.error)
const anon = await asAll('anon', '')
ok(anon.error && /permission denied/i.test(anon.error), 'anon is refused outright', anon.error ?? anon.rows)
const w = await as('authenticated', A, `update public.coach_client_summary set full_name = 'x'`)
ok(w.error && /permission denied|cannot update view/i.test(w.error), 'the view cannot be written to by a signed-in user', w.error ?? w.rows)
const d = await as('authenticated', A, `delete from public.coach_client_summary`)
ok(d.error && /permission denied|cannot delete from view/i.test(d.error), 'nor deleted from', d.error ?? d.rows)

console.log('\nplan (sequential scans disabled, to see whether the new indexes are USABLE for these shapes):')
await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${A}', false); set role authenticated; set enable_seqscan = off;`)
const plan = (await db.query(`explain select * from public.coach_client_summary`)).rows.map(r => r['QUERY PLAN']).join('\n')
await db.exec('reset role; reset enable_seqscan;')
for (const idx of ['workout_logs_client_date_idx', 'weight_logs_client_date_idx', 'client_check_ins_client_created_idx', 'program_phases_program_id_idx']) {
  ok(plan.includes(idx), `the plan can use ${idx}`)
}
ok(plan.includes('clients_coach_id_idx'), 'the plan can use clients_coach_id_idx', plan.split('\n').filter(l => /clients/.test(l)).slice(0, 3))

done()
