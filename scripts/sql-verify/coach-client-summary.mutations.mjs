// Deliberate breakages of scripts/add-coach-client-summary-2026-09-20.sql. run-mutations.mjs applies each one and
// requires the verifier to FAIL — proof the checks can fail, so a green run means something.
export const MUTATIONS = {
  m1: { why: 'no security_invoker (the view would run with its owner\'s rights and bypass RLS)',
        pairs: [['with (security_invoker = true) as', 'as']] },
  m2: { why: 'no coach scope inside the view (a client / solo record would appear)',
        pairs: [['where c.coach_id = (select auth.uid());', ';']] },
  m3: { why: 'no revoke (anon and authenticated keep every default privilege)',
        pairs: [['revoke all on public.coach_client_summary from public, anon, authenticated;', '']] },
  m4: { why: 'a different 7-day window',
        pairs: [["(now() at time zone 'utc')::date - 7)", "(now() at time zone 'utc')::date - 6)"]] },
  m5: { why: 'NULL created_at assignments sorted last (coach and client would see different programmes)',
        pairs: [['order by cp.created_at desc, cp.id desc', 'order by cp.created_at desc nulls last, cp.id desc']] },
  m6: { why: 'the workout_logs index has its columns the wrong way round',
        pairs: [['on public.workout_logs (client_id, date desc);', 'on public.workout_logs (date desc, client_id);']] },
  m7: { why: 'a useless weight_logs index',
        pairs: [['on public.weight_logs (client_id, date desc);', 'on public.weight_logs (weight_kg);']] },
  m8: { why: 'a programme with no phases reads as 0 weeks instead of unknown',
        pairs: [['(select nullif(sum(ph.duration_weeks), 0)', '(select coalesce(sum(ph.duration_weeks), 0)']] },
  m9: { why: 'no upper date bound (a future-dated log becomes the last session)',
        pairs: [["    and w.date <= (now() at time zone 'utc')::date\n  order by w.date desc", '  order by w.date desc'],
                ["    and w.date <= (now() at time zone 'utc')::date\n) recent_wl on true", ') recent_wl on true']] },
}
