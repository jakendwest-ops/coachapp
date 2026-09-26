// Deliberate breakages of scripts/add-clients-coach-id-guard-2026-09-26.sql. run-mutations.mjs applies each one and requires
// the verifier to FAIL — proof the checks can fail, so a green run means something.
export const MUTATIONS = {
  m1: { why: 'the guard never refuses (a client could still re-point their row at another coach)',
        pairs: [["raise exception 'clients.coach_id cannot be changed from the API' using errcode = '42501';", 'return new;']] },
  // `not in ('nobody')` would be TRUE for every role and switch the whole guard off (that is m1 again, and the reason m2 was
  // rewritten 2026-09-26 after review). `if false` removes only the exemption, so the service role and the SQL editor fall through
  // to the refusal.
  m2: { why: 'the admin exemption is gone (the service role and the SQL editor would be refused too)',
        pairs: [["if current_user not in ('authenticated', 'anon') then", 'if false then']] },
  m3: { why: 'the accepted self-detach is refused',
        pairs: [['if new.coach_id is null and old.user_id is not null and old.user_id = auth.uid() then', 'if false then']] },
  m4: { why: 'anyone may set coach_id to NULL (an invitee could detach in the same statement as claiming the row)',
        pairs: [['if new.coach_id is null and old.user_id is not null and old.user_id = auth.uid() then', 'if new.coach_id is null then']] },
  m5: { why: 'the function has no fixed search_path',
        pairs: [['set search_path = public, pg_temp\n', '']] },
  m6: { why: 'the function runs with its OWNER\'s rights (security definer), which would exempt every caller',
        pairs: [['security invoker', 'security definer']] },
  m7: { why: 'the trigger fires on every update instead of only when coach_id is named',
        pairs: [['before update of coach_id on public.clients', 'before update on public.clients']] },
  m8: { why: 'an update that leaves coach_id unchanged is refused too',
        pairs: [['if new.coach_id is not distinct from old.coach_id then', 'if false then']] },
  m9: { why: 'the trigger is not re-creatable (a plain create fails on the second run)',
        pairs: [['create or replace trigger clients_guard_coach_id', 'create trigger clients_guard_coach_id']] },
  m10: { why: 'the function is not re-creatable (a plain create fails on the second run)',
         pairs: [['create or replace function public.clients_guard_coach_id()', 'create function public.clients_guard_coach_id()']] },
}
