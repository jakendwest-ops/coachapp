---
id: 2026-07-29-redesigned-per-jake-s-explicit-call-offered-timer-keeps-runn
status: fixed-awaiting-jake
priority: high
reported: 2026-07-29
status_detail: "fixed — awaiting Jake"
---

# redesigned per Jake's explicit call (offered "timer keeps running in background" vs

✅ **FIXED + LIVE 2026-07-29 (`eb9ec3f`)** — redesigned per Jake's explicit call (offered "timer keeps running in background" vs. "new read-only preview view"; he picked the former). New `_runner._restForExIdx`/`_restPendingFire` fields decouple "a rest is counting down" (persists across navigation, beeps/voice cues keep firing) from "which exercise's `_afterRest` may fire" (still only the owning exercise, preserving the exact corruption-guard `runnerJumpTo`/`runnerGoBack` already had). New persistent "Resting — 0:45" chip in the runner header; tap it or navigate back to restore the full countdown overlay. 4 existing reads that assumed "a rest is running" meant "for the exercise on screen" were given an ownership gate (`renderStrengthTable`'s inline bar, the wizard's "resting" placeholder, `logRunnerSet`'s guard, `_doneIntervalPhase`'s guard). Multi-agent review then found "⇄ Swap exercise"/"+ Add exercise" aren't gated off during a rest and bypassed this entirely (orphaning the floating overlay, `skipRestTimer()` had no ownership check) — fixed both paths + added a defensive check to `skipRestTimer()` itself. The pre-existing regression test guarding the corruption class this redesign had to not reopen (`tests/intervals-redesign-2026-07-25.spec.js:411`) was re-run and confirmed still green. 5 new tests. — **During a workout when the timer is counting down on the runner, viewing another exercise stops the timer.** Jake, live: "This either needs to be fixed as a bug or a re-design."
