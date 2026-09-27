// Extends live-schema.mjs with everything the programme lifecycle touches, read from the LIVE project on 2026-09-27
// (Postgres 17.6) with the read-only query in scripts/add-assign-program-rpc-2026-09-27.sql's history (the "schema read for
// the assign-program transaction"). Columns, constraints (with their ON DELETE rules), unique indexes, and EVERY policy on
// these tables (all commands, USING and WITH CHECK) are reproduced verbatim from that result.
//
// ADDS: program_phase_workouts, workout_templates, workout_template_exercises, client_program_workouts, client_program_blocks
// (tables + policies + the grants that differ from the default: client_program_blocks is INSERT/SELECT only); the write
// policies on client_programs that live-schema.mjs left out; the foreign keys between all of these and the base tables; and
// the two triggers that change rows (set_workout_template_family_id, touch_parent_workout_template).
//
// DOES NOT ADD: the audit_log triggers (log_audit_event writes to public.audit_log as SECURITY DEFINER; it cannot refuse a
// write and is not modelled), lock_created_at, the `exercises` table (its two foreign keys are left out), client_1rms.
// Call AFTER installLiveSchema(db).
export const PROGRAMS_SCHEMA_READ_ON = '2026-09-27'

export async function installProgramLifecycleSchema(db) {
  await db.exec(`
    create table public.program_phase_workouts (id uuid primary key default gen_random_uuid(), phase_id uuid not null, template_id uuid,
      day_label text not null, order_index integer not null default 0, day_of_week integer, notes text, session_order integer not null default 1,
      week_number integer not null default 1, tier text,
      constraint program_phase_workouts_tier_check check (tier = any (array['heavy'::text, 'moderate'::text, 'light'::text])));
    create table public.workout_templates (id uuid primary key default gen_random_uuid(), coach_id uuid not null, name text not null, description text,
      notes text, created_at timestamptz default now(), program_id uuid, client_id uuid, generated_from_phase_id uuid,
      is_personal boolean not null default false, family_id uuid, updated_at timestamptz default now());
    create table public.workout_template_exercises (id uuid primary key default gen_random_uuid(), template_id uuid not null, exercise_id uuid,
      exercise_name text not null, order_index integer default 0, sets integer, reps integer, weight_kg numeric, rest_seconds integer, notes text,
      exercise_type text default 'strength', sets_json jsonb, one_rm_kg numeric, superset_group text, metric_type text not null default 'weight_reps',
      constraint wte_metric_type_chk check (metric_type = any (array['weight_reps'::text, 'cardio'::text, 'unilateral'::text, 'amrap'::text,
        'timed_hold'::text, 'jump_height'::text, 'jump_distance'::text, 'interval'::text])));
    create table public.client_program_workouts (id uuid primary key default gen_random_uuid(), client_program_id uuid not null,
      program_phase_workout_id uuid not null, workout_template_id uuid not null, created_at timestamptz default now(), week_number integer not null default 1,
      constraint client_program_workouts_client_program_id_program_phase_wor_key unique (client_program_id, program_phase_workout_id));
    create table public.client_program_blocks (id uuid primary key default gen_random_uuid(), client_id uuid not null, program_id uuid,
      program_name text not null, start_date date, assigned_at timestamptz not null, ended_at date not null default current_date, planned_weeks integer,
      ended_reason text, source_client_program_id uuid, created_at timestamptz not null default now());

    alter table public.client_programs add constraint client_programs_status_check check (status = any (array['active'::text, 'paused'::text, 'completed'::text]));
    alter table public.client_programs add constraint client_programs_client_id_fkey foreign key (client_id) references public.clients(id) on delete cascade;
    alter table public.client_programs add constraint client_programs_program_id_fkey foreign key (program_id) references public.programs(id) on delete cascade;
    alter table public.program_phases add constraint program_phases_program_id_fkey foreign key (program_id) references public.programs(id) on delete cascade;
    alter table public.program_phase_workouts add constraint program_phase_workouts_phase_id_fkey foreign key (phase_id) references public.program_phases(id) on delete cascade;
    alter table public.program_phase_workouts add constraint program_phase_workouts_template_id_fkey foreign key (template_id) references public.workout_templates(id) on delete set null;
    alter table public.workout_templates add constraint workout_templates_client_id_fkey foreign key (client_id) references public.clients(id) on delete cascade;
    alter table public.workout_templates add constraint workout_templates_generated_from_phase_id_fkey foreign key (generated_from_phase_id) references public.program_phases(id) on delete set null;
    alter table public.workout_templates add constraint workout_templates_program_id_fkey foreign key (program_id) references public.programs(id) on delete set null;
    alter table public.workout_template_exercises add constraint workout_template_exercises_template_id_fkey foreign key (template_id) references public.workout_templates(id) on delete cascade;
    alter table public.client_program_workouts add constraint client_program_workouts_client_program_id_fkey foreign key (client_program_id) references public.client_programs(id) on delete cascade;
    alter table public.client_program_workouts add constraint client_program_workouts_program_phase_workout_id_fkey foreign key (program_phase_workout_id) references public.program_phase_workouts(id) on delete cascade;
    alter table public.client_program_workouts add constraint client_program_workouts_workout_template_id_fkey foreign key (workout_template_id) references public.workout_templates(id) on delete cascade;
    alter table public.client_program_blocks add constraint client_program_blocks_client_id_fkey foreign key (client_id) references public.clients(id) on delete cascade;
    alter table public.client_program_blocks add constraint client_program_blocks_program_id_fkey foreign key (program_id) references public.programs(id) on delete set null;
    alter table public.workout_logs add constraint workout_logs_client_id_fkey foreign key (client_id) references public.clients(id) on delete cascade;
    alter table public.workout_logs add constraint workout_logs_template_id_fkey foreign key (template_id) references public.workout_templates(id) on delete set null;

    alter table public.program_phase_workouts enable row level security; alter table public.workout_templates enable row level security;
    alter table public.workout_template_exercises enable row level security; alter table public.client_program_workouts enable row level security;
    alter table public.client_program_blocks enable row level security;

    -- Supabase grants EXECUTE on every new function in public to anon, authenticated and service_role by default (and PUBLIC
    -- has it by Postgres default). Without modelling this, a script's "revoke ... from anon" could be deleted and nothing here
    -- would notice (found by the assign_program mutation run, 2026-09-27).
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

    -- the live grants on client_program_blocks are narrower than the default
    revoke all on public.client_program_blocks from anon;
    revoke all on public.client_program_blocks from authenticated;
    grant insert, select, references, trigger, truncate on public.client_program_blocks to authenticated;
    grant references, trigger, truncate on public.client_program_blocks to anon;
  `)

  // ── triggers that change rows ─────────────────────────────────────────────────────────────────────────────
  await db.exec(`
    create function public.set_workout_template_family_id() returns trigger language plpgsql as $f$
    begin
      if new.family_id is null then
        new.family_id := new.id;
      end if;
      return new;
    end $f$;
    create trigger trg_workout_template_family_id before insert on public.workout_templates for each row execute function public.set_workout_template_family_id();
    create function public.touch_workout_template_updated_at() returns trigger language plpgsql as $f$
    begin
      new.updated_at := now();
      return new;
    end $f$;
    create trigger trg_touch_workout_template before update on public.workout_templates for each row execute function public.touch_workout_template_updated_at();
    create function public.touch_parent_workout_template() returns trigger language plpgsql security definer set search_path to 'public' as $f$
    begin
      update workout_templates
         set updated_at = now()
       where id = coalesce(new.template_id, old.template_id);
      return null;
    end $f$;
    create trigger trg_touch_parent_workout_template after insert or delete or update on public.workout_template_exercises for each row execute function public.touch_parent_workout_template();
  `)

  // ── the policies, verbatim ────────────────────────────────────────────────────────────────────────────────
  await db.exec(`
    create policy "Coach deletes own client program assignments" on public.client_programs for delete to public using (client_id in (select clients.id from clients where clients.coach_id = (select auth.uid() as uid)));
    create policy "solo user delete own client_programs" on public.client_programs for delete to public using (client_id in (select clients.id from clients where clients.user_id = auth.uid() and clients.coach_id is null));
    create policy "solo user insert own client_programs" on public.client_programs for insert to public with check (client_id in (select clients.id from clients where clients.user_id = auth.uid() and clients.coach_id is null));
    create policy "solo user update own client_programs" on public.client_programs for update to public using (client_id in (select clients.id from clients where clients.user_id = auth.uid() and clients.coach_id is null)) with check (client_id in (select clients.id from clients where clients.user_id = auth.uid() and clients.coach_id is null));

    create policy "insert own program blocks" on public.client_program_blocks for insert to authenticated with check (client_id in (select c.id from clients c where c.coach_id = auth.uid() or c.user_id = auth.uid()));
    create policy "read own program blocks" on public.client_program_blocks for select to authenticated using (client_id in (select c.id from clients c where c.coach_id = auth.uid() or c.user_id = auth.uid()));

    create policy client_read_cpw on public.client_program_workouts for select to authenticated using (client_program_id in (select cp.id from client_programs cp join clients c on c.id = cp.client_id where c.user_id = auth.uid()));
    create policy coach_manage_cpw on public.client_program_workouts for all to authenticated using (client_program_id in (select cp.id from client_programs cp join clients c on c.id = cp.client_id where c.coach_id = auth.uid())) with check (client_program_id in (select cp.id from client_programs cp join clients c on c.id = cp.client_id where c.coach_id = auth.uid()));
    create policy "solo user insert own client_program_workouts" on public.client_program_workouts for insert to public with check (client_program_id in (select cp.id from client_programs cp join clients c on c.id = cp.client_id where c.user_id = auth.uid() and c.coach_id is null));
    create policy "solo user select own client_program_workouts" on public.client_program_workouts for select to public using (client_program_id in (select cp.id from client_programs cp join clients c on c.id = cp.client_id where c.user_id = auth.uid() and c.coach_id is null));

    create policy "Clients can view phase workouts of programs they are assigned t" on public.program_phase_workouts for select to public using (phase_id in (select pp.id from program_phases pp join client_programs cp on cp.program_id = pp.program_id where cp.client_id in (select clients.id from clients where clients.user_id = auth.uid())));
    create policy "Coach deletes own phase workouts" on public.program_phase_workouts for delete to public using (phase_id in (select program_phases.id from program_phases where program_phases.program_id in (select programs.id from programs where programs.coach_id = (select auth.uid() as uid))));
    create policy "Coach manages phase workouts" on public.program_phase_workouts for all to authenticated using (exists (select 1 from program_phases pp join programs p on p.id = pp.program_id where pp.id = program_phase_workouts.phase_id and p.coach_id = (select auth.uid() as uid)));

    create policy "Client reads own template exercises" on public.workout_template_exercises for select to public using (template_id in (select workout_templates.id from workout_templates where workout_templates.client_id in (select clients.id from clients where clients.user_id = auth.uid()) or workout_templates.coach_id = (select clients.coach_id from clients where clients.user_id = auth.uid())));
    create policy "Coach deletes own template exercises" on public.workout_template_exercises for delete to public using (template_id in (select workout_templates.id from workout_templates where workout_templates.coach_id = (select auth.uid() as uid)));
    create policy "Coach updates own template exercises" on public.workout_template_exercises for update to public using (template_id in (select workout_templates.id from workout_templates where workout_templates.coach_id = (select auth.uid() as uid))) with check (template_id in (select workout_templates.id from workout_templates where workout_templates.coach_id = (select auth.uid() as uid)));
    create policy "coaches manage own template exercises" on public.workout_template_exercises for all to authenticated using (exists (select 1 from workout_templates t where t.id = workout_template_exercises.template_id and t.coach_id = (select auth.uid() as uid)));

    create policy "Client reads workout templates" on public.workout_templates for select to public using (client_id is null and coach_id in (select clients.coach_id from clients where clients.user_id = auth.uid() and clients.coach_id is not null));
    create policy "Coach deletes own templates" on public.workout_templates for delete to public using (coach_id = (select auth.uid() as uid));
    create policy "Coach updates own templates" on public.workout_templates for update to public using (coach_id = (select auth.uid() as uid)) with check (coach_id = (select auth.uid() as uid));
    create policy client_read_own_templates on public.workout_templates for select to authenticated using (client_id in (select clients.id from clients where clients.user_id = auth.uid()));
    create policy "coaches manage own templates" on public.workout_templates for all to authenticated using (coach_id = (select auth.uid() as uid)) with check (coach_id = (select auth.uid() as uid));

    create policy "Coach deletes own workout logs" on public.workout_logs for delete to public using (coach_id = (select auth.uid() as uid));
    create policy workout_logs_insert_owned_client_only on public.workout_logs for insert to authenticated with check (exists (select 1 from clients c where c.id = workout_logs.client_id and (c.coach_id = auth.uid() or c.user_id = auth.uid()) and workout_logs.coach_id = coalesce(c.coach_id, c.user_id)));
  `)
}
