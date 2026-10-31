# Personal view: four destinations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Personal view (role `solo`) has four destinations — Today, Train, Progress, More — on the phone bottom bar and the desktop sidebar, with every affordance of the five retired destinations rehomed.

**Architecture:** Re-host, don't rewrite. The four destinations are the existing pages under new labels (`solo-dashboard` = Today, `workouts` = Train, `progress` = Progress) plus the existing More sheet; the retired pages (`programs`, `calendar`, `library`, `goals`) stay routable but are not nav items, and each one lights its parent tab. Progress gets a solo-only entry point (`renderPersonalProgress`) so the coached client's Progress page is untouched.

**Tech Stack:** vanilla JS classic scripts (one global scope, no build), Supabase, Playwright E2E, `node:test` for pure functions.

**Spec:** `docs/superpowers/specs/2026-10-31-personal-view-four-tabs-design.md`

## Global Constraints

- Personal view only: coach and client nav, pages and Progress unchanged (assert it in tests).
- Labels exactly: `Today`, `Train`, `Progress`, `More`; Train switches `Workouts` then `Plans`; Progress switches `Goals`, `Records`, `Weight`, `Cardio`.
- Today is the solo default page (`defaultPage` stays `solo-dashboard`).
- No SQL, no new tables or columns.
- Bump `?v=` on every changed module in `index.html` in the same commit.
- `checks.sh` ratchets may not rise, except the `role === 'solo'` count in `scripts/count-baseline.json` by exactly 1 if Task 1 adds `_isPersonalView()` (say so in the commit).
- Native inputs; mobile verified at 390 px and 480 px; sidebar shows the same four.
- `multi-agent-review` before the push; full suite at release.
- The floating PT/Personal pill (`#mobile-view-switcher`) is left as it is (Claude's call: lowest risk; it is also the coach-side way in);
  More gains "Switch to PT view" beside it.
- Today's "Up next" in the mock-up is the dashboard's `My calendar` upcoming list; it is dropped for solo (Task 3).

## Review Focus

1. **A retired page's button that no longer has a way in** (New plan, assign, Save to library, add exercise, goal steps, calendar moves): the affordance table in Task 1 must name a home for each, and Task 6's spec clicks each home.
2. **Old links and stored state** (`#library`, `#calendar`, `#goals`, `#programs`, `localStorage._activePage`, `window._progressTab` = `'Body Weight'`/`'Personal Bests'`/`'Performance'`): land on the right destination and switch, never "Page not found" or a blank tab.
3. **The master account flipping views** (coach ⇄ Personal ⇄ Client via `switchView`): the nav and Progress switches must follow the active view every time, including when a retired page was open.
4. **A coached client** (and the owner in sudo "view as client"): sees the old Progress tabs and the old dashboard exactly.
5. **Empty account** (no plan, no goals, no records, no weights, no cardio): every switch renders its own empty state, not an error.

---

### Task 1: The four-destination nav and the affordance table

**Files:**
- Modify: `js/app-core.js` (`_NAV_ITEMS.solo`, `_NAV_MORE_SOLO`, `_NAV_BOTTOM`, `renderNav`, `_openMoreSheet`, the active-tab updater near `document.querySelectorAll('.nav-item, .bottom-nav-item')`, `navigate()`'s `goals` case for solo)
- Modify: `index.html` (`?v=` bump)
- Create: `tests-node/personal-nav.test.mjs`
- Create: `docs/superpowers/plans/2026-10-31-personal-view-four-tabs-affordances.md`

**Interfaces:**
- Produces: `_soloNavParent(page: string) => 'solo-dashboard'|'workouts'|'progress'|'__more__'|null` (pure; `calendar`→`solo-dashboard`, `programs`→`workouts`, `goals`→`progress`, `library`/`settings`→`__more__`, the four themselves→themselves, anything else→`null`).
- Produces: `_isPersonalView() => boolean` (`currentProfile?.role === 'solo'`) — reuse an existing predicate if one exists.
- Produces: More sheet rows, in order: `Exercise library` (`navigate('library')`), `Settings`, `Download my data` (`downloadMyData()`), `Send feedback` (the `_feedbackMailto()` link), `Privacy policy` (`PRIVACY_POLICY_URL`, new tab), `Switch to PT view` (`switchView('coach')`, only when `window._masterAccount`), `Sign out` (`signOutAndClearDrafts({ ask: true })`).

- [ ] **Step 1: Write the affordance table** — one row per button/link on the solo `programs`, `calendar`, `library`, `goals` and `progress` pages and on the current More sheet: what it does, its new home (or "unchanged: page still reached from <parent>"). Any row without a home stops the task; ask Jake.
- [ ] **Step 2: Failing node test** `tests-node/personal-nav.test.mjs`: `_soloNavParent` maps every case above; the solo item list's labels equal `['Today','Train','Progress','More']`; coach and client item lists are byte-equal to today's (copy them into the test as literals).
- [ ] **Step 3:** Run `npm run test:unit` → FAIL (`_soloNavParent` not defined).
- [ ] **Step 4: Implement** — `_NAV_ITEMS.solo` = Today/Train/Progress/More (More is `page: '__more__'` in the sidebar too, opening the sheet); `_NAV_BOTTOM.solo` = the same list; the active marker uses `_soloNavParent(currentPage)` in Personal view; the More sheet rows as above; `navigate('goals')` in Personal view sets `window._progressTab = 'Goals'` and renders Progress. Icons: reuse `_NAV_ICONS['solo-dashboard'|'workouts'|'progress']` with label changes only, add a `__more__` icon if missing.
- [ ] **Step 5:** `npm run test:unit` → PASS; `bash scripts/checks.sh` → green.
- [ ] **Step 6: Commit** `feat(nav): Personal view has four destinations (Today, Train, Progress, More)`.

### Task 2: Train — a Workouts | Plans switch over the existing pages

**Files:**
- Modify: `js/app-workouts.js` (`renderClientWorkoutsPage` own-solo layout header; `renderWorkoutLibrary` for solo shows only the Exercise Library tab, titled `Exercise library`, with a `‹ More` back link that opens the More sheet)
- Modify: `js/app-programs.js` (`renderPrograms` page header in Personal view)
- Modify: `js/app-core.js` (one helper `_trainSwitchHtml(active: 'workouts'|'programs') => string`)
- Test: `tests/personal-nav-2026-10-31.spec.js` (created here, extended by later tasks)

**Interfaces:**
- Consumes: `_isPersonalView()`, `_soloNavParent()` (Task 1).
- Produces: `_trainSwitchHtml(active)` — two buttons `Workouts` / `Plans`, `aria-pressed` on the active one, calling `navigate('workouts')` / `navigate('programs')`; drawn at the top of both pages only in Personal view.

- [ ] **Step 1: Failing spec** — as solo (`soloReady`): Train tab active on `workouts`; switch reads `Workouts`,`Plans` with Workouts pressed; tapping Plans lands on `programs` with Train still the active tab; `navigate('library')` shows heading `Exercise library`, no `+ New template` button, no Templates tab, and the More tab active; as COACH, `workouts`, `programs` and the coach Library show no Train switch and keep `+ New template`.
- [ ] **Step 2:** Run it → FAIL.
- [ ] **Step 3: Implement** as above. The solo Workouts page keeps Create a workout, Your workouts (search, Edit, Make a copy, Start) and Recent sessions unchanged; it opens first (Train → `workouts`).
- [ ] **Step 4:** Spec → PASS; rerun `tests/` specs that call `soloNav(page, 'library'|'calendar'|'settings')` or click `[data-page="programs"|"library"|"calendar"]` in Personal view (grep `tests/`), updating each to the new path; all green.
- [ ] **Step 5: Commit** `feat(nav): Train holds Workouts and Plans; the Library is the Exercise library under More`.

### Task 3: Today — rest day, calendar under Today, quick weight log, goals snapshot

**Files:**
- Modify: `js/app-dashboard.js` (`_dashHeroHtml` rest-today action, `_dashRenderOwn` card order for `role !== 'client'`, `_dashWeightHtml` gains an inline log for the own solo page, `_dashOpenGoals`)
- Modify: `js/app-calendar-goals.js` (`renderCalendar` header: `‹ Today` back link in Personal view)
- Test: `tests/personal-nav-2026-10-31.spec.js`

**Interfaces:**
- Consumes: `_isPersonalView()`, `saveWeightLog`'s insert path (`js/app-progress.js`; extract `_insertWeightLog(clientId: string, kg: number, dateStr: string) => Promise<{ error }>` if `saveWeightLog` reads its own form ids).
- Produces: `_dashQuickWeight(clientId: string) => Promise<void>` — reads `#dash-weight-input`, converts from the user's unit with the existing unit helper, inserts today's weight, repaints the dashboard.

- [ ] **Step 1: Failing spec** — solo, a stubbed rest day: the hero says `Rest day`, shows `Next up: …` and a `Train anyway` button that starts a blank session; a stubbed training day keeps `▶ Start workout`; the `My calendar` card is gone for solo and the week card has a `Calendar` button that opens `calendar`, which shows `‹ Today` and keeps Today active; entering `80` in the weight box and tapping `Log` stores one weight row for today (cleaned up) and the card shows it; the goals card's `See all` lands on Progress › Goals; as CLIENT the dashboard still shows `Log a workout`, `My calendar` and no weight input.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** — `Train anyway` for `ctx.role !== 'client'` (same `startWorkoutRunner(cid)` as `Log a workout`); `_dashCalendarHtml` omitted for the own solo page; `Calendar` button in `_dashWeekHtml`'s head for the own solo page; inline input `type="number" inputmode="decimal"` + `Log` in the weight card, empty/zero/non-numeric refused with a message (0 is its own case); `_dashOpenGoals(false)` sets `_progressTab='Goals'` and navigates to `progress`.
- [ ] **Step 4:** Spec → PASS; dashboard specs (`tests/dashboard-rework-2026-10-03.spec.js` and any grep hit on `dash-calendar`) green or updated for solo only.
- [ ] **Step 5: Commit** `feat(today): rest day says Train anyway; calendar opens from Today; log weight from Today`.

### Task 4: Progress — Goals, Records, Weight, Cardio (solo entry point)

**Files:**
- Modify: `js/app-progress.js` (new `renderPersonalProgress(el)`; `renderProgress` delegates to it when `_isPersonalView()`; `renderClientPerformance(clientId, el, opts)` gains `opts.categories` and keeps it across its own refresh)
- Test: `tests/personal-nav-2026-10-31.spec.js`; `tests-node/personal-nav.test.mjs` (tab mapping)

**Interfaces:**
- Produces: `_personalProgressTab(stored: string|undefined) => 'Goals'|'Records'|'Weight'|'Cardio'` (pure: `undefined`→`Goals`, `'Body Weight'`→`Weight`, `'Personal Bests'`/`'Performance'`/`'1RMs'`/`'Benchmarks'`→`Records`, the four names→themselves, anything else→`Goals`).
- Produces: `renderPersonalProgress(el) => Promise<void>` — switches `Goals`, `Records`, `Weight`, `Cardio`; Goals = the existing Goals branch; Records = `renderClient1RMs` then `renderClientPerformance(.., { categories: ['strength','body_metric','benchmark'] })` then `renderPerformance` (per exercise / per session); Weight = `renderProgressWeight`; Cardio = `renderClientPerformance(.., { categories: ['cardio'] })`.
- Consumes: `_isPersonalView()`.

- [ ] **Step 1: Failing node test** for `_personalProgressTab` (every mapping above).
- [ ] **Step 2: Failing spec** — solo: Progress opens on Goals; switches read exactly `Goals, Records, Weight, Cardio`; a tagged cardio record (insert + clean up) shows under Cardio and NOT under Records; a tagged strength record shows under Records and not Cardio; adding a record from Cardio re-renders Cardio still filtered; Records contains the per-exercise / per-session views; `window._progressTab='Body Weight'` opens Weight; as CLIENT the tabs are still `Body Weight, Personal Bests, Performance, Goals`.
- [ ] **Step 3:** Run both → FAIL.
- [ ] **Step 4: Implement** as above; chart teardown (`_destroyManagedCharts`) on every switch, as `renderProgress` does.
- [ ] **Step 5:** Both → PASS; `tests/` specs that touch Progress tabs in solo (grep `_progressTab`, `Personal Bests`, `Performance`) green or updated for solo only.
- [ ] **Step 6: Commit** `feat(progress): Personal view's Progress is Goals, Records, Weight and Cardio`.

### Task 5: Old links, stored state and view switching

**Files:**
- Modify: `js/app-core.js` (`navigate`, `switchView` paths if needed)
- Test: `tests/personal-nav-2026-10-31.spec.js`

**Interfaces:** Consumes `_soloNavParent`, `_personalProgressTab`.

- [ ] **Step 1: Failing spec** — solo: `page.goto('/#library')`, `/#calendar`, `/#goals`, `/#programs` each land on a real page with the right tab active (Goals lands on Progress › Goals); `localStorage._activePage='goals'` then reload lands on Progress › Goals; master account: on `calendar` in Personal view, `switchView('coach')` shows the coach nav (6 items, Calendar active or coach dashboard), and back to Personal shows four.
- [ ] **Step 2:** Run → FAIL where routing is missing; implement the missing cases; → PASS.
- [ ] **Step 3: Commit** `fix(nav): old Personal-view links and saved pages land on their new homes`.

### Task 6: Prove every rehomed affordance, docs, review

**Files:**
- Test: `tests/personal-nav-2026-10-31.spec.js` (one assertion per affordance-table row: its new home exists and is clickable)
- Modify: `docs/decisions.md` (the four-destination decision; the 2026-09-07 D2 More sheet superseded), `docs/architecture.md` (nav section), `docs/roadmap.md` (MVP 7 done), the Solo review plan's MVP list, `index.html` versions
- [ ] **Step 1:** Add the affordance assertions; run the spec → PASS.
- [ ] **Step 2:** `/mobile-check` at 390 and 480 px (bottom bar four items, More sheet rows reachable above the bottom nav, Today's inline weight input usable); `/feature-audit`.
- [ ] **Step 3:** `bash scripts/checks.sh`; the specs named in Tasks 2–5 plus `tests/personal-programs.spec.js`, `tests/dashboard-rework-2026-10-03.spec.js`, `tests/error-capture-2026-09-19.spec.js` → green.
- [ ] **Step 4:** `multi-agent-review` (diff mode); fix findings; push.
