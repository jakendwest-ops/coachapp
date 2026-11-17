---
id: 2026-11-17-progress-chart-registry-keeps-destroyed-charts
status: open
priority: medium
reported: 2026-11-17
status_detail: "Not fixed. Memory leak on every repaint of the same chart canvas."
---

# Progress chart registry keeps every destroyed chart

`_renderMetricChart` (`js/app-progress.js:3273-3274`) destroys the old chart, then filters `_activeCharts` by `c.canvas !== el`. Chart.js sets `chart.canvas = null` on destroy, so the filter never matches and each weight-range click or lift-page repaint leaves a dead chart in the array. Its three siblings (`_perfFree` :3841, `_xsDestroyChart` :3687, `_pbDestroyCharts` :66) filter by the chart object and say why.

Found by the full-file multi-agent-review of app-progress, app-workouts and app-dashboard, 2026-11-17; the cited lines were re-read by the verifier.

**Closes when:** a node or Playwright test shows `_activeCharts` length stays flat across three repaints of `weight-chart`, failing on the current code first.
