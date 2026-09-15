---
id: 2026-07-13-pt-personal-boundary-audit-across-every-remaining-table
status: confirmed
priority: high
reported: 2026-07-13
reported_detail: closed 2026-08-02
status_detail: "confirmed (all tables probed; the one real gap found and fixed)"
---

# PT/Personal boundary audit across EVERY remaining table

✅ **PT/Personal boundary audit across EVERY remaining table — CLOSED 2026-08-02.** `exercises` (07-10), `workout_templates` (07-11) and `programs` (07-13) each leaked in turn — three instances of one class, each found by Jake in production. `weight_logs`, `workout_template_exercises`, `client_1rms`, `goals` all probed 2026-08-02 and confirmed already RLS-safe; `events` was probed the same session, found genuinely vulnerable, and fixed (see the row directly above) — every table on the original 2026-07-13 list has now been both probed and, where needed, fixed. **One residual, explicitly non-blocking follow-up**: multi-agent review noted all 5 probes test coach-vs-coach cross-tenant only, none independently confirms a SOLO-owned row (`clients.coach_id` NULL) is correctly readable/writable by its own owner — the shape behind 4 prior solo bugs. The canonical `_getCurrentClientId()` resolver already handles this correctly by design for solo's own self-view, but a dedicated probe would make that a proven fact instead of a reasoned one — worth a future session, not blocking this closure.
