---
id: 2026-07-13-6-more-unguarded-modals-double-tap-buried-overlay-silent-wro
status: fixed-awaiting-jake
priority: medium
reported: 2026-07-13
status_detail: "fixed — awaiting Jake"
---

# 6 more unguarded modals (double-tap → buried overlay → silent wrong save)

**MEDIUM — 6 more unguarded modals (double-tap → buried overlay → silent wrong save).** `showEditTemplateModal` (app-workouts.js:1848), `showEditExerciseModal` (:605), `showLogSessionModal` (app-runner.js:1935) each `await` BEFORE appending (a real race window, not just a fast tap) and each carries a live **Delete** button. `openSessionDetail` (app-workouts.js:35) removes the existing panel before its await, so two concurrent opens both append. Plus `showCreateTemplateModal`/`showAddExerciseModal`. Eight other modals in the codebase already have the guard.
