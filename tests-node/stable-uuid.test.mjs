// _stableUuid and _isNetworkError (R4a, 2026-10-29). A workout save derives every exercise and set id from its session id
// with _stableUuid, so a retry writes the SAME rows: the ids must be stable, well-formed and distinct within a session.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { get } from './load-app.mjs'

const stableUuid = (s) => get('_stableUuid')(s)
const isNetworkError = (e) => get('_isNetworkError')(e)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

test('the same input always gives the same id, and it is a well-formed v4 uuid', () => {
  const a = stableUuid('5f1c0e2a-0000-4000-8000-000000000001|set|0|0|')
  assert.equal(a, stableUuid('5f1c0e2a-0000-4000-8000-000000000001|set|0|0|'))
  assert.match(a, UUID)
  assert.match(stableUuid(''), UUID)
})

test('10,000 distinct paths in one session give 10,000 distinct ids', () => {
  const log = '0b6a7c1e-1111-4222-8333-444455556666'
  const seen = new Set()
  for (let bi = 0; bi < 50; bi++) {
    seen.add(stableUuid(`${log}|ex|${bi}`))
    for (let si = 0; si < 66; si++) for (const side of ['', 'left', 'right']) seen.add(stableUuid(`${log}|set|${bi}|${si}|${side}`))
  }
  assert.equal(seen.size, 50 + 50 * 66 * 3)
})

test('a different session id gives different child ids', () => {
  assert.notEqual(stableUuid('aaaaaaaa-0000-4000-8000-000000000000|ex|0'), stableUuid('aaaaaaaa-0000-4000-8000-000000000001|ex|0'))
})

test('a dropped connection is a network error; a database refusal is not', () => {
  assert.equal(isNetworkError({ message: 'TypeError: Failed to fetch', code: '' }), true)
  assert.equal(isNetworkError({ message: 'injected 500' }), true)
  assert.equal(isNetworkError({ message: 'new row violates row-level security policy', code: '42501' }), false)
  assert.equal(isNetworkError({ message: 'duplicate key', code: '23505' }), false)
  assert.equal(isNetworkError({ message: 'bad range', code: 'PGRST103' }), false)
  assert.equal(isNetworkError(null), false)
})
