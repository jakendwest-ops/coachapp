---
name: hello-claude
description: Run this skill automatically whenever the user says "hello claude" at the start of a session. Session start ritual — boot server, read Vault, summarise last session, propose plan.
---

# Session start ritual

Run every step below in order. Do not skip any. Do not write code or take any other action until this ritual is complete.

## Step 1 — Start the preview server

Call `preview_start("CoachApp")`. If it fails or the launch config is missing, note it and continue — don't block on it.

## Step 2 — Read the Vault

Read all four files in this order:
1. `C:\Users\jaken\Claude\Vault\projects\PTHub\STATUS.md` — live project state
2. `C:\Users\jaken\Claude\Vault\projects\PTHub\LOG.md` — last few entries (most recent first)
3. `C:\Users\jaken\Claude\Vault\projects\CoachApp\roadmap.md` — full feature roadmap (status tags)
4. `C:\Users\jaken\Claude\Vault\projects\CoachApp\blueprint.md` — product blueprint

Also read if needed:
- `C:\Users\jaken\Claude\Vault\memory\lessons.jsonl` — to avoid repeating past mistakes
- `C:\Users\jaken\Claude\Vault\owner\voice.md` — to stay in sync with Jake's patterns

## Step 3 — Summarise last session

Write a short summary (3–5 bullets) of what was done last session, based on the LOG. Include:
- What was built or fixed
- Any known bugs or blockers left open
- What version app.js is at and whether a Netlify deploy is pending

## Step 4 — Roadmap snapshot

Show a condensed roadmap view: list everything currently `🔧 In progress`, then the top 3 `🗓 Planned` items by priority. This is the "where are we / where next" view Jake sees every session.

## Step 5 — Propose this session's plan

Based on the roadmap and STATUS.md, propose 2–3 things to tackle this session. State them as a numbered list. Ask Jake which he wants to start with — or offer a recommendation if the priority is obvious.

## Step 6 — Surface open to-dos

Check the roadmap "Pending actions for Jake" section and STATUS.md for any manual steps Jake needs to take (running SQL, deploying, testing). List them clearly.

---

## If work goes in circles or a fix fails twice

STOP immediately. Run this audit before writing any more code:
1. Review all code touched in this session
2. Web-search the official docs (Supabase, Netlify, MDN) for the correct approach
3. Check for duplicate or conflicting code
4. Propose one clean solution and get Jake's agreement before building

This protocol is mandatory — not optional. The cost of 5 minutes of research is lower than another broken session.
