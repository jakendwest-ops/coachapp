---
id: 2026-07-17-both-halves-of-this-row-s-own-recommendation-done-together
status: fixed-awaiting-jake
priority: low
reported: 2026-07-17
status_detail: "fixed — awaiting Jake"
---

# both halves of this row's own recommendation done together

✅ **FIXED + LIVE (LOCAL) 2026-08-01 — both halves of this row's own recommendation done together.** `index.html`'s viewport meta no longer sets `maximum-scale=1.0` (restores pinch-to-zoom); **and**, per this row's own flagged risk, `css/main.css` now sets `input, textarea, select { font-size: 16px }` (was `inherit`, i.e. 14px) so removing the zoom lock doesn't trade "can't zoom" for "the page jump-zooms every time you tap a field" — iOS Safari auto-zooms on focus for any input below 16px. Visually confirmed at 390px (Add-client modal, no overflow/clipping). — (orig) **Runner/mobile: viewport blocks pinch-to-zoom (accessibility).**
