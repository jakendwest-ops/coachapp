---
id: 2026-10-30-app-cannot-be-installed-to-the-home-screen
status: fixed-awaiting-jake
priority: medium
reported: 2026-10-30
status_detail: "fixed-awaiting-jake — shipped in v2026.10.10 (2026-10-30; deploy run 41140924076 green, verify-live 18 files byte-identical incl. the manifest and all four icons). Closes on Jake's iPhone check below."
---

# The app cannot be added to a phone's home screen as an app

CoachApp is a website opened in Safari: there is no web app manifest and no home-screen icon (`index.html` carries only an inline
SVG favicon and a `theme-color`), so "Add to Home Screen" gives a bookmark-style tile that opens with the browser's bars, and
Android offers no install. Found reading the code 2026-10-30; it is the "installable app" item of the
[Solo product review](../superpowers/plans/2026-10-29-solo-product-review.md).

**Step 1 (this row):** a manifest (`standalone`, scoped to the app's own folder so it works under `/coachapp/`), PNG icons drawn
from the existing "C" mark, the iPhone tags. Nothing about how the app behaves changes.

**Deliberately not in it:** a service worker / offline mode. Almost everything in the app comes from the database, so offline
would open an empty shell; a service worker that caches files can keep a phone on old code after a release; and iPhones do not
support background sync. Revisit only if "the app will not open in the gym" happens in real use.

**Known iPhone behaviour (from how iOS treats home-screen apps, not checked on Jake's phone):** the installed app keeps its own
storage, separate from Safari, so it needs one sign-in of its own and an unsaved workout in one does not show in the other; a
password-reset link opens in Safari; sounds and the screen-awake lock should be re-checked full screen.

**Closes when:** Jake, on his iPhone with the released app: Add to Home Screen shows the CoachApp icon and name; opening it
from the home screen runs full screen with no Safari bars; signing in works; and one short workout, including a rest-timer
beep and the screen staying awake, behaves as it does in Safari. Until then the evidence is
`tests/installable-app-2026-10-30.spec.js` (green, red first).
