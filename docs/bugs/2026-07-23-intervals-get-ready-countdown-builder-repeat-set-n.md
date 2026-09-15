---
id: 2026-07-23-intervals-get-ready-countdown-builder-repeat-set-n
status: fixed-awaiting-jake
priority: medium
reported: 2026-07-23
status_detail: "fixed — awaiting Jake"
---

# intervals: get-ready countdown + builder repeat-set×N

✅ **SHIPPED LIVE 2026-07-24 (7aeb3ae) — intervals: get-ready countdown + builder repeat-set×N.** Reading the code first showed the work→rest→work loop Jake described already existed (`startIntervalTimer`/`startRestTimer` auto-chain via `_afterRest`, both already speak the last 5 seconds aloud) — the one real gap was a 5-second spoken "5,4,3,2,1,Go!" lead-in before the first work interval, now built (`startRunnerCountIn`), plus "Round N of M" labeling and a one-click `repeatTemplateSet` on the builder side (Jake's explicit ask: "shouldn't have to click add>copy 10 times"). Review caught a real bug in the fix itself: the new count-in timer wasn't wired into the same log/teardown guards the existing rest timer had — fixed same push. Needs your eyes live. — (orig) **SCOPED 2026-07-23** — decisions locked: per-round results ARE recorded; rest between rounds is timed, not recorded; all rounds share one target with individual rounds editable afterwards.
