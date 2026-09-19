---
id: 2026-09-19-dashboard-benchmarks-cards-pick-best-without-checking-units
status: closed
priority: medium
reported: 2026-09-19
closed_by: tests/dashboard-benchmarks-best-2026-09-19.spec.js
status_detail: "CLOSED 2026-09-19 on rule-(b) evidence. Found while deleting the Progress → Benchmarks tab, by reading js/app-dashboard.js against _bestPerfLog (js/app-progress.js); widened by the pre-push review. Was INFERRED; now reproduced and fixed. The new spec went RED on the old code — 5 of 6 tests, the card showing 220 lbs / 60 cm / 200 sec / 5 km on the client dashboard and 60 cm on the solo one — and GREEN once both dashboards called one shared helper. The 6th case (cardio minutes, lower is better) passes before and after: it pins the one behaviour the old rule already got right."
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

## Resolution (2026-09-19)

`_perfBestsByName(logs)` in `js/app-dashboard.js` groups a client's `performance_logs` by name, in
first-appearance order (so the card still shows the four most recently logged names), and delegates each
group to `_bestPerfLog`. Both dashboards call it; both `pbMap` copies are gone. One rule now serves the
client card, the solo card and the coach's Performance tab.

How the spec differs from the plan written above: rows are dated today and yesterday, not 2026-01-01 and
2026-02-01, because the card keeps only the four most recently logged names and a months-old row can fall
off it. It adds a cm/in case (the best record is the newest one, in the other unit) and the cardio-minutes
regression guard, and one solo-dashboard case.

**Known limits, deliberately not changed:**

- **Hold-type benchmark times.** The rule is "min/sec = lower is better", the same one the coach's
  Performance tab has always used. A benchmark logged as a hold (a plank, 60 s then 90 s) now shows the
  60; the old category rule showed the 90. Nobody is known to log holds there — the placeholder is
  "Fran, Cindy, Murph". Say so if it is real and the direction needs a per-record flag.
- A name logged in two unit families takes its direction from the newest record's unit, as
  `_bestPerfLog` always has. Both `cardio` units include time (min/sec) and distance (km/mi), so this can
  happen inside ONE category: "Row" as 1350 sec, later as 5 km, shows the 1350 sec.
- **Unverified — legacy units on real data.** `Kg` and a Skierg row with unit `5km` (value in seconds)
  exist on Jake's own account (`js/app-core.js` ~211). Neither is a known unit, so both are treated as
  higher-is-better and unconverted; the old rule made a cardio group lower-is-better. Nothing changes for a
  name with ONE record. The E2E account holds no `performance_logs` rows, so this could not be tested. To
  see whether any name has several records with such a unit, run in Supabase:
  `select name, count(*) as records, array_agg(distinct unit) as units from performance_logs group by name having count(*) > 1 and bool_or(unit is null or unit not in ('kg','lbs','cm','in','min','sec','km','mi','reps'));`
- `value` is `numeric` in the database (a markup string is refused: `invalid input syntax for type
  numeric`), so the unescaped `${pb.value}` on both cards cannot carry markup.

**Hardened in the same change (found by the pre-commit review):** `_perfBaseValue` looked the unit up as an
object key, so a row whose unit is `__proto__` returned `Object.prototype`, which is truthy but not
callable, and threw. That was survivable while only the coach's Performance tab called `_bestPerfLog`;
with the dashboards calling it, one planted row (a direct API write — the form only offers a category's
units) would leave that client's home page on "Loading…". The new spec case went RED (`TypeError: fn is
not a function`) and GREEN with a `hasOwnProperty` lookup.
