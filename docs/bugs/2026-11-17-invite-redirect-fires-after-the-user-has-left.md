---
id: 2026-11-17-invite-redirect-fires-after-the-user-has-left
status: open
priority: low
reported: 2026-11-17
status_detail: "Not fixed."
---

# After sending an invite, the app jumps back to the client page even if you have left

`js/app-progress.js:1051`: `setTimeout(() => openClient(clientId), 1200)` with no check that the user is still on that screen. Tap Dashboard within 1.2 s of sending and you are taken back.

Found by the full-file multi-agent-review of app-progress, app-workouts and app-dashboard, 2026-11-17; the cited lines were re-read by the verifier.

**Closes when:** the timeout checks the current page, with a spec that navigates away within 1 s, red on the current code.
