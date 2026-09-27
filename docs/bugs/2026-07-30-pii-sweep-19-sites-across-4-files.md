---
id: 2026-07-30-pii-sweep-19-sites-across-4-files
status: closed
priority: low
reported: 2026-07-30
status_detail: "CLOSED 2026-09-27 via closure rule (b), proven that day by a neuter run: scripts/check-pii-logs.mjs (checks.sh rule 9a, every push) passed on current code; with an email added to saveEditClient's log call it FAILED ('PII-in-log finding(s)'); after a byte-identical restore it passed again."
---

# PII sweep, 19 sites across 4 files

✅ **FIXED 2026-07-30 (round 2) — PII sweep, 19 sites across 4 files.** Session names, exercise/template names, check-in values, and (found on a second pass, missed the first time) goal/event/milestone titles stripped from `log.*` calls — ids/dates/counts kept. The pre-push hook's PII regex only matches explicit `{ name: ... }` syntax, not ES6 shorthand `{ name }` — would not have caught any of these. Supersedes the two rows below, which were narrower framings of the same class found earlier the same night.
