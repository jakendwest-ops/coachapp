// The self-test of the SQL verifier: apply each deliberate breakage in coach-client-summary.mutations.mjs and require the
// verifier to FAIL (exit 1). A breakage that passes means a check has stopped testing what it claims to (exit 0), and an
// unmatched anchor means the mutation itself is stale (exit 2) — both are errors. Runs the mutations in parallel.
//
//   node scripts/sql-verify/run-mutations.mjs     # exit 0 = every breakage was caught
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MUTATIONS } from './coach-client-summary.mutations.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const verifier = path.join(here, 'coach-client-summary.verify.mjs')

const run = (key) => new Promise((resolve) => {
  const child = spawn(process.execPath, [verifier], { env: { ...process.env, MUTATE: key }, stdio: ['ignore', 'pipe', 'pipe'] })
  let out = ''
  child.stdout.on('data', d => { out += d })
  child.stderr.on('data', d => { out += d })
  child.on('close', (code) => resolve({ key, code, out }))
})

const keys = Object.keys(MUTATIONS)
const results = []
const queue = [...keys]
await Promise.all(Array.from({ length: 4 }, async () => { while (queue.length) results.push(await run(queue.shift())) }))

let bad = 0
for (const key of keys) {
  const r = results.find(x => x.key === key)
  const failed = (r.out.match(/^  FAIL:/gm) || []).length
  if (r.code === 1) console.log(`  caught   ${key}  (${failed} check${failed === 1 ? '' : 's'} failed)  ${MUTATIONS[key].why}`)
  else if (r.code === 0) { bad++; console.log(`  NOT CAUGHT ${key}  ${MUTATIONS[key].why}`) }
  else { bad++; console.log(`  ERROR    ${key}  exit ${r.code}\n${r.out.split('\n').slice(-6).join('\n')}`) }
}
console.log(bad ? `\n${bad} of ${keys.length} mutations were NOT caught — a check has stopped testing what it claims to.` : `\nAll ${keys.length} mutations caught.`)
process.exit(bad ? 1 : 0)
