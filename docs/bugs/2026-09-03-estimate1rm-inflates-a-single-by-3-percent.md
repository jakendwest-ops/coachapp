---
id: 2026-09-03-estimate1rm-inflates-a-single-by-3-percent
status: closed
priority: low
reported: 2026-09-03
closed_by: tests/estimate1rm-single-2026-09-04.spec.js + tests-node/pure.test.mjs
status_detail: "CLOSED 2026-09-04. Jake decided as the training-domain authority: a one-rep set is a MEASURED 1RM. _estimate1RM now returns the weight unchanged at r=1. Both clauses satisfied — Jake confirmed the behaviour AND both tests went red before the fix (103.33333333333334 vs 100) and green after."
---

# `_estimate1RM` reports 103.33kg for a demonstrated 100kg single

`js/app-workouts.js:97-101` is plain Epley:

```js
function _estimate1RM(weight, reps) {
  const w = parseFloat(weight), r = parseInt(reps)
  if (!(w > 0) || !(r > 0) || r > _ESTIMATE_1RM_MAX_REPS) return null
  return w * (1 + r / 30)
}
```

At `r = 1` that is `w * (1 + 1/30)` = **w × 1.0333**. So a single at 100kg is reported as a
**103.33kg** one-rep max.

## Why this may be wrong

A one-rep set **is** a one-rep max — it is measured, not estimated. Every other rep count is a genuine
extrapolation and Epley is a reasonable one; at 1 rep there is nothing to extrapolate, and the formula
adds 3.3% the lifter has not demonstrated. Most implementations special-case it (`if (r === 1) return w`).

## Why it might be intentional, and why I am not deciding it

Jake is the PT here and the domain authority. There are defensible readings:

- **Leave it.** Epley applied uniformly is at least *consistent* — every data point on the e1RM chart is
  produced the same way, so the trend line is comparable even if the absolute number is 3% high.
  Special-casing 1 introduces a **discontinuity**: a 100kg×1 would report 100.0 while 100kg×2 reports
  106.7, so adding a rep would jump the "max" by 6.7kg.
- **Fix it.** The number is not decorative — it drives **%1RM prescription**, so a 3.3% inflation
  propagates into every percentage-based working weight built off that entry.

This is exactly the "who asked, and when did they last feel the pain" test
([[feedback_research_vs_real_use]]) — the answer should come from Jake's own lifting, not from me
quoting a formula.

## Where it actually reaches the user

Two different exposures, and they are **not equally arguable**:

**A. Live preview + manual 1RM entry (the arguable half).** `app-programs.js:667/682`,
`app-progress.js:355/375`, `app-runner.js:2739/2754` — the user types a weight and a rep count and the
app shows/saves an estimate. If they type `100 × 1` they are *asking for an estimate*, so a formula
answer is at least honest.

**B. Charts computed from LOGGED sets (the hard-to-defend half).** `app-progress.js:1839`
(`p.e1rm = Math.max(...sets.map(x => _estimate1RM(x.weight_kg, x.reps_achieved)))`) and
`app-progress.js:2482` (`best1rm`). Here the app is not being asked for an estimate — it is
**summarising something the user actually did**. A logged 100kg single is a fact, and charting it as
103.33 overstates real performance without the user ever asking for a projection.

If only one half changes, B is the one with the weaker defence.

## Related, but a different bug

[[2026-07-09-1rm-value-silently-shifts-by-0-5kg-when-the-entered-value-ma]] is about a **rounding/step**
shift on entry. This row is about the **formula at r = 1**. Both touch the same screens; neither
subsumes the other. Do not fold them into one row — [[feedback_bundled_rows_hide_half_a_bug]].

## Current state

`tests-node/pure.test.mjs` asserts the CURRENT behaviour, named so nobody mistakes it for approval:

```
test('_estimate1RM at 1 rep returns MORE than the weight lifted (current behaviour, questioned)')
```

So the app is not changed, and any future change turns that test red and forces a decision rather than
sliding through. Nine call sites read this one function, so a change is one edit — it is a judgement
question, not a refactoring cost.

**Closes when:** Jake says which behaviour he wants. If it changes, the unit test flips to the new
expectation in the same commit and the two chart sites (A/B above) are checked on live with a real
logged single.

---

## RESOLVED 2026-09-04 — Jake's answer: treat a single as exactly what was lifted

Asked as a question, not a bug, because it was a training-domain judgement. Jake's call:
**"treat 1 rep exactly as what was lifted."**

`_estimate1RM` (js/app-workouts.js) now returns the weight unchanged at `r === 1` and is otherwise
untouched. Both halves flagged in this row are fixed by that single edit, including the harder-to-
defend one — the charts at `app-progress.js:1839/:2482` that applied Epley to sets already LOGGED.

**One implementation, so one edit — verified rather than assumed.** 10 call sites across four modules,
and no second expression of the formula anywhere in `js/` (grepped `/30`, `1RM`, `epley` and variants).
`checks.sh` rule 9j pins it as a single-source fact and still passes.

**The label was fixed in BOTH places.** `≈ Epley estimate: 100.0 kg` would be a false claim on a
screen that is no longer estimating. Two sites print it — `app-programs.js:666` and
`app-runner.js:2739`, the known duplicate pair Phase 4 will merge — and both now read
`= 100.0 kg — a single IS your 1RM` at one rep, keeping the estimate wording at 2+.
[[feedback_fix_the_class_not_the_instance]].

**The discontinuity is accepted, not overlooked.** 100×1 reports 100.0; 100×2 reports 106.7. Adding a
rep raises the number by 6.7kg. One is measured, the other extrapolated — better than being reliably
3.3% wrong about the case we actually know.

**Red before, green after, at both layers** — which is clause (b) as well as clause (a):

| | before the fix | after |
|---|---|---|
| `tests-node/pure.test.mjs` | `103.33333333333334` vs expected `100` | 34/34 pass |
| `tests/estimate1rm-single-2026-09-04.spec.js` | `"≈ Epley estimate: 103.3 kg"` | 2/2 pass |

The new spec also asserts 2, 5 and 12 reps still estimate and 13 still returns `null`. Without those,
a lazy "return w always" would satisfy the headline assertion while destroying every genuine estimate.

**Note for the ledger, not for this row:** this does NOT close
[[2026-07-09-1rm-value-silently-shifts-by-0-5kg-when-the-entered-value-ma]], which is a separate
rounding/step problem on entry. Same screens, different bug — do not fold them
([[feedback_bundled_rows_hide_half_a_bug]]).
