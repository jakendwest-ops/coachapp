---
id: 2026-10-12-os-lint-self-test-opens-dozens-of-console-windows-again
status: fixed-awaiting-jake
priority: high
reported: 2026-10-12
status_detail: "FIXED 2026-10-12 in the working tree (commit 8a785f6, local until a review has seen it; the hook runs from the working tree, so it is live now). Verified by process inspection: the self-test, launched the way the hook does, ran 20 minutes with no VISIBLE console window (before: windows from the first --report child, within 2 minutes; the incident, not a same-method run on the old code). A guard in os-lint.selftest.mjs refuses a child_process call without windowsHide (mutation-checked). Closes when Jake sees no windows over the next self-test, due about 2026-10-19."
---

# The os-lint weekly self-test opened dozens of console windows over Jake's screen, again

## Jake's report (verbatim, 2026-10-12)

> whatever keeps opening powershell needs to close all of those windows immediately. Yes this is you opening them because it is not me

Attached: a Windows Terminal window over the desktop, its tab titled `C:\Program Files\nodejs\node.exe`, at 17:29.

## What was found (process inspection, 17:30)

A chain `os-lint.mjs --self-test` (start 17:27, parent gone: the SessionStart hook's detached launch) > `os-lint.mjs --report` (17:29) > `os-lint.selftest.mjs` (17:30) > `os-lint.mjs --report`, each level in its own console, each console a Windows Terminal window. The self-test had not run since 2026-10-05, so the SessionStart hook launched it when the session resumed.

**Cause:** `maybeLaunchSelfTest` starts the self-test `detached` with `windowsHide: true` (the 2026-09-26 fix, [row](2026-09-26-os-lint-background-self-test-opens-a-visible-console-window.md)). A detached process has NO console, so every console program IT starts (the self-test's ~40 `--report` runs, `git`) is given a new visible one. The 2026-09-26 fix hid the launcher and not its children.

## Fix

`windowsHide: true` on every `child_process` call in `os-lint.mjs` on the self-test's path (lines 49, 1671, 1761, 2116 and 2253; 314 and 2354 already had it). Their descendants inherit the hidden console. `os-lint.selftest.mjs` now reads `os-lint.mjs` and fails if any such call lacks the flag (7 calls found; a flag that is only in a comment does not count), if os-lint.mjs imports anything from child_process the scan does not know (an alias, `exec`, `fork`), or if another hook starts a detached process. Each of those four breakages was shown to turn it red.

## What is not fixed here

Claude Code itself opens a console for each hook invocation on this machine (see CLAUDE.md, standing behaviour 7); that is outside this repo.

## What would close it

**Closes when** Jake sees no console windows over the next weekly self-test (the marker was stamped 2026-10-12, so about 2026-10-19) and tells me so.
