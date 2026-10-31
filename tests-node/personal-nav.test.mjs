// Personal view's four destinations (2026-10-31, docs/superpowers/plans/2026-10-31-personal-view-four-tabs.md, approved by Jake).
// Pure parts only: which tab a page lights, the four labels, and that the coach and client navs did not change.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { get } from './load-app.mjs'

const json = (v) => JSON.parse(JSON.stringify(v))

describe('Personal view nav', () => {
  test('four destinations, in order: Today, Train, Progress, More', () => {
    assert.deepEqual(json(get('_NAV_ITEMS').solo.map(i => i.label)), ['Today', 'Train', 'Progress', 'More'])
    assert.deepEqual(json(get('_NAV_ITEMS').solo.map(i => i.page)), ['solo-dashboard', 'workouts', 'progress', '__more__'])
    assert.deepEqual(json(get('_NAV_BOTTOM').solo.map(i => i.label)), ['Today', 'Train', 'Progress', 'More'], 'the phone bar is the same four')
  })

  test('each retired page lights its parent tab; the four light themselves; anything else lights nothing', () => {
    const p = get('_soloNavParent')
    assert.equal(p('calendar'), 'solo-dashboard')
    assert.equal(p('programs'), 'workouts')
    assert.equal(p('goals'), 'progress')
    assert.equal(p('library'), '__more__')
    assert.equal(p('settings'), '__more__')
    for (const own of ['solo-dashboard', 'workouts', 'progress']) assert.equal(p(own), own)
    assert.equal(p('clients'), null)
    assert.equal(p(undefined), null)
  })

  test('Today on a rest day: Personal view says Train anyway; a coached client still says Log a workout', () => {
    const hero = get('_dashHeroHtml')
    const day = { ds: '2026-10-31', today: true, kind: 'rest', planned: [], done: [] }
    const ctx = (role) => ({ role, clientId: 'c1', todayStr: '2026-10-31', days: [day], hasProgram: true, program: null, next: { date: '2026-11-02', title: 'Lower A' } })
    const solo = hero(day, ctx('solo')), client = hero(day, ctx('client'))
    assert.match(solo, /Rest day/)
    assert.match(solo, /Next up: Lower A/)
    assert.match(solo, />Train anyway</)
    assert.doesNotMatch(solo, /Log a workout/)
    assert.match(client, />Log a workout</)
  })

  test('Progress in Personal view: a stored tab name maps onto Goals / Records / Weight / Cardio; unknown or empty opens Goals', () => {
    const t = get('_personalProgressTab')
    assert.equal(t(undefined), 'Goals')
    assert.equal(t(''), 'Goals')
    assert.equal(t('Body Weight'), 'Weight')
    for (const old of ['Personal Bests', 'Performance', '1RMs', 'Benchmarks']) assert.equal(t(old), 'Records', old)
    for (const now of ['Goals', 'Records', 'Weight', 'Cardio']) assert.equal(t(now), now)
    assert.equal(t('Nonsense'), 'Goals')
  })

  test('the coach and client navs are unchanged', () => {
    const items = json(get('_NAV_ITEMS'))
    assert.deepEqual(items.client.map(i => [i.page, i.label]), [['client-dashboard', 'Dashboard'], ['workouts', 'Workouts'], ['calendar', 'Calendar'], ['progress', 'Progress'], ['settings', 'Settings']])
    assert.deepEqual(items.coach.map(i => i.page), ['dashboard', 'clients', 'workouts', 'calendar', 'programs', 'settings'])
  })
})
