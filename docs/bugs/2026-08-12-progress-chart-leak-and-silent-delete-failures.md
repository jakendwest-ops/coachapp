---
id: 2026-08-12-progress-chart-leak-and-silent-delete-failures
status: fixed-awaiting-jake
priority: medium
reported: 2026-08-12
status_detail: "found by the full-codebase architecture audit"
---

# app-progress.js: a Chart.js instance leak in renderProgressWeight, and 2 deletes that fail completely silently

Found by the 2026-08-12 full-codebase audit (`architecture-audit-2026-08-12.md`).

## Chart-instance leak

`renderProgressWeight`'s `pw-chart` (js/app-progress.js:1339) and `resting-hr-chart` (1351) are never guarded by a destroy-before-create check. This file has 3 other chart sites that all guard correctly — `renderClientWeight`'s `weight-chart` (`const existing = Chart.getChart('weight-chart'); if (existing) existing.destroy()`, 755-756) and the Performance sub-tab's `_perfExerciseCharts`/`_perfSessionCharts` arrays (explicitly destroyed on every re-entry, 987-988, 1020-1021, 1132, 1608 — the last with a comment describing exactly this leak class being fixed in a 2026-07-23 review). `renderProgressWeight` appears to have been missed by that pass.

**Failure scenario:** switching the "My Progress" tabs away from and back to "Body Weight" — or any call to `saveWeightGoals()`, which explicitly re-calls `renderProgressWeight(progressEl)` at line 884 — re-runs `el.innerHTML = …` (detaching the old canvases) then creates a new `Chart` instance unconditionally. The old instance is never destroyed and leaks. `Chart.getChart(id)` is proven to work even after DOM detachment by the already-working `weight-chart` guard in this same file, so the fix pattern is already established locally.

## Silent delete failures

- `deletePerfLog` (566) — `if (error) { log.error('deletePerfLog', 'delete failed', error); return }` — no toast, no inline message, no re-render. A user who taps delete and hits an error sees nothing happen at all.
- `deleteWeightLog` (892) — identical shape.

Contrast: `delete1RM` (242) uses `dbq()`, which auto-shows a toast on error (js/app-core.js:34-48) — so of this file's 4 delete/remove functions, 3 surface nothing to the user on failure, purely because 1 happens to route through `dbq()` and the others don't.

## Suggested fix direction

Chart leak: add the same `Chart.getChart(id)?.destroy()` guard already used elsewhere in this file, to both `pw-chart` and `resting-hr-chart`. Silent deletes: route `deletePerfLog`/`deleteWeightLog` through `dbq()` (or add a matching `showToast` on error) to match the file's own established pattern.

---

**✅ FIXED + LIVE `bfb319c` (2026-08-12).** Both halves confirmed exactly as reported.

Charts: `pw-chart` and `resting-hr-chart` created a Chart without destroying the previous instance,
leaking it plus its listeners and animation loop. Uses the file's own existing
`Chart.getChart(id)?.destroy()` precedent. My first scan claimed SIX leaking sites — that was wrong,
a 9-line look-behind missed guards 13 lines up and the array teardowns. **The audit's count of 2 was
right and mine was not.**

Deletes: `deletePerfLog`/`deleteWeightLog` now toast on error AND on zero rows — a policy-blocked
delete returns `{ data: [], error: null }`, so an error-only guard treats "refused" as "succeeded",
re-renders, and the row is still sitting there with no explanation.
