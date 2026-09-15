---
id: 2026-07-23-every-playwright-mobile-check-now-genuinely-runs-at-390px
status: fixed-awaiting-jake
priority: high
reported: 2026-07-23
status_detail: "fixed — awaiting Jake"
---

# every Playwright "mobile check" now genuinely runs at 390px

✅ **SHIPPED LIVE 2026-07-25 (edb8995) — every Playwright "mobile check" now genuinely runs at 390px.** Root cause confirmed exactly as scoped: `playwright.config.js`'s `chromium` project spread `...devices['Desktop Chrome']`, whose own `viewport:{1280,720}` silently overrode the top-level `390×844` — fixed by re-overriding viewport *after* the spread. That unmasked the real bug: `renderNav()` writes an identical `data-page` link into both the sidebar nav and the bottom nav for every page (CSS alone, a 900px breakpoint, decides which is shown), so a bare `[data-page="x"]` click resolved to the (now-hidden) sidebar copy and timed out. Same shape for the Personal switcher (`#vs-personal`/`#mvs-personal`) and sign-out — which turned out to have a THIRD wrinkle: a second, non-viewport-gated sign-out button living in the Settings page body, not just a sidebar/bottom-nav pair (given a new `id="settings-sign-out-btn"`, app-progress v26→v27). Added `clickVisible`/`waitForVisible` to `tests/helpers.js` (append Playwright's native `:visible` pseudo-class to one or more candidate selectors) and migrated 56 call sites across 19 spec files — sequenced as call-sites-first (full suite green at the still-broken viewport, proving the swap alone changed nothing) then the config flip. **Answers the "unknown until then" question**: at the real 390px viewport, 218/220 passed, 2 skipped, 0 failures, 1 flake that reproduced clean in isolation (pre-existing, unrelated) — **zero new real mobile-layout bugs surfaced.** The app really was fine; only the tests were coupled to desktop chrome. Multi-agent review (3 angles) clean. Needs your eyes live, though there's nothing behavioral to actually verify — this is test-infra only, no product code changed except the one inert id attribute.
