---
id: 2026-10-04-runner-saves-the-session-date-as-the-utc-day
status: fixed-awaiting-jake
priority: low
reported: 2026-10-04
status_detail: "FIXED 2026-10-17 and released in v2026.10.5: _startFreshRunner stamps the session with the LOCAL day it was started (_ymdLocal(new Date())), as do the three 1RM saves. A session that starts before midnight and finishes after keeps the day it started. Pinned-clock spec: tests/local-today-2026-10-17.spec.js (the session date is the local day at 00:30 in London and at 20:30 in New York; reverted, it fails). NOT tested: reading a midnight session back on the dashboard and the Workouts card (both already compare local days), or on a real phone. Closes when Jake confirms."
closing_conditions: "A session started at 00:30 local time on a BST day is filed under that local day and shows as done on the dashboard and the Workouts card that day."
---

# The runner files a session under the UTC day, not the local day

**Closes when:** see `closing_conditions`.
