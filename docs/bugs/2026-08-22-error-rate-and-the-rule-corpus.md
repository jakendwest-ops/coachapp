---
id: 2026-08-22-error-rate-and-the-rule-corpus
status: open
priority: high
reported: 2026-08-22
status_detail: "Jake-reported process problem, not an app bug. Filed under the intake rule so the MEASUREMENT survives the session — the fixes shipped, the verdict has not been taken."
---

# Jake: "you have gotten numerous things wrong over the last 24 hours" — and the rules did not prevent it

Jake raised this directly on 2026-08-22, then asked whether the rule corpus itself was the cause
("Do you have too many rules that contradict"). Filed as a row because the remedies shipped the same
day but **the measurement that decides whether they worked has not been taken.**

## What was measured, not asserted

- **Roughly seventeen distinct errors in 24 hours**, in three groups: generalising from one instance
  to a class; stating a rule and breaking it in the same edit; skipping verification when a claim
  felt too small to check.
- **All six of the day's error classes ALREADY had a rule.** Not one was a gap. So rule availability
  was never the binding constraint, and adding a rule buys nothing.
- Corpus at the time: 41 feedback memories, ~309 imperatives across ~3,100 lines, growing ~20 new
  rules per month (24 in July, 16 in the first 22 days of August).
- **Contradictions: one live, created that same hour** — the review-timing rule changed in two places
  and left four stale. An earlier contradiction had already been found and fixed. So contradiction is
  a symptom, not the mechanism.

## The diagnosis

The rules are stated as things to KNOW; the failures are failures to ENUMERATE. Where an enumeration
actually ran that day the work was right first time (45 write sites across 23 functions, no review
finding against it) because the rule says COUNT. Every failure was somewhere a space was reasoned
about instead of listed.

Aggravating factor: **writing the rule produces the feeling of having applied it.** Three times in
24 hours a principle was stated in a comment and violated in the same edit.

## What shipped in response

- **RULE 0** — an incident produces a CHECK, or it produces nothing. Enforced by `os-lint`'s `rule-0`
  check (new memories must carry `enforced_by:`), not by prose. Proven able to go RED.
- Six prose rules converted to checks: piped-runner exit codes, unreviewed ownership commits, `git
  stash`, throwaway probe files, concurrent test runs, falsy-zero fields.
- Review moved from pre-push to **pre-commit** for ownership/RLS work.
- Five memory families merged, one deleted. 41 → 40.
- Two rules measured as NOT mechanisable and recorded as `enforced_by: none` with the reason.

## What is NOT settled

- **Trimming was measured to be the weakest lever.** Files fell 41→35 in the merge but imperatives
  only 129→125 — merging without summarising moves text rather than removing it. The prediction that
  the merge would kill most imperatives was **wrong**.
- The guards produced **six false refusals** on their first day. None blocked real work (all on
  read-only inspection or the wrong repo), and each is now a permanent self-test case — but three
  shared one cause: *the guard examining a wider span than the rule covers*. The class was not fixed
  when the first instance was.
- Session length and number of concurrent concerns were **not** tested as a cause. They remain the
  live alternative hypothesis.

## Closes when

**The measurement is taken, not when the fixes are admired.** The number is *errors per session in
classes that already had a rule*. On 2026-08-22 it was **six of six**. If that ratio does not fall
over the next few sessions, the diagnosis was wrong and the corpus was never the mechanism — in which
case the honest next suspects are session length and concurrent scope, and this row should say so.

Jake closes this, or three consecutive sessions of the ratio do.
