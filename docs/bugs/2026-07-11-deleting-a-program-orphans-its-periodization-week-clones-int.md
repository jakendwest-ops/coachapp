---
id: 2026-07-11-deleting-a-program-orphans-its-periodization-week-clones-int
status: closed
priority: high
reported: 2026-07-11
closed_by: tests/program-delete-orphans-2026-09-04.spec.js
status_detail: "CLOSED 2026-09-04. The decision this row asked for was taken and implemented the SAME DAY it was raised — _deleteOwnedUnreferencedTemplates sweeps clones via generated_from_phase_id — but nothing tested it end to end, so it sat open 56 days. No code change needed; evidence added. RED without the sweep (2 clones generated, 2 survived), GREEN with it (0)."
---

# deleting a program orphans its periodization week-clones into the reusable template pool

**DECISION NEEDED — deleting a program orphans its periodization week-clones into the reusable template pool.** The phase cascade sets `generated_from_phase_id = NULL`, so a "Bench Press — W2" clone loses the only column marking it a derivative. Options: FK CASCADE, or have `deleteProgram` sweep clones first.

---

## CLOSED 2026-09-04 — the decision was taken on the day it was raised; only the evidence was missing

This row said **DECISION NEEDED**, offering an FK CASCADE or a sweep in `deleteProgram`. The sweep was
built the same day. `_deleteOwnedUnreferencedTemplates` carries the clause for exactly this case, and
its own comment states the mechanism this row describes:

> ...or one of OUR phases generated it as a periodization week-clone (`generated_from_phase_id`; those
> carry `program_id: null`, so they need this second clause or they survive as permanent orphans).

**No code change was required. The row stayed open for 56 days because nothing tested it.** That is
the point worth keeping: a fix with no test is indistinguishable from an unfixed bug when someone
reads the ledger eight weeks later.

### The test, and why it is shaped the way it is

`tests/program-delete-orphans-2026-09-04.spec.js` runs the real flow — programme, 3-week linear
periodized phase, Week-1 session, `generatePhasePeriodization`, then `deleteProgram`.

1. It asserts clones were **generated** before asserting none survive. Otherwise "no orphans" is true
   by absence and the test asserts nothing.
2. It looks the clones up **by id**, never by `generated_from_phase_id`. That column is precisely what
   the phase cascade nulls — so an orphan is INVISIBLE to a query keyed on it. Searching that way is
   how you would conclude the bug was fixed while the debris sat in the library.

| | clones generated | survivors |
|---|---|---|
| sweep removed from `deleteProgram` | 2 | **2** |
| sweep in place | 2 | **0** |

The ordering is now covered too: the sweep must run BEFORE the programme delete cascades the phases,
because the cascade destroys the column the sweep identifies clones by.

Verified after the neutered run that no debris was left on the test account (0 templates, 0
programmes matching the probe tag).
