# Progress section audit (2026-11-17)

An audit only: no app code was changed, and nothing here is approved to build. Each backlog item needs Jake's go-ahead on its own.

**Scope:** My Progress (`js/app-progress.js`); goals (`js/app-calendar-goals.js`); the runner's PR and stats code that feeds them (`js/app-runner.js`, `js/app-workouts.js` `_estimate1RM`); the progress tiles on the dashboard (`js/app-dashboard.js`); and the coach's client-profile tabs (`js/app-clients.js`).

**How it was checked**
- Every function named here was read in full at commit `187bb04`.
- The running app was driven by a throwaway Playwright probe at 480 px wide, then deleted:
  - **Client:** the e2e client account, all four tabs and all three Performance sub-tabs, in kg and in lb. The lb run switched `window._unitPrefs.weight` in the page only, with no database write.
  - **Solo:** the e2e PT in Personal view, all five tabs, in kg and lb.
  - **Results:** no page errors and no horizontal overflow on any screen.
- **Limits:**
  - The solo test account has no logged data, so solo was checked for structure only.
  - The client account has 13 weigh-ins and a handful of probe sessions.
  - No account with months of real training was available, so long-history behaviour is argued from the code. Jake's own account is the real test.
- **Known issues are cited, not rediscovered:**
  - `docs/bugs/2026-11-17-weight-chart-range-pill-can-show-the-wrong-chart.md`
  - `-progress-chart-registry-keeps-destroyed-charts`
  - `-progress-filters-parse-date-only-strings-as-utc`
  - `-weight-goals-save-reports-success-without-a-row-count`
  - `-lift-name-helpers-ship-but-are-never-called`
  - `2026-08-17-progress-renders-missing-clientid-and-host-guards`
  - `2026-08-30-expandperfsessionexercise-leaks-a-chart-on-repeated-expand`
  - `2026-07-05-test-the-my-progress-strength-tab-on-live-with-real-data`
  - `2026-07-29-per-exercise-unit-override`
- **Competitor claims** are from general knowledge and were **not verified** for this audit.

---

## Plain-English summary

The maths underneath Progress is unusually careful. The estimated 1RM uses an RPE table, ignores warm-ups and refuses sets over 12 reps. Units convert correctly, and every "best" names the set it came from. The problem is not wrong numbers. **The section shows data and rarely answers questions.** A lifter can work out whether they are getting stronger by opening cards one at a time. Nothing on the page tells them which lifts are stalling, whether volume is right, or what to do next.

The coach's view is the weakest part. A PT looking at a client sees weigh-in tables and session diaries, but not the per-lift trend charts, the "stronger on X of Y lifts" story or the block comparison. For a 25-client roster that is the gap that matters most.

**Top 5 problems**
1. **A coach cannot see a client's lift progress.**
   - **Where:** the client profile has Weight, Performance (manual records plus a session diary) and 1RMs (`js/app-clients.js:468-541`).
   - **What is missing:** Lifts, Blocks and the 6-week story exist only on the client's own Progress page.
2. **"Personal best" can show a number lower than the person's best.**
   - **Why:** the 1RM list shows the newest saved entry, not the highest (`app-progress.js:53, 103, 216`).
   - **Example:** re-test after an injury, save 140 under a 160, and the page says "Personal best 140 kg".
3. **The weight chart's "7-day avg" is a 7-entry average.**
   - **Why:** it averages the last 7 entries (`_rollingAvg`, `:3241`).
   - **Effect:** for weekly weigh-ins that is a 7-week average. On the test client it runs about 1 kg above the real line (seen at 480 px).
   - **Also:** every chart spaces sessions evenly whatever the gap between them (a category axis, `:3332`), so a 3-week break is invisible.
4. **Goals and training data disagree, and goals cannot project.**
   - **Hand-updated goals go stale:** the test client's "Lose 5kg" goal reads 88 kg while the Body Weight page above it reads 85.6 kg. The goal is not linked, and nothing nudges the user to link or update it.
   - **Lift goals track the wrong number:** they follow the heaviest set, never an estimated 1RM, so "Deadlift 200 kg" moves only on a heavy single.
   - **No ETA:** only body weight gets an "on course for…" line.
5. **No answer to "what should I focus on next?"**
   - **What exists:** one card, "Stronger on X of Y lifts, N stalled", at the top of Lifts.
   - **What is missing:**
     - volume per muscle group;
     - a weekly or monthly summary;
     - load or volume guidance;
     - a stall alert anywhere outside that card.

**Top 5 quick wins**
1. Make the 1RM list's "Personal best" the highest entry. Keep "latest test" as a second line.
2. Make the 7-day average a real 7-day average, or rename it "7-entry average". Give the client and solo weight chart the coach's 1M / 3M / 6M / All pills.
3. Leave sessions with no sets out of the Sessions list's 10 cards. On the test client, 8 of the 10 cards read "No sets logged".
4. Show the 6-week "Stronger on X of Y lifts" card on the dashboard and on the coach's client Performance tab.
5. On a hand-updated goal whose unit matches body weight or a lift, offer a "Track automatically" prompt. Show "Last updated N days ago" in amber after 14 days.

---

## Primary questions: can a typical user answer them?

| # | Question | Answer today | Why |
|---|---|---|---|
| 1 | Am I getting stronger? | **Partly** | The "Last 6 weeks: stronger on X of Y lifts" card (`_liftStoryHtml`, `:3076`) answers it, but only for 6 weeks, only on the Lifts sub-tab (3 taps deep), and only for weight-and-reps lifts with 2+ sessions in the window. Nothing answers it over 3 or 12 months. |
| 2 | Which lifts are progressing? | **Partly** | The same card ranks lifts by % change, top 8 only. Each folded lift card shows "Best top set: X" (`_perfXsSummary`, `:3819`), which is an all-range best, not a trend. |
| 3 | Which have stalled? | **Weakly** | "Stalled" = 4+ sessions in 6 weeks and the last 3 set no new best (`_liftStory`, `:3070`). A lift trained once a week never qualifies (at most 6 sessions, and needs 4 in the window). A lift that went backwards is shown as a negative %, not flagged. |
| 4 | Am I building muscle? | **No** | There are no body measurements, no muscle-group volume, and no hard-set counts per muscle. Progress photos were removed (`:1-12`). Body weight and BF% are the only body data. |
| 5 | Am I progressing towards my goals? | **Partly** | Linked goals update live (`_goalsApplyLive`, `app-calendar-goals.js:818`). Hand-updated goals go stale (seen live: 88 vs 85.6). There is no ETA except body weight, and no goal history chart. |
| 6 | Is my volume increasing appropriately? | **Weakly** | Sets per week and kg per week bars exist (`_weeklyVolume`, `:1873`), totalled across all lifts. There is no per-muscle or per-lift weekly volume, no target band and no trend line. "Appropriately" is not answerable. |
| 7 | What should I focus on next? | **No** | No recommendation, lagging-lift flag or next-target suggestion anywhere in Progress. |
| 8 | How does this block compare to previous blocks? | **Yes, with caveats** | Blocks opens on "This block vs last block" with the best e1RM per lift (`_blockSummaryHtml`, `:2884`), plus an overlay chart by week number. Caveats: a block is a date window, not a programme join (`:2562`); weight-and-reps lifts only (`:2724`); the picker lists every restart as its own block (seen live: dozens of one-day "blocks" on the test client). |
| 9 | Is my programme working? | **Partly** | The end-of-block card on Today (`_dashBlockCardHtml`, `app-dashboard.js:426`) shows adherence and which lifts went up. Mid-block there is no "on track" signal. |
| 10 | What evidence supports my progress? | **Yes** | This is the section's strength. Every best names its set and date (`_xsRecordRows`, `:3621`). Every session's sets are listed under the chart. The Sessions tab compares set by set against last time (`_sessionCompare`, `:1836`). |

---

## Audit by area

### 1. Exercise progression

**Calculation engine (accurate, well-tested).**
- One function produces every per-session number: `_xsSessionMetrics` (`:2420`), shared by the runner's Stats sheet and the Lifts cards.
- Warm-ups and cool-downs are excluded (`_countableSets`, `:1711`).
- Top set ties go to more reps.
- e1RM comes from `_estimate1RM` (`app-workouts.js:146`):
  - a single with no RPE, or at RPE 10, is measured, not estimated;
  - an RPE- or RIR-tagged set uses the RTS table (`:116-129`);
  - any other set uses Epley, capped at 12 reps.
- That is better than most competitors, which commonly use plain Epley or Brzycki on every set (general knowledge, unverified).

| Metric | Exists | Accurate | Understandable | Useful | Notes / improvement |
|---|---|---|---|---|---|
| Top weight per session | Yes (Lifts card "Heaviest set") | Yes | Yes, with an explainer (`_XS_MEASURES`, `:3513`) | Yes | — |
| Reps / sets per session | Yes (strip tiles, session list) | Yes | Yes | Yes | — |
| Session volume (tonnage) | Yes ("Total weight lifted") | Yes for loaded lifts | Yes | Moderate | Bodyweight sets count 0 kg (a pull-up adds nothing). Unilateral volume sums both sides. Both are defensible, but neither is said on screen. |
| Average load (intensity) | Yes ("Average weight per rep") | Yes | Explained | Low | Rarely actionable on its own. Better as relative intensity (% of e1RM). |
| Best set / biggest set | Yes (records) | Yes | Yes | Yes | — |
| Best session | Yes ("Best session volume") | Yes | Yes | Moderate | — |
| Weekly volume | Yes (Sessions bars, sets or kg) | Yes, working sets only, no cardio (`:1873`) | Yes | Moderate | All lifts in one bar. No per-muscle or per-lift split. |
| Monthly volume | **No** | — | — | — | — |
| Frequency | Weekly streak on Today only | — | — | — | No per-lift frequency ("Squat 1.8×/week"). No sessions-per-week trend. |
| RPE / RIR progression | Shown per set (`_xsEffortText`, `:3466`); block average on Blocks (`_avgEffortRpe`, `:3485`) | Yes | Yes | Low | No effort trend chart, so "same load at lower RPE" (a key strength signal) cannot be seen. |
| Volume progression | Per lift (Volume pill) | Yes | Yes | Moderate | — |
| Density (work per minute) | **No** | — | — | — | The finish screen shows duration, but Progress never reads it. |
| Rep PRs (best weight at N reps) | Yes, on a 1RM lift page only ("Best sets by reps", 1/3/5/8/10, `_bestSetsByReps`, `:165`) | Yes | Yes | High | Hidden behind Records → a lift. Not on the Lifts cards where people look at a lift. |

**Gaps that change decisions**
- **Lifts are listed alphabetically** (`_buildExerciseSeries`, `:3149`).
  - All cards start folded, and there is no sort by recently trained, most trained or biggest change.
  - With 40 exercises the main lifts are buried.
  - Seen live: the probe exercises' names sorted above Bench Press.
- **The folded header shows the best in the range**, never the direction.
  - "Best top set: 95 kg × 3" reads the same for a lift going up as for one going down.
  - The direction ("+5 kg since 1 Jan", `_xsPlainFacts`, `:3522`) only appears once a card is opened.

### 2. Trend visualisation

**Charts are evenly spaced by session, not by time.**
- The x-axis is a category axis (`_renderMetricChart`, `:3332`): no time scale.
- Two sessions three weeks apart sit as close as two sessions two days apart.
- So the chart can show neither a training gap nor a rate of progress per week, and a plateau and a lay-off look the same.
- This applies to every chart in the section: weight, lifts, 1RM history, e1RM, cardio and blocks.

**Other misleading or hidden things**
- **"7-day avg" on both weight charts** (`:964`, `:2361`).
  - **What it is:** `_rollingAvg(arr, 7)` (`:3241`) averages the last 7 entries, not 7 days.
  - **Effect:** for weekly weigh-ins it is a 7-week average that lags well behind the real line.
  - **Seen live** at 480 px on the client account: the dashed line sits about 1 kg above the latest weigh-ins.
- **The client and solo weight chart has no range control** (`renderProgressWeight`, `:2328`). It draws the whole history, while the coach's version has 1M / 3M / 6M / All (`:896`). After a year of daily weigh-ins the client chart is a smear.
- **Automatic bucketing** (`_aggregateSeries`, `:2539`).
  - Past 40 points the non-strength charts switch to one point per week, and past 120 to one per month.
  - The switch is driven by point count, not by the range picked, and nothing on screen says it happened.
  - The week key is described as "ISO-week" but is not ISO (`_bucketKey`, `:2526-2531`).
- **The coach's weight "CHANGE" tile** colours a gain red and a loss green (`:823`), whatever the client's goal. That is wrong for every client who wants to gain. The client-facing card gets this right (`_weightGoalCardHtml`, `:2203`).
- **The y-axis on the lift chart has no unit.** Seen live: ticks "60 … 65" with the unit only in the caption.
- **The e1RM is shown to the whole kg** (`_xsInt`). Fine for a 200 kg lift; coarse for a 30 kg overhead-press accessory, where a 0.6 kg real gain shows as "no change" in the strip.

**Can users spot improvement, regression, plateaus, fast gains and low periods?**
- **Improvement:** yes, per card.
- **Regression:** per card only, as a negative %.
- **Plateau:** only through the "Stalled" pill, with the limits in Q3 above.
- **Fast-gain periods:** no; there is no rate.
- **Low periods:** no; the even spacing hides gaps.

### 3. Time ranges

| Range | Lifts | Weight (client/solo) | Weight (coach) | Sessions | Blocks |
|---|---|---|---|---|---|
| 7 days | No | No | No | 8-week bars, step by week | — |
| 30 days | 1M | No | 1M | — | — |
| 90 days | 3M | No | 3M | — | — |
| 6 months | 6M | No | 6M | — | — |
| 12 months | 1Y | No | No | — | — |
| Multi-year | All | All (only option) | All | — | — |
| Custom | **No** | No | No | No | Any two blocks |

**Comparisons**
| Comparison | Exists? |
|---|---|
| Session vs session | **Yes, good:** set-by-set "Change" column (`_setChange`, `:1782`) |
| Week vs week | Bars only, no delta |
| Month vs month | No |
| Block vs block | Yes |
| Year vs year | No |

The Lifts range is a `<select>` at the top. It filters the charts but not the records, which stay all-time on purpose (`:3350`). That is right, but the card does not say so.

### 4. 1RM: actual and estimated

There are **three separate "best" systems**, and the user is not told how they relate:

1. **Saved 1RMs** (`client_1rms`).
   - Typed in, or estimated from one set, on Records → Add lift (`_showOneRMDetailModal`, `:278`).
   - Append-only, and "the newest row per lift is the best" (`:53`).
   - Used for %1RM prescription in the runner.
2. **Estimated 1RM from logged sets** (`_pbE1rmPoints`, `:181`, and the Est 1RM pill), computed live.
3. **Manual "PB / performance records"** (`performance_logs`, `renderClientPerformance`, `:481`).
   - Free-text name, value and unit, under the 1RM list on the same page.
   - Its "Strength" category overlaps (1) completely.

| Aspect | Actual 1RM | Estimated 1RM |
|---|---|---|
| Tracked | Yes (manual entry) | Yes (automatic from every logged session) |
| Accurate | Value yes. **Label no:** the list shows the newest entry as "Personal best" (`:103`, `:216`), so a lower re-test replaces a higher best, with a "−" pill. | Yes (see §1) |
| Explained | "Tap a lift for its history, best sets by reps and estimated 1RM" | Yes: names its source set ("Est. 1RM works from your best set: 65 × 8", `:3663`) |
| Trended | Best-history chart on the lift page (`:254`) | Per-session chart on the lift page and the Lifts card |
| History | Dated list with delete | Every session |
| PR highlighting | No | Best point marked with a larger dot on Lifts cards (`:3773`). The runner's finish screen marks a **weight-only** PR (`isPr`, `app-runner.js:3339`): a rep PR (100 × 8 after 100 × 5), an e1RM PR or a volume PR is never celebrated. |
| Reconciling the two | "Logged best ≈ X" appears on the list when logged sets beat the saved 1RM by over 0.5 kg (`_showLoggedBests`, `:124`); the lift page says "Logged sets point to X above the recorded best" (`:237`). Good, but there is no one-tap "Use this as my 1RM". | — |

**"How much stronger than 3 or 12 months ago?"** No screen states it.
- The user must open a lift, set the range to 3M, and read "+X kg since [date]".
- That is the change since the first session in the range, not since the date 3 months ago. If the lift was not trained exactly then, it is a different comparison.
- Across all lifts at once: impossible.

### 5. Goals

**Creating the five example goals**
| Goal | Can it be made? | Auto-updates? | Notes |
|---|---|---|---|
| "Deadlift 200kg by Christmas" | Yes: Weight, track from a lift's heaviest set, From/To, date | Yes, from the **heaviest set logged since the goal was created** (`_prBaseline` with `since`, `app-runner.js:3251`) | It moves only on a heavier set at any reps, not on an e1RM: 190 × 3 (≈ 209 e1RM) leaves the bar at the previous top set. "From" must be typed in; it is not pre-filled from the current best. |
| "Squat 180kg" | Yes, same | Yes | Same caveat |
| "Bench 140kg" | Yes, same | Yes | Same caveat |
| "Gain 5kg bodyweight" | Only as an absolute target (From 80, To 85): no "+5" form | Yes, from the latest weigh-in | — |
| "Reach 90kg" | Yes | Yes | — |

**Progress display**
- **Bar, current of target, amount to go and % are shown** (`goalCard`, `app-calendar-goals.js:892`; `openGoal`, `:1098`).
- **Time left is shown** ("21 weeks left", `_goalTimeLeft`, `:793`).
- **No ETA or required rate on lift goals.** Nothing says "at your current rate you reach 200 kg in March", or "you need +1.2 kg a week".
  - Only body weight has a projection: "on course for your goal around …" (`_weightTrendHtml`, `:2175`).
  - That line sits on the Bodyweight page, not on the goal.
- **No chart of a goal's history.** A linked goal is never written back (`:805-807`), so it has no history at all; a hand-updated goal has a list of updates.
- **Steps with a number tick themselves** (`_goalStepReached`, `:784`): a good touch.

**Integration**
- **Linked goals feel integrated** and say "Updates automatically".
- **Hand-updated goals feel disconnected.**
  - Seen live on the test client: "Lose 5kg · 88 of 85 kg · 3 kg to go · No updates yet · 86 days past due", while Body Weight two taps away shows 85.6 kg (goal reached).
  - Nothing prompts the user to link it, update it, or mark it done.
- **A coached client cannot add goals** (`_canManageGoals`, `:746`). That is a deliberate decision, but it means a client with an idea for a goal has no route to suggest one.
- **The unit is fixed at creation.** A goal made in kg stays in kg if the account switches to lb; its card then shows kg beside lb everywhere else. This is consistent, but it is a mixed-unit screen.

### 6. Bodyweight

**What a user can see**
- current weight;
- change since the start;
- a bar to the goal, with amount to go;
- the 4-week trend rate, by regression, which is the right maths (`_weightTrend`, `:2162`);
- an "on course" date;
- a chart with BF% on a second axis;
- a month-grouped list with deltas coloured by goal direction (`_weightListHtml`, `:2227`);
- a resting-HR chart.

**What is missing**
- weekly and monthly averages;
- a real 7-day average (see §2);
- a range picker;
- rate as % of body weight per week (the standard cut and bulk guidance);
- any link to performance, such as strength-to-weight ratio, or "lost 4 kg and kept your squat".

**Logging is close to friction-free.**
- **Progress page:** a slide-up sheet with a ± stepper, pre-filled with the last weight (`_weightSheetHtml`, `:2121`).
- **Today card:** a one-box quick log in Personal view (`_dashQuickWeight`, `app-dashboard.js:693`).
- **Coach view:** the old 3-column form (`renderClientWeight`, `:825`), which is inconsistent with the client view.

### 7. Volume and tonnage

| Level | Exists | Correct | Transparent |
|---|---|---|---|
| Set | Yes (weight × reps in every list) | Yes | Yes |
| Exercise per session | Yes ("Total X kg → Y kg" in session compare, `:1970`) | Yes | Yes |
| Session | Yes (tiles: Sets, Reps, Volume, Exercises, `:2044`) | Yes, working sets only | The tile says "Volume" with no hint that warm-ups and bodyweight are excluded |
| Weekly | Yes (bars) | Yes | The caption says "Working sets… cardio and intervals left out" (`:1912`) |
| Monthly | No | — | — |

**Adequacy by level**
- **Beginner:** adequate. Total sets and kg are enough.
- **Intermediate and advanced:** inadequate. They plan volume in **hard sets per muscle group per week**. The app has no muscle-group data on logged exercises in Progress, and no counting of sets by effort (for example RPE ≥ 7 or RIR ≤ 3).

### 8. Performance comparison

| Comparison | Status |
|---|---|
| Session vs session | **Strong:** set-by-set pairing, unilateral sides paired separately (`_pairSets`, `:1825`), verdicts like "Improved / Fewer sets / Mixed" |
| Week 1 vs week 4 of a block | Yes, through the Blocks overlay (x-axis = week of block, `_blockWeekIndex`, `:2665`) |
| Block vs block | Yes |
| This programme vs the previous one | Yes, only as date windows. A programme with no start date has no window and is dropped (`:2610`). |
| This year vs last year | No |

**Live issues on the Sessions tab**
- **Empty sessions fill the 10 slots.** The list takes the newest 10 sessions including empty ones (`:2017`, `:2048`). On the test client, 8 of the 10 cards were "No sets logged" abandoned starts, so real sessions were pushed off with no way to page further back.
- **Two sessions on the same day compared with each other** ("vs Sun 2 Aug: same total kg"). It is technically correct, but it is noise.

### 9. Coaching insight

**Insight the page creates**
- the 6-week lift story (stronger on X of Y; stalled count);
- session verdicts;
- "Logged best ≈" beside a saved 1RM;
- the weight trend and ETA;
- the end-of-block card.

**What is missing**
- lagging lifts relative to the others;
- fastest progressers over 3 or 12 months;
- volume sufficiency;
- effort drift (same load at a lower RPE = getting stronger);
- a weekly digest;
- coach-side alerts ("Sam's bench has stalled for 4 sessions").

Mostly, the section displays data.

### 10. UI / UX

**Navigation (taps from the dashboard)**
- My lifts: Progress → Performance (the client lands on Body Weight; solo lands on Goals) → Lifts → open a card = **3-4 taps**.
- Rep PRs: Progress → Personal Bests / Records → a lift = **3 taps**, on a different page from the lift's trend.
- **Two tab sets for one feature:**
  - **Client:** Body Weight / Personal Bests / Performance / Goals (`:1443`).
  - **Solo:** Goals / Records / Performance / Bodyweight / Cardio (`:1521`).
  - Different names, order and defaults for the same content.
- **The coach's client profile is a third layout:** Weight / Performance / 1RMs as separate tabs, with no Lifts, Blocks or story (`app-clients.js:468-541`).

**Discoverability**
- Rep PRs, the e1RM history, and the Blocks pickers are hard to find.
- "Best sets by reps" lives only on the Records lift page.
- The weekly volume bars live on Sessions, not on Lifts.

**Visual hierarchy**
- **Client:** opens on Body Weight, so the first thing a lifter sees is the scale, not their training.
- **Solo:** opens on Goals, which for a new user is an empty state.
- **Lifts:** the most decision-relevant card (the 6-week story) is only on the Lifts sub-tab.

**Consistency**
- **Two chart styles survive.** The coach weight tab is a table with inline styles; the client tab uses the newer card-and-sheet design.
- **The manual PB form** (`:505-545`) is the old inline-styled form under the new 1RM list on the same page.
- **"PB" means three things:** the gold badge on performance records, the 1RM list title, and the runner's 🏆 PR.

**Clarity**
- Good explainers on each Lifts measure (`_XS_MEASURES`).
- The lift chart's y-axis has no unit.
- "Intensity" is jargon even with its explainer.

**Data storytelling**
- The story card is good but narrow.
- Nothing says "what got worse" or "what stayed the same" across lifts, except the "Stalled" pill.

**Actionability**
- A user cannot decide from this page whether to add load, hold, change volume, or focus on a lagging lift. The Sessions "vs last time" column is the only per-set nudge.
- The runner has RPE top-set autoregulation (`docs/superpowers/specs/2026-09-29-rpe-top-set-autoregulation-design.md`), but Progress does not reflect any of that logic back.

**Mobile at 480 px (checked live)**
- No horizontal overflow on any tab.
- Chips fit, cards fold, and tap targets look adequate.
- The weight chart reads well.
- The lift chart is 90-120 px tall (`:3018`, `:3936`): readable but cramped for a long history.
- The Blocks pickers are full-width native selects; with many restarts the block list becomes a very long native list (seen live).

**Cognitive load**
- Moderate and well managed by folding.
- The Records page is the exception: the 1RM list, a "Log a PB / performance record" form with four categories, and records lists stacked into one scroll, on a page also named "Personal Bests".

### 11. Competitor comparison (general knowledge, unverified)

| Capability | CoachApp | Hevy | Strong | Alpha Progression | RP Hypertrophy | Boostcamp | TrainHeroic |
|---|---|---|---|---|---|---|---|
| Per-exercise charts (weight, e1RM, volume) | Yes | Yes | Yes | Yes | Limited | Yes | Yes |
| Rep-max table (best at 1-10+ reps) | Partly (1/3/5/8/10, hidden) | Yes | Yes ("Records") | Yes | — | Yes | Yes |
| Rep / e1RM / volume PRs celebrated in-session | Weight only | Yes | Yes | Yes | — | Yes | Yes |
| Sets per muscle group per week | No | Yes | Partly | Yes (core feature) | Yes (core feature) | Yes | Partly |
| Muscle heat map / body diagram | No | Yes | No | Yes | No | Yes | No |
| Load / rep progression suggestions | Runner only (RPE top set) | Basic | No | **Yes, core** | **Yes, core** (feedback-driven) | Programme-driven | Coach-driven |
| Body measurements beyond weight | BF% only | Yes | Yes | Yes | — | Yes | Partly |
| Progress photos | Removed | Yes | Yes | — | — | — | — |
| Time-proportional charts | No | Yes | Yes | Yes | — | Yes | Yes |
| Weekly / monthly summary report | No | Yes (monthly report) | Partly | Yes | Yes (mesocycle review) | Partly | Yes (coach reports) |
| Coach roster view of athlete progress | Session counts and weigh-ins only | — | — | — | — | Partly | **Yes, core** |
| Block / mesocycle comparison | **Yes, good** | No | No | Partly | Yes | Partly | Partly |
| Set-by-set "vs last time" | **Yes, excellent** | Yes (previous column) | Yes | Yes | Yes | Yes | Yes |
| RPE-aware e1RM | **Yes** (rarer) | No | No | Partly | n/a | No | Partly |

**Where competitors are clearly better:**
- muscle-group volume (Alpha, RP, Hevy);
- in-session PR celebration of every PR type (Hevy, Strong);
- coach dashboards across athletes (TrainHeroic);
- automatic progression advice (Alpha, RP);
- time-scaled charts (all of them).

**Where CoachApp is ahead:**
- the block comparison;
- the set-level session diff;
- the RPE-aware estimate;
- the honesty about where every number came from.

---

## Scores (out of 10)

| Area | Score | Reasoning |
|---|---|---|
| **Overall** | **5.5** | Excellent foundations and honest numbers, let down by weak synthesis, a thin coach view and fragmented navigation. |
| Data Accuracy | **8** | One engine for e1RM and records, warm-ups excluded, careful date and unit handling (lb checked live, no errors). Lost marks: the "7-day" average is 7 entries; the 1RM list's "Personal best" is the latest, not the highest; known open bugs (range pill, chart registry, UTC date parse). |
| Exercise Progression | **6.5** | Rich per-lift cards and records. Alphabetical folded list, direction hidden until opened, no per-lift frequency or RPE trend. |
| Goal Tracking | **5.5** | Linked goals are good, and steps tick themselves. No lift-goal ETA, no e1RM option, hand goals go stale (seen live), no goal history chart. |
| 1RM Tracking | **5** | History and chart exist, but the "Personal best" label is wrong after a lower re-test, it is split from the PB records, and there is no PR highlighting. |
| Estimated 1RM Tracking | **8** | RPE-aware, rep-capped, names its source set, trended per session and per block. Only on opened cards and lift pages; whole-kg rounding. |
| Volume Tracking | **5** | Sets and kg per week and per session are correct, but there is no per-muscle volume, no monthly view and no target band, which rules it out for intermediate and advanced use. |
| Tonnage Tracking | **6** | Correct at set, exercise, session and week level. Bodyweight and unilateral handling are not explained on screen. |
| Analytics & Insights | **4** | One 6-week story card and session verdicts. No stall alerts elsewhere, no lagging lifts, no digest, no long-horizon answer. |
| Navigation | **4.5** | 3-4 taps to a lift, rep PRs on a different page, and three different tab layouts for client, solo and coach. |
| Discoverability | **4** | Key views (rep PRs, weekly volume, block pickers) are buried; the best card hides on a sub-tab. |
| Clarity | **6.5** | Good plain-words explainers. A missing axis unit, "Intensity", and "PB" meaning three things cost marks. |
| Consistency | **4.5** | Old and new UI side by side (coach weight tab, PB form), different tab names per role, a goal-blind red/green on the coach weight tile. |
| Data Storytelling | **4.5** | The story card and the end-of-block card are the right idea, but too narrow and too hidden. |
| Mobile Experience | **7** | No overflow at 480 px, folding cards, sheet-style logging, quick weight on Today. Short charts and long native block lists. |
| Actionability | **3** | Almost nothing tells the lifter or coach what to change. |
| Long-Term Tracking | **4.5** | All history is kept and paged (no 200-row loss). No year-on-year view, no custom range, an evenly spaced axis that hides lay-offs, and silent bucketing past 40 points. |
| Overall UX | **5** | Pleasant per screen, and fragmented across screens and roles. |

---

## Critical Missing Features
1. **Coach view of a client's lift progress.** Lifts cards, the 6-week story and Blocks are missing from the client profile (`app-clients.js:535-541`).
2. **Volume per muscle group per week.** This is the standard hypertrophy planning metric.
3. **Long-horizon strength answer.** "e1RM now vs 3 / 6 / 12 months ago" across all lifts on one screen.
4. **Goal projection.** An ETA and a required weekly rate for lift goals, plus e1RM as a lift-goal source.
5. **Complete PR detection in the runner.** Rep PRs, e1RM PRs and volume PRs, not just the heaviest weight (`app-runner.js:3333-3339`).

## Critical UX Problems
1. Three tab layouts for one feature (client `:1443`, solo `:1521`, coach `app-clients.js:468`).
2. The "Personal best" label shows the latest 1RM entry, not the highest (`:103`, `:216`).
3. The evenly spaced x-axis hides gaps and rate (`:3332`).
4. "7-day avg" is 7 entries (`:3241`); seen live lagging about 1 kg.
5. Empty sessions crowd out real ones in the 10-card Sessions list (`:2017`; seen live, 8 of 10).
6. The Records page mixes the 1RM list with an older free-form PB form and its own "PB" badges (`:505-545`).

## High Impact Improvements
1. A **Progress overview** screen: strength (e1RM change, 3M / 12M, top movers, stalled), volume this week vs a 4-week average, body weight trend and goals, each tapping through.
2. **Time-scaled x-axis** on all progress charts (Chart.js time scale), showing gaps honestly.
3. **Muscle-group volume**, from a muscle tag on library exercises, carried onto logged exercises the way `metric_type` already is.
4. **Coach roster progress column:** per client, "stronger on X of Y lifts (6 wks)" and a stalled count, from the same `_liftStory`.
5. **Unified records:** the lift page and the Lifts card show the rep-PR table, saved 1RM, e1RM and logged best together, with "Use as my 1RM".

## Quick Wins
1. "Personal best" = the highest entry; "Latest test" as a second line (`:103`, `:216`).
2. A real 7-day average (by date), or rename it. Add the range pills to the client and solo weight chart (`:2328`).
3. Leave "No sets logged" sessions out of the 10 Sessions cards (`:2017`).
4. Units on the lift chart's y-axis (`_xsDraw`, `:3779`).
5. Sort the Lifts list by most recently trained, with A-Z as an option (`:3149`).
6. Show the direction ("+5 kg since …") in the folded card header (`_perfXsSummary`, `:3819`).
7. Coach weight tile: colour by the client's goal direction, as the client card does (`:823`).
8. A "Track automatically" nudge, plus a staleness hint, on hand-updated weight-unit goals.

## Competitive Gaps
- Muscle-group volume and a heat map (Hevy, Alpha, RP).
- In-session PR celebration of every PR type (Hevy, Strong).
- Automatic progression advice from progress data (Alpha, RP).
- Body measurements and progress photos (Hevy, Strong).
- A monthly or weekly report (Hevy).
- A coach-side multi-athlete progress dashboard (TrainHeroic).
- Time-scaled charts (all of them).

---

## Recommended Development Backlog

| # | Title | Problem | Proposed Solution | User Benefit | Complexity | Priority (1-10) |
|---|---|---|---|---|---|---|
| 1 | Coach sees client lift progress | The client profile has no Lifts, story or Blocks (`app-clients.js:535-541`) | Add a "Progress" tab on the client profile reusing `renderProgressStrength` / `renderProgressPerProgram` with an explicit clientId | The PT can coach from data, for all 25 clients | Medium (the renders read `_getCurrentClientId`; each needs a clientId parameter, and RLS reads need a review) | 10 |
| 2 | Personal best = highest | A lower re-test replaces the best on the list and lift page | Pick the max entry for "Personal best"; show the latest separately; keep append-only storage | A trustworthy PB | Low | 9 |
| 3 | Real 7-day average + weight range pills | The average is 7 entries; the client and solo chart has no range | Average by date window; reuse the coach pills (fixing the open range-pill bug at the same time) | An honest trend line | Low | 8 |
| 4 | Strength overview card | "Am I stronger than 3 / 12 months ago?" is unanswerable | Per lift: best e1RM in the last 4 weeks vs the same 4 weeks 3 and 12 months ago; top movers and stalled; on Progress and the dashboard | Answers Q1-3 at a glance | Medium | 9 |
| 5 | Time-scaled chart axis | Gaps and rate are invisible | Chart.js time scale in `_renderMetricChart` (needs the date adapter from the cdnjs allowlist) | Plateau vs lay-off becomes visible | Medium | 7 |
| 6 | Full PR detection in the runner | Only weight PRs are celebrated | Rep PR (best weight at ≥ N reps), e1RM PR and volume PR on the finish screen, from `_xsRecords` | Motivation, and parity with Hevy and Strong | Medium | 7 |
| 7 | Lift goal projection + e1RM source | No ETA; e1RM progress is ignored | Add "track from estimated 1RM"; regress the last 6 weeks for an ETA and required rate, as `_weightTrend` does | Goals feel alive and realistic | Medium | 8 |
| 8 | Muscle-group volume | No hypertrophy volume answer | Tag library exercises with primary and secondary muscles; carry the tag onto logged exercises; weekly hard sets per muscle with an optional target band | An intermediate or advanced lifter can plan | High (schema, library backfill, SQL) | 8 |
| 9 | Unify the tab layouts across roles | Three layouts for one feature | One tab set and default for client and solo (and the coach's Progress tab from #1); Records absorbs the old PB form | Less confusion, one design to maintain | Medium | 7 |
| 10 | Sessions list hygiene | Empty sessions take the 10 slots; there is no paging | Skip sessions with no sets; add "Show older" paging | Real history is visible | Low | 6 |
| 11 | Lifts list: sort and direction | Alphabetical and folded; direction hidden | Default sort by last trained; a folded header with ▲/▼ since the range start | Faster answers to Q2 and Q3 | Low | 7 |
| 12 | Better stall detection + lagging lifts | "Stalled" misses weekly-frequency lifts; no "lagging" notion | Stall = no new e1RM best in the last 3 sessions or 3 weeks; lagging = lowest 12-week % change among main lifts; surface it on the overview and to the coach | Answers Q3 and Q7 | Medium | 7 |
| 13 | RPE trend per lift | "Same load, lower RPE" is invisible | An "Effort" pill on lift cards: average top-set RPE per session | A strength signal before the load moves | Low | 5 |
| 14 | Stale-goal nudges | Hand goals drift (seen live) | Offer auto-tracking; an amber "not updated in N days"; "looks reached — mark done?" when body weight passes the target | Goals stay true | Low | 6 |
| 15 | Body measurements | Weight and BF% only | An optional measurements sheet (waist, arms, chest, thighs) beside weight, charted the same way | Answers "am I building muscle?" | Medium (schema) | 6 |
| 16 | Weekly / monthly digest | No summary | A Today card each Monday: sessions vs plan, sets vs last 4-week average, PRs, weight change | Insight without digging | Medium | 6 |
| 17 | Coach weight tile goal-aware colour | Gain is always red | Colour by the client's goal direction | Correct signal for bulking clients | Low | 4 |
| 18 | Year-on-year and custom range | No YoY, no custom dates | Add "This year vs last year" to Blocks; a custom-range option on Lifts | Long-term context | Medium | 4 |
| 19 | Block picker dedupe | Every restart is its own block (seen live) | Group the restarts of one programme; hide runs under 7 days behind "Show all" | A usable block comparison after many restarts | Low | 5 |
| 20 | Close the open Progress bug rows | Nine open rows cited at the top | Fix with red-green tests per the ledger rule | Accuracy debt cleared | Low-Medium | 6 |
