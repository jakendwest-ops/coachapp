---
id: 2026-08-25-os-lint-self-test-takes-ten-minutes
status: open
priority: low
reported: 2026-08-25
---

# os-lint --self-test takes ~10 minutes and prints nothing until it finishes

Measured 2026-08-25.

- One `node hooks/os-lint.mjs --report` run: **15.8s** (timed).
- `--self-test` runs **38 specs**, each an `execFileSync` of a fresh `--report` subprocess.
- 38 x 15.8s = **~600s**. Confirmed empirically: it blew past a 240s tool timeout, sat at 0 bytes of
  output for over 4 minutes, and had to be backgrounded. It completes and returns exit 0.

**This is an ergonomics defect, not an integrity one.** The run is honest — 38/38 BITES, 0 DECORATIVE,
verified twice today (once before and once after `checkContextBudget`/`checkRitualBudget` were
rewired). Nothing is dead. But `hello-claude` nags to run this weekly, and a ten-minute check that
shows no progress until the end is the one most likely to be skipped — while being the check that
proves every *other* check can fail. OS v3's own SWOT names "a bad check is more dangerous than a
missing one" as where v3's risk lives; an unrun check is the same shape.

**Not fixed deliberately.** Making it fast means batching the 38 specs in-process instead of spawning
38 subprocesses, which changes how each check's env-override isolation works — the exact mechanism
that makes the self-test trustworthy. That is a real change to verification code and wants its own
session, not a tail-end edit. Streaming per-spec progress to stdout is the cheap partial fix.

**Closing evidence:** a self-test run that completes in a time someone will actually sit through, with
38/38 still biting.
