---
id: 2026-07-13-duplicatephaseweek-embed-omits-is-personal-app-programs-js-1
status: unverified-accepted
priority: medium
reported: 2026-07-13
status_detail: "UNVERIFIED-ACCEPTED by Jake 2026-09-27 (batch reply 'ok'): the fix is present in current code (checked 2026-09-27, commit 134140f), but no red->green test proves it, so it is no longer tracked."
---

# duplicatePhaseWeek embed omits is_personal (app-programs.js:1634), so its clones silently take the DB default

**MEDIUM — `duplicatePhaseWeek` embed omits `is_personal`** (app-programs.js:1634), so its clones silently take the DB default instead of inheriting. Exactly the embed-select-allowlist class from 2026-07-11. Both siblings (`_cloneProgramForClient` :348, `generatePhasePeriodization` :1373) list it correctly.
