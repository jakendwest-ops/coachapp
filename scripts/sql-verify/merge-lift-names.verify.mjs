// Verifies scripts/add-merge-lift-names-2026-11-02.sql on PGlite loaded with the live schema, every live policy on workout_log_exercises, client_1rms
// and performance_logs (live-schema.mjs + live-schema-lifts.mjs) and the live update triggers it can meet. It first proves the fixture reproduces the live
// GAP (a client cannot rename their own logged exercises or records), then runs the script TWICE, then checks who may merge whose lifts, what moves,
// what must not move, the chain/cycle rules, undo, the lock-down, and that the documented rollback really puts the names back.
// Set MUTATE=m1.. to apply one deliberate breakage from merge-lift-names.mutations.mjs: run-mutations.mjs requires each to make this FAIL.
//
//   node scripts/sql-verify/merge-lift-names.verify.mjs   # exit 0 = every check passed
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { installLiveSchema } from './live-schema.mjs'
import { installLiftTables } from './live-schema-lifts.mjs'
import { startHarness, applyMutation } from './harness.mjs'
import { MUTATIONS } from './merge-lift-names.mutations.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
let SCRIPT = fs.readFileSync(path.join(here, '..', 'add-merge-lift-names-2026-11-02.sql'), 'utf8').replace(/\r\n/g, '\n')
if (process.env.MUTATE) {
  const m = MUTATIONS[process.env.MUTATE]
  if (!m) { console.log('unknown mutation', process.env.MUTATE); process.exit(2) }
  SCRIPT = applyMutation(SCRIPT, m.pairs)
  console.log('MUTATION', process.env.MUTATE, 'applied:', m.why)
}

const { db, ok, rowsOf, as, done } = await startHarness()
console.log('engine:', (await rowsOf('select version()'))[0].version.slice(0, 40))
await installLiveSchema(db)
await installLiftTables(db)

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const A = id(1), B = id(2)                       // two coaches
const UC1 = id(11), UC2 = id(12), US = id(13), UCB = id(14)   // a client, another client of coach A, a solo user, a client of coach B
const CL1 = id(21), CL2 = id(22), SO = id(23), CLB = id(24)
await db.exec(`insert into public.clients (id, coach_id, user_id, full_name) values
  ('${CL1}', '${A}', '${UC1}', 'Client 1 of A'), ('${CL2}', '${A}', '${UC2}', 'Client 2 of A'), ('${SO}', null, '${US}', 'Solo'), ('${CLB}', '${B}', '${UCB}', 'Client of B')`)

let seq = 100
const q = s => s.replace(/'/g, "''")
const mkLog = async (client, coach) => { const lid = id(++seq); await db.exec(`insert into public.workout_logs (id, coach_id, client_id, name) values ('${lid}', '${coach}', '${client}', 'session')`); return lid }
const mkEx = async (log, name) => { const eid = id(++seq); await db.exec(`insert into public.workout_log_exercises (id, log_id, exercise_name) values ('${eid}', '${log}', '${q(name)}')`); return eid }
const mkOneRm = async (client, name) => { const rid = id(++seq); await db.exec(`insert into public.client_1rms (id, client_id, exercise_name, one_rm_kg) values ('${rid}', '${client}', '${q(name)}', 100)`); return rid }
const mkRec = async (client, name) => { const rid = id(++seq); await db.exec(`insert into public.performance_logs (id, client_id, name, category) values ('${rid}', '${client}', '${q(name)}', 'strength')`); return rid }
const nameOf = async (table, col, rid) => (await rowsOf(`select ${col} as n from public.${table} where id = '${rid}'`))[0]?.n
const fromOf = async (table, rid) => (await rowsOf(`select merged_from as n from public.${table} where id = '${rid}'`))[0]?.n ?? null
const exName = rid => nameOf('workout_log_exercises', 'exercise_name', rid)
const merges = async client => rowsOf(`select from_name, to_name from public.lift_name_merges where client_id = '${client}' order by from_name`)
const refused = r => (!r.error && r.rows.length === 0)
const call = (role, sub, sql) => as(role, sub, sql)
const merge = (role, sub, client, from, to) => call(role, sub, `select public.merge_lift_names('${client}', '${q(from)}', '${q(to)}') as v`)
const unmerge = (role, sub, client, from) => call(role, sub, `select public.unmerge_lift_names('${client}', '${q(from)}') as v`)
const denied = r => !!r.error && /not your client|permission denied|sign in first/i.test(r.error)

// Client 1: 2 sessions of 'Back Squat' (one with a stray space), 1 of 'Barbell Back Squat' (the kept one), 1 'Bench Press'; one saved best and one record each.
const L1a = await mkLog(CL1, A), L1b = await mkLog(CL1, A), L1c = await mkLog(CL1, A)
const E_BS1 = await mkEx(L1a, 'Back Squat'), E_BS2 = await mkEx(L1b, 'Back Squat '), E_BBS = await mkEx(L1c, 'Barbell Back Squat'), E_BENCH = await mkEx(L1c, 'Bench Press')
const R_BS = await mkOneRm(CL1, 'Back Squat'), R_BBS = await mkOneRm(CL1, 'Barbell Back Squat'), P_BS = await mkRec(CL1, 'Back Squat')
// Client 2 (same coach), client B and the solo user each have a 'Back Squat' (and a kept 'Barbell Back Squat' where they merge), which must NEVER move when someone else merges.
const L2 = await mkLog(CL2, A), E_C2 = await mkEx(L2, 'Back Squat'), E_C2K = await mkEx(L2, 'Barbell Back Squat'), R_C2 = await mkOneRm(CL2, 'Back Squat'), P_C2 = await mkRec(CL2, 'Back Squat')
const LB = await mkLog(CLB, B), E_B = await mkEx(LB, 'Back Squat'), R_B = await mkOneRm(CLB, 'Back Squat')
const LS = await mkLog(SO, US), E_S1 = await mkEx(LS, 'Back Squat'), E_S2 = await mkEx(LS, 'Barbell Back Squat'), R_S = await mkOneRm(SO, 'Back Squat'), P_S = await mkRec(SO, 'Back Squat')

// ── 1. CONTROL: the live gap is real — before the script a client cannot rename their own logged exercises or records ────────────────
let r = await call('authenticated', UC1, `update public.workout_log_exercises set exercise_name = 'X' where id = '${E_BS1}' returning id`)
ok(refused(r) && await exName(E_BS1) === 'Back Squat', 'CONTROL (before the script): a coached client CANNOT update their own logged exercise (the live gap)', r)
r = await call('authenticated', UC1, `update public.performance_logs set name = 'X' where id = '${P_BS}' returning id`)
ok(refused(r) && await nameOf('performance_logs', 'name', P_BS) === 'Back Squat', 'CONTROL: nor their own performance record', r)
r = await call('authenticated', UC1, `update public.client_1rms set exercise_name = 'Back Squat (client)' where id = '${R_BS}' returning id`)
ok(!r.error && r.rows.length === 1, 'CONTROL: but a client CAN update their own saved best (so the function is needed for the other two, not this one)', r)
await db.exec(`update public.client_1rms set exercise_name = 'Back Squat' where id = '${R_BS}'`)
r = await call('authenticated', A, `update public.workout_log_exercises set exercise_name = 'Back Squat' where id = '${E_BS1}' returning id`)
ok(!r.error && r.rows.length === 1, 'CONTROL: the COACH can update (the existing policy works in this fixture, so a refusal below means something)', r)

// ── 2. run the script twice ──────────────────────────────────────────────────────────────────────────────────────────────────────────
try { await db.exec(SCRIPT); await db.exec(SCRIPT); ok(true, 'the script runs twice without error (idempotent)') }
catch (e) { ok(false, 'the script runs twice without error (idempotent)', String(e.message)); done() }

const readBack = await rowsOf(SCRIPT.slice(SCRIPT.indexOf('-- READ-BACK')))
const fns = readBack.filter(x => x.kind === 'function'), tbl = readBack.filter(x => x.kind === 'table'), pols = readBack.filter(x => x.kind === 'policy'), cols = readBack.filter(x => x.kind === 'column')
ok(fns.length === 2 && fns.every(f => /definer=true/.test(f.detail) && /search_path=public, pg_temp/.test(f.detail)), 'read-back: two functions, each security definer with a fixed search_path', fns)
ok(fns.every(f => /anon_exec=false/.test(f.detail) && /authenticated_exec=true/.test(f.detail)), 'read-back: anon cannot execute either; authenticated can', fns)
ok(tbl.length === 1 && /rls=true/.test(tbl[0].detail) && /anon_write=false/.test(tbl[0].detail) && /authenticated_write=false/.test(tbl[0].detail), 'read-back: lift_name_merges has RLS on and NOBODY but the functions can write it', tbl)
ok(pols.length === 1 && / SELECT authenticated$/.test(pols[0].detail), 'read-back: exactly one policy on it, FOR SELECT, authenticated only', pols)
ok(cols.length === 3, 'read-back: merged_from exists on all three tables', cols)

// ── 3. a coached client merges their own lifts ──────────────────────────────────────────────────────────────────────────────────────
r = await merge('authenticated', UC1, CL1, 'Back Squat', 'Barbell Back Squat')
ok(!r.error && r.rows[0].v.final === 'Barbell Back Squat' && r.rows[0].v.sessions === 2 && r.rows[0].v.bests === 1 && r.rows[0].v.records === 1, 'a coached client merges Back Squat into Barbell Back Squat: 2 sessions (one had a stray space), 1 best, 1 record', r)
ok(await exName(E_BS1) === 'Barbell Back Squat' && await exName(E_BS2) === 'Barbell Back Squat', '...both logged exercises now carry the kept name')
ok(await fromOf('workout_log_exercises', E_BS1) === 'Back Squat' && await fromOf('workout_log_exercises', E_BS2) === 'Back Squat ', '...each remembers its ORIGINAL name (including the stray space) in merged_from')
ok(await nameOf('client_1rms', 'exercise_name', R_BS) === 'Barbell Back Squat' && await fromOf('client_1rms', R_BS) === 'Back Squat' && await nameOf('performance_logs', 'name', P_BS) === 'Barbell Back Squat' && await fromOf('performance_logs', P_BS) === 'Back Squat', '...and the saved best and the record follow, each remembering its old name')
ok(await fromOf('workout_log_exercises', E_BBS) === null && await fromOf('client_1rms', R_BBS) === null && await exName(E_BENCH) === 'Bench Press', '...rows already under the kept name, and other lifts, are not touched and carry no merged_from')
ok(await exName(E_C2) === 'Back Squat' && await nameOf('client_1rms', 'exercise_name', R_C2) === 'Back Squat' && await nameOf('performance_logs', 'name', P_C2) === 'Back Squat', 'ANOTHER client of the same coach: their Back Squat did not move')
ok(await exName(E_B) === 'Back Squat' && await nameOf('client_1rms', 'exercise_name', R_B) === 'Back Squat', "a client of ANOTHER coach: did not move")
ok(await exName(E_S1) === 'Back Squat' && await nameOf('performance_logs', 'name', P_S) === 'Back Squat', 'the solo user: did not move')
// the live audit trigger (SECURITY DEFINER, changed_by = auth.uid()) fires inside the merge, one row per rewritten row, attributed to the CALLER, with the old and new name
const audit = await rowsOf(`select table_name, record_id, changed_by, old_data->>'exercise_name' as o, new_data->>'exercise_name' as n from public.audit_log where operation = 'UPDATE' and record_id in ('${E_BS1}', '${E_BS2}') and new_data->>'exercise_name' = 'Barbell Back Squat' order by record_id`)
ok(audit.length === 2 && audit.every(a => a.table_name === 'workout_log_exercises' && a.changed_by === UC1 && a.n === 'Barbell Back Squat') && audit.map(a => a.o).sort().join('|') === 'Back Squat|Back Squat ', 'the live audit trigger fires inside the merge: one audit row per rewritten exercise, attributed to the CALLER (not the function owner), with the old and the new name', audit)
const auditRec = await rowsOf(`select changed_by, old_data->>'name' as o, new_data->>'name' as n from public.audit_log where operation = 'UPDATE' and table_name = 'performance_logs' and record_id = '${P_BS}'`)
ok(auditRec.length === 1 && auditRec[0].changed_by === UC1 && auditRec[0].o === 'Back Squat' && auditRec[0].n === 'Barbell Back Squat', '...and the same for the performance record', auditRec)
let m = await merges(CL1)
ok(m.length === 1 && m[0].from_name === 'Back Squat' && m[0].to_name === 'Barbell Back Squat', 'the merge is recorded for future logging', m)
r = await merge('authenticated', UC1, CL1, 'Back Squat', 'Barbell Back Squat')
ok(!r.error && r.rows[0].v.sessions === 0 && (await merges(CL1)).length === 1, 'merging the same pair again moves nothing and does not duplicate the record', r)

// ── 4. who may NOT, and what is refused ──────────────────────────────────────────────────────────────────────────────────────────────
const L_PROBE = await mkLog(CL1, A), E_PROBE = await mkEx(L_PROBE, 'Probe Lift'), E_PROBE_K = await mkEx(L_PROBE, 'Kept Lift')
for (const [who, role, sub] of [['another client of the same coach', 'authenticated', UC2], ["a client of another coach", 'authenticated', UCB], ['an unrelated coach', 'authenticated', B], ['the solo user', 'authenticated', US]]) {
  r = await merge(role, sub, CL1, 'Probe Lift', 'Kept Lift')
  ok(denied(r) && await exName(E_PROBE) === 'Probe Lift', `${who} CANNOT merge client 1's lifts`, r)
}
r = await merge('authenticated', '', CL1, 'Probe Lift', 'Kept Lift')
ok(denied(r), 'a signed-in caller with no identity cannot', r)
r = await merge('anon', '', CL1, 'Probe Lift', 'Kept Lift')
ok(!!r.error && /permission denied/i.test(r.error), 'an anonymous caller cannot call it at all (execute revoked from anon and PUBLIC)', r)
r = await merge('authenticated', UC1, id(999), 'Probe Lift', 'Kept Lift')
ok(denied(r), 'a client id that does not exist is refused', r)
r = await merge('authenticated', UC1, CL2, 'Back Squat', 'Barbell Back Squat')
ok(denied(r) && await exName(E_C2) === 'Back Squat', 'client 1 CANNOT pass client 2\'s id (the browser-supplied id is not trusted)', r)
for (const [from, to] of [['', 'Kept Lift'], ['Probe Lift', ''], ['  ', 'Kept Lift'], ['Probe Lift', 'Probe Lift']]) {
  r = await merge('authenticated', UC1, CL1, from, to)
  ok(!!r.error && /needed|same name/i.test(r.error), `names that are empty or the same are refused (${JSON.stringify(from)} into ${JSON.stringify(to)})`, r)
}
r = await merge('authenticated', UC1, CL1, 'Probe Lift', 'Totally Invented Lift')
ok(!!r.error && /own lifts/i.test(r.error) && await exName(E_PROBE) === 'Probe Lift', 'a client cannot invent a name for their own history: the kept name must be one of their own lifts', r)
r = await merge('authenticated', UC1, CL1, 'Probe Lift', 'K'.repeat(81))
ok(!!r.error && /80 characters/i.test(r.error), 'a name over 80 characters is refused (the kept one)', r)
r = await merge('authenticated', UC1, CL1, 'F'.repeat(81), 'Kept Lift')
ok(!!r.error && /80 characters/i.test(r.error), '...and the old one', r)
r = await merge('authenticated', UC1, CL1, 'Nothing Logged Under This', 'Kept Lift')
ok(!r.error && r.rows[0].v.sessions + r.rows[0].v.bests + r.rows[0].v.records === 0 && !(await merges(CL1)).some(x => x.from_name === 'Nothing Logged Under This'), 'a merge that moves nothing writes nothing: no junk record', r)
ok(await exName(E_PROBE) === 'Probe Lift', '...and nothing moved')

// ── 5. the coach, and solo ────────────────────────────────────────────────────────────────────────────────────────────────────────────
r = await merge('authenticated', A, CL2, 'Back Squat', 'Barbell Back Squat')
ok(!r.error && r.rows[0].v.sessions === 1 && r.rows[0].v.bests === 1 && r.rows[0].v.records === 1 && await exName(E_C2) === 'Barbell Back Squat', "the COACH merges their client's lifts", r)
ok(await exName(E_B) === 'Back Squat', "...and coach B's client is untouched")
r = await merge('authenticated', US, SO, 'Back Squat', 'Barbell Back Squat')
ok(!r.error && r.rows[0].v.sessions === 1 && await exName(E_S1) === 'Barbell Back Squat' && await nameOf('client_1rms', 'exercise_name', R_S) === 'Barbell Back Squat', 'a SOLO user merges their own lifts (coach_id is NULL on their client row)', r)

// ── 6. case-only merges, stored spelling, padded names on every table ────────────────────────────────────────────────────────────────
// the kept spelling is always one that is STORED, never the caller's casing or spacing
const E_SQL = await mkEx(await mkLog(CL1, A), 'Squat Lift')
r = await merge('authenticated', UC1, CL1, 'Squat Lift', 'barbell back squat')
ok(!r.error && r.rows[0].v.final === 'Barbell Back Squat' && await exName(E_SQL) === 'Barbell Back Squat', 'merging into a lift by different casing (no earlier record) keeps the STORED spelling "Barbell Back Squat", never a lowercase third one', r)
const E_PAD = await mkEx(await mkLog(CL1, A), 'Padded Lift '), E_PADFROM = await mkEx(await mkLog(CL1, A), 'Pad From')
r = await merge('authenticated', UC1, CL1, 'Pad From', 'padded lift')
ok(!r.error && await exName(E_PADFROM) === 'Padded Lift ' && await exName(E_PAD) === 'Padded Lift ', 'merging into a lift whose stored name has a stray space lands on that exact stored name, so the rows really are one lift', r)
// the kept name may exist ONLY as a saved best, or ONLY as a record
const E_BF = await mkEx(await mkLog(CL1, A), 'Best Only From'), R_ONLY = await mkOneRm(CL1, 'Saved Best Only')
r = await merge('authenticated', UC1, CL1, 'Best Only From', 'saved best only')
ok(!r.error && r.rows[0].v.final === 'Saved Best Only' && await exName(E_BF) === 'Saved Best Only', 'the kept lift may exist only as a saved best', r)
const E_RF = await mkEx(await mkLog(CL1, A), 'Record Only From'), P_ONLY = await mkRec(CL1, 'Record Only Lift ')
r = await merge('authenticated', UC1, CL1, 'Record Only From', 'record only lift')
ok(!r.error && r.rows[0].v.final === 'Record Only Lift ' && await exName(E_RF) === 'Record Only Lift ', 'the kept lift may exist only as a performance record (a padded stored spelling is kept exactly)', r)

const L_CASE = await mkLog(CL1, A), E_DJ1 = await mkEx(L_CASE, 'Depth jump'), E_DJ2 = await mkEx(L_CASE, 'Depth Jump'), E_DJ3 = await mkEx(L_CASE, 'depth jump')
const R_DJa = await mkOneRm(CL1, 'Depth jump '), R_DJb = await mkOneRm(CL1, 'Depth Jump'), P_DJa = await mkRec(CL1, 'Depth jump '), P_DJb = await mkRec(CL1, 'Depth Jump')
r = await merge('authenticated', UC1, CL1, 'Depth jump', 'Depth Jump')
ok(!r.error && r.rows[0].v.sessions === 2 && r.rows[0].v.bests === 1 && r.rows[0].v.records === 1, 'a case-only merge (Depth jump into Depth Jump) moves the other spellings on all three tables, a padded saved best and record included', r)
ok(await exName(E_DJ1) === 'Depth Jump' && await exName(E_DJ3) === 'Depth Jump' && await nameOf('client_1rms', 'exercise_name', R_DJa) === 'Depth Jump' && await nameOf('performance_logs', 'name', P_DJa) === 'Depth Jump', '...all now read Depth Jump')
ok(await fromOf('client_1rms', R_DJa) === 'Depth jump ' && await fromOf('performance_logs', P_DJa) === 'Depth jump ', '...the padded ones remember their exact original name')
ok(await fromOf('workout_log_exercises', E_DJ2) === null && await fromOf('client_1rms', R_DJb) === null && await fromOf('performance_logs', P_DJb) === null, '...and the rows ALREADY named Depth Jump are not marked as merged (they were the kept spelling), on all three tables')
r = await merge('authenticated', UC1, CL1, 'Depth jump', 'Depth Jump')
ok(!r.error && r.rows[0].v.sessions + r.rows[0].v.bests + r.rows[0].v.records === 0, 'repeating the case-only merge moves nothing and does not error', r)
const E_XC = await mkEx(await mkLog(CL1, A), 'X Case')
r = await merge('authenticated', UC1, CL1, 'X Case', 'depth jump')
ok(!r.error && r.rows[0].v.final === 'Depth Jump' && await exName(E_XC) === 'Depth Jump', 'merging into a lift by a different casing keeps the STORED spelling (Depth Jump), never a third one', r)

// ── 7. chains, merged-away names and cycles ────────────────────────────────────────────────────────────────────────────────────────────
const L_CH = await mkLog(CL1, A), E_X = await mkEx(L_CH, 'Chain A'), E_Y = await mkEx(L_CH, 'Chain B'), E_Z = await mkEx(L_CH, 'Chain C'), E_D = await mkEx(L_CH, 'Chain D')
const R_CA = await mkOneRm(CL1, 'Chain A'), P_CA = await mkRec(CL1, 'Chain A')
r = await merge('authenticated', UC1, CL1, 'Chain A', 'Chain B')
ok(!r.error && r.rows[0].v.final === 'Chain B', 'chain: A into B', r)
r = await merge('authenticated', UC1, CL1, 'Chain B', 'Chain C')
ok(!r.error && r.rows[0].v.final === 'Chain C' && await exName(E_X) === 'Chain C' && await exName(E_Y) === 'Chain C', 'chain: B into C moves both A\'s and B\'s rows to C', r)
ok(await fromOf('workout_log_exercises', E_X) === 'Chain A' && await fromOf('workout_log_exercises', E_Y) === 'Chain B', '...each still remembers its OWN original name (A\'s rows remember A, not B)')
ok(await nameOf('client_1rms', 'exercise_name', R_CA) === 'Chain C' && await fromOf('client_1rms', R_CA) === 'Chain A' && await nameOf('performance_logs', 'name', P_CA) === 'Chain C' && await fromOf('performance_logs', P_CA) === 'Chain A', '...a saved best and a record do the same: they remember A, not B')
m = await merges(CL1)
ok(m.find(x => x.from_name === 'Chain A')?.to_name === 'Chain C' && m.find(x => x.from_name === 'Chain B')?.to_name === 'Chain C', '...and the earlier record A -> B now points at C (future logging under A lands on C)', m)
r = await merge('authenticated', UC1, CL1, 'Chain A', 'Bench Press')
ok(!!r.error && /already merged/i.test(r.error) && await exName(E_X) === 'Chain C', 'a name that is already merged into another lift cannot be merged elsewhere (it would split its history): undo first', r)
r = await merge('authenticated', UC1, CL1, 'Chain A', 'Chain C')
ok(!r.error && r.rows[0].v.final === 'Chain C' && r.rows[0].v.sessions + r.rows[0].v.bests + r.rows[0].v.records === 0, '...but repeating the merge A already had (A into C, the kept lift) is harmless and moves nothing', r)
r = await merge('authenticated', UC1, CL1, 'Chain A', 'Chain B')
ok(!r.error && r.rows[0].v.final === 'Chain C' && r.rows[0].v.sessions + r.rows[0].v.bests + r.rows[0].v.records === 0, '...and a stale second device repeating "A into B" after B was merged on into C is harmless: it follows the chain to C and moves nothing (no error)', r)
r = await merge('authenticated', UC1, CL1, 'Chain D', 'Chain A')
ok(!r.error && r.rows[0].v.final === 'Chain C' && r.rows[0].v.sessions === 1 && await exName(E_D) === 'Chain C', 'merging INTO a name that was itself merged follows it to the kept one (D into A keeps C)', r)
r = await merge('authenticated', UC1, CL1, 'Chain C', 'Chain A')
ok(!!r.error && /other way round/i.test(r.error) && await exName(E_Z) === 'Chain C', 'a CYCLE (C into A, when A already merges into C) is refused and nothing moves', r)
// the upsert: merging a name that has a case-only record to a NEW target updates that record (a "do nothing" would leave it pointing at the old spelling)
r = await merge('authenticated', UC1, CL1, 'Depth Jump', 'Chain C')
ok(!r.error && (await merges(CL1)).find(x => x.from_name === 'Depth jump')?.to_name === 'Chain C', 'a name whose record points at its own spelling can still be merged on: the record is UPDATED to the new target', r)
// a middle link
const L_MID = await mkLog(CL1, A), E_M1 = await mkEx(L_MID, 'Mid 1'), E_M2 = await mkEx(L_MID, 'Mid 2'), E_M3 = await mkEx(L_MID, 'Mid 3')
await merge('authenticated', UC1, CL1, 'Mid 1', 'Mid 2'); await merge('authenticated', UC1, CL1, 'Mid 2', 'Mid 3')
r = await unmerge('authenticated', UC1, CL1, 'Mid 2')
ok(!r.error && await exName(E_M2) === 'Mid 2' && await exName(E_M1) === 'Mid 3', 'undoing a MIDDLE link (B) puts only B\'s rows back; A\'s rows stay with the kept name', r)
ok((await merges(CL1)).find(x => x.from_name === 'Mid 1')?.to_name === 'Mid 3' && !(await merges(CL1)).some(x => x.from_name === 'Mid 2'), '...A\'s record still points at the kept name, B\'s is gone')
r = await unmerge('authenticated', UC1, CL1, 'Mid 1')
ok(!r.error && await exName(E_M1) === 'Mid 1' && await exName(E_M3) === 'Mid 3', '...and A can then be undone on its own', r)

// ── 8. undo ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const E_NEW = await mkEx(await mkLog(CL1, A), 'Barbell Back Squat')   // logged under the kept name AFTER the merge
r = await unmerge('authenticated', UC2, CL1, 'Back Squat')
ok(denied(r) && await exName(E_BS1) === 'Barbell Back Squat', 'another client CANNOT undo client 1\'s merge', r)
r = await unmerge('anon', '', CL1, 'Back Squat')
ok(!!r.error && /permission denied/i.test(r.error), 'anon cannot undo', r)
r = await unmerge('authenticated', '', CL1, 'Back Squat')
ok(denied(r), 'a signed-in caller with no identity cannot undo', r)
r = await unmerge('authenticated', UC1, CL1, '  ')
ok(!!r.error && /needed/i.test(r.error), 'undo with an empty name is refused', r)
r = await unmerge('authenticated', UC1, CL1, 'Back Squat')
ok(!r.error && r.rows[0].v.sessions === 2 && r.rows[0].v.bests === 1 && r.rows[0].v.records === 1, 'the owner undoes the merge: 2 sessions, 1 best, 1 record come back', r)
ok(await exName(E_BS1) === 'Back Squat' && await exName(E_BS2) === 'Back Squat ' && await fromOf('workout_log_exercises', E_BS1) === null, '...with their exact original names (stray space too) and merged_from cleared')
ok(await nameOf('client_1rms', 'exercise_name', R_BS) === 'Back Squat' && await nameOf('performance_logs', 'name', P_BS) === 'Back Squat', '...saved best and record too')
ok(await exName(E_NEW) === 'Barbell Back Squat' && await exName(E_BBS) === 'Barbell Back Squat', 'a session logged under the kept name since the merge, and the originally-kept rows, STAY under it')
ok(await exName(E_C2) === 'Barbell Back Squat' && await exName(E_S1) === 'Barbell Back Squat', "...and other people's merges are untouched by client 1's undo")
ok(await nameOf('client_1rms', 'exercise_name', R_C2) === 'Barbell Back Squat' && await nameOf('performance_logs', 'name', P_C2) === 'Barbell Back Squat' && await nameOf('client_1rms', 'exercise_name', R_S) === 'Barbell Back Squat' && await nameOf('performance_logs', 'name', P_S) === 'Barbell Back Squat', "...including their saved bests and records, so the undo is limited to the named client on all three tables")
ok(!(await merges(CL1)).some(x => x.from_name === 'Back Squat'), '...and the merge record is gone')
r = await unmerge('authenticated', A, CL2, 'Back Squat')
ok(!r.error && r.rows[0].v.sessions === 1 && await exName(E_C2) === 'Back Squat', 'the coach can undo their client\'s merge', r)

// ── 9. lift_name_merges is read-only to everyone but the functions ──────────────────────────────────────────────────────────────
r = await call('authenticated', UC1, `select count(*)::int as n from public.lift_name_merges`)
ok(!r.error && r.rows[0].n === (await rowsOf(`select count(*)::int as n from public.lift_name_merges where client_id = '${CL1}'`))[0].n && r.rows[0].n > 0, 'a client reads only their OWN merges', r)
r = await call('authenticated', A, `select count(*)::int as n from public.lift_name_merges where client_id = '${CL1}'`)
ok(!r.error && r.rows[0].n > 0, 'the coach reads their client\'s merges', r)
r = await call('authenticated', B, `select count(*)::int as n from public.lift_name_merges where client_id = '${CL1}'`)
ok(!r.error && r.rows[0].n === 0, "another coach sees none of client 1's merges", r)
r = await call('authenticated', UC1, `insert into public.lift_name_merges (client_id, from_name, to_name) values ('${CL1}', 'Sneaky', 'Kept') returning id`)
ok(!!r.error && /permission denied/i.test(r.error), 'a client CANNOT write a merge record directly (permission denied, not just no rows)', r)
r = await call('authenticated', UC1, `update public.lift_name_merges set to_name = 'Hijacked' where client_id = '${CL1}' returning id`)
ok(!!r.error && /permission denied/i.test(r.error), '...nor change one', r)
r = await call('authenticated', UC1, `delete from public.lift_name_merges where client_id = '${CL1}' returning id`)
ok(!!r.error && /permission denied/i.test(r.error), '...nor delete one', r)
r = await call('authenticated', A, `insert into public.lift_name_merges (client_id, from_name, to_name) values ('${CL2}', 'Sneaky', 'Kept') returning id`)
ok(!!r.error && /permission denied/i.test(r.error), '...and neither can a coach', r)
ok(!(await merges(CL1)).some(x => x.to_name === 'Hijacked' || x.from_name === 'Sneaky'), '...and nothing changed in the table')

// ── 10. the documented rollback puts the names BACK, then removes everything ──────────────────────────────────────────────────────────
const rb = SCRIPT.slice(SCRIPT.indexOf('-- ROLLBACK'), SCRIPT.indexOf('-- Safe to run twice'))
const steps = [...rb.matchAll(/^--\s+((?:update public\.|drop function |drop table |alter table )[^;\n]+;)/gm)].map(x => x[1])
ok(steps.length === 9 && steps.filter(s => s.startsWith('update')).length === 3, 'the script documents a rollback: three restore updates first, then two drop function, one drop table, three drop column', steps)
// merges still in place at this point: the solo user's, the chain, the case-only ones. They must all come back.
const before = { solo: await exName(E_S1), chainX: await exName(E_X), chainR: await nameOf('client_1rms', 'exercise_name', R_CA), chainP: await nameOf('performance_logs', 'name', P_CA) }
ok(before.solo === 'Barbell Back Squat' && before.chainX === 'Chain C' && before.chainR === 'Chain C' && before.chainP === 'Chain C', 'before the rollback the merged rows are under their kept names', before)
let rbOk = steps.length === 9
if (rbOk) { try { await db.exec(steps.join(' ')) } catch (e) { rbOk = false; console.log('  rollback error:', String(e.message)) } }
ok(rbOk, 'the documented rollback runs as written, as the superuser with no signed-in user (how the SQL editor runs it)')
ok(await exName(E_S1) === 'Back Squat' && await exName(E_X) === 'Chain A' && await exName(E_Y) === 'Chain B' && await nameOf('client_1rms', 'exercise_name', R_CA) === 'Chain A' && await nameOf('performance_logs', 'name', P_CA) === 'Chain A', '...and every merged name is BACK (solo, chain, saved best, record), so dropping merged_from loses nothing')
ok(await exName(E_DJ1) === 'Depth jump' && await nameOf('client_1rms', 'exercise_name', R_DJa) === 'Depth jump ', '...including the case-only ones, with their exact original spelling')
const left = await rowsOf(`select (select count(*) from pg_proc where proname in ('merge_lift_names','unmerge_lift_names'))::int as f, (select count(*) from information_schema.columns where column_name = 'merged_from')::int as c, to_regclass('public.lift_name_merges')::text as t`)
ok(left[0].f === 0 && left[0].c === 0 && left[0].t === null, '...and nothing is left behind (no function, no column, no table)', left)

done()
