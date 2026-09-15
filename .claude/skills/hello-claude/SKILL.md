---
name: hello-claude
description: Session-start ritual for CoachApp — boots the preview server, reads the repo's live docs (docs/*.md, the system of record since 2026-09-15), summarises the last session, scans for bugs, surfaces the bug ledger, and proposes today's plan. Trigger at the start of any CoachApp working session, however the user opens it (saying "hello claude", a casual greeting, or just starting to describe work).
---

# Session start ritual

**Step 0 — before anything else: write the checklist to
`~/.claude/state/ritual-hello-claude.md`, one `- [ ]` line per step below.** Tick each one off in the
file as you complete it. An interrupted ritual must be *visibly* unfinished. On 2026-07-13 Jake typed
`/brainstorming` at Step 6; the steps after it silently never ran, and nothing anywhere noticed.
A checklist nobody can see is not a checklist.

> This said "`TodoWrite` one todo per step" until 2026-08-20. **`TodoWrite` does not exist in this  <!-- LINT-OK: naming the dead tool is the POINT of this note, not a call -->
> harness** — so from the day this ritual was written, its own anti-drop safeguard has never once run,
> and nothing noticed. That is the exact failure the step exists to prevent, committed by the step
> itself. A file works everywhere and survives a crash; `os-lint`'s `mandated-dead-tools` check now
> goes RED if any skill mandates a tool the harness does not provide.

`os-lint` runs on SessionStart and prints anything rotten before you act. If it printed RED, **read it
first** — it is telling you the machinery itself is broken, which outranks whatever you were about to do.

---

## Who Jake is — how to work with him

Jake is a personal trainer building CoachApp as both developer and primary user. No software engineering
background, learns fast, wants the *why* behind every decision.

- Messages are short, lowercase, direct. Don't pad responses.
- Silence + continuing = positive feedback. He doesn't say "great job."
- "both" / "all" / "please add" = execute everything, no follow-up needed.
- "make a note" = write it to the Vault.
- "are you able to..." = genuine feasibility check, not rhetorical — answer directly.
- After every significant change: a technical explanation **and** a plain-English one, inline as you build.
- Ships small, sees it, moves on. He doesn't like long planning phases.
- Turns failures into permanent systems — when something breaks badly, a skill or lint check comes out of it.
- Proactively audits his own tooling for gaps — surface them at session start, don't wait to be asked.
- **All-caps restatement** ("PLEASE FIX THIS") = patience exhausted. Next attempt must work. No more probing.
- **Research-justified features have no protection.** Real use is the only vote that counts. (The plate
  calculator: shipped from competitor research, deleted 8 days later after one real gym session.)

See [[user-jake]] for the full profile.

---

## Step 1 — Start the preview server

**Check before starting** — it is usually already up, and a second listener on 3001 just errors:

```bash
curl -s http://localhost:3001/ | grep -o '<title>[^<]*</title>'
```

Must return `<title>CoachApp</title>` **specifically**. Serving *something* and serving the *right app* are
different checks — a dead config for a now-ended project (PTHub) serves perfectly valid HTML. If it's not up,
or it's the wrong app, follow the `run-coachapp` skill. This step blocks until CoachApp is confirmed.

## Step 2 — Read the repo docs

**Repointed 2026-09-15 — the repo (`docs/*.md`) replaced the Vault as CoachApp's system of record.**
See `coachapp/CLAUDE.md`'s "Repository source of truth" section and `coachapp/docs/decisions.md`'s
2026-09-15 entry for the full context. Steps below read the repo; only 5-6 still read the Vault
(genuinely cross-project Claude memory, not CoachApp docs — untouched by this migration).

1. `coachapp/docs/session-context.md` — priorities/risks/next-actions snapshot, then
   `coachapp/docs/current-sprint.md` — live release-cycle state
   (the **bug ledger** is `coachapp/docs/bugs/` — one file per bug, not a table)
2. `git -C coachapp log --oneline -20` — recent commit history (LOG.md's old role; LOG.md itself is
   now a frozen archive at `coachapp/docs/archive/log.md` and no longer grows)
3. `coachapp/docs/critical.md` — infra, security constraints, GDPR, security incident timeline
4. `coachapp/docs/roadmap.md` — current-state summary (full historical detail:
   `coachapp/docs/archive/roadmap-2026-09-08.md`)
5. `C:\Users\jaken\Claude\Vault\memory\lessons.jsonl` — past mistakes not to repeat (full file)
6. `C:\Users\jaken\Claude\Vault\owner\voice.md` — **last ~150 lines only** (appends newest-at-bottom). Read
   in full only when about to draft external-facing prose in Jake's voice.

## Step 3 — Summarise the last session

3–5 bullets from recent `git log` + `docs/releases/` (most recent 1-2 notes): what was built/fixed,
what's still broken, module versions (from `index.html`'s `?v=N` tags — there are **9 module files**
in `js/`, including `starter-content.js`), and whether CI is green (`gh run list --limit 1`).

**Then check for uncommitted work:** `git status --porcelain`. `docs/current-sprint.md` is a
point-in-time snapshot and says nothing about the working tree right now. Anything uncommitted gets
the full pre-commit/pre-push discipline (Playwright + multi-agent review) regardless of who wrote it
or when — found via a real gap on 2026-07-02, six files with no record anywhere.

## Step 4 — Bug scan

`checks.sh` already enforces column names, query scoping, cache-bust, PII-in-logs and duplicate functions
on **every push**. Do not re-grep them here — that is theatre, and it crowded out the checks that matter.
Grep the 9 module files in `js/` for the three things the hook **cannot** catch:

**a) Client-side `coach_id` errors** — when a *client* is logged in, queries for coach-owned tables
(`workout_templates`, `exercises`) must use the coach's id from `clients.coach_id`, never `currentUser.id`.

**b) Role routing** — anywhere `currentProfile?.role` decides what renders: does a null/missing role
silently fall through to the PT view?

**c) `isClientPlan` gates missing a solo branch** — grep `isClientPlan`. Every hit that gates a **fetch**
needs a `role === 'solo'` branch or a `window._soloClientId` fallback, or it silently returns empty data in
solo mode. (Context-flag *reads* are fine — only fetch gates matter.) Recurring bug class: solo shares the
coach's `auth.uid()`, which masks whole categories of failure.

Report findings with line numbers. If clean, say "Code review: clean." **Do not fix — just report.**

**Weekly full-file review — driven by the marker, not by self-assessment.** `os-lint` goes RED when
`~/.claude/state/last-full-file-review` is missing or >7 days old. When it does: run `multi-agent-review`
in **full-file mode** against the 2–3 highest-churn modules (whole files, not a diff), then update the
marker (`node -e "require('fs').writeFileSync('C:/Users/jaken/.claude/state/last-full-file-review', new Date().toISOString())"`).
The old instruction ("first session of the week") asked the agent to self-assess a condition it had no way
to check — **it never once fired in 10 days**, which is how 5 unscoped `app-clients.js` queries survived
~12 diff-only reviews.

## Step 5 — Roadmap cross-check

Compare `docs/roadmap.md` against recent `git log`/`docs/releases/`. Anything it still calls current that
those show as shipped → flag it for update. Then show: everything currently in flight, then the top 3
named-but-unscoped backlog items.

## Step 6 — Propose the plan

**Start from the kanban board's shortlist** — `C:\Users\jaken\OneDrive\Documents\LLM wiki\wiki\board-coachapp.md`,
the "Proposed for Next Session" column. The previous session's `/save` wrote it specifically to anchor this
step. Cross-check against `docs/current-sprint.md`/`docs/roadmap.md` in case something changed outside a
session, drop anything stale, then propose 2–3 items as a numbered list. Recommend one if the priority is obvious.

## Step 7 — Surface the bug ledger

**The live ledger is `docs/bugs/` — one file per bug.** Check `docs/backlog.md` for the current snapshot
(counts + themes), then read anything `os-lint` flagged as stale directly from `docs/bugs/`.

Surface every row whose status is `open` or `fixed-awaiting-jake`. Lead with whatever `os-lint` turned RED.

> ### 🔒 The closure rule
> A Jake-reported item may be closed **only** by **(a)** Jake confirming it, or **(b)** a test that went
> **RED before the fix and GREEN after**.
>
> Never by inference. Never by "likely the same root cause." Never because Playwright covers an adjacent
> flow. Never because a robot looked instead of Jake.
>
> This step used to say *"Never carry forward a to-do that current evidence resolves"* — the only absolute
> in the whole closure logic forbade **retention**. It explicitly licensed closing a "Jake must verify this
> himself" item because a robot looked instead. That is how the slow-Workouts-page report was closed on a
> guess on 2026-07-06 and re-reported by Jake, still broken, seven days later.
>
> **An empty ledger is not a good outcome. An honest one is.**

_Predictions are no longer a manual ritual step. `os-lint`'s `stale-predictions` check goes RED on any
CoachApp prediction past its `verify_by` and still ungraded (`outcome:null`) — the same way it surfaces
stale bug rows. It went 16-deep-overdue as a grep nobody ran; now the hook owns it. When it turns RED,
grade each true/false with Jake (the closure rule applies) and set `outcome`. Do not re-add a manual step._

---

# Standing behaviours

Thirteen. Not thirty-three. The old list nominally required **17 mandatory gates on a single feature build**
— nothing could run that, so skipping became the default and the decay was invisible. Everything below has
either caught a real bug, or was explicitly asked for by Jake.

### 🩸 The bug ledger — the intake rule
**The moment Jake reports a bug, it becomes a FILE in the repo's `docs/bugs/` directory — BEFORE you
start investigating.** One file per bug: `docs/bugs/YYYY-MM-DD-slug.md`, frontmatter `status` /
`priority` / `reported`. (It was a markdown table in STATUS.md until 2026-08-11, then per-file in the
Vault; the repo replaced the Vault as system of record 2026-09-15 — see `docs/decisions.md`.)
Not at `/save`. Not "if it's still relevant." Every row carries a `Reported` date and a `Status`
(`open` / `fixed — awaiting Jake` / `confirmed` / `deferred (Jake)` — only Jake may set `deferred`).
The rituals had five mechanical rules for *removing* to-dos and **zero** for adding them. That is the whole
reason reports rotted. `os-lint` turns any `open` row older than 7 days RED at session start.

### 🔁 FIX THE CLASS, NOT THE INSTANCE
> The *trigger* is owned by `hooks/standing-behaviours.mjs` rule 2, injected every turn. This section
> keeps only what the hook has no room for: the shared-helper requirement and the incident behind it.

**Put the guard in ONE shared helper** — grepping the siblings is not enough if each gets its own copy.
A review's fix lands where the bug was *found*, not where it *lives*. `deletePhaseWeek` got two delete
guards on 2026-07-10; its sibling `_cleanupPhaseWeeksBeyond` did not, and destroyed real Week-1 workouts
for a day. Three more sibling-misses landed on 2026-07-13 alone.

### Before any new feature → sounding board + product principles
Don't build immediately. Ask 2–3 targeted questions: what problem does this solve? Where does it fit the
existing flow? Is there a simpler version? Does it conflict with anything? Then state both principles
explicitly: **(1) friction at point of use** — does it surface information at the moment it's needed?
**(2) copy-paste simplicity, no feature gating** — sensible default, complexity opt-in, all features
included (never a premium tier). Challenge gently but directly; Jake wants a partner who pushes back.
Does *not* apply to bug fixes or clearly-scoped tasks. **Ask who asked for this, and when they last felt
the pain** — if the answer is "a research doc", say so, and prefer to defer.

### Before writing any code or SQL → explicit approval
Present one consolidated summary of everything about to be built (all files, all changes, all SQL) and wait
for "approved" or equivalent. Silence or "looks good" is not approval. Never start building mid-discussion.

### Before every commit → blast radius sweep
Active reasoning, not a grep:
1. **Every other caller** of each changed function — does my change break it?
2. **All roles** — coach, client, AND solo. Never verify only the role being developed.
3. **All exercise types** — cardio, timed, unilateral, %1RM, bodyweight. Never assume strength covers the rest.
4. **Data flow** — if this writes to a table, grep every other `db.from('<table>')`. Will those reads behave?
5. **Empty / null / unexpected shape.** The **zero** case is a distinct third state from one-vs-many, and it's
   the one fixtures never construct (a phase with zero sessions crashed live).
6. **What did the old code hide that the new code now exposes?** (Removed overlays, changed nav, replaced queries.)
7. **Does this touch a Playwright test path?** Run `npm test` before pushing, not after.

Fix anything this surfaces before committing. Never defer a known risk to "check on live."

### After every feature build → feature-audit
Run `feature-audit`. It subsumes the old UI-consistency check, verify-before-done, smoke-tests, the
Supabase API-log check, and the RLS role audit. Affordances & permissions (all four verbs checked
separately), the PT lens, the gym-user lens, and **proof rather than claims**. Jake should never be your QA.

### After any UI change → mobile-check
Run `mobile-check`. 390×844. **Look at the screenshot** — a passing assertion is not a mobile check.

### Before any SQL → sql-safety
Run `sql-safety` before any DELETE, UPDATE, or schema change. Non-negotiable: RLS on every table before its
first INSERT; never `qual = 'true'`; never query `auth.users` in a policy (use `auth.uid()`/`auth.email()`);
new tables get added to `downloadMyData()` and `delete_current_user()`; **a private bucket is not a secure
bucket** — object policies must be path-scoped, and proven behaviourally by attempting the op as the wrong
tenant. **Only tenancy columns belong in RLS** — a display flag (`is_personal`) is not a security boundary.

### Before any git push → multi-agent-review
Run `multi-agent-review` (3 fixed angles + a verifier). It has caught real, data-destroying bugs on several
consecutive pushes. Note: `/code-review ultra` **does** exist in the VSCode extension, but it is
user-triggered and billed — you cannot launch it. Offer it; never assume it.
Allow a long timeout on `git push` (300000ms+) — the pre-push hook runs a Playwright **smoke gate**.

**The gate is NOT the suite.** It runs `runner.spec.js` + `solo-account.spec.js` — **~59 of ~757
tests** (grep-based, verified 2026-09-15; supersedes the earlier "57 of 523" figure — see
`docs/architecture.md`). This skill claimed "the Playwright suite" until 2026-08-20; the vast
majority of the suite has never blocked a push, and `ledger-fixes-2026-08-02.spec.js` sat RED for 3
days across ~4 deploys because it was outside the gate. **Run `npm test` before any push touching a
module you did not hand-test** — the gate will not do it for you.

**Widening it is harder than it looks — attempted and reverted 2026-08-20.** Three traps, all found by
`multi-agent-review` on the attempt itself:
1. **A glob in the playwright args silently no-ops.** Positional args are OR-ed filter regexes, not
   required paths: `playwright test a.spec.js b.spec.js missing-*.spec.js` exits **0** and just runs
   a+b. Adding `tests/<prefix>-*.spec.js` to the gate looks like coverage and evaporates on a rename.
   Verify any new gate line with `--list` and confirm the file COUNT, never the exit code.
2. **Selecting by filename prefix selects an era, not a category.** `ledger-fixes-*` matched 5 files,
   none newer than 2026-08-02 — it excluded the spec pinning the very fix that motivated the widening.
3. **The cross-tenant probes are not cleanup-safe at push frequency.** Several take `plantedId` from
   the offending session's own `.insert().select()`; if INSERT regresses permissive while SELECT stays
   restricted, the id comes back null and the `finally` cleanup is skipped — stranding a junk row on a
   REAL client. Harden those (re-read from the planting session, per `ledger-fixes-2026-08-01.spec.js`)
   BEFORE putting them in the gate.

**Known blind spot, unfixed:** 16 solo tests are `test.skip`-gated on `soloAvailable`. If
`window._soloClientId` ever fails to populate — the exact bug class that has shipped four times here —
all 16 skip and the push passes green. The gate is blind to the one failure that would disable it.

### 🎯 Before concluding from a neutered guard → NAME THE SPEC THAT COVERS THAT LINE
**When you break code deliberately to establish red-before, state which spec covers *that exact line*
BEFORE you run anything — and if the run disagrees with your expectation, suspect the mapping first,
not the test.**

Three times on 2026-08-22 a conclusion was drawn from testing the wrong path:
1. Neutered `app-workouts.js:747`, ran the **app-programs** spec, and nearly reported a live test as
   decorative. The guard exists at two sites; each has its own spec.
2. Filed a bug row saying that guard was untested. It has `client-workout.spec.js:225`. The row was
   wrong and had to be closed as a false premise.
3. A guard verified `clientId` while the write keyed on `.eq('id', existingId)` — the same shape one
   layer down: *verifying one fact while the thing that matters is another.*

All three were caught (twice by review, once by me). The rate is the signal, not the catches.

**Mechanical, not a maxim.** Before neutering:
```bash
grep -rln "<the function that owns that line>" tests/*.spec.js   # which spec drives this path?
```
Then run **that** spec. A neuter that produces no failure means one of: wrong spec, wrong line, or a
genuinely dead check — and they are indistinguishable until you have named the mapping.

### Whenever a bug's root cause is "I checked A but not the closely-related B"
Add the Playwright test **in the same commit as the fix**, not as a follow-up. This is RULE 0 at bug
scope — the incident produces a check, or it produces nothing.

### Always repost code in full when correcting
Never ask Jake to scroll up and patch a previous block.

### At session end → /save
When Jake signals wrap-up ("that's it", "let's stop here", "/save"), run `save`. Don't wait to be asked.

---

## If work goes in circles, or a fix fails twice

**The Iron Law: no fixes without root-cause investigation first.** A guess that happens to work is still a
guess that got lucky.

- **Attempts 1–2:** go back to the start — re-read the actual error, re-check what changed, re-verify the
  reproduction — *with the new information the failed attempt revealed.* Don't just try a different guess.
- **3+ failed attempts: STOP.** This is no longer a debugging problem, it's an architecture problem. Do not
  attempt fix #4. Surface it to Jake and discuss whether the approach is sound before touching the code again.

**Red flags — if you catch yourself thinking any of these, stop:** "quick fix for now, investigate later" ·
"just try changing X and see" · "I don't fully understand this but it might work" · "one more attempt" ·
proposing a fix before tracing where the bad value actually originates.

**Jake's own signals that this is happening:** "is that not happening?" (you assumed without verifying) ·
"stop guessing" · any all-caps restatement.

Before writing more code: re-read everything touched this session, web-search the official docs (Supabase,
supabase-js v2, MDN), check for duplicate/conflicting code, then propose **one** clean solution and get
agreement before building.
