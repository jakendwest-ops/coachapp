// The lift-name tables the merge touches, for the PGlite verifiers: client_1rms and performance_logs (workout_log_exercises is in live-schema.mjs).
// Policies and triggers are VERBATIM from Jake's pg_policies / pg_trigger reads of 2026-11-02 (the queries are in docs/superpowers/plans/2026-11-01-merge-lift-names.md,
// Task 0). Only the columns the merge and its policies meet are reproduced: the rest of each table is NOT. Role lists are as read; all policies are modelled permissive.
// The audit trigger (`audit_*` -> log_audit_event(), AFTER INSERT/UPDATE/DELETE on workout_log_exercises and performance_logs) is modelled with its body as read on 2026-11-07;
// the audit_log table is reduced to the columns that function writes. Call AFTER installLiveSchema(db).
export const LIFTS_SCHEMA_READ_ON = '2026-11-02'

export async function installLiftTables(db) {
  await db.exec(`
    -- Supabase grants EXECUTE on every new function in public to anon, authenticated and service_role (harden-anon-access.verify.mjs models it the same way): without this the
    -- fixture would give anon execute only through PUBLIC, and a script that revoked from PUBLIC alone would look locked down here but not live.
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
    -- NOTE: live-schema-programs.mjs / -goals / -events define their own lock_created_at(); do not install two of these fixtures on one database (the second would fail: function exists).
    create function public.lock_created_at() returns trigger language plpgsql as $$ begin new.created_at := old.created_at; return new; end $$;

    create table public.client_1rms (id uuid primary key default gen_random_uuid(), client_id uuid not null, exercise_id uuid, exercise_name text not null,
      one_rm_kg numeric, recorded_at date default current_date, created_at timestamptz default now());
    create table public.performance_logs (id uuid primary key default gen_random_uuid(), client_id uuid not null, name text not null, category text,
      logged_by uuid, created_at timestamptz default now());
    alter table public.client_1rms enable row level security; alter table public.performance_logs enable row level security;
    -- The audit trigger, body VERBATIM from Jake's read of 2026-11-07: SECURITY DEFINER, search_path '', one audit_log row per changed row, changed_by = auth.uid() (which a definer function
    -- called by a signed-in user still sees: auth.uid() reads the request's JWT setting, not the current role). On live it sits on workout_log_exercises and performance_logs.
    create table public.audit_log (id bigint generated always as identity primary key, table_name text, operation text, record_id uuid, old_data jsonb, new_data jsonb, changed_by uuid, created_at timestamptz default now());
    alter table public.audit_log enable row level security;
    create function public.log_audit_event() returns trigger language plpgsql security definer set search_path to '' as $$
    begin
      insert into public.audit_log (table_name, operation, record_id, old_data, new_data, changed_by)
      values (TG_TABLE_NAME, TG_OP, case TG_OP when 'DELETE' then OLD.id else NEW.id end, case TG_OP when 'INSERT' then null else to_jsonb(OLD) end, case TG_OP when 'DELETE' then null else to_jsonb(NEW) end, auth.uid());
      return coalesce(NEW, OLD);
    end;
    $$;
    create trigger audit_performance_logs after insert or delete or update on public.performance_logs for each row execute function public.log_audit_event();
    create trigger audit_workout_log_exercises after insert or delete or update on public.workout_log_exercises for each row execute function public.log_audit_event();
    create trigger lock_created_at before update on public.client_1rms for each row execute function public.lock_created_at();
    create trigger lock_created_at before update on public.performance_logs for each row execute function public.lock_created_at();

    create policy "Coach manages client 1RMs" on public.client_1rms for all to public using (client_id in (select clients.id from clients where clients.coach_id = (select auth.uid())));
    create policy "Client deletes own 1RMs" on public.client_1rms for delete to public using (client_id in (select clients.id from clients where clients.user_id = auth.uid()));
    create policy "solo user delete own client_1rms" on public.client_1rms for delete to public using (client_id in (select clients.id from clients where clients.user_id = auth.uid() and clients.coach_id is null));
    create policy "Client inserts own 1RMs" on public.client_1rms for insert to public with check (client_id in (select clients.id from clients where clients.user_id = auth.uid()));
    create policy "solo user insert own client_1rms" on public.client_1rms for insert to public with check (client_id in (select clients.id from clients where clients.user_id = auth.uid() and clients.coach_id is null));
    create policy "Client reads own 1RMs" on public.client_1rms for select to public using (client_id in (select clients.id from clients where clients.user_id = (select auth.uid())));
    create policy "Client updates own 1RMs" on public.client_1rms for update to public using (client_id in (select clients.id from clients where clients.user_id = auth.uid())) with check (client_id in (select clients.id from clients where clients.user_id = auth.uid()));
    create policy "solo user update own client_1rms" on public.client_1rms for update to public using (client_id in (select clients.id from clients where clients.user_id = auth.uid() and clients.coach_id is null)) with check (client_id in (select clients.id from clients where clients.user_id = auth.uid() and clients.coach_id is null));

    create policy "Coach manages client performance" on public.performance_logs for all to authenticated using (client_id in (select clients.id from clients where clients.coach_id = (select auth.uid())));
    create policy "Client deletes own performance logs" on public.performance_logs for delete to public using (client_id in (select clients.id from clients where clients.user_id = auth.uid()));
    create policy "Coach deletes own performance logs" on public.performance_logs for delete to public using (logged_by = (select auth.uid()));
    create policy "Client inserts own performance log" on public.performance_logs for insert to authenticated with check (client_id in (select clients.id from clients where clients.user_id = (select auth.uid())));
    create policy "Client manages own performance" on public.performance_logs for select to authenticated using (client_id in (select clients.id from clients where clients.user_id = (select auth.uid())));
  `)
}
