# End of block: a review and the next block (Personal view)

**Date:** 2026-11-07 · **Status:** proposal, awaiting Jake's notes and approval · **Origin:** Solo MVP item 8, "Plan complete: a review and the next block"
(`docs/superpowers/plans/2026-10-29-solo-product-review.md`). Jake picked it as the next piece on 2026-11-07 and asked Claude to propose rather than interview him.
The Blocks table shipped in v2026.11.1 is the heart of the review.

## Intent and why

Today a plan that finishes just stops: it drops off Today, the adherence line vanishes, and nothing says "that block is done, here is how it went, here is what
next". For a person training alone, that moment is where they drift or restart on autopilot. It is also the best moment to show them progress: the Blocks
table already compares this block with the last one lift by lift. The coach side already has "Assign next block" in the client cockpit; the Personal view has nothing.

## What it does (Claude's proposal, Jake has not confirmed any of it)

1. **A hint in the last week.** When the current plan is in its last week and nothing is booked after it, Today shows one quiet line under the plan: "Last week of
   your block. Ends Sunday." with a "Plan next block" link. No other change to Today.
2. **A "Block complete" card on Today, once the plan has ended** and nothing newer is booked, until a next plan exists or the person taps "Not now" (which hides it
   until the next Monday). It shows, in this order:
   - the headline: "Your 12-week block finished on Sunday 2 Nov", and the number of sessions done against planned ("34 of 36, 94%");
   - up to three lifts that improved most, each "117 → 123 kg (+6.0)", from the same engine as the Blocks table; "See everything" opens the full review;
   - one sentence on body weight if they weighed in at the start and end of the block ("Body weight 82.4 → 81.1 kg");
   - two buttons: **Repeat this plan** and **Choose another plan**, and a quiet "Not now".
3. **Repeat this plan** books the same plan to start the Monday after the block ended (the existing "Add to my plan" sheet, pre-filled and confirmed, nothing
   saved until they tap Confirm). **Choose another plan** opens the same sheet with the plan list and the same start date.
4. **The full review** (reached from the card, and later from Train › Plans next to each finished block): this block against the previous block, using the
   Blocks table and week-by-week overlay unchanged, with the adherence figure and a one-line summary on top.
5. **Personal view only** in this piece. Coaches keep "Assign next block" in the client cockpit; clients of a coach see no change.
6. **No SQL.** Everything is read from tables the app already reads (client_programs, program_phases, workout_logs, weight_logs). Nothing new is stored on the server.

## Goals

- The end of a block is noticed, reviewed in under a minute, and turns into a booked next block in two taps.
- Every number agrees with a screen the person has already seen (the Blocks table, the adherence line): same engines, no second formula.
- A person who ignores it loses nothing and is not nagged.

## Non-goals (not in this piece)

- Choosing or generating the next plan for them, or adjusting loads from how the block went (V3 on the roadmap).
- Push or email reminders (V2). Volume per muscle (V2). Coach and client views.
- Changing how plans are assigned, restarted or cloned.

## Anti-goals

- **A card that fires too early or on a plan that never really ran.** A plan shorter than 2 weeks, or one with no logged sessions in it, gets no review.
- **A claim the data cannot back.** If there is no previous block, the card says so ("First block: nothing to compare yet") and shows adherence only; it never
  invents a change. A lift trained in only one block shows no change (as in Blocks).
- **Nagging.** One card, dismissible, back only on the next Monday while no next block exists; never a pop-up, never blocking the runner.
- **Two plans at once confusing it.** "Finished" means the plan that is current by the existing rule (`_currentAssignment`), not any plan whose end date has passed.
- **Booking something by accident.** Nothing is written until the person confirms the start date on the existing sheet.

## Constraints

- Vanilla JS, no build, no new module, `?v=` bump. Reuse `_currentAssignment`, `_dashPlanAdherence` (asked about the plan's last day), `_loadProgramBlocks`,
  `_blockWindowsFor` and `_blockLiftSummary` (given the finished block and the one before it as the two windows). New pure helper(s) with `node:test` tests.
- Weights follow the person's unit (kg or lb). Mobile first, 390 px, no sideways scroll, 44 px tap targets.
- The "Not now" memory is per device (`localStorage`), because nothing server-side exists for it; a second device shows the card once more. Accepted.

## Decided by Claude, for Jake to overrule

- Card on Today, not a pop-up or a separate page first; full review one tap away.
- "Repeat this plan" starts the Monday after the block ended, not today.
- "Not now" hides the card until the next Monday.
- A review needs a plan that ran at least 2 weeks and had at least one logged session.
- The three "most improved" lifts are ranked by percentage change, weight-and-reps lifts only (the Blocks rule).

## Settled after the builder check (Claude's calls, 2026-11-07; Jake can overrule)

- **The block's end is the plan's last Sunday** (the later of its length and its last week with a planned session, as `_dashPlanAdherence` works it out). The
  review is frozen to that window: `_loadProgramBlocks` gives a live plan `end = today`, so the review clips the block's end to the last Sunday before
  building the two windows. That keeps the card's lifts identical to the Blocks table's "this block" row and stops later logging leaking in.
- **The card stays up to 4 weeks after the end**, then stops appearing (the review is still reachable from Train › Plans). Nobody is told about a block that
  ended five months ago.
- **"Sessions done against planned" is the capped adherence figure** (`_dashPlanAdherence`: an extra session in a light week does not count), labelled "planned
  sessions done", so it agrees with the adherence line they already see. A raw count of logged sessions is not shown.
- **"Repeat this plan" only appears if the plan can still be booked** (the plan exists and has at least one session). Otherwise only "Choose another plan" shows.
  The start date is the Monday after the end if that is today or later, else the next Monday (never a date in the past); the sheet's existing overlap and
  duplicate checks stay in force.
- **A block earns a review** when it ran at least 2 calendar weeks and the person logged at least 3 sessions inside it. A plan abandoned after one session, or
  never started, gets no card and no hint.
- **A plan with no start date, no sessions, or no end week gets neither the hint nor the card** (there is no "last week" to point at).

## Left to the builder

- The exact wording of the card and the hint, within the plain-English style of the existing Today.
- How to find the "previous block" when the finished one was a restart of the same plan (use the Blocks rule: the previous run of any plan, trimmed so no day is in both).
- Where "See the review" lives in Train › Plans.
