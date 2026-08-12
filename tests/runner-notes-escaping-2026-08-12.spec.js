// 2026-08-12 — the runner's "Your notes" textarea rendered client notes RAW.
//
// Found by the full-codebase architecture audit and confirmed here directly:
// `js/app-runner.js` rendered `${ex.clientNotes||''}` inside `<textarea>` with no escapeHtml, so a
// literal `</textarea>` in the notes closed the element and everything after it became live markup.
//
// Honest severity, because the audit's framing is slightly broader than the evidence supports:
// `clientNotes` on a fresh runner is only ever what the logged-in athlete typed themselves, so the
// direct vector is SELF-XSS — not another user's markup rendering in your session. What makes it worth
// fixing rather than shrugging at is persistence: the value round-trips through the localStorage
// autosave draft (`_saveRunnerDraft`), so it survives a reload and fires again on resume, and it is
// written to `workout_log_exercises.client_notes`. The coach-facing render of that column IS escaped
// (openWorkoutLog, pinned by ledger-fixes-2026-08-02.spec.js), which is what keeps this from being a
// client -> coach stored-XSS of the 2026-07-18 class.
//
// 5th+ recurrence of the unescaped-free-text class in this project. The audit's recommendation — one
// repo-wide sweep rather than catching them one at a time during unrelated work — stands.
const { test, expect } = require('./fixtures')
const { loginAsClient } = require('./helpers')

const BREAKOUT = '</textarea><img src=x onerror="window.__xss=1">'

test.describe('runner client-notes escaping (2026-08-12)', () => {
  test('a </textarea> payload in client notes cannot break out of the textarea', async ({ page, ownWorkout }) => {
    await loginAsClient(page)
    const wk = await ownWorkout()
    await wk.start()
    await expect(page.locator('button:has-text("End")')).toBeVisible({ timeout: 12000 })

    const res = await page.evaluate(async (payload) => {
      _runner.exercises[_runner.exIdx].clientNotes = payload
      renderRunner()
      const ta = document.getElementById('wr-client-notes')
      return {
        // The payload must survive as the textarea's VALUE, not as markup.
        valueRoundTrips: ta?.value === payload,
        // The breakout would create a real <img> sibling and fire its onerror.
        injectedImg: !!document.querySelector('#workout-runner img[src="x"]'),
        xssFired: !!window.__xss,
        textareaCount: document.querySelectorAll('#wr-client-notes').length,
      }
    }, BREAKOUT)

    console.log('escaping result:', JSON.stringify(res))

    // The regression: injectedImg was true and the value did not round-trip.
    expect(res.injectedImg, 'a </textarea> payload must not become live markup').toBe(false)
    expect(res.xssFired, 'no injected handler may execute').toBeFalsy()
    expect(res.valueRoundTrips, 'the note must survive intact as text — escaping must not corrupt it').toBe(true)
    expect(res.textareaCount).toBe(1)
  })
})
