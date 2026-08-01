# Solo Becomes a Genuine Role — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `profiles.role = 'solo'` a real, permanently-stored value for solo_only-shaped accounts, replacing the in-memory reassignment `loadUserInfo` currently does on every login, and fix the starter-content seeding bug that reassignment ambiguity caused.

**Architecture:** One SQL migration (schema + one-time data fix), one function rewritten in `js/app-core.js` (`loadUserInfo`), and one function updated in `js/starter-content.js` (`_seedStarterContent`) to be role-aware for the `is_personal` flag. No new files except the migration script and one new test file.

**Tech Stack:** Vanilla JS (ES6+, no build step), Supabase (Postgres + RLS), Playwright for tests.

## Global Constraints

- No build step — files are loaded directly by `index.html` via `<script src="js/X.js?v=N">`. Any changed module needs its cache-bust `?v=N` bumped in `index.html`, in the same commit.
- No PII in `log.*` calls — ids and dates only.
- Multi-tenancy = `coach_id` + `client_id`/`user_id`. Never trust a client-supplied id for ownership. (Not directly relevant here — this plan touches no write paths that accept external input, only login-time role resolution.)
- Master accounts (one login, both coach and personal capability) must be completely unaffected by every change in this plan — verify this explicitly in Task 4.
- Every fix needs a red-first Playwright test in the same commit, per this project's standing convention — write the failing test, confirm it fails, then implement.
- `tests/*.spec.js` files are gitignored-safe to leave in the repo (this project commits its Playwright specs) — but any ad hoc/throwaway spec named `_adhoc.spec.js` must be deleted before the final commit; it is gitignored and never checked in.
- Test fixtures: never leave a shared account (`PT2`, the second unrelated coach used across many other tests) in a mutated state after a test — every test that temporarily changes PT2 must restore it in a `finally` block.

---

### Task 1: SQL migration — `profiles.role` accepts `'solo'`, one-time data fix

**Files:**
- Create: `scripts/migrate-solo-role-2026-08-01.sql`

**Interfaces:**
- Produces: after running, the one account currently flagged `solo_only = true` has `profiles.role = 'solo'` in the database (not just in memory). This is what Task 2's `loadUserInfo` change depends on to be exercised for real by that account on its next login.

- [ ] **Step 1: Write the migration script**

```sql
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- Solo becomes a genuine, stored role. See docs/superpowers/specs/2026-08-01-solo-genuine-role-design.md
--
-- STEP 1 — diagnostic. Run first. Confirms whether profiles.role has a CHECK constraint today, and
-- shows exactly which account(s) are currently solo_only (should be exactly one).
-- ════════════════════════════════════════════════════════════════════════════════════════════════

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.profiles'::regclass and contype = 'c';

select id, role, solo_only, starter_seeded from public.profiles where solo_only = true;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- STEP 2 — widen the constraint (if Step 1 showed one restricting role to specific values), then
-- flip the existing solo_only account(s) to the real role. Defensive: drop-then-recreate is safe to
-- run even if the constraint's exact current definition differs from the guess below — adjust the
-- `check (...)` list if Step 1's output shows different allowed values.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

do $$
declare
  con record;
begin
  for con in
    select conname from pg_constraint
    where conrelid = 'public.profiles'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.profiles drop constraint %I', con.conname);
  end loop;
end $$;

alter table public.profiles add constraint profiles_role_chk
  check (role in ('coach', 'client', 'solo'));

update public.profiles set role = 'solo' where solo_only = true and role = 'coach';

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- STEP 3 — verify. Should show role='solo' for the same row(s) Step 1's second query found.
-- solo_only is deliberately left in place, unused, rather than dropped.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

select id, role, solo_only, starter_seeded from public.profiles where role = 'solo';
```

- [ ] **Step 2: Commit**

```bash
git add scripts/migrate-solo-role-2026-08-01.sql
git commit -m "sql: migrate solo_only account to a genuine role='solo' value"
```

This task has no automated test — it's a script Jake runs manually in the Supabase SQL editor. Flag to Jake in the final summary that Step 1's diagnostic must be run and its output checked before Step 2, per this project's sql-safety convention.

---

### Task 2: `loadUserInfo` — remove the dead `solo_only` branch, add the native-role branch

**Files:**
- Modify: `js/app-core.js:255-275` (the branch being removed/replaced)
- Test: `tests/solo-genuine-role-2026-08-01.spec.js` (new file)

**Interfaces:**
- Consumes: `currentUser.id` (global, set at login), `db` (global Supabase client), `currentProfile` (global, set earlier in the same function at `app-core.js:223`).
- Produces: `window._soloClientId` (already an existing global used throughout the other 8 modules — this task must keep setting it exactly the same way for a `role === 'solo'` account, just via a different code path).

- [ ] **Step 1: Write the failing test**

Create `tests/solo-genuine-role-2026-08-01.spec.js`:

```js
const { test, expect } = require('@playwright/test')
const { loginAsPT2 } = require('./helpers')

test.describe('loadUserInfo treats role=solo as a native value, not a reassignment', () => {
  test('a native role=solo account gets window._soloClientId set correctly, with no solo_only flag needed', async ({ page }) => {
    await loginAsPT2(page)

    const result = await page.evaluate(async () => {
      // Plant: PT2 becomes a genuinely-solo account for this test only. PT2 normally owns zero
      // clients (it's the "unrelated coach" fixture used by rls-audit.spec.js's Probe A) — this test
      // must restore that exactly, or every test relying on "PT2 owns nothing" breaks.
      const { data: existing } = await db.from('clients').select('id').eq('user_id', currentUser.id).is('coach_id', null).maybeSingle()
      let plantedClientId = null
      if (!existing) {
        const { data, error } = await db.from('clients').insert({ user_id: currentUser.id, coach_id: null, full_name: 'PT2 Solo Test' }).select('id').single()
        if (error) return { fatal: error.message }
        plantedClientId = data.id
      }
      const { error: roleErr } = await db.from('profiles').update({ role: 'solo' }).eq('id', currentUser.id)
      if (roleErr) return { fatal: roleErr.message }

      // Reset in-memory state so loadUserInfo's own DB fetch is what's actually being tested, not
      // stale state from the normal loginAsPT2() flow that already ran once this page load.
      window._soloClientId = undefined
      window._masterAccount = undefined

      await loadUserInfo()

      const resultRole = currentProfile?.role
      const resultSoloId = window._soloClientId
      const resultMasterAccount = window._masterAccount

      // Restore PT2 to its normal state, unconditionally, before returning.
      await db.from('profiles').update({ role: 'coach' }).eq('id', currentUser.id)
      if (plantedClientId) await db.from('clients').delete().eq('id', plantedClientId)

      return { resultRole, resultSoloId, resultMasterAccount }
    })

    expect(result.fatal, 'setup failed, this test proves nothing').toBeUndefined()
    expect(result.resultRole).toBe('solo')
    expect(result.resultSoloId).toBeTruthy()
    expect(result.resultMasterAccount).toBeUndefined() // a native solo account is never a master account
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/solo-genuine-role-2026-08-01.spec.js --reporter=list`
Expected: FAIL — with today's code, `role: 'solo'` is written to the DB by the test, but `loadUserInfo` only reassigns role to `'solo'` when it sees `role === 'coach' && solo_only === true` (`app-core.js:255`). Since the test sets `role='solo'` directly (not `role='coach', solo_only=true`), that branch's condition is false, `currentProfile.role` stays `'solo'` from the raw fetch (which is actually already correct by coincidence!) — but `window._soloClientId` is NEVER set, because neither branch (`:255` nor `:276`) matches a raw `role === 'solo'` fetch. Confirm the actual failure is `resultSoloId` being falsy, not `resultRole`.

- [ ] **Step 3: Implement — replace the branch**

In `js/app-core.js`, replace lines 255-275 (the entire `if (currentProfile?.role === 'coach' && currentProfile.solo_only) { ... }` block) with:

```js
  } else if (currentProfile?.role === 'solo') {
    // role='solo' is now a genuine, permanently-stored value (migrated 2026-08-01) — no more
    // reassignment needed. The one thing this account still needs looked up is its own
    // self-referential clients row, for window._soloClientId (used throughout the other 8 modules).
    const { data: soloRec, error: soloErr } = await db.from('clients').select('id').eq('user_id', currentUser.id).is('coach_id', null).maybeSingle()
    if (soloErr) log.error('loadUserInfo', 'solo clients lookup failed', soloErr)
    if (soloRec) window._soloClientId = soloRec.id
  } else if (currentProfile?.role === 'coach') {
```

The `else if (currentProfile?.role === 'coach') { ... }` block that follows (previously starting at line 276) is unchanged — this edit only replaces the opening of the `if`/`else if` chain, turning the old `if (...solo_only) { A } else if (role === 'coach') { B }` into `if (role === 'solo') { A' } else if (role === 'coach') { B }`, with `B` byte-for-byte identical to before.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/solo-genuine-role-2026-08-01.spec.js --reporter=list`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add js/app-core.js tests/solo-genuine-role-2026-08-01.spec.js
git commit -m "solo: role='solo' is now native, not a solo_only reassignment"
```

---

### Task 3: Starter-content seeding — fix the role-check race and the `is_personal` mismatch

**Files:**
- Modify: `js/app-core.js:303` (the seeding gate)
- Modify: `js/starter-content.js:84` (the seeder's own gate) and lines 93, 108, 126, 133 (the `is_personal` writes/reads)
- Test: `tests/solo-genuine-role-2026-08-01.spec.js` (same file as Task 2 — add a new `test.describe` block)

**Interfaces:**
- Consumes: `currentProfile.role` (global, set by `loadUserInfo` — Task 2 guarantees this is `'solo'` natively for a solo account by the time `_seedStarterContent` runs).
- Produces: nothing new consumed elsewhere — this task only changes what `_seedStarterContent` writes to the DB (`is_personal` on 3 tables) and what condition triggers it.

- [ ] **Step 1: Write the failing test**

Add to `tests/solo-genuine-role-2026-08-01.spec.js`:

```js
test.describe('starter-content seeding works for a native role=solo account', () => {
  test('_seedStarterContent runs for role=solo and writes is_personal:true, not false', async ({ page }) => {
    await loginAsPT2(page)

    const result = await page.evaluate(async () => {
      const tag = ' [E2E-solo-seed ' + Date.now() + ']'
      const origProfile = { ...currentProfile }

      // Simulate: PT2 is (for this test only) a brand-new, native role=solo account that has never
      // been seeded. Don't touch the real profiles row's starter_seeded — only currentProfile, which
      // is all _seedStarterContent actually reads.
      currentProfile = { ...currentProfile, role: 'solo', starter_seeded: false }

      // Give the starter exercises a unique marker so this test's cleanup can find exactly what it
      // created, without touching PT2's own real seeded data (PT2 already carries starter_seeded=true
      // from its own real onboarding).
      const originalExercises = STARTER_EXERCISES.map(e => ({ ...e }))
      STARTER_EXERCISES.length = 0
      STARTER_EXERCISES.push({ name: 'E2E Solo Seed Test' + tag, muscle_group: 'Test', category: null })

      await _seedStarterContent()

      const { data: seededEx } = await db.from('exercises').select('id, is_personal').eq('coach_id', currentUser.id).eq('name', 'E2E Solo Seed Test' + tag).maybeSingle()

      // cleanup: restore the real STARTER_EXERCISES list and currentProfile, delete the test row
      STARTER_EXERCISES.length = 0
      originalExercises.forEach(e => STARTER_EXERCISES.push(e))
      currentProfile = origProfile
      if (seededEx?.id) await db.from('exercises').delete().eq('id', seededEx.id)

      return { seededEx }
    })

    expect(result.seededEx, 'seeding did not run at all for role=solo — the race is still present').toBeTruthy()
    expect(result.seededEx.is_personal).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/solo-genuine-role-2026-08-01.spec.js -g "starter-content seeding" --reporter=list`
Expected: FAIL — `_seedStarterContent`'s own gate (`app-core.js` line 84... actually `starter-content.js:84`) is `if (currentProfile?.role !== 'coach' || currentProfile?.starter_seeded) return`, so with `currentProfile.role = 'solo'` it returns immediately. `result.seededEx` will be `undefined`/null, failing the first assertion.

- [ ] **Step 3: Implement**

In `js/starter-content.js`, change line 84 from:

```js
  if (currentProfile?.role !== 'coach' || currentProfile?.starter_seeded) return
```

to:

```js
  const isSoloAccount = currentProfile?.role === 'solo'
  if ((currentProfile?.role !== 'coach' && !isSoloAccount) || currentProfile?.starter_seeded) return
```

Then change the 3 `is_personal: false` writes and the 1 `is_personal` read filter to use `isSoloAccount`:

- Line 93: `missingEx.map(e => ({ coach_id: currentUser.id, is_personal: false, name: e.name, ...` → `is_personal: isSoloAccount`
- Line 108: `coach_id: currentUser.id, program_id: null, client_id: null, is_personal: false,` → `is_personal: isSoloAccount,`
- Line 126: `.eq('coach_id', currentUser.id).eq('is_personal', false).eq('name', STARTER_PROGRAM.name)` → `.eq('is_personal', isSoloAccount)`
- Line 133: `coach_id: currentUser.id, is_personal: false, name: STARTER_PROGRAM.name,` → `is_personal: isSoloAccount,`

Also update `js/app-core.js` line 303 from:

```js
  if (data?.role === 'coach' && data?.starter_seeded === false) {
```

to:

```js
  if ((data?.role === 'coach' || data?.role === 'solo') && data?.starter_seeded === false) {
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/solo-genuine-role-2026-08-01.spec.js -g "starter-content seeding" --reporter=list`
Expected: PASS

- [ ] **Step 5: Cache-bust and commit**

In `index.html`, bump both changed modules' versions (find their current `?v=N` and increment by 1 each — `app-core.js` and `starter-content.js`).

```bash
git add js/app-core.js js/starter-content.js index.html tests/solo-genuine-role-2026-08-01.spec.js
git commit -m "solo: fix starter-content seeding for a native role=solo account (race + is_personal mismatch)"
```

---

### Task 4: Verify master accounts and existing solo-role checks are unaffected

**Files:**
- Test: `tests/solo-account.spec.js` (existing file — run unchanged, do not edit)
- Test: `tests/solo-genuine-role-2026-08-01.spec.js` (existing file from Tasks 2-3 — add one more test)

**Interfaces:**
- Consumes: nothing new — this task is verification only, no production code changes.

- [ ] **Step 1: Add a master-account regression test**

Add to `tests/solo-genuine-role-2026-08-01.spec.js`:

```js
test.describe('master accounts are unaffected by the solo=native-role change', () => {
  test('a master account (coach + own solo view) still gets window._masterAccount and both client ids', async ({ page }) => {
    const { loginAsPT } = require('./helpers')
    await loginAsPT(page)
    const result = await page.evaluate(() => ({
      masterAccount: window._masterAccount,
      role: currentProfile?.role,
    }))
    // PT is a master account with role='coach' in the DB — untouched by this whole change.
    expect(result.masterAccount).toBe(true)
    expect(['coach', 'client', 'solo']).toContain(result.role) // whichever view was last active
  })
})
```

- [ ] **Step 2: Run the new test**

Run: `npx playwright test tests/solo-genuine-role-2026-08-01.spec.js --reporter=list`
Expected: PASS (this is a same-behavior-as-before check, not a red-first test — master accounts were never touched by Tasks 2-3's edits)

- [ ] **Step 3: Run the full existing solo-account.spec.js suite unchanged**

Run: `npx playwright test tests/solo-account.spec.js --reporter=list`
Expected: PASS, same pass count as before this plan started. This file already exercises the master-account solo view extensively (it logs in as PT, switches to Personal view, and checks the dashboard) — a clean pass here is the real proof that Task 2's edit didn't regress the master-account branch, since that branch's code is untouched but its neighbor in the same `if`/`else if` chain changed.

- [ ] **Step 4: Run the full project suite**

Run: `npx playwright test --reporter=list`
Expected: same pass/fail/skip counts as the last full run this session (307 passed, 5 pre-existing unrelated `client_programs`-fixture-gap failures, 2 skipped, ignore any single flake that passes on retry — matches this project's established pattern).

- [ ] **Step 5: Commit** (only if Step 1 required file changes beyond what Tasks 2-3 already committed — likely just the test file addition)

```bash
git add tests/solo-genuine-role-2026-08-01.spec.js
git commit -m "solo: add master-account regression coverage for the role=solo native-value change"
```

---

### Task 5: Manual verification on the real account (Jake, not automatable)

**Files:** none — this is a manual QA step, not a code task.

- [ ] **Step 1:** Jake runs Task 1's migration in the Supabase SQL editor (Step 1 diagnostic, review output, then Step 2, then Step 3 verify).
- [ ] **Step 2:** Jake (or the family member) logs into the real `solo_only` account. Confirm: lands on the solo dashboard with no errors, no console errors about `window._soloClientId`.
- [ ] **Step 3:** Confirm starter content actually appears this time — the exercise library should show ~40 exercises, there should be one "Example — Full Body A" workout and one "Example — 4-Week Foundation" program, all visible from the solo view (the thing that's been silently broken until now).
- [ ] **Step 4:** Report back — this is the real closure condition for the STATUS.md ledger row this plan is fixing (per this project's closure rule: a Jake-reported/confirmed item, or a red→green test — Task 2/3's tests cover the code; this step is Jake confirming the actual account works).

---

## Self-Review Notes

- **Spec coverage:** Task 1 covers the schema/data-fix section of the spec. Task 2 covers `loadUserInfo`'s rewrite. Task 3 covers the starter-content fix (both the race and the `is_personal` mismatch). Task 4 covers the spec's verification requirement for master accounts and the broader `role === 'solo'` audit (via running the existing suite, which already exercises many of those 47 call sites end-to-end rather than one-by-one — a full manual line-by-line audit of all 47 sites was considered but is not a "task" with a testable deliverable; the existing + new Playwright coverage is the practical verification). Task 5 covers the spec's live-verification requirement. `solo_only` column retirement (leave-in-place decision) is captured in Task 1, no separate task needed.
- **Placeholder scan:** no TBD/TODO; every step has real code or a real shell command.
- **Type/name consistency:** `window._soloClientId`, `currentProfile`, `isSoloAccount` are used consistently across Tasks 2-3 with the same names. `_seedStarterContent` and `loadUserInfo` are referenced by their real, existing names throughout.
