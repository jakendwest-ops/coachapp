---
id: 2026-07-13-showlogsessionmodal-leaks-the-coach-personal-templates-perio
status: fixed-awaiting-jake
priority: medium
reported: 2026-07-13
status_detail: "fixed — awaiting Jake"
---

# showLogSessionModal leaks the coach personal templates + periodization week-clones into a REAL CLIENT dropdown

**MEDIUM — `showLogSessionModal` leaks the coach personal templates + periodization week-clones into a REAL CLIENT dropdown.** app-runner.js:1940-1946 is the only `workout_templates` fetch missing `.eq(is_personal, …)` and `.is(generated_from_phase_id, null)`; every sibling has both (app-workouts.js:275/430/2031, app-programs.js:740/1733).
