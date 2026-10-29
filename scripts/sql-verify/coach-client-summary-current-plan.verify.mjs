// Verifies scripts/fix-coach-client-summary-current-plan-2026-10-29.sql on a real Postgres engine (PGlite) loaded with the live schema (live-schema.mjs). It first runs the two
// earlier view scripts and proves the bug is real (a next block booked for a future date becomes the client's plan), then runs the fix TWICE (idempotency) and checks, for a roster
// covering every case of the rule: which plan each client's row names, next_program_start, the 19 old columns unchanged plus the one appended, the read-back, and who can and cannot
// read or write the view. It also feeds every client's assignments to the app's own _currentAssignment (js/app-core.js) and requires the SAME answer - the two copies of the rule
// cannot drift apart without this failing. Set MUTATE=m1..m9 to apply one of the deliberate breakages in coach-client-summary-current-plan.mutations.mjs — run-mutations.mjs
// requires each to make this FAIL.
//
//   node scripts/sql-verify/coach-client-summary-current-plan.verify.mjs     # exit 0 = every check passed
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { installLiveSchema } from './live-schema.mjs'
import { startHarness, applyMutation } from './harness.mjs'
import { MUTATIONS } from './coach-client-summary-current-plan.mutations.mjs'
import { get } from '../../tests-node/load-app.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n')
const ORIGINAL = read('add-coach-client-summary-2026-09-20.sql')
const UTC_CAP = read('fix-coach-client-summary-utc-cap-2026-10-17.sql')
let FIX = read('fix-coach-client-summary-current-plan-2026-10-29.sql')
if (process.env.MUTATE) {
  const m = MUTATIONS[process.env.MUTATE]
  if (!m) { console.log('unknown mutation', process.env.MUTATE); process.exit(2) }
  FIX = applyMutation(FIX, m.pairs)
  console.log('MUTATION', process.env.MUTATE, 'applied:', m.why)
}

const { db, ok, rowsOf, as, done } = await startHarness()
console.log('engine:', (await rowsOf('select version()'))[0].version.slice(0, 40))
await installLiveSchema(db)

// ── a roster that covers the rule ──────────────────────────────────────────────────────────────────────────
// Each client gets plans of its own programme (programme ids P<client><n>). `s` is the start offset in days from the UTC day, null = no
// start date; `c` is created_at as an offset in days (null = no created_at at all).
const A = 'a0000000-0000-4000-8000-000000000001', B = 'b0000000-0000-4000-8000-000000000002', U1 = 'c0000000-0000-4000-8000-0000000000c1'
const CLIENTS = {
  R: { name: 'R running, next block booked later', plans: [{ s: -30, c: -31 }, { s: 5, c: -1 }], current: 0, next: 5 },
  F: { name: 'F only future plans', plans: [{ s: 10, c: -2 }, { s: 3, c: -3 }], current: 1, next: 10 },
  O: { name: 'O overlapping started plans', plans: [{ s: -60, c: -61 }, { s: -10, c: -70 }], current: 1, next: null },
  D: { name: 'D a plan starting today', plans: [{ s: -30, c: -31 }, { s: 0, c: -2 }], current: 1, next: null },
  U: { name: 'U undated plan assigned yesterday', plans: [{ s: -20, c: -21 }, { s: null, c: -1 }], current: 1, next: null },
  Y: { name: 'Y no start and no assigned time, plus a future plan', plans: [{ s: 7, c: -2 }, { s: null, c: null }], current: 1, next: 7 },
  S: { name: 'S two plans on the same start', plans: [{ s: -5, c: -9 }, { s: -5, c: -6 }], current: 1, next: null },
  E: { name: 'E ended long ago, nothing after', plans: [{ s: -200, c: -201 }], current: 0, next: null },
  N: { name: 'N no plans', plans: [], current: null, next: null },
}
const T = "(now() at time zone 'utc')::date"
const hex = (n) => n.toString(16).padStart(12, '0')
let seq = 1
const ids = {}
let sql = ''
for (const [k, cl] of Object.entries(CLIENTS)) {
  const cid = `10000000-0000-4000-8000-${hex(seq++)}`
  ids[k] = { cid, plans: [] }
  sql += `insert into public.clients (id, coach_id, user_id, full_name, status) values ('${cid}', '${A}', null, '${cl.name}', 'active');\n`
  cl.plans.forEach((p, i) => {
    const pid = `20000000-0000-4000-8000-${hex(seq++)}`, cpid = `30000000-0000-4000-8000-${hex(seq++)}`
    ids[k].plans.push({ pid, cpid })
    sql += `insert into public.programs (id, coach_id, name) values ('${pid}', '${A}', '${k} plan ${i}');\n`
    sql += `insert into public.program_phases (program_id, name, duration_weeks, order_index) values ('${pid}', 'P', ${2 + i}, 0);\n`
    sql += `insert into public.client_programs (id, client_id, program_id, start_date, created_at) values ('${cpid}', '${cid}', '${pid}', ` +
      `${p.s === null ? 'null' : `${T} + ${p.s}`}, ${p.c === null ? 'null' : `now() + interval '${p.c} days'`});\n`
  })
}
// Another coach's client with a plan, and coach A's own personal (solo) record with a plan: neither may appear for coach A.
const CB = '10000000-0000-4000-8000-0000000000b1', SOLO = '10000000-0000-4000-8000-0000000000b2'
sql += `insert into public.clients (id, coach_id, user_id, full_name, status) values ('${CB}', '${B}', null, 'Other coach client', 'active'), ('${SOLO}', null, '${A}', 'Coach A personal record', 'active');
  insert into public.programs (id, coach_id, name) values ('20000000-0000-4000-8000-0000000000b1', '${B}', 'B plan');
  insert into public.client_programs (client_id, program_id, start_date) values ('${CB}', '20000000-0000-4000-8000-0000000000b1', ${T} - 3);\n`
await db.exec(sql)

const asAll = (role, sub) => as(role, sub, 'select * from public.coach_client_summary order by full_name')
const day = async (n) => (await rowsOf(`select (${T} + ${n})::text as d`))[0].d
const iso = (d) => (d == null ? null : d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10))
const rowFor = (rows, k) => rows.find(r => r.client_id === ids[k].cid)
const expectedProgram = (k) => (CLIENTS[k].current === null ? null : ids[k].plans[CLIENTS[k].current].pid)
const columns = async () => (await rowsOf(`select a.attname::text || ' ' || format_type(a.atttypid, a.atttypmod) as c from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'coach_client_summary' and a.attnum > 0 and not a.attisdropped order by a.attnum`)).map(r => r.c)

// ── BEFORE the fix: the bug is real ──────────────────────────────────────────────────────────────────
console.log('\nbefore the fix (the 2026-09-20 and 2026-10-17 scripts only):')
await db.exec(ORIGINAL)
await db.exec(UTC_CAP)
const colsBefore = await columns()
const before = await asAll('authenticated', A)
ok(!before.error, 'query works', before.error)
ok(rowFor(before.rows, 'R')?.program_id === ids.R.plans[1].pid, 'the bug reproduces: client R\'s row names the block booked for NEXT week, not the one they are running', rowFor(before.rows, 'R')?.program_name)

// ── run the fix — twice, to prove it is idempotent ─────────────────────────────────────────────────────────
await db.exec(FIX)
console.log('\nfix ran once without error')
const run2 = await db.exec(FIX)
ok(true, 'fix ran a second time without error (idempotent)')
const readback = run2[run2.length - 1].rows
ok(Array.isArray(readback) && readback.length > 0, 'the read-back SELECT returns rows', readback.length)
const by = (k) => readback.filter(r => r.check_name === k)
ok(by('view options').length === 1 && by('view options')[0].result === 'security_invoker=true', 'read-back: view options = security_invoker=true', by('view options'))
ok(by('view column').length === 20 && by('view column').some(r => r.result === '20 next_program_start date'), 'read-back: 20 view columns, the 20th next_program_start date', by('view column').length)
const priv = Object.fromEntries(by('privilege').map(r => r.result.split(' = ')))
ok(by('privilege').length === 8 && priv['anon SELECT'] === 'false' && priv['anon INSERT'] === 'false' && priv['anon UPDATE'] === 'false' && priv['anon DELETE'] === 'false', 'read-back: anon has NO privilege on the view', priv)
ok(priv['authenticated SELECT'] === 'true' && priv['authenticated INSERT'] === 'false' && priv['authenticated UPDATE'] === 'false' && priv['authenticated DELETE'] === 'false', 'read-back: authenticated can SELECT and nothing else', priv)
ok(by('plan order').length === 1 && by('plan order')[0].result === 'date-aware', 'read-back: the plan order is date-aware', by('plan order'))
const colsAfter = await columns()
ok(JSON.stringify(colsAfter.slice(0, 19)) === JSON.stringify(colsBefore) && colsAfter.length === 20 && colsAfter[19] === 'next_program_start date', 'the 19 old columns are unchanged and in order; next_program_start is appended last', { before: colsBefore.length, after: colsAfter.length, last: colsAfter[19] })
const rerunOld = await db.exec(UTC_CAP).then(() => null, e => e.message)
ok(rerunOld && /cannot drop columns/i.test(rerunOld), 're-running the 2026-10-17 script now FAILS instead of silently undoing this', rerunOld)

// A DIRTY-STATE RE-RUN: someone re-grants the view to anon and to everyone, then the fix is run again.
await db.exec('grant all on public.coach_client_summary to anon, public')
await db.exec(FIX)
const clean = (await rowsOf(`select has_table_privilege('anon', 'public.coach_client_summary', 'SELECT') as s, has_table_privilege('anon', 'public.coach_client_summary', 'INSERT') as i`))[0]
ok(clean.s === false && clean.i === false, 're-running the fix over a re-granted view takes the anon privileges away again', clean)

// ── AFTER the fix: every case of the rule ─────────────────────────────────────────────────────────────────────
console.log('\nas coach A, after the fix:')
const a = await asAll('authenticated', A)
ok(!a.error && a.rows.length === Object.keys(CLIENTS).length, `exactly coach A's ${Object.keys(CLIENTS).length} coached clients (not the solo record, not coach B's client)`, a.error ?? a.rows.map(r => r.full_name))
const todayStr = await day(0)
const pick = get('_currentAssignment')
for (const [k, cl] of Object.entries(CLIENTS)) {
  const r = rowFor(a.rows, k)
  const wantNext = cl.next === null ? null : await day(cl.next)
  ok(r?.program_id === expectedProgram(k), `${cl.name}: the row names plan ${cl.current ?? 'none'}`, r?.program_name)
  ok(iso(r?.next_program_start) === wantNext, `${cl.name}: next_program_start = ${wantNext ?? 'null'}`, r?.next_program_start)
  // The same assignments, shaped as the app reads them, through the app's own rule.
  const rows = await rowsOf(`select id, program_id, start_date::text as start_date, to_char(created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at from public.client_programs where client_id = '${ids[k].cid}'`)
  const js = pick(rows, todayStr)
  const jsNext = js.next ? (js.next.start_date || String(js.next.created_at).slice(0, 10)) : null
  ok((js.current?.program_id ?? null) === (r?.program_id ?? null) && jsNext === iso(r?.next_program_start), `${cl.name}: the app's _currentAssignment gives the SAME current plan and next start as the view`, { js: js.current?.program_id, view: r?.program_id, jsNext, viewNext: r?.next_program_start })
}
const rr = rowFor(a.rows, 'R')
ok(iso(rr?.program_start) === await day(-30) && Number(rr?.program_weeks) === 2, 'client R: the start date and weeks are the RUNNING block\'s (so "plans ending" sees it)', [rr?.program_start, rr?.program_weeks])

console.log('\nother callers:')
const b = await asAll('authenticated', B)
ok(b.rows?.length === 1 && b.rows[0].client_id === CB, 'coach B sees only their own client', b.rows?.map(r => r.full_name) ?? b.error)
const cl = await asAll('authenticated', U1)
ok(!cl.error && cl.rows.length === 0, 'another signed-in user (not a coach of these clients) gets ZERO rows', cl.rows?.length ?? cl.error)
const nosub = await asAll('authenticated', '')
ok(!nosub.error && nosub.rows.length === 0, 'an authenticated caller with no subject gets ZERO rows', nosub.rows?.length ?? nosub.error)
const anon = await asAll('anon', '')
ok(anon.error && /permission denied/i.test(anon.error), 'anon is refused outright', anon.error ?? anon.rows)
const wr = await as('authenticated', A, `update public.coach_client_summary set full_name = 'x'`)
ok(wr.error && /permission denied|cannot update view/i.test(wr.error), 'the view cannot be written to by a signed-in user', wr.error ?? wr.rows)

done()
