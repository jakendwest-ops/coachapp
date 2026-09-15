---
id: 2026-09-05-coach-library-last-used-under-reports-because-clients-train-clones
status: open
priority: medium
reported: 2026-09-05
status_detail: "Found by the whole-branch review of the Library 'last used' work, 2026-09-05. Jake asked whether it needed fixing now and the answer was no — it affects only the COACH view, and fixing it means designing the coach row, which the spec deliberately defers. NOT a defect in the solo/personal feature that shipped alongside it. Trigger to fix: when coach clients are training assigned programmes and Jake starts using the coach Library to decide what to reuse."
---

# Coach Library: "Last used" is an edit date wearing a usage label

`js/app-workouts.js` — `renderWorkoutTemplates` sets `t._lastUsed` to the more recent of
`workout_templates.updated_at` (edited) and the newest `workout_logs.date` carrying that `template_id`
(trained). For a SOLO user both halves work: they train their own personal templates directly, so the
log points at the same row the Library lists.

**For a COACH it does not.** Clients do not train the master template — they train an assigned CLONE,
and the clone's log carries the CLONE's `template_id`, not the master's. So the master's trained half
is permanently empty and its row falls back to the edit date.

**The consequence is a label that misleads rather than merely under-informs.** A master template can
read "Last used 4 months ago" while clients trained it yesterday. The page's whole purpose is to
answer "what have I actually been using" — a wrong answer there is worse than the old alphabetical
list, which at least claimed nothing.

## Why it was not fixed with the feature

Coach and Personal share `renderWorkoutTemplates` and differ by one line (the title). The spec
(`docs/superpowers/specs/2026-09-04-library-last-used-design.md`, "On not forking yet") argues for
building once and splitting only when Coach genuinely diverges. This IS that divergence — the first
concrete thing that makes the coach row a different design problem rather than a copy.

## Options when it is picked up

1. Resolve clone → master when reading trained dates. **Confirm the linking column exists before
   relying on it** — this has not been verified.
2. Give the coach row a different label entirely (e.g. "Assigned to 4 clients"). The coach's question
   may not be "when did I last use this" at all.

Option 2 is likely better and is a design question, not a code fix.

## Related

- Same review found `2026-09-05-library-search-term-persists-across-a-view-switch`
- Spec: `docs/superpowers/specs/2026-09-04-library-last-used-design.md`
