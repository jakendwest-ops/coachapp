---
id: 2026-08-25-checks-sh-rule-2-clients-sub-check-was-vacuous
status: fixed-awaiting-jake
priority: high
reported: 2026-08-25
status_detail: "found while executing OS v3 R1 (flip rule 2 warn->fail). Fixed in d361f87 by replacing all three sub-checks with scripts/check-query-scope.mjs. Awaiting Jake because the closure evidence is a self-test, not a red->green run against a real reported defect."
---

# checks.sh rule 2 guarded the top bug class and could never fire

The gate covering this project's **most-shipped bug class** — unscoped multi-tenant queries, four
separate solo/`coach_id` bugs — was three `warn`-only sub-checks. OS v3's plan (R1) said flip them to
`fail`. Measuring first is the only reason that did not ship a disaster.

## What was actually wrong

**Sub-check 1 (`clients`) was VACUOUS — it had never been able to fire and never would.**

```sh
if grep -A3 "from('clients')" $FILES | grep -q "\.select('\*')" && \
   ! grep -A5 "from('clients')" $FILES | grep -q "coach_id"; then
```

The second condition requires that **no** `clients` query anywhere in `js/` carries `coach_id` within
5 lines. Measured 2026-08-25: **40 occurrences do.** So the `&&` could never be satisfied. It read as
protection for months while being structurally incapable of refusing anything.

**Sub-checks 2 and 3 were single-LINE greps against a codebase that chains across lines.**

```js
const { data: existing } = await db.from('programs').select('id')
  .eq('coach_id', currentUser.id)      // <- the anchor, on the NEXT line, invisible to the grep
```

Run against a clean tree they reported **4 violations, every one a false positive**. Flipping them to
`fail` as written would have blocked every push by refusing correct code — on the one rule most in
need of teeth, and therefore the one most likely to be switched off.

## Fix

Replaced by `scripts/check-query-scope.mjs`, which reads the whole chained expression. Two defects in
the checker itself were found by *running* it, not reading it: inserts anchor in the payload rather
than in a filter (11 false findings), and chains resume after comment lines (1 more).

Now: **0 findings on the real tree, 13/13 self-test cases**, and it catches an unanchored query
injected into a real module. `.or('coach_id.eq.<uid>,user_id.eq.<uid>')` is a first-class anchor, so
the rule cannot push new code into the solo bug it exists to prevent. `checks.sh` runs the self-test
first and fails on its failure — a checker nothing verifies is the decorative shape being replaced.

## Why this is its own row

Same class as `2026-08-22-checks-sh-cache-bust-blindness`: the gate existed, was trusted, and could
not ring. Third instance of `feedback-reports-success-doing-nothing` in OS machinery.
