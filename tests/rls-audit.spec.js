const { test, expect } = require('./fixtures')
const { loginAsPT, loginAsClient, loginAsPT2 } = require('./helpers')

/**
 * BEHAVIOURAL RLS AUDIT
 * =====================
 * Why this exists: three consecutive sessions (23, 24, 25) each found a REAL RLS gap, and all three
 * were found BY ACCIDENT while building something unrelated:
 *   s23 — client_programs + 3 embedded tables had no client-read policy at all
 *   s24 — workout_template_exercises had ZERO client-read policy; client_1rms no client write policy
 *   s25 — ANY client could read ANY other client's personalised workouts
 * /deploy-check's RLS check would have caught NONE of them: it only greps for `qual = 'true'`
 * (fully-open policies), and every one of these had a normal-looking policy that simply checked the
 * WRONG COLUMN.
 *
 * Reading pg_policies is not enough either — s23 proved a policy can look correct and still break
 * the app, because PostgREST silently returns NULL for an unreadable embed level rather than
 * erroring. So this audit is BEHAVIOURAL: it actually attempts operations and observes.
 *
 * Two failure classes, both real, both represented here:
 *   UNEXPECTED ALLOW = a leak            (s25)
 *   UNEXPECTED DENY  = a silently broken feature (s23, s24)
 */

// Every table the app touches. `logos` is a storage bucket (storage.objects RLS) — covered by
// /deploy-check, not here.
//
// `performance_exercises` is deliberately NOT in this list: it does not exist. The Personal Bests
// page used to embed it (`performance_logs.select('*, performance_exercises(...)')`), which made
// PostgREST reject the whole query — and because the error was discarded, the page silently showed
// "No personal bests logged yet" forever. Every PB anyone logged was saved and then never displayed.
// This audit is what found it (it enumerates the tables the app references, and that one was not
// real). Fixed 2026-07-12 — the columns were on performance_logs all along.
const ALL_TABLES = [
  'clients', 'profiles', 'exercises',
  'workout_templates', 'workout_template_exercises',
  'programs', 'program_phases', 'program_phase_workouts',
  'client_programs', 'client_program_workouts',
  'workout_logs', 'workout_log_exercises', 'workout_log_sets',
  'weight_logs', 'performance_logs',
  'goals', 'goal_milestones', 'goal_check_ins',
  'client_check_ins', 'client_1rms',
  'events', 'coach_branding',
]

test.describe('RLS audit — cross-tenant isolation', () => {

  test('PROBE A: a brand-new coach who owns NOTHING can read no rows from any table', async ({ page }) => {
    // The cleanest possible leak test, and it needs no fixtures at all.
    // Coach B is a real, authenticated coach with ZERO data of their own. Therefore ANY row that any
    // table hands back to them is, by definition, some other tenant's data. There is no judgement
    // call and no expected-value matrix: a non-empty result IS the bug.
    //
    // This is the boundary that actually matters at beta — strangers sharing one Postgres — and
    // before 2026-07-12 it had never been tested, because no second coach account existed.
    await loginAsPT2(page)

    const results = await page.evaluate(async (tables) => {
      const out = []
      for (const t of tables) {
        // No filters at all. The app's own queries are scoped, which is precisely how an over-broad
        // policy stays hidden — so we deliberately ask for everything and let RLS do the filtering.
        const { data, error } = await db.from(t).select('*').limit(1000)
        const rows = data || []

        // Coach B owns exactly ONE row legitimately: their own `profiles` row, auto-created at
        // signup by the handle_new_user trigger. Everything else they own is nothing. So "foreign"
        // = any row that is not self. Without this carve-out the probe cries wolf on profiles every
        // run, and an audit that cries wolf is worse than no audit at all.
        const foreign = t === 'profiles'
          ? rows.filter(r => r.id !== currentUser.id)
          : rows

        out.push({
          table: t,
          rows: foreign.length,
          ownRows: rows.length - foreign.length,
          error: error ? error.message : null,
        })
      }
      return out
    }, ALL_TABLES)

    const leaks = results.filter(r => r.rows > 0)

    console.log('\n─── PROBE A — cross-coach read isolation ───')
    for (const r of results) {
      const verdict = r.rows > 0
        ? `🔴 LEAK (${r.rows} foreign rows)`
        : r.error ? `⚠️  ${r.error}`
        : r.ownRows ? `✅ 0 foreign (${r.ownRows} own)`
        : '✅ 0 rows'
      console.log(`  ${r.table.padEnd(28)} ${verdict}`)
    }
    if (leaks.length) {
      console.log(`\n🔴 ${leaks.length} TABLE(S) LEAKING TO AN UNRELATED COACH: ${leaks.map(l => `${l.table}(${l.rows})`).join(', ')}`)
    }
    console.log('───────────────────────────────────────────\n')

    // A coach who owns nothing must be able to read nothing. Anything else is another tenant's data.
    expect(leaks.map(l => `${l.table}: ${l.rows} rows`)).toEqual([])
  })

  // Every table that carries a direct `client_id`. For a logged-in client, RLS must return ONLY
  // their own rows from these — any row bearing someone else's client_id is that person's private
  // training data.
  const CLIENT_OWNED = [
    'weight_logs', 'workout_logs', 'client_1rms', 'client_check_ins',
    'client_programs', 'performance_logs', 'goals', 'workout_templates',
  ]

  // Tables the E2E client is SEEDED to own rows in. Probe B must see a non-zero count from each of
  // these, because an RLS DENY returns zero rows and NO error — exactly like a clean pass. Without a
  // positive lower bound, "✅ 0 rows, all own" is indistinguishable from "the client-read policy was
  // dropped" (which is literally what s23 and s24 were). A typo'd column name fails the same silent
  // way: during this harness's own review a probe queried `clients.name`, PostgREST errored, `data ||
  // []` turned it into zero rows, and it read as a clean result. Green must mean "I looked and found
  // the data I expected," never "I got nothing back."
  const CLIENT_MUST_SEE = ['weight_logs', 'workout_logs', 'workout_templates']

  test('PROBE B: a client sees ONLY their own rows — never another client\'s', async ({ page }) => {
    // This is where s25's real leak lived: workout_templates' client-read policy scoped by coach_id
    // ALONE with no client_id restriction, so every client of the same coach could read every other
    // client's personalised template clones.
    //
    // Deliberately fixture-free, same trick as Probe A: ask for everything with no filter and let
    // RLS decide. That is strictly stronger than seeding a victim, because it runs against the
    // REAL data already in the database — including Jake's actual clients. If any row comes back
    // bearing a client_id that is not this client's own, that is a live leak of a real person's data.
    await loginAsClient(page)

    const results = await page.evaluate(async (tables) => {
      // Same filter the app's own _getCurrentClientId uses: a master account can hold TWO clients
      // rows (a coached one and a personal/solo one), and .single() throws on two.
      const { data: me } = await db.from('clients').select('id, coach_id')
        .eq('user_id', currentUser.id).not('coach_id', 'is', null).single()
      const out = { myClientId: me.id, tables: [] }

      for (const t of tables) {
        const { data, error } = await db.from(t).select('*').limit(1000)
        const rows = data || []
        // Two distinct leak shapes, and the second one is easy to miss:
        //   client_id set to someone else  → plainly another client's row.
        //   client_id NULL                 → a coach-owned row (the reusable library a client IS
        //                                    allowed to see) — but ONLY if it belongs to THIS
        //                                    client's own coach. A null client_id is not a free pass:
        //                                    if it carries another coach_id it is a stranger's data,
        //                                    and that is the exact shape of Jake's solo/personal
        //                                    templates (coach_id = his uid, client_id = null,
        //                                    is_personal = true), which are kept out of client hands
        //                                    by a CLIENT-SIDE is_personal filter — a display flag,
        //                                    never a security boundary. So the coach_id check below
        //                                    is what stands between a client and another coach's
        //                                    entire library.
        const foreign = rows.filter(r => r.client_id != null
          ? r.client_id !== me.id
          : (r.coach_id != null && r.coach_id !== me.coach_id))
        out.tables.push({
          table: t,
          total: rows.length,
          foreign: foreign.length,
          error: error ? error.message : null,
        })
      }
      return out
    }, CLIENT_OWNED)

    console.log('\n─── PROBE B — cross-client read isolation (same coach) ───')
    const leaks = []
    for (const r of results.tables) {
      if (r.error) { console.log(`  ${r.table.padEnd(24)} ⚠️  ${r.error}`); continue }
      if (r.foreign > 0) leaks.push(`${r.table}(${r.foreign})`)
      const verdict = r.foreign > 0
        ? `🔴 LEAK — ${r.foreign} of ${r.total} rows belong to ANOTHER client`
        : `✅ ${r.total} rows, all own`
      console.log(`  ${r.table.padEnd(24)} ${verdict}`)
    }
    if (leaks.length) console.log(`\n🔴 CLIENT CAN READ ANOTHER CLIENT'S REAL DATA: ${leaks.join(', ')}`)
    console.log('──────────────────────────────────────────────────────────\n')

    expect(leaks).toEqual([])

    // No probe may report a table clean without having actually read data from it — see CLIENT_MUST_SEE.
    for (const t of CLIENT_MUST_SEE) {
      const row = results.tables.find(r => r.table === t)
      expect(row.error, `${t}: query errored, so its "clean" verdict is meaningless`).toBeNull()
      expect(row.total, `${t}: client sees 0 rows — either the client-read policy is broken (s23/s24) or this probe is querying nothing. Either way the audit is not proving anything here.`).toBeGreaterThan(0)
    }
  })

  test('SELF-TEST: the audit can actually DETECT a leak (it is not just always green)', async ({ page }) => {
    // A green audit from a harness that has never once gone red proves nothing — it could be
    // querying the wrong thing, filtering the wrong field, or silently erroring, and would look
    // identical to a clean bill of health. So prove the detector fires.
    //
    // Safely, with no policy change: plant a row that IS foreign to a chosen "me", run Probe B's
    // EXACT classifier over it as the COACH (who legitimately sees all their clients), and require
    // it to light up. If this test ever goes green, the audit above is lying.
    //
    // It OWNS its victim. The first version instead asked the coach for any 2+ clients and skipped
    // if it found fewer — and it only ever passed because two `[E2E-RLS] Victim Client` rows had
    // been stranded in the database by an earlier run. The seed creates exactly ONE client, so on a
    // clean database it would have SKIPPED — and Playwright reports a skip as neither pass nor
    // fail. The single test whose job is to prove the audit isn't lying was resting on garbage that
    // happened to be lying around, and would have gone quiet without failing. Tests own their
    // fixtures; they never borrow ambient data.
    await loginAsPT(page)

    const VICTIM = '[E2E-RLS] Detector Victim'
    let detected

    try {
      detected = await page.evaluate(async (victimName) => {
        // Belt and braces: clear any victim stranded by a previous failed run before planting ours.
        await db.from('clients').delete().eq('coach_id', currentUser.id).eq('full_name', victimName)

        const { data: victim, error: vErr } = await db.from('clients')
          .insert({ coach_id: currentUser.id, full_name: victimName, email: 'e2e-rls-victim@example.com', status: 'active' })
          .select().single()
        if (vErr) return { fatal: `could not create victim client: ${vErr.message}` }

        const { error: wErr } = await db.from('weight_logs')
          .insert({ client_id: victim.id, weight_kg: 77.7, date: '2020-01-01' })
        if (wErr) return { fatal: `could not create victim weight_log: ${wErr.message}` }

        // "me" = the real seeded client. The victim's row is, by construction, foreign to them.
        const { data: me } = await db.from('clients').select('id')
          .eq('coach_id', currentUser.id).neq('id', victim.id).limit(1).single()

        const { data, error } = await db.from('weight_logs').select('*').limit(1000)
        if (error) return { fatal: `weight_logs read failed: ${error.message}` }
        const rows = data || []

        // Probe B's classifier, verbatim.
        const foreign = rows.filter(r => r.client_id != null && r.client_id !== me.id)
        return {
          totalRows: rows.length,
          foreignRows: foreign.length,
          victimFlagged: foreign.some(r => r.client_id === victim.id),
        }
      }, VICTIM)
    } finally {
      // By name, unconditionally — a mid-test failure must not strand the victim in a real clients
      // table (which is exactly how the last version ended up with two of them).
      await page.evaluate(async (victimName) => {
        const { data: vs } = await db.from('clients').select('id').eq('coach_id', currentUser.id).eq('full_name', victimName)
        for (const v of vs || []) {
          await db.from('weight_logs').delete().eq('client_id', v.id)
          await db.from('clients').delete().eq('id', v.id)
        }
      }, VICTIM).catch(() => {})
    }

    expect(detected.fatal, 'self-test could not plant its victim, so it proves nothing').toBeUndefined()

    console.log(`\n─── SELF-TEST — can the audit detect a leak? ───`)
    console.log(`  Planted one weight_log belonging to a client who is NOT "me".`)
    console.log(`  Coach sees ${detected.totalRows} weight_logs; classifier flagged ${detected.foreignRows} as foreign.`)
    console.log(`  Planted victim specifically flagged: ${detected.victimFlagged}`)
    console.log(`  ${detected.victimFlagged ? '✅ Detector FIRES — the audit above is trustworthy.' : '🔴 Detector is DEAD — the audit above proves nothing!'}`)
    console.log('───────────────────────────────────────────────\n')

    // Not just "some row was flagged" — the row we PLANTED must be the one flagged.
    expect(detected.victimFlagged, 'the classifier failed to flag a row it was designed to catch — Probe B is worthless').toBe(true)
  })
})
