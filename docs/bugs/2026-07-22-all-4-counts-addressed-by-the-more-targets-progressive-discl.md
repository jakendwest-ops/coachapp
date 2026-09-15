---
id: 2026-07-22-all-4-counts-addressed-by-the-more-targets-progressive-discl
status: confirmed
priority: high
reported: 2026-07-22
reported_detail: confirmed 2026-08-02
status_detail: "confirmed (code-verified; already covered by the progressive-disclosure redesign)"
---

# all 4 counts addressed by the "+ More targets" progressive-disclosure redesign

✅ **CONFIRMED ALREADY FIXED, code-verified 2026-08-02 — all 4 counts addressed by the "+ More targets" progressive-disclosure redesign.** (1) **Watts** exists (`ts-wattsmin-${i}`/`ts-wattsmax-${i}`, app-workouts.js) inside the collapsed section. (2) **Distance entry is metres-based** — labeled `Distance (m)` (or `mi` per preference), routed through `distanceToPref`/`_cardioDistanceM`, matching the dedicated `tests/cardio-distance-metres.spec.js` coverage already in the suite. (3) **Pace / 500m is optional** — it lives inside `more('+ More targets', ...)`, a collapsed `<details>` that only auto-opens when a field inside already has a value, not always-rendered. (4) **Pace / km is legacy-only** — conditionally rendered ONLY when `s.paceKmMin`/`paceKmMax` already has a value, labeled "(legacy)", exactly the fix the original report asked for. The "9 stacked rows, 6 always-visible" sub-complaint is also resolved by the same redesign (down to 4 always-visible rows: Duration/Distance toggle, one target row, Rest, and the collapsed More-targets summary line). No code needed tonight — ledger hygiene only.
