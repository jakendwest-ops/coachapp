// The coach's phone navigation (MVP item 8, approved by Jake 2026-11-01): the bottom bar becomes Dashboard · Clients · Training plans ·
// Calendar · More, and Workouts and Settings move into the More sheet - the Personal view's pattern (2026-10-31). The desktop sidebar keeps
// all six; the client's bar is unchanged. Three pure pieces in js/app-core.js: _navBottomItems(role), _navLitFor(view, page) and
// _moreSheetRowsHtml(view, isMaster).

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { get } from './load-app.mjs'

const pages = (role) => JSON.parse(JSON.stringify(get('_navBottomItems')(role))).map(i => i.page)
const lit = (view, page) => get('_navLitFor')(view, page)
const rows = (view, master) => get('_moreSheetRowsHtml')(view, master)

describe('the phone bar for each role', () => {
  test('coach: Dashboard, Clients, Plans, Calendar, More - five, not six', () => {
    assert.deepEqual(pages('coach'), ['dashboard', 'clients', 'programs', 'calendar', '__more__'])
  })
  test('the coach sidebar is unchanged: all six', () => {
    assert.deepEqual(JSON.parse(JSON.stringify(get('_NAV_ITEMS').coach)).map(i => i.page), ['dashboard', 'clients', 'workouts', 'calendar', 'programs', 'settings'])
  })
  test('Personal view keeps its four; the client keeps their five', () => {
    assert.deepEqual(pages('solo'), ['solo-dashboard', 'workouts', 'progress', '__more__'])
    assert.deepEqual(pages('client'), ['client-dashboard', 'workouts', 'calendar', 'progress', 'settings'])
  })
  test('an unknown role falls back to the coach bar', () => {
    assert.deepEqual(pages(undefined), pages('coach'))
  })
})

describe('which tab is lit', () => {
  test('coach: Workouts and Settings light More; the bar\'s own pages light themselves', () => {
    assert.equal(lit('coach', 'workouts'), '__more__')
    assert.equal(lit('coach', 'settings'), '__more__')
    for (const p of ['dashboard', 'clients', 'programs', 'calendar']) assert.equal(lit('coach', p), p)
  })
  test('Personal view: unchanged (its parent tabs)', () => {
    assert.equal(lit('solo', 'programs'), 'workouts')
    assert.equal(lit('solo', 'settings'), '__more__')
    assert.equal(lit('solo', 'calendar'), 'solo-dashboard')
  })
  test('client: every page lights itself (all five are on the bar)', () => {
    for (const p of ['client-dashboard', 'workouts', 'calendar', 'progress', 'settings']) assert.equal(lit('client', p), p)
  })
})

describe('the More sheet\'s rows', () => {
  test('coach: Workouts and Settings first, then the shared rows; no Exercise library', () => {
    const h = rows('coach', false)
    assert.match(h, /navigate\('workouts'\)">Workouts</)
    assert.match(h, /navigate\('settings'\)">Settings</)
    assert.ok(h.indexOf("navigate('workouts')") < h.indexOf("navigate('settings')"))
    for (const t of ['Download my data', 'Send feedback', 'Privacy policy', 'Sign out']) assert.match(h, new RegExp(t))
    assert.doesNotMatch(h, /Exercise library/)
  })
  test('the switch row: "Switch to Personal view" on your own account in coach view; none on another coach account', () => {
    assert.match(rows('coach', true), /switchView\('solo'\)">Switch to Personal view</)
    assert.doesNotMatch(rows('coach', false), /switchView/)
  })
  test('Personal view: exactly as before (Exercise library, Settings, shared rows, "Switch to PT view" on your own account)', () => {
    const h = rows('solo', true)
    assert.match(h, /navigate\('library'\)">Exercise library</)
    assert.match(h, /navigate\('settings'\)">Settings</)
    assert.match(h, /switchView\('coach'\)">Switch to PT view</)
    assert.doesNotMatch(h, /navigate\('workouts'\)/)
  })
})
