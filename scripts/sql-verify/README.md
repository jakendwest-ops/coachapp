# sql-verify — run a migration locally before anyone runs it on the live database

An in-memory Postgres ([PGlite](https://github.com/electric-sql/pglite), a dev dependency) loaded with the **live** tables,
indexes and row-level-security policies (`live-schema.mjs`, read from the live project on 2026-09-20). A verifier runs a
migration on it and asserts what the migration is supposed to do — and, as importantly, who it must **refuse**.

```
node scripts/sql-verify/coach-client-summary.verify.mjs   # every check on the current script; exit 0 = all passed
node scripts/sql-verify/run-mutations.mjs                 # deliberate breakages; exit 0 = every one was caught
```

Both run on every push from `scripts/checks.sh` (rule 9m, about 17 seconds together).

## Adding a verifier for a new migration

1. Copy `coach-client-summary.verify.mjs`. Keep the shape: install the live schema, seed a scenario (include the
   **boundaries** — the day exactly on a window edge, a client with no data at all, a NULL where the code assumes a value),
   run the script **twice**, then assert.
2. Assert what must be **refused** as hard as what must work: another tenant, a client, a caller with no identity, `anon`,
   a write. Run each as that caller with `as(role, jwtSubject, sql)` so RLS applies exactly as for a real request.
3. Assert the script's own **read-back** (the final `SELECT` it ends with) — the editor's "Success. No rows returned."
   proves nothing about DDL.
4. Add a `*.mutations.mjs` entry for **every safeguard the script claims** (remove it, and the verifier must fail).
   `applyMutation` refuses an anchor that no longer matches exactly once, so a stale mutation cannot quietly stop testing.
5. If the script touches a table `live-schema.mjs` does not have, extend it first with the read-only query in that file's
   header. A verifier built on a guessed schema proves nothing about the real one.

## What a pass does NOT prove

- **INSERT / UPDATE / DELETE policies.** The schema read covered SELECT and ALL only. (So "can a client rewrite their own
  `clients.coach_id`?" cannot be answered here.)
- **The engine.** PGlite is Postgres 18.x; the live server was 17.6. RLS, `security_invoker` views, lateral joins and btree
  indexes behave the same; a new feature needs the difference checked.
- **Concurrency and locking**, triggers and functions, and the **PostgREST layer** (the 200-row response cap, embeds, the
  API's own auth). Anything that depends on those is checked by a spec against the real API.
- The **real data**. Numbers are proven on a small scenario, not on the live tables.

So a pass means "the SQL does what it says on the live *schema*", not "it is safe on the live *database*" — the script's own
read-back, run after it is applied, is still the last check.
