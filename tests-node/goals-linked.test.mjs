// Linked goals (Jake, 2026-11-08): the number a goal shows when it follows body weight or a lift. Screens are covered by the browser spec.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { get } from './load-app.mjs'

const live = (kg, unit) => get('_goalLiveValue')(kg, unit)

test('kilograms pass through, to one decimal', () => {
  assert.equal(live(83.5, 'kg'), 83.5)
  assert.equal(live(83.46, 'kg'), 83.5)
  assert.equal(live(100, null), 100)
})
test('a goal set in pounds shows pounds', () => {
  assert.equal(live(100, 'lb'), 220.5)
})
