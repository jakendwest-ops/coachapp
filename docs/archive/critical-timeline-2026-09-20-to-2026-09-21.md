# Security Timeline archive: 2026-09-20 to 2026-09-21

Moved VERBATIM out of the live docs on 2026-10-05, because `os-lint`'s docs-budget / context-budget checks were red. Nothing below was edited. Continues [critical-timeline-2026-06-28-to-2026-09-06.md](critical-timeline-2026-06-28-to-2026-09-06.md); the live timeline is in [../critical.md](../critical.md).

---

- 2026-09-20: **That 8th instance is closed, and the checker's blindness is root-caused.** Nothing about the
  syntax defeated `check-escaping.mjs`: its hand-written free-text field list had no name in
  `cfg.tiers?.[t]?.reps ?? …`, so the interpolation was never a candidate. `cfg.` is now on the list, a 16-case
  self-test holds the RED proof (the checker had none) and is wired into `checks.sh`, and `.reps` was deliberately
  NOT added — measured, it flags 3 runner sites that are not the cross-user class. The bug also corrupted
  *honest* input containing a quote (`it's "10-12"` was truncated), not just hostile input.
- 2026-09-20: **RLS did not cover every write of a two-write function — measured, not assumed.**
  `saveNewTemplate` wrote a `workout_templates` row stamped with a caller-supplied `program_id`, then a
  `program_phase_workouts` row. A red-first cross-tenant probe showed RLS refuses the second but ACCEPTS the
  first: another coach's programme id landed in the row. The app now verifies the programme/phase pair before
  either write; the database still accepts it — open row
  `2026-09-20-workout-templates-insert-accepts-another-coachs-program-id`, needs a schema read and a reviewed
  policy script. **Lesson:** probe each write of a multi-write function separately; "RLS backstops it" had been
  assumed for both.
- 2026-09-20: **The 8th instance's class sweep missed two more unescaped renders — both found by review, not by the
  checker.** (1) The sweep was keyed on the variable name `cfg`; the same untyped jsonb column
  (`periodization_config`) has a second reader, `_periodizationLabel`, that aliases it as `c` and renders raw into the
  phase header. (2) `clientOverviewTab` interpolated `programName` — a coach-typed programme name arriving as a
  function PARAMETER — with no escaper (9th instance; coach → the same coach, so low). Both fixed red→green
  (`tests/review-followups-2026-09-20.spec.js`). **Lesson:** sweep a class by the COLUMN (`grep` every reader of it)
  and by every value that reaches a template, not by the name the first site happened to use; and a name-keyed checker
  cannot see a taint that crosses a function return or arrives under an unlisted name — its header now says so.
- 2026-09-20: **The data export could report success while incomplete — and swallowed read errors.** The API returns
  at most 200 rows per request and says nothing when it cuts a list short (measured: 200 rows for `.limit(1000)` on a
  5,564-row table). `_buildMyDataBundle` read seven growing health tables that way, so a subject-access export past 200
  rows in any of them silently omitted the rest (seven health tables, plus a coach's clients, templates and programmes:
  the coach block was missed by the first pass and found in review); and it destructured `{ data }` and discarded the
  error, so a table that failed to load, or the profile, produced a bundle with a hole and no sign of one. Both fixed (paged reads, failures throw and
  the UI shows "Export failed"); same fix for the weight tabs and personal-best reads. Whether any real export was
  affected is unmeasured. **Lesson:** an export that reports success must be proven complete past the API's cap, not
  just on small fixtures — `tests/capped-api.js` now makes that testable.
- 2026-09-20: **A tenant clause a stub cannot see is not proven.** The runner finish screen's PR baseline was rewritten as
  one read scoped by client through a two-level `!inner` embed. Its first tests never asked about ANOTHER client, and the
  test stand-in returned an embedded select whole — so dropping the client filter, or the second `!inner`, would have passed
  every test (found by review). The stand-in now models PostgREST's `!inner` rule, the real-database test asks about another
  client, and each breakage fails. **Lesson:** a tenant filter needs a fixture row belonging to someone else, asked about
  through the real API; and check the read still lands in RLS-bounded tables (restated in the older deferred-RLS row).
- 2026-09-21: **A view's `security_invoker` setting is reset by the next `create or replace view` that omits it.** Found reviewing
  the new `coach_client_summary` view (Release 2b): re-creating it without `with (security_invoker = true)` silently made it run
  with its owner's rights and bypass row-level security — another coach's log was then counted (measured on a local Postgres).
  Any view over tenant data must repeat the clause on every replace and read `reloptions` back each time (the migration does).
  Same review, recorded and **fixed and closed 2026-09-26**: a client could rewrite their own `clients.coach_id` (the
  `clients_update_own_row` policy pinned only `user_id`; detaching was already accepted, pointing at ANOTHER coach was not
  covered). A `BEFORE UPDATE OF coach_id` trigger now refuses it for end-user roles; detaching is unaffected. See
  docs/bugs/2026-09-26-a-client-can-rewrite-the-coach-id-of-their-own-clients-row.md. A coach can still attach another coach's
  programme id to their own client (write side only, unrelated, not fixed).
