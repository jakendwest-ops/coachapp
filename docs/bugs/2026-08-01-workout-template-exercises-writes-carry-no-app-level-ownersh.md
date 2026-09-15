---
id: 2026-08-01-workout-template-exercises-writes-carry-no-app-level-ownersh
status: confirmed
priority: medium
reported: 2026-08-01
status_detail: "confirmed (behaviourally probed, already safe)"
---

# workout_template_exercises writes carry no app-level ownership anchor, unlike every sibling in the template fa

**`workout_template_exercises` writes carry no app-level ownership anchor**, unlike every sibling in the template family (`saveEditTemplate`/`deleteTemplate`/`saveEditExercise`/`deleteExercise`/`toggleExerciseArchived` all anchor AND verify row count). Includes the `_propagateExerciseChangeToTemplates` fan-out and its `_checkSiblingPropagation` lookup (`program_phases`, also unanchored). Not directly reachable through the UI; reasoned as RLS-only-defended, not proven — needs the same live-probe treatment this session gave `client_1rms`/`exercises`/`goals`. — ✅ **PROBED LIVE 2026-08-10 — CONFIRMED ALREADY RLS-SAFE, no fix needed.** Behavioural two-account probe (`tests/template-exercise-write-rls-2026-08-10.spec.js`), attempted BOTH raw (proving the policy, not the app's own guards) and through the real `_propagateExerciseChangeToTemplates` fan-out (proving the reachable path). **Unrelated coach (PT2, owns nothing) against another coach's master template:** raw DELETE 0 rows, raw UPDATE 0 rows, raw INSERT refused with an error, and the fan-out's delete+update both no-ops. **Real client against their coach's master template:** identical, all refused. The victim row survived with `notes` unchanged and nothing injected. So the missing app-level anchor is genuinely **defense-in-depth only**, not a live hole — the same verdict the 2026-08-01/-02 probes reached for `client_1rms`/`exercises`/`goals`/`weight_logs`. Permanent regression test added so a future policy change cannot silently reopen it. **Deliberately NOT adding the anchor in this pass:** doing it per-target inside the loop would add N round-trips to a path that already loops; the right shape is ONE `.in('id', targetIds).eq('coach_id', coachId)` ownership filter for the whole target set, folded into the grouped-work slice that rewrites this function's neighbourhood anyway.
