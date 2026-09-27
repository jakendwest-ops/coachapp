---
id: 2026-09-27-every-phone-user-sees-the-pt-view-switcher-pill
status: closed
priority: low
reported: 2026-09-27
status_detail: "CLOSED 2026-09-27 by rule (b): tests/app-audit-quickfixes-2026-09-27.spec.js 'a client on a phone does not see the view-switcher pill' went RED before the fix and GREEN after; a second test proves the master account still sees it. Live once the next release is cut."
---

# Every phone user saw the "PT" view-switcher pill

**Plain English.** The floating PT / Client / Personal pill is meant only for Jake's own account. On phones, every user
(clients, plain coaches, solo users) saw a "PT" pill above the bottom nav. Tapping it did nothing for them (`switchView`
refuses non-master accounts), so it was confusing, not a security hole.

## Evidence

- Reproduced 2026-09-27 by a Playwright probe logged in as the E2E client at 390x844 (screenshot: "PT" pill over the nav).
- `css/main.css` forced `#mobile-view-switcher { display: flex !important; }` at max-width 900px, and no JavaScript ever
  showed or hid the container; `updateViewSwitcherButtons` toggled only the Client and Personal buttons.

## Fix

The pill shows only with class `.mvs-on`, added in `loadUserInfo`'s master-account branch (app-core.js) and removed in the
SIGNED_OUT handler (app-progress.js). The modal-hide rule still wins by specificity, so the pill still hides behind sheets.

Related, older race found in review: `2026-09-27-sign-out-during-boot-can-leak-master-flags-to-next-account`.
