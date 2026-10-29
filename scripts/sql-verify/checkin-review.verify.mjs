// Verifies scripts/add-checkin-review-2026-10-29.sql on a real Postgres engine (PGlite) loaded with the live schema (live-schema.mjs), plus the two live facts that copy
// lacks and this script meets, both from Jake's read of client_check_ins on 2026-10-29: its INSERT policy ("Client inserts own check-in", verbatim) and a minimal
// public.profiles (the reviewed_by foreign key's target; only its id). The table-wide grants come from the copy's Supabase default grants, which match that read
// (authenticated held SELECT, INSERT, UPDATE, DELETE...). NOT modelled: the live lock_created_at trigger (it only guards created_at, which nothing here writes).
//
// It runs the script TWICE (idempotency), then checks: the read-back; a coach can mark seen and reply on their OWN client's check-in, and the SERVER stamps who and
// when; the stamp cannot be cleared, back-dated or forged; the coach cannot change ratings or notes, nor touch another coach's client or their own personal record;
// the client and anon cannot review; the reply length and blank checks; a client inserts unreviewed even when they try to pre-fill the review; the client deletes
// their own row and nobody else's, and a coach deletes nothing. Set MUTATE=m1..m9 to apply a deliberate breakage from checkin-review.mutations.mjs —
// run-mutations.mjs requires each to make this FAIL.
//
//   node scripts/sql-verify/checkin-review.verify.mjs     # exit 0 = every check passed
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { installLiveSchema } from './live-schema.mjs'
import { startHarness, applyMutation } from './harness.mjs'
import { MUTATIONS } from './checkin-review.mutations.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
let SCRIPT = fs.readFileSync(path.join(here, '..', 'add-checkin-review-2026-10-29.sql'), 'utf8').replace(/\r\n/g, '\n')
if (process.env.MUTATE) {
  const m = MUTATIONS[process.env.MUTATE]
  if (!m) { console.log('unknown mutation', process.env.MUTATE); process.exit(2) }
  SCRIPT = applyMutation(SCRIPT, m.pairs)
  console.log('MUTATION', process.env.MUTATE, 'applied:', m.why)
}

const { db, ok, rowsOf, as, done } = await startHarness()
console.log('engine:', (await rowsOf('select version()'))[0].version.slice(0, 40))
await installLiveSchema(db)

// ── the two live facts the copy lacks, and a roster ─────────────────────────────────────────────────────────
const A = 'a0000000-0000-4000-8000-000000000001', B = 'b0000000-0000-4000-8000-000000000002', U = 'c0000000-0000-4000-8000-0000000000c1'
const CA = '10000000-0000-4000-8000-000000000001', CB = '10000000-0000-4000-8000-000000000002', SOLO = '10000000-0000-4000-8000-000000000003'
const K1 = '20000000-0000-4000-8000-000000000001', K2 = '20000000-0000-4000-8000-000000000002', K3 = '20000000-0000-4000-8000-000000000003', K4 = '20000000-0000-4000-8000-000000000004'
await db.exec(`
  create table public.profiles (id uuid primary key);
  insert into public.profiles (id) values ('${A}'), ('${B}'), ('${U}');
  create policy "Client inserts own check-in" on public.client_check_ins for insert to public with check (client_id in ( select clients.id from clients where (clients.user_id = ( select auth.uid() as uid))));
  insert into public.clients (id, coach_id, user_id, full_name, status) values
    ('${CA}', '${A}', '${U}', 'Coach A client (a real login)', 'active'),
    ('${CB}', '${B}', null, 'Coach B client', 'active'),
    ('${SOLO}', null, '${A}', 'Coach A personal record', 'active');
  insert into public.client_check_ins (id, client_id, sleep, energy, stress, soreness, notes) values
    ('${K1}', '${CA}', 2, 3, 5, 4, 'rough week'), ('${K2}', '${CB}', 4, 4, 2, 2, null), ('${K3}', '${SOLO}', 3, 3, 3, 3, null), ('${K4}', '${CA}', 4, 4, 1, 1, 'old one');
`)

// ── run the script — twice, to prove it is idempotent ─────────────────────────────────────────────────────
await db.exec(SCRIPT)
console.log('script ran once without error')
const run2 = await db.exec(SCRIPT)
ok(true, 'script ran a second time without error (idempotent)')
const rb = run2[run2.length - 1].rows
const by = (k) => rb.filter(r => r.kind === k).map(r => r.detail)
ok(by('column').length === 3, 'read-back: 3 review columns', by('column'))
ok(JSON.stringify(by('update grant').sort()) === JSON.stringify(['authenticated coach_reply', 'authenticated reviewed_at', 'authenticated reviewed_by']), 'read-back: UPDATE granted on the three review columns only', by('update grant'))
ok(by('table update').length === 0, 'read-back: NO table-wide UPDATE left for anon or authenticated', by('table update'))
ok(by('policy').includes('Coach reviews client check-ins | UPDATE') && by('policy').includes('Client deletes own check-ins | DELETE'), 'read-back: the two new policies', by('policy'))
ok(by('trigger').includes('stamp_check_in_review'), 'read-back: the stamping trigger', by('trigger'))
ok(by('trigger events')[0] === 'INSERT, UPDATE', 'read-back: the trigger fires on INSERT and UPDATE', by('trigger events'))
ok(by('execute')[0] === 'authenticated may run stamp fn = false', 'read-back: authenticated cannot run the stamp function', by('execute'))

const row = async (id) => (await rowsOf(`select coach_reply, reviewed_at, reviewed_by, sleep, notes from public.client_check_ins where id = '${id}'`))[0]
const upd = (sub, sql) => as('authenticated', sub, sql)

console.log('\ncoach A reviews their own client:')
const seen = await upd(A, `update public.client_check_ins set reviewed_at = now() where id = '${K1}' returning id`)
ok(!seen.error && seen.rows.length === 1, 'Seen: exactly one row', seen.error ?? seen.rows.length)
const r1 = await row(K1)
ok(r1.reviewed_at && r1.reviewed_by === A, 'the server stamped reviewed_at and reviewed_by = coach A', [r1.reviewed_at, r1.reviewed_by])
const firstStamp = String(r1.reviewed_at)
const reply = await upd(A, `update public.client_check_ins set coach_reply = 'Ease off this week' where id = '${K1}' returning id`)
ok(!reply.error && reply.rows.length === 1 && (await row(K1)).coach_reply === 'Ease off this week', 'Reply: saved', reply.error)
ok(String((await row(K1)).reviewed_at) === firstStamp, 'a later reply keeps the FIRST reviewed_at', (await row(K1)).reviewed_at)
await upd(A, `update public.client_check_ins set reviewed_at = null where id = '${K1}'`)
ok(String((await row(K1)).reviewed_at) === firstStamp, 'reviewed_at cannot be CLEARED (un-review)', (await row(K1)).reviewed_at)
await upd(A, `update public.client_check_ins set reviewed_at = '2000-01-01' where id = '${K1}'`)
ok(String((await row(K1)).reviewed_at) === firstStamp, 'reviewed_at cannot be BACK-DATED', (await row(K1)).reviewed_at)
await upd(A, `update public.client_check_ins set reviewed_by = '${B}' where id = '${K1}'`)
ok((await row(K1)).reviewed_by === A, 'reviewed_by cannot be FORGED to another user', (await row(K1)).reviewed_by)

console.log('\nwhat coach A must NOT be able to do:')
const rating = await upd(A, `update public.client_check_ins set sleep = 5 where id = '${K1}'`)
ok(rating.error && /permission denied/i.test(rating.error) && (await row(K1)).sleep === 2, 'change a client\'s RATING (column grant refuses)', rating.error ?? rating.rows)
const notes = await upd(A, `update public.client_check_ins set notes = 'fine' where id = '${K1}'`)
ok(notes.error && /permission denied/i.test(notes.error) && (await row(K1)).notes === 'rough week', 'change a client\'s NOTES (column grant refuses)', notes.error ?? notes.rows)
const blank = await upd(A, `update public.client_check_ins set coach_reply = '   ' where id = '${K4}'`)
ok(blank.error && /check/i.test(blank.error), 'a blank reply is refused', blank.error ?? blank.rows)
const long = await upd(A, `update public.client_check_ins set coach_reply = repeat('x', 501) where id = '${K4}'`)
ok(long.error && /check/i.test(long.error), 'a 501-character reply is refused', long.error ?? long.rows)
const max = await upd(A, `update public.client_check_ins set coach_reply = repeat('x', 500) where id = '${K4}' returning id`)
ok(!max.error && max.rows.length === 1, 'a 500-character reply is accepted (the boundary)', max.error)
const other = await upd(A, `update public.client_check_ins set reviewed_at = now() where id = '${K2}' returning id`)
ok(!other.error && other.rows.length === 0 && (await row(K2)).reviewed_at === null, 'review ANOTHER coach\'s client (0 rows, unchanged)', other.error ?? other.rows)
const own = await upd(A, `update public.client_check_ins set reviewed_at = now() where id = '${K3}' returning id`)
ok(!own.error && own.rows.length === 0 && (await row(K3)).reviewed_at === null, 'review their OWN personal record (coach_id is NULL: not a coached client)', own.error ?? own.rows)

console.log('\nthe client and anon:')
const cli = await upd(U, `update public.client_check_ins set coach_reply = 'Great job me' where id = '${K4}' returning id`)
ok(!cli.error && cli.rows.length === 0, 'the client cannot write a reply on their own check-in (no client UPDATE policy)', cli.error ?? cli.rows)
const anonU = await as('anon', '', `update public.client_check_ins set reviewed_at = now()`)
ok(anonU.error && /permission denied/i.test(anonU.error), 'anon is refused', anonU.error ?? anonU.rows)
const ins = await upd(U, `insert into public.client_check_ins (client_id, sleep, energy, stress, soreness, coach_reply, reviewed_at, reviewed_by) values ('${CA}', 3, 3, 3, 3, 'Looks great!', now(), '${A}') returning id, coach_reply, reviewed_at, reviewed_by`)
ok(!ins.error && ins.rows.length === 1, 'the client can still insert their own check-in', ins.error)
ok(ins.rows?.[0]?.coach_reply === null && ins.rows[0].reviewed_at === null && ins.rows[0].reviewed_by === null, 'a client CANNOT pre-fill a reply or "seen" on insert: the server clears all three', ins.rows?.[0])
const newId = ins.rows?.[0]?.id
const dated = await upd(U, `insert into public.client_check_ins (client_id, sleep, energy, stress, soreness, created_at) values ('${CA}', 3, 3, 3, 3, '2020-01-01') returning id, created_at > now() - interval '1 minute' as fresh`)
ok(!dated.error && dated.rows?.[0]?.fresh === true, 'a client CANNOT choose created_at (back-dating a check-in out of the 14-day inbox): the server sets it', dated.error ?? dated.rows)
const future = await upd(U, `insert into public.client_check_ins (client_id, sleep, energy, stress, soreness, created_at) values ('${CA}', 3, 3, 3, 3, '2099-01-01') returning id, created_at < now() + interval '1 minute' as fresh`)
ok(!future.error && future.rows?.[0]?.fresh === true, 'nor a future one (pinning it to the top of the inbox)', future.error ?? future.rows)
await db.exec(`delete from public.client_check_ins where id in ('${dated.rows?.[0]?.id}', '${future.rows?.[0]?.id}')`)

console.log('\nthe database\'s own roles (a restore, a migration) are not app callers:')
const K5 = '20000000-0000-4000-8000-000000000005'
await db.exec(`insert into public.client_check_ins (id, client_id, sleep, energy, stress, soreness, created_at, coach_reply, reviewed_at, reviewed_by) values ('${K5}', '${CA}', 3, 3, 3, 3, '2026-01-05', 'restored reply', '2026-01-06', '${A}')`)
const restored = (await rowsOf(`select coach_reply, reviewed_at::date::text as d, reviewed_by, created_at::date::text as c from public.client_check_ins where id = '${K5}'`))[0]
ok(restored.coach_reply === 'restored reply' && restored.d === '2026-01-06' && restored.reviewed_by === A && restored.c === '2026-01-05', 'a restore (run as the database owner) keeps its replies, stamps and dates', restored)

console.log('\nreviewed_by is the FIRST reviewer:')
await db.exec(`update public.clients set coach_id = '${B}' where id = '${CA}'`)   // the client moves to coach B
const bEdit = await upd(B, `update public.client_check_ins set coach_reply = 'Coach B here' where id = '${K1}' returning id`)
ok(!bEdit.error && bEdit.rows.length === 1, 'the new coach can edit the reply on their (now) client\'s check-in', bEdit.error ?? bEdit.rows)
const afterB = await row(K1)
ok(afterB.reviewed_by === A && String(afterB.reviewed_at) === firstStamp, 'reviewed_by stays the FIRST reviewer (coach A), with the first reviewed_at', [afterB.reviewed_by, afterB.reviewed_at])
await db.exec(`update public.clients set coach_id = '${A}' where id = '${CA}'`)   // and back, for the delete checks below

console.log('\ndeleting:')
const coachDel = await upd(A, `delete from public.client_check_ins where id = '${K4}' returning id`)
ok(!coachDel.error && coachDel.rows.length === 0, 'a coach deletes nothing (no coach DELETE policy)', coachDel.error ?? coachDel.rows)
const bDel = await upd(B, `delete from public.client_check_ins where id = '${K1}' returning id`)
ok(!bDel.error && bDel.rows.length === 0, 'another coach cannot delete a client\'s check-in', bDel.error ?? bDel.rows)
const uDel = await upd(U, `delete from public.client_check_ins where id = '${newId}' returning id`)
ok(!uDel.error && uDel.rows.length === 1, 'the client deletes their OWN check-in', uDel.error ?? uDel.rows)
const uOther = await upd(U, `delete from public.client_check_ins where id = '${K2}' returning id`)
ok(!uOther.error && uOther.rows.length === 0, 'the client cannot delete someone else\'s', uOther.error ?? uOther.rows)
const soloDel = await upd(A, `delete from public.client_check_ins where id = '${K3}' returning id`)
ok(!soloDel.error && soloDel.rows.length === 1, 'a personal (solo) account deletes its own (user_id = me)', soloDel.error ?? soloDel.rows)

done()
