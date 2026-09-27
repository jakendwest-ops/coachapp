# Critical Facts

Source: the Vault's `CRITICAL.md` and `breach-procedure.md`, merged and migrated in full
2026-09-15. `CRITICAL.md`'s own rule — "changes append to the timeline block at the bottom, never
overwrite" — carries forward: add to the Security Timeline below, don't rewrite it.

## Infrastructure

| Fact | Value |
|---|---|
| Supabase project ID | `avilxuiacmtgeoxxhfhc` |
| Supabase region | eu-west-1 (Ireland) — adequate for UK GDPR |
| GitHub Pages URL | https://jakendwest-ops.github.io/coachapp |
| GitHub repo | jakendwest-ops/coachapp |
| Vault backup repo | jakendwest-ops/vault (retained as historical archive post-migration — see `docs/decisions.md`) |

## Storage buckets

| Bucket | Visibility | Expiry | Notes |
|---|---|---|---|
| `logos` | Private | 604800s (7 days) | PT logo upload; MIME-restricted to image types; policies scoped to `auth.uid()` |
| `progress-photos` | Private | 3600s (1hr) | Client body photos. Feature UI removed 2026-07-12 ("for now"); bucket + data retained. Exactly 2 correctly path-scoped policies (client↔own folder, coach↔own clients' folders) |

**Rule: private is NOT sufficient — object policies must be path-scoped too.** See the 2026-07-12
incident in the Security Timeline below — a bucket with `public = false` still leaked cross-tenant
because its policies were scoped by `bucket_id` alone.

## GDPR compliance status

_As of 2026-06-28, not independently re-verified in this migration pass — cross-check against
`docs/backlog.md`'s current open GDPR items before relying on this table._

| Requirement | Status (2026-06-28) |
|---|---|
| Consent at signup | Checkbox, validated in handler |
| Data export | `downloadMyData()` in Settings |
| Right to erasure | `delete_current_user()` RPC + Settings UI |
| Data residency | eu-west-1 (Ireland) |
| Privacy policy page | `/privacy-policy.html` live (v158, 2026-06-29); consent checkbox links to it |
| ICO breach notification | Documented — see Breach Procedure below (2026-07-12) |

**Correction found during this migration:** the bug ledger still lists consent capture as `deferred`
(2026-08-19), but per the Vault's `roadmap.md`, the actual work shipped 2026-08-25 — privacy policy
written/hosted/linked, consent checkbox live, a read-side enforcement gate, version-coupling
enforced by a `checks.sh` rule. **5 of 6 steps are done.** Only `delete_current_user()`'s existence
needs direct verification by Jake (can't be tested without destroying a real account). The ledger
row isn't closed here — per this project's own closure rule, only Jake or a red→green test may close
it — but treating this as "still unresolved" (as this documentation set did before this migration)
is now inaccurate. See [roadmap.md](roadmap.md) for the full correction.

The GDPR export shipping without its profile section (2026-09-06) is a separate matter from the
above, and it is now **closed** — 684c7fa (2026-09-20) rewired every export read, profiles included,
through a throw-on-error helper; closed on rule-(b) evidence, see
[docs/bugs/2026-09-06-gdpr-export-ships-a-bundle-with-the-profile-section-missing.md](bugs/2026-09-06-gdpr-export-ships-a-bundle-with-the-profile-section-missing.md).

## Security constraints — non-negotiable

1. No PUBLIC storage buckets — use signed URLs always
2. No PII in log calls — IDs and dates only; pre-push hook enforces
3. RLS on every table — enabled before first INSERT; never `qual = 'true'` on sensitive tables
4. No `auth.users` in RLS policies — use `auth.uid()` / `auth.email()` only
5. Health data = special category — weight, body fat, photos, performance metrics
6. New table checklist — RLS + add to `downloadMyData()` + add to `delete_current_user()` RPC

## Key DB functions

| Function | Purpose |
|---|---|
| `delete_current_user()` | GDPR erasure — deletes all user data then auth.users row; security definer |

---

## Personal Data Breach Procedure (UK GDPR / ICO)

**Status:** Active from 2026-07-12. Owner: Jake West (sole controller). **Not legal advice** — an
operational runbook. For a breach that is clearly high-risk or large-scale, take the containment
steps below *and* seek professional/legal advice in parallel.

CoachApp processes **special-category health data** (bodyweight, body-fat, progress photos,
performance metrics). That raises the risk profile of any breach.

### The one number to remember: 72 hours

If a breach is notifiable, the ICO must be told within 72 hours of becoming **aware** of it — not
72 hours from when it happened. The clock includes weekends. You don't need the whole picture in 72
hours — an initial report followed by details ("phased notification") beats a late perfect report.

### What counts as a breach

Accidental or unlawful destruction, loss, alteration, unauthorised disclosure of, or access to,
personal data — confidentiality (wrong party sees it), integrity (altered without authorisation), or
availability (lost/destroyed, unrecoverable). A vulnerability that was open but not exploited isn't
automatically notifiable, but **must still be logged**.

### The decision: is it notifiable?

**Notify the ICO** unless you can justify the breach is unlikely to result in a risk to people's
rights and freedoms — with health data involved, lean towards notifying. **Notify affected
individuals directly** only if there's a **high** risk to them; for CoachApp's scale, direct email
is expected if it reaches that bar.

### First hour — contain, then assess, in order

1. Stop the bleed — revoke the leaking access now, before diagnosis is complete
2. Prove containment — re-run the behavioural probe that found it, confirm green
3. Record the "aware" timestamp — the 72h clock starts here
4. Scope it — what data, whose, how many, how long exposed, any evidence of actual access
5. Assess against the notifiable-or-not test above
6. Log it (below) regardless of the decision

### Reporting to the ICO

Online at `ico.org.uk` ("report a breach"), or phone 0303 123 1113. Have ready: what happened and
when, how you became aware, categories/approximate number of data subjects and records affected,
likely consequences, measures taken, your contact details as controller. Unknowns are fine in an
initial report.

### The internal breach log — mandatory, always

UK GDPR requires documenting every personal data breach, **including ones not reported**. One entry
per incident, in this file's Security Timeline below:

```
### YYYY-MM-DD — <short title>
- Became aware:        <timestamp>
- What happened:       <the failure, in one paragraph>
- Data involved:       <categories; special category y/n>
- People affected:     <count / "none — test data only">
- Actually accessed?:  <evidence of real access, or "vulnerability only">
- Containment:         <what was done, timestamp> + <proof: test green>
- ICO notified?:       <yes+ref / no + one-line justification>
- Individuals told?:   <yes / no + justification>
- Root cause + fix:    <link to commit / SQL>
- Follow-up:           <new test / check added so it can't recur silently>
```

### Worked example — the 2026-07-12 storage leak (why it was NOT notified)

- **Became aware:** 2026-07-12, during a `/deploy-check`, when `storage-privacy.spec.js` proved a
  second coach could download and delete any client's progress photos.
- **What happened:** three `storage.objects` policies on `progress-photos` were scoped by
  `bucket_id` alone — any authenticated user could read/delete/write any photo (bucket itself was
  still `public = false`, which is why the flag-only check missed it).
- **People actually affected:** none — the only real object was Jake's own dev-era test photo; no
  real second coach existed, the "attacker" was a test account created by the audit itself.
- **ICO notified?** No — assessed unlikely to risk any real individual, since no real data subject's
  data was accessed or accessible by a real party. Pre-beta, single-tenant-in-practice.
- **Follow-up:** extended the behavioural audit to cover Storage; replaced deploy-check's
  `buckets.public` config-read with the actual probe.
- **The point, worth repeating:** the same bug discovered *after* real coaches are on the platform
  would very likely be notifiable. What made it non-notifiable was purely that no real data subject
  was affected — reassess every time, never assume from a past verdict.

---

## Security Timeline

_Append here — never overwrite. Migrated verbatim from the Vault's `CRITICAL.md` 2026-09-15;
continue appending future entries here, not in a separate file._

- **2026-06-28 to 2026-09-06** — archived verbatim in
  [archive/critical-timeline-2026-06-28-to-2026-09-06.md](archive/critical-timeline-2026-06-28-to-2026-09-06.md)
  (GDPR hardening, the leaked PAT, stored-XSS instances 4–8, the 44-day public-signup gap, export completeness).
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

## Requires Validation

- The GDPR compliance table is dated 2026-06-28 and known-incomplete against the current bug ledger
  (see the note under that table) — treat `docs/backlog.md` as more current for GDPR status.
- Nothing in the Security Timeline above has been independently re-verified against current code in
  this migration pass — it's migrated as historical record. Cross-check against `docs/backlog.md`
  and `docs/bugs/` for what's still open vs. since closed.
