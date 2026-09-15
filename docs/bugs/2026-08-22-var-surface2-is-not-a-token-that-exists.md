---
id: 2026-08-22-var-surface2-is-not-a-token-that-exists
status: fixed-awaiting-jake
closed_by: "FIXED 0a23684 (progress v52), pushed 857c5e1. BOTH halves done: the typo (--surface2 -> --surface-2) AND the class (checks.sh rule 3c cross-checks every var() referenced in js/ against every token defined in main.css). Red-before used the REAL defect rather than a probe — with the typo present rule 3c fails naming --surface2; fixed, it passes. AWAITING JAKE because this is a VISIBLE change: the Progress table header gains the light grey it was always meant to have."
priority: low
reported: 2026-08-22
status_detail: "PRE-EXISTING, not introduced by the tokenisation. Found by a static check I ran while waiting for a suite: every var() referenced in js/ vs every token defined in main.css."
---

# `js/app-progress.js:851` uses `var(--surface2)` — the token is `--surface-2`

```html
<tr style="background:var(--surface2)">
```

`css/main.css:22` defines `--surface-2: #eceff3`. There is no `--surface2`. The declaration is
therefore invalid and the row renders with no background instead of the intended light grey.

**Pre-existing.** Verified present in `8d389e7`, the commit this session started from — the
tokenisation work did not introduce it. Found by cross-checking every token NAME referenced by
`js/*.js` (47 distinct) against every token DEFINED in `css/main.css` (68 distinct). It is the only
mismatch.

## Why it went unnoticed

An undefined custom property does not error. The declaration is simply dropped, so the element
falls back to its inherited background and looks *plausible*. This is the same silent-failure shape
as the rest of this project's recurring bug class — nothing reports, nothing breaks, it just quietly
does not do what it says.

`tests/design-tokens-2026-08-22.spec.js` cannot catch it: that test asserts every token I DEFINED
resolves to its intended value. It never asks whether a token REFERENCED in js/ exists.

## The fix is two parts, and the second is the point

1. **The instance:** `--surface2` -> `--surface-2`. One character. NOTE this is a VISIBLE change —
   the row gains the grey background it was always meant to have. Deliberately not done at the end
   of a long unsupervised session; it wants Jake's eyes.

2. **The class — a `checks.sh` rule.** The check is exactly the command that found it:

```sh
# every var(--x) referenced in js/ must be defined in css/main.css
grep -ohE 'var\(--[a-z0-9-]+' js/*.js | sed 's/var(//' | sort -u > used
grep -ohE '^\s*--[a-z0-9-]+:' css/main.css | tr -d ' :' | sort -u > def
comm -23 used def     # any output = a referenced token that does not exist
```

**Do NOT add that rule before fixing the instance** — the tree currently violates it, so the rule
would fail immediately and block every push. Fix, then ratchet.

This matters more now than it did yesterday: the tokenisation added ~770 new `var()` references. The
fallback form `var(--token, <literal>)` protects those specific ones, but a bare `var(--x)` written
by hand later has no such protection, and there is currently nothing checking.

**Closes when:** the typo is fixed AND the checks.sh rule exists, demonstrated failing on a
deliberately bad token reference before being trusted.
