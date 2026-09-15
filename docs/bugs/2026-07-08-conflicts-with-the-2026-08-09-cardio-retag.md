---
id: 2026-07-08-conflicts-with-the-2026-08-09-cardio-retag
status: open
priority: medium
reported: 2026-07-08
status_detail: "open — needs Jake's decision"
---

# CONFLICTS WITH THE 2026-08-09 CARDIO RETAG

⚠️ **CONFLICTS WITH THE 2026-08-09 CARDIO RETAG — DO NOT RUN AS WRITTEN.** This row wants to DELETE exercises named `Rowing`/`Running`/`SkiErg` as unused placeholders. On 2026-08-09 the opposite happened: Jake's cardio machines were found mis-tagged `weight_reps` (so they routed to the strength table and could not record duration/distance/HR/watts at all) and were retagged to `cardio` in both `exercises` and `workout_template_exercises`. His live list contains `Run`, `Rowerg`, `RowErg`, `Skierg`, `SkiErg - 10km SS`, `SkiErg - long intervals`, `SkiErg - short intervals` — note the DELETE's exact names (`Rowing`, `Running`, `SkiErg`) match NONE of them, and Postgres `IN` is case-sensitive, so it would very likely delete zero rows. But if any did match they are now exercises Jake actively trains with. **Needs Jake's decision: retire this row, or re-scope it to genuinely-unused duplicates** (his list also shows real duplicate clutter — `Dead-stop`/`Dead-Stop`/`Deadstop Barbell Row`, `Rowerg`/`RowErg`). — (orig) Run the Rowing/Running/SkiErg DELETE SQL in Supabase (safety check first — script below).
