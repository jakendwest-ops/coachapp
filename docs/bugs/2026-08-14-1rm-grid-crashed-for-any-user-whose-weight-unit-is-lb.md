---
id: 2026-08-14-1rm-grid-crashed-for-any-user-whose-weight-unit-is-lb
status: confirmed
closed_by: "clause (b) — screenshot-feedback-2026-08-14.spec.js ran GREEN 2026-08-20 in a serialized 192-test run; red-before is recorded in this file's body. Closed on test evidence, NOT on a Jake confirmation."
priority: high
reported: 2026-08-14
---

# The new 1RM grid crashed the whole Progress page in lb — caught by review, never shipped

Introduced by my own 2026-08-14 work and caught by the pre-push multi-agent review before it went live.
Recorded because the near-miss is the lesson, exactly like
[[2026-08-12-escapeattr-in-a-plain-attribute-corrupts-and-then-saves]].

`weightToPref` (`js/app-core.js:85`) returns a **number** in kg but a **string** in lb — its lb branch exits
through `_stripTrailingZero`, which is `String(v).replace(...)`. I wrote:

    String(parseFloat(weightToPref(parseFloat(latest.one_rm_kg)).toFixed(1)))

`.toFixed` does not exist on a string, so this threw `TypeError` inside the row `.map()` of an
`el.innerHTML` template literal — killing the entire grid, not one row.

Trigger: **weight unit = lb AND at least one recorded 1RM.** On Personal, `renderProgress` awaits it, so the
rejection reached `_catch('progress')` and replaced ALL of `main-content` with "Something went wrong" —
tab bar included — and Retry re-entered the same broken tab. On the coach side it hung on "Loading 1RMs…"
forever. A brand-new lb account got the worst version: the empty grid renders fine, the save succeeds and
toasts "1 1RM saved", then the refresh throws — success message, dead page.

**Why no test caught it: the ENTIRE suite runs at the kg default (`js/app-core.js:72`) and nothing ever
flips the unit.** `js/app-progress.js` was the only unguarded `.toFixed()` on a `weightToPref()` return in
the repo — `fmtWeight` (`js/app-core.js:110`) does `parseFloat(v).toFixed(decimals)`, parse FIRST, and is
the correctly-ordered precedent I failed to follow.

**✅ FIXED + LIVE `d337418` (2026-08-14).** Now pinned by a **kg/lb matrix test** in
`tests/screenshot-feedback-2026-08-14.spec.js`, verified red-before: kg passes, lb fails with the exact
`weightToPref(...).toFixed is not a function`.

**Standing lesson:** a unit/locale preference is a test dimension, not a display detail. Any new surface
that renders a weight should be exercised in both units.

**Closes when:** Jake sets Settings → weight to **lb**, opens 1RMs with a value recorded, and the page
renders.
