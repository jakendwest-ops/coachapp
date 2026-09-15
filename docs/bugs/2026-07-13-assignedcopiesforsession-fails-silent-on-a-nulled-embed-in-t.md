---
id: 2026-07-13-assignedcopiesforsession-fails-silent-on-a-nulled-embed-in-t
status: fixed-awaiting-jake
priority: medium
reported: 2026-07-13
status_detail: "fixed — awaiting Jake"
---

# assignedCopiesForSession fails SILENT on a nulled embed, in the one function whose job is deciding who a write

**MEDIUM — `_assignedCopiesForSession` fails SILENT on a nulled embed**, in the one function whose job is deciding who a write fans out to. app-workouts.js:1515 still uses a nested `client_programs(client_id)` embed — while the function own comment (:1507) claims it avoids exactly that. If the embed nulls, `realClientCount` = 0 → the Update assigned clients? confirm never appears. Also :1524 reads client `full_name` with no `coach_id` anchor, while its sibling `_blockingClientNames` (app-programs.js:961) deliberately does anchor.
