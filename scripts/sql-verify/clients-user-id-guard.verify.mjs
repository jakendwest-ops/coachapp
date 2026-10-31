// Verifies scripts/add-clients-user-id-guard-2026-10-31.sql on a real Postgres engine (PGlite) loaded with the live schema AND the live
// clients policies (live-schema.mjs), with the 2026-09-26 coach_id guard installed too (the two triggers live side by side on clients). It
// first proves the fixture reproduces the live HOLE (a coach can link another person's login to a client row, by INSERT and by UPDATE -
// confirmed against the live API on 2026-10-31 - and that person can then read it), then runs the script TWICE (idempotency) and checks
// who is refused - asserting the GUARD's own message wherever RLS would not have refused anyway - what still works (adding and editing
// clients, a client editing their own row, the service role, the SQL editor), the read-back, and that the documented rollback reopens the
// hole. Set MUTATE=m1..m9 to apply a deliberate breakage from clients-user-id-guard.mutations.mjs — run-mutations.mjs requires each to FAIL.
//
//   node scripts/sql-verify/clients-user-id-guard.verify.mjs        # exit 0 = every check passed
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { installLiveSchema } from './live-schema.mjs'
import { startHarness, applyMutation } from './harness.mjs'
import { MUTATIONS } from './clients-user-id-guard.mutations.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n')
const COACH_ID_GUARD = read('add-clients-coach-id-guard-2026-09-26.sql')
let SCRIPT = read('add-clients-user-id-guard-2026-10-31.sql')
if (process.env.MUTATE) {
  const m = MUTATIONS[process.env.MUTATE]
  if (!m) { console.log('unknown mutation', process.env.MUTATE); process.exit(2) }
  SCRIPT = applyMutation(SCRIPT, m.pairs)
  console.log('MUTATION', process.env.MUTATE, 'applied:', m.why)
}

const { db, ok, rowsOf, as, done } = await startHarness()
console.log('engine:', (await rowsOf('select version()'))[0].version.slice(0, 40))
await installLiveSchema(db)
await db.exec(COACH_ID_GUARD)

// ── a scenario ────────────────────────────────────────────────────────────────────────────────────────────────
const A = 'a0000000-0000-4000-8000-000000000001', B = 'b0000000-0000-4000-8000-000000000002'          // two coaches
const UC = 'c0000000-0000-4000-8000-0000000000c1', V = 'c0000000-0000-4000-8000-0000000000c9'         // a client; a victim (nobody's yet)
const UI = 'c0000000-0000-4000-8000-0000000000c3'                                                     // someone signed up with an invite email
const CL = '10000000-0000-4000-8000-000000000001', EMPTY = '10000000-0000-4000-8000-000000000002'
const INV = '10000000-0000-4000-8000-000000000003', OTH = '10000000-0000-4000-8000-000000000005'
await db.exec(`
  insert into public.clients (id, coach_id, user_id, full_name, email, status) values
    ('${CL}',    '${A}', '${UC}', 'Client of coach A (linked)', null, 'active'),
    ('${EMPTY}', '${A}', null,    'Client of coach A (no login)', null, 'active'),
    ('${INV}',   '${A}', null,    'Has an email, never invited', 'invitee@example.com', 'active'),
    ('${OTH}',   '${B}', null,    'Client of coach B', null, 'active');
`)
const userOf = async (id) => (await rowsOf(`select user_id from public.clients where id = '${id}'`))[0]?.user_id ?? null
const setEmail = (e) => db.exec(`select set_config('request.jwt.claim.email', '${e}', false)`)
const restore = (sql) => db.exec(sql).catch(() => {})
const GUARD = /user_id cannot be set from the app/
let seq = 100
const newId = () => `20000000-0000-4000-8000-${String(seq++).padStart(12, '0')}`
const insertAs = (sub, coach, uid) => { const id = newId(); return as('authenticated', sub, `insert into public.clients (id, coach_id, user_id, full_name) values ('${id}', '${coach}', ${uid ? `'${uid}'` : 'null'}, 'probe') returning id, user_id`).then(r => ({ ...r, id })) }
const drop = (id) => restore(`delete from public.clients where id = '${id}'`)      // superuser clean-up: a row a broken guard let in must not leak into later checks

// ── 1. CONTROL: before the guard the hole is open — the fixture must reproduce it ──────────────────────────────────
let r = await insertAs(A, A, V)
ok(!r.error && r.rows.length === 1 && r.rows[0].user_id === V, 'CONTROL (before the guard): a coach CAN create a client row linked to another person\'s login', r)
await drop(r.id)
r = await as('authenticated', A, `update public.clients set user_id = '${V}' where id = '${EMPTY}' returning user_id`)
ok(!r.error && r.rows.length === 1 && r.rows[0].user_id === V, 'CONTROL (before the guard): a coach CAN link another person\'s login to an existing client', r)
const leak = await as('authenticated', V, `select id from public.clients where id = '${EMPTY}'`)
ok(!leak.error && leak.rows.length === 1, 'CONTROL: ...and that person can then READ the record (the harm)', leak)
await restore(`update public.clients set user_id = null where id = '${EMPTY}'`)
await setEmail('invitee@example.com')
r = await as('authenticated', UI, `update public.clients set user_id = '${UI}'`)
ok(!r.error && await userOf(INV) === UI, 'CONTROL (before the guard): anyone signed up with a client\'s email CAN claim that client\'s row', r)
await restore(`update public.clients set user_id = null where id = '${INV}'`)
await setEmail('')

// ── 2. run the migration — twice, to prove it is idempotent ────────────────────────────────────────────────────────
try { await db.exec(SCRIPT); await db.exec(SCRIPT); ok(true, 'the script runs twice without error (idempotent)') }
catch (e) { ok(false, 'the script runs twice without error (idempotent)', String(e.message)); done() }
const readBack = await rowsOf(SCRIPT.slice(SCRIPT.indexOf('-- READ-BACK')))
const fn = readBack.find(x => x.kind === 'function')
ok(fn && fn.name === 'clients_guard_user_id' && /security_definer=false/.test(fn.detail) && /search_path=public, pg_temp/.test(fn.detail),
  'read-back: the function runs with the CALLER\'s rights (not security definer) and a fixed search_path', fn)
const trg = readBack.filter(x => x.kind === 'trigger' && x.name === 'clients_guard_user_id')
ok(trg.length === 1 && /BEFORE INSERT OR UPDATE ON public\.clients FOR EACH ROW/.test(trg[0].detail),
  'read-back: exactly one clients_guard_user_id trigger, BEFORE INSERT OR UPDATE (every update, not only those naming user_id), per row', trg)
ok(readBack.some(x => x.kind === 'trigger' && x.name === 'clients_guard_coach_id'), 'read-back: the coach_id guard is still there beside it')
const ex = (await rowsOf(`select has_function_privilege('anon', 'public.clients_guard_user_id()', 'EXECUTE') as a`))[0]
ok(ex.a === false, 'the trigger function is revoked from anon (like its siblings)', ex)

// ── 3. AFTER the guard: who is refused (each by the GUARD's message) ───────────────────────────────────────────────
r = await insertAs(A, A, V)
ok(!!r.error && GUARD.test(r.error), 'a coach can NO LONGER create a client row linked to someone else', r)
await drop(r.id)
r = await insertAs(A, A, A)
ok(!!r.error && GUARD.test(r.error), 'nor one linked to THEMSELVES (the invite functions are the only way a row gets a login)', r)
await drop(r.id)
r = await as('authenticated', A, `update public.clients set user_id = '${V}' where id = '${EMPTY}' returning user_id`)
ok(!!r.error && GUARD.test(r.error) && await userOf(EMPTY) === null, 'a coach can NO LONGER link someone else to an existing client', r)
r = await as('authenticated', A, `update public.clients set user_id = '${A}' where id = '${EMPTY}' returning user_id`)
ok(!!r.error && GUARD.test(r.error) && await userOf(EMPTY) === null, 'nor link themselves to their own unclaimed client', r)
r = await as('authenticated', A, `update public.clients set user_id = '${V}' where id = '${CL}' returning user_id`)
ok(!!r.error && GUARD.test(r.error) && await userOf(CL) === UC, 'nor swap a linked client\'s login for someone else\'s', r)
r = await as('authenticated', A, `update public.clients set user_id = null where id = '${CL}' returning user_id`)
ok(!!r.error && GUARD.test(r.error) && await userOf(CL) === UC, 'nor unlink a client\'s login (only the SQL editor or an admin function may)', r)
r = await as('authenticated', A, `insert into public.clients (id, coach_id, user_id, full_name) values ('${EMPTY}', '${A}', null, 'x') on conflict (id) do update set user_id = '${V}' returning user_id`)
ok(!!r.error && GUARD.test(r.error) && await userOf(EMPTY) === null, 'nor through an upsert (INSERT ... ON CONFLICT DO UPDATE SET user_id)', r)
await setEmail('invitee@example.com')
r = await as('authenticated', UI, `update public.clients set user_id = '${UI}'`)
ok(!!r.error && GUARD.test(r.error) && await userOf(INV) === null, 'someone signed up with a client\'s email can NO LONGER claim that row (the claim policy alone allows it)', r)
r = await as('authenticated', UI, `update public.clients set user_id = '${UI}', coach_id = null`)
ok(!!r.error && await userOf(INV) === null, '...nor claim and detach it in one statement (both guards together)', r)
await setEmail('')

// ── 4. AFTER the guard: what must STILL work ───────────────────────────────────────────────────────────────────────
r = await insertAs(A, A, null)
ok(!r.error && r.rows.length === 1 && r.rows[0].user_id === null, 'a coach can still add a client (no login yet)', r)
r = await as('authenticated', A, `update public.clients set notes = 'hello', status = 'inactive', email = 'x@y.co' where id = '${CL}' returning notes`)
ok(!r.error && r.rows.length === 1, 'a coach can still edit a linked client\'s other columns (the trigger now runs on every update and lets these by)', r)
r = await as('authenticated', A, `update public.clients set user_id = '${UC}' where id = '${CL}' returning user_id`)
ok(!r.error && r.rows.length === 1, 'an update that names user_id but leaves it unchanged is allowed', r)
r = await as('authenticated', UC, `update public.clients set starting_weight_kg = 80 where id = '${CL}' returning starting_weight_kg`)
ok(!r.error && r.rows.length === 1, 'a client can still update their own row (weight goals)', r)
r = await as('authenticated', UC, `update public.clients set coach_id = null where id = '${CL}' returning coach_id`)
ok(!r.error && r.rows.length === 1 && r.rows[0].coach_id === null, 'a client can still detach from their coach (the coach_id guard\'s accepted change) with this guard in place', r)
await restore(`update public.clients set coach_id = '${A}' where id = '${CL}'`)

// ── 5. admin paths are never caught ────────────────────────────────────────────────────────────────────────────────
r = await as('service_role', '', `update public.clients set user_id = '${V}' where id = '${OTH}' returning user_id`)
ok(!r.error && r.rows.length === 1 && r.rows[0].user_id === V, 'the service role (the invite Edge Functions) can still link a login', r)
r = await as('service_role', '', `insert into public.clients (id, coach_id, user_id, full_name) values ('${newId()}', null, '${UI}', 'Solo, made by invite-solo-user') returning user_id`)
ok(!r.error && r.rows.length === 1, 'the service role can still create a solo user\'s own linked row (invite-solo-user)', r)
let editorOk = true
try { await db.exec(`update public.clients set user_id = null where id = '${OTH}'`) } catch { editorOk = false }
ok(editorOk && await userOf(OTH) === null, 'the SQL editor (postgres) can still change user_id')

// ── 6. the rollback written in the script's header works, and reopens the hole ─────────────────────────────────────
const dropTrigger = SCRIPT.match(/drop trigger [^;\n]+;/), dropFunction = SCRIPT.match(/drop function [^;\n]+;/)
let rollbackOk = !!dropTrigger && !!dropFunction
if (rollbackOk) { try { await db.exec(dropTrigger[0] + '\n' + dropFunction[0]) } catch (e) { rollbackOk = false; console.log('  rollback error:', String(e.message)) } }
ok(rollbackOk, 'the documented rollback runs as written')
r = await as('authenticated', A, `update public.clients set user_id = '${V}' where id = '${EMPTY}' returning user_id`)
ok(!r.error && r.rows.length === 1, '...and after it a coach can link someone else again (the guard is really gone)', r)

done()
