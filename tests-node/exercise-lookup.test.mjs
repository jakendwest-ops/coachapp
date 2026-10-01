// _likeEscape — an exercise name is TEXT to match exactly, not a LIKE pattern (2026-10-01).
//
// _resolveExerciseIdForSave used .ilike('name', <the name>) as an EQUALITY test, so a `_` or `%` in a
// name acted as a wildcard: "Row_Wide" matched "RowXWide" and the exercise silently linked to the wrong
// row. _likeEscape neutralises the three pattern characters; _findExerciseByName then re-compares for
// exact equality client-side (PostgREST also reads `*` as a wildcard, which escaping cannot remove).
//
// The expected strings below are written with String.raw so a backslash means a backslash.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { get } from './load-app.mjs'

describe('_likeEscape', () => {
  const esc = () => get('_likeEscape')

  test('an underscore is made literal', () => {
    assert.equal(esc()('Row_Wide'), String.raw`Row\_Wide`)
  })

  test('a percent is made literal', () => {
    assert.equal(esc()('50% Squat'), String.raw`50\% Squat`)
  })

  test('a backslash is doubled — it is the escape character, so it must be escaped FIRST-CLASS, not skipped', () => {
    assert.equal(esc()(String.raw`a\b`), String.raw`a\\b`)
  })

  test('all three together, each escaped exactly once', () => {
    assert.equal(esc()(String.raw`a\_%b`), String.raw`a\\\_\%b`)
  })

  test('ordinary names are untouched — the common case must not change', () => {
    for (const n of ['Bench Press', "Farmer's Carry", 'Back Squat (high bar)', '[E2E] Dup 123-abcd Bench']) {
      assert.equal(esc()(n), n)
    }
  })

  test('non-strings do not throw', () => {
    assert.equal(esc()(42), '42')
  })
})
