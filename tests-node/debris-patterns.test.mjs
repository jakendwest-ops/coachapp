// scripts/lib/debris-patterns.mjs — what the reaper treats as leftover test data (2026-10-01).
//
// Every sample below is a name MEASURED on the E2E account on 2026-10-01, where the reaper said
// "exercises clean / No debris found" over 6,275 rows of exactly these. The old rule was a case-sensitive
// LIKE on '[E2E' / '[TEST]': it matched none of them.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { isDebrisName, likePattern, prefixesFor, TAG_PREFIXES } from '../scripts/lib/debris-patterns.mjs'

// The rule the reaper USED to apply, kept as a named baseline so the test proves it was blind.
const oldRule = name => TAG_PREFIXES.some(p => String(name).startsWith(p))

const MEASURED = {
  'lowercase tag (810 rows)': [
    '[e2e] rollback exercise 1783436700786',
    '[e2e] log-session-zero 1785430069313',
    '[e2e] reentry exercise 1788528305907',
  ],
  'untagged Playwright names (~5,400 rows)': [
    'Playwright Swap Target 1783354036143',
    'Playwright Added Exercise 1783354099999',
    'Playwright Identity Check 2 1783354000000',
    'Playwright Change Test A 1783354000001',
    'Playwright Rest Add Target 1783354000002',
    'Playwright Picker Create Test 1783354000003',
  ],
}

describe('the OLD rule was blind to what actually accumulated (this is why it said "clean")', () => {
  for (const [shape, names] of Object.entries(MEASURED)) {
    test(`old rule matched none of: ${shape}`, () => {
      for (const n of names) assert.equal(oldRule(n), false, `${n} unexpectedly matched the old rule`)
    })
  }
})

describe('isDebrisName on the exercises table', () => {
  for (const [shape, names] of Object.entries(MEASURED)) {
    test(`recognises: ${shape}`, () => {
      for (const n of names) assert.equal(isDebrisName(n, 'exercises'), true, `${n} should be debris`)
    })
  }

  test('still recognises the whole [E2E…] tag family in any case', () => {
    for (const n of ['[E2E] Foo', '[E2E-RLS] Foo', '[E2E-PB] Foo', '[TEST] Foo', '[e2e] foo', '[Test] foo'.replace('[Test]', '[TEST]')]) {
      assert.equal(isDebrisName(n, 'exercises'), true, n)
    }
  })

  // THE guard that matters: widening the matcher must not reach a real coach's exercises.
  test('does NOT match ordinary exercise names', () => {
    for (const n of ['Bench Press', 'Back Squat', 'Playwright', 'Playground Sprint', 'PWR Clean', "Farmer's Carry",
                     'e2e conditioning', 'Test Day Squat', '[unrelated] bracket']) {
      assert.equal(isDebrisName(n, 'exercises'), false, `${n} must never be treated as debris`)
    }
  })
})

describe('the untagged legacy prefixes are scoped to `exercises` only', () => {
  test('other tables use the tag family alone', () => {
    for (const t of ['clients', 'workout_templates', 'programs', 'goals', 'events', 'workout_logs']) {
      assert.deepEqual([...prefixesFor(t)], [...TAG_PREFIXES], t)
      assert.equal(isDebrisName('Playwright Swap Target 1', t), false, `'Playwright …' must not match on ${t}`)
    }
  })
})

describe('likePattern', () => {
  test('is a prefix pattern, and escapes characters LIKE would read as wildcards', () => {
    assert.equal(likePattern('[E2E'), '[E2E%')
    assert.equal(likePattern('PW '), 'PW %')
    assert.equal(likePattern('a_b%'), String.raw`a\_b\%%`)
  })
})
