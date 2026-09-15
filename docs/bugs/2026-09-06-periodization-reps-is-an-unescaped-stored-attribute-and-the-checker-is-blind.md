---
id: 2026-09-06-periodization-reps-is-an-unescaped-stored-attribute-and-the-checker-is-blind
status: open
priority: high
reported: 2026-09-06
status_detail: "8th instance of the unescaped-render class, found by the 2026-09-06 full-file review (Agent C) and verified. js/app-programs.js:1744 interpolates free-text periodization reps into a plain value=\"\" with NO escaper; it round-trips through program_phases.periodization_config. scripts/check-escaping.mjs reports CLEAN over it — the checker is blind to this form, which matters more than the single site. Class swept: 45 sites of the shape, 1 exploitable."
---

# Periodization "reps" is an unescaped stored attribute — and `check-escaping.mjs` does not see it

`js/app-programs.js:1744`:

```js
<input class="field-input" id="pz-tier-${t}-reps" type="text" placeholder="Reps e.g. 3-5"
       value="${cfg.tiers?.[t]?.reps ?? repsDefault[t]}">
```

**No escaper at all.** The project rule is `escapeHtml()` for a plain attribute; this uses neither
`escapeHtml` nor `escapeAttr`.

Saved raw at `:1802` — `document.getElementById(...).value.trim()` — into
`program_phases.periodization_config` JSON, then re-interpolated on the next modal open. **Stored, not
reflected:** a value like `foo" onmouseover="…` breaks out of the `value=""` attribute and lands a live
event-handler attribute on the input, firing whenever that programme's Periodization modal is reopened.

Direction is coach → same coach (self-XSS), the same profile as the 7th instance (2026-08-29), not the
client→coach path of instances 4–6. That is why this is high and not critical.

## The finding behind the finding: the checker passes clean over it

`node scripts/check-escaping.mjs` exits 0 with no output while this site is live. **A clean escaping
run currently does not mean what it appears to mean.**

This is verbatim the lesson recorded on 2026-08-29 in `CRITICAL.md`: *"the checker must be shown RED on
this syntactic form BEFORE a clean run means anything — that is exactly how the 2026-08-16 'class
closed' claim was wrong about nine live sites."* The form here is an optional-chained, computed-member
expression with a `??` fallback, inside a nested template literal in a `.map()`. **Which part defeats
the rule is unverified** — the checker's internals were not read.

## The class was counted, not sampled

45 sites in `js/` match `value="${…}"` with no escaper. **Exactly one is exploitable — this one.**

| shape | count | verdict |
|---|---:|---|
| dates, ids, computed numbers, `type="number"` inputs | 44 | a quote cannot enter through the UI |
| `type="text"` free text (`pz-tier-*-reps`) | 1 | **this row** |

The two other `reps` fields that look identical — `app-workouts.js:1175` (`default_reps`) and
`app-runner.js:1890` (`s.reps`) — are `type="number"`, so `.value` returns `""` for anything containing
a quote. Named here so nobody re-derives them as findings later.

**Closes when** (a) `check-escaping.mjs` is shown RED on this exact syntactic form FIRST, then (b) the
site is escaped and the checker goes green — in that order. Fixing the site alone leaves the blind spot
and the next instance unfound, which is how this class reached eight.
