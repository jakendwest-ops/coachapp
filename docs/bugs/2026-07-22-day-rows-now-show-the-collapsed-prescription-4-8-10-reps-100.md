---
id: 2026-07-22-day-rows-now-show-the-collapsed-prescription-4-8-10-reps-100
status: fixed-awaiting-jake
priority: high
reported: 2026-07-22
status_detail: "fixed — awaiting Jake"
---

# day rows now show the collapsed prescription (4 × 8–10 reps · 100kg · RPE 8 · 2:00 rest) on all four surfaces,

✅ **FIXED + LIVE 2026-07-23 (b53dbfc)** — day rows now show the collapsed prescription (`4 × 8–10 reps · 100kg · RPE 8 · 2:00 rest`) on **all four** surfaces, via one shared `_fmtSetDetail` that replaced two drifted copies. Needs your eyes on real programs. — **Day rows show only exercise name + set count — no actual prescription.** Jake, 2026-07-22 (clarified): "they just show exercises and number of sets. it doesnt show any detail of the weights, rest period, rest etc. its not good UX or helpful to a user who wants to look at their week ahead to see what the plan has in store for them." Applies to **both** the client/solo Workouts page (`renderClientWorkoutsPage` day rows) and the Programs builder slot preview (`renderPhaseWeekGrid`). The data is already in `sets_json` and the formatting logic already exists (`openSessionDetail` / the template-card preview build full "8–10 reps · 60kg · 2:00 rest · RPE 8" strings) — this is a display gap, not a capture gap. **Scope with Jake before building** (how much detail per row before it gets noisy on mobile).
