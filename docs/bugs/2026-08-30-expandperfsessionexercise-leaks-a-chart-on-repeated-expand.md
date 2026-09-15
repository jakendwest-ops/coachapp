---
id: 2026-08-30-expandperfsessionexercise-leaks-a-chart-on-repeated-expand
status: open
priority: low
reported: 2026-08-30
closed_by: ""
status_detail: "_expandPerfSessionExercise replaces its own container with a fresh <canvas> and renders into it, but nothing destroys the chart that was there before — _renderMetricChart's _activeCharts filter compares against the NEW element, so the old entry survives. Leaks one Chart per expand/collapse cycle. The fix is a container-scoped destroy, NOT _destroyManagedCharts(), which would kill sibling charts."
---

# `_expandPerfSessionExercise` leaks a chart on repeated expand/collapse

**js/app-progress.js**, found 2026-08-30 while building a class guard for the
`renderClientWeight` chart leak (`2026-08-17-...`).

    const container = document.getElementById(`perf-sess-${i}-ex-${ei}-chart`)
    ...
    container.innerHTML = '<canvas></canvas>'
    _renderMetricChart(canvas, { ... })

It replaces its own container's contents, **detaching whatever canvas was there**, then renders into a
new one. Both of `_renderMetricChart`'s guards miss: `Chart.getChart(el)` resolves the NEW canvas, and
`_activeCharts.filter(c => c.canvas !== el)` compares against the new element, so the previous entry
survives — a live Chart on a detached canvas with its listeners and animation loop running.

**Same mechanism as the `renderClientWeight` row, at a much smaller scale**: one leaked Chart per
expand → collapse → expand cycle on a single exercise row, rather than one per save.

## The obvious fix is the WRONG one

`_destroyManagedCharts()` destroys **every** managed chart on the page. Calling it here would take out
the sibling charts of other expanded exercises and the page-level chart — breaking working surfaces to
satisfy a rule. That is why this function is **exempt** from the class guard in
`tests/solo-dashboard-tiles-2026-08-30.spec.js` rather than "fixed" by it.

**The right fix is container-scoped:** destroy the chart bound to the canvas currently inside
`container` before replacing it — e.g. resolve `container.querySelector('canvas')`, call
`Chart.getChart(...)?.destroy()` on it, and drop it from `_activeCharts` — then rebuild. That needs a
small helper, since the same shape will recur anywhere a container is rebuilt around a chart.

**Closes when:** expanding and collapsing the same exercise row three times leaves exactly one live
chart (assert `_activeCharts.length`), RED before the fix — and the class guard's exemption for this
function is removed in the same commit, so the two cannot drift.
