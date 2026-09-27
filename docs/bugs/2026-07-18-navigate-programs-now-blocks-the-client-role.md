---
id: 2026-07-18-navigate-programs-now-blocks-the-client-role
status: closed
priority: low
reported: 2026-07-18
status_detail: "CLOSED 2026-09-27 via closure rule (b): the row records a red->green test; it is tests/ledger-fixes-2026-08-01.spec.js 'a client calling navigate('programs') directly does not reach the builder', green in the v2026.09.8 full-suite run."
---

# navigate('programs') now blocks the client role

✅ **FIXED + LIVE (LOCAL) 2026-08-01 — `navigate('programs')` now blocks the `client` role.** Checks `currentProfile?.role === 'client'` and falls back to "Page not found" before ever calling `renderPrograms` — solo and coach both still reach it exactly as before (`'programs'` is in both `soloPages` and `coachPages`, only absent from `clientPages`). Defense-in-depth only, as originally scoped — RLS already returned zero rows here, so this closes the builder-chrome-still-renders gap, not a data leak. Red→green test.
