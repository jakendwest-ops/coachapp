---
id: 2026-07-13-log-session-1rm-field-throws-a-referenceerror-on-every-keyst
status: fixed-awaiting-jake
priority: low
reported: 2026-07-13
status_detail: "fixed — awaiting Jake"
---

# Log-session 1RM field throws a ReferenceError on every keystroke

**LOW — Log-session 1RM field throws a ReferenceError on every keystroke.** `app-runner.js:1918`: `oninput="block.oneRM=this.value"` — `block` is a `.map()` parameter and is out of scope in an inline handler (resolves element→document→window). So the %1RM auto-fill hint never appears until the user happens to touch a % field. Should be `window._logBlocks[N].oneRM`. Also :1891 rebuilds `innerHTML` on every keystroke, so you cannot type a two-digit %1RM (focus is destroyed after the first digit).
