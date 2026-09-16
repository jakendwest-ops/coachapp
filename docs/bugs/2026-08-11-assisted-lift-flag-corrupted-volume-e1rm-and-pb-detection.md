---
id: 2026-08-11-assisted-lift-flag-corrupted-volume-e1rm-and-pb-detection
status: closed
priority: critical
reported: 2026-08-11
closed_by: tests/assisted-lift-removed-2026-08-11.spec.js
status_detail: "CLOSED 2026-09-15 via closure rule (b): tests/assisted-lift-removed-2026-08-11.spec.js asserts _cleanTemplateSets drops assisted/assistWeight even when handed them explicitly — the exact removal this critical row required, and a real live scan already confirmed zero historical sets carried the flag, so no data repair was owed."
---

# The assisted-lift flag was unreachable AND sign-flipped logged weight

The "Assist" toggle in the template set editor only rendered when `s.assisted` was ALREADY true, so
there was no control that could switch it on — the only route in was hand-editing `sets_json`.

Worse, had it ever been on: the runner did `if (ex.assisted) setData.assistWeight = weight`, treating
the typed number as the ASSIST load while still writing it to `workout_log_sets.weight_kg` unchanged.
A pull-up with 20kg of band assistance — genuinely **-20kg** of external load — would have persisted
as **+20kg lifted**, then fed volume totals, e1RM estimates and PB detection. Sign-flipped, silently.

A live count found ZERO sets carrying the flag (52 template exercises scanned), so there is no history
to repair. Fix-forward. Removed 4 builder lines and 6 runner references.

Genuine assisted loading is a legitimate feature — it needs a signed-load model, not a boolean that
inverts the meaning of an existing column while sharing its storage.

Fixed `d09db2b`. Pinned by `tests/assisted-lift-removed-2026-08-11.spec.js` (2 tests).
