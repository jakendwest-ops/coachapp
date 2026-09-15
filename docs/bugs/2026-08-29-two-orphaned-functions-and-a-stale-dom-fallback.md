---
id: 2026-08-29-two-orphaned-functions-and-a-stale-dom-fallback
status: closed
priority: low
reported: 2026-08-29
closed_by: "Both removed; a repo-wide grep for each now returns nothing (addExtraStrengthSet) or only the caller (sd-save-library). Fixed 4bf805d."
status_detail: "CLOSED 4bf805d. addExtraStrengthSet removed (zero references); the sd-save-library fallback removed (that id exists nowhere). addExtraStrengthSet (app-runner.js:2076) has zero references repo-wide - its onclick died with the wizard, superseded by addTableRow. saveTemplateToLibrary's fallback getElementById('sd-save-library') targets an id that exists nowhere; the sole caller always passes 'this', so it is harmless, but it documents a button openSessionDetail explicitly says it no longer renders."
---

# Two orphans left by the wizard deletion

Found by the weekly full-file review (Agent C). Both are cleanup, filed so they are not rediscovered.

1. **`addExtraStrengthSet` (js/app-runner.js:2076-2080)** — **zero** references repo-wide. Its
   `onclick` lived in the deleted wizard; the only remaining copy is in a worktree. Superseded by
   `addTableRow`.
2. **`saveTemplateToLibrary`'s fallback (js/app-workouts.js:2820)** —
   `document.getElementById('sd-save-library')` targets an id that **exists nowhere**. The sole caller
   (`app-programs.js:2124`) always passes `this`, so it is harmless — but the fallback documents a button
   that `openSessionDetail:486-487` explicitly says it no longer renders.

These are the residue of the wizard deletion, the same source as
`2026-08-12-dead-code-post-wizard-deletion-runner` and
`2026-08-17-dead-code-and-lost-affordances-after-the-wizard-deletion`. **Worth consolidating with those
two rather than fixing in isolation** — three rows now describe one cleanup.

**Closes when:** both are removed (or the fallback's id restored if the button returns), and a grep for
each name returns only the definition site or nothing.

---

## CLOSED 2026-08-29 (`4bf805d`)

Both removed, each verified unreferenced **before** deletion rather than after:
- `addExtraStrengthSet` — a repo-wide grep over `js/ tests/ index.html css/ scripts/` returned only the
  definition line. Superseded by `addTableRow`; its `onclick` died with the wizard on 2026-08-11.
- `saveTemplateToLibrary`'s `sd-save-library` fallback — that id exists nowhere, and
  `openSessionDetail:486` says explicitly that the button no longer renders. Harmless (the sole caller
  always passes `this`), but a fallback naming a dead element documents an affordance that is gone.

**The consolidation this row suggested was NOT done** — it proposed merging with
`2026-08-12-dead-code-post-wizard-deletion-runner` and
`2026-08-17-dead-code-and-lost-affordances-after-the-wizard-deletion`. Those two remain open and still
describe the same cleanup. Closing this row does not close them, and a future pass should treat the
three together rather than picking off whichever is in front of it.
