---
id: 2026-08-17-escapeattr-survives-via-string-concatenation
status: fixed-awaiting-jake
priority: medium
reported: 2026-08-17
status_detail: "FIXED commit 28258aa, live 2026-08-19 (app-workouts v73). CHECKER FIRST, then the 9 sites. Both syntactic shapes now enumerated from a grep of the 14 chars before every escapeAttr( call, and a test plants one of EACH and asserts the correct handler usage is not flagged — verified red-before by reverting the rule to its 2026-08-16 form. An indirection rule was written and removed the same hour (it flagged correct code). Following it found a LIVE XSS — see 2026-08-19-ctx-backlabel-and-clientname-rendered-raw."
---

# The escapeAttr class was declared closed on 2026-08-16 — 9 sites survive, and the checker cannot see them

Commit `667755e` fixed `escapeAttr` in plain attributes at 58 sites and strengthened
`scripts/check-escaping.mjs` so the class could not recur. It can. Nine live sites remain in the template
editor because they build the attribute by **string concatenation**, not interpolation:

```js
mini(`ts-restmin-${i}`, 'type="text" ... value="' + escapeAttr(String(s.restMin || '0:00')) + '"')
```

`js/app-workouts.js:1619`, `1621` (x2), `1640` (x2), `1649` (x2), `1656` (x2).

The 2026-08-16 rule matches only the interpolated form (`/=\s*"\$\{\s*escapeAttr\(/g`), so the
checker **exits 0** with all nine present. Its own docstring notes that half this codebase builds
attribute fragments inside helpers (`mini()`, `gmini()`, `row()`) — exactly where the concatenated form
lives.

## Impact: low today

Not injection — `escapeAttr` still HTML-escapes, so quotes and angle brackets stay neutralised. The
damage is the documented corruption: the browser returns the backslash through `.value`, and `sets_json`
is re-saved on every edit, so a backslash grows one level per render → `flushTemplateSets` → save cycle.
These fields are constrained to digits and a colon by `oninput="this.value=fmtRestInput(this.value)"`,
which keeps it theoretical rather than active.

## The lesson

**A green checker was taken as proof the class was closed** — the 2026-08-16 write-up said so in those
words. Verify a class guard by planting an instance in EACH syntactic form the codebase actually uses,
not only the form that motivated the rule.
