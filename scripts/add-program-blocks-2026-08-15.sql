-- ============================================================================
-- Programme block history: client_program_blocks
-- ============================================================================
-- WHY
-- Re-assigning a programme someone already has HARD-DELETES the previous
-- assignment (_removeAssignmentAndClones, js/app-programs.js:261). There is a
-- unique index on (client_id, program_id), so a restart cannot keep the old
-- row. The previous block's start_date is destroyed — and with it any way to
-- ask "how did I do in the last block compared with this one?".
--
-- workout_logs carries NO programme reference at all: saveRunnerSession inserts
-- only coach_id, client_id, name, date, notes (js/app-runner.js:2326-2328), and
-- the template id is discarded before the runner even starts (:47). So a block
-- can only ever be a DATE RANGE. This table records that range at the moment
-- the assignment is dropped, which is the last instant the information exists.
--
-- WHY A SEPARATE TABLE, NOT client_programs.archived_at
-- 13 code sites read client_programs; EIGHT of them answer "which programme is
-- this person on?" via .order('created_at',desc).limit(1). An archived row left
-- in that table could be picked by any of them — painting a finished block
-- across the calendar, both dashboards and the Workouts page. It would also
-- force the unique index to become partial, which makes stacked assignments
-- legal again at the DB level: the exact mechanism behind the 32 invisible
-- self-assignments found on this account (js/app-programs.js:225-232).
-- Nothing existing reads THIS table, so it has no regression surface at all.
--
-- SAFETY
-- Purely additive. Creates one table; alters nothing; updates nothing.
-- Reversible with:  drop table if exists public.client_program_blocks;
-- ============================================================================

-- 1. Table --------------------------------------------------------------------
create table if not exists public.client_program_blocks (
  id           uuid primary key default gen_random_uuid(),

  -- Tenancy anchor. Deliberately NO coach_id column: a solo clients row has
  -- coach_id NULL, and a coach_id filter has silently excluded solo four
  -- separate times in this codebase. Tenancy bridges through clients, which
  -- handles coach, client and solo uniformly.
  client_id    uuid not null references public.clients(id) on delete cascade,

  -- SET NULL, not CASCADE. deleteProgram archives the assignment and THEN
  -- deletes the programme (js/app-programs.js:1318 then :1339) — a cascade here
  -- would wipe the history row milliseconds after it was written, and the loss
  -- would stay invisible for months.
  program_id   uuid references public.programs(id) on delete set null,

  -- Snapshot, so a block stays readable after its programme is deleted or
  -- renamed. This is what makes program_id being nullable survivable.
  program_name text not null,

  -- The window. start_date is copied from client_programs.start_date and is
  -- NULLABLE there, so assigned_at is the fallback anchor — it mirrors the
  -- created_at that all eight "current programme" reads already order by.
  start_date   date,
  assigned_at  timestamptz not null,
  ended_at     date not null default current_date,

  -- Sum of program_phases.duration_weeks at close — the same length arithmetic
  -- the calendar does (js/app-calendar-goals.js:65,:77). Display only; lets the
  -- UI say "12-week block, ended at week 9". Nullable: a programme with no
  -- phases yet legitimately has none.
  planned_weeks int,

  -- 'restarted' | 'removed' | 'program_deleted'. Free text, never a branch
  -- condition — it is a label for the user, not control flow.
  ended_reason text,

  -- Provenance only. NO foreign key: the row it names is deleted in the very
  -- next statement.
  source_client_program_id uuid,

  created_at   timestamptz not null default now()
);

create index if not exists client_program_blocks_client_idx
  on public.client_program_blocks (client_id, ended_at desc);

-- 2. RLS ----------------------------------------------------------------------
-- A new table with RLS off is a leak; with RLS on and no policy it is a
-- silently broken feature. Both classes have shipped here before, so both
-- halves land in this one script.
alter table public.client_program_blocks enable row level security;

drop policy if exists "read own program blocks" on public.client_program_blocks;
create policy "read own program blocks"
on public.client_program_blocks
for select
to authenticated
using (
  client_id in (
    select c.id from public.clients c
    where c.coach_id = auth.uid() or c.user_id = auth.uid()
  )
);

drop policy if exists "insert own program blocks" on public.client_program_blocks;
create policy "insert own program blocks"
on public.client_program_blocks
for insert
to authenticated
with check (
  client_id in (
    select c.id from public.clients c
    where c.coach_id = auth.uid() or c.user_id = auth.uid()
  )
);

-- No UPDATE and no DELETE policy, deliberately. This table is append-only: the
-- entire point is that history cannot be destroyed by the app. Rows still go
-- when their client does, via the CASCADE above — which is what keeps GDPR
-- erasure complete.
--
-- Policy shape notes: `in` not `=` (a coach has many clients); every column
-- table-qualified (c.coach_id / c.user_id — an unqualified one nearly broke
-- every solo save on 2026-07-30); no `for all` policy, so there is no
-- USING-reused-as-WITH-CHECK loophole; and the coach_id OR user_id bridge is
-- the solo-safe form CLAUDE.md mandates.

-- 3. Verify -------------------------------------------------------------------
-- select policyname, cmd from pg_policies where tablename = 'client_program_blocks';
--   -- expect exactly 2 rows: SELECT and INSERT
-- select count(*) from public.client_program_blocks;
--   -- expect 0. There is NO backfill and there cannot be: past assignments were
--   -- hard-deleted and their start dates do not exist anywhere. History starts
--   -- accruing from the first restart AFTER this ships.
