---
name: security-audit
description: Security, PII, and GDPR audit for CoachApp. Run at session start when touching auth/storage/health data features, and always before beta invites.
---

# CoachApp Security Audit

Work through every check. Report each as ✅ PASS, ❌ FAIL, or ⚠️ NEEDS ATTENTION.

---

## 1. Storage buckets — all private

Run in Supabase SQL Editor:
```sql
select id, public from storage.buckets order by id;
```

- ✅ PASS if `public = false` for every bucket
- ❌ FAIL if any bucket shows `public = true` — make private immediately, add RLS, switch display code to signed URLs

**Expected buckets:** `logos` (private), `progress-photos` (private)

---

## 2. No open RLS policies

```sql
select tablename, policyname, qual
from pg_policies
where qual = 'true'
order by tablename;
```

- ✅ PASS if no results on sensitive tables (clients, profiles, workout_logs, weight_logs, performance_logs, goals, events, coach_branding)
- ❌ FAIL if any — these expose all rows to all authenticated users

---

## 3. PII in console logs

Run the pre-push check manually:
```sh
cd C:\Users\jaken\coachapp && bash scripts/checks.sh
```

Check 9a specifically covers PII. But also do a manual scan of any functions added this session that touch:
- `auth.signUp` / `auth.signIn`
- `clients` table reads/writes
- `weight_logs`, `performance_logs`, `workout_logs`

- ✅ PASS if check 9a passes and no new log calls contain names/emails/health values
- ❌ FAIL if any — log IDs and dates only

---

## 4. GDPR features present

Check Settings page renders:
- Consent checkbox on signup form (index.html)
- "Data & privacy" card in Settings with Download + Delete buttons
- `delete_current_user()` RPC exists in DB

```sql
select proname from pg_proc where proname = 'delete_current_user';
```

- ✅ PASS if all present
- ⚠️ NEEDS ATTENTION if privacy policy still links to `#` — flag for Jake, needed before beta

---

## 5. New tables since last audit — RLS check

```sql
select tablename
from pg_tables
where schemaname = 'public'
and tablename not in (
  select distinct tablename from pg_policies
);
```

- ✅ PASS if no results (every table has at least one policy)
- ❌ FAIL if any table has no policies — enable RLS and add coach/client scoped policies immediately

---

## 6. `delete_current_user()` covers all tables

If any new tables were added since 2026-06-28 that hold user data, check whether they need to be added to the `delete_current_user()` RPC's explicit delete list.

Tables currently covered:
- `coach_branding`, `workout_templates`, `programs` (coach-owned)
- `weight_logs`, `workout_logs`, `performance_logs`, `goals`, `events`, `client_check_ins`, `client_1rms`, `client_programs`, `clients` (client-owned)
- `profiles` (both)

- ✅ PASS if no new tables with user data
- ⚠️ NEEDS ATTENTION if new tables added — update the function and the table list above

---

## 7. Signed URLs — no getPublicUrl calls

```sh
grep -n "getPublicUrl" C:\Users\jaken\coachapp\js\app.js
```

- ✅ PASS if no results
- ❌ FAIL if any — replace with `createSignedUrl(path, expiresIn)` or `createSignedUrls(paths, expiresIn)`

---

## Verdict

| Check | Status |
|---|---|
| Storage buckets private | |
| No open RLS policies | |
| PII in logs | |
| GDPR features present | |
| New tables have RLS | |
| delete_current_user covers all tables | |
| No getPublicUrl calls | |

- All ✅ → **Security posture healthy**
- Any ⚠️ → **Document and schedule fix**
- Any ❌ → **Fix before any user-facing work continues**
