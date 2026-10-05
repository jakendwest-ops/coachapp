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
- **2026-09-20 to 2026-09-21** — archived verbatim in
  [archive/critical-timeline-2026-09-20-to-2026-09-21.md](archive/critical-timeline-2026-09-20-to-2026-09-21.md): the 8th stored-XSS instance closed and the
  checker's blindness root-caused (a hand-written field list); RLS not covering every write of a two-write function (`saveNewTemplate` took another
  coach's programme id; the database side is still an open row); a class sweep missing two more unescaped renders (sweep a class by the COLUMN); the
  data export reporting success while incomplete past the API's 200-row cap; a tenant clause a stub cannot see is not proven; a view's
  `security_invoker` reset by the next `create or replace view`; and the client `clients.coach_id` rewrite (fixed 2026-09-26).
- 2026-10-05: **The stored-XSS safety net has a known blind spot, and three older security rows were closed on 2026-09-27.** (1) `scripts/check-escaping.mjs`
  treats a line as markup only if that LINE contains `<`, so an interpolation on its own line inside a multi-line template (the template editor's back
  label was the case found) is invisible to it: removing `escapeHtml` from a real sink failed nothing. That one sink now has a behavioural spec
  (`tests/template-back-label-escaping-2026-09-27.spec.js`); how many others sit on continuation lines is UNMEASURED. Open row:
  [bugs/2026-09-27-escaping-checker-cannot-see-an-interpolation-on-a-continuation-line.md](bugs/2026-09-27-escaping-checker-cannot-see-an-interpolation-on-a-continuation-line.md).
  (2) Closed 2026-09-27 on closure rule (b), with no new facts for this timeline: the original client-to-coach stored-XSS row (2026-07-13, commit `134140f`,
  `tests/regression-2026-07-13.spec.js`), the 5-file recurrence row (2026-08-12; a neuter run showed `tests/escaping-sweep-2026-08-12.spec.js` fails when one
  escape is removed) and `_effectiveCoachIdForClient` swallowing an RLS denial (2026-08-17, fixed 2026-09-04 and recorded above in the archived
  timeline; `tests/effective-coach-id-2026-09-04.spec.js`). `os-lint`'s `doc-obligations` flagged all four because closing a row rewrites its file, so it
  looks newer than this one; the only new content was the open row. **Lesson:** that check keys on file time, so a status edit on an old row can
  demand an append that has nothing new in it; read the rows before appending.

## Requires Validation

- The GDPR compliance table is dated 2026-06-28 and known-incomplete against the current bug ledger
  (see the note under that table) — treat `docs/backlog.md` as more current for GDPR status.
- Nothing in the Security Timeline above has been independently re-verified against current code in
  this migration pass — it's migrated as historical record. Cross-check against `docs/backlog.md`
  and `docs/bugs/` for what's still open vs. since closed.
