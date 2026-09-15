---
id: 2026-07-13-duplicatephaseweek-embed-omits-is-personal-app-programs-js-1
status: fixed-awaiting-jake
priority: medium
reported: 2026-07-13
status_detail: "fixed — awaiting Jake"
---

# duplicatePhaseWeek embed omits is_personal (app-programs.js:1634), so its clones silently take the DB default

**MEDIUM — `duplicatePhaseWeek` embed omits `is_personal`** (app-programs.js:1634), so its clones silently take the DB default instead of inheriting. Exactly the embed-select-allowlist class from 2026-07-11. Both siblings (`_cloneProgramForClient` :348, `generatePhasePeriodization` :1373) list it correctly.
