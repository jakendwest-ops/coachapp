---
id: 2026-10-12-scope-creating-a-workout-on-the-fly-and-renaming-programs-to-training-plans
status: open
priority: low
reported: 2026-10-12
status_detail: "OPEN. Scoped with Jake 2026-10-12; his four answers are below. Not built; the next step is a prototype of the new Workouts and Training plans pages for his reaction, then a plan to approve."
---

# Scope: creating a workout on the fly, and a Workouts / Training plans split

## Jake's report (verbatim, 2026-10-12)

> 6. We need to scope how a user creates a workout on the fly, as not all users will want to create programs. Perhaps the 'workouts' page needs to be for workouts that have been created and used, and programs needs to be renamed training plans

## What exists today (for the scoping conversation)

- A freeform session: "Log a workout" on the dashboard ("Start a freeform session whenever you like") and the runner's custom workout; a workout can be saved to the library from a finished session.
- The Workouts page is the program-led view for a client (Up next hero, the program's phases and days, Recent sessions); the template library lives behind the coach/solo Workouts area.
- "Programs" is the container for phases and weeks; solo accounts add one to their plan.

## Questions for Jake (before any design)

1. Who is this for first: a solo user with no plan, a client whose PT gave them only single workouts, or both?
2. "On the fly": start empty and add exercises as you go (and then keep it), or pick from past sessions and tweak?
3. Should a finished on-the-fly session become a reusable workout automatically, or only when the user says "save"?
4. The rename: "Programs" to "Training plans" everywhere (nav, headings, copy, the coach's view too), and what does the Workouts page then hold: only created-and-used workouts, with the plan's sessions living under Training plans?

## What would close it

**Closes when** Jake approves a scoped plan (a prototype first, per his own rule), it is built and tested, and he confirms on his phone. This row is the scoping item itself; the build gets its own row.

## Decisions (Jake, 2026-10-12)

1. **Who first:** solo users with no plan (someone who just wants to train and log, without building a program).
2. **How:** start empty and add exercises as you go; nothing to set up first, and the session is logged.
3. **Reuse:** a finished on-the-fly session becomes a reusable workout only if the user taps "Save workout" on the finish screen.
4. **Rename and split:** "Programs" becomes "Training plans" everywhere; "Workouts" lists workouts that have been created and used, with a plan's sessions living under Training plans.

## Next

A tappable prototype (Workouts as created-and-used workouts, Training plans, and the empty-start flow), then his reaction, then a plan with the rename's blast radius (nav, headings, copy, the coach's view, specs) for approval. Related: the Workouts page refresh row (hero, plan and day list, recent sessions) is the same page and should be designed together.
