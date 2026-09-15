---
id: 2026-09-04-deleted-probe-files-come-back-on-their-own
status: open
priority: medium
reported: 2026-09-04
status_detail: "OBSERVED TWICE, mechanism NOT proven. Seven probe files deleted and verified gone at ~08:25 were present again by 09:56 with their ORIGINAL mtimes. Git is ruled out (all seven were untracked, and git does not restore untracked files). OneDrive sync is the leading hypothesis and is still a hypothesis. Mitigated regardless: checks.sh rules 5b/5c now refuse a push while any of them is on disk."
---

# Deleted probe files reappear in the working tree

The refactor plan raised this on 2026-09-02 as *"most consistent explanation for their return after
`rm -f`: OneDrive sync restoring deleted files — a hypothesis, not a finding."* It happened again on
2026-09-04, this time with timestamps, so the observation is now sharper — though still not a proven
mechanism.

## What was observed

Seven throwaway files from testing the guardrails hook on 2026-09-03:

```
js/tmp-own.js   js/tmp-ownership-probe.js   js/tmp2.js
zz-b.js         zz-plain.js                 zz-tmp-ownership.js       migrate.sql
```

- **~08:25** — deleted with `rm -f`, and **verified gone on the filesystem** with `ls` (not with
  `git status`, which is blind to them — that is the whole point of rule 5b).
- **09:56** — all seven present again. Found by `checks.sh` rule 5b, not by noticing.
- Content byte-identical, and **mtimes were the ORIGINAL creation times** (17:06:37 the previous day),
  not the restore time.

Three files created and deleted during the rule-5b proof at 09:03 came back the same way.

## What this rules out

**Git cannot be the mechanism.** All of these were untracked — several also `.gitignore`d — and git
does not restore untracked files under any command. No checkout, reset, stash or clean would bring
them back.

**Preserved mtimes point at a file-level restore**, not at something re-creating them: a process
writing the file again would stamp the current time. That is consistent with OneDrive restoring from
its own copy, which is why that remains the leading hypothesis.

## What is NOT established

The mechanism. "OneDrive did it" is inference from mtime preservation plus the fact that this tree
lives under `C:\Users\jaken\OneDrive\`. Nothing has been read from a OneDrive log, and no controlled
test has yet reproduced it on demand.

A controlled attempt on 2026-09-04 deleted all ten known strays at **09:56:35** and re-checked at
10:00:55 and 10:10:19 — **still gone both times**. So it does not recur within ~15 minutes, and the
observed gap was up to ~90 minutes. The test needs a longer window before it says anything.

## Why it matters

1. Three of the seven were in **`js/`**, and every static checker built in Phase 1 (rules 9g, 9h, 9i,
   9j, near-dup, the tests-node harness) reads its file list from `index.html`'s script order. A `.js`
   in `js/` that index.html does not load is invisible to all of them — unparsed, unscanned, sitting
   in the directory where the real modules live.
2. `tests/zz-*.spec.js` files WILL be picked up by the next full Playwright run, and one that returned
   this way previously was a **destructive** one-off that reaps every `[E2E]` row on the test account.
3. It means **`rm -f` is not a durable cleanup in this tree**. Any instruction of the form "delete the
   probe file when done" is unreliable here by construction — which undercuts
   [[feedback_subagent_throwaway_file_cleanup]] as written.

## Mitigation already in place

`checks.sh` rules 5b and 5c (2026-09-04) refuse a push while any stray is on disk, and rule 5c
additionally asserts that every `.js` in `js/` is loaded by `index.html`. Both look at the
**filesystem**, never at `git status`. Proven able to fail: planting `js/tmp-probe.js`, `zz-probe.js`
and `tests/zz-fake.spec.js` produced two FAILs naming all three, exit 1, clean before and after.

That is a real defence regardless of the mechanism — whatever brings the files back, they cannot ride
a push out. It does not stop them being picked up by a **local** full-suite run between pushes.

**Closes when** either the mechanism is identified and stopped (a OneDrive exclusion for the repo, or
proof it was something else), or a deliberate long-window test shows deletions holding. A single
15-minute observation is not that test.
