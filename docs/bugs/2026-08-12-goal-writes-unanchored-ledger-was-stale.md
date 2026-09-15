---
id: 2026-08-12-goal-writes-unanchored-ledger-was-stale
status: confirmed
priority: high
reported: 2026-08-02
reported_detail: refiled 2026-08-12 by the full-codebase architecture audit
closed_by: "clause (b) 2026-08-21. ONE role-aware helper pair (_verifyGoalAccess / _verifyMilestoneAccess) in app-calendar-goals.js, used by all 4 sites: toggleMilestone, toggleClientMilestone, saveGoalProgress, saveCheckIn. app-calendar-goals v14->v15. saveEditGoal left alone - already anchored. Goal ownership is ROLE-DEPENDENT: coach owns via created_by, client/solo owns via client_id, so copying saveEditGoal's created_by anchor to the self-service paths would have refused every client their own progress save. New tests/goal-ownership-2026-08-21.spec.js covers BOTH happy paths (client saves own progress; coach toggles own milestone) and both refusals. Red-before proven per-branch. NOT RLS-verified: unlike the other rows in this audit family no probe exists for goals/goal_milestones, and events - same file, same table family - is where a real exploitable write-policy gap was found live 2026-08-02, so the database half is unconfirmed. checks.sh green; 25 affected-spec tests pass incl. the solo milestone toggle."
status_detail: "originally noted in STATUS.md prose 2026-08-02 ('added to the ledger') but never actually got a bugs/*.md row — refiled by the full-codebase audit with corrected, current findings"
---

# goal_milestones / saveGoalProgress writes are still unanchored (as noted 2026-08-02, but never actually filed) — plus a new, previously-uncatalogued sibling in saveCheckIn

STATUS.md's 2026-08-02 entry says: *"their siblings weren't touched — `saveGoalProgress`, `saveEditGoal`, `toggleMilestone`, `toggleClientMilestone` are the same id-only shape, still open, added to the ledger."* No corresponding `bugs/*.md` file was ever created — this is the actual filing, ten days late, found again independently by the 2026-08-12 full-codebase audit (`architecture-audit-2026-08-12.md`).

## Current status of each item named in 2026-08-02

- **`saveGoalProgress`** (js/app-calendar-goals.js:848) — `db.from('goals').update({ current_value: val }).eq('id', goalId)`, no anchor. **Still open, confirmed.**
- **`toggleMilestone`** (js/app-calendar-goals.js:811/814) and **`toggleClientMilestone`** (821/824) — both `.eq('id', milestoneId)` only, no parent-goal ownership check. `goal_milestones` has no `coach_id`/`created_by` column of its own, so this needs a parent-lookup helper, not a direct anchor. `toggleClientMilestone` is reachable directly from both the client and solo dashboards. **Still open, confirmed.**
- **`saveEditGoal`** (js/app-calendar-goals.js:978-986) — **this one was fixed** since the 2026-08-02 note; it now correctly anchors with `.eq('id', goalId).eq('created_by', currentUser.id)`. Remove from future open-item lists.

## New, previously-uncatalogued sibling found in this pass

**`saveCheckIn`'s own goal-update, js/app-calendar-goals.js:907** — `db.from('goals').update({ current_value: parseFloat(value), updated_at: ... }).eq('id', goalId)` — does the identical `current_value` write as `saveGoalProgress` but was never named in the 2026-08-02 note and has no anchor either. This is exactly the "a fix that touched one write path was never checked against its siblings" pattern this project has hit before.

## Additional related finding

**`renderCalendar`'s `events` reads are entirely unscoped at the app layer** (js/app-calendar-goals.js:79 coach branch, :25 client/solo branch — no `coach_id`/`client_id` filter at all, pure RLS reliance). `events` is the exact table where a real RLS write-policy gap was found and fixed live on 2026-07-12 (STATUS.md:174-179) — this read path has zero app-level defense-in-depth, so a future RLS regression on `events` would have no backstop at all. Filed separately if warranted, noted here for context since it's the same file/table family.

## Suggested fix direction

Same as the app-progress.js/app-clients.js findings from this same audit pass: a shared parent-ownership-verification helper for `goal_milestones` (which has no owner column of its own), and a direct `.eq('created_by', currentUser.id)` anchor for `saveGoalProgress` and `saveCheckIn`'s goal-update, matching `saveEditGoal`'s already-fixed pattern.
