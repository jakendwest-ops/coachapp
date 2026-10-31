// Deliberate breakages of scripts/add-clients-user-id-guard-2026-10-31.sql. run-mutations.mjs applies each one and requires the verifier
// to FAIL — proof the checks can fail, so a green run means something. Every anchor matches the script exactly once.
export const MUTATIONS = {
  m1: { why: 'the guard never refuses',
        pairs: [["raise exception 'clients.user_id cannot be set from the app' using errcode = '42501';", 'return new;']] },
  m2: { why: 'the admin exemption is gone (the service role and the SQL editor would be refused too)',
        pairs: [["if current_user not in ('authenticated', 'anon') then", 'if false then']] },
  m3: { why: 'an INSERT may carry any user_id',
        pairs: [['    if new.user_id is null then\n      return new;', '    if true then\n      return new;']] },
  m4: { why: 'an INSERT may link the creator themselves',
        pairs: [['    if new.user_id is null then\n      return new;', '    if new.user_id is null or new.user_id = auth.uid() then\n      return new;']] },
  m5: { why: 'an unclaimed row may be claimed for yourself again (the claim path reopened)',
        pairs: [['    if new.user_id is not distinct from old.user_id then\n      return new;\n    end if;\n', '    if new.user_id is not distinct from old.user_id then\n      return new;\n    end if;\n    if old.user_id is null and new.user_id = auth.uid() then\n      return new;\n    end if;\n']] },
  m6: { why: 'the function runs with its OWNER\'s rights (security definer), which would exempt every caller',
        pairs: [['security invoker', 'security definer']] },
  m7: { why: 'the trigger fires only when user_id is named in the SET list',
        pairs: [['before insert or update on public.clients', 'before insert or update of user_id on public.clients']] },
  m8: { why: 'any update is refused, even one that leaves user_id alone',
        pairs: [['if new.user_id is not distinct from old.user_id then', 'if false then']] },
  m9: { why: 'no revoke on the trigger function',
        pairs: [['revoke all on function public.clients_guard_user_id() from public, anon;\n', '']] },
}
