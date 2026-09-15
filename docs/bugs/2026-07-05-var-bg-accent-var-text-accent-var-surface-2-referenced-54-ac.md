---
id: 2026-07-05-var-bg-accent-var-text-accent-var-surface-2-referenced-54-ac
status: fixed-awaiting-jake
priority: medium
reported: 2026-07-05
status_detail: "fixed — awaiting Jake"
---

# var(--bg-accent)/var(--text-accent)/var(--surface-2) referenced 54× across 7 files, never defined in css/main

**`var(--bg-accent)`/`var(--text-accent)`/`var(--surface-2)` referenced 54× across 7 files, never defined in `css/main.css`** — same bug class as the `.dashboard-card` fix, app-wide. **FIXED 2026-07-23 (main.css v6)** as part of the builder overhaul: audited all 48 `--surface-2` uses first (every one a `background`), then defined all three against the existing palette. 18 days open. Needs your eyes — every one of those 54 sites was silently rendering transparent/inherited before, so this changes the look of surfaces across the app.
