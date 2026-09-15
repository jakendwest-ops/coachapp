---
id: 2026-07-23-already-fixed-confirmed-2026-08-01
status: confirmed
priority: high
reported: 2026-07-23
reported_detail: confirmed 2026-08-01
status_detail: "confirmed (code-verified; shipped with an earlier session's rest-timer redesign)"
---

# ALREADY FIXED, CONFIRMED 2026-08-01

✅ **ALREADY FIXED, CONFIRMED 2026-08-01 — `showRunnerFinish` now does a full teardown.** Re-checked live: `app-runner.js:2008-2030`'s own header comment now explicitly documents this exact bug ("this used to clear only `_timerInterval`, leaving the rest timer... all still ticking") as fixed — it clears `_timerInterval`, `_restInterval`, `_restForExIdx`/`_restPendingFire`, calls `stopRunnerCountIn`/`stopIntervalTimer`/`stopStrengthSetTimer`/`_stopRunnerDraftSafetyNet`, and removes the floating rest-timer overlay DOM node. Must have shipped as part of the rest-timer redesign work (which touched this exact teardown) without this ledger row being ticked off. No code change needed tonight; ledger hygiene only. — (orig) **Finish-screen notes wiped mid-typing by the PR re-render.** app-runner.js:1723 does a full `innerHTML` rebuild...
