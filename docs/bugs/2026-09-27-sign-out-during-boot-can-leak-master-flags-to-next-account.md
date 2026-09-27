---
id: 2026-09-27-sign-out-during-boot-can-leak-master-flags-to-next-account
status: open
priority: low
reported: 2026-09-27
status_detail: "Found by the multi-agent review of the 2026-09-27 audit quick fixes (read from code, not reproduced). Pre-existing since the 2026-07-24 reset was added; the new .mvs-on line follows the same shape. Narrow timing window."
---

# A sign-out while the app is still loading can hand the master-account flags to the next person

**Plain English.** When Jake's account starts loading, the app asks the database whether it is the "master" account (the
one that can switch between PT, Client and Personal views). If Jake signs out *while that question is still in flight*,
the sign-out resets the flags, but then the late answer arrives and sets them again. If a different person then signs in on
the same tab without a page reload, they inherit the switcher, and `switchView`'s only guard (`_masterAccount`) is
defeated.

## Evidence (code, not run)

- `showApp()` awaits `loadUserInfo()`, whose coach branch awaits two `clients` lookups, then sets
  `window._masterAccount = true`, shows `#view-switcher` and adds `.mvs-on` (`js/app-core.js`, the `if (coachedRec)` /
  `if (soloRec)` lines).
- The SIGNED_OUT handler (`js/app-progress.js`) resets them, but nothing stops an in-flight `loadUserInfo` from setting
  them again afterwards, and `loadUserInfo` never clears them at its start.
- Window: the lookups must have left before the sign-out (after it, RLS returns no rows), and the next sign-in must happen
  without a reload (the sidebar route does not reload; Settings does).

## Fix shape

In `loadUserInfo`, capture the user id at entry and apply the master flags only if `currentUser?.id` still matches after
the await (the same guard `showApp` already uses for `_errorReportingUid`), or reset the flags at the start of
`loadUserInfo`. Test: start a boot, sign out mid-lookup, sign in as the client, and assert no pill and
`_masterAccount !== true`.
