---
id: 2026-08-22-guard-verifies-one-id-while-the-write-keys-on-another
status: confirmed
priority: high
reported: 2026-08-22
closed_by: "clause (b) 2026-08-22 — fixed in the same session it was found, before any push. All four writes now carry .eq('client_id', clientId) alongside the row id, so the fact verified and the fact written are the same. Plus saveNewGoal (the 15th class member, the CREATE path the goal helpers structurally cannot cover) now guarded. 69 affected-spec tests pass; checks.sh green. Never reached master."
status_detail: "Found by multi-agent-review Agent A (the security angle, which had failed to complete on the previous round). The guards I added on 2026-08-21 made these sites read as anchored when they were not — a guard that verifies the wrong fact is worse than no guard."
---

# Four guards verified `clientId` while the write was keyed on a different, unverified id

Introduced by my own 2026-08-21 hardening. Caught by pre-push review on 2026-08-22. **Never pushed.**

`_verifyClientAccess(fnName, clientId)` was called, and then the write anchored on a *row id* the guard
had never seen:

| site | guard verified | write anchored on |
|---|---|---|
| `save1RM(clientId, existingId)` | `clientId` | `client_1rms.update(row).eq('id', existingId)` |
| `delete1RM(id, clientId)` | `clientId` | `client_1rms.delete().eq('id', id)` |
| `deletePerfLog(id, clientId)` | `clientId` | `performance_logs.delete().eq('id', id)` |
| `deleteWeightLog(id, clientId)` | `clientId` | `weight_logs.delete().eq('id', id)` |

## Why `save1RM` was the worst

`row` contains `client_id: clientId`. So `save1RM(<my own clientId>, <a foreign 1RM row id>)` passes the
guard, **overwrites** that foreign row, and **re-parents it into my tenant**. A write, not just a delete.

## The shape of the mistake

The guard did not fail — it answered a different question than the one the write asked. Passing my own
`clientId` is a true statement about a fact the write never used. Worse than an unguarded write, because
the next reader sees a `_verifyClientAccess` call two lines above and reasonably stops looking.

**Verifying one fact and writing on another is the defect.** It generalises past this file: any guard of
the form `verify(A); write.eq(B)` where A ≠ B.

## Also fixed here — the 15th class member

`saveNewGoal` (`js/app-calendar-goals.js`) inserts `goals` with `client_id: clientId` from a bare
onclick parameter. `_verifyGoalAccess`/`_verifyMilestoneAccess` key on an **existing** goalId, so
neither can cover the CREATE path — which is exactly why the 2026-08-21 goal sweep missed it.

## And the count stopped being stated

The app-core inventory comment said TEN, then TWELVE; an independent sweep found FOURTEEN call sites
plus this unguarded fifteenth. Three wrong numbers in two days. The comment now states **the rule**
instead of a count, and tells the reader to grep it themselves — a stale number reads as a closed class
and stops the next person looking.

**Related:** `2026-08-22-client-1rms-write-class-still-has-two-unguarded-siblings`,
`2026-08-22-ownership-guard-breaks-view-as-impersonation` — three defects in one weekend's hardening,
all found by review, none pushed.
