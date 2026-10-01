// The self-test of the SQL verifiers: for each suite, apply each deliberate breakage in its .mutations.mjs and require the
// verifier to FAIL (exit 1). A breakage that passes means a check has stopped testing what it claims to (exit 0), and an
// unmatched anchor means the mutation itself is stale (exit 2) — both are errors. Runs the mutations in parallel.
// A new verifier joins the self-test by adding a line to SUITES.
//
//   node scripts/sql-verify/run-mutations.mjs     # exit 0 = every breakage, in every suite, was caught
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MUTATIONS as SUMMARY } from './coach-client-summary.mutations.mjs'
import { MUTATIONS as COACH_ID_GUARD } from './clients-coach-id-guard.mutations.mjs'
import { MUTATIONS as ASSIGN_PROGRAM } from './assign-program.mutations.mjs'
import { MUTATIONS as EMPTY_SESSION_DELETE } from './client-empty-session-delete.mutations.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const SUITES = [
  { name: 'coach_client_summary view', verifier: 'coach-client-summary.verify.mjs', mutations: SUMMARY },
  { name: 'clients.coach_id guard', verifier: 'clients-coach-id-guard.verify.mjs', mutations: COACH_ID_GUARD },
  { name: 'assign_program() transaction', verifier: 'assign-program.verify.mjs', mutations: ASSIGN_PROGRAM },
  { name: 'client delete of an empty session', verifier: 'client-empty-session-delete.verify.mjs', mutations: EMPTY_SESSION_DELETE },
]

const run = (verifier, key) => new Promise((resolve) => {
  const child = spawn(process.execPath, [path.join(here, verifier)], { env: { ...process.env, MUTATE: key }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  let out = ''
  child.stdout.on('data', d => { out += d })
  child.stderr.on('data', d => { out += d })
  child.on('close', (code) => resolve({ verifier, key, code, out }))
})

const jobs = SUITES.flatMap(s => Object.keys(s.mutations).map(key => ({ verifier: s.verifier, key })))
const results = []
const queue = [...jobs]
await Promise.all(Array.from({ length: 4 }, async () => { while (queue.length) { const j = queue.shift(); results.push(await run(j.verifier, j.key)) } }))

let bad = 0
for (const s of SUITES) {
  console.log(`\n${s.name}`)
  for (const key of Object.keys(s.mutations)) {
    const r = results.find(x => x.verifier === s.verifier && x.key === key)
    const failed = (r.out.match(/^  FAIL:/gm) || []).length
    // exit 1 with no "FAIL:" line is a crash (a missing dependency, a syntax error), not a check that caught the breakage
    if (r.code === 1 && failed >= 1) console.log(`  caught   ${key}  (${failed} check${failed === 1 ? '' : 's'} failed)  ${s.mutations[key].why}`)
    else if (r.code === 0) { bad++; console.log(`  NOT CAUGHT ${key}  ${s.mutations[key].why}`) }
    else { bad++; console.log(`  ERROR    ${key}  exit ${r.code}\n${r.out.split('\n').slice(-6).join('\n')}`) }
  }
}
console.log(bad ? `\n${bad} of ${jobs.length} mutations were NOT caught — a check has stopped testing what it claims to.` : `\nAll ${jobs.length} mutations caught.`)
process.exit(bad ? 1 : 0)
