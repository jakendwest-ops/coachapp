---
id: 2026-08-29-most-open-rows-never-say-what-would-close-them
status: open
priority: high
reported: 2026-08-29
status_detail: "Measured 2026-08-29: 21 of 30 open rows (70%) state no closing condition, and 19 of the 26 open rows aged 7+ days (73%) state none. The closure rule demands evidence the rows never name, so stale-bugs stays RED and nobody can tell which rows are actually actionable."
---

# Most open ledger rows never say what would close them

Found while running `/save` Step 8, whose whole purpose is *"state what specific evidence would close
it — that is the only thing that makes the list actionable rather than a guilt pile."* Trying to do that
for the 8 high-priority open rows, **6 of them had nothing to extract.**

## Measured, not estimated

| Set | Count | With no stated closing condition |
|---|---|---|
| All bug files | 193 | 132 |
| `status: open` | 30 | **21 (70%)** |
| `status: open`, aged 7+ days | 26 | **19 (73%)** |

Grep basis: a row "states a closing condition" if it contains any of `closes when`, `closes only`,
`will close`, or `closed_by` (case-insensitive).

**Discrepancy worth naming rather than papering over:** `os-lint`'s `stale-bugs` reports **21** rows
open 7+ days; my own pass over the same directory counts **26**. Same fact, two numbers, so at least one
filter differs. That is [[feedback_two_fields_one_fact]] and it needs resolving as part of this row —
whichever is right, they should not disagree.

## Why this is the actual cause of the stale-bugs RED

The standing closure rule is strict and correct: *a Jake-reported item closes ONLY on (a) Jake
confirming it, or (b) a test that went RED before the fix and GREEN after.* But a row that never states
which confirmation or which test would satisfy it **cannot be closed by anyone** — not by me, not by
Jake. It can only be re-read, re-judged, and left open. That is exactly the observed behaviour: rows
sitting 22-55 days while every session re-reads them.

The rows are not stale because the work is hard. They are stale because **nobody wrote down what
"done" looks like**, so every attempt to close one restarts the judgement from scratch.

This is the same shape as [[feedback_reports_success_doing_nothing]] inverted: not a check that passes
without looking, but a row that can never pass at all, because it defines no passing condition.

## The fix is a check, not a rule (RULE 0)

A written instruction to "always add a Closes-when line" already effectively exists in the intake
convention and has produced 70% non-compliance — see
[[feedback_written_rules_dont_reduce_errors]]. What is needed is an `os-lint` check that **refuses**:

- a new bug file with `status: open` and no closing condition,
- ratcheted on the existing 21 so it pins AT the measurement and cannot grow — see
  [[feedback_threshold_at_current_not_above]], and grandfathers the backlog the way the predictions
  gate does rather than walling its owner on day one.

**Prove it can fail before trusting it** — plant a conditionless row and confirm it goes RED.

**Closes when:** an os-lint check exists that refuses a new conditionless `open` row, has been shown to
go RED on a planted one and GREEN when the line is added, and the 21 existing rows are either backfilled
with a closing condition or explicitly grandfathered in a baseline file.

---

## Same-day refinement: a closing condition must be SATISFIABLE, and 2 of my first 4 were not

Four rows filed this morning were closed this afternoon. **Two of their closing conditions could not be
met as written**, and neither failure was about the fix — both were about my condition:

| Row | Condition I wrote | What was wrong |
|---|---|---|
| `...unverified-slot-id` | *"a **cross-tenant** probe ... RED without the anchor"* | A cross-tenant probe **passes with the anchor deleted** — RLS already refuses a foreign write. It would have proved RLS works, not the anchor. The real test is single-tenant with my own mismatched ids. |
| `...visibility-not-ownership` | *"a spec drives each with a client id the caller can READ but does not OWN"* | **No such id exists.** RLS refuses a foreign `clients` read, so there is nothing to pass. Written anyway, it would pass with the fix removed. |

The other two conditions (the interval leak, the dead Save) were met exactly as written.

**So the rule needs a second half.** "State what would close it" is necessary and not sufficient — a
condition that cannot be satisfied is just a differently-shaped way for a row to sit open forever, and
it is *worse* than none, because it looks like rigour.

**The tell, both times:** I reached for a **cross-tenant** test where the defence being added is
**app-level defence-in-depth over a database that already refuses**. That is
[[feedback_guard_risk_is_refusing_the_legitimate_user]] from the other direction — there, a refusal test
over RLS proves nothing; here, it is a closing condition that proves nothing. Same root: *asking the
wrong layer for the evidence.*

**How to apply when writing a closing condition:**
1. Name the layer that would actually fail if the fix were absent. If that layer is the database, a
   behavioural test cannot be the evidence — a **source class guard** is, and say so in the condition.
2. Ask "could I write this test today?" before writing the condition, not after.
3. If a condition turns out unsatisfiable, **amend it in the row and say why** — do not quietly declare
   it met. Both amendments above are recorded in their rows.

This does not weaken the original finding: 21 of 30 open rows still state no condition at all. It means
the check proposed there should ideally assert a condition **names its evidence layer**, not merely that
the words "closes when" appear — otherwise it measures prose, which is
[[feedback_written_rules_dont_reduce_errors]] rebuilt as a linter.
