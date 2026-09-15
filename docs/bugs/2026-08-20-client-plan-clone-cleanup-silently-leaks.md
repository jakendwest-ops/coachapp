---
id: 2026-08-20-client-plan-clone-cleanup-silently-leaks
status: fixed-awaiting-jake
priority: medium
reported: 2026-08-20
status_detail: "ROOT CAUSE CONFIRMED 2026-08-20 by multi-agent-review (Agent A), verified against js/app-programs.js:758/763/473. A race: the assign modal is removed BEFORE the clone work is awaited, so the test raced ahead of the single batch insert of client_program_workouts. Fixed in tests/programs.spec.js with a real barrier plus a name-anchored backstop delete. 12 orphans cleaned from live DB. NOT closed: no test yet ASSERTS the cleanup left nothing behind."
---

# A client-plan clone survives its test's own cleanup, silently

Found 2026-08-20 while checking whether the cross-tenant probes had stranded rows (they had not — this
turned up instead).

12 `workout_templates` rows named `[E2E] 1RM Check Squat`, created between 2026-08-12 and 2026-08-19,
all with `client_id` set — i.e. **client-plan clones**, not the standalone template the test creates.

## Evidence gathered before deleting them

| check | result |
|---|---|
| `still_linked_to_a_cpw` | **0** — every one an orphan |
| `leftover_client_programs` | **0** — parents were cleaned |
| host client | the `coachapp.e2e.client` fixture, on the E2E coach account |
| `used_in_a_phase` | false for all |

So the parent `client_programs` rows were removed and the clones were not. Blast radius was
test-account-only; no real coaching data involved. Deleted with a guarded statement (12 rows).

## What is NOT the cause

**The `test.skip()`-before-`try` defect in the same test is not it.** That was my first diagnosis and it
is wrong: a fired skip returns before the assign step, so no clone could ever be created. All 12 carry
`client_id`, which proves the test ran through assignment and its `finally` block executed. That defect
is real and was fixed the same day at both sites in `tests/programs.spec.js`, but it is a *latent*
bug — it has never been observed to leak anything.

## The actual suspect, unproven

`tests/programs.spec.js`, the finally block:

```js
const { data: cpwRows } = await db.from('client_program_workouts')
  .select('workout_template_id').eq('client_program_id', cp.id)
await db.from('client_programs').delete().eq('id', cp.id)
const ids = (cpwRows || []).map(r => r.workout_template_id).filter(Boolean)
if (ids.length) await db.from('workout_templates').delete().in('id', ids)
```

The read happens before the parent delete, which looks correct. Two candidates remain and I could not
distinguish them from the surviving data:

1. `cpRows` came back empty, so the loop never ran — but then `client_programs` rows should have
   survived, and none did. Weakens this one without killing it (a later broad sweep in the same file,
   line ~229, could have removed them independently).
2. The `workout_templates` delete was **silently refused** — the documented
   `{ data: [], error: null }` class from 2026-08-18. `ids.length` is checked; the delete's own result
   is not.

Candidate 2 fits the evidence better and matches a known, repeatedly-shipped failure mode here.

## Next step

Instrument the finally block to assert its own effect (count rows actually deleted, fail the test if it
is fewer than `ids.length`) — the guard `ledger-fixes-2026-07-23.spec.js:260` already uses, and the
same discipline the 2026-08-18 silent-refusal fix applied to shipped code but not to test cleanup.

**Closes when:** a test proves the cleanup removes every clone it created, red before / green after.
Not on inference, and not on the skip-path fix.
