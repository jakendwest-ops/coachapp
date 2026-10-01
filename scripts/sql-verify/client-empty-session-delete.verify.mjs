// Verifies scripts/add-client-empty-session-delete-2026-10-01.sql on a real Postgres engine (PGlite) loaded with the live schema AND
// every live policy on workout_logs, workout_log_exercises and workout_log_sets (live-schema.mjs + live-schema-programs.mjs). It first
// proves the fixture reproduces the live GAP — a client's rollback deletes nothing — because a verifier that could not reproduce the
// problem would prove nothing about the fix. Then it runs the script TWICE (idempotency) and checks who may delete what: the narrow
// grant works exactly as far as it should, and no further.
// Set MUTATE=m1..m19 to apply one of the deliberate breakages in client-empty-session-delete.mutations.mjs — run-mutations.mjs requires
// each to make this FAIL.
//
//   node scripts/sql-verify/client-empty-session-delete.verify.mjs   # exit 0 = every check passed
//   node scripts/sql-verify/run-mutations.mjs                        # exit 0 = every breakage was caught
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { installLiveSchema } from './live-schema.mjs'
import { installProgramLifecycleSchema } from './live-schema-programs.mjs'
import { startHarness, applyMutation } from './harness.mjs'
import { MUTATIONS } from './client-empty-session-delete.mutations.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
let SCRIPT = fs.readFileSync(path.join(here, '..', 'add-client-empty-session-delete-2026-10-01.sql'), 'utf8').replace(/\r\n/g, '\n')
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

// ── a scenario ───────────────────────────────────────────────────────────────
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const A = id(1), B = id(2)                                   // two coaches
const UC1 = id(11), UC2 = id(12), US = id(13), UCB = id(14)  // a client, another client of the same coach, a solo user, a client of coach B
const CL1 = id(21), CL2 = id(22), SO = id(23), CLB = id(24)  // their `clients` rows
await db.exec(`insert into public.clients (id, coach_id, user_id, full_name) values
  ('${CL1}', '${A}', '${UC1}', 'Client 1 of coach A'), ('${CL2}', '${A}', '${UC2}', 'Client 2 of coach A'),
  ('${SO}', null, '${US}', 'Solo user'), ('${CLB}', '${B}', '${UCB}', 'Client of coach B')`)

let seq = 100
const mkLog = async (client, coach, name, ageMinutes = 0) => { const lid = id(++seq); await db.exec(`insert into public.workout_logs (id, coach_id, client_id, name, created_at) values ('${lid}', '${coach}', '${client}', '${name}', now() - interval '${ageMinutes} minutes')`); return lid }
const mkEx = async (log, name) => { const eid = id(++seq); await db.exec(`insert into public.workout_log_exercises (id, log_id, exercise_name) values ('${eid}', '${log}', '${name}')`); return eid }
const mkSet = async (ex) => { const sid = id(++seq); await db.exec(`insert into public.workout_log_sets (id, workout_log_exercise_id) values ('${sid}', '${ex}')`); return sid }
const has = async (table, rid) => (await rowsOf(`select 1 from public.${table} where id = '${rid}'`)).length === 1
const del = (role, sub, table, rid) => as(role, sub, `delete from public.${table} where id = '${rid}' returning id`)
const gone = r => !r.error && r.rows.length === 1
// STRICT. A policy-refused DELETE returns no row and NO error; an error (e.g. "infinite recursion detected in policy") is a defect in the
// policy, not a refusal. The first draft of this migration failed exactly that way, and a lenient `!!r.error ||` here counted it as a pass.
const refused = r => (!r.error && r.rows.length === 0)

// client 1's sessions: a failed save with NO exercises written yet; one with exercises but no sets; a finished one; a mixed one
const L_EMPTY = await mkLog(CL1, A, 'empty — the exercises insert failed')
const L_EXONLY = await mkLog(CL1, A, 'exercises written, sets batch failed'); const E_EXONLY = await mkEx(L_EXONLY, 'Bench')
const L_FULL = await mkLog(CL1, A, 'finished session'); const E_FULL = await mkEx(L_FULL, 'Squat'); const S_FULL = await mkSet(E_FULL)
const L_MIXED = await mkLog(CL1, A, 'one exercise with a set, one without')
const E_MIX_SET = await mkEx(L_MIXED, 'Row'); const S_MIX = await mkSet(E_MIX_SET); const E_MIX_EMPTY = await mkEx(L_MIXED, 'Curl')
const L_EXONLY2 = await mkLog(CL1, A, 'second exercises-only session, for the direct-call probe'); const E_EXONLY2 = await mkEx(L_EXONLY2, 'Lunge')
// the 15-minute window: one session inside it, one just outside it, one months old (each with an exercise and no sets)
const L_AT14 = await mkLog(CL1, A, 'empty, 14 minutes old', 14); const E_AT14 = await mkEx(L_AT14, 'Fly')
const L_AT16 = await mkLog(CL1, A, 'empty, 16 minutes old', 16); const E_AT16 = await mkEx(L_AT16, 'Shrug')
const L_OLD = await mkLog(CL1, A, 'empty, 180 days old, carrying a coach note', 180 * 24 * 60); const E_OLD = await mkEx(L_OLD, 'Crunch')
// other people's empty sessions
const L_C2 = await mkLog(CL2, A, 'client 2 empty'); const E_C2 = await mkEx(L_C2, 'Press')
const L_B = await mkLog(CLB, B, 'coach B client empty'); const E_B = await mkEx(L_B, 'Dip')
// the solo user's own sessions (coach_id is their own uid)
const L_SOLO_EMPTY = await mkLog(SO, US, 'solo empty')
const L_SOLO_FULL = await mkLog(SO, US, 'solo finished'); const E_SOLO = await mkEx(L_SOLO_FULL, 'Deadlift'); await mkSet(E_SOLO)

// ── 1. CONTROL: before the script the live gap is real — the fixture must reproduce it ────────────────────────────────────────
let r = await del('authenticated', UC1, 'workout_logs', L_EMPTY)
ok(refused(r) && await has('workout_logs', L_EMPTY), 'CONTROL (before the script): a client\'s rollback DELETE of their own empty session removes nothing — the live gap is reproduced', r)
r = await del('authenticated', UC1, 'workout_log_exercises', E_EXONLY)
ok(refused(r) && await has('workout_log_exercises', E_EXONLY), 'CONTROL (before the script): nor can they delete the exercise rows of a failed save', r)
const L_CTRL = await mkLog(CL1, A, 'control')
r = await del('authenticated', A, 'workout_logs', L_CTRL)
ok(gone(r) && !(await has('workout_logs', L_CTRL)), 'CONTROL: the COACH can delete a session (the existing policy works in this fixture, so a refusal below means something)', r)

// ── 2. run the migration — twice, to prove it is idempotent ───────────────────────────────────────────────────────────────────────
try { await db.exec(SCRIPT); await db.exec(SCRIPT); ok(true, 'the script runs twice without error (idempotent)') }
catch (e) { ok(false, 'the script runs twice without error (idempotent)', String(e.message)); done() }

// the read-back the script ends with
const readBack = await rowsOf(SCRIPT.slice(SCRIPT.indexOf('-- READ-BACK')))
const fns = readBack.filter(x => x.kind === 'function'), pols = readBack.filter(x => x.kind === 'policy')
ok(fns.length === 2 && fns.every(f => /definer=true/.test(f.detail) && /search_path=public, pg_temp/.test(f.detail)),
  'read-back: exactly two functions, each security definer with a fixed search_path', fns)
ok(fns.every(f => /anon_exec=false/.test(f.detail) && /authenticated_exec=true/.test(f.detail)),
  'read-back: anon cannot execute either function and authenticated can (Jake can SEE the privilege, not just trust it)', fns)
ok(pols.length === 2 && pols.every(x => / DELETE authenticated$/.test(x.detail)), 'read-back: exactly two policies, each FOR DELETE, for the authenticated role only', pols)
ok(pols.some(x => x.detail.startsWith('workout_logs ')) && pols.some(x => x.detail.startsWith('workout_log_exercises ')), 'read-back: one on workout_logs and one on workout_log_exercises', pols)

// ── 3. AFTER: what the client CAN now do (the whole point) ───────────────────────────────────────────────────────────────────
r = await del('authenticated', UC1, 'workout_logs', L_EMPTY)
ok(gone(r) && !(await has('workout_logs', L_EMPTY)), 'a client can delete their own session when the failed save wrote NO exercises (the rollback\'s first branch)', r)
// the rollback exactly as the app writes it: the exercises first, then the log
r = await del('authenticated', UC1, 'workout_log_exercises', E_EXONLY)
ok(gone(r) && !(await has('workout_log_exercises', E_EXONLY)), 'a client can delete the exercise rows of a failed save (no sets under them)', r)
r = await del('authenticated', UC1, 'workout_logs', L_EXONLY)
ok(gone(r) && !(await has('workout_logs', L_EXONLY)), '...and then the session row itself — the app\'s whole rollback now works', r)

// the functions are security definer, so each must do its OWN check: yes only for the row's own client, false for everyone else
const L_PROBE = await mkLog(CL1, A, 'probe for the direct calls')
const call = (role, sub, fn, rid) => as(role, sub, `select public.${fn}('${rid}') as v`)
r = await call('authenticated', UC1, 'client_may_delete_log', L_PROBE)
ok(!r.error && r.rows[0].v === true, 'client_may_delete_log: TRUE for the session\'s own client when it is empty', r)
r = await call('authenticated', UC2, 'client_may_delete_log', L_PROBE)
ok(!r.error && r.rows[0].v === false, '...FALSE for another client — a stranger learns nothing about someone else\'s session', r)
r = await call('authenticated', UC1, 'client_may_delete_log', L_FULL)
ok(!r.error && r.rows[0].v === false, '...FALSE for its own client once the session has sets', r)
r = await call('authenticated', UC1, 'client_may_delete_log', id(999))
ok(!r.error && r.rows[0].v === false, '...FALSE for an id that does not exist', r)
r = await call('authenticated', A, 'client_may_delete_log', L_PROBE)
ok(!r.error && r.rows[0].v === false, '...FALSE for the COACH too (the coach has their own delete policy; this function is the CLIENT\'s test)', r)
r = await call('anon', '', 'client_may_delete_log', L_PROBE)
ok(!!r.error && /permission denied/i.test(r.error), 'an anonymous caller cannot call the function at all (execute revoked from anon and PUBLIC)', r)
r = await call('authenticated', UC1, 'client_may_delete_log_exercise', E_EXONLY2)
ok(!r.error && r.rows[0].v === true, 'client_may_delete_log_exercise: TRUE for the owning client when the exercise has no sets', r)
r = await call('authenticated', UC2, 'client_may_delete_log_exercise', E_EXONLY2)
ok(!r.error && r.rows[0].v === false, '...FALSE for another client', r)
r = await call('authenticated', UC1, 'client_may_delete_log_exercise', E_MIX_SET)
ok(!r.error && r.rows[0].v === false, '...FALSE when the exercise has a set', r)
r = await call('authenticated', A, 'client_may_delete_log_exercise', E_EXONLY2)
ok(!r.error && r.rows[0].v === false, '...FALSE for the COACH (the coach has their own delete policy)', r)
r = await call('authenticated', UC1, 'client_may_delete_log_exercise', id(999))
ok(!r.error && r.rows[0].v === false, '...FALSE for an id that does not exist', r)
r = await call('anon', '', 'client_may_delete_log_exercise', E_EXONLY2)
ok(!!r.error && /permission denied/i.test(r.error), '...and anon cannot call this one either', r)

// the 15-minute window: inside it the rollback works, outside it (and for old history) it does not
r = await del('authenticated', UC1, 'workout_log_exercises', E_AT14)
ok(gone(r), 'a session 14 minutes old is still inside the rollback window: its exercise row can go', r)
r = await del('authenticated', UC1, 'workout_logs', L_AT14)
ok(gone(r), '...and so can the session', r)
r = await del('authenticated', UC1, 'workout_log_exercises', E_AT16)
ok(refused(r) && await has('workout_log_exercises', E_AT16), 'a session 16 minutes old is OUTSIDE the window: its exercise row can no longer be deleted by the client', r)
r = await del('authenticated', UC1, 'workout_logs', L_AT16)
ok(refused(r) && await has('workout_logs', L_AT16), '...nor the session', r)
r = await del('authenticated', UC1, 'workout_logs', L_OLD)
ok(refused(r) && await has('workout_logs', L_OLD), 'a set-less session from 180 days ago (the kind that could carry a coach note) is NOT deletable by its client', r)
r = await del('authenticated', UC1, 'workout_log_exercises', E_OLD)
ok(refused(r) && await has('workout_log_exercises', E_OLD), '...nor its exercise row', r)
r = await call('authenticated', UC1, 'client_may_delete_log', L_OLD)
ok(!r.error && r.rows[0].v === false, 'client_may_delete_log is FALSE for the old session', r)
r = await call('authenticated', UC1, 'client_may_delete_log_exercise', E_OLD)
ok(!r.error && r.rows[0].v === false, 'client_may_delete_log_exercise is FALSE for the old session\'s exercise', r)

// ── 4. AFTER: what the client still CANNOT do ─────────────────────────────────────────────────────────────────────────────────
r = await del('authenticated', UC1, 'workout_logs', L_FULL)
ok(refused(r) && await has('workout_logs', L_FULL), 'a client CANNOT delete a session that has sets (real history stays)', r)
r = await del('authenticated', UC1, 'workout_log_exercises', E_FULL)
ok(refused(r) && await has('workout_log_exercises', E_FULL), '...nor an exercise that has sets', r)
r = await del('authenticated', UC1, 'workout_log_sets', S_FULL)
ok(refused(r) && await has('workout_log_sets', S_FULL), '...nor a set directly (no DELETE policy on workout_log_sets at all)', r)
// the boundary: one exercise with a set, one without, in the same session
r = await del('authenticated', UC1, 'workout_log_exercises', E_MIX_EMPTY)
ok(gone(r), 'MIXED session: the exercise with NO sets may go (nothing in it to lose)', r)
r = await del('authenticated', UC1, 'workout_log_exercises', E_MIX_SET)
ok(refused(r) && await has('workout_log_exercises', E_MIX_SET), '...but the exercise WITH a set may not', r)
r = await del('authenticated', UC1, 'workout_logs', L_MIXED)
ok(refused(r) && await has('workout_logs', L_MIXED), '...and the session still may not, because one exercise in it has a set', r)
ok(await has('workout_log_sets', S_MIX), '...and that set is untouched')

// someone else's empty session
r = await del('authenticated', UC1, 'workout_logs', L_C2)
ok(refused(r) && await has('workout_logs', L_C2), 'a client CANNOT delete ANOTHER client\'s empty session (same coach)', r)
r = await del('authenticated', UC1, 'workout_log_exercises', E_C2)
ok(refused(r) && await has('workout_log_exercises', E_C2), '...nor that session\'s exercise rows', r)
r = await del('authenticated', UC1, 'workout_logs', L_B)
ok(refused(r) && await has('workout_logs', L_B), 'a client CANNOT delete a session belonging to another coach\'s client', r)
r = await del('authenticated', UC1, 'workout_log_exercises', E_B)
ok(refused(r) && await has('workout_log_exercises', E_B), '...nor its exercise rows', r)
const L_EMPTY_B = await mkLog(CL1, A, 'client 1 empty, second')
r = await del('authenticated', UC2, 'workout_logs', L_EMPTY_B)
ok(refused(r) && await has('workout_logs', L_EMPTY_B), 'and the reverse: client 2 CANNOT delete client 1\'s empty session', r)
r = await del('authenticated', UCB, 'workout_logs', L_EMPTY_B)
ok(refused(r) && await has('workout_logs', L_EMPTY_B), '...nor can a client of an unrelated coach', r)
r = await del('authenticated', B, 'workout_logs', L_EMPTY_B)
ok(refused(r) && await has('workout_logs', L_EMPTY_B), 'an unrelated COACH cannot delete it either', r)
r = await del('authenticated', '', 'workout_logs', L_EMPTY_B)
ok(refused(r) && await has('workout_logs', L_EMPTY_B), 'a signed-in caller with no identity cannot', r)
r = await del('anon', '', 'workout_logs', L_EMPTY_B)
ok(refused(r) && await has('workout_logs', L_EMPTY_B), 'an anonymous caller cannot', r)

// the grant is DELETE only: a client still cannot change an empty session or its exercise rows
const L_UPD = await mkLog(CL1, A, 'client 1 empty, for the update probe'); const E_UPD = await mkEx(L_UPD, 'Plank')
r = await as('authenticated', UC1, `update public.workout_logs set name = 'renamed by client' where id = '${L_UPD}' returning id`)
ok(refused(r) && (await rowsOf(`select name from public.workout_logs where id = '${L_UPD}'`))[0].name === 'client 1 empty, for the update probe', 'the grant is DELETE only: a client still cannot UPDATE their empty session', r)
r = await as('authenticated', UC1, `update public.workout_log_exercises set exercise_name = 'renamed by client' where id = '${E_UPD}' returning id`)
ok(refused(r) && (await rowsOf(`select exercise_name from public.workout_log_exercises where id = '${E_UPD}'`))[0].exercise_name === 'Plank', '...nor UPDATE its exercise rows', r)

// ── 5. what must be UNCHANGED ────────────────────────────────────────────────────────────────────────────────────────────────
r = await del('authenticated', A, 'workout_logs', L_EMPTY_B)
ok(gone(r), 'the coach can still delete their client\'s empty session (existing policy untouched)', r)
r = await del('authenticated', A, 'workout_logs', L_FULL)
ok(gone(r), 'the coach can still delete a client\'s FINISHED session (existing policy untouched — the new grant narrowed nothing)', r)
r = await del('authenticated', US, 'workout_logs', L_SOLO_EMPTY)
ok(gone(r), 'a solo user can still delete their own empty session', r)
r = await del('authenticated', US, 'workout_logs', L_SOLO_FULL)
ok(gone(r), 'a solo user can still delete their own FINISHED session (their coach_id is their own uid — unchanged)', r)
r = await as('authenticated', UC1, `insert into public.workout_logs (coach_id, client_id, name) values ('${A}', '${CL1}', 'a new session') returning id`)
ok(!r.error && r.rows.length === 1, 'a client can still START a session for themselves (the INSERT policy is untouched)', r)
r = await as('authenticated', UC1, `select count(*)::int as n from public.workout_logs where client_id = '${CL1}'`)
ok(!r.error && r.rows[0].n >= 1, 'a client can still READ their own sessions', r)

// BLANKET deletes (no WHERE, no RETURNING). A DELETE with a WHERE needs SELECT rights to find its rows, so the "cannot delete" checks above are
// answered by the SELECT policies before the new policies are consulted. This shape skips that and reaches the DELETE policies themselves.
await as('authenticated', UC1, 'delete from public.workout_log_exercises')
await as('authenticated', UC1, 'delete from public.workout_logs')
ok(await has('workout_logs', L_C2) && await has('workout_logs', L_B) && await has('workout_log_exercises', E_C2) && await has('workout_log_exercises', E_B),
  "a BLANKET client delete (no WHERE) removes none of OTHER people's sessions or exercise rows — the new policies themselves refuse them")
ok(await has('workout_logs', L_MIXED) && await has('workout_log_exercises', E_MIX_SET) && await has('workout_log_sets', S_MIX),
  '...and none that has a set')
ok(await has('workout_logs', L_OLD) && await has('workout_log_exercises', E_AT16),
  '...and none outside the 15-minute window')

// ── 6. the rollback written in the script's header works, and reopens the gap ──────────────────────────────────────────────────
const rbBlock = SCRIPT.slice(SCRIPT.indexOf('-- ROLLBACK'), SCRIPT.indexOf('-- Safe to run twice'))
const drops = [...rbBlock.matchAll(/^--\s+(drop (?:policy|function) [^;\n]+;)/gm)].map(m => m[1])
ok(drops.length === 4 && drops.filter(d => d.startsWith('drop policy')).length === 2, 'the script documents a rollback: two drop policy and two drop function statements', drops)
let rollbackOk = drops.length === 4
if (rollbackOk) { try { await db.exec(drops.join(' ')) } catch (e) { rollbackOk = false; console.log('  rollback error:', String(e.message)) } }
ok(rollbackOk, 'the documented rollback runs as written')
const L_AFTER = await mkLog(CL1, A, 'after the rollback')
r = await del('authenticated', UC1, 'workout_logs', L_AFTER)
ok(refused(r) && await has('workout_logs', L_AFTER), '...and after it a client\'s rollback is refused again (the grant is really gone)', r)
const gone2 = await rowsOf(`select count(*)::int as n from pg_proc where proname in ('client_may_delete_log', 'client_may_delete_log_exercise')`)
ok(gone2[0].n === 0, '...and both functions are gone (nothing is left behind by the rollback)', gone2)

done()
