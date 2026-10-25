// Verifies scripts/harden-anon-access-2026-10-18.sql on a real Postgres engine (PGlite) loaded with the live tables (every mirror in this folder) in a Supabase-shaped
// environment: anon and authenticated hold every privilege on every new table (the default privileges installLiveSchema sets, as Supabase does) and every function starts
// executable by PUBLIC. It first proves the fixture reproduces the live EXPOSURE (anon can attempt SELECT/INSERT/UPDATE/DELETE on every table and execute every function),
// then runs the script TWICE (idempotency) and checks that anon lost all of it, that signed-in users lost NOTHING, that objects created later stay locked, and the read-back
// the script ends with. Set MUTATE=m1..m12 to apply one of the deliberate breakages in harden-anon-access.mutations.mjs - run-mutations.mjs requires each to make this FAIL.
//
//   node scripts/sql-verify/harden-anon-access.verify.mjs            # exit 0 = every check passed
//   node scripts/sql-verify/run-mutations.mjs                        # exit 0 = every breakage was caught
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { installLiveSchema } from './live-schema.mjs'
import { installProgramLifecycleSchema } from './live-schema-programs.mjs'
import { installGoalsSchema } from './live-schema-goals.mjs'
import { installEventsSchema } from './live-schema-events.mjs'
import { startHarness, applyMutation } from './harness.mjs'
import { MUTATIONS } from './harden-anon-access.mutations.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
let SCRIPT = fs.readFileSync(path.join(here, '..', 'harden-anon-access-2026-10-18.sql'), 'utf8').replace(/\r\n/g, '\n')
if (process.env.MUTATE) {
  const m = MUTATIONS[process.env.MUTATE]
  if (!m) { console.log('unknown mutation', process.env.MUTATE); process.exit(2) }
  SCRIPT = applyMutation(SCRIPT, m.pairs)
  console.log('MUTATION', process.env.MUTATE, 'applied:', m.why)
}

const { db, ok, rowsOf, as, done } = await startHarness()
console.log('engine:', (await rowsOf('select version()'))[0].version.slice(0, 40))
await installLiveSchema(db)
// delete_current_user() is created BEFORE the programs mirror below, which sets Supabase's default function grants (to anon, authenticated, service_role) for
// everything created after it. So this one is executable by PUBLIC only - the case where the script's own explicit `grant execute ... to authenticated` is what keeps
// a signed-in user able to call it once PUBLIC is revoked (without this ordering mutation m9 survives: the default grant made the script's own redundant).
await db.exec(`create function public.delete_current_user() returns void language plpgsql as $$ begin perform 1; end; $$;`)
await installProgramLifecycleSchema(db)
await installGoalsSchema(db)
await installEventsSchema(db)
// (live-schema-programs.mjs has already set the default FUNCTION grants; installLiveSchema sets the table ones.)
// Supabase's default grants for SEQUENCES too, then a table with a serial column so there is a sequence to protect.
await db.exec(`alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
  create table public.seq_probe (id bigserial primary key, note text);`)
// The relations already closed to anon on the LIVE project (inventory 2026-10-18): app_errors, the 2026-08-09 backup (also closed to signed-in users) and, from the
// programs mirror, client_program_blocks. The script must leave them closed, and its rollback must put them back that way.
await db.exec(`create table public.app_errors (id uuid primary key default gen_random_uuid(), kind text);
  create table public._cardio_merge_backup_2026_08_09 (id uuid primary key default gen_random_uuid());
  revoke all on public.app_errors, public._cardio_merge_backup_2026_08_09 from anon;
  revoke all on public._cardio_merge_backup_2026_08_09 from authenticated;`)

// The functions the script names. Two already exist in the programs mirror (with their real bodies and triggers); the rest are stand-ins with the live signature.
const NAMES = ['app_errors_rate_limit', 'clients_guard_coach_id', 'delete_current_user', 'handle_new_user', 'lock_created_at', 'log_audit_event',
  'set_workout_template_family_id', 'touch_parent_workout_template', 'touch_workout_template_updated_at']
const have = new Set((await rowsOf(`select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`)).map(x => x.proname))
for (const n of [...NAMES, 'mock_openapi']) {
  if (have.has(n)) continue
  const ret = n === 'delete_current_user' ? 'void' : n === 'mock_openapi' ? 'json' : 'trigger'
  const body = ret === 'void' ? 'begin perform 1; end;' : ret === 'json' ? `begin return '{}'::json; end;` : 'begin return new; end;'
  await db.exec(`create function public.${n}() returns ${ret} language plpgsql as $$ ${body} $$;`)
}
const FUNCS = [...NAMES, 'mock_openapi']

const A = 'a0000000-0000-4000-8000-000000000001'
const CL = '10000000-0000-4000-8000-000000000001'
await db.exec(`insert into public.clients (id, coach_id, full_name, status) values ('${CL}', '${A}', 'Client of coach A', 'active');`)
const tables = (await rowsOf(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r','p','v','m') order by 1`)).map(x => x.relname)
const priv = async (role, table, p) => (await rowsOf(`select has_table_privilege('${role}', 'public.${table}', '${p}') as x`))[0].x
const execs = async (role, fn) => (await rowsOf(`select has_function_privilege('${role}', 'public.${fn}()', 'execute') as x`))[0].x
const denied = (r) => !!r.error && /permission denied/i.test(r.error)

// ── 1. CONTROL: the live exposure is reproduced ───────────────────────────────────────────────────────────────
// What signed-in users hold now, to prove afterwards that they lost nothing. (Not "all four on every table": client_program_blocks is INSERT/SELECT only by design.)
const authBefore = {}
for (const t of tables) for (const p of ['select', 'insert', 'update', 'delete']) authBefore[t + ':' + p] = await priv('authenticated', t, p)
// client_program_blocks is the one table already locked against anon on the LIVE project (inventory 2026-10-18: anon=none authenticated=SI), and the programs mirror reproduces that.
const exposed = []
for (const t of tables) {
  const same = (await Promise.all(['select', 'insert', 'update', 'delete'].map(p => priv('anon', t, p)))).every((x, i) => x === authBefore[t + ':' + ['select', 'insert', 'update', 'delete'][i]])
  if (await priv('anon', t, 'select') && same) exposed.push(t)
}
const locked = tables.filter(t => !exposed.includes(t)).sort()
const LOCKED_ON_LIVE = ['_cardio_merge_backup_2026_08_09', 'app_errors', 'client_program_blocks'].sort()
ok(tables.length >= 14 && exposed.length === tables.length - 3 && locked.join() === LOCKED_ON_LIVE.join(), `CONTROL (before the script): anon holds every privilege signed-in users hold on ${exposed.length} of ${tables.length} mirrored tables (the other 3 are already closed, as live) - the live exposure is reproduced`, { exposed: exposed.length, locked })
const seqPriv = async (role, seq, p) => (await rowsOf(`select has_sequence_privilege('${role}', 'public.${seq}', '${p}') as x`))[0].x
ok(await seqPriv('anon', 'seq_probe_id_seq', 'usage') && await seqPriv('anon', 'seq_probe_id_seq', 'update'), 'CONTROL: anon can use and advance a sequence (nextval) - sequences are part of the exposure')
let anonFns = 0
for (const f of FUNCS) if (await execs('anon', f)) anonFns++
ok(anonFns === FUNCS.length, `CONTROL: anon can execute all ${FUNCS.length} functions`, anonFns)
let r = await as('anon', '', `select id from public.clients`)
ok(!r.error && r.rows.length === 0, 'CONTROL: a signed-out read of clients is ANSWERED (empty, because RLS hides every row) - the wall is RLS alone', r)

// ── 2. run the migration - twice, to prove it is idempotent ───────────────────────────────────────────────
try { await db.exec(SCRIPT); await db.exec(SCRIPT); ok(true, 'the script runs twice without error (idempotent)') }
catch (e) { ok(false, 'the script runs twice without error (idempotent)', String(e.message)); await new Promise(r => setTimeout(r, 500)); done() }

// the read-back the script ends with
const rb = Object.fromEntries((await rowsOf(SCRIPT.slice(SCRIPT.indexOf('-- READ-BACK')))).map(x => [x.check_name, x.result]))
ok(rb['anon tables with any privilege'] === '0', 'read-back: anon has a privilege on 0 tables', rb)
ok(rb['anon sequences with any privilege'] === '0', 'read-back: anon has a privilege on 0 sequences', rb)
ok(rb['functions anon can execute'] === 'mock_openapi', 'read-back: the only function anon can still execute is mock_openapi', rb)
ok(rb['delete_current_user executable by authenticated'] === 'true', 'read-back: delete_current_user is executable by authenticated', rb)
ok(rb['tables authenticated cannot select (expect only the 2026-08-09 backup)'] === '_cardio_merge_backup_2026_08_09', 'read-back: signed-in users can still read every table except the 2026-08-09 backup (closed to them on live too)', rb)

// ── 3. AFTER: anon has nothing ────────────────────────────────────────────────────────────────────────────
// ALL seven table privileges, not just the four the app uses: `revoke select, insert, update, delete` would leave truncate, references and trigger behind.
const ALL_PRIVS = ['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']
let leftover = []
for (const t of tables) for (const p of ALL_PRIVS) if (await priv('anon', t, p)) leftover.push(t + ':' + p)
ok(leftover.length === 0, 'anon holds NO privilege of any kind (all seven) on any table or view', leftover.slice(0, 5))
ok(!(await seqPriv('anon', 'seq_probe_id_seq', 'usage')) && !(await seqPriv('anon', 'seq_probe_id_seq', 'update')) && !(await seqPriv('anon', 'seq_probe_id_seq', 'select')), 'anon holds no privilege on a sequence (it can no longer advance one)')
r = await as('anon', '', `select nextval('public.seq_probe_id_seq')`)
ok(denied(r), 'a signed-out nextval() is refused', r)
ok(await seqPriv('authenticated', 'seq_probe_id_seq', 'usage'), '...while a signed-in user keeps the sequence')
r = await as('anon', '', `select id from public.clients`)
ok(denied(r), 'a signed-out read now fails with "permission denied" instead of an empty list', r)
r = await as('anon', '', `insert into public.events (title) values ('anon plant')`)
ok(denied(r), 'a signed-out INSERT fails with "permission denied"', r)
for (const f of NAMES) { r = await as('anon', '', `select public.${f}()`); if (!denied(r)) ok(false, `anon cannot call ${f}()`, r) }
ok(true, `anon is refused on all ${NAMES.length} revoked functions`)
ok(await execs('anon', 'mock_openapi'), 'mock_openapi() is untouched (it answers the API root listing)')

// ── 4. AFTER: signed-in users lost nothing ────────────────────────────────────────────────────────────────
let lost = []
for (const [k, had] of Object.entries(authBefore)) { const [t, p] = k.split(':'); if (had && !(await priv('authenticated', t, p))) lost.push(k) }
ok(lost.length === 0 && Object.values(authBefore).filter(Boolean).length >= 60, 'authenticated holds every privilege it held before, on every table', lost.slice(0, 5))
r = await as('authenticated', A, `select id from public.clients`)
ok(!r.error && r.rows.length === 1, 'a coach still reads their own client', r)
r = await as('authenticated', A, `insert into public.events (client_id, created_by, title, is_pt_assigned) values ('${CL}', '${A}', 'still works', true)`)
ok(!r.error, 'a coach still adds an event', r)
r = await as('authenticated', A, `select public.delete_current_user()`)
ok(!r.error, 'a signed-in user can still call delete_current_user() (the explicit grant)', r)
// firing a trigger does not check the caller's EXECUTE right: DML that fires set_workout_template_family_id / touch_parent_workout_template must still work for a signed-in coach.
// (In the mirror PUBLIC held the only execute right, so after the script `authenticated` has none - exactly the case that must not matter.)
r = await as('authenticated', A, `insert into public.workout_templates (coach_id, client_id, name) values ('${A}', '${CL}', 'fires triggers')`)
ok(!r.error, 'DML that FIRES a trigger function whose EXECUTE was revoked still works (firing is not an EXECUTE check)', r)

// ── 5. objects created LATER stay locked ──────────────────────────────────────────────────────────────────
await db.exec(`create table public.later_table (id uuid primary key default gen_random_uuid()); create function public.later_fn() returns int language sql as $$ select 1 $$;`)
ok(!(await priv('anon', 'later_table', 'select')) && !(await priv('anon', 'later_table', 'insert')), 'a table created after the script gives anon nothing (default privileges)')
ok(await priv('authenticated', 'later_table', 'select') && await priv('authenticated', 'later_table', 'insert'), '...and signed-in users still get their usual access to it')
const acl = (await rowsOf(`select proacl::text as a from pg_proc where proname = 'later_fn'`))[0].a || ''
ok(!/anon=/.test(acl) && /authenticated=/.test(acl), 'a function created after the script has no explicit anon grant from the default privileges, and signed-in users still get theirs (PUBLIC execute is a Postgres default this script cannot change - see its header)', acl)
await db.exec(`create table public.later_seq (id bigserial primary key);`)
ok(!(await seqPriv('anon', 'later_seq_id_seq', 'usage')) && (await seqPriv('authenticated', 'later_seq_id_seq', 'usage')), 'a sequence created after the script is not usable by anon, and signed-in users keep theirs (default privileges)')

// ── 6. the rollback written in the script's header works, and restores the exposure ──────────────────────────────────
const rollbackBlock = SCRIPT.slice(SCRIPT.indexOf('-- ROLLBACK'), SCRIPT.indexOf('-- Safe to run twice'))
const stmts = rollbackBlock.match(/(?:grant|revoke|alter default privileges) [^;]+;/g) || []
ok(stmts.length === 6, 'the script documents a rollback of six statements', stmts)
let rollbackOk = stmts.length === 6
if (rollbackOk) { try { await db.exec(stmts.join('\n')) } catch (e) { rollbackOk = false; console.log('  rollback error:', String(e.message)) } }
ok(rollbackOk, 'the documented rollback runs as written')
ok(await priv('anon', 'clients', 'select') && await priv('anon', 'events', 'insert') && await seqPriv('anon', 'seq_probe_id_seq', 'usage'), '...and after it anon holds its privileges again on tables and sequences (the revoke really was what removed them)')
const closedAgain = []
for (const t of LOCKED_ON_LIVE) for (const p of ['select', 'insert', 'update', 'delete']) if (await priv('anon', t, p)) closedAgain.push(t + ':' + p)
ok(closedAgain.length === 0, '...EXCEPT the three relations that were already closed to anon: the rollback is exact, it re-closes them', closedAgain.slice(0, 4))

done()
