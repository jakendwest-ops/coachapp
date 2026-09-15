---
id: 2026-07-12-this-was-never-erosion-it-s-undetected-accumulation
status: open
priority: medium
reported: 2026-07-12
reported_detail: reframed 2026-08-05
---

# this was never "erosion," it's undetected accumulation

**REFRAMED 2026-08-05 — this was never "erosion," it's undetected accumulation.** A live count against the real E2E client just now: **154** `workout_logs` rows, not 13 or 4. `scripts/seed-test-data.js` only ever inserts 5 "Push Day A" rows (gated to run once) — the "13" baseline was never that script's own count. The actual 154 breaks down as ~30 "Push Day A" rows (6× the seed) plus dozens of distinct `[E2E]`-tagged names from many different spec files (trend/rec/mt/diary/col/1RM Check/Week-Label Session/Zero-Set Session/probe/…) — debris that accumulated across many sessions and was never swept, not rows disappearing. Independently re-confirmed the 14 DELETE call sites are all narrowly scoped (same conclusion as 2026-08-02, checked again). The old "was 13, now 4" reading was likely a real but transient snapshot, not a standing downward trend. **Not cleaned up tonight** — a mass-delete against this shared account deserves its own dedicated, careful pass (some tagged rows may still be load-bearing for specific tests), not a same-session tack-on. — (orig) **FIXTURE-ISOLATION BUG — the suite erodes seeded `workout_logs`** (was 13, now 4 across runs). Checked every single `workout_logs` DELETE across the whole test suite (14 call sites) — every one filters by a specific row `id`, none delete broadly by `client_id`, name, or date range. Found a genuinely related, documented contamination class in `tests/programs.spec.js:874-878`: orphaned debris `workout_templates` that sort alphabetically ABOVE the seed's "Push Day A" get grabbed by client-runner tests that click "the first Start button" — already has its own cleanup, confirmed not the same mechanism.
