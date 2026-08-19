// escapeAttr in a plain attribute — the class fix (2026-08-16).
//
// escapeAttr exists for ONE shape: a JS string literal inside a handler,
//   onclick="fn('${escapeAttr(x)}')"
// It backslash-escapes \ ' \n \r and then HTML-escapes. In a plain value="" the backslash is not
// protection, it is corruption: the browser hands it back through .value, and because these inputs
// feed straight into a save, the corrupted string is what gets WRITTEN. Edit-and-save a second time
// and it gains another backslash.
//
// Commit 9d0003b fixed this class on 2026-08-12 — at some sites. 58 more were still live four days
// later, including the workout-name field in the in-gym runner and the exercise-name field in the
// template editor. The pre-push checker could not see them: it whitelisted escapeAttr( as "an
// escaper is present", and its ${...} walk only ever saw OUTERMOST interpolations, so the many
// attributes built inside helper calls were invisible. Both gaps are now closed in
// scripts/check-escaping.mjs.
//
// These tests own their fixtures rather than borrowing an existing exercise, and assert against the
// DATABASE, not just the DOM — the whole point is what gets persisted.
const { test, expect } = require('./fixtures')
const { loginAsPT } = require('./helpers')

// Every character escapeAttr mangles, in one name.
const NASTY = `E2E Farmer's \\Back "Squat" ${Date.now()}`

test.describe('escapeAttr → escapeHtml in plain attributes', () => {
  test('an exercise name with a quote and a backslash survives edit-and-save, twice', async ({ page }) => {
    await loginAsPT(page)
    let exId = null
    try {
      exId = await page.evaluate(async (name) => {
        const { data, error } = await db.from('exercises')
          .insert({ coach_id: currentUser.id, name, metric_type: 'weight_reps' })
          .select('id').single()
        if (error) throw new Error(error.message)
        return data.id
      }, NASTY)

      // Pass 1 — open the real edit modal and read the value the browser gives back.
      const first = await page.evaluate(async (id) => {
        await showEditExerciseModal(id)
        return document.getElementById('ee-name').value
      }, exId)
      expect(first, 'the input must hand back exactly the stored name').toBe(NASTY)

      // Save without touching it. With escapeAttr this wrote a backslashed name.
      const afterSave = await page.evaluate(async (id) => {
        await saveEditExercise(id)
        const { data } = await db.from('exercises').select('name').eq('id', id).single()
        return data.name
      }, exId)
      expect(afterSave, 'an untouched save must not alter the name').toBe(NASTY)

      // Pass 2 — the corruption was CUMULATIVE, so one round trip could hide it. Do it again.
      const afterSecond = await page.evaluate(async (id) => {
        await showEditExerciseModal(id)
        await saveEditExercise(id)
        const { data } = await db.from('exercises').select('name').eq('id', id).single()
        return data.name
      }, exId)
      expect(afterSecond, 'backslashes must not accumulate across repeated saves').toBe(NASTY)
    } finally {
      if (exId) await page.evaluate(async (id) => { await db.from('exercises').delete().eq('id', id) }, exId).catch(() => {})
    }
  })

  // THE test that was missing on 2026-08-16, and the reason "the class is closed" was wrong. The rule
  // shipped that day matched only the INTERPOLATED shape, exited 0, and nine CONCATENATED sites stayed
  // live for three days. A class guard is only closed once it is proven against every syntactic form
  // the codebase actually uses — so plant one of each and confirm both are caught.
  test('the checker catches BOTH syntactic shapes, not just the one that motivated it', async () => {
    const { execFileSync } = require('child_process')
    const fs = require('fs'), os = require('os'), path = require('path')
    const run = (src) => {
      const f = path.join(os.tmpdir(), `esc-probe-${Date.now()}-${Math.random().toString(36).slice(2)}.js`)
      fs.writeFileSync(f, src)
      try {
        execFileSync('node', ['scripts/check-escaping.mjs', f], { encoding: 'utf8' })
        return { caught: false, out: '' }
      } catch (e) { return { caught: true, out: (e.stdout || '') } }
      finally { fs.unlinkSync(f) }
    }

    // Shape 1 — interpolated straight into a plain attribute.
    const interpolated = run('const a = `<input value="${escapeAttr(x)}">`')
    expect(interpolated.caught, 'the interpolated shape must be caught').toBe(true)

    // Shape 2 — CONCATENATED. This is the one that survived, because it is how mini()/gmini() build
    // attribute fragments: on lines that contain no literal `<` at all.
    const concatenated = run(`const a = mini('id', 'type="text" value="' + escapeAttr(x) + '"')`)
    expect(concatenated.caught, 'the CONCATENATED shape must be caught — it was not, for three days').toBe(true)

    // And the CORRECT usage must not be flagged, or the rule cries wolf and gets disabled.
    const correct = run(`const a = \`<button onclick="fn('\${escapeAttr(x)}')">go</button>\``)
    expect(correct.caught, 'a JS string literal inside a handler is the one legitimate use').toBe(false)
  })

  test('no plain attribute anywhere in js/ still uses escapeAttr', async () => {
    // The class guard. A per-site test would go green while the next copy-paste reintroduced it
    // somewhere else — this is the assertion that actually holds the line, and it is the same
    // command the pre-push hook runs.
    const { execFileSync } = require('child_process')
    let out = '', code = 0
    try {
      out = execFileSync('node', ['scripts/check-escaping.mjs',
        'js/app-core.js', 'js/app-dashboard.js', 'js/app-programs.js', 'js/app-clients.js',
        'js/app-calendar-goals.js', 'js/app-workouts.js', 'js/app-runner.js', 'js/app-progress.js',
        'js/starter-content.js'], { encoding: 'utf8' })
    } catch (e) { out = (e.stdout || '') + (e.stderr || ''); code = e.status }
    expect(out, 'check-escaping.mjs reported findings').toBe('')
    expect(code, 'check-escaping.mjs must exit 0').toBe(0)
  })
})
