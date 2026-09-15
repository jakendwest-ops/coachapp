---
id: 2026-08-20-cross-tenant-probes-not-cleanup-safe
status: confirmed
priority: medium
reported: 2026-08-20
closed_by: "clause (b), red-before/green-after on the SAME fixture 2026-08-21. Planted a weight_kg=999 row as the OWNER (so PT2's insert is still refused and plantedId stays null - the exact INSERT-permissive/SELECT-restrictive shape). Pre-fix code (HEAD): probe went red AND the row SURVIVED (PREFIX_ROW_SURVIVED 1). Post-fix: probe went red and the row was REAPED (0). Full spec 23/23. Fixed at all 4 sites; the other 8 cross-tenant probe files were swept and are already safe (name-anchored deletes or owner-created fixtures)."
status_detail: "Found by multi-agent-review (Agent A) 2026-08-20 while reviewing an attempt to widen the pre-push gate. Latent — a live sweep confirmed ZERO rows currently stranded by these four sites. Blocks putting these specs in the push gate."
---

# Four cross-tenant probes cannot clean up after the regression they exist to detect

`tests/ledger-fixes-2026-08-02.spec.js` — four tests, same defect:

| line | probe | row it plants |
|---|---|---|
| ~85  | `weight_logs` INSERT   | `weight_kg: 999` |
| ~482 | `client_1rms` INSERT   | `one_rm_kg: 999` |
| ~538 | `goals` INSERT         | `[E2E] Boundary Probe Goal` |
| ~569 | `events` INSERT        | `[E2E] Boundary Probe Event` |

Each does:

```js
plantedId = attempt.insertedId          // from PT2's .insert().select().single()
...
} finally {
  if (plantedId) await ptPage.evaluate(... delete().eq('id', id) ...)
```

`attempt.insertedId` comes from a write followed by an **RLS-gated read of the just-written row**.
INSERT and SELECT are separate policies. If INSERT regresses permissive while SELECT stays restrictive —
the single most likely regression shape, and precisely what these probes exist to catch — `data` is
`null`, `plantedId` stays `null`, and the cleanup is skipped.

The `actualFromPT` check correctly turns the test RED, but returns only `data?.length` and throws the
ids away. So in the exact failure case, the probe detects the breach and cannot undo it.

Victim row is `.eq('coach_id', currentUser.id).limit(1).single()` with **no `order by`** — which client
gets the row is not deterministic.

## Why it is only medium

A live sweep on 2026-08-20 found **zero** rows stranded by these four sites — `weight_logs`, `goals` and
`events` all came back empty. The probes have never actually fired their failure path. And the accounts
involved are the E2E fixtures, not real coaching data: `loginAsPT` resolves to `coachapp.e2e.pt@…`.

An earlier framing of this row said a regression would "poison a real client's weight chart". That
overstated it — "real" in the review's wording meant real *relative to the test account*. Corrected here
so the row does not carry a scarier premise than the evidence supports.

## The fix, and the precedent

`tests/ledger-fixes-2026-08-01.spec.js:188` already documents this exact false-negative in a comment and
defends against it — it re-reads from the planting session's own context, which can always see its own
row, and deletes `plantedFromPT2`. The 08-02 probes were written later and did not inherit the pattern.

One line per site: have the `actualFromPT` evaluate return `data?.map(r => r.id) || []` and delete those
in the `finally` alongside `plantedId`.

## Why this matters beyond the four sites

It is the reason the 2026-08-20 attempt to widen the pre-push gate was reverted. Adding these specs to
the gate would run all four on every push, multiplying the exposure of a cleanup path that fails exactly
when it is needed. **Harden these before any future widening.**

Also unprobed across the whole newly-gated set: no cross-tenant UPDATE probe exists for any of the four
tables, and only `client_1rms` has a DELETE probe. Widening the gate would have made the boundary look
continuously verified while three quarters of the operation matrix stayed untested.

**Closes when:** a test proves cleanup runs in the insert-succeeded-but-read-denied case — red before,
green after.
