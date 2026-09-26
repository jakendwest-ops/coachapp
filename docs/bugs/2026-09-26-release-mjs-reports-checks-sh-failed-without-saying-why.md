---
id: 2026-09-26-release-mjs-reports-checks-sh-failed-without-saying-why
status: open
priority: low
reported: 2026-09-26
status_detail: "Found during the v2026.09.7 release gate. scripts/release.mjs:217 catches every checks.sh failure with a bare `catch {}` and prints 'the static gate does not pass', so a launcher problem is indistinguishable from a real static-check failure. The same false message appeared in two consecutive gate runs before the cause was found."
---

# `release.mjs` says "checks.sh failed" for any reason, including that it could not start

`scripts/release.mjs:215-219`:

```js
try {
  execSync('sh scripts/checks.sh', { stdio: 'pipe', env: { ...process.env, CI: 'true' } })
  pass('checks.sh green …')
} catch {
  fail('checks.sh failed', 'the static gate does not pass.', 'sh scripts/checks.sh')
}
```

The error is discarded and `stdio: 'pipe'` hides checks.sh's own output. On 2026-09-26 the gate printed
"checks.sh failed" twice while `sh scripts/checks.sh` run by hand passed both times. The actual cause,
found only by replaying the same `execSync` from a PowerShell-launched `node`:

    'sh' is not recognized as an internal or external command

A process launched from PowerShell has no `sh` on `PATH` (Git for Windows keeps it in `C:\Program Files\Git\bin`).
The gate's "how to fix" line — `sh scripts/checks.sh` — sends the reader to a command that passes.

## Why it matters

The message is a false statement about the code ("the static gate does not pass") for what was a missing
executable. Because the failure is reported and the script then carries on into a ~45-minute full suite,
the wrong conclusion is expensive.

## Suggested direction (not applied — it is the release gate itself)

Print `e.code`, `e.status` and the last lines of `e.stderr`/`e.stdout` in the failure branch, and say "could not
run" when `e.code === 'ENOENT'` or the shell reports the command missing. Fail fast before the full suite when
gate 6 failed and the cause is not a test result.

**Closes when** a `checks.sh` that cannot start reports why, shown by launching the gate with `sh` off `PATH`.
