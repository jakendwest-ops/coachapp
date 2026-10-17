---
id: 2026-10-11-a-weight-of-0-is-not-recorded-or-shown-like-any-other-weight
status: confirmed
priority: high
reported: 2026-10-11
status_detail: "CONFIRMED by Jake 2026-10-17 on his phone (the phone-check checklist, item R5). FIXED 2026-10-11, LIVE in v2026.10.1 (app-runner v114, app-progress v78); awaiting Jake's look on a phone. Red before, green after: tests/runner-zero-weight-and-finish-2026-10-11.spec.js (stats formatters in kg and lb, a 0 saved as 0 and shown on the finish screen and remembered next session, a 0 next to a weighted set). Fourteen deliberate breakages each turn a test red. Jake's answer: '0 should be logged as 0' (not BW)."
---

# A weight of 0 is not recorded (or shown) like any other weight

## Jake's report (verbatim, 2026-10-11)

> If a weight entry is entered as 0 then this is not saved properly in the runner/progress. 0 can still be a weight, for example when performing a bodyweight exercise. Please make 0 be recorded the same way that any other weight entry is.

He attached screenshots of the runner's Stats sheet for an exercise: the Sessions list shows `Fri 9 Oct` as "9 reps @0 RIR · 6 reps @0 RIR · 5 reps @0 RIR" and `Tue 29 Sept` as "8 reps · 6 reps", both with no kg, while `Fri 25 Sept` reads "15 kg · 2.5×6 · 5 reps". He selected the `Tue 29 Sept` row. His answer to the follow-up question: "0 should be logged as 0".

## What was wrong

The database already held the 0: read-only against his account, Tricep Dip is stored as 0 x 9, 0 x 6, 0 x 5 on Fri 9 Oct and 0 x 8, 0 x 6 on Tue 29 Sept. What dropped it was every place that SHOWS or REMEMBERS a logged weight with a truthy test:

- the runner's grey number in the next session: `weightToPref(0)` is the NUMBER 0 in kg, which the `||` chain read as "no value" and replaced with the word "kg" (in lb it is the string "0", so the same set was remembered in one unit and forgotten in the other);
- the Workout complete screen (`s.weight && ...`);
- the Stats sheet, My progress and the Last time line (`_xsSetText`, `_xsSetSpaced`, `_xsSetWithUnit` printed "9 reps" for a 0 kg set);
- the wizard's logged-set list and the "Beat" strip (the legacy non-table path).

## What changed

Those nine sites now use `_hasNumVal` (a real 0 counts, only a missing weight is "no weight"), and the grey number is `String(weightToPref(...))`. Records stay weighted-only: a 0 kg "heaviest set" or estimated 1RM means nothing, so those are unchanged. A PRESCRIBED weight of 0 (template builder, library summaries, runner template defaults) was left and is named in `docs/technical-debt.md`; `scripts/count-baseline.json` ("weight truthy test") pins the count so a new site cannot appear.

## Related

The same-day report [a session done on an unscheduled day](2026-10-11-session-done-in-the-runner-on-an-unscheduled-day-may-not-save-or-be-remembered.md): this is very likely what he saw.

**Closes when** Jake confirms on his phone that a 0 kg set reads "0 kg × 9" on the finish screen and in Stats, and that the next session's grey number for it is 0.
