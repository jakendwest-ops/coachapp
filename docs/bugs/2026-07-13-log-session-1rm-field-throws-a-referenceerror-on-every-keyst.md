---
id: 2026-07-13-log-session-1rm-field-throws-a-referenceerror-on-every-keyst
status: unverified-accepted
priority: low
reported: 2026-07-13
status_detail: "UNVERIFIED-ACCEPTED by Jake 2026-09-27 (batch reply 'ok'): the fix is present in current code (checked 2026-09-27, commit 134140f), but no red->green test proves it, so it is no longer tracked."
---

# Log-session 1RM field throws a ReferenceError on every keystroke

**LOW — Log-session 1RM field throws a ReferenceError on every keystroke.** `app-runner.js:1918`: `oninput="block.oneRM=this.value"` — `block` is a `.map()` parameter and is out of scope in an inline handler (resolves element→document→window). So the %1RM auto-fill hint never appears until the user happens to touch a % field. Should be `window._logBlocks[N].oneRM`. Also :1891 rebuilds `innerHTML` on every keystroke, so you cannot type a two-digit %1RM (focus is destroyed after the first digit).
