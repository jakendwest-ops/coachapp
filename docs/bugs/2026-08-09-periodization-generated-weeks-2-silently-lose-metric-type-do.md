---
id: 2026-08-09-periodization-generated-weeks-2-silently-lose-metric-type-do
status: fixed-awaiting-jake
priority: high
reported: 2026-08-09
---

# periodization-generated weeks 2+ silently lose metric_type, downgrading every cardio/interval/jump/timed exerc

**🔴 LIVE BUG — periodization-generated weeks 2+ silently lose `metric_type`, downgrading every cardio/interval/jump/timed exercise to plain weight-and-reps.** Found 2026-08-09 during superset scoping, then **verified directly in the source, not inferred**: `generatePhasePeriodization` (`app-programs.js:1527-1531`) builds its clone rows with `exercise_type` but **no `metric_type`**. Its sibling `_cloneTemplateForClient` (`app-programs.js:350`) carries it, with a comment describing this exact failure verbatim — *“Omitted here until 2026-07-22, so every ASSIGNED copy silently fell back to weight_reps”* — and `_cloneSharedMasterTemplate` (`app-workouts.js:2341`) carries it too. **The same fix was applied to two siblings and this third was missed** — fix-the-class-not-the-instance, now at least the 6th time in this codebase. **Real-world effect:** build a periodized phase containing a SkiErg interval or a Box Jump, generate weeks 2–4, and every generated week renders and runs those as weight×reps — no duration, no distance, no HR/watts capture, no jump height. Week 1 is correct, so it looks like the later weeks were built wrong. Silent at every layer: the source select is `workout_template_exercises(*)` so the value was always available, and a missing key is not an error in JS, in the insert, or in Postgres. **Fix is one line**, in a file the superset work will edit anyway.

---

**✅ FIXED + LIVE `d4e415e` (verified 2026-08-11).** Confirmed three ways rather than assumed: the commit
is an ancestor of `origin/master`; `metric_type: ex.metric_type || 'weight_reps'` is present in the shipped
source at BOTH clone sites (`app-programs.js:352` and `:1567`); and `tests/periodization-metric-type-2026-08-09.spec.js`
passes. Note the value is `|| 'weight_reps'`, not `|| null` — the column is NOT NULL DEFAULT 'weight_reps'
and an explicit NULL does not take that default, which the pre-push review caught in my own first fix.

Relabelled `open` → `fixed-awaiting-jake` during the 2026-08-11 save: it had been sitting `open` after
the fix shipped, and `ledger-drift` could not catch it because the body text never claimed FIXED. **This is
a relabel, not a close** — it leaves the ledger when Jake confirms it on live.
