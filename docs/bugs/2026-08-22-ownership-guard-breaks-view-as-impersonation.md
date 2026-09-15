---
id: 2026-08-22-ownership-guard-breaks-view-as-impersonation
status: confirmed
priority: high
reported: 2026-08-22
closed_by: "clause (b) 2026-08-22. _verifyOwnClientId DELETED; the three writes route through _verifyClientAccess, which allows a coach via coach_id===me (exactly what sudo is). The misleading comment is replaced with one naming all six render sites and why grepping the onclick could not find the sixth. New sudo happy-path test in tests/own-client-writes-2026-08-21.spec.js reproduces the sudo STATE (sudoAsClient is email-gated so the E2E PT cannot call it). Red-before: removing the coach_id branch from _verifyClientAccess makes that test fail with the literal symptom \"Save failed - permission denied.\" while the other two stay green. 75 affected-spec tests pass; checks.sh green."
status_detail: "REGRESSION I INTRODUCED in commit 89eb93f, caught by multi-agent-review BEFORE push. Found independently by TWO agents. The commit is held back unpushed — master is unaffected. Fix is identified but NOT yet applied: the session hit its usage limit mid-fix."
---

# `_verifyOwnClientId` breaks "View as" (sudo), and the comment justifying it is factually wrong

Introduced by me in `89eb93f` (app-clients v13) while closing
`bugs/2026-08-12-client-self-service-writes-zero-anchor-app-clients.md`. Caught by pre-push
`multi-agent-review` on 2026-08-22 — **found independently by Agent B and Agent C**. Never pushed.

## The break

`sudoAsClient` (`js/app-dashboard.js:240-247`) sets `window._sudoClientId` and forces
`currentProfile.role = 'client'`, while `currentUser` stays the COACH. `renderClientDashboard` then
renders with `clientId = window._sudoClientId` (`js/app-dashboard.js:261, 266`) and emits all three
guarded forms:

- `saveClientWeight('<sudoClientId>')` — app-dashboard.js:554
- `_pbFormHtml(clientId)` → `saveClientPB('<sudoClientId>')` — app-dashboard.js:587
- `saveClientCheckIn('<sudoClientId>')` — app-dashboard.js:621

The new guard resolves `mine = await _getCurrentClientId()`, which with `role === 'client'` queries
`clients where user_id = <coach uid> AND coach_id IS NOT NULL` — never the sudo'd client. So
`mine !== clientId` and all three saves answer **"Save failed — permission denied."** They worked
before this commit.

## The wrong claim, which is the worse half

`js/app-clients.js:70-74` asserts: *"all five render sites … derive clientId from
`_getCurrentClientId()` … No coach-for-a-client path renders these forms, so a strict self-check
cannot break a legitimate flow."*

I enumerated five call sites and missed the sixth. The comment does not merely fail to warn — it
actively tells the next reader the path does not exist.

## The guards disagree with each other

`_verifyClientAccess` (app-core.js) **allows** sudo, via its `coach_id === currentUser.id` branch — so
`saveRunnerOneRM` still works when sudo'd from the same dashboard's ▶ Start button, while the PB form
three cards above it refuses. `_verifyGoalAccess` also allows it (goals are `created_by` the coach).
Only the strict-self helper breaks, which is itself the finding: **I wrote a second helper doing the
first one's job**, and the duplicate is the one with the bug.

## Fix (identified, NOT applied)

Delete `_verifyOwnClientId` entirely and route the three writes through `_verifyClientAccess`, which
already accepts both legitimate shapes — `user_id === me` (own record: client or solo) and
`coach_id === me` (a client I coach, which is exactly what sudo is) — and refuses everything else. A
client passing another client's id is still refused: neither branch matches.

A first attempt at this aborted on its own over-strict assertion (the replacement comment *mentions*
`_verifyOwnClientId`, which tripped a "no references survive" check), so the file is unchanged and
still carries the broken guard.

## Mitigating, but not a reason to ship it

Sudo is hard-gated to one email (`app-dashboard.js:241`), the failure is a visible error rather than
silent corruption, and no data is damaged. But it is an untested behaviour change to Jake's own support
tool, and the misleading comment outlives the bug.

**Closes when:** the three writes route through `_verifyClientAccess`, a test drives the sudo path and
proves a save lands, and the comment no longer claims no coach-for-a-client path exists.
