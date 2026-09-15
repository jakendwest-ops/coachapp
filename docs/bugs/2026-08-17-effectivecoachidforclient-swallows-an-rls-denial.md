---
id: 2026-08-17-effectivecoachidforclient-swallows-an-rls-denial
status: fixed-awaiting-jake
priority: medium
reported: 2026-08-17
closed_by: tests/effective-coach-id-2026-09-04.spec.js
status_detail: "FIXED 2026-09-04. The trailing || currentUser.id is gone; the resolver captures the .single() error and returns NULL when the client row is not readable. The || user_id clause STAYS because solo coach_id is legitimately NULL, and that is the distinction the old code collapsed. All four callers handle null. Wider class enumerated: 9 sites, 2 already correct, 1 a documented deliberate choice, 5 read-path siblings still open."
---

# `_effectiveCoachIdForClient` falls back to `currentUser.id` on a lookup FAILURE

`js/app-workouts.js:1841-1844`:

```js
const { data: clientRow } = await db.from('clients').select('coach_id, user_id').eq('id', clientId).single()
return clientRow?.coach_id || clientRow?.user_id || currentUser.id
```

`|| user_id` exists for SOLO, whose `coach_id` is legitimately NULL. But the trailing `|| currentUser.id`
makes an RLS-denied lookup (0 rows → `data` null) indistinguishable from a real solo record. Verbatim what
`saveRunnerSession` documents at `app-runner.js:2310-2324`:

> "MUST fail loud, not fall back to `currentUser.id` ... a clientId RLS denies (0 rows) used to silently
> do the exact same fallback."

The guard was added to two call sites on 2026-07-30 and never applied to this shared resolver. Same shape
at `app-workouts.js:1704-1705` and `app-runner.js:2774`.

## Blast radius — smaller than the runner case, not nil

Callers: `saveOneRMGrid` (`app-progress.js:98`), `showAdd1RMModal` (`:264`), `_reopenExercisePickerFor1RM`
(`:336`). The value only selects which exercise library is read/written, so the failure mode is "you see
your own library", not a cross-tenant write.

But `_resolveExerciseIdForSave` (`app-workouts.js:1849-1857`) ends in an INSERT into `exercises`, and its
`is_personal` comes from `currentProfile?.role === 'solo'` — so a foreign client's lift name can become a
permanent row in the current user's personal exercise library.

## Related

`js/app-progress.js:98-110` — a CLIENT-role user saving a 1RM against a Big-5 name not in their coach's
library issues an insert into `exercises` with `coach_id` = another user's uid.
`_resolveExerciseIdForSave`'s contract comment scopes it to "the Big 5 quick-start 1RM form", which was
coach-side only when written; `renderClient1RMs` is now the client/solo Personal Bests tab too. It
degrades safely IF the `exercises` INSERT policy is `coach_id = auth.uid()` — that policy is the only
thing stopping it, and it has not been verified behaviourally.

---

## 2026-08-29 — re-confirmed live by the weekly full-file review

Agent A checked it independently and found `js/app-workouts.js:1940-1943` **unchanged**:

    const { data: clientRow } = await db.from('clients').select('coach_id, user_id').eq('id', clientId).single()
    return clientRow?.coach_id || clientRow?.user_id || currentUser.id

An RLS denial still becomes "it's mine". `app-core.js:1093-1096` explicitly names this function as the
**anti-model** that `_verifyClientAccess` was written against, and cites this row by id.

**One live caller in scope:** `renderClientWorkoutsPage:658`, feeding `:659`'s `.eq('coach_id', coachId)`
template fallback. That path is **read-only**, so a swallowed denial yields a wrong or empty template list
rather than a leak — which is why this stayed medium rather than escalating.

It is now the **last site in the reviewed files that treats an unreadable row as ownership.** Its natural
companion is `2026-08-29-both-runner-save-paths-check-visibility-not-ownership`: both are the same
mistake — inferring ownership from readability — and both are fixed by routing through
`_verifyClientAccess`. **Do them together**; fixing one and not the other is
[[feedback_fix_the_class_not_the_instance]] a third time in one file.

**Closes when:** `_effectiveCoachIdForClient` either propagates the denial or routes through
`_verifyClientAccess`, proven by a spec where the `clients` read is refused and the function does NOT
return `currentUser.id`.

---

## FIXED 2026-09-04 — and the class enumerated rather than the one site patched

```js
// before
return clientRow?.coach_id || clientRow?.user_id || currentUser.id

// after
if (error || !clientRow) { log.error(...); return null }
return clientRow.coach_id || clientRow.user_id || null
```

`.single()` errors with **PGRST116** on zero rows — precisely the denial signal — so capturing the
error is what makes "refused" separable from "solo, whose coach_id is legitimately NULL" at all. The
old code discarded it, which is why the two collapsed into one answer.

**The `|| user_id` clause stays.** That branch is a real resolution for solo, not a guess. Only the
trailing fallback went.

### All four callers handle null, each in the way that suits it

| caller | on null |
|---|---|
| `saveOneRMGrid` | refuses the save — **this is the write path** |
| `showAdd1RMModal` | toasts rather than opening the picker on the WRONG library |
| `_reopenExercisePickerFor1RM` | same |
| `renderClientWorkoutsPage` | empty list rather than showing the CURRENT USER's templates as the client's |

`_resolveExerciseIdForSave` already refuses a falsy `coachId`, so the `exercises` INSERT is now doubly
protected.

### The wider class — 9 sites, counted, not sampled

`|| currentUser.id` appears at nine places in `js/`:

- **CORRECT (2)** — `saveRunnerSession` (`app-runner.js:2435`) and `saveWorkoutSession` (`:3042`) both
  refuse a null `clientRecord` BEFORE the fallback, so there it only ever serves solo's NULL coach_id.
  That is the 2026-07-30 hardening this row refers to, and it holds.
- **FIXED (1)** — this row.
- **DELIBERATE, LEFT (1)** — `showLogSessionModal` (`app-runner.js:2915`) carries a comment stating the
  fallback is safe there because the modal still opens normally, and its save half
  (`saveWorkoutSession`) DOES refuse. Churning a documented decision whose write path is already
  guarded would be noise, not rigour.
- **READ-PATH SIBLINGS, STILL OPEN (5)** — `app-workouts.js:1807`, `:1817`, `:2193`, `:3024`, `:3184`.
  All resolve a coach_id for a READ — which library or template list to show. Same shape, smaller blast
  radius: a denial shows the wrong list rather than writing under the wrong owner. Named here rather
  than quietly skipped: [[feedback_fix_the_class_not_the_instance]].

### Evidence

Restoring the old tail made an unreadable client id resolve to the coach's OWN uid, where it now
returns null; two of the three tests went red. The middle test asserts a **real** client still
resolves — the false-refusal half, which matters as much here as the refusal does:
[[feedback_guard_risk_is_refusing_the_legitimate_user]].

44 targeted tests pass across the 1RM, client-workout and solo suites; `check-query-scope` clean.

---

## 2026-09-04 (later) — the five remaining siblings were examined and DELIBERATELY NOT changed

The commit above fixed `_effectiveCoachIdForClient` and named five read-path siblings as still open.
They have now been read properly, and the honest answer is that changing them would be busy-work with
a real downside. Recorded so nobody "finishes the class" later without re-deriving this.

**What each one actually looks up:**

| site | the id it resolves | reachable with a foreign id? |
|---|---|---|
| `app-workouts.js:1815` | `_runner.clientId` — the client whose session is open | no |
| `app-workouts.js:1825` | `templateId` — the template being edited | no |
| `app-workouts.js:2222` | `templateId` — the template being edited | no |
| `app-workouts.js:3053` | `currentUser.id` — the user's OWN clients row | no |
| `app-workouts.js:3213` | `currentUser.id` — the user's OWN clients row | no |

**Every one resolves an id the user is already working with.** For any of them to return null, RLS
would have to refuse a user their own client row, or the template currently on their screen — at which
point the fallback is the least of the problems.

**That is exactly what made `_effectiveCoachIdForClient` different, and worth fixing.** It took an
ARBITRARY `clientId` from its caller, so it could be handed a row the user has no access to, and one
of its callers ended in an INSERT. None of the five has that shape.

**The cost of "finishing the class" anyway:** `_resolveTemplateOwnerCoachId` (`:3053`) has **nine**
callers, one of which feeds `_verifyTemplateOwnership`. Making it return null would put a
false-refusal risk on all nine, to defend against a case that requires a broken RLS policy to occur.
[[feedback_guard_risk_is_refusing_the_legitimate_user]] and Jake's own rule — evidence first, do not
fix a problem that does not exist yet ([[feedback_no_speculative_fixes]]).

**One detail worth keeping**, because it reads like a bug and is not: at `:3053` and `:3213` the
fallback for a `client` role is `currentUser.id`, which the file's own comment correctly says is
"the client's own auth id, never a coach_id". So the fallback value is *wrong by construction* there —
but it fails CLOSED at the one caller that matters (`_verifyTemplateOwnership` compares against it and
refuses), and elsewhere it selects a library that returns nothing. Wrong, visible, not dangerous.

**Reopen this if** a caller ever passes a foreign id into one of the five, or if a new caller of
`_resolveTemplateOwnerCoachId` writes rather than reads.
