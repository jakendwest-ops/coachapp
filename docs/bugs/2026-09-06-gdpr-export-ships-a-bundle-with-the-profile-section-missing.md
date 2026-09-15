---
id: 2026-09-06-gdpr-export-ships-a-bundle-with-the-profile-section-missing
status: open
priority: medium
reported: 2026-09-06
status_detail: "Found by the 2026-09-06 full-file review's mechanical sweep (the agent half of that review was killed by a rate limit and has NOT run). js/app-progress.js:3185 discards the error on the profiles read that fills bundle.profile, so a failed read produces a subject-access export with the profile section silently absent and the download still reporting success. Latent, not reachable on demand."
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
