// Verifies scripts/add-client-link-guard-2026-10-18.sql on a real Postgres engine (PGlite) loaded with the live schema and the live policies of `clients` (live-schema.mjs),
// `workout_templates` (live-schema-programs.mjs), `goals` (live-schema-goals.mjs) and `events` (live-schema-events.mjs). It first proves the fixture reproduces the live PROBLEM
// (a coach can point an owned event / template / goal at ANOTHER coach's client) - a verifier that could not reproduce the problem would prove nothing about the fix - then
// runs the script TWICE (idempotency) and checks who is refused, who still works, and the read-back the script ends with. Set MUTATE=m1..m17 to apply one of the deliberate
// breakages in client-link-guard.mutations.mjs - run-mutations.mjs requires each to make this FAIL.
//
//   node scripts/sql-verify/client-link-guard.verify.mjs             # exit 0 = every check passed
//   node scripts/sql-verify/run-mutations.mjs                        # exit 0 = every breakage was caught
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { installLiveSchema } from './live-schema.mjs'
import { installProgramLifecycleSchema } from './live-schema-programs.mjs'
import { installGoalsSchema } from './live-schema-goals.mjs'
import { installEventsSchema } from './live-schema-events.mjs'
import { startHarness, applyMutation } from './harness.mjs'
import { MUTATIONS } from './client-link-guard.mutations.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
let SCRIPT = fs.readFileSync(path.join(here, '..', 'add-client-link-guard-2026-10-18.sql'), 'utf8').replace(/\r\n/g, '\n')
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
await installGoalsSchema(db)
await installEventsSchema(db)

// ── a scenario ────────────────────────────────────────────────────────────────────────────────────────────────
const A = 'a0000000-0000-4000-8000-000000000001', B = 'b0000000-0000-4000-8000-000000000002'              // two coaches (A is also the master account: a coach with a solo record)
const UC = 'c0000000-0000-4000-8000-0000000000c1', US = 'c0000000-0000-4000-8000-0000000000c2', UD = 'c0000000-0000-4000-8000-0000000000c3'   // a coached client, a solo user, a client who detached
const CL = '10000000-0000-4000-8000-000000000001', OTH = '10000000-0000-4000-8000-000000000002', SOA = '10000000-0000-4000-8000-000000000003'
const SO = '10000000-0000-4000-8000-000000000004', DET = '10000000-0000-4000-8000-000000000005'
const E_A = '20000000-0000-4000-8000-000000000001', E_B = '20000000-0000-4000-8000-000000000002', E_UC = '20000000-0000-4000-8000-000000000003'
const T_A = '30000000-0000-4000-8000-000000000001', T_B = '30000000-0000-4000-8000-000000000002', T_DET = '30000000-0000-4000-8000-000000000003'
const G_CL = '40000000-0000-4000-8000-000000000001', G_SOA = '40000000-0000-4000-8000-000000000002'
await db.exec(`
  insert into public.clients (id, coach_id, user_id, full_name, status) values
    ('${CL}',  '${A}', '${UC}', 'Client of coach A', 'active'),
    ('${OTH}', '${B}', null,    'Client of coach B', 'active'),
    ('${SOA}', null,   '${A}',  'Coach A, personal record', 'active'),
    ('${SO}',  null,   '${US}', 'Solo user', 'active'),
    ('${DET}', null,   '${UD}', 'A client who detached from coach A', 'active');
  insert into public.events (id, client_id, created_by, title, is_pt_assigned) values
    ('${E_A}', '${CL}', '${A}', 'event of coach A', true),
    ('${E_B}', '${OTH}', '${B}', 'event of coach B', true),
    ('${E_UC}', '${CL}', '${UC}', 'personal event of the client', false);
  insert into public.workout_templates (id, coach_id, client_id, name) values
    ('${T_A}', '${A}', '${CL}', 'template of coach A'), ('${T_B}', '${B}', '${OTH}', 'template of coach B'), ('${T_DET}', '${A}', '${DET}', 'clone left behind by a detached client');
  insert into public.goals (id, client_id, created_by, title) values
    ('${G_CL}', '${CL}', '${A}', 'goal set for the client'), ('${G_SOA}', '${SOA}', '${A}', 'master personal goal');
`)
const linkOf = async (table, id) => (await rowsOf(`select client_id from public.${table} where id = '${id}'`))[0]?.client_id
const exists = async (table, where) => Number((await rowsOf(`select count(*)::int n from public.${table} where ${where}`))[0].n) > 0
const rls = (r) => !!r.error && /row-level security|policy/i.test(r.error)
const guarded = (r) => !!r.error && /client_id must belong to one of your own clients/.test(r.error)
const restore = (sql) => db.exec(sql).catch(() => {})

// ── 1. CONTROL: before the script the live problem is reproduced, and what is already refused is shown refused ─────────────────────────────
let r = await as('authenticated', A, `insert into public.events (client_id, created_by, title, is_pt_assigned) values ('${OTH}', '${A}', 'direct plant', true)`)
ok(rls(r), 'CONTROL (before the script): a direct INSERT of an event at ANOTHER coach\'s client is refused by row-level security ("coach access" checks it)', r)
r = await as('authenticated', A, `update public.events set client_id = '${OTH}' where id = '${E_A}'`)
ok(!r.error && await linkOf('events', E_A) === OTH, 'CONTROL: a coach can UPDATE their own event to point at ANOTHER coach\'s client - the live problem is reproduced', r)
await restore(`update public.events set client_id = '${CL}' where id = '${E_A}'`)
r = await as('authenticated', A, `insert into public.workout_templates (coach_id, client_id, name) values ('${A}', '${OTH}', 'direct plant')`)
ok(!r.error && await exists('workout_templates', `name = 'direct plant'`), 'CONTROL: a coach can INSERT a template linked to ANOTHER coach\'s client', r)
await restore(`delete from public.workout_templates where name = 'direct plant'`)
r = await as('authenticated', A, `update public.workout_templates set client_id = '${OTH}' where id = '${T_A}'`)
ok(!r.error && await linkOf('workout_templates', T_A) === OTH, 'CONTROL: a coach can UPDATE their own template to point at ANOTHER coach\'s client', r)
await restore(`update public.workout_templates set client_id = '${CL}' where id = '${T_A}'`)
r = await as('authenticated', A, `update public.goals set client_id = '${OTH}' where id = '${G_CL}'`)
ok(rls(r) && await linkOf('goals', G_CL) === CL, 'CONTROL: the same UPDATE on a GOAL is refused today - by a side effect (the moved row fails the SELECT policy), not by the UPDATE policy', r)
r = await as('authenticated', A, `update public.goals set client_id = '${OTH}'`)
ok(!r.error && await linkOf('goals', G_CL) === OTH, 'CONTROL: ...and the side effect is not a guarantee: the same UPDATE without a column in its WHERE moves the goal', r)
await restore(`update public.goals set client_id = '${CL}' where id = '${G_CL}'; update public.goals set client_id = '${SOA}' where id = '${G_SOA}'`)
ok(await linkOf('goals', G_CL) === CL && await linkOf('goals', G_SOA) === SOA, '(put back: both goals are on their own clients again)')

// ── 2. run the migration - twice, to prove it is idempotent ───────────────────────────────────────────────
try { await db.exec(SCRIPT); await db.exec(SCRIPT); ok(true, 'the script runs twice without error (idempotent)') }
catch (e) { ok(false, 'the script runs twice without error (idempotent)', String(e.message)); await new Promise(r => setTimeout(r, 500)); done() }   // a pause first: exiting while the in-memory database is still settling trips a libuv assertion on Windows (a crash code, not exit 1), which the mutation runner reads as an error (db.close() does not help)

// the read-back the script ends with
const readBack = await rowsOf(SCRIPT.slice(SCRIPT.indexOf('-- READ-BACK')))
const fn = readBack.filter(x => x.kind === 'function')
const trg = readBack.filter(x => x.kind === 'trigger')
ok(fn.length === 1 && /security_definer=false/.test(fn[0].detail) && /search_path=public, pg_temp/.test(fn[0].detail), 'read-back: one guard function, invoker rights, fixed search_path', fn)
ok(trg.length === 3 && ['events', 'goals', 'workout_templates'].every(t => trg.some(x => x.name.startsWith(t + ' / ') && /BEFORE INSERT OR UPDATE OF client_id/.test(x.detail))),
  'read-back: one BEFORE INSERT OR UPDATE OF client_id trigger on each of events, goals and workout_templates', trg)
ok((await rowsOf(`select has_function_privilege('anon', 'public.guard_client_id_change()', 'execute') as x`))[0].x === false, 'the guard function is not executable by anon (revoked from public and anon)')

// ── 3. AFTER: what is refused (by the TRIGGER - the message names it, so row-level security is not what is being measured) ─────────────────
r = await as('authenticated', A, `update public.events set client_id = '${OTH}' where id = '${E_A}'`)
ok(guarded(r) && await linkOf('events', E_A) === CL, 'a coach can no longer point an owned EVENT at another coach\'s client (UPDATE with a WHERE)', r)
r = await as('authenticated', A, `update public.events set client_id = '${OTH}'`)
ok(guarded(r) && await linkOf('events', E_A) === CL, '...nor with an UPDATE that has no WHERE at all', r)
r = await as('authenticated', A, `insert into public.events (id, client_id, created_by, title, is_pt_assigned) values ('${E_A}', '${OTH}', '${A}', 'upsert plant', true) on conflict (id) do update set client_id = excluded.client_id`)
ok(guarded(r) && await linkOf('events', E_A) === CL, '...nor through an upsert (INSERT ... ON CONFLICT DO UPDATE)', r)
r = await as('authenticated', A, `insert into public.workout_templates (coach_id, client_id, name) values ('${A}', '${OTH}', 'direct plant')`)
ok(guarded(r) && !await exists('workout_templates', `name = 'direct plant'`), 'a coach can no longer INSERT a TEMPLATE linked to another coach\'s client', r)
r = await as('authenticated', A, `update public.workout_templates set client_id = '${OTH}' where id = '${T_A}'`)
ok(guarded(r) && await linkOf('workout_templates', T_A) === CL, 'nor UPDATE an owned template to point there', r)
r = await as('authenticated', A, `update public.goals set client_id = '${OTH}' where id = '${G_CL}'`)
ok(guarded(r) && await linkOf('goals', G_CL) === CL, 'nor an owned GOAL (UPDATE with a WHERE) - now refused by the guard, not by a side effect', r)
r = await as('authenticated', A, `update public.goals set client_id = '${OTH}'`)
ok(guarded(r) && await linkOf('goals', G_CL) === CL && await linkOf('goals', G_SOA) === SOA, '...nor a goal with no WHERE (the case the side effect did not cover)', r)
r = await as('authenticated', A, `insert into public.goals (client_id, created_by, title) values ('${OTH}', '${A}', 'goal plant')`)
ok(guarded(r) && !await exists('goals', `title = 'goal plant'`), 'nor INSERT a goal there (refused by the guard, which fires before the row-level-security check)', r)
r = await as('authenticated', B, `update public.events set client_id = '${CL}' where id = '${E_B}'`)
ok(guarded(r) && await linkOf('events', E_B) === OTH, 'the other coach is held to the same rule (it works both ways)', r)
r = await as('authenticated', B, `update public.workout_templates set client_id = '${CL}' where id = '${T_B}'`)
ok(guarded(r) && await linkOf('workout_templates', T_B) === OTH, '...for templates too', r)
r = await as('authenticated', US, `insert into public.workout_templates (coach_id, client_id, name) values ('${US}', '${CL}', 'solo plant')`)
ok(guarded(r) && !await exists('workout_templates', `name = 'solo plant'`), 'a solo user cannot link a template to a coach\'s client', r)
r = await as('authenticated', UC, `insert into public.events (client_id, created_by, title, is_pt_assigned) values ('${OTH}', '${UC}', 'client plant', false)`)
ok(guarded(r) && !await exists('events', `title = 'client plant'`), 'a coached client cannot add an event to ANOTHER coach\'s client', r)
r = await as('anon', '', `insert into public.events (client_id, created_by, title) values ('${CL}', null, 'anon plant')`)
ok(!!r.error && !await exists('events', `title = 'anon plant'`), 'an anonymous caller cannot add an event', r)

// ── 4. AFTER: everything legitimate still works ───────────────────────────────────────────────────────────
r = await as('authenticated', A, `insert into public.events (client_id, created_by, title, is_pt_assigned) values ('${CL}', '${A}', 'new event', true)`)
ok(!r.error && await exists('events', `title = 'new event'`), 'a coach can add an event for their own client', r)
r = await as('authenticated', A, `insert into public.events (client_id, created_by, title, is_pt_assigned) values (null, '${A}', 'personal event', false)`)
ok(!r.error && await exists('events', `title = 'personal event'`), 'a coach can add a client-less personal event (client_id null is linked to nobody)', r)
r = await as('authenticated', A, `insert into public.events (client_id, created_by, title, is_pt_assigned) values ('${SOA}', '${A}', 'own record event', false)`)
ok(!r.error && await exists('events', `title = 'own record event'`), 'the master account can add an event on its OWN personal record', r)
r = await as('authenticated', A, `update public.events set title = 'renamed' where id = '${E_A}'`)
ok(!r.error && (await rowsOf(`select title from public.events where id = '${E_A}'`))[0].title === 'renamed', 'a coach can edit their event (client_id not touched, the trigger does not even fire)', r)
r = await as('authenticated', A, `update public.events set client_id = '${CL}', title = 'again' where id = '${E_A}'`)
ok(!r.error && (await rowsOf(`select title from public.events where id = '${E_A}'`))[0].title === 'again', '...and naming client_id with the SAME value is not a re-point', r)
r = await as('authenticated', A, `update public.events set client_id = '${SOA}' where id = '${E_A}'`)
ok(!r.error && await linkOf('events', E_A) === SOA, 'a coach can move their event to another of THEIR OWN records (their personal one)', r)
await restore(`update public.events set client_id = '${CL}' where id = '${E_A}'`)
r = await as('authenticated', UC, `update public.events set title = 'my own note' where id = '${E_UC}'`)
ok(!r.error && (await rowsOf(`select title from public.events where id = '${E_UC}'`))[0].title === 'my own note', 'a coached client can edit their own personal event', r)
r = await as('authenticated', UC, `insert into public.events (client_id, created_by, title, is_pt_assigned) values ('${CL}', '${UC}', 'client event', false)`)
ok(!r.error && await exists('events', `title = 'client event'`), 'a coached client can add an event on their own record', r)
r = await as('authenticated', A, `insert into public.workout_templates (coach_id, client_id, name) values ('${A}', '${CL}', 'client template')`)
ok(!r.error && await exists('workout_templates', `name = 'client template'`), 'a coach can create a template for their own client', r)
r = await as('authenticated', A, `insert into public.workout_templates (coach_id, client_id, name) values ('${A}', null, 'library template')`)
ok(!r.error && await exists('workout_templates', `name = 'library template'`), 'a coach can create a library template (no client)', r)
r = await as('authenticated', A, `insert into public.workout_templates (coach_id, client_id, name) values ('${A}', '${SOA}', 'own record template')`)
ok(!r.error && await exists('workout_templates', `name = 'own record template'`), 'the master account can create a template on its OWN personal record', r)
r = await as('authenticated', US, `insert into public.workout_templates (coach_id, client_id, name) values ('${US}', '${SO}', 'solo template')`)
ok(!r.error && await exists('workout_templates', `name = 'solo template'`), 'a solo user can create a template on their own record', r)
r = await as('authenticated', A, `update public.workout_templates set name = 'renamed clone' where id = '${T_DET}'`)
ok(!r.error && (await rowsOf(`select name from public.workout_templates where id = '${T_DET}'`))[0].name === 'renamed clone', 'a coach can still RENAME a template cloned for a client who has since detached (the propagation path)', r)
r = await as('authenticated', A, `update public.workout_templates set client_id = '${DET}', name = 'renamed again' where id = '${T_DET}'`)
ok(!r.error && (await rowsOf(`select name from public.workout_templates where id = '${T_DET}'`))[0].name === 'renamed again', '...even when the statement names client_id with the unchanged value (the guard checks the CHANGE, not the row)', r)
r = await as('authenticated', A, `insert into public.goals (client_id, created_by, title) values ('${CL}', '${A}', 'new goal')`)
ok(!r.error && await exists('goals', `title = 'new goal'`), 'a coach can set a goal for their own client', r)
r = await as('authenticated', A, `insert into public.goals (client_id, created_by, title) values ('${SOA}', '${A}', 'own goal')`)
ok(!r.error && await exists('goals', `title = 'own goal'`), 'the master account can set a goal on its own record', r)
r = await as('authenticated', UC, `update public.goals set current_value = 5 where id = '${G_CL}'`)
ok(!r.error && Number((await rowsOf(`select current_value from public.goals where id = '${G_CL}'`))[0].current_value) === 5, 'a client can still record progress on their own goal', r)
r = await as('authenticated', A, `update public.goals set title = 'retitled' where id = '${G_CL}'`)
ok(!r.error && (await rowsOf(`select title from public.goals where id = '${G_CL}'`))[0].title === 'retitled', 'a coach can still edit a goal', r)

// ── 4b. the guard's OWN ownership test, with visibility widened ────────────────────────────────────────────────────
// The guard's lookup of the target client runs under the CALLER'S row-level security, and a coach can only SEE their own clients, so under the live read policies
// "is it one of mine?" is also answered by "can I see it?" - the ownership condition is never what refuses another tenant's client. (The same masking the solo-step
// verifier found on 2026-10-15; mutation m17, an ownership test of "true", was not caught without this pass.) So a second pass lets every signed-in user read every
// clients row - a test-only policy, dropped straight after - and the refusals must now come from the guard's own condition. The unmutated script passes all of it.
await db.exec(`create policy "test only: see all clients" on public.clients for select to authenticated using (true);`)
r = await as('authenticated', A, `update public.events set client_id = '${OTH}' where id = '${E_A}'`)
ok(guarded(r) && await linkOf('events', E_A) === CL, 'VISIBILITY WIDENED: a coach is still refused an event at another coach\'s client (the ownership condition, not the read policy, refuses it)', r)
r = await as('authenticated', A, `insert into public.workout_templates (coach_id, client_id, name) values ('${A}', '${OTH}', 'wide plant')`)
ok(guarded(r) && !await exists('workout_templates', `name = 'wide plant'`), 'VISIBILITY WIDENED: ...and a template', r)
r = await as('authenticated', A, `update public.goals set client_id = '${OTH}'`)
ok(guarded(r) && await linkOf('goals', G_CL) === CL, 'VISIBILITY WIDENED: ...and a goal', r)
r = await as('authenticated', US, `insert into public.events (client_id, created_by, title, is_pt_assigned) values ('${CL}', '${US}', 'wide solo plant', false)`)
ok(guarded(r) && !await exists('events', `title = 'wide solo plant'`), 'VISIBILITY WIDENED: a solo user is refused a coached client', r)
r = await as('authenticated', B, `update public.events set client_id = '${SOA}' where id = '${E_B}'`)
ok(guarded(r) && await linkOf('events', E_B) === OTH, 'VISIBILITY WIDENED: a coach is refused ANOTHER user\'s personal record', r)
r = await as('authenticated', A, `update public.events set client_id = '${SOA}' where id = '${E_A}'`)
ok(!r.error && await linkOf('events', E_A) === SOA, 'VISIBILITY WIDENED: ...while the master account is still allowed its OWN personal record', r)
await restore(`update public.events set client_id = '${CL}' where id = '${E_A}'`)
await db.exec(`drop policy "test only: see all clients" on public.clients;`)
// The exemption list names BOTH end-user roles. A role the policies would refuse anyway tells nothing, so for the `anon` half a test-only policy lets anon
// insert events: the guard, not row-level security, must be what refuses it (mutation m18 exempts anon, and an anonymous insert then lands).
await db.exec(`create policy "test only: anon inserts events" on public.events for insert to anon with check (true);`)
r = await as('anon', '', `insert into public.events (client_id, created_by, title) values ('${CL}', null, 'anon wide plant')`)
ok(guarded(r) && !await exists('events', `title = 'anon wide plant'`), 'an ANONYMOUS caller is held to the same rule (row-level security widened for the test, so the guard is what refuses)', r)
await db.exec(`drop policy "test only: anon inserts events" on public.events;`)
ok((await rowsOf(`select count(*)::int n from pg_policies where policyname like 'test only:%'`))[0].n === 0, '(the test-only policies are dropped again)')

// ── 5. the SQL editor / service role are not constrained (they run as a different current_user) ───────────────────────
let adminOk = true
try { await db.exec(`update public.events set client_id = '${OTH}' where id = '${E_A}'`) } catch (e) { adminOk = false; console.log('  admin error:', String(e.message)) }
ok(adminOk && await linkOf('events', E_A) === OTH, 'the SQL editor (postgres) can still re-point a row - admin tooling and migrations are not refused')
await restore(`update public.events set client_id = '${CL}' where id = '${E_A}'`)

// ── 6. the rollback written in the script's header works, and reopens the hole ────────────────────────────────────
const headerRollback = SCRIPT.slice(SCRIPT.indexOf('-- ROLLBACK'), SCRIPT.indexOf('-- Safe to run twice'))
const stmts = headerRollback.match(/drop (?:trigger|function) [^;]+;/g) || []
ok(stmts.length === 4, 'the script documents a rollback of four statements (three triggers, one function)', stmts)
let rollbackOk = stmts.length === 4
if (rollbackOk) { try { await db.exec(stmts.join('\n')) } catch (e) { rollbackOk = false; console.log('  rollback error:', String(e.message)) } }
ok(rollbackOk, 'the documented rollback runs as written')
r = await as('authenticated', A, `update public.events set client_id = '${OTH}' where id = '${E_A}'`)
ok(!r.error && await linkOf('events', E_A) === OTH, '...and after it the re-point works again (the guard really was what stopped it)', r)

done()
