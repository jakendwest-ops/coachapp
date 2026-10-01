---
id: 2026-10-01-delete-top-set-row-shifts-prescriptions-onto-a-computed-load
status: closed
priority: low
reported: 2026-10-01
status_detail: "FIXED 2026-10-01 by tests that ran RED on the old code and GREEN on the new. tests-node/delete-table-row.test.mjs: 3 of 7 RED before (deleting the top-set row crowned the old row 1 and left its estimate; a middle delete shifted prescriptions; an RIR row logged as RPE), 7/7 after. tests/runner-edit-delete-2026-10-01.spec.js (real delete button): RED on the old modules because the estimate chip of the DELETED set stayed on screen, GREEN on the new. deleteTableRow removes the deleted row's own prescription (on a copy), recomputes the estimate, and the target note now says 'No top set left in this workout' instead of sending the lifter after a set that no longer exists. deleteTableRow is the only site that removes rows (grepped). Not Jake-reported."
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
