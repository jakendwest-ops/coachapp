---
name: hello-claude
description: Short session-start orientation for CoachApp - checks the session is rooted in the repo, makes sure the preview server is up, says where the last session left off, proposes what to do next and lists the open bug rows. Optional: the rules that matter live in CLAUDE.md and the hooks, which load every session whether or not this runs. Trigger when starting a CoachApp session or when Jake says "hello claude".
---

# Session start (orientation card)

Slimmed 2026-10-29 from a 270-line ritual (the full old text: `docs/archive/hello-claude-2026-10-29.md`). This card only orients. The rules a session must follow
live in `CLAUDE.md` (loaded every session), the hooks and the memory notes; see "Where the rules live" at the bottom.

**Step 0a — the session's ROOT must be the repo, `C:\Users\jaken\OneDrive\coachapp`** (or a worktree of it): the first command's "Shell cwd was reset to …"
line, and the memory path in your system prompt (`…\c--Users-jaken-OneDrive-coachapp\memory`). A miss (the Vision OS folder, say): STOP and tell Jake - a NEW session
on the repo is the clean fix. A `mcp__ccd_directory__change_directory` move keeps hooks and skills at once, CLAUDE.md only after a later compaction and the memory path never: Read the repo's `CLAUDE.md`
and its `MEMORY.md` yourself, and never `cd` past it (`docs/decisions.md`, 2026-10-05).

`os-lint` runs on SessionStart and prints anything rotten before you act. If it printed RED, **read it
first** — it is telling you the machinery itself is broken, which outranks whatever you were about to do.

## How Jake works

A personal trainer building CoachApp as developer and primary user; no software background, learns fast, wants the why. Messages are short and lowercase: do not pad.
Silence plus continuing is approval of the work, not of a plan. "both" / "all" = do everything. "make a note" = write it to `docs/`. "are you able to..." is a real
feasibility question: answer it. An all-caps restatement means patience is gone: the next attempt must work. Real use is the only vote on a feature. Full profile: [[user-jake]].

## 1. Preview server (only if the work needs the browser)

`curl -s http://localhost:3001/ | grep -o "<title>[^<]*</title>"` must return `<title>CoachApp</title>` specifically (a dead config for the ended PTHub project serves valid HTML).
If it is not up, or it is the wrong app, follow the `run-coachapp` skill.

## 2. Where we left off

3-5 bullets from `git log`, the latest one or two notes in `docs/releases/` and `docs/current-sprint.md`: what was built or fixed, what is still broken, the module
versions (9 files in `js/`, from the `?v=N` tags in `index.html`) and whether CI is green (`gh run list --limit 1`). Then `git status --porcelain`: anything uncommitted
gets the full pre-commit and pre-push discipline, whoever wrote it.

## 3. Propose the plan

Start from `docs/current-sprint.md` "In flight" and `docs/session-context.md`. Compare `docs/roadmap.md` with `git log` and `docs/releases/`: anything it still calls current that
has shipped gets flagged for update. Then 2-3 numbered options, recommending one if the priority is obvious. (The old wiki is dead: never read it.)

## 4. The bug ledger

`docs/bugs/` is the ledger, one file per bug; `docs/backlog.md` has the counts. Surface every row that is `open` or `fixed-awaiting-jake`, leading with whatever `os-lint`
turned RED or listed as stale. If `os-lint` printed a weekly digest, give Jake ONE short list from it and offer `node scripts/ledger-batch.mjs`. The intake and closure rules are in
`CLAUDE.md`. Never carry forward a to-do that current evidence resolves; an empty ledger is not a good outcome, an honest one is.

**Weekly:** when the digest says the full-file review is overdue, run `multi-agent-review` in full-file mode on the 2-3 highest-churn modules and stamp the marker as that skill says.

## If work goes in circles

No fix without a root cause. After a failed fix, re-read the error with the new information, not just a different guess. After three failed attempts STOP and tell Jake it
is an architecture question. The `superpowers:systematic-debugging` skill has the full method.

## Where the rules live

- `CLAUDE.md` (every session): the intake and closure rules, the standing behaviours 1-9 (fix the class, no claim without a check, SQL, multi-agent-review, approval before building,
  the blast-radius sweep), the three-roles rule and the deploy rules.
- Hooks: `guardrails` (commit and shell gates), `os-lint` (health at session start), `claim-check` (end of reply), `session-root-guard`.
- Skills: `feature-audit` after a build, `mobile-check` after a UI change, `sql-safety` before SQL, `multi-agent-review` before a commit or push, `save` at wrap-up.
- Memory notes (the index loads every session): the sounding board before a new feature, name the spec before neutering code, repost code in full, and the rest.
