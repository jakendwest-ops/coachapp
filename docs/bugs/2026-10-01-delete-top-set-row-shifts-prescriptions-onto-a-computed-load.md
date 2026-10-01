---
id: 2026-10-01-delete-top-set-row-shifts-prescriptions-onto-a-computed-load
status: open
priority: low
reported: 2026-10-01
status_detail: "Found by the multi-agent review of the RPE top-set work (2026-09-30 / 2026-10-01), not reported by Jake. Reported by Agent C (round 1); NOT independently re-verified. The index model (sets_json keyed by row position) is pre-existing; the RPE work widens its blast radius from a ghost placeholder to a computed training load and a saved effort_type."
closing_conditions: "A test that deletes the top-set row in the runner and asserts no other row is treated as the top set (no estimate, no chip, no effort_type taken from the wrong prescription), RED before and GREEN after deleteTableRow keeps sets_json aligned with tableRows or the runner stops deriving anything from a shifted index."
---

# Deleting the top-set row in the runner shifts every row onto the wrong prescription, now with a computed load

**Closes when:** A test that deletes the top-set row in the runner and asserts no other row is treated as the top set (no estimate, no chip, no effort_type taken from the wrong prescription), RED before and GREEN after deleteTableRow keeps sets_json aligned with tableRows or the runner stops deriving anything from a shifted index.

`deleteTableRow` splices `tableRows` but not `sets_json`. `renderRunner` then re-runs `_recomputeLiveE1RM`
against the NEW `tableRows[0]` while `sets_json[0]` is still the top-set prescription, so if the second set
was done with an effort it is estimated as if it were the top set, and `_syncLoggedSetsFromTable` reads
`sets_json[i].effortType` at the shifted index too.

Before the RPE work the shifted index only mis-ghosted a placeholder. It now feeds a live e1RM, the backoff
targets and a saved `effort_type`. Not reported by Jake; reached by deleting set 1 mid-session.
