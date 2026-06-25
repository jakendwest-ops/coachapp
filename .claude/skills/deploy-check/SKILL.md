---
name: deploy-check
description: Pre-deploy checklist. Run before any beta invite or significant public push. Catches the classes of issues that have caused production breakage on this project before.
---

# Pre-deploy checklist

Work through every item below in order. Report each as ✅ PASS, ❌ FAIL, or ⚠️ NEEDS ATTENTION.
Do not skip items — these categories were chosen because they have caused real breakage before.

---

## 1. Cache bust

Check `C:\Users\jaken\coachapp\index.html` — find the `<script src="js/app.js?v=N">` line.
Cross-reference with the last commit that changed `app.js`.

- ✅ PASS if the version number was bumped in the same commit as the most recent app.js change
- ❌ FAIL if the version number still matches a commit before the latest app.js change

**Why this matters:** GitHub Pages CDN caches aggressively. Users will run stale JS silently.

---

## 2. Code review

Run `/code-review ultra` on the current branch. Full multi-agent read — catches logic errors, race conditions, missing error handling, and semantic issues that the session-start grep scan misses.

- ✅ PASS if no issues flagged, or only minor suggestions
- ⚠️ NEEDS ATTENTION if suggestions worth addressing before users see the code
- ❌ FAIL if any high-severity issue — fix before deploying

Do not skip because "the grep scan was clean" — they check different things.

---

## 3. Playwright suite

Run `/playwright` (or `npm test` in `C:\Users\jaken\coachapp`).

- ✅ PASS if 14/14 pass with no console error annotations
- ⚠️ NEEDS ATTENTION if flaky tests (passed on retry) — note which ones
- ❌ FAIL if any hard failures or console errors pointing to a real bug

---

## 4. Supabase redirect URLs

Check that the live URL is listed in Supabase Auth → URL Configuration → Redirect URLs.
Live URL: `https://jakendwest-ops.github.io/coachapp`

Go to: Supabase dashboard → project `avilxuiacmtgeoxxhfhc` → Authentication → URL Configuration

- ✅ PASS if `https://jakendwest-ops.github.io/coachapp` is present
- ❌ FAIL if missing — auth callbacks will 404 and users cannot log in

**Why this matters:** This exact issue caused a full auth outage before. Must check every deploy.

---

## 5. RLS — no open policies

Verify no debug-era open policies remain.

Run in Supabase SQL editor:
```sql
SELECT tablename, policyname, qual
FROM pg_policies
WHERE qual = 'true'
ORDER BY tablename;
```

- ✅ PASS if no open-access policies on sensitive tables (clients, profiles, workout_logs, weight_logs)
- ❌ FAIL if any — note which tables

---

## 6. Live smoke test — client login

Open `https://jakendwest-ops.github.io/coachapp` in a private/incognito window.
Log in as a real client (not the E2E test account). Verify:
- Dashboard loads with sessions stat
- Workouts page loads with Start buttons
- Can navigate to session history

- ✅ PASS if all three work
- ❌ FAIL if any break — check Supabase dashboard → Logs → API for PGRST errors

---

## 7. GitHub Pages deploy status

```
gh run list --limit 3
```

- ✅ PASS if most recent `pages-build-deployment` run shows `success`
- ⚠️ NEEDS ATTENTION if race-condition failure (two deploys collided — check if the newer one succeeded)
- ❌ FAIL if the latest commit's deployment genuinely failed

---

## Verdict

| Check | Status |
|-------|--------|
| Cache bust | |
| Code review | |
| Playwright | |
| Redirect URLs | |
| RLS policies | |
| Live smoke test | |
| GitHub Pages deploy | |

**Overall:**
- All ✅ → **Safe to deploy / invite beta users**
- Any ⚠️ → **Review before inviting — document the risk**
- Any ❌ → **Do not proceed — fix first**
