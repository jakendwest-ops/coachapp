---
id: 2026-09-26-ownworkout-teardown-can-leave-a-template-behind-and-fail-the-hygiene-test-for-two-hours
status: open
priority: medium
reported: 2026-09-26
status_detail: "Found during the v2026.09.7 release gate: a full-suite run failed on tests/own-workout-fixture-2026-08-11.spec.js:61 ('leaves no [E2E] own templates or logs behind') twice (attempt + retry), 4 survivors. Root cause of the FAILURE is established; the root cause of the LEAKS is only partly established — see 'What is not known'. Nothing here is a product bug: no shipped code is involved."
---

# A leaked `[E2E] own` template fails an unrelated later full run, for up to two hours

## What happened

Release gate run 2 (started 2026-09-26 13:26Z, 826 tests) failed `own-workout-fixture-2026-08-11.spec.js:61`
on both attempts. Four `[E2E] own <epoch-ms>` templates existed in the E2E coach account. The epoch in each
name dates its creation exactly:

| survivor | created (UTC) | age at the run's start-of-run reap (13:26:31Z) |
|---|---|---|
| `[E2E] own 1790425798257-…` | 12:29:58 | 56 min |
| `[E2E] own 1790426778014-…` | 12:46:18 | 40 min |
| `[E2E] own 1790427596536-…` | 12:59:56 | 26 min |
| `[E2E] own 1790427598276-…` | 12:59:58 | 26 min |

All four pre-date the run. The run itself created none of them.

## Why the failure happens (established)

Two things with deliberately different scopes:

- `scripts/reap-e2e-debris.mjs` runs at the start of a suite with a **2-hour age cutoff** ("A row this run
  just created is never in scope" — its own header). At 13:26Z the four were 26–56 minutes old, so its
  `[reap] No debris found.` was correct.
- The hygiene test asserts **no** `[E2E] own %` row exists at all, with no age filter, ~22 minutes into the
  run (test #389).

So any leak from the previous two hours fails that test, whatever code is being tested. It cleared itself:
the next run, started 19:57 local (4h+ later), printed `[reap] 12 row(s) reaped.`

The release diff does not touch `tests/fixtures.js`, `tests/helpers.js`, `tests/global-setup.js` or the
hygiene spec (checked with `git diff --stat v2026.09.6..HEAD` on those paths — the only reaper change in
the range is +4 lines adding `app_errors`).

## How a template gets left behind (one path established)

`tests/fixtures.js:161-162` — the `ownWorkout` teardown logs in as the coach in a fresh context to delete what
the test created, and on any error only does `console.warn('ownWorkout teardown failed:', e.message)`. Run 2
printed exactly that once (between `runner.spec.js` tests 652 and 653):

    ownWorkout teardown failed: page.waitForSelector: Timeout 10000ms exceeded.
      - waiting for locator('#auth-screen') to be visible
        23 × locator resolved to hidden <div id="auth-screen" class="auth-screen">…</div>

A 10-second login wait timed out, the warning was printed, and the template it was about to delete stayed.
The following test took 30.9s against ~6s for its neighbours.

## What is not known

- **How these four specific rows leaked.** Only one `teardown failed` line exists in run 2's output and it
  is from test 652, after the hygiene test ran — it cannot be the source of these four. The earlier full
  run (`full3`, 12:01–12:46Z) printed no such line at all, yet two survivors fall inside its window. The
  12:59Z pair fall inside GitHub CI's run for `79feb38` (12:55:41–13:04:42Z), whose logs were not read.
  Other Claude sessions were also active against the same account at times, so a third-party run is
  possible. **INFERRED, not shown:** that the swallowed-teardown path above produced them.
- Whether `#auth-screen` staying hidden after a fresh-context login is a fixture race or an app behaviour.
  The identical wait (`tests/helpers.js:14`, `#auth-screen` resolved to hidden 23×) also failed the first
  attempt of `builder-happy-path-2026-08-22.spec.js:157` in the release gate's third run, passing on retry —
  so the login helper's own 10s wait is intermittently failing, not only inside the fixture's teardown.

## Suggested direction (not applied)

Make the teardown failure loud instead of a `console.warn` — it currently turns a cleanup failure into a
failure of a different, later, unrelated test. That would put the red where the cause is.

**Closes when** the source of a leak is identified and shown, or the teardown fails at its own site.
