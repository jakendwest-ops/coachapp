---
id: 2026-11-17-weight-7-day-average-is-a-7-entry-average
status: closed
priority: medium
reported: 2026-11-17
status_detail: "CLOSED 2026-11-17 for the Personal/client Bodyweight page and the Today card (Jake's approved scope; the coach tab is left, see below). Red: the old _rollingAvg on 8 weekly weigh-ins 90 to 86.5 kg ended at 88 kg, 1.5 kg behind; the new range spec failed on the old code (no range buttons). Green: _avgByDays (js/app-progress.js) returns each weekly weigh-in unchanged (tests-node/weight-average.test.mjs), and the weight-section spec's 3M / 1M / All cases pass."
---

# The weight chart's "7-day avg" is an average of the last 7 entries, not 7 days

`_rollingAvg(arr, 7)` (`js/app-progress.js`) averages the last 7 ENTRIES. The Bodyweight chart (`renderProgressWeight`) and the Today card's sparkline (`js/app-dashboard.js`) label it "7-day avg". For weekly weigh-ins that is a 7-week average: seen live on the e2e client at 480 px, the dashed line runs about 1 kg above the latest weigh-ins. The Bodyweight chart also has no range control and always draws the whole history.

**Left alone (coach-side, parked by Jake 2026-11-17):** the coach's client Weight tab (`renderClientWeight`) has the same 7-entry average, and its range pills have the open bug `2026-11-17-weight-chart-range-pill-can-show-the-wrong-chart`.

**Closes when:** a test with weekly weigh-ins shows the average equal to each weigh-in (one per 7-day window), red on the current code and green after the fix.
