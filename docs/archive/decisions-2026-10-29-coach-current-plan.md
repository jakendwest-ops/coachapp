# Decision archived verbatim from docs/decisions.md (2026-10-29)

Moved out to keep `docs/*.md` under the docs-budget; the pointer stays in `decisions.md`.

## 2026-10-29 - Coach work starts now, designed for a 25-client roster; the current plan is chosen by date

**Decided (Jake, 2026-10-29):** "Yes, design for 25" - this overrides the 2026-09-26 deferral of roster-size features (search, sort, Needs attention, invite state), which waited for a real roster. First build (approved the same day): a client's current training plan is the most recently STARTED one (else the soonest upcoming), never the most recently assigned, and calendars draw back-to-back blocks each in their own weeks; the client's Training plans tab gains "Assign next block". **Why:** booking a next block made it current at once everywhere and hid the running one ([row](../bugs/2026-10-29-current-plan-is-picked-by-assignment-order-not-by-date.md)). **Rejected:** one-plan-at-a-time for coached clients (solo keeps it) - a PT books the next block before the current one ends.

## Schema note archived from docs/schema.md (same day)

- **Which assignment is "current"** (2026-10-29): a client may hold several `client_programs` rows. Current = the most recently
  STARTED (start_date, else the UTC day of created_at); with none started, the soonest upcoming. Never "newest-assigned".
  One rule, two copies kept in step: `_currentAssignment` (`js/app-core.js`) and `coach_client_summary`'s programme lateral
  (`scripts/fix-coach-client-summary-current-plan-2026-10-29.sql`, which also appends `next_program_start`, column 20).
  `scripts/sql-verify/coach-client-summary-current-plan.verify.mjs` runs both on the same fixtures and fails if they disagree.
