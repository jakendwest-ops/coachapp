// The check-in loop: a coach sees new check-ins, marks them seen and replies; the client sees it
// (docs/bugs/2026-10-29-client-check-ins-get-no-response.md; SQL: scripts/add-checkin-review-2026-10-29.sql).
//
// Two halves. The STUB tests render the real builders with fixture rows and touch no table (nothing to strand): the coach's "Check-ins to
// review" card, the client's tap-button form, the client's view of a reply, and the coach Overview's Seen / Reply. The LIVE test runs the
// real loop against the real policies with its own [E2E-CI]-tagged check-in: the client submits through the form, the coach reviews it from
// Home, the server stamps it, another coach and the coach's own attempt to edit the ratings are refused, the client sees the reply and then
// deletes the row (the DELETE policy this work added), checked by rowcount.
const { test, expect } = require('./fixtures')
const { loginAsPT, loginAsClient, loginAsPT2 } = require('./helpers')

const TAG = '[E2E-CI]'
const row = (o) => ({ id: o.id || 'k-' + Math.random().toString(36).slice(2), client_id: o.client_id || 'cid', created_at: o.created_at || '2026-10-28T09:00:00.000Z',
  sleep: 3, energy: 3, stress: 3, soreness: 3, notes: null, coach_reply: null, reviewed_at: null, reviewed_by: null, clients: { full_name: o.name || 'Alex' }, ...o })

test.describe('check-in loop: the builders (no database)', () => {
  test('coach Home: "Check-ins to review" lists flagged first, escapes the note, and offers Seen and Reply on every row', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(({ rows }) => {
      const el = document.createElement('div')
      el.innerHTML = _dashCheckInsHtml(rows)
      document.body.appendChild(el)
      const items = [...el.querySelectorAll('[data-checkin-id]')]
      const out = {
        ids: items.map(i => i.dataset.checkinId),
        flagged: items.map(i => !!i.querySelector('[data-flagged]')),
        seenBtns: items.map(i => !!i.querySelector('[data-checkin-seen]')),
        replyBtns: items.map(i => !!i.querySelector('[data-checkin-reply]')),
        injected: !!el.querySelector('img'),
        noteText: items.find(i => i.dataset.checkinId === 'hostile')?.textContent || '',
        empty: (() => { const e = document.createElement('div'); e.innerHTML = _dashCheckInsHtml([]); return e.textContent })(),
        // a read cut at its limit says how many it left out; an uncut one says nothing
        more: (() => { const e = document.createElement('div'); e.innerHTML = _dashCheckInsHtml(rows, { total: 7 }); return e.querySelector('[data-checkins-more]')?.textContent || '' })(),
        noMore: (() => { const e = document.createElement('div'); e.innerHTML = _dashCheckInsHtml(rows, { total: 3 }); return !!e.querySelector('[data-checkins-more]') })(),
        failed: (() => { const e = document.createElement('div'); e.innerHTML = _dashCheckInsHtml([], { unavailable: true }); return e.textContent })(),
      }
      el.remove()
      return out
    }, { rows: [
      row({ id: 'calm', created_at: '2026-10-28T09:00:00Z', name: 'Calm Client' }),
      row({ id: 'hostile', created_at: '2026-10-27T09:00:00Z', notes: '<img src=x onerror="window.__pwned=1">sore knees', name: 'Note Client' }),
      row({ id: 'stressed', created_at: '2026-10-20T09:00:00Z', stress: 5, name: 'Stressed Client' }),
    ] })
    expect(r.ids, 'a flagged check-in (stress 5) sorts first, then newest first').toEqual(['stressed', 'calm', 'hostile'])
    expect(r.flagged).toEqual([true, false, false])
    expect(r.seenBtns).toEqual([true, true, true])
    expect(r.replyBtns).toEqual([true, true, true])
    expect(r.injected, 'a note is text, never markup').toBe(false)
    expect(r.noteText).toContain('<img')
    expect(r.empty).toContain('Nothing to review')
    expect(r.more, '3 shown of 7: the card says 4 more').toContain('+4 more')
    expect(r.noMore).toBe(false)
    expect(r.failed, 'a failed read says so, never "Nothing to review"').toContain('Could not load')
    expect(r.failed).not.toContain('Nothing to review')
  })

  test('client form: tap buttons with NO default, submit disabled until all four are answered, ids kept as hidden inputs', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      const el = document.createElement('div')
      el.innerHTML = _dashCheckInHtml(null, 'cid', null)
      document.body.appendChild(el)
      const submit = el.querySelector('#ci-submit')
      const state = (label) => ({ label, disabled: submit.disabled, values: ['sleep', 'energy', 'stress', 'soreness'].map(k => el.querySelector('#ci-' + k).value) })
      const out = { pressedAtStart: el.querySelectorAll('[data-ci-metric][aria-pressed="true"]').length, buttons: el.querySelectorAll('[data-ci-metric]').length,
        hidden: ['sleep', 'energy', 'stress', 'soreness'].map(k => el.querySelector('#ci-' + k)?.type), steps: [state('start')] }
      const tap = (k, n) => el.querySelector(`[data-ci-metric="${k}"][data-ci-value="${n}"]`).click()
      tap('sleep', 4); tap('energy', 2); tap('stress', 5); out.steps.push(state('three answered'))
      tap('stress', 1); out.pressed = el.querySelectorAll('[data-ci-metric="stress"][aria-pressed="true"]').length
      tap('soreness', 3); out.steps.push(state('all four'))
      el.remove()
      return out
    })
    expect(r.buttons, 'five buttons for each of the four questions').toBe(20)
    expect(r.pressedAtStart, 'nothing is pre-chosen').toBe(0)
    expect(r.hidden).toEqual(['hidden', 'hidden', 'hidden', 'hidden'])
    expect(r.steps[0]).toEqual({ label: 'start', disabled: true, values: ['', '', '', ''] })
    expect(r.steps[1].disabled, 'three of four answered: still disabled').toBe(true)
    expect(r.pressed, 'changing an answer leaves one button pressed').toBe(1)
    expect(r.steps[2]).toEqual({ label: 'all four', disabled: false, values: ['4', '2', '1', '3'] })
  })

  test('client card: the coach\'s reply and "Seen by your coach" show under the last check-in; an unreviewed one says neither', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(({ seen, prev, unseen }) => {
      const text = (last, p) => { const el = document.createElement('div'); el.innerHTML = _dashCheckInHtml(last, 'cid', p); return el.textContent }
      return { seen: text(seen, prev), unseen: text(unseen, null) }
    }, {
      seen: row({ created_at: new Date().toISOString(), coach_reply: 'Ease off <b>this</b> week', reviewed_at: new Date().toISOString(), sleep: 4 }),
      prev: row({ created_at: new Date(Date.now() - 7 * 864e5).toISOString(), sleep: 2 }),
      unseen: row({ created_at: new Date().toISOString() }),
    })
    expect(r.seen).toContain('Seen by your coach')
    expect(r.seen, 'the reply is shown as text').toContain('Ease off <b>this</b> week')
    expect(r.unseen).not.toContain('Seen by your coach')
  })

  test('review fixes: no arrow against a missing score, a reply on the earlier check-in still shows, and "view as client" offers no Submit', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(({ last, prev, prevReplied }) => {
      const mk = (...a) => { const el = document.createElement('div'); el.innerHTML = _dashCheckInHtml(...a); return el }
      const nullArrow = mk(last, 'cid', prev)
      const earlier = mk(last, 'cid', prevReplied)
      const sudo = mk(null, 'cid', null, { sudo: true })
      const failed = mk(null, 'cid', null, { readFailed: true })
      return {
        arrows: [...nullArrow.querySelectorAll('.ci-arrow')].map(a => a.getAttribute('aria-label')),
        earlier: earlier.textContent,
        sudoSubmit: !!sudo.querySelector('#ci-submit'), sudoText: sudo.textContent,
        failedText: failed.textContent,
      }
    }, {
      last: row({ created_at: new Date().toISOString(), sleep: null, energy: 4, stress: 3, soreness: 2 }),
      prev: row({ created_at: new Date(Date.now() - 7 * 864e5).toISOString(), sleep: 3, energy: null, stress: 3, soreness: 4 }),
      prevReplied: row({ created_at: new Date(Date.now() - 7 * 864e5).toISOString(), coach_reply: 'Keep the deload going', reviewed_at: new Date().toISOString() }),
    })
    expect(r.arrows, 'only soreness has two real values (2 vs 4); null sleep / null energy draw no arrow').toEqual(['down from 4 last time'])
    expect(r.earlier, 'the reply to the earlier check-in is shown').toContain('Keep the deload going')
    expect(r.sudoSubmit, '"view as client" has no Submit button').toBe(false)
    expect(r.sudoText).toContain('only they can submit')
    expect(r.failedText, 'a failed read never says "Your first check-in"').not.toContain('Your first check-in')
  })

  test('coach Home: Seen / Reply takes the row out IN PLACE and drops the count, no repaint; the last one leaves "Nothing to review"', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(({ rows }) => {
      document.querySelectorAll('#dash-checkins').forEach(n => n.remove())   // the real Home's card: one id on the page, the fixture's
      const el = document.createElement('div'); el.innerHTML = _dashCheckInsHtml(rows); document.body.appendChild(el)
      const marker = el.querySelector('#dash-checkins'); marker.dataset.probe = 'same-node'
      const steps = []
      steps.push(_dashCheckInReviewed('k1'), el.querySelector('[data-checkins-count]').textContent, el.querySelectorAll('[data-checkin-id]').length)
      steps.push(_dashCheckInReviewed('not-there'))
      steps.push(_dashCheckInReviewed('k2'), el.querySelector('#dash-checkins').textContent.includes('Nothing to review'), el.querySelector('#dash-checkins').dataset.probe)
      el.remove()
      return steps
    }, { rows: [row({ id: 'k1' }), row({ id: 'k2', created_at: '2026-10-27T09:00:00Z' })] })
    expect(r).toEqual([true, '1', 1, false, true, true, 'same-node'])
  })

  test('coach Overview: the latest unreviewed check-in offers Seen and Reply; a reviewed one shows the reply', async ({ page }) => {
    await loginAsPT(page)
    const render = (checkIns) => page.evaluate(async ({ checkIns }) => {
      const realFrom = db.from
      const fake = (rows) => { const b = { select: () => b, eq: () => b, order: () => b, limit: () => b, single: async () => ({ data: rows[0] ?? null, error: null }), maybeSingle: async () => ({ data: rows[0] ?? null, error: null }), then: (res, rej) => Promise.resolve({ data: rows, error: null }).then(res, rej) }; return b }
      db.from = (t) => {
        if (t === 'clients') return fake([{ id: 'cid', full_name: '[E2E-CI] Overview', status: 'active', email: null, phone: null, date_of_birth: null, height_cm: null, notes: null }])
        if (t === 'client_check_ins') return fake(checkIns)
        if (t === 'client_programs') return fake([])
        throw new Error('unexpected table in a stubbed render: ' + t)
      }
      const el = document.createElement('div'); document.body.appendChild(el)
      try { await renderClientOverview('cid', el) } finally { db.from = realFrom }
      const out = { seen: !!el.querySelector('[data-checkin-seen]'), reply: !!el.querySelector('[data-checkin-reply]'), text: el.textContent }
      el.remove()
      return out
    }, { checkIns })
    const fresh = await render([row({ id: 'k1' })])
    expect(fresh.seen).toBe(true)
    expect(fresh.reply).toBe(true)
    const done = await render([row({ id: 'k1', reviewed_at: '2026-10-28T10:00:00Z', coach_reply: 'Nice work' })])
    expect(done.seen, 'already seen: no Seen button').toBe(false)
    expect(done.text).toContain('Nice work')
    expect(done.reply, 'the reply can still be changed').toBe(true)
  })
})

test.describe('check-in loop: live, against the real policies', () => {
  test('client submits, coach marks seen and replies from Home, the server stamps it, the client sees it and deletes it', async ({ page, browser }) => {
    test.setTimeout(180_000)
    const note = `${TAG} ${Date.now()}`
    // ── the client submits through the real form ──
    await loginAsClient(page)
    const cid = await page.evaluate(async () => (await db.from('clients').select('id').eq('user_id', currentUser.id).not('coach_id', 'is', null).maybeSingle()).data?.id)
    expect(cid, 'the test client has a coached record').toBeTruthy()
    await page.evaluate(() => { const f = document.getElementById('checkin-form'); if (f) f.style.display = 'block' })
    for (const [k, n] of [['sleep', 2], ['energy', 3], ['stress', 5], ['soreness', 4]]) await page.locator(`[data-ci-metric="${k}"][data-ci-value="${n}"]`).click()
    await page.locator('#ci-notes').fill(note)
    await page.locator('#ci-submit').click()
    let checkInId
    await expect.poll(async () => (checkInId = await page.evaluate(async (n) => (await db.from('client_check_ins').select('id').eq('notes', n).maybeSingle()).data?.id, note)), { timeout: 10000 }).toBeTruthy()

    const coachCtx = await browser.newContext(), coach = await coachCtx.newPage()
    const pt2Ctx = await browser.newContext(), pt2 = await pt2Ctx.newPage()
    let deleted = -1
    try {
      // ── the coach sees it on Home, flagged, and marks it seen, then replies ──
      await loginAsPT(coach)
      const item = coach.locator(`#dash-checkins [data-checkin-id="${checkInId}"]`)
      await expect(item).toBeVisible({ timeout: 15000 })
      await expect(item.locator('[data-flagged]')).toBeVisible()
      await item.locator('[data-checkin-reply]').click()
      await coach.locator('#ci-reply-text').fill('Ease off this week - we will adjust Thursday')
      await coach.locator('#ci-reply-save').click()
      await expect(coach.locator(`#dash-checkins [data-checkin-id="${checkInId}"]`), 'reviewed: it leaves the inbox').toHaveCount(0)
      const stamped = await coach.evaluate(async (id) => (await db.from('client_check_ins').select('coach_reply, reviewed_at, reviewed_by').eq('id', id).single()).data, checkInId)
      const coachUid = await coach.evaluate(() => currentUser.id)
      expect(stamped.coach_reply).toBe('Ease off this week - we will adjust Thursday')
      expect(stamped.reviewed_at, 'the server stamped when').toBeTruthy()
      expect(stamped.reviewed_by, 'the server stamped who').toBe(coachUid)

      // ── what must be refused (each preceded by a control: the row is there and readable) ──
      const rating = await coach.evaluate(async (id) => (await db.from('client_check_ins').update({ sleep: 5 }).eq('id', id).select('id')).error?.code || 'no error', checkInId)
      expect(rating, 'a coach cannot change the client\'s rating (column grant)').toBe('42501')
      await loginAsPT2(pt2)
      const other = await pt2.evaluate(async (id) => { const r = await db.from('client_check_ins').update({ coach_reply: 'hijack' }).eq('id', id).select('id'); return { error: r.error?.code || null, rows: r.data?.length ?? -1 } }, checkInId)
      expect(other, 'another coach updates nothing').toEqual({ error: null, rows: 0 })

      // ── the client sees the reply and "Seen by your coach" ──
      await page.reload()
      await expect(page.locator('#checkin-card')).toContainText('Seen by your coach', { timeout: 15000 })
      await expect(page.locator('#checkin-card')).toContainText('Ease off this week')
    } finally {
      deleted = await page.evaluate(async (id) => id ? ((await db.from('client_check_ins').delete().eq('id', id).select('id')).data?.length ?? -1) : 0, checkInId)
      await coachCtx.close(); await pt2Ctx.close()
    }
    expect(deleted, 'the client deletes their own check-in (the new DELETE policy)').toBe(1)
  })

  // The insert guard (added after the first version of the script was applied): a client cannot create a check-in that already reads
  // "seen by your coach" with a reply of their own - which would also keep it out of the coach's inbox. RED until the re-run script is live.
  test('a client cannot pre-fill a reply or "seen" when inserting: the server clears all three review columns', async ({ page }) => {
    await loginAsClient(page)
    const r = await page.evaluate(async (tag) => {
      const { data: me } = await db.from('clients').select('id, coach_id').eq('user_id', currentUser.id).not('coach_id', 'is', null).maybeSingle()
      const ins = await db.from('client_check_ins').insert({ client_id: me.id, sleep: 3, energy: 3, stress: 3, soreness: 3, notes: `${tag} insert-guard ${Date.now()}`,
        coach_reply: 'Great job!', reviewed_at: new Date().toISOString(), reviewed_by: me.coach_id, created_at: '2020-01-01T00:00:00Z' }).select('id, coach_reply, reviewed_at, reviewed_by, created_at').single()
      const del = ins.data?.id ? (await db.from('client_check_ins').delete().eq('id', ins.data.id).select('id')).data?.length ?? -1 : 0
      const ageMin = ins.data?.created_at ? Math.abs(Date.now() - new Date(ins.data.created_at)) / 60000 : null
      return { error: ins.error?.code || null, row: ins.data && { coach_reply: ins.data.coach_reply, reviewed_at: ins.data.reviewed_at, reviewed_by: ins.data.reviewed_by }, del, ageMin }
    }, TAG)
    expect(r.error, 'the client can still insert their own check-in').toBeNull()
    expect(r.del, 'and it is cleaned up (the client deletes their own)').toBe(1)
    expect(r.row, 'the review columns come back empty whatever the client sent').toEqual({ coach_reply: null, reviewed_at: null, reviewed_by: null })
    expect(r.ageMin, 'created_at is the server\'s time, not the 2020 the client sent (it could back-date a check-in out of the inbox)').toBeLessThan(5)
  })
})
