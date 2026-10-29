---
id: 2026-10-29-log-error-context-object-silently-dropped
status: open
priority: low
reported: 2026-10-29
status_detail: "FOUND by the new type checker (tsc TS2554, 'Expected 0-3 arguments, but got 4'), not reported by Jake. log.error(tag, msg, data) takes three arguments; two calls in generatePhasePeriodization pass the error as `data` and a context object as a FOURTH argument, which is ignored. So the console line and the _reportProblem report lose { phaseId } and { clientId: assignment.client_id }. Nothing the user sees changes: the toast and the failure counting still work. Class count: exactly 2 sites (js/app-programs.js:2437 and :2528), both TS2554; no other log.* call has 4 arguments."
closing_conditions: "Both calls pass one data argument that carries the error and the ids (ids only, no PII), and app-programs.js's TS2554 errors are gone: `npm run typecheck` no longer reports app-programs.js(2437|2528) TS2554, and scripts/type-baseline.json is lowered by 2 in the same commit."
---

# log.error drops its context object at two call sites

## What happens

`log.error` is `(tag, msg, data) => …`. In `generatePhasePeriodization` (js/app-programs.js):

- `:2437` `log.error('generatePhasePeriodization', 'template clone failed', tErr, { phaseId })`
- `:2528` `log.error('generatePhasePeriodization', 'client propagation failed', cpwErr, { clientId: assignment.client_id })`

The fourth argument is never read, so when either failure happens, the log and the problem report say what failed but not which phase or client it failed for.

## Why it matters

It only affects diagnosis. These are the two failures in periodization's propagation path, which is where you would most want the ids when something goes wrong for a real client.

**Closes when:** both calls pass one data argument carrying the error and the ids, and the two TS2554 errors leave the type baseline (lowered by 2 in the same commit).
