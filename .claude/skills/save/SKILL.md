---
name: save
description: End-of-session ritual. Run when the user says /save or signals they are wrapping up. Updates docs/current-sprint.md and docs/bugs/ in the CoachApp repo (the system of record since 2026-09-15), surfaces open to-dos, and checks memory is current.
---

# End-of-session save

Procedure only. The reasons behind each step were cut 2026-11-17 and are archived in
`docs/archive/save-skill-2026-11-17-before-trim.md`.

**Step 0.** The session's root must be the repo (as `hello-claude` checks); if not, STOP and tell Jake. Write the
checklist to `~/.claude/state/ritual-save.md`, one `- [ ]` line per step, and tick each as you finish, so a save that
dies mid-way is visibly unfinished. If an earlier `ritual-save.md` has unticked boxes, finish that save first.

Repo only: nothing goes to the Vault or the old wiki. Batch the writes, verify in one pass, commit once.

## Step 1 — What was done

List features built or changed (with versions), bugs fixed, tests added, memory/skills changed, anything pushed.
**Error-rate check:** count the mistakes this session that reached a commit, a claim to Jake or a shipped conclusion
and fall in a class an existing rule covers (not self-caught drafts). Append one dated line with the count, even if
zero, to `docs/bugs/2026-08-22-error-rate-and-the-rule-corpus.md`. Do not close that row.

## Step 2 — Cache bust

`ls js/*.js` (9 modules; `starter-content.js` does not match `app-*`) and
`grep -oE 'js/[a-z-]+\.js\?v=[0-9]+' index.html`. Every module changed this session must have its own `?v=` raised
(the pre-commit hook does it; confirm). Flag any miss to Jake.

## Step 3 — Bug ledger and live docs

**3a.** One file per bug in `docs/bugs/` (`id`, `status: open | fixed-awaiting-jake | confirmed | deferred | closed |
unverified-accepted`, `priority`, `reported: YYYY-MM-DD`, `status_detail`). Every bug Jake reported this session must
already be a file, dated when he reported it; re-read his messages to check. **Closure rule:** a Jake-reported row
closes only on Jake's confirmation or a test that went red before the fix and green after. A fix you made becomes
`fixed-awaiting-jake`. Only Jake sets `deferred`. Change the `status:` field, not just the body text. Then run
`node .claude/hooks/os-lint.mjs --report > <scratch>/oslint.out 2>&1` and grep it; `ledger-drift` must be GREEN.

**3b.** Surgical edits only: `docs/current-sprint.md` (live state), `docs/technical-debt.md` (gaps found or closed),
`docs/decisions.md` (one line, only for a significant hard-to-reverse choice). Delete what is no longer true rather
than archiving it; `os-lint`'s `docs-budget` and `context-budget` must stay GREEN.

## Step 4 — Roadmap (never skip)

Sweep `docs/roadmap.md`'s "Current priorities" against this session and `git log`: remove what shipped, add what
emerged. In the report, say what you reconciled, or "roadmap: already in sync".

## Step 5 — Session record

A release's `docs/releases/<version>.md` is the record of shipped work; a decision goes in `decisions.md`; something
pushed but unconfirmed gets a bug file. Otherwise write nothing.

## Step 6 — Memory and skills

Memory lives in `~/.claude/projects/C--Users-jaken-OneDrive-coachapp/memory/`. Add or update a note for a new bug
pattern, a correction or confirmation from Jake, or a project fact; update `MEMORY.md`; after any memory edit check
that `enforced_by:` still starts at column 0. Update a skill found wrong. Repo skills (`hello-claude`, `save`,
`run-coachapp` and the rest under `.claude/skills/`) back up with the repo push; global skills live only in
`~/.claude/skills/`. If memory or global skills changed: run `os-lint` (`skills-pii` must be GREEN), then commit and
push `~/.claude` to the private `jakendwest-ops/claude-config` repo (redirect `git push` output to a file).

## Step 7 — Open to-dos

List every `open` and `fixed-awaiting-jake` row, leading with the ones `os-lint` calls stale, each with the evidence
that would close it. Check `docs/technical-debt.md` too. For the waiting rows, `node scripts/ledger-batch.mjs` prints
the oldest 10 as a yes/no list for Jake.

## Step 8 — Playwright

Say whether the suite ran this session and its real result, or that it did not and should before the next release.

## Step 9 — Commit and push

Commit only after every file this save touches is written; stage your own files by name, not `git add docs/`, since
other sessions share this tree. `git commit -m "docs: session save YYYY-MM-DD (...)"`, then `git push` with output
redirected to a file and the exit code read. No `--no-verify`. If the push fails, tell Jake.

## Step 10 — Report to Jake

1. **What changed**, technical and plain English, one sentence each.
2. **State:** docs touched; module versions; cache bust OK or not; `os-lint` result; ledger rows added, moved to
   `fixed-awaiting-jake`, or confirmed by Jake; open rows; Playwright status.
