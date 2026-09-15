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

The GDPR export shipping without its profile section is a separate, still-open bug (2026-09-06),
not affected by the above.

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

- 2026-06-28: GDPR hardening session. `progress-photos` made private. PII stripped from 16 log
  sites. Consent checkbox added to signup. Data export + delete account built. Storage bucket RLS
  established for logos and progress-photos.
- 2026-07-01: Found and fixed a solo-account RLS gap — `client_1rms` had no INSERT/UPDATE/DELETE
  policy for solo users, `client_programs` had no UPDATE/DELETE policy for solo users. Added 5
  solo-scoped policies. **Lesson:** when adding a new role/account type, every table it touches
  needs its own explicit write policies checked — a working INSERT doesn't imply UPDATE/DELETE work.
- 2026-07-03: GitHub Pages deploy source switched from legacy branch-deploy to Actions-only, fixing
  a redundant dual-workflow setup. Confirmed FK cascade rules across the programs/templates table
  family — `workout_templates` itself does NOT cascade-delete when its `program_phase_workouts` row
  is removed (SET NULL instead), handled explicitly in `deleteProgram()`.
- 2026-07-03: A live `ghp_` PAT was found embedded in plaintext in coachapp's `.git/config` remote
  URL (and accidentally surfaced in-chat); deleted, remote cleaned, git now authenticates via `gh`
  CLI's keyring OAuth token. **Lesson:** never run a command that echoes a known-embedded secret.
- 2026-07-28: **4th instance of the client→coach stored-XSS pattern** — `client_check_ins.notes`
  rendered unescaped on the coach's client-profile Overview tab. Swept and closed ~33 sinks total.
  **Standing lesson:** any new client-writable free-text field needs its every render site checked
  against escaping at the time it's added, not discovered later.
- 2026-07-23: **GDPR export was not a complete disclosure.** `downloadMyData` branched on role, so a
  coach who also trains could never export their own weights/workouts/PBs by any route;
  `client_check_ins` (Art. 9 special-category) was in no branch; `workout_logs` exported headers
  only, zero sets/reps/loads. Both halves now run ungated and independently.
- 2026-08-01: **5th instance of stored-XSS** — a cluster in the runner's prescription render path
  (~15 sinks), found by the weekly full-file review.
- 2026-08-11: GDPR consent capture + privacy policy — **deferred by Jake**, tracked in
  `docs/bugs/2026-08-11-gdpr-no-consent-capture-and-no-privacy-policy.md`. A deferred GDPR
  obligation is still an obligation.
- 2026-08-12: **6th instance, and the first confirmed regression against a specific dated fix.**
  `app-programs.js` rendered the same expression `app-workouts.js` correctly escaped; the 2026-07-18
  hardening pass had documented the fix but named only two of the real surfaces.
- 2026-08-23: This timeline had received no append since 2026-07-28, during which the stored-XSS
  pattern it tracks recurred twice more and two GDPR items landed. `os-lint`'s `doc-obligations`
  check now goes RED when a `bugs/` file matching a tracked security class is newer than this file's
  last write.
- 2026-08-29: **7th instance**, found by the weekly full-file review — a field escaped at one render
  site and raw at another, sibling site, twice over.
- 2026-08-29: **A new recurring pattern named: readability is not ownership.** Two save paths
  treated "I can read this row" as "it is mine" instead of checking an owner column against
  `auth.uid()`. Fixed to 4 of 4 client-scoped writers using the strong check.
- 2026-09-04: `_effectiveCoachIdForClient` no longer treats an unreadable row as ownership — the
  `.single()` error (PGRST116 on zero rows) is now the denial signal, returning `null` rather than
  falling back to the current user's own id.
- 2026-09-06: **A third shape of "GDPR export incomplete" — silent by construction.**
  `app-progress.js` filled `bundle.profile` from a `.single()` whose error was discarded, so a
  failed read yielded `undefined` and the export reported success with the profile section simply
  absent.
- 2026-09-06: **Public self-signup was still enabled on live for 44 days** after the code fix that
  was supposed to remove it. The 2026-07-24 fix removed the signup form because `supabase.auth.signUp`
  is directly callable from devtools regardless of what the UI shows — but the corresponding Supabase
  dashboard toggle (`disable_signup`) was never flipped. Found and closed 2026-09-06: probed
  (`disable_signup:false`), Jake flipped it, re-probed (`true`), confirmed the admin invite path
  unaffected end-to-end. **Lesson:** a code-level fix and its infrastructure-level counterpart are
  two different fixes — closing one doesn't close the other, and neither closes the incident alone.
- 2026-09-06 (**8th instance** of the unescaped-render pattern): the free-text periodization "reps"
  value round-trips through the database unescaped, re-injecting on every reopen of that programme's
  Periodization modal. `scripts/check-escaping.mjs` exits 0 over it — a clean escaping run doesn't
  mean what it appears to. The class was counted, not sampled: 45 sites match the vulnerable
  pattern repo-wide, exactly 1 is exploitable.

## Requires Validation

- The GDPR compliance table is dated 2026-06-28 and known-incomplete against the current bug ledger
  (see the note under that table) — treat `docs/backlog.md` as more current for GDPR status.
- Nothing in the Security Timeline above has been independently re-verified against current code in
  this migration pass — it's migrated as historical record. Cross-check against `docs/backlog.md`
  and `docs/bugs/` for what's still open vs. since closed.
