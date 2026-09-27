---
id: 2026-07-23-same-root-cause-as-the-row-above
status: unverified-accepted
priority: high
reported: 2026-07-23
status_detail: "UNVERIFIED-ACCEPTED by Jake 2026-09-27 (batch reply 'go ahead' to: accept rows whose fix is still in the code, and the general older rows; keep security/data-safety rows for an audit). No red->green test proves this one; no longer tracked."
---

# Same root cause as the row above

✅ **Same root cause as the row above — see 2026-07-29 fix.** — (orig) **⚠️ LIVE REPRO RUN 2026-07-23 — NOT REPRODUCED on a clean fixture; needs Jake's actual program.** Drove the real UI end-to-end (open program → expand slot → Edit workout → add exercise), both cases. **Case A (same-named siblings in the program):** propagate modal DOES appear ✓, `_lastExerciseChange.op='add'` ✓ — but `openTemplate` is NOT called, so the editor behind the modal still shows the pre-add list until it is dismissed (all 3 dismiss paths do re-render, so this is cosmetic). **Case B (differing names):** no modal (correct — nothing to propagate to), `openTemplate` IS called, exercise appears immediately ✓. Returning to the program refetches and the new exercise IS in the slot DOM. **So neither symptom reproduced, and the two occurring TOGETHER is still unexplained.** To progress this needs his real data: does he see the modal at all, and are the same-named workouts in the SAME phase? (the sibling query scopes to the program's own phases).
