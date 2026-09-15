---
id: 2026-07-22-the-exact-discriminator-jake-asked-for-is-already-live
status: confirmed
priority: high
reported: 2026-07-22
reported_detail: confirmed 2026-08-02
status_detail: "confirmed (code-verified; already shipped 2026-07-23)"
---

# the exact discriminator Jake asked for is already live

✅ **CONFIRMED ALREADY FIXED, code-verified 2026-08-02 — the exact discriminator Jake asked for is already live.** `_buildProgramTemplatePool` (app-programs.js) resolves, per template, where it's already used (`t._usage`: phase name · week number · day, first 2 uses + "N more") and its exercise count (`t._exCount`), rendered in the picker row alongside name/description/exercise-preview. The function's own header comment quotes Jake's 2026-07-22 complaint verbatim and explains the design ("deduping the data would not fix this — the picker has to disambiguate"). Shipped 2026-07-23 (`b53dbfc`) as part of the same fix documented in the row below (originally logged only under that row's "Library page" framing, never cross-referenced back to this one — ledger hygiene gap, not a missed fix). **One residual, smaller edge case, not Jake's reported scenario**: two genuine duplicates that are BOTH still unused would show identical "Not used yet" with no further discriminator if their exercise counts also match — a created-date fallback would close that, not scoped tonight since it wasn't the actual pain reported.
