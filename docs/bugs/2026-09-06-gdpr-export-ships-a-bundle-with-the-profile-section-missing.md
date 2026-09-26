---
id: 2026-09-06-gdpr-export-ships-a-bundle-with-the-profile-section-missing
status: closed
priority: medium
reported: 2026-09-06
closed_by: tests/capped-reads-2026-09-20.spec.js
status_detail: "CLOSED 2026-09-26 (found during the v2026.09.7 release review) on rule-(b) evidence. Found by the 2026-09-06 full-file review's mechanical sweep. js/app-progress.js:3185 discarded the error on the profiles read that fills bundle.profile, so a failed read produced a subject-access export with the profile section silently absent and the download still reporting success. Closed as a side effect of 684c7fa (2026-09-20, 'Reads of growing tables page past the API's 200-row cap; the data export fails loudly'), which rewired every export read — profiles included — through a throw-on-error helper. tests/capped-reads-2026-09-20.spec.js's 'the export refuses to report success when ANY read fails' loops over every export table INCLUDING 'profiles' and asserts a failed read rejects rather than producing a bundle with a hole. Verified directly against HEAD, not taken on the commit message's word: the test file, and its explicit inclusion of 'profiles' in the loop, are both present at HEAD."
---

# GDPR export can ship an incomplete bundle and still report success

`js/app-progress.js:3185`:

```js
const { data: profile } = await db.from('profiles').select('full_name, role, created_at, consented_at, consent_policy_version').eq('id', currentUser.id).single()
bundle.profile = profile
```

The error is discarded. On any failed read — transient network, a stale column during a migration
window, an RLS change — `profile` is `undefined`, `bundle.profile` is `undefined`, and the export
continues and completes. **The user is handed a subject-access bundle missing the profile section and
is told it succeeded.**

## Why this is the tracked class, not a nitpick

`CRITICAL.md`'s 2026-07-23 entry is titled *"GDPR export was not a complete disclosure"* — the same
export, where a role branch meant a coach could never export their own training data. That was fixed
by running both halves ungated. This is the identical failure one layer down: not a branch that skips
data, but a **read whose failure is indistinguishable from an empty result**.

The columns here are Art. 15 material by explicit decision — the comment directly above records that
`consented_at` / `consent_policy_version` were added to this allowlist precisely because when a person
consented and to which policy version is their personal data.

## Not overstated

The read is `.eq('id', currentUser.id)` on the user's own `profiles` row, and `profiles` RLS has an
"Own profile" ALL policy, so it is not RLS-refusable in normal operation. This is a silent-failure
defect, not a live disclosure gap. Severity medium because the failure mode is **silence on a legal
obligation**, not because it fires often.

**Closes when** a failed profile read makes the export fail loudly (or annotate the bundle) rather than
silently omit the section, proven by a spec that forces the read to fail and asserts the user is told —
red before, green after.
