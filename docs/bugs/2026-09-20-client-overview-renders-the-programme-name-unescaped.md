---
id: 2026-09-20-client-overview-renders-the-programme-name-unescaped
status: closed
priority: low
reported: 2026-09-20
closed_by: tests/review-followups-2026-09-20.spec.js
status_detail: "CLOSED 2026-09-20 on rule-(b) evidence (red before, green after). Found by the multi-agent review of R1b–R1e (Agent A), pre-existing, in a function R1d edited. Direction is coach → the same coach's own client Overview, so low."
---

# The client Overview interpolated the assigned programme's name raw

`clientOverviewTab(client, programName)` (`js/app-clients.js`) put `${programName}` into a `<span>` with no escaper. The
caller passes `progAssign?.programs?.name` — free text the coach typed when naming the programme — so a programme called
`<img src=x onerror=…>` rendered as a live element on that client's Overview. Coach → same coach (self-XSS): another
coach cannot read this programme's name through the embed, which is why this is low and not high. It is still an unescaped
render of typed text, the ninth in a class this repo has tracked since 2026-07.

**Why the escaping checker missed it.** The name arrives as a function *parameter*. The checker's free-text list is made
of member names (`.name`, `.title`, …) and this is a bare identifier, so the interpolation was never a candidate.

**Fix.** `escapeHtml(programName)`. `programName` is now on the checker's free-text list too (measured first: 0 findings
over the fixed tree, exactly the one sink over the unfixed one), with a self-test case for the BLOCK form and the fixed
form. **Red → green:** `tests/review-followups-2026-09-20.spec.js` — on the unfixed code an `<img>` element was created in
the built DOM; after, it is escaped text. The mirror (a normal name containing `—`, `'` and `&`, and no programme at all)
passes before and after.

**Known limit, unchanged:** the checker is keyed on names, so a tainted value that arrives under a name it does not list,
or that crosses a function return, is invisible to it. Sibling parameter-named sinks were not swept — a grep for
`${label}`-style interpolations returns constants (nav labels, metric labels) and could not be classified mechanically.
