---
name: hello-claude
description: Run this skill automatically whenever the user says "hello claude" at the start of a session. Session start ritual — boot server, read Vault, summarise last session, propose plan.
---

# Session start ritual

Run every step below in order. Do not skip any. Do not write code or take any other action until this ritual is complete.

---

## Step 1 — Start the preview server

Call `preview_start("CoachApp")`. If it fails or the launch config is missing, note it and continue — don't block on it.

After it starts, resize the preview to **480×844** immediately. Never leave it at the default 390px width — that causes black bars. See [[feedback-preview-width]].

**Daily question cron:** Check whether the daily question cron (job ID `4f871c94`, fires 9:07am) is still active using `CronList`. If it's missing (session restarted), recreate it silently using the prompt from `C:\Users\jaken\.claude\daily-questions\questions.md` and log.md. Do not mention this to Jake unless it failed to recreate.

---

## Step 2 — Read the Vault

Read all of these — none are optional:
1. `C:\Users\jaken\Claude\Vault\projects\CoachApp\STATUS.md` — live project state + open to-dos
2. `C:\Users\jaken\Claude\Vault\projects\CoachApp\LOG.md` — last 2–3 entries (most recent first)
3. `C:\Users\jaken\Claude\Vault\projects\CoachApp\CRITICAL.md` — infrastructure facts, security constraints, GDPR status
4. `C:\Users\jaken\Claude\Vault\projects\CoachApp\roadmap.md` — full feature roadmap (status tags)
5. `C:\Users\jaken\Claude\Vault\memory\lessons.jsonl` — past mistakes not to repeat
6. `C:\Users\jaken\Claude\Vault\owner\voice.md` — how Jake communicates and what he values

Also load from auto-memory (already in context via MEMORY.md) — patterns file is especially important for code work:
- `project_coachapp_patterns.md` — modal pattern, program_id constraint, timed sets format, dbq(), master account, nav context, save functions

---

## Step 3 — Summarise last session

Write a short summary (3–5 bullets) of what was done last session, based on the LOG. Include:
- What was built or fixed
- Any known bugs or blockers left open
- What version app.js is at and whether CI has deployed it successfully (check `gh run list --limit 1`)

---

## Step 4 — Automated code review

Run a targeted bug scan on `C:\Users\jaken\coachapp\js\app.js`. Check for these patterns — categories that have repeatedly caused bugs in this codebase:

**a) Wrong column names**
- `weight_logs` queried with `logged_at` — use `date`
- `workout_logs` queried with `logged_at` — use `date`
- Any reference to `coach_notes` on `workout_logs` — column is `notes`

**b) Unscoped multi-tenant queries** — missing `coach_id` filter:
- `from('clients').select(...)` without `.eq('coach_id', ...)`
- `from('workout_templates').select(...)` without `.eq('coach_id', ...)`
- `from('programs').select(...)` without `.eq('coach_id', ...)`
- `from('workout_logs').select(...)` without `.eq('coach_id', ...)` or `.eq('client_id', ...)`

**c) Client-side coach_id errors** — when the client is logged in, queries for coach-owned tables (e.g. `workout_templates`) must use the coach's ID from `clients.coach_id`, not `currentUser.id`

**d) Role routing** — any place `currentProfile?.role` decides what to render; check null/missing role is handled (doesn't silently default to PT view)

**e) Duplicate function definitions** — two functions with the same name (second silently wins)

**f) Hardcoded UUIDs or email addresses** in logic code

Use Grep to search for each pattern. Report only real findings with line numbers. Keep it to one paragraph or a bullet list. If nothing found, say "Code review: clean."

---

## Step 5 — Roadmap cross-check

Compare the roadmap against the LOG. For any item the roadmap still marks as `🗓 Planned` or `🔧 In progress` — check whether recent LOG entries show it was actually completed. If yes, flag it so the roadmap can be updated.

Then show the condensed view: everything `🔧 In progress`, then the top 3 `🗓 Planned` by priority.

---

## Step 6 — Propose this session's plan

Based on the roadmap and STATUS.md, propose 2–3 things to tackle. State as a numbered list. Ask Jake which to start — or recommend if the priority is obvious.

---

## Step 7 — Verify and surface open to-dos

Read the "Open to-dos for Jake" section of STATUS.md. For **each item**, verify it against current evidence before surfacing it:

- **PAT / GitHub Actions items** → run `gh run list --limit 3` and check if CI is passing. If yes, the item is resolved — remove it, don't repeat it.
- **"Verify X live" items** → check whether the Playwright suite covers that flow. If yes and tests are green, the item is resolved.
- **Supabase config items** → if there's a quick way to verify (e.g. checking a URL or running a query), do it.
- **SQL migration items** → check whether the schema in STATUS.md already reflects the change. If yes, the item is resolved.

Only surface items that are still genuinely open. Explicitly state which items were cleared and why. Never carry forward a to-do that current evidence resolves.

---

## Step 8 — Predictions review

Read `C:\Users\jaken\Claude\Vault\memory\predictions.jsonl`. Find any entries where `verify_by` is today or earlier and `outcome` is null. For each one, check whether the session's work or current state allows grading it. Surface any that need a verdict — ask Jake to confirm if the outcome is ambiguous.

## Step 9 — OS self-check (first session of a new day only)

Verify the OS isn't silently broken. Check these paths exist on disk — if any are missing, stop and flag before doing any other work:

```
C:\Users\jaken\Claude\Vault\projects\CoachApp\STATUS.md   ← if missing, /save is writing nowhere
C:\Users\jaken\Claude\Vault\projects\CoachApp\LOG.md      ← if missing, session history is lost
C:\Users\jaken\coachapp\.claude\skills\save\SKILL.md      ← if missing, /save skill is broken
C:\Users\jaken\coachapp\.claude\skills\deploy-check\SKILL.md
```

Also read Step 3 and Step 4 of the save skill and confirm they point to `CoachApp\STATUS.md` and `CoachApp\LOG.md`. If they don't match, fix them before proceeding.

If all clear, say "OS check: clean" in one line and continue. Do not narrate this step if nothing is wrong.

---

## Standing session behaviours (active all session, not just at start)

### After every end-to-end test → post-build-review
Run the post-build-review skill at `C:\Users\jaken\.claude\skills\post-build-review\SKILL.md` immediately after any test flow. Cover: what worked, what didn't, root causes, production impact, priority order. Do not wait to be asked. See [[feedback-post-build-review]].

### After any UI change → mobile-check
Run the mobile-check skill at `C:\Users\jaken\coachapp\.claude\skills\mobile-check\SKILL.md` before reporting any UI change as done. Verify at 480×844. Check sidebar vs bottom-nav, tap targets, modal classes. See [[feedback-mobile-check]].

### Before building any new UI → UI consistency check
Grep the codebase for the equivalent existing render function before writing any new list, card, form, or detail view. Match classes exactly: `list`/`list-row`, `client-grid`/`client-card`, `modal-overlay`/`modal-box`, `empty-state`. Never assume — read first. See [[feedback-ui-consistency]].

### Before any SQL → sql-safety
Run the sql-safety skill at `C:\Users\jaken\coachapp\.claude\skills\sql-safety\SKILL.md` before writing any DELETE, UPDATE, or schema-altering SQL. See [[feedback-sql-destructive]].

### Before any new feature proposal → sounding board
Do not immediately build. Ask 2–3 targeted questions first: What problem does this solve? Where does it fit in the existing flow? Is there a simpler version? Does it conflict with anything that exists? Challenge gently but directly — Jake wants a partner who pushes back. This does NOT apply to bug fixes, small tweaks, or clearly-scoped tasks. See [[feedback-sounding-board]].

### Before writing any code or SQL → get explicit approval
After discussing scope, present one consolidated summary of everything about to be built (all files, all changes, all SQL) and wait for Jake to say "approved" or equivalent. Never start building mid-discussion. Silence or "looks good" is not approval. See [[feedback-approve-before-build]].

### Before any new Storage bucket → security gate
Before creating any bucket: confirm it will be private (`public = false`). Draft the RLS policies on `storage.objects` before the bucket is used. Switch all display code to `createSignedUrl`/`createSignedUrls` — never `getPublicUrl`. Client health data (progress photos, body metrics) is special-category under UK GDPR. See [[feedback-security-gdpr]].

### Before any new DB table → security gate
Before inserting data into any new table: (1) enable RLS, (2) write coach-scoped and client-scoped policies, (3) add the table to `downloadMyData()` if it holds user data, (4) add the table to `delete_current_user()` RPC if it needs cascade deletion. Never `qual = 'true'` on any table that holds user data. See [[feedback-security-gdpr]].

### When touching auth, clients, or health data tables → PII check
After writing any function that reads/writes clients, weight_logs, performance_logs, workout_logs, goals, or auth flows: scan every log call in that function. IDs and dates only — never names, emails, weights, health values. The pre-push hook catches patterns but cannot catch everything. See [[feedback-security-gdpr]].

### When the session involves security/GDPR work → /security-audit
Run `C:\Users\jaken\coachapp\.claude\skills\security-audit\SKILL.md`. Covers: private buckets, open RLS policies, PII in logs, GDPR features, new tables, signed URLs. Also runs as part of /deploy-check. See [[feedback-security-gdpr]].

### Before every git commit → cache bust check
If `app.js` changed in this commit, verify that `?v=N` on the script tag in `index.html` has been incremented in the same commit. Never commit app.js changes without bumping the version. See [[feedback-cache-bust]].

### Never use custom input controls
Use native `<input>` elements for all numeric and text entry. No custom keypads, number dials, or picker wheels on web. Use `inputmode="decimal"` for decimal fields. See [[feedback-native-inputs]].

### Verify before reporting done
Never say "done" or "fixed" without checking the result in the browser or the test output. If a live check isn't possible, say "UNVERIFIED — reason" explicitly. See [[feedback-verify]].

### After any UI or behaviour change → regression sweep
Before reporting any change done, ask: "what did the old code hide or suppress that the new code now exposes?" Run through:
1. Did the old code cover any UI states (loading, disabled, mid-flow) that are now visible?
2. Does removing/replacing an overlay leave underlying page state exposed that wasn't designed to be seen?
3. Does the new element collide with or confuse something already on screen?
This catches regressions that pass code review but break UX. See [[feedback-regression-check]].

### After every test session → check Supabase API logs
After any test flow, check Supabase dashboard → Logs → API for PGRST errors. These are invisible in the JS console but show up there. See [[reference-supabase-logs]].

### RLS patterns — never query auth.users directly
All RLS policies must use `auth.uid()` or `auth.email()`. Never query `auth.users` directly in policies. Coaches own data by `coach_id = auth.uid()`. Clients access via `user_id = auth.uid()`. See [[feedback-rls-patterns]].

### Always repost code in full when correcting
When retrying or fixing a code block, always post the full corrected block. Never ask Jake to scroll up to find the previous version and patch it. See [[feedback-repost-code]].

### Explain as you build
After every significant decision — a DB query pattern, an RLS change, an architectural choice — give a plain-English explanation without waiting to be asked. Two sentences: one technical, one simple analogy. See the `educate` skill at `C:\Users\jaken\.claude\skills\educate\SKILL.md` and [[feedback-educate]].

### When creating a new skill → register it
After writing any new skill file: (1) add a standing behaviour entry here in hello-claude, (2) add an entry in /save step 5, (3) write a memory file and add it to MEMORY.md. Never leave a skill as an orphan. See [[feedback-skill-creator]].

### At session end → /save
When Jake signals wrap-up ("that's it for today", "let's stop here", "/save"), run the save skill at `C:\Users\jaken\coachapp\.claude\skills\save\SKILL.md`. Updates STATUS.md, LOG.md, surfaces open to-dos, checks memory. Do not wait to be asked.

### Before every commit → blast radius sweep
Before staging any commit, run this logical sweep — not a grep check, but active reasoning:
1. **What tables/functions did I touch?** Grep for every other caller of each changed function. If another function calls it, does my change break it?
2. **Is there a client-view equivalent?** If I changed a PT render function, grep for the equivalent client render function and check it has the same fix.
3. **What happens if the data is empty, null, or an unexpected shape?** Walk the unhappy paths explicitly.
4. **Does this change touch any existing Playwright test path?** If yes, run `npm test` before pushing — not after.
5. **What did the old code hide that the new code now exposes?** (Regression sweep — removed overlays, changed navigation, replaced queries.)
If any item surfaces a risk, fix it before committing. Never defer a known risk to "check on live."

### Before any git push → offer /code-review
Before pushing to master, check whether `/code-review ultra` has been run this session. If not, offer it — one line: "Want to run `/code-review` before pushing?" Do not push without giving Jake the chance to run it. This is distinct from the session-start grep scan — `/code-review ultra` does a full multi-agent semantic read. See [[feedback-code-review]].

### Before any beta invite or significant deploy → /deploy-check
Run `C:\Users\jaken\coachapp\.claude\skills\deploy-check\SKILL.md`. Nine checks: cache bust, /code-review, Playwright suite, Supabase redirect URLs, RLS policies, storage buckets private, GDPR features present, live smoke test, GitHub Pages deploy. Do not declare "ready" without completing it. See [[feedback-deploy-check]].

### To run Playwright tests → /playwright
Run `C:\Users\jaken\coachapp\.claude\skills\playwright\SKILL.md`. Reports per-test pass/fail, surfaces console error annotations, gives Green/Amber/Red verdict. See [[feedback-playwright-skill]], [[project-playwright]].

### When the daily question cron fires mid-session
Ask the question naturally in the flow of conversation. After Jake answers, save his answer to `C:\Users\jaken\.claude\daily-questions\log.md` (prepend a new entry). If the answer reveals something about Jake's preferences, personality, or working style, bank a memory note in the relevant `user_jake.md` or a new `user_*.md` file. Then continue the session — don't make it a big moment.

---

## If work goes in circles or a fix fails twice

STOP immediately. Run this audit before writing any more code:
1. Review all code touched in this session
2. Web-search the official docs (Supabase, Supabase JS v2, MDN) for the correct approach
3. Check for duplicate or conflicting code
4. Propose one clean solution and get Jake's agreement before building

This protocol is mandatory — not optional. The cost of 5 minutes of research is lower than another broken session.

---

## Who Jake is — how to work with him

Jake is a personal trainer building CoachApp as both developer and primary user. He has no software engineering background but learns fast and wants to understand the why behind every decision.

- Messages are short, lowercase, direct. Don't pad responses.
- Silence + continuing = positive feedback. He doesn't say "great job."
- "both" / "all" / "please add" = execute everything, no follow-up needed.
- "make a note" = write it to the Vault.
- "are you able to..." = genuine feasibility check, not rhetorical — answer directly.
- After every significant change: give BOTH a technical explanation AND a plain-English version, inline as you build.
- Ships small, sees it, moves on. He doesn't like long planning phases.
- Turns failures into permanent systems — when something breaks badly, a skill or memory entry comes out of it.
- Proactively audits his own tooling for gaps — don't wait for him to discover a missing check; surface it at session start.
- Wants the relationship to accumulate depth over time, not just complete tasks.
- **All-caps restatement** ("PLEASE FIX THIS", "DO NOT DO THAT") = patience exhausted — next attempt must work, no more probing or partial fixes.

See [[user-jake]] for full profile.
