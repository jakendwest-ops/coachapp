---
id: 2026-08-26-lb-display-value-saved-back-corrupts-the-stored-kg
status: fixed-awaiting-jake
priority: high
reported: 2026-08-26
status_detail: "FIXED d320220, 7 sites, one shared helper. Found while investigating 2026-07-09; it is a DIFFERENT bug from that one and does NOT explain Jake's 0.5 — that row stays open."
---

# In lb, the displayed weight is a lossy proxy and saving it back corrupts the stored kg

Reproduced live 2026-08-26 (the 2026-07-09 row demanded a live repro before any further attempt;
two prior code reads had found nothing).

```
200 kg --weightToPref--> "440.9" lb --weightFromPref--> 199.99 kg
```

Any save that re-reads an untouched prefilled weight field rewrites the row slightly wrong. The next
render rounds it again (`app-progress.js:225` does `String(parseFloat(dispNum.toFixed(1)))`), so the
screen keeps showing "200" while the database holds 199.99. **Invisible from the UI and bounded at
~0.023 kg — so it never looks like a bug, it looks like data.** That is why reading the code twice
found nothing.

The path that actually fires in normal use: a **date-only edit** in the 1RM grid. `saveOneRMGrid`'s
equality guard only skips a row when the value AND the date are unchanged, so changing just the date
sends the painted display value down the save path.

**Fix (d320220): ONE shared helper, seven sites.**
`weightInputAttrs(kg)` stamps `value` + `data-shown` (what was painted) + `data-kg` (what it was
painted from); `weightFromInput(el)` returns the stored kg VERBATIM when the field still shows what we
painted, and converts a genuine edit normally.

Sites: `orm-${i}` · `ls-weight-${bi}-${si}` · `ls-orm-${bi}` · `wr-edit-weight` · `ts-weight-${i}` ·
`wg-starting` · `wg-goal`. Placeholder-only inputs (`1rm-weight`, `rorm-*`, `orm-est*`, `cwf-weight`,
both app-programs inputs) deliberately untouched — no prefill, no round trip.

**I first enumerated the class as FIVE.** The third test — a guard scanning the shipped source for any
weight input painted straight from `weightToPref` — failed on my own incomplete fix and named the two
I had missed (`wg-starting`/`wg-goal`, whose conditional prefill my grep pattern skipped). les-065
again, caught by a check rather than by me.

**Proven:** 3 tests green; with `weightFromInput` neutered both behavioural tests go red on the exact
symptom ("a date-only edit rewrote the weight as 199.99 instead of 200"); restore byte-identical;
full suite 569 passed.

**Closes when:** Jake sets Settings → weight to `lb`, opens the 1RM grid, changes ONLY a date on a
lift, saves, and confirms the weight is unchanged.
