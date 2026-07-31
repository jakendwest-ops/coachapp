-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CRITICAL — workout_logs INSERT policy has no ownership check between client_id and coach_id.
-- Confirmed exploitable 2026-07-30 via a live cross-tenant probe: an unrelated coach (owning zero
-- clients of their own) successfully inserted a workout_logs row with client_id pointing at ANOTHER
-- coach's real client — both through the app's own code (a JS-level bug, fixed separately in
-- js/app-runner.js) AND via a raw insert() call that bypassed the app's JS entirely. The raw-insert
-- result proves the gap is at the RLS layer itself, not just sloppy app code: any authenticated coach
-- can currently fabricate a workout log against any other coach's client if they know (or guess) that
-- client's UUID, and the fabricated session is then visible to the real client on their own
-- dashboard/workout history, attributed to a coach_id of the attacker's choosing.
--
-- STEP 1 — run this diagnostic FIRST. Do not run Step 2 until you've looked at the output: this
-- script is written from the codebase's own conventions (coach_id + client_id anchor pattern used
-- elsewhere, e.g. the 2026-07-11 workout_templates fix), not from having seen the live policy
-- definition — there is no local access to pg_policies from this environment. If the existing policy
-- name below doesn't match what Step 1 shows, adjust Step 2's policy name before running it.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

-- STEP 1 — diagnostic (read-only, safe to run anytime)
select policyname, cmd, qual, with_check
from pg_policies
where tablename = 'workout_logs'
order by cmd, policyname;

-- Also worth checking while you're here — the same write-chain sits underneath workout_logs, so if
-- their own policies don't independently anchor on log ownership, a bogus log_id could still let
-- exercises/sets attach to it. (In practice this should already be closed transitively once Step 2
-- below stops a bogus workout_logs row from ever being created against someone else's client — but
-- confirm rather than assume.)
select tablename, policyname, cmd, qual, with_check
from pg_policies
where tablename in ('workout_log_exercises', 'workout_log_sets')
order by tablename, cmd, policyname;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- STEP 2 — the fix, using the REAL policy names Jake's Step-1 diagnostic returned 2026-07-30
-- (superseding the guessed names in an earlier draft of this script). Real findings:
--   - "coaches manage own workout logs" (cmd=ALL, qual/with_check both `coach_id = auth.uid()`) is
--     the actual root cause — it backs SELECT/INSERT/UPDATE/DELETE for a coach off `coach_id` alone,
--     with NO check that `client_id` belongs to a client that coach actually owns. This is what let
--     PT2 insert against PT's real client.
--   - "Client inserts own workout log" (INSERT) checks `client_id` belongs to the inserting user, but
--     never checks `coach_id` matches that client's REAL coach — a client could self-log with an
--     arbitrary coach_id.
--   - "Coach updates own workout logs" (UPDATE) has the exact same gap as the ALL policy's INSERT
--     side, but for UPDATE: a coach could take one of their own legitimate logs and re-point its
--     client_id at a client they don't own, since with_check only re-verifies coach_id.
--   - "Coach deletes own workout logs" (DELETE) and "Client reads own workout logs" (SELECT) are
--     untouched below — neither has this gap (no client_id/coach_id consistency question for a pure
--     delete-your-own-rows or read-your-own-rows check).
-- Covers all 3 legitimate write patterns: (a) coach for their own real client, (b) solo for
-- themselves (self-referential clients row, coach_id null there, but the app writes coach_id = own
-- uid), (c) client self-logging (coach_id on the row = their real coach's id).
-- ════════════════════════════════════════════════════════════════════════════════════════════════

-- Splits SELECT out of the old ALL policy so coaches keep read access once ALL is dropped.
drop policy if exists "coaches manage own workout logs" on public.workout_logs;
create policy "coaches read own workout logs"
on public.workout_logs
for select
to authenticated
using (coach_id = auth.uid());

-- Replaces the ALL policy's implicit INSERT coverage AND "Client inserts own workout log" with one
-- combined, correctly-anchored check.
drop policy if exists "Client inserts own workout log" on public.workout_logs;
create policy "workout_logs_insert_owned_client_only"
on public.workout_logs
for insert
to authenticated
with check (
  exists (
    select 1 from public.clients c
    where c.id = client_id
      and (c.coach_id = auth.uid() or c.user_id = auth.uid())
      -- MUST be table-qualified — a bare `coach_id` here resolves against the innermost FROM
      -- (clients c) first, no cross-level ambiguity error, so it silently became
      -- `c.coach_id = coalesce(c.coach_id, c.user_id)` in an earlier draft: vacuously true for every
      -- real client/coach row, and REJECTED every solo row outright. Caught by 2 independent
      -- reviewers before this reached Jake.
      and workout_logs.coach_id = coalesce(c.coach_id, c.user_id)
  )
);

-- Replaces "Coach updates own workout logs" — same ownership check as INSERT, so a coach can still
-- only target rows they currently own (using), but can no longer re-point client_id onto a client
-- they don't own via the update itself (with check).
drop policy if exists "Coach updates own workout logs" on public.workout_logs;
create policy "workout_logs_update_owned_client_only"
on public.workout_logs
for update
to authenticated
using (coach_id = auth.uid())
with check (
  exists (
    select 1 from public.clients c
    where c.id = client_id
      and (c.coach_id = auth.uid() or c.user_id = auth.uid())
      and workout_logs.coach_id = coalesce(c.coach_id, c.user_id)
  )
);

-- STEP 3 — verify the new policies landed, then re-run the app's own write paths (log a real workout
-- as coach, as solo, and as a client) to confirm nothing legitimate broke before considering this
-- closed.
select policyname, cmd, qual, with_check
from pg_policies
where tablename = 'workout_logs'
order by cmd, policyname;
