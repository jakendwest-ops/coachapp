---
id: 2026-08-22-cleanup-deletes-without-rowcount-across-four-probe-specs
status: open
priority: low
reported: 2026-08-22
status_detail: "Self-found 2026-08-22. I declared these files 'already safe' on 2026-08-21 while sweeping the cross-tenant probe class. That claim was true of the defect I was looking for and false as stated — they carry a different member of the same family."
---

# ~17 cleanup deletes with no rowcount check, in four specs I called "already safe"

While hardening the four cross-tenant probes (`a4725d4`) I swept the other probe files and reported
they were "already safe (name-anchored deletes or owner-created fixtures)".

**That was true of the defect I was hunting** — none takes its cleanup id from the *offending*
session's `.insert().select()`, which was the actual bug. **It was false as written**, because "safe"
reads as a general verdict and these files carry the sibling defect:

| spec | `.delete()` calls |
|---|---|
| `health-data-write-rls-2026-08-10.spec.js` | 9 |
| `rls-audit.spec.js` | 7 |
| `template-exercise-write-rls-2026-08-10.spec.js` | 5 |
| `solo-goals-rls-2026-08-11.spec.js` | 2 |

**23 deletes, 6 with `.select()`.** So ~17 can be policy-refused (`{ data: [], error: null }` — no
error, zero rows) and report success while stranding a real row.

## Severity is genuinely low

All are owner-side (the session that created the row reaps it), so RLS should permit them, and most are
name- or fixture-anchored so a later run re-reaps any debris. This is not the cross-tenant shape that
stranded 12 rows.

## Why it is filed anyway

The count of "sweeps I declared complete that were not" is now **four** in two days: 2 of 7 test-cleanup
sites, 10 of 12 clientId writes (really 15), 19 ledger rows closed at file level, and this. The pattern
is not the individual misses — it is that I state the sweep's *verdict* rather than its *scope*, so a
narrow check reads as a broad guarantee.

**Closes when:** every cleanup delete in those four specs asserts its own rowcount, or the row records
explicitly which ones were deliberately left and why.
