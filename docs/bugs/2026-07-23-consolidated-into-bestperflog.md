---
id: 2026-07-23-consolidated-into-bestperflog
status: fixed-awaiting-jake
priority: high
reported: 2026-07-23
status_detail: "fixed — awaiting Jake"
---

# consolidated into _bestPerfLog

✅ **FIXED + LIVE 2026-07-24 (b637e09)** — consolidated into `_bestPerfLog`. **Review caught a real bug in the fix itself, fixed same push**: `PERF_CATEGORIES` lets the same exercise be logged in either unit of a pair (kg/lbs, min/sec) as a free per-entry choice — comparing raw numbers meant 220lbs (~99.8kg) beat 100kg purely on digit size, and 20min beat 1180sec (=19:40, actually faster) the same way. Fixed with a `_PERF_UNIT_BASE` conversion table before every comparison. Also fixed a second, subtler bug the review found: `renderProgressPBs` cached `unit` from the newest record but rendered it beside `best.value` from a *different* record — could show "100 lbs" when neither actual entry was ever that. Both red→green verified against real DB fixtures. — **"Best" personal best actually shows MOST RECENT — in two places.** app-progress.js:333 (`records[0]` off a date-desc order) and :1628 (first row of the same order), both rendered in the accent colour beside a gold **PB** badge. Deadlift 180kg in Jan then 160kg in Feb displays **160 kg · PB**. Two copies of the same wrong reduction — fixing one leaves the other.
