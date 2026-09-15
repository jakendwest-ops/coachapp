---
id: 2026-08-22-checks-sh-pii-rule-is-blind-to-any-line-naming-clientid
status: confirmed
priority: medium
reported: 2026-08-22
closed_by: "clause (b) 2026-08-22. Rule 9a moved out of inline grep into scripts/check-pii-logs.mjs, matching PER KEY inside each individual log call rather than per line — the same move, for the same reason, as rule 9d/check-escaping.mjs. RED-BEFORE: planted weight_kg alongside clientId in a real log call in app-clients.js (the exact shape the old rule exempted) and checks.sh FAILED with the finding; restored, gate green. Also proven on an 8-case probe: catches full_name/email/weight_kg beside an id and a whole-row spread, stays silent on clientId/date/goalId/exercise_name. Clean across all 9 modules, so it does not cry wolf. Full checks.sh green."
status_detail: "Found by multi-agent-review Agent A 2026-08-22 and reproduced independently. The PII gate cannot fail on the single commonest log shape in this codebase. No PII has actually shipped — the gap is that the gate guaranteeing that is decorative for this shape."
---

# `checks.sh` rule 9a exempts the whole LINE, so any log naming `clientId` can carry PII undetected

`scripts/checks.sh:125`:

```sh
PII_LOGS=$(grep -n "log\.\(info\|ok\|warn\|error\)(" $FILES \
  | grep -iE "\{ email|\bemail\b.*\}|full_name|, row\b|weight_kg.*weight\b|body_fat|{ name: [a-z]" \
  | grep -v "clientId\|userId\|date\|//")
```

The final `grep -v` is applied to the **entire matched line**, not to the PII match. So a log call that
carries an id *alongside* PII is silently exempted.

## Reproduced, not asserted

```
$ echo 'log.error("x","y",{ full_name: n })' | <rule 9a pipeline>
  log.error("x","y",{ full_name: n })          <- positive control FIRES

$ echo 'log.error("saveClientWeight","failed",{ clientId, full_name: n })' | <rule 9a pipeline>
  (no output)                                   <- MISSED
```

## Why this matters more than it looks

`log.<level>(fn, msg, { clientId })` is the single commonest logging shape in this codebase, and the
~25 ownership guards added 2026-08-21/22 all use it. **The gate is structurally blind to precisely the
shape the newest code is written in.**

CRITICAL.md tracks UK GDPR special-category data (weights, body fat, health values). The exemption
exists for a good reason — ids and dates are explicitly allowed — but it was implemented as a
line-level filter rather than a match-level one.

## Not currently exploited

Every new `log.*` call in the 2026-08-21/22 diff was read individually: `{ goalId }`,
`{ milestoneId }`, `{ clientId }`, `{ templateId }` only. No name, email, weight or health value.
So nothing has shipped — this is a dead alarm, not an active leak.

## Fix direction

Filter at the match, not the line: extract the offending *fragment* and test that against the
allowlist, the way `check-escaping.mjs` was rewritten to do per-match rather than per-line (that exact
lesson, 2026-08-19: an inline grep that reasons per-line reports clean while real sinks sit in the
tree). This rule has the identical defect one file over.

**Closes when:** the rule flags `log.error(fn, msg, { clientId, full_name })` and still passes
`log.error(fn, msg, { clientId })`, both proven — and the whole `js/` tree still reports clean.
