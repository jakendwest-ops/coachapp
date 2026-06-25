---
name: mobile-check
description: Run after any UI change to verify it works on mobile. Checks sidebar vs bottom-nav visibility, tap target sizes, modal classes, and renders at 390px viewport. Invoke when building new UI, adding nav elements, or after a visual bug report.
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
After making any UI change, resize the preview to 390×844 and check:

```js
// In preview_eval:
preview_resize(390, 844)
// Then check the element is visible:
document.getElementById('YOUR_ELEMENT_ID')?.offsetParent !== null
// offsetParent === null means the element is hidden or has display:none
```

Then take a snapshot or screenshot to confirm layout at mobile width.

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
- Before every Netlify deploy
