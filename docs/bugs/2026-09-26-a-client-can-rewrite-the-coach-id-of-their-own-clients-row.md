---
id: 2026-09-26-a-client-can-rewrite-the-coach-id-of-their-own-clients-row
status: closed
priority: medium
reported: 2026-09-26
status_detail: "CLOSED 2026-09-26. Jake ran scripts/add-clients-coach-id-guard-2026-09-26.sql live and pasted its read-back: function clients_guard_coach_id security_definer=false, search_path=public, pg_temp; trigger clients_guard_coach_id BEFORE UPDATE OF coach_id ON public.clients FOR EACH ROW, alongside the pre-existing audit_clients trigger — exactly as designed. Closure evidence per the ledger's own rule (b): tests/clients-coach-id-guard-2026-09-26.spec.js went RED against the live API before the script (foreign-key error, proving the hole was real) and GREEN after (3/3 passed) in the same session. A client can still detach themselves (accepted); they can no longer point their own row at another coach."
---

# A client can rewrite the coach_id of their own `clients` row

**Plain English.** Every client has one row in `clients`, and its `coach_id` says whose roster they are on. The database lets a
signed-in client change ANY column of their own row, `coach_id` included. So a client can (a) detach themselves from their
coach by setting it to nothing — this was discussed with Jake when the weight-goals feature shipped and **accepted** as a
row-level-security trade-off, banked as a future "cancellation workflow" — and (b) point the row at any other coach's id, so
they appear in that stranger's roster and dashboard. Part (b) is what that earlier discussion did not cover, as far as the
log shows. It needs the other coach's id (a uuid).

## Evidence (Jake's query, 2026-09-26)

- Policy `clients_update_own_row`: UPDATE, roles `{public}`, USING `user_id = auth.uid()`, WITH CHECK `user_id = auth.uid()`.
  The check pins only `user_id`, so every other column may change in the same statement.
- `authenticated` holds table-level UPDATE; there are **no** column-level ACLs; RLS is enabled but not forced.
- Other policies: `Coach manages clients` (ALL, `auth.uid() = coach_id`, so a coach cannot move a row to another coach),
  `Coach updates own clients` (UPDATE, same pinning), `clients: client reads own row` (SELECT), and
  `Client stamps own user_id on invite acceptance` (UPDATE, unclaimed rows whose email matches; WITH CHECK pins `user_id`).
- `clients_status_check` limits `status` to `active` / `inactive` / `archived`.
- Trigger `audit_clients` (AFTER INSERT/UPDATE/DELETE, `log_audit_event()`): changes to this table are logged, so past misuse
  can be looked for.
- The foreign keys: `coach_id` references `profiles(id)` (ON DELETE CASCADE), `user_id` references `profiles(id)` (SET NULL).

## What it does and does not let a client do

From the repo's copy of the live policies for seven tables (`scripts/sql-verify/live-schema.mjs`):

- **Does:** put their own row, and the data hanging off it (their weight logs, check-ins, programme assignments), into another
  coach's roster; that coach's "Coach manages …" policies then apply to it. It is a way to spam a stranger's dashboard, inflate
  their counts, and hand a stranger your own health data. (Their own data only.)
- **Does not:** read or change any OTHER client's data; change `user_id` (the check pins it); set `status` to anything but the
  three literals (the constraint). Client access to programmes and phases goes through their own assignments, not through
  `coach_id`, so re-pointing does not expose another coach's programme library.
- **Not known:** policies on tables outside those seven that key on `clients.coach_id` or grant a client rights through their
  coach. A second read-only query — every policy in `public` whose text mentions `clients` — would list them.
- Also seen: `Coach manages clients` has no role check, so any signed-in user can insert a `clients` row with `coach_id` set to
  themselves; the "coach" distinction is enforced in the UI, not in this policy.

## What was built (2026-09-26, decision: close only the "attach to another coach" half)

`scripts/add-clients-coach-id-guard-2026-09-26.sql`: a `BEFORE UPDATE OF coach_id` row trigger on `clients` (invoker rights, fixed
`search_path`). If `coach_id` is not actually changing it does nothing. If the statement runs as an API role (`current_user` is
`authenticated` or `anon` — the role PostgREST switches to), a change is refused with SQLSTATE 42501 UNLESS it is the row's own
client setting it to NULL (the accepted self-detach). The SQL editor (`postgres`), the service role (Edge Functions) and any
admin-owned function run as a different `current_user` and are untouched. A coach still cannot move a client to another coach
(the policy already refused it; the trigger refuses it a second time), and an invitee claiming a row cannot set `coach_id` in the
same statement. Rollback is `drop trigger` + `drop function` (both additive).

- **Chosen over `auth.role() = 'authenticated'`:** `current_user` cannot be forged by a request claim and does not depend on which
  JWT setting is present; it is what actually decides which policies run.
- **Local proof:** `scripts/sql-verify/clients-coach-id-guard.verify.mjs` first REPRODUCES the hole on the live schema (client,
  solo record and claiming invitee can all re-point before the script), then runs the script twice and asserts who is refused,
  who still works (including an upsert, the owner's master record, and the invite claim), the read-back, and that the documented
  rollback runs and reopens the hole; 10 mutations each make it fail. The UPDATE policies on `clients` were added to
  `live-schema.mjs` exactly as Jake's paste gave them.
- **Reviewed 2026-09-26, three angles (security, three-role/solo, proof soundness):** no blocking finding against the SQL. One
  blocking defect in the PROOF, fixed: mutation m2 (the admin exemption) had been written so it switched the whole guard off
  instead, so nothing tested the exemption; it now removes only the exemption, and the editor check was made independent of the
  service-role check. Also acted on: an upsert control and check, a master-record detach check, message-matched refusals, a
  mutation for each `create or replace`, the runner no longer counts a crash as "caught", and `create or replace trigger` (no
  window without the guard, no destructive-operation prompt in the editor).
- **Detach is one-way from the API** (was reversible by the client before the guard): the client can no longer set `coach_id`
  back, and their coach cannot see a row with no coach. Recovery is in the SQL editor:
  `update public.clients set coach_id = '<coach user id>' where id = '<client id>';` (also in the script's header). Any future
  "resume coaching" or "solo to coached" flow needs the service role or an admin-owned function, not a plain client update.
- **Not proved / named:** the source of the `invite-client` Edge Function and the `handle_new_user` trigger is not in the repo
  (`docs/bugs/2026-07-24-public-self-signup-closed-off-entirely.md` says it was never read), so "no other flow changes `coach_id`"
  is verified for `js/` and `invite-solo-user` only; if either changed `coach_id` under the caller's own JWT the guard would refuse
  it — send one client invite right after applying. Live `SECURITY DEFINER` functions (e.g. `delete_current_user`) are exempt by
  design and not all in the repo; a read-only query over `pg_proc` would list any that mention `clients`. A refused attempt leaves
  no `audit_clients` row. The guard exempts any role except `authenticated` and `anon` (a future custom API role would be exempt);
  the `anon` clause cannot be tested (RLS gives anon no rows). Not adopted: `revoke execute` on the function (no evidence it helps).
- **Adjacent, not part of this fix:** coaches' policies pin only `coach_id`, so a coach can set `user_id` on a client row to any
  profile that has no `clients` row (the unique index blocks ones that do); and the "master holds two rows" comments in
  `js/app-workouts.js` / `js/app-core.js` are stale (`clients_user_id_idx` is unique on `user_id`).
- **Live proof (after Jake runs the script):** `tests/clients-coach-id-guard-2026-09-26.spec.js` — targets a uuid that is no
  profile so it changes nothing while the hole is open (foreign-key error → RED, then the guard's own message → green).
- **Does not cover:** a `SECURITY DEFINER` function that changes `coach_id` (none exists; it must do its own check), INSERT,
  and self-detach (accepted). A stricter version that also blocks self-detach needs the cancellation workflow designed first.
- **Nothing in `js/` changes `coach_id`**: every insert, update and upsert on `clients` was read (one insert and four updates; none
  names `coach_id` in a SET list, so the trigger never even fires for them), and `invite-solo-user` only inserts through the
  service role. So the guard cannot break a known flow; the two unread pieces are named above.
- **The live spec is written to change nothing while the hole is open**, and was run before the SQL: tests 1 and 3 went RED with
  the foreign-key message (`clients_coach_id_fkey`), i.e. the real API let a client's update through to the foreign-key check;
  test 2 is a control (green before and after). It is committed in `tests/` and therefore keeps the full suite RED until the
  script is applied — a release cannot be cut before then.

## Closes two named items elsewhere

- The coach-dashboard row's "a client may be able to rewrite their own `clients.coach_id`": **confirmed** (this row).
- The list badge's raw `c.status`: **not exploitable** — the status constraint means a client cannot store markup there. Escaping
  it would still be tidy, but nothing is at risk.
