---
id: 2026-09-26-os-lint-background-self-test-opens-a-visible-console-window
status: unverified-accepted
priority: medium
reported: 2026-09-26
status_detail: "UNVERIFIED-ACCEPTED by Jake 2026-09-27 (batch reply 'go ahead' to: accept rows whose fix is still in the code, and the general older rows; keep security/data-safety rows for an audit). No red->green test proves this one; no longer tracked."
---

# os-lint's background self-test opens a visible black console window

**Plain English.** At the start of a session (and again every 45+ minutes while it is overdue), os-lint starts its own
10-minute self-test in the background. On Windows that background process was given a real window — a black
`node.exe` console that opened over the editor and stayed open for the ten minutes. It looked like *Claude* was opening
terminal tabs; it was the start-up hook.

**Why it kept coming back.** The self-test stamps its "ran OK" marker only on a CLEAN run, and it prints nothing until it
finishes. So while the marker was more than 7 days old, every new session (past a 45-minute cooldown) launched another one,
each with its own window. The marker was 11 days old on 2026-09-26.

**Evidence.** `.claude/hooks/os-lint.mjs` (`maybeLaunchSelfTest`) was the only detached process in the repo or in
`~/.claude/hooks` (the other `spawn`, in `scripts/sql-verify/run-mutations.mjs`, is attached with piped output and cannot
open a window). The window's title matched, and it appeared at the moment the resume hook printed "already launched … probably
still running". **Not confirmed:** the running process's command line was not inspected.

**The fix.** `windowsHide: true` on that one `spawn` call — Node's documented option for exactly this. The self-test still
runs (its output already goes to `~/.claude/state/last-self-test.log`); it just has no console. The alternative,
`OSLINT_NO_SELFTEST_LAUNCH=1`, would have switched off the mechanism that proves every other check can fail.

**What to expect.** A self-test is running right now with a visible window. Leave it and it finishes by itself (about 10
minutes) and refreshes the marker, so nothing relaunches for 7 days. Close it and it simply relaunches — hidden — once the
45-minute cooldown passes. Either way no new window should appear; if one does, this row stays open.

**Unverified:** the next launch has not been observed yet.
