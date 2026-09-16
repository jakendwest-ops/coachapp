---
name: mobile-check
description: Run after any UI change to verify it works on mobile. Checks sidebar vs bottom-nav visibility, tap target sizes, modal classes, and renders at a real 390x844 phone viewport. Invoke when building new UI, adding nav elements, or after a visual bug report.
---

# Mobile compatibility check

Run this after every UI change that adds or modifies a visible element. Do not skip it — the sidebar is hidden on mobile and any element placed only inside it will be invisible on phones.

## Checklist — run every item, in order

### 1. Container visibility
- Is the new element inside `<aside class="sidebar">`?
  - If yes: is there a mobile equivalent outside the sidebar? If not, add one.
  - Common trap: sidebar-footer widgets (toggles, switchers, user info) are invisible on mobile.

### 2. Dual-surface rule
Any persistent control (view switcher, account toggle, status indicator) must appear in **both**:
- `<aside class="sidebar">` → desktop
- Outside the sidebar (fixed/floating element, or inside `<nav class="bottom-nav">`) → mobile

### 3. Tap targets
All interactive elements on mobile must meet minimum tap target size:
- Buttons: at least `height: 44px` OR `padding: 10px+` vertically
- Icon-only buttons: wrap in a 44×44px touch area
- Links in lists: full-row tap area via `display:flex` on the row

### 4. Modal class
Any modal that slides up on mobile must include `modal-fullscreen-mobile` class:
```html
<div class="modal modal-fullscreen-mobile" ...>
```

### 5. Input fields
Number inputs must use `inputmode`:
- Integers → `inputmode="numeric"`
- Decimals → `inputmode="decimal"`
- This triggers the correct keyboard on iOS/Android.

### 6. Viewport verification — always run this
Verify at **390×844** — a real iPhone width, and the same viewport `playwright.config.js` already uses for
the whole suite. (This step used to say 480 and call a `preview_resize` tool — LINT-OK, historical note only.
Both were artifacts of a preview
toolset that does not exist in this harness; the 480 figure existed only to work around its black bars.
Resolved 2026-07-13 — there is one mobile width now, and it is 390.)

Write a throwaway spec (see the `run-coachapp` skill for the full pattern), then **look at the screenshot**:

```js
// tests/_adhoc.spec.js — gitignored; delete when done
const { test } = require('@playwright/test')
const { loginAsPT } = require('./helpers')

test('mobile check', async ({ page }) => {          // 390×844 comes from playwright.config.js
  await loginAsPT(page)
  await page.goto('/#YOUR_PAGE')
  const visible = await page.locator('#YOUR_ELEMENT_ID').isVisible()
  console.log('visible:', visible)                  // false = hidden, display:none, or sidebar-only
  await page.screenshot({ path: 'mobile.png', fullPage: true })
})
```

```bash
npx playwright test tests/_adhoc.spec.js --reporter=list
```

`Read` the PNG. A passing assertion is not a mobile check — **you have to look at it.** Check for
overspill (content wider than the viewport), clipped text, and controls hidden behind the bottom nav.

### 7. Bottom nav item count
The bottom nav has 5 items. On screens < 375px wide this can get cramped. If you add or remove nav items, check they all fit without wrapping.

## Quick reference — known mobile-only patterns in CoachApp

| Pattern | Mobile | Desktop |
|---|---|---|
| Primary nav | `<nav class="bottom-nav">` | `<aside class="sidebar">` |
| Modal | slides up from bottom (`.modal-fullscreen-mobile`) | centred overlay |
| Workout logger | 4-col simplified grid | 9-col full grid |
| View switcher | floating pill above bottom nav (`#mobile-view-switcher`) | sidebar toggle (`#view-switcher`) |
| Number inputs | `inputmode="decimal/numeric"` | standard `type="number"` |

## When to invoke

- After adding any new nav item, toggle, switcher, or persistent control
- After adding a new modal
- After any bug report that mentions "not showing on mobile" or "can't see on phone"
- Before every deploy to GitHub Pages

## Last step — record that this ran

`gates-fired` (the check that used to prove this gate fires by grepping the Vault's `LOG.md`) was
retired 2026-09-15 when `LOG.md` was frozen, with no replacement built — this project now has zero
mechanical evidence mobile-check still runs on real UI changes. Start closing that gap the same way
`full-file-review` already proves it: stamp a marker on every real run.

```bash
node -e "require('fs').writeFileSync('C:/Users/jaken/.claude/state/last-mobile-check-run', new Date().toISOString())"
```

Deliberately just the marker, not a new staleness gate — this runs on UI changes specifically, which is
event-triggered, not periodic, so a naive "N days since last run" RED would misfire on any stretch spent
on backend/data work with no UI touched. Giving it teeth needs measurement first, same as every other
gate here — not done in this pass.
