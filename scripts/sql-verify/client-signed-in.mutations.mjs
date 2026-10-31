// Deliberate breakages of scripts/add-client-signed-in-2026-10-31.sql. run-mutations.mjs applies each one and requires the verifier to FAIL — proof the checks
// can fail, so a green run means something. Every anchor matches the script exactly once (applyMutation refuses otherwise).
export const MUTATIONS = {
  m1: { why: 'the function runs with the caller\'s rights (the own-row rule on profiles hides every client\'s row from the coach)',
        pairs: [['stable\nsecurity definer\n', 'stable\nsecurity invoker\n']] },
  m2: { why: 'no coach scope in the function (any signed-in user learns whether any client has signed in)',
        pairs: [['  where c.id = p_client_id\n    and c.coach_id = (select auth.uid())\n', '  where c.id = p_client_id\n']] },
  m3: { why: 'no revoke (anon keeps the default EXECUTE)',
        pairs: [['revoke all on function public.coach_client_signed_in(uuid) from public, anon;\n', '']] },
  m4: { why: 'no fixed search_path on the SECURITY DEFINER function',
        pairs: [['security definer\nset search_path = public, pg_temp\n', 'security definer\n']] },
  m5: { why: 'the view loses security_invoker',
        pairs: [['with (security_invoker = true) as', 'as']] },
  m6: { why: 'the answer is inverted',
        pairs: [['select p.consented_at is not null', 'select p.consented_at is null']] },
  m7: { why: 'the profile is joined on the wrong person (the coach, not the client\'s login)',
        pairs: [['join public.profiles p on p.id = c.user_id', 'join public.profiles p on p.id = c.coach_id']] },
  m8: { why: 'no revoke on the view (a view re-granted to anon stays readable by anon)',
        pairs: [['revoke all on public.coach_client_summary from public, anon, authenticated;', '']] },
}
