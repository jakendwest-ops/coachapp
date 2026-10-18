#!/usr/bin/env node
/**
 * checks.sh rule 9v: every SECURITY DEFINER function a migration script creates is locked down in that script.
 *
 * Why. A SECURITY DEFINER function runs with its OWNER's rights, i.e. past row-level security -- so who may CALL it is the whole
 * security story. Supabase grants EXECUTE on every new function in `public` to `anon` (and PUBLIC) by default, so a definer
 * function with no revoke is callable by anyone on the internet who holds the public anon key, with the owner's power. The live
 * inventory of 2026-10-18 found nine functions executable by `anon`. Eight were trigger functions (not callable through the API)
 * and the ninth, delete_current_user(), only ever deletes auth.uid() - null for a signed-out caller - so nothing was exploitable;
 * but that was luck of what they do, not a rule. The two functions written most carefully (assign_program, client_may_delete_log*)
 * already carried their own revoke. This makes that a rule for the NEXT definer function someone writes.
 *
 * What it checks, per `create [or replace] function` statement in a *.sql file (the WHOLE statement, up to its closing `;`, with
 * the body blanked out - so an option written after the body, `as $$ ... $$ language plpgsql security definer;`, is seen):
 *   - SECURITY DEFINER  ->  it must `set search_path` (a definer function with a mutable search path can be made to run an
 *     attacker's same-named object with the owner's rights).
 *   - SECURITY DEFINER and NOT `returns trigger`  ->  the same file must revoke EXECUTE on it from BOTH `public` and `anon`. A
 *     trigger function cannot be called through the API, so for those only the search_path rule applies.
 * And, anywhere in a script:
 *   - `alter function ... security definer` is refused: write it as CREATE FUNCTION so this check can see the whole definition.
 *   - a GRANT of function execution to `anon` or `public` (a single function, all functions, or ALTER DEFAULT PRIVILEGES) is
 *     refused: it would undo the revoke the same script just made.
 *
 * KNOWN LIMITS (named): revokes are matched by function NAME, not signature, so a revoke on one overload covers its siblings; it
 * reads only tracked scripts/*.sql, not SQL pasted from a chat into the dashboard; and a function that exists live with no script
 * in this repo (delete_current_user, handle_new_user) is invisible to it - the live inventory query is the check for those.
 *
 * Usage: node scripts/check-sql-definer.mjs <file.sql> ...      (exit 1 = findings)
 */
import { readFileSync, existsSync } from 'node:fs'

const files = process.argv.slice(2).filter(f => existsSync(f))
if (!files.length) { console.log('  check-sql-definer: no SQL scripts were given (an empty list would pass everything)'); process.exit(1) }
const findings = []
let checkedFns = 0, definers = 0

// SQL comments are documentation: a `-- security definer` in a banner must not count, nor hide a real header.
const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' ')).replace(/--[^\n]*/g, m => ' '.repeat(m.length))

/** Index of the `;` that ends the statement starting at `from`, ignoring semicolons inside '...' and $tag$...$tag$. */
function statementEnd (sql, from) {
  let i = from, q = null
  while (i < sql.length) {
    const c = sql[i]
    if (q === "'") { if (c === "'") { if (sql[i + 1] === "'") i++; else q = null } i++; continue }
    if (q) { if (sql.startsWith(q, i)) { i += q.length; q = null; continue } i++; continue }
    if (c === "'") { q = "'"; i++; continue }
    if (c === '$') { const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i, i + 40)); if (m) { q = m[0]; i += m[0].length; continue } }
    if (c === ';') return i
    i++
  }
  return sql.length
}
/** The statement with every quoted string and dollar-quoted body replaced by spaces: only the options, the name and the keywords remain. */
function blankQuoted (stmt) {
  let out = '', i = 0, q = null
  while (i < stmt.length) {
    const c = stmt[i]
    if (q === "'") { if (c === "'") { if (stmt[i + 1] === "'") { out += '  '; i += 2; continue } q = null; out += c } else out += ' '; i++; continue }
    if (q) { if (stmt.startsWith(q, i)) { out += q; i += q.length; q = null; continue } out += c === '\n' ? '\n' : ' '; i++; continue }
    if (c === "'") { q = "'"; out += c; i++; continue }
    if (c === '$') { const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(stmt.slice(i, i + 40)); if (m) { q = m[0]; out += m[0]; i += m[0].length; continue } }
    out += c; i++
  }
  return out
}

for (const f of files) {
  const sql = stripComments(readFileSync(f, 'utf8'))
  // The same script with every quoted string and dollar-quoted body blanked: a `revoke ... from public, anon` that exists only INSIDE a string
  // (comment on function f is 'revoke ...') is not a revoke, and a grant inside a body is not this script's grant.
  const code = blankQuoted(sql)

  // A blanket `revoke ... on all functions in schema public from public, anon` covers every function in the schema.
  const blanket = new Set()
  for (const r of code.matchAll(/revoke\s+[\s\S]*?\bon\s+all\s+(?:functions|routines|procedures)\s+in\s+schema\s+"?public"?\s+from\s+([^;]+);/gi)) {
    r[1].split(',').forEach(x => blanket.add(x.trim().replace(/"/g, '').toLowerCase()))
  }

  // 1. every CREATE FUNCTION / PROCEDURE, judged on its whole statement
  const re = /create\s+(?:or\s+replace\s+)?(?:function|procedure)\s+((?:"?[\w]+"?\.)?"?[\w]+"?)\s*\(/gi
  let m
  while ((m = re.exec(sql)) !== null) {
    checkedFns++
    const name = m[1].replace(/"/g, '').split('.').pop()
    const stmt = blankQuoted(sql.slice(m.index, statementEnd(sql, m.index)))
    const line = sql.slice(0, m.index).split('\n').length
    if (!/security\s+definer/i.test(stmt)) continue
    definers++
    const isTrigger = /returns\s+trigger\b/i.test(stmt)
    if (!/\bset\s+search_path\b/i.test(stmt)) findings.push(`${f}:${line}  ${name}() is SECURITY DEFINER with no \`set search_path\``)
    if (!isTrigger) {
      const revoked = new Set(blanket)
      for (const r of code.matchAll(/revoke\s+[\s\S]*?\bon\s+(?:function|procedure|routine)\s+(?:"?public"?\.)?"?(\w+)"?\s*\([^)]*\)\s*from\s+([^;]+);/gi)) {
        if (r[1].toLowerCase() === name.toLowerCase()) r[2].split(',').forEach(x => revoked.add(x.trim().replace(/"/g, '').toLowerCase()))
      }
      const missing = ['public', 'anon'].filter(x => !revoked.has(x))
      if (missing.length) findings.push(`${f}:${line}  ${name}() is SECURITY DEFINER and is not revoked from ${missing.join(' and ')} in this script (it would be callable by anyone holding the anon key)`)
    }
  }

  // 2. ALTER FUNCTION ... SECURITY DEFINER hides the definition from this check
  for (const a of code.matchAll(/alter\s+(?:function|procedure|routine)\s+[^;]*?security\s+definer[^;]*;/gi)) {
    findings.push(`${f}:${sql.slice(0, a.index).split('\n').length}  ALTER FUNCTION ... SECURITY DEFINER: write it as CREATE OR REPLACE FUNCTION so the whole definition can be checked`)
  }

  // 3. a grant of function / procedure / routine execution back to anon / public (one object, or all of them, or default privileges)
  for (const g of code.matchAll(/grant\s+(?:execute|all)(?:\s+privileges)?\s+on\s+(?:all\s+(?:functions|routines|procedures)|functions|function|procedures|procedure|routines|routine)\b[^;]*?\bto\s+([^;]+);/gi)) {
    const to = g[1].toLowerCase().split(',').map(x => x.trim().replace(/"/g, '').split(/\s+/)[0])
    if (to.includes('anon') || to.includes('public')) findings.push(`${f}:${sql.slice(0, g.index).split('\n').length}  grants function execution to ${to.filter(x => x === 'anon' || x === 'public').join(' and ')}`)
  }
}

if (findings.length) {
  console.log(`  ${findings.length} SECURITY DEFINER finding(s):`)
  for (const x of findings) console.log(`    ${x}`)
  console.log('  Add:  revoke all on function public.<name>(<args>) from public, anon;   then grant execute to authenticated if the app calls it.')
  console.log('  And give the function  set search_path = public, pg_temp  (or \'\' with every object schema-qualified).')
  process.exit(1)
}
console.log(`  check-sql-definer: ${files.length} script(s), ${checkedFns} function(s), ${definers} SECURITY DEFINER -- all locked down.`)
process.exit(0)
