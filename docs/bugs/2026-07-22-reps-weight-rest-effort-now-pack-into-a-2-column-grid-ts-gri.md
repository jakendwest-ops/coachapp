---
id: 2026-07-22-reps-weight-rest-effort-now-pack-into-a-2-column-grid-ts-gri
status: fixed-awaiting-jake
priority: high
reported: 2026-07-22
status_detail: "fixed — awaiting Jake"
---

# Reps/Weight/Rest/Effort now pack into a 2-column grid (.ts-grid/.ts-cell, main.css), same pattern as .field-ro

✅ **FIXED + LIVE 2026-08-05 (`980d324`) — Reps/Weight/Rest/Effort now pack into a 2-column grid** (`.ts-grid`/`.ts-cell`, main.css), same pattern as `.field-row` elsewhere in the app. Applied consistently across weight_reps/unilateral, timed_hold and jump — the 3 branches sharing this "4 stacked full-width rows" shape. "+ More targets" disclosure kept, itself also grid-packed. Every input id/fallback/conditional preserved (flushTemplateSets reads by id, not row structure) — 337-test full suite + mobile-check screenshots (390×844, all 3 set types) confirmed clean, multi-agent review (3 angles) clean. Live preview approved by Jake first via an interactive HTML mockup before any code was touched. — (orig) **Builder scrolls too much on mobile + resembles the Heavyset builder.** Jake, on his phone. Two verified causes: `renderTemplateSets` is 7 stacked rows per set (4 sets = 32 rows), and it uses an iOS-grouped-inset-list shape (`row()` = flex/space-between, label left, value right, hairline separator) with 15 hardcoded Tailwind greys vs 7 token uses. Heavyset screenshot supplied + analysed — the resemblance is layout **and** palette, plus a literal `placeholder="Optional"` microcopy match (app-workouts.js:1091, :1098).
