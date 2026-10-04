// Personal bests: which record is shown as a name's "best" (bug row 2026-09-19; retargeted 2026-10-03).
//
// WHY THIS FILE EXISTS. The Progress → Benchmarks tab was deleted on 2026-09-19, which made the dashboard Benchmarks card the ONLY
// client-facing view of performance_logs. That card chose each name's "best" by comparing raw `value`s, with the direction picked by
// CATEGORY (cardio = lower, everything else = higher). The coach's Performance tab picks by converted value with the direction picked
// by UNIT (_bestPerfLog). Until the tab went, the two were shown side by side and the wrong one was visible; once it went, nothing
// contradicted the card.
//
//   mixed units      100 kg then 220 lbs (about 99.8 kg)   card showed 220 lbs
//   benchmark time   200 sec then 180 sec                   card showed 200 (the slower time)
//   cardio distance  5 km then 10 km                        card showed 5 km (lower-is-better on a distance)
//
// RETARGETED 2026-10-03. The dashboard no longer shows personal bests at all (Jake: Goals stay, Recent sessions and personal bests do
// not), so the card these drove is gone. The RULE it pinned is not: Progress -> Personal Bests lists every record by category and
// stamps each name's best with a "PB" badge, chosen by the same _bestPerfLog. These drive that page for real - seed rows for the
// logged-in client, render renderClientPerformance, read the PB value printed beside the name - so the cases below still mean what
// they meant. (The dashboard side - that it neither reads nor shows them - is pinned in solo-dashboard-tiles-2026-08-30.spec.js.)
const { test, expect } = require('./fixtures')
const { loginAsPT, loginAsClient } = require('./helpers')

const ymd = daysAgo => new Date(Date.now() - daysAgo * 86400000).toLocaleDateString('en-CA')

// Each case seeds two rows under ONE name (older first) and states the value the page must print.
// 220 lbs = 99.79 kg, so 100 kg is the heavier lift; 30 in = 76.2 cm, so it beats 60 cm.
const CASES = [
  { key: 'kg-lbs', category: 'strength', show: '100 kg',
    title: 'mixed kg / lbs: 100 kg then 220 lbs (about 99.8 kg) shows 100 kg',
    rows: [{ value: 100, unit: 'kg', daysAgo: 1 }, { value: 220, unit: 'lbs', daysAgo: 0 }] },
  { key: 'cm-in', category: 'body_metric', show: '30 in',
    title: 'mixed cm / in, best is the NEWEST: 60 cm then 30 in (76.2 cm) shows 30 in',
    rows: [{ value: 60, unit: 'cm', daysAgo: 1 }, { value: 30, unit: 'in', daysAgo: 0 }] },
  { key: 'sec', category: 'benchmark', show: '180 sec',
    title: 'benchmark time: 200 sec then 180 sec shows 180 sec (lower is better)',
    rows: [{ value: 200, unit: 'sec', daysAgo: 1 }, { value: 180, unit: 'sec', daysAgo: 0 }] },
  { key: 'km', category: 'cardio', show: '10 km',
    title: 'cardio distance: 5 km then 10 km shows 10 km (higher is better)',
    rows: [{ value: 5, unit: 'km', daysAgo: 1 }, { value: 10, unit: 'km', daysAgo: 0 }] },
  // Behaviour that must NOT change: a cardio TIME was already lower-is-better, so this passes before the
  // fix and after it. It pins that the fix did not flip the one case the old rule got right.
  { key: 'min', category: 'cardio', show: '24 min',
    title: 'cardio time is still lower-is-better: 25 min then 24 min shows 24 min (unchanged)',
    rows: [{ value: 25, unit: 'min', daysAgo: 1 }, { value: 24, unit: 'min', daysAgo: 0 }] },
]

// Renders the Personal Bests record list for one client into a scratch host and returns the row for ONE fixture name. Each record
// group is a summary row (onclick togglePerfHistory) holding [name + entry count] and [best value + unit, "PB" badge].
async function recordsFor(page, clientId) {
  await page.evaluate(async (clientId) => {
    document.getElementById('pb-best-host')?.remove()
    const host = document.createElement('div'); host.id = 'pb-best-host'; document.body.appendChild(host)
    await renderClientPerformance(clientId, host)
  }, clientId)
  return page.locator('#pb-best-host')
}
const bestIn = (host, name) => host.locator('div[onclick^="togglePerfHistory"]', { hasText: name }).locator('span').first()

async function seedRows(page, clientId, name, category, rows) {
  const err = await page.evaluate(async ({ clientId, name, category, rows }) => {
    const { error } = await db.from('performance_logs').insert(rows.map(r => ({
      client_id: clientId, logged_by: currentUser.id, category, name, value: r.value, unit: r.unit, date: r.date,
    })))
    return error ? error.message : null
  }, { clientId, name, category, rows: rows.map(r => ({ value: r.value, unit: r.unit, date: ymd(r.daysAgo) })) })
  expect(err, 'seeding the rows must not fail').toBeNull()
}

// Verifies the cleanup cleaned. A delete that RLS refuses removes 0 rows and returns NO error, so an
// unchecked teardown would quietly strand rows in the real performance_logs table on every run.
async function removeRows(page, clientId, name) {
  const r = await page.evaluate(async ({ clientId, name }) => {
    const { error } = await db.from('performance_logs').delete()
      .eq('client_id', clientId).eq('name', name).select('id')
    const { data: left } = await db.from('performance_logs').select('id')
      .eq('client_id', clientId).eq('name', name)
    return { err: error ? error.message : null, remaining: (left || []).length }
  }, { clientId, name })
  expect(r.err, 'cleanup delete errored').toBeNull()
  expect(r.remaining, 'cleanup left rows behind - RLS likely refused the DELETE, and this test is stranding rows in the real database').toBe(0)
}

const ownClientId = page => page.evaluate(async () => {
  const { data } = await db.from('clients').select('id').eq('user_id', currentUser.id).single()
  return data.id
})

test.describe('Personal Bests page - best record per name', () => {
  for (const c of CASES) {
    test(`CLIENT: ${c.title}`, async ({ page }) => {
      await loginAsClient(page)
      const clientId = await ownClientId(page)
      const name = `[E2E-PB] ${c.key} ${Date.now()}`
      try {
        await seedRows(page, clientId, name, c.category, c.rows)
        // renderClientPerformance returns its render promise, so evaluate awaits the whole render and no sleep is needed.
        const host = await recordsFor(page, clientId)
        await expect(bestIn(host, name)).toHaveText(c.show)
      } finally {
        await removeRows(page, clientId, name)
      }
    })
  }

  // `unit` is a free-text column and _perfBaseValue looked it up as an OBJECT KEY, so a row whose unit is "__proto__" made the plain
  // lookup return Object.prototype (truthy, not callable) and throw. That was survivable while only the coach's Performance tab
  // called _bestPerfLog; the page every client uses to see their records calls it too, and a throw there leaves it stuck on
  // "Loading…". The app's own form only offers a category's units, so planting this takes a direct API write - but a records page
  // should not be one bad row away from dead. Every other unknown unit ('Kg', '5km') is a plain miss and never threw.
  test('CLIENT: a record with a hostile unit ("__proto__") does not stop the records page drawing', async ({ page }) => {
    await loginAsClient(page)
    const clientId = await ownClientId(page)
    const name = `[E2E-PB] hostile-unit ${Date.now()}`
    try {
      await seedRows(page, clientId, name, 'cardio', [{ value: 5, unit: '__proto__', daysAgo: 0 }])
      const host = await recordsFor(page, clientId)
      await expect(host).toContainText(name)
    } finally {
      await removeRows(page, clientId, name)
    }
  })

  // The solo record uses the same page and the same rule. Skips without a solo client record, exactly like solo-account.spec.js.
  test('SOLO: the personal records page uses the same rule - 60 cm then 30 in (76.2 cm) shows 30 in', async ({ page }) => {
    await loginAsPT(page)
    const soloId = await page.evaluate(() => window._soloClientId || null)
    test.skip(!soloId, 'no solo client record on this account')
    await page.evaluate(() => switchView('solo'))
    // Let the render switchView starts finish BEFORE seeding, so it cannot land after ours with stale data.
    await expect(page.locator('#dash-root[data-dash="solo"]')).toBeVisible()
    const name = `[E2E-PB] solo-cm-in ${Date.now()}`
    try {
      await seedRows(page, soloId, name, 'body_metric',
        [{ value: 60, unit: 'cm', daysAgo: 1 }, { value: 30, unit: 'in', daysAgo: 0 }])
      const host = await recordsFor(page, soloId)
      await expect(bestIn(host, name)).toHaveText('30 in')
    } finally {
      await removeRows(page, soloId, name)
    }
  })
})
