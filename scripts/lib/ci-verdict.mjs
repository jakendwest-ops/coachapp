// Decides, from the workflow runs GitHub reports for ONE commit, whether a release tag may be pushed yet.
//
// WHY. deploy.yml's `deploy` job has `needs: check`: a tag whose code-quality job is red is pushed, announced as released, and
// never deploys. That is what happened to v2026.09.12 (2026-10-03): the whole local gate passed, the tag went up, and a
// Node-22-only failure in a self-test that GitHub runs and the dev machine (Node 24) did not kept the check red -- for two days
// before the tag, on two earlier pushes nobody looked at. release.mjs now pushes master FIRST (a branch push runs the checks and
// cannot deploy), asks GitHub for that run, and pushes the tag only when mayPushTag() says so.
//
// Everything here is pure or takes its I/O as arguments (`ask`, `sleep`, `now`, `log`), so tests-node can drive every path --
// including GitHub failing, going quiet, or answering with rubbish -- without GitHub. It FAILS CLOSED: anything that is not an
// unambiguous success is not 'green'.

/**
 * `rows` is the JSON of `gh run list --commit <sha> --branch master --event push --json databaseId,status,conclusion`.
 * -> { state: 'waiting' | 'green' | 'red', why?, runId? }
 */
export function ciVerdict (rows) {
  if (!Array.isArray(rows) || rows.length === 0) return { state: 'waiting', why: 'GitHub has not started a run for this commit yet' }
  // The newest run decides: a re-run supersedes the red one it replaced.
  const run = [...rows].sort((a, b) => Number(b.databaseId) - Number(a.databaseId))[0]
  if (run.status !== 'completed') return { state: 'waiting', why: `run ${run.databaseId} is ${run.status || 'not finished'}`, runId: run.databaseId }
  if (run.conclusion === 'success') return { state: 'green', runId: run.databaseId }
  return { state: 'red', why: `run ${run.databaseId} finished "${run.conclusion || 'with no conclusion'}"`, runId: run.databaseId }
}

/** The one question release.mjs asks before `git push origin <tag>`: only a clear green. */
export const mayPushTag = (verdict) => verdict?.state === 'green'

// What a failed `gh` call said, not the command line: execFileSync puts the reason in err.stderr and a truncated "Command failed: ..." in err.message.
const firstLine = (err) => {
  const text = String((err && (err.stderr || err.message)) || err || '')
  return (text.split('\n').map(s => s.trim()).find(Boolean) || 'no detail').slice(0, 160)
}

/**
 * Polls `ask()` (resolves to the rows above) until GitHub's check has finished or time runs out.
 * -> a ciVerdict result ('green' | 'red'), or { state: 'unknown', why } when it could not be confirmed.
 * One failed ask (a 502, a dropped connection) is tolerated; `maxAskFailures` in a row, the deadline, or a check that never
 * appears all end as 'unknown' -- never as 'green'.
 */
export async function waitForGreenCheck ({ ask, sleep, now = Date.now, log = () => {}, timeoutMs = 20 * 60 * 1000, pollMs = 15000, maxAskFailures = 3 }) {
  const deadline = now() + timeoutMs
  let failures = 0
  let lastWhy = ''
  while (now() < deadline) {
    let rows
    try {
      rows = await ask()
      failures = 0
    } catch (err) {
      failures++
      if (failures >= maxAskFailures) return { state: 'unknown', why: `could not ask GitHub (${firstLine(err)})` }
      await sleep(pollMs)
      continue
    }
    const verdict = ciVerdict(rows)
    if (verdict.state !== 'waiting') return verdict
    if (verdict.why !== lastWhy) { log(`  … ${verdict.why}`); lastWhy = verdict.why }
    await sleep(pollMs)
  }
  return { state: 'unknown', why: `GitHub did not finish its check within ${Math.round(timeoutMs / 60000)} minutes${lastWhy ? ` (last seen: ${lastWhy})` : ''}` }
}
