---
id: 2026-08-29-resolveeditabletemplateid-writes-on-an-unverified-slot-id
status: closed
priority: high
reported: 2026-08-29
closed_by: "tests/review-fixes-2026-08-29.spec.js '_resolveEditableTemplateId refuses a slot pointing at a different template of my own' — RED without the anchor ('the mismatched slot must NOT be repointed'), GREEN with it. Fixed fe58592."
status_detail: "CLOSED fe58592. The update now carries .eq(template_id, templateId). Red-before proven by removing the anchor. The ownership gate checks tmpl.coach_id (the TEMPLATE); the UPDATE 14 lines later targets .eq(id, ctx.phaseWorkoutId), an id no caller verified. Verbatim the decorative-guard shape app-core.js:1084-1088 warns about. The named sibling removePhaseWorkout got this exact fix on 2026-08-22. Found by the 2026-08-29 full-file review, verified by reading :2909-2923."
---

# `_resolveEditableTemplateId` verifies the template, then writes on an unverified slot id

**js/app-workouts.js:2922-2923** — found by the weekly full-file review (Agent A), verified by reading the lines.

    const { data: repointed, error: repointErr } = await db.from('program_phase_workouts')
      .update({ template_id: cloned.id }).eq('id', ctx.phaseWorkoutId).select('id')

The ownership gate 14 lines above (`:2909-2912`) checks `tmpl.coach_id !== _resolveTemplateOwnerCoachId()`
— that protects the **template**. The write targets `ctx.phaseWorkoutId`, which neither this function nor
any of its callers has checked.

This is verbatim what `app-core.js:1084-1088` warns about: *"four sites verified clientId and then wrote
.eq('id', someOtherId), which made the guard decorative."*

**The named sibling was already fixed.** `removePhaseWorkout` got exactly this mismatched-id gate on
2026-08-22 (`tests/program-ownership-anchors-2026-08-22.spec.js:78` — *"refuses a slot belonging to a
different phase of my own"*). This site was missed — [[feedback_fix_the_class_not_the_instance]] again,
on the very class that rule exists for.

**Honest severity — "unproven at both layers", not "known-open".** The rowcount check at `:2924` means an
RLS refusal IS detected, the clone is reaped, and the user is told. But `program_phase_workouts` has **no
cross-tenant RLS probe** in `tests/`: grepping finds only fixture inserts and deletes, never a refusal
assertion. So neither layer is proven, which is the reason to close it rather than reason it away.

**Fix:** anchor the update to the template just verified —
`.eq('id', ctx.phaseWorkoutId).eq('template_id', templateId)` — so the slot must currently point at the
verified template. Cheaper and tighter than re-resolving phase to program to coach_id.

**Closes when:** the update carries the second anchor, AND a cross-tenant probe spec exists for
`program_phase_workouts` that goes RED without the anchor and GREEN with it.

---

## CLOSED 2026-08-29 (`fe58592`)

The update now carries `.eq('template_id', templateId)`, so the slot must currently point at the
template whose `coach_id` was just verified.

**It cannot refuse a legitimate user** — checked rather than assumed. The function returns early at
`:2888` unless **more than one slot** points at `templateId`, and its stated purpose is repointing
*the slot this edit came from*. On every legitimate path that slot's `template_id` **is** `templateId`.
It fails only in the case that is the bug.

## 🔴 My closing condition was wrong, and I am not pretending it was met

I wrote: *"a **cross-tenant** probe spec ... that goes RED without the anchor."* **That test would have
been decorative.** RLS already refuses a foreign write, so a cross-tenant probe passes with the anchor
deleted — it proves RLS works, not that the anchor does.

The spec I actually wrote is **single-tenant with my own mismatched ids**, following
`program-ownership-anchors-2026-08-22.spec.js`, which states this reasoning explicitly. RLS permits
both rows, so the anchor is the *only* thing standing between the call and the wrong row being written.
Verified both ways:

    anchor removed -> "the mismatched slot must NOT be repointed"  (RED)
    anchor present -> GREEN

**Amended condition, met:** a single-tenant mismatched-id probe, RED without the anchor.

**Still open, deliberately, and now its own concern:** `program_phase_workouts` has no cross-tenant RLS
probe anywhere in `tests/`. That is a real gap — but it is a gap in *RLS coverage*, not in this fix,
and conflating the two is what produced the wrong condition. Not carried on this row.
