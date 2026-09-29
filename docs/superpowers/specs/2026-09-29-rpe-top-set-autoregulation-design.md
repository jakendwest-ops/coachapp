# RPE top set → live e1RM → autoregulated backoff sets

**Date:** 2026-09-29
**Status:** Approved for planning
**Owner:** Jake (CoachApp)

## Why

Jake's golden path, in his words:

> My workout calls for 1 top set of 3 reps @ RPE 8. The calculator will then give me a predicted /
> estimated 1rm (e1rm). Once I have logged that set I need to do n sets of n reps with n% of my
> estimated 1 rep max.

This is standard top-set/backoff autoregulation: the working load for the day is not fixed in
advance, it is derived from what the lifter actually produced on the top set *today*. The app can
express neither half of it right now.

## What exists today (verified by reading the code, 2026-09-29)

| Piece | Where | State |
|---|---|---|
| %1RM authoring | `intensityMin`/`intensityMax` per set-row, labelled "Intensity (%1RM)" (`js/app-workouts.js:2020`) | Ships. Always resolves against the client's **stored** 1RM. |
| %1RM → weight | `_calcWeightFromPct(oneRM, pct)` (`js/app-runner.js:3180`) | Ships. Floors to nearest 2.5. |
| Stored 1RM lookup | `_lookupClientOneRM` (`js/app-runner.js:2480`), `client_1rms` fetched once at session load (`js/app-runner.js:43`) | Ships. Append-only table, newest row per exercise wins. |
| 1RM estimation | `_estimate1RM(weight, reps)` (`js/app-workouts.js:106`) | Ships. Epley, capped at 12 reps, `r===1` returns the weight unchanged. |
| Manual estimate | `showRunnerOneRMSheet` "Estimate from a set" (`js/app-runner.js:3189`) | Ships. User-triggered, weight+reps only, **RPE-blind**. |
| Effort *prescription* | `effortType` (`'rpe'`/`'rir'`) + `effortMin`/`effortMax` in `sets_json` | Ships. Display only — never feeds any calculation. |
| Effort *capture* | `effort_value`/`effort_type` on `workout_log_sets` | **Only from the manual Log Session modal.** The in-gym runner captures no effort at all — see the gap below. |

**The three gaps:**

0. **The runner cannot capture an RPE at all.** Discovered 2026-09-29 while planning, after this
   spec was first approved — it had assumed the top set's effort value was already obtainable in the
   runner. It is not. The strength table has exactly two data columns, weight and reps.
   `js/app-runner.js:3038` states it outright: *"no runner logged-set shape carries `.rpe` … there
   is no effort input in the strength table at all, so the in-gym runner currently captures NO
   effort. Effort only reaches the DB via the manual Log Session modal."* A write hook is already
   parked at `:3044` for when capture is added — **and it hardcodes `effort_type: 'rpe'`**, which
   the same comment warns would re-create the 2026-08-11 RIR-displayed-as-RPE inversion if wired to
   an RIR-capable input. This is a prerequisite for everything below, not a detail.

1. **No RPE-aware estimate.** Every formula on the Wikipedia 1RM page (Brzycki, Epley, Lander,
   Lombardi, Mayhew, Wathen…) is a *to-failure* model — it assumes the set ended because it could
   not continue. "3 @ RPE 8" is explicitly two reps short of that, so feeding it to Epley
   under-predicts. RPE-aware estimation needs a reps × RPE → %1RM chart, which that page does not
   have.
2. **No way for a set to key off this session's performance.** A %1RM set can only mean "% of the
   last number saved to `client_1rms`," which may be months old and was never meant to autoregulate.

## Decisions made (brainstorming session, 2026-09-29)

- **RPE table: the standard RTS/Tuchscherer chart**, hard-coded as a lookup. Chosen over a linear
  "2.5% per rep in reserve" approximation (less accurate at the extremes) and over Jake supplying
  his own values.
- **The top set is always an exercise's first set-row.** Chosen over a free-floating "top set"
  toggle on any row — matches the golden path, avoids a control that needs explaining.
- **Runner auto-fills the backoff weights and shows the e1RM.** Chosen over silent auto-fill (the
  lifter should see where the number came from) and over a confirm-before-applying prompt (an extra
  tap on every top set).
- **An RPE-tagged single is RPE-adjusted, not treated as measured.** This narrows — deliberately —
  the 2026-09-04 "a single is not an estimate" rule. See below; this is the one existing behaviour
  this spec changes.
- **Additive and opt-in.** Every existing template keeps its exact current behaviour; nothing is
  migrated, nothing is re-interpreted.
- **Runner effort capture appears only where the coach prescribed effort** (Jake, 2026-09-29, after
  gap 0 was found). A set row gets an RPE/RIR input when — and only when — its `sets_json` carries
  `effortMin`/`effortMax`. Chosen over a top-set-only input (which would leave the runner unable to
  log a prescribed RPE on any other set) and over a third column on every strength set (largest
  change to the in-gym screen, most regression risk on a 390px phone, and nobody asked for effort on
  sets where none was prescribed). It is self-scoping: the top set always qualifies, because a
  prescribed RPE is what makes it a top set.

### The one behaviour change: RPE-tagged singles

The 2026-09-04 rule (`_estimate1RM` returns the weight unchanged at `r===1`) exists because plain
Epley credited a 100kg single as 103.33kg — 3.3% the lifter never lifted, feeding %1RM prescription
and the already-logged e1RM charts.

That rule's premise is *"a single is a demonstrated one-rep max."* An RPE-tagged single below RPE 10
falsifies that premise: at RPE 8 the lifter is stating they had ~2 more in them, so the weight is
**not** their max and returning it unchanged now under-predicts — which would under-load every
backoff set that follows.

**Resolution:** the measured-not-estimated rule still holds for a rep-1 set with no RPE, or at RPE
10. Below RPE 10, the table applies at every rep count including 1. Both halves get a unit test so
neither can be lost silently.

## The RPE table

`_RPE_PCT_TABLE[reps][rpe]` → % of 1RM. Reps 1–12, RPE 6–10 in 0.5 steps.

| reps \ RPE | 10 | 9.5 | 9 | 8.5 | 8 | 7.5 | 7 | 6.5 | 6 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 100.0 | 97.8 | 95.5 | 93.9 | 92.2 | 90.7 | 89.2 | 87.8 | 86.3 |
| 2 | 95.5 | 93.9 | 92.2 | 90.7 | 89.2 | 87.8 | 86.3 | 85.0 | 83.7 |
| 3 | 92.2 | 90.7 | 89.2 | 87.8 | 86.3 | 85.0 | 83.7 | 82.4 | 81.1 |
| 4 | 89.2 | 87.8 | 86.3 | 85.0 | 83.7 | 82.4 | 81.1 | 79.9 | 78.6 |
| 5 | 86.3 | 85.0 | 83.7 | 82.4 | 81.1 | 79.9 | 78.6 | 77.4 | 76.2 |
| 6 | 83.7 | 82.4 | 81.1 | 79.9 | 78.6 | 77.4 | 76.2 | 75.1 | 73.9 |
| 7 | 81.1 | 79.9 | 78.6 | 77.4 | 76.2 | 75.1 | 73.9 | 72.3 | 70.7 |
| 8 | 78.6 | 77.4 | 76.2 | 75.1 | 73.9 | 72.3 | 70.7 | 69.4 | 68.0 |
| 9 | 76.2 | 75.1 | 73.9 | 72.3 | 70.7 | 69.4 | 68.0 | 66.7 | 65.3 |
| 10 | 73.9 | 72.3 | 70.7 | 69.4 | 68.0 | 66.7 | 65.3 | 64.0 | 62.6 |
| 11 | 70.7 | 69.4 | 68.0 | 66.7 | 65.3 | 64.0 | 62.6 | 61.3 | 59.9 |
| 12 | 68.0 | 66.7 | 65.3 | 64.0 | 62.6 | 61.3 | 59.9 | 58.6 | 57.4 |

**Worked golden path:** 3 reps @ RPE 8 → 86.3%. A 100kg top set → e1RM 115.9kg. Backoff at 70% →
81.1kg → floors to **80kg** on the bar.

### Provenance — read this before trusting the numbers

These values are transcribed from the published RTS chart **from knowledge, not scraped from a
source**. What was actually verified is the chart's structural invariant: *X reps at RPE Y must
equal (X + (10 − Y)) reps at RPE 10*, because an RPE 8 triple and a 5-rep max are the same
performance. That check passes for every integer-RPE cell in the table above (spot-checked 14
cells across all nine columns; the half-RPE columns interpolate between their neighbours).

The invariant proves the table is internally consistent — it does **not** prove the anchor column
matches the published chart. **Jake should eyeball the RPE 10 column against a source he trusts
before this ships.** The invariant is encoded as a unit test so a later typo cannot pass silently.

## Design

### 1. `_estimate1RM` gains an optional third argument

`js/app-workouts.js:106`. One function stays the single source of 1RM estimation — this file already
paid for duplicating that logic once (four copies, consolidated 2026-07-23).

```js
function _estimate1RM(weight, reps, opts) {
  const w = parseFloat(weight), r = parseInt(reps)
  if (!(w > 0) || !(r > 0) || r > _ESTIMATE_1RM_MAX_REPS) return null
  const rpe = _effortToRPE(opts)          // {effortType, effortValue} -> RPE; RIR converts as 10 - rir
  if (rpe != null && rpe < 10) return w / (_RPE_PCT_TABLE[r][_clampRpe(rpe)] / 100)
  if (r === 1) return w                    // unchanged: untagged or RPE-10 single is measured
  return w * (1 + r / 30)                  // unchanged Epley path
}
```

- `opts` omitted → byte-identical behaviour for every existing caller (progress charts at
  `app-progress.js:1839`/`:2482`, the manual estimate sheet, builder previews). The four existing
  unit tests all call without `opts` and must stay green untouched.
- `_effortToRPE` returns null for a missing/blank/non-numeric effort value, and converts `'rir'` to
  RPE as `10 - rir` (RIR 2 = RPE 8). The two scales are already stored as one numeric field
  distinguished by `effort_type`; this is the only place the conversion is needed.
- `_clampRpe` snaps to the nearest 0.5 and clamps to 6–10. Below RPE 6 the chart has no data and the
  performance is too far from maximal to extrapolate from; clamping to 6 is honest about that.

### 2. `sets_json` gains two fields — **both must be added to the allowlist**

`_cleanTemplateSets` (`js/app-workouts.js:377`) is an explicit allowlist, and its own header comment
records what happens when a field is missed: *"the pill would appear to work, save without error,
and lose the flag — which is precisely how the cardio targets died."*

| Field | Values | Meaning |
|---|---|---|
| `isTopSet` | boolean | This row is the exercise's top set. Only ever set on row 0. |
| `intensityBasis` | `'stored'` \| `'topSet'` | What this row's `intensityMin/Max` is a percentage **of**. Defaults to `'stored'` = today's behaviour. |

Both gated on `metricType === 'weight_reps'`, the same way `amrap` and `bodyweight` already are — so
switching an exercise to Cardio/Jump/Timed cannot leave a stale `isTopSet` behind for the runner to
render nonsense from.

No migration. `sets_json` is unvalidated JSONB (`js/app-runner.js:859`); absent fields read as
undefined and fall to the defaults, so every existing template is untouched.

### 3. Program builder

- **"This is the top set"** toggle, rendered only on an exercise's first set-row. Turning it on:
  - hides that row's Weight and Intensity(%1RM) inputs — there is nothing to prescribe, the load is
    whatever gets lifted on the day
  - makes reps and effort (`effortType` + `effortMin`) the required fields — "3 reps @ RPE 8" *is*
    the prescription
  - shows inline: *"Weight isn't prescribed — logged live in the runner, then used to calculate this
    session's e1RM for the sets below."*
- **"% of:"** selector (`Last saved 1RM` / `Today's top set`) appears beside Intensity(%1RM) on rows
  2+, **only** when row 0 is a top set. Exercises without a top set render exactly as they do today.
- **Turning the top-set toggle back off** while later rows still say `'topSet'` shows a warning
  banner naming the affected rows. It must not silently revert them to stored-1RM — that would
  change a real training day's loads without the coach seeing it.

### 4. Runner: effort capture (prerequisite — gap 0)

Nothing else in this spec can work until the runner can record an RPE. Build this first.

- `_blankTableRow` gains an `effort` field; `_syncLoggedSetsFromTable` carries it through.
- The strength table renders a third input on a row **only** when that row's `sets_json` entry has
  `effortMin` or `effortMax`. Rows without a prescribed effort render exactly as they do today —
  same two columns, same widths, no layout change at all.
- The column header reads `RPE` or `RIR` from that row's `effortType`, matching how
  `_buildTargetCols` already labels the target chip (`js/app-runner.js:907`).
- **`effort_type` must be written from the prescription, never hardcoded.** The parked hook at
  `js/app-runner.js:3044` sets `effort_type: 'rpe'` unconditionally. It has to become
  `row.effort_type = <this row's effortType> === 'rir' ? 'rir' : 'rpe'`. RIR and RPE run in opposite
  directions — RIR 2 is near-maximal, RPE 2 is a warm-up — so an RIR logged as RPE does not
  mislabel the number, it inverts its meaning. That exact bug was fixed on 2026-08-11 and the
  comment at `:3042` exists specifically to stop it coming back.
- Input shape follows the Log Session modal's existing effort input (`js/app-runner.js:3378`):
  `step="0.5"`, `min="0"`, `max="10"`, placeholder `1–10` for RPE and `0–5` for RIR.

### 5. Runner

- Top-set row renders with a **TOP SET** badge, its target reps and target RPE, and an open weight
  field (nothing to prefill).
- When weight + reps achieved + effort value are all present on that row, compute
  `_estimate1RM(weight, repsAchieved, {effortType, effortValue})` and store it on
  `_runner.exercises[i]._liveE1RM` — session-local, riding the same localStorage-backed state the
  rest of the runner already uses. No new durability guarantee and no new risk: an abandoned session
  loses this exactly as it loses every other unsaved thing.
- Chip on the exercise header: **"Est. 1RM: 115.9kg"**, rendered through `fmtWeight` so it honours
  the account's kg/lb preference.
- Rows with `intensityBasis: 'topSet'` resolve their target through the **existing**
  `_calcWeightFromPct(_liveE1RM, pct)` — same floor-to-2.5 rounding as every other %1RM set.
- **Before the top set is logged**, those rows show *"Log the top set first"* — never a stored-1RM
  fallback. A plausible-looking wrong number on the bar is worse than an honest blank.
- **Editing the top set afterwards** recomputes `_liveE1RM` and re-prefills backoff rows **not yet
  logged**. Already-logged rows keep what was actually lifted (fix forward; a logged set is a
  record of fact, not a projection to be revised).

**Two cases where no e1RM is produced, both resolving to the same honest blank:**

- **The top set is logged but `_estimate1RM` returns null** — most realistically a top set taken
  past 12 reps, where the existing `_ESTIMATE_1RM_MAX_REPS` guard refuses before the RPE branch is
  reached. The backoff rows keep the "Log the top set first" placeholder wording, which is then
  slightly wrong. Use a second message for this case — *"Can't estimate from this set"* — so the
  lifter is not told to redo something they already did.
- **The lifter logs a backoff set before the top set.** Nothing blocks it: the row logs normally
  with no prefilled target, and the lifter types the weight. Logging out of order must never be
  refused — the runner already lets sets be worked in any order, and a guard that refuses a
  legitimate user is the failure mode this project has hit before.

### 6. Persistence

- Nothing writes to `client_1rms` mid-session. It is append-only and `_savePostSessionOneRM` already
  carries a `guardReentry` against duplicate rows; a mid-set write would also create rows for
  sessions that are never saved.
- At finish, the existing post-session "Save estimated 1RM" modal is **prefilled** with the
  top-set-derived e1RM when the session produced one, instead of the lifter re-entering it through
  "Estimate from a set."
- If both a manual estimate and a top-set e1RM exist for one exercise, the top-set value wins — it
  came from prescribed, logged effort.

## Testing

**Unit (`tests-node/pure.test.mjs`, `npm run test:unit`):**
- The structural invariant across the whole table: `table[r][rpe] === table[r + (10 - rpe)][10]` for
  every integer RPE where the right-hand side is in range. This is the transcription guard.
- Anchor values: 3 @ RPE 8 → 86.3%; 100kg → 115.9kg e1RM.
- RIR 2 and RPE 8 return identical results.
- RPE-tagged single (RPE < 10) adjusts upward; untagged single and RPE-10 single still return
  exactly the weight (the 2026-09-04 rule, both halves).
- The four existing `_estimate1RM` tests stay green unmodified.

**E2E (Playwright) — effort capture (gap 0), before anything else:**
- A set row whose `sets_json` has `effortMin` renders an effort input; a row without one renders the
  unchanged two-column layout. Both directions, or the "only where prescribed" rule is unproven.
- **The inversion guard:** a set prescribed `effortType: 'rir'`, logged with a value, saves
  `effort_type: 'rir'` — not `'rpe'`. This is the 2026-08-11 bug; the parked hook at `:3044` would
  fail this test as written today, which is exactly why it must exist before the hook is touched.
- A prescribed-effort row left blank saves no `effort_value` at all, rather than 0. RIR 0 is a real
  prescription meaning "to failure", so blank and zero must stay distinguishable —
  `_hasNumVal`, not a truthy check.

**E2E (Playwright):**
- **Builder round-trip:** toggle top set + set a row to `'topSet'`, save, reload, assert both fields
  survived. This is the allowlist-drop class that killed the cardio targets — the one test that must
  exist.
- **Runner golden path:** log the top set → chip appears with the expected number → backoff rows
  populate with the expected floored weights.
- **Runner before/edit:** placeholder shows before the top set is logged; editing the top set
  updates unlogged rows and leaves logged ones alone.
- **One spec runs in lb.** The suite runs in kg throughout, so an lb-only crash in the chip or the
  backoff weights would be invisible to every other test — the 2026-08-14 lb-only 1RM grid crash is
  the precedent.

**Not introduced:** no new Supabase queries and no new `coach_id` filter, so no RLS surface — effort
capture writes two already-existing columns (`effort_value`, `effort_type`) through the existing
`workout_log_sets` insert, and no `log.*` call carries a health value. `multi-agent-review` still
runs before the push per the standing rule for non-ownership work.

## Cache-bust

`js/app-workouts.js` and `js/app-runner.js` both change → bump both `?v=N` in `index.html` in the
same commit.

## Out of scope

- More than one top set per exercise (ascending singles then a backoff triple). One top set per
  exercise, row 0.
- RPE-driven estimation for cardio, jump, timed, or bodyweight exercises.
- Backfilling or re-interpreting historical logged sets that carry an `effort_value` — those stay
  display-only, exactly as they are now.
- Teaching `showRunnerOneRMSheet`'s manual estimator to collect RPE. It keeps working as-is.

## Requires Validation

- **The RPE 10 anchor column** against a source Jake trusts (see Provenance above).
- **Whether "Log the top set first" is the right empty state** in real gym use, or whether a lifter
  wants a stored-1RM-derived provisional number to warm up against. Deliberately chosen as blank
  first; revisit after a real session.
- **Whether one top set per exercise is enough** in practice for how Jake actually programmes.
