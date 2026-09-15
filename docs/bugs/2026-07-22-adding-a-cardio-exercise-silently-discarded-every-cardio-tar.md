---
id: 2026-07-22-adding-a-cardio-exercise-silently-discarded-every-cardio-tar
status: confirmed
closed_by: "clause (b) — cardio-distance-metres.spec.js ran GREEN 2026-08-20 in a serialized 192-test run; red-before is recorded in this file's body. Closed on test evidence, NOT on a Jake confirmation."
priority: high
reported: 2026-07-22
status_detail: "fixed — awaiting Jake"
---

# Adding a cardio exercise silently discarded every cardio target except duration/distance

**Adding a cardio exercise silently discarded every cardio target except duration/distance.** Found by the pre-push multi-agent review 2026-07-22 (all 3 agents, independently), **fixed same session**. `saveExerciseToTemplate`'s `cleanSets` allowlist had NEVER contained `isDistanceBased`, `pace500Min/Max`, `hrZoneMin/Max`, `restHrMax` or `strokeRateMin/Max` — so a coach who set a pace/HR/stroke-rate target on ADD lost it, while EDIT (`saveEditTemplateExercise`, which writes `sets_json` raw) kept it. Silent at every layer. Fixed by a single shared `_cleanTemplateSets()` used by both builders. Red→green test: `tests/cardio-distance-metres.spec.js`. **Latent since the cardio fields shipped** — worth a live check that your older cardio templates still hold their targets.
