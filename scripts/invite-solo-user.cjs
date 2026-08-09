// CoachApp — invite a brand-new, standalone solo/personal account (2026-08-09)
//
// Why this exists: public self-signup was removed entirely on 2026-07-24 (it handed anyone with the
// URL a full PT/coach account — the "Scott West signup incident"). The only account-creation path since
// then is a coach inviting an existing CLIENT into their own roster. That's not what this is for — this
// creates someone their OWN standalone personal account, never associated with any coach, never passing
// through a "client" row at all. They get a real invite email and set their own name/password through
// the app's existing invite-acceptance screen (index.html #invite-form) — same tested flow client
// invites already use, just landing on role='solo' instead of role='client'.
//
// Run locally, never from a browser/deployed function — this uses the SERVICE ROLE key, which bypasses
// RLS entirely. Never commit that key; it's read from an env var only.
//
//   SUPABASE_SERVICE_KEY=... node scripts/invite-solo-user.cjs friend@example.com "Friend Name"
//
// Safe to re-run for the SAME email if something fails partway through (checks for an existing user
// first rather than blindly re-inviting).

const { createClient } = require('@supabase/supabase-js')

const [, , email, name] = process.argv
if (!email || !name) {
  console.error('Usage: SUPABASE_SERVICE_KEY=... node scripts/invite-solo-user.cjs <email> "<Full Name>"')
  process.exit(1)
}

const db = createClient(
  'https://avilxuiacmtgeoxxhfhc.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || '',
  { auth: { persistSession: false } }
)

async function run() {
  if (!process.env.SUPABASE_SERVICE_KEY) throw new Error('SUPABASE_SERVICE_KEY env var is not set')

  // Don't blindly re-invite — a second invite to an already-registered email errors confusingly.
  const { data: existing } = await db.auth.admin.listUsers()
  const already = existing?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase())
  let userId
  if (already) {
    // Refuse to silently reassign an existing coach/client account into a solo account -- only a
    // genuine re-run of THIS SAME invite (already role='solo') is safe to proceed past this point.
    // Found by multi-agent-review on the Edge Function twin of this script: without this check,
    // re-running against an email that already belongs to a real coach or client would silently
    // overwrite their role and could leave a mismatched profiles.role='solo' / clients.coach_id=<real
    // coach> record.
    const { data: existingProfile, error: existingProfErr } = await db.from('profiles').select('role').eq('id', already.id).maybeSingle()
    if (existingProfErr) throw existingProfErr
    if (existingProfile?.role && existingProfile.role !== 'solo') {
      throw new Error(`${email} already has an existing '${existingProfile.role}' account -- refusing to convert it. Use a different email.`)
    }
    console.log('User already exists, reusing:', already.id)
    userId = already.id
  } else {
    const { data, error } = await db.auth.admin.inviteUserByEmail(email, {
      data: { full_name: name },
      redirectTo: 'https://jakendwest-ops.github.io/coachapp/',
    })
    if (error) throw error
    userId = data.user.id
    console.log('Invited, new auth user id:', userId)
  }

  // handle_new_user (a DB trigger, not tracked in this repo) already created a default `profiles` row
  // for this user the moment the auth row landed — default role is 'coach' (no matching invited-client
  // row exists for this flow, since we never create one). Overwrite it to the real, native solo role.
  const { error: profErr } = await db.from('profiles')
    .update({ role: 'solo', full_name: name })
    .eq('id', userId)
  if (profErr) throw profErr

  // The self-referential clients row loadUserInfo() looks up for window._soloClientId — user_id points
  // to their OWN account, coach_id is null. Never any coach_id, at any point, unlike the client-invite
  // flow — this account is never "someone's client" even transiently.
  const { data: existingClientRow, error: existingClientErr } = await db.from('clients').select('id').eq('user_id', userId).maybeSingle()
  if (existingClientErr) throw existingClientErr
  if (!existingClientRow) {
    const { error: clientErr } = await db.from('clients').insert({
      user_id: userId, coach_id: null, full_name: name, email,
    })
    if (clientErr) throw clientErr
    console.log('Created self-referential clients row')
  } else {
    console.log('clients row already exists, left as-is:', existingClientRow.id)
  }

  // Verify — should show role:'solo', starter_seeded:false (seeds correctly, is_personal:true, the
  // moment they first log in — no manual step needed for that part). Only ids/status logged, no name.
  const { data: verify } = await db.from('profiles').select('id, role, starter_seeded').eq('id', userId).single()
  console.log('✅ Done:', verify)
}

run().catch(e => { console.error('❌ Error:', e.message); process.exit(1) })
