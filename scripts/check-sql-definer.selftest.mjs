#!/usr/bin/env node
/**
 * Proves check-sql-definer.mjs BLOCKS a SECURITY DEFINER function that anyone holding the anon key could call (the
 * shape nine live functions were found in on 2026-10-18) and stays quiet on the locked-down form and on functions that
 * are not definers. The PASS fixtures are the real shapes in scripts/ (assign_program, client_may_delete_log,
 * touch_parent_workout_template).
 * Run: node scripts/check-sql-definer.selftest.mjs      (exit 1 = a case misbehaved)
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const CHECK = join(dirname(fileURLToPath(import.meta.url)), 'check-sql-definer.mjs')
const FN = (opts, name = 'do_thing', returns = 'void') =>
  `create or replace function public.${name}(p_id uuid) returns ${returns} language plpgsql ${opts} as $$ begin null; end; $$;`

const CASES = [
  // ── must BLOCK ────────────────────────────────────────────────────────────────
  { want: 'BLOCK', why: 'definer, no search_path, no revoke -- the worst case',
    src: FN('security definer') },
  { want: 'BLOCK', why: 'definer with a search_path but NO revoke: callable by anon with the owner\'s rights',
    src: FN('security definer set search_path = public, pg_temp') },
  { want: 'BLOCK', why: 'revoked from public but not from anon (Supabase grants anon explicitly, so public alone is not enough)',
    src: FN('security definer set search_path = public, pg_temp') + '\nrevoke all on function public.do_thing(uuid) from public;' },
  { want: 'BLOCK', why: 'revoked from anon but not from public',
    src: FN('security definer set search_path = public, pg_temp') + '\nrevoke all on function public.do_thing(uuid) from anon;' },
  { want: 'BLOCK', why: 'a definer TRIGGER function with a mutable search_path',
    src: FN('security definer', 'trg', 'trigger') },
  { want: 'BLOCK', why: 'the revoke is for a DIFFERENT function',
    src: FN('security definer set search_path = public, pg_temp') + '\nrevoke all on function public.other_fn(uuid) from public, anon;' },
  { want: 'BLOCK', why: 'one bad function after a good one is still found',
    src: FN('security definer set search_path = public, pg_temp', 'good') + '\nrevoke all on function public.good(uuid) from public, anon;\n' + FN('security definer set search_path = public', 'bad') },

  // the options AFTER the body (pg_dump and most tutorials write it this way): a first version cut the header at `as $$` and never saw them
  { want: 'BLOCK', why: 'definer written AFTER the body, no search_path, no revoke',
    src: 'create or replace function public.evil(p uuid) returns void as $$ begin null; end; $$ language plpgsql security definer;' },
  { want: 'BLOCK', why: 'definer after a custom-tagged body, with a search_path but no revoke',
    src: 'create or replace function public.evil(p uuid) returns void as $fn$ begin null; end; $fn$ language plpgsql security definer set search_path = public, pg_temp;' },
  { want: 'BLOCK', why: 'a semicolon INSIDE the body does not end the statement early',
    src: 'create or replace function public.evil(p uuid) returns void as $$ begin perform 1; perform 2; end; $$ language plpgsql security definer;' },
  { want: 'BLOCK', why: 'ALTER FUNCTION ... SECURITY DEFINER hides the definition from the check',
    src: 'create function public.f() returns void language sql as $$ select 1 $$;\nalter function public.f() security definer;' },
  { want: 'BLOCK', why: 'a later GRANT to anon undoes the revoke the same script made',
    src: FN('security definer set search_path = public, pg_temp') + '\nrevoke all on function public.do_thing(uuid) from public, anon;\ngrant execute on function public.do_thing(uuid) to anon;' },
  { want: 'BLOCK', why: 'grant execute on ALL functions to anon',
    src: 'grant execute on all functions in schema public to anon;' },
  { want: 'BLOCK', why: 'default privileges that hand every new function to anon',
    src: 'alter default privileges in schema public grant execute on functions to anon, authenticated;' },
  { want: 'BLOCK', why: 'grant to PUBLIC',
    src: 'grant execute on function public.do_thing(uuid) to public;' },
  { want: 'BLOCK', why: 'grant execute on all ROUTINES to anon',
    src: 'grant execute on all routines in schema public to anon;' },
  { want: 'BLOCK', why: 'a QUOTED grantee is still anon',
    src: 'grant execute on function public.do_thing(uuid) to "anon";' },
  { want: 'BLOCK', why: 'a procedure granted to anon',
    src: 'grant execute on procedure public.run_it() to anon;' },
  { want: 'BLOCK', why: 'a SECURITY DEFINER procedure with no revoke',
    src: 'create or replace procedure public.run_it() language sql security definer set search_path = public, pg_temp as $$ select 1 $$;' },
  { want: 'BLOCK', why: 'a revoke that exists only inside a STRING (a comment on the function) is not a revoke',
    src: FN('security definer set search_path = public, pg_temp') + "\ncomment on function public.do_thing(uuid) is 'revoke all on function public.do_thing(uuid) from public, anon;';" },

  // ── must PASS ─────────────────────────────────────────────────────────────────
  { want: 'PASS', why: 'options AFTER the body, fully locked down',
    src: 'create or replace function public.ok(p uuid) returns void as $$ begin null; end; $$ language plpgsql security definer set search_path = public, pg_temp;\nrevoke all on function public.ok(uuid) from public, anon;' },
  { want: 'PASS', why: 'a blanket revoke on all functions in the schema covers a definer function',
    src: FN('security definer set search_path = public, pg_temp') + '\nrevoke all on all functions in schema public from public, anon;' },
  { want: 'PASS', why: 'a grant to authenticated is what the app needs',
    src: FN('security definer set search_path = public, pg_temp') + '\nrevoke all on function public.do_thing(uuid) from public, anon;\ngrant execute on function public.do_thing(uuid) to authenticated;' },
  { want: 'PASS', why: 'the words "security definer" inside a STRING body are not an option',
    src: "create or replace function public.msg() returns text language sql as $$ select 'this is not security definer' $$;" },
  { want: 'PASS', why: 'definer + search_path + one combined revoke (client_may_delete_log)',
    src: FN('security definer set search_path = public, pg_temp') + '\nrevoke all on function public.do_thing(uuid) from public, anon;' },
  { want: 'PASS', why: 'definer + search_path + two separate revokes (the shape assign_program uses, though that one is an invoker)',
    src: FN('security definer set search_path = public, pg_temp') + '\nrevoke all on function public.do_thing(uuid) from public;\nrevoke all on function public.do_thing(uuid) from anon;' },
  { want: 'PASS', why: 'a definer TRIGGER function needs the search_path but no revoke (touch_parent_workout_template)',
    src: FN("security definer set search_path = 'public'", 'trg', 'trigger') },
  { want: 'PASS', why: 'an invoker function: RLS applies as the caller, nothing to lock down',
    src: FN('') },
  { want: 'PASS', why: 'the words in a COMMENT inside the function header are documentation (it is an invoker)',
    src: 'create or replace function public.do_thing(p_id uuid) returns void language plpgsql -- was: security definer\n as $$ begin null; end; $$;' },
  { want: 'PASS', why: 'a whole function commented out is not a function',
    src: '-- create or replace function public.old_fn(x int) returns void language sql security definer as $$ select 1 $$;\n/* create function public.older() returns void language sql security definer as $$ select 1 $$; */\n' + FN('') },
  { want: 'PASS', why: 'a quoted, schema-qualified name',
    src: 'create function "public"."do_thing"(p_id uuid) returns void language sql security definer set search_path = public, pg_temp as $$ select 1 $$;\nrevoke all on function public.do_thing(uuid) from public, anon;' },
]

// An EMPTY list must fail: `$(git ls-files 'scripts/*.sql')` returning nothing would otherwise print a green "0 scripts" and pass everything.
CASES.push({ want: 'BLOCK', why: 'no script was given at all', noFiles: true, src: '' })

const dir = mkdtempSync(join(tmpdir(), 'definer-selftest-'))
let failures = 0
CASES.forEach((c, i) => {
  const file = join(dir, `case${i}.sql`)
  writeFileSync(file, c.src + '\n', 'utf8')
  let exit = 0, out = ''
  try { out = execFileSync(process.execPath, c.noFiles ? [CHECK] : [CHECK, file], { encoding: 'utf8' }) }
  catch (err) { exit = err.status; out = (err.stdout || '') + (err.stderr || '') }
  const got = exit === 0 ? 'PASS' : 'BLOCK'
  if (got !== c.want) { failures++; console.log(`  [${i}] want ${c.want}, got ${got} -- ${c.why}\n${out}`) }
})
rmSync(dir, { recursive: true, force: true })

const blocks = CASES.filter(c => c.want === 'BLOCK').length
if (!blocks || blocks === CASES.length) { console.log('  self-test is one-sided'); process.exit(1) }
if (failures) { console.log(`  ${failures} of ${CASES.length} self-test cases misbehaved.`); process.exit(1) }
console.log(`  check-sql-definer self-test: ${CASES.length} cases behaved (${blocks} must-block, ${CASES.length - blocks} must-pass).`)
process.exit(0)
