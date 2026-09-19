---
id: 2026-09-19-dashboard-benchmarks-cards-pick-best-without-checking-units
status: open
priority: medium
reported: 2026-09-19
status_detail: "Found while deleting the Progress → Benchmarks tab, by reading js/app-dashboard.js:315-324 and :880-886 against _bestPerfLog (js/app-progress.js); widened by the pre-push review, which spotted the direction problem. INFERRED from the code — none of the cases below has been run against either dashboard."
---

# Dashboard Benchmarks cards choose the "best" record by the wrong rule

`js/app-dashboard.js` builds `pbMap` twice — the client dashboard (line 315) and the solo dashboard
(line 880) — comparing raw `value`, with the direction picked by **category**:

```js
const better = p.category === 'cardio' ? p.value < pbMap[key].value : p.value > pbMap[key].value
```

`_bestPerfLog` (js/app-progress.js), written for the Benchmarks tab and the coach's Performance tab,
converts to a base unit first and picks the direction by **unit** (`min`/`sec` lower is better,
everything else higher). Neither dashboard uses it, so the cards are wrong three ways:

1. **Mixed units.** `PERF_CATEGORIES` lets one name be logged in either unit of a pair (kg/lbs, cm/in,
   min/sec, km/mi). 100 kg (older) against 220 lbs (newer, about 99.8 kg) shows **220 lbs**.
2. **Benchmark times.** A `benchmark` record in min/sec (a Fran time) is not category `cardio`, so higher
   wins: 200 sec then 180 sec shows **200** — the slower time.
3. **Cardio distances.** A `cardio` record in km/mi is treated as lower-is-better: 5 km then 10 km shows
   **5 km**.

**Why it matters now.** Until 2026-09-19 the Benchmarks tab showed the correct value beside the card's
wrong one. That tab is deleted, so the dashboard card is the only client-facing view of `performance_logs`
and nothing contradicts it. (A client's coach still sees the correct value on the client's Performance
tab, which uses `_bestPerfLog`.)

**Red-first tests to write with the fix**, as a client, against the dashboard Benchmarks card:
(1) `100 kg` dated 2026-01-01 and `220 lbs` dated 2026-02-01 under one name — expect `100 kg`;
(2) benchmark `200 sec` then `180 sec` under one name — expect `180`;
(3) cardio `5 km` then `10 km` under one name — expect `10 km`.
All three should be RED today. The first is the test deleted with the tab
(`ledger-fixes-2026-07-23.spec.js`, section 7).

**Fix shape.** Both dashboards call `_bestPerfLog` (grouping by name first) — one helper, not a third copy.
