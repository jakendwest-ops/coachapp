# sql-verify — run a migration locally before anyone runs it on the live database

An in-memory Postgres ([PGlite](https://github.com/electric-sql/pglite), a dev dependency) loaded with the **live** tables,
indexes and row-level-security policies (`live-schema.mjs`, read from the live project on 2026-09-20, extended 2026-09-26).
A verifier runs a migration on it and asserts what the migration is supposed to do — and, as importantly, who it must
**refuse**.

```
node scripts/sql-verify/coach-client-summary.verify.mjs   # the coach_client_summary view; exit 0 = all passed
node scripts/sql-verify/clients-coach-id-guard.verify.mjs # the clients.coach_id guard trigger; exit 0 = all passed
node scripts/sql-verify/run-mutations.mjs                 # deliberate breakages, every suite; exit 0 = every one was caught
```

All run on every push from `scripts/checks.sh` (rule 9m). A new verifier joins the mutation self-test by adding a line to
`SUITES` in `run-mutations.mjs`, and gets its own block in rule 9m.

## Adding a verifier for a new migration

1. Copy a verifier. Keep the shape: install the live schema, seed a scenario (include the **boundaries** — the day exactly on a
   window edge, a client with no data at all, a NULL where the code assumes a value), run the script **twice**, then assert.
2. **Reproduce the problem before the fix** (a `CONTROL` check that must pass *before* the script runs). A verifier that could
   not show the hole cannot prove it was closed — `clients-coach-id-guard.verify.mjs` does this first.
3. Assert what must be **refused** as hard as what must work: another tenant, a client, a caller with no identity, `anon`,
   a write. Run each as that caller with `as(role, jwtSubject, sql)` so RLS applies exactly as for a real request. An `UPDATE`
   with a `WHERE` or a `RETURNING` needs SELECT rights, so a row the caller cannot SELECT matches nothing and never reaches a
   trigger — use a statement shape that reaches the thing under test, and check the state back as the superuser.
4. Assert the script's own **read-back** (the final `SELECT` it ends with) — the editor's "Success. No rows returned."
   proves nothing about DDL.
5. Add a `*.mutations.mjs` entry for **every safeguard the script claims** (remove it, and the verifier must fail).
   `applyMutation` refuses an anchor that no longer matches exactly once, so a stale mutation cannot quietly stop testing.
6. If the script touches a table `live-schema.mjs` does not have, extend it first with the read-only query in that file's
   header. A verifier built on a guessed schema proves nothing about the real one.

## What a pass does NOT prove

- **INSERT / DELETE policies, and UPDATE policies on any table except `clients`.** The first schema read covered SELECT and ALL
  only; on 2026-09-26 the three UPDATE policies on `clients` were added (which is how "can a client rewrite their own
  `clients.coach_id`?" was answered: yes). Other tables' write policies are still not here.
- **The `clients` CHECK constraint, foreign keys and its `audit_clients` trigger**, and any table not listed.
- **The engine.** PGlite is Postgres 18.x; the live server was 17.6. RLS, `security_invoker` views, lateral joins, btree
  indexes and a plain `BEFORE UPDATE OF` trigger behave the same; a new feature needs the difference checked.
- **Concurrency and locking**, and the **PostgREST layer** (the 200-row response cap, embeds, the API's own auth, how it
  switches the database role). Anything that depends on those is checked by a spec against the real API.
- The **real data**. Numbers are proven on a small scenario, not on the live tables.

So a pass means "the SQL does what it says on the live *schema*", not "it is safe on the live *database*" — the script's own
read-back, run after it is applied, is still the last check.
