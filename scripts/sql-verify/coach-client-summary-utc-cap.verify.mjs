// Verifies scripts/fix-coach-client-summary-utc-cap-2026-10-17.sql on a real Postgres engine (PGlite) loaded with the live schema (live-schema.mjs). It first runs ONLY the original
// view script and proves the bug is real (a session dated one day ahead of the UTC date is hidden), then runs the fix TWICE (idempotency) and checks: the session now counts, a log
// two days ahead and a year ahead still do not, the window edges did not move, the 19 columns are the same, the read-back, and who can and cannot read or write the view. Set
// MUTATE=m1..m8 to apply one of the deliberate breakages in coach-client-summary-utc-cap.mutations.mjs — run-mutations.mjs requires each to make this FAIL.
//
//   node scripts/sql-verify/coach-client-summary-utc-cap.verify.mjs     # exit 0 = every check passed
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { installLiveSchema } from './live-schema.mjs'
import { startHarness, applyMutation } from './harness.mjs'
import { MUTATIONS } from './coach-client-summary-utc-cap.mutations.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n')
const ORIGINAL = read('add-coach-client-summary-2026-09-20.sql')
let FIX = read('fix-coach-client-summary-utc-cap-2026-10-17.sql')
if (process.env.MUTATE) {
  const m = MUTATIONS[process.env.MUTATE]
  if (!m) { console.log('unknown mutation', process.env.MUTATE); process.exit(2) }
  FIX = applyMutation(FIX, m.pairs)
  console.log('MUTATION', process.env.MUTATE, 'applied:', m.why)
}

const { db, ok, rowsOf, as, done } = await startHarness()
console.log('engine:', (await rowsOf('select version()'))[0].version.slice(0, 40))
await installLiveSchema(db)

// ── a scenario ────────────────────────────────────────────────────────────────────────────────────
const A = 'a0000000-0000-4000-8000-000000000001', B = 'b0000000-0000-4000-8000-000000000002', U1 = 'c0000000-0000-4000-8000-0000000000c1'
const CX = '10000000-0000-4000-8000-000000000001', CY = '10000000-0000-4000-8000-000000000002', CZ = '10000000-0000-4000-8000-000000000003',
      CW = '10000000-0000-4000-8000-000000000004', CB = '10000000-0000-4000-8000-000000000005', SOLO = '10000000-0000-4000-8000-000000000006'
const T = "(now() at time zone 'utc')::date"
await db.exec(`
  insert into public.clients (id, coach_id, user_id, full_name, status) values
    ('${CX}', '${A}', '${U1}', 'X ahead, today, yesterday, too far, a typo', 'active'),
    ('${CY}', '${A}', null, 'Y two days ahead only, plus a stray', 'active'),
    ('${CZ}', '${A}', null, 'Z window edges', 'active'),
    ('${CW}', '${A}', null, 'W only a session dated one day ahead', 'active'),
    ('${CB}', '${B}', null, 'Other coach client', 'active'),
    ('${SOLO}', null, '${A}', 'Coach A personal record', 'active');
  -- X: a session dated one day AHEAD of the UTC date (what the app writes for someone ahead of UTC just after local midnight), today, yesterday, two days ahead, and a year-off typo
  insert into public.workout_logs (coach_id, client_id, name, date) values
    ('${A}', '${CX}', 'ahead', ${T} + 1), ('${A}', '${CX}', 'today', ${T}), ('${A}', '${CX}', 'yesterday', ${T} - 1), ('${A}', '${CX}', 'two ahead', ${T} + 2), ('${A}', '${CX}', 'typo', ${T} + 400);
  -- Y: only a log two days ahead (no time zone is that far ahead) and a real one five days ago; and a stray log under ANOTHER coach, dated one day ahead, which row-level security hides from coach A
  insert into public.workout_logs (coach_id, client_id, name, date) values
    ('${A}', '${CY}', 'too far', ${T} + 2), ('${A}', '${CY}', 'real', ${T} - 5), ('${B}', '${CY}', 'stray', ${T} + 1);
  -- Z: logs exactly ON and just OUTSIDE each window edge (the lower edges did not move)
  insert into public.workout_logs (coach_id, client_id, name, date) values
    ('${A}', '${CZ}', 'e7', ${T} - 7), ('${A}', '${CZ}', 'e8', ${T} - 8), ('${A}', '${CZ}', 'e28', ${T} - 28), ('${A}', '${CZ}', 'e29', ${T} - 29);
  -- W: nothing but a session dated one day ahead
  insert into public.workout_logs (coach_id, client_id, name, date) values ('${A}', '${CW}', 'only', ${T} + 1);
  insert into public.workout_logs (coach_id, client_id, name, date) values ('${B}', '${CB}', 'b1', ${T} + 1);
`)
const asAll = (role, sub) => as(role, sub, 'select * from public.coach_client_summary order by full_name')
const ago = async (n) => (await rowsOf(`select (${T} - ${n})::text as d`))[0].d
const ahead = async (n) => (await rowsOf(`select (${T} + ${n})::text as d`))[0].d
const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10))
const rowFor = (rows, id) => rows.find(r => r.client_id === id)
const columns = async () => (await rowsOf(`select a.attname::text || ' ' || format_type(a.atttypid, a.atttypmod) as c from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'coach_client_summary' and a.attnum > 0 and not a.attisdropped order by a.attnum`)).map(r => r.c)

// ── BEFORE the fix: the bug is real ──────────────────────────────────────────────────────────────────
console.log('\nbefore the fix (the original script only):')
await db.exec(ORIGINAL)
const colsBefore = await columns()
const before = await asAll('authenticated', A)
ok(!before.error, 'query works', before.error)
const bx = rowFor(before.rows, CX), bw = rowFor(before.rows, CW)
ok(iso(bx?.last_session_date) === await ago(0) && Number(bx?.sessions_7d) === 2, 'the bug reproduces: client X\'s session dated one day ahead of the UTC date is HIDDEN (last session = today, 2 in 7 days, not the 3 there are)', [bx?.last_session_date, bx?.sessions_7d])
ok(bw?.last_session_date === null && Number(bw?.sessions_7d) === 0, 'the bug reproduces: client W, whose only session is dated one day ahead, reads as having NO sessions', [bw?.last_session_date, bw?.sessions_7d])

// ── run the fix — twice, to prove it is idempotent ─────────────────────────────────────────────────────────
await db.exec(FIX)
console.log('\nfix ran once without error')
const run2 = await db.exec(FIX)
ok(true, 'fix ran a second time without error (idempotent)')
const readback = run2[run2.length - 1].rows
ok(Array.isArray(readback) && readback.length > 0, 'the read-back SELECT returns rows', readback.length)
const by = (k) => readback.filter(r => r.check_name === k)
ok(by('view options').length === 1 && by('view options')[0].result === 'security_invoker=true', 'read-back: view options = security_invoker=true', by('view options'))
ok(by('view column').length === 19, 'read-back: 19 view columns', by('view column').length)
const priv = Object.fromEntries(by('privilege').map(r => r.result.split(' = ')))
ok(by('privilege').length === 8 && priv['anon SELECT'] === 'false' && priv['anon INSERT'] === 'false' && priv['anon UPDATE'] === 'false' && priv['anon DELETE'] === 'false', 'read-back: anon has NO privilege on the view', priv)
ok(priv['authenticated SELECT'] === 'true' && priv['authenticated INSERT'] === 'false' && priv['authenticated UPDATE'] === 'false' && priv['authenticated DELETE'] === 'false', 'read-back: authenticated can SELECT and nothing else', priv)
ok(by('upper cap').length === 1 && by('upper cap')[0].result === '2 of 2', 'read-back: both upper caps carry the one-day allowance', by('upper cap'))
const colsAfter = await columns()
ok(JSON.stringify(colsAfter) === JSON.stringify(colsBefore) && colsAfter.length === 19, 'the view has the SAME 19 columns, in the same order, as before the fix', { before: colsBefore.length, after: colsAfter.length })

// A DIRTY-STATE RE-RUN: someone re-grants the view to anon and to everyone, then the fix is run again.
await db.exec('grant all on public.coach_client_summary to anon, public')
const dirty = (await rowsOf(`select has_table_privilege('anon', 'public.coach_client_summary', 'SELECT') as s`))[0].s
await db.exec(FIX)
const clean = (await rowsOf(`select has_table_privilege('anon', 'public.coach_client_summary', 'SELECT') as s, has_table_privilege('anon', 'public.coach_client_summary', 'INSERT') as i`))[0]
ok(dirty === true && clean.s === false && clean.i === false, 're-running the fix over a re-granted view takes the anon privileges away again', { dirty, clean })

// ── AFTER the fix ──────────────────────────────────────────────────────────────────────────────────────────
console.log('\nas coach A, after the fix:')
const a = await asAll('authenticated', A)
ok(!a.error && a.rows.length === 4, 'exactly coach A\'s 4 coached clients (not the solo record, not coach B\'s client)', a.error ?? a.rows.map(r => r.full_name))
const x = rowFor(a.rows, CX)
ok(iso(x?.last_session_date) === await ahead(1), 'client X: the session dated one day ahead IS the last session now', x?.last_session_date)
ok(Number(x?.sessions_7d) === 3 && Number(x?.sessions_28d) === 3, 'client X: 3 sessions in 7 and in 28 days (ahead, today, yesterday); two days ahead and the 400-day typo are not counted', [x?.sessions_7d, x?.sessions_28d])
const y = rowFor(a.rows, CY)
ok(iso(y?.last_session_date) === await ago(5), 'client Y: a log TWO days ahead is still ignored (no time zone is that far ahead), and the stray log under another coach stays hidden — last session = 5 days ago', y?.last_session_date)
ok(Number(y?.sessions_7d) === 1 && Number(y?.sessions_28d) === 1, 'client Y: one session counted in each window', [y?.sessions_7d, y?.sessions_28d])
const z = rowFor(a.rows, CZ)
ok(Number(z?.sessions_7d) === 1 && Number(z?.sessions_28d) === 3 && iso(z?.last_session_date) === await ago(7), 'client Z: the window edges did not move (7 days ago is IN the 7-day window, 8 is OUT; 28 IN, 29 OUT)', [z?.sessions_7d, z?.sessions_28d, z?.last_session_date])
const w = rowFor(a.rows, CW)
ok(iso(w?.last_session_date) === await ahead(1) && Number(w?.sessions_7d) === 1, 'client W: a client whose only session is dated one day ahead now shows it', [w?.last_session_date, w?.sessions_7d])

console.log('\nother callers:')
const b = await asAll('authenticated', B)
ok(b.rows?.length === 1 && b.rows[0].client_id === CB && iso(b.rows[0].last_session_date) === await ahead(1), 'coach B sees only their own client (and the same one-day allowance applies)', b.rows?.map(r => r.full_name) ?? b.error)
const cl = await asAll('authenticated', U1)
ok(!cl.error && cl.rows.length === 0, 'a CLIENT (who can read their own clients row) gets ZERO rows', cl.rows?.length ?? cl.error)
const nosub = await asAll('authenticated', '')
ok(!nosub.error && nosub.rows.length === 0, 'an authenticated caller with no subject gets ZERO rows', nosub.rows?.length ?? nosub.error)
const anon = await asAll('anon', '')
ok(anon.error && /permission denied/i.test(anon.error), 'anon is refused outright', anon.error ?? anon.rows)
const wr = await as('authenticated', A, `update public.coach_client_summary set full_name = 'x'`)
ok(wr.error && /permission denied|cannot update view/i.test(wr.error), 'the view cannot be written to by a signed-in user', wr.error ?? wr.rows)
const de = await as('authenticated', A, `delete from public.coach_client_summary`)
ok(de.error && /permission denied|cannot delete from view/i.test(de.error), 'nor deleted from', de.error ?? de.rows)

done()
