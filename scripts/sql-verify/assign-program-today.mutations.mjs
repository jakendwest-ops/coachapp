// Deliberate breakages of scripts/fix-assign-program-restart-date-2026-10-17.sql. run-mutations.mjs applies each one and requires the verifier to FAIL — proof the
// checks can fail, so a green run means something. The fix restates the whole function, so every breakage of the ORIGINAL function (assign-program.mutations.mjs) applies
// to it as well and is reused here (its anchors match the new script exactly once; applyMutation refuses a stale one), with the one that names the old four-argument
// signature restated. The rest are about the change itself: p_today, the clamp, and the old function being dropped.
import { MUTATIONS as ORIGINAL } from './assign-program.mutations.mjs'

export const MUTATIONS = {
  ...ORIGINAL,
  m9: { why: 'anon may execute the new function',
        pairs: [['revoke all on function public.assign_program(uuid, uuid, date, boolean, date) from anon;\n', '']] },
  n1: { why: 'p_today is ignored (the archive row still ends on the server\'s UTC day, so the two archive copies disagree)',
        pairs: [['v_ended     date := least(greatest(coalesce(p_today, current_date), current_date - 1), current_date + 1);', 'v_ended     date := current_date;']] },
  n2: { why: 'p_today is not clamped (a wrong device clock writes a wild date into the history)',
        pairs: [['v_ended     date := least(greatest(coalesce(p_today, current_date), current_date - 1), current_date + 1);', 'v_ended     date := coalesce(p_today, current_date);']] },
  n3: { why: 'the clamp lets a date two days either side through',
        pairs: [['least(greatest(coalesce(p_today, current_date), current_date - 1), current_date + 1)', 'least(greatest(coalesce(p_today, current_date), current_date - 2), current_date + 2)']] },
  n4: { why: 'the old four-argument function is not dropped (two functions of one name: the API refuses every call as ambiguous)',
        pairs: [['drop function if exists public.assign_program(uuid, uuid, date, boolean);\n', '']] },
  n5: { why: 'p_today has a default that is not null (every browser that does not send it would stamp a fixed old date)',
        pairs: [['  p_today      date    default null\n)', "  p_today      date    default '2020-01-01'\n)"]] },
  n6: { why: 'the argument is called something else (the browser\'s named argument p_today finds no such function)',
        pairs: [['  p_today      date    default null\n)', '  p_day        date    default null\n)'],
                ['coalesce(p_today, current_date), current_date - 1', 'coalesce(p_day, current_date), current_date - 1']] },
  // Removing the explicit `grant execute ... to authenticated` is NOT a breakage (first mutation run, 2026-10-17): Supabase's default privileges already grant execute on
  // every new function in public to anon, authenticated and service_role (live-schema-programs.mjs mirrors that), so the line restates a default. It is kept so the
  // intent is written down, but nothing can fail without it; the anon revoke (m9) is the one that matters and is tested.
  n8: { why: 'the archive row ignores v_ended and stamps the server date again',
        pairs: [['coalesce(v_existing.created_at, now()), v_ended,', 'coalesce(v_existing.created_at, now()), current_date,']] },
}
