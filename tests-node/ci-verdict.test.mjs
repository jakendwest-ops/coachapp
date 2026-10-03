// scripts/lib/ci-verdict.mjs decides whether release.mjs may push a release tag. The one thing it must never do is say 'green' for a
// commit whose GitHub check did not clearly pass -- v2026.09.12 was tagged, pushed and never deployed because it did exactly that
// (nothing asked GitHub). So every non-success shape below must refuse, including GitHub failing, going quiet, or sending rubbish.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { ciVerdict, mayPushTag, waitForGreenCheck } from '../scripts/lib/ci-verdict.mjs'

const run = (databaseId, status, conclusion) => ({ databaseId, status, conclusion })

describe('ciVerdict', () => {
  test('a completed, successful run is green', () => {
    assert.deepEqual(ciVerdict([run(5, 'completed', 'success')]), { state: 'green', runId: 5 })
  })
  test('no run yet is "waiting", never green (GitHub takes a few seconds to start one after a push)', () => {
    assert.equal(ciVerdict([]).state, 'waiting')
    assert.equal(ciVerdict(undefined).state, 'waiting')
    assert.equal(ciVerdict(null).state, 'waiting')
    assert.equal(ciVerdict({ databaseId: 5, status: 'completed', conclusion: 'success' }).state, 'waiting', 'an object is not a list of runs')
  })
  test('a run that is queued or in progress is "waiting"', () => {
    for (const status of ['queued', 'in_progress', 'pending', 'waiting', undefined]) {
      assert.equal(ciVerdict([run(5, status, null)]).state, 'waiting', String(status))
    }
  })
  test('every completed result except success is red — failure, cancelled, skipped, timed_out, a missing conclusion', () => {
    for (const conclusion of ['failure', 'cancelled', 'skipped', 'timed_out', 'startup_failure', 'neutral', '', null, undefined]) {
      assert.equal(ciVerdict([run(5, 'completed', conclusion)]).state, 'red', String(conclusion))
    }
  })
  test('the red reason names the run so the person can open it', () => {
    const v = ciVerdict([run(37107433162, 'completed', 'failure')])
    assert.equal(v.runId, 37107433162)
    assert.match(v.why, /37107433162/)
    assert.match(v.why, /failure/)
  })
  test('the NEWEST run decides: a green re-run supersedes the red run it replaced, and a red re-run supersedes a green one', () => {
    assert.equal(ciVerdict([run(5, 'completed', 'failure'), run(9, 'completed', 'success')]).state, 'green')
    assert.equal(ciVerdict([run(9, 'completed', 'success'), run(5, 'completed', 'failure')]).state, 'green')
    assert.equal(ciVerdict([run(5, 'completed', 'success'), run(9, 'completed', 'failure')]).state, 'red')
    assert.equal(ciVerdict([run(5, 'completed', 'success'), run(9, 'in_progress', null)]).state, 'waiting')
  })
  test('databaseId arrives as a number from gh but is compared numerically even if it is a string', () => {
    assert.equal(ciVerdict([run('100', 'completed', 'failure'), run('99', 'completed', 'success')]).state, 'red')
  })
})

describe('mayPushTag', () => {
  test('only a green verdict lets the tag out', () => {
    assert.equal(mayPushTag({ state: 'green', runId: 1 }), true)
    for (const v of [{ state: 'red' }, { state: 'unknown' }, { state: 'waiting' }, { state: 'GREEN' }, { state: undefined }, {}, null, undefined, 'green', true]) {
      assert.equal(mayPushTag(v), false, JSON.stringify(v))
    }
  })
})

// A fake clock and a fake GitHub: `answers` is what each successive ask() does (rows to return, or an Error to throw); the last one repeats.
function harness (answers, opts = {}) {
  let t = 0
  const log = []
  let asks = 0
  let sleeps = 0
  const ask = async () => {
    const a = answers[Math.min(asks, answers.length - 1)]
    asks++
    if (a instanceof Error) throw a
    return a
  }
  const sleep = async (ms) => { sleeps++; t += ms }
  const go = () => waitForGreenCheck({ ask, sleep, now: () => t, log: s => log.push(s), ...opts })
  return { go, log, get asks () { return asks }, get sleeps () { return sleeps } }
}
const ghError = (stderr) => Object.assign(new Error('Command failed: gh run list --commit abc --branch master ...'), { stderr })

describe('waitForGreenCheck', () => {
  test('a finished green check returns at once without sleeping', async () => {
    const h = harness([[run(5, 'completed', 'success')]])
    assert.deepEqual(await h.go(), { state: 'green', runId: 5 })
    assert.equal(h.asks, 1)
    assert.equal(h.sleeps, 0)
  })
  test('it waits through "no run yet" and "in progress", says why once each, then returns green', async () => {
    const h = harness([[], [], [run(5, 'queued', null)], [run(5, 'in_progress', null)], [run(5, 'in_progress', null)], [run(5, 'completed', 'success')]])
    assert.equal((await h.go()).state, 'green')
    assert.equal(h.asks, 6)
    assert.equal(h.log.length, 3, 'three different reasons, each logged once: ' + JSON.stringify(h.log))
  })
  test('a red check is returned at once and polling stops', async () => {
    const h = harness([[run(7, 'completed', 'failure')], [run(7, 'completed', 'success')]])
    const v = await h.go()
    assert.equal(v.state, 'red')
    assert.equal(v.runId, 7)
    assert.equal(h.asks, 1)
  })
  test('one failed ask (a 502, a dropped connection) is tolerated, and the failure count resets after a good answer', async () => {
    const h = harness([ghError('HTTP 502'), [run(5, 'in_progress', null)], ghError('HTTP 502'), [run(5, 'in_progress', null)], ghError('HTTP 502'), [run(5, 'completed', 'success')]])
    assert.equal((await h.go()).state, 'green', 'never three failures in a row')
  })
  test('three failed asks in a row end as "unknown" naming the reason gh gave, not its command line', async () => {
    const h = harness([ghError('HTTP 401: Bad credentials\nrun `gh auth login`')])
    const v = await h.go()
    assert.equal(v.state, 'unknown')
    assert.match(v.why, /HTTP 401: Bad credentials/)
    assert.doesNotMatch(v.why, /Command failed/)
    assert.equal(h.asks, 3)
    assert.equal(mayPushTag(v), false)
  })
  test('rubbish from GitHub is never green: an object, a string, a list that stays empty — all time out as "unknown"', async () => {
    for (const rubbish of [{ message: 'rate limited' }, 'not json', [], null]) {
      const h = harness([rubbish], { timeoutMs: 60000, pollMs: 15000 })
      const v = await h.go()
      assert.equal(v.state, 'unknown', JSON.stringify(rubbish))
      assert.match(v.why, /within 1 minutes/)
      assert.equal(mayPushTag(v), false)
    }
  })
  test('a check that never finishes times out as "unknown" and says what it last saw', async () => {
    const h = harness([[run(5, 'in_progress', null)]], { timeoutMs: 120000, pollMs: 15000 })
    const v = await h.go()
    assert.equal(v.state, 'unknown')
    assert.match(v.why, /run 5 is in_progress/)
    assert.equal(h.asks, 8, '120 s of 15 s polls')
  })
  test('an ask that throws something that is not an Error is still handled', async () => {
    const h = harness([ghError('')], { maxAskFailures: 1 })
    const v = await h.go()
    assert.equal(v.state, 'unknown')
    assert.match(v.why, /Command failed|no detail/)
  })
})

// The call site in release.mjs is glue no unit can reach, so pin its shape: the tag push must sit directly behind a guard on
// mayPushTag() that exits non-zero, and must be the only place the tag is pushed.
describe('release.mjs only pushes the tag behind the guard', () => {
  const src = fs.readFileSync(new URL('../scripts/release.mjs', import.meta.url), 'utf8')
  test('the tag push comes straight after "if (!mayPushTag(ci)) { ... process.exit(1) }"', () => {
    assert.match(src, /if \(!mayPushTag\(ci\)\) \{[\s\S]*?process\.exit\(1\)\s*\}\s*execFileSync\('git', \['push', 'origin', version\]/)
  })
  test('the tag is pushed in exactly one place', () => {
    assert.equal(src.split("['push', 'origin', version]").length - 1, 1)
  })
})
