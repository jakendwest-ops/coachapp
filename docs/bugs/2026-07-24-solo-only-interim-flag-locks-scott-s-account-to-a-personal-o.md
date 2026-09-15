---
id: 2026-07-24-solo-only-interim-flag-locks-scott-s-account-to-a-personal-o
status: fixed-awaiting-jake
priority: high
reported: 2026-07-24
status_detail: "fixed — awaiting Scott's insert SQL"
---

# solo_only interim flag locks Scott's account to a personal-only experience while the real Solo-account-type wo

✅ **FIXED + LIVE 2026-07-24 (57a188a) — `solo_only` interim flag** locks Scott's account to a personal-only experience while the real Solo-account-type work (above) is pending. New `profiles.solo_only boolean default false`; when true, `loadUserInfo()` skips `window._masterAccount` so the view-switcher never renders. **Multi-agent review caught 3 real bugs in the first cut, all fixed same push:** (1) the branch force-assigned role:'solo' even when the self-referential clients-row lookup was empty/errored — since switchView is deliberately blocked, a misconfigured account had no way out; now only reassigns on a confirmed row. (2) `window._masterAccount`/`_soloClientId`/`_masterClientId` and the switcher's visibility are session state loadUserInfo only ever SETS, never resets — the primary sidebar sign-out button doesn't reload the page, so on a shared device the next account signing in on the same tab inherited the previous account's `_masterAccount=true`, handing a solo_only account a working escape hatch. Now reset on sign-out. (3) a failed profiles fetch defaulted an unrecognised role to the full coach nav — `showApp` now fails closed (retry screen) instead. `tests/solo-only-2026-07-24.spec.js` (5 tests). **Known, banked limitation — not fixed**: enforcement is client-side only. This session's own repair work already proved a user's own authenticated session can self-write `solo_only`/`role` via the anon client (used repeatedly tonight to fix stuck test-account state) — RLS on `profiles` is row-scoped, not column-scoped. A technically-inclined locked-out user could self-revert via devtools. Low practical risk for Scott specifically (a trusted family member, not an adversary); real fix needs a DB-level trigger/policy, tied to the Solo-real-account-type decision above.
