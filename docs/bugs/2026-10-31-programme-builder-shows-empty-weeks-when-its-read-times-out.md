---
id: 2026-10-31-programme-builder-shows-empty-weeks-when-its-read-times-out
status: open
priority: medium
reported: 2026-10-31
status_detail: "open — loadAllPhaseWorkouts hit Postgres 57014 (statement timeout) at 21:54 UTC 2026-10-30 (during the v2026.10.10 release suite, which loads the same database); renderWorkoutTemplates did on 2026-10-01. On failure the builder draws every phase as an empty Week 1 with no message (read in code, not reproduced)."
---

# The programme builder shows empty weeks, with no message, when its read times out

`loadAllPhaseWorkouts` (`js/app-programs.js`) reads every phase's workouts in one nested select. When that read fails it logs
the error and carries on with no rows, so each phase renders as a single empty week. Nothing tells the user the load failed:
the programme looks wiped.

It did fail on 2026-10-30 at 21:54 UTC with `57014` (the database cancelled a slow statement), from Jake's account in solo
view. That was during the v2026.10.10 release suite, which runs against the same database, so load is the likely trigger
(unverified). `renderWorkoutTemplates` hit the same code on 2026-10-01.

**Closes when:** a failed load shows a clear "couldn't load, try again" state instead of empty weeks, proven by a spec that
forces the read to fail (red before, green after).
