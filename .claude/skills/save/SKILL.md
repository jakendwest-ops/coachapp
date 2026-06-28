---
name: save
description: End-of-session ritual. Run when the user says /save or signals they are wrapping up. Updates STATUS.md, writes a LOG entry, surfaces open to-dos, and checks memory is current.
---

# End-of-session save

Run every step below in order. Do not skip any.

**Note:** The built-in `/save` command handles predictions, voice deltas, and the ledger line. The steps below are CoachApp-specific additions that run alongside it. If invoked as a standalone skill (not via the built-in command), also run: prediction scan, owner voice sweep, and `Add-Content` ledger append.

---

## Step 1 — Establish what was done this session

Review the conversation and build a list of:
- Features built or changed (with version numbers)
- Bugs found and fixed
- Tests added or updated
- Skills or memory entries created or updated
- Anything pushed to GitHub

---

## Step 2 — Cache bust check

Read `C:\Users\jaken\coachapp\index.html` and find the `<script src="js/app.js?v=N">` line.
Cross-reference with this session's commits.

- If `app.js` changed this session: confirm `?v=N` was incremented in the same commit
- If it wasn't: flag this to Jake before closing — it must be fixed and pushed

See [[feedback-cache-bust]].

---

## Step 3 — Update STATUS.md

File: `C:\Users\jaken\Claude\Vault\projects\CoachApp\STATUS.md`

**Before adding anything, sweep the existing "Open to-dos for Jake" section:**
For each existing item, check whether it's been resolved by this session's work or current evidence:
- CI/PAT items → run `gh run list --limit 3`. If Check & Deploy is passing consistently, the item is done — remove it.
- "Verify X live" items → check if Playwright covers the flow and is green. If yes, the item is done — remove it.
- SQL migration items → check if STATUS.md schema already reflects the change. If yes, done — remove it.
- Any item where you have current evidence it's resolved → remove it and note in the LOG that it was cleared.

Then make surgical edits — do NOT rewrite sections that weren't touched:
- **Cache-busting** line — update `?v=N` to the current version
- **What's been built** — mark any newly completed items as done
- **Roadmap / what needs building** — mark completed items; cross-check against LOG for anything done but not yet ticked
- **Open to-dos** — add only genuinely new items; never carry forward resolved ones

---

## Step 4 — Write a LOG entry

File: `C:\Users\jaken\Claude\Vault\projects\CoachApp\LOG.md`

Prepend a new entry at the top (above all existing entries):

```
## YYYY-MM-DD — [one-line summary of session] (vXX–vYY)

**Done:**
- [bullet per shipped item — specific, include version numbers]

**Bugs found + fixed:**
- [what it was, root cause, fix]

**UNVERIFIED (banked):**
- [anything pushed but not confirmed working in browser]

**Decided:**
- [architectural or process decisions made]

**Why:**
- [rationale if not obvious]
```

Omit empty sections. For each UNVERIFIED item added, also add a corresponding entry to the "Open to-dos for Jake" section of STATUS.md.

---

## Step 5 — Update memory and skills

For each of the following, check if a new entry is needed or an existing one needs updating:

**Memory** (`C:\Users\jaken\.claude\projects\C--Users-jaken-Claude\memory\`):
- Did a new bug pattern emerge this session? → update or create a `feedback_*.md`
- Did Jake correct an approach or confirm an unusual one? → add to the relevant feedback memory
- Did we learn something about project state (deadlines, decisions, constraints)? → update `project_coachapp.md`
- Did a to-do get cleared this session? → note it so future sessions don't re-add it

**Skills** (`C:\Users\jaken\coachapp\.claude\skills\`):
- Was a new skill created this session? → confirm registered in `hello-claude/SKILL.md` (standing behaviours) and has a MEMORY.md entry
- Was an existing skill found to be wrong or incomplete? → update it now

Update `MEMORY.md` index if any files were added or changed.

---

## Step 6 — Surface open to-dos for Jake

List only what is **genuinely still open** after the sweep in Step 3. For each item, state briefly why it's still open (what evidence would close it).

Format as a short numbered list Jake can copy to his notes.

If the list is empty — say so. An empty to-do list is a good outcome, not a gap.

---

## Step 7 — Playwright status

State whether the Playwright suite was run this session:
- If yes: result (X/26, console errors, verdict)
- If no: flag that tests haven't been run — recommend running before the next deploy

---

## Step 8 — Commit and push the Vault

After all files are written, commit and push to `jakendwest-ops/vault`:

```
cd "C:\Users\jaken\Claude\Vault"
git add projects/ memory/ owner/ ledgers/ north-star.md profile.md
git commit -m "Save vault state — CoachApp session YYYY-MM-DD (vNNN)"
git push
```

If push fails (no remote, auth issue), flag it to Jake — do not skip silently.

---

## Step 9 — Session summary for Jake

Give a two-part summary of everything built or changed this session:

1. **Technical** — what functions/files changed, what queries or schema changed, what the fix was at a code level. One sentence per item.
2. **Plain English** — what the user actually experiences differently now. No jargon. One sentence per item.

Both parts are mandatory. Never skip the plain-English version.

---

## Step 10 — Confirm to Jake

Tell Jake:
- STATUS.md ✓ / LOG.md ✓
- Current app version (v=N)
- Cache bust: OK / NEEDS FIX
- To-dos cleared this session: [list]
- Open to-dos remaining: [list or "none"]
- Playwright status
- Whether /deploy-check should be run before the next push
