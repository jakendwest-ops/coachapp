---
id: 2026-09-06-machine-load-makes-the-suite-fake-a-catastrophic-regression
status: open
priority: medium
reported: 2026-09-06
status_detail: "Established by controlled experiment on 2026-09-06, not inferred. Jake was asked whether it needed fixing; the answer was no — the gate caught it and refused to tag, so it cost nothing but diagnosis time. The obvious fix (raising timeouts) is actively WRONG and is argued against below. What WAS agreed: make the condition announce itself, so the next occurrence is diagnosed in one line instead of forty minutes."
---

# A loaded machine makes the full suite fake a 55-test regression

**Measured 2026-09-06, same commit, same database, twice:**

| run | conditions | result | wall clock |
|---|---|---|---|
| `044464e` via the release gate | agent working in parallel — reading files, editing code, running commands | **55 failed**, 563 passed, 2 flaky | 39.9m |
| `044464e`, nothing else running | machine idle | **0 failed**, 618 passed, 2 flaky | 31.4m |
| later, same commit, idle | machine idle | **0 failed**, 619 passed, 1 flaky | 28.6m |

The code was byte-identical across all three — verified with
`git diff --stat fbf61e4..044464e -- js/ css/ tests/ tests-node/ index.html playwright.config.js package.json`,
which is empty. Only `docs/releases/v2026.09.1.md` and `scripts/release.mjs` differed, and no test
touches either.

**Every failure was a TimeoutError**, not an assertion about a wrong value — e.g.
`page.waitForSelector: Timeout 8000ms exceeded, waiting for locator('h1:has-text("Programs")')`.
On a loaded machine the page simply had not painted within 8 seconds.

## Why this matters more than "tests are flaky"

This is a THIRD, distinct flakiness mechanism, on top of the two already known:

1. Debris accumulation — fixed 2026-09-05 (reap before, count after).
2. Two overlapping Playwright runs against one Supabase account — guarded in `global-setup.js`.
3. **This one:** a single run, clean database, no overlap — just a busy machine.

And it is the most misleading of the three, because **it looks exactly like a catastrophic
regression**: dozens of failures appearing at once, clustered in whole spec files. It cost ~40 minutes
to dismiss, and the only thing that dismissed it was proving the code had not changed.

## Do NOT "fix" this by raising the timeouts

Those 8-second waits are what would catch a genuine performance regression. Widening them buys quiet
at the cost of the signal: the page could get twice as slow for real users and the suite would still
pass. That trade is the wrong way round, and it is the same shape as every other decorative-gate bug
in this project.

## What was agreed instead

**Behavioural:** a full-suite run gets the machine to itself. The 55-failure run happened because the
agent was editing files, reading source and running commands throughout it.

**Mechanical:** make the condition self-identifying. The run already knows how long it took; recording
a normal duration and flagging a run that comes in far above it turns a forty-minute investigation
into a first-line note. Report-only — no teeth, per the rule about measuring a gate before arming it.

## Closing evidence

A run that is slow for load reasons announces itself as such, rather than being distinguishable from a
real regression only by diffing commits.

## Related

- `2026-08-14-test-gate-flakiness-returned-across-two-unrelated-files`
- `2026-08-26-e2e-specs-leave-client-rows-in-the-live-database` — mechanism 1, addressed 2026-09-05
