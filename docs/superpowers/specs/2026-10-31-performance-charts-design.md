# Performance charts: Lifts, Sessions, Blocks, Cardio and weekly volume

**Date:** 2026-10-31 · **Status:** design, awaiting Jake's approval · **Decided by:** Jake, in three marked-up rounds on a side-by-side review page
(today's real screens vs proposals; his saved notes are quoted below) plus multiple-choice questions.
**Builds after:** [Personal view: four destinations](2026-10-31-personal-view-four-tabs-design.md). **Sits beside:**
[Strength trend and block comparison](2026-10-31-strength-trend-and-block-comparison-design.md) (kept a separate piece by Jake; its block
comparison becomes the **Blocks** pill defined here).

## Intent and why

Jake: the Performance charts are hard to read (labels do not say what a measure is or which way is good) and views are missing. He asked
for Per exercise, Per session, cardio over time and weekly volume to be one piece of work.

## Goals

### 1. Records has three pills: Lifts · Sessions · Blocks
Under Progress' four switches (Goals, Records, Weight, Cardio), Records gets one row of three pills (Jake chose pills over one long page;
three short pills fit a phone without sideways scrolling, his round 1 note on the four switches). The names are Claude's.
- **Lifts** replaces Per exercise. **Sessions** replaces Per session. **Blocks** replaces Per training plan and is the block comparison of the
  sibling design.

### 2. Lifts: one lift's chart says what it shows
For a lift (Jake liked the proposal: "prefer the visuals on this preview"):
- a title naming the measure in plain words: **Estimated 1-rep max**, **Heaviest set**, **Total weight lifted**, **Average weight per rep**,
  **Total reps** (cardio-type exercises keep their own measures with plain names);
- a one-line explainer under it (what the measure is, which way is good);
- the **change since the first point in the range** ("+25 kg since 28 Jun");
- the best point marked and labelled;
- the per-session tiles kept, with plain labels.
- The measure choice is one **"Show"** control rather than five pills (Claude's call from his "too many pills"; not marked by him).

### 3. Sessions: compare with last time, every set
- Each session card keeps the **four coloured tiles** (sets, reps, volume, exercises; Jake: "I like the colour differentiation") and adds one
  line: **vs last time** — the previous session of the same workout — with the change in total kg and how many exercises went up; or "First
  time doing this workout".
- Tapping a session compares it with that previous session **set by set** (Jake: show how many sets, the weight and reps of each, and whether
  it improved): sets matched in order; ↑ when more weight for the same reps or more reps at the same weight, ↓ for the reverse, "not done"
  for a set missing this time; an exercise-level verdict ("improved", "fewer sets"); the exercise's total kg then and now.
- **Weekly volume** at the top of Sessions: **sets per week** for the last 8 weeks as bars, this week highlighted, with a switch to **total
  kg per week** (weight × reps summed). Working sets only. (Jake liked both.)

### 4. Cardio pill: bests first, then the trend
- **Your bests** list first, per activity and distance (Jake: "this is more clear"): today's `performance_logs` cardio records.
- Tap a best for its **trend in that sport's measure**: pace per 500 m for SkiErg and rowing, pace per km for running; "lower is faster",
  the change since the start, the best marked (Jake: keep it).

### 5. Merge duplicate lift names
Jake's real history splits lifts across spellings ("Barbell Deadlft" / "Barbell Deadlift", "Barbell hold" / "Barbell Hold", likely "Back
Squat" / "Barbell Back Squat"). A **Merge into…** action on a lift: Jake picks the name to keep; that lift's logged history then counts as
one lift everywhere these charts read. **Nothing merges without his choice** (he chose this over automatic merging).

### 6. Question an implausible weight before it saves
A 255 kg back squat set (really 255 lb) sat in his history from 2 Aug to 31 Oct and became the lift's best (ledger row
`2026-10-31-a-255-kg-back-squat-set-sets-the-best-top-set`, closed). When a set's weight is **not a multiple of 2.5 kg** or is **far above
that lift's previous best**, the app asks to confirm before saving ("That's 120 kg more than your best. Is that right?"); the person can
still save it (Jake: ask to confirm).

## Non-goals

- Weekly volume **by muscle group** (Jake: later; needs every exercise tagged).
- The e1RM trend and block comparison details (the sibling design; Jake kept it separate).
- Changing how sets are logged, beyond the confirm step in goal 6.

## Anti-goals

- **Pills that scroll sideways on a phone.**
- **Two screens disagreeing on a number** — every e1RM, best and total comes from the existing engines (`_xsSessionMetrics`, `_estimate1RM`).
- **A merge that cannot be undone or that touches another person's data.**
- **A guard that blocks a real lift.** It asks; it never refuses.
- Losing a control today's views have (the 1M–All range, search, Expand all) without a stated reason.

## Who sees it

Personal view, a coached client on their own Progress page, and a coach on a client's profile (Jake confirmed for this piece too;
see his answers below).

## Left to the builder

- Where Personal Bests' saved bests (1RMs) and the body-metric / benchmark records live inside Lifts (Claude's assumption: a "Saved bests"
  group at the top of Lifts).
- How a merge is stored (renaming logged rows vs an alias table) — must be reversible and owner-scoped.
- The exact "far above previous best" threshold.

## Jake's answers (2026-10-31, after the builder check)

- **A merge reaches everywhere**: these charts, the runner's Stats sheet and "last time" prefill, PB detection and saved bests
  (`client_1rms`) all treat merged names as one lift, so no two screens disagree. This is the bigger build: it touches the runner and the
  stored names or an alias the runner reads.
- **Who can merge**: the owner of the history (Personal view; a coached client on their own lifts) **and the coach** on a client's profile
  for that client's lifts. This is ownership/RLS work: `multi-agent-review` before the commit.
- **Reach**: everyone — Personal view, coached clients, and the coach's client profile (fitted into its existing tabs there).
  The four-tabs rule "clients see no change" applies to the NAVIGATION only; these charts reach clients by Jake's answer.
- **The weight check questions big jumps AND odd steps**: a set far above that lift's previous best, or a weight not in 2.5 kg steps (5 lb
  steps for someone set to lb), except dumbbells, bodyweight and assisted lifts. It asks; it never refuses.

## Settled from the builder check (Claude's calls; Jake can overrule)

- **"The same workout" for "vs last time"** = the same template family (`workout_templates.family_id`, which ties a plan's weekly copies of
  one workout together), falling back to the same workout name only when there is no family.
- **Working sets for weekly volume**: every set not flagged as a warm-up; drop sets count; cardio and interval sets are left out of sets and
  kg; totals follow the person's weight unit.
- **The weight check applies wherever a set is entered**, including a coach logging a session for a client.
