---
id: 2026-08-25-deploy-check-5c-names-a-signup-form-that-was-removed
status: fixed-awaiting-jake
status_detail: "Reworded same session (2026-08-25): 5c now names #invite-form, states self-signup is closed, and gained a PRIVACY_POLICY_VERSION sub-check pointing at rule 9e. Skill file only — not yet backed up to claude-config at time of writing."
priority: low
reported: 2026-08-25
---

# /deploy-check item 5c checks a form that no longer exists

Found 2026-08-25 during the first full `/deploy-check` run since 2026-07-12.

Item 5c says: *"PASS if consent checkbox exists in index.html **signup form**"*.

**Public self-signup was removed entirely on 2026-07-24** (`57a188a`) — the form, its handlers and the
show-signup/show-login toggle. The consent checkbox added on 2026-08-24 lives on `#invite-form`
(`index.html:94`), a different surface reached a different way.

The item PASSED today, but it passed because I read it correctly and checked the right form — not
because the text pointed there. The next reader could equally grep for a signup form, find nothing,
and mark it FAIL; or find the invite checkbox and not notice the checklist was describing something
else. On a checklist whose entire job is catching stale assumptions, that is the wrong failure mode.

**Closing evidence:** reword 5c to name `#invite-form`, and state that self-signup is closed so a
future reader does not go looking for it.

**Related:** the same run found the consent *version* coupling unenforced — see
`2026-08-25-privacy-policy-version-coupling-was-unenforced`.
