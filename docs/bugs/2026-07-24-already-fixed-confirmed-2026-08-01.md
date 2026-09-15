---
id: 2026-07-24-already-fixed-confirmed-2026-08-01
status: confirmed
priority: medium
reported: 2026-07-24
reported_detail: confirmed 2026-08-01
status_detail: "confirmed (code-verified; already covered by an earlier session's sweep)"
---

# ALREADY FIXED, CONFIRMED 2026-08-01

✅ **ALREADY FIXED, CONFIRMED 2026-08-01 — `savePerformanceLog` no longer logs exercise name/value/unit.** Re-checked live against current code while triaging an "easy wins" batch from the bug ledger: `app-progress.js:547`/`:562`'s `log.info` calls now pass only `{ clientId, category }` — no `name`/`value`/`unit`. Must have been swept up in the 2026-07-30 19-site PII sweep (same session that fixed this exact class elsewhere) without this specific row ever being ticked off. No code change needed tonight; ledger hygiene only. — (orig) **`savePerformanceLog` may log exercise name/value/unit — brushes the no-PII-in-logs rule.** Flagged as an aside by the 2026-07-24 multi-agent-review's security agent while checking the ledger-fix batch (unrelated to that diff, not fixed then).
