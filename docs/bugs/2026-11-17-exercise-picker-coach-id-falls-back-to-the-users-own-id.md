---
id: 2026-11-17-exercise-picker-coach-id-falls-back-to-the-users-own-id
status: open
priority: medium
reported: 2026-11-17
status_detail: "Not fixed. RLS probably refuses the resulting insert; unverified."
---

# The runner's exercise picker falls back to the user's own id as the coach

`js/app-workouts.js:3215-3216`: `clientRecord?.coach_id || currentUser.id`. If the clients read fails for a coached client, the picker loads the client's own (empty) library and "Add new exercise" inserts `exercises` under the client's id. The sibling `_effectiveCoachIdForClient` (:3401-3407) was changed to fail loud for exactly this. The template-owner sibling at :5251 is already [its own row](2026-08-22-resolvetemplateownercoachid-single-is-ambiguous-for-a-master-account.md).

Found by the full-file multi-agent-review of app-progress, app-workouts and app-dashboard, 2026-11-17; the cited lines were re-read by the verifier.

**Closes when:** the line uses `_effectiveCoachIdForClient` and a spec with a failing clients read shows an error instead of an empty picker, red on the current code.
