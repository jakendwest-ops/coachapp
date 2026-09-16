---
name: sql-safety
description: Run this skill before writing any SQL for CoachApp — destructive operations, RLS policies, schema changes. Checklist of patterns proven correct in this project.
---

# CoachApp SQL Safety Skill

Run these checks before writing any SQL. Do not skip steps.

---

## Before any DELETE or UPDATE script

1. **Read the schema first.** Query `information_schema.key_column_usage` to enumerate every FK pointing at tables being deleted:
   ```sql
   select table_name, column_name
   from information_schema.key_column_usage
   where constraint_name in (
     select constraint_name from information_schema.referential_constraints
     where unique_constraint_name in (
       select constraint_name from information_schema.table_constraints
       where table_name = '<target_table>' and constraint_type = 'PRIMARY KEY'
     )
   );
   ```

2. **Check NOT NULL constraints** on every column you plan to update. Setting a NOT NULL column to null fails with a constraint error, not a warning.

1b. **Check each FK's `delete_rule` (CASCADE / SET NULL / RESTRICT), not just its existence.** This changes what you actually need to build — a CASCADE FK means the DB already cleans up that child table when the parent is deleted, so app-level code doesn't need a manual delete for it. Only SET NULL/RESTRICT FKs need explicit handling.
   ```sql
   select tc.table_name as child_table, kcu.column_name as fk_column,
          ccu.table_name as parent_table, rc.delete_rule
   from information_schema.table_constraints tc
   join information_schema.key_column_usage kcu on tc.constraint_name = kcu.constraint_name
   join information_schema.constraint_column_usage ccu on tc.constraint_name = ccu.constraint_name
   join information_schema.referential_constraints rc on tc.constraint_name = rc.constraint_name
   where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'
     and tc.table_name in ('<child_table_1>', '<child_table_2>');
   ```
   Found 2026-07-03 building `deleteProgram()`'s cleanup: assumed a manual multi-step FK-order delete was needed (matching the pattern used for the earlier 65-orphan template cleanup), but most of the relevant FKs (`program_phases→programs`, `program_phase_workouts→program_phases`, `workout_template_exercises→workout_templates`, `client_program_workouts→client_programs`) turned out to be CASCADE already — the actual build only needed one explicit delete (`workout_templates`, since `program_phase_workouts.template_id→workout_templates` is SET NULL, not CASCADE). Checking cascade rules first can turn a multi-step delete into a one-liner, and also settles cleanup-reliability questions empirically (a live "any orphaned rows?" count) instead of trusting that app code has always cleaned up correctly.

3. **Never use DO block variables to look up IDs that depend on rows being deleted.** By the time cleanup runs, source rows may already be gone and the variable silently returns null. Use inline subqueries with a stable anchor instead:
   ```sql
   -- BAD: _coach_id may be null if clients already deleted
   select id into _coach_id from public.profiles where role = 'coach';
   update public.goals set created_by = _coach_id ...

   -- GOOD: anchor on email — always resolvable from auth.users
   update public.goals
     set created_by = (select id from auth.users where email = '<owner_email>')
     where created_by = '<dead_id>';
   ```

4. **Handle every FK column** — not just the obvious ones. If 8 tables point at the table being deleted, handle all 8 before deleting.

5. **Add a verification SELECT between UPDATEs and DELETEs.** Only proceed if all counts are 0:
   ```sql
   select 'goals', count(*) from public.goals where created_by = '<dead_id>'
   union all
   select 'events', count(*) from public.events where created_by = '<dead_id>';
   -- Only run DELETE if all counts = 0
   ```

6. **Use plain SQL statements, not DO blocks**, so each step commits independently and failures are immediately visible. DO blocks roll back the entire transaction on any error.

7. **One self-contained script** — never give Jake a multi-step "run this, then that" sequence.

8. **If the UPDATE reshapes data rather than just flipping a value (e.g. transforming a jsonb column's
   structure, not just setting a scalar), take a backup first** — `create table _<name>_backup_<date> as
   select ... from <table> where <the same condition the UPDATE targets>`, verified with a row-count SELECT
   before the UPDATE runs. A scalar flip (`set role = 'x'`) is trivially reversible by re-running the
   opposite UPDATE; a structural reshape generally isn't once the original shape is gone. Enable RLS on the
   backup table with no policies (default-deny via the app's API, still readable directly in the SQL editor
   which bypasses RLS) — Supabase's own dashboard warns about this when creating a table without RLS, and
   it's right to. Found 2026-08-09 migrating `workout_template_exercises.sets_json` from a cardio N-array
   shape to an interval single-block shape — every other migration in this project's history has been
   purely additive (new nullable column) or a scalar flip, so this was the first genuinely irreversible
   reshape and needed a step the existing checklist didn't cover.

9. **Verify a write with a follow-up SELECT — never with the editor's result message, and never tell
   Jake to "expect N rows" from an UPDATE.** An `UPDATE`/`INSERT` without a `RETURNING` clause returns
   **no rows on success**, and Supabase's SQL editor reports exactly that: *"Success. No rows
   returned."* Found 2026-08-24 the hard way — the consent migration's stamp step was written with
   "Expect 3 rows", Jake correctly read back "success, no rows", and that was taken as a failure. Three
   diagnostic round-trips followed before the real answer emerged: **the UPDATE had worked all along.**

   Every write step ships with its own SELECT that reads the state back:
   ```sql
   update public.profiles set consented_at = now() where id in (...);
   -- verify (this one actually returns rows):
   select consented_at, consent_policy_version from public.profiles where id in (...);
   ```
   The class: **a check that observes the wrong signal.** Identical in shape to `os-lint`'s
   `checkSelfTestFresh`, fixed the same day, which watched a marker file nothing ever wrote. Both look
   like verification; neither is. If a step says "expect N rows", the statement above it had better be
   a `SELECT` or carry a `RETURNING`.

---

## Before writing any RLS policy

1. **Use `in` not `=`** when the subquery could theoretically return multiple rows:
   ```sql
   -- BAD: errors if subquery returns > 1 row
   using (client_id = (select id from public.clients where user_id = auth.uid()))

   -- GOOD: safe for any number of rows
   using (client_id in (select id from public.clients where user_id = auth.uid()))
   ```

2. **Never reference `auth.users` directly in a policy.** The `authenticated` role doesn't have SELECT permission on that table. Use built-in functions instead:
   ```sql
   -- BAD: causes "permission denied for table users"
   using (email = (select email from auth.users where id = auth.uid()))

   -- GOOD: reads directly from JWT, no table access needed
   using (email = auth.email())
   ```
   Same applies to `auth.uid()` — always use the function, never query the table.

3. **The client anchor pattern** for tables that don't store auth.uid() directly:
   ```sql
   -- Most client-data tables use client_id, not user_id
   -- Bridge via: (select id from public.clients where user_id = auth.uid())
   using (
     client_id in (select id from public.clients where user_id = auth.uid())
   )
   ```

4. **SELECT-only policies first.** Only add INSERT/UPDATE/DELETE permissions when building the feature that needs them. Don't grant access speculatively.

5. **Verify policies landed correctly** after every run:
   ```sql
   select tablename, policyname, cmd, qual
   from pg_policies
   where schemaname = 'public'
   order by tablename, policyname;
   ```

6. **If you get "permission denied for table users"**, the cause is always a policy or trigger doing `SELECT FROM auth.users` as the `authenticated` role. Find it with:
   ```sql
   select policyname, cmd, qual, with_check
   from pg_policies
   where tablename = '<affected_table>';
   ```

7. **Always table-qualify the target table's own columns when a policy's `with check`/`using` contains a subquery over a DIFFERENT table with a same-named column.** Postgres resolves an unqualified column against the innermost `FROM` first and does **not** raise an ambiguity error across query levels — it just silently binds to the wrong table.
   ```sql
   -- BAD: `coach_id` inside the subquery binds to `clients.coach_id`, not `workout_logs.coach_id` —
   -- clients HAS a coach_id column, so this compiles and runs, just against the wrong table.
   with check (
     exists (
       select 1 from public.clients c
       where c.id = client_id
         and coach_id = coalesce(c.coach_id, c.user_id)   -- silently means c.coach_id
     )
   )

   -- GOOD: qualify the outer table's column explicitly
   with check (
     exists (
       select 1 from public.clients c
       where c.id = client_id
         and workout_logs.coach_id = coalesce(c.coach_id, c.user_id)
     )
   )
   ```
   Found 2026-07-30 fixing a CRITICAL `workout_logs` INSERT gap: the bare-`coach_id` version above was
   vacuously true for every real coach/client row (`c.coach_id = coalesce(c.coach_id, ...)` is always
   true) and REJECTED every solo row outright (`c.coach_id IS NULL` there, so `NULL = coalesce(NULL, …)`
   evaluates `NULL`, not true) — it would have silently broken every solo workout save in production.
   Caught by 2 independent multi-agent-review passes before it reached Jake, not by testing the SQL
   directly (there's no local way to execute RLS policy SQL against the real schema before Jake runs it) —
   which is itself the reason this rule exists: read every subquery in a new policy asking "which table
   does each bare column name actually belong to," don't trust that Postgres would error if it were wrong.

8. **A `cmd: ALL` policy with no explicit `WITH CHECK` reuses its `USING`/`qual` for writes too — and an
   OR in that `qual` becomes a write-side loophole.** Postgres's documented behaviour: if a policy applies
   to INSERT/UPDATE and no `WITH CHECK` is given, the `USING` expression is used for both. An `OR` clause
   that's perfectly safe for reads (deciding which rows are *visible*) can become exploitable the moment
   it's silently reused to decide which rows are *writable*.
   ```sql
   -- BAD (as found live): "coach access" policy, cmd ALL, no WITH CHECK given
   using (
     client_id in (select id from clients where coach_id = auth.uid())
     or created_by = auth.uid()   -- meant to cover client-less personal events
   )
   -- Since the app always sets created_by = whoever's inserting, this OR trivially
   -- satisfies the reused write-check on ANY insert, regardless of whose client_id it is.

   -- GOOD: give the write path its own, tighter WITH CHECK
   with check (
     client_id in (select id from clients where coach_id = auth.uid())
     or (client_id is null and created_by = auth.uid())   -- self-authorship only covers the null-client case
   )
   ```
   Found 2026-08-02 closing a CONFIRMED-exploitable `events` gap: a live 2-account probe showed an
   unrelated coach could insert a fake calendar event against another coach's real client. Diagnosed from
   `pg_policies` output (`with_check` came back `null` for the ALL policy) — when you see a `cmd: ALL`
   policy with `with_check: null` and its `qual` contains an OR, check whether that OR is safe to reuse for
   writes before assuming it is. Fixed with a targeted `ALTER POLICY ... WITH CHECK (...)`, which only
   changes the write-check and leaves `USING`/reads untouched.

---

## When adding a new role or account type

Any time a new role (e.g. solo/personal account) writes to existing tables, audit RLS coverage for that role explicitly. Existing policies are written for coach and client — a third role is not automatically covered.

**Mandatory steps:**
1. List every `db.from(` call in the new role's code paths
2. For each table touched, run:
   ```sql
   select policyname, cmd, qual, with_check
   from pg_policies
   where tablename = '<table>';
   ```
3. Confirm there is a matching INSERT policy for every INSERT, and SELECT policy for every SELECT+returning
4. The solo/personal pattern: `coach_id is null` records need their own policies — existing `coach_id = auth.uid()` policies do NOT cover them
5. Write missing policies before testing the feature — not after a user reports a 403

**Solo (personal account) anchor pattern:**
```sql
-- Personal account: client_id is null-coached, user_id bridges to auth
using (
  client_id in (
    select id from public.clients
    where user_id = auth.uid() and coach_id is null
  )
)
```

---

## Silent failure audit checklist

After adding any new error-handling code, grep for gaps across **all** module files:

```
grep -n "if (error)" js/*.js
```
(The old single-file bundle has not existed since the 2026-06-30 modularisation. This skill grepped it anyway until
2026-07-13 — a dead grep returns nothing and therefore always "passes". `os-lint`'s dead-file check
now catches this class.)

Every `if (error)` must:
- Call `log.error('functionName', 'description', error)` — never skip this
- Show the error to the user inline (via `errorEl.textContent`) — never use `alert()`
- Return to stop execution

Never use raw `console.error` — always use the `log.error` utility so DevTools output is consistent and tagged.

---

## CoachApp-specific notes

- **Never hardcode a real user's email, name, or UUID in this file.** Until 2026-07-13 this section listed
  the owner's auth uid + email **and a real client's full name and database UUID** — in a directory `/save`
  pushes to GitHub, for a project whose own CRITICAL.md tracks UK GDPR special-category data. `checks.sh`
  never scanned `~/.claude` (this file's location until it moved into this repo 2026-09-16); nothing ever
  looked. `os-lint`'s `skills-pii` check now goes RED on any email or UUID in any skill.
  **Resolve identifiers at query time instead** — they are always one subquery away:
  ```sql
  -- the owner
  (select id from auth.users where email = '<owner_email>')
  -- a client, by a stable anchor you already have
  (select id from public.clients where coach_id = auth.uid() and full_name = '<name>')
  ```
- FK map for `profiles`: clients(coach_id, user_id), goals(created_by), goal_check_ins(created_by), sessions(coach_id), events(created_by), performance_logs(logged_by), programs(coach_id)
- DO blocks in Supabase SQL editor roll back entirely on any error — use plain statements for destructive work

---

## Last step — write the marker (this is what unblocks the commit)

```bash
cp "C:/Users/jaken/.claude/state/session-current" "C:/Users/jaken/.claude/state/sql-safety-ran"
```

`hooks/guardrails.mjs` **RULE 5 blocks `git commit`** when the staged diff contains any `*.sql` and
this skill has not run in the current session. This marker is what clears it. Write it **after** the
checks above, never before — a marker written first is the "reports success while doing nothing"
class this OS keeps finding.

**Why this gate exists (2026-08-24).** "Before any SQL → sql-safety" had been a standing mandate in
`hello-claude` since July, and the 2026-08-23 inventory measured this skill's last real use as
**2026-07-19**. The session that added this gate proved the point while writing it: it authored
`scripts/add-consent-2026-08-24.sql`, a schema change to `profiles`, and never ran this skill. A
mandate read once per session does not fire. RULE 0 — it has a trigger, or it is prose.
