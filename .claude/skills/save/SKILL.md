---
name: save
description: End-of-session ritual. Run when the user says /save or signals they are wrapping up. Updates docs/current-sprint.md and docs/bugs/ in the CoachApp repo (the system of record since 2026-09-15), surfaces open to-dos, and checks memory is current.
---

# End-of-session save

**Step 0a — `cd "C:\Users\jaken\OneDrive\coachapp"` before anything else.** Same as `hello-claude`'s
Step 0a: every step below assumes this cwd, STOP and tell Jake if it fails.

**Step 0b — write the checklist to `~/.claude/state/ritual-save.md`, one `- [ ]`
line per step below**, and tick each one off in the file as you finish it. A save that dies mid-way
(credits, an interrupt) must be *visibly* unfinished. On 2026-07-13 a session ran out of credits
mid-save: the commits were pushed, the kanban was written, and **LOG.md never got an entry at all** — a
whole session of work with no record, discovered only by the next session noticing the dates didn't
line up.

> This mandated `TodoWrite` until 2026-08-20 — a tool that doesn't exist in this harness — so this  <!-- LINT-OK: naming the dead tool is the POINT of this note, not a call -->
> safeguard never ran; a file survives a crash better than an in-memory list would have anyway. If
> `ritual-save.md` still has unticked boxes at the next session start, the previous save died
> mid-way: finish it before anything else.

Run every step below in order. Do not skip any.

**Note (golden path, 2026-07-02, updated 2026-09-18):** Bare `/save` dispatches to THIS skill and
nothing else, and is now fully self-contained — it never reads or invokes `vault-save.md`
(`C:\Users\jaken\Claude\.claude\commands\vault-save.md`) and writes nothing to the Vault. That
changed 2026-09-18: Jake was explicit that no CoachApp work should point at the Vault any more, so
predictions capture moved into Step 10 below and owner-voice/ledger duties simply stopped being
CoachApp's concern — `vault-save.md` still exists and still runs for every other project, just never
triggered from here.

> **🔒 GATE (2026-08-25, repointed 2026-09-17) — grade before you append.** `guardrails.mjs` Rule 6
> blocks the commit in Step 10 if it adds a NEW `docs/predictions.jsonl` record while any prediction
> past `verify_by` is still ungraded. Two doors: a grading-only commit is never blocked (drain in as
> many passes as you like), and grading + appending in the SAME commit passes (count reads from
> staged content) — so the normal shape is grade the past-due ones, then write the new ones. Grade on
> evidence, Jake confirms or red→green does, never to clear the gate. Why: the backlog regenerates
> (62→32 on 2026-08-09, back over 100 within two weeks) — draining without closing the valve just
> books the next drain. Predictions already past-due when this rule shipped are grandfathered
> (`state/predictions-baseline.txt`) so it couldn't wall its own owner on day one; they still need a
> real drain, and stay visible in `os-lint`'s `stale-predictions` RED.

**Note (efficiency, 2026-07-02, updated 2026-09-18):** A save runs many small file writes, all in this
one repo now. Batch them — write everything first (`docs/current-sprint.md`, `docs/roadmap.md` if
touched, `docs/decisions.md` if a decision was logged, `docs/predictions.jsonl` from the prediction
scan, `docs/bugs/*.md`), verify with *one* pass (e.g. one `git diff` or a couple of `tail` calls in a
single Bash call, not a read-after-every-edit), then do Step 10's commit. Run independent writes in
parallel tool calls, not sequential turns. A save should be a handful of tool-call round-trips, not
dozens.

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

Read `C:\Users\jaken\OneDrive\coachapp\index.html` and find **every** `<script src="js/*.js?v=N">` line.
Each module has its own independent version; there is no single app.js anymore.

**Do not glob for `app-*.js`.** There are **9** modules, and `starter-content.js` (shipped 2026-07-12) does
not match that pattern — so a change to it would silently never have its cache-bust checked. Enumerate what
is actually on disk instead:

```bash
ls js/*.js                                          # the real list — currently 9
grep -oE 'js/[a-z-]+\.js\?v=[0-9]+' index.html      # the versions actually shipped
```

- For each module file changed this session: confirm its own `?v=N` was incremented in the same commit.
- If any changed file's version wasn't bumped: flag it to Jake before closing — it must be fixed and pushed.
- If a **new** module file was added: confirm it has a `<script>` tag at all, and add it to this check.

See [[feedback-cache-bust]].

---

## Step 3 — Update the repo's live docs

**The repo replaced the Vault as CoachApp's system of record** (`CLAUDE.md`, `docs/decisions.md`'s
2026-09-15 entry). `STATUS.md` in the Vault is now historical archive, do not write to it — its role
splits across `docs/current-sprint.md` (live state), `docs/technical-debt.md` (known gaps), and
`docs/decisions.md` (significant, dated decisions only — not every session).

### 3a — Reconcile the bug ledger (`docs/bugs/`, one file per bug)

The ledger is `C:\Users\jaken\OneDrive\coachapp\docs\bugs` — one file per bug, named
`YYYY-MM-DD-slug.md`, with YAML frontmatter:

```yaml
---
id: 2026-08-11-short-slug          # matches the filename, always
status: open | fixed-awaiting-jake | confirmed | deferred | closed
priority: critical | high | medium | low | unset
reported: 2026-08-11               # bare ISO date, nothing else in this field
status_detail: "free text, only when it says more than the enum"
---
```

**INTAKE FIRST, then closure.** Every bug Jake reported this session must already be a file (the standing
intake rule says a report becomes a row *before* investigation starts). Verify none were missed — re-read
his messages, not your summary of them. Add anything that slipped, as a new file dated when he reported
it (not today).

> **🔒 CLOSURE RULE.** A Jake-reported item may be closed **only** by:
> **(a)** Jake confirming it, or **(b)** a test that went **RED before the fix and GREEN after**.
>
> Never by inference. Never by "likely the same root cause." Never because Playwright covers an adjacent
> flow. Never because a robot looked instead of Jake.

If you fixed something this session, it becomes `fixed — awaiting Jake` — **not** removed. It leaves the
ledger when *he* says so, or when a red→green test proves it. Only Jake may set `deferred`.

> **⚠️ Change the `status:` FIELD, not just the body text.** Under the old table this failed silently
> for 17 days — six rows said `✅ FIXED + LIVE <commit>` in prose, `open` in their cell. One file per
> bug makes it harder to repeat but not impossible; writing ✅ into the body is **not** updating the
> status. `os-lint`'s `ledger-drift` check exists precisely to catch this.
>
> **Mechanical step, not a maxim** — after editing the ledger, run:
> ```bash
> node C:/Users/jaken/OneDrive/coachapp/.claude/hooks/os-lint.mjs --report > /tmp/oslint.out 2>&1; grep -E "ledger-drift|stale-bugs" /tmp/oslint.out
> ```
> (Redirect first, then grep the file — never pipe a runner's own status through grep/tail directly;
> see `hooks/guardrails.mjs` Rule 1. A self-test run on 2026-09-15 nearly reported a false PASS this
> exact way.)
> `ledger-drift` must be GREEN before you move on. If it is RED it will name every row whose text and
> status disagree. Fix them, then re-run. (The rows are long and awkward to hand-edit — a small Python
> replace with a `count(anchor) == 1` assertion is safer than an eyeballed edit.)

This replaces five old removal rules ("CI is green → remove it", "Playwright covers it → remove it") that
gave the ledger a one-way valve: everything drained out, nothing came in. The slow-Workouts-page report was
closed under exactly those rules on 2026-07-06, on a guess, and Jake re-reported it — still broken — on
2026-07-13.

### 3b — Then make surgical edits to `docs/current-sprint.md` / `docs/technical-debt.md`
Do NOT rewrite sections that weren't touched:
- `docs/current-sprint.md`'s live-state section — update to the current release cycle / module
  versions actually in `index.html`
- `docs/technical-debt.md`'s "Known gaps" — mark newly completed items, add new ones found
- `docs/decisions.md` — append ONLY if this session made a genuinely significant, hard-to-reverse
  choice (deploy/process changes, stack-level decisions). This is not the old Continuity block —
  it's deliberately event-triggered, not a running log of every code-level lesson. If nothing
  decision-worthy happened, don't add an entry just to have one.

---

## Step 4 — Update docs/roadmap.md — MANDATORY, never skip

File: `C:\Users\jaken\OneDrive\coachapp\docs\roadmap.md`

**This is its own gate, not a sub-bullet of Step 3.** Standing instruction from Jake, 2026-07-11:
*"please ensure roadmap is updated as part of every save command."* Repointed 2026-09-15 — see the
note at the top of Step 3.

**Why this exists:** without a dedicated step, the roadmap silently drifts out of sync with reality.
Real case found 2026-07-11: an item was still listed as open during a planning session and was
nearly rebuilt from scratch despite having actually shipped days earlier. A stale roadmap is worse
than no roadmap: it causes duplicate work and false priorities at the next `/hello-claude`.

Do all three (the old Step 4.2 "session-backlog section" was retired with the migration — full
historical session-by-session detail now lives in `docs/archive/roadmap-2026-09-08.md`; this file is
a curated current-state summary, not a growing log):

1. **Sweep the "Current priorities" section** against this session's work AND recent `git log`. Anything
   actually done → remove or mark done. Do not trust the existing text; verify against the code.
2. **Add any new item** that emerged this session — feature request, bug found-but-not-fixed, or
   deferred decision — to "Current priorities" or "Named backlog items" as appropriate.
3. **State explicitly in your Step 11b confirmation what you reconciled** — e.g. "roadmap: removed 1
   shipped item (X), added 1 new priority." If nothing changed, say "roadmap: already in sync,
   nothing to reconcile" — an explicit finding, never silence.

---

## Step 5 — Session record (retired in its old LOG.md form)

**`LOG.md` is now a frozen historical archive** (`docs/archive/log.md`) — nothing appends to it going
forward. This was a deliberate design choice in the 2026-09-15 migration, not an oversight: a
continuously-growing full-narrative log was exactly the pattern that made `STATUS.md`/`roadmap.md`
grow 94% in 5 weeks and cost every session ~86k tokens to read (`os-lint`'s `context-budget` check
exists because of it). The replacement is narrower by design:

- **A release was cut this session** → the mandatory `docs/releases/<version>.md` note (already
  required by `scripts/release.mjs`) IS this session's shipped-work record. Nothing extra to write.
- **A significant, hard-to-reverse decision was made** → one dated entry in `docs/decisions.md`
  (Step 3b already covers this — don't duplicate it here).
- **Something was pushed but not yet confirmed working in the browser** → a `docs/bugs/` file
  (Step 3a's frontmatter), status `open`, exactly as before.
- **Otherwise** → nothing to write. A session that shipped nothing decision-worthy and filed no new
  bugs needs no separate record; that's the point of retiring the growing log, not a gap to fill.

---

## Step 6 — Update memory and skills

For each of the following, check if a new entry is needed or an existing one needs updating:

**Memory** (`C:\Users\jaken\.claude\projects\c--Users-jaken-OneDrive-coachapp\memory\` — this CoachApp working directory's own auto-memory, not the Vault directory's; found stale-pointing-elsewhere 2026-07-07 and corrected):
- Did a new bug pattern emerge this session? → update or create a `feedback_*.md`
- Did Jake correct an approach or confirm an unusual one? → add to the relevant feedback memory
- Did we learn something about project state (deadlines, decisions, constraints)? → update `project_coachapp.md`
- Did a to-do get cleared this session? → note it so future sessions don't re-add it

**Skills — two locations, deliberately (repointed 2026-09-15):** `hello-claude`/`save`/`run-coachapp`
live in THIS repo's `.claude/skills/`. Every other (generic, cross-project) skill still follows the
pre-existing rule — `C:\Users\jaken\.claude\skills\` is their ONLY canonical location, never a second
copy under a project's own `.claude\skills\`, see [[feedback-skill-golden-path]] (a real 2026-07-01
dual-copy incident — the global copy is deleted for the 3 that moved, never kept alongside).
- Was a new CoachApp skill created this session? → confirm registered in
  `coachapp/.claude/skills/hello-claude/SKILL.md` (standing behaviours) and has a MEMORY.md entry.
  A new *generic* skill still registers at the global path above.
- Was an existing skill found to be wrong or incomplete? → update it now
- Code review (pre-commit for ownership/RLS, pre-push otherwise) = the `multi-agent-review` skill (a pinned prompt: 3 fixed angles + verifier, plus a weekly full-file mode). If the review angles genuinely need to change, edit that skill deliberately and note it in the LOG — never improvise a different review ad hoc, that reintroduces the rigor-drift/diff-only-blind-spot the pinned skill exists to prevent
- LLM-wiki ingests: read `wiki/sources.md` (the manifest) and append to `wiki/log.md`. **Never run bare `/ingest`** — that is the framework Vault-OS pipeline, a different thing entirely.
- **Back up ~/.claude's generic skills + memory if either changed this session.** `~/.claude` is otherwise local-disk-only (not OneDrive, no cloud sync). CoachApp's own skills/hooks back up as part of the normal CoachApp repo push (Step 10) — nothing extra needed for those.

  > **🔒 GATE — run `os-lint` BEFORE any push. It must be clean of `skills-pii`.**
  > ```bash
  > node "C:/Users/jaken/OneDrive/coachapp/.claude/hooks/os-lint.mjs" --report
  > ```
  > If `skills-pii` is RED, **do not push** — fix it first. This directory goes to GitHub: until
  > 2026-07-13 it held a **real client's full name + DB UUID, the owner's auth uid/email, and live
  > E2E passwords in plaintext**, unscanned (`checks.sh`'s PII gate only ever covered `js/`). Emails
  > on `example.com` are exempt; real ones are not. Resolve identifiers at runtime.

  Then: `cd ~/.claude && git add -A && git commit -m "..." && git push` → private repo
  `jakendwest-ops/claude-config` (branch `main`; an allowlist `.gitignore` tracks only `skills/` + the
  auto-memory dir, so `git add -A` is safe — everything else, incl. `settings.json`, is excluded). Auth via
  `gh`, no token in the URL. See [[claude-config-backup]].
  **Note (2026-08-09, example updated 2026-09-15):** `hooks/` and `state/` **are** in the allowlist
  (`!/hooks`, `!/state`) — `hooks/standing-behaviours.mjs` and `state/last-full-file-review` are
  tracked, verify with `git ls-files` if in doubt. (`hooks/os-lint.mjs` moved to the CoachApp repo
  2026-09-15 and is no longer an example of a file that lives here.)

Update `MEMORY.md` index if any files were added or changed.

---

## Step 7 — Documentation and glossary check

Check whether this session introduced anything that needs capturing outside this repo's `docs/*.md`:

- **New jargon explained to Jake this session** (race condition, RLS policy, etc.) not yet in the LLM
  wiki glossary (`...\wiki\guide-glossary.md`) — add it, with a real example from this session as the
  worked illustration, matching existing entries' style.
- **Roadmap-wiki-sync backstop** — verify (don't assume) that any `roadmap.md` change this session was
  already mirrored into `guide-coachapp-roadmap.md` + the relevant topic page; do it now if not.
- **Wiki `log.md`** — confirm an entry exists for this session (append if missing).
- **Kanban board "Proposed for Next Session" column** (`...\wiki\board-coachapp.md`) — rewrite every
  save: a curated 3-5 item shortlist (fully-scoped first, then deadline-driven, then new quick wins),
  not everything open. Add a one-line "Last generated" date + summary. Read automatically at the next
  session's `/hello-claude` Step 6.

If nothing from this session needs any of the above, say so explicitly rather than skipping silently.

---

## Step 8 — Surface open to-dos for Jake

List every row that is `open` or `fixed — awaiting Jake`. For each, state **what specific evidence would
close it** — that is the only thing that makes the list actionable rather than a guilt pile.

Format as a short numbered list Jake can copy to his notes. Lead with anything `os-lint` flagged as stale
(an `open` row older than 7 days).

**An empty ledger is not a good outcome — an honest one is.** (This line used to say the opposite: *"An
empty to-do list is a good outcome, not a gap."* Combined with hello-claude's *"Never carry forward a to-do
that current evidence resolves"*, the system was actively rewarded for forgetting.) If the list really is
empty, say so — but check `docs/technical-debt.md`'s "Known gaps" too, not just `docs/bugs/`. The old
STATUS.md prose-vs-table split that caused six items to go unsurfaced has a direct successor here:
a known gap can sit in `technical-debt.md` without a matching bug file.

---

## Step 9 — Playwright status

State whether the Playwright suite was run this session:
- If yes: result (X/total, console errors, verdict) — read the actual total from the run output, don't assume a fixed suite size
- If no: flag that tests haven't been run — recommend running before the next deploy

---

## Step 10 — Commit and push — one target: this repo

**Repo only, since 2026-09-18 — no Vault commit any more.** Every save-time write, including
`docs/predictions.jsonl` (moved from the Vault 2026-09-17), lands here. Never run `git commit` until
every `docs/*.md`/`docs/predictions.jsonl`/`docs/bugs/*.md` file this save touches has been written.
Never amend a previous commit to fix a missed file — sequence this step last instead.

```
cd "C:\Users\jaken\OneDrive\coachapp"
git add docs/
git commit -m "docs: session save YYYY-MM-DD (vXX-vYY)"
git push
```

This is an ordinary CoachApp repo commit — it follows the same discipline as any other push here
(no `--no-verify`, `checks.sh` still runs). It is NOT gated by the ownership/RLS pre-commit review
(`docs/` isn't app code), but IS gated by `guardrails.mjs` RULE 6 if `docs/predictions.jsonl` changed
(see the GATE note above). If this session's commits also touched `js/`/`scripts/`, the ownership/RLS
review still applies to THOSE commits, separately, per `CLAUDE.md`.

If the push fails (no remote, auth issue), flag it to Jake — do not skip silently.

---

## Step 11 — Report to Jake

Steps 11 and 12 were separate until 2026-08-24 (OS v3). Both were "tell Jake what happened" and being
two steps only ever meant two chances to do half of it. One step, two halves — both mandatory.

### 11a — What changed, in two registers

1. **Technical** — what functions/files changed, what queries or schema changed, what the fix was at a code level. One sentence per item.
2. **Plain English** — what the user actually experiences differently now. No jargon. One sentence per item.

Never skip the plain-English version.

### 11b — The state of the machine

- docs/current-sprint.md ✓ / docs/decisions.md ✓ (only if a decision was logged) / docs/roadmap.md ✓
- Current module versions (all 9)
- Cache bust: OK / NEEDS FIX
- **`os-lint`: clean / RED (with what)** — never push `~/.claude` while `skills-pii` is red
- Ledger: items **added** this session, items moved to `fixed — awaiting Jake`, items **confirmed closed by
  Jake** (and nothing else — see the closure rule)
- Open ledger rows remaining: [list]
- Playwright status
- Whether /deploy-check should be run before the next push
