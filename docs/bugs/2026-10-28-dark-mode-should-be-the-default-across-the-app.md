---
id: 2026-10-28-dark-mode-should-be-the-default-across-the-app
status: fixed-awaiting-jake
priority: medium
reported: 2026-10-28
status_detail: "SHIPPED in v2026.10.8 (live 2026-10-29, verified byte-identical to the tag): dark is the default for everyone with no saved choice, the login and privacy pages included; Settings > Appearance offers Dark, Light and Match my phone, kept on that phone only (Jake's choice, no SQL); Light is the old palette token for token. tests/dark-mode-sweep-2026-10-29.spec.js sweeps every page for a coach, a client and a Personal account, a dialog and the runner. Not asserted: contrast between 3:1 and 4.5:1; four small Light shade shifts and a chart left open when the phone flips theme are in releases/v2026.10.8.md. It closes only when Jake confirms on his phone that nothing looks broken. WAS: REQUESTED by Jake 2026-10-28 after seeing the workout-editor prototype, which rendered dark because his phone is set to dark mode: 'i also prefer the dark mode, could we make that the default across the app'. The real app has NO dark theme today: css/main.css defines one light palette in :root (14 colour tokens; 631 var() uses against 26 literal colours outside :root), there is no color-scheme, no prefers-color-scheme and no theme setting. Measured 2026-10-28: about 51 surface or text colours are still hard-coded in the JS (runner 28, progress 8, core 6, workouts 4, calendar-goals 3, programs 1, clients 1), about 15 literal colours in the CSS (badge text, hover states, placeholder, gradients), the chart theme already reads its colours from the CSS at render time, privacy-policy.html and 404.html carry their own light styles, and only 3 specs assert a colour (the amber and green toast backgrounds, which must not change). Not yet planned or approved."
closing_conditions: "A new account and a signed-out visitor see the dark theme by default; Settings offers Dark, Light and Match my phone and remembers the choice; every screen a coach, a client and a Personal account can reach (including the runner, the charts, modals, the login page, the privacy page and the 404 page) is readable in both themes, proved by a sweep spec that fails on low-contrast text or a light surface left in the dark theme; Jake confirms on his phone that nothing looks broken."
---

# Dark mode should be the default across the app

## Jake's request (verbatim, 2026-10-28)

> i also prefer the dark mode, could we make that the default across the app

**Closes when:** A new account and a signed-out visitor see the dark theme by default; Settings offers Dark, Light and Match my phone and remembers the choice; every screen a coach, a client and a Personal account can reach (including the runner, the charts, modals, the login page, the privacy page and the 404 page) is readable in both themes, proved by a sweep spec that fails on low-contrast text or a light surface left in the dark theme; Jake confirms on his phone that nothing looks broken.
