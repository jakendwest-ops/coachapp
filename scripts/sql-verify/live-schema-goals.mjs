// A local copy of the goal tables and their row-level-security policies as they are on the LIVE project, so SQL that touches them can be executed and checked
// BEFORE anyone pastes it into Supabase. Added 2026-10-15 for scripts/add-solo-goal-milestones-policy-2026-10-15.sql.
//
// PROVENANCE. Every policy below is VERBATIM from the unfiltered pg_policies read Jake pasted on 2026-10-15 (qual and with_check, in pg_get_expr's own printed form,
// which is valid SQL). That read did NOT include each policy's role list, so they are created `to public`, the widest grant; every one is gated on auth.uid(), so anon
// matches nothing either way (the same caveat live-schema.mjs states for its 2026-10-01 extension). Run it after installLiveSchema(): it needs `public.clients`.
//
// WHAT IT COVERS: goals, goal_milestones and goal_check_ins with RLS enabled and ALL of their policies. WHAT IT DOES NOT: indexes, triggers (goals/goal_milestones/
// goal_check_ins carry a lock_created_at BEFORE UPDATE trigger on live), CHECK constraints, and any column the policies and the scripts do not meet - only id, the
// foreign keys, created_by, title, status and the few plain columns the checks use are reproduced. The foreign keys to goals are ON DELETE CASCADE (the app deletes a
// goal and expects its steps and check-ins to go; not read from the live constraint list - an assumption, stated).
export async function installGoalsSchema(db) {
  await db.exec(`
    create table public.goals (
      id uuid primary key default gen_random_uuid(),
      client_id uuid not null references public.clients(id) on delete cascade,
      created_by uuid,
      title text not null default 'goal',
      status text not null default 'active',
      start_value numeric, current_value numeric, target_value numeric
    );
    create table public.goal_milestones (
      id uuid primary key default gen_random_uuid(),
      goal_id uuid not null references public.goals(id) on delete cascade,
      title text not null default 'step',
      target_value numeric,
      completed_at timestamptz
    );
    create table public.goal_check_ins (
      id uuid primary key default gen_random_uuid(),
      goal_id uuid not null references public.goals(id) on delete cascade,
      created_by uuid,
      date date not null default current_date,
      current_value numeric,
      notes text
    );
    alter table public.goals enable row level security;
    alter table public.goal_milestones enable row level security;
    alter table public.goal_check_ins enable row level security;

    -- goal_check_ins
    create policy "Client manages own check-ins" on public.goal_check_ins for all
      using ((EXISTS ( SELECT 1 FROM (goals JOIN clients ON ((clients.id = goals.client_id))) WHERE ((goals.id = goal_check_ins.goal_id) AND (clients.user_id = ( SELECT auth.uid() AS uid))))));
    create policy "Coach manages check-ins" on public.goal_check_ins for all
      using ((EXISTS ( SELECT 1 FROM (goals JOIN clients ON ((clients.id = goals.client_id))) WHERE ((goals.id = goal_check_ins.goal_id) AND (clients.coach_id = ( SELECT auth.uid() AS uid))))));

    -- goal_milestones
    create policy "Client reads own milestones" on public.goal_milestones for select
      using ((EXISTS ( SELECT 1 FROM (goals JOIN clients ON ((clients.id = goals.client_id))) WHERE ((goals.id = goal_milestones.goal_id) AND (clients.user_id = ( SELECT auth.uid() AS uid))))));
    create policy "Client updates own goal milestones" on public.goal_milestones for update
      using ((goal_id IN ( SELECT goals.id FROM goals WHERE (goals.client_id IN ( SELECT clients.id FROM clients WHERE (clients.user_id = ( SELECT auth.uid() AS uid)))))));
    create policy "Coach manages milestones" on public.goal_milestones for all
      using ((EXISTS ( SELECT 1 FROM (goals JOIN clients ON ((clients.id = goals.client_id))) WHERE ((goals.id = goal_milestones.goal_id) AND (clients.coach_id = ( SELECT auth.uid() AS uid))))));
    create policy "Coach updates own goal milestones" on public.goal_milestones for update
      using ((goal_id IN ( SELECT goals.id FROM goals WHERE (goals.created_by = ( SELECT auth.uid() AS uid)))))
      with check ((goal_id IN ( SELECT goals.id FROM goals WHERE (goals.created_by = ( SELECT auth.uid() AS uid)))));

    -- goals
    create policy "Client reads own goals" on public.goals for select
      using ((EXISTS ( SELECT 1 FROM clients WHERE ((clients.id = goals.client_id) AND (clients.user_id = ( SELECT auth.uid() AS uid))))));
    create policy "Client updates own goal progress" on public.goals for update
      using ((client_id IN ( SELECT clients.id FROM clients WHERE (clients.user_id = ( SELECT auth.uid() AS uid)))))
      with check ((client_id IN ( SELECT clients.id FROM clients WHERE (clients.user_id = ( SELECT auth.uid() AS uid)))));
    create policy "Coach deletes own client goals" on public.goals for delete
      using ((created_by = ( SELECT auth.uid() AS uid)));
    create policy "Coach manages goals" on public.goals for all
      using ((EXISTS ( SELECT 1 FROM clients WHERE ((clients.id = goals.client_id) AND (clients.coach_id = ( SELECT auth.uid() AS uid))))))
      with check ((EXISTS ( SELECT 1 FROM clients c WHERE ((c.id = goals.client_id) AND ((c.coach_id = ( SELECT auth.uid() AS uid)) OR ((c.coach_id IS NULL) AND (c.user_id = ( SELECT auth.uid() AS uid))))))));
    create policy "Coach updates own client goals" on public.goals for update
      using ((created_by = ( SELECT auth.uid() AS uid)))
      with check ((created_by = ( SELECT auth.uid() AS uid)));
  `)
}
