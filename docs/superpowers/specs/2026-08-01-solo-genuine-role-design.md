# Solo becomes a genuine, stored account type — design

**Date:** 2026-08-01
**Status:** approved by Jake, ready for implementation plan
**Scope:** data-model correctness only. Public signup for solo accounts is an explicitly separate,
later design — Jake chose to sequence this way ("scope #1 now, signup as its own conversation next").

## Problem

Today, `'solo'` is never actually stored in `profiles.role`. The DB column always holds `'coach'` (or,
for a master account, whatever it's always held); `'solo'` is a display-only value that `loadUserInfo`
(`js/app-core.js`) reassigns onto an in-memory `currentProfile` object on every single login, via two
completely different code paths depending on account shape:

- A **master account** (one login, both a real coach identity and their own personal training) —
  `role` stays `'coach'` in the DB permanently; the view-switcher temporarily reassigns `currentProfile.role`
  to `'client'`/`'solo'` in memory depending on which view is currently active
  (`js/app-core.js:276-292`).
- A **`solo_only` account** (locked to personal-only, no coach capability at all — used for exactly one
  real account today, a family member) — a separate branch (`js/app-core.js:255-275`) checks a
  `profiles.solo_only` boolean, looks up a self-referential `clients` row, and reassigns
  `currentProfile.role = 'solo'` in memory if found. The underlying DB row still says `role: 'coach'`.

This ambiguity has already caused one confirmed, real bug (found by the 2026-08-01 full-file review): the
starter-content seeding decision is made against the RAW `data.role` (still `'coach'` for a `solo_only`
account) at `app-core.js:303`, but the seeder itself (`starter-content.js:84`) re-checks the
already-reassigned `currentProfile.role` (`'solo'` by that point) — the two disagree, so seeding silently
never runs for a `solo_only` account, forever.

Jake's ask: make `role = 'solo'` a real, permanently-stored value for accounts that are genuinely,
exclusively personal — with **master accounts completely unchanged** (they keep working exactly as they
do today; this only applies to the `solo_only`-shaped case).

## What changes

### 1. Schema (SQL — Jake runs in Supabase)

- Defensively widen `profiles.role`'s constraint (if one exists) to permit `'solo'` — the migration
  script checks for and relaxes any CHECK constraint rather than assuming one exists or doesn't, since
  there's no local way to read the live schema.
- One-time data fix: for the account currently flagged `solo_only = true`, set `role = 'solo'` directly.
- **`solo_only` column: left in place, unused.** Safer than dropping a column outright; costs nothing to
  leave it. (Flag to Jake if he'd rather it actually be dropped.)

### 2. `js/app-core.js` — `loadUserInfo`

- **Remove** the `solo_only`-checking branch (`:255-275`) entirely. Once no account can simultaneously
  have `role === 'coach'` and `solo_only === true` (true immediately after the migration, and true going
  forward since nothing will set `solo_only` again), this branch can never fire — it's dead code, not
  just superseded logic.
- **Add** a new branch alongside the existing `else if (currentProfile?.role === 'coach')` master-account
  branch: `else if (currentProfile?.role === 'solo')` — looks up the self-referential `clients` row
  (`user_id = auth.uid() AND coach_id IS NULL`) and sets `window._soloClientId`. This is the one real
  side-effect the old branch produced that the rest of the app depends on; everything else in the old
  branch (the `window._masterAccount` guard, the reassignment itself) is now unnecessary because `role`
  arrives correct from the initial fetch.
- The existing master-account branch (`:276-292`) is untouched, byte-for-byte.

### 3. Starter-content seeding fix

- `app-core.js:303`'s gate becomes `(data?.role === 'coach' || data?.role === 'solo') && data?.starter_seeded === false`
  — checked against the raw fetched role in both cases now, so there's no more "raw vs. reassigned"
  disagreement for this decision.
- `starter-content.js:84`'s gate becomes `!['coach','solo'].includes(currentProfile?.role) || currentProfile?.starter_seeded` (return-early condition, so it accepts both roles instead of just `'coach'`).
- `_seedStarterContent` itself needs to know which role it's seeding for, and set `is_personal: true` on
  every artifact (exercises, template, program) when seeding a `role === 'solo'` account instead of the
  current hardcoded `is_personal: false` — otherwise the content would exist but remain invisible to
  every read path a solo account uses (they all filter `is_personal = true`, since `role` is permanently
  `'solo'` for reads).

### 4. Verification

- Audit the ~47 existing `role === 'solo'` checks across `app-calendar-goals.js`, `app-clients.js`,
  `app-core.js`, `app-programs.js`, `app-runner.js`, `app-workouts.js` — confirm each still behaves
  correctly when `role` is natively `'solo'` from the start rather than reassigned mid-`loadUserInfo`.
  Expected: no changes needed, since they only ever compared a value: but this gets checked, not assumed.
- Live-test end to end on the real account: role flips to `'solo'` in the DB, next login lands on a
  working solo dashboard, `window._soloClientId` is set, and starter content actually appears (the thing
  that's been silently broken until now).

## Out of scope (explicitly, for this spec)

- Public signup / onboarding flow for new solo accounts — separate design conversation, next.
- Any change to master-account behavior.
- Dropping the `solo_only` column (left inert instead).
- Any RLS policy change — role is a display/routing concern in this codebase, not something any RLS
  policy currently keys on (verified: RLS policies key on `clients.coach_id`/`clients.user_id`, not
  `profiles.role`).
