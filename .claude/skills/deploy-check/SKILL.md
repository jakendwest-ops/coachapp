---
name: deploy-check
description: Pre-deploy checklist. Run before any beta invite or significant public push. Catches the classes of issues that have caused production breakage on this project before.
---

# Pre-deploy checklist

Work through every item below in order. Report each as ✅ PASS, ❌ FAIL, or ⚠️ NEEDS ATTENTION.
Do not skip items — these categories were chosen because they have caused real breakage before.

---

## 1. Cache bust

Check `C:\Users\jaken\OneDrive\coachapp\index.html` — find **every** `<script src="js/*.js?v=N">` line. There are **9 modules** (app-core, app-dashboard, app-programs, app-clients, app-calendar-goals, app-workouts, app-runner, app-progress, **starter-content**). Do NOT glob `app-*.js` — `starter-content.js` doesn't match it. There is no single `app.js`; each module has its own independent `?v=N`.
Cross-reference each module changed in this deploy against its own version tag.

- ✅ PASS if every module changed since the last deploy had its own `?v=N` bumped in the same commit
- ❌ FAIL if any changed module's version still matches a commit before its latest change

**Why this matters:** GitHub Pages CDN caches aggressively. Users will run stale JS silently.

---

## 2. Code review

Run the multi-agent review skill at `C:\Users\jaken\OneDrive\coachapp\.claude\skills\multi-agent-review\SKILL.md` (3 review angles + verifier pass). This full read catches logic errors, race conditions, missing error handling, and semantic issues the session-start grep scan misses. (`/code-review ultra` does exist in the VSCode extension but is user-triggered and billed — you cannot launch it. Offer it; don't depend on it.)

- ✅ PASS if no issues flagged, or only minor suggestions
- ⚠️ NEEDS ATTENTION if suggestions worth addressing before users see the code
- ❌ FAIL if any high-severity issue — fix before deploying

Do not skip because "the grep scan was clean" — they check different things.

---

## 3. Playwright suite

Run `/playwright` (or `npm test` in `C:\Users\jaken\OneDrive\coachapp`).

- ✅ PASS if the whole suite passes with no console error annotations — read the actual total from the run output, do not assume a fixed count (the suite grows; it was 56 as of 2026-07-03)
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

## 5. RLS — run the behavioural audit (NOT a pg_policies grep)

```
cd C:\Users\jaken\OneDrive\coachapp && npx playwright test rls-audit.spec.js
```

- ✅ PASS if all probes green **including the SELF-TEST** (see below)
- ❌ FAIL on any leak — do not deploy

**Why this replaced the old check.** This step used to be a single query: `SELECT ... FROM pg_policies WHERE qual = 'true'` — i.e. "find fully-open policies." It was **security theatre**. Four real RLS gaps have now been found in this project, and that query would have caught **none of them**:

| Session | Real gap | `qual = 'true'`? |
|---|---|---|
| 23 | `client_programs` + 3 embedded tables had *no* client-read policy | No — policy absent, not open |
| 24 | `workout_template_exercises` had *zero* client-read policy | No |
| 25 | **Any client could read any other client's workouts** | No — policy looked normal, just checked `coach_id` and forgot `client_id` |
| 25 | Scalar `=` subquery that errors for users with >1 client row | No |

Every real leak had a **normal-looking policy that simply checked the wrong column**. A grep for open policies cannot see that. Neither can reading `pg_policies` at all — session 23 proved a policy can read correctly and *still* break the app, because PostgREST silently returns `null` for an unreadable embed level rather than erroring.

So the audit is **behavioural**: it logs in as each tenant and actually attempts the operations.

**What `rls-audit.spec.js` does** (built 2026-07-12):
- **Probe A — cross-coach.** A second coach (PT2 — `loginAsPT2` in `tests/helpers.js`) who owns *nothing* selects `*` from every table with no filter. Any row returned belongs to another tenant, by definition. No expected-value matrix, no judgement. *This boundary — strangers sharing one database — had never been tested before; there was no second coach account.*
- **Probe B — cross-client.** A real client selects `*` unfiltered from every client-owned table; every row must carry their own `client_id`. Runs against **real data**, so a leak here is a leak of a real person's training records. Asserts a **positive lower bound** (`CLIENT_MUST_SEE`) — an RLS deny returns zero rows and *no error*, so without it "0 rows, all own" is indistinguishable from "the client-read policy was dropped."
- **Probe C — unexpected DENY** (added 2026-07-12). The other half of RLS, and the half that has actually bitten this project hardest: s23 and s24 were *denies*, not leaks. A client who cannot read their own assigned programme sees an empty page, not an error. Probes A and B are structurally blind to this — to them, "no rows" is a pass. Probe C plants a row as the correct writer and reads it back as the client, asserting **every level of the nested embed resolves** (`client_programs → programs → program_phases`), because PostgREST silently NULLs an unreadable level. It owns and destroys its own fixtures.
- **SELF-TEST — proves the detector fires.** A green audit from a detector that has never gone red is worthless. This runs the identical query and classifier as the *coach* (who legitimately sees several clients) and **requires it to flag foreign rows**. If the self-test ever goes green, the audit above is lying and must not be trusted.

**Adding a table?** Add it to `ALL_TABLES` in the spec. A table absent from that list is a table nobody is auditing.

---

## 5b. Storage — run the behavioural probe (NOT a `buckets.public` read)

```
cd C:\Users\jaken\OneDrive\coachapp && npx playwright test storage-privacy.spec.js
```

- ✅ PASS if both tests green
- ❌ FAIL on any download by a stranger — do not deploy

**Why this replaced `select id, public from storage.buckets`.** That query checks one flag: is the bucket marked public. On 2026-07-12 the behavioural probe found a live cross-tenant leak the flag check would have passed clean: `progress-photos` was `public = false` (so an anonymous stranger got HTTP 400), **but** three `storage.objects` policies (`"Public read"`, `"Authenticated delete"`, `"Authenticated upload"`) were scoped by `bucket_id` alone with no path check — so *any authenticated coach* could download AND delete *any* client's progress photos. Reproduced live: a second coach who owns nothing pulled a real 1.79 MB client photo and deleted another. `public = false` is a property of the bucket; the breach was in the object policies, which that query never reads. Same lesson as §5: config reads pass real leaks; only attempting the operation as the wrong tenant catches them.

`storage-privacy.spec.js` (a) uploads as a client and fetches the "public" URL with no credentials — must be refused; (b) plants a photo in the client's own folder, then tries to download it **as an unrelated coach (`loginAsPT2`)** — must be refused. It owns and destroys its own fixtures. The `public.*` RLS audit (§5) does not cover Storage — this is a separate policy surface.

---

## 5c. GDPR features — present and wired

- ✅ PASS if the consent checkbox exists on `#invite-form` in index.html (`#invite-consent`), WITH a JS
  guard that still refuses when the `required` attribute is stripped
  - **Not a “signup form”** — public self-signup was removed entirely on 2026-07-24 (`57a188a`): the form,
    its handlers, and the show-signup/show-login toggle. This line said “signup form” until 2026-08-25 and
    passed only because the reader checked the right surface anyway. On a checklist whose job is catching
    stale assumptions, that is the wrong failure mode.
- ✅ PASS if `PRIVACY_POLICY_VERSION` (app-core.js) equals the “Last updated” date in privacy-policy.html
  - Now enforced by `checks.sh` rule 9e, so a push cannot land them out of sync. Confirm the rule is still
    wired rather than re-checking by eye: `node scripts/check-policy-version.selftest.mjs`.
  - Why it matters: `_needsConsent()` re-prompts ONLY on a version mismatch, so a policy edit without a
    bump leaves every user consented to a text they never saw — silently, with no error.
- ✅ PASS if Settings page has "Data & privacy" card with Download + Delete buttons
- ✅ PASS if `delete_current_user()` RPC exists in DB
- ⚠️ NEEDS ATTENTION if privacy policy still links to `#` — must be a real URL before first beta user signs up
- ❌ FAIL if any of the above missing

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
| RLS behavioural audit (incl. self-test) | |
| Storage buckets private | |
| GDPR features present | |
| Live smoke test | |
| GitHub Pages deploy | |

**Overall:**
- All ✅ → **Safe to deploy / invite beta users**
- Any ⚠️ → **Review before inviting — document the risk**
- Any ❌ → **Do not proceed — fix first**

## Last step — record that this ran

`gates-fired` (the check that used to prove this gate fires by grepping the Vault's `LOG.md`) was
retired 2026-09-15 when `LOG.md` was frozen, with no replacement built — this project now has zero
mechanical evidence deploy-check still runs. Start closing that gap the same way `full-file-review`
already proves it: stamp a marker on every real run.

```bash
node -e "require('fs').writeFileSync('C:/Users/jaken/.claude/state/last-deploy-check-run', new Date().toISOString())"
```

This is deliberately just the marker, not a new staleness gate — this check fires "before any beta
invite or significant public push," which is event-triggered, not periodic, so a naive "N days since
last run" RED would misfire on every quiet stretch with nothing to deploy (the exact false-alarm shape
this project's own `checkGatesFired` post-mortem warned about). Giving it teeth needs the same
measure-first step every other gate here got before being trusted — not done in this pass.
