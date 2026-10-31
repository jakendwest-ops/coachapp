// Verifies scripts/fix-solo-week-copies-delete-update-2026-10-31.sql on a real Postgres engine (PGlite) loaded with the live tables and policies
// (live-schema.mjs + live-schema-programs.mjs, read 2026-09-20 / 2026-09-27). It first proves the fixture reproduces the live PROBLEM (a solo user's delete and
// renumber of their own week copies change nothing, with no error), then runs the script TWICE (idempotency) and checks who can now delete and renumber a
// copy and who still cannot, that a copy cannot be moved onto someone else's plan, the read-back the script ends with, and the documented rollback.
// Set MUTATE=m1..m9 to apply one of the deliberate breakages in solo-week-copies.mutations.mjs - run-mutations.mjs requires each to make this FAIL.
//
//   node scripts/sql-verify/solo-week-copies.verify.mjs             # exit 0 = every check passed
//   node scripts/sql-verify/run-mutations.mjs                        # exit 0 = every breakage was caught
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { installLiveSchema } from './live-schema.mjs'
import { installProgramLifecycleSchema } from './live-schema-programs.mjs'
import { startHarness, applyMutation } from './harness.mjs'
import { MUTATIONS } from './solo-week-copies.mutations.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
let SCRIPT = fs.readFileSync(path.join(here, '..', 'fix-solo-week-copies-delete-update-2026-10-31.sql'), 'utf8').replace(/\r\n/g, '\n')
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

// ── a scenario: five plans, each with two week copies ──────────────────────────────────────────────
// A is a coach AND has a solo record (the master account), B is another coach, UC a coached client of A, US and US2 two solo users.
const A = 'a0000000-0000-4000-8000-000000000001', B = 'b0000000-0000-4000-8000-000000000002'
const UC = 'c0000000-0000-4000-8000-0000000000c1', US = 'c0000000-0000-4000-8000-0000000000c2', US2 = 'c0000000-0000-4000-8000-0000000000c3'
const PLANS = {   // key: [owner of the programme and templates, the clients row the plan is assigned to, that row's coach_id, its user_id]
  SO:  [US,  '10000000-0000-4000-8000-000000000002', null, US],
  SO2: [US2, '10000000-0000-4000-8000-000000000003', null, US2],
  SOA: [A,   '10000000-0000-4000-8000-000000000004', null, A],
  CL:  [A,   '10000000-0000-4000-8000-000000000001', A,    UC],
  OTH: [B,   '10000000-0000-4000-8000-000000000005', B,    null],
}
const ids = {}
let n = 0
const id = () => `9${String(++n).padStart(7, '0')}-0000-4000-8000-000000000000`
for (const [key, [owner, clientId, coachId, userId]] of Object.entries(PLANS)) {
  const p = { client: clientId, program: id(), phase: id(), tmpl: id(), pw1: id(), pw2: id(), cp: id(), cpw1: id(), cpw2: id() }
  ids[key] = p
  await db.exec(`
    insert into public.clients (id, coach_id, user_id, full_name) values ('${clientId}', ${coachId ? `'${coachId}'` : 'null'}, ${userId ? `'${userId}'` : 'null'}, '${key}');
    insert into public.programs (id, coach_id, name) values ('${p.program}', '${owner}', '${key} programme');
    insert into public.program_phases (id, program_id, name) values ('${p.phase}', '${p.program}', 'phase');
    insert into public.workout_templates (id, coach_id, name) values ('${p.tmpl}', '${owner}', '${key} template');
    insert into public.program_phase_workouts (id, phase_id, template_id, day_label, week_number) values ('${p.pw1}', '${p.phase}', '${p.tmpl}', 'Mon', 2), ('${p.pw2}', '${p.phase}', '${p.tmpl}', 'Wed', 3);
    insert into public.client_programs (id, client_id, program_id) values ('${p.cp}', '${clientId}', '${p.program}');
    insert into public.client_program_workouts (id, client_program_id, program_phase_workout_id, workout_template_id, week_number) values
      ('${p.cpw1}', '${p.cp}', '${p.pw1}', '${p.tmpl}', 2), ('${p.cpw2}', '${p.cp}', '${p.pw2}', '${p.tmpl}', 3);
  `)
}
// NO RETURNING, as a RETURNING clause also has to pass the SELECT policy and could mask the policy under test (solo-goal-milestones, 2026-10-15). Every outcome is
// read back as the superuser.
const week = async (cpw) => (await rowsOf(`select week_number from public.client_program_workouts where id = '${cpw}'`))[0]?.week_number ?? null
const exists = async (cpw) => (await rowsOf(`select count(*)::int n from public.client_program_workouts where id = '${cpw}'`))[0].n === 1
const renumber = (cpw, w) => `update public.client_program_workouts set week_number = ${w} where id = '${cpw}'`
const remove = (cpw) => `delete from public.client_program_workouts where id = '${cpw}'`
const put = (sql) => db.exec(`reset role; ${sql}`)
const reset = (key) => put(`update public.client_program_workouts set week_number = 2 where id = '${ids[key].cpw1}'`)

// ── 1. CONTROL: the live problem is reproduced, and what already works is shown to work ─────────────
let r = await as('authenticated', US, renumber(ids.SO.cpw1, 7))
ok(!r.error && await week(ids.SO.cpw1) === 2, 'CONTROL (before the script): a solo user\'s renumber of their OWN week copy changes nothing and raises no error - the live problem is reproduced', r)
r = await as('authenticated', US, remove(ids.SO.cpw2))
ok(!r.error && await exists(ids.SO.cpw2), 'CONTROL: ...and their delete of it removes nothing, also with no error', r)
r = await as('authenticated', US, `select id from public.client_program_workouts where id = '${ids.SO.cpw1}'`)
ok(!r.error && r.rows.length === 1, 'CONTROL: a solo user can already READ their own week copies', r)
r = await as('authenticated', A, renumber(ids.CL.cpw1, 7))
ok(!r.error && await week(ids.CL.cpw1) === 7, 'CONTROL: a coach can renumber their own client\'s copy (coach_manage_cpw)', r)
await reset('CL')
r = await as('authenticated', A, renumber(ids.SOA.cpw1, 7))
ok(!r.error && await week(ids.SOA.cpw1) === 2, 'CONTROL: the master account cannot renumber the copies of its OWN solo plan either (coach_manage_cpw needs a coach_id)', r)

// ── 2. run the migration - twice, to prove it is idempotent ───────────────────────────────────────
try { await put(SCRIPT); await put(SCRIPT); ok(true, 'the script runs twice without error (idempotent)') }
catch (e) { ok(false, 'the script runs twice without error (idempotent)', String(e.message)); done() }

const readBack = await rowsOf(SCRIPT.slice(SCRIPT.indexOf('-- READ-BACK')))
const del = readBack.filter(x => x.policyname === 'solo user delete own client_program_workouts')
const upd = readBack.filter(x => x.policyname === 'solo user update own client_program_workouts')
const anchored = (s) => /coach_id IS NULL/.test(s || '') && /auth\.uid\(\)/.test(s || '') && /user_id/.test(s || '')
ok(del.length === 1 && del[0].cmd === 'DELETE' && /authenticated/.test(del[0].roles) && anchored(del[0].qual),
  'read-back: one DELETE policy, to authenticated, its USING names the caller\'s user_id, auth.uid() and a NULL coach_id', del)
ok(upd.length === 1 && upd[0].cmd === 'UPDATE' && /authenticated/.test(upd[0].roles) && anchored(upd[0].qual) && anchored(upd[0].with_check),
  'read-back: one UPDATE policy, to authenticated, anchored the same way in BOTH its USING and its WITH CHECK', upd)
ok(readBack.length === 6, 'read-back: the four live policies are still there beside them (6 in all)', readBack.map(x => x.policyname))

// ── 3. AFTER: who can renumber and delete ────────────────────────────────────────────────────────
r = await as('authenticated', US, renumber(ids.SO.cpw1, 5))
ok(!r.error && await week(ids.SO.cpw1) === 5, 'a solo user can now renumber a week copy of their OWN plan', r)
await reset('SO')
r = await as('authenticated', A, renumber(ids.SOA.cpw1, 5))
ok(!r.error && await week(ids.SOA.cpw1) === 5, 'the master account can renumber the copies of its OWN solo plan (Personal view)', r)
await reset('SOA')
r = await as('authenticated', A, renumber(ids.CL.cpw1, 5))
ok(!r.error && await week(ids.CL.cpw1) === 5, 'a coach can still renumber their client\'s copy (coach_manage_cpw is intact)', r)
await reset('CL')

// ── 4. AFTER: who still cannot ───────────────────────────────────────────────────────────────────
const refusedBoth = async (who, key, label) => {
  const a = await as('authenticated', who, renumber(ids[key].cpw1, 9))
  ok(!a.error && await week(ids[key].cpw1) === 2, `${label}: cannot renumber`, a)
  const b = await as('authenticated', who, remove(ids[key].cpw1))
  ok(!b.error && await exists(ids[key].cpw1), `${label}: cannot delete`, b)
}
await refusedBoth(US, 'SO2', 'a solo user, on ANOTHER solo user\'s plan')
await refusedBoth(US, 'CL', 'a solo user, on a COACHED client\'s plan')
await refusedBoth(US, 'OTH', 'a solo user, on another coach\'s client\'s plan')
await refusedBoth(US, 'SOA', 'a solo user, on the master account\'s solo plan')
await refusedBoth(US2, 'SO', 'another solo user, on the first one\'s plan')
await refusedBoth(UC, 'CL', 'a COACHED client, on their own plan (the coach manages it)')
await refusedBoth(B, 'SO', 'an unrelated coach, on a solo user\'s plan')
await refusedBoth(A, 'SO', 'the master account, on SOMEONE ELSE\'S solo plan')
r = await as('anon', '', remove(ids.SO.cpw1))
ok(await exists(ids.SO.cpw1), 'an anonymous caller cannot delete a copy', r)

// Moving a copy onto someone else's plan is refused here too, but under the live read policies by the SELECT policy (Postgres also requires the updated row
// to stay visible to the caller): the WITH CHECK is tested on its own in 4b, where everything is visible (found by mutation m5, 2026-10-31).
const tryMove = async (target) => {
  const res = await as('authenticated', US, `update public.client_program_workouts set client_program_id = '${ids[target].cp}' where id = '${ids.SO.cpw1}'`)
  const now = (await rowsOf(`select client_program_id from public.client_program_workouts where id = '${ids.SO.cpw1}'`))[0].client_program_id
  if (now !== ids.SO.cp) await put(`update public.client_program_workouts set client_program_id = '${ids.SO.cp}' where id = '${ids.SO.cpw1}'`)
  return { res, moved: now !== ids.SO.cp }
}
for (const target of ['SO2', 'CL']) {
  const m = await tryMove(target)
  ok(/row-level security/.test(m.res.error || '') && !m.moved, `a solo user cannot move their copy onto the ${target} plan`, m.res)
}

// KNOWN EDGE (pinned, not endorsed; see the script header): the master account can move a copy between its own client's plan and its own solo plan.
{
  r = await as('authenticated', A, `update public.client_program_workouts set client_program_id = '${ids.SOA.cp}' where id = '${ids.CL.cpw1}'`)
  const now = (await rowsOf(`select client_program_id from public.client_program_workouts where id = '${ids.CL.cpw1}'`))[0].client_program_id
  ok(!r.error && now === ids.SOA.cp, 'KNOWN EDGE: the master account can move its own client\'s copy onto its own solo plan (both are its own)', r)
  await put(`update public.client_program_workouts set client_program_id = '${ids.CL.cp}' where id = '${ids.CL.cpw1}'`)
  r = await as('authenticated', A, `update public.client_program_workouts set client_program_id = '${ids.SO.cp}' where id = '${ids.CL.cpw1}'`)
  const still = (await rowsOf(`select client_program_id from public.client_program_workouts where id = '${ids.CL.cpw1}'`))[0].client_program_id
  ok(!!r.error && still === ids.CL.cp, '...but never onto SOMEONE ELSE\'S solo plan', r)
}

// a solo record later attached to a coach is a coached client: the grant ends with it
await put(`update public.clients set coach_id = '${B}' where id = '${ids.SO.client}'`)
r = await as('authenticated', US, renumber(ids.SO.cpw1, 9))
ok(!r.error && await week(ids.SO.cpw1) === 2, 'once a solo record is attached to a coach, the solo grant no longer applies', r)
await put(`update public.clients set coach_id = null where id = '${ids.SO.client}'`)

// ── 4b. the policies' OWN conditions, with visibility widened ────────────────────────────────────
// A row the caller cannot SEE is never updated or deleted, so under the live read policies the new USING conditions are not what refuses another tenant's copy.
// Test-only read policies let everyone see everything; the refusals must then come from the new policies themselves. Dropped straight after.
await put(`create policy "test only: see all cpw" on public.client_program_workouts for select to authenticated using (true);
           create policy "test only: see all cp" on public.client_programs for select to authenticated using (true);
           create policy "test only: see all clients" on public.clients for select to authenticated using (true);`)
await refusedBoth(US, 'SO2', 'VISIBILITY WIDENED: a solo user, on another solo user\'s plan')
await refusedBoth(US, 'CL', 'VISIBILITY WIDENED: a solo user, on a coached client\'s plan')
await refusedBoth(UC, 'CL', 'VISIBILITY WIDENED: a coached client, on their own plan')
await refusedBoth(A, 'SO', 'VISIBILITY WIDENED: the master account, on someone else\'s solo plan')
for (const target of ['SO2', 'CL', 'OTH']) {
  const m = await tryMove(target)
  ok(/row-level security/.test(m.res.error || '') && !m.moved, `VISIBILITY WIDENED: a solo user cannot move their copy onto the ${target} plan (refused by the UPDATE policy's WITH CHECK)`, m.res)
}
r = await as('authenticated', US, renumber(ids.SO.cpw1, 4))
ok(!r.error && await week(ids.SO.cpw1) === 4, 'VISIBILITY WIDENED: ...and the solo user\'s own copy still renumbers', r)
await reset('SO')
await put(`drop policy "test only: see all cpw" on public.client_program_workouts; drop policy "test only: see all cp" on public.client_programs;
           drop policy "test only: see all clients" on public.clients;`)
ok((await rowsOf(`select count(*)::int n from pg_policies where policyname like 'test only:%'`))[0].n === 0, '(the test-only read policies are dropped again)')

// ── 5. a real delete, last, because it removes the row ────────────────────────────────────────────
r = await as('authenticated', US, remove(ids.SO.cpw2))
ok(!r.error && !(await exists(ids.SO.cpw2)), 'a solo user can now delete a week copy of their OWN plan', r)
r = await as('authenticated', A, remove(ids.SOA.cpw2))
ok(!r.error && !(await exists(ids.SOA.cpw2)), 'the master account can delete a copy of its OWN solo plan', r)

// ── 6. the rollback written in the script's header works, and reopens the refusal ─────────────────
const rollback = SCRIPT.match(/-- ROLLBACK \(additive\): (.+)$/m)
ok(!!rollback, 'the script documents a rollback')
let rollbackOk = !!rollback
if (rollbackOk) { try { await put(rollback[1]) } catch (e) { rollbackOk = false; console.log('  rollback error:', String(e.message)) } }
ok(rollbackOk, 'the documented rollback runs as written')
r = await as('authenticated', US, renumber(ids.SO.cpw1, 6))
ok(!r.error && await week(ids.SO.cpw1) === 2, '...and after it a solo user\'s renumber is refused again (the grant is really gone)', r)
r = await as('authenticated', US, remove(ids.SO.cpw1))
ok(await exists(ids.SO.cpw1), '...and so is their delete', r)

done()
