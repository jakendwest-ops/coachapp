// A COPY of the Edge Function deployed as `invite-client`, taken from the Supabase dashboard on 2026-10-25 so it can be read and checked here
// (scripts/check-external-surface.mjs). The deployed copy is what runs: editing this file changes nothing until the same text is pasted into the dashboard
// (Edge Functions > invite-client > Code > Deploy). Keep the two identical.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { email, clientId } = await req.json()
    if (!email || !clientId) throw new Error('email and clientId are required')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!

    // Verify the calling user is authenticated
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('No auth header')

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    })
    const { data: { user: callingUser }, error: userError } = await userClient.auth.getUser()
    if (userError || !callingUser) throw new Error('Unauthorised')

    const admin = createClient(supabaseUrl, serviceKey)

    // Confirm the client belongs to this coach
    const { data: client, error: clientError } = await admin
      .from('clients')
      .select('id, user_id')
      .eq('id', clientId)
      .eq('coach_id', callingUser.id)
      .single()

    if (clientError || !client) throw new Error('Client not found')
    if (client.user_id) throw new Error('Client already has an account')

    // Send invite — user is created immediately and ID is returned
    const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email)
    if (inviteError) throw new Error(inviteError.message)

    const newUserId = inviteData.user.id

    // Stamp everything now using service role — guaranteed, no RLS, no triggers needed
    await admin.from('profiles').upsert({
      id: newUserId,
      full_name: email.split('@')[0],
      role: 'client'
    })

    await admin.from('clients')
      .update({ user_id: newUserId })
      .eq('id', clientId)

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }
    })
  }
})
