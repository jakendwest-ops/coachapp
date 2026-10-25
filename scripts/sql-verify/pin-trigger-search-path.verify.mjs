// Verifies scripts/pin-trigger-search-path-2026-10-25.sql on a real Postgres engine (PGlite) loaded with the live tables and the two trigger functions as scripted.
// It first proves the fixture reproduces the Advisor finding (both functions carry no search_path), records what the triggers DO, runs the script TWICE (idempotency),
// then checks both functions are pinned, their bodies and behaviour are unchanged, the read-back the script ends with, and that the documented rollback restores the old state.
// Set MUTATE=m1..m6 to apply one of the deliberate breakages in pin-trigger-search-path.mutations.mjs - run-mutations.mjs requires each to make this FAIL.
//
//   node scripts/sql-verify/pin-trigger-search-path.verify.mjs       # exit 0 = every check passed
//   node scripts/sql-verify/run-mutations.mjs                        # exit 0 = every breakage was caught
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { installLiveSchema } from './live-schema.mjs'
import { installProgramLifecycleSchema } from './live-schema-programs.mjs'
import { startHarness, applyMutation } from './harness.mjs'
import { MUTATIONS } from './pin-trigger-search-path.mutations.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
let SCRIPT = fs.readFileSync(path.join(here, '..', 'pin-trigger-search-path-2026-10-25.sql'), 'utf8').replace(/\r\n/g, '\n')
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

const FUNCS = ['touch_workout_template_updated_at', 'set_workout_template_family_id']
const A = 'a0000000-0000-4000-8000-000000000001'
const cfg = async (fn) => (await rowsOf(`select proconfig::text as c, md5(prosrc) as src, prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and proname = '${fn}'`))[0]

// ── 1. CONTROL: the Advisor finding is reproduced, and what the triggers do is recorded ─────────────────────────────
const before = {}
for (const f of FUNCS) before[f] = await cfg(f)
ok(FUNCS.every(f => before[f] && before[f].c === null), 'CONTROL (before the script): both trigger functions carry no search_path - the Advisor finding is reproduced', before)
ok(FUNCS.every(f => before[f].prosecdef === false), 'CONTROL: neither is SECURITY DEFINER (so the pin changes no privilege)', before)
let r = await as('authenticated', A, `insert into public.workout_templates (coach_id, name) values ('${A}', 'before') returning id, family_id`)
ok(!r.error && r.rows[0] && r.rows[0].family_id === r.rows[0].id, 'CONTROL: a new template becomes its own family (family_id = id)', r)
const TID = r.rows && r.rows[0] && r.rows[0].id
r = await as('authenticated', A, `update public.workout_templates set name = 'before 2', updated_at = '2001-01-01' where id = '${TID}' returning updated_at`)
ok(!r.error && r.rows[0] && new Date(r.rows[0].updated_at).getFullYear() >= 2024, 'CONTROL: an update stamps updated_at with now()', r)

// ── 2. run the migration - twice, to prove it is idempotent ─────────────────────────────────────────────────────────
try { await db.exec(SCRIPT); await db.exec(SCRIPT); ok(true, 'the script runs twice without error (idempotent)') }
catch (e) { ok(false, 'the script runs twice without error (idempotent)', String(e.message)); await new Promise(r => setTimeout(r, 500)); done() }

// the read-back the script ends with
const rb = Object.fromEntries((await rowsOf(SCRIPT.slice(SCRIPT.indexOf('-- READ-BACK')))).map(x => [x.name, x.detail]))
ok(Object.keys(rb).length === 2 && FUNCS.every(f => rb[f] === 'search_path=public, pg_temp'), 'read-back: both functions listed, each with search_path=public, pg_temp', rb)

// ── 3. AFTER ────────────────────────────────────────────────────────────────────────────────────────────────────────
const after = {}
for (const f of FUNCS) after[f] = await cfg(f)
ok(FUNCS.every(f => after[f].c === '{"search_path=public, pg_temp"}'), 'both functions are pinned to search_path = public, pg_temp', after)
ok(FUNCS.every(f => after[f].src === before[f].src), 'neither function body changed', { before, after })
ok(FUNCS.every(f => after[f].prosecdef === false), 'neither became SECURITY DEFINER', after)
r = await as('authenticated', A, `insert into public.workout_templates (coach_id, name) values ('${A}', 'after') returning id, family_id`)
ok(!r.error && r.rows[0] && r.rows[0].family_id === r.rows[0].id, 'a new template still becomes its own family (the trigger still works)', r)
const TID2 = r.rows && r.rows[0] && r.rows[0].id
r = await as('authenticated', A, `update public.workout_templates set name = 'after 2', updated_at = '2001-01-01' where id = '${TID2}' returning updated_at`)
ok(!r.error && r.rows[0] && new Date(r.rows[0].updated_at).getFullYear() >= 2024, 'an update still stamps updated_at with now() (the trigger still works)', r)

// ── 4. the documented rollback runs and restores the old state ──────────────────────────────────────────────────────
const rollback = [...SCRIPT.matchAll(/^--\s+(alter function [^\n]*reset search_path;)$/gm)].map(m => m[1])
ok(rollback.length === 2, 'the header documents a rollback for both functions', rollback)
try {
  for (const stmt of rollback) await db.exec(stmt)
  const reverted = []
  for (const f of FUNCS) reverted.push((await cfg(f)).c)
  ok(reverted.every(c => c === null), 'the documented rollback runs and puts both functions back to carrying no search_path', reverted)
} catch (e) { ok(false, 'the documented rollback runs', String(e.message)) }

done()
