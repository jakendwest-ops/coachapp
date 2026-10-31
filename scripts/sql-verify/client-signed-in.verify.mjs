// Verifies scripts/add-client-signed-in-2026-10-31.sql on a real Postgres engine (PGlite) loaded with the live schema (live-schema.mjs), plus a minimal public.profiles that
// the copy lacks: id and consented_at, with the live shape of its read rule (each user reads only their own row - the reason the script needs a SECURITY DEFINER function).
// It runs the three earlier view scripts, then the new script TWICE (idempotency), and checks: the read-back; the 20 old columns unchanged plus signed_in appended; for coach
// A's roster, signed_in = true / false / null for a client who agreed, a linked client who never agreed, an unlinked one and a linked one with no profile row; that the coach
// CANNOT read profiles directly (so the function is what makes this work); that the function answers null for anyone who is not the client's coach (another coach, the client
// themself, no identity) and is not executable by anon; that re-granting is undone by a re-run. Set MUTATE=m1..m8 to apply a deliberate breakage from
// client-signed-in.mutations.mjs — run-mutations.mjs requires each to make this FAIL.
//
//   node scripts/sql-verify/client-signed-in.verify.mjs     # exit 0 = every check passed
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { installLiveSchema } from './live-schema.mjs'
import { startHarness, applyMutation } from './harness.mjs'
import { MUTATIONS } from './client-signed-in.mutations.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n')
const ORIGINAL = read('add-coach-client-summary-2026-09-20.sql')
const UTC_CAP = read('fix-coach-client-summary-utc-cap-2026-10-17.sql')
const CURRENT_PLAN = read('fix-coach-client-summary-current-plan-2026-10-29.sql')
let FIX = read('add-client-signed-in-2026-10-31.sql')
if (process.env.MUTATE) {
  const m = MUTATIONS[process.env.MUTATE]
  if (!m) { console.log('unknown mutation', process.env.MUTATE); process.exit(2) }
  FIX = applyMutation(FIX, m.pairs)
  console.log('MUTATION', process.env.MUTATE, 'applied:', m.why)
}

const { db, ok, rowsOf, as, done } = await startHarness()
console.log('engine:', (await rowsOf('select version()'))[0].version.slice(0, 40))
await installLiveSchema(db)

// ── profiles (the live read rule: own row only) and a roster ───────────────────────────────────────────────────
const A = 'a0000000-0000-4000-8000-000000000001', B = 'b0000000-0000-4000-8000-000000000002'
const U1 = 'c0000000-0000-4000-8000-0000000000c1', U2 = 'c0000000-0000-4000-8000-0000000000c2', U3 = 'c0000000-0000-4000-8000-0000000000c3', U4 = 'c0000000-0000-4000-8000-0000000000c4'
const CJ = '10000000-0000-4000-8000-000000000001', CN = '10000000-0000-4000-8000-000000000002', CX = '10000000-0000-4000-8000-000000000003'
const CP = '10000000-0000-4000-8000-000000000004', CB = '10000000-0000-4000-8000-000000000005', SOLO = '10000000-0000-4000-8000-000000000006'
await db.exec(`
  create table public.profiles (id uuid primary key, consented_at timestamptz);
  alter table public.profiles enable row level security;
  create policy "own profile" on public.profiles for select to authenticated using (id = (select auth.uid()));
  grant select on public.profiles to authenticated;
  insert into public.profiles (id, consented_at) values ('${A}', now()), ('${B}', now()), ('${U1}', now() - interval '3 days'), ('${U2}', null), ('${U4}', now());
  insert into public.clients (id, coach_id, user_id, full_name, status) values
    ('${CJ}', '${A}', '${U1}', 'J joined (agreed to the policy)', 'active'),
    ('${CN}', '${A}', '${U2}', 'N invited, never agreed', 'active'),
    ('${CX}', '${A}', null, 'X not invited', 'active'),
    ('${CP}', '${A}', '${U3}', 'P linked, no profile row', 'active'),
    ('${CB}', '${B}', '${U4}', 'Coach B client (joined)', 'active'),
    ('${SOLO}', null, '${A}', 'Coach A personal record', 'active');
`)
const columns = async () => (await rowsOf(`select a.attname::text || ' ' || format_type(a.atttypid, a.atttypmod) as c from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'coach_client_summary' and a.attnum > 0 and not a.attisdropped order by a.attnum`)).map(r => r.c)
const fn = (role, sub, cid) => as(role, sub, `select public.coach_client_signed_in('${cid}') as v`)

// ── the three earlier scripts, then this one — twice ─────────────────────────────────────────────────────────
await db.exec(ORIGINAL); await db.exec(UTC_CAP); await db.exec(CURRENT_PLAN)
const colsBefore = await columns()
ok(colsBefore.length === 20, 'before: the 2026-10-29 view has 20 columns', colsBefore.length)
await db.exec(FIX)
console.log('\nscript ran once without error')
const run2 = await db.exec(FIX)
ok(true, 'script ran a second time without error (idempotent)')
const rb = run2[run2.length - 1].rows
const by = (k) => rb.filter(r => r.check_name === k).map(r => r.result)
ok(by('view options').length === 1 && by('view options')[0] === 'security_invoker=true', 'read-back: view options = security_invoker=true', by('view options'))
ok(by('view column').length === 21 && by('view column').includes('21 signed_in boolean'), 'read-back: 21 view columns, the 21st signed_in boolean', by('view column').length)
const priv = Object.fromEntries(by('privilege').map(r => r.split(' = ')))
ok(priv['anon SELECT'] === 'false' && priv['anon INSERT'] === 'false' && priv['authenticated SELECT'] === 'true' && priv['authenticated UPDATE'] === 'false', 'read-back: anon has nothing on the view; authenticated reads only', priv)
ok(by('function').length === 1 && by('function')[0] === 'security_definer=true | search_path=public, pg_temp', 'read-back: the function is SECURITY DEFINER with a fixed search_path', by('function'))
ok(JSON.stringify(by('execute').sort()) === JSON.stringify(['anon = false', 'authenticated = true']), 'read-back: anon cannot execute it; authenticated can', by('execute'))
const colsAfter = await columns()
ok(JSON.stringify(colsAfter.slice(0, 20)) === JSON.stringify(colsBefore) && colsAfter[20] === 'signed_in boolean', 'the 20 old columns are unchanged and in order; signed_in is appended last', colsAfter.slice(19))
const rerunOld = await db.exec(CURRENT_PLAN).then(() => null, e => e.message)
ok(rerunOld && /cannot drop columns/i.test(rerunOld), 're-running the 2026-10-29 script now FAILS instead of silently undoing this', rerunOld)

// A dirty-state re-run: someone grants the function and the view to anon, then the script is run again.
await db.exec('grant execute on function public.coach_client_signed_in(uuid) to anon, public; grant all on public.coach_client_summary to anon')
await db.exec(FIX)
const clean = (await rowsOf(`select has_function_privilege('anon', 'public.coach_client_signed_in(uuid)', 'EXECUTE') as f, has_table_privilege('anon', 'public.coach_client_summary', 'SELECT') as v`))[0]
ok(clean.f === false && clean.v === false, 're-running over a re-granted function and view takes anon\'s access away again', clean)

// ── coach A ─────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\nas coach A:')
const a = await as('authenticated', A, 'select client_id, signed_in from public.coach_client_summary order by full_name')
ok(!a.error && a.rows.length === 4, 'coach A sees exactly their 4 coached clients (not the personal record, not coach B\'s)', a.error ?? a.rows.length)
const sig = (cid) => a.rows?.find(r => r.client_id === cid)?.signed_in
ok(sig(CJ) === true, 'a client who agreed to the policy: signed_in = true', sig(CJ))
ok(sig(CN) === false, 'a linked client who never agreed: signed_in = false', sig(CN))
ok(sig(CX) === null, 'a client not linked to a login: signed_in = null', sig(CX))
ok(sig(CP) === null, 'a linked client with no profile row: signed_in = null (unknown, never false)', sig(CP))
const direct = await as('authenticated', A, `select id from public.profiles where id = '${U1}'`)
ok(!direct.error && direct.rows.length === 0, 'coach A CANNOT read the client\'s profile directly (own-row rule) - only the function can', direct.error ?? direct.rows)
const aOther = await fn('authenticated', A, CB)
ok(!aOther.error && aOther.rows[0].v === null, 'coach A asking about coach B\'s client gets null', aOther.error ?? aOther.rows)
const aSolo = await fn('authenticated', A, SOLO)
ok(!aSolo.error && aSolo.rows[0].v === null, 'coach A asking about their own personal record gets null (it has no coach)', aSolo.error ?? aSolo.rows)

console.log('\nother callers:')
const b = await as('authenticated', B, 'select client_id, signed_in from public.coach_client_summary')
ok(!b.error && b.rows.length === 1 && b.rows[0].client_id === CB && b.rows[0].signed_in === true, 'coach B sees only their client, signed in', b.error ?? b.rows)
const bOther = await fn('authenticated', B, CJ)
ok(!bOther.error && bOther.rows[0].v === null, 'coach B asking about coach A\'s client gets null', bOther.error ?? bOther.rows)
const self = await fn('authenticated', U1, CJ)
ok(!self.error && self.rows[0].v === null, 'the client asking about their own record gets null (they are not its coach)', self.error ?? self.rows)
const nosub = await fn('authenticated', '', CJ)
ok(!nosub.error && nosub.rows[0].v === null, 'a signed-in caller with no subject gets null', nosub.error ?? nosub.rows)
const anon = await fn('anon', '', CJ)
ok(anon.error && /permission denied/i.test(anon.error), 'anon cannot execute the function at all', anon.error ?? anon.rows)
const anonView = await as('anon', '', 'select * from public.coach_client_summary')
ok(anonView.error && /permission denied/i.test(anonView.error), 'anon cannot read the view', anonView.error ?? anonView.rows)

done()
