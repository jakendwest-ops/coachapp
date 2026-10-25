// A local copy of the `events` table and its row-level-security policies as they are on the LIVE project, so SQL that touches them can be executed and
// checked BEFORE anyone pastes it into Supabase. Added 2026-10-18 for scripts/add-client-link-guard-2026-10-18.sql.
//
// PROVENANCE. Every policy below is VERBATIM from the unfiltered pg_policies read Jake pasted on 2026-10-18 (role list, qual and with_check, in pg_get_expr's own
// printed form, which is valid SQL). Run it after installLiveSchema(): it needs `public.clients`.
//
// WHAT IT COVERS: `events` with RLS enabled and ALL seven of its policies. WHAT IT DOES NOT: indexes, the audit and lock_created_at triggers, CHECK constraints,
// and any column the policies and the scripts do not meet - only id, client_id, created_by, title, date, type, notes and is_pt_assigned are reproduced. The key to
// clients is ON DELETE CASCADE (an assumption, not read from the live constraint list).
export async function installEventsSchema(db) {
  await db.exec(`
    create table public.events (
      id uuid primary key default gen_random_uuid(),
      client_id uuid references public.clients(id) on delete cascade,
      created_by uuid,
      title text not null default 'event',
      date date not null default current_date,
      type text,
      notes text,
      is_pt_assigned boolean not null default false
    );
    alter table public.events enable row level security;

    create policy "Client deletes own personal events" on public.events for delete to authenticated
      using (((created_by = ( SELECT auth.uid() AS uid)) AND (is_pt_assigned = false)));
    create policy "Client inserts own events" on public.events for insert to authenticated
      with check (((client_id IN ( SELECT clients.id FROM clients WHERE (clients.user_id = ( SELECT auth.uid() AS uid)))) AND (is_pt_assigned = false)));
    create policy "Client manages own personal events" on public.events for update to authenticated
      using (((EXISTS ( SELECT 1 FROM clients WHERE ((clients.id = events.client_id) AND (clients.user_id = ( SELECT auth.uid() AS uid))))) AND (is_pt_assigned = false)))
      with check (((EXISTS ( SELECT 1 FROM clients WHERE ((clients.id = events.client_id) AND (clients.user_id = ( SELECT auth.uid() AS uid))))) AND (is_pt_assigned = false)));
    create policy "Client reads own events" on public.events for select to authenticated
      using ((EXISTS ( SELECT 1 FROM clients WHERE ((clients.id = events.client_id) AND (clients.user_id = ( SELECT auth.uid() AS uid))))));
    create policy "Coach deletes own events" on public.events for delete to public
      using ((created_by = ( SELECT auth.uid() AS uid)));
    create policy "Coach updates own events" on public.events for update to public
      using ((created_by = ( SELECT auth.uid() AS uid)))
      with check ((created_by = ( SELECT auth.uid() AS uid)));
    create policy "coach access" on public.events for all to authenticated
      using ((((client_id IN ( SELECT clients.id FROM clients WHERE (clients.coach_id = ( SELECT auth.uid() AS uid)))) OR (created_by = ( SELECT auth.uid() AS uid)))))
      with check ((((client_id IN ( SELECT clients.id FROM clients WHERE (clients.coach_id = auth.uid()))) OR ((client_id IS NULL) AND (created_by = auth.uid())))));
  `)
}
