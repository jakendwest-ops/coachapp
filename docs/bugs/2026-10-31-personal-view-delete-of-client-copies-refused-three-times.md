---
id: 2026-10-31-personal-view-delete-of-client-copies-refused-three-times
status: open
priority: medium
reported: 2026-10-31
status_detail: "open — _deleteClientCopiesForSlots logged 'client copy delete removed no rows — refused' 3 times (2026-09-28, 10-06, 10-08), solo view, Programs page, Jake's account. Not seen since 10-08. Cause not investigated yet."
---

# In Personal view, deleting a programme's stale week copies was refused three times

`_deleteClientCopiesForSlots` (`js/app-programs.js`) found `client_program_workouts` rows it was allowed to delete (the user's
own solo self-assignment, after `_propagationTargets`), asked the database to delete them, and got **zero rows back**. Zero with
no error means the delete was refused by row-level security or the rows were already gone. Its own comment says the result is
"clients keep stale copies": the solo copy of the plan can keep old week slots that a rebuild then sits on top of.

Seen in `app_errors` on 2026-09-28, 2026-10-06 and 2026-10-08, all from Jake's account in the solo view on the Programs page
(builds core39/core40). Not seen since; that does not mean it is fixed (the action may simply not have been repeated).

Related but different: [2026-09-06 deletePhaseWeek renumber](2026-09-06-deletephaseweek-renumber-fans-out-past-propagationtargets.md).

**Closes when:** the refusal is reproduced (generate weeks / duplicate / delete a week on a programme self-assigned in
Personal view), its cause named, and a spec goes red before the fix and green after.
