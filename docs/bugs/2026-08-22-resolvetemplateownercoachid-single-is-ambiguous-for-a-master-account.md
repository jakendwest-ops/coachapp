---
id: 2026-08-22-resolvetemplateownercoachid-single-is-ambiguous-for-a-master-account
status: open
priority: low
reported: 2026-08-22
status_detail: "PREMISE PARTLY WRONG, corrected 2026-09-04 while fixing its sibling: clients.user_id has a UNIQUE index (23505 on a duplicate insert), so .single() here can never match TWO rows. It can still fail on ZERO rows, which is a different and much narrower concern than this row describes. Re-scope or close on that basis rather than re-investigating the two-row story."
---

# `_resolveTemplateOwnerCoachId` silently falls back to `currentUser.id` for a master account

`js/app-workouts.js`:

```js
if (currentProfile?.role !== 'client') return currentUser.id
const { data } = await db.from('clients').select('coach_id').eq('user_id', currentUser.id).single()
return data?.coach_id || currentUser.id
```

A **master account** (a coach who also has their own solo record) can have **two** `clients` rows with
`user_id = currentUser.id`: the coached one (`_masterClientId`, `coach_id` NOT NULL) and the solo one
(`_soloClientId`, `coach_id` NULL). In Client view `currentProfile.role` is forced to `'client'`, so
this branch runs, `.single()` sees 2 rows, errors PGRST116, `data` is null, and it returns
`currentUser.id` — silently, as though no coach existed.

Consequence today is **mis-attribution of a template's `coach_id`**, not a refusal, so nothing visibly
breaks. Two distinct failure shapes hide behind one fallback: "this user genuinely has no coach" and
"the lookup failed". Same swallowed-denial shape as
`2026-08-17-effectivecoachidforclient-swallows-an-rls-denial`.

## The related decision, 2026-08-22

The app-programs ownership work briefly promoted this helper into app-core so three modules could share
it. That was **reverted** — `_verifyProgramOwnership` now anchors on `currentUser.id` directly, because
a role-resolved coach id is the wrong question for coach-authored tables (it returns the CLIENT'S
COACH's id, approving that coach's programs). So this helper stays in app-workouts with its single
caller family, and this row is only about its own correctness.

## Fix direction

`.not('coach_id','is',null).maybeSingle()` — exactly the disambiguation `_getCurrentClientId` and
`loadUserInfo` already use for the same pair of rows. And distinguish "no coach" from "lookup failed"
rather than collapsing both into `currentUser.id`.

**Closes when:** the lookup disambiguates the two rows, a failed lookup is distinguishable from "no
coach", and a test covers the master-account-in-Client-view shape.
