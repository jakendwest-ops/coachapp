// Deliberate breakages of scripts/add-client-link-guard-2026-10-18.sql. run-mutations.mjs applies each one and requires the verifier to FAIL -
// proof the checks can fail, so a green run means something.
const TRG = (t, when = 'before insert or update of client_id') => `create or replace trigger ${t}_guard_client_id\n  ${when} on public.${t}\n  for each row execute function public.guard_client_id_change();\n`
const ADMIN = "  if current_user not in ('authenticated', 'anon') then\n    return new;\n  end if;\n\n"
const NULLTEST = "  if new.client_id is null then\n    return new;\n  end if;\n\n"
const SAME = "  if tg_op = 'UPDATE' then\n    if new.client_id is not distinct from old.client_id then\n      return new;\n    end if;\n  end if;\n\n"
const OWN = '      and (c.coach_id = auth.uid() or c.user_id = auth.uid())'
export const MUTATIONS = {
  m1: { why: 'the guard raises nothing (it lets every change through)',
        pairs: [["  raise exception 'client_id must belong to one of your own clients' using errcode = '42501';", '  return new;']] },
  m2: { why: 'the admin exemption is gone (the SQL editor / service role would be refused too)',
        pairs: [[ADMIN, '']] },
  m3: { why: 'the "client_id is unchanged" shortcut is gone (renaming a clone left by a detached client is refused)',
        pairs: [[SAME, '']] },
  m4: { why: 'a user_id match no longer counts (the master account and solo users are refused on their own records)',
        pairs: [[OWN, '      and (c.coach_id = auth.uid())']] },
  m5: { why: 'a coach_id match no longer counts (a coach is refused on their own clients)',
        pairs: [[OWN, '      and (c.user_id = auth.uid())']] },
  m6: { why: 'the NULL shortcut is gone (a client-less personal event or library template is refused)',
        pairs: [[NULLTEST, '']] },
  m7: { why: 'no trigger on events',
        pairs: [[TRG('events'), '']] },
  m8: { why: 'no trigger on goals',
        pairs: [[TRG('goals'), '']] },
  m9: { why: 'no trigger on workout_templates',
        pairs: [[TRG('workout_templates'), '']] },
  m10: { why: 'workout_templates is guarded on UPDATE only (a template can still be INSERTED at another coach\'s client)',
         pairs: [[TRG('workout_templates'), TRG('workout_templates', 'before update of client_id')]] },
  m11: { why: 'events is guarded on INSERT only (an owned event can still be re-pointed by UPDATE)',
         pairs: [[TRG('events'), TRG('events', 'before insert')]] },
  m12: { why: 'the function runs with its OWNER\'s rights (it would see every client, and current_user would be the admin role)',
         pairs: [['security invoker\nset search_path', 'security definer\nset search_path']] },
  m13: { why: 'the events trigger is not re-creatable (a plain create fails on the second run)',
         pairs: [['create or replace trigger events_guard_client_id', 'create trigger events_guard_client_id']] },
  m14: { why: 'the rollback in the header names a trigger that does not exist',
         pairs: [['-- ROLLBACK (all additive): drop trigger events_guard_client_id on public.events;', '-- ROLLBACK (all additive): drop trigger events_guard_client on public.events;']] },
  m15: { why: 'the function has no fixed search_path',
         pairs: [['set search_path = public, pg_temp\nas $$', 'as $$']] },
  m16: { why: 'the function is left executable by anon (no revoke)',
         pairs: [['revoke all on function public.guard_client_id_change() from public, anon;\n', '']] },
  m17: { why: 'the ownership test is "true" (any existing client id passes)',
         pairs: [[OWN, '      and (true)']] },
  m18: { why: 'anon is exempt (only authenticated is constrained)',
         pairs: [["if current_user not in ('authenticated', 'anon') then", "if current_user not in ('authenticated') then"]] },
  m19: { why: 'the goals trigger is UPDATE-only (a goal can still be INSERTED at another coach\'s client)',
         pairs: [[TRG('goals'), TRG('goals', 'before update of client_id')]] },
}
