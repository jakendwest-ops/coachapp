---
id: 2026-08-22-error-rate-and-the-rule-corpus
status: open
priority: high
reported: 2026-08-22
status_detail: "Jake-reported process problem, not an app bug. 2026-09-28: the measurement lapsed 5 weeks with no trigger attached to it (proving the row's own diagnosis). First real computation taken today on the row's actual metric (errors reaching Jake/a commit, not near-misses): zero — but this is session 1 of the count starting now, not 1 of 3 already in progress. A save-skill step now prompts this every session so it doesn't lapse again."
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

## 2026-09-28 — the measurement lapsed for 5 weeks; partial data, and why it isn't session 1 of 3

Nobody took this measurement between 2026-08-22 and today. That is itself evidence for the diagnosis this
row already reached: a rule stated once ("the measurement is taken, not when the fixes are admired") with
no trigger attached to it does not fire — exactly [[feedback_written_rules_dont_reduce_errors]], now
demonstrated on this row about rules not reducing errors.

**What was actually measured today, honestly, and why it does not count as session 1 of 3:**

The 2026-08-22 count (six of six error classes already had a rule) was built from errors that **reached
Jake** — things he noticed, complained about, or that a review caught after the fact. Reviewing this
session's own work for the same thing: **zero errors reached a commit, a claim to Jake, or a shipped
conclusion.** But that is not the same population as five self-caught near-misses that happened DURING the
session's own working process and were corrected before becoming a claim — a flawed test assertion that
would have reported a false "clobber" (caught by reading the failure output before concluding anything,
same class as sql-safety's "a check that observes the wrong signal"), an instinct to copy a sibling
function's exact fallback page without checking it was still valid for a different role (caught by reading
`js/app-core.js`'s per-role page lists before shipping), and three earlier-session instances already on
record (a self-contaminating test methodology, an invented helper call, a misread self-test harness) — all
in classes [[feedback_reports_success_doing_nothing]] or standing behaviour 3 ("no claim without a check
actually run") already cover, all caught before shipping.

Counting near-misses as if they were the same metric as 2026-08-22's Jake-perceived count would be
comparing two different things and calling it a trend — the exact "one fact in two fields" shape
[[feedback_two_fields_one_fact]] warns about, just within one row instead of across two. So: **today's
honest number, on the row's own defined metric (errors reaching Jake or a shipped claim, in a class that
already had a rule), is zero — but this is the FIRST time the metric has actually been computed since
2026-08-22, not a third of a trend.** Self-assessment also has an obvious blind spot this row's original
methodology didn't have to contend with: Jake did the counting on 2026-08-22, and a session cannot see the
mistake it doesn't notice it made.

**Mechanism added, so this stops lapsing:** `.claude/skills/save/SKILL.md` Step 1 now explicitly prompts
this measurement every session, scoped to the row's actual metric (errors that reached Jake, a commit, or a
shipped claim — not self-caught near-misses), with a pointer to log a dated entry here. This is a save-skill
step, not an os-lint hard gate — the classification itself needs judgement no mechanical check can do, and
the mechanism is deliberately the trigger this row's own diagnosis says a bare rule needs. Still: Jake
closes this, or three consecutive sessions computed THIS way do.
