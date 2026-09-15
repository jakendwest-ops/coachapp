---
id: 2026-08-11-gdpr-no-consent-capture-and-no-privacy-policy
status: deferred
priority: critical
reported: 2026-08-11
status_detail: "DEFERRED by Jake 2026-08-19. NOTE: the premise was partly wrong — /privacy-policy.html EXISTS and is LIVE (200, complete 11-section UK GDPR policy, in repo since 2026-06-29). What is actually missing is the consent checkbox and the LINK, both removed by 57a188a (2026-07-24) along with the public signup form they sat on. So this is not blocked on Jake writing anything."
---

# GDPR — no consent capture and no privacy policy, with a live beta tester already onboarded

Found by `/deploy-check` step 5c on 2026-08-11. **This blocks inviting anyone new. It does not block
deploying code** — those are different gates and should not be conflated.

## What's actually missing

- **No consent capture anywhere in the app.** There is no public signup form (signup is invite-only via
  the Edge Function built 2026-08-09), but the **invite form is where a beta tester activates their
  account** — `index.html` `#invite-form`, name + password + "Activate account" — and it has no consent
  checkbox and no link to anything.
- **No privacy policy exists at all.** Not a `#` placeholder — the string "privacy policy" does not
  appear anywhere in `index.html` or `js/`. The Settings "Data & privacy" card has prose ("Your data is
  stored in the EU under UK GDPR") but nothing to link to.
- **A real outside beta tester was onboarded 2026-08-09** and activated their account under exactly this
  gap. This is a live compliance hole, not a future one.

## Why this is `critical` rather than `high`

`CRITICAL.md` tracks this app as handling **UK GDPR special-category data** — health data: body weight,
progress photos, check-ins, training logs. Consent for special-category processing is not a formality,
and "we'll add it before launch" stopped being true the moment a non-Jake human created an account.

## What IS already in place (so this is a gap, not a rebuild)

- Settings → "Data & privacy" card exists (`app-progress.js:1968`)
- `downloadMyData()` — full GDPR export bundle (`app-progress.js:2208`)
- `deleteAccount()` → `db.rpc('delete_current_user')` (`app-progress.js:2258`)
- Data is stored in the EU (Supabase `eu-west-1`)

⚠️ `delete_current_user`'s existence in the database was **not verified** — it cannot be tested without
destroying a real account. Confirm with:

```sql
select p.proname,
       pg_get_function_identity_arguments(p.oid) as args,
       p.prosecdef                               as security_definer,
       n.nspname                                 as schema
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.proname = 'delete_current_user';
```

Zero rows means the Delete-my-account button fails at runtime for the first person who taps it.

## The work, in dependency order

1. **Write the privacy policy.** The long pole, and Jake's to write or approve — it is a document, not
   code. Must cover: what is collected (incl. health data and photos), why, lawful basis, where it is
   stored (Supabase, EU `eu-west-1`), retention, the data subject's rights, and a contact.
2. **Host it.** A static page in the repo is sufficient — this is a GitHub Pages site.
3. **Consent checkbox on `#invite-form`**, linking to the policy, blocking activation until ticked.
   Store `consented_at` (timestamp) and the policy **version** on the profile, so a future policy change
   is detectable rather than silently assumed.
4. **Link the policy from the Settings "Data & privacy" card** as well as the invite form.
5. **Obtain consent retroactively from the existing beta tester** — fix-forward does not apply here; a
   consent you never took is not repaired by taking it from the next person.
6. ~~**Verify `delete_current_user` exists**~~ — ✅ **VERIFIED 2026-08-12 by Jake.** Returns one row:
   `proname: delete_current_user`, `args: ""` (none), `security_definer: true`.

   The zero-argument part is the security-relevant detail, not just the existence. A `SECURITY DEFINER`
   function executes with the DEFINER's privileges, so one that accepted a user id could be coerced into
   deleting someone else's account. Taking no arguments means it can only resolve the caller from
   `auth.uid()` internally — safe by construction rather than by discipline. The Delete-my-account
   button will work for the first person who taps it.

## What closes this

All six done, plus the invite flow walked end to end on live: a new invite cannot activate without
ticking, and `consented_at` + version land on the profile row. Steps 1 and 5 need Jake and cannot be
closed by a test.
