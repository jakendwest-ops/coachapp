---
id: 2026-07-13-showlogsessionmodal-leaks-the-coach-personal-templates-perio
status: closed
priority: medium
reported: 2026-07-13
status_detail: "CLOSED 2026-09-27 via closure rule (b), neuter-proven that day: tests/log-session-dropdown-scope-2026-09-27.spec.js (fixtures: a coaching template, a personal one, a week-clone) passed on current code; removing .eq('is_personal', …) failed it ('PERSONAL template must not be offered'), removing .is('generated_from_phase_id', null) failed it ('week-clone must not be offered'); green again after a byte-identical restore."
---

# showLogSessionModal leaks the coach personal templates + periodization week-clones into a REAL CLIENT dropdown

**MEDIUM — `showLogSessionModal` leaks the coach personal templates + periodization week-clones into a REAL CLIENT dropdown.** app-runner.js:1940-1946 is the only `workout_templates` fetch missing `.eq(is_personal, …)` and `.is(generated_from_phase_id, null)`; every sibling has both (app-workouts.js:275/430/2031, app-programs.js:740/1733).
