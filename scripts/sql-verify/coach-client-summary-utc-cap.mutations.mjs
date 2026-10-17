// Deliberate breakages of scripts/fix-coach-client-summary-utc-cap-2026-10-17.sql. run-mutations.mjs applies each one and requires the verifier to FAIL — proof the checks can
// fail, so a green run means something. Every anchor matches the fix script exactly once (applyMutation refuses otherwise).
export const MUTATIONS = {
  m1: { why: 'no security_invoker (the restated view would run with its owner\'s rights and bypass RLS)',
        pairs: [['with (security_invoker = true) as', 'as']] },
  m2: { why: 'no coach scope inside the view (a client / solo record would appear)',
        pairs: [['where c.coach_id = (select auth.uid());', ';']] },
  m3: { why: 'no revoke (a view re-granted to anon stays readable by anon)',
        pairs: [['revoke all on public.coach_client_summary from public, anon, authenticated;', '']] },
  m4: { why: 'the last-session cap loses its one-day allowance (the session is hidden again)',
        pairs: [["    and w.date <= (now() at time zone 'utc')::date + 1\n  order by w.date desc", "    and w.date <= (now() at time zone 'utc')::date\n  order by w.date desc"]] },
  m5: { why: 'the window cap loses its one-day allowance (the session is hidden from the counts)',
        pairs: [["    and w.date <= (now() at time zone 'utc')::date + 1\n) recent_wl on true", "    and w.date <= (now() at time zone 'utc')::date\n) recent_wl on true"]] },
  m6: { why: 'the allowance is three days (a log two days ahead becomes the last session)',
        pairs: [["    and w.date <= (now() at time zone 'utc')::date + 1\n  order by w.date desc", "    and w.date <= (now() at time zone 'utc')::date + 3\n  order by w.date desc"]] },
  m7: { why: 'no upper bound on the last session at all (a year-off typo becomes the last session)',
        pairs: [["    and w.date <= (now() at time zone 'utc')::date + 1\n  order by w.date desc", '  order by w.date desc']] },
  m8: { why: 'a different 7-day window',
        pairs: [["(now() at time zone 'utc')::date - 7)", "(now() at time zone 'utc')::date - 6)"]] },
}
