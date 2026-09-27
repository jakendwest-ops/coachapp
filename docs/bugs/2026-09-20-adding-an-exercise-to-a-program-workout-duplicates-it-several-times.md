---
id: 2026-09-20-adding-an-exercise-to-a-program-workout-duplicates-it-several-times
status: closed
priority: high
reported: 2026-09-20
status_detail: "CLOSED 2026-09-27 via closure rule (b): the row records 6 specs (tests/propagate-add-target-2026-09-20.spec.js) RED on the old code and GREEN after; its own 'after release' condition is met — shipped in v2026.09.7; green in the v2026.09.8 full-suite run (832 passed, 0 failed)."
---

# Adding an exercise to a program workout duplicates it several times

**Jake, 2026-09-20:** "I added seated cable row machine and cable upright row to this upper body
workout and it has duplicated the exercise several times."

## What the screenshot shows

- Programs page, **Personal** view, mobile layout. A phase week's slot detail panel (`div.pwk-detail`)
  titled **Upper Body**. **Seated Cable Row Machine appears at least three times**, every copy with the
  identical prescription. The screenshot is cut off at the bottom, so more rows are probably below.

## Root cause (found and reproduced 2026-09-20)

`_propagateExerciseChangeToTemplates` (`js/app-workouts.js:2795`), the `add` branch, writes each target's
new row as:

```js
insert({ template_id: tid, order_index: <last in target> + 1, ...change.row })
```

`...change.row` comes **after** those two keys, so anything in it overrides them. Since the 2026-09-13
staged-draft rewrite (commit `1134872`, live in v2026.09.6 on 2026-09-17), `saveTemplateDraft` records an
added exercise as `{ op: 'add', row: insertRow }`, and `insertRow` already carries
`template_id: targetId` — the template being **edited** — and its `order_index`
(`js/app-workouts.js:2620-2625`). So for every target propagation is asked to update, the new row is
written into the edited template again, and the target gets nothing. The spread dates from 2026-07-12
(`4d8813c`), where it was safe because change rows had no `template_id`; each change is reasonable on its
own and wrong only together. The exists-check that should prevent double-adds looks in the *target*, which
never has the row, so it never stops it.

### Evidence

A Personal-view program, 4 weeks sharing one template (un-forked "Duplicate week"), self-assigned; add two
exercises in the editor, Save, then answer "apply to all sessions", through the real functions on the E2E
account:

| Step | Edited template | Sibling weeks + the four solo copies |
|---|---|---|
| Fixture | 3 rows | 3 rows each |
| After **Save** | **7** — each new exercise twice | 3 each — got nothing |
| After **apply to all** | **15** — each new exercise six times | 3 each — got nothing |

The extra rows equal (propagation targets) × (exercises added): 1 × 2 after Save, then 4 × 2 more. That
matches "duplicated several times" — the number is however many weeks/copies the program has.

A minimal test of the one hypothesis: `_propagateExerciseChangeToTemplates` asked to add an exercise to
target B, with a change row carrying `template_id: A` → the row lands in **A**, and B is untouched.

### Blast radius

- Every **add** made in the template editor where propagation has targets: sibling weeks (same
  `family_id`), the user's own solo copies (**silent** — no prompt in Personal view), a PT's real clients'
  copies ("Update their copies"), periodization week clones.
- **It reports success.** "Updated N copies" is shown, because the insert itself succeeded (into the wrong
  template), so `propagationFailures` stays 0. For a PT this means "Update their copies" never reached the
  clients while the coach was told it had.
- update / delete / rename / reorder are **not** affected: their change rows carry no `template_id`, and
  rename/reorder use separate functions.
- Only one producer of `add` changes exists (`saveTemplateDraft`), and three consumers reach the bad line
  through `_applyChangeToTemplates`: `_checkClientPlanPropagation` (solo copies), `_continueAfterClientCopy`
  (real clients), `_applyToAllSessions` (siblings + solo copies).

## Not yet known

- **Real-data damage** on Jake's account (which workouts now hold duplicates, since 2026-09-17) and which
  clients' plans missed an exercise their coach believes was added. Needs a read-only query; this session
  cannot see the live database.
- Whether a hotfix release is wanted before the next planned release (master holds other unreleased work).

## Resolution (2026-09-20 — in the working tree; not committed, not released)

**Fix.** `js/app-workouts.js`: a new `_propagationRowFields(row)` strips `template_id`, `order_index` and
`id` from a change row. The `add` branch now spreads that first and sets `template_id: tid` and the
target's own next `order_index` **last**, so the target always wins whatever a producer put in the row. The
`update` branch uses the same helper: it applies `change.row` wholesale onto a target too, and was safe only
because no producer put a `template_id` in an update row. A grep for a row spread after a `template_id:` key
found no other site with this shape.

**Tests.** `tests/propagate-add-target-2026-09-20.spec.js`, 6 tests, all RED on the old code for the right
reasons (target missing the new row; edited workout holding the copies) and GREEN after:
the add lands in the target once and not in the edited template; the target's own `order_index` wins;
propagating the same add twice adds it once; an update edits the target's row in place; the Personal-view
scenario above ends with every week and every solo copy holding exactly the five expected exercises;
a PT's "Update their copies" adds the exercise to the client's copy once.

**Regression run (2026-09-20).** The 6 new specs plus the 20 existing spec files that touch propagation or
the template save (244 tests, one worker, 12.2 min): **243 passed, 1 skipped, 0 failed, 0 flaky**. The skip
is `solo-dashboard-tiles … repainting the dashboard does not accumulate live charts`, which skips itself
because the E2E account has no weigh-ins to chart (line 211) — unrelated, and the spec is untouched.

**Multi-agent review (2026-09-21), diff mode, 3 angles + verifier.** No blocking findings from any angle.
Security/tenant-scoping found the new spec's own `cleanup()` never deleted `workout_template_exercises`
before `workout_templates` (no documented FK cascade for that pair), and the two integration tests'
teardown never touched `program_phases`/`program_phase_workouts`/`client_program_workouts` or checked
delete rowcounts — both fixed here and the suite re-run green. Fixing the program-tree teardown surfaced a
real schema fact worth recording: `client_program_workouts` has no DELETE RLS policy of its own — a direct
delete on it left rows in place, and only the FK cascade off `client_programs` removes it (the real app
code never deletes it directly either, which is the tell). Solo-mode correctness traced Personal view
never reaching a real client, no double-application across the two propagation consumers (disjoint target
sets by construction, and a same-name exists-check as a second guard), and the fork-then-target ordering.
Duplicates/regressions confirmed one producer of add-changes and exactly its three consumers, no other
spread-after-target-key site in `js/`, and that the update branch drops nothing an update row actually
carries. The **full suite has not been run**; due before a push.

**Not done by this fix**
- The **live site still has the bug** (v2026.09.6, `app-workouts.js?v=129`). It ships only with a tagged
  release; pushing master does not deploy.
- **Duplicates already written to real data are not removed**, and adds that never reached a sibling week,
  a solo copy or a client's plan are not re-sent. Both need a look at the real data first.

**Detection query — read-only, NOT run (no SQL access from this session).** Lists workouts edited since the
bug went live that hold the same exercise more than once with identical settings. Legitimate repeats (a
warm-up row and a working row) normally differ in sets or notes, so they should not appear. Run it in the
Supabase SQL editor and look at the result; nothing here changes data. Any deletion afterwards goes through
`sql-safety`, keeps the lowest-`order_index` row of each group, and only after Jake has seen the list.

```sql
select t.id                                   as workout_id,
       t.name                                 as workout,
       t.program_id,
       t.client_id,
       t.updated_at,
       e.exercise_name,
       count(*)                               as identical_copies,
       array_agg(e.id order by e.order_index) as row_ids
from workout_template_exercises e
join workout_templates t on t.id = e.template_id
where t.updated_at >= '2026-09-17'
group by t.id, t.name, t.program_id, t.client_id, t.updated_at,
         e.exercise_name, e.exercise_type, e.metric_type, e.sets, e.sets_json::text, e.notes, e.superset_group
having count(*) > 1
order by t.updated_at desc, identical_copies desc;
```

Closes only on Jake's confirmation (or, after release, a test that went red before the fix and green after
running against the released code).
