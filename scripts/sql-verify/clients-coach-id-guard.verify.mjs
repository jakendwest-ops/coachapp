// Verifies scripts/add-clients-coach-id-guard-2026-09-26.sql on a real Postgres engine (PGlite) loaded with the live schema AND
// the live UPDATE policies on `clients` (live-schema.mjs). It first proves the fixture reproduces the live HOLE (a client can
// re-point their own row at another coach) — a verifier that could not reproduce the problem would prove nothing about the fix —
// then runs the script TWICE (idempotency) and checks who is refused, who still works, and the read-back the script ends with.
// Set MUTATE=m1..m10 to apply one of the deliberate breakages in clients-coach-id-guard.mutations.mjs — run-mutations.mjs
// requires each to make this FAIL.
//
//   node scripts/sql-verify/clients-coach-id-guard.verify.mjs        # exit 0 = every check passed
//   node scripts/sql-verify/run-mutations.mjs                        # exit 0 = every breakage was caught
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { installLiveSchema } from './live-schema.mjs'
import { startHarness, applyMutation } from './harness.mjs'
import { MUTATIONS } from './clients-coach-id-guard.mutations.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
let SCRIPT = fs.readFileSync(path.join(here, '..', 'add-clients-coach-id-guard-2026-09-26.sql'), 'utf8').replace(/\r\n/g, '\n')
if (process.env.MUTATE) {
  const m = MUTATIONS[process.env.MUTATE]
  if (!m) { console.log('unknown mutation', process.env.MUTATE); process.exit(2) }
  SCRIPT = applyMutation(SCRIPT, m.pairs)
  console.log('MUTATION', process.env.MUTATE, 'applied:', m.why)
}

const { db, ok, rowsOf, as, done } = await startHarness()
console.log('engine:', (await rowsOf('select version()'))[0].version.slice(0, 40))
await installLiveSchema(db)

// ── a scenario ────────────────────────────────────────────────────────────────────────────────────────────────
const A = 'a0000000-0000-4000-8000-000000000001', B = 'b0000000-0000-4000-8000-000000000002'          // two coaches
const UC = 'c0000000-0000-4000-8000-0000000000c1', US = 'c0000000-0000-4000-8000-0000000000c2'        // a client and a solo user
const UI = 'c0000000-0000-4000-8000-0000000000c3', UI2 = 'c0000000-0000-4000-8000-0000000000c4'       // two invitees
const CL = '10000000-0000-4000-8000-000000000001', SO = '10000000-0000-4000-8000-000000000002'
const INV = '10000000-0000-4000-8000-000000000003', INV2 = '10000000-0000-4000-8000-000000000004'
const OTH = '10000000-0000-4000-8000-000000000005', MAS = '10000000-0000-4000-8000-000000000006'
await db.exec(`
  insert into public.clients (id, coach_id, user_id, full_name, email, status) values
    ('${CL}',  '${A}', '${UC}', 'Client of coach A', null, 'active'),
    ('${SO}',  null,   '${US}', 'Solo user (no coach)', null, 'active'),
    ('${INV}', '${A}', null,    'Invited, unclaimed', 'invitee@example.com', 'active'),
    ('${INV2}','${A}', null,    'Invited, unclaimed too', 'invitee2@example.com', 'active'),
    ('${OTH}', '${B}', null,    'Client of coach B', null, 'active'),
    ('${MAS}', '${A}', '${A}',  'Coach A as their own client', null, 'active');
`)
const coachOf = async (id) => (await rowsOf(`select coach_id from public.clients where id = '${id}'`))[0]?.coach_id
const setEmail = (e) => db.exec(`select set_config('request.jwt.claim.email', '${e}', false)`)
const upd = (id, set) => `update public.clients set ${set} where id = '${id}' returning id, coach_id, user_id`
// An invitee's unclaimed row passes no SELECT policy, so a statement with a WHERE or a RETURNING (which need SELECT rights) would
// simply match nothing (measured 2026-09-26). The claim policy's own USING (email + unclaimed) is what selects the row, so the
// invitee statements carry NO filter and NO RETURNING, and the outcome is read back as the superuser.
const claim = (uid, set) => `update public.clients set user_id = '${uid}'${set ? ', ' + set : ''}`
const rowOf = async (id) => (await rowsOf(`select coach_id, user_id from public.clients where id = '${id}'`))[0]
// a superuser put-back between checks: under a mutation that breaks the exemption it would itself be refused, which must not crash the run
const restore = (sql) => db.exec(sql).catch(() => {})
// A client (or the owner) can also reach coach_id through an upsert: INSERT passes the "Coach manages clients" check when the row's
// coach_id is the caller's own uid, then DO UPDATE writes that coach_id onto the existing row.
const upsert = `insert into public.clients (id, coach_id, full_name) values ('${CL}', '${UC}', 'Upsert probe')
  on conflict (id) do update set coach_id = excluded.coach_id returning id, coach_id`

// ── 1. CONTROL: before the guard the hole is open — the fixture must reproduce it ──────────────────────────────────
let r = await as('authenticated', UC, upd(CL, `coach_id = '${B}'`))
ok(!r.error && r.rows.length === 1 && r.rows[0].coach_id === B, 'CONTROL (before the guard): a client CAN re-point their own row at another coach — the live hole is reproduced', r)
await db.exec(`update public.clients set coach_id = '${A}' where id = '${CL}'`)
r = await as('authenticated', US, upd(SO, `coach_id = '${B}'`))
ok(!r.error && r.rows.length === 1 && r.rows[0].coach_id === B, 'CONTROL (before the guard): a solo user CAN attach their own record to a coach', r)
await db.exec(`update public.clients set coach_id = null where id = '${SO}'`)
r = await as('authenticated', UC, upsert)
ok(!r.error && r.rows.length === 1 && r.rows[0].coach_id === UC, 'CONTROL (before the guard): a client CAN attach their own row to themselves as its coach with an upsert (INSERT ... ON CONFLICT DO UPDATE)', r)
await db.exec(`update public.clients set coach_id = '${A}' where id = '${CL}'`)
await setEmail('invitee2@example.com')
r = await as('authenticated', UI2, claim(UI2, `coach_id = '${B}'`))
let row = await rowOf(INV2)
ok(!r.error && row.user_id === UI2 && row.coach_id === B, 'CONTROL (before the guard): an invitee claiming their row CAN point it at another coach in the same statement', { r, row })
await db.exec(`update public.clients set user_id = null, coach_id = '${A}' where id = '${INV2}'`)
await setEmail('')

// ── 2. run the migration — twice, to prove it is idempotent ────────────────────────────────────────────────────────
try { await db.exec(SCRIPT); await db.exec(SCRIPT); ok(true, 'the script runs twice without error (idempotent)') }
catch (e) { ok(false, 'the script runs twice without error (idempotent)', String(e.message)); done() }

// the read-back the script ends with
const readBack = await rowsOf(SCRIPT.slice(SCRIPT.indexOf('-- READ-BACK')))
const fn = readBack.find(x => x.kind === 'function')
ok(fn && fn.name === 'clients_guard_coach_id' && /security_definer=false/.test(fn.detail) && /search_path=public, pg_temp/.test(fn.detail),
  'read-back: the function runs with the CALLER\'s rights (not security definer) and a fixed search_path', fn)
const trg = readBack.filter(x => x.kind === 'trigger' && x.name === 'clients_guard_coach_id')
ok(trg.length === 1 && /BEFORE UPDATE OF coach_id ON public\.clients FOR EACH ROW/.test(trg[0].detail),
  'read-back: exactly one clients_guard_coach_id trigger, BEFORE UPDATE OF coach_id, per row', trg)

// ── 3. AFTER the guard: who is refused ─────────────────────────────────────────────────────────────────────────────
r = await as('authenticated', UC, upd(CL, `coach_id = '${B}'`))
ok(!!r.error && /coach_id cannot be changed/.test(r.error), 'a client can NO LONGER re-point their own row at another coach', r)
ok(await coachOf(CL) === A, '...and the row still belongs to coach A')
r = await as('authenticated', UC, upsert)
ok(!!r.error && /coach_id cannot be changed/.test(r.error), 'nor can they do it with an upsert (INSERT ... ON CONFLICT DO UPDATE SET coach_id)', r)
ok(await coachOf(CL) === A, '...and the upsert left the row with coach A')

r = await as('authenticated', US, upd(SO, `coach_id = '${B}'`))
ok(!!r.error && /coach_id cannot be changed/.test(r.error), 'a solo user can no longer attach their own record to a coach', r)
ok(await coachOf(SO) === null, '...and the solo record still has no coach')

r = await as('authenticated', A, upd(CL, `coach_id = '${B}'`))
ok(!!r.error, 'a coach cannot move their own client to another coach (a control: the policy refuses this with or without the guard)', r)
ok(await coachOf(CL) === A, '...and the client is still coach A\'s')

// the owner's master record (coach_id and user_id are both theirs): clients_update_own_row lets this through, only the guard stops it
r = await as('authenticated', A, upd(MAS, `coach_id = '${B}'`))
ok(!!r.error && /coach_id cannot be changed/.test(r.error) && await coachOf(MAS) === A, 'a coach who is also a client (their own master record) cannot re-point it at another coach either', r)

// an invitee claiming their row must not be able to move it in the same statement
await setEmail('invitee2@example.com')
r = await as('authenticated', UI2, claim(UI2, `coach_id = '${B}'`))
ok(!!r.error && /coach_id cannot be changed/.test(r.error), 'an invitee claiming their row CANNOT point it at another coach in the same statement', r)
r = await as('authenticated', UI2, claim(UI2, 'coach_id = null'))
ok(!!r.error && /coach_id cannot be changed/.test(r.error), 'nor detach it in the same statement (they are not yet the row\'s client)', r)
row = await rowOf(INV2)
ok(row.coach_id === A && row.user_id === null, '...and the row is still unclaimed and coach A\'s', row)
await setEmail('')

// ── 4. AFTER the guard: what must STILL work ───────────────────────────────────────────────────────────────────────
r = await as('authenticated', UC, upd(CL, 'coach_id = null'))
ok(!r.error && r.rows.length === 1 && r.rows[0].coach_id === null, 'a client can still DETACH themselves (the accepted behaviour)', r)
r = await as('authenticated', UC, upd(CL, `coach_id = '${A}'`))
ok(!!r.error && /coach_id cannot be changed/.test(r.error), '...but cannot then attach themselves to a coach again, even the old one', r)
ok(await coachOf(CL) === null, '...so the detach is one-way from the client\'s side (undone only in the SQL editor)')
await restore(`update public.clients set coach_id = '${A}' where id = '${CL}'`)
r = await as('authenticated', A, upd(MAS, 'coach_id = null'))
ok(!r.error && r.rows.length === 1 && r.rows[0].coach_id === null, 'the owner can still detach their own master record (their own row: user_id is theirs)', r)
await restore(`update public.clients set coach_id = '${A}' where id = '${MAS}'`)

r = await as('authenticated', UC, `update public.clients set starting_weight_kg = 80, goal_weight_kg = 75 where id = '${CL}' returning starting_weight_kg`)
ok(!r.error && r.rows.length === 1 && Number(r.rows[0].starting_weight_kg) === 80, 'a client can still update their own weight goals (the reason the policy exists)', r)
r = await as('authenticated', UC, upd(CL, `coach_id = '${A}'`))
ok(!r.error && r.rows.length === 1, 'an update that names coach_id but leaves it unchanged is allowed', r)
r = await as('authenticated', US, upd(SO, 'coach_id = null'))
ok(!r.error && r.rows.length === 1, 'the same for a solo record (null to null)', r)

r = await as('authenticated', A, `update public.clients set notes = 'hello', status = 'inactive' where id = '${CL}' returning notes`)
ok(!r.error && r.rows.length === 1 && r.rows[0].notes === 'hello', 'a coach can still edit their own client\'s other columns', r)
await db.exec(`update public.clients set status = 'active', notes = null where id = '${CL}'`)
r = await as('authenticated', A, `update public.clients set notes = 'hijack' where id = '${OTH}' returning id`)
ok(!r.error && r.rows.length === 0, 'a coach still cannot touch another coach\'s client (no row is visible to update)', r)

await setEmail('invitee@example.com')
r = await as('authenticated', UI, claim(UI, ''))
row = await rowOf(INV)
ok(!r.error && row.user_id === UI && row.coach_id === A, 'invite acceptance still works: an invitee claims their own unclaimed row, and its coach is unchanged', { r, row })
await setEmail('')

// ── 5. admin paths are never caught ────────────────────────────────────────────────────────────────────────────────
r = await as('service_role', '', upd(CL, `coach_id = '${B}'`))
ok(!r.error && r.rows.length === 1 && r.rows[0].coach_id === B, 'the service role (Edge Functions) can still change coach_id', r)
await restore(`update public.clients set coach_id = '${A}' where id = '${CL}'`)
// a different row and a real change (B to A), so this fails on its own if the exemption is removed rather than riding on the check above
let editorOk = true
try { await db.exec(`update public.clients set coach_id = '${A}' where id = '${OTH}'`) } catch { editorOk = false }
ok(editorOk && await coachOf(OTH) === A, 'the SQL editor (postgres) can still change coach_id')

r = await as('anon', '', upd(CL, `coach_id = '${B}'`))
ok((!!r.error || r.rows.length === 0) && await coachOf(CL) === A, 'an anonymous caller changes nothing (a control: RLS gives anon no rows, so the guard\'s anon clause is defence in depth)', r)

// ── 6. the rollback written in the script's header works, and reopens the hole ─────────────────────────────────────
const dropTrigger = SCRIPT.match(/drop trigger [^;\n]+;/), dropFunction = SCRIPT.match(/drop function [^;\n]+;/)
ok(!!dropTrigger && !!dropFunction, 'the script documents a rollback (drop trigger, drop function)')
let rollbackOk = !!dropTrigger && !!dropFunction
if (rollbackOk) { try { await db.exec(dropTrigger[0] + '\n' + dropFunction[0]) } catch (e) { rollbackOk = false; console.log('  rollback error:', String(e.message)) } }
ok(rollbackOk, 'the documented rollback runs as written')
r = await as('authenticated', UC, upd(CL, `coach_id = '${B}'`))
ok(!r.error && r.rows.length === 1 && r.rows[0].coach_id === B, '...and after it a client can re-point again (the guard is really gone)', r)

done()
