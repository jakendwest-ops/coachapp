// The shared effort guard — RPE top-set review, round 2 (2026-10-01).
//
// Round 1 range-guarded ONE of the two places that write `workout_log_sets.effort_value` and left the
// other (the manual Log Session path) writing parseFloat() straight into the same all-or-nothing
// batched insert; it also left the live e1RM estimate trusting the raw typed value, so a stray `-5`
// was refused by the database and simultaneously accepted as the basis of a stored 1RM. Two sites
// fixed, one missed, and a third consumer never looked at: the "fix the class" miss.
//
// So there is now ONE definition of "an effort value we are willing to store or estimate from", and
// this file pins both the definition and the claim that every writer uses it.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { get, REPO } from './load-app.mjs'

describe('_effortOrNull — the one definition of a storable effort value', () => {
  const f = () => get('_effortOrNull')

  test('accepts a real value on either scale, as a number', () => {
    assert.equal(f()('8'), 8)
    assert.equal(f()(8), 8)
    assert.equal(f()('8.5'), 8.5)
    assert.equal(f()('10'), 10)
  })

  // RIR 0 means "to failure" and is the most meaningful value on that scale. This project has shipped
  // the falsy-zero bug at five sites; a truthy check anywhere in this path would silently lose it.
  test('RIR 0 is a REAL value, not an absent one', () => {
    assert.equal(f()('0'), 0)
    assert.equal(f()(0), 0)
  })

  test('blank, missing and non-numeric input is null, never NaN and never 0', () => {
    for (const v of ['', null, undefined, 'abc', '  ']) {
      assert.equal(f()(v), null, `${JSON.stringify(v)} must be null`)
    }
  })

  test('an impossible value is null: below 0 and above 10', () => {
    for (const v of ['-5', -0.5, '10.5', '88', 88]) {
      assert.equal(f()(v), null, `${JSON.stringify(v)} must be refused`)
    }
  })
})

describe('_recomputeLiveE1RM — the estimate must not trust what the database would refuse', () => {
  const run = (effort, effortType = 'rpe') => {
    const ex = {
      sets_json: [{ isTopSet: true, effortType, effortMin: 8 }],
      tableRows: [{ done: true, weight: 100, reps: 3, effort }]
    }
    get('_recomputeLiveE1RM')(ex)
    return ex._liveE1RM
  }

  test('a normal RPE 8 top set still estimates (100 x 3 @ 8 -> ~115.9)', () => {
    const v = run('8')
    assert.ok(Number.isFinite(v), `expected a number, got ${v}`)
    assert.ok(Math.abs(v - 115.87) < 0.1, `expected ~115.87, got ${v}`)
  })

  // _clampRpe floors at 6 and caps at 10, so before this guard `-5` became "RPE 6" and 88 became
  // "RPE 10" — two garbage inputs producing two plausible-looking training maxes.
  test('an out-of-range effort gives NO estimate rather than a clamped one', () => {
    assert.equal(run('-5'), null)
    assert.equal(run('88'), null)
  })

  test('RIR 0 (to failure) still estimates', () => {
    const v = run('0', 'rir')
    assert.ok(Number.isFinite(v) && v > 100, `RIR 0 must produce an estimate above the lifted weight, got ${v}`)
  })
})

describe('class pin — every writer of effort_value goes through the guard', () => {
  const src = readFileSync(join(REPO, 'js', 'app-runner.js'), 'utf8')
  const writers = [...src.matchAll(/\.effort_value\s*=\s*([A-Za-z_$][\w$]*)/g)]

  test('there are at least two writers (a pin over nothing proves nothing)', () => {
    assert.ok(writers.length >= 2, `expected the runner save and the manual Log Session save, found ${writers.length}`)
  })

  test('each assigns a value that came from _effortOrNull', () => {
    const bad = []
    for (const m of writers) {
      const v = m[1]
      const before = src.slice(Math.max(0, m.index - 600), m.index)
      if (!new RegExp(`${v}\\s*=\\s*_effortOrNull\\(`).test(before)) {
        const line = src.slice(0, m.index).split('\n').length
        bad.push(`js/app-runner.js:${line}  effort_value = ${v}  (no \`${v} = _effortOrNull(…)\` in the 600 chars above)`)
      }
    }
    assert.deepEqual(bad, [], `unguarded effort_value writer(s) — every set rides ONE batched insert, so an out-of-range value can cost the whole session:\n${bad.join('\n')}`)
  })
})
