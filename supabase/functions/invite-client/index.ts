// A COPY of the Edge Function deployed as `invite-client`, so it can be read and checked here (scripts/check-external-surface.mjs). First taken from the
// Supabase dashboard on 2026-10-25; hardened 2026-10-29 (docs/bugs/2026-10-25-invite-client-function-loads-an-unpinned-library-and-ignores-failed-writes.md).
// The deployed copy is what runs: editing this file changes nothing until the same text is pasted into the dashboard
// (Edge Functions > invite-client > Code > Deploy). Keep the two identical.
//
// Pinned to the exact supabase-js the app itself loads (index.html), from npm rather than a CDN: this code holds the service-role key.
import { createClient } from 'npm:@supabase/supabase-js@2.117.2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Every refusal is a fixed message: raw database or auth error text never reaches the browser (it could say whether an email has an account).
function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Not signed in' }, 401)

    let body: { email?: unknown, clientId?: unknown }
    try { body = await req.json() } catch { return json({ error: 'email and clientId are required' }, 400) }
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const clientId = typeof body.clientId === 'string' ? body.clientId : ''
    if (!email || !clientId) return json({ error: 'email and clientId are required' }, 400)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!

    // Resolve WHO is calling from their own token - never from the request body.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    })
    const { data: { user: callingUser }, error: userError } = await userClient.auth.getUser()
    if (userError || !callingUser) return json({ error: 'Not signed in' }, 401)

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

    // The client must belong to this coach. Someone else's client and a missing one answer the same.
    const { data: client, error: clientError } = await admin
      .from('clients')
      .select('id, user_id')
      .eq('id', clientId)
      .eq('coach_id', callingUser.id)
      .maybeSingle()
    if (clientError || !client) return json({ error: 'Client not found' }, 404)
    if (client.user_id) return json({ error: 'This client already has an account' }, 409)

    // Refuse an email that already has an account, confirmed or not: for a pending invite or an unfinished signup the invite below would
    // return that EXISTING user, and the writes after it would overwrite their role and link them to this coach's client. Every page is
    // read (invite-solo-user reads only the first), following GoTrue's own nextPage, and a list too long to finish refuses rather than passes.
    let listed = false
    for (let page = 1; page <= 50; page++) {
      const { data: list, error: listError } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
      if (listError) { console.error('invite-client: listUsers failed'); return json({ error: 'Invite failed - try again' }, 500) }
      const users = list?.users ?? []
      if (users.some(u => u.email?.toLowerCase() === email)) return json({ error: 'This email cannot be invited - use a different one' }, 409)
      if (!list?.nextPage || !users.length) { listed = true; break }
    }
    if (!listed) { console.error('invite-client: user list not finished'); return json({ error: 'Invite failed - try again' }, 500) }

    // Send the invite: the auth user is created now and its id returned.
    const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email)
    if (inviteError || !inviteData?.user) { console.error('invite-client: inviteUserByEmail failed'); return json({ error: 'Invite failed - try again' }, 500) }
    const newUserId = inviteData.user.id

    // A second invite of the same email racing this one gets back the FIRST one's user. If any client row already links it, it is not ours:
    // leave it alone (no role write, no link, no delete).
    const { data: alreadyLinked, error: linkedError } = await admin.from('clients').select('id').eq('user_id', newUserId).limit(1)
    if (linkedError) { console.error('invite-client: link check failed', { newUserId }); return json({ error: 'Invite failed - try again' }, 500) }
    if (alreadyLinked?.length) return json({ error: 'This email cannot be invited - use a different one' }, 409)

    // A failed write below would leave an account behind that blocks every retry (the email now exists). This request just proved the
    // email was new and nothing links the user, so the half-made account is its own to delete: undo it and let the coach try again.
    const undoInvite = async () => {
      const { error } = await admin.auth.admin.deleteUser(newUserId)
      if (error) console.error('invite-client: undo failed', { newUserId })
      return json({ error: 'Invite failed - try again' }, 500)
    }

    const { error: profileError } = await admin.from('profiles').upsert({
      id: newUserId,
      full_name: email.split('@')[0],
      role: 'client'
    })
    if (profileError) {
      console.error('invite-client: profile write failed', { newUserId })
      return await undoInvite()
    }

    // Link only if the row is still this coach's and still unlinked, and prove a row changed: two invites racing cannot both win.
    const { data: linked, error: linkError } = await admin.from('clients')
      .update({ user_id: newUserId })
      .eq('id', clientId)
      .eq('coach_id', callingUser.id)
      .is('user_id', null)
      .select('id')
    if (linkError || !linked?.length) {
      console.error('invite-client: client link failed', { clientId, newUserId })
      return await undoInvite()
    }

    return json({ success: true }, 200)

  } catch (_err) {
    console.error('invite-client: unexpected error')
    return json({ error: 'Invite failed - try again' }, 500)
  }
})
