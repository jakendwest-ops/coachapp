---
id: 2026-08-17-renderclientweight-leaks-a-chart-on-every-save
status: closed
priority: medium
reported: 2026-08-17
closed_by: "tests/solo-dashboard-tiles-2026-08-30.spec.js 'every chart entry point destroys managed charts first' — RED when renderClientWeight's destroy is removed (flags renderClientWeight:932), GREEN with it."
status_detail: "CLOSED. _destroyManagedCharts() added before the innerHTML replace, plus a class guard over all 9 chart callers with two reasoned exemptions. Weekly full-file review. Verified by reading both twins — renderProgressWeight destroys, renderClientWeight does not."
---

# The coach's client Weight tab leaks a live Chart on every save

`renderClientWeight` (`js/app-progress.js:719-919`) replaces `el.innerHTML` at `:740` — detaching
`#weight-chart` — then calls `_renderMetricChart('weight-chart', ...)` at `:896`, **without ever calling
`_destroyManagedCharts()`**.

Both of that helper's guards miss on a rebuild: `Chart.getChart(el)` resolves the NEW canvas (undefined),
and `_activeCharts.filter(c => c.canvas !== el)` compares against the new element, so the old entry
survives. This is the mechanism spelled out in `renderProgressPBs`' own comment (`:2443-2448`), written
when the same leak was found there.

Its twin `renderProgressWeight` does destroy (`:1432`), as does every other chart entry point: `:601`,
`:1116`, `:1179`, `:1324`, `:1898`, `:2325`, `:2449`. This one was missed.

## Repro

Coach → a client → **Weight** tab → "Save entry" five times. `saveWeightLog:984` re-enters
`renderClientWeight` each time; `_activeCharts.length` grows by one per save, each a live Chart bound to
a detached canvas with its listeners and animation loop running.

Also via `deleteWeightLog:1023`, `saveWeightGoals:1005`, and Weight↔Overview round trips
(`app-clients.js:313` does `content.innerHTML = ''` with no destroy). Bounded only by eventually visiting
a tab that does destroy. One line.

---

## CLOSED 2026-08-30

`_destroyManagedCharts()` now runs **before** the `innerHTML` replace in `renderClientWeight`.

**Fixed in the same pass as the solo dashboard tiles, deliberately.** That change added a **third**
chart entry point, and shipping it beside a known-broken second is
[[feedback_fix_the_class_not_the_instance]] — the whole reason this row existed.

## The class guard, and why it is NOT "every caller must destroy"

My first version of the guard asserted exactly that, and it **flagged two callers whose fix would have
been a bug in the opposite direction**. `_destroyManagedCharts()` destroys **every** managed chart, so
the rule only applies to callers that rebuild a subtree containing OTHER charts:

| Caller | Verdict |
|---|---|
| `togglePerfHistory` | **Exempt.** Toggles a panel's `display` and renders into a canvas that PERSISTS. Nothing is detached, and `_renderMetricChart`'s own `Chart.getChart(el).destroy()` covers re-rendering into the same canvas. A blanket destroy would kill every other open panel's chart. |
| `_expandPerfSessionExercise` | **Exempt from THIS rule**, but it does leak narrowly — filed separately. |
| The other 7 | Must destroy. All do. |

Had I "fixed" the two, I would have broken working surfaces to satisfy a linter —
[[feedback_guard_risk_is_refusing_the_legitimate_user]] applied to a check rather than a user, and
[[feedback_measure_before_giving_a_gate_teeth]]: I read both before granting the exemption.

**Proven able to fail:** removing `renderClientWeight`'s destroy makes the guard report
`renderClientWeight:932`. An exemption list that only ever passes is decorative.

**One correction to my own earlier audit.** I first checked this class with an `awk` that looked back
**260 lines** for a destroy and reported all 9 callers clean. That crosses function boundaries, so it
was counting other functions' destroys. The spec scans within the enclosing function and found the two
the awk had missed. A window-based scan is not a scope-based one.
