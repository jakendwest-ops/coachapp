#!/usr/bin/env node
/**
 * checks.sh rule 9n — a READ of a table that grows with use must be bounded, or say why it need not be.
 *
 * WHY. The API returns at most 200 rows per response (`max_rows = 200`, measured 2026-09-20: 200 rows even
 * for `.limit(1000)`) and says NOTHING when it cuts a list short — no error, no flag, just the first 200
 * rows of whatever order the caller chose. A read of a table that grows with USE (a row per weigh-in, per
 * session, per set) is therefore correct for a new account and silently wrong for a busy one: the weight
 * tabs stopped at the 200th-oldest entry, the data export omitted rows from a subject-access disclosure, a
 * dashboard read the newest 100 sessions and called the rest inactive. Sixteen such reads were fixed on
 * 2026-09-20/21 (Releases 2a and 2b) and every one had passed every test it had, because a test fixture
 * never holds 200 rows. This is the gate that stops the seventeenth being written.
 *
 * WHAT IT FLAGS. A `.from('<table>')` chain that
 *   - is on one of the GROWING tables below (the ones a person's own activity adds rows to),
 *   - is a READ (it selects, and does not insert / update / upsert / delete), and
 *   - carries NO bound: no `.limit(n)` / `.range(a, b)` that fits the API's cap of 200 (a `.limit(500)` is NOT a
 *     bound: the API still returns 200, silently — js/app-workouts.js:936 was exactly that), no `.single(` /
 *     `.maybeSingle(`, no `head: true` (a count),
 *     no `.eq('id', …)` (one row by primary key), is not the query handed to `_fetchAllRows` (or a local
 *     alias of it: `const all = … _fetchAllRows(…)`, as the data export has), and carries no
 *     `// unbounded-ok: <reason>` note on or just above the `.from(` line.
 *
 * MEASURED BEFORE TEETH (2026-09-21, after Releases 2a and 2b had removed the known sites). A census of
 * every read of the nine tables found the residue named in docs/bugs/2026-09-21-*-unbounded-reads-*.md, each
 * classified by reading the code. This is therefore a RATCHET, not a wall: it pins the count AT that number
 * (UNBOUNDED_READS_BASELINE) so a NEW unbounded read fails the push and an old one fixed lowers the number.
 * Blocking outright would refuse reads that are bounded by construction (`.in('log_id', idsOfTwentyLogs)`),
 * and a rule that refuses correct code gets switched off. The escape hatch for a genuinely bounded read is
 * the `unbounded-ok:` note, which carries its reason where the next reader will see it — preferable to
 * raising the baseline, which hides WHY.
 *
 * WHAT IT CANNOT SEE. It reads chains, not data: it cannot tell `.in('log_id', ids)` over twenty ids from
 * the same call over two thousand, so those count as unbounded until someone writes the reason down. It only
 * looks at the nine tables (structural tables — programmes, templates, phase slots — grow with a coach's own
 * authoring, not with a client's activity, and are out of scope on purpose). And it looks at js/ only: it
 * says nothing about a view or an RPC, whose responses the API caps just the same.
 *
 * ACCEPTED LIMITS (found by review, 2026-09-21; none exists in js/ today — a hand count of every read agrees with
 * this checker's). A `.from()` is matched only as `.from('literal')` complete on ONE line, and only the first per
 * line: a table name held in a variable, split across lines, or a second `.from()` on the same line is invisible.
 * `const q = db.from('x')` followed by `q.select(…)` in a LATER statement is not seen as a read. A non-literal
 * `.limit(n)` / `.range(a, b)` is trusted. Paging is accepted textually: it does not check that the paged query
 * ends in a UNIQUE tie-break (`.order('id')`) or asks for `{ count: 'exact' }`, which is what stops rows being
 * skipped or repeated at a page boundary — the stand-in's reshuffled ties test that, not this. An alias of the
 * paging helper is recognised per FILE. An `unbounded-ok:` note counts only on the `.from(` line itself or in the comment
 * block directly above it (no blank line, no code between), and its reason need only be 8 letters or digits long.
 * Comments are blanked before reading (a `// .limit(20) removed` on a code line is not a bound).
 * A ratchet is a COUNT: fixing one read and adding another elsewhere leaves it unchanged, and a count below the
 * pin only prints a note — lower the pin when a site is fixed.
 *
 * Usage: node scripts/check-unbounded-reads.mjs      (exit 1 = the count rose above the baseline)
 *        UNBOUNDED_EXPLAIN=1 node scripts/check-unbounded-reads.mjs    (also list every read examined and why it passed)
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectChain } from './lib/chains.mjs'
import { blankComments } from './lib/comments.mjs'
import { readBaseline } from './lib/baseline.mjs'

const REPO = process.env.UNBOUNDED_REPO || join(dirname(fileURLToPath(import.meta.url)), '..')

// The tables a person's own activity adds rows to. Deliberately the nine the plan named — not widened in the
// same change that adds the gate (widening the subject and raising the severity at once is how a gate becomes
// a wall). Other tables ALSO grow and are simply not covered yet: `client_1rms` (the runner inserts a row whenever a client
// accepts a new 1RM after a session, and js/app-runner.js:43 reads a client's whole list unordered), `exercises` (a coach's
// library), `goals`, `clients`. Their unbounded reads are named in the ledger row this header points to, not counted here.
const GROWING = [
  'weight_logs', 'workout_logs', 'workout_log_exercises', 'workout_log_sets', 'performance_logs',
  'client_check_ins', 'events', 'goal_check_ins', 'app_errors'
]

// Pinned AT the 2026-09-21 measurement (see the header): 9. Lowered to 8 the same day when `_buildExerciseSeries` was paged —
// the first fix this ratchet asked for, on the first run after it was written — and to 7 when the library's `.limit(500)` (which
// returns 200) was made `.limit(200)`. Lower it in this file whenever a site is bounded.
const BASELINE = readBaseline('UNBOUNDED_READS_BASELINE', 7)
const CAP = 200   // the API's max_rows — a limit or range wider than this bounds nothing

const JS = join(REPO, 'js')
if (!existsSync(JS)) {
  console.log('  no js/ directory — refusing to report a count against nothing.')
  process.exit(1)
}
const files = readdirSync(JS).filter(f => f.endsWith('.js')).sort().map(f => join('js', f))

const findings = []
const explain = []   // every read examined and the reason it passed, for UNBOUNDED_EXPLAIN=1
let read = 0

for (const file of files) {
  const src = readFileSync(join(REPO, file), 'utf8')
  const lines = src.split(/\r?\n/)                     // raw: the `unbounded-ok:` note lives in a COMMENT
  // Everything the rules read is CODE. Comment text is blanked to spaces (offsets and line numbers are preserved), so a
  // trailing `// .limit(20) removed` or a block comment quoting a query cannot be mistaken for a bound or a read.
  const code = blankComments(src).split(/\r?\n/)

  // Local aliases of the paging helper: `const all = async (q) => … _fetchAllRows(q, …)`. Detected per file, so a
  // function that merely happens to be called `all` elsewhere is NOT exempt.
  const pagers = ['_fetchAllRows']
  for (const ln of code) {
    const a = ln.match(/^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=.*\b_fetchAllRows\s*\(/)
    if (a) pagers.push(a[1])
  }
  const pagedRe = new RegExp('(?:' + pagers.map(p => p.replace(/\$/g, '\\$')).join('|') + ')\\s*\\(\\s*(?:async\\s*)?\\(\\s*\\)\\s*=>\\s*(?:db\\s*)?$')

  for (let i = 0; i < code.length; i++) {
    // Matched on `code`, so a query quoted in a comment describes a read but is not one.
    const m = code[i].match(/\.from\(\s*['"]([a-z_0-9]+)['"]\s*\)/)
    if (!m || !GROWING.includes(m[1])) continue

    const chain = collectChain(code, i, code[i].indexOf(m[0]))
    if (/\.(insert|update|upsert|delete)\(/.test(chain)) continue        // a write; its `.select()` is a return value
    if (!/\.select\(/.test(chain)) continue                              // not a read
    read++

    const at = `${file}:${i + 1} ${m[1]}`
    // An explicit bound — but only one that is NARROWER than the API's cap. A numeric `.limit(500)` or
    // `.range(0, 999)` reads as a bound and returns 200; a limit that is not a literal cannot be judged, so it is trusted.
    let overCap = null
    let bound = null
    if (/\.(single|maybeSingle)\(/.test(chain)) bound = 'a single row'
    const lim = chain.match(/\.limit\(\s*([^)]*?)\s*\)/)
    if (lim && !bound) {
      if (/^\d+$/.test(lim[1]) && Number(lim[1]) > CAP) overCap = `.limit(${lim[1]})`
      else if (lim[1].includes(',')) { /* .limit(n, { foreignTable }) bounds an EMBEDDED resource, not the rows read: no bound */ }
      else bound = `.limit(${lim[1]})`
    }
    const rng = chain.match(/\.range\(\s*([^,)]*?)\s*,\s*([^)]*?)\s*\)/)
    if (rng && !bound) {
      if (/^\d+$/.test(rng[1]) && /^\d+$/.test(rng[2]) && Number(rng[2]) - Number(rng[1]) + 1 > CAP) overCap = overCap || `.range(${rng[1]}, ${rng[2]})`
      else if (rng[2].includes(',')) { /* .range(a, b, { referencedTable }) bounds an EMBEDDED resource, not the rows read: no bound */ }
      else bound = `.range(${rng[1]}, ${rng[2]})`
    }
    if (bound) { explain.push(`${at}  bounded by ${bound}`); continue }
    if (/head:\s*true/.test(chain)) { explain.push(`${at}  a count (head: true)`); continue }  // no rows come back
    if (/\.eq\(\s*['"]id['"]/.test(chain)) { explain.push(`${at}  one row by primary key`); continue }

    // The chain is the query handed to the paging helper: `_fetchAllRows(() => db.from(…)…)`, possibly with `db`
    // or the `.from(` on the next line and comments between. Look at the code just BEFORE the `.from(`.
    const before = (code.slice(Math.max(0, i - 4), i).join('\n') + '\n' + code[i].slice(0, code[i].indexOf(m[0])))
      .replace(/\s+$/, '')
    if (pagedRe.test(before)) { explain.push(`${at}  paged through _fetchAllRows or a local alias`); continue }

    // A stated reason, on the SAME line as the marker: a `\s*` here would cross the newline and read the NEXT LINE OF CODE as
    // the reason (the self-test's empty-note case caught exactly that). It must BE a reason: an empty note silences the gate.
    // Where the note may sit: on the `.from(` line itself, or in the comment block DIRECTLY above it (contiguous comment lines, no
    // blank line and no code between). A code line above ends the search — otherwise a note written for one read would also
    // silence the read on the next line, as in the one-line-per-read `Promise.all([...])` style this codebase uses.
    const noteLines = [lines[i]]
    for (let k = i - 1; k >= 0 && /^\s*(\/\/|\/\*|\*)/.test(lines[k]); k--) noteLines.push(lines[k])
    const note = noteLines.reverse().join('\n').match(/unbounded-ok:[ \t]*(\S[^\n]*)/)   // top-down, as written: a note must not be able to read on into the code below it
    if (note && note[1].replace(/[^A-Za-z0-9]/g, '').length >= 8) { explain.push(`${at}  unbounded-ok: ${note[1].trim()}`); continue }

    findings.push({ file, line: i + 1, table: m[1], overCap, chain: chain.replace(/\s+/g, ' ').slice(0, 150) })
  }
}

if (!read) {
  console.log('  found no reads of the growing tables at all — refusing to report a count against nothing (was js/ restructured?).')
  process.exit(1)
}

if (process.env.UNBOUNDED_EXPLAIN) for (const e of explain) console.log('    [ok] ' + e)
console.log(`  ${findings.length} unbounded read(s) of the growing tables across ${files.length} modules (baseline ${BASELINE}); ${read} reads examined.`)

if (findings.length > BASELINE) {
  console.log('')
  console.log(`    ${findings.length - BASELINE} new unbounded read(s).`)

  // The count alone cannot say WHICH one is new; narrow to the files this change touches, and when that is not
  // knowable say so rather than guess (the same lesson as check-spec-hygiene.mjs).
  let touched = []
  try {
    const { execFileSync } = await import('node:child_process')
    const git = (...a) => execFileSync('git', a, { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    touched = [...new Set((git('diff', '--name-only', 'HEAD') + '\n' + git('diff', '--name-only', '--cached')).split('\n').map(s => s.trim()).filter(Boolean))]
  } catch {
    touched = []                                       // not a git repo (the self-test fixtures), or git unavailable
  }
  const norm = (p) => p.replace(/\\/g, '/')
  const inTouched = findings.filter(f => touched.some(t => norm(t) === norm(f.file)))
  const shown = inTouched.length ? inTouched : findings
  console.log(inTouched.length ? '    In files you have changed:' : '    None is in a file you have changed (or git is unavailable), so all are listed:')
  for (const f of shown.slice(0, 12)) {
    console.log(`      ${f.file}:${f.line}  from('${f.table}')${f.overCap ? `  — ${f.overCap} is wider than the API's cap of ${CAP}, so it returns ${CAP}` : ''}`)
    console.log(`        ${f.chain}`)
  }
  console.log('')
  console.log('    The API returns at most 200 rows per response and says nothing when it cuts a list short, so')
  console.log('    a read like this is right for a new account and silently wrong for a busy one. Bound it:')
  console.log('      - only the newest few:      .order(…, { ascending: false }).limit(n)')
  console.log('      - one row:                  .single() / .maybeSingle()   (or .eq(\'id\', …))')
  console.log('      - just a count:             .select(\'*\', { count: \'exact\', head: true })')
  console.log('      - all of them:              _fetchAllRows(() => db.from(…).select(…, { count: \'exact\' })')
  console.log('                                    .order(…).order(\'id\'))    (a UNIQUE tie-break last — js/app-core.js)')
  console.log('    If it is genuinely bounded by construction, say why where the next reader will see it:')
  console.log('      // unbounded-ok: one session\'s sets, never more than a few dozen')
  process.exit(1)
}

if (findings.length < BASELINE) {
  console.log(`    [note] down to ${findings.length} from ${BASELINE} — lower UNBOUNDED_READS_BASELINE in scripts/check-unbounded-reads.mjs.`)
}
process.exit(0)
