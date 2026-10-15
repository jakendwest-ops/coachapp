// Verifies scripts/add-solo-goal-milestones-policy-2026-10-15.sql on a real Postgres engine (PGlite) loaded with the live `clients` table and policies
// (live-schema.mjs) AND the live goals / goal_milestones / goal_check_ins policies, verbatim from the pg_policies read of 2026-10-15 (live-schema-goals.mjs).
// It first proves the fixture reproduces the live PROBLEM (a solo user's step insert is refused while reading and ticking already work), then runs the script
// TWICE (idempotency) and checks who can add a step and who still cannot, that nothing broader than an INSERT was granted, and the read-back the script ends
// with. Set MUTATE=m1..m9 to apply one of the deliberate breakages in solo-goal-milestones.mutations.mjs - run-mutations.mjs requires each to make this FAIL.
//
//   node scripts/sql-verify/solo-goal-milestones.verify.mjs          # exit 0 = every check passed
//   node scripts/sql-verify/run-mutations.mjs                        # exit 0 = every breakage was caught
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { installLiveSchema } from './live-schema.mjs'
import { installGoalsSchema } from './live-schema-goals.mjs'
import { startHarness, applyMutation } from './harness.mjs'
import { MUTATIONS } from './solo-goal-milestones.mutations.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
let SCRIPT = fs.readFileSync(path.join(here, '..', 'add-solo-goal-milestones-policy-2026-10-15.sql'), 'utf8').replace(/\r\n/g, '\n')
if (process.env.MUTATE) {
  const m = MUTATIONS[process.env.MUTATE]
  if (!m) { console.log('unknown mutation', process.env.MUTATE); process.exit(2) }
  SCRIPT = applyMutation(SCRIPT, m.pairs)
  console.log('MUTATION', process.env.MUTATE, 'applied:', m.why)
}

const { db, ok, rowsOf, as, done } = await startHarness()
console.log('engine:', (await rowsOf('select version()'))[0].version.slice(0, 40))
await installLiveSchema(db)
await installGoalsSchema(db)

// ── a scenario ───────────────────────────────────────────────────────────�
const A = 'a0000000-0000-4000-8000-000000000001', B = 'b0000000-0000-4000-8000-000000000002'            // two coaches (A is also the master account: a coach with a solo record)
const UC = 'c0000000-0000-4000-8000-0000000000c1', US = 'c0000000-0000-4000-8000-0000000000c2', US2 = 'c0000000-0000-4000-8000-0000000000c3'   // a coached client, two solo users
const CL = '10000000-0000-4000-8000-000000000001', SO = '10000000-0000-4000-8000-000000000002', SO2 = '10000000-0000-4000-8000-000000000003'
const SOA = '10000000-0000-4000-8000-000000000004', OTH = '10000000-0000-4000-8000-000000000005'
const G_CL = '20000000-0000-4000-8000-000000000001', G_SO = '20000000-0000-4000-8000-000000000002', G_SO2 = '20000000-0000-4000-8000-000000000003'
const G_SOA = '20000000-0000-4000-8000-000000000004', G_OTH = '20000000-0000-4000-8000-000000000005'
const M_CL = '30000000-0000-4000-8000-000000000001', M_SO = '30000000-0000-4000-8000-000000000002', M_SO2 = '30000000-0000-4000-8000-000000000003'
await db.exec(`
  insert into public.clients (id, coach_id, user_id, full_name, status) values
    ('${CL}',  '${A}', '${UC}',  'Client of coach A', 'active'),
    ('${SO}',  null,   '${US}',  'Solo user', 'active'),
    ('${SO2}', null,   '${US2}', 'Another solo user', 'active'),
    ('${SOA}', null,   '${A}',   'Coach A, solo record', 'active'),
    ('${OTH}', '${B}', null,     'Client of coach B', 'active');
  insert into public.goals (id, client_id, created_by, title) values
    ('${G_CL}', '${CL}', '${A}', 'coach set this'), ('${G_SO}', '${SO}', '${US}', 'solo goal'), ('${G_SO2}', '${SO2}', '${US2}', 'other solo goal'),
    ('${G_SOA}', '${SOA}', '${A}', 'master solo goal'), ('${G_OTH}', '${OTH}', '${B}', 'coach B goal');
  insert into public.goal_milestones (id, goal_id, title) values ('${M_CL}', '${G_CL}', 'step on a coached goal'), ('${M_SO}', '${G_SO}', 'step on a solo goal'), ('${M_SO2}', '${G_SO2}', 'step on another solo goal');
`)
// NO RETURNING, as the app's own insert has none: a RETURNING clause also has to pass the SELECT policy, and a refusal there prints the SAME message as an insert-policy refusal,
// which would mask the very policy under test (found 2026-10-15: mutation m4 was 'caught' by the read policy, not by the check). Success is read back as the superuser.
const ins = (goal, title = 'probe') => `insert into public.goal_milestones (goal_id, title) values ('${goal}', '${title}')`
const count = async (goal) => Number((await rowsOf(`select count(*)::int n from public.goal_milestones where goal_id = '${goal}'`))[0].n)
const refused = (r) => !!r.error && /row-level security|policy/i.test(r.error)
const restore = (sql) => db.exec(sql).catch(() => {})

// ── 1. CONTROL: before the script the live problem is reproduced, and what already works is shown to work ──────────────────────────────
let r = await as('authenticated', US, ins(G_SO))
ok(refused(r), 'CONTROL (before the script): a solo user\'s step insert on their OWN goal is refused by row-level security - the live problem is reproduced', r)
r = await as('authenticated', US, `select id from public.goal_milestones where goal_id = '${G_SO}'`)
ok(!r.error && r.rows.length === 1, 'CONTROL: a solo user can already READ the steps of their own goal ("Client reads own milestones")', r)
r = await as('authenticated', US, `update public.goal_milestones set completed_at = now() where id = '${M_SO}' returning id`)
ok(!r.error && r.rows.length === 1, 'CONTROL: a solo user can already TICK a step on their own goal ("Client updates own goal milestones")', r)
await restore(`update public.goal_milestones set completed_at = null where id = '${M_SO}'`)
r = await as('authenticated', A, ins(G_CL))
ok(!r.error && await count(G_CL) === 2, 'CONTROL: a coach can add a step to their own client\'s goal ("Coach manages milestones")', r)
await db.exec(`delete from public.goal_milestones where goal_id = '${G_CL}' and title = 'probe'`)

// ── 2. run the migration - twice, to prove it is idempotent ───────────────────────────────────────────────
try { await db.exec(SCRIPT); await db.exec(SCRIPT); ok(true, 'the script runs twice without error (idempotent)') }
catch (e) { ok(false, 'the script runs twice without error (idempotent)', String(e.message)); done() }

// the read-back the script ends with: every policy on the table
const readBack = await rowsOf(SCRIPT.slice(SCRIPT.indexOf('-- READ-BACK')))
const mine = readBack.filter(x => x.policyname === 'Solo adds steps to own goals')
ok(mine.length === 1 && mine[0].cmd === 'INSERT' && /authenticated/.test(mine[0].roles) && /coach_id IS NULL/.test(mine[0].with_check) && /auth\.uid\(\)/.test(mine[0].with_check),
  'read-back: exactly one new policy, FOR INSERT, to authenticated, its check names a NULL coach_id and auth.uid()', mine)
ok(readBack.length === 5, 'read-back: the four live policies are still there beside it (5 in all)', readBack.map(x => x.policyname))

// ── 3. AFTER: who can add a step ─────────────────────────────────────────────────────────────────────�
r = await as('authenticated', US, ins(G_SO, 'solo step'))
ok(!r.error, 'a solo user can now add a step to their OWN goal', r)
ok(await count(G_SO) === 2, '...and the row is there (read as the superuser)')
r = await as('authenticated', A, ins(G_SOA, 'master step'))
ok(!r.error && await count(G_SOA) === 1, 'the master account (a coach with a solo record) can add a step to its OWN solo goal', r)
r = await as('authenticated', A, ins(G_CL, 'coach step'))
ok(!r.error && await count(G_CL) === 2, 'a coach can still add a step to their client\'s goal (the existing policy is intact)', r)

// ── 4. AFTER: who still cannot ───────────────────────────────────────────────────────────�
r = await as('authenticated', US, ins(G_SO2))
ok(refused(r), 'a solo user cannot add a step to ANOTHER solo user\'s goal', r)
r = await as('authenticated', US, ins(G_CL))
ok(refused(r), 'a solo user cannot add a step to a COACHED client\'s goal', r)
r = await as('authenticated', US, ins(G_OTH))
ok(refused(r), 'a solo user cannot add a step to another coach\'s client\'s goal', r)
r = await as('authenticated', US2, ins(G_SO))
ok(refused(r), 'another solo user cannot add a step to the first one\'s goal', r)
r = await as('authenticated', UC, ins(G_CL))
ok(refused(r), 'a COACHED client still cannot add a step, even to their own goal (the coach sets steps)', r)
r = await as('authenticated', B, ins(G_CL))
ok(refused(r), 'an unrelated coach cannot add a step to coach A\'s client\'s goal', r)
r = await as('authenticated', B, ins(G_SO))
ok(refused(r), 'an unrelated coach cannot add a step to a solo user\'s goal', r)
r = await as('authenticated', A, ins(G_SO))
ok(refused(r), 'the master account cannot add a step to SOMEONE ELSE\'S solo goal', r)
r = await as('anon', '', ins(G_SO))
ok(!!r.error, 'an anonymous caller cannot add a step', r)

// a solo record that is later attached to a coach stops being solo: the grant ends with it
await db.exec(`update public.clients set coach_id = '${B}' where id = '${SO}'`)
r = await as('authenticated', US, ins(G_SO))
ok(refused(r), 'once a solo record is attached to a coach it is a coached client: the grant no longer applies', r)
await restore(`update public.clients set coach_id = null where id = '${SO}'`)
ok((await rowsOf(`select coach_id from public.clients where id = '${SO}'`))[0].coach_id === null, '...and the put-back worked, so the checks below run on a solo record again (restore() swallows errors)')

// the KNOWN EDGE (security review 2026-10-15): a client may detach THEMSELVES (clients_update_own_row, which the 2026-09-26 guard deliberately still allows); that record is then solo,
// so the policy matches it. Pinned so a future change to either side is a decision, not a surprise. It adds no meaningful power (a client who detaches can already edit the steps and
// goals their coach made through the client UPDATE policies).
r = await as('authenticated', UC, `update public.clients set coach_id = null where id = '${CL}' returning id`)
ok(!r.error && r.rows.length === 1, 'KNOWN EDGE: a coached client can detach themselves (already allowed, decisions 2026-09-26)', r)
r = await as('authenticated', UC, ins(G_CL, 'detached client step'))
ok(!r.error && await count(G_CL) === 3, '...and a client who has detached is a solo record, so they can then add a step to their own goal (pinned, not endorsed)', r)
await restore(`delete from public.goal_milestones where title = 'detached client step'; update public.clients set coach_id = '${A}' where id = '${CL}'`)
ok((await rowsOf(`select coach_id from public.clients where id = '${CL}'`))[0].coach_id === A && await count(G_CL) === 2, '...(put back: the client belongs to coach A again, the probe step is gone)')

// ── 4b. the check's OWN conditions, with visibility widened ──────────────────────────────────────────
// The policy's subquery runs under the CALLER'S row-level security, and a solo user can only SEE their own goals and clients row, so under the live read policies the owner and
// goal-tie conditions are never what refuses another tenant's goal: the READ policies already hide it. (Found by review 2026-10-15: two mutations were caught only by a text match.)
// So a second pass lets every signed-in user read every goal and every clients row - test-only policies, dropped straight after - and the refusals must now come from the
// INSERT policy's own conditions. The unmutated script still passes all of it.
await db.exec(`create policy "test only: see all goals" on public.goals for select to authenticated using (true);
              create policy "test only: see all clients" on public.clients for select to authenticated using (true);`)
r = await as('authenticated', US, ins(G_SO2))
ok(refused(r), 'VISIBILITY WIDENED: a solo user is still refused on ANOTHER solo user\'s goal (the owner condition, not the read policy, refuses it)', r)
r = await as('authenticated', US, ins(G_CL))
ok(refused(r), 'VISIBILITY WIDENED: ...on a COACHED client\'s goal (the NULL-coach condition)', r)
r = await as('authenticated', US, ins(G_OTH))
ok(refused(r), 'VISIBILITY WIDENED: ...on another coach\'s client\'s goal', r)
r = await as('authenticated', US2, ins(G_SO))
ok(refused(r), 'VISIBILITY WIDENED: another solo user is refused on the first one\'s goal', r)
r = await as('authenticated', A, ins(G_SO))
ok(refused(r), 'VISIBILITY WIDENED: the master account is refused on someone else\'s solo goal', r)
r = await as('authenticated', UC, ins(G_CL))
ok(refused(r), 'VISIBILITY WIDENED: a coached client is refused on their own goal', r)
r = await as('authenticated', US, ins(G_SO, 'solo step again'))
ok(!r.error, 'VISIBILITY WIDENED: ...and the solo user\'s own goal still works', r)
await db.exec(`drop policy "test only: see all goals" on public.goals; drop policy "test only: see all clients" on public.clients;`)
ok((await rowsOf(`select count(*)::int n from pg_policies where policyname like 'test only:%'`))[0].n === 0, '(the test-only read policies are dropped again)')

// ── 5. AFTER: nothing broader than an INSERT was granted ──────────────────────────────────�
r = await as('authenticated', US, `delete from public.goal_milestones where id = '${M_SO}' returning id`)
ok(!r.error && r.rows.length === 0 && await count(G_SO) >= 1, 'a solo user still cannot DELETE a step (nothing in the app deletes one, so it was not granted)', r)
r = await as('authenticated', US, `update public.goal_milestones set completed_at = now() where id = '${M_SO}' returning id`)
ok(!r.error && r.rows.length === 1, 'ticking a step still works, through the existing client policy (unchanged)', r)
r = await as('authenticated', US, `update public.goal_milestones set completed_at = now() where id = '${M_SO2}' returning id`)
ok(!r.error && r.rows.length === 0, 'a solo user still cannot tick another solo user\'s step', r)
r = await as('authenticated', US, `select id from public.goal_milestones where goal_id = '${G_SO2}'`)
ok(!r.error && r.rows.length === 0, 'nor read it', r)

// ── 6. the rollback written in the script's header works, and reopens the refusal ────────────────────────────────────
const rollback = SCRIPT.match(/drop policy "[^"]+" on public\.goal_milestones;/)
ok(!!rollback, 'the script documents a rollback (drop policy)')
let rollbackOk = !!rollback
if (rollbackOk) { try { await db.exec(rollback[0]) } catch (e) { rollbackOk = false; console.log('  rollback error:', String(e.message)) } }
ok(rollbackOk, 'the documented rollback runs as written')
r = await as('authenticated', US, ins(G_SO))
ok(refused(r), '...and after it a solo user\'s step insert is refused again (the grant is really gone)', r)

done()
