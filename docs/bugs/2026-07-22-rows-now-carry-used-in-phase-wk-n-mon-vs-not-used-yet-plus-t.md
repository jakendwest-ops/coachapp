---
id: 2026-07-22-rows-now-carry-used-in-phase-wk-n-mon-vs-not-used-yet-plus-t
status: open
priority: medium
reported: 2026-07-22
---

# rows now carry ↳ Used in <phase> · Wk N · MON vs Not used yet, plus the exercise count

✅ **PICKER HALF FIXED + LIVE 2026-07-23 (b53dbfc)** — rows now carry `↳ Used in <phase> · Wk N · MON` vs `Not used yet`, plus the exercise count. Needs your eyes. The **Library page** half is untouched and still needs its own scoping session. — **Library page is messy / poor UX — Jake wants a scoping session, not a fix.** 2026-07-22, screenshot (#library, Personal view): a flat undifferentiated list of templates with duplicates ("Full Body" ×2) and week-suffixed entries, only an emoji, a name and an exercise count per row. Jake: "not clear to the user or good UX. this may need a scoping session on its own." **Do not build — scope it with him first.**

---

**🔁 RE-REPORTED LIVE by Jake, 2026-08-14 — 23 days after this row was opened.** Verbatim: *"From
screenshot 1 you can see that threshold intervals is being used (2 x 20 minute intervals) however when I try
to add this session into the Thursday workout slot it does not appear to be in use, and therefore I cannot
select it."* His screenshot shows **four identical** `SkiErg - Threshold Intervals / SkiErg / Not used yet /
1 exercise` rows.

The 2026-07-23 half-fix (`b53dbfc`) added the usage LABEL so duplicates could be told apart. It did not
remove or group them, did not widen the pool, and did not widen the usage lookup. Four causes now confirmed:

1. **The pool excludes in-programme workouts outright.** `_refreshProgramTemplates`
   (`js/app-programs.js:2120`) filters `.is('program_id', null)`, and `saveNewTemplate` stamps
   `program_id` on anything built via "+ Create new workout (this day only)". So the session Jake wants is
   *permanently invisible to the picker* — matching "therefore I cannot select it" exactly. The four rows he
   IS seeing are different library rows sharing a name.
2. **Usage is scoped to `program_phase_workouts` only** (`:832-839`) — never `client_program_workouts`, so a
   self-assigned solo programme reads "Not used yet".
3. **Fork-on-edit manufactures the duplicates.** `_cloneSharedMasterTemplate` (`js/app-workouts.js:2360`)
   keeps the name and leaves `generated_from_phase_id` null, so each "your changes now apply only to this
   one" fork lands back in the library. Duplicate a week 3× and edit each → 4 same-named rows.
4. **It fails OPEN**: on a usage-query error (`:837`) every row silently reads "Not used yet".

**Same root cause as [[2026-08-14-session-edits-are-not-propagated-to-duplicated-sessions]]** — no concept
of session identity. Jake chose a real `family_id` column over smarter name-matching. **Planned session 2 of
3**, shipping with the propagation fix since both need the migration.
