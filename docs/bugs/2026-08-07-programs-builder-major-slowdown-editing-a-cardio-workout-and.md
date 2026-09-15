---
id: 2026-08-07-programs-builder-major-slowdown-editing-a-cardio-workout-and
status: open
priority: high
reported: 2026-08-07
status_detail: "open (save half) / fixed — awaiting Jake (slowness)"
---

# Programs builder: major slowdown editing a cardio workout, and the edit does not save until a page refresh

**NEW — Programs builder: major slowdown editing a cardio workout, and the edit does not save until a page refresh.** Jake, live 2026-08-07: *"major slowdown on app when going into programs and editing the cardio workouts (tues/thurs/sat) and then not saving the changes. Page takes ages to load/save or the changes did not save at all until i refreshed the page."* **Two symptoms, possibly one cause, possibly two.** (a) Slowness on entering the Programs builder / opening a cardio workout for edit AND on save. (b) A save that appears not to land until the page is refreshed. **Distinct from the 2026-07-06/07-13 Workouts-page delay family** — that pair was measured 2026-08-05 (nav ≈242ms, create+display ≈450ms, both fast) and covers `renderWorkoutTemplates`/`saveNewTemplate`, a different surface entirely. This report is the **Programs builder** path (`openProgram` → phase → day slot → Edit workout → edit exercise → save). Symptom (b) is the same *shape* as the 4×-reported add-exercise-not-appearing bug root-caused 2026-07-30 (`saveExerciseToTemplate` called `closeModal` then re-read the deleted modal's DOM, threw, and aborted before the re-render — the INSERT had already committed, so the change was real but never repainted). **That fix landed on the ADD path only; its EDIT-path sibling `saveEditTemplateExercise` was not checked** — fix-the-class candidate #1, to be verified not assumed. Tues/Thurs/Sat = the same cardio workout in 3 slots, so the post-save propagation fan-out (`_checkClientPlanPropagation`/`_propagateExerciseChangeToTemplates`/`_checkSiblingPropagation`) is candidate #1 for the slowness. **Per les-052: measure live, do not re-read code and reason.** — **INVESTIGATED 2026-08-07, split into two halves with different confidence.** Jake clarified via AskUserQuestion: (i) *"clicking save did nothing/the save button didnt work. The only way to make my edits appear was to refresh the page"* — so the write DID land, the UI never repainted; (ii) Tues/Thurs/Sat are **three DIFFERENT** cardio workouts, which rules out fork-on-edit as the cause of the "didn't save" half. **SLOWNESS — CONFIRMED STRUCTURAL DEFECT, root cause found.** `openProgram` (`app-programs.js:846`) is the **only one of four** sibling reuse-pool `workout_templates` queries with no `.limit()` — `app-workouts.js:604`/`:771`/`:2647` all carry `.limit(100)` from the 2026-07-07 slow-page fix; the Programs builder was missed (fix-the-class gap). It rides the 200-row server cap AND pulls a nested `workout_template_exercises` join for every row; `_buildProgramTemplatePool` (`:797`) then adds a further round-trip per 100 templates. Compounding it: `_editPhaseWorkout` (`:1822`) sets `backFn: () => openProgram(programId)`, so **every "Back to program" press re-runs the entire load**. Measured 242ms end-to-end — but **on the E2E account, which holds only 9 templates**, so that number is NOT representative of Jake's library; cost scales with library size. **SAVE HALF — NOT REPRODUCED, 2 independent attempts, both green.** Drove the real UI end to end (own fixture: program→phase→cardio template in a Tue slot; real `openProgram`→`_editPhaseWorkout`→real row Edit button→real `#ts-duration-0` edit→real Save click) in TWO shapes: (a) single slot — DB updated 5:00→9:30, modal closed, DOM repainted with 9:30, zero page errors; (b) **two slots sharing one template_id** (the "Duplicate week" shape) — forked correctly to a clone, clone holds 9:30, slot repointed, DOM repainted, zero errors. Also positively ruled out by code read: the 2026-07-30 read-after-`closeModal` crash is NOT present on the edit path (`saveEditTemplateExercise` reads `#att-notes`/`#att-superset` at :1968-69, BEFORE `closeModal` at :1977); and a stale `_builderWeekData` cache is not it (Back calls `openProgram()`, a genuine refetch). **Stopped rather than guess a 3rd fixture variation** — per the 3-strike rule and les-052. Next step is evidence from Jake's OWN session (console during a real repro), not another fixture. **Unified hypothesis worth testing first**: Jake's own console has shown Edge "Tracking Prevention blocked access to storage" ×12 — if that throttles supabase-js's session-token read on every API call, it explains BOTH halves at once (everything slow; a save still in flight reads as "did nothing", then shows up on refresh) and would also close the 2026-07-06/07-13 rows. — **🔴 TRACKING-PREVENTION HYPOTHESIS IS DEAD, killed by real evidence from Jake's own account 2026-08-07.** Two independent checks: (1) ran the full repro in **real Microsoft Edge** via Playwright `channel:'msedge'` (verified real Edge, `Edg/151`) — **zero** Tracking Prevention console messages, because Playwright launches Edge with a fresh automation profile where Tracking Prevention is not applied. So automation *cannot* reproduce it — that limitation is now a verified fact, not the assumption 2026-08-05 made. (2) Jake pasted a diagnostic into his OWN Edge console and returned: `localStorage: "OK"`, `sessionTokenInStorage: true`. **Storage is not blocked.** Do not revive this theory without new evidence. **SLOWNESS — FIXED 2026-08-07, sized from Jake's real numbers.** His console returned `templatesLoaded: 77`, `exerciseRowsLoaded: 409`, `openProgramQueryMs: 391` — so `openProgram`'s eager pool fetch alone cost **391ms**, plus `_buildProgramTemplatePool`'s follow-up round-trip, on EVERY program open AND every "Back to program" press (`_editPhaseWorkout` sets `backFn: () => openProgram(programId)`). Editing Tue/Thu/Sat = 4× that cost in dead waiting. **Fix: the pool is no longer fetched by `openProgram` at all** — nothing that function renders reads it; its only consumer is `_renderWorkoutPickerResults`, so it is now built lazily on first day-slot-picker open (`_openWorkoutPicker`, now async, with a loading state and a closed-during-fetch guard). `_refreshProgramTemplates` is now the single source for that query and gained the `.limit(100)` its three siblings have had since 2026-07-07. **Note: `.limit(100)` alone would have changed NOTHING for Jake — 77 < 100.** The eager-fetch removal is the actual fix; shipping only the "obvious" missing-limit fix and declaring victory would have been a false close. An in-memory cache of the pool (the originally-proposed variant) was deliberately rejected — slot previews come from `loadAllPhaseWorkouts`, and caching risked exactly the stale-render symptom Jake reported. 3 red→green tests (`tests/programs-builder-perf-2026-08-07.spec.js`), verified RED by temporarily restoring the eager build. Cache-bust app-programs v29→30. **SAVE HALF STILL OPEN AND STILL UNEXPLAINED** — storage is fine, so that theory is gone too; needs Jake to catch it in the act (console open, screenshot the `saveEditTemplateExercise` log lines). **Also found: STATUS.md's "Live state" line claims app-programs v27; actual was v29 before this fix — module-version drift, correct at /save.**

---

## 2026-09-04 — first NON-Jake sighting of the "save does nothing" shape

The open half of this row is a save that appears not to land until a page refresh, and it has been
blocked on catching it live because two fixture-driven attempts came back green.

On 2026-09-04 a full-suite run produced `programs.spec.js:553` failing with:

```
waiting for locator('#edit-template-modal') to be detached
  19 x locator resolved to visible <div class="modal-overlay" id="edit-template-modal">
```

**The save modal never closed** — the same shape as *"clicking save did nothing"*. It passed 5/5 in
isolation immediately afterwards, so it is position-dependent, and it is logged as the fourth entrant
on [[2026-08-14-test-gate-flakiness-returned-across-two-unrelated-files]].

**This is NOT a reproduction of this row.** Different surface (the Programs-builder template editor,
not a cardio workout edit), one observation, green alone. But it is the first time anything other than
Jake has seen a save fail to complete, and Playwright captured a **trace and a video**:

    test-results/programs-Duplicate-week-fo-274d1--overwriting-the-shared-one-chromium/

**Read those before building a third fixture.** The two previous attempts here failed by trying to
construct the conditions; this run produced them by accident and recorded everything.

**CORRECTION, same session:** the trace and video are **GONE**. Playwright clears `test-results/`
at the start of every run by default (no `preserveOutput` is set), and the 5x isolated re-run done to
characterise the flake — moments after it happened — destroyed the artefacts from the run that
produced it. `test-results/` is now empty, verified.

So there is nothing to read, and the pointer above is dead. The lesson is worth more than the trace
would have been: **when a rare flake produces artefacts, COPY THEM OUT BEFORE running anything else.**
The instinct to immediately re-run and characterise is exactly what deleted the evidence.
[[feedback_reports_success_doing_nothing]] has a sibling — an investigation step that destroys what it
was investigating.

**A config fix was attempted and MEASURED NOT TO WORK.** `preserveOutput: 'failures-only'` governs
whether artefacts are kept for passing tests WITHIN a run; it does nothing about Playwright cleaning
`outputDir` at the START of the next one. Tested directly: a deliberately failed run left 1 artefact
directory, and a subsequent run of a DIFFERENT, PASSING spec reduced it to 0. The setting was reverted
rather than shipped with a comment claiming a property it does not have — that would have been the
same reports-success-while-doing-nothing shape, in the mechanism meant to preserve the evidence of it.

**So the fix is a habit, not a setting: after any run with failures, copy `test-results/` somewhere
else BEFORE running anything again.** There is currently no mechanism enforcing that, and saying so
is more useful than a setting that looks like one.

---

## 2026-09-04 — a mechanism that would explain symptom (b), found elsewhere

**HYPOTHESIS, not a finding.** Recorded because it is testable and because it arrived from a different
direction entirely, which is worth more than another fixture attempt.

The open half of this row is Jake's: *"clicking save did nothing / the save button didn't work. The
only way to make my edits appear was to refresh the page."* Two fixture-driven attempts to reproduce it
came back green, and the row has been blocked on catching it live ever since.

Investigating an unrelated test flake on 2026-09-04 produced a root cause with exactly that shape —
see [[2026-08-14-test-gate-flakiness-returned-across-two-unrelated-files]]:

> Every async render paints `Loading…`, awaits its queries, then writes `el.innerHTML`, **without
> checking whether the page is still the one that asked for it.** A render still in flight when the
> view changes lands afterwards and repaints over what is now on screen.

### Why that could be symptom (b)

The row already establishes, from Jake's own clarification, that **the write DID land and the UI never
repainted**. The stale-render mechanism produces precisely that:

1. Save commits.
2. The save's own re-render runs and paints the NEW state.
3. An earlier render — still awaiting from before the save — resolves and repaints the OLD state over it.
4. The user sees their edit vanish, concludes it did not save, and refreshes.
5. **The refresh shows the edit**, because a fresh load has no stale render racing it.

Step 5 is the detail that makes this fit rather than merely rhyme: "only a refresh made it appear" is
the signature of a paint being overwritten, not of a write failing.

### Why it is only a hypothesis

- Jake's report is the **Programs builder editing a cardio workout**; the reproduction was the solo
  dashboard versus the Library page. Same mechanism class, different surface, and this row has been
  burned once already by a confidently-wrong root cause (the tracking-prevention theory).
- The builder's edit path uses a MODAL, and `navigate()`'s guard covers `#main-content`, not modal
  overlays. A render clobbering the page body would not explain a modal misbehaving — so if the
  builder symptom involves the modal rather than the page beneath it, this is the wrong mechanism.
- No measurement has been taken on the builder path at all.

### What would settle it, cheaply

The guard added on 2026-09-04 **logs** when it refuses a stale paint:

    [navigate] stale render refused — the page changed while it was loading { rendered: …, now: … }

So the next time Jake sees a save "do nothing", the console will say whether a stale render was
refused at that moment. **That is a passive test costing nothing** — no fixture, no third attempt at
reproducing it, and it either names the mechanism or rules it out on his own account.

If the warning does NOT appear when he reproduces it, this hypothesis is dead and should be recorded
as such rather than left to linger.
