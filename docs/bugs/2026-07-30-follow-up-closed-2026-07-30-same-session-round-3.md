---
id: 2026-07-30-follow-up-closed-2026-07-30-same-session-round-3
status: confirmed
priority: low
reported: 2026-07-30
---

# FOLLOW-UP CLOSED 2026-07-30 (same session, round 3)

✅ **FOLLOW-UP CLOSED 2026-07-30 (same session, round 3) — `workout_log_exercises`/`workout_log_sets` behaviourally probed (not just reasoned about) and CONFIRMED already RLS-safe**, same live 2-account pattern as the CRITICAL `workout_logs` finding: PT2 could not insert into either table against a real log owned by PT, both when targeting an existing PT-owned log and when planting an exercise row first. `goals`/`goal_milestones` UPDATE probed the same way — also confirmed already RLS-safe (PT2's update matched 0 rows). **`saveEditGoal` anchored on `created_by`** to match `deleteGoal` (coach-only reachable, confirmed via caller trace) — also purely hardening, not closing a hole. **Deliberately left unanchored, by design, not an oversight**: `saveGoalProgress` is CLIENT-reachable (a client updates progress on a goal their COACH created — anchoring on `created_by` would incorrectly block that legitimate path) and `toggleMilestone`/`toggleClientMilestone` (`goal_milestones` has no direct owner column at all — would need a 2-hop embed check for zero remaining security benefit, since RLS already fully defends it). Permanent regression tests added so a future RLS policy change can't silently reopen any of these without a test noticing.
