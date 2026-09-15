---
id: 2026-08-12-favicon-404-red-error-on-every-page-load
status: fixed-awaiting-jake
priority: low
reported: 2026-08-12
---

# A red console error on every page load (missing favicon)

**Jake reported it from live**, sharing a DevTools screenshot with a persistent red `1`:
`Failed to load resource: the server responded with a status of 404 () — favicon.ico:1`.

Harmless in itself — every browser requests a favicon and the site declared none.

**Worth fixing for the same reason the new dashboard banner only renders on failure: a console that
is PERMANENTLY red trains you to ignore console errors, so a real one gets scrolled past.** Jake had
been reading that console all afternoon with a standing error in it.

Fixed `096895e` with an inline SVG data URI (the same rounded "C" mark as `.auth-logo`, in
`--accent`) — no `.ico` binary, so this stays a no-build-step static site.

**Deliberately not touched:** the 12 "Tracking Prevention blocked access to storage" warnings above
it in the same console. That theory was investigated and KILLED on 2026-08-07 (`localStorage`
returned "OK") and the ledger says do not re-test or re-propose it.

**Closes when:** Jake opens the console on live and sees no red.
