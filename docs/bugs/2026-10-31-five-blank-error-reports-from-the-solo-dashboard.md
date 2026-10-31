---
id: 2026-10-31-five-blank-error-reports-from-the-solo-dashboard
status: open
priority: medium
reported: 2026-10-31
status_detail: "open — 4 rejections + 1 uncaught in app_errors, 04:27-04:31 UTC 2026-10-31, Jake's account, solo view, solo-dashboard, v2026.10.10 code (core53 dashboard41). No code, no frame, no detail, so the capture cannot say what failed. Not reproduced on desktop (solo dashboard loaded clean, nothing thrown)."
---

# Five error reports from the solo dashboard carry nothing to diagnose

Jake asked about the Settings error-reports card on 2026-10-31. Its newest five rows came from his own account between 04:27 and
04:31 UTC that morning, on the solo dashboard, running the v2026.10.10 code (`core53 … dashboard41`).

All five have `code`, `frame` and `detail` null. Reading the handlers in `js/app-core.js` (the `error` and `unhandledrejection`
listeners): a real `Error` would have given at least its name (e.g. `TypeError`) as the code, so these were **not** Error objects.
An `uncaught` with no error object is what a browser reports for a cross-origin script error ("Script error.") or a
ResizeObserver loop; a rejection with no code is a promise rejected with something other than an Error.

**Not known:** which device it was (likely Jake's phone, possibly the newly installed home-screen app), and whether he saw
anything go wrong.

**Investigated 2026-10-31:** the solo dashboard on desktop (localhost, signed in as Jake) loaded with no error or rejection.

**Closes when:** the cause is named (from Jake's account of what he was doing, or from a capture that records the rejected
value's type) and either fixed with a red-then-green test or shown harmless.
