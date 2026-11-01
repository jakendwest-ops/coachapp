# Performance: Lifts and Blocks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** Performance's pills become Lifts · Sessions · Blocks; Lifts shows one lift's estimated-1RM chart in plain words; Blocks shows "this block vs last block" per lift plus the week-aligned overlay.

**Architecture:** Re-use what exists in `js/app-progress.js`: `_loadProgramBlocks` (plan runs as blocks), `_blockWeekIndex`, `_ptsInBlock`, `_renderBlockComparison` (the overlay), `_pbE1rmPoints` (e1RM per session, the runner's engine), `_renderMetricChart`, `_fetchExerciseSessions`, `_buildExerciseSeries`. New code is a thin layer: pure helpers for the block summary and the 6-week fallback windows, a Lifts view, a Blocks summary section, the pill rename with a stored-tab migration.

**Spec:** `docs/superpowers/specs/2026-10-31-performance-charts-design.md` (goals 1-2, amended 2026-11-01) and `2026-10-31-strength-trend-and-block-comparison-design.md`. Mock-up approved by Jake 2026-11-01 (two screens, his real bench data). Merging lift names is a later piece; his merge list is in the charts design.

## Global Constraints

- Vanilla JS, no build; bump `?v=` for `js/app-progress.js` and `css/main.css` (the commit hook does it).
- One e1RM engine: `_xsSessionMetrics(sets).e1rm` via `_pbE1rmPoints`. No second formula.
- Reads of growing tables use `_fetchAllRows`; destroy managed charts before replacing (`_destroyManagedCharts`).
- Weight units follow the person's preference (`fmtWeight`, `weightToPref`).
- A block is a DATE WINDOW: labels say "sessions logged between X and Y", never "from this plan".
- No SQL, no new tables, no `log.*` PII. Pills must never scroll sideways at 320-390 px (existing `chip-row-fit chip-row-3`).
- Tapping targets 44 px.

## Review Focus

- A lift trained in only one block: shown as "not trained this block" / "new this block", never as a change.
- One session only: the point and "one session so far", no line.
- Zero e1RM sessions (bodyweight, cardio, timed): the lift is offered with its own measures, not a blank chart.
- Two plans running at once (overlapping windows): "this block" is the most recently started run; "last" is the previous run of ANY plan.
- Solo, coached client and master-account Client/Personal switching mid-load (tokens), empty history.
- Old stored tab names ('Per exercise', 'Per session', 'Per training plan') still open the right pill.

---

### Task 1: Pure helpers with node tests

**Files:** Modify `js/app-progress.js`; Create `tests-node/blocks-summary.test.mjs` (uses `tests-node/load-app.mjs`).

**Interfaces:** Produces
- `_blockWindowsFor(blocks, today)` -> `{ a, b }` (this, last), each `{ start, end, label, source: 'plan'|'weeks' }`. Plan runs when present (a = newest start, b = the previous run of any plan); otherwise `a` = last 42 days to `today`, `b` = the 42 days before.
- `_blockLiftSummary(exercises, a, b)` -> `{ both: [{ name, last, this, delta, pct }], onlyLast: [{ name, last }], onlyThis: [{ name, this }] }` where each value is the best session e1RM inside the window (`_ptsInBlock` over `_pbE1rmPoints`), delta = this - last, pct to 1 dp; lifts with no e1RM in either window are left out.

- [ ] Step 1: write failing tests: plan-run windows pick newest and previous-of-any-plan; no-plan fallback gives two 42-day windows ending today and the day before the other starts; a lift in both windows gets delta and pct; one-sided lifts land in `onlyLast`/`onlyThis`; a zero-e1RM lift is omitted; an empty history gives all empty lists. Run `npm run test:unit`, expect FAIL (undefined).
- [ ] Step 2: implement both functions (top-level, so the harness reaches them).
- [ ] Step 3: run unit tests, expect PASS. Commit.

### Task 2: Pills Lifts · Sessions · Blocks and the stored-tab migration

**Files:** Modify `js/app-progress.js` (`renderPerformance` pill labels, `_perfTab` migration, dispatch); update the specs that name the old pills (about 63 mentions in 11 files; `grep -l "Per exercise\|Per training plan\|Per session" tests`).

**Interfaces:** `window._perfTab` is one of 'Lifts', 'Sessions', 'Blocks'. A stored 'Per exercise' / '1RMs' / 'Progressions' becomes 'Lifts'; 'Per session' / 'Recent sessions' becomes 'Sessions'; 'Per training plan' becomes 'Blocks'.

- [ ] Step 1: add a spec in `tests/personal-nav-2026-10-31.spec.js`: the Performance pills read Lifts, Sessions, Blocks and an old stored name opens the matching pill. Expect FAIL.
- [ ] Step 2: rename the labels, extend the migration line, keep the three-pill row (`chip-row-fit chip-row-3`).
- [ ] Step 3: update every spec that clicks or asserts the old pill names to the new names (behaviour unchanged). Run each touched spec; all PASS. Commit.

### Task 3: Lifts view

**Files:** Modify `js/app-progress.js` (`renderProgressStrength`/`_renderPerfExerciseList` path), `css/main.css` only if needed; Create `tests/performance-lifts-2026-11-01.spec.js`.

**Interfaces:** Lifts shows a lift picker with the existing search and the 1M-All range, one lift open at a time (default: the most recently trained). Chart title by measure: "Estimated 1-rep max" (e1RM), "Heaviest set", "Total weight lifted", "Average weight per rep", "Total reps"; a one-line explainer with which way is good; "+N kg since <first date in range>"; the best point circled and labelled with its date and set; one "Show" select replaces the metric pills; the per-session tiles stay with plain labels. One session: the point and "one session so far".

- [ ] Step 1: failing spec (seeded `[E2E-LIFTS]` rows, own fixtures): the title and explainer text, the since-change line for a 3-session lift, "one session so far" for a 1-session lift, the Show select lists only measures with data, no sideways scroll at 390/360/320.
- [ ] Step 2: implement; keep every control the old Per exercise had (search, range, expand-all list).
- [ ] Step 3: PASS; mutation-check the since-change line and the one-session rule; commit.

### Task 4: Blocks view

**Files:** Modify `js/app-progress.js` (`renderProgressPerProgram`, `_renderBlockComparison`); Create `tests/performance-blocks-2026-11-01.spec.js`.

**Interfaces:** Blocks opens on the summary table from `_blockLiftSummary(_blockWindowsFor(...))` under a plain heading and a "sessions logged between X and Y (6 weeks each)" line; tapping a row opens the existing week-aligned overlay for that lift; the old two block pickers stay under "Choose other blocks". No plan and no history: the plain empty state.

- [ ] Step 1: failing spec: with two seeded plan runs the table shows the change and pct for a lift in both; a one-sided lift reads "not trained this block"/"new this block"; with no plan runs the 6-week wording appears; tapping a row shows the overlay; pickers still change the compared blocks.
- [ ] Step 2: implement; reuse `_renderBlockComparison` for the overlay.
- [ ] Step 3: PASS; commit.

### Task 5: Gates

- [ ] `bash scripts/checks.sh` (type ratchet for `app-progress.js`, style-literal ratchet, empty-state, Loading copy); the affected specs; mobile check at 390/360/320; `multi-agent-review` (diff mode, before the push); docs: roadmap, `docs/decisions.md` line, the charts design status. Push the branch; Jake decides the merge and release.

## Rulings made while building (2026-11-01)

- Ruling: Lifts keeps the existing fold-up list (search, 1M-All range, Expand all) rather than a one-lift picker, and keeps the measure pills rather than a "Show" select. The fold-up list is Jake's own 2026-10-04 request, and the pills are used by four specs and by the runner's shared Stats card. Cost if wrong: the mock-up showed a picker and a select; a later piece can swap them.
- Ruling: the plain-words extras (title, explainer, change since the start, marked best point) are opt-in on the shared stats card (opts.plain) so the runner's Stats sheet is untouched.
- Ruling: Blocks ignores a plan that has not started yet, and cuts the older block off the day before this one starts, so no day counts in both (found by the review). Only weight-and-reps lifts get a table row.
- Ruling: the block pickers sit under the table, always visible (not folded away), so the existing specs and controls are unchanged.
- Not built, left on purpose: merging lift names (design and Jake's name list are in the charts design), Sessions "vs last time", weekly volume, cardio over time, the weight check, the coach's client-profile tab.
