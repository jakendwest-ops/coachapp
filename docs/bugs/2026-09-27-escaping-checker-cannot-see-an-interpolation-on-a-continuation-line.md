---
id: 2026-09-27-escaping-checker-cannot-see-an-interpolation-on-a-continuation-line
status: open
priority: medium
reported: 2026-09-27
status_detail: "OPEN. Found by a neuter run while closing 2026-08-19-ctx-backlabel-and-clientname-rendered-raw: removing escapeHtml from a real XSS sink failed nothing, because scripts/check-escaping.mjs only treats a line as markup if that line itself contains '<'. How many unescaped sinks sit on continuation lines today is UNMEASURED."
---

# The escaping checker cannot see an interpolation on a continuation line

**Plain English.** The check that stops client-typed text being rendered as HTML (`scripts/check-escaping.mjs`, run on every push)
looks at one line at a time and skips any line with no `<` on it. In a multi-line HTML template, a value can sit on its own line
with the tags on the lines around it, and the checker never looks at it.

**Evidence (2026-09-27).** `js/app-workouts.js` renders the template editor's Back button as
`<a class="back-btn" …>` then, on its own later line, `${escapeHtml(_ctx.backLabel)}`. Removing that `escapeHtml` left
`tests/escaping-sweep-2026-08-12.spec.js` (which runs the checker) green. A new behavioural spec now guards that one sink
(`tests/template-back-label-escaping-2026-09-27.spec.js`), but the class is unguarded.

**Fix sketch (not built).** Track whether the current line is inside a template literal whose markup began earlier (e.g. an
open backtick after `innerHTML =` / a `<` since the last closing backtick), and treat those lines as markup. Measure what it
flags over js/ before giving it teeth (every current finding must be either a real sink or named), add must-block and must-pass
self-test cases, and re-run the backLabel neuter to prove it now fires.
