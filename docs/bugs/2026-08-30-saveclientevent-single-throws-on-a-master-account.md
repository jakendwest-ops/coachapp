---
id: 2026-08-30-saveclientevent-single-throws-on-a-master-account
status: fixed-awaiting-jake
priority: medium
reported: 2026-08-30
status_detail: "PREMISE CORRECTED + FIXED 2026-09-04. The stated mechanism was WRONG: clients.user_id carries a UNIQUE index (clients_user_id_idx), measured by an insert refused with 23505, so two rows can never share a user_id and .single() could never see two. The REAL defect was the other half of the row — the save re-derived an id from the auth user instead of binding to the record the calendar had already resolved. Now uses window._calClientId, set by renderCalendar before it paints the button."
---

# `saveClientEvent` uses `.single()` on a query that can match two rows

**js/app-calendar-goals.js:478** — surfaced while planning the solo dashboard tiles, because it sits
directly behind the "Next up" tile's page.

    db.from('clients').select('id').eq('user_id', currentUser.id).single()

**No `coach_id` discriminator.** A master account has **two** `clients` rows sharing `user_id` — the
coached one and the solo one — so `.single()` throws PGRST116 and the user is told *"Could not find your
client record"* while creating a calendar event. And even where only one row exists, the query is not
bound to the **active view**: a user in Personal view could resolve their coached record.

**This exact shape was already fixed elsewhere.** `renderClientWorkoutsPage` (`js/app-workouts.js:618-625`)
had it and now uses the async resolver. `_getCurrentClientId()` (`js/app-core.js:1148`) exists precisely
for this and returns `window._soloClientId` for solo, and the coached row (`.not('coach_id','is',null)`)
otherwise. This is [[feedback_fix_the_class_not_the_instance]] — one site of a known class was left.

**A sibling with the same shape:** `js/app-workouts.js:2996`. Both should be done together.

**Deliberately NOT folded into the tile work.** It is a pre-existing defect on a different surface, and
bundling it would have made that change harder to review and revert —
[[feedback_bundled_rows_hide_half_a_bug]].

**Closes when:** both sites resolve through `_getCurrentClientId()`, and a spec drives event creation as
a master account in Personal view, asserting the event lands on the SOLO client record — RED before,
because today it either throws or attaches to the wrong one.

---

## 2026-09-04 — the premise was wrong, and the real defect was the other half

**MEASURED, not reasoned.** Attempting to build the two-row shape this row describes:

```
insert into clients (user_id = <my uid>, coach_id = <my uid>, …)
  -> 23505: duplicate key value violates unique constraint "clients_user_id_idx"
```

`clients.user_id` carries a **UNIQUE index**. Two rows cannot share a `user_id`, so
`.eq('user_id', …).single()` can never match two and **PGRST116-on-a-master-account was never the
mechanism.** The account used for the probe has exactly one `clients` row.

That matters beyond this row: the same story appears in
[[2026-08-22-resolvetemplateownercoachid-single-is-ambiguous-for-a-master-account]], which has been
corrected too. A wrong premise sitting in the ledger sends the next investigation down the same dead
end — [[feedback_stability_predictions_overstated]] applies to diagnoses as much as to predictions.

## What WAS real — the second half of the original row

> *"even where only one row exists, the query is not bound to the active view"*

That is the genuine defect. `saveClientEvent` re-derived an id from the auth user while the page the
user was looking at had **already resolved one**: `renderCalendar` sets `window._calClientId` from
`_getCurrentClientId()` before it paints the "+ Add event" button that reaches this function. Two
independent resolutions of the same question can disagree; only one of them is the calendar on screen.

**Fixed:** `const clientId = window._calClientId || await _getCurrentClientId()`.

**Why not `_getCurrentClientId()` alone**, which was this row's suggested fix: it returns **null** under
"View as" (sudo sets `role='client'` while `currentUser` stays the coach), so making it the sole source
would refuse a user the old code served. This project already broke "View as" that way once —
[[feedback_guard_risk_is_refusing_the_legitimate_user]]. Preferring the rendered id and keeping the
resolver as the fallback avoids re-creating that.

**Tests:** `tests/client-record-resolution-2026-09-04.spec.js` — three of them. One pins the UNIQUE
constraint as a measured fact so the false premise cannot come back; one asserts the save binds to the
calendar's id (proven RED by reverting the binding); one asserts `renderCalendar` actually sets that
variable, without which the binding would be decorative.

**A note on the second test:** its first version went red against the CORRECT source, because the
fix's own comment quotes the old `.single()` line it replaced. Third time in this project a check has
counted a comment as code. It now strips comment lines before matching —
[[feedback_reports_success_doing_nothing]]'s mirror image: a check that FAILS on correct code.
