---
id: 2026-07-13-critical-live-crash-a-phase-with-zero-sessions-kills-the-coa
status: confirmed
priority: critical
reported: 2026-07-13
closed_by: "clause (b) ESTABLISHED 2026-08-22, 40 days after the fix shipped. The row recorded no red-before, so passing was not evidence. Neutered the zero-guard at app-programs.js:140 (renderClientPrograms - the path the test actually renders) and regression-2026-07-13.spec.js 'a phase with zero sessions renders an empty-state, not a crash' FAILED; restored, passes. NOTE: my first attempt neutered the SIBLING copy at app-workouts.js:747, the test still passed, and I nearly reported the test as decorative - wrong code path, not a dead test. Closed on test evidence, NOT on a Jake confirmation."
status_detail: "fixed — awaiting Jake"
---

# CRITICAL — LIVE CRASH: a phase with zero sessions kills the coach entire client Programs tab. app-programs.js

🔴 **CRITICAL — LIVE CRASH: a phase with zero sessions kills the coach entire client Programs tab.** `app-programs.js:129` does `renderDays(weekMap[weekNums[0]])` with **no `!weekNums.length` guard** → `sessions.forEach` on undefined → TypeError thrown *while building the template literal*, so the whole `el.innerHTML` assignment never lands: **every phase of every assigned program for that client vanishes; the tab is stuck on Loading…**. Repro is the NORMAL build order: add a 3rd phase, assign the program, open Client → Programs before populating it. **This exact bug was fixed on 2026-07-10 (b79c152) in the verbatim twin `app-workouts.js:352`, which HAS the guard.** The fix never got ported. 5th instance of fix-the-class-not-the-instance.
