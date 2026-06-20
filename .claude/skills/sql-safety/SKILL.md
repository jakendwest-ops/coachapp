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

3. **Never use DO block variables to look up IDs that depend on rows being deleted.** By the time cleanup runs, source rows may already be gone and the variable silently returns null. Use inline subqueries with a stable anchor instead:
   ```sql
   -- BAD: _coach_id may be null if clients already deleted
   select id into _coach_id from public.profiles where role = 'coach';
   update public.goals set created_by = _coach_id ...

   -- GOOD: anchor on email — always resolvable from auth.users
   update public.goals
     set created_by = (select id from auth.users where email = 'jakendwest@gmail.com')
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

---

## Silent failure audit checklist (app.js)

After adding any new error-handling code, grep for gaps:

```
grep -n "if (error)" js/app.js
```

Every `if (error)` must:
- Call `log.error('functionName', 'description', error)` — never skip this
- Show the error to the user inline (via `errorEl.textContent`) — never use `alert()`
- Return to stop execution

Never use raw `console.error` — always use the `log.error` utility so DevTools output is consistent and tagged.

---

## CoachApp-specific notes

- `auth.uid()` = Jake's user ID = `c930ce7f-3ffd-4b1e-9d7b-2bcb226f4954`
- `auth.email()` = `jakendwest@gmail.com`
- Sarah Mitchell client ID = `7609479e-d135-4aeb-b300-830004e89eb1`
- FK map for `profiles`: clients(coach_id, user_id), goals(created_by), goal_check_ins(created_by), sessions(coach_id), events(created_by), performance_logs(logged_by), programs(coach_id)
- DO blocks in Supabase SQL editor roll back entirely on any error — use plain statements for destructive work
