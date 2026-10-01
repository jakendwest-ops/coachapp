// A local copy of the parts of the LIVE database a migration's reads can meet, so SQL can be executed and checked
// BEFORE anyone pastes it into Supabase. Until 2026-09-21 this project had no way to run RLS SQL locally.
//
// PROVENANCE. The tables, indexes and row-level-security policies below were read from the live project on
// 2026-09-20 (Postgres 17.6) with the read-only query at the bottom of this comment, and reproduced EXACTLY — the
// column lists and every policy's USING text are verbatim from that result. Nothing here touches the real database.
//
// WHAT IT COVERS (as first read, 2026-09-20; see the EXTENDED notes below): seven tables — clients, programs, program_phases, client_programs, workout_logs, weight_logs,
// client_check_ins — with RLS enabled, their indexes as they were BEFORE the 2026-09-20 migration, and their SELECT
// and ALL policies (the only ones a read can meet). A Supabase-shaped environment: the roles anon / authenticated /
// service_role, `auth.uid()` reading the JWT subject from `request.jwt.claim.sub`, and Supabase's default grants on
// new public tables.
//
// EXTENDED 2026-09-26: the three UPDATE policies on `clients` (the read filtered to SELECT and ALL the first time, so it
// missed them), exactly as Jake's second, unfiltered read of `clients` returned them, plus `auth.email()`. That is what
// makes "can a client rewrite clients.coach_id?" answerable here — it CAN, which is what the coach_id guard migration fixes.
//
// EXTENDED 2026-10-01: the session-log tables a client's failed-save rollback touches. `workout_log_exercises` and `workout_log_sets` are NEW
// (only the columns their policies and the migration meet: id, log_id, workout_log_exercise_id and a couple of plain ones; the rest of each
// table is NOT reproduced, and neither is the foreign key from workout_log_exercises.log_id, whose delete rule was not read; the
// workout_log_sets -> workout_log_exercises key IS here, ON DELETE CASCADE, as the live constraint list showed), and `workout_logs` gains its
// UPDATE policy (its INSERT and DELETE policies already live in live-schema-programs.mjs, which carries their role lists). Every policy below is verbatim from the unfiltered `pg_policies` read Jake pasted on 2026-10-01
// (qual and with_check). That read did NOT include each policy's role list, so these are created `to public`, the widest grant; every one
// is gated on auth.uid(), so anon matches nothing either way.
//
// WHAT IT DOES NOT COVER (say so before trusting a pass): INSERT / UPDATE / DELETE policies on any table not named in an EXTENDED note
// (the first policy read filtered to SELECT and ALL); the `clients` CHECK and foreign keys, and its `audit_clients` trigger; any
// table not listed; triggers and functions; concurrency and locking; the PostgREST layer (row caps, embeds, the API's own auth);
// PGlite is Postgres 18.x and the live server was 17.6 — the features used so far (RLS, security_invoker views,
// lateral joins, btree indexes) behave the same, but a new feature needs the difference checked.
//
// TO REFRESH OR EXTEND: run this read-only query in the Supabase SQL editor (add table names to the three lists),
// then update the statements below to match. Do this before verifying any migration that touches another table.
//
//   select 'version' as kind, 'postgres'::text as object, version()::text as detail
//   union all
//   select 'column', table_name::text,
//          lpad(ordinal_position::text, 2, '0') || ' ' || column_name::text || ' ' || data_type::text
//            || case when is_nullable = 'NO' then ' NOT NULL' else '' end
//            || ' default ' || coalesce(column_default::text, '-')
//   from information_schema.columns
//   where table_schema = 'public' and table_name in ('clients', 'programs', 'client_programs', 'program_phases',
//                                                     'workout_logs', 'weight_logs', 'client_check_ins')
//   union all
//   select 'rls', c.relname::text, case when c.relrowsecurity then 'enabled' else 'DISABLED' end
//            || case when c.relforcerowsecurity then ' (forced)' else '' end
//   from pg_class c join pg_namespace n on n.oid = c.relnamespace
//   where n.nspname = 'public' and c.relname in (...same list...)
//   union all
//   select 'index', tablename::text, indexdef::text from pg_indexes
//   where schemaname = 'public' and tablename in (...same list...)
//   union all
//   select 'policy', tablename::text,
//          policyname::text || ' [' || cmd::text || '] roles=' || coalesce(array_to_string(roles, ','), '-')
//            || ' using: ' || coalesce(qual, '-')
//   from pg_policies
//   where schemaname = 'public' and tablename in (...same list...)   -- drop the `cmd in (...)` filter to see writes too
//   order by 1, 2, 3;
export const SCHEMA_READ_ON = '2026-09-20'

export async function installLiveSchema(db) {
  // ── a Supabase-shaped environment ─────────────────────────────────────────────────────────────────────────
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    create function auth.email() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.email', true), '') $$;
    grant execute on function auth.email() to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  `)

  // ── the tables, exactly as read from the live schema ──────────────────────────────────────────────────────
  await db.exec(`
    create table public.clients (id uuid primary key default gen_random_uuid(), coach_id uuid, user_id uuid, full_name text not null, email text, phone text,
      date_of_birth date, height_cm numeric, status text default 'active', notes text, created_at timestamptz default now(), updated_at timestamptz default now(),
      invited_at timestamptz, starting_weight_kg numeric, goal_weight_kg numeric);
    create unique index clients_user_id_idx on public.clients (user_id) where user_id is not null;
    create table public.programs (id uuid primary key default gen_random_uuid(), coach_id uuid not null, name text not null, description text, created_at timestamptz default now(), is_personal boolean not null default false);
    create table public.program_phases (id uuid primary key default gen_random_uuid(), program_id uuid not null, name text not null, duration_weeks integer not null default 4,
      order_index integer not null default 0, periodization_type text, periodization_config jsonb);
    create table public.client_programs (id uuid primary key default gen_random_uuid(), client_id uuid not null, program_id uuid not null, start_date date, status text not null default 'active', created_at timestamptz default now());
    create unique index client_programs_client_program_uniq on public.client_programs (client_id, program_id);
    create table public.workout_logs (id uuid primary key default gen_random_uuid(), coach_id uuid not null, client_id uuid not null, template_id uuid, name text not null,
      date date not null default current_date, duration_minutes integer, notes text, created_at timestamptz default now());
    create table public.weight_logs (id uuid primary key default gen_random_uuid(), client_id uuid not null, date date not null, weight_kg numeric not null, body_fat_pct numeric,
      notes text, created_at timestamptz default now(), resting_hr smallint);
    create table public.client_check_ins (id uuid primary key default gen_random_uuid(), client_id uuid not null, sleep integer, energy integer, stress integer, soreness integer,
      notes text, created_at timestamptz not null default now());
    alter table public.clients enable row level security; alter table public.programs enable row level security; alter table public.program_phases enable row level security;
    alter table public.client_programs enable row level security; alter table public.workout_logs enable row level security; alter table public.weight_logs enable row level security;
    alter table public.client_check_ins enable row level security;
  `)

  // ── the policies, exactly as read (SELECT and ALL — the ones a read can meet — plus, from 2026-09-26, the three UPDATE
  //    policies on `clients`) ─────────────────────────────────────────────────────────────────────────────
  await db.exec(`
    create policy "Client reads own check-ins" on public.client_check_ins for select to authenticated using (client_id in (select clients.id from clients where clients.user_id = (select auth.uid())));
    create policy "Coach reads client check-ins" on public.client_check_ins for select to authenticated using (client_id in (select clients.id from clients where clients.coach_id = (select auth.uid())));
    create policy "Clients can view their own program assignments" on public.client_programs for select to public using (client_id in (select clients.id from clients where clients.user_id = auth.uid()));
    create policy "Coach manages client programs" on public.client_programs for all to authenticated using (exists (select 1 from clients where clients.id = client_programs.client_id and clients.coach_id = (select auth.uid())));
    create policy "solo user select own client_programs" on public.client_programs for select to public using (client_id in (select clients.id from clients where clients.user_id = auth.uid() and clients.coach_id is null));
    create policy "Coach manages clients" on public.clients for all to authenticated using ((select auth.uid()) = coach_id);
    create policy "clients: client reads own row" on public.clients for select to authenticated using (user_id = (select auth.uid()));
    create policy "Client stamps own user_id on invite acceptance" on public.clients for update to authenticated using ((email = (select auth.email() as email)) and (user_id is null)) with check (user_id = (select auth.uid() as uid));
    create policy "Coach updates own clients" on public.clients for update to public using (coach_id = (select auth.uid() as uid)) with check (coach_id = (select auth.uid() as uid));
    create policy clients_update_own_row on public.clients for update to public using (user_id = auth.uid()) with check (user_id = auth.uid());
    create policy "Clients can view phases of programs they are assigned to" on public.program_phases for select to public using (program_id in (select client_programs.program_id from client_programs where client_programs.client_id in (select clients.id from clients where clients.user_id = auth.uid())));
    create policy "Coach manages phases of own programs" on public.program_phases for all to authenticated using (exists (select 1 from programs where programs.id = program_phases.program_id and programs.coach_id = (select auth.uid())));
    create policy "Clients can view programs they are assigned to" on public.programs for select to public using (id in (select client_programs.program_id from client_programs where client_programs.client_id in (select clients.id from clients where clients.user_id = auth.uid())));
    create policy "Coach manages own programs" on public.programs for all to authenticated using (coach_id = (select auth.uid()));
    create policy "Client manages own weight logs" on public.weight_logs for all to authenticated using (exists (select 1 from clients where clients.id = weight_logs.client_id and clients.user_id = (select auth.uid())));
    create policy "Coach manages weight logs" on public.weight_logs for all to authenticated using (exists (select 1 from clients where clients.id = weight_logs.client_id and clients.coach_id = (select auth.uid())));
    create policy "Client reads own workout logs" on public.workout_logs for select to authenticated using (exists (select 1 from clients where clients.id = workout_logs.client_id and clients.user_id = (select auth.uid())));
    create policy "coaches read own workout logs" on public.workout_logs for select to authenticated using (coach_id = auth.uid());
  `)

  // ── 2026-10-01: the session-log tables and every policy on them, as Jake's pg_policies read returned them ─────────────
  await db.exec(`
    create table public.workout_log_exercises (id uuid primary key default gen_random_uuid(), log_id uuid not null, exercise_name text not null default '',
      order_index integer not null default 0);
    create table public.workout_log_sets (id uuid primary key default gen_random_uuid(),
      workout_log_exercise_id uuid not null constraint workout_log_sets_exercise_id_fkey references public.workout_log_exercises(id) on delete cascade,
      set_number integer not null default 1, weight_kg numeric, reps_achieved integer);
    alter table public.workout_log_exercises enable row level security; alter table public.workout_log_sets enable row level security;

    create policy "workout_logs_update_owned_client_only" on public.workout_logs for update to authenticated using (coach_id = auth.uid()) with check (exists (select 1 from clients c where ((c.id = workout_logs.client_id) and ((c.coach_id = auth.uid()) or (c.user_id = auth.uid())) and (workout_logs.coach_id = coalesce(c.coach_id, c.user_id)))));

    create policy "coaches manage own log exercises" on public.workout_log_exercises for all to public using (exists (select 1 from workout_logs l where ((l.id = workout_log_exercises.log_id) and (l.coach_id = (select auth.uid() as uid)))));
    create policy "Client inserts own workout log exercises" on public.workout_log_exercises for insert to public with check (log_id in (select workout_logs.id from workout_logs where (workout_logs.client_id in (select clients.id from clients where (clients.user_id = (select auth.uid() as uid))))));
    create policy "Client reads own workout log exercises" on public.workout_log_exercises for select to public using (exists (select 1 from (workout_logs l join clients on ((clients.id = l.client_id))) where ((l.id = workout_log_exercises.log_id) and (clients.user_id = (select auth.uid() as uid)))));

    create policy "coaches manage own log sets" on public.workout_log_sets for all to public using (exists (select 1 from (workout_log_exercises le join workout_logs l on ((l.id = le.log_id))) where ((le.id = workout_log_sets.workout_log_exercise_id) and (l.coach_id = (select auth.uid() as uid)))));
    create policy "Client inserts own workout log sets" on public.workout_log_sets for insert to public with check (workout_log_exercise_id in (select wle.id from (workout_log_exercises wle join workout_logs wl on ((wl.id = wle.log_id))) where (wl.client_id in (select clients.id from clients where (clients.user_id = (select auth.uid() as uid))))));
    create policy "Client reads own workout log sets" on public.workout_log_sets for select to public using (exists (select 1 from ((workout_log_exercises le join workout_logs l on ((l.id = le.log_id))) join clients on ((clients.id = l.client_id))) where ((le.id = workout_log_sets.workout_log_exercise_id) and (clients.user_id = (select auth.uid() as uid)))));
  `)
}
