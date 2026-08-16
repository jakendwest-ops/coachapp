// The two-block journey, end to end (2026-08-16).
//
// Jake's scenario, as a signed-up user: build a 3-day Mon/Wed/Fri programme containing squat, bench,
// deadlift, pull-up and dip; four weeks; complete it; then DO THE SAME FOUR WEEKS AGAIN and compare
// the two runs on the Per program tab.
//
// It exposed three defects that only appear on this exact shape of data, and all three are asserted
// here rather than in isolation, because each of them looked fine on the single-block data the tab
// shipped against:
//
//   A  Two of the five lifts are BODYWEIGHT. A bodyweight set never writes weight_kg
//      (app-runner.js:2419) and num() maps that NULL to 0, so top weight / est 1RM / volume /
//      intensity are ALL zero for every pull-up and dip session — a flat line at zero, reported as
//      a green ▲ 0%. Their real progress (reps) was recorded and never plotted.
//   B  ended_at is the day RESTART WAS PRESSED, not the day the last week finished. With an
//      inclusive window, restarting on the Monday you begin run 2 put that session in BOTH blocks
//      and gave a four-week block a WEEK 5 built from run 2's data.
//   C  The tab was locked to one metric with no way to switch.
//
// Fixtures are built through the data layer, not the UI: driving 24 sessions through the runner
// would be slow and fragile, and the runner has its own coverage.
//
// ⚠️ THIS TEST DELIBERATELY DOES NOT PERFORM A REAL RESTART. client_program_blocks is append-only by
// design — scripts/add-program-blocks-2026-08-15.sql grants SELECT and INSERT only, with no DELETE
// policy and no DELETE grant, so a block written by a test CANNOT be cleaned up and would sit in the
// real account's block picker forever. The first draft of this file did exactly that and left two
// junk rows behind. The restart → archive path already has its own coverage in
// tests/program-blocks-2026-08-15.spec.js; here the two blocks are stubbed, which is honest because
// a block IS only a date range (workout_logs carries no programme reference).
//
// Everything else is real: real workout_logs / exercises / sets, read back through the real
// _buildExerciseSeries, _metricPointsFor, _ptsInBlock and _blockWeekIndex. Every fixture this file
// creates, it deletes. Nothing borrows "whatever is first".
const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

const TAG = '[E2E-2BJ]'
const LIFTS = [
  { name: `${TAG} Back Squat`, bw: false, base: 100, step: 5 },
  { name: `${TAG} Bench Press`, bw: false, base: 60, step: 2.5 },
  { name: `${TAG} Deadlift`, bw: false, base: 120, step: 5 },
  { name: `${TAG} Pull Up`, bw: true, base: 5, step: 1 },
  { name: `${TAG} Dip`, bw: true, base: 8, step: 1 },
]

// Two consecutive 4-week runs on known Mondays, deliberately in BST — March is GMT, and pinning date
// fixtures to GMT is precisely how two UTC bugs shipped green last commit.
const RUN1_START = '2026-06-01'   // Monday
const RUN2_START = '2026-06-29'   // Monday, exactly 4 weeks later — and the day restart is pressed
const DAY_OFFSETS = [0, 2, 4]     // Mon, Wed, Fri

const sessionDates = (startMonday) => {
  const out = []
  for (let w = 0; w < 4; w++) {
    for (const d of DAY_OFFSETS) {
      const dt = new Date(startMonday + 'T12:00:00')
      dt.setDate(dt.getDate() + w * 7 + d)
      out.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`)
    }
  }
  return out
}

async function buildJourney(page) {
  return page.evaluate(async ({ TAG, LIFTS, RUN1_START, RUN2_START, run1Dates, run2Dates }) => {
    // The SOLO record, deliberately. This journey is a signed-up user training themselves, and
    // _getCurrentClientId() on a PT login resolves a COACHED record (coach_id IS NOT NULL) that a
    // test PT account does not have — it returns null and silently skips the whole test.
    // Established pattern: read _soloClientId and skip explicitly if the account has none.
    const clientId = window._soloClientId
    if (!clientId) return { skip: 'no solo client record on this account' }
    // Solo's clients.coach_id is NULL by definition, so the log's coach_id is the user's own uid.
    const { data: cRow } = await db.from('clients').select('coach_id').eq('id', clientId).maybeSingle()
    const coachId = cRow?.coach_id || currentUser.id
    const isPersonal = true

    // ── the programme: 1 phase × 4 weeks, sessions on day_of_week 1/3/5 (Mon/Wed/Fri, 1-based) ──
    const { data: prog } = await db.from('programs')
      .insert({ coach_id: currentUser.id, is_personal: isPersonal, name: `${TAG} 3-Day Full Body` }).select('id').single()
    const { data: phase } = await db.from('program_phases')
      .insert({ program_id: prog.id, name: 'Block', duration_weeks: 4, order_index: 0 }).select('id').single()

    const { data: tmpl } = await db.from('workout_templates')
      .insert({ coach_id: currentUser.id, program_id: prog.id, client_id: null, is_personal: isPersonal, name: `${TAG} Full Body` }).select('id').single()
    await db.from('workout_template_exercises').insert(LIFTS.map((l, i) => ({
      template_id: tmpl.id, exercise_name: l.name, exercise_type: 'strength', metric_type: 'weight_reps',
      order_index: i,
      // bodyweight is a per-SET flag, not a metric type — this is what makes weight_kg stay NULL.
      sets_json: [{ repsMin: '5', repsMax: '8', ...(l.bw ? { bodyweight: true } : {}) }],
    })))

    const days = [[1, 'Monday'], [3, 'Wednesday'], [5, 'Friday']]
    const ppwIds = []
    for (let i = 0; i < days.length; i++) {
      const { data: ppw } = await db.from('program_phase_workouts')
        .insert({ phase_id: phase.id, day_of_week: days[i][0], day_label: days[i][1], session_order: 1, template_id: tmpl.id, week_number: 1 })
        .select('id').single()
      ppwIds.push(ppw.id)
    }

    // ── run 1: assign, then log 12 sessions ──
    const { data: cp1, error: cp1Err } = await db.from('client_programs')
      .insert({ client_id: clientId, program_id: prog.id, start_date: RUN1_START }).select('id').single()
    if (cp1Err) return { err: 'assign run 1: ' + cp1Err.message }

    const logSession = async (date, weekIdx) => {
      const { data: log, error: lErr } = await db.from('workout_logs')
        .insert({ coach_id: coachId, client_id: clientId, name: `${TAG} Full Body`, date }).select('id').single()
      if (lErr) throw new Error('log: ' + lErr.message)
      for (let i = 0; i < LIFTS.length; i++) {
        const l = LIFTS[i]
        const { data: ex, error: eErr } = await db.from('workout_log_exercises')
          .insert({ log_id: log.id, exercise_name: l.name, exercise_type: 'strength', metric_type: 'weight_reps', order_index: i })
          .select('id').single()
        if (eErr) throw new Error('ex: ' + eErr.message)
        // Barbell lifts climb in WEIGHT; bodyweight lifts climb in REPS with weight_kg left NULL —
        // exactly what the runner writes for a BW set.
        const row = { workout_log_exercise_id: ex.id, set_number: 1 }
        if (l.bw) row.reps_achieved = l.base + l.step * weekIdx
        else { row.weight_kg = l.base + l.step * weekIdx; row.reps_achieved = 5 }
        const { error: sErr } = await db.from('workout_log_sets').insert(row)
        if (sErr) throw new Error('set: ' + sErr.message)
      }
      return log.id
    }

    const logIds = []
    for (let i = 0; i < run1Dates.length; i++) logIds.push(await logSession(run1Dates[i], Math.floor(i / 3)))

    return { clientId, programId: prog.id, templateId: tmpl.id, clientProgramId: cp1.id, logIds, phaseId: phase.id, ppwIds }
  }, { TAG, LIFTS, RUN1_START, RUN2_START, run1Dates: sessionDates(RUN1_START), run2Dates: sessionDates(RUN2_START) })
}

async function cleanup(page, fx) {
  if (!fx?.programId) return
  await page.evaluate(async ({ fx, TAG }) => {
    for (const id of fx.logIds || []) await db.from('workout_logs').delete().eq('id', id)
    // No client_program_blocks cleanup: the table is append-only (no DELETE grant), which is exactly
    // why this spec stubs its blocks instead of creating them. See the file header.
    await db.from('client_programs').delete().eq('client_id', fx.clientId).eq('program_id', fx.programId)
    await db.from('workout_templates').delete().ilike('name', `${TAG}%`)
    await db.from('programs').delete().eq('id', fx.programId)
  }, { fx, TAG }).catch(() => {})
}

test.describe('Two-block journey — 4 weeks, restart, 4 weeks again', () => {
  test.setTimeout(180000)

  test('the whole journey: two blocks, no double-count, bodyweight lifts chart reps', async ({ page }) => {
    await loginAsPT(page)
    let fx = null
    try {
      fx = await buildJourney(page)
      test.skip(!!fx.skip, fx.skip)
      expect(fx.err, 'fixture build failed').toBeUndefined()

      // ── run 2: 12 more sessions, at higher numbers ──
      const run2 = sessionDates(RUN2_START)
      const more = await page.evaluate(async ({ TAG, LIFTS, dates, clientId }) => {
        const { data: cRow } = await db.from('clients').select('coach_id').eq('id', clientId).maybeSingle()
        const coachId = cRow?.coach_id || currentUser.id
        const ids = []
        for (let i = 0; i < dates.length; i++) {
          const weekIdx = Math.floor(i / 3)
          const { data: log } = await db.from('workout_logs')
            .insert({ coach_id: coachId, client_id: clientId, name: `${TAG} Full Body`, date: dates[i] }).select('id').single()
          ids.push(log.id)
          for (let k = 0; k < LIFTS.length; k++) {
            const l = LIFTS[k]
            const { data: ex } = await db.from('workout_log_exercises')
              .insert({ log_id: log.id, exercise_name: l.name, exercise_type: 'strength', metric_type: 'weight_reps', order_index: k })
              .select('id').single()
            const row = { workout_log_exercise_id: ex.id, set_number: 1 }
            // Run 2 starts where run 1 finished and climbs again — so block 2 must sit ABOVE block 1.
            if (l.bw) row.reps_achieved = l.base + l.step * (4 + weekIdx)
            else { row.weight_kg = l.base + l.step * (4 + weekIdx); row.reps_achieved = 5 }
            await db.from('workout_log_sets').insert(row)
          }
        }
        return ids
      }, { TAG, LIFTS, dates: run2, clientId: fx.clientId })
      fx.logIds = [...fx.logIds, ...more]

      // ── THE ASSERTIONS: everything below goes through the SHIPPED functions ──
      const result = await page.evaluate(async ({ clientId, TAG, RUN1_START, RUN2_START }) => {
        // The two blocks EXACTLY as a real restart would have produced them: run 1 archived with
        // ended_at = the day restart was pressed (= the Monday run 2 begins, the natural sequence),
        // and run 2 still open. Stubbed rather than written, because client_program_blocks cannot be
        // deleted afterwards — see the file header.
        // Run through the REAL _clampBlockChain, which is what resolves the restart-day overlap —
        // stubbing the windows post-clamp would assert nothing.
        const mine = _clampBlockChain([
          { key: 'live:run2', progKey: 'P', name: `${TAG} 3-Day Full Body`, start: RUN2_START, end: '2026-12-31', weeks: 4, open: true },
          { key: 'past:run1', progKey: 'P', name: `${TAG} 3-Day Full Body`, start: RUN1_START, end: RUN2_START, weeks: 4, open: false },
        ])
        const series = await _buildExerciseSeries(clientId)
        const read = (exName) => {
          const ex = series.find(e => e.name === exName)
          if (!ex) return null
          const pts = _metricPointsFor(ex).points
          return mine.map(b => {
            const inB = _ptsInBlock(pts, b)
            return {
              block: b.name, start: b.start, open: b.open,
              dates: inB.map(p => p.date),
              weeks: inB.map(p => _blockWeekIndex(b, p.date)),
              topWeight: inB.map(p => p.topWeight),
              reps: inB.map(p => p.reps),
            }
          })
        }
        return {
          starts: mine.map(b => ({ start: b.start, dow: new Date(b.start + 'T12:00:00').getDay(), open: b.open })),
          squat: read(`${TAG} Back Squat`),
          pullup: read(`${TAG} Pull Up`),
        }
      }, { clientId: fx.clientId, TAG, RUN1_START, RUN2_START })

      // 1. Both block windows start on a Monday — the rule the calendar lays sessions out by.
      for (const s of result.starts) expect(s.dow, `block start ${s.start} must be a Monday`).toBe(1)

      // 2. NO SESSION IN BOTH BLOCKS. This is the B fix — with an inclusive end, 2026-06-29 landed in
      //    both windows. 24 sessions logged, so the two blocks must partition them exactly.
      const squatDates = result.squat.flatMap(b => b.dates)
      expect(squatDates.length, 'all 24 sessions accounted for, none twice').toBe(24)
      expect(new Set(squatDates).size, 'no session may appear in both blocks').toBe(24)

      // 3. NO WEEK 5 in a four-week block. The spurious wk5 was run 2's first session leaking back.
      for (const b of result.squat) {
        expect(Math.max(...b.weeks), `${b.block} (${b.start}) must not exceed week 4`).toBeLessThanOrEqual(4)
        expect(b.dates.length, 'each block holds its own 12 sessions').toBe(12)
      }

      // 4. Squat climbs, and block 2 sits above block 1.
      const [newer, older] = result.squat   // _loadProgramBlocks sorts start DESC
      expect(Math.max(...newer.topWeight)).toBeGreaterThan(Math.max(...older.topWeight))

      // 5. Pull-up: weight is NULL for every set, so topWeight is 0 throughout — the flat line. Reps
      //    are the real signal, and must be present and rising.
      for (const b of result.pullup) {
        expect(Math.max(...b.topWeight), 'a bodyweight lift has no weight to chart').toBe(0)
        expect(Math.min(...b.reps), 'reps must be captured as a metric').toBeGreaterThan(0)
      }
      const [pNewer, pOlder] = result.pullup
      expect(Math.max(...pNewer.reps), 'run 2 pull-ups must beat run 1').toBeGreaterThan(Math.max(...pOlder.reps))
    } finally {
      await cleanup(page, fx)
    }
  })

  test('a bodyweight lift opens on Total reps, not a flat zero Top weight', async ({ page }) => {
    await loginAsPT(page)
    // Unit-level and deterministic — it does not depend on the 24-session fixture existing.
    const r = await page.evaluate(() => {
      const metrics = _TREND_METRICS.weight_reps
      const bwPts = [{ date: '2026-06-01', topWeight: 0, e1rm: 0, volume: 0, intensity: 0, reps: 15 },
                     { date: '2026-06-08', topWeight: 0, e1rm: 0, volume: 0, intensity: 0, reps: 21 }]
      const barPts = [{ date: '2026-06-01', topWeight: 100, e1rm: 112, volume: 500, intensity: 100, reps: 5 }]
      // The exact predicate _renderBlockComparison uses to choose its metric.
      const pick = pts => (_metricsWithData(metrics, pts)[0] || metrics[0])[0]   // the shipped predicate
      return { bodyweight: pick(bwPts), barbell: pick(barPts), hasReps: metrics.some(m => m[0] === 'reps') }
    })
    expect(r.hasReps, 'weight_reps must expose a reps metric').toBe(true)
    expect(r.bodyweight, 'an all-bodyweight exercise must chart reps').toBe('reps')
    expect(r.barbell, 'a barbell lift must still open on top weight').toBe('topWeight')
  })

  test('a flat result shows a neutral dash, never a green ▲', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      // The SHIPPED function, not a copy of it.
      const judge = (a, b, lower = false) => { const r = _deltaBadge(a, b, lower); return { arrow: r.arrow, green: r.green } }
      return { flat: judge(0, 0), up: judge(100, 120), down: judge(120, 100), paceImproved: judge(300, 280, true) }
    })
    expect(r.flat, 'no change is not an improvement').toEqual({ arrow: '–', green: false })
    expect(r.up).toEqual({ arrow: '▲', green: true })
    expect(r.down).toEqual({ arrow: '▼', green: false })
    expect(r.paceImproved, 'a faster pace is a lower number').toEqual({ arrow: '▼', green: true })
  })

  // The restart day bears no fixed relation to the next run's start: ended_at is the day the button
  // was pressed, while the next start is snapped back to ITS OWN Monday. The two windows can
  // therefore overlap by up to six days, or leave a gap. A half-open end fixed only the
  // Monday-aligned case and LOST a session outright in the gap case — hence the clamp in
  // _loadProgramBlocks, tested here across all three shapes a restart can take.
  test('a restart chain never overlaps, whatever day the restart lands on', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      const run = (oldEnd, newStartRaw) => {
        const blocks = _clampBlockChain([   // the shipped rule, not a copy of it
          { progKey: 'P', start: '2026-06-01', end: oldEnd, open: false },
          { progKey: 'P', start: _ymdLocal(_mondayOfWeek(newStartRaw)), end: '2026-12-31', open: true },
        ])
        const days = []
        const cur = new Date('2026-06-22T12:00:00'), stop = new Date('2026-07-08T12:00:00')
        while (cur <= stop) { days.push(_ymdLocal(cur)); cur.setDate(cur.getDate() + 1) }
        const pts = days.map(date => ({ date }))
        const inOld = _ptsInBlock(pts, blocks[0]).map(p => p.date)   // the shipped filter
        const inNew = _ptsInBlock(pts, blocks[1]).map(p => p.date)
        return {
          both: inOld.filter(d => inNew.includes(d)),
          restartDayPlaced: inOld.includes(oldEnd) || inNew.includes(oldEnd),
          oldEnd: blocks[0].end, newStart: blocks[1].start,
        }
      }
      return {
        monday:  run('2026-06-29', '2026-06-29'),  // restart lands on the next run's Monday
        gap:     run('2026-07-01', '2026-07-06'),  // restart Wed, next run starts the FOLLOWING Monday
        overlap: run('2026-07-01', '2026-07-01'),  // restart Wed, next run snaps BACK to Mon 29 Jun
      }
    })
    for (const [shape, v] of Object.entries(r)) {
      // THE assertion. Overlap is the actual defect: it double-counts sessions and lets the NEXT
      // run's data appear as extra weeks of the previous block.
      expect(v.both, `${shape}: no session may fall in both blocks`).toEqual([])
      // And the restart day itself must still land somewhere. A half-open end dropped it entirely
      // whenever the next run did not begin on that exact day.
      expect(v.restartDayPlaced, `${shape}: the restart day must not be lost from both blocks`).toBe(true)
    }
    // Only the overlapping shapes get clamped. Deliberately NOT asserting "every day belongs to a
    // block": restarting on 1 July for a programme that starts on the 6th leaves 2–5 July genuinely
    // un-programmed, and days trained past a 4-week block's end are genuinely week 5 OF THAT BLOCK.
    // Both are honest; the bug was only ever week 5 built from the NEXT run's sessions.
    expect(r.monday.oldEnd, 'a same-day restart clamps back to the day before').toBe('2026-06-28')
    expect(r.overlap.oldEnd, 'a back-snapped start clamps the previous block off it').toBe('2026-06-28')
    expect(r.gap.oldEnd, 'a genuine gap is left alone — nothing to clamp').toBe('2026-07-01')
  })

  // The reps metric is appended to _TREND_METRICS.weight_reps, which the PER EXERCISE cards also
  // read — and they filter chips by "any point > 0", not "first with data". So adding it deliberately
  // changes that tab too: every strength card gains a Total reps chip, and a bodyweight exercise that
  // used to render an empty card now renders a real one. That is the intended outcome, but it is a
  // second consumer of a shared table, so it gets an explicit guard rather than shipping silently.
  test('the reps metric reaches the Per exercise chips too, without displacing top weight', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => {
      const metrics = _TREND_METRICS.weight_reps
      const visible = pts => _metricsWithData(metrics, pts).map(([k]) => k)   // the shipped predicate
      const barbell = [{ topWeight: 100, e1rm: 112, volume: 500, intensity: 100, reps: 5 }]
      const bw = [{ topWeight: 0, e1rm: 0, volume: 0, intensity: 0, reps: 15 }]
      const uni = _TREND_METRICS.unilateral
      return { keys: metrics.map(m => m[0]), barbell: visible(barbell), bodyweight: visible(bw),
               repsIsLast: metrics[metrics.length - 1][0] === 'reps',
               uniKeys: uni.map(m => m[0]),
               uniBodyweight: _metricsWithData(uni, [{ topWeight: 0, leftTop: 0, rightTop: 0, reps: 24 }]).map(m => m[0]),
               colour: _METRIC_COLORS.reps }
    })
    expect(r.keys).toEqual(['topWeight', 'e1rm', 'volume', 'intensity', 'reps'])
    // The SIBLING branch. A bodyweight unilateral lift — pistol squat, single-leg calf raise — has
    // exactly the same NULL weight_kg, so fixing weight_reps and not unilateral would leave the
    // identical flat-zero chart one metric_type away. This codebase has shipped the same bug in a
    // sibling function before; that is why this assertion exists.
    expect(r.uniKeys, 'unilateral must expose reps too').toEqual(['topWeight', 'reps'])
    expect(r.uniBodyweight, 'a bodyweight unilateral lift must chart reps, not a flat zero').toEqual(['reps'])
    expect(r.repsIsLast, 'reps must sit LAST so it is only the default when nothing else has data').toBe(true)
    expect(r.barbell[0], 'a barbell card must still open on top weight').toBe('topWeight')
    expect(r.barbell, 'a barbell card gains reps as an extra chip').toContain('reps')
    // Previously this was [] -> _trendCardEmpty, i.e. no card at all for a bodyweight lift.
    expect(r.bodyweight, 'a bodyweight card now has exactly one chip, and it is reps').toEqual(['reps'])
    expect(r.colour, 'the chip needs a colour or it renders as the default accent').toBeTruthy()
  })

  // _clampBlockChain being right does not mean _loadProgramBlocks CALLS it, or derives progKey from
  // the right column. Delete the call and every other clamp test here still passes — the exact
  // "helper right, caller wrong" gap that let the toISOString bug ship green last commit.
  test('_loadProgramBlocks itself applies the clamp and derives progKey', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(async () => {
      const clientId = window._soloClientId
      if (!clientId) return { skip: true }
      // Two runs of ONE programme (same program_id) plus an unrelated programme overlapping both.
      const orig = { from: db.from.bind(db) }
      db.from = (tbl) => {
        if (tbl === 'client_programs') return { select: () => ({ eq: async () => ({ data: [
          { id: 'cp1', program_id: 'PROG-A', start_date: '2026-06-29', created_at: '2026-06-29T00:00:00Z',
            programs: { name: 'Alpha', program_phases: [{ duration_weeks: 4 }] } },
          { id: 'cp2', program_id: 'PROG-B', start_date: '2026-06-01', created_at: '2026-06-01T00:00:00Z',
            programs: { name: 'Beta', program_phases: [{ duration_weeks: 12 }] } },
        ], error: null }) }) }
        if (tbl === 'client_program_blocks') return { select: () => ({ eq: async () => ({ data: [
          { id: 'b1', program_id: 'PROG-A', program_name: 'Alpha', start_date: '2026-06-01',
            assigned_at: '2026-06-01T00:00:00Z', ended_at: '2026-06-29', planned_weeks: 4 },
        ], error: null }) }) }
        return orig.from(tbl)
      }
      try {
        const blocks = await _loadProgramBlocks(clientId)
        return { blocks: blocks.map(b => ({ name: b.name, start: b.start, end: b.end, open: b.open, progKey: b.progKey })) }
      } finally { db.from = orig.from }
    })
    test.skip(!!r.skip, 'no solo client record on this account')

    const alphaOld = r.blocks.find(b => b.name === 'Alpha' && !b.open)
    const alphaNew = r.blocks.find(b => b.name === 'Alpha' && b.open)
    const beta = r.blocks.find(b => b.name === 'Beta')

    // The clamp ran: Alpha's archived run ends the day BEFORE Alpha's new run begins.
    expect(alphaOld.end, 'the caller must apply _clampBlockChain, not just define it').toBe('2026-06-28')
    expect(alphaNew.start).toBe('2026-06-29')
    // progKey came from program_id, so the two Alpha rows were recognised as one chain.
    expect(alphaOld.progKey).toBe('PROG-A')
    expect(alphaNew.progKey).toBe('PROG-A')
    // Beta is a DIFFERENT programme running concurrently — it must NOT be clamped by Alpha. Two
    // programmes assigned at once legitimately overlap; clamping across them would discard sessions.
    expect(beta.end, 'a concurrent different programme must be left alone').not.toBe('2026-06-28')
  })

  test('a zero baseline shows no percentage rather than a false 0%', async ({ page }) => {
    await loginAsPT(page)
    const r = await page.evaluate(() => ({
      fromZero: _deltaBadge(0, 45, false),      // 0 reps -> 45 reps
      normal: _deltaBadge(100, 120, false),
    }))
    // "0 reps → 45 reps ▲ 0%" read as NO progress when it was the opposite.
    expect(r.fromZero.delta, 'a percentage against a zero baseline is meaningless').toBeNull()
    expect(r.fromZero.arrow).toBe('▲')
    expect(r.normal.delta).toBe(20)
  })
})
