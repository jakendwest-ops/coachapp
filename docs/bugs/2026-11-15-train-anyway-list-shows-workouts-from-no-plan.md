---
id: 2026-11-15-train-anyway-list-shows-workouts-from-no-plan
status: open
priority: medium
reported: 2026-11-15
status_detail: "open - REPORTED by Jake 2026-11-15 (screenshot, Personal view, solo dashboard): the 'Train anyway' workout picker lists dozens of workouts that are no longer part of any plan (old 'Full body PWR - Week 1..8', 'Full Body C', etc.), clogging the list with redundant data. Filed before investigation (intake rule). INVESTIGATED 2026-11-15: not a code bug - the picker (startWorkoutRunner) lists Personal library workouts (no programme, no client, not generated); 95 had piled up, mostly July duplicates (10x SkiErg - Threshold Intervals, Week 1-8 sets), plus two empty ones made 2026-11-15 ('dfghj', 'srk'). Only one Zone 2 Cardiac Output was in a plan (Strength Athlete). CLEARED 2026-11-15 on Jake's approval of the exact list: 84 deleted from his signed-in app session (each checked: 1 row deleted, 0 failures; none was in a plan, a log or a calendar event at delete time). 11 remain: his 10 named keeps (one copy each) + the plan's Zone 2. Awaiting Jake's confirmation in the app to close."
closing_conditions: "The Train-anyway picker lists only workouts Jake still uses (library workouts and the sessions of his plans), the redundant workouts are cleared, and no training history is lost; or Jake confirms it in the app."
---

# "Train anyway" lists workouts that are no longer in any plan

Jake, on the solo dashboard: Rest day → **Train anyway** opens a picker of workouts. It lists many that belong to no current
plan (old weekly copies such as "Full body PWR - Week 1" to "Week 8", "Full Body C", and more), so the real choices are
buried.

**Expected:** the list holds only workouts still in use; the redundant ones are cleared down.

**Closes when:** the picker shows only workouts in use and the old ones are gone without losing any logged session, or Jake
confirms it in the app.
