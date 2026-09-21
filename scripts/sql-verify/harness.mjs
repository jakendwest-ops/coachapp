// The small shared toolkit for the verifiers in this folder: an in-memory Postgres (PGlite), a counting `ok`,
// a helper to run a query AS a role with a given JWT subject (so row-level security applies exactly as it does for a
// real caller), and mutation support — a verifier is only worth having if breaking the script makes it FAIL.
import { PGlite } from '@electric-sql/pglite'

export async function startHarness() {
  const db = new PGlite()
  let checks = 0, failures = 0
  const ok = (cond, msg, extra) => {
    checks++
    if (!cond) { failures++; console.log('  FAIL:', msg, extra === undefined ? '' : JSON.stringify(extra)) }
    else console.log('  ok  :', msg)
  }
  const rowsOf = async (sql) => (await db.query(sql)).rows
  // Run one statement as `role` with `request.jwt.claim.sub` = sub ('' = no identity). RLS applies as for a real caller.
  const as = async (role, sub, sql) => {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${sub ?? ''}', false); set role ${role};`)
    try { return { rows: (await db.query(sql)).rows } }
    catch (e) { return { error: String(e.message) } }
    finally { await db.exec('reset role') }
  }
  const done = () => {
    console.log(`\n${checks - failures}/${checks} checks passed${failures ? ' — ' + failures + ' FAILED' : ''}`)
    process.exit(failures ? 1 : 0)
  }
  return { db, ok, rowsOf, as, done }
}

// Apply a mutation (a list of [from, to] text replacements) to a script. Each `from` must occur EXACTLY once: an
// anchor that no longer matches means the mutation has silently stopped testing anything, which is refused (exit 2).
export function applyMutation(script, pairs) {
  let out = script
  for (const [from, to] of pairs) {
    if (out.split(from).length !== 2) { console.log('MUTATION ANCHOR PROBLEM', JSON.stringify(from)); process.exit(2) }
    out = out.replace(from, to)
  }
  return out
}
