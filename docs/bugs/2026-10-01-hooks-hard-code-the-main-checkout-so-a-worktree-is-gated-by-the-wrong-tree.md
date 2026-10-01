---
id: 2026-10-01-hooks-hard-code-the-main-checkout-so-a-worktree-is-gated-by-the-wrong-tree
status: open
priority: high
reported: 2026-10-01
status_detail: "Found by Claude while linting from a git worktree on 2026-10-01, not reported by Jake. VERIFIED BY READING, NOT BY RUNNING: I did not fire a worktree commit with an ownership diff staged to watch the guard fail to refuse it. What I did check: guardrails.mjs runs git diff and git diff --cached with cwd REPO (lines 247, 323, 454) where REPO is a constant naming the main checkout, and os-lint.mjs reads REPO/docs/bugs. The substantive protection DID run on the RPE work (three reviewers, one of whom traced tenancy explicitly); the mechanical gate did not see it."
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

## Suggested direction

Derive the repo from the event's `cwd` (`git rev-parse --show-toplevel`) in both hooks, as the preview
server now derives its root from `(Get-Location)`. Keep `GUARDRAILS_REPO` / `OSLINT_BUGS` as explicit
overrides. This changes the commit guard itself, which is why it is a row for Jake to decide on rather than
a patch I slipped into a feature branch.
