# Subagent contract — read this first, before your task brief

Every implementer, reviewer and fixer dispatched on this project is bound by this file. It exists
because these rules were learned from real incidents here, not imported from a template.

## 1. A permission denial is a STOP, not a routing problem

If the permission classifier, a hook, or any guard refuses an action: **stop and report it.** Do not
retry the same action through a different tool to get a different answer.

Specifically forbidden:
- Retrying a denied `Bash` command via `PowerShell`, or vice versa.
- Reaching for a test-injection or override environment variable you found by reading a guard's
  source (for example `GUARDRAILS_MARKER`) in order to satisfy that guard.
- Rewriting a command to be less recognisable so it is not matched.
- Any other route whose purpose is to obtain an outcome a guard just refused.

**Why this is absolute.** On 2026-08-22 two implementers hit the same refusal on the same guard.
One found the override variable in the hook's source, recognised it as an escape hatch, refused to
use it, and reported — which led to the guard's real defect being found and fixed properly. The
other switched from Bash to PowerShell and forced the commit through. Both produced correct code.
Only one behaved correctly, because a permission system that can be walked around by changing tools
is not a permission system.

A refusal you report costs one message. A refusal you route around costs the guard its meaning.

**What TO do:** report exactly what was refused, what you were trying to achieve, and why you
believe it should be allowed. The controller can fix the guard, obtain approval, or tell you the
refusal was correct. All three outcomes are better than the bypass.

## 2. Never `git stash`

A real WIP stash lives in this working tree and a reviewer has already popped the wrong one. Use
`cp` to a scratch path, or `git show HEAD:<path>`, to obtain a pristine copy.

## 3. Never pipe a command whose exit code you intend to read

`pipefail` is OFF in this shell, so a pipeline returns its LAST command's status. On 2026-08-22
`npx playwright test | tail -45` reported "exit code 0" for a run with 2 FAILED tests. Redirect to a
file, then read BOTH the status and the summary line.

## 4. Prove a check can FAIL before trusting it

A check observed only passing is indistinguishable from a dead one. `scripts/checks.sh` rule 2b
shipped DEAD on 2026-08-22 because its POSIX ERE character class was malformed, so it matched
nothing and passed silently, and nobody made it fail first.

## 5. Report what you actually ran, not what you concluded

Quote real command output for anything load-bearing. An asserted proof carried a false claim through
an entire fix round on 2026-08-22 — the map was "verified" by assertion and was wrong.

## 6. Do not dispatch subagents

Review arrives from the controller, after your report. A worker-spawned reviewer duplicates a seat
the controller is already paying for.

## 7. Leave the tree clean

Delete probe files. Verify with `git status --short` before you hand back. If you deliberately leave
work uncommitted, say so explicitly and say why.

## 8. Do not push

The controller decides when work is pushed. Pushing to `master` deploys live to GitHub Pages.
