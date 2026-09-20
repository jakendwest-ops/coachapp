const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')
const { installCappedApi, restoreCappedApi, cappedApiCalls } = require('./capped-api')

// ─── The finish screen's "🏆 PR" must be true, at any history size (R4b, 2026-09-20) ────────────────────
//
// showRunnerFinish tells an athlete "🏆 N PRs" the moment they finish. Reading the code (not a report) showed the
// comparison was wrong in four ways:
//   1. BASELINE CUT AT 200 ROWS. It read the client's logged exercises by name, then the sets of those exercises, both
//      with no order and no limit — and the API silently caps a response at 200 rows, oldest first in practice. A client
//      who has done a lift ~200 times, or ~50 times with four sets, was compared against their OLDEST sets only: every
//      session heavier than their early ones read as a PR, however many times they had beaten it before. The newest rows
//      are exactly where a progressing client's best is, so the baseline was too low for exactly the people who use the
//      app most.
//   2. NAME ONLY. A renamed exercise (the runner already carries its library `exerciseId` for the "Beat last time" line)
//      lost its whole history, so its next session was a PR.
//   3. A FLASH OF FALSE PRs. The screen rendered first "with no PR data" — but no data meant a baseline of 0, so EVERY
//      weighted exercise showed "🏆 PR" until the fetch returned, and stayed that way if the fetch failed.
//   4. TWO COPIES of the rule (the header count and the per-exercise chip).
//
// These run the real showRunnerFinish against tests/capped-api.js — no rows are created, so nothing to clean up — with
// `unordered: 'insertion'`, which is what makes a capped, order-less read drop the NEWEST rows the way the live API does.
// The last test runs the new query against the REAL database with its own tagged fixture, which is the only proof that a
// two-level embedded filter + order + limit(1) behaves on real PostgREST.
test.describe('the runner finish screen\'s PR baseline', () => {
  const EX = (over = {}) => ({ name: 'Cap Bench', exerciseId: 'ex-bench', type: 'strength', metricType: 'weight_reps', targetSets: 3, sets_json: [{}], restSecs: 90, loggedSets: [{ weight: '120', reps: '5' }], ...over })

  // One prior session per entry — a log, one exercise row, one set — oldest first (fixture order = insertion order).
  // Both shapes the code might read: flat exercise rows + flat sets (the old two-step read) and sets carrying their
  // exercise and log as nested objects (the one-query read).
  const history = (entries) => {
    const exercises = [], sets = []
    entries.forEach((e, i) => {
      const log = { client_id: e.clientId || 'cid' }
      exercises.push({ id: 'hx-' + i, log_id: 'hl-' + i, exercise_id: e.exerciseId ?? null, exercise_name: e.name, workout_logs: log })
      sets.push({ id: 'hs-' + i, workout_log_exercise_id: 'hx-' + i, weight_kg: e.kg, set_number: 1,
        workout_log_exercises: { exercise_id: e.exerciseId ?? null, exercise_name: e.name, workout_logs: log } })
    })
    return { workout_log_exercises: exercises, workout_log_sets: sets }
  }
  const bench = (kg, over = {}) => ({ name: 'Cap Bench', exerciseId: 'ex-bench', kg, ...over })
  // 249 sessions at 100 kg, then the NEWEST at 140 kg — the shape of a client who has progressed — and another
  // client's 200 kg rows for the same lift, which must never count.
  const longHistory = () => history([...Array.from({ length: 249 }, () => bench(100)), bench(140), bench(200, { clientId: 'other-client' }), bench(200, { clientId: 'other-client' })])

  const SAVE = '#workout-runner button[onclick="saveRunnerSession()"]'
  // expectOk: every baseline lookup must have SUCCEEDED. Most tests assert "no 🏆", which a lookup that threw would also
  // satisfy (a failure means no PR) — so without this a broken query would pass them all. Only the failure test opts out.
  const finish = async (page, { exercises, tables, api = { unordered: 'insertion' }, lb = false, typeDuring = false, clientId = 'cid', savingDuring = false, expectOk = true }) => {
    await installCappedApi(page, tables, api)
    try {
      const r = await page.evaluate(async ({ exercises, lb, typeDuring, clientId, savingDuring, SAVE }) => {
        const prevUnit = window._unitPrefs.weight
        if (lb) window._unitPrefs.weight = 'lb'
        let el = document.getElementById('workout-runner')
        if (!el) { el = document.createElement('div'); el.id = 'workout-runner'; document.body.appendChild(el) }
        _runner = { exercises, exIdx: 0, startTime: Date.now(), clientId, name: '[E2E] PR' }
        try {
          const p = showRunnerFinish()
          // The immediate render, before the baseline can have arrived (everything before the first await is synchronous).
          const first = document.getElementById('workout-runner').textContent
          if (typeDuring) { document.getElementById('rf-notes').value = 'felt strong'; document.getElementById('rf-name').value = 'My renamed session' }
          // A save already under way (saveRunnerSession disables the button and says "Saving…", and that is its only re-entry guard).
          const saveBefore = document.querySelector(SAVE)
          if (savingDuring) { saveBefore.disabled = true; saveBefore.textContent = 'Saving…' }
          const notesBefore = document.getElementById('rf-notes')
          await p
          const root = document.getElementById('workout-runner')
          const saveAfter = document.querySelector(SAVE)
          return {
            first, text: root.textContent,
            sameSaveNode: saveAfter === saveBefore, saveDisabled: saveAfter?.disabled, saveText: saveAfter?.textContent,
            sameNotesNode: document.getElementById('rf-notes') === notesBefore,
            headerPrs: (/🏆 (\d+) PRs?/.exec(root.textContent) || [])[1] || null,
            chips: (root.textContent.match(/🏆 PR/g) || []).length,
            notes: root.querySelector('#rf-notes')?.value, name: root.querySelector('#rf-name')?.value,
            imgs: root.querySelectorAll('img').length, xss: window.__xss === 1,
          }
        } finally { document.getElementById('workout-runner')?.remove(); _runner = null; window._unitPrefs.weight = prevUnit }
      }, { exercises, lb, typeDuring, clientId, savingDuring, SAVE })
      r.calls = await cappedApiCalls(page)
      if (expectOk) expect(r.calls.filter(c => c.error), 'every baseline lookup must succeed — otherwise "no PR" proves nothing').toEqual([])
      return r
    } finally { await restoreCappedApi(page) }
  }

  test.beforeEach(async ({ page }) => { await loginAsPT(page) })

  test('a long history\'s heaviest lift is the baseline: 120 kg is NOT a PR when 140 kg was lifted before — and 150 kg is, whatever another client lifted', async ({ page }) => {
    const beaten = await finish(page, { exercises: [EX()], tables: longHistory() })
    expect(beaten.text, '120 kg is below the 140 kg this client lifted (their newest of 250 sessions) — no PR').not.toContain('🏆')
    const real = await finish(page, { exercises: [EX({ loggedSets: [{ weight: '150', reps: '3' }] })], tables: longHistory() })
    expect.soft(real.headerPrs, '150 kg beats 140 kg: one PR in the header').toBe('1')
    expect(real.chips, 'and one chip on the exercise').toBe(1)
    // The two 200 kg rows belong to ANOTHER client: were the client filter lost, 150 kg would not be a PR.
  })

  test('the baseline is ONE tiny request per lookup however long the history — never a 200-row read', async ({ page }) => {
    const r = await finish(page, { exercises: [EX()], tables: longHistory() })
    expect(r.calls.length, 'a lookup by library id and one by name, nothing else').toBe(2)
    for (const c of r.calls) expect(c.returned, `${c.table}: a bounded read returns at most the one heaviest row`).toBeLessThanOrEqual(1)
  })

  test('a renamed exercise keeps its history through the library link', async ({ page }) => {
    const tables = history([bench(100, { name: 'Old Bench Name' }), bench(140, { name: 'Old Bench Name' })])
    const r = await finish(page, { exercises: [EX()], tables })
    expect(r.text, 'logged as "Old Bench Name" with the same exerciseId: 140 kg is the baseline, so 120 kg is no PR').not.toContain('🏆')
  })

  test('MIRROR: history logged BEFORE the library link (no exerciseId on the rows) still matches by name', async ({ page }) => {
    const tables = history([bench(100, { exerciseId: null }), bench(140, { exerciseId: null })])
    const r = await finish(page, { exercises: [EX()], tables })
    expect(r.text).not.toContain('🏆')
  })

  test('no false PRs while the baseline loads: the immediate render celebrates nothing', async ({ page }) => {
    const r = await finish(page, { exercises: [EX(), EX({ name: 'Cap Squat', exerciseId: 'ex-squat' })], tables: longHistory() })
    expect(r.first, 'nothing is known yet, so nothing is a PR').not.toContain('🏆')
  })

  test('a baseline that cannot be read shows NO PR, not a PR for every lift', async ({ page }) => {
    const r = await finish(page, { exercises: [EX(), EX({ name: 'Cap Squat', exerciseId: 'ex-squat' })],
      tables: { workout_log_exercises: { error: { code: 'XX000', message: 'boom' } }, workout_log_sets: { error: { code: 'XX000', message: 'boom' } } }, expectOk: false })
    expect(r.text, 'a failed lookup must never read as "you have no history, so everything is a record"').not.toContain('🏆')
  })

  test('MIRROR: with no history at all, the first ever log of a lift still counts as a PR (behaviour unchanged)', async ({ page }) => {
    const r = await finish(page, { exercises: [EX()], tables: history([]) })
    expect([r.headerPrs, r.chips]).toEqual(['1', 1])
  })

  test('the header count and the per-exercise chips come from one rule', async ({ page }) => {
    const tables = history([bench(100), bench(140), { name: 'Cap Squat', exerciseId: 'ex-squat', kg: 100 }])
    const r = await finish(page, { exercises: [EX(), EX({ name: 'Cap Squat', exerciseId: 'ex-squat', loggedSets: [{ weight: '110', reps: '5' }] })], tables })
    expect.soft(r.headerPrs, 'squat 110 > 100 is a PR; bench 120 < 140 is not').toBe('1')
    expect(r.chips).toBe(1)
  })

  test('a lb preference does not change the verdict — the comparison stays in kilograms', async ({ page }) => {
    const tables = history([bench(100), bench(140)])
    const under = await finish(page, { exercises: [EX()], tables, lb: true })
    expect.soft(under.text, '120 kg vs 140 kg: no PR in lb mode either').not.toContain('🏆')
    const over = await finish(page, { exercises: [EX({ loggedSets: [{ weight: '145', reps: '3' }] })], tables, lb: true })
    expect(over.headerPrs).toBe('1')
  })

  test('MIRROR: bodyweight sets and cardio never get a PR', async ({ page }) => {
    const r = await finish(page, {
      exercises: [EX({ name: 'Cap Pull-up', exerciseId: null, loggedSets: [{ weight: 'BW', reps: '8' }] }), EX({ name: 'Cap Row', type: 'cardio', metricType: 'cardio', loggedSets: [{ duration: '10:00', distance: '2' }] })],
      tables: history([]) })
    expect(r.text).not.toContain('🏆')
  })

  test('notes and the session name typed while the baseline loads survive the repaint that shows a real PR', async ({ page }) => {
    // 150 kg beats 140 kg, so the screen DOES repaint (a chip appears) — the case where typed values could be lost.
    const r = await finish(page, { exercises: [EX({ loggedSets: [{ weight: '150', reps: '3' }] })], tables: history([bench(100), bench(140)]), typeDuring: true })
    expect.soft(r.chips, 'the repaint happened: the PR chip is there').toBe(1)
    expect.soft(r.notes, 'the notes the athlete was typing').toBe('felt strong')
    expect(r.name, 'and the session name').toBe('My renamed session')
  })

  test('when nothing changes the screen is NOT repainted: the form keeps its focus, caret and scroll', async ({ page }) => {
    // 120 kg is no PR against 140 kg, so the finished screen is identical to the first one — repainting it would only
    // drop a phone keyboard and reset the scroll, on every finish, for nothing.
    const r = await finish(page, { exercises: [EX()], tables: history([bench(100), bench(140)]) })
    expect(r.sameNotesNode, 'the very same notes field is still on screen').toBe(true)
  })

  test('a save that is already under way is never clobbered by the baseline arriving (no second, enabled Save button)', async ({ page }) => {
    const r = await finish(page, { exercises: [EX({ loggedSets: [{ weight: '150', reps: '3' }] })], tables: history([bench(100), bench(140)]), savingDuring: true })
    expect.soft(r.sameSaveNode, 'the Save button is the one saveRunnerSession disabled, not a fresh enabled copy').toBe(true)
    expect.soft(r.saveDisabled).toBe(true)
    expect(r.saveText).toBe('Saving…')
  })

  test('two lifts with the SAME name but different library ids each use their own baseline', async ({ page }) => {
    // A's history was logged under an old name (found only through its id: 140 kg); B's under this name (100 kg).
    // Keyed by name they would overwrite each other and both would get the same verdict.
    const tables = history([{ name: 'Old A Name', exerciseId: 'ex-a', kg: 140 }, { name: 'Cap Bench', exerciseId: 'ex-b', kg: 100 }])
    const r = await finish(page, { exercises: [EX({ exerciseId: 'ex-a' }), EX({ exerciseId: 'ex-b' })], tables })
    expect.soft(r.headerPrs, '120 kg beats B\'s 100 kg but not A\'s 140 kg').toBe('1')
    expect(r.chips).toBe(1)
  })

  test('MIRROR: matching the heaviest weight again is not a PR (a repeated lift, including a lb weight converted to kg)', async ({ page }) => {
    const tables = history([bench(100), bench(140)])
    const same = await finish(page, { exercises: [EX({ loggedSets: [{ weight: '140', reps: '3' }] })], tables })
    expect.soft(same.text, 'equal is not a PR').not.toContain('🏆')
    // 135 lb, unrounded — measured on the live database: weight_kg round-trips it EXACTLY, so a repeat compares equal.
    const lbKg = 135 / 2.2046226218
    const lb = await finish(page, { exercises: [EX({ loggedSets: [{ weight: String(lbKg), reps: '5' }] })], tables: history([bench(lbKg)]), lb: true })
    expect(lb.text, 'a repeated 135 lb is not a PR').not.toContain('🏆')
  })

  test('sets with no weight (bodyweight rows are saved with a NULL weight_kg) never mask the real heaviest', async ({ page }) => {
    // Descending order puts NULLs FIRST, so without `weight_kg IS NOT NULL` the top row would be a NULL and the baseline 0.
    const tables = history([bench(100), bench(140), bench(null), bench(null)])
    const r = await finish(page, { exercises: [EX()], tables })
    expect(r.text, '120 kg is still below the 140 kg lifted').not.toContain('🏆')
  })

  test('with no client id there is no lookup and no PR (the screen claims nothing it cannot check)', async ({ page }) => {
    const r = await finish(page, { exercises: [EX()], tables: history([]), clientId: null })
    expect.soft(r.text).not.toContain('🏆')
    expect(r.calls, 'nothing was asked of the database').toEqual([])
  })

  test('MIRROR: a hostile exercise name is text on the finish screen, never markup', async ({ page }) => {
    const r = await finish(page, { exercises: [EX({ name: '<img src=x onerror="window.__xss=1">' })], tables: history([]) })
    expect([r.imgs, r.xss]).toEqual([0, false])
  })
})

// ─── the same query against the REAL database ───────────────────────────────────────────────────────────
// Own tagged fixture, rowcount-checked cleanup. This is the proof the stand-in cannot give: that PostgREST accepts a
// two-level `!inner` embed with a dotted filter, orders by weight and returns the true maximum.
test.describe('the PR baseline against the real database', () => {
  const TAG = '[E2E-PRB]'
  const sweep = (page) => page.evaluate(async (TAG) => {
    const { data: logs, error: e0 } = await db.from('workout_logs').select('id').like('name', TAG + '%')
    if (e0) throw e0
    const ids = (logs || []).map(l => l.id)
    if (!ids.length) return { logs: 0, exs: 0, sets: 0 }
    const { data: exs } = await db.from('workout_log_exercises').select('id').in('log_id', ids)
    const exIds = (exs || []).map(e => e.id)
    const { data: sets } = exIds.length ? await db.from('workout_log_sets').delete().in('workout_log_exercise_id', exIds).select('id') : { data: [] }
    const { data: dExs } = await db.from('workout_log_exercises').delete().in('log_id', ids).select('id')
    const { data: dLogs } = await db.from('workout_logs').delete().in('id', ids).select('id')
    return { logs: dLogs.length, exs: dExs.length, sets: sets.length }
  }, TAG)

  test.beforeEach(async ({ page }) => { await loginAsPT(page); await sweep(page) })
  test.afterEach(async ({ page }) => { await sweep(page) })

  test('_prBaseline returns the true heaviest set — by name, by library id, and by both — and 0 when there is none', async ({ page }) => {
    const r = await page.evaluate(async ({ TAG }) => {
      const { data: client } = await db.from('clients').select('id').eq('coach_id', currentUser.id).limit(1)
      const clientId = client?.[0]?.id
      // A library exercise this client has never logged, so only the fixture rows match its id. Checked one id at a time
      // (a read of "every used id" would itself be an unordered read capped at 200 rows — the bug under test).
      const { data: lib } = await db.from('exercises').select('id').limit(60)
      let libId = null
      for (const c of lib || []) {
        const { data: hit } = await db.from('workout_log_exercises').select('id').eq('exercise_id', c.id).limit(1)
        if (!hit?.length) { libId = c.id; break }
      }
      // Another client of this coach: the coach can SEE both, so only the client filter keeps their history apart.
      const { data: mine } = await db.from('clients').select('id').eq('coach_id', currentUser.id)
      const otherClientId = (mine || []).find(c => c.id !== clientId)?.id || '00000000-0000-4000-8000-000000000000'
      if (!clientId || !libId) return { skip: 'no coached client or no unused library exercise' }

      const mkLog = async (name, date) => (await db.from('workout_logs').insert({ coach_id: currentUser.id, client_id: clientId, name: TAG + ' ' + name, date }).select('id').single()).data.id
      const mkEx = async (logId, exName, exerciseId) => (await db.from('workout_log_exercises').insert({ log_id: logId, exercise_id: exerciseId, exercise_name: exName, exercise_type: 'strength', order_index: 0 }).select('id').single()).data.id
      const mkSets = (exId, kgs) => db.from('workout_log_sets').insert(kgs.map((kg, i) => ({ workout_log_exercise_id: exId, set_number: i + 1, reps_achieved: 5, weight_kg: kg })))
      // Session A: the library exercise under an OLD name (100, 130). Session B: the same lift logged before the library
      // link existed — no id, the current name (90, 140).
      const a = await mkLog('A', '2026-01-01'); await mkSets(await mkEx(a, TAG + ' Old Name', libId), [100, 130])
      const b = await mkLog('B', '2026-01-08'); await mkSets(await mkEx(b, TAG + ' Bench', null), [90, 140])
      return {
        both: await _prBaseline(clientId, { name: TAG + ' Bench', exerciseId: libId }),
        nameOnly: await _prBaseline(clientId, { name: TAG + ' Bench', exerciseId: null }),
        idOnly: await _prBaseline(clientId, { name: TAG + ' Renamed', exerciseId: libId }),
        none: await _prBaseline(clientId, { name: TAG + ' Nothing', exerciseId: null }),
        // The same lift asked about for ANOTHER client (or a client id that does not exist): must find nothing. Dropping the
        // client filter, or the inner join at the second level of the embed, returns 140 here.
        otherClient: await _prBaseline(otherClientId, { name: TAG + ' Bench', exerciseId: libId }),
      }
    }, { TAG })
    expect(r.skip, r.skip).toBeUndefined()
    expect(r, 'name and id together take the heavier (140); the id alone finds the renamed lift (130); nothing found is 0; another client\'s history is invisible').toEqual({ both: 140, nameOnly: 140, idOnly: 130, none: 0, otherClient: 0 })
    expect(await sweep(page), 'the cleanup removed exactly the 2 logs, 2 exercises and 4 sets this test made').toEqual({ logs: 2, exs: 2, sets: 4 })
  })

  // The solo view shares the coach's user id and the same workout_logs policy, but it is a different session context: prove
  // the query RUNS there (no policy error) rather than assume it. The solo record has no logged lifts, so the answer is 0.
  test('the same query runs under the solo view without error', async ({ page }) => {
    await page.evaluate(() => switchView('solo'))
    await expect.poll(() => page.evaluate(() => !!window._soloClientId)).toBe(true)
    const r = await page.evaluate(async ({ TAG }) => _prBaseline(window._soloClientId, { name: TAG + ' Nothing', exerciseId: null }), { TAG })
    expect(r).toBe(0)
  })
})
