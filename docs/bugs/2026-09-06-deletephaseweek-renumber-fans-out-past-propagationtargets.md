---
id: 2026-09-06-deletephaseweek-renumber-fans-out-past-propagationtargets
status: open
priority: medium
reported: 2026-09-06
status_detail: "Found by the 2026-09-06 full-file review (Agent A), verified at source. js/app-programs.js:2457 renumbers client_program_workouts for ALL assignees with no _propagationTargets filter, unlike its three siblings at :1932, :2342 and :2070. Latent: reaching it needs a personal programme that still carries real-client assignments."
---

# deletePhaseWeek's renumber is the fourth fan-out and the only one without the guard

`js/app-programs.js:2455-2460` reads every `client_program_workouts` row for the later slots and
decrements `week_number` on each, for **all** assignees.

`_propagationTargets` (`:1330`) returns every assignment for a coach, but **filters to the user's own
solo record when the role is solo** — so a Personal-view edit cannot reach into real clients' plans.

Its three other callers all use it: `generatePhasePeriodization:1932`, `duplicatePhaseWeek:2342`, and
`_deleteClientCopiesForSlots:2070`. That last one's comment (`:2056-2060`) says it was added because
the additive fan-out was given this guard and the destructive one was not — *"the 5th time this exact
drift has bitten."* **This loop is the fourth sibling and was left outside the fix.**

Consequence: in Personal view, deleting a week from a phase of a programme that still carries real
client assignments shifts those clients' week numbers by one — their plan silently reindexes.

`step()` defaults to not expecting rows (`:2422`), so these updates are not rowcount-checked either.

## Why latent rather than reachable

`renderPrograms:929` lists only personal programmes in solo view, and `moveProgramToPersonal:1356`
refuses to reclassify a programme while real clients are assigned. So the state needs a programme that
became personal before clients were attached, or pre-migration data — **not verified to exist**. That is
nonetheless exactly the reachability profile `_propagationTargets` was written to defend.

**Closes when** the renumber filters through `_propagationTargets` like its three siblings, proven by a
spec in solo role asserting a real client's rows are untouched — red before, green after.
