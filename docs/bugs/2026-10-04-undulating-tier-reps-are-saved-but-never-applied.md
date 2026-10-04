---
id: 2026-10-04-undulating-tier-reps-are-saved-but-never-applied
status: open
priority: low
reported: 2026-10-04
status_detail: "FOUND BY CLAUDE 2026-10-04 while building the RPE method for periodization; not seen by Jake. The Undulating periodization dialog has a 'Reps' box for each tier (Heavy / Moderate / Light, placeholders '3-5', '6-8', '10-12'). savePeriodizationConfig stores it (periodization_config.tiers.<tier>.reps) and the dialog shows it again, but generatePhasePeriodization only ever reads a tier's %1RM (_computePeriodizedPct reads tiers[tier].pct) - nothing reads .reps, so a generated week keeps the reps the coach typed in Week 1, whatever the box says. The new RPE side of the dialog deliberately has NO Reps box, so as not to add a second control that does nothing. DECISION FOR JAKE, three ways: (a) make the box work - generation would set repsMin/repsMax on the sets of a session of that tier from the box ('3-5' becomes 3 and 5); that changes what a % phase generates, so every existing Undulating phase would start rewriting reps the next time Generate weeks is pressed; (b) remove the box from the % side; (c) leave it and say so in the dialog. My recommendation: (b), unless he has been using the box as a reminder, in which case (a) for new phases only. UNVERIFIED: whether any of his real phases has reps typed in these boxes."
closing_conditions: "Jake picks a, b or c, and it is built (or recorded as deliberately left)."
---

# Undulating periodization: the Reps boxes are saved but never applied

**Closes when:** see `closing_conditions`.

Found while reading `generatePhasePeriodization` for the RPE method (2026-10-04). Nothing in `js/` reads a tier's `reps` after it is saved.
