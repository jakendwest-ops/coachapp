---
id: 2026-10-01-hooks-hard-code-the-main-checkout-so-a-worktree-is-gated-by-the-wrong-tree
status: closed
priority: high
reported: 2026-10-01
status_detail: "FIXED 2026-10-01, both halves, each by a test that ran RED on the old code and GREEN on the new. guardrails.mjs judges a commit in the working tree it is made in: scripts/check-guardrails-worktree.selftest.mjs (8 of 14 cases RED on the old hook, all green on the new). os-lint.mjs lints the working tree it is run in, never writes the shared size baseline from another tree, and accepts main's hook registration as covering a worktree's copy: os-lint.selftest.mjs (7 of 11 cases RED on the old code, 11/11 on the new). Both are run by checks.sh rule 9r in FULL mode (release), after being invoked by nothing. Two regressions I introduced on the way were caught only by diffing os-lint's FULL red list from the worktree against the session-start list (5 expected, 7 seen) and are fixed: an eager tree lookup that slowed the guardrails self-test 14 s -> 30 s (past os-lint's limit), and a wiring check that called both hooks unregistered from a worktree. CAVEAT: settings.json points every hook at the MAIN checkout's copy, so a real session gets the fix only once this branch is merged to master. Found by Claude while linting from a worktree, not reported by Jake."
closing_conditions: "A test that runs guardrails from a worktree cwd with an ownership-pattern diff staged THERE and asserts the commit is refused, RED before and GREEN after the hooks derive the repo from the event cwd (git rev-parse --show-toplevel) instead of a constant; and os-lint run from a worktree reads THAT worktree's docs/bugs. Naming the gap is not closing it."
---

# The hooks hard-code the main checkout, so a worktree is gated — and linted — against the wrong tree

**Closes when:** a test runs `guardrails.mjs` from a worktree cwd with an ownership-pattern diff staged *there* and asserts the commit is refused (RED before, GREEN after the repo is derived from the event's cwd, not a constant), and `os-lint` run from a worktree reads that worktree's `docs/bugs/`. Naming the gap is not closing it.

## What is wrong

The 2026-09-30 preview-server bug (`launch.json` hard-coded the main checkout, so a worktree's tests ran
against master's JavaScript) was one instance of a class. Counting the tracked files that still hard-code
the root:

| File | What it does with the constant | Effect from a worktree |
|---|---|---|
| `.claude/hooks/guardrails.mjs:24` | `REPO`; `git diff` / `git diff --cached` run with `cwd: REPO` | The block on **unreviewed ownership/RLS commits** inspects the *main* checkout's diff. A worktree sits under `REPO`, so `inCoachApp` is true and it does not bail out — it just looks at the wrong tree. |
| `.claude/hooks/os-lint.mjs:39` | `REPO`, and `BUGS = REPO/docs/bugs` | A worktree's lint reports the *main* ledger. It could not see the nine rows I wrote today, and told me nothing about them. |
| `.claude/settings.json` (3 commands) | absolute path to the hook scripts | By design — the hooks should run from one place. Listed so the count is honest. |
| `.claude/hooks/guardrails.selftest.mjs:283` | `REAL_REPO` constant | The self-test is rooted in main too. |

Total: **2 live hard-codes with a behavioural effect, 1 by design, 1 test constant.** `tests/global-setup.js`
mentions the path in a comment only.

## Why it is HIGH rather than low

`guardrails.mjs` is the mechanical half of "`multi-agent-review` before the COMMIT for ownership/RLS work",
and this project's own memory names the failure mode: *a safeguard can report success while doing nothing*.
Worktrees are now routine here (three exist), so the gate is skipped for a growing share of commits.

It also bit in practice, in the other direction: yesterday I committed a ledger row that the
`closing-conditions` lint rejects, and never re-ran `os-lint` from the right place — so master carries a RED
I introduced and did not see.

## Progress

- **guardrails.mjs, fixed 2026-10-01.** A lazy `treeOf()` finds the working tree a `git commit` is headed for (an explicit
  `cd` wins, then the event cwd), by walking UP to the nearest `.git` and following a worktree's `gitdir` / `commondir`
  pointers — pure filesystem, no git spawns — and accepts it only if it shares the main repo's common dir; anything else
  fails OPEN. Every git command about the commit runs there, and rules 1c, 3 and 5 gained the CoachApp gate they lacked.
  Test: `scripts/check-guardrails-worktree.selftest.mjs`, real `git worktree add` repos (one outside the main folder, one
  nested inside it, a subdirectory, a non-repo, an unrelated repo), each case labelled "unseen" or "not refused".
- **os-lint.mjs, fixed 2026-10-01.** `REPO` is resolved from the cwd under the same common-dir test (`MAIN_REPO` is the
  fallback, `OSLINT_REPO` / `OSLINT_MAIN_REPO` override). A worktree lint is read-only for the shared size baselines, which
  ratchet DOWN: an older branch measuring smaller docs would otherwise re-pin the one shared ceiling below what main
  measures. The wiring check accepts main's registration of a hook name as covering the worktree's copy (a NEW unregistered
  script is still reported — positive control). Test: `.claude/hooks/os-lint.selftest.mjs`, real worktrees. `--self-test`
  pins its children to main so a detached run launched from a worktree stays deterministic.
- **Wiring.** `checks.sh` rule 9r runs the three self-tests in FULL mode (release.mjs sets CI=true) when `~/.claude/state`
  exists. Until now nothing invoked `guardrails.selftest.mjs` at all. The real-git worktree matrix lives in `scripts/`, not
  `.claude/hooks/`, because os-lint runs every self-test in hooks/ at EVERY session start: in hooks/ it took that file from
  14 s to 30 s and every session paid for it.
- **Lesson (the near-miss).** My first "real run" of the fixed os-lint grepped five check names and called it good. The
  full red list differed from the session-start list by two checks I had caused. When a change alters what a checker
  READS, compare its whole output before and after, not the rows you were thinking about.
- **Not fixed here:** `settings.json` still points every hook at main's copy (by design), so the fix is live for real
  sessions only after this branch reaches master.

## Suggested direction

Derive the repo from the event's `cwd` (`git rev-parse --show-toplevel`) in both hooks, as the preview
server now derives its root from `(Get-Location)`. Keep `GUARDRAILS_REPO` / `OSLINT_BUGS` as explicit
overrides. This changes the commit guard itself, which is why it is a row for Jake to decide on rather than
a patch I slipped into a feature branch.
