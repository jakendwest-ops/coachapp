// Per program sub-tab (2026-08-16). Jake: "there will be scenarios where I want to see my exercise
// progress over the duration of a program length."
//
// The load-bearing thing to test is the WINDOW. A workout log has no programme reference, so a block
// is a date range and nothing more — the boundary behaviour IS the feature.
const { test, expect } = require('./fixtures')
const { loginAsClient } = require('./helpers')

const RUN = Date.now()

test.describe('Per program', () => {
  test('all three sub-tabs are present and Per program is reachable', async ({ page }) => {
    await loginAsClient(page)
    const tabs = await page.evaluate(async () => {
      window._progressTab = 'Performance'; window._perfTab = 'Per program'
      await renderProgress(document.getElementById('main-content'))
      await new Promise(r => setTimeout(r, 2500))
      return [...document.querySelectorAll('#progress-tab-content button')].map(b => b.textContent.trim()).filter(t => t.startsWith('Per '))
    })
    expect(tabs).toEqual(['Per exercise', 'Per session', 'Per program'])
  })

  // ─── The window boundary: the whole feature in one test ───────────────────
  test('window INCLUDES the first and last day and EXCLUDES the day either side', async ({ page }) => {
    await loginAsClient(page)
    const r = await page.evaluate(() => {
      const block = { start: '2026-03-02', end: '2026-03-29' }
      const pts = [
        { date: '2026-03-01' },  // day before  → out
        { date: '2026-03-02' },  // first day   → IN
        { date: '2026-03-15' },  // middle      → IN
        { date: '2026-03-29' },  // last day    → IN
        { date: '2026-03-30' },  // day after   → out
      ]
      return _ptsInBlock(pts, block).map(p => p.date)   // the shipped function, not a copy of it
    })
    expect(r).toEqual(['2026-03-02', '2026-03-15', '2026-03-29'])
  })

  // These dates are deliberately in BRITISH SUMMER TIME. The first cut of this spec used March
  // fixtures, which are GMT — the one window of the year where a UTC-vs-local bug is invisible. Two
  // real date bugs shipped green underneath it. Same shape as the kg/lb blind spot: the fixture was
  // pinned to the value that cannot fail.
  test('block start snaps to the Monday of the start week — in BST, not just GMT', async ({ page }) => {
    await loginAsClient(page)
    const r = await page.evaluate(() => {
      const f = d => ({ in: d, start: _ymdLocal(_mondayOfWeek(d)) })
      return [
        f('2026-03-05'),  // Thu, GMT
        f('2026-07-15'),  // Wed, BST  <- toISOString() returned the Sunday here
        f('2026-08-16'),  // Sun, BST  <- Sunday belongs to the week that STARTED on the 10th
      ]
    })
    expect(r[0].start).toBe('2026-03-02')
    expect(r[1].start).toBe('2026-07-13')   // must be a MONDAY, not 2026-07-12
    expect(r[2].start).toBe('2026-08-10')
  })

  test('_loadProgramBlocks itself emits Monday starts (not just the helper in isolation)', async ({ page }) => {
    await loginAsClient(page)
    // The helper being right does not mean the caller serialises it right — that was exactly the bug.
    const bad = await page.evaluate(async () => {
      const blocks = await _loadProgramBlocks(await _getCurrentClientId())
      if (!blocks) return ['fetch failed']
      return blocks
        .filter(b => new Date(b.start + 'T12:00:00').getDay() !== 1)
        .map(b => `${b.name}: ${b.start} is not a Monday`)
    })
    expect(bad).toEqual([])
  })

  test('week buckets are correct, including ACROSS the spring-forward DST change', async ({ page }) => {
    await loginAsClient(page)
    const r = await page.evaluate(() => {
      const plain = { start: '2026-03-02' }                       // wholly inside GMT
      const dst   = { start: '2026-03-23' }                       // BST begins Sun 2026-03-29
      return {
        plain: ['2026-03-02', '2026-03-08', '2026-03-09', '2026-03-23'].map(d => _blockWeekIndex(plain, d)),
        dst:   ['2026-03-23', '2026-03-29', '2026-03-30', '2026-04-06', '2026-04-13'].map(d => _blockWeekIndex(dst, d)),
      }
    })
    expect(r.plain).toEqual([1, 1, 2, 4])       // Mon+Sun = wk1, next Mon = wk2, three weeks on = wk4
    // Millisecond division reported [1,1,1,2,3] here — week 1 swallowed 13 days and every later
    // week slid down one, so two blocks either side of the change had incompatible axes.
    expect(r.dst).toEqual([1, 1, 2, 3, 4])
  })

  test('names with quotes/backslashes round-trip through the REAL option builders', async ({ page }) => {
    await loginAsClient(page)
    const r = await page.evaluate(() => {
      // Calls the shipped _exerciseOptionsHtml / _blockOptionHtml, then reads the value back off a
      // really-parsed <option> — the browser's own attribute decoding is the step that keeps the
      // stray backslash, so re-typing the markup in the test would prove nothing.
      const names = ["Farmer's Walk", 'Back "Squat"', 'A\\B', 'Plain Row']
      const host = document.createElement('div')
      host.innerHTML = `<select>${_exerciseOptionsHtml(names, names[0])}</select>`
      const opts = [...host.querySelectorAll('option')]

      const block = { key: 'past:abc', name: "Jake's Block", start: '2026-07-13', end: '2026-08-10', open: false }
      const host2 = document.createElement('div')
      host2.innerHTML = `<select>${_blockOptionHtml(block, 'past:abc')}</select>`
      const bOpt = host2.querySelector('option')

      return {
        values: opts.map(o => o.value), names,
        selectedIsFirst: opts[0].selected,
        blockSelected: bOpt.selected, blockLabel: bOpt.textContent,
      }
    })
    // escapeAttr yielded "Farmer\'s Walk", which then failed `e.name === st.ex` in
    // _renderBlockComparison and rendered "No sessions logged yet" for an exercise that HAS
    // sessions — silently, because the option's visible LABEL still read correctly.
    expect(r.values).toEqual(r.names)
    expect(r.selectedIsFirst, 'the pre-selected exercise must be marked selected').toBe(true)
    expect(r.blockSelected, 'the pre-selected block must be marked selected').toBe(true)
    expect(r.blockLabel).toContain("Jake's Block")
  })

  test('turning comparison off stays off across a re-render', async ({ page }) => {
    await loginAsClient(page)
    const r = await page.evaluate(async () => {
      // TWO blocks are required for this to discriminate at all: with one block `blocks[1]?.key || ''`
      // yields '' anyway, so a broken guard looks identical to a working one. The account under test
      // has one block today, so stub the loader rather than borrow whatever data happens to exist.
      const orig = _loadProgramBlocks
      window._loadProgramBlocks = async () => ([
        { key: 'past:aaa', name: 'Block A', start: '2026-05-04', end: '2026-06-28', weeks: 8, open: false },
        { key: 'past:bbb', name: 'Block B', start: '2026-03-02', end: '2026-04-26', weeks: 8, open: false },
      ])
      const el = document.createElement('div'); document.body.appendChild(el)
      try {
        const clientId = await _getCurrentClientId()
        await renderProgressPerProgram(clientId, el)
        const autoPicked = window._blockState.b     // with two blocks, defaults to the second
        window._blockState.b = ''                   // what the "Compare with…" option sets
        await renderProgressPerProgram(clientId, el)
        return { autoPicked, afterRerender: window._blockState.b }
      } finally { window._loadProgramBlocks = orig; el.remove() }
    })
    expect(r.autoPicked, 'with two blocks the second should be pre-selected').toBe('past:bbb')
    expect(r.afterRerender, 'an explicit "no comparison" choice must not be silently reinstated').toBe('')
  })

  test('a zero value is kept, not dropped as falsy (bodyweight sets)', async ({ page }) => {
    await loginAsClient(page)
    const r = await page.evaluate(() => {
      const u = _usableMetricValue
      return { zero: u(0), nul: u(null), undef: u(undefined), num: u(42) }
    })
    expect(r).toEqual({ zero: true, nul: false, undef: false, num: true })
  })

  test('a failed block fetch shows an error, NOT "no programmes"', async ({ page }) => {
    await loginAsClient(page)
    const r = await page.evaluate(async () => {
      const orig = db.from.bind(db)
      db.from = (tbl) => tbl === 'client_program_blocks'
        ? { select: () => ({ eq: async () => ({ data: null, error: { message: 'boom' } }) }) }
        : orig(tbl)
      const el = document.createElement('div')
      try { await renderProgressPerProgram(await _getCurrentClientId(), el) } finally { db.from = orig }
      return el.innerText
    })
    // A null return must not be mistaken for an empty list — that would tell Jake he has no
    // programmes when in fact the read failed.
    expect(r).toContain("Couldn't load")
    expect(r).not.toContain('No programme with a start date')
  })

  test('kg and lb both render the tab without throwing', async ({ page }) => {
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await loginAsClient(page)
    for (const unit of ['kg', 'lb']) {
      const txt = await page.evaluate(async (u) => {
        window._unitPrefs = { ...window._unitPrefs, weight: u }
        window._progressTab = 'Performance'; window._perfTab = 'Per program'
        await renderProgress(document.getElementById('main-content'))
        await new Promise(r => setTimeout(r, 2500))
        return document.getElementById('progress-tab-content')?.innerText || ''
      }, unit)
      expect(txt, `${unit} rendered something`).not.toBe('')
    }
    expect(errors, 'no uncaught page errors in either unit').toEqual([])
  })
})
