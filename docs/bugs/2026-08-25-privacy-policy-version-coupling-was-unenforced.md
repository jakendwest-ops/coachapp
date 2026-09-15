---
id: 2026-08-25-privacy-policy-version-coupling-was-unenforced
status: fixed-awaiting-jake
priority: high
reported: 2026-08-25
status_detail: "FIXED same session: checks.sh rule 9e + scripts/check-policy-version.mjs (+8-case self-test). Proven to refuse a real induced drift through checks.sh (exit 1). NOT PUSHED as of this save."
---

# PRIVACY_POLICY_VERSION and the policy document could drift apart silently

Found 2026-08-25 during `/deploy-check` item 5c.

`js/app-core.js` carried this as a **comment**:

> MUST match the "Last updated:" date in privacy-policy.html — bump both together

A prose obligation with no writer — the exact class OS v3 exists to close (RULE 0 for documents). The
two agreed when found (`'2026-06-29'` vs "29 June 2026"), so nothing was broken. Nothing made them
keep agreeing.

**Why this one matters more than the usual drift.** `_needsConsent()` re-prompts only when
`consent_policy_version !== PRIVACY_POLICY_VERSION`. Edit the policy text without bumping the
constant and every existing user keeps a consent record pointing at a version of the document they
never saw, and **nobody is re-prompted**. There is no user-visible symptom and no error — the gate
just quietly stops firing. That is a UK GDPR consent failure on special-category health data.

**Fix:** `scripts/check-policy-version.mjs`, wired into `checks.sh` as rule 9e (blocking). Measured
before being given teeth (les-082): zero violations on a clean tree, so it is a pure ratchet and can
only fire on a real regression. Self-test runs first and blocks on its own failure (same shape as
rule 2), 8 cases, including a **live-plumbing** case per les-083 asserting both real paths resolve —
without asserting they agree, which would make the self-test go red for the very drift it detects.

**Proven, not assumed:** self-test 8/8; live rule exit 0; a copy of the real policy with only the
date changed → **exit 1**; full `checks.sh` clean tree → exit 0; full `checks.sh` with drift → **exit 1,
push blocked**.

**Closing evidence:** Jake confirming the gate is wanted, and the commit landing on master.
