// Deliberate breakages of scripts/fix-coach-client-summary-current-plan-2026-10-29.sql. run-mutations.mjs applies each one and requires the verifier to FAIL — proof the checks
// can fail, so a green run means something. Every anchor matches the fix script exactly once (applyMutation refuses otherwise).
export const MUTATIONS = {
  m1: { why: 'no security_invoker (the restated view would run with its owner\'s rights and bypass RLS)',
        pairs: [['with (security_invoker = true) as', 'as']] },
  m2: { why: 'no coach scope inside the view (the solo record would appear)',
        pairs: [['where c.coach_id = (select auth.uid());', ';']] },
  m3: { why: 'no revoke (a view re-granted to anon stays readable by anon)',
        pairs: [['revoke all on public.coach_client_summary from public, anon, authenticated;', '']] },
  m4: { why: 'the old order: newest-assigned wins (the bug)',
        pairs: [['  order by case when st.s <= (now() at time zone \'utc\')::date then st.s end desc nulls last,    -- started plans first, the latest start first\n           st.s asc,                                                                           -- else the soonest upcoming\n           cp.created_at desc nulls last, cp.id desc', '  order by cp.created_at desc, cp.id desc']] },
  m5: { why: 'upcoming plans sort before started ones',
        pairs: [['then st.s end desc nulls last', 'then st.s end desc nulls first']] },
  m6: { why: 'a plan starting TODAY counts as upcoming, not started',
        pairs: [['  order by case when st.s <= (now()', '  order by case when st.s < (now()']] },
  m7: { why: 'next_program_start does not exclude the current plan',
        pairs: [['    and n.id is distinct from prog.client_program_id\n', '']] },
  m8: { why: 'a plan with neither a start date nor an assigned time counts as upcoming, not started',
        pairs: [["(cp.created_at at time zone 'utc')::date, '-infinity'::date)", "(cp.created_at at time zone 'utc')::date, 'infinity'::date)"]] },
  m9: { why: 'an undated plan is not dated by when it was assigned',
        pairs: [["coalesce(cp.start_date, (cp.created_at at time zone 'utc')::date, '-infinity'::date)", "coalesce(cp.start_date, '-infinity'::date)"]] },
  m10: { why: 'ties go to the OLDEST assignment',
        pairs: [['cp.created_at desc nulls last, cp.id desc', 'cp.created_at asc nulls last, cp.id desc']] },
}
