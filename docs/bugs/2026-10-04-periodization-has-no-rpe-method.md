---
id: 2026-10-04-periodization-has-no-rpe-method
status: open
priority: medium
reported: 2026-10-04
status_detail: "REPORTED BY JAKE 2026-10-04, with a phone screenshot of the Periodization modal (Type: None / Linear / Undulating; Start %1RM / End %1RM; Add a deload week): 'Add periodization should come with a % and RPE tab so the user can choose how they wish to periodize their training'. WHAT EXISTS: periodization only steps a percentage of the stored 1RM - generatePhasePeriodization rewrites intensityMin/Max on every Week-1 set that carries one (_applyWavePct; a '% of today's top set' back-off keeps its typed percentage, Jake's 'option 2' of 2026-10-01). A set's RPE or RIR target (effortMin/effortMax/effortType, 0-10 in half points) is copied unchanged into every generated week. SCOPED 2026-10-04: one OR the other per phase (form answer) - a '% 1RM | RPE' tab at the top of the modal. My proposed behaviour, for the prototype: the RPE tab offers Linear (start RPE to end RPE, with an optional deload week at a lower RPE) and Undulating (a Heavy / Moderate / Light RPE and reps); it steps the RPE target of every Week-1 set that has one, rounded to half points; a set written in RIR converts (RIR = 10 - RPE) so 'harder' means the same thing; weights and '% of top set' back-offs stay as typed; the phase chip reads 'Linear RPE 7>9'; the choice is stored in the phase's periodization_config (untyped jsonb) so no database change is needed and every existing phase stays on %; a heads-up shows when Week 1 has no set to step (otherwise Generate would silently copy week 1). NEXT: shown in the same prototype as the program page; nothing built."
closing_conditions: "Jake reacts to the prototype, approves, and after the build sets up an RPE-periodised phase on his phone and confirms the generated weeks step the way he expects."
---

# Periodization: add an RPE method beside %

**Closes when:** see `closing_conditions`.

Jake, 2026-10-04: "Add periodization should come with a % and RPE tab so the user can choose how they wish to periodize their training"
