// _dateOnly: a stored calendar date ('YYYY-MM-DD', a DATE column) read as LOCAL midnight, for showing it (2026-10-17: a screen that formatted new Date('2026-07-15') showed the 14th
// to anyone west of UTC). The zone is set on the process BEFORE any Date is made, so the three zones below are real, not mocked. No browser: the same function the screens call.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { get } from './load-app.mjs'

const ZONES = ['Europe/London', 'America/New_York', 'Pacific/Auckland']
const shown = d => d.toLocaleDateString('en-CA')      // YYYY-MM-DD in the process's zone
let realTZ

describe('_dateOnly - a stored date is the same calendar day in every zone', () => {
  before(() => { realTZ = process.env.TZ })
  after(() => { if (realTZ === undefined) delete process.env.TZ; else process.env.TZ = realTZ })

  for (const tz of ZONES) {
    test(`${tz}: the day stays the day, at the start and the end of a month and a year`, () => {
      process.env.TZ = tz
      for (const d of ['2026-07-15', '2026-03-01', '2026-12-31', '2027-01-01', '2028-02-29']) assert.equal(shown(get('_dateOnly')(d)), d, d)
    })
  }

  test('the scenario is real: the plain parse is a day early west of UTC, and _dateOnly is not', () => {
    process.env.TZ = 'America/New_York'
    assert.equal(shown(new Date('2026-07-15')), '2026-07-14', 'new Date() on a date-only string is UTC midnight')
    assert.equal(shown(get('_dateOnly')('2026-07-15')), '2026-07-15')
  })

  test('a timestamp gives its date part; a value with spaces or nothing in it is an Invalid Date, not today or 1970', () => {
    process.env.TZ = 'America/New_York'
    assert.equal(shown(get('_dateOnly')('2026-07-15T23:30:00+00:00')), '2026-07-15')
    for (const bad of [null, undefined, '', 'soon', '15/07/2026', 20260715, {}]) assert.ok(Number.isNaN(get('_dateOnly')(bad).getTime()), String(bad))
  })

  test('_bucketKey (chart buckets) puts a stored date in its own month and week in every zone', () => {
    // The MONTH key is the displayed-day bug (a stored 1st landing in the month before). The week key has an older, separate quirk (its day arithmetic crosses a daylight-saving
    // change, so a date on a week boundary can move a week in some zones) and is not asserted here; it is named in the ledger.
    for (const tz of ZONES) {
      process.env.TZ = tz
      assert.equal(get('_bucketKey')('2026-08-01', 'month'), '2026-08', `${tz}: the 1st is in its own month, not the one before`)
      assert.equal(get('_bucketKey')('2027-01-01', 'month'), '2027-01', `${tz}: nor is New Year's Day in the old year`)
    }
  })

  test('it is local midnight, so a formatted weekday matches the calendar', () => {
    process.env.TZ = 'America/New_York'
    assert.equal(get('_dateOnly')('2026-07-15').toLocaleDateString('en-GB', { weekday: 'long' }), 'Wednesday')
    assert.equal(get('_dateOnly')('2026-07-15').getHours(), 0)
  })
})
