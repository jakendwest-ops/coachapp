---
id: 2026-09-06-periodization-reps-is-an-unescaped-stored-attribute-and-the-checker-is-blind
status: closed
priority: high
closed_by: tests/periodization-attribute-escaping-2026-09-20.spec.js, scripts/check-escaping.selftest.mjs
reported: 2026-09-06
status_detail: "CLOSED 2026-09-20 on rule-(b) evidence, in the order this row demanded: the checker shown RED on the form first, then the sites escaped, then green — see the resolution at the bottom. Originally: 8th instance of the unescaped-render class, found by the 2026-09-06 full-file review (Agent C) and verified. js/app-programs.js:1744 interpolates free-text periodization reps into a plain value=\"\" with NO escaper; it round-trips through program_phases.periodization_config. scripts/check-escaping.mjs reports CLEAN over it — the checker is blind to this form, which matters more than the single site. Class swept: 45 sites of the shape, 1 exploitable."
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

---

## 2026-09-20 — fixed; closed on rule-(b) evidence

**In the order the row demanded.**

1. *Checker shown RED on the form first.* The new `scripts/check-escaping.selftest.mjs` (16 cases, 8 must-block / 8
   must-pass) ran against the UNCHANGED checker: exactly the four `cfg.` cases went red (the tier `reps` sink, a
   numeric `cfg` field, an `||` fallback, and the value as element text); the 12 existing-form cases already
   behaved. The render spec (`tests/periodization-attribute-escaping-2026-09-20.spec.js`) went red on the three
   hostile-input tests against the unchanged code.
2. *Sites escaped, checker taught.* The 6 `cfg.*` values that reach an attribute in `renderPeriodizationBody` now go
   through `escapeHtml(String(...))`; the 2 conditionals (`deloadWeek ? 'checked' : ''`, `? 'grid' : 'none'`) are
   computed once into a local so the template interpolates a constant.
3. *Green.* The self-test passes (16 behaved), the checker is clean over the real `js/` tree, the render spec passes
   (5), and 47 specs across the periodisation, escaper round-trip, builder and programme files pass.

**The row's open question is answered.** It said *which part defeats the rule is unverified — the checker's internals
were not read.* Nothing about the syntax did: `FREE_TEXT` (the checker's hand-written list of field names that hold
human text) simply did not contain any name in `cfg.tiers?.[t]?.reps ?? repsDefault[t]`, so the interpolation was
never a candidate. `cfg.` is now on the list.

**Why `cfg.` and not `.reps`.** The row proposed extending the list with `.reps`. Measured over `js/` first: `.reps`
would flag 3 runner sites (`s.reps||'—'`, a `type="number"` value, and a `parseInt` result) that are not the
cross-user class — the row itself names the number inputs as safe. A rule that cries wolf gets switched off, so it is
keyed on the object instead; `cfg.` occurs only in this modal (8 interpolations). Limit: keyed on the variable *name*.

**What the bug actually did** (recorded from the red run): a stored `foo" onmouseover="…` added live `onmouseover`
and `data-x` attributes to the input, and a value with a plain quote in it — `it's "10-12" & 3<4` — was truncated to
`it's ` with stray attributes. So it also corrupted *honest* input containing a double quote, and saving the modal
would then have stored the corrupted value.

**One more thing the self-test found.** `check-escaping.mjs`'s main loop did not skip full-line `//` comments (its
first loop did), so an example written in a comment was flagged as code — its own docstring spells its example as
`<interp>` to dodge that. Made consistent; the tree stays clean and a self-test case pins it.

**Neuter proofs** (scratch copies; the repo checker was never modified by them): drop `cfg.` from the list → exactly
cases 0–3 go red; drop the comment skip → exactly case 13 goes red. The self-test is wired into `checks.sh` beside
rule 9d and blocks on its own failure.

---

## 2026-09-20 (later, same day) — the class sweep above missed a second sink; found by review, fixed

**What I got wrong.** The resolution above says the `cfg.*` values were the whole class and that `cfg.` occurs only in
the modal. That was true of the *name* and false of the *column*: `program_phases.periodization_config` is an untyped
jsonb column with more than one reader. `_periodizationLabel(ph)` (`js/app-programs.js`) reads the same config as `c`,
and its result — `Linear 60→80%`, `Undulating (85%/75%/65%)` — is interpolated **raw** into the phase header by
`openProgram`. `startPct`, `endPct` and the tier `pct` values are numbers *in the modal*, but the column does not
enforce that: a stored `"<img src=x onerror=…>"` there rendered as a live element every time the programme was opened,
not only when the modal was. Same direction as the row (coach → the same coach), same class. Two independent reviewers
(Agents A and C of the R1b–R1e review) found it separately.

**Why the sweep missed it.** It was keyed on the variable name `cfg`, and this reader aliases the object as `c`. Sweeping
by name finds the sites that use the name; sweeping by *column* finds the readers. The right sweep was
`grep -n periodization_config js/*.js` and reading every reader — I did that for the writers and the modal, not for the
label helper.

**Fix, at the source.** `_periodizationLabel` escapes each stored value with `escapeHtml(String(v))` (the `String()` is
load-bearing: `escapeHtml(0)` returns `''`, and a real `0` percent must still print). It is escaped where the value
enters the string rather than at the one call site, because the string is then composed and the checker cannot follow a
taint across a function return.

**Evidence.** `tests/review-followups-2026-09-20.spec.js`: hostile `startPct` / `tiers.heavy.pct` created a live `<img>`
in the built label on the unfixed code (red), escaped text after (green); the mirror — honest numeric and `0` values —
prints exactly as before under both.

**The column, swept this time (read-only, 2026-09-20).** `grep -n periodization_config js/*.js` — every reader of the
column: the two that put it in markup are the modal (`renderPeriodizationBody`, fixed 2026-09-20) and this label (fixed
above); `generatePhasePeriodization` feeds it to `_computePeriodizedPct`, which produces numbers, not markup (a
non-numeric stored value gives `NaN` in a generated workout — a data-quality matter, not an injection); the copy path
(`copyProgramToCoaching`) and the two selects only pass the value through unrendered. So the render-side class for this
column is now closed by reading, not by name.

**Named, not fixed.** The checker stays name-keyed; this sink stays outside its reach (its comment now says so). Other
untyped jsonb columns (`sets_json` and friends) were not swept by column in this pass.
