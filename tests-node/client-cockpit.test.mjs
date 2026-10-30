// The client profile cockpit (MVP item 5, approved by Jake 2026-10-30): a strip under the client's name that says where they are, why they
// need the coach, and what to do next - plan + week, this week's sessions against the plan, last session, latest check-in, the
// Needs-attention reasons, Start session / Assign next block, and Call / Text / Email (no WhatsApp: Jake, 2026-10-30). Two pure helpers in
// js/app-clients.js: _contactLinks (client row -> links) and _clientCockpitHtml (everything known -> markup). Today: Friday 2026-10-30.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { get } from './load-app.mjs'

const TODAY = '2026-10-30'
const links = (c) => JSON.parse(JSON.stringify(get('_contactLinks')({ phone: null, email: null, ...c })))

describe('_contactLinks - Call, Text and Email, only for details on file', () => {
  test('a phone gives Call and Text, digits and a leading + only', () => {
    assert.deepEqual(links({ phone: '07700 900 000' }), [
      { kind: 'call', label: 'Call', href: 'tel:07700900000' },
      { kind: 'text', label: 'Text', href: 'sms:07700900000' },
    ])
    assert.equal(links({ phone: '+44 (0)7700-900000' })[0].href, 'tel:+4407700900000')
  })
  test('an email gives Email; a value that is not an address gives nothing', () => {
    assert.deepEqual(links({ email: 'sam@example.com' }), [{ kind: 'email', label: 'Email', href: 'mailto:sam@example.com' }])
    assert.deepEqual(links({ email: 'not an email' }), [])
  })
  test('nothing on file, or a phone with no digits: no links at all', () => {
    assert.deepEqual(links({}), [])
    assert.deepEqual(links({ phone: 'ask at reception' }), [])
  })
  test('hostile input cannot leave the href: the phone keeps digits only, the email is refused', () => {
    assert.deepEqual(links({ phone: '0770"><img src=x onerror=1>' }).map(l => l.href), ['tel:07701', 'sms:07701'])
    assert.deepEqual(links({ email: 'a"><img src=x>@b.com' }), [])
  })
  test('an email carrying a query cannot preset a hidden BCC, subject or body (review, 2026-10-30)', () => {
    assert.deepEqual(links({ email: 'sam@x.com?bcc=attacker%40evil.com&subject=hi' }), [])
    assert.deepEqual(links({ email: 'sam+gym@my-gym.co.uk' }), [{ kind: 'email', label: 'Email', href: 'mailto:sam+gym@my-gym.co.uk' }])
  })
  test('no WhatsApp link, ever (Jake, 2026-10-30)', () => {
    assert.equal(links({ phone: '07700900000', email: 'a@b.co' }).some(l => /wa\.me|whatsapp/i.test(l.href)), false)
  })
})

const s = (o = {}) => ({ client_id: 'c1', full_name: 'Alex', status: 'active', sessions_7d: 2, last_session_date: '2026-10-29', last_check_in_at: '2026-10-27T09:00:00Z',
  check_in_sleep: 4, check_in_energy: 4, check_in_stress: 2, check_in_soreness: 2, program_name: 'Hypertrophy', program_start: '2026-10-12', program_weeks: 12, next_program_start: null, ...o })
const html = (o = {}) => get('_clientCockpitHtml')({ id: 'c1', s: s(), reasons: [], week: { planned: 3, logged: 2 }, client: { phone: '07700900000', email: 'a@b.co' }, todayStr: TODAY, ...o })

describe('_clientCockpitHtml - the strip', () => {
  test('where they are: plan + week, this week against the plan, last session, latest check-in', () => {
    const h = html()
    assert.match(h, /Hypertrophy · Wk 3\/12/)
    assert.match(h, /2 of 3 planned/)
    assert.match(h, /Yesterday/)
    assert.match(h, /<i>Check-in<\/i><b>3d ago<\/b>/)
  })
  test('no dated plan: the week is a plain count; no check-ins: says so', () => {
    const h = html({ s: s({ program_name: null, program_start: null, program_weeks: null, last_check_in_at: null }), week: { planned: null, logged: 2 } })
    assert.match(h, /No plan/)
    assert.match(h, /2 sessions/)
    assert.match(h, /<i>Check-in<\/i><b>None yet<\/b>/)
  })
  test('one window for the week, plan or no plan: the shared read\'s count, never the view\'s sessions_7d (review, 2026-10-30)', () => {
    assert.match(html({ s: s({ program_name: null, program_start: null, sessions_7d: 5 }), week: { planned: null, logged: 1 } }), /<b>1 session<\/b>/)
    assert.match(html(), /<i>7 days to yesterday<\/i>/)
    assert.match(html({ week: null }), /<i>7 days to yesterday<\/i><b>—<\/b>/, 'inactive client, or the sessions read failed')
    assert.match(html({ week: { planned: null, logged: null } }), /<i>7 days to yesterday<\/i><b>—<\/b>/)
  })
  test('an unreadable check-in date is not "None yet" beside a Flagged badge', () => {
    const h = html({ s: s({ last_check_in_at: 'garbage', check_in_stress: 5 }) })
    assert.doesNotMatch(h, /data-checkin-flagged/)
  })
  test('a red check-in score is flagged', () => {
    assert.match(html({ s: s({ check_in_stress: 5 }) }), /data-checkin-flagged/)
    assert.doesNotMatch(html(), /data-checkin-flagged/)
  })
  test('every reason shows; "Assign next block" only when a reason calls for it', () => {
    const r = [{ key: 'missed', severity: 'high', label: 'Missed sessions', detail: 'x' }, { key: 'plan_ending', severity: 'medium', label: 'Plan ending', detail: 'y', action: 'next-block' }]
    const h = html({ reasons: r })
    assert.match(h, /data-reason="missed"/)
    assert.match(h, /data-reason="plan_ending"/)
    assert.match(h, /data-cockpit-action="next-block"/)
    assert.doesNotMatch(html({ reasons: [r[0]] }), /data-cockpit-action="next-block"/)
  })
  test('Start session always; contact links as on file', () => {
    const h = html()
    assert.match(h, /data-cockpit-action="start"/)
    assert.match(h, /href="tel:07700900000"/)
    assert.match(h, /href="mailto:a@b.co"/)
    assert.doesNotMatch(html({ client: {} }), /tel:|mailto:/)
  })
  test('a failed summary read: says so, accuses nobody, still offers Start session and contact', () => {
    const h = html({ s: null, reasons: [], week: null, unavailable: true })
    assert.match(h, /Could not load/)
    assert.doesNotMatch(h, /data-reason=/)
    assert.match(h, /data-cockpit-action="start"/)
    assert.match(h, /href="tel:/)
  })
  test('a hostile plan name is text, never markup', () => {
    assert.doesNotMatch(html({ s: s({ program_name: '<img src=x onerror=1>' }) }), /<img/)
  })
})
