---
id: 2026-10-11-a-weight-of-0-is-not-recorded-or-shown-like-any-other-weight
status: open
priority: high
reported: 2026-10-11
status_detail: "OPEN. Reported by Jake 2026-10-11, not yet investigated. May also be what the same-day report about a session 'not remembered' was actually about."
---

# A weight of 0 is not recorded (or shown) like any other weight

## Jake's report (verbatim, 2026-10-11)

> If a weight entry is entered as 0 then this is not saved properly in the runner/progress. 0 can still be a weight, for example when performing a bodyweight exercise. Please make 0 be recorded the same way that any other weight entry is.

He attached screenshots of the runner's Stats sheet for an exercise: the Sessions list shows `Fri 9 Oct` as "9 reps @0 RIR · 6 reps @0 RIR · 5 reps @0 RIR" and `Tue 29 Sept` as "8 reps · 6 reps", both with no kg, while `Fri 25 Sept` reads "15 kg · 2.5×6 · 5 reps". He selected the `Tue 29 Sept` row. The runner's "Last time" strip for the same exercise read "9 Oct · 3 sets, Top set 15 kg × 4 @0 RIR".

## Related

The same-day report [a session done on an unscheduled day may not be saved or remembered](2026-10-11-session-done-in-the-runner-on-an-unscheduled-day-may-not-save-or-be-remembered.md): a 0 kg set would show no grey weight next time, which could read as "not remembered".

## What would close it

**Closes when** a test that fails before the fix and passes after: a set entered with weight 0 is saved as 0 and is shown and remembered (Last time, grey ghost text, the Stats sheet, My progress) the way any other weight is. Or Jake confirming it on his phone.
