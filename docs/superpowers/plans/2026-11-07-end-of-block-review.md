# End-of-block review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox syntax. No SQL, no ownership or RLS change, so `multi-agent-review` runs before the push (not before each commit).

**Goal:** In Personal view, the last week of a plan shows a quiet hint; once it has ended, Today shows a "Block complete" card (sessions done, the three most improved lifts, body weight, Repeat / Choose another / Not now) and a full review one tap away.

**Architecture:** Today (`_dashRenderOwn`, `js/app-dashboard.js`) already loads everything the card needs except the lifts: the current plan (`cp0`, by `_currentAssignment`), its planned sessions (`currentByDate`), a year of logs, the next booked plan, and `_dashPlanAdherence`. New code is a thin layer of PURE helpers (what state is the plan in, is a review due, the review model) plus two markup builders, and a lazy fill for the lifts and body weight that runs only when a card is due. The lifts come from the existing Blocks engine (`_blockLiftSummary` over `_buildExerciseSeries`), so the card and the Blocks table cannot disagree.

**Tech Stack:** vanilla JS, `node:test` (`tests-node/load-app.mjs`), Playwright, no SQL.

**Spec:** `docs/superpowers/specs/2026-11-07-end-of-block-review-design.md` (approved by Jake 2026-11-07, including the "Settled after the builder check" section). Mock-up: https://claude.ai/artifact/44HVndywoMQzJYYCEQZUWG.

## Global Constraints

- Personal view only (`role === 'solo'`): the same render function serves clients, so every new line is gated on the role; a coached client and the owner's "view as client" see no change.
- Local dates only (`_ymdLocal`), never `toISOString()`; week maths anchored like `_dashMonday` / `_dashAddDays` (DST-safe).
- Weights follow the person's unit (`fmtWeight`, `weightToPref`). 44 px tap targets, 390/360/320 px with no sideways scroll, dark mode through tokens (no hex literals: the style-literal ratchet).
- A failed read never shows a card or a hint (`d.failed['your training plan']`, and the lazy reads fall back to showing adherence only, never an invented change).
- No `log.*` with names or weights. Bump `?v=` for each changed module.
- Settled in the spec: block end = the plan's last Sunday; the card stays up to 4 weeks after it; "done" is the capped adherence figure; a review needs the plan to have run at least 2 calendar weeks and at least 3 logged sessions inside it; "Repeat this plan" only when the plan can still be booked, start = the Monday after the end if that is today or later else the next Monday; no card or hint for a plan with no start date, no sessions or no end week; "Not now" hides the card until the next Monday, kept in `localStorage` per device.

## Review Focus

- Two plans at once or a plan booked after: "finished" is the plan `_currentAssignment` says is current, and nothing booked after it (`cpNext` null) is required for both the hint and the card.
- A restarted plan: the archived block's `end` is the day Restart was pressed, not the plan's last Sunday; the review must clip to the last Sunday and trim the previous block so no day is in both.
- The hint on the plan's last Monday and Sunday, the card on the Monday after, on day 28 and on day 29.
- A plan with a planned rest in its last week (the last week with a SESSION decides the end, as `_dashPlanAdherence` does).
- No previous block, a lift only in one block, every lift down, a lift with no e1RM: the card shows adherence only and says why, never a made-up change.
- `localStorage` throwing or full; a second device; the card after "Not now" on Monday.
- Pounds (a +2.5 kg change shown in lb), zero logged weight, a very long plan name.
- Lazy fill racing a re-render (the dashboard repaints on every write): a token guard, and nothing written into a replaced node.

---

### Task 1: Pure helpers and node tests

**Files:** Modify `js/app-dashboard.js`; Create `tests-node/block-review.test.mjs`.

**Interfaces:** Produces
- `_dashPlanEndSunday(progByDate, planStart, totalWeeks)` -> `'YYYY-MM-DD'` or `null`: the Sunday of the plan's last week (the later of its length and its last week with a session). `_dashPlanAdherence` is changed to use it, so the two cannot disagree.
- `_blockEndState({ planStart, endSunday, hasNext, logDates, todayStr })` -> `{ state: 'none'|'last-week'|'ended', endSunday, daysSinceEnd, loggedInBlock }` applying every rule above except dismissal.
- `_blockReviewModel({ endSunday, planStart, totalWeeks, currentByDate, logDates, summary, canRepeat, todayStr })` -> `{ doneOf: {done, due, pct}, improved: [{name, last, this, delta, pct}] (up to 3, by percent, weight-and-reps lifts with delta > 0), firstBlock: boolean, repeatStart: 'YYYY-MM-DD' }`.

- [ ] Write failing tests first: end Sunday for a 12-week plan and for a plan whose last week has no session; every boundary of `_blockEndState` (last Monday, last Sunday, Monday after, day 28, day 29, a 1-week plan, 2 weeks exactly, 2 logged vs 3 logged sessions, `hasNext`, no start date, no sessions); `_blockReviewModel` top three by percent with ties broken by name, none improved, no previous block (`firstBlock`), `repeatStart` on a Monday, a Wednesday and a day long after the end. Run `npm run test:unit`: expect FAIL (undefined).
- [ ] Implement; extract `_dashPlanEndSunday` from `_dashPlanAdherence` and re-run the existing dashboard specs that cover adherence. PASS; mutation-check the 28-day edge and the 3-session rule. Commit.

### Task 2: The hint and the card on Today

**Files:** Modify `js/app-dashboard.js`, `css/main.css`; Create `tests/block-review-2026-11-07.spec.js`.

- [ ] Builders `_dashBlockHintHtml(state)` and `_dashBlockCardHtml(model, { loading })` (every string through `escapeHtml`, plan name included). Slots: the hint under the header, the card above the Today hero.
- [ ] In `_dashRenderOwn` (solo only), after the first render: when `_blockEndState` says `ended` and the "Not now" key allows it, draw the card with adherence at once, then fill the lifts and the body-weight line: `_loadProgramBlocks` + `_buildExerciseSeries` (+ two small `weight_logs` reads: the first weigh-in from the plan's start week and the last on or before the end), clip the block's `end` to the last Sunday, `_blockWindowsFor` for the two windows, `_blockLiftSummary`. Token-guarded; a failed read leaves the adherence-only card with no lift rows.
- [ ] "Not now": `localStorage` key `coachapp.blockReview.<clientId>.<planStart>` = the Monday it may reappear; try/catch around every access.
- [ ] Specs (stubbed reads, no database): hint appears only in the last week and only with nothing booked; card appears the Monday after, not on day 29, not with a next plan, not for a coached client; rows and the "since" figures agree with `_blockLiftSummary`; first-block copy; "Not now" hides and reappears next Monday; lb unit; a failed lift read still shows adherence; 390/320 px no sideways scroll. Red first.
- [ ] Commit.

### Task 3: Repeat this plan, Choose another

**Files:** Modify `js/app-programs.js` (`showAssignProgramModal`, `saveAssignProgram`).

**Interfaces:** `showAssignProgramModal(clientId, opts)` gains `opts.programId` (preselect) and `opts.blockReview` (a one-line note: "Starts the Monday after your block ended. Nothing is saved until you confirm."). Repeat passes `programId` of the finished plan and `repeatStart`; Choose another passes `repeatStart` only.

- [ ] Find out and write down what `saveAssignProgram` does today when the person re-adds the SAME plan (the existing restart prompt and `assign_program` with `p_restart`, which archives the finished run as a block): the review stays reachable from the Blocks page afterwards. Test it end to end on an `[E2E-BLOCKREVIEW]` fixture (real database), torn down with `.select('id')` and a row-count assertion.
- [ ] Repeat is hidden when the plan no longer exists or has no sessions; the start date is never in the past; the existing overlap checks stay.
- [ ] Specs: Repeat preselects the plan and prefilled date; Choose another lists plans; Confirm books it; the card disappears and the Blocks page shows the finished run. Red first. Commit.

### Task 4: The full review

**Files:** Modify `js/app-progress.js`, `js/app-dashboard.js`; extend `tests/block-review-2026-11-07.spec.js`.

- [ ] "See everything" sets the Performance › Blocks state to the finished block against the previous one (`window._perfTab = 'Blocks'`, `_blockState` a/b keys) and navigates to Progress. A short header on the Blocks page when it was opened from the review: the plan name, its dates, "N of M planned sessions done". The Blocks table and overlay are unchanged.
- [ ] Specs: the header numbers equal the card's; the table's "this block" row equals the card's lifts; a normal visit to Blocks shows no header. Commit.
- [ ] (Only if low risk once Task 3 is in) a "See review" link on each finished plan in Train › Plans.

### Task 5: Gates and release

- [ ] `bash scripts/checks.sh`; every spec touched; mobile check at 390/360/320 px with screenshots; feature audit; `multi-agent-review` (three angles, diff mode, before the push); docs (roadmap, current sprint, decisions, the solo review's lifecycle row); push; Jake decides the release.
