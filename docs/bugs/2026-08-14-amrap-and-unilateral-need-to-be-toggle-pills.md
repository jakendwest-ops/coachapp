---
id: 2026-08-14-amrap-and-unilateral-need-to-be-toggle-pills
status: fixed-awaiting-jake
priority: medium
reported: 2026-08-14
---

# AMRAP and Unilateral as toggle pills, and unilateral L/R in the runner

**Jake, 2026-08-14, verbatim:** *"We should include AMRAP and Unilateral as pills that the user can toggle
on/off for each exercise. Unilateral should then appear in the runner as left / right to allow the user to
enter weight and reps on left side and then right side."*

**The runner half was already built — completely.** `_blankTableRow` (`js/app-runner.js:384`),
`renderStrengthTable`'s two-sub-row L/R branch (`:665-678`), `_syncLoggedSetsFromTable` (`:404`), the
`workout_log_sets.side` column with its CHECK constraint, `_setDetailsLine`'s "L 20×10, R 18×10" read-back,
and the two-line imbalance chart (`js/app-progress.js:1688`) all shipped previously, with five spec files
covering them. **The only gap was discoverability:** unilateral's sole on-switch was one option inside a
`<select>` labelled "Type". That is why it read as missing.

AMRAP is a REVERSAL: removed 2026-08-11 (`eb08be1`) on Jake's own instruction, restored today on his own
instruction. Safe to reverse because it was trimmed as *unused surface*, never as a bug — unlike `assisted`,
removed the same day because it corrupted `weight_kg`.

**✅ FIXED + LIVE `d337418` (2026-08-14).**
- AMRAP is **per-set** (Jake's explicit choice — "3 × 8, then 1 × AMRAP" is the real idiom), restored to
  the `_cleanTemplateSets` ALLOWLIST, the pill row, `_fmtSetDetail`, `openSessionDetail`, `openTemplate`.
- **New on top of the revert:** the runner's target column now shows `AMRAP`, or `8–10+` when a rep floor
  is prescribed alongside it (`_buildTargetCols`, `js/app-runner.js`).
- Unilateral is an exercise-level pill that writes THROUGH the existing `att-type` select, which stays the
  source of truth. Driven from `renderTemplateSets` — the one choke point every type change flows through —
  so it cannot show stale state.
- Added a **"per side"** annotation: a unilateral prescription previously read identically to a bilateral
  one, so "8–10 reps" gave no clue whether that was per side or in total.

Caught by pre-push review and fixed before shipping: `flushTemplateSets` preserves unrendered fields, so a
stale `amrap` survived a type switch and produced "AMRAP jumps" — three surfaces disagreeing about one set.
Gated once at the allowlist rather than three times at the render sites.

**Closes when:** Jake toggles both pills on a real exercise, sees "per side" in his plan, and sees AMRAP in
the runner's target bar during a session.

---

**PARTIAL — the runner half was still missing, fixed 2026-08-19 (`0d1d80b`).** Jake re-reported this as
*"the unilateral pill does not exist ... it didnt appear in the runner"*. Investigation showed the PILL was
fine all along — it renders in both the builder and runner add-exercise modals, proven by driving each — and
that this row's OTHER half, "unilateral L/R in the runner", shipped too. What never existed was any
**per-side indicator in the runner**: `_fmtSetDetail` gained "per side" on 2026-08-14, `_buildTargetCols`
did not, and AMRAP got its runner badge in that same change while unilateral did not.

Recorded here rather than closing this row: it is still `fixed — awaiting Jake` on Jake's own confirmation,
and the re-report is its own file (`2026-08-19-unilateral-pill-does-not-exist`).

**Lesson worth keeping:** I "verified" the pill twice, on the wrong screen both times, because this row
bundles two features under one heading. A bundled row invites a partial verification that reads as complete.
