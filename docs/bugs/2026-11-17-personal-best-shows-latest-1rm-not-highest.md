---
id: 2026-11-17-personal-best-shows-latest-1rm-not-highest
status: closed
priority: medium
reported: 2026-11-17
status_detail: "CLOSED 2026-11-17 via closure rule (b): the 'a lower re-test' case in tests/personal-bests-2026-10-13.spec.js failed on the old code (the list showed 140 kg as the best) and passes after the fix (_pbBestOf, js/app-progress.js). Found by the Progress section audit; fix approved by Jake 2026-11-17."
---

# "Personal best" shows the latest saved 1RM, not the highest

The 1RM list (`renderClient1RMs`, `js/app-progress.js:103`) and a lift's page (`renderLiftPage`, `:216`) take the newest `client_1rms` row as the "Personal best". Save 160 kg, then re-test lower at 140 kg after an injury: both screens say "Personal best 140 kg", and the list shows a "−20 kg" pill on the best.

The newest row is still the right number for % of 1RM sets (a deliberate lower re-test should drive training weights); it is the LABEL that is wrong.

**Closes when:** a spec with 150, 160 then 140 shows 160 as the best and 140 as the latest on both screens, red on the current code and green after the fix.
