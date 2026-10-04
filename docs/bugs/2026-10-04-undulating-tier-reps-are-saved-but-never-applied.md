---
id: 2026-10-04-undulating-tier-reps-are-saved-but-never-applied
status: fixed-awaiting-jake
priority: low
reported: 2026-10-04
status_detail: "DECIDED BY JAKE 2026-10-04, answering the question below: 'remove' - option (b). BUILT 2026-10-04 on master, NOT released (goes out in v2026.09.15): the Reps boxes are gone from every Undulating tier, % and RPE alike; a tier is now just its %1RM (or its RPE); saving the dialog writes only that, so any reps typed earlier are dropped from the stored config the next time it is saved (nothing ever read them). Tests: the old escaping spec's Reps assertions became 'there is no Reps box and a stored hostile reps string reaches nothing', and a new test pins the save shape; deliberate breakages (saving reps again, the box coming back) each fail one. UNVERIFIED: Jake has not looked at the dialog on his phone. THE ORIGINAL FINDING, kept as written: FOUND BY CLAUDE 2026-10-04 while building the RPE method for periodization; not seen by Jake. The Undulating periodization dialog has a 'Reps' box for each tier (Heavy / Moderate / Light, placeholders '3-5', '6-8', '10-12'). savePeriodizationConfig stores it (periodization_config.tiers.<tier>.reps) and the dialog shows it again, but generatePhasePeriodization only ever reads a tier's %1RM (_computePeriodizedPct reads tiers[tier].pct) - nothing reads .reps, so a generated week keeps the reps the coach typed in Week 1, whatever the box says. The new RPE side of the dialog deliberately has NO Reps box, so as not to add a second control that does nothing. DECISION FOR JAKE, three ways: (a) make the box work - generation would set repsMin/repsMax on the sets of a session of that tier from the box ('3-5' becomes 3 and 5); that changes what a % phase generates, so every existing Undulating phase would start rewriting reps the next time Generate weeks is pressed; (b) remove the box from the % side; (c) leave it and say so in the dialog. My recommendation: (b), unless he has been using the box as a reminder, in which case (a) for new phases only. UNVERIFIED: whether any of his real phases has reps typed in these boxes."
closing_conditions: "Jake opens an Undulating periodization dialog (% and RPE) on his phone after v2026.09.15 is live and sees no Reps boxes and the %1RM / RPE of each tier intact."
---

# Undulating periodization: the Reps boxes are saved but never applied

**Closes when:** see `closing_conditions`.

Found while reading `generatePhasePeriodization` for the RPE method (2026-10-04). Nothing in `js/` reads a tier's `reps` after it is saved.

**Resolved 2026-10-04:** Jake chose to remove the boxes ("remove"). They are gone from the % and the RPE side; the tiers carry only their
%1RM / RPE.
