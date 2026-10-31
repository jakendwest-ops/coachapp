// Invite state (MVP item 7, approved by Jake 2026-10-31, with SQL): where a client stands with the app. Inviting creates the login and links it at
// once, so a link means "invited", not "joined"; coach_client_summary.signed_in (scripts/add-client-signed-in-2026-10-31.sql) says whether they have
// signed in (agreed to the privacy policy): true / false / null or absent = unknown. Two pure pieces: _inviteState in js/app-core.js, and the
// "Invite not accepted" Needs-attention rule in _attentionFor. Today: Saturday 2026-10-31.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { get } from './load-app.mjs'

const TODAY = '2026-10-31'
const st = (s, email = 'a@b.co') => JSON.parse(JSON.stringify(get('_inviteState')(s, email, TODAY)))
const row = (o = {}) => ({ client_id: 'c1', full_name: 'Alex', status: 'active', created_at: '2026-10-01T09:00:00Z', user_id: 'u1', invited_at: '2026-10-25T09:00:00Z',
  signed_in: false, last_session_date: null, last_check_in_at: null, last_weigh_in_date: null, program_start: null, program_weeks: null, ...o })
// Copied out of the sandbox (JSON): arrays made inside the vm context are not deepEqual to this realm's.
const attn = (s, ctx = {}) => JSON.parse(JSON.stringify(get('_attentionFor')(s, { todayStr: TODAY, ...ctx })))
const reasons = (s) => attn(s).map(r => r.key)

describe('_inviteState - what the app knows about a client and the app', () => {
  test('not linked to a login: "Not invited" - or, with no email on file, "Add an email to invite"', () => {
    assert.equal(st(row({ user_id: null, invited_at: null })).key, 'not-invited')
    assert.equal(st(row({ user_id: null })).text, 'Not invited')
    assert.deepEqual([st(row({ user_id: null }), '').key, st(row({ user_id: null }), '  ').key, st(row({ user_id: null }), null).key], ['no-email', 'no-email', 'no-email'])
    assert.equal(st(row({ user_id: null }), null).text, 'Add an email to invite')
  })
  test('linked and signed in: "Signed in"', () => {
    assert.deepEqual([st(row({ signed_in: true })).key, st(row({ signed_in: true })).text], ['joined', 'Signed in'])
  })
  test('linked, never signed in: the invite date and how long ago', () => {
    const s = st(row())
    assert.equal(s.key, 'pending')
    assert.match(s.text, /^Invited .*25 Oct · not signed in yet$/)
    assert.equal(s.days, 6)
  })
  test('linked, never signed in, invite date not stamped: says so without a date', () => {
    const s = st(row({ invited_at: null }))
    assert.equal(s.key, 'pending')
    assert.equal(s.text, 'Invited · not signed in yet')
    assert.equal(s.days, null)
  })
  test('unknown (the column is missing - SQL not run - or the function could not tell): nothing is claimed', () => {
    const noCol = row(); delete noCol.signed_in
    assert.equal(st(noCol).key, 'unknown')
    assert.equal(st(row({ signed_in: null })).key, 'unknown')
    assert.equal(st(row({ signed_in: null })).text, null)
    assert.equal(st(null).key, 'unknown')
  })
})

describe('Needs attention - "Invite not accepted"', () => {
  test('invited 3 or more days ago and not signed in: flagged, and it replaces "No sessions yet" (one problem, one reason)', () => {
    const r = attn(row())
    assert.deepEqual(r.map(x => x.key), ['invite'])
    assert.equal(r[0].label, 'Invite not accepted')
    assert.equal(r[0].detail, 'Invited 6 days ago, not signed in yet')
    assert.equal(r[0].severity, 'medium')
  })
  test('invited less than 3 days ago: not yet - and not "No sessions yet" either', () => {
    assert.deepEqual(reasons(row({ invited_at: '2026-10-29T09:00:00Z' })), [])
    assert.deepEqual(reasons(row({ invited_at: '2026-10-28T09:00:00Z' })), ['invite'], 'exactly 3 days')
  })
  test('the threshold lives in ATTENTION_RULES', () => {
    assert.equal(get('ATTENTION_RULES').inviteDays, 3)
  })
  test('no invite date: the days since they were added decide', () => {
    assert.deepEqual(reasons(row({ invited_at: null })), ['invite'])
    assert.deepEqual(reasons(row({ invited_at: null, created_at: '2026-10-30T09:00:00Z' })), [])
  })
  test('signed in, unknown, or never invited: no invite reason; the training rules apply as before', () => {
    assert.deepEqual(reasons(row({ signed_in: true })), ['quiet'], 'signed in, never trained, on the roster 30 days')
    assert.deepEqual(reasons(row({ signed_in: null })), ['quiet'])
    const noCol = row(); delete noCol.signed_in
    assert.deepEqual(reasons(noCol), ['quiet'])
    assert.deepEqual(reasons(row({ user_id: null, invited_at: null, signed_in: null })), ['quiet'])
  })
  test('a pending client the coach trains in person still gets "Gone quiet" when that stops', () => {
    assert.deepEqual(reasons(row({ last_session_date: '2026-10-10' })).sort(), ['invite', 'quiet'])
  })
  test('a holiday does not mute it: it is not a training reason', () => {
    assert.deepEqual(attn(row(), { onHoliday: true }).map(x => x.key), ['invite'])
  })
})

describe('the cockpit shows it', () => {
  const html = (s, client = { email: 'a@b.co', phone: null, user_id: s.user_id }) => get('_clientCockpitHtml')({ id: 'c1', s, reasons: [], week: { planned: null, logged: 0 }, client, todayStr: TODAY })
  test('an "App" line with the state', () => {
    assert.match(html(row()), /<i>App<\/i><b data-invite-state="pending">Invited .*25 Oct · not signed in yet<\/b>/)
    assert.match(html(row({ signed_in: true })), /data-invite-state="joined">Signed in</)
    assert.match(html(row({ user_id: null })), /data-invite-state="not-invited">Not invited</)
  })
  test('Send invite only for a client with an email and no login yet', () => {
    assert.match(html(row({ user_id: null })), /data-cockpit-action="invite"/)
    assert.doesNotMatch(html(row({ user_id: null }), { email: null }), /data-cockpit-action="invite"/)
    assert.doesNotMatch(html(row()), /data-cockpit-action="invite"/)
  })
  test('an inactive or archived client is not offered Send invite (review, 2026-10-31)', () => {
    assert.doesNotMatch(html(row({ user_id: null }), { email: 'a@b.co', user_id: null, status: 'archived' }), /data-cockpit-action="invite"/)
    assert.doesNotMatch(html(row({ user_id: null }), { email: 'a@b.co', user_id: null, status: 'inactive' }), /data-cockpit-action="invite"/)
    assert.match(html(row({ user_id: null }), { email: 'a@b.co', user_id: null, status: 'active' }), /data-cockpit-action="invite"/)
  })
  test('unknown: "—", never a guess', () => {
    assert.match(html(row({ signed_in: null })), /data-invite-state="unknown">—</)
  })
  test('a hostile email cannot leave the invite button\'s handler', () => {
    const h = html(row({ user_id: null }), { email: "x');alert(1);('@b.co" })
    assert.doesNotMatch(h, /alert\(1\);\('/)
  })
})
