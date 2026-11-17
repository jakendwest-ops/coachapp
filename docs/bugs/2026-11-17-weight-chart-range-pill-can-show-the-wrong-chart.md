---
id: 2026-11-17-weight-chart-range-pill-can-show-the-wrong-chart
status: open
priority: low
reported: 2026-11-17
status_detail: "Not fixed."
---

# The weight chart range pills can show the wrong chart, or none

`buildChart` (`js/app-progress.js:950`) returns early when a range holds fewer than 2 logs, after `weightChartRange` has already lit the new pill. With 2 logs in March: the default 3M pill is lit over an empty chart; All then 1M leaves the All chart on screen under the 1M pill.

Found by the full-file multi-agent-review of app-progress, app-workouts and app-dashboard, 2026-11-17; the cited lines were re-read by the verifier.

**Closes when:** Jake confirms, or a spec with two old weight logs shows an explicit empty state for a short range, red on the current code.
