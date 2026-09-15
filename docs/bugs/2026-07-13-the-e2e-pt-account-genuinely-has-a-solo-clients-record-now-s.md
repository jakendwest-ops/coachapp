---
id: 2026-07-13-the-e2e-pt-account-genuinely-has-a-solo-clients-record-now-s
status: confirmed
priority: high
reported: 2026-07-13
reported_detail: confirmed 2026-08-01
---

# the E2E PT account genuinely has a solo clients record now; solo-account.spec.js runs for real

✅ **CONFIRMED RESOLVED 2026-08-01 — the E2E PT account genuinely has a solo `clients` record now; `solo-account.spec.js` runs for real.** Ran the file directly: **14 passed, 1 skipped** (not "every test skips" as this row originally claimed) — `soloAvailable` (the file's own guard) is true. Solo mode has real CI coverage today. **But running it for real surfaced a genuinely new, separate issue**: one test failed on a strict-mode Playwright violation (`locator('text=[E2E] PT-Only Lift')` resolved to 2 elements, not 1) — looks like stale duplicate `[E2E]`-tagged debris from an old run that never got the chance to clean up while this file was silently skipping. **New row added below for that** — not fixed tonight, out of scope for this pass. — (orig) **Solo mode is effectively untested in CI.**
