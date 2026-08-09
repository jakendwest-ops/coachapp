// CoachApp — invite-solo-user Edge Function (2026-08-09)
//
// Creates a brand-new, standalone solo/personal account: sends a real Supabase invite email, then
// (bypassing RLS via the service-role client, which only Edge Functions may safely hold) sets
// profiles.role='solo' and creates the self-referential `clients` row (user_id = own account,
// coach_id = null). Never creates a coach_id-linked row — this account is never "someone's client" at
// any point, unlike the existing invite-client function used for coach->client invites.
//
// Deployed via the Supabase Dashboard (Edge Functions -> Deploy a new function -> paste this file's
// contents -> Deploy). Not deployable from this repo directly -- no Supabase CLI/config is tracked here.
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected automatically by Supabase
// into every deployed function's runtime -- nothing to configure manually.
//
// SECURITY: the caller's identity is resolved from their OWN Authorization header (never trusted from
// the request body) and hard-gated to jakendwest@gmail.com server-side. The client-side Settings-card
// check (js/app-progress.js) that hides this feature from everyone else is a UI convenience only --
// this check is what actually stops any other authenticated user (coach, client, or solo) from calling
// this URL directly and provisioning arbitrary accounts.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { email, name } = await req.json()
    if (!email || typeof email !== 'string' || !name || typeof name !== 'string') {
      return json({ error: 'email and name are required' }, 400)
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

    // Resolve WHO is calling from their own token -- never trust a client-supplied identity claim.
    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user: caller }, error: callerErr } = await callerClient.auth.getUser()
    if (callerErr || !caller) return json({ error: 'Invalid session' }, 401)

    // Hard server-side gate -- see file header. Not optional, not a stand-in for the UI check.
    if (caller.email !== 'jakendwest@gmail.com') return json({ error: 'Not authorized' }, 403)

    // Privileged client -- service role, bypasses RLS. Only ever constructed after the gate above.
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    )

    // Idempotent -- don't blindly re-invite an already-registered email (errors confusingly otherwise).
    const { data: existingList, error: listErr } = await adminClient.auth.admin.listUsers()
    if (listErr) return json({ error: listErr.message }, 500)
    const already = existingList?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase())

    let userId: string
    if (already) {
      // Refuse to silently reassign an existing coach/client account into a solo account -- only a
      // genuine re-run of THIS SAME invite (already role='solo') is safe to proceed past this point.
      // Found by multi-agent-review: without this check, inviting an email that already belongs to a
      // real coach or client would silently overwrite their role and could leave a mismatched
      // profiles.role='solo' / clients.coach_id=<a real coach> record.
      const { data: existingProfile, error: existingProfErr } = await adminClient.from('profiles').select('role').eq('id', already.id).maybeSingle()
      if (existingProfErr) return json({ error: existingProfErr.message }, 500)
      if (existingProfile?.role && existingProfile.role !== 'solo') {
        return json({ error: `${email} already has an existing '${existingProfile.role}' account -- refusing to convert it. Use a different email.` }, 409)
      }
      userId = already.id
    } else {
      const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
        data: { full_name: name },
        redirectTo: 'https://jakendwest-ops.github.io/coachapp/',
      })
      if (error || !data?.user) return json({ error: error?.message || 'Invite failed' }, 500)
      userId = data.user.id
    }

    // handle_new_user (a DB trigger, not tracked in this repo) already created a default profiles row
    // the moment the auth row landed -- default role is 'coach'. Overwrite to the real, native solo role.
    const { error: profErr } = await adminClient.from('profiles').update({ role: 'solo', full_name: name }).eq('id', userId)
    if (profErr) return json({ error: profErr.message }, 500)

    // Self-referential clients row -- user_id points to their OWN account, coach_id stays null forever.
    const { data: existingClientRow, error: existingClientErr } = await adminClient.from('clients').select('id').eq('user_id', userId).maybeSingle()
    if (existingClientErr) return json({ error: existingClientErr.message }, 500)
    if (!existingClientRow) {
      const { error: clientErr } = await adminClient.from('clients').insert({ user_id: userId, coach_id: null, full_name: name, email })
      if (clientErr) return json({ error: clientErr.message }, 500)
    }

    return json({ userId }, 200)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500)
  }
})
