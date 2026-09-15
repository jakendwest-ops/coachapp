---
id: 2026-08-14-test-gate-flakiness-returned-across-two-unrelated-files
status: open
priority: medium
reported: 2026-08-14
---

# The push gate started flaking again — 4 events in one day, 4 unrelated files

> **CORRECTED after a third full-suite run.** My first write-up of this pinned it on fixture isolation,
> because the first two events matched that shape. The third run made the real pattern visible: the
> DOMINANT signature is a **login timeout**, not shared data. Four events, four different files, and the
> only thing they have in common is that they happen deep into a 24-minute run. Fixture ordering is at
> most a secondary contributor. Corrected here rather than left half-right, because the wrong diagnosis
> would have sent the next session to rewrite fixtures and fix nothing.

**~~This is the fixture-isolation problem returning, in the two files that were deliberately NOT
converted on 2026-08-11.~~ — WRONG, see the correction above and the dose-response evidence at the
bottom. Left struck through rather than deleted, because the mistake is the lesson: it fit two data
points and it was the known problem, which is exactly why it was believed.** The 2026-08-11 decision
was nonetheless correct at the time and is recorded as such in
`2026-08-11-runner-spec-is-flaky-6-of-38-...md`: the gate had just been measured at **3 consecutive
`checks.sh` runs, 56 passed / 0 flaky**, so per Jake's standing rule of 2026-08-12 — *"do not change code
to fix a problem that does not exist yet"* — `programs.spec.js` and `client-workout.spec.js` were left
borrowing shared fixtures because nothing pointed at them.

**Today it exists.** Three separate events while shipping the 2026-08-14 screenshot-feedback work:

| Run | Result | Signature |
|---|---|---|
| Full suite #1 | 422 passed / **1 flaky** — `programs.spec.js:937` picker | render timing |
| `checks.sh` | 54 passed / **2 flaky** — `solo-account.spec.js:48` + `:116` | **login timeout** |
| Full suite #2 | 424 passed / **1 failed** — `solo-account.spec.js:48`, both attempts | wrong page (ordering) |
| Full suite #3 | 424 passed / **1 failed** `ledger-fixes-2026-07-30.spec.js:209` + **1 flaky** `:226` | **login timeout** |

**Four files, four runs, a different one each time — and `solo-account.spec.js:48` PASSED in runs #1 and
#3 while failing twice in #2.** No test is reliably broken; the gate is.

The dominant failure mode, in 2 of the 4 events (and the one that also blocked `checks.sh`):

    TimeoutError: page.waitForSelector: Timeout 15000ms exceeded.
      waiting for locator('#app-shell') to be visible
        33 × locator resolved to hidden <div id="app-shell" class="app-shell">…</div>
      at helpers.js:20  ->  loginAs / loginAsPT

The shell exists but never becomes visible, i.e. **`loadUserInfo` never completed** — sign-in itself did
not resolve. That points at **Supabase Auth rate-limiting or slowness**, which this project has hit before
(recorded in the 2026-07-25 session notes), not at test data. Every spec file calls `loginAsPT`/
`loginAsClient` in a `beforeEach`, so a 428-test run performs hundreds of sign-ins against one project;
the failures cluster deep into the run, which fits a rate limit far better than it fits fixture collisions.

The one event that was NOT a login timeout was full-suite #2, which got into the app and read the wrong
page — genuine ordering:

    Locator: locator('h1')
    Expected substring: "Library"
    Received string:    "My Training"

## It is ordering, not a regression — proven, not assumed

`solo-account.spec.js:48` was run four ways after the failure:

- **isolated** (`-g "solo can reach the Library"`) → passed
- **its own whole file** → 15 passed, 0 failed
- **paired with the new `screenshot-feedback-2026-08-14.spec.js`**, which sorts immediately before it
  alphabetically and was the obvious suspect → 24 passed, 0 failed
- **full suite** → failed twice

Same code, four different outcomes depending only on what ran before it. That is timing/ordering, and it
rules out the day's product changes: nothing in that diff renders the Library page or the solo nav.

## Why it matters more than the raw numbers suggest

A gate that fails at random eventually gets ignored — that is the whole reason the 2026-08-11 conversion
happened. Worse, **`checks.sh` is the pre-push hook**, so a flake here blocks a good push, and the reflex
after two false blocks is to stop reading the output. Today's `checks.sh` run reported "All checks passed"
*with 2 flaky underneath it*, which is exactly the shape that trains you not to look.

Note also that the two files implicated today are **not** the two named on 2026-08-11
(`programs.spec.js` was, `client-workout.spec.js` was not; `solo-account.spec.js` is new to the list). So
the conversion list was drawn from the evidence available then and is now known to be incomplete —
converting only the originally-named pair would not have caught `solo-account.spec.js`.

## Fix — in this order, because the diagnosis changed

**1. Auth first (the dominant signature).** Every spec `beforeEach` performs a fresh `signInWithPassword`,
so one full suite is hundreds of sign-ins against one Supabase project. Options, cheapest first:
- **Reuse a stored auth state** across tests (Playwright `storageState`) so the suite signs in a handful
  of times instead of hundreds. This is the standard fix and would remove the failure class outright.
- Confirm the theory first, and cheaply: instrument `loginAs` to capture the actual `signInWithPassword`
  error instead of only timing out on `#app-shell`. Right now a rate-limit and a genuinely broken login
  are indistinguishable in the output — which is exactly why this went 4 events without being diagnosed.

**2. Fixture isolation second** (real, but secondary — it explains 1 of 4 events). Same shape as the
`ownWorkout` fixture in `tests/fixtures.js` (2026-08-11): each test creates and tears down the rows it
needs instead of picking "whatever is first". Do NOT add a second fixture module — that is how these
drift. `solo-account.spec.js` additionally shares one login/view-switch state across 16 tests, so it may
need a `beforeEach` that re-asserts the Personal view rather than trusting the previous test.

**Do not start with (2).** That was my first instinct and the first version of this file said so; the
third run showed it would have rewritten a lot of fixtures and left the main failure class untouched.

**Deliberately not done on 2026-08-14.** It is a session of work on its own and the day's scope was Jake's
five reported items. Logged with the evidence so the next session starts from measurement, not memory.

**Closes when:** `checks.sh` runs three consecutive times at 0 flaky AND two consecutive full-suite runs
show 0 failed / 0 flaky. One green run is not evidence when the defect is non-determinism.

---

**STRONGER EVIDENCE, same day (session 2).** A full-suite run late in the session returned **1 failed +
11 flaky**, against 1-2 flaky earlier the same day. **All 12 failure signatures were identical:**

    TimeoutError: page.waitForSelector   (waiting for #app-shell, inside loginAs)

Not one product assertion failed. And the flake COUNT rose monotonically with the number of full suites
run in the session (~6 by that point, each performing ~430 sign-ins).

That dose-response is the diagnosis: a shared-fixture problem does not get worse the more times you run
the suite in a day, but a **rate limit** does. It also means late-session suite runs have degraded
signal — a run finishing green late in a heavy session is weaker evidence than the same run early on,
and failures must be CLASSIFIED (login-timeout vs product assertion), never just counted.

Practical consequence until this is fixed: prefer `checks.sh` (57 tests) as the trustworthy gate late in
a session, and treat a full-suite flake count as a measure of the session, not of the code.

## MEASURED 2026-08-26 — THREE files, and one proven non-deterministic

Four full-suite runs in one evening, same machine:

| run | code | progress-trend B4 | other |
|---|---|---|---|
| 1 | weight fix | **FAILED** | — |
| 2 | **identical to run 1** | **PASSED** | — |
| 3 | + Phase 1 | **FAILED** | ledger-fixes-2026-08-02 flaky (passed on retry) |
| 4 | + review fixes | PASSED | solo-account:142 flaky (passed on retry) |

**Runs 1 and 2 were byte-identical code with different outcomes** — non-determinism, not a regression.
The row title says “two unrelated files”; it is now **three**: `progress-trend.spec.js:5` (B4),
`ledger-fixes-2026-08-02.spec.js:6`, `solo-account.spec.js:142`.

Each was checked against the session’s own new fixtures before being called flaky — e.g.
`solo-account:142` asserts on the literal names `[E2E] PT-Only Lift` / `[E2E] Personal-Only Lift`,
which the new timestamped tags cannot collide with. All three use short visibility timeouts.

A plausible contributor is filed separately:
[[2026-08-26-e2e-specs-leave-client-rows-in-the-live-database]] — stranded fixture rows accumulating
on the real coach account.

## 2026-08-27 — a FOURTH intermittent test, and this one is inside the PUSH GATE

`solo-account.spec.js:48` (“solo can reach the Library nav item and see Templates/Exercise Library
tabs”) failed attempt 1 and passed on retry **during the pre-push smoke gate** for `bef71b0`. The gate
reported 55 passed and went green on the retry.

Checked before calling it flaky, not after:

- The full suite passed **576 / 0 failed** on byte-identical code ~30 minutes earlier.
- Run alone with `--retries=0`, three times: **3/3 passed**.
- The commit touched `deleteExercise` (Exercise Library) so it was a plausible suspect — but the
  assertion that failed is `toContainText` on the TAB LABELS, which that change does not touch.

**Why this one matters more than the other three:** it is in the 57-test smoke gate. The other
intermittents (`progress-trend:5`, `ledger-fixes-2026-08-02:6`, `solo-account:142`) sit outside it and
only cost a re-run. This one can fail a PUSH — and, worse, it passes on retry, so the gate goes green
and the flake is invisible unless someone reads the run output. I only saw it because the pass count
was 55 instead of the usual 56.

**Running tally: four intermittent tests across three files.** Every one has a short visibility
timeout, and every one has been checked against the session fixtures before being attributed to
non-determinism rather than contamination.

---

## 2026-08-29 — a clean full-suite run, measured: **576 passed / 3 failed / 2 flaky / 1 skipped** (31.4m)

First trustworthy full-suite number in a while — the server was verified serving `<title>CoachApp</title>`
before the run, after an earlier attempt produced 39 identical `ERR_CONNECTION_REFUSED` failures against a
dead :3001 (now its own row, `2026-08-29-a-dead-preview-server-is-reported-as-failing-tests`).

**Hard failures (3), across 2 files:**
- `ledger-fixes-2026-08-02.spec.js:646` and `:657` — mobile calendar grid.
- `progress-trend.spec.js:5` — resting-HR trend (B4), the long-standing one on this row.

**Flaky (2) — failed attempt 1, passed on retry:**
- `client-workout.spec.js:225`
- `own-workout-fixture-2026-08-11.spec.js:61` (see the `[E2E]` debris row).

**So the count on this row's title is wrong: it is 5 tests across 4 files, not 2 files.**

## The two calendar failures are a TIMING flake, not a markup regression — verified

Both tests do `loginAsClient(page)`, click `[data-page="calendar"]`, then a **fixed
`waitForTimeout(1500)`**, then:

```js
const html = await page.evaluate(() =>
  document.querySelector('[style*="grid-template-columns:repeat(7"]')?.outerHTML || '')
const dayCellStyleMatch = html.match(/<div onclick="showDayEvents\([^)]*\)" style="([^"]*)"/)
expect(dayCellStyleMatch).not.toBeNull()
```

The `?.` + `|| ''` means an absent container yields `''`, and `''.match()` returns `null`. **The
assertion that fires is therefore "the calendar had not rendered", not "the markup is wrong."** Confirmed
by reading the source: `js/app-calendar-goals.js:126` still carries `grid-template-columns:repeat(7,1fr)`
(so the selector is valid) and `:138` still carries the `onclick="showDayEvents(...)" style="` pair
containing `min-width:0` and `overflow:hidden` (so the regex and both assertions would pass if it had
rendered).

**Not caused by the 2026-08-28 session:** `git show bef71b0 -- js/app-calendar-goals.js` grepped for
`showDayEvents` and `grid-template` returns nothing — that commit added delete rowcount checks and did
not touch the render path.

`loginAsClient` is already on record for exactly this class — the glossary's *Race condition* entry cites
it returning before the login had completed. **A fixed `waitForTimeout` is the shared defect across these
tests, not a per-test accident**, which makes this a class fix (wait for the grid, don't wait for a
number of milliseconds), not three separate repairs.

**Both calendar tests sit OUTSIDE the 57-test push gate**, which is the documented way a spec stays RED
across deploys without anyone noticing.

---

## 2026-09-04 — a third file joins the pattern, measured both ways

Full suite run (597 passed, 1 flaky, 4 skipped, 33.5m) on a push containing **zero browser-loaded
files** — every changed file was developer tooling in `scripts/` and `tests-node/`, confirmed with
`git diff --stat origin/master..HEAD -- js/ css/ index.html` returning empty. So whatever this is, it
is not a code regression from that work.

**The flaky:** `solo-account.spec.js:48` — *"solo can reach the Library nav item and see
Templates/Exercise Library tabs"*.

```
expect(locator('h1')).toContainText('Library')
Received string: "My Training"
19 × locator resolved to <h1 class="page-title">My Training</h1>
```

So the click on `[data-page="library"]` registered but the page never navigated — the h1 stayed on the
Workouts/My Training heading for the whole 8s window, twice as long as the `waitForTimeout(1000)` the
test sleeps first.

**Measured both ways, because a flaky is not a reproduction** ([[feedback_stability_predictions_overstated]]):

| Condition | Result |
|---|---|
| In the 603-test suite, at position **601 of 603** | FAILED attempt 1, PASSED on retry |
| Alone, `--repeat-each=3 --retries=0` | **3 of 3 passed**, 4.3–5.2s each |
| In the 57-test pre-push gate (same day, same tree) | PASSED |

**Not reproduced in isolation.** The signature is full-suite-only and position-dependent — it failed
near the very END of a 33-minute run, which is the same shape as the two files already on this row.
That is worth stating precisely: this is now **three unrelated specs** failing only deep into a long
run and passing alone, which points at accumulated state (session, browser, or database) rather than
at any one spec's logic.

**Do NOT close this row on the 3/3 isolated pass.** Passing alone is exactly what the row already
predicts. Closing needs a full-suite run that is clean, or a mechanism.

**Lead worth pulling, not yet checked:** the run reaps and re-creates fixtures throughout, and
`navigate()` renders after an `await`. If a late-suite session refresh lands mid-navigation the render
could be dropped with no error — consistent with a click that registers and a heading that never
changes. Unverified; recorded so the next investigation does not start from scratch.

---

## 2026-09-04 (second observation of the day) — `progress-trend` flaked, and it is provably not the change under test

Full suite after the wheel-guard and re-entry-guard commits: **601 passed, 4 skipped, 0 failed, 2 flaky.**
Both flakes in `progress-trend.spec.js`:

- `:5` — resting-HR trend (B4). `expect(count).toBe(1)` returned **0**. This is the row's
  long-standing intermittent, named in the 2026-08-14 entry above.
- `:233` — per-exercise trend card. `#trend-range-row` never appeared inside 5s, after a
  `waitForTimeout(1200)`.

**Ruled out as caused by that session's changes, on evidence rather than reasoning:** the commits under
test added a global `wheel` listener (`app-core.js`) and a `guardReentry` registration
(`app-programs.js`). `tests/progress-trend.spec.js` contains **zero** occurrences of `wheel`,
`type="number"` or `.blur(` — grepped, count 0 — so there is no surface for the wheel guard to touch,
and the spec calls none of the guarded functions.

**The shape is the same as every prior entry:** deep into a ~29-minute run, passing on retry, and
untouched by the code that changed. Earlier the same day, two full runs of the same suite (27.7m and
28.0m) recorded **zero** flakes on the same specs — so it is intermittent across runs, not a step
change introduced by a commit.

Still **not diagnosed**. This is a third data point on position-dependence, not a mechanism. Both of
today's observations point the same way: accumulated state across a long run rather than any one
spec's logic.

---

## 2026-09-04 (third observation) — a FOURTH file, and this one's failure mode is interesting

Full suite: **607 passed, 4 skipped, 0 failed, 1 flaky.** The flake is new to this row:

`programs.spec.js:553` — *"editing a workout assigned to two slots forks a copy instead of overwriting
the shared one"*:

```
TimeoutError: page.waitForSelector: Timeout 8000ms exceeded.
  - waiting for locator('#edit-template-modal') to be detached
    19 × locator resolved to visible <div class="modal-overlay" id="edit-template-modal">…</div>
```

**The save modal never closed.** Same position-dependent signature as the other three: deep in a
30-minute run, **5 of 5 passing in isolation** (~8s each) immediately afterwards.

**Ruled out as caused by that session's commits, on evidence:** the changed code was the delete
rowcount work in `app-programs.js` and a client-id binding in `app-calendar-goals.js`. This failure is
in `saveEditTemplate` (`app-workouts.js`), **a file not touched in this session at all**, and the spec
names none of the ten functions that were changed. The immediately preceding full run, which already
contained the app-programs work, was 605 passed / **0 flaky**.

### Why this one deserves more than a tally mark

The failure mode — **a save whose modal never closes** — is the same SHAPE as the long-standing P1
report in
[[2026-08-07-programs-builder-major-slowdown-editing-a-cardio-workout-and]]: *"clicking save did
nothing / the save button didn't work. The only way to make my edits appear was to refresh the page."*

That row's remaining half is explicitly blocked on *"evidence from Jake's OWN session (console during
a real repro)"*, because two fixture-driven attempts to reproduce it came back green. **This is a
machine-observed instance of the same shape**, on the template-edit path, with a trace and a video
already captured by Playwright.

**Stated precisely, because the temptation to over-claim here is obvious:** this is ONE observation,
on a different surface (the Programs-builder template editor rather than a cardio workout edit), and
it passed 5/5 alone. It is **not** a reproduction of Jake's bug. It IS the first time anything other
than Jake has seen a save fail to complete, and the artefacts are worth reading before the next
attempt at that row.

**Next step when that row is picked up:** open
`test-results/programs-Duplicate-week-fo-274d1--overwriting-the-shared-one-chromium/` — the trace and
video from this run — rather than building a third fixture.

**CORRECTION, same session:** the trace and video are **GONE**. Playwright clears `test-results/`
at the start of every run by default (no `preserveOutput` is set), and the 5x isolated re-run done to
characterise the flake — moments after it happened — destroyed the artefacts from the run that
produced it. `test-results/` is now empty, verified.

So there is nothing to read, and the pointer above is dead. The lesson is worth more than the trace
would have been: **when a rare flake produces artefacts, COPY THEM OUT BEFORE running anything else.**
The instinct to immediately re-run and characterise is exactly what deleted the evidence.
[[feedback_reports_success_doing_nothing]] has a sibling — an investigation step that destroys what it
was investigating.

**A config fix was attempted and MEASURED NOT TO WORK.** `preserveOutput: 'failures-only'` governs
whether artefacts are kept for passing tests WITHIN a run; it does nothing about Playwright cleaning
`outputDir` at the START of the next one. Tested directly: a deliberately failed run left 1 artefact
directory, and a subsequent run of a DIFFERENT, PASSING spec reduced it to 0. The setting was reverted
rather than shipped with a comment claiming a property it does not have — that would have been the
same reports-success-while-doing-nothing shape, in the mechanism meant to preserve the evidence of it.

**So the fix is a habit, not a setting: after any run with failures, copy `test-results/` somewhere
else BEFORE running anything again.** There is currently no mechanism enforcing that, and saying so
is more useful than a setting that looks like one.

---

## 2026-09-04 (fourth observation) — the SAME test again, and this time the artefacts were kept

Full suite: **611 passed, 4 skipped, 0 failed, 1 flaky.** The flake is `solo-account.spec.js:48` again —
the same test, same line, same received string as the first observation this morning:

```
expect(locator('h1')).toContainText('Library')
Received string: "My Training"
19 x locator resolved to <h1 class="page-title">My Training</h1>
```

So this specific test has now flaked **twice in one day, in runs 8 hours apart**, and passed 3/3 in
isolation between them. That moves it from "an intermittent" to the most reproducible member of this
row's set.

**Ruled out as caused by the commit under test**, which changed `_effectiveCoachIdForClient` and
`renderClientWorkoutsPage` — the Library page's own content. The assertion that fails is **line 52, the
h1**, which runs BEFORE any assertion about templates or tabs (lines 53-55). The page never navigated;
what the Library page would have rendered was never reached. A content change cannot explain a
navigation that did not happen.

**ARTEFACTS PRESERVED THIS TIME**, per the lesson recorded above:

    scratchpad/flake-artefacts-20260904-180538/
      solo-account-...-chromium/          error-context.md, test-failed-1.png, video.webm
      solo-account-...-chromium-retry1/   (the passing retry, for comparison)

784K, including **a video of the failure and of the passing retry side by side** — which is the first
time this row has had a recording of both. Copied out of `test-results/` immediately, before running
anything else, because Playwright wipes that directory at the start of the next run.

**The one detail worth carrying forward:** the failure's accessibility snapshot contains only
`- heading "My Training" [level=1]` — the click on `[data-page="library"]` registered (the test's
`clickVisible` did not throw) but `navigate()` never repainted. That is the same shape as the
`#edit-template-modal` flake two observations ago: **an action accepted, and a render that never
happened.** Two different surfaces, one symptom.

---

## 2026-09-04 — ROOT CAUSE FOUND for `solo-account.spec.js:48`, and it was never a flaky click

The preserved screenshot is what cracked it. It showed the bottom nav **highlighting Library** while
the content was still the solo dashboard. That highlight is set synchronously inside `navigate()`,
*after* its only early return — so `navigate()` had definitely run. **The click was never the problem.**

### The mechanism

Every async render in this app has one shape: paint `Loading…`, await several Supabase queries, then
write `el.innerHTML`. **None of them asks whether the page is still the one that requested it.** A
render still in flight when you navigate therefore lands afterwards and repaints over the new page.

Reproduced deterministically — no timing games, no repeat-until-it-fails:

| step | h1 |
|---|---|
| on the solo dashboard | `My Training` |
| after `navigate('library')` | `Library` |
| after a stale `renderSoloDashboard` resolves | **`My Training`** |

with `nav active = library` and `currentPage = 'library'` throughout. That is byte-for-byte the failure
state in the screenshot: **the app believes it is on Library, and the screen shows the dashboard.**

### Why it survived four investigations

It presents as a click that did nothing. Every previous look went after the click, the nav handler, or
the environment. The click was fine; the *second* paint was the problem. And it is position-dependent
for a mundane reason — deep into a 30-minute run the queries are slower, so the window in which a
navigation can overtake a render is wider. Alone, the render finishes long before anything else
happens.

### Fixed at the source

**MEASURED: 24 of 26 async `render*` functions write `innerHTML` after an await; 3 carry any staleness
guard.** Guarding them one by one would be 24 chances to miss one and a 25th every time someone adds a
render. The guard therefore lives in `navigate()` — the single place page renders are dispatched from.
The container handed to a render stops accepting `innerHTML` once `currentPage` has moved on, and says
so with a `log.warn` naming both pages rather than silently discarding the paint.

`tests/stale-render-clobber-2026-09-04.spec.js`, RED before and GREEN after.

### What this does NOT close

**This row stays open.** One reproduction and one fix are not four clean full suites, and the other
members have not been shown to share the mechanism:

- `progress-trend.spec.js:5` / `:233` — a missing chart and a missing `#trend-range-row`. Could
  plausibly be the same clobber (a stale render wiping a chart the test then looks for), **untested**.
- `programs.spec.js:553` — `#edit-template-modal` never detaching. **Probably NOT this mechanism**:
  modal overlays are separate nodes from `#main-content`, so a stale render repainting the page body
  would not leave a modal mounted. Different bug until shown otherwise.

Closing this row needs full-suite runs that stay clean, not one root cause.
