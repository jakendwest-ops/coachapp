---
id: 2026-09-06-the-role-self-heal-block-is-inert-and-would-misclassify-solo
status: open
priority: low
reported: 2026-09-06
status_detail: "Found by the 2026-09-06 full-file review's mechanical sweep. js/app-core.js:777 self-heals a falsy profiles.role to 'client' for anyone holding a clients row. MEASURED 2026-09-06: zero null-role profiles exist (9 accounts, all valid roles), so the block never fires today — and handle_new_user defaults new accounts to 'coach', so a null role may be unreachable by construction. Not fixed: no live defect. Filed because the block is both inert AND wrong if it ever did fire."
---

# The role self-heal block is inert, and would misclassify a solo user if it fired

`js/app-core.js:777`:

```js
if (!error && (!currentProfile?.role || currentProfile.role === null)) {
  const { data: clientRec } = await db.from('clients').select('id').eq('user_id', currentUser.id).single()
  if (clientRec) {
    currentProfile = { ...(currentProfile || {}), role: 'client' }
    // ... and patches the profiles row
```

Its purpose is an invited client whose profile row was created without a role. The `!error` gate is
carefully placed and its comment explains why: on 2026-07-24 a failed fetch left `role` falsy and this
same block "healed" a real coach into a client.

## Two problems, neither of them urgent

**1. It cannot distinguish solo from client.** The condition is "has a `clients` row" — and a SOLO user
has a self-referential `clients` row by design (`user_id` = own id, `coach_id` = NULL). So a solo
account with a falsy role would be patched to `'client'`, permanently, in the database. **The comment
directly above the block already warns about this** ("including a coach's own self-referential solo
row") — the warning was written, the condition was not widened to match it.

**2. Measured: it never runs.** Counted 2026-09-06 across the live project:

| role | profiles | with a clients row |
|---|---:|---:|
| solo | 4 | 4 |
| coach | 3 | 2 |
| client | 2 | 2 |

**No `(null)` row exists**, so the guard's own precondition is never met. `handle_new_user` (a DB
trigger, not tracked in this repo) defaults a new account's role to `'coach'`, which suggests a null
role is unreachable by construction rather than merely absent today — **unverified**, since the trigger
source was not read.

## Deliberately NOT fixed

There is no live defect. Changing working auth-shape code to defend a state that does not occur is
[[feedback_no_speculative_fixes]], and this block's own history is a *false-heal* that damaged a real
account — so the risk of touching it runs in the direction of
[[feedback_guard_risk_is_refusing_the_legitimate_user]]. Filed so the next reader does not re-derive
this, and so the inertness is on record.

**Closes when** either (a) the trigger is read and confirmed to make a null role impossible, at which
point the block should be DELETED rather than fixed, or (b) if null roles are possible, the condition
distinguishes solo (`coach_id IS NULL` on the clients row) from client — proven red→green.
