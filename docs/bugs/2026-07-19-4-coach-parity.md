---
id: 2026-07-19-4-coach-parity
status: open
priority: medium
reported: 2026-07-19
---

# ④ Coach parity

**④ Coach parity — the rich analytics in the coach's client-profile view.** ③ shipped self-view ONLY (client/solo My Progress). A coach viewing a CLIENT still sees the old `renderClientPerformance`/`renderClientWeight`. Factor the trend view to `(clientId, role)` and render it read-only there; add resting-HR to the coach's client weight form too. The queued fast-follow.

---

**🔁 RE-REPORTED LIVE by Jake, 2026-08-14 — 26 days on — and this row's SCOPE STATEMENT IS HALF WRONG.**

Verbatim: *"the entire UI for weight/performance/programs/1RM is better on ALEX TURNER profile than it is on
my personal account… The grid style and data/plot points within this weight section is the style that I
would like within the performance section… Please include this graph type for all sections that require a
graph."*

This row says solo got the good analytics and the COACH view needs to catch up. Jake says the opposite. A
read of the code shows **both are true, of different tabs**, which is why this sat unresolved:

- **Coach Weight is genuinely AHEAD** — dual axis (weight + body-fat %), 1M/3M/6M/All range pills, a 7-day
  rolling average, an index-mode tooltip and a full data table with notes and delete
  (`js/app-progress.js:585-811`). Solo's has one dataset, no ranges, and a 10-row list with no notes.
- **Coach Performance is genuinely BEHIND** — no ranges, no metric chips, no records block, which is what
  this row originally (correctly) said.

**Corrected scope — bidirectional, not one-way:**
- coach → solo: the weight chart becomes the house style for every chart.
- solo → coach: the trend-card machinery (`_TREND_RANGES`, `_TREND_METRICS`, `_METRIC_COLORS`,
  `_aggregateSeries`, records block) goes into the coach's Performance tab.
- both: extract a shared `_renderMetricChart` so "one style" is enforced structurally. There are **7
  `new Chart(` sites, all in `js/app-progress.js`, with ZERO shared config** — `tension:0.3` and
  `legend:{display:false}` are copy-pasted 5–6× each, across 3 different teardown idioms. Six of the seven
  would change.

**Two concrete defects found while scoping, to fix in the same pass:**
- **Float artifacts are live and visible in Jake's screenshot** — `20.800000000000004%` on the body-fat
  axis. `js/app-progress.js:794` is `callback: v => v + '%'` with no rounding. Must be fixed in the shared
  helper so it cannot spread to the other six.
- **The reference chart hardcodes `#6366f1` / `#6b7280` / `rgba(0,0,0,0.05)`** — light-theme only, while the
  solo charts correctly read CSS variables. Adopt its STRUCTURE and the solo charts' THEMING, or "one style
  everywhere" ships light-theme-only colours across the whole app.
- **A real chart leak**: `window.__perfCharts` is reset to `{}` (`js/app-progress.js:450`) **without
  destroying** the previous instances, orphaning every expanded chart on each `renderClientPerformance`
  run — which fires on every PB save and delete. Same class as the `pw-chart` leak fixed 2026-08-12; this
  sibling was missed.

**The 1RM half of his sentence is already resolved** — see
[[2026-08-14-1rm-grid-layout-worse-on-personal-than-pt-client]]; it was never a coach/personal fork.

**Planned session 3 of 3** (charts), deliberately last: it is the largest single-file churn and wants a
quiet tree.
