---
id: 2026-07-29-exercises-category-compound-isolation-cardio-bodyweight-stre
status: fixed-awaiting-jake
priority: low
reported: 2026-07-29
status_detail: "fixed — awaiting Jake"
---

# exercises.category (Compound/Isolation/Cardio/Bodyweight/Stretching) is a free-text, display-only field, disti

✅ **FIXED + LIVE 2026-07-29 (`eb9ec3f`)** — `exercises.category` (`Compound`/`Isolation`/`Cardio`/`Bodyweight`/`Stretching`) is a free-text, display-only field, distinct from the real per-set `bodyweight` toggle that already correctly marks an individual set as bodyweight-only. Having "Bodyweight" as a whole-exercise category was misleading (implies every use is bodyweight). Dropped from both add/edit dropdowns; `starter-content.js`'s 8 seed exercises using it changed to `category: null` (no reclassification — no "Core"-style option exists to sort Plank/Russian Twist into, better left to the coach). Existing live rows tagged `Bodyweight` left as-is (fix-forward). — **Remove "Bodyweight" as an exercise type in the exercise builder — redundant.** Jake, live.
